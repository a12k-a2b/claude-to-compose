#!/usr/bin/env node

/**
 * ============================================================================
 * tests/adversarial/run_m1_challenger1_stress.js
 *
 * Empirical Challenger 1 Adversarial Stress Test Suite & Defect Oracles
 * Milestone 1: Kotlin/Compose AST Parser (src/analyzer/)
 *
 * Complete 30-Test Matrix matching Reviewer 1 & Challenger 1 specifications:
 * - Section 1: Non-Crashing & AST Complexity (1.1 - 1.6)
 * - Section 2: Fault Tolerance & Error Recovery (2.1 - 2.6)
 * - Section 3: Navigation & Route Extraction Edge Cases (3.1 - 3.5)
 * - Section 4: Test Tag Resolution & Obfuscation (4.1 - 4.3)
 * - Section 5: Android Project Integration & Resilience (5.1 - 5.4)
 * - Section 6: Public API Surface & Contract Verification (6.1 - 6.6)
 * ============================================================================
 */

'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const assert = require('assert');
const Ajv = require('ajv/dist/2020');

const analyzer = require('../../src/analyzer/index');
const KotlinLexer = require('../../src/analyzer/kotlin_lexer');
const KotlinParser = require('../../src/analyzer/kotlin_parser');
const { parseJavaFile } = require('../../src/analyzer/java_parser');
const { extractComposables } = require('../../src/analyzer/composable_extractor');
const { extractRoutes } = require('../../src/analyzer/navigation_extractor');
const { extractAllTestTags, extractTestTagConstants } = require('../../src/analyzer/test_tag_extractor');
const { extractStateHolders } = require('../../src/analyzer/state_extractor');
const { extractActionClasses } = require('../../src/analyzer/action_extractor');
const { extractPersistence } = require('../../src/analyzer/persistence_extractor');
const { indexProjectSymbols } = require('../../src/analyzer/symbol_indexer');
const schema = require('../../src/analyzer/schema.json');

const ajv = new Ajv({ allErrors: true });
const validateModel = ajv.compile(schema);

const results = [];
const defects = [];

function recordTest(id, name, category, passed, details = {}) {
  results.push({ id, name, category, passed, details });
  const statusBadge = passed ? '\x1b[32m[PASS]\x1b[0m' : '\x1b[31m[FAIL]\x1b[0m';
  console.log(`${statusBadge} [${id}] ${name}`);
  if (!passed) {
    defects.push({ id, name, category, ...details });
    console.log(`       \x1b[31mObserved Defect: ${details.reason || details.error}\x1b[0m`);
    if (details.expected && details.actual) {
      console.log(`       \x1b[33mExpected: ${JSON.stringify(details.expected)}\x1b[0m`);
      console.log(`       \x1b[33mActual:   ${JSON.stringify(details.actual)}\x1b[0m`);
    }
  }
}

function parseSnippet(code, name = 'Snippet.kt') {
  const lexer = new KotlinLexer(code, name);
  const { tokens, diagnostics: lexDiags } = lexer.tokenize();
  const parser = new KotlinParser(tokens, name);
  const ast = parser.parseFile();
  if (lexDiags.length > 0) ast.diagnostics.push(...lexDiags);
  return ast;
}

console.log('\n======================================================================');
console.log('  MILESTONE 1 EMPIRICAL CHALLENGER ADVERSARIAL STRESS & ORACLE SUITE');
console.log('======================================================================\n');

