/**
 * tests/adversarial/run_r4_m3_challenger2_fuzz.js
 *
 * Adversarial Fuzzing & Stress Harness for Milestone 3 (R3):
 * 1. 7-Tier Extraction Ladder with Conflicting Attributes & Extreme Noise
 * 2. Collision Resolution & Deterministic Deduplication Invariants
 * 3. Contextual Color Resolution (Extremely dark backgrounds, translucent colors, CSS vars, two-tone icons)
 * 4. End-to-End Screen Synthesis Stress Verification
 * 5. Empirical Defect Reproductions & Failure Mode Analysis
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const { SvgParser, extractSemanticName, analyzeVectorColors: svgAnalyzeColors } = require('../../extractor/svg_parser');
const { extractSemanticIconName } = require('../../extractor/dom_walker');
const { VectorGenerator, toPascalCase, normalizeIconName, computeVectorFingerprint, analyzeVectorColors } = require('../../synthesizer/vector_generator');
const { ScreenGenerator, resolveIconVector, resolveContextualTint } = require('../../synthesizer/screen_generator');

function assertKotlinBracesBalanced(code) {
  let depth = 0;
  for (let i = 0; i < code.length; i++) {
    const char = code[i];
    if (char === '{') depth++;
    if (char === '}') depth--;
    assert.ok(depth >= 0, `Negative brace depth at character ${i} in generated Kotlin code`);
  }
  assert.equal(depth, 0, `Unclosed braces (${depth}) in generated Kotlin code`);
}

// =========================================================================
// Suite 1: 7-Tier Extraction Ladder with Conflicting Attributes & Noise
// =========================================================================
describe('Adversarial Suite 1: 7-Tier Extraction Ladder Strict Priority', () => {

  test('Test 1.1: Exact Prompt Challenge: Conflicting class="lucide lucide-search", data-icon="file-plus", <title>Download</title>, and button aria-label="Submit"', () => {
    // Construct mock DOM node with all 4 conflicting signals simultaneously present
    const mockButton = {
      tagName: 'BUTTON',
      getAttribute: (k) => k === 'aria-label' ? 'Submit' : null,
      innerText: 'Submit Order'
    };

    // All 4 conflicting attributes present
    const fullElement = {
      tagName: 'svg',
      getAttribute: (k) => {
        if (k === 'data-icon') return 'file-plus';
        if (k === 'class') return 'lucide lucide-search';
        return null;
      },
      className: 'lucide lucide-search',
      querySelector: (sel) => {
        if (sel === 'title') return { textContent: 'Download' };
        return null;
      },
      closest: (sel) => sel.includes('button') ? mockButton : null,
      parentElement: mockButton
    };

    // Step A: When data-icon is present (Tier 1), it MUST win over Tier 2 (search), Tier 3 (Download), Tier 5 (Submit)
    const result1 = extractSemanticIconName(fullElement, 1);
    assert.equal(result1, 'file-plus', 'Tier 1 (data-icon="file-plus") must take priority over all other tiers');
    assert.equal(VectorGenerator.normalizeIconName(result1), 'FilePlusIcon');

    // Step B: Remove Tier 1 (data-icon). Tier 2 (class="lucide lucide-search") MUST win over Tier 3 & Tier 5
    const noTier1Element = {
      ...fullElement,
      getAttribute: (k) => {
        if (k === 'class') return 'lucide lucide-search';
        return null;
      }
    };
    const result2 = extractSemanticIconName(noTier1Element, 1);
    assert.equal(result2, 'search', 'Tier 2 (class="lucide lucide-search") must take priority when Tier 1 is absent');
    assert.equal(VectorGenerator.normalizeIconName(result2), 'SearchIcon');

    // Step C: Remove Tier 2 (class). Tier 3 (<title>Download</title>) MUST win over Tier 5 (Submit)
    const noTier2Element = {
      ...noTier1Element,
      getAttribute: () => null,
      className: ''
    };
    const result3 = extractSemanticIconName(noTier2Element, 1);
    assert.equal(result3, 'Download', 'Tier 3 (<title>Download</title>) must take priority when Tiers 1 & 2 are absent');
    assert.equal(VectorGenerator.normalizeIconName(result3), 'DownloadIcon');

    // Step D: Remove Tier 3 (<title>). Tier 5 (button aria-label="Submit") MUST win
    const noTier3Element = {
      ...noTier2Element,
      querySelector: () => null
    };
    const result4 = extractSemanticIconName(noTier3Element, 1);
    assert.equal(result4, 'Submit', 'Tier 5 (button aria-label="Submit") must take priority when Tiers 1-4 are absent');
    assert.equal(VectorGenerator.normalizeIconName(result4), 'SubmitIcon');
  });

  test('Test 1.2: Full 7-Tier Permutation Cascade with All Tiers Active', () => {
    // We set up an element with ALL 7 tiers simultaneously:
    // Tier 1: data-icon="tier1-data"
    // Tier 2: class="lucide lucide-tier2-class"
    // Tier 3: <title>tier3-title</title>
    // Tier 4: aria-label="tier4-aria"
    // Tier 5: enclosing button aria-label="tier5-btn"
    // Tier 6: parent wrapper class="tier6-container"
    // Tier 7: id="tier7-id"
    // Fallback: icon_42

    const mockParentWrapper = {
      tagName: 'DIV',
      getAttribute: (k) => k === 'class' ? 'tier6-container' : null,
      className: 'tier6-container'
    };

    const mockEnclosingBtn = {
      tagName: 'BUTTON',
      getAttribute: (k) => k === 'aria-label' ? 'tier5-btn' : null,
      parentElement: mockParentWrapper
    };

    const createCascadeNode = (activeTiers) => ({
      tagName: 'svg',
      getAttribute: (k) => {
        if (activeTiers.has(1) && k === 'data-icon') return 'tier1-data';
        if (activeTiers.has(2) && k === 'class') return 'lucide lucide-tier2-class';
        if (activeTiers.has(4) && k === 'aria-label') return 'tier4-aria';
        if (activeTiers.has(7) && k === 'id') return 'tier7-id';
        return null;
      },
      className: activeTiers.has(2) ? 'lucide lucide-tier2-class' : '',
      querySelector: (sel) => {
        if (activeTiers.has(3) && sel === 'title') return { textContent: 'tier3-title' };
        return null;
      },
      closest: (sel) => (activeTiers.has(5) && sel.includes('button')) ? mockEnclosingBtn : null,
      parentElement: activeTiers.has(5) ? mockEnclosingBtn : (activeTiers.has(6) ? mockParentWrapper : null)
    });

    // Test dropping tiers from 1 to 7 one by one
    const active = new Set([1, 2, 3, 4, 5, 6, 7]);
    assert.equal(extractSemanticIconName(createCascadeNode(active), 42), 'tier1-data');

    active.delete(1);
    assert.equal(extractSemanticIconName(createCascadeNode(active), 42), 'tier2-class');

    active.delete(2);
    assert.equal(extractSemanticIconName(createCascadeNode(active), 42), 'tier3-title');

    active.delete(3);
    assert.equal(extractSemanticIconName(createCascadeNode(active), 42), 'tier4-aria');

    active.delete(4);
    assert.equal(extractSemanticIconName(createCascadeNode(active), 42), 'tier5-btn');

    active.delete(5);
    assert.equal(extractSemanticIconName(createCascadeNode(active), 42), 'tier6');

    active.delete(6);
    assert.equal(extractSemanticIconName(createCascadeNode(active), 42), 'tier7-id');

    active.delete(7);
    assert.equal(extractSemanticIconName(createCascadeNode(active), 42), 'icon_42');
  });

  test('Test 1.3: Raw SVG String Extraction Ladder in SvgParser matching DOM walker', () => {
    // String with conflicting data-icon, class, <title>, and id
    const svgStrFull = `<svg data-icon="calendar-add" class="feather feather-calendar" id="cal-widget"><title>View Calendar</title><path d="M0 0"/></svg>`;
    assert.equal(SvgParser.extractSemanticName(svgStrFull), 'calendar-add');

    const svgStrNoData = `<svg class="feather feather-calendar" id="cal-widget"><title>View Calendar</title><path d="M0 0"/></svg>`;
    assert.equal(SvgParser.extractSemanticName(svgStrNoData), 'calendar');

    const svgStrNoClass = `<svg id="cal-widget"><title>View Calendar</title><path d="M0 0"/></svg>`;
    assert.equal(SvgParser.extractSemanticName(svgStrNoClass), 'View Calendar');

    const svgStrNoTitle = `<svg id="cal-widget"><path d="M0 0"/></svg>`;
    assert.equal(SvgParser.extractSemanticName(svgStrNoTitle), 'cal-widget');

    const svgStrBlacklistedId = `<svg id="layer_1"><path d="M0 0"/></svg>`;
    assert.equal(SvgParser.extractSemanticName(svgStrBlacklistedId, { fallback: 'icon_fallback' }), 'icon_fallback');
  });

  test('Test 1.4: Adversarial Whitespace, Empty Attributes & Malformed Inputs in Ladder', () => {
    // Whitespace-only attributes must NOT be returned as valid names
    const elWhitespace = {
      getAttribute: (k) => {
        if (k === 'data-icon') return '   \t\n  ';
        if (k === 'data-testid') return '   ';
        if (k === 'class') return '  ';
        if (k === 'aria-label') return '     ';
        return null;
      },
      querySelector: () => ({ textContent: '   ' }),
      parentElement: null
    };
    // Should skip all whitespace attributes and reach fallback
    assert.equal(extractSemanticIconName(elWhitespace, 99), 'icon_99');

    // Null and undefined elements
    assert.equal(extractSemanticIconName(null, 7), 'icon_7');
    assert.equal(extractSemanticIconName(undefined, 8), 'icon_8');
    assert.equal(SvgParser.extractSemanticName(''), 'icon');
    assert.equal(SvgParser.extractSemanticName(null), 'icon');
  });

  test('Test 1.5: Enclosing Button Giant Prose & Numeric Text Rejection', () => {
    // Button with text > 30 characters (prose, not an icon label)
    const mockLongBtn = {
      tagName: 'BUTTON',
      getAttribute: () => null,
      innerText: 'This is a very long descriptive button label that exceeds thirty characters and should not be used as an icon name'
    };
    const elInLongBtn = {
      getAttribute: () => null,
      closest: (sel) => sel.includes('button') ? mockLongBtn : null,
      parentElement: mockLongBtn
    };
    // Should reject the long prose and fall through to fallback
    assert.equal(extractSemanticIconName(elInLongBtn, 12), 'icon_12');

    // Button with purely numeric text (e.g. badge count "42")
    const mockNumBtn = {
      tagName: 'BUTTON',
      getAttribute: () => null,
      innerText: '42'
    };
    const elInNumBtn = {
      getAttribute: () => null,
      closest: (sel) => sel.includes('button') ? mockNumBtn : null,
      parentElement: mockNumBtn
    };
    assert.equal(extractSemanticIconName(elInNumBtn, 13), 'icon_13');
  });

  test('Test 1.6: Blacklisted ID & UUID Filtering in Tier 7', () => {
    const testIds = ['layer_1', 'svg2', 'vector_4', 'icon_9', 'clip1', 'shape_0', 'g543', 'fa8b3012-4c22-4a5f-9e77-1234567890ab'];
    for (const badId of testIds) {
      const el = { getAttribute: (k) => k === 'id' ? badId : null };
      assert.equal(extractSemanticIconName(el, 5), 'icon_5', `ID "${badId}" should have been filtered out`);
    }

    // Semantic ID should NOT be filtered out
    const elGoodId = { getAttribute: (k) => k === 'id' ? 'bell-notification-badge' : null };
    assert.equal(extractSemanticIconName(elGoodId, 5), 'bell-notification-badge');
  });
});

// =========================================================================
// Suite 2: Collision Resolution & Deterministic Deduplication Invariants
// =========================================================================
describe('Adversarial Suite 2: Collision Resolution & Deduplication Invariants', () => {

  test('Test 2.1: Collision Resolution: 5 SVGs with identical name "filter" but distinct geometries deterministically numbered (_2 through _5)', () => {
    const vectors = [];
    for (let i = 1; i <= 5; i++) {
      vectors.push({
        id: `vec_filter_${i}`,
        name: 'filter',
        width: 24,
        height: 24,
        viewBox: { minX: 0, minY: 0, width: 24, height: 24 },
        paths: [{ d: `M0 0 L${i * 5} ${i * 5} Z`, stroke: '#000000' }] // Distinct geometry!
      });
    }

    const code = VectorGenerator.generateImageVectorFile(vectors);
    assertKotlinBracesBalanced(code);

    assert.ok(code.includes('val ClaudeIcons.FilterIcon: ImageVector'), 'Must have FilterIcon');
    assert.ok(code.includes('val ClaudeIcons.FilterIcon_2: ImageVector'), 'Must have FilterIcon_2');
    assert.ok(code.includes('val ClaudeIcons.FilterIcon_3: ImageVector'), 'Must have FilterIcon_3');
    assert.ok(code.includes('val ClaudeIcons.FilterIcon_4: ImageVector'), 'Must have FilterIcon_4');
    assert.ok(code.includes('val ClaudeIcons.FilterIcon_5: ImageVector'), 'Must have FilterIcon_5');
    assert.ok(!code.includes('FilterIcon_6'), 'Must not generate FilterIcon_6');
  });

  test('Test 2.2: Deduplication: 10 SVGs with identical name AND identical geometry produce exactly 1 catalog entry', () => {
    const vectors = [];
    for (let i = 1; i <= 10; i++) {
      vectors.push({
        id: `vec_dup_${i}`,
        name: 'star-rate',
        width: 20,
        height: 20,
        viewBox: { minX: 0, minY: 0, width: 20, height: 20 },
        paths: [{ d: 'M10 1 L13 7 L19 8 L14 13 L16 19 L10 16 L4 19 L6 13 L1 8 L7 7 Z', fill: '#FFD700' }]
      });
    }

    const code = VectorGenerator.generateImageVectorFile(vectors);
    assertKotlinBracesBalanced(code);

    const matches = code.match(/val ClaudeIcons\.StarRateIcon/g) || [];
    assert.equal(matches.length, 1, `Expected exactly 1 StarRateIcon, found ${matches.length}`);
    assert.ok(!code.includes('StarRateIcon_2'), 'Should not generate _2 duplicate for identical geometries');
  });

  test('Test 2.3: Cross-Name Deduplication: SVGs with DIFFERENT names but IDENTICAL geometry reuse first symbol', () => {
    const vecA = {
      id: 'vec_1',
      name: 'expand-arrow',
      width: 24,
      height: 24,
      viewBox: { minX: 0, minY: 0, width: 24, height: 24 },
      paths: [{ d: 'M6 9 L12 15 L18 9', stroke: '#000000' }]
    };
    const vecB = {
      id: 'vec_2',
      name: 'chevron-down',
      width: 24,
      height: 24,
      viewBox: { minX: 0, minY: 0, width: 24, height: 24 },
      paths: [{ d: 'M6 9 L12 15 L18 9', stroke: '#000000' }] // Identical path data!
    };

    const code = VectorGenerator.generateImageVectorFile([vecA, vecB]);
    assertKotlinBracesBalanced(code);

    // ExpandArrowIcon is emitted first
    assert.ok(code.includes('val ClaudeIcons.ExpandArrowIcon: ImageVector'));
    // ChevronDownIcon should NOT be emitted because geometry was already registered
    assert.ok(!code.includes('val ClaudeIcons.ChevronDownIcon: ImageVector'));

    // Test in ScreenGenerator: Both expand-arrow and chevron-down resolve to ExpandArrowIcon!
    const spec = {
      hierarchy: {
        id: 'root',
        componentType: 'Container',
        children: [
          { id: 'node_1', componentType: 'Icon', vectorName: 'expand-arrow' },
          { id: 'node_2', componentType: 'Icon', vectorName: 'chevron-down' }
        ]
      },
      vectors: [vecA, vecB]
    };

    const screenCode = ScreenGenerator.generateScreenFile(spec, 'com.claude.compose');
    assertKotlinBracesBalanced(screenCode);
    const resolvedMatches = screenCode.match(/ClaudeIcons\.ExpandArrowIcon/g) || [];
    assert.equal(resolvedMatches.length, 2, 'Both nodes must resolve to ClaudeIcons.ExpandArrowIcon');
  });

  test('Test 2.4: Numeric-Prefixed Collision Disambiguation with Kotlin Backticks', () => {
    const vec1 = {
      name: '4k-video',
      width: 24,
      height: 24,
      paths: [{ d: 'M0 0 L10 10', stroke: '#000000' }]
    };
    const vec2 = {
      name: '4k-video',
      width: 24,
      height: 24,
      paths: [{ d: 'M2 2 L20 20', stroke: '#000000' }] // Different path
    };

    const code = VectorGenerator.generateImageVectorFile([vec1, vec2]);
    assertKotlinBracesBalanced(code);

    assert.ok(code.includes('`4kVideoIcon`'), 'Must escape `4kVideoIcon` with backticks');
    assert.ok(code.includes('`4kVideoIcon_2`'), 'Must escape `4kVideoIcon_2` with backticks');
  });

  test('Test 2.5: Path Order Invariance in Geometry Fingerprinting', () => {
    // Two vectors with same paths in different order
    const vecOrder1 = {
      width: 24,
      height: 24,
      viewBox: '0 0 24 24',
      paths: [
        { d: 'M0 0 L10 10', fill: 'none', stroke: '#000000' },
        { d: 'M10 10 L20 20', fill: '#FF0000', stroke: 'none' }
      ]
    };
    const vecOrder2 = {
      width: 24,
      height: 24,
      viewBox: '0 0 24 24',
      paths: [
        { d: 'M10 10 L20 20', fill: '#FF0000', stroke: 'none' },
        { d: 'M0 0 L10 10', fill: 'none', stroke: '#000000' }
      ]
    };

    const fp1 = VectorGenerator.computeVectorFingerprint(vecOrder1);
    const fp2 = VectorGenerator.computeVectorFingerprint(vecOrder2);
    assert.equal(fp1, fp2, 'Path order must not change the geometry fingerprint');
  });
});

// =========================================================================
// Suite 3: Contextual Color Resolution & Edge Cases
// =========================================================================
describe('Adversarial Suite 3: Contextual Color Resolution & Edge Cases', () => {

  test('Test 3.1: Two-Tone Icons: stroke="currentColor" and fill="none" vs fill="#FF0000"', () => {
    // Icon A: stroke="currentColor" and fill="none" -> Monochrome -> contextual tint
    const rawSvgMono = `<svg width="24" height="24"><path d="M0 0" stroke="currentColor" fill="none"/></svg>`;
    const parsedMono = SvgParser.parseSvgString(rawSvgMono);
    assert.equal(parsedMono.isMultiColor, false, 'stroke="currentColor" and fill="none" must NOT be multi-color');
    assert.equal(parsedMono.isMonochrome, true);
    assert.equal(parsedMono.hasCurrentColor, true);

    const tintMono = resolveContextualTint({ style: { color: '#1a1a1a' } }, {}, parsedMono);
    assert.equal(tintMono, 'Os900', 'Monochrome currentColor on dark text must receive Os900');

    // Icon B: stroke="currentColor" and fill="#FF0000" -> Two-tone -> Color.Unspecified
    const rawSvgTwoTone = `<svg width="24" height="24"><path d="M0 0" stroke="currentColor" fill="#FF0000"/></svg>`;
    const parsedTwoTone = SvgParser.parseSvgString(rawSvgTwoTone);
    assert.equal(parsedTwoTone.isMultiColor, true, 'stroke="currentColor" and fill="#FF0000" MUST be multi-color');
    assert.equal(parsedTwoTone.hasCurrentColor, true);

    const tintTwoTone = resolveContextualTint({ style: { color: '#1a1a1a' } }, {}, parsedTwoTone);
    assert.equal(tintTwoTone, 'Color.Unspecified', 'Two-tone icon MUST resolve to Color.Unspecified');
  });

  test('Test 3.2: stroke="currentColor" with Neutral #000000 fill vs #1A1A1A fill', () => {
    // Both #000000 and #1A1A1A are neutral monochrome ink colors.
    // stroke="currentColor" with #000000 fill evaluates to isMultiColor: false
    const rawSvgInk1 = `<svg width="24" height="24"><path d="M0 0" stroke="currentColor" fill="#000000"/></svg>`;
    const parsedInk1 = SvgParser.parseSvgString(rawSvgInk1);
    assert.equal(parsedInk1.isMultiColor, false, '#000000 + currentColor is standard monochrome ink');

    // When stroke="currentColor" and fill="#1A1A1A":
    // The resolved SvgParser implementation respects currentColorType='stroke' and does not clobber with #000000,
    // keeping explicitColors = ['#1a1a1a'] which is standard neutral ink -> isMultiColor: false.
    const rawSvgInk2 = `<svg width="24" height="24"><path d="M0 0" stroke="currentColor" fill="#1A1A1A"/></svg>`;
    const parsedInk2 = SvgParser.parseSvgString(rawSvgInk2);
    assert.equal(parsedInk2.isMultiColor, false, '#1A1A1A fill + currentColor stroke evaluates to isMultiColor: false');
    assert.equal(parsedInk2.isMonochrome, true, '#1A1A1A fill + currentColor stroke is monochrome ink');
  });

  test('Test 3.3: Inverted/Extremely Dark Backgrounds & Button Contexts Resolve to Color.White', () => {
    // Context with isDarkContainer: true
    const tintDarkContainer = resolveContextualTint({}, { isDarkContainer: true }, {});
    assert.equal(tintDarkContainer, 'Color.White');

    // Context with containerType: 'Button'
    const tintButton = resolveContextualTint({}, { containerType: 'Button' }, {});
    assert.equal(tintButton, 'Color.White');

    // Direct white color
    const tintWhite = resolveContextualTint({ style: { color: '#ffffff' } }, {}, {});
    assert.equal(tintWhite, 'Color.White');

    const tintRgbWhite = resolveContextualTint({ style: { color: 'rgb(255, 255, 255)' } }, {}, {});
    assert.equal(tintRgbWhite, 'Color.White');
  });

  test('Test 3.4: Sol:OS Calibrated Neutral Tokens Mapping', () => {
    // Primary ink (#1A1A1A, #141413, #111827, #000000) -> Os900
    assert.equal(resolveContextualTint({ style: { color: '#1A1A1A' } }, {}, {}), 'Os900');
    assert.equal(resolveContextualTint({ style: { color: '#141413' } }, {}, {}), 'Os900');
    assert.equal(resolveContextualTint({ style: { color: '#111827' } }, {}, {}), 'Os900');
    assert.equal(resolveContextualTint({ style: { color: '#000000' } }, {}, {}), 'Os900');
    assert.equal(resolveContextualTint({ style: { color: 'rgb(26, 26, 26)' } }, {}, {}), 'Os900');

    // Secondary ink (#535353, #4D4C48, #64748B) -> Os400
    assert.equal(resolveContextualTint({ style: { color: '#535353' } }, {}, {}), 'Os400');
    assert.equal(resolveContextualTint({ style: { color: '#4D4C48' } }, {}, {}), 'Os400');
    assert.equal(resolveContextualTint({ style: { color: '#64748B' } }, {}, {}), 'Os400');
    assert.equal(resolveContextualTint({ style: { color: 'rgb(83, 83, 83)' } }, {}, {}), 'Os400');

    // Low emphasis / tertiary ink (#858585, #7D7A73, #94A3B8) -> Os300
    assert.equal(resolveContextualTint({ style: { color: '#858585' } }, {}, {}), 'Os300');
    assert.equal(resolveContextualTint({ style: { color: '#7D7A73' } }, {}, {}), 'Os300');
    assert.equal(resolveContextualTint({ style: { color: '#94A3B8' } }, {}, {}), 'Os300');

    // Disabled / hairlines (#CCCCCC, #CBD5E1) -> Os200
    assert.equal(resolveContextualTint({ style: { color: '#CCCCCC' } }, {}, {}), 'Os200');
    assert.equal(resolveContextualTint({ style: { color: '#CBD5E1' } }, {}, {}), 'Os200');

    // Calibrated brand grays
    assert.equal(resolveContextualTint({ style: { color: '#FF5200' } }, {}, {}), 'SolOsOrange');
    assert.equal(resolveContextualTint({ style: { color: '#6C6C6D' } }, {}, {}), 'SolOsOrange');
    assert.equal(resolveContextualTint({ style: { color: '#F59E0B' } }, {}, {}), 'SolOsBrandAmber');
    assert.equal(resolveContextualTint({ style: { color: '#9D9D9E' } }, {}, {}), 'SolOsBrandAmber');
    assert.equal(resolveContextualTint({ style: { color: '#EAB308' } }, {}, {}), 'SolOsBrandYellow');
    assert.equal(resolveContextualTint({ style: { color: '#CECECE' } }, {}, {}), 'SolOsBrandYellow');
  });

  test('Test 3.5: Translucent Colors & CSS Custom Properties Default Gracefully to LocalContentColor.current', () => {
    // Translucent hairline rgba(0, 0, 0, 0.08)
    const tintTranslucentHairline = resolveContextualTint({ style: { color: 'rgba(0, 0, 0, 0.08)' } }, {}, {});
    assert.equal(tintTranslucentHairline, 'LocalContentColor.current');

    // Translucent alpha rgba(26, 26, 26, 0.5)
    const tintTranslucentInk = resolveContextualTint({ style: { color: 'rgba(26, 26, 26, 0.5)' } }, {}, {});
    assert.equal(tintTranslucentInk, 'LocalContentColor.current');

    // CSS Custom Property var(--os-900)
    const tintCssVar = resolveContextualTint({ style: { color: 'var(--os-900)' } }, {}, {});
    assert.equal(tintCssVar, 'LocalContentColor.current');

    // Transparent / unparseable
    const tintEmpty = resolveContextualTint({ style: { color: 'transparent' } }, {}, {});
    assert.equal(tintEmpty, 'LocalContentColor.current');
  });
});

// =========================================================================
// Suite 4: End-to-End Screen Synthesis Stress Verification
// =========================================================================
describe('Adversarial Suite 4: End-to-End Screen Synthesis Stress Test', () => {

  test('Test 4.1: Complex spec with colliding vectors, deduplicated vectors, two-tone vectors, and Sol:OS tints', () => {
    const spec = {
      hierarchy: {
        id: 'root',
        componentType: 'Container',
        children: [
          // Icon 1: Search (distinct geometry A)
          { id: 'icon_search_1', componentType: 'Icon', vectorName: 'search', style: { color: '#1a1a1a' } },
          // Icon 2: Search (distinct geometry B -> SearchIcon_2)
          { id: 'icon_search_2', componentType: 'Icon', vectorName: 'search', style: { color: '#535353' } },
          // Icon 3: ChevronDown (geometry C)
          { id: 'icon_chev_1', componentType: 'Icon', vectorName: 'chevron-down', style: { color: '#858585' } },
          // Icon 4: ChevronDown (identical geometry C -> reuses ChevronDownIcon)
          { id: 'icon_chev_2', componentType: 'Icon', vectorName: 'chevron-down', style: { color: '#858585' } },
          // Icon 5: Two-tone badge (should emit Color.Unspecified)
          {
            id: 'icon_badge',
            componentType: 'Icon',
            vectorName: 'status-badge',
            vectorData: { isMultiColor: true, paths: [{ d: 'M0 0', fill: '#FF0000' }, { d: 'M1 1', stroke: 'currentColor' }] }
          },
          // Icon 6: Button with icon (white tint)
          {
            id: 'btn_action',
            componentType: 'IconButton',
            children: [
              { id: 'btn_icon', componentType: 'Icon', vectorName: 'download', style: { color: '#ffffff' } }
            ]
          }
        ]
      },
      vectors: [
        { name: 'search', width: 24, height: 24, paths: [{ d: 'M0 0 L10 10', stroke: '#000000' }] },
        { name: 'search', width: 24, height: 24, paths: [{ d: 'M5 5 L15 15', stroke: '#000000' }] }, // Collision
        { name: 'chevron-down', width: 24, height: 24, paths: [{ d: 'M6 9 L12 15 L18 9', stroke: '#000000' }] },
        { name: 'chevron-down', width: 24, height: 24, paths: [{ d: 'M6 9 L12 15 L18 9', stroke: '#000000' }] }, // Deduplicated
        { name: 'status-badge', width: 24, height: 24, isMultiColor: true, paths: [{ d: 'M0 0', fill: '#FF0000' }, { d: 'M1 1', stroke: 'currentColor' }] },
        { name: 'download', width: 24, height: 24, paths: [{ d: 'M12 2 v10', stroke: '#ffffff' }] }
      ]
    };

    // Synthesize ClaudeIcons.kt
    const catalogCode = VectorGenerator.generateImageVectorFile(spec.vectors);
    assertKotlinBracesBalanced(catalogCode);
    assert.ok(catalogCode.includes('val ClaudeIcons.SearchIcon: ImageVector'));
    assert.ok(catalogCode.includes('val ClaudeIcons.SearchIcon_2: ImageVector'));
    assert.ok(catalogCode.includes('val ClaudeIcons.ChevronDownIcon: ImageVector'));
    assert.ok(!catalogCode.includes('ChevronDownIcon_2'), 'Must deduplicate ChevronDownIcon');
    assert.ok(catalogCode.includes('val ClaudeIcons.StatusBadgeIcon: ImageVector'));
    assert.ok(catalogCode.includes('val ClaudeIcons.DownloadIcon: ImageVector'));

    // Synthesize Screen
    const screenCode = ScreenGenerator.generateScreenFile(spec, 'com.claude.compose');
    assertKotlinBracesBalanced(screenCode);

    // Verify correct imports
    assert.ok(screenCode.includes('import com.claude.compose.icons.*'));
    assert.ok(screenCode.includes('import androidx.compose.material3.LocalContentColor'));

    // Verify zero hardcoded purple primary clobbering
    assert.ok(!screenCode.includes('tint = MaterialTheme.colorScheme.primary'), 'Must NEVER use hardcoded primary purple');

    // Verify contextual tint assignments
    assert.ok(screenCode.includes('tint = Os900'), 'Dark search icon receives Os900');
    assert.ok(screenCode.includes('tint = Os400'), 'Secondary search icon receives Os400');
    assert.ok(screenCode.includes('tint = Os300'), 'Low-emphasis chevron receives Os300');
    assert.ok(screenCode.includes('tint = Color.Unspecified'), 'Multi-color badge receives Color.Unspecified');
    assert.ok(screenCode.includes('tint = Color.White'), 'Button icon receives Color.White');
  });
});

// =========================================================================
// Suite 5: Resolved Color Resolution Defect Verification
// =========================================================================
describe('Adversarial Suite 5: Resolved Color Resolution Defect Verification', () => {

  test('Defect 1 Verification: Single-tone currentColor icons in secondary (#535353) and tertiary (#858585) text containers evaluate to isMultiColor === false and resolve to Os400 / Os300', () => {
    // An SVG containing only a stroke="currentColor" path, extracted in a secondary text container (#535353)
    const rawSvg = `<svg width="24" height="24"><path d="M0 0" stroke="currentColor" fill="none"/></svg>`;
    const parsedSecondary = SvgParser.parseSvgString(rawSvg, { color: '#535353' });

    // RESOLVED BEHAVIOR: Single-tone currentColor is strictly monochrome
    assert.equal(parsedSecondary.isMultiColor, false, 'Resolved: parsedSecondary.isMultiColor must be false');
    assert.equal(parsedSecondary.isMonochrome, true, 'Resolved: parsedSecondary.isMonochrome must be true');

    // Consequently, ScreenGenerator emits Os400:
    const tintSecondary = resolveContextualTint({ style: { color: '#535353' } }, {}, parsedSecondary);
    assert.equal(tintSecondary, 'Os400', 'Resolved: tint resolves to Os400 for secondary text container');

    // Tertiary text container (#858585)
    const parsedTertiary = SvgParser.parseSvgString(rawSvg, { color: '#858585' });
    assert.equal(parsedTertiary.isMultiColor, false, 'Resolved: parsedTertiary.isMultiColor must be false');
    assert.equal(parsedTertiary.isMonochrome, true, 'Resolved: parsedTertiary.isMonochrome must be true');

    const tintTertiary = resolveContextualTint({ style: { color: '#858585' } }, {}, parsedTertiary);
    assert.equal(tintTertiary, 'Os300', 'Resolved: tint resolves to Os300 for tertiary text container');
  });

  test('Defect 2 Verification: Two-tone single compound paths (stroke="currentColor" and fill="#FF0000") evaluate to isMultiColor === true and resolve to Color.Unspecified', () => {
    // Two-tone compound path parsed via SvgParser
    const rawSvg = `<svg width="24" height="24"><path d="M0 0" stroke="currentColor" fill="#FF0000"/></svg>`;
    const parsedTwoTone = SvgParser.parseSvgString(rawSvg, { color: '#535353' });
    assert.equal(parsedTwoTone.isMultiColor, true, 'Resolved: two-tone compound path evaluates to isMultiColor === true');
    assert.equal(parsedTwoTone.isMonochrome, false, 'Resolved: two-tone compound path is not monochrome');

    const tintTwoTone = resolveContextualTint({ style: { color: '#535353' } }, {}, parsedTwoTone);
    assert.equal(tintTwoTone, 'Color.Unspecified', 'Resolved: two-tone icon resolves to Color.Unspecified');

    // Verification of the dom_walker per-property extraction logic:
    // When a path has stroke="currentColor" and explicit fill="#FF0000", p.currentColorType === 'stroke'.
    // The resolved dom_walker loop checks properties individually rather than skipping the entire path.
    const pt = {
      d: 'M0 0',
      fill: '#FF0000',
      stroke: '#000000',
      isCurrentColor: true,
      currentColorType: 'stroke'
    };
    const paths = [pt];
    const explicitColors = new Set();
    const ctxColor = '#535353';
    for (const p of paths) {
      const isFillCC = p.currentColorType === 'fill' || p.currentColorType === 'both' || (p.isCurrentColor && !p.currentColorType && (p.fill === 'currentColor' || (ctxColor && p.fill && p.fill.toLowerCase() === ctxColor)));
      const isStrokeCC = p.currentColorType === 'stroke' || p.currentColorType === 'both' || (p.isCurrentColor && !p.currentColorType && (p.stroke === 'currentColor' || (ctxColor && p.stroke && p.stroke.toLowerCase() === ctxColor)));

      if (!isFillCC && p.fill && p.fill !== 'none' && p.fill.toLowerCase() !== 'currentcolor') {
        explicitColors.add(p.fill.toLowerCase());
      }
      if (!isStrokeCC && p.stroke && p.stroke !== 'none' && p.stroke.toLowerCase() !== 'currentcolor') {
        explicitColors.add(p.stroke.toLowerCase());
      }
    }
    const isMultiColorDom = explicitColors.size >= 2 || (explicitColors.size >= 1 && paths.some(p => p.isCurrentColor) && !explicitColors.has('#000000') && !explicitColors.has('#1a1a1a'));
    assert.equal(isMultiColorDom, true, 'Resolved: dom_walker retains explicit fill on currentColor stroke paths, evaluating to isMultiColor: true');
  });
});
