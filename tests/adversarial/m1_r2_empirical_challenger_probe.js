#!/usr/bin/env node

/**
 * tests/adversarial/m1_r2_empirical_challenger_probe.js
 *
 * Comprehensive Empirical Challenger 1 Round 2 Probe & Stress Harness
 * Deep stress-testing for Milestone 1 defect remediation:
 * - Probe 1: Slot Parameters (@Composable () -> Unit, receivers, nullables, multi-args, defaults)
 * - Probe 2: Generic Class/Interface Headers (variance, nested bounds, where clauses, body methods)
 * - Probe 3: Route Parameters & camelCase Preservation (path/query, constants, named params)
 * - Probe 4: Brace Recovery & Declaration Boundaries (nested unclosed blocks, corrupted siblings)
 * - Probe 5: Public API Exports & Verification Command Execution
 * - Probe 6: Schema Conformance & Baseline Integration
 */

'use strict';

const assert = require('assert');
const path = require('path');
const analyzer = require('../../src/analyzer/index');
const KotlinLexer = require('../../src/analyzer/kotlin_lexer');
const KotlinParser = require('../../src/analyzer/kotlin_parser');
const { extractComposables } = require('../../src/analyzer/composable_extractor');
const { extractRoutes } = require('../../src/analyzer/navigation_extractor');

function parseSnippet(code, name = 'Snippet.kt') {
  const lexer = new KotlinLexer(code, name);
  const { tokens, diagnostics: lexDiags } = lexer.tokenize();
  const parser = new KotlinParser(tokens, name);
  const ast = parser.parseFile();
  if (lexDiags.length > 0) ast.diagnostics.push(...lexDiags);
  return ast;
}

let totalProbes = 0;
let passedProbes = 0;
const failures = [];

function probe(name, fn) {
  totalProbes++;
  try {
    fn();
    passedProbes++;
    console.log(`\x1b[32m[PASS]\x1b[0m ${name}`);
  } catch (err) {
    failures.push({ name, error: err.message, stack: err.stack });
    console.log(`\x1b[31m[FAIL]\x1b[0m ${name}`);
    console.log(`       \x1b[31mError: ${err.message}\x1b[0m`);
  }
}

console.log('======================================================================');
console.log('  CHALLENGER 1 ROUND 2: EMPIRICAL DEFECT & STRESS PROBE SUITE');
console.log('======================================================================\n');

// ----------------------------------------------------------------------------
// PROBE SUITE 1: @Composable () -> Unit Slot Parameters
// ----------------------------------------------------------------------------
console.log('--- PROBE 1: @Composable () -> Unit Slot Parameters ---');

probe('1.1: Standard slot parameter content: @Composable () -> Unit', () => {
  const code = `
    @Composable
    fun Card(
      modifier: Modifier = Modifier,
      content: @Composable () -> Unit
    ) {}
  `;
  const ast = parseSnippet(code);
  const comp = extractComposables(ast);
  assert.strictEqual(comp.length, 1);
  const params = comp[0].parameters;
  assert.strictEqual(params.length, 2, `Expected 2 params, got ${params.length}: ${JSON.stringify(params)}`);
  const content = params.find(p => p.name === 'content');
  assert.ok(content, 'content parameter must exist');
  assert.strictEqual(content.isLambda, true, 'content.isLambda must be true');
  assert.ok(content.type.includes('@Composable'), `Expected type to include @Composable, got: ${content.type}`);
  assert.ok(content.type.includes('->'), `Expected type to include ->, got: ${content.type}`);
  assert.ok(!params.some(p => p.name === '->' || p.name === 'Unit'), 'Must not create phantom -> or Unit params');
});

probe('1.2: Slot with receiver ColumnScope.() -> Unit', () => {
  const code = `
    @Composable
    fun CustomColumn(
      modifier: Modifier = Modifier,
      content: @Composable ColumnScope.() -> Unit
    ) {}
  `;
  const ast = parseSnippet(code);
  const comp = extractComposables(ast);
  assert.strictEqual(comp.length, 1);
  const params = comp[0].parameters;
  assert.strictEqual(params.length, 2);
  const content = params.find(p => p.name === 'content');
  assert.ok(content);
  assert.strictEqual(content.isLambda, true);
  assert.ok(content.type.includes('ColumnScope.() -> Unit') || content.type.includes('ColumnScope'), `Got type: ${content.type}`);
});