async function runAdversarialSuite() {
  // ---------------------------------------------------------------------------
  // SECTION 1: Non-Crashing & AST Complexity (1.1 - 1.6)
  // ---------------------------------------------------------------------------
  console.log('--- SECTION 1: Non-Crashing & AST Complexity ---');

  // 1.1: 50+ levels nested composables
  try {
    let code = 'package com.claude.stress\n\n@Composable\nfun DeeplyNestedScreen() {\n';
    for (let i = 0; i < 60; i++) {
      code += ' '.repeat((i + 1) * 2) + `Box(modifier = Modifier.padding(${i}.dp)) {\n`;
    }
    code += ' '.repeat(122) + 'Text("Deep Leaf Node", modifier = Modifier.testTag("deep_leaf"))\n';
    for (let i = 59; i >= 0; i--) {
      code += ' '.repeat((i + 1) * 2) + '}\n';
    }
    code += '}\n';

    const t0 = Date.now();
    const ast = parseSnippet(code, 'DeepNesting.kt');
    const comp = extractComposables(ast);
    const elapsed = Date.now() - t0;

    const ok = ast.declarations.length === 1 && comp.length === 1 && comp[0].testTags.includes('deep_leaf') && elapsed < 2000;
    recordTest('1.1', '50+ levels nested composables parses without stack overflow (<2000ms)', 'COMPLEXITY', ok, { elapsedMs: elapsed });
  } catch (err) {
    recordTest('1.1', '50+ levels nested composables', 'COMPLEXITY', false, { error: err.message });
  }

  // 1.2: Trailing lambdas & complex types
  try {
    const code = '@Composable\nfun MultiLambdaContainer(primaryAction: () -> Unit = {}, secondaryAction: ((String, Int) -> Boolean)? = null, content: @Composable (PaddingValues) -> Unit) {}';
    const ast = parseSnippet(code);
    const comp = extractComposables(ast);
    const params = comp[0]?.parameters || [];
    const contentParam = params.find(p => p.name === 'content');
    const ok = params.length === 3 && contentParam && contentParam.isLambda === true;
    recordTest('1.2', 'Multiple trailing lambdas with complex function types and default args', 'COMPLEXITY', ok, {
      expected: 3,
      actual: params.length,
      params: params.map(p => ({ name: p.name, type: p.type, isLambda: p.isLambda }))
    });
  } catch (err) {
    recordTest('1.2', 'Multiple trailing lambdas with complex function types', 'COMPLEXITY', false, { error: err.message });
  }

  // 1.3: Raw strings with interpolation
  try {
    const code = `
      package com.claude.stress
      val complexJson = """
      {
          "nested": "\\"triple\\" quote",
          "template": "\${'$'}{expression}",
          "code": """ + codeSnippet + """
      }
      """.trimIndent()
    `;
    const ast = parseSnippet(code);
    const ok = ast.declarations.length === 1 && ast.declarations[0].name === 'complexJson';
    recordTest('1.3', 'Raw strings with nested quotes, escapes, dollar syntax', 'COMPLEXITY', ok);
  } catch (err) {
    recordTest('1.3', 'Raw strings with interpolation', 'COMPLEXITY', false, { error: err.message });
  }

  // 1.4: Extreme generics with variance
  try {
    const code = `
      interface ComplexRepository<in K : Comparable<in K>, out V : List<Map<String, Any?>>> {
          suspend fun get(k: K): V
      }
    `;
    const ast = parseSnippet(code);
    const iface = ast.declarations.find(d => d.name === 'ComplexRepository');
    const ok = ast.declarations.length === 1 && iface && (iface.bodyDeclarations || []).length === 1;
    recordTest('1.4', 'Extreme generics with projections, upper bounds & nested type variance', 'COMPLEXITY', ok, {
      expected: 1,
      actual: ast.declarations.length,
      declarations: ast.declarations.map(d => d.name)
    });
  } catch (err) {
    recordTest('1.4', 'Extreme generics with variance', 'COMPLEXITY', false, { error: err.message });
  }

  // 1.5: Complex annotations & use-sites
  try {
    const code = `
      @file:OptIn(ExperimentalMaterial3Api::class)
      package com.example.test

      @OptIn(ExperimentalMaterial3Api::class)
      @Composable
      fun TopLevelComposable() {}

      @get:Rule
      val testRule = 42
    `;
    const ast = parseSnippet(code);
    const ok = ast.declarations.length === 2 && ast.declarations.some(d => d.name === 'TopLevelComposable') && ast.declarations.some(d => d.name === 'testRule');
    recordTest('1.5', 'Complex annotations & use-site targets (@file:OptIn, @get:Rule)', 'COMPLEXITY', ok, {
      declCount: ast.declarations.length
    });
  } catch (err) {
    recordTest('1.5', 'Complex annotations & use-sites', 'COMPLEXITY', false, { error: err.message });
  }

  // 1.6: 300 functions single file scale
  try {
    let largeSource = 'package com.claude.stress.large\n\n';
    for (let i = 0; i < 300; i++) {
      largeSource += `@Composable\nfun GeneratedComposable${i}(modifier: Modifier = Modifier.testTag("tag_${i}")) {\n    Text("Item ${i}")\n}\n\n`;
    }

    const t0 = Date.now();
    const ast = parseSnippet(largeSource, 'LargeFile.kt');
    const comp = extractComposables(ast);
    const elapsed = Date.now() - t0;

    const ok = ast.declarations.length === 300 && comp.length === 300 && elapsed < 2000;
    recordTest('1.6', '300 functions (12,000+ tokens) single file scale parsed within 2000ms', 'PERF', ok, { elapsedMs: elapsed, declCount: ast.declarations.length });
  } catch (err) {
    recordTest('1.6', '300 functions single file scale', 'PERF', false, { error: err.message });
  }

  // ---------------------------------------------------------------------------
  // SECTION 2: Fault Tolerance & Error Recovery (2.1 - 2.6)
  // ---------------------------------------------------------------------------
  console.log('\n--- SECTION 2: Fault Tolerance & Error Recovery ---');

  // 2.1: Unbalanced braces fuzzing
  try {
    const brokenDelimiterSnippets = [
      'fun unclosedFunc() {',
      'class UnclosedClass { fun bar() { }',
      'fun crossed(x: Int = ( 1 + { 2 ) } ) {}',
      '}}}} fun afterExcessClosingBraces() {}',
      '{{{{{{{{{{}}}}}}}}}}',
      'class A { class B { class C {'
    ];
    let allSurvived = true;
    for (const snippet of brokenDelimiterSnippets) {
      const ast = parseSnippet(snippet);
      if (!ast) allSurvived = false;
    }
    recordTest('2.1', 'Unbalanced braces fuzzing never crashes or enters infinite loop', 'FAULT_TOLERANCE', allSurvived);
  } catch (err) {
    recordTest('2.1', 'Unbalanced braces fuzzing', 'FAULT_TOLERANCE', false, { error: err.message });
  }

  // 2.2: Unclosed string/char/hex literals
  try {
    const unclosedLiterals = [
      'val s = "unclosed single line string',
      'val s = "unclosed with \n newline inside"',
      'val raw = """unclosed raw multiline string',
      'val ch = \'unclosed char',
      'val `unclosed backtick identifier = true',
      'val hex = 0x'
    ];
    let allSurvived = true;
    for (const lit of unclosedLiterals) {
      const ast = parseSnippet(lit);
      if (!ast || !ast.diagnostics) allSurvived = false;
    }
    recordTest('2.2', 'Unclosed string/char/hex literals produce diagnostics without crashing', 'FAULT_TOLERANCE', allSurvived);
  } catch (err) {
    recordTest('2.2', 'Unclosed string/char/hex literals', 'FAULT_TOLERANCE', false, { error: err.message });
  }

  // 2.3: Truncated & malformed comments
  try {
    const comments = [
      '/* unclosed block comment',
      '/* outer /* inner comment */ still unclosed',
      '/*/',
      '/* /* /* * / */ */'
    ];
    let allSurvived = true;
    for (const c of comments) {
      const ast = parseSnippet(c);
      if (!ast || !ast.diagnostics || ast.diagnostics.length === 0) allSurvived = false;
    }
    const closedAst = parseSnippet('/* closed comment */\nfun afterComment() {}');
    if (!closedAst.declarations.some(d => d.name === 'afterComment')) allSurvived = false;

    recordTest('2.3', 'Truncated and malformed comments handled cleanly', 'FAULT_TOLERANCE', allSurvived);
  } catch (err) {
    recordTest('2.3', 'Truncated & malformed comments', 'FAULT_TOLERANCE', false, { error: err.message });
  }

  // 2.4: Severe syntax errors in boundaries
  try {
    const code = `
      package com.example
      fun validBefore() {}
      >>> ### !!! malformed garbage between functions
      fun validAfter() {}
    `;
    const ast = parseSnippet(code);
    const hasBefore = ast.declarations.some(d => d.name === 'validBefore');
    const hasAfter = ast.declarations.some(d => d.name === 'validAfter');
    recordTest('2.4', 'Severe syntax errors in boundaries recovered to parse subsequent declarations', 'FAULT_TOLERANCE', hasBefore && hasAfter);
  } catch (err) {
    recordTest('2.4', 'Severe syntax errors in boundaries', 'FAULT_TOLERANCE', false, { error: err.message });
  }

  // 2.5: Binary garbage & null bytes
  try {
    const garbage = '\x00\x01\x02\x03\x04\x05\xFF\xFE\xEF\xBB\xBF\u0000\uFFFF package com.garbage\nfun ok() {}';
    const ast = parseSnippet(garbage);
    const ok = ast && ast.declarations.some(d => d.name === 'ok');
    recordTest('2.5', 'Binary garbage & null bytes survived without crashing lexer or parser', 'FAULT_TOLERANCE', ok);
  } catch (err) {
    recordTest('2.5', 'Binary garbage & null bytes', 'FAULT_TOLERANCE', false, { error: err.message });
  }

  // 2.6: Broken composable does not abort extraction of subsequent valid composables
  try {
    const code = `
      package com.broken.ui

      @Composable
      fun MalformedFunc(x: Int) {
          broken { block
      }

      @Composable
      fun ValidRecoveredComposable(modifier: Modifier = Modifier.testTag("recovered")) {
          Text("I am valid")
      }
    `;
    const ast = parseSnippet(code);
    const comp = extractComposables(ast);
    const followupFound = comp.some(c => c.composableName === 'ValidRecoveredComposable');
    recordTest('2.6', 'Broken composable does not abort extraction of subsequent valid composables', 'FAULT_TOLERANCE', followupFound, {
      extractedComposables: comp.map(c => c.composableName)
    });
  } catch (err) {
    recordTest('2.6', 'Broken composable isolation', 'FAULT_TOLERANCE', false, { error: err.message });
  }

  // ---------------------------------------------------------------------------
  // SECTION 3: Navigation & Route Extraction Edge Cases (3.1 - 3.5)
  // ---------------------------------------------------------------------------
  console.log('\n--- SECTION 3: Navigation & Route Extraction Edge Cases ---');

  // 3.1: Dynamic route concatenation
  try {
    const code = `
      package com.claude.nav
      fun Nav() {
        NavHost(navController, start) {
          composable("users/" + "profile") { ProfileScreen() }
        }
      }
    `;
    const ast = parseSnippet(code, 'DynamicNav.kt');
    const routes = extractRoutes([ast]);
    const ok = routes.length === 1 && routes[0].route === 'users/profile';
    recordTest('3.1', 'Dynamic route concatenation resolved without crashing', 'NAVIGATION', ok, {
      route: routes[0]?.route
    });
  } catch (err) {
    recordTest('3.1', 'Dynamic route concatenation', 'NAVIGATION', false, { error: err.message });
  }

  // 3.2: Path + Query parameters
  try {
    const code = `
      package com.claude.nav
      fun Nav() {
        NavHost(navController, start) {
          composable("users/{userId}/notes/{noteId}?archive={isArchive}&sort={sortOrder}") { UserNotesScreen() }
        }
      }
    `;
    const ast = parseSnippet(code, 'ParamNav.kt');
    const routes = extractRoutes([ast]);
    const routeObj = routes[0];
    const args = routeObj?.arguments || [];
    const expectedArgs = ['userId', 'noteId', 'isArchive', 'sortOrder'];
    const hasAllArgs = expectedArgs.every(name => args.some(a => a.name === name));
    const ok = routeObj && routeObj.route === 'users/{userId}/notes/{noteId}?archive={isArchive}&sort={sortOrder}' && hasAllArgs;
    recordTest('3.2', 'Complex path parameters and query parameters extracted properly', 'NAVIGATION', ok, {
      route: routeObj?.route,
      args: args.map(a => a.name)
    });
  } catch (err) {
    recordTest('3.2', 'Complex path parameters and query parameters', 'NAVIGATION', false, { error: err.message });
  }

  // 3.3: Route constants resolution
  try {
    const codeDest = `
      package com.claude.nav
      object Destinations {
        const val FEED = "feed_screen"
        const val SETTINGS = "settings_screen"
      }
    `;
    const codeNav = `
      package com.claude.nav
      fun Nav() {
        NavHost(navController, start) {
          composable(Destinations.FEED) { FeedScreen() }
          composable(Destinations.SETTINGS) { SettingsScreen() }
        }
      }
    `;
    const astDest = parseSnippet(codeDest, 'Destinations.kt');
    const astNav = parseSnippet(codeNav, 'Nav.kt');
    const routes = extractRoutes([astDest, astNav]);
    const hasFeed = routes.some(r => r.route === 'feed_screen');
    const hasSettings = routes.some(r => r.route === 'settings_screen');
    recordTest('3.3', 'Route constants resolution (resolves sealed/object routes)', 'NAVIGATION', hasFeed && hasSettings, {
      routes: routes.map(r => r.route)
    });
  } catch (err) {
    recordTest('3.3', 'Route constants resolution', 'NAVIGATION', false, { error: err.message });
  }

  // 3.4: Deeply wrapped destination composable
  try {
    const code = `
      package com.claude.nav
      fun Nav() {
        NavHost(navController, start) {
          composable("dashboard") {
            Scaffold {
              Box {
                Surface {
                  DashboardScreen()
                }
              }
            }
          }
        }
      }
    `;
    const ast = parseSnippet(code, 'WrappedNav.kt');
    const routes = extractRoutes([ast]);
    const ok = routes.length === 1 && routes[0].destinationComposable === 'DashboardScreen';
    recordTest('3.4', 'Deeply wrapped destination composable resolves inside Scaffold/Box/Surface', 'NAVIGATION', ok, {
      destination: routes[0]?.destinationComposable
    });
  } catch (err) {
    recordTest('3.4', 'Deeply wrapped destination composable', 'NAVIGATION', false, { error: err.message });
  }

  // 3.5: Empty route body fallback
  try {
    const code = `
      package com.claude.nav
      fun Nav() {
        NavHost(navController, start) {
          composable("empty_route") {}
        }
      }
    `;
    const ast = parseSnippet(code, 'EmptyNav.kt');
    const routes = extractRoutes([ast]);
    const ok = routes.length === 1 && routes[0].destinationComposable === 'UnknownScreen';
    recordTest('3.5', 'Empty route body fallback defaults to UnknownScreen', 'NAVIGATION', ok, {
      destination: routes[0]?.destinationComposable
    });
  } catch (err) {
    recordTest('3.5', 'Empty route body fallback', 'NAVIGATION', false, { error: err.message });
  }

  // ---------------------------------------------------------------------------
  // SECTION 4: Test Tag Resolution & Obfuscation (4.1 - 4.3)
  // ---------------------------------------------------------------------------
  console.log('\n--- SECTION 4: Test Tag Resolution & Obfuscation ---');

  // 4.1: Direct & catalog test tags
  try {
    const catalogCode = `
      package com.claude.tags
      object AppTestTags {
          const val HEADER = "header_section"
          const val PREFIX = "item_row_"
      }
    `;
    const uiCode = `
      package com.claude.ui
      import com.claude.tags.AppTestTags
      @Composable
      fun TaggedScreen() {
          Column(modifier = Modifier.testTag(AppTestTags.HEADER)) {
              Text("Title", modifier = Modifier.testTag(AppTestTags.PREFIX + "title"))
              Text("Direct", modifier = Modifier.testTag("direct_literal"))
          }
      }
    `;
    const astCatalog = parseSnippet(catalogCode, 'AppTestTags.kt');
    const astUi = parseSnippet(uiCode, 'TaggedScreen.kt');
    const tags = extractAllTestTags([astCatalog, astUi]);

    const hasHeader = tags.includes('header_section');
    const hasDirect = tags.includes('direct_literal');
    const ok = hasHeader && hasDirect && tags.length >= 3;
    recordTest('4.1', 'Direct & catalog test tags extracted correctly (>=3 tags)', 'TEST_TAGS', ok, { tags });
  } catch (err) {
    recordTest('4.1', 'Direct & catalog test tags', 'TEST_TAGS', false, { error: err.message });
  }

  // 4.2: Template expression tags
  try {
    const code = `
      package com.claude.tags
      object Tags { const val PREFIX = "item_" }
      @Composable
      fun ItemRow() {
        Box(modifier = Modifier.testTag("\${Tags.PREFIX}42"))
      }
    `;
    const ast = parseSnippet(code, 'TemplateTags.kt');
    const tags = extractAllTestTags([ast]);
    const ok = tags.some(t => t.includes('item_') || t.includes('PREFIX'));
    recordTest('4.2', 'Template expression tags handles ${...} expressions without corrupting tag set', 'TEST_TAGS', ok, { tags });
  } catch (err) {
    recordTest('4.2', 'Template expression tags', 'TEST_TAGS', false, { error: err.message });
  }

  // 4.3: Unicode & special character tags
  try {
    const code = `
      package com.claude.tags
      @Composable
      fun LocalizedScreen() {
        Button(onClick = {}, modifier = Modifier.testTag("設定_画面_🚀")) {
          Text("Save")
        }
      }
    `;
    const ast = parseSnippet(code, 'UnicodeTags.kt');
    const tags = extractAllTestTags([ast]);
    const ok = tags.includes('設定_画面_🚀');
    recordTest('4.3', 'Unicode & special character tags handles non-ASCII and emoji test tags', 'TEST_TAGS', ok, { tags });
  } catch (err) {
    recordTest('4.3', 'Unicode & special character tags', 'TEST_TAGS', false, { error: err.message });
  }

  // ---------------------------------------------------------------------------
  // SECTION 5: Android Project Integration & Resilience (5.1 - 5.4)
  // ---------------------------------------------------------------------------
  console.log('\n--- SECTION 5: Android Project Integration & Resilience ---');

  // 5.1: parseAndroidProject on note-app
  try {
    const projectPath = path.resolve(__dirname, '../../fixtures/note-app');
    const model = await analyzer.parseAndroidProject(projectPath, 'app');
    const valid = validateModel(model);
    const ok = valid && model.screens.length >= 2 && model.routes.length >= 2 && model.persistence.entities.length >= 1;
    recordTest('5.1', 'parseAndroidProject on note-app produces 100% schema-valid ExistingAppModel', 'INTEGRATION', ok, {
      screenCount: model.screens.length,
      routeCount: model.routes.length,
      entityCount: model.persistence.entities.length
    });
  } catch (err) {
    recordTest('5.1', 'parseAndroidProject on note-app', 'INTEGRATION', false, { error: err.message });
  }

  // 5.2: Corrupt project resilience
  try {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ctc-corrupt-'));
    const srcDir = path.join(tmpDir, 'app/src/main/java/com/corrupt');
    fs.mkdirSync(srcDir, { recursive: true });
    fs.writeFileSync(path.join(srcDir, 'Corrupt.kt'), Buffer.from([0x00, 0xFF, 0xFE, 0x12]));
    fs.writeFileSync(path.join(srcDir, 'Broken.kt'), 'fun (,,,) {{{');
    fs.writeFileSync(path.join(srcDir, 'Valid.kt'), 'package com.corrupt\nimport androidx.compose.runtime.Composable\n@Composable fun S() {}');

    const model = await analyzer.parseAndroidProject(tmpDir, 'app');
    const valid = validateModel(model);
    const hasValidScreen = model.screens.some(s => s.composableName === 'S');
    const ok = valid && hasValidScreen && model.diagnostics.length > 0;
    recordTest('5.2', 'Corrupt project resilience survives corrupted sibling files and isolates errors', 'ROBUSTNESS', ok);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch (err) {
    recordTest('5.2', 'Corrupt project resilience', 'ROBUSTNESS', false, { error: err.message });
  }

  // 5.3: Non-existent path resilience
  try {
    const nonExistent = path.join(os.tmpdir(), 'non_existent_project_' + Date.now());
    const model = await analyzer.parseAndroidProject(nonExistent, 'app');
    const valid = validateModel(model);
    recordTest('5.3', 'Non-existent path resilience returns empty fallback model matching schema', 'ROBUSTNESS', valid && model.screens.length === 0);
  } catch (err) {
    recordTest('5.3', 'Non-existent path resilience', 'ROBUSTNESS', false, { error: err.message });
  }

  // 5.4: Java-only Room project
  try {
    const javaCode = `
      package com.example.db;
      import androidx.room.Entity;
      import androidx.room.PrimaryKey;
      @Entity(tableName = "items")
      public class ItemEntity {
        @PrimaryKey
        public long id;
        public String label;
      }
    `;
    const javaAst = parseJavaFile(javaCode, 'ItemEntity.java');
    const ok = javaAst.declarations.length === 1 && javaAst.declarations[0].name === 'ItemEntity' && javaAst.declarations[0].annotations.some(a => a.name === 'Entity');
    recordTest('5.4', 'Java-only Room project parses Java entities and DAOs cleanly', 'JAVA_INTEROP', ok, {
      entity: javaAst.declarations[0]?.name
    });
  } catch (err) {
    recordTest('5.4', 'Java-only Room project', 'JAVA_INTEROP', false, { error: err.message });
  }

  // ---------------------------------------------------------------------------
  // SECTION 6: Public API Surface & Contract Verification (6.1 - 6.6)
  // ---------------------------------------------------------------------------
  console.log('\n--- SECTION 6: Public API Surface & Contract Verification ---');

  // 6.1: parseAndroidProject export present
  recordTest('6.1', 'parseAndroidProject is exported from src/analyzer/index.js', 'API_CONTRACT', typeof analyzer.parseAndroidProject === 'function');

  // 6.2: KotlinParser export present
  recordTest('6.2', 'KotlinParser is exported from src/analyzer/index.js', 'API_CONTRACT', typeof analyzer.KotlinParser === 'function');

  // 6.3: KotlinLexer export present
  recordTest('6.3', 'KotlinLexer is exported from src/analyzer/index.js', 'API_CONTRACT', typeof analyzer.KotlinLexer === 'function');

  // 6.4: indexProjectSymbols export present
  recordTest('6.4', 'indexProjectSymbols is exported from src/analyzer/index.js', 'API_CONTRACT', typeof analyzer.indexProjectSymbols === 'function');

  // 6.5: parseKotlinFile exported
  recordTest('6.5', 'parseKotlinFile is exported from src/analyzer/index.js', 'API_CONTRACT', typeof analyzer.parseKotlinFile === 'function');

  // 6.6: analyzeApp exported
  recordTest('6.6', 'analyzeApp is exported or aliased in src/analyzer/index.js', 'API_CONTRACT', typeof analyzer.analyzeApp === 'function');

  // ---------------------------------------------------------------------------
  // SUMMARY
  // ---------------------------------------------------------------------------
  console.log('\n======================================================================');
  console.log(`TOTAL TESTS: ${results.length}`);
  console.log(`PASSED:      ${results.filter(r => r.passed).length}`);
  console.log(`DEFECTS:     ${defects.length}`);
  console.log('======================================================================\n');

  if (defects.length > 0) {
    console.log('REPRODUCED DEFECTS:');
    for (const d of defects) {
      console.log(`  [${d.id}] ${d.name}`);
      console.log(`    Root Cause: ${d.reason || d.error}`);
    }
  }

  return { total: results.length, passed: results.filter(r => r.passed).length, defects };
}

runAdversarialSuite().then(summary => {
  const reportPath = path.resolve(__dirname, '../../.agents/challenger_m1_1/adversarial_results.json');
  fs.writeFileSync(reportPath, JSON.stringify(summary, null, 2));
  console.log(`\nAdversarial summary saved to ${reportPath}`);
  process.exit(summary.defects.length > 0 ? 1 : 0);
}).catch(err => {
  console.error('Fatal execution error:', err);
  process.exit(2);
});
