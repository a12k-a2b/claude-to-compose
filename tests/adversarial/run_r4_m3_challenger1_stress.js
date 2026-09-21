#!/usr/bin/env node

/**
 * ============================================================================
 * Adversarial Stress & Empirical Verification Suite: Milestone 3 (R3)
 * Deterministic Semantic Vector Binding & Catalog Generator
 *
 * Executed by: r4_m3_challenger_1 (Role: critic, specialist)
 * Working Directory: /Users/anjan/.gemini/antigravity/scratch/claude_to_compose
 * Targets:
 *   - Semantic classification & naming stress across Lucide, Feather, buttons,
 *     numeric names (`10k`, `3d-cube`), special characters, and collisions
 *   - Geometry deduplication invariant (collapsing identical SVGs into 1 entry)
 *   - Multi-color vector preservation & Color.Unspecified emission in ScreenGenerator
 *   - Contextual currentColor tint binding (Sol:OS Os900, Os400, Os300, Color.White, LocalContentColor)
 *   - Live compilation in Android Gradle (./gradlew compileDebugKotlin & ./gradlew test)
 *   - AAPT2 VectorDrawable XML parsing (./gradlew processDebugResources)
 * ============================================================================
 */

const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { execSync } = require('node:child_process');

const { SvgParser, extractSemanticName } = require('../../extractor/svg_parser');
const { extractSemanticIconName } = require('../../extractor/dom_walker');
const { VectorGenerator, toPascalCase, normalizeIconName, computeVectorFingerprint, analyzeVectorColors } = require('../../synthesizer/vector_generator');
const { ScreenGenerator, resolveIconVector, resolveContextualTint } = require('../../synthesizer/screen_generator');

const results = [];
let passCount = 0;
let failCount = 0;

function recordTest(id, name, category, passed, details = {}) {
  results.push({ id, name, category, passed, details });
  if (passed) {
    passCount++;
    console.log(`\x1b[32m[PASS]\x1b[0m [${id}] ${name}`);
  } else {
    failCount++;
    console.log(`\x1b[31m[FAIL]\x1b[0m [${id}] ${name}`);
    console.log(`       \x1b[31mReason: ${details.reason || 'Assertion failed'}\x1b[0m`);
    if (details.expected !== undefined && details.actual !== undefined) {
      console.log(`       Expected: ${JSON.stringify(details.expected)}`);
      console.log(`       Actual:   ${JSON.stringify(details.actual)}`);
    }
  }
}

function assertKotlinBracesBalanced(kotlin) {
  let depth = 0;
  for (let i = 0; i < kotlin.length; i++) {
    const char = kotlin[i];
    if (char === '{') depth++;
    if (char === '}') depth--;
    if (depth < 0) {
      throw new Error(`Negative brace depth at character index ${i}`);
    }
  }
  if (depth !== 0) {
    throw new Error(`Unclosed braces in Kotlin code: final depth = ${depth}`);
  }
}

function assertXmlBalanced(xml) {
  const vectorOpen = (xml.match(/<vector[\s>]/g) || []).length;
  const vectorClose = (xml.match(/<\/vector>/g) || []).length;
  assert.equal(vectorOpen, vectorClose, 'Mismatched <vector> tags');

  const pathMatches = (xml.match(/<path[\s\S]*?\/>/g) || []).length;
  assert.ok(pathMatches > 0, 'Must have at least one self-closing path in XML');
}

const PROJECT_ROOT = path.resolve(__dirname, '../..');
const ANDROID_DIR = path.join(PROJECT_ROOT, 'android');
const KOTLIN_ICONS_DIR = path.join(ANDROID_DIR, 'app/src/main/java/com/claude/compose/icons');
const KOTLIN_SCREEN_DIR = path.join(ANDROID_DIR, 'app/src/main/java/com/claude/compose/screen');
const RES_DRAWABLE_DIR = path.join(ANDROID_DIR, 'app/src/main/res/drawable');