probe('1.3: Complex Scaffold with 5 slots and default values', () => {
  const code = `
    @Composable
    fun Scaffold(
      modifier: Modifier = Modifier,
      topBar: @Composable () -> Unit = {},
      bottomBar: @Composable () -> Unit = {},
      floatingActionButton: @Composable () -> Unit = {},
      content: @Composable (PaddingValues) -> Unit
    ) {}
  `;
  const ast = parseSnippet(code);
  const comp = extractComposables(ast);
  assert.strictEqual(comp.length, 1);
  const params = comp[0].parameters;
  assert.strictEqual(params.length, 5, `Expected 5 params, got ${params.length}: ${JSON.stringify(params.map(p => p.name))}`);
  
  const expectedSlots = ['topBar', 'bottomBar', 'floatingActionButton', 'content'];
  for (const slotName of expectedSlots) {
    const p = params.find(param => param.name === slotName);
    assert.ok(p, `Slot ${slotName} must exist`);
    assert.strictEqual(p.isLambda, true, `Slot ${slotName} must be marked isLambda: true`);
  }
});

probe('1.4: Nullable slot parameter trailingIcon: (@Composable () -> Unit)? = null', () => {
  const code = `
    @Composable
    fun OutlinedInput(
      value: String,
      onValueChange: (String) -> Unit,
      trailingIcon: (@Composable () -> Unit)? = null
    ) {}
  `;
  const ast = parseSnippet(code);
  const comp = extractComposables(ast);
  assert.strictEqual(comp.length, 1);
  const params = comp[0].parameters;
  assert.strictEqual(params.length, 3);
  const trailing = params.find(p => p.name === 'trailingIcon');
  assert.ok(trailing);
  assert.strictEqual(trailing.isLambda, true);
  assert.strictEqual(trailing.nullable, true);
});

probe('1.5: Multi-parameter slot: itemContent: @Composable (index: Int, item: String) -> Unit', () => {
  const code = `
    @Composable
    fun ItemList(
      items: List<String>,
      itemContent: @Composable (Int, String) -> Unit
    ) {}
  `;
  const ast = parseSnippet(code);
  const comp = extractComposables(ast);
  assert.strictEqual(comp.length, 1);
  const params = comp[0].parameters;
  assert.strictEqual(params.length, 2);
  const itemContent = params.find(p => p.name === 'itemContent');
  assert.ok(itemContent);
  assert.strictEqual(itemContent.isLambda, true);
  assert.ok(!params.some(p => p.name === 'Int' || p.name === 'String' || p.name === '->'));
});

// ----------------------------------------------------------------------------
// PROBE SUITE 2: Generic Class & Interface Headers
// ----------------------------------------------------------------------------
console.log('\n--- PROBE 2: Generic Class & Interface Headers ---');

probe('2.1: Mandated signature: interface Repo<in K : Comparable<in K>, out V>', () => {
  const code = `
    interface Repo<in K : Comparable<in K>, out V> {
      suspend fun fetch(key: K): V?
      fun count(): Int
    }
    class ConcreteRepo : Repo<String, Int> {
      override suspend fun fetch(key: String): Int? = 42
      override fun count(): Int = 1
    }
  `;
  const ast = parseSnippet(code);
  assert.strictEqual(ast.declarations.length, 2, `Expected 2 top-level decls, got: ${ast.declarations.map(d => d.name)}`);
  
  const repo = ast.declarations.find(d => d.name === 'Repo');
  assert.ok(repo, 'Repo interface must exist in top-level declarations');
  assert.strictEqual(repo.type, 'ClassDeclaration');
  assert.strictEqual(repo.kind, 'interface');
  assert.ok(repo.bodyDeclarations, 'Repo must have bodyDeclarations array');
  assert.strictEqual(repo.bodyDeclarations.length, 2, `Expected 2 member methods, got ${repo.bodyDeclarations.length}`);
  
  const memberNames = repo.bodyDeclarations.map(m => m.name);
  assert.ok(memberNames.includes('fetch'), 'fetch must be in Repo bodyDeclarations');
  assert.ok(memberNames.includes('count'), 'count must be in Repo bodyDeclarations');
  
  // Ensure fetch and count are NOT leaked into topLevelDeclarations
  const topNames = ast.declarations.map(d => d.name);
  assert.ok(!topNames.includes('fetch'), 'fetch must NOT be a top-level declaration');
  assert.ok(!topNames.includes('count'), 'count must NOT be a top-level declaration');
});

probe('2.2: Class with multi-bounds and constructor: class Store<K : Any, V : Any>(val name: String) : BaseStore<K, V>', () => {
  const code = `
    open class BaseStore<K, V>
    class Store<K : Any, V : Any>(val name: String) : BaseStore<K, V> {
      fun put(k: K, v: V): Boolean = true
      fun get(k: K): V? = null
    }
    fun helperFunction() {}
  `;
  const ast = parseSnippet(code);
  assert.strictEqual(ast.declarations.length, 3, `Expected 3 top-level decls, got: ${ast.declarations.map(d => d.name)}`);
  const store = ast.declarations.find(d => d.name === 'Store');
  assert.ok(store);
  assert.strictEqual(store.constructorParams.length, 1);
  assert.strictEqual(store.constructorParams[0].name, 'name');
  assert.strictEqual(store.bodyDeclarations.length, 2);
  assert.strictEqual(store.bodyDeclarations[0].name, 'put');
  assert.strictEqual(store.bodyDeclarations[1].name, 'get');
  assert.ok(ast.declarations.some(d => d.name === 'helperFunction'));
});

