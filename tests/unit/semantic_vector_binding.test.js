/**
 * tests/unit/semantic_vector_binding.test.js
 *
 * Comprehensive unit test suite for Milestone M3 / R3:
 * Deterministic Semantic Vector Binding, Contextual currentColor Tinting & Catalog Generator.
 *
 * Covers 42 unit tests across 6 suites:
 * - Suite 1: Semantic Icon Classification & Name Extraction (8 tests)
 * - Suite 2: ClaudeIcons Catalog Generation (6 tests)
 * - Suite 3: Contextual currentColor Tint Binding (10 tests)
 * - Suite 4: Multi-Color Vector Preservation & Color.Unspecified (8 tests)
 * - Suite 5: Screen Generator Integration & AST Resolution (5 tests)
 * - Suite 6: Adversarial Boundaries & Edge Cases (5 tests)
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const { SvgParser, extractSemanticName, analyzeVectorColors: svgAnalyzeColors } = require('../../extractor/svg_parser');
const { extractSemanticIconName } = require('../../extractor/dom_walker');
const { VectorGenerator, toPascalCase, normalizeIconName, computeVectorFingerprint, analyzeVectorColors } = require('../../synthesizer/vector_generator');
const { ScreenGenerator, resolveIconVector, resolveContextualTint } = require('../../synthesizer/screen_generator');

// Helper to check Kotlin brace balancing
function assertKotlinBracesBalanced(kotlin) {
  let depth = 0;
  for (const char of kotlin) {
    if (char === '{') depth++;
    if (char === '}') depth--;
    assert.ok(depth >= 0, 'Negative brace depth in generated Kotlin code');
  }
  assert.equal(depth, 0, 'Unclosed braces in generated Kotlin code');
}

// Helper to check XML tag balancing
function assertXmlBalanced(xml) {
  const vectorOpen = (xml.match(/<vector[\s>]/g) || []).length;
  const vectorClose = (xml.match(/<\/vector>/g) || []).length;
  assert.equal(vectorOpen, vectorClose, 'Mismatched <vector> tags in XML');

  const pathOpen = (xml.match(/<path[\s\/>]/g) || []).length;
  assert.ok(pathOpen > 0, 'Must have at least one <path> in XML');
}

// =========================================================================
// Suite 1: Semantic Icon Classification & Name Extraction (8 tests)
// =========================================================================
describe('Suite 1: Semantic Icon Classification & Name Extraction', () => {

  test('Test 1.1: Lucide class extraction (e.g. "lucide lucide-file-plus" -> FilePlusIcon)', () => {
    const rawSvg = `<svg class="lucide lucide-file-plus" width="24" height="24" viewBox="0 0 24 24"><path d="M12 2v20M2 12h20"/></svg>`;
    const extracted = SvgParser.extractSemanticName(rawSvg);
    assert.equal(extracted, 'file-plus');

    const normalized = VectorGenerator.normalizeIconName(extracted);
    assert.equal(normalized, 'FilePlusIcon');
  });

  test('Test 1.2: Feather class extraction (e.g. "feather feather-chevron-down" -> ChevronDownIcon)', () => {
    const rawSvg = `<svg class="feather feather-chevron-down" width="24" height="24" viewBox="0 0 24 24"><polyline points="6 9 12 15 18 9"/></svg>`;
    const extracted = SvgParser.extractSemanticName(rawSvg);
    assert.equal(extracted, 'chevron-down');

    const normalized = VectorGenerator.normalizeIconName(extracted);
    assert.equal(normalized, 'ChevronDownIcon');
  });

  test('Test 1.3: Generic prefix class extraction (e.g. "icon-search" or "nav-icon-home")', () => {
    const rawSvg1 = `<svg class="icon-search" width="20" height="20" viewBox="0 0 20 20"><circle cx="10" cy="10" r="5"/></svg>`;
    const extracted1 = SvgParser.extractSemanticName(rawSvg1);
    assert.equal(extracted1, 'search');
    assert.equal(VectorGenerator.normalizeIconName(extracted1), 'SearchIcon');

    const rawSvg2 = `<svg class="nav-icon-home" width="20" height="20" viewBox="0 0 20 20"><path d="M0 0"/></svg>`;
    const extracted2 = SvgParser.extractSemanticName(rawSvg2);
    assert.equal(extracted2, 'home');
    assert.equal(VectorGenerator.normalizeIconName(extracted2), 'HomeIcon');
  });

  test('Test 1.4: Data attributes extraction ladder (data-lucide, data-feather, data-icon, data-name)', () => {
    // data-lucide
    const elLucide = { getAttribute: (k) => k === 'data-lucide' ? 'check-circle' : null };
    assert.equal(extractSemanticIconName(elLucide), 'check-circle');
    assert.equal(VectorGenerator.normalizeIconName(extractSemanticIconName(elLucide)), 'CheckCircleIcon');

    // data-feather
    const elFeather = { getAttribute: (k) => k === 'data-feather' ? 'settings' : null };
    assert.equal(extractSemanticIconName(elFeather), 'settings');
    assert.equal(VectorGenerator.normalizeIconName(extractSemanticIconName(elFeather)), 'SettingsIcon');

    // data-icon
    const elIcon = { getAttribute: (k) => k === 'data-icon' ? 'user-avatar' : null };
    assert.equal(extractSemanticIconName(elIcon), 'user-avatar');
    assert.equal(VectorGenerator.normalizeIconName(extractSemanticIconName(elIcon)), 'UserAvatarIcon');

    // data-name
    const elName = { getAttribute: (k) => k === 'data-name' ? 'menu-toggle' : null };
    assert.equal(extractSemanticIconName(elName), 'menu-toggle');
    assert.equal(VectorGenerator.normalizeIconName(extractSemanticIconName(elName)), 'MenuToggleIcon');
  });

  test('Test 1.5: Accessibility hints extraction (aria-label, <title>, <desc>)', () => {
    // aria-label on SVG element
    const elAria = { getAttribute: (k) => k === 'aria-label' ? 'Close dialog' : null };
    assert.equal(extractSemanticIconName(elAria), 'Close dialog');
    assert.equal(VectorGenerator.normalizeIconName(extractSemanticIconName(elAria)), 'CloseDialogIcon');

    // <title> inside SVG
    const rawSvgTitle = `<svg width="24" height="24"><title>Filter Results</title><path d="M0 0"/></svg>`;
    assert.equal(SvgParser.extractSemanticName(rawSvgTitle), 'Filter Results');
    assert.equal(VectorGenerator.normalizeIconName(SvgParser.extractSemanticName(rawSvgTitle)), 'FilterResultsIcon');

    // <desc> inside SVG
    const rawSvgDesc = `<svg width="24" height="24"><desc>Download receipt</desc><path d="M0 0"/></svg>`;
    assert.equal(SvgParser.extractSemanticName(rawSvgDesc), 'Download receipt');
    assert.equal(VectorGenerator.normalizeIconName(SvgParser.extractSemanticName(rawSvgDesc)), 'DownloadReceiptIcon');
  });

  test('Test 1.6: Enclosing button contextual extraction (button aria-label or button text)', () => {
    // Mock DOM hierarchy: button aria-label="Back" -> svg
    const mockBtnAria = {
      tagName: 'BUTTON',
      getAttribute: (k) => k === 'aria-label' ? 'Back' : null,
      innerText: ''
    };
    const elInBtnAria = {
      getAttribute: () => null,
      closest: (sel) => sel.includes('button') ? mockBtnAria : null,
      parentElement: mockBtnAria
    };
    assert.equal(extractSemanticIconName(elInBtnAria), 'Back');
    assert.equal(VectorGenerator.normalizeIconName(extractSemanticIconName(elInBtnAria)), 'BackIcon');

    // Mock DOM hierarchy: button with text "New Deployment" -> svg
    const mockBtnText = {
      tagName: 'BUTTON',
      getAttribute: () => null,
      innerText: 'New Deployment'
    };
    const elInBtnText = {
      getAttribute: () => null,
      closest: (sel) => sel.includes('button') ? mockBtnText : null,
      parentElement: mockBtnText
    };
    assert.equal(extractSemanticIconName(elInBtnText), 'New Deployment');
    assert.equal(VectorGenerator.normalizeIconName(extractSemanticIconName(elInBtnText)), 'NewDeploymentIcon');
  });

  test('Test 1.7: Kebab, snake, camelCase, and delimiter normalization', () => {
    assert.equal(VectorGenerator.normalizeIconName('my-custom-icon'), 'MyCustomIcon');
    assert.equal(VectorGenerator.normalizeIconName('user_profile_setting'), 'UserProfileSettingIcon');
    assert.equal(VectorGenerator.normalizeIconName('chevronDown'), 'ChevronDownIcon');
    assert.equal(VectorGenerator.normalizeIconName('new deployment'), 'NewDeploymentIcon');
    assert.equal(VectorGenerator.normalizeIconName('file-plus-icon'), 'FilePlusIcon');
    // Legacy compatibility: icon_1 -> Icon1Icon
    assert.equal(VectorGenerator.normalizeIconName('icon_1', 1), 'Icon1Icon');
  });

  test('Test 1.8: Name collision with distinct geometry produces disambiguated names', () => {
    const vec1 = {
      name: 'search',
      width: 24,
      height: 24,
      viewBox: { minX: 0, minY: 0, width: 24, height: 24 },
      paths: [{ d: 'M0 0 L10 10', stroke: '#000000' }]
    };
    const vec2 = {
      name: 'search',
      width: 24,
      height: 24,
      viewBox: { minX: 0, minY: 0, width: 24, height: 24 },
      paths: [{ d: 'M5 5 L20 20', stroke: '#000000' }] // Distinct geometry!
    };

    const code = VectorGenerator.generateImageVectorFile([vec1, vec2]);
    assert.ok(code.includes('val ClaudeIcons.SearchIcon: ImageVector'), 'First search vector has SearchIcon');
    assert.ok(code.includes('val ClaudeIcons.SearchIcon_2: ImageVector'), 'Second distinct search vector has SearchIcon_2');
    assertKotlinBracesBalanced(code);
  });
});

// =========================================================================
// Suite 2: ClaudeIcons Catalog Generation (6 tests)
// =========================================================================
describe('Suite 2: ClaudeIcons Catalog Generation', () => {

  test('Test 2.1: Generates public object ClaudeIcons singleton in Kotlin', () => {
    const vec = {
      name: 'home',
      width: 24,
      height: 24,
      paths: [{ d: 'M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z', fill: '#000000' }]
    };
    const code = VectorGenerator.generateImageVectorFile([vec]);

    assert.ok(code.includes('package com.claude.compose.icons'), 'Must have correct package');
    assert.ok(code.includes('public object ClaudeIcons'), 'Must declare public object ClaudeIcons');
    assert.ok(code.includes('import androidx.compose.ui.graphics.vector.ImageVector'), 'Must import ImageVector');
  });

  test('Test 2.2: Generates extension properties with backing fields', () => {
    const vec = {
      name: 'settings',
      width: 24,
      height: 24,
      paths: [{ d: 'M0 0 L24 24', stroke: '#000000' }]
    };
    const code = VectorGenerator.generateImageVectorFile([vec]);

    assert.ok(code.includes('private var _settingsIcon: ImageVector? = null') || code.includes('private var _settings: ImageVector? = null'), 'Must generate private backing property');
    assert.ok(code.includes('public val ClaudeIcons.SettingsIcon: ImageVector'), 'Must generate extension property on ClaudeIcons');
    assert.ok(code.includes('get() {'), 'Must generate getter');
  });

  test('Test 2.3: Escapes numeric-prefixed identifiers with backticks', () => {
    const vec1 = {
      name: '10k',
      width: 24,
      height: 24,
      paths: [{ d: 'M0 0 L10 10', stroke: '#000000' }]
    };
    const vec2 = {
      name: '3d-rotate',
      width: 24,
      height: 24,
      paths: [{ d: 'M1 1 L20 20', stroke: '#000000' }]
    };
    const code = VectorGenerator.generateImageVectorFile([vec1, vec2]);

    assert.ok(code.includes('`10kIcon`'), 'Must escape numeric 10kIcon with backticks');
    assert.ok(code.includes('`3dRotateIcon`'), 'Must escape numeric 3dRotateIcon with backticks');
    assertKotlinBracesBalanced(code);
  });

  test('Test 2.4: Ensures Kotlin brace balancing across all generated getters', () => {
    const vectors = [
      { name: 'user', width: 24, height: 24, paths: [{ d: 'M0 0' }] },
      { name: 'cart', width: 24, height: 24, paths: [{ d: 'M1 1' }] },
      { name: 'heart', width: 24, height: 24, paths: [{ d: 'M2 2' }] }
    ];
    const code = VectorGenerator.generateImageVectorFile(vectors);
    assertKotlinBracesBalanced(code);
  });

  test('Test 2.5: Identical geometry across multiple SVGs produces a single consolidated property', () => {
    const vecA = {
      name: 'chevron-down',
      width: 24,
      height: 24,
      viewBox: { minX: 0, minY: 0, width: 24, height: 24 },
      paths: [{ d: 'M6 9 L12 15 L18 9', stroke: '#000000' }]
    };
    const vecB = {
      name: 'chevron-down',
      width: 24,
      height: 24,
      viewBox: { minX: 0, minY: 0, width: 24, height: 24 },
      paths: [{ d: 'M6 9 L12 15 L18 9', stroke: '#000000' }] // Exactly identical!
    };

    const code = VectorGenerator.generateImageVectorFile([vecA, vecB]);
    const matches = code.match(/val ClaudeIcons\.ChevronDownIcon: ImageVector/g);
    assert.equal(matches.length, 1, 'Identical vectors must produce exactly one ImageVector property');
    assert.ok(!code.includes('ChevronDownIcon_2'), 'Should not generate unnecessary _2 duplicate');
  });

  test('Test 2.6: Matches Android VectorDrawable XML drawables alongside Compose ImageVector properties', () => {
    const vec = {
      name: 'battery-charging',
      width: 24,
      height: 24,
      viewBox: { minX: 0, minY: 0, width: 24, height: 24 },
      paths: [{ d: 'M0 0 L10 10', stroke: '#000000', strokeWidth: 2 }]
    };
    const xml = VectorGenerator.generateVectorDrawableXml(vec);

    assertXmlBalanced(xml);
    assert.ok(xml.includes('android:width="24dp"'), 'XML has correct width');
    assert.ok(xml.includes('android:height="24dp"'), 'XML has correct height');
    assert.ok(xml.includes('android:viewportWidth="24"'), 'XML has correct viewportWidth');
    assert.ok(xml.includes('android:viewportHeight="24"'), 'XML has correct viewportHeight');
    assert.ok(xml.includes('android:pathData="M0 0 L10 10"'), 'XML has pathData');
  });
});

// =========================================================================
// Suite 3: Contextual currentColor Tint Binding (8 tests)
// =========================================================================
describe('Suite 3: Contextual currentColor Tint Binding', () => {

  test('Test 3.1: Tagging isCurrentColor: true on fill="currentColor"', () => {
    const rawSvg = `<svg width="24" height="24"><path d="M0 0" fill="currentColor"/></svg>`;
    const parsed = SvgParser.parseSvgString(rawSvg);
    assert.equal(parsed.paths[0].isCurrentColor, true);
    assert.equal(parsed.paths[0].currentColorType, 'fill');
    assert.equal(parsed.hasCurrentColor, true);
  });

  test('Test 3.2: Tagging isCurrentColor: true on stroke="currentColor"', () => {
    const rawSvg = `<svg width="24" height="24"><path d="M0 0" fill="none" stroke="currentColor"/></svg>`;
    const parsed = SvgParser.parseSvgString(rawSvg);
    assert.equal(parsed.paths[0].isCurrentColor, true);
    assert.equal(parsed.paths[0].currentColorType, 'stroke');
    assert.equal(parsed.hasCurrentColor, true);
  });

  test('Test 3.3: DOM walker extracts contextual text color and tags hasCurrentColor: true', () => {
    const vectorData = {
      hasCurrentColor: true,
      contextualColor: '#1A1A1A',
      paths: [{ d: 'M0 0', isCurrentColor: true }]
    };
    const analysis = VectorGenerator.analyzeVectorColors(vectorData);
    assert.equal(analysis.hasCurrentColor, true);
    assert.equal(analysis.contextualColor, '#1A1A1A');
  });

  test('Test 3.4: Screen generator maps dark text color (#1A1A1A / #000000) to Os900', () => {
    const node1 = { style: { color: '#1a1a1a' } };
    assert.equal(resolveContextualTint(node1, {}, {}), 'Os900');

    const node2 = { style: { color: '#000000' } };
    assert.equal(resolveContextualTint(node2, {}, {}), 'Os900');

    const vectorData = { contextualColor: '#1A1A1A' };
    assert.equal(resolveContextualTint({}, {}, vectorData), 'Os900');
  });

  test('Test 3.5: Screen generator maps secondary text color (#535353 / #666666) to Os400', () => {
    const node = { style: { color: '#535353' } };
    assert.equal(resolveContextualTint(node, {}, {}), 'Os400');

    const parentCtx = { textColor: '#4d4c48' };
    assert.equal(resolveContextualTint({}, parentCtx, {}), 'Os400');
  });

  test('Test 3.6: Screen generator maps low-emphasis text color (#858585 / #999999) to Os300', () => {
    const node = { style: { color: '#858585' } };
    assert.equal(resolveContextualTint(node, {}, {}), 'Os300');

    const vectorData = { contextualColor: '#7d7a73' };
    assert.equal(resolveContextualTint({}, {}, vectorData), 'Os300');
  });

  test('Test 3.7: Screen generator maps light/white text color (#FFFFFF) to Color.White', () => {
    const node = { style: { color: '#ffffff' } };
    assert.equal(resolveContextualTint(node, {}, {}), 'Color.White');

    const parentDark = { isDarkContainer: true };
    assert.equal(resolveContextualTint({}, parentDark, {}), 'Color.White');
  });

  test('Test 3.8: Screen generator defaults unmapped currentColor to LocalContentColor.current', () => {
    // When no specific color is matched and it is not a dark container,
    // defaults to LocalContentColor.current (never hardcoded purple primary)
    const tint = resolveContextualTint({}, {}, { hasCurrentColor: true });
    assert.equal(tint, 'LocalContentColor.current');
  });

  test('Test 3.9: Single-tone currentColor icons in secondary (#535353) text containers resolve to Os400 (not Color.Unspecified)', () => {
    const rawSvg = `<svg width="24" height="24"><path d="M0 0 L10 10" stroke="currentColor" fill="none"/></svg>`;
    const parsed = SvgParser.parseSvgString(rawSvg, { color: '#535353' });

    assert.equal(parsed.isMultiColor, false, 'Single-tone currentColor icon must NOT be multi-color in secondary container');
    assert.equal(parsed.isMonochrome, true, 'Must be monochrome');
    assert.equal(parsed.hasCurrentColor, true, 'Must have currentColor flag');

    const tint = resolveContextualTint({ style: { color: '#535353' } }, {}, parsed);
    assert.equal(tint, 'Os400', 'Must resolve to Os400, never Color.Unspecified');
  });

  test('Test 3.10: Single-tone currentColor icons in tertiary (#858585) text containers resolve to Os300 (not Color.Unspecified)', () => {
    const rawSvg = `<svg width="24" height="24"><path d="M0 0 L10 10" stroke="currentColor" fill="none"/></svg>`;
    const parsed = SvgParser.parseSvgString(rawSvg, { color: '#858585' });

    assert.equal(parsed.isMultiColor, false, 'Single-tone currentColor icon must NOT be multi-color in tertiary container');
    assert.equal(parsed.isMonochrome, true, 'Must be monochrome');
    assert.equal(parsed.hasCurrentColor, true, 'Must have currentColor flag');

    const tint = resolveContextualTint({ style: { color: '#858585' } }, {}, parsed);
    assert.equal(tint, 'Os300', 'Must resolve to Os300, never Color.Unspecified');
  });
});

// =========================================================================
// Suite 4: Multi-Color Vector Preservation & Color.Unspecified (6 tests)
// =========================================================================
describe('Suite 4: Multi-Color Vector Preservation & Color.Unspecified', () => {

  test('Test 4.1: Vector with >= 2 distinct colors sets isMultiColor: true', () => {
    const vectorData = {
      paths: [
        { d: 'M0 0', fill: '#FF0000' },
        { d: 'M10 10', fill: '#00FF00' }
      ]
    };
    const analysis = VectorGenerator.analyzeVectorColors(vectorData);
    assert.equal(analysis.isMultiColor, true);
    assert.equal(analysis.isMonochrome, false);
  });

  test('Test 4.2: Two-tone vector (accent fill + currentColor) sets isMultiColor: true', () => {
    const rawSvg = `
      <svg width="24" height="24">
        <path d="M0 0" fill="#FF5722" />
        <path d="M5 5" stroke="currentColor" fill="none" />
      </svg>
    `;
    const parsed = SvgParser.parseSvgString(rawSvg);
    assert.equal(parsed.isMultiColor, true);
  });

  test('Test 4.3: LinearGradient / RadialGradient vectors set isMultiColor: true', () => {
    const rawSvg = `
      <svg width="24" height="24">
        <defs>
          <linearGradient id="grad1">
            <stop offset="0%" stop-color="#FFD700"/>
            <stop offset="100%" stop-color="#FFA500"/>
          </linearGradient>
        </defs>
        <path d="M0 0 L20 20" fill="url(#grad1)"/>
      </svg>
    `;
    const parsed = SvgParser.parseSvgString(rawSvg);
    assert.equal(parsed.isMultiColor, true);
  });

  test('Test 4.4: Screen generator resolves tint = Color.Unspecified for multi-color vectors', () => {
    const multiColorVec = {
      isMultiColor: true,
      paths: [
        { d: 'M0 0', fill: '#FF0000' },
        { d: 'M10 10', fill: '#00FF00' }
      ]
    };
    const tint = resolveContextualTint({}, {}, multiColorVec);
    assert.equal(tint, 'Color.Unspecified');
  });

  test('Test 4.5: Global tint clobbering prevention in generated screen code', () => {
    // Generate an Icon call for a multi-color vector
    const spec = {
      hierarchy: {
        id: 'root',
        componentType: 'Container',
        children: [
          {
            id: 'icon_badge',
            componentType: 'Icon',
            tag: 'svg',
            vectorName: 'gold-badge',
            vectorData: {
              isMultiColor: true,
              paths: [
                { d: 'M0 0', fill: '#FFD700' },
                { d: 'M5 5', fill: '#FFA500' }
              ]
            },
            style: {}
          }
        ]
      },
      vectors: [
        {
          name: 'gold-badge',
          width: 24,
          height: 24,
          isMultiColor: true,
          paths: [
            { d: 'M0 0', fill: '#FFD700' },
            { d: 'M5 5', fill: '#FFA500' }
          ]
        }
      ]
    };

    const screenCode = ScreenGenerator.generateScreenFile(spec, 'com.claude.compose');
    assert.ok(screenCode.includes('tint = Color.Unspecified'), 'Multi-color vector must emit tint = Color.Unspecified');
    assert.ok(!screenCode.includes('tint = MaterialTheme.colorScheme.primary'), 'Must NEVER clobber with purple primary');
  });

  test('Test 4.6: Monochrome single fill/stroke vector retains contextual tint (not Color.Unspecified)', () => {
    const monoVec = {
      isMultiColor: false,
      isMonochrome: true,
      paths: [
        { d: 'M0 0', fill: '#1A1A1A' }
      ]
    };
    const tint = resolveContextualTint({ style: { color: '#1a1a1a' } }, {}, monoVec);
    assert.equal(tint, 'Os900');
    assert.notEqual(tint, 'Color.Unspecified');
  });

  test('Test 4.7: Two-tone single compound path (stroke="currentColor" with explicit fill #FF0000) resolves to isMultiColor: true and Color.Unspecified', () => {
    // Two-tone on a single path element
    const rawSvg = `<svg width="24" height="24"><path d="M0 0 L10 10" stroke="currentColor" fill="#FF0000"/></svg>`;
    const parsed = SvgParser.parseSvgString(rawSvg, { color: '#1A1A1A' });

    assert.equal(parsed.isMultiColor, true, 'Compound path with currentColor stroke and accent fill MUST be multi-color');
    assert.equal(parsed.isMonochrome, false);
    assert.equal(parsed.hasCurrentColor, true);

    const tint = resolveContextualTint({ style: { color: '#1A1A1A' } }, {}, parsed);
    assert.equal(tint, 'Color.Unspecified', 'Must resolve to Color.Unspecified to avoid clobbering accent fill');

    // Also verify analyzeVectorColors on compound path directly
    const directAnalysis = VectorGenerator.analyzeVectorColors(parsed);
    assert.equal(directAnalysis.isMultiColor, true);
  });

  test('Test 4.8: Two-tone single compound path (fill="currentColor" with explicit stroke #0000FF) resolves to isMultiColor: true and Color.Unspecified', () => {
    const rawSvg = `<svg width="24" height="24"><path d="M0 0 L10 10" fill="currentColor" stroke="#0000FF"/></svg>`;
    const parsed = SvgParser.parseSvgString(rawSvg, { color: '#1A1A1A' });

    assert.equal(parsed.isMultiColor, true, 'Compound path with currentColor fill and accent stroke MUST be multi-color');
    assert.equal(parsed.isMonochrome, false);

    const tint = resolveContextualTint({ style: { color: '#1A1A1A' } }, {}, parsed);
    assert.equal(tint, 'Color.Unspecified');
  });
});

// =========================================================================
// Suite 5: Screen Generator Integration & AST Resolution (5 tests)
// =========================================================================
describe('Suite 5: Screen Generator Integration & AST Resolution', () => {

  test('Test 5.1: Resolves icon vector by vectorName matching catalog property', () => {
    const iconContext = {
      vectorList: [{ name: 'Search', propName: 'SearchIcon' }],
      vectorMap: new Map([['Search', 'SearchIcon'], ['SearchIcon', 'SearchIcon']])
    };
    const node = { vectorName: 'Search' };
    const resolved = resolveIconVector(node, iconContext);
    assert.equal(resolved, 'ClaudeIcons.SearchIcon');
  });

  test('Test 5.2: Resolves icon vector by vectorId or CSS class match in vectorMap', () => {
    const iconContext = {
      vectorList: [{ id: 'vector_42', propName: 'SettingsIcon' }],
      vectorMap: new Map([['vector_42', 'SettingsIcon'], ['lucide-settings', 'SettingsIcon']])
    };

    // Resolves by vectorId
    assert.equal(resolveIconVector({ vectorId: 'vector_42' }, iconContext), 'ClaudeIcons.SettingsIcon');

    // Resolves by class
    assert.equal(resolveIconVector({ class: 'lucide lucide-settings' }, iconContext), 'ClaudeIcons.SettingsIcon');
  });

  test('Test 5.3: Sequential index fallback when name is not found', () => {
    const iconContext = {
      vectorList: [{ propName: 'FirstIcon' }, { propName: 'SecondIcon' }],
      vectorMap: new Map()
    };
    const unmappedNode = { tagName: 'svg' };
    const resolved = resolveIconVector(unmappedNode, iconContext);
    assert.equal(resolved, 'ClaudeIcons.FirstIcon');
  });

  test('Test 5.4: Generates IconButton with contextual tint', () => {
    const spec = {
      hierarchy: {
        id: 'root',
        componentType: 'Container',
        children: [
          {
            id: 'btn_back',
            componentType: 'IconButton',
            tag: 'button',
            children: [
              {
                id: 'svg_back',
                componentType: 'Icon',
                tag: 'svg',
                vectorName: 'back',
                vectorData: { contextualColor: '#1a1a1a', hasCurrentColor: true },
                style: { color: '#1a1a1a' }
              }
            ],
            style: { color: '#1a1a1a' }
          }
        ]
      },
      vectors: [
        {
          name: 'back',
          width: 24,
          height: 24,
          paths: [{ d: 'M19 12H5', stroke: 'currentColor' }]
        }
      ]
    };

    const code = ScreenGenerator.generateScreenFile(spec, 'com.claude.compose');
    assert.ok(code.includes('AppIconButton('), 'Must generate AppIconButton');
    assert.ok(code.includes('tint = Os900'), 'IconButton must use Os900 tint');
  });

  test('Test 5.5: Generates standalone Icon composable for SVG with contextual tint', () => {
    const spec = {
      hierarchy: {
        id: 'root',
        componentType: 'Container',
        children: [
          {
            id: 'svg_info',
            componentType: 'Icon',
            tag: 'svg',
            vectorName: 'info-icon',
            vectorData: { contextualColor: '#858585' },
            style: { color: '#858585' }
          }
        ],
        style: {}
      },
      vectors: [
        {
          name: 'info-icon',
          width: 20,
          height: 20,
          paths: [{ d: 'M10 10', stroke: '#858585' }]
        }
      ]
    };

    const code = ScreenGenerator.generateScreenFile(spec, 'com.claude.compose');
    assert.ok(code.includes('Icon('), 'Must generate Icon');
    assert.ok(code.includes('tint = Os300'), 'Icon must use Os300 tint');
    assert.ok(code.includes('import androidx.compose.material3.LocalContentColor'), 'Must import LocalContentColor');
  });
});

// =========================================================================
// Suite 6: Adversarial Boundaries & Edge Cases (5 tests)
// =========================================================================
describe('Suite 6: Adversarial Boundaries & Edge Cases', () => {

  test('Test 6.1: Malformed SVG fill/stroke attributes handle gracefully without crashing', () => {
    const rawSvg = `
      <svg width="24" height="24">
        <path d="M0 0" fill="url(#nonexistent)" stroke="" stroke-width="invalid"/>
        <path d="M1 1" fill="not-a-color"/>
      </svg>
    `;
    assert.doesNotThrow(() => {
      const parsed = SvgParser.parseSvgString(rawSvg);
      assert.ok(parsed);
      const code = VectorGenerator.generateImageVectorFile([parsed]);
      assert.ok(code.includes('public object ClaudeIcons'));
    });
  });

  test('Test 6.2: Deeply nested <g> elements inheriting currentColor with leaf explicit colors', () => {
    const rawSvg = `
      <svg width="24" height="24">
        <g stroke="currentColor">
          <g transform="scale(1)">
            <path d="M0 0" fill="#FF0000"/>
            <path d="M5 5" fill="none"/>
          </g>
        </g>
      </svg>
    `;
    const parsed = SvgParser.parseSvgString(rawSvg);
    assert.equal(parsed.hasCurrentColor, true);
    assert.equal(parsed.isMultiColor, true);
  });

  test('Test 6.3: High-volume SVG list with duplicate geometries reuses catalog symbols without duplication', () => {
    const identicalVectors = [];
    for (let i = 0; i < 15; i++) {
      identicalVectors.push({
        id: `vec_${i + 1}`,
        name: `duplicate_icon_${i + 1}`,
        width: 24,
        height: 24,
        viewBox: { minX: 0, minY: 0, width: 24, height: 24 },
        paths: [{ d: 'M10 10 L20 20', stroke: '#000000' }]
      });
    }

    const code = VectorGenerator.generateImageVectorFile(identicalVectors);
    // Should deduplicate identical geometry so only 1 ImageVector property is generated
    const propMatches = code.match(/public val ClaudeIcons\.[A-Za-z0-9_]+: ImageVector/g) || [];
    assert.equal(propMatches.length, 1, `Expected exactly 1 consolidated ImageVector property, found ${propMatches.length}`);
  });

  test('Test 6.4: Empty or whitespace-only aria-labels/classes fallback safely to sequential identifiers', () => {
    const elEmpty = {
      getAttribute: (k) => {
        if (k === 'aria-label') return '   ';
        if (k === 'class') return '';
        return null;
      }
    };
    const extracted = extractSemanticIconName(elEmpty, 5);
    assert.equal(extracted, 'icon_5');
    assert.equal(VectorGenerator.normalizeIconName(extracted, 5), 'Icon5Icon');
  });

  test('Test 6.5: Full end-to-end screen synthesis produces syntactically valid Kotlin code with balanced braces and correct imports', () => {
    const spec = {
      hierarchy: {
        id: 'root',
        componentType: 'Container',
        children: [
          {
            id: 'heading',
            componentType: 'Text',
            tag: 'h1',
            text: 'Dashboard'
          },
          {
            id: 'btn_refresh',
            componentType: 'IconButton',
            tag: 'button',
            children: [
              {
                id: 'icon_refresh',
                componentType: 'Icon',
                tag: 'svg',
                vectorName: 'refresh',
                vectorData: { contextualColor: '#1a1a1a', hasCurrentColor: true }
              }
            ]
          },
          {
            id: 'icon_logo',
            componentType: 'Icon',
            tag: 'svg',
            vectorName: 'multicolor-logo',
            vectorData: { isMultiColor: true }
          }
        ]
      },
      vectors: [
        {
          name: 'refresh',
          width: 24,
          height: 24,
          paths: [{ d: 'M0 0 L10 10', stroke: 'currentColor' }]
        },
        {
          name: 'multicolor-logo',
          width: 32,
          height: 32,
          isMultiColor: true,
          paths: [
            { d: 'M0 0 L10 10', fill: '#FF0000' },
            { d: 'M10 10 L20 20', fill: '#0000FF' }
          ]
        }
      ]
    };

    const screenKotlin = ScreenGenerator.generateScreenFile(spec, 'com.claude.compose');
    assertKotlinBracesBalanced(screenKotlin);
    assert.ok(screenKotlin.includes('import com.claude.compose.icons.*'), 'Must import ClaudeIcons package');
    assert.ok(screenKotlin.includes('import androidx.compose.material3.LocalContentColor'), 'Must import LocalContentColor');
    assert.ok(screenKotlin.includes('ClaudeIcons.RefreshIcon'), 'Must reference RefreshIcon');
    assert.ok(screenKotlin.includes('ClaudeIcons.MulticolorLogoIcon'), 'Must reference MulticolorLogoIcon');
    assert.ok(screenKotlin.includes('tint = Os900'), 'Must use Os900 for refresh icon');
    assert.ok(screenKotlin.includes('tint = Color.Unspecified'), 'Must use Color.Unspecified for multicolor logo');
  });
});
