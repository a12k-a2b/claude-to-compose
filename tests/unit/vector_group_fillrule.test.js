/**
 * tests/unit/vector_group_fillrule.test.js
 * Comprehensive unit test suite for Milestone M2 / R2:
 * Hierarchical Compose group() & Fill-Rule DSL Synthesizer.
 * Covers 32 unit tests across 6 suites verifying Compose ImageVector DSL,
 * Android VectorDrawable XML drawables, fill-rule cascading, and skew baking.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const { SvgParser } = require('../../extractor/svg_parser');
const { VectorGenerator } = require('../../synthesizer/vector_generator');

// Helper to check XML tag balancing
function assertXmlBalanced(xml) {
  const vectorOpen = (xml.match(/<vector[\s>]/g) || []).length;
  const vectorClose = (xml.match(/<\/vector>/g) || []).length;
  assert.equal(vectorOpen, vectorClose, 'Mismatched <vector> tags in XML');

  const groupOpen = (xml.match(/<group[\s>]/g) || []).length;
  const groupClose = (xml.match(/<\/group>/g) || []).length;
  assert.equal(groupOpen, groupClose, 'Mismatched <group> tags in XML');
}

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

describe('Suite 1: Compose group() DSL Hierarchical Generation', () => {
  test('Test 1.1: Single-level group DSL generation', () => {
    const rawSvg = `
      <svg width="24" height="24" viewBox="0 0 24 24">
        <g id="singleGroup" transform="translate(10, 20)">
          <path d="M 0 0 L 10 10" stroke="#000" />
        </g>
      </svg>
    `;
    const parsed = SvgParser.parseSvgString(rawSvg);
    const code = VectorGenerator.generateImageVectorFile([parsed]);

    assert.ok(code.includes('import androidx.compose.ui.graphics.vector.group'), 'Must import Compose group');
    assert.ok(code.includes('group('), 'Must emit group(');
    assert.ok(code.includes('name = "singleGroup"'), 'Must emit group name');
    assert.ok(code.includes('translationX = 10f'), 'Must emit translationX = 10f');
    assert.ok(code.includes('translationY = 20f'), 'Must emit translationY = 20f');
    assert.ok(!code.includes('rotation ='), 'Must NOT emit rotation (parameter is rotate)');
    assertKotlinBracesBalanced(code);
  });

  test('Test 1.2: Two-level nested groups (parent + child group)', () => {
    const rawSvg = `
      <svg width="24" height="24">
        <g id="parentGroup" transform="translate(10, 20)">
          <g id="childGroup" transform="rotate(45) scale(2, 2)">
            <path d="M 1 1 L 5 5" stroke="#1A1A1A" />
          </g>
        </g>
      </svg>
    `;
    const parsed = SvgParser.parseSvgString(rawSvg);
    const code = VectorGenerator.generateImageVectorFile([parsed]);

    // Ensure parent group appears before child group
    const parentIdx = code.indexOf('name = "parentGroup"');
    const childIdx = code.indexOf('name = "childGroup"');
    assert.ok(parentIdx !== -1, 'Parent group must be present');
    assert.ok(childIdx !== -1, 'Child group must be present');
    assert.ok(parentIdx < childIdx, 'Parent group must precede child group');

    assert.ok(code.includes('rotate = 45f'), 'Child group must emit rotate = 45f');
    assert.ok(code.includes('scaleX = 2f'), 'Child group must emit scaleX = 2f');
    assert.ok(code.includes('scaleY = 2f'), 'Child group must emit scaleY = 2f');
    assert.ok(!code.includes('rotation ='), 'Must NEVER emit rotation = ... in Compose');
    assertKotlinBracesBalanced(code);
  });

  test('Test 1.3: Three-level deeply nested groups', () => {
    const rawSvg = `
      <svg width="24" height="24">
        <g id="rootGroup" transform="translate(5, 5)">
          <g id="midGroup" transform="scale(1.5, 1.5)">
            <g id="leafGroup" transform="rotate(90)">
              <path d="M 0 0 L 4 4" stroke="#333" />
            </g>
          </g>
        </g>
      </svg>
    `;
    const parsed = SvgParser.parseSvgString(rawSvg);
    const code = VectorGenerator.generateImageVectorFile([parsed]);

    assert.ok(code.includes('name = "rootGroup"'));
    assert.ok(code.includes('name = "midGroup"'));
    assert.ok(code.includes('name = "leafGroup"'));
    assert.ok(code.includes('rotate = 90f'));
    assertKotlinBracesBalanced(code);
  });

  test('Test 1.4: Sibling groups within a parent group', () => {
    const rawSvg = `
      <svg width="32" height="32">
        <g id="parent">
          <g id="branchA" transform="translate(2, 2)">
            <path d="M 0 0 L 2 2" stroke="#000" />
          </g>
          <g id="branchB" transform="translate(10, 10)">
            <path d="M 0 0 L 3 3" stroke="#000" />
          </g>
        </g>
      </svg>
    `;
    const parsed = SvgParser.parseSvgString(rawSvg);
    const code = VectorGenerator.generateImageVectorFile([parsed]);

    assert.ok(code.includes('name = "branchA"'));
    assert.ok(code.includes('name = "branchB"'));
    // Verify branchA closes before branchB
    const branchAIdx = code.indexOf('name = "branchA"');
    const branchBIdx = code.indexOf('name = "branchB"');
    assert.ok(branchAIdx < branchBIdx);
    assertKotlinBracesBalanced(code);
  });

  test('Test 1.5: Multiple paths within a single group', () => {
    const rawSvg = `
      <svg width="24" height="24">
        <g id="sharedGroup" transform="translate(4, 4)">
          <path d="M 0 0 L 2 2" stroke="#111" />
          <path d="M 2 2 L 4 4" stroke="#222" />
          <path d="M 4 4 L 6 6" stroke="#333" />
        </g>
      </svg>
    `;
    const parsed = SvgParser.parseSvgString(rawSvg);
    const code = VectorGenerator.generateImageVectorFile([parsed]);

    const groupOpenMatches = code.match(/group\s*\(/g) || [];
    assert.equal(groupOpenMatches.length, 1, 'Must emit exactly 1 group block for shared container');
    const pathMatches = code.match(/path\s*\(/g) || [];
    assert.equal(pathMatches.length, 3, 'Must emit all 3 paths inside the group');
    assertKotlinBracesBalanced(code);
  });

  test('Test 1.6: Group naming & identifier sanitization', () => {
    const rawSvg = `
      <svg width="24" height="24">
        <g id="icon-header:pill.group" transform="translate(1, 1)">
          <path d="M 0 0 L 1 1" />
        </g>
      </svg>
    `;
    const parsed = SvgParser.parseSvgString(rawSvg);
    const code = VectorGenerator.generateImageVectorFile([parsed]);

    assert.ok(code.includes('name = "icon_header_pill_group"'), 'Group name must be sanitized');
    assert.ok(!code.includes('icon-header:pill.group'), 'Raw un-sanitized name with colons/dots must not appear');
  });
});

describe('Suite 2: PathFillType.EvenOdd Emission & Cascading', () => {
  test('Test 2.1: Explicit fill-rule="evenodd" on leaf path', () => {
    const rawSvg = `
      <svg width="24" height="24">
        <path d="M 0 0 h 10 v 10 h -10 Z" fill="#000" fill-rule="evenodd" />
      </svg>
    `;
    const parsed = SvgParser.parseSvgString(rawSvg);
    const code = VectorGenerator.generateImageVectorFile([parsed]);

    assert.ok(code.includes('import androidx.compose.ui.graphics.PathFillType'));
    assert.ok(code.includes('pathFillType = PathFillType.EvenOdd'));
  });

  test('Test 2.2: Cascaded fill-rule="evenodd" from parent <g> container', () => {
    const rawSvg = `
      <svg width="24" height="24">
        <g fill-rule="evenodd">
          <path d="M 0 0 h 5 v 5 h -5 Z" fill="#111" />
          <path d="M 5 5 h 5 v 5 h -5 Z" fill="#222" />
        </g>
      </svg>
    `;
    const parsed = SvgParser.parseSvgString(rawSvg);
    assert.equal(parsed.paths[0].fillRule, 'evenodd');
    assert.equal(parsed.paths[1].fillRule, 'evenodd');

    const code = VectorGenerator.generateImageVectorFile([parsed]);
    const matches = code.match(/pathFillType = PathFillType\.EvenOdd/g) || [];
    assert.equal(matches.length, 2, 'Both child paths must inherit EvenOdd');
  });

  test('Test 2.3: Cascaded clip-rule="evenodd" from <g> or <svg>', () => {
    const rawSvg = `
      <svg width="24" height="24" clip-rule="evenodd">
        <g>
          <path d="M 0 0 L 10 10" fill="#000" />
        </g>
      </svg>
    `;
    const parsed = SvgParser.parseSvgString(rawSvg);
    assert.equal(parsed.paths[0].fillRule, 'evenodd');

    const code = VectorGenerator.generateImageVectorFile([parsed]);
    assert.ok(code.includes('pathFillType = PathFillType.EvenOdd'));
  });

  test('Test 2.4: Default nonzero fill-rule does not emit redundant EvenOdd', () => {
    const rawSvg = `
      <svg width="24" height="24">
        <path d="M 0 0 L 10 10" fill="#000" />
      </svg>
    `;
    const parsed = SvgParser.parseSvgString(rawSvg);
    const code = VectorGenerator.generateImageVectorFile([parsed]);

    assert.ok(!code.includes('pathFillType'), 'Default nonzero must not emit pathFillType');
  });

  test('Test 2.5: Child path explicit fill-rule="nonzero" overrides parent group evenodd', () => {
    const rawSvg = `
      <svg width="24" height="24">
        <g fill-rule="evenodd">
          <path d="M 0 0 L 10 10" fill="#000" fill-rule="nonzero" />
        </g>
      </svg>
    `;
    const parsed = SvgParser.parseSvgString(rawSvg);
    assert.equal(parsed.paths[0].fillRule, 'nonzero');

    const code = VectorGenerator.generateImageVectorFile([parsed]);
    assert.ok(!code.includes('PathFillType.EvenOdd'), 'Child nonzero override must suppress EvenOdd');
  });

  test('Test 2.6: Case-insensitivity (evenodd, EVENODD, evenOdd)', () => {
    const rawSvg = `
      <svg width="24" height="24">
        <path d="M 0 0 L 5 5" fill-rule="EVENODD" />
        <path d="M 5 5 L 10 10" fill-rule="evenOdd" />
      </svg>
    `;
    const parsed = SvgParser.parseSvgString(rawSvg);
    const code = VectorGenerator.generateImageVectorFile([parsed]);

    const matches = code.match(/pathFillType = PathFillType\.EvenOdd/g) || [];
    assert.equal(matches.length, 2, 'All case variants must emit PathFillType.EvenOdd');
  });

  test('Test 2.7: Compound donut shape with cutout hole generates valid Compose DSL with PathFillType.EvenOdd', () => {
    const rawSvg = `
      <svg width="24" height="24">
        <path d="M 0 0 h 20 v 20 h -20 Z M 5 5 h 10 v 10 h -10 Z" fill="#000" fill-rule="evenodd" />
      </svg>
    `;
    const parsed = SvgParser.parseSvgString(rawSvg);
    const code = VectorGenerator.generateImageVectorFile([parsed]);

    assert.ok(code.includes('pathFillType = PathFillType.EvenOdd'));
    assert.ok(code.includes('moveTo(0f, 0f)'));
    assert.ok(code.includes('moveTo(5f, 5f)'));
    assertKotlinBracesBalanced(code);
  });
});

describe('Suite 3: Android VectorDrawable XML <group> & android:fillType Generation', () => {
  test('Test 3.1: Emits valid single <group> in XML with android:translateX and android:translateY', () => {
    const rawSvg = `
      <svg width="24" height="24">
        <g id="group1" transform="translate(15, 25)">
          <path d="M 0 0 L 10 10" fill="#FF0000" />
        </g>
      </svg>
    `;
    const parsed = SvgParser.parseSvgString(rawSvg);
    const xml = VectorGenerator.generateVectorDrawableXml(parsed);

    assert.ok(xml.includes('<group'), 'Must contain <group>');
    assert.ok(xml.includes('android:name="group1"'));
    assert.ok(xml.includes('android:translateX="15"'));
    assert.ok(xml.includes('android:translateY="25"'));
    assert.ok(!xml.includes('android:rotate='), 'Must not emit android:rotate');
    assertXmlBalanced(xml);
  });

  test('Test 3.2: Emits nested <group> XML tags matching Compose hierarchy', () => {
    const rawSvg = `
      <svg width="24" height="24">
        <g id="outer" transform="translate(10, 10)">
          <g id="inner" transform="rotate(30)">
            <path d="M 0 0 L 5 5" fill="#000" />
          </g>
        </g>
      </svg>
    `;
    const parsed = SvgParser.parseSvgString(rawSvg);
    const xml = VectorGenerator.generateVectorDrawableXml(parsed);

    const outerIdx = xml.indexOf('android:name="outer"');
    const innerIdx = xml.indexOf('android:name="inner"');
    assert.ok(outerIdx !== -1 && innerIdx !== -1 && outerIdx < innerIdx);
    assert.ok(xml.includes('android:rotation="30"'));
    assertXmlBalanced(xml);
  });

  test('Test 3.3: Emits android:fillType="evenOdd" on <path> for evenodd paths', () => {
    const rawSvg = `
      <svg width="24" height="24">
        <path d="M 0 0 L 10 10" fill="#000" fill-rule="evenodd" />
      </svg>
    `;
    const parsed = SvgParser.parseSvgString(rawSvg);
    const xml = VectorGenerator.generateVectorDrawableXml(parsed);

    assert.ok(xml.includes('android:fillType="evenOdd"'), 'Must emit android:fillType="evenOdd"');
    assert.ok(!xml.includes('android:fillType="evenodd"'), 'Must match AAPT2 camelCase evenOdd');
  });

  test('Test 3.4: Emits sibling <group> blocks in XML VectorDrawable', () => {
    const rawSvg = `
      <svg width="24" height="24">
        <g id="first" transform="translate(2, 2)">
          <path d="M 0 0 L 2 2" fill="#000" />
        </g>
        <g id="second" transform="translate(4, 4)">
          <path d="M 0 0 L 3 3" fill="#000" />
        </g>
      </svg>
    `;
    const parsed = SvgParser.parseSvgString(rawSvg);
    const xml = VectorGenerator.generateVectorDrawableXml(parsed);

    assert.ok(xml.includes('android:name="first"'));
    assert.ok(xml.includes('android:name="second"'));
    assertXmlBalanced(xml);
  });

  test('Test 3.5: Encloses multiple <path> elements within a single <group> in XML', () => {
    const rawSvg = `
      <svg width="24" height="24">
        <g id="shared" transform="translate(5, 5)">
          <path d="M 0 0 L 2 2" fill="#000" />
          <path d="M 2 2 L 4 4" fill="#111" />
        </g>
      </svg>
    `;
    const parsed = SvgParser.parseSvgString(rawSvg);
    const xml = VectorGenerator.generateVectorDrawableXml(parsed);

    const groupOpen = (xml.match(/<group[\s>]/g) || []).length;
    assert.equal(groupOpen, 1, 'Must emit exactly 1 <group> tag');
    const pathMatches = (xml.match(/<path[\s]/g) || []).length;
    assert.equal(pathMatches, 2, 'Must enclose both paths in the group');
    assertXmlBalanced(xml);
  });

  test('Test 3.6: XML VectorDrawable passes structural well-formedness validation', () => {
    const rawSvg = `
      <svg width="32" height="32" viewBox="0 0 32 32">
        <g id="wrapper" transform="translate(1, 1)">
          <path d="M 0 0 L 10 10" fill="#000000" stroke="#FFFFFF" stroke-width="2" fill-rule="evenodd" />
        </g>
      </svg>
    `;
    const parsed = SvgParser.parseSvgString(rawSvg);
    const xml = VectorGenerator.generateVectorDrawableXml(parsed);

    assert.ok(xml.startsWith('<?xml version="1.0" encoding="utf-8"?>'));
    assert.ok(xml.includes('<vector xmlns:android="http://schemas.android.com/apk/res/android"'));
    assert.ok(xml.includes('android:width="32dp"'));
    assert.ok(xml.includes('android:height="32dp"'));
    assert.ok(xml.includes('android:viewportWidth="32"'));
    assert.ok(xml.includes('android:viewportHeight="32"'));
    assertXmlBalanced(xml);
  });
});

describe('Suite 4: Skew Baking vs Group Preservation Decision Engine', () => {
  test('Test 4.1: Preserves pure orthogonal translation as group() in Compose and <group> in XML', () => {
    const rawSvg = `
      <svg width="24" height="24">
        <g id="trans" transform="translate(20, -15)">
          <path d="M 0 0 L 5 5" fill="#000" />
        </g>
      </svg>
    `;
    const parsed = SvgParser.parseSvgString(rawSvg);
    const code = VectorGenerator.generateImageVectorFile([parsed]);
    const xml = VectorGenerator.generateVectorDrawableXml(parsed);

    assert.ok(code.includes('group(') && code.includes('translationX = 20f') && code.includes('translationY = -15f'));
    assert.ok(xml.includes('<group') && xml.includes('android:translateX="20"') && xml.includes('android:translateY="-15"'));
    // Path inside group remains unbaked local coordinates
    assert.ok(code.includes('lineTo(5f, 5f)'));
  });

  test('Test 4.2: Preserves pure orthogonal scale and rotation as group()', () => {
    const rawSvg = `
      <svg width="24" height="24">
        <g id="rotScale" transform="scale(2, -2) rotate(30)">
          <path d="M 0 0 L 4 4" fill="#000" />
        </g>
      </svg>
    `;
    const parsed = SvgParser.parseSvgString(rawSvg);
    const code = VectorGenerator.generateImageVectorFile([parsed]);

    assert.ok(code.includes('group('));
    assert.ok(code.includes('rotate = 30f'));
    assert.ok(code.includes('scaleX = 2f'));
    assert.ok(code.includes('scaleY = -2f'));
  });

  test('Test 4.3: Bakes skewX(angle) directly into path coordinates (zero group() emitted)', () => {
    const rawSvg = `
      <svg width="24" height="24">
        <g id="skewed" transform="skewX(30)">
          <path d="M 0 0 L 10 10" fill="#000" />
        </g>
      </svg>
    `;
    const parsed = SvgParser.parseSvgString(rawSvg);
    const code = VectorGenerator.generateImageVectorFile([parsed]);
    const xml = VectorGenerator.generateVectorDrawableXml(parsed);

    // skewX has |ac + bd| > 10^-4, so group wrapper must NOT be emitted
    assert.ok(!code.includes('group('), 'Must not emit Compose group() for skewed transform');
    assert.ok(!xml.includes('<group'), 'Must not emit XML <group> for skewed transform');
    // Coordinates must be baked: x' = 10 + 10 * tan(30 deg) = 10 + 5.7735 = 15.7735
    assert.ok(code.includes('15.774') || code.includes('15.773'), 'Must bake skewed X coordinate');
  });

  test('Test 4.4: Bakes skewY(angle) directly into path coordinates', () => {
    const rawSvg = `
      <svg width="24" height="24">
        <g id="skewedY" transform="skewY(45)">
          <path d="M 0 0 L 10 10" fill="#000" />
        </g>
      </svg>
    `;
    const parsed = SvgParser.parseSvgString(rawSvg);
    const code = VectorGenerator.generateImageVectorFile([parsed]);

    assert.ok(!code.includes('group('), 'Must not emit group() for skewY');
    // y' = y + x * tan(45 deg) = 10 + 10 * 1 = 20
    assert.ok(code.includes('20f'), 'Must bake skewed Y coordinate to 20f');
  });

  test('Test 4.5: Bakes general sheared matrix matrix(1, 0.5, 0.3, 1, 10, 20) into path coordinates', () => {
    const rawSvg = `
      <svg width="24" height="24">
        <g id="shearMatrix" transform="matrix(1, 0.5, 0.3, 1, 10, 20)">
          <path d="M 0 0 L 10 10" fill="#000" />
        </g>
      </svg>
    `;
    const parsed = SvgParser.parseSvgString(rawSvg);
    const code = VectorGenerator.generateImageVectorFile([parsed]);

    // ac + bd = 1*0.3 + 0.5*1 = 0.8 > 1e-4 -> skewed
    assert.ok(!code.includes('group('), 'Must not emit group() for sheared matrix');
    assert.ok(code.includes('moveTo(10f, 20f)'), 'Must bake origin translation (10, 20)');
  });

  test('Test 4.6: Mixed hierarchy: orthogonal parent <g> preserved, skewed child <g> baked', () => {
    const rawSvg = `
      <svg width="24" height="24">
        <g id="parentOrthogonal" transform="translate(10, 20)">
          <g id="childSkewed" transform="skewX(30)">
            <path d="M 0 0 L 10 10" fill="#000" />
          </g>
        </g>
      </svg>
    `;
    const parsed = SvgParser.parseSvgString(rawSvg);
    const code = VectorGenerator.generateImageVectorFile([parsed]);
    const xml = VectorGenerator.generateVectorDrawableXml(parsed);

    // Parent orthogonal group IS preserved
    assert.ok(code.includes('name = "parentOrthogonal"'), 'Parent group must be preserved');
    assert.ok(code.includes('translationX = 10f') && code.includes('translationY = 20f'));
    // Child skewed group is NOT emitted as group wrapper
    assert.ok(!code.includes('name = "childSkewed"'), 'Child skewed group wrapper must be suppressed');
    assert.ok(!xml.includes('android:name="childSkewed"'));
    assertKotlinBracesBalanced(code);
    assertXmlBalanced(xml);
  });

  test('Test 4.7: options.flat = true bakes all transforms and forces flat paths (backward compatibility)', () => {
    const rawSvg = `
      <svg width="24" height="24">
        <g id="nestedGroup" transform="translate(10, 20)">
          <path d="M 0 0 L 5 5" fill="#000" />
        </g>
      </svg>
    `;
    const parsed = SvgParser.parseSvgString(rawSvg);
    const code = VectorGenerator.generateImageVectorFile([parsed], { flat: true });
    const xml = VectorGenerator.generateVectorDrawableXml(parsed, { flat: true });

    assert.ok(!code.includes('group('), 'Flat mode must not emit group()');
    assert.ok(!xml.includes('<group'), 'Flat mode must not emit <group>');
    // Coordinates baked
    assert.ok(code.includes('moveTo(10f, 20f)'));
    assert.ok(code.includes('lineTo(15f, 25f)'));
  });
});

describe('Suite 5: Real-World Action Icons & Complex Multi-Path Badges', () => {
  test('Test 5.1: Action badge with pill background and translated action icon (Document + Badge)', () => {
    const rawSvg = `
      <svg width="32" height="32" viewBox="0 0 32 32">
        <g id="docBody">
          <rect x="2" y="2" width="20" height="28" rx="2" fill="#F0F0F0" />
        </g>
        <g id="badge" transform="translate(16, 16) scale(0.5, 0.5)">
          <circle cx="12" cy="12" r="10" fill="#4F46E5" />
          <path d="M 12 7 v 10 M 7 12 h 10" stroke="#FFFFFF" stroke-width="2" />
        </g>
      </svg>
    `;
    const parsed = SvgParser.parseSvgString(rawSvg);
    const code = VectorGenerator.generateImageVectorFile([parsed]);
    const xml = VectorGenerator.generateVectorDrawableXml(parsed);

    assert.ok(code.includes('name = "badge"'));
    assert.ok(code.includes('translationX = 16f'));
    assert.ok(code.includes('translationY = 16f'));
    assert.ok(code.includes('scaleX = 0.5f'));
    assert.ok(code.includes('scaleY = 0.5f'));
    assertKotlinBracesBalanced(code);
    assertXmlBalanced(xml);
  });

  test('Test 5.2: Complex vector with both nested groups and PathFillType.EvenOdd', () => {
    const rawSvg = `
      <svg width="24" height="24">
        <g id="container" transform="translate(2, 2)">
          <g id="sub" transform="scale(1.2, 1.2)">
            <path d="M 0 0 h 10 v 10 h -10 Z M 2 2 h 6 v 6 h -6 Z" fill="#000" fill-rule="evenodd" />
          </g>
        </g>
      </svg>
    `;
    const parsed = SvgParser.parseSvgString(rawSvg);
    const code = VectorGenerator.generateImageVectorFile([parsed]);
    const xml = VectorGenerator.generateVectorDrawableXml(parsed);

    assert.ok(code.includes('group('));
    assert.ok(code.includes('pathFillType = PathFillType.EvenOdd'));
    assert.ok(xml.includes('<group'));
    assert.ok(xml.includes('android:fillType="evenOdd"'));
    assertKotlinBracesBalanced(code);
    assertXmlBalanced(xml);
  });

  test('Test 5.3: Lucide-style compound icon hierarchy', () => {
    const rawSvg = `
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <g id="lucide_folder">
          <path d="M 4 20 h 16 a 2 2 0 0 0 2 -2 V 8 a 2 2 0 0 0 -2 -2 h -7.93 a 2 2 0 0 1 -1.66 -0.9 l -0.82 -1.2 A 2 2 0 0 0 7.93 3 H 4 a 2 2 0 0 0 -2 2 v 13 a 2 2 0 0 0 2 2 Z" />
        </g>
      </svg>
    `;
    const parsed = SvgParser.parseSvgString(rawSvg, { color: '#1A1A1A' });
    const code = VectorGenerator.generateImageVectorFile([parsed]);

    assert.ok(code.includes('StrokeCap.Round'));
    assert.ok(code.includes('StrokeJoin.Round'));
    assert.ok(code.includes('Color(0xFF1A1A1A)'));
    assertKotlinBracesBalanced(code);
  });
});

describe('Suite 6: Adversarial Boundaries & Edge Cases', () => {
  test('Test 6.1: Empty <g></g> group without child paths does not emit empty invalid Kotlin block', () => {
    const rawSvg = `
      <svg width="24" height="24">
        <g id="emptyGroup" transform="translate(10, 10)">
        </g>
      </svg>
    `;
    const parsed = SvgParser.parseSvgString(rawSvg);
    const code = VectorGenerator.generateImageVectorFile([parsed]);
    const xml = VectorGenerator.generateVectorDrawableXml(parsed);

    // Empty group must not emit empty group() {} block
    assert.ok(!code.includes('group(\n                name = "emptyGroup"'), 'Must not emit empty group block');
    assert.ok(!xml.includes('android:name="emptyGroup"'), 'Must not emit empty XML group');
    assertKotlinBracesBalanced(code);
    assertXmlBalanced(xml);
  });

  test('Test 6.2: Group with degenerate transform falls back safely without NaN', () => {
    const rawSvg = `
      <svg width="24" height="24">
        <g id="degen" transform="translate(NaN, invalid) scale(0, 0)">
          <path d="M 0 0 L 5 5" fill="#000" />
        </g>
      </svg>
    `;
    const parsed = SvgParser.parseSvgString(rawSvg);
    const code = VectorGenerator.generateImageVectorFile([parsed]);
    const xml = VectorGenerator.generateVectorDrawableXml(parsed);

    assert.ok(!code.includes('NaN'), 'Kotlin code must never contain NaN');
    assert.ok(!xml.includes('NaN'), 'XML must never contain NaN');
    assertKotlinBracesBalanced(code);
    assertXmlBalanced(xml);
  });

  test('Test 6.3: Extremely deep group nesting (8 levels deep)', () => {
    let svg = '<svg width="24" height="24">';
    for (let i = 1; i <= 8; i++) {
      svg += `<g id="level_${i}" transform="translate(1, 1)">`;
    }
    svg += '<path d="M 0 0 L 2 2" fill="#000" />';
    for (let i = 1; i <= 8; i++) {
      svg += '</g>';
    }
    svg += '</svg>';

    const parsed = SvgParser.parseSvgString(svg);
    const code = VectorGenerator.generateImageVectorFile([parsed]);
    const xml = VectorGenerator.generateVectorDrawableXml(parsed);

    for (let i = 1; i <= 8; i++) {
      assert.ok(code.includes(`name = "level_${i}"`), `Must include level_${i}`);
      assert.ok(xml.includes(`android:name="level_${i}"`), `XML must include level_${i}`);
    }
    assertKotlinBracesBalanced(code);
    assertXmlBalanced(xml);
  });

  test('Test 6.4: Mixed primitive shapes inside transformed groups', () => {
    const rawSvg = `
      <svg width="100" height="100">
        <g id="primitiveGroup" transform="translate(10, 10)">
          <rect x="0" y="0" width="10" height="10" fill="#111" />
          <circle cx="20" cy="20" r="5" fill="#222" />
          <polygon points="30,30 40,30 35,40" fill="#333" />
        </g>
      </svg>
    `;
    const parsed = SvgParser.parseSvgString(rawSvg);
    assert.equal(parsed.groups.length, 1);
    assert.equal(parsed.groups[0].children.length, 3, 'Group must contain all 3 normalized shapes');

    const code = VectorGenerator.generateImageVectorFile([parsed]);
    assert.ok(code.includes('name = "primitiveGroup"'));
    const pathMatches = code.match(/path\s*\(/g) || [];
    assert.equal(pathMatches.length, 3, 'Must emit 3 path blocks for normalized primitives');
    assertKotlinBracesBalanced(code);
  });

  test('Test 6.5: Group containing multiple paths with mixed fill-rules (one nonzero, one evenodd)', () => {
    const rawSvg = `
      <svg width="24" height="24">
        <g id="mixedGroup" transform="translate(2, 2)">
          <path d="M 0 0 L 5 5" fill="#000" fill-rule="nonzero" />
          <path d="M 5 5 L 10 10" fill="#000" fill-rule="evenodd" />
        </g>
      </svg>
    `;
    const parsed = SvgParser.parseSvgString(rawSvg);
    const code = VectorGenerator.generateImageVectorFile([parsed]);
    const xml = VectorGenerator.generateVectorDrawableXml(parsed);

    const evenOddMatches = code.match(/pathFillType = PathFillType\.EvenOdd/g) || [];
    assert.equal(evenOddMatches.length, 1, 'Only the second path must have EvenOdd in Compose');

    const xmlEvenOddMatches = xml.match(/android:fillType="evenOdd"/g) || [];
    assert.equal(xmlEvenOddMatches.length, 1, 'Only the second path must have evenOdd in XML');

    assertKotlinBracesBalanced(code);
    assertXmlBalanced(xml);
  });
});