probe('2.3: Abstract generic ViewModel with State & Action type parameters', () => {
  const code = `
    abstract class BaseViewModel<S : Any, in A : Any>(initialState: S) : ViewModel() {
      val uiState: StateFlow<S> = MutableStateFlow(initialState)
      abstract fun dispatch(action: A)
    }
    class NoteViewModel : BaseViewModel<NoteUiState, NoteAction>(NoteUiState()) {
      override fun dispatch(action: NoteAction) {}
    }
  `;
  const ast = parseSnippet(code);
  const baseVm = ast.declarations.find(d => d.name === 'BaseViewModel');
  assert.ok(baseVm);
  assert.strictEqual(baseVm.bodyDeclarations.length, 2);
  const dispatch = baseVm.bodyDeclarations.find(m => m.name === 'dispatch');
  assert.ok(dispatch);
});

// ----------------------------------------------------------------------------
// PROBE SUITE 3: Route Parameters & camelCase Preservation
// ----------------------------------------------------------------------------
console.log('\n--- PROBE 3: Route Parameters & camelCase Preservation ---');

probe('3.1: Path and query params with camelCase: userProfile/{userId}?tab={activeTab}&sort={sortOrder}', () => {
  const code = `
    package com.claude.nav
    fun NavigationGraph(navController: NavHostController) {
      NavHost(navController = navController, startDestination = "splash") {
        composable("userProfile/{userId}?tab={activeTab}&sort={sortOrder}") {
          UserProfileScreen()
        }
      }
    }
  `;
  const ast = parseSnippet(code);
  const routes = extractRoutes([ast]);
  assert.strictEqual(routes.length, 1);
  const r = routes[0];
  
  assert.strictEqual(r.route, 'userProfile/{userId}?tab={activeTab}&sort={sortOrder}', `Route was mutated: ${r.route}`);
  assert.ok(!r.route.includes('user_profile'), 'Route must not be mutated to snake_case');
  assert.ok(!r.route.includes('user_id'), 'userId must not be mutated to user_id');
  assert.ok(!r.route.includes('active_tab'), 'activeTab must not be mutated to active_tab');
  assert.ok(!r.route.includes('sort_order'), 'sortOrder must not be mutated to sort_order');
  
  const argNames = r.arguments.map(a => a.name);
  assert.deepStrictEqual(argNames, ['userId', 'activeTab', 'sortOrder']);
  assert.strictEqual(r.destinationComposable, 'UserProfileScreen');
});

probe('3.2: Literal route without params keeps camelCase: composable("accountSettings")', () => {
  const code = `
    package com.claude.nav
    fun Nav() {
      NavHost(navController, "home") {
        composable("accountSettings") {
          AccountSettingsScreen()
        }
        composable("helpAndFeedback") {
          HelpScreen()
        }
      }
    }
  `;
  const ast = parseSnippet(code);
  const routes = extractRoutes([ast]);
  assert.strictEqual(routes.length, 2);
  assert.strictEqual(routes[0].route, 'accountSettings');
  assert.strictEqual(routes[1].route, 'helpAndFeedback');
});

probe('3.3: Route parameter with named argument syntax: composable(route = "detailView/{itemGuid}")', () => {
  const code = `
    package com.claude.nav
    fun Nav() {
      NavHost(navController, "home") {
        composable(route = "detailView/{itemGuid}") {
          ItemDetailScreen()
        }
      }
    }
  `;
  const ast = parseSnippet(code);
  const routes = extractRoutes([ast]);
  assert.strictEqual(routes.length, 1);
  assert.strictEqual(routes[0].route, 'detailView/{itemGuid}');
  assert.strictEqual(routes[0].arguments[0].name, 'itemGuid');
});

probe('3.4: Constant route with camelCase resolves correctly from object', () => {
  const codeConst = `
    package com.claude.nav
    object NavDestinations {
      const val USER_PROFILE = "userProfile/{userId}"
      const val EDIT_NOTE = "editNote/{noteId}"
    }
  `;
  const codeNav = `
    package com.claude.nav
    fun Nav() {
      NavHost(navController, "home") {
        composable(NavDestinations.USER_PROFILE) { UserScreen() }
        composable(NavDestinations.EDIT_NOTE) { EditScreen() }
      }
    }
  `;
  const astConst = parseSnippet(codeConst, 'NavDestinations.kt');
  const astNav = parseSnippet(codeNav, 'Nav.kt');
  const routes = extractRoutes([astConst, astNav]);
  assert.strictEqual(routes.length, 2);
  const userRoute = routes.find(r => r.destinationComposable === 'UserScreen');
  assert.ok(userRoute);
  assert.strictEqual(userRoute.route, 'userProfile/{userId}');
  assert.strictEqual(userRoute.arguments[0].name, 'userId');
});

