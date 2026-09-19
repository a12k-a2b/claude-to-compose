/**
 * Additional Empirical Stress Test Harness for Extractor and Synthesizer
 * Challenger 1 - Milestone M6 Round 2
 */

const assert = require('assert');
const { SpecBuilder } = require('../../extractor/spec_builder');
const { SvgParser } = require('../../extractor/svg_parser');
const { TokenGenerator, cssColorToCompose, formatSp, generateColorFile, generateTypeFile, generateShapeFile, generateThemeFile } = require('../../synthesizer/token_generator');
const { sanitizeIdentifier } = require('../../synthesizer/component_generator');
const { extractInteractiveStates, translateNode, generateScreenFile } = require('../../synthesizer/screen_generator');
const { VectorGenerator } = require('../../synthesizer/vector_generator');
const { MotionGenerator } = require('../../synthesizer/motion_generator');
const { SynthesizerOrchestrator } = require('../../synthesizer/index');

let totalTests = 0;
let passedTests = 0;
let failedTests = [];

function test(name, fn) {
  totalTests++;
  try {
    fn();
    passedTests++;
    console.log(`[PASS] ${name}`);
  } catch (err) {
    failedTests.push({ name, error: err.message, stack: err.stack });
    console.error(`[FAIL] ${name}: ${err.message}`);
  }
}

console.log('=== RUNNING EMPIRICAL CHALLENGER STRESS HARNESS ===');

// --- Category 1: SpecBuilder & Hierarchy Sanitization ---

test('SpecBuilder handles undefined and empty options to buildSpec', () => {
  const sb = new SpecBuilder();
  const s1 = sb.buildSpec();
  assert.ok(s1 && s1.metadata && s1.viewports && s1.theme);
  const s2 = sb.buildSpec({});
  assert.ok(s2 && s2.metadata && s2.viewports && s2.theme);
  const s3 = sb.buildSpec({ metadata: null, viewports: null, vectorAssets: null });
  assert.ok(s3 && s3.metadata && s3.viewports && s3.theme);
});

test('SpecBuilder strips nested NaN and Infinity from layout and style', () => {
  const sb = new SpecBuilder();
  const hierarchy = {
    id: 'root',
    type: 'box',
    layout: {
      gap: Infinity,
      padding: { top: NaN, bottom: -Infinity, left: 16, right: 16 },
      width: Infinity
    },
    style: {
      borderRadius: NaN,
      opacity: Infinity,
      backgroundColor: '#ffffff'
    },
    children: [
      {
        id: 'child1',
        type: 'text',
        layout: { gap: NaN, margin: { top: Infinity } },
        style: { fontSize: NaN },
        children: []
      }
    ]
  };

  const spec = sb.buildSpec({ domHierarchy: hierarchy });
  const jsonStr = JSON.stringify(spec);
  // Ensure no null values replaced Infinity in layout/style
  const parsed = JSON.parse(jsonStr);
  assert.strictEqual(parsed.hierarchy.layout.gap, undefined);
  assert.strictEqual(parsed.hierarchy.layout.width, undefined);
  assert.strictEqual(parsed.hierarchy.layout.padding.top, undefined);
  assert.strictEqual(parsed.hierarchy.layout.padding.bottom, undefined);
  assert.strictEqual(parsed.hierarchy.layout.padding.left, 16);
  assert.strictEqual(parsed.hierarchy.style.borderRadius, undefined);
  assert.strictEqual(parsed.hierarchy.children[0].layout.gap, undefined);

  // Validate against Draft 2020-12 schema
  const val = sb.validate(parsed);
  assert.strictEqual(val.valid, true, `Validation failed: ${val.errors ? val.errors.join(', ') : ''}`);
});

// --- Category 2: Color and Unit Normalization ---

test('cssColorToCompose handles diverse invalid and edge-case color strings safely', () => {
  assert.strictEqual(cssColorToCompose('#12'), 'Color(0xFF000000)');
  assert.strictEqual(cssColorToCompose('#12345'), 'Color(0xFF000000)');
  assert.strictEqual(cssColorToCompose('#1234567'), 'Color(0xFF000000)');
  assert.strictEqual(cssColorToCompose('#xyz'), 'Color(0xFF000000)');
  assert.strictEqual(cssColorToCompose('random-string'), 'Color(0xFF000000)');
  assert.strictEqual(cssColorToCompose(''), 'Color.Unspecified');
  assert.strictEqual(cssColorToCompose(null), 'Color.Unspecified');
  assert.strictEqual(cssColorToCompose(undefined), 'Color.Unspecified');
  // Clamping check on rgba
  assert.strictEqual(cssColorToCompose('rgba(999, 999, 999, 2.0)'), 'Color(0xFFFFFFFF)');
  // Valid hex 3, 6, 8
  assert.strictEqual(cssColorToCompose('#abc'), 'Color(0xFFAABBCC)');
  assert.strictEqual(cssColorToCompose('#aabbcc'), 'Color(0xFFAABBCC)');
  assert.strictEqual(cssColorToCompose('#11223344'), 'Color(0x44112233)');
});