// ============================================================================
// SUITE 1: Semantic Classification & Naming Normalization Stress
// ============================================================================
async function runSuite1() {
  console.log('\n======================================================================');
  console.log(' SUITE 1: Semantic Classification & Naming Normalization Stress');
  console.log('======================================================================');

  // Test 1.1: Lucide classes with diverse action prefixes
  try {
    const lucideCases = [
      { raw: '<svg class="lucide lucide-file-plus" width="24" height="24"><path d="M0 0"/></svg>', expected: 'FilePlusIcon' },
      { raw: '<svg class="lucide-folder-archive" width="24" height="24"><path d="M0 0"/></svg>', expected: 'FolderArchiveIcon' },
      { raw: '<svg class="lucide lucide-arrow-up-right" width="24" height="24"><path d="M0 0"/></svg>', expected: 'ArrowUpRightIcon' },
      { raw: '<svg class="lucide-trash-2" width="24" height="24"><path d="M0 0"/></svg>', expected: 'Trash2Icon' },
      { raw: '<svg class="lucide-alert-circle" width="24" height="24"><path d="M0 0"/></svg>', expected: 'AlertCircleIcon' },
    ];
    for (const c of lucideCases) {
      const name = SvgParser.extractSemanticName(c.raw);
      const norm = VectorGenerator.normalizeIconName(name);
      assert.equal(norm, c.expected, `Mismatch for ${c.raw}`);
    }
    recordTest('M3-1.1', 'Lucide class family semantic name normalization', 'naming', true);
  } catch (err) {
    recordTest('M3-1.1', 'Lucide class family semantic name normalization', 'naming', false, { reason: err.message });
  }

  // Test 1.2: Feather classes
  try {
    const featherCases = [
      { raw: '<svg class="feather feather-chevron-down" width="24" height="24"><path d="M0 0"/></svg>', expected: 'ChevronDownIcon' },
      { raw: '<svg class="feather-check" width="24" height="24"><path d="M0 0"/></svg>', expected: 'CheckIcon' },
      { raw: '<svg class="feather-refresh-cw" width="24" height="24"><path d="M0 0"/></svg>', expected: 'RefreshCwIcon' },
    ];
    for (const c of featherCases) {
      const name = SvgParser.extractSemanticName(c.raw);
      const norm = VectorGenerator.normalizeIconName(name);
      assert.equal(norm, c.expected);
    }
    recordTest('M3-1.2', 'Feather class family semantic name normalization', 'naming', true);
  } catch (err) {
    recordTest('M3-1.2', 'Feather class family semantic name normalization', 'naming', false, { reason: err.message });
  }

  // Test 1.3: Enclosing interactive button extraction
  try {
    // Button with aria-label
    const elWithBtnAria = {
      closest: (sel) => sel.includes('button') ? {
        getAttribute: (k) => k === 'aria-label' ? 'Export CSV' : null,
        childNodes: []
      } : null
    };
    const nameBtnAria = extractSemanticIconName(elWithBtnAria);
    assert.equal(VectorGenerator.normalizeIconName(nameBtnAria), 'ExportCsvIcon');

    // Button with inner text
    const elWithBtnText = {
      closest: (sel) => sel.includes('button') ? {
        getAttribute: () => null,
        childNodes: [{ nodeType: 3, textContent: 'New Deployment' }]
      } : null
    };
    const nameBtnText = extractSemanticIconName(elWithBtnText);
    assert.equal(VectorGenerator.normalizeIconName(nameBtnText), 'NewDeploymentIcon');

    recordTest('M3-1.3', 'Enclosing button aria-label and text extraction', 'naming', true);
  } catch (err) {
    recordTest('M3-1.3', 'Enclosing button aria-label and text extraction', 'naming', false, { reason: err.message });
  }

  // Test 1.4: Numeric-prefixed icon names (e.g. "10k", "3d-cube", "24-hours")
  try {
    const numericCases = [
      { raw: '10k', expectedNorm: '10kIcon', isSafe: false },
      { raw: '3d-cube', expectedNorm: '3dCubeIcon', isSafe: false },
      { raw: '24-hours', expectedNorm: '24HoursIcon', isSafe: false },
      { raw: '1st-place', expectedNorm: '1stPlaceIcon', isSafe: false },
    ];
    for (const c of numericCases) {
      const norm = VectorGenerator.normalizeIconName(c.raw);
      assert.equal(norm, c.expectedNorm);
      const safeProp = /^[0-9]/.test(norm) ? `\`${norm}\`` : norm;
      assert.ok(safeProp.startsWith('`') && safeProp.endsWith('`'), `Expected backtick escaping for ${norm}`);
    }
    recordTest('M3-1.4', 'Numeric-prefixed icon names normalized and backtick-escaped', 'naming', true);
  } catch (err) {
    recordTest('M3-1.4', 'Numeric-prefixed icon names normalized and backtick-escaped', 'naming', false, { reason: err.message });
  }

  // Test 1.5: Special characters, punctuation, and delimiters
  try {
    const weirdCases = [
      { raw: 'arrow->right', expected: 'ArrowRightIcon' },
      { raw: 'file+add', expected: 'FileAddIcon' },
      { raw: 'user@profile', expected: 'UserProfileIcon' },
      { raw: 'dollar$amount', expected: 'DollarAmountIcon' },
      { raw: 'search & replace', expected: 'SearchReplaceIcon' },
      { raw: 'foo_bar-baz.qux', expected: 'FooBarBazQuxIcon' },
    ];
    for (const c of weirdCases) {
      const norm = VectorGenerator.normalizeIconName(c.raw);
      assert.equal(norm, c.expected, `Failed normalizing ${c.raw}`);
    }
    recordTest('M3-1.5', 'Punctuation and unusual delimiters normalized to clean PascalCase', 'naming', true);
  } catch (err) {
    recordTest('M3-1.5', 'Punctuation and unusual delimiters normalized to clean PascalCase', 'naming', false, { reason: err.message });
  }

  // Test 1.6: Pure punctuation and degenerate names fallback safely
  try {
    const degenerates = ['???', '---', '***', '###', '   ', ''];
    for (let i = 0; i < degenerates.length; i++) {
      const norm = VectorGenerator.normalizeIconName(degenerates[i], i + 1);
      assert.ok(norm.endsWith('Icon'), `Expected ${norm} to end in Icon`);
      assert.ok(/^[a-zA-Z0-9_`]+$/.test(norm), `Invalid identifier characters in ${norm}`);
    }
    recordTest('M3-1.6', 'Degenerate and pure punctuation names fallback cleanly', 'naming', true);
  } catch (err) {
    recordTest('M3-1.6', 'Degenerate and pure punctuation names fallback cleanly', 'naming', false, { reason: err.message });
  }

  // Test 1.7: Disambiguation of identical names with distinct geometries
  try {
    const vec1 = { name: 'search', paths: [{ d: 'M0 0 L10 10', stroke: '#000000' }] };
    const vec2 = { name: 'search', paths: [{ d: 'M5 5 L15 15', stroke: '#000000' }] };
    const vec3 = { name: 'search', paths: [{ d: 'M2 2 L8 8', stroke: '#000000' }] };

    const kotlin = VectorGenerator.generateImageVectorFile([vec1, vec2, vec3]);
    assert.ok(kotlin.includes('ClaudeIcons.SearchIcon: ImageVector'), 'SearchIcon missing');
    assert.ok(kotlin.includes('ClaudeIcons.SearchIcon_2: ImageVector'), 'SearchIcon_2 missing');
    assert.ok(kotlin.includes('ClaudeIcons.SearchIcon_3: ImageVector'), 'SearchIcon_3 missing');
    assertKotlinBracesBalanced(kotlin);
    recordTest('M3-1.7', 'Disambiguation of identical names with distinct geometries', 'naming', true);
  } catch (err) {
    recordTest('M3-1.7', 'Disambiguation of identical names with distinct geometries', 'naming', false, { reason: err.message });
  }
}

// ============================================================================
// SUITE 2: Geometry Deduplication Invariant
// ============================================================================
async function runSuite2() {
  console.log('\n======================================================================');
  console.log(' SUITE 2: Geometry Deduplication Invariant');
  console.log('======================================================================');

  // Test 2.1: 20 identical SVGs with different names collapsed into 1 catalog entry
  try {
    const identicalVectors = [];
    for (let i = 1; i <= 20; i++) {
      identicalVectors.push({
        id: `svg-${i}`,
        name: `chevron-instance-${i}`,
        width: 24,
        height: 24,
        viewBox: '0 0 24 24',
        paths: [{
          d: 'M6 9 L12 15 L18 9',
          fill: 'none',
          stroke: '#1A1A1A',
          strokeWidth: 2
        }]
      });
    }

    const kotlin = VectorGenerator.generateImageVectorFile(identicalVectors);
    // Count occurrences of 'public val ClaudeIcons.'
    const propMatches = kotlin.match(/public val ClaudeIcons\.[a-zA-Z0-9_`]+:\s*ImageVector/g) || [];
    assert.equal(propMatches.length, 1, `Expected exactly 1 property emitted, got ${propMatches.length}`);
    assert.ok(kotlin.includes('ChevronInstance1Icon'), 'Expected ChevronInstance1Icon as the primary property');
    assertKotlinBracesBalanced(kotlin);
    recordTest('M3-2.1', '20 identical SVGs with varied names collapsed into 1 catalog property', 'dedup', true);
  } catch (err) {
    recordTest('M3-2.1', '20 identical SVGs with varied names collapsed into 1 catalog property', 'dedup', false, { reason: err.message });
  }

  // Test 2.2: Whitespace tolerance in geometry fingerprinting
  try {
    const vecA = {
      width: 24, height: 24, viewBox: '0 0 24 24',
      paths: [{ d: 'M 0  0   L 10  10  Z', fill: 'none', stroke: '#000000' }]
    };
    const vecB = {
      width: 24, height: 24, viewBox: '0 0 24 24',
      paths: [{ d: 'M 0 0 L 10 10 Z', fill: 'none', stroke: '#000000' }]
    };
    const fpA = VectorGenerator.computeVectorFingerprint(vecA);
    const fpB = VectorGenerator.computeVectorFingerprint(vecB);
    assert.equal(fpA, fpB, `Fingerprints should match despite whitespace: "${fpA}" vs "${fpB}"`);
    recordTest('M3-2.2', 'Whitespace normalization in geometry fingerprint', 'dedup', true);
  } catch (err) {
    recordTest('M3-2.2', 'Whitespace normalization in geometry fingerprint', 'dedup', false, { reason: err.message });
  }

  // Test 2.3: Screen generator references deduplicated property across all callers
  try {
    const sharedVectors = [
      { id: 'v1', name: 'check-mark-a', width: 24, height: 24, paths: [{ d: 'M0 0 L5 5 L10 0', stroke: '#1A1A1A' }] },
      { id: 'v2', name: 'check-mark-b', width: 24, height: 24, paths: [{ d: 'M0 0 L5 5 L10 0', stroke: '#1A1A1A' }] },
      { id: 'v3', name: 'check-mark-c', width: 24, height: 24, paths: [{ d: 'M0 0 L5 5 L10 0', stroke: '#1A1A1A' }] },
    ];

    const spec = {
      designSystem: { typography: {} },
      root: {
        componentType: 'Container',
        children: [
          { componentType: 'Icon', vectorId: 'v1' },
          { componentType: 'Icon', vectorId: 'v2' },
          { componentType: 'Icon', vectorId: 'v3' },
        ]
      },
      vectors: sharedVectors
    };

    const screenCode = ScreenGenerator.generateScreenFile(spec, 'com.claude.compose');
    // All 3 icons should resolve to CheckMarkAIcon
    const occurrences = (screenCode.match(/ClaudeIcons\.CheckMarkAIcon/g) || []).length;
    assert.equal(occurrences, 3, `Expected all 3 icons to reference ClaudeIcons.CheckMarkAIcon, got ${occurrences}`);
    recordTest('M3-2.3', 'Screen generator routes all deduplicated instances to single catalog property', 'dedup', true);
  } catch (err) {
    recordTest('M3-2.3', 'Screen generator routes all deduplicated instances to single catalog property', 'dedup', false, { reason: err.message });
  }

  // Test 2.4: Different strokes/fills with same path data NOT collapsed
  try {
    const vecRed = { width: 24, height: 24, paths: [{ d: 'M0 0 L10 10', stroke: '#FF0000', fill: 'none' }] };
    const vecBlue = { width: 24, height: 24, paths: [{ d: 'M0 0 L10 10', stroke: '#0000FF', fill: 'none' }] };
    const fpRed = VectorGenerator.computeVectorFingerprint(vecRed);
    const fpBlue = VectorGenerator.computeVectorFingerprint(vecBlue);
    assert.notEqual(fpRed, fpBlue, 'Distinct stroke colors must produce distinct fingerprints');
    recordTest('M3-2.4', 'Distinct stroke/fill colors preserve distinct fingerprints', 'dedup', true);
  } catch (err) {
    recordTest('M3-2.4', 'Distinct stroke/fill colors preserve distinct fingerprints', 'dedup', false, { reason: err.message });
  }
}

// ============================================================================
// SUITE 3: Multi-Color Vector Preservation & Contextual Tinting Stress
// ============================================================================
async function runSuite3() {
  console.log('\n======================================================================');
  console.log(' SUITE 3: Multi-Color Vector Preservation & Contextual Tinting Stress');
  console.log('======================================================================');

  // Test 3.1: Vector with 2 distinct solid colors detected as multi-color
  try {
    const twoColorVec = {
      paths: [
        { d: 'M0 0 L10 0', fill: '#FF5722', stroke: 'none' },
        { d: 'M10 0 L20 0', fill: '#2196F3', stroke: 'none' }
      ]
    };
    const analysis = VectorGenerator.analyzeVectorColors(twoColorVec);
    assert.equal(analysis.isMultiColor, true, 'Expected isMultiColor = true for 2 colors');
    assert.equal(analysis.isMonochrome, false, 'Expected isMonochrome = false');

    const tint = resolveContextualTint({ componentType: 'Icon' }, {}, twoColorVec);
    assert.equal(tint, 'Color.Unspecified', `Expected Color.Unspecified, got ${tint}`);
    recordTest('M3-3.1', '2-color vector emits tint = Color.Unspecified', 'tinting', true);
  } catch (err) {
    recordTest('M3-3.1', '2-color vector emits tint = Color.Unspecified', 'tinting', false, { reason: err.message });
  }

  // Test 3.2: Vector with 4 distinct solid colors
  try {
    const quadColorVec = {
      paths: [
        { d: 'M0 0 L5 5', fill: '#E53935' },
        { d: 'M5 5 L10 10', fill: '#43A047' },
        { d: 'M10 10 L15 15', fill: '#1E88E5' },
        { d: 'M15 15 L20 20', fill: '#FDD835' }
      ]
    };
    const analysis = VectorGenerator.analyzeVectorColors(quadColorVec);
    assert.equal(analysis.isMultiColor, true);
    assert.equal(analysis.distinctCount, 4);
    const tint = resolveContextualTint({ componentType: 'Icon' }, {}, quadColorVec);
    assert.equal(tint, 'Color.Unspecified');
    recordTest('M3-3.2', '4-color vector detected and emits Color.Unspecified', 'tinting', true);
  } catch (err) {
    recordTest('M3-3.2', '4-color vector detected and emits Color.Unspecified', 'tinting', false, { reason: err.message });
  }

  // Test 3.3: Vector with <linearGradient> detected as multi-color
  try {
    const gradVec = {
      rawSvg: '<svg width="24" height="24"><defs><linearGradient id="g1"><stop offset="0%" stop-color="#ff0"/><stop offset="100%" stop-color="#f00"/></linearGradient></defs><rect fill="url(#g1)"/></svg>',
      paths: [{ d: 'M0 0 H24 V24 H0 Z', fill: 'url(#g1)' }]
    };
    const analysis = VectorGenerator.analyzeVectorColors(gradVec);
    assert.equal(analysis.isMultiColor, true, 'Gradient should set isMultiColor = true');
    const tint = resolveContextualTint({ componentType: 'Icon' }, {}, gradVec);
    assert.equal(tint, 'Color.Unspecified');
    recordTest('M3-3.3', 'Gradient vector detected and emits Color.Unspecified', 'tinting', true);
  } catch (err) {
    recordTest('M3-3.3', 'Gradient vector detected and emits Color.Unspecified', 'tinting', false, { reason: err.message });
  }

  // Test 3.4: Two-tone vector (accent fill + currentColor) detected as multi-color
  try {
    const twoToneVec = {
      paths: [
        { d: 'M0 0 L10 10', fill: '#3B82F6' },
        { d: 'M10 10 L20 20', fill: 'currentColor', isCurrentColor: true }
      ]
    };
    const analysis = VectorGenerator.analyzeVectorColors(twoToneVec);
    assert.equal(analysis.isMultiColor, true, 'Accent + currentColor must be multi-color');
    const tint = resolveContextualTint({ componentType: 'Icon' }, {}, twoToneVec);
    assert.equal(tint, 'Color.Unspecified');
    recordTest('M3-3.4', 'Two-tone (accent + currentColor) vector emits Color.Unspecified', 'tinting', true);
  } catch (err) {
    recordTest('M3-3.4', 'Two-tone (accent + currentColor) vector emits Color.Unspecified', 'tinting', false, { reason: err.message });
  }

  // Test 3.5: Monochrome currentColor vector emits Sol:OS contextual tint (NEVER Color.Unspecified)
  try {
    const monoVec = {
      paths: [{ d: 'M0 0 L10 10', stroke: 'currentColor', isCurrentColor: true }]
    };
    const analysis = VectorGenerator.analyzeVectorColors(monoVec);
    assert.equal(analysis.isMultiColor, false);
    assert.equal(analysis.isMonochrome, true);

    // Dark text context -> Os900
    const tintOs900 = resolveContextualTint({ style: { color: '#1A1A1A' } }, {}, monoVec);
    assert.equal(tintOs900, 'Os900');

    // Secondary text context -> Os400
    const tintOs400 = resolveContextualTint({ style: { color: '#535353' } }, {}, monoVec);
    assert.equal(tintOs400, 'Os400');

    // Low emphasis text context -> Os300
    const tintOs300 = resolveContextualTint({ style: { color: '#858585' } }, {}, monoVec);
    assert.equal(tintOs300, 'Os300');

    // Hairline/disabled -> Os200
    const tintOs200 = resolveContextualTint({ style: { color: '#CCCCCC' } }, {}, monoVec);
    assert.equal(tintOs200, 'Os200');

    // Dark button / inverted container -> Color.White
    const tintBtn = resolveContextualTint({}, { isDarkContainer: true }, monoVec);
    assert.equal(tintBtn, 'Color.White');

    // Unspecified context -> LocalContentColor.current
    const tintFallback = resolveContextualTint({}, {}, monoVec);
    assert.equal(tintFallback, 'LocalContentColor.current');

    recordTest('M3-3.5', 'Monochrome vector binds strictly to Sol:OS grayscale tokens and never Color.Unspecified', 'tinting', true);
  } catch (err) {
    recordTest('M3-3.5', 'Monochrome vector binds strictly to Sol:OS grayscale tokens and never Color.Unspecified', 'tinting', false, { reason: err.message });
  }

  // Test 3.6: Multi-color vs monochrome co-existence in single generated screen
  try {
    const multiVec = {
      id: 'logo-multi',
      name: 'company-logo',
      paths: [
        { d: 'M0 0 L10 10', fill: '#FF5722' },
        { d: 'M10 10 L20 20', fill: '#2196F3' }
      ]
    };
    const monoVec = {
      id: 'nav-search',
      name: 'search-icon',
      paths: [
        { d: 'M0 0 L10 10', stroke: 'currentColor', isCurrentColor: true }
      ]
    };

    const spec = {
      designSystem: { typography: {} },
      root: {
        componentType: 'Container',
        children: [
          { componentType: 'Icon', vectorId: 'logo-multi' },
          { componentType: 'Icon', vectorId: 'nav-search', style: { color: '#1A1A1A' } }
        ]
      },
      vectors: [multiVec, monoVec]
    };

    const screenCode = ScreenGenerator.generateScreenFile(spec, 'com.claude.compose');
    assert.ok(screenCode.includes('tint = Color.Unspecified'), 'Missing Color.Unspecified for multiVec');
    assert.ok(screenCode.includes('tint = Os900'), 'Missing Os900 for monoVec');
    assertKotlinBracesBalanced(screenCode);
    recordTest('M3-3.6', 'Multi-color and monochrome icons correctly differentiated in synthesized screen', 'tinting', true);
  } catch (err) {
    recordTest('M3-3.6', 'Multi-color and monochrome icons correctly differentiated in synthesized screen', 'tinting', false, { reason: err.message });
  }
}

// ============================================================================
// SUITE 4: High-Complexity Catalog Synthesis & Real Gradle Compilation
// ============================================================================
async function runSuite4() {
  console.log('\n======================================================================');
  console.log(' SUITE 4: High-Complexity Catalog Synthesis & Real Gradle Compilation');
  console.log('======================================================================');

  // Backup original files before modifying
  const originalIconsFile = path.join(KOTLIN_ICONS_DIR, 'ClaudeIcons.kt');
  const originalScreenFile = path.join(KOTLIN_SCREEN_DIR, 'ClaudeDesignScreen.kt');
  const iconsBackup = fs.readFileSync(originalIconsFile, 'utf-8');
  const screenBackup = fs.readFileSync(originalScreenFile, 'utf-8');

  try {
    // Construct a comprehensive stress test catalog with 32 diverse icons:
    // - 5 Lucide icons
    // - 5 Feather icons
    // - 3 Enclosing button icons
    // - 4 Multi-color vectors (2-tone, 3-color, 4-color, gradient)
    // - 4 Numeric-prefixed icons (`10k`, `3d-cube`, `24-hours`, `1st-place`)
    // - 4 Special character & delimiter icons
    // - 5 Duplicated icons with identical geometries
    // - 2 Grouped & EvenOdd icons

    const stressVectors = [
      // 1-5: Lucide
      { id: 'lucide-1', name: 'lucide-file-plus', paths: [{ d: 'M14 2 H6 a2 2 0 0 0 -2 2 v16 a2 2 0 0 0 2 2 h12 a2 2 0 0 0 2 -2 V8 z', stroke: '#1A1A1A' }] },
      { id: 'lucide-2', name: 'lucide-folder-archive', paths: [{ d: 'M4 20 h16 a2 2 0 0 0 2 -2 V8 a2 2 0 0 0 -2 -2 h-7.93 a2 2 0 0 1 -1.66 -.9 l-.82 -1.2 A2 2 0 0 0 7.93 3 H4 a2 2 0 0 0 -2 2 v13 c0 1.1 .9 2 2 2 z', stroke: '#1A1A1A' }] },
      { id: 'lucide-3', name: 'lucide-arrow-up-right', paths: [{ d: 'M7 17 L17 7 M7 7 h10 v10', stroke: '#1A1A1A' }] },
      { id: 'lucide-4', name: 'lucide-trash-2', paths: [{ d: 'M3 6 h18 M19 6 v14 a2 2 0 0 1 -2 2 H7 a2 2 0 0 1 -2 -2 V6 M8 6 V4 a2 2 0 0 1 2 -2 h4 a2 2 0 0 1 2 2 v2', stroke: '#1A1A1A' }] },
      { id: 'lucide-5', name: 'lucide-alert-circle', paths: [{ d: 'M12 22 c5.523 0 10 -4.477 10 -10 S17.523 2 12 2 2 6.477 2 12 s4.477 10 10 10 z M12 8 v4 M12 16 h.01', stroke: '#1A1A1A' }] },

      // 6-10: Feather
      { id: 'feather-1', name: 'feather-chevron-down', paths: [{ d: 'M6 9 L12 15 L18 9', stroke: '#535353' }] },
      { id: 'feather-2', name: 'feather-check', paths: [{ d: 'M20 6 L9 17 L4 12', stroke: '#1A1A1A' }] },
      { id: 'feather-3', name: 'feather-bell', paths: [{ d: 'M18 8 A6 6 0 0 0 6 8 c0 7 -3 9 -3 9 h18 s-3 -2 -3 -9 M13.73 21 a2 2 0 0 1 -3.46 0', stroke: '#535353' }] },
      { id: 'feather-4', name: 'feather-refresh-cw', paths: [{ d: 'M23 4 v6 h-6 M1 20 v-6 h6', stroke: '#1A1A1A' }] },
      { id: 'feather-5', name: 'feather-shield', paths: [{ d: 'M12 22 s8 -4 8 -10 V5 l-8 -3 -8 3 v7 c0 6 8 10 8 10 z', stroke: '#1A1A1A' }] },

      // 11-13: Enclosing button labels
      { id: 'btn-1', name: 'Export CSV Button', paths: [{ d: 'M21 15 v4 a2 2 0 0 1 -2 2 H5 a2 2 0 0 1 -2 -2 v-4 M7 10 l5 5 5 -5 M12 15 V3', stroke: '#1A1A1A' }] },
      { id: 'btn-2', name: 'New Deployment', paths: [{ d: 'M12 5 v14 M5 12 h14', stroke: '#1A1A1A' }] },
      { id: 'btn-3', name: 'Filter Logs', paths: [{ d: 'M22 3 H2 l8 9.46 V19 l4 2 v-8.54 L22 3 z', stroke: '#535353' }] },

      // 14-17: Multi-color vectors
      {
        id: 'multi-1',
        name: 'Brand Logo Two Tone',
        paths: [
          { d: 'M2 2 H12 V22 H2 Z', fill: '#FF5200', stroke: 'none' },
          { d: 'M12 2 H22 V22 H12 Z', fill: '#1A1A1A', stroke: 'none' }
        ]
      },
      {
        id: 'multi-2',
        name: 'Tricolor Badge',
        paths: [
          { d: 'M2 2 H8 V22 H2 Z', fill: '#1E88E5', stroke: 'none' },
          { d: 'M8 2 H14 V22 H8 Z', fill: '#FFFFFF', stroke: 'none' },
          { d: 'M14 2 H20 V22 H14 Z', fill: '#E53935', stroke: 'none' }
        ]
      },
      {
        id: 'multi-3',
        name: 'Gradient Icon',
        rawSvg: '<svg width="24" height="24"><defs><linearGradient id="g1"><stop offset="0%" stop-color="#ff0"/><stop offset="100%" stop-color="#f00"/></linearGradient></defs><path d="M2 2 h20 v20 h-20 z" fill="url(#g1)"/></svg>',
        paths: [{ d: 'M2 2 h20 v20 h-20 z', fill: '#FF5722' }]
      },
      {
        id: 'multi-4',
        name: 'Accent With CurrentColor',
        paths: [
          { d: 'M0 0 L10 10', fill: '#3B82F6', stroke: 'none' },
          { d: 'M10 10 L20 20', fill: 'none', stroke: 'currentColor', isCurrentColor: true }
        ]
      },

      // 18-21: Numeric-prefixed icons
      { id: 'num-1', name: '10k', paths: [{ d: 'M4 4 H8 V20 H4 Z M12 4 L18 12 L12 20', stroke: '#1A1A1A' }] },
      { id: 'num-2', name: '3d-cube', paths: [{ d: 'M12 2 L2 7 L12 12 L22 7 Z M2 17 L12 22 L22 17 M2 12 L12 17 L22 12', stroke: '#1A1A1A' }] },
      { id: 'num-3', name: '24-hours', paths: [{ d: 'M12 2 A10 10 0 1 0 22 12 M12 6 V12 L16 14', stroke: '#535353' }] },
      { id: 'num-4', name: '1st-place', paths: [{ d: 'M12 2 L15 8 L22 9 L17 14 L18 21 L12 18 L6 21 L7 14 L2 9 L9 8 Z', stroke: '#1A1A1A' }] },

      // 22-25: Special character & delimiter icons
      { id: 'spec-1', name: 'arrow->right', paths: [{ d: 'M5 12 h14 M12 5 l7 7 -7 7', stroke: '#1A1A1A' }] },
      { id: 'spec-2', name: 'file+add', paths: [{ d: 'M14 2 H6 a2 2 0 0 0 -2 2 v16 a2 2 0 0 0 2 2 h12 M12 11 v6 M9 14 h6', stroke: '#1A1A1A' }] },
      { id: 'spec-3', name: 'user@profile', paths: [{ d: 'M20 21 v-2 a4 4 0 0 0 -4 -4 H8 a4 4 0 0 0 -4 4 v2 M12 11 a4 4 0 1 0 0 -8 4 4 0 0 0 0 8 z', stroke: '#1A1A1A' }] },
      { id: 'spec-4', name: 'dollar$amount', paths: [{ d: 'M12 1 v22 M17 5 H9.5 a3.5 3.5 0 0 0 0 7 h5 a3.5 3.5 0 0 1 0 7 H6', stroke: '#1A1A1A' }] },

      // 26-30: Duplicate identical icons (should be deduplicated to feather-1 ChevronDown)
      { id: 'dup-1', name: 'chevron-down-dup1', paths: [{ d: 'M6 9 L12 15 L18 9', stroke: '#535353' }] },
      { id: 'dup-2', name: 'chevron-down-dup2', paths: [{ d: 'M6 9 L12 15 L18 9', stroke: '#535353' }] },
      { id: 'dup-3', name: 'chevron-down-dup3', paths: [{ d: 'M6 9 L12 15 L18 9', stroke: '#535353' }] },
      { id: 'dup-4', name: 'chevron-down-dup4', paths: [{ d: 'M6 9 L12 15 L18 9', stroke: '#535353' }] },
      { id: 'dup-5', name: 'chevron-down-dup5', paths: [{ d: 'M6 9 L12 15 L18 9', stroke: '#535353' }] },

      // 31-32: Group & EvenOdd icons
      {
        id: 'evenodd-1',
        name: 'Badge With Donut Hole',
        paths: [{
          d: 'M12 2 A10 10 0 1 0 12 22 A10 10 0 1 0 12 2 Z M12 6 A6 6 0 1 1 12 18 A6 6 0 1 1 12 6 Z',
          fill: '#1A1A1A',
          fillRule: 'evenodd'
        }]
      },
      {
        id: 'group-1',
        name: 'Nested Rotated Compass',
        children: [{
          type: 'group',
          name: 'CompassDial',
          rotate: 45,
          children: [
            { type: 'path', d: 'M12 2 L19 21 L12 17 L5 21 Z', stroke: '#1A1A1A' }
          ]
        }]
      }
    ];

    // Generate ClaudeIcons.kt
    const generatedKotlin = VectorGenerator.generateImageVectorFile(stressVectors, {
      packageName: 'com.claude.compose.icons',
      className: 'ClaudeIcons'
    });
    assertKotlinBracesBalanced(generatedKotlin);

    // Verify deduplication collapsed the 5 duplicates
    assert.ok(generatedKotlin.includes('ChevronDownIcon'), 'Missing ChevronDownIcon');
    assert.ok(!generatedKotlin.includes('ChevronDownDup1Icon'), 'Duplicate ChevronDownDup1Icon should not exist');
    assert.ok(!generatedKotlin.includes('ChevronDownDup5Icon'), 'Duplicate ChevronDownDup5Icon should not exist');

    // Verify numeric identifier escaping in generated Kotlin
    assert.ok(generatedKotlin.includes('ClaudeIcons.`10kIcon`: ImageVector'), 'Missing escaped 10kIcon');
    assert.ok(generatedKotlin.includes('ClaudeIcons.`3dCubeIcon`: ImageVector'), 'Missing escaped 3dCubeIcon');
    assert.ok(generatedKotlin.includes('ClaudeIcons.`24HoursIcon`: ImageVector'), 'Missing escaped 24HoursIcon');
    assert.ok(generatedKotlin.includes('ClaudeIcons.`1stPlaceIcon`: ImageVector'), 'Missing escaped 1stPlaceIcon');

    // Generate a corresponding screen that exercises these icons
    const stressSpec = {
      designSystem: { typography: {} },
      root: {
        componentType: 'Container',
        children: [
          // Lucide icon
          { componentType: 'Icon', vectorId: 'lucide-1', style: { color: '#1A1A1A' } },
          // Feather icon
          { componentType: 'Icon', vectorId: 'feather-1', style: { color: '#535353' } },
          // Multi-color icons (must have tint = Color.Unspecified)
          { componentType: 'Icon', vectorId: 'multi-1' },
          { componentType: 'Icon', vectorId: 'multi-2' },
          { componentType: 'Icon', vectorId: 'multi-4' },
          // Numeric icon
          { componentType: 'Icon', vectorId: 'num-1', style: { color: '#1A1A1A' } },
          // Special character icon
          { componentType: 'Icon', vectorId: 'spec-1', style: { color: '#1A1A1A' } },
          // Deduplicated icon
          { componentType: 'Icon', vectorId: 'dup-3', style: { color: '#535353' } },
          // Button enclosing icon
          {
            componentType: 'IconButton',
            children: [{ componentType: 'Icon', vectorId: 'btn-1', style: { color: '#1A1A1A' } }]
          }
        ]
      },
      vectors: stressVectors
    };

    const generatedScreen = ScreenGenerator.generateScreenFile(stressSpec, 'com.claude.compose');
    assertKotlinBracesBalanced(generatedScreen);

    // Write files to Android source tree
    fs.writeFileSync(originalIconsFile, generatedKotlin, 'utf-8');
    fs.writeFileSync(originalScreenFile, generatedScreen, 'utf-8');

    console.log('       [Compiling] Running ./gradlew compileDebugKotlin in android/...');
    const compileOutput = execSync('./gradlew compileDebugKotlin', {
      cwd: ANDROID_DIR,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 180000
    });
    assert.ok(compileOutput.includes('BUILD SUCCESSFUL'), 'compileDebugKotlin failed');
    recordTest('M3-4.1', 'Synthesized 32-icon catalog compiles cleanly with ./gradlew compileDebugKotlin', 'gradle', true);

    console.log('       [Testing] Running ./gradlew testDebugUnitTest in android/...');
    const testOutput = execSync('./gradlew testDebugUnitTest', {
      cwd: ANDROID_DIR,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 180000
    });
    assert.ok(testOutput.includes('BUILD SUCCESSFUL'), 'gradle testDebugUnitTest failed');
    recordTest('M3-4.2', 'Synthesized icons & screen pass Robolectric unit tests with ./gradlew testDebugUnitTest', 'gradle', true);

  } catch (err) {
    recordTest('M3-4.2', 'Synthesized icons & screen pass Robolectric unit tests with ./gradlew testDebugUnitTest', 'gradle', false, { reason: err.message, stderr: err.stderr });
  } finally {
    // Restore backups
    fs.writeFileSync(originalIconsFile, iconsBackup, 'utf-8');
    fs.writeFileSync(originalScreenFile, screenBackup, 'utf-8');
    console.log('       [Clean] Restored original ClaudeIcons.kt and ClaudeDesignScreen.kt');
  }
}

// ============================================================================
// SUITE 5: AAPT2 VectorDrawable XML Compatibility
// ============================================================================
async function runSuite5() {
  console.log('\n======================================================================');
  console.log(' SUITE 5: AAPT2 VectorDrawable XML Compatibility');
  console.log('======================================================================');

  const createdXmlFiles = [];

  try {
    const testIcons = [
      {
        name: 'ic_stress_lucide_archive',
        paths: [{ d: 'M4 20 h16 a2 2 0 0 0 2 -2 V8 a2 2 0 0 0 -2 -2 h-7.93 a2 2 0 0 1 -1.66 -.9 l-.82 -1.2 A2 2 0 0 0 7.93 3 H4 a2 2 0 0 0 -2 2 v13 c0 1.1 .9 2 2 2 z', stroke: '#1A1A1A' }]
      },
      {
        name: 'ic_stress_numeric_10k',
        paths: [{ d: 'M4 4 H8 V20 H4 Z M12 4 L18 12 L12 20', stroke: '#1A1A1A' }]
      },
      {
        name: 'ic_stress_evenodd_badge',
        paths: [{
          d: 'M12 2 A10 10 0 1 0 12 22 A10 10 0 1 0 12 2 Z M12 6 A6 6 0 1 1 12 18 A6 6 0 1 1 12 6 Z',
          fill: '#1A1A1A',
          fillRule: 'evenodd'
        }]
      },
      {
        name: 'ic_stress_multitrans_group',
        children: [{
          type: 'group',
          rotate: 30,
          scaleX: 1.2,
          scaleY: 1.2,
          translationX: 4,
          translationY: 4,
          children: [
            { type: 'path', d: 'M0 0 L10 10', stroke: '#1A1A1A' }
          ]
        }]
      }
    ];

    for (const icon of testIcons) {
      const xml = VectorGenerator.generateVectorDrawableXml(icon);
      assertXmlBalanced(xml);
      const filePath = path.join(RES_DRAWABLE_DIR, `${icon.name}.xml`);
      fs.writeFileSync(filePath, xml, 'utf-8');
      createdXmlFiles.push(filePath);
    }

    console.log('       [AAPT2] Running ./gradlew processDebugResources in android/...');
    const aaptOutput = execSync('./gradlew processDebugResources', {
      cwd: ANDROID_DIR,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 120000
    });
    assert.ok(aaptOutput.includes('BUILD SUCCESSFUL'), 'AAPT2 resource processing failed');
    recordTest('M3-5.1', 'AAPT2 processes synthesized XML drawables with zero errors', 'aapt2', true);

  } catch (err) {
    recordTest('M3-5.1', 'AAPT2 processes synthesized XML drawables with zero errors', 'aapt2', false, { reason: err.message, stderr: err.stderr });
  } finally {
    for (const f of createdXmlFiles) {
      if (fs.existsSync(f)) fs.unlinkSync(f);
    }
    console.log(`       [Clean] Removed ${createdXmlFiles.length} temporary XML test drawables`);
  }
}

// ============================================================================
// MAIN RUNNER
// ============================================================================
async function main() {
  console.log('╔══════════════════════════════════════════════════════════════════════╗');
  console.log('║   ADVERSARIAL EMPIRICAL STRESS SUITE: MILESTONE 3 (R3)               ║');
  console.log('║   Deterministic Semantic Vector Binding & Catalog Generator          ║');
  console.log('╚══════════════════════════════════════════════════════════════════════╝');

  const startTime = Date.now();

  await runSuite1();
  await runSuite2();
  await runSuite3();
  await runSuite4();
  await runSuite5();

  const duration = ((Date.now() - startTime) / 1000).toFixed(2);

  console.log('\n======================================================================');
  console.log(' EMPIRICAL STRESS TEST EXECUTION SUMMARY');
  console.log('======================================================================');
  console.log(` Total Tests Executed: ${passCount + failCount}`);
  console.log(` Passed:               \x1b[32m${passCount}\x1b[0m`);
  console.log(` Failed:               \x1b[31m${failCount}\x1b[0m`);
  console.log(` Execution Time:       ${duration}s`);
  console.log('======================================================================');

  if (failCount > 0) {
    console.log('\n\x1b[31m[VERDICT: REJECT]\x1b[0m Milestone 3 failed empirical stress testing.');
    process.exit(1);
  } else {
    console.log('\n\x1b[32m[VERDICT: APPROVE]\x1b[0m Milestone 3 passed all empirical stress tests.');
    process.exit(0);
  }
}

main().catch(err => {
  console.error('Fatal test runner error:', err);
  process.exit(1);
});