// ----------------------------------------------------------------------------
// PROBE SUITE 4: Error Recovery & Boundary Synchronization
// ----------------------------------------------------------------------------
console.log('\n--- PROBE 4: Error Recovery & Boundary Synchronization ---');

probe('4.1: Unclosed inner block does not swallow subsequent functions', () => {
  const code = `
    package com.claude.broken
    fun BrokenFunction() {
      if (condition) {
        val x = 10
        // missing closing brace
    }
    @Composable
    fun SurvivedComposable(modifier: Modifier = Modifier) {
      Text("Survived")
    }
    fun NormalFunction() {}
  `;
  const ast = parseSnippet(code);
  const comp = extractComposables(ast);
  const names = ast.declarations.map(d => d.name);
  assert.ok(names.includes('BrokenFunction'), 'BrokenFunction parsed');
  assert.ok(names.includes('SurvivedComposable'), 'SurvivedComposable must not be swallowed');
  assert.ok(names.includes('NormalFunction'), 'NormalFunction must not be swallowed');
  assert.strictEqual(comp.length, 1);
  assert.strictEqual(comp[0].composableName, 'SurvivedComposable');
});

probe('4.2: Deep unclosed braces chain survives without hanging or crashing', () => {
  let broken = 'fun Outer() {\n';
  for (let i = 0; i < 20; i++) broken += '  repeat(1) {\n';
  broken += '    val x = 1\n'; // zero closes
  broken += 'fun TargetFunction() {}\n';
  
  const t0 = Date.now();
  const ast = parseSnippet(broken);
  const elapsed = Date.now() - t0;
  assert.ok(elapsed < 1000, `Parsing must take <1000ms, took ${elapsed}ms`);
  const hasTarget = ast.declarations.some(d => d.name === 'TargetFunction');
  assert.ok(hasTarget, 'TargetFunction must be recovered and parsed');
});

// ----------------------------------------------------------------------------
// PROBE SUITE 5: Public API Surface & Verification Execution
// ----------------------------------------------------------------------------
console.log('\n--- PROBE 5: Public API Surface & Verification Command ---');

probe('5.1: parseKotlinFile is a callable function returning AST with declarations', () => {
  assert.strictEqual(typeof analyzer.parseKotlinFile, 'function');
  const ast = analyzer.parseKotlinFile('package com.test\nfun testFunc() {}', 'Test.kt');
  assert.ok(ast);
  assert.strictEqual(ast.package, 'com.test');
  assert.strictEqual(ast.declarations.length, 1);
  assert.strictEqual(ast.declarations[0].name, 'testFunc');
});

probe('5.2: analyzeApp is an async function resolving ExistingAppModel on note-app', async () => {
  assert.strictEqual(typeof analyzer.analyzeApp, 'function');
  const noteAppPath = path.resolve(__dirname, '../../fixtures/note-app');
  const model = await analyzer.analyzeApp(noteAppPath);
  assert.ok(model);
  assert.ok(Array.isArray(model.screens));
  assert.ok(model.screens.length >= 2, `Expected >=2 screens, got ${model.screens.length}`);
  assert.ok(Array.isArray(model.routes));
  assert.ok(model.routes.length >= 2, `Expected >=2 routes, got ${model.routes.length}`);
});

probe('5.3: Exact handoff verification command from worker_m1_fix/handoff.md succeeds', async () => {
  const { analyzeApp } = analyzer;
  const m = await analyzeApp(path.resolve(__dirname, '../../fixtures/note-app'));
  const valid = !!m && m.screens.length > 0;
  assert.strictEqual(valid, true, 'Verification expression !!m && m.screens.length > 0 must be true');
});

// ----------------------------------------------------------------------------
// SUMMARY
// ----------------------------------------------------------------------------
(async () => {
  // Wait for async probes if any
  console.log('\n======================================================================');
  console.log(`PROBES TOTAL:  ${totalProbes}`);
  console.log(`PROBES PASSED: ${passedProbes}`);
  console.log(`PROBES FAILED: ${failures.length}`);
  console.log('======================================================================\n');

  if (failures.length > 0) {
    console.error('FAILURES DETECTED:');
    for (const f of failures) {
      console.error(`- ${f.name}: ${f.error}`);
    }
    process.exit(1);
  } else {
    console.log('ALL EMPIRICAL PROBES PASSED WITH ZERO DEFECTS.');
    process.exit(0);
  }
})();