test('formatSp sanitizes non-finite, negative, zero, and standard numbers', () => {
  assert.strictEqual(formatSp(NaN), '0.sp');
  assert.strictEqual(formatSp(Infinity), '0.sp');
  assert.strictEqual(formatSp(-Infinity), '0.sp');
  assert.strictEqual(formatSp(null), '0.sp');
  assert.strictEqual(formatSp(undefined), '0.sp');
  assert.strictEqual(formatSp(0), '0.sp');
  assert.strictEqual(formatSp(-0.5), '(-0.5).sp');
  assert.strictEqual(formatSp(16), '16.sp');
  assert.strictEqual(formatSp(14.5), '14.5.sp');
});

// --- Category 3: TokenGenerator Defensive Null Guards ---

test('TokenGenerator methods survive null / undefined theme and options', () => {
  const colorCode = generateColorFile(null, 'com.example');
  assert.ok(colorCode.includes('val PrimaryIndigo = Color(0xFF4F46E5)'));

  const typoCode = generateTypeFile(null, 'com.example');
  assert.ok(typoCode.includes('package com.example.theme'));

  const shapeCode = generateShapeFile(null, 'com.example');
  assert.ok(shapeCode.includes('val ClaudeShapes = Shapes('));

  const themeCode = generateThemeFile(null, 'com.example');
  assert.ok(themeCode.includes('package com.example.theme'));
});

// --- Category 4: SvgParser Robustness ---

test('SvgParser handles malformed polyline and polygon coordinate pairs', () => {
  const svg1 = '<svg><polyline points="10,20 30"/></svg>';
  const res1 = SvgParser.parseSvgString(svg1);
  assert.ok(res1.paths.length === 1);
  assert.strictEqual(res1.paths[0].d.includes('undefined'), false);
  assert.strictEqual(res1.paths[0].d, 'M 10,20');

  const svg2 = '<svg><polygon points="5 15 25 35 45"/></svg>';
  const res2 = SvgParser.parseSvgString(svg2);
  assert.ok(res2.paths.length === 1);
  assert.strictEqual(res2.paths[0].d.includes('undefined'), false);
  assert.strictEqual(res2.paths[0].d, 'M 5,15 L 25,35 Z');
});

test('SvgParser handles negative and non-numeric rect radii', () => {
  const svg = '<svg><rect x="0" y="0" width="50" height="50" rx="-10" ry="foo"/></svg>';
  const res = SvgParser.parseSvgString(svg);
  assert.ok(res.paths.length === 1);
  assert.strictEqual(res.paths[0].d.includes('--'), false);
  assert.strictEqual(res.paths[0].d.includes('NaN'), false);
});

test('SvgParser falls back on auto and missing dimension attributes', () => {
  const svg = '<svg width="auto" height="auto"><path d="M0,0 L10,10"/></svg>';
  const res = SvgParser.parseSvgString(svg, { width: 32, height: 32 });
  assert.strictEqual(res.viewBox, '0 0 32 32');
  assert.strictEqual(res.width, 32);
  assert.strictEqual(res.height, 32);
});

// --- Category 5: Identifier Sanitization & Kotlin Keywords ---

test('sanitizeIdentifier protects against leading digits, Kotlin keywords, and symbols', () => {
  assert.strictEqual(sanitizeIdentifier('123button'), '`123button`');
  assert.strictEqual(sanitizeIdentifier('class'), '`class`');
  assert.strictEqual(sanitizeIdentifier('fun'), '`fun`');
  assert.strictEqual(sanitizeIdentifier('val'), '`val`');
  assert.strictEqual(sanitizeIdentifier('var'), '`var`');
  assert.strictEqual(sanitizeIdentifier('object'), '`object`');
  assert.strictEqual(sanitizeIdentifier('$$special$$'), 'special');
  assert.strictEqual(sanitizeIdentifier(''), 'item');
  assert.strictEqual(sanitizeIdentifier(null), 'item');
  assert.strictEqual(sanitizeIdentifier('---'), 'item');
});

// --- Category 6: MotionGenerator Validation ---

test('MotionGenerator validates parameters against non-finite values', () => {
  assert.throws(() => MotionGenerator.validateSpringParams(NaN, 50), /InvalidSpringParamsError/);
  assert.throws(() => MotionGenerator.validateSpringParams(0.5, Infinity), /InvalidSpringParamsError/);
  assert.throws(() => MotionGenerator.validateSpringParams(-1, 50), /InvalidSpringParamsError/);
  assert.strictEqual(MotionGenerator.validateSpringParams(0.75, 300), true);

  assert.throws(() => MotionGenerator.validateTargetDimensions(NaN, 48), /ZeroDimensionTargetError/);
  assert.throws(() => MotionGenerator.validateTargetDimensions(48, -1), /ZeroDimensionTargetError/);
  assert.throws(() => MotionGenerator.validateTargetDimensions(0, 48), /ZeroDimensionTargetError/);
  assert.strictEqual(MotionGenerator.validateTargetDimensions(48, 48), true);

  assert.strictEqual(MotionGenerator.resolveAnimationSpec(NaN), 'snap()');
  assert.strictEqual(MotionGenerator.resolveAnimationSpec(-50), 'snap()');
  assert.strictEqual(MotionGenerator.resolveAnimationSpec(Infinity), 'snap()');
  assert.ok(MotionGenerator.resolveAnimationSpec(300).includes('durationMillis = 300'));
});

