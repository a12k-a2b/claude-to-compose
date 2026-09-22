/**
 * src/analyzer/index.js
 * Main entrypoint for Android Project Analyzer and Syntax-Aware Kotlin/Compose AST Parser.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const KotlinLexer = require('./kotlin_lexer');
const KotlinParser = require('./kotlin_parser');
const { parseJavaFile } = require('./java_parser');
const { parseGradleProject } = require('./gradle_parser');
const { indexProjectSymbols } = require('./symbol_indexer');
const astSymbols = require('./ast_symbols');

/**
 * Parses an entire Android project module, extracting screens, routes, ViewModels,
 * actions, Room persistence, test tags, and Gradle configuration.
 *
 * @param {string} projectPath Path to the Android project root
 * @param {string} targetModuleName Target module name (default: 'app')
 * @returns {Promise<object>} The ExistingAppModel representation
 */
async function parseAndroidProject(projectPath, targetModuleName = 'app') {
  const resolvedRoot = path.resolve(projectPath);

  // 1. Inspect Gradle build configuration
  const gradleMeta = parseGradleProject(resolvedRoot, targetModuleName);

  // 2. Discover source files (.kt and .java)
  const sourceFiles = discoverSourceFiles(resolvedRoot, targetModuleName);

  // 3. Parse AST for each source file
  const astFiles = [];
  for (const file of sourceFiles) {
    try {
      const content = fs.readFileSync(file, 'utf8');
      const relPath = path.relative(resolvedRoot, file);

      if (file.endsWith('.kt') || file.endsWith('.kts')) {
        const lexer = new KotlinLexer(content, relPath);
        const { tokens, diagnostics: lexerDiags } = lexer.tokenize();
        const parser = new KotlinParser(tokens, relPath);
        const ast = parser.parseFile();
        if (lexerDiags.length > 0) {
          ast.diagnostics.push(...lexerDiags);
        }
        astFiles.push(ast);
      } else if (file.endsWith('.java')) {
        const ast = parseJavaFile(content, relPath);
        astFiles.push(ast);
      }
    } catch (err) {
      astFiles.push({
        filePath: path.relative(resolvedRoot, file),
        package: '',
        imports: [],
        declarations: [],
        diagnostics: [
          {
            severity: 'ERROR',
            message: `Failed to parse file: ${err.message}`,
            filePath: path.relative(resolvedRoot, file)
          }
        ]
      });
    }
  }

  // 4. Correlate symbols and build ExistingAppModel
  const existingAppModel = indexProjectSymbols(astFiles, gradleMeta);

  return existingAppModel;
}

function discoverSourceFiles(projectRoot, moduleName) {
  const files = [];
  const moduleDir = path.join(projectRoot, moduleName);

  const candidateDirs = [
    path.join(moduleDir, 'src/main/java'),
    path.join(moduleDir, 'src/main/kotlin'),
    path.join(projectRoot, 'src/main/java'),
    path.join(projectRoot, 'src/main/kotlin')
  ];

  for (const dir of candidateDirs) {
    if (fs.existsSync(dir)) {
      walkDir(dir, files);
    }
  }

  return files;
}

function walkDir(dir, fileList) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkDir(fullPath, fileList);
    } else if (entry.isFile() && (entry.name.endsWith('.kt') || entry.name.endsWith('.java'))) {
      fileList.push(fullPath);
    }
  }
}

const { extractComposables } = require('./composable_extractor');

/**
 * Parses a single Kotlin file into an AST.
 *
 * @param {string} content Source code string
 * @param {string} filePath Path or virtual file name
 * @returns {object} Parsed AST node
 */
function parseKotlinFile(content, filePath = '<anonymous>') {
  const lexer = new KotlinLexer(content, filePath);
  const { tokens, diagnostics: lexDiags } = lexer.tokenize();
  const parser = new KotlinParser(tokens, filePath);
  const ast = parser.parseFile();
  if (lexDiags.length > 0) {
    ast.diagnostics.push(...lexDiags);
  }
  return ast;
}

const parseGradleFile = parseGradleProject;
const analyzeApp = parseAndroidProject;
const indexSymbols = indexProjectSymbols;

module.exports = {
  analyzeApp,
  parseAndroidProject,
  parseKotlinFile,
  parseGradleFile,
  parseGradleProject,
  extractComposables,
  indexSymbols,
  indexProjectSymbols,
  KotlinLexer,
  KotlinParser,
  parseJavaFile,
  astSymbols
};
