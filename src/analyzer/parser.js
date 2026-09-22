/**
 * src/analyzer/parser.js
 * AST Parser entrypoint and compatibility facade.
 */

'use strict';

const KotlinLexer = require('./kotlin_lexer');
const KotlinParser = require('./kotlin_parser');
const { parseJavaFile } = require('./java_parser');
const { parseGradleProject } = require('./gradle_parser');
const { parseAndroidProject, parseKotlinFile } = require('./index');
const { extractComposables } = require('./composable_extractor');
const { extractRoutes } = require('./navigation_extractor');
const { extractStateHolders } = require('./state_extractor');
const { extractAllTestTags } = require('./test_tag_extractor');

/**
 * Parses Kotlin source text into an annotated AST structure with extracted composables,
 * routes, state holders, and test tags.
 *
 * @param {string} source Kotlin source code string
 * @param {string} filePath Virtual file path
 * @returns {object} Annotated AST
 */
function parseKotlinSource(source, filePath = 'Sample.kt') {
  if (!source || typeof source !== 'string') {
    return {
      filePath,
      package: '',
      imports: [],
      declarations: [],
      composables: [],
      stateHolders: [],
      routes: [],
      testTags: [],
      diagnostics: []
    };
  }

  const lexer = new KotlinLexer(source, filePath);
  const { tokens, diagnostics: lexDiags } = lexer.tokenize();
  const parser = new KotlinParser(tokens, filePath);
  const ast = parser.parseFile();
  ast.tokens = tokens;
  if (lexDiags.length > 0) {
    ast.diagnostics.push(...lexDiags);
  }

  // Extract composables and normalize name/composableName
  const rawComposables = extractComposables(ast);
  const composables = rawComposables.map(c => ({
    ...c,
    name: c.composableName || c.name || ''
  }));

  const stateHolders = extractStateHolders([ast]);
  const routes = extractRoutes([ast]);
  const testTags = extractAllTestTags([ast]);

  return {
    ...ast,
    composables,
    stateHolders,
    routes,
    testTags
  };
}

module.exports = {
  parseKotlinSource,
  parseKotlinFile,
  parseGradleFile: parseGradleProject,
  parseGradleProject,
  parseAndroidProject,
  parseJavaFile,
  KotlinLexer,
  KotlinParser
};