// --- Category 7: VectorGenerator Robustness ---

test('VectorGenerator getSafeVectorDimensions guards against null and malformed viewBox', () => {
  const d1 = VectorGenerator.getSafeVectorDimensions(null);
  assert.strictEqual(d1.width, 24);
  assert.strictEqual(d1.height, 24);

  const d2 = VectorGenerator.getSafeVectorDimensions({ viewBox: '0 0 -50 -50' });
  assert.strictEqual(d2.viewportWidth, 24);

  const d3 = VectorGenerator.getSafeVectorDimensions({ width: 'invalid', height: null, viewBox: '0 0 24 24' });
  assert.strictEqual(d3.viewportWidth, 24);
  assert.strictEqual(d3.viewportHeight, 24);
});

test('VectorGenerator handles vector lists with nulls and numeric names', () => {
  const vectors = [
    null,
    { name: '99_bottles_icon', paths: [{ d: 'M0,0 L10,10', fill: '#000000' }, null] },
    undefined,
    { name: 'class', paths: [{ d: 'M1,1 L2,2' }] }
  ];
  const code = VectorGenerator.generateImageVectorFile(vectors, { packageName: 'com.test' });
  assert.ok(code.includes('public val ClaudeIcons.`99BottlesIcon`: ImageVector'));
  assert.ok(code.includes('public val ClaudeIcons.ClassIcon: ImageVector'));
  assert.ok(code.includes('package com.test'));

  // Vector Drawable XML
  const xml = VectorGenerator.generateVectorDrawableXml(vectors[1]);
  assert.ok(xml.includes('<vector xmlns:android='));
  assert.ok(xml.includes('android:pathData="M0,0 L10,10"'));
});

// --- Category 8: ScreenGenerator State Extraction & Translation ---

test('ScreenGenerator extracts state variables without internal backticks on keywords', () => {
  const root = {
    id: 'n1',
    name: 'class',
    componentType: 'Checkbox',
    children: [
      { id: 'n2', name: 'val', componentType: 'textfield', children: [] },
      { id: 'n3', name: 'when', componentType: 'switch', children: [] }
    ]
  };
  const states = extractInteractiveStates(root);
  assert.strictEqual(states.length, 3);
  assert.strictEqual(states[0].varName, 'isClassChecked');
  assert.strictEqual(states[1].varName, 'valText');
  assert.strictEqual(states[2].varName, 'isWhenEnabled');
});

test('ScreenGenerator synthesizes Switch and Chip nodes without dropping them', () => {
  const switchNode = { id: 'sw1', componentType: 'Switch', tag: 'div', children: [] };
  const switchOutput = translateNode(switchNode, '  ', { sw1: { varName: 'isToggled' } });
  assert.ok(switchOutput.includes('Switch('));
  assert.ok(switchOutput.includes('checked = isToggled'));

  const chipNode = { id: 'ch1', componentType: 'Chip', tag: 'div', text: 'Filter Active', children: [] };
  const chipOutput = translateNode(chipNode, '  ', {});
  assert.ok(chipOutput.includes('AppFilterChip('));
  assert.ok(chipOutput.includes('label = "Filter Active"'));
});

test('generateScreenFile generates full valid Composable screen file', () => {
  const spec = {
    metadata: { title: 'Test Screen' },
    hierarchy: {
      id: 'root',
      componentType: 'box',
      children: [
        { id: 'c1', componentType: 'Switch', name: 'notifications' },
        { id: 'c2', componentType: 'Chip', text: 'Mobile' },
        { id: 'c3', componentType: 'Checkbox', name: 'terms' }
      ]
    }
  };
  const screenCode = generateScreenFile(spec, 'com.example');
  assert.ok(screenCode.includes('package com.example.screen'));
  assert.ok(screenCode.includes('fun ClaudeDesignScreen('));
  assert.ok(screenCode.includes('Switch('));
  assert.ok(screenCode.includes('AppFilterChip('));
  assert.ok(screenCode.includes('Checkbox('));
});

console.log('\n=== CHALLENGER HARNESS COMPLETE ===');
console.log(`Total: ${totalTests} | Passed: ${passedTests} | Failed: ${failedTests.length}`);

if (failedTests.length > 0) {
  console.error('\nFAILED TESTS:');
  failedTests.forEach(f => console.error(`- ${f.name}: ${f.error}`));
  process.exit(1);
} else {
  console.log('ALL ADVERSARIAL STRESS SCENARIOS PASSED WITH ZERO GAPS!');
  process.exit(0);
}
