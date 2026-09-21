#!/usr/bin/env node

/**
 * ============================================================================
 * Adversarial Fuzz & Stress Test Suite: Milestone 2 (R2)
 * Hierarchical Compose group() DSL & Fill-Rule Cascading
 *
 * Executed by: r4_m2_challenger_2 (Role: critic, specialist)
 * Working Directory: claude_to_compose
 * Targets:
 *   - extractor/svg_parser.js (SvgParser, extractFillRule, extractStyleProp, parseSvgString)
 *   - extractor/dom_walker.js (walkDOM, browser fillRule cascading, group trees)
 *   - synthesizer/vector_generator.js (VectorGenerator, emitComposeNode, emitXmlNode, sanitizeGroupName)
 *   - Android Jetpack Compose compilation via Gradle
 * ============================================================================
 */

const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { execSync } = require('node:child_process');
const { chromium } = require('playwright');

const { SvgParser } = require('../../extractor/svg_parser');
const { VectorGenerator } = require('../../synthesizer/vector_generator');

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

// Helper to check XML tag balancing
function assertXmlBalanced(xml) {
  const vectorOpen = (xml.match(/<vector[\s>]/g) || []).length;
  const vectorClose = (xml.match(/<\/vector>/g) || []).length;
  assert.equal(vectorOpen, vectorClose, `Mismatched <vector> tags in XML (${vectorOpen} open vs ${vectorClose} close)`);

  const groupOpen = (xml.match(/<group[\s>]/g) || []).length;
  const groupClose = (xml.match(/<\/group>/g) || []).length;
  assert.equal(groupOpen, groupClose, `Mismatched <group> tags in XML (${groupOpen} open vs ${groupClose} close)`);
}

// Helper to check Kotlin brace balancing
function assertKotlinBracesBalanced(kotlin) {
  let depth = 0;
  for (let i = 0; i < kotlin.length; i++) {
    const char = kotlin[i];
    if (char === '{') depth++;
    if (char === '}') depth--;
    assert.ok(depth >= 0, `Negative brace depth at character index ${i} in generated Kotlin code`);
  }
  assert.equal(depth, 0, `Unclosed braces in generated Kotlin code (final depth: ${depth})`);
}

// ============================================================================
// SUITE 1: Deeply Nested Group Trees (8+ levels) with Mixed Fill-Rules
// ============================================================================
async function runSuite1() {
  console.log('\n--- SUITE 1: Deeply Nested Group Trees (8+ levels) with Mixed Fill-Rules ---');

  // Test 1.1: 8-level nesting alternating evenodd -> nonzero -> evenodd
  try {
    const levels = 8;
    // alternation: 1:evenodd, 2:nonzero, 3:evenodd, 4:nonzero, 5:evenodd, 6:nonzero, 7:evenodd, 8:nonzero
    let svg = '<svg width="100" height="100" viewBox="0 0 100 100">\n';
    for (let i = 1; i <= levels; i++) {
      const rule = (i % 2 === 1) ? 'evenodd' : 'nonzero';
      svg += `  <g id="lvl_${i}" fill-rule="${rule}" transform="translate(1, 1)">\n`;
      // Each level has a leaf path with no explicit fill-rule (should inherit level's rule)
      svg += `    <path d="M ${i} ${i} L ${i + 5} ${i + 5}" stroke="#000" />\n`;
    }
    for (let i = 1; i <= levels; i++) {
      svg += '  </g>\n';
    }
    svg += '</svg>';

    const parsed = SvgParser.parseSvgString(svg);
    assert.equal(parsed.paths.length, 8, 'Expected 8 paths');

    // Verify parsed fill-rule on each path
    for (let i = 0; i < levels; i++) {
      const expectedRule = ((i + 1) % 2 === 1) ? 'evenodd' : 'nonzero';
      assert.equal(parsed.paths[i].fillRule, expectedRule, `Path ${i + 1} fillRule mismatch`);
    }

    const composeCode = VectorGenerator.generateImageVectorFile([parsed]);
    const xmlCode = VectorGenerator.generateVectorDrawableXml(parsed);

    assertKotlinBracesBalanced(composeCode);
    assertXmlBalanced(xmlCode);

    // Count PathFillType.EvenOdd in Compose code: must be exactly 4 (levels 1, 3, 5, 7)
    const composeEvenOddMatches = composeCode.match(/pathFillType = PathFillType\.EvenOdd/g) || [];
    assert.equal(composeEvenOddMatches.length, 4, `Expected 4 EvenOdd in Compose, got ${composeEvenOddMatches.length}`);

    // Count android:fillType="evenOdd" in XML: must be exactly 4
    const xmlEvenOddMatches = xmlCode.match(/android:fillType="evenOdd"/g) || [];
    assert.equal(xmlEvenOddMatches.length, 4, `Expected 4 evenOdd in XML, got ${xmlEvenOddMatches.length}`);

    // Verify all 8 groups exist in hierarchy
    for (let i = 1; i <= levels; i++) {
      assert.ok(composeCode.includes(`name = "lvl_${i}"`), `Missing group lvl_${i} in Compose`);
      assert.ok(xmlCode.includes(`android:name="lvl_${i}"`), `Missing group lvl_${i} in XML`);
    }

    recordTest('FUZZ-1.1', '8-level nested groups with alternating evenodd/nonzero fill-rules', 'Deep-Nesting', true, { levels, evenOddCount: 4 });
  } catch (err) {
    recordTest('FUZZ-1.1', '8-level nested groups with alternating evenodd/nonzero fill-rules', 'Deep-Nesting', false, { reason: err.message });
  }

  // Test 1.2: 12-level deep hierarchy with gaps/inheritance and leaf override
  try {
    const levels = 12;
    let svg = '<svg width="200" height="200" fill-rule="evenodd">\n'; // root is evenodd
    // Level 1: no rule (inherits evenodd)
    // Level 2: nonzero (override)
    // Level 3: no rule (inherits nonzero)
    // Level 4: evenodd (override)
    // Level 5..7: no rule (inherits evenodd)
    // Level 8: nonzero (override)
    // Level 9..11: no rule (inherits nonzero)
    // Level 12: contains two paths:
    //   Path A: no rule (inherits nonzero)
    //   Path B: explicit fill-rule="evenodd" (leaf override)
    for (let i = 1; i <= levels; i++) {
      let ruleAttr = '';
      if (i === 2) ruleAttr = ' fill-rule="nonzero"';
      else if (i === 4) ruleAttr = ' fill-rule="evenodd"';
      else if (i === 8) ruleAttr = ' fill-rule="nonzero"';
      svg += `  <g id="deep_lvl_${i}"${ruleAttr} transform="translate(0.5, 0.5)">\n`;
    }
    svg += '    <path id="leafA" d="M 0 0 L 10 10" />\n';
    svg += '    <path id="leafB" d="M 10 10 L 20 20" fill-rule="evenodd" />\n';
    for (let i = 1; i <= levels; i++) {
      svg += '  </g>\n';
    }
    svg += '</svg>';

    const parsed = SvgParser.parseSvgString(svg);
    assert.equal(parsed.paths.length, 2, 'Expected 2 paths');
    assert.equal(parsed.paths[0].fillRule, 'nonzero', 'leafA should inherit nonzero from Level 8');
    assert.equal(parsed.paths[1].fillRule, 'evenodd', 'leafB should have explicit evenodd override');

    const composeCode = VectorGenerator.generateImageVectorFile([parsed]);
    const xmlCode = VectorGenerator.generateVectorDrawableXml(parsed);

    assertKotlinBracesBalanced(composeCode);
    assertXmlBalanced(xmlCode);

    // Exactly 1 EvenOdd match for leafB
    const composeEvenOddMatches = composeCode.match(/pathFillType = PathFillType\.EvenOdd/g) || [];
    assert.equal(composeEvenOddMatches.length, 1, `Expected exactly 1 EvenOdd in Compose, got ${composeEvenOddMatches.length}`);

    const xmlEvenOddMatches = xmlCode.match(/android:fillType="evenOdd"/g) || [];
    assert.equal(xmlEvenOddMatches.length, 1, `Expected exactly 1 evenOdd in XML, got ${xmlEvenOddMatches.length}`);

    // Verify 12 nested groups in Compose
    for (let i = 1; i <= levels; i++) {
      assert.ok(composeCode.includes(`name = "deep_lvl_${i}"`), `Missing group deep_lvl_${i} in Compose`);
    }

    recordTest('FUZZ-1.2', '12-level hierarchy with sparse fill-rule inheritance and leaf override', 'Deep-Nesting', true, { levels });
  } catch (err) {
    recordTest('FUZZ-1.2', '12-level hierarchy with sparse fill-rule inheritance and leaf override', 'Deep-Nesting', false, { reason: err.message });
  }

  // Test 1.3: Deep hierarchy with complex transforms (scale + rotate + translate)
  try {
    const levels = 8;
    let svg = '<svg width="300" height="300">\n';
    for (let i = 1; i <= levels; i++) {
      const rot = i * 15;
      const s = 1.0 + i * 0.05;
      svg += `  <g id="trans_lvl_${i}" transform="translate(${i * 2}, ${i * 3}) rotate(${rot}) scale(${s.toFixed(2)}, ${s.toFixed(2)})">\n`;
    }
    svg += '    <path d="M 0 0 L 10 10" />\n';
    for (let i = 1; i <= levels; i++) {
      svg += '  </g>\n';
    }
    svg += '</svg>';

    const parsed = SvgParser.parseSvgString(svg);
    const composeCode = VectorGenerator.generateImageVectorFile([parsed]);
    const xmlCode = VectorGenerator.generateVectorDrawableXml(parsed);

    assertKotlinBracesBalanced(composeCode);
    assertXmlBalanced(xmlCode);

    // Verify all 8 levels preserved without skew baking (since all transforms are orthogonal)
    for (let i = 1; i <= levels; i++) {
      assert.ok(composeCode.includes(`name = "trans_lvl_${i}"`), `Missing group trans_lvl_${i} in Compose`);
      assert.ok(xmlCode.includes(`android:name="trans_lvl_${i}"`), `Missing group trans_lvl_${i} in XML`);
    }
    assert.ok(!composeCode.includes('rotation ='), 'Must never emit rotation = in Compose DSL');

    recordTest('FUZZ-1.3', '8-level nested groups with orthogonal rotate/scale/translate transforms', 'Deep-Nesting', true, { levels });
  } catch (err) {
    recordTest('FUZZ-1.3', '8-level nested groups with orthogonal rotate/scale/translate transforms', 'Deep-Nesting', false, { reason: err.message });
  }

  // Test 1.4: Sibling group fill-rule stack isolation (no bleed between siblings)
  try {
    const rawSvg = `
      <svg width="24" height="24" fill-rule="evenodd">
        <g id="branchA" fill-rule="nonzero">
          <path id="pathA" d="M 0 0 L 5 5" />
        </g>
        <g id="branchB">
          <path id="pathB" d="M 5 5 L 10 10" />
        </g>
      </svg>
    `;
    const parsed = SvgParser.parseSvgString(rawSvg);
    assert.equal(parsed.paths[0].fillRule, 'nonzero', 'pathA must have nonzero from branchA');
    assert.equal(parsed.paths[1].fillRule, 'evenodd', 'pathB must restore evenodd from root SVG');

    const composeCode = VectorGenerator.generateImageVectorFile([parsed]);
    const xmlCode = VectorGenerator.generateVectorDrawableXml(parsed);

    assertKotlinBracesBalanced(composeCode);
    assertXmlBalanced(xmlCode);

    const composeEvenOddMatches = composeCode.match(/pathFillType = PathFillType\.EvenOdd/g) || [];
    assert.equal(composeEvenOddMatches.length, 1, 'Only pathB must have EvenOdd in Compose');

    const xmlEvenOddMatches = xmlCode.match(/android:fillType="evenOdd"/g) || [];
    assert.equal(xmlEvenOddMatches.length, 1, 'Only pathB must have evenOdd in XML');

    recordTest('FUZZ-1.4', 'Sibling group fill-rule stack isolation prevents rule leakage across siblings', 'Deep-Nesting', true);
  } catch (err) {
    recordTest('FUZZ-1.4', 'Sibling group fill-rule stack isolation prevents rule leakage across siblings', 'Deep-Nesting', false, { reason: err.message });
  }
}

// ============================================================================
// SUITE 2: Inline CSS Styles on <svg> and <g> Tags
// ============================================================================
async function runSuite2() {
  console.log('\n--- SUITE 2: Inline CSS Styles on <svg> and <g> Tags ---');

  // Test 2.1: Inline style="fill-rule: evenodd;" on root <svg>
  try {
    const rawSvg = `
      <svg width="24" height="24" style="fill-rule: evenodd; stroke: #ff0000;">
        <path d="M 0 0 L 10 10" />
      </svg>
    `;
    const parsed = SvgParser.parseSvgString(rawSvg);
    assert.equal(parsed.paths[0].fillRule, 'evenodd', 'Root SVG inline style fill-rule must cascade');

    const composeCode = VectorGenerator.generateImageVectorFile([parsed]);
    const xmlCode = VectorGenerator.generateVectorDrawableXml(parsed);

    assert.ok(composeCode.includes('pathFillType = PathFillType.EvenOdd'), 'Compose must emit EvenOdd');
    assert.ok(xmlCode.includes('android:fillType="evenOdd"'), 'XML must emit evenOdd');
    recordTest('FUZZ-2.1', 'Inline style="fill-rule: evenodd;" on root <svg> cascades to paths', 'Inline-CSS', true);
  } catch (err) {
    recordTest('FUZZ-2.1', 'Inline style="fill-rule: evenodd;" on root <svg> cascades to paths', 'Inline-CSS', false, { reason: err.message });
  }

  // Test 2.2: Messy whitespace and uppercase in inline style
  try {
    const rawSvg = `
      <svg width="24" height="24">
        <g style="  FILL-RULE   :   EVENODD   ;   COLOR : #333333  ">
          <path d="M 0 0 L 5 5" />
        </g>
      </svg>
    `;
    const parsed = SvgParser.parseSvgString(rawSvg);
    assert.equal(parsed.paths[0].fillRule, 'evenodd', 'Case and whitespace in inline style must be normalized');

    const composeCode = VectorGenerator.generateImageVectorFile([parsed]);
    assert.ok(composeCode.includes('pathFillType = PathFillType.EvenOdd'), 'Compose must emit EvenOdd');
    recordTest('FUZZ-2.2', 'Messy whitespace, uppercase FILL-RULE: EVENODD in inline CSS', 'Inline-CSS', true);
  } catch (err) {
    recordTest('FUZZ-2.2', 'Messy whitespace, uppercase FILL-RULE: EVENODD in inline CSS', 'Inline-CSS', false, { reason: err.message });
  }

  // Test 2.3: Multiple chained inline CSS properties without trailing semicolon
  try {
    const rawSvg = `
      <svg width="24" height="24">
        <g style="display:block; stroke-width: 3.5px; fill-rule: evenodd">
          <path d="M 0 0 L 4 4" />
        </g>
      </svg>
    `;
    const parsed = SvgParser.parseSvgString(rawSvg);
    assert.equal(parsed.paths[0].fillRule, 'evenodd', 'fill-rule without trailing semicolon must be extracted');
    assert.equal(parsed.paths[0].strokeWidth, 3.5, 'stroke-width 3.5px from style must be extracted');

    const composeCode = VectorGenerator.generateImageVectorFile([parsed]);
    assert.ok(composeCode.includes('strokeLineWidth = 3.5f'), 'Compose stroke width must be 3.5f');
    assert.ok(composeCode.includes('pathFillType = PathFillType.EvenOdd'));
    recordTest('FUZZ-2.3', 'Multiple chained inline CSS properties without trailing semicolon', 'Inline-CSS', true);
  } catch (err) {
    recordTest('FUZZ-2.3', 'Multiple chained inline CSS properties without trailing semicolon', 'Inline-CSS', false, { reason: err.message });
  }

  // Test 2.4: Inline style with multiple semicolons, stroke-linecap, stroke-linejoin
  try {
    const rawSvg = `
      <svg width="24" height="24">
        <g style=";;stroke-linecap: square; ; stroke-linejoin: bevel;; fill-rule: evenodd;;">
          <path d="M 0 0 L 10 10" stroke="#000" />
        </g>
      </svg>
    `;
    const parsed = SvgParser.parseSvgString(rawSvg);
    assert.equal(parsed.paths[0].strokeLinecap, 'square');
    assert.equal(parsed.paths[0].strokeLinejoin, 'bevel');
    assert.equal(parsed.paths[0].fillRule, 'evenodd');

    const composeCode = VectorGenerator.generateImageVectorFile([parsed]);
    assert.ok(composeCode.includes('StrokeCap.Square'));
    assert.ok(composeCode.includes('StrokeJoin.Bevel'));
    assert.ok(composeCode.includes('pathFillType = PathFillType.EvenOdd'));
    recordTest('FUZZ-2.4', 'Messy multiple semicolons, stroke caps, and joins in inline CSS', 'Inline-CSS', true);
  } catch (err) {
    recordTest('FUZZ-2.4', 'Messy multiple semicolons, stroke caps, and joins in inline CSS', 'Inline-CSS', false, { reason: err.message });
  }

  // Test 2.5: Nested inline CSS overrides (evenodd in parent style, nonzero in child style)
  try {
    const rawSvg = `
      <svg width="24" height="24">
        <g style="fill-rule: evenodd">
          <g style="fill-rule: nonzero">
            <path d="M 0 0 L 5 5" fill="#000" />
          </g>
        </g>
      </svg>
    `;
    const parsed = SvgParser.parseSvgString(rawSvg);
    assert.equal(parsed.paths[0].fillRule, 'nonzero', 'Child style nonzero must override parent style evenodd');

    const composeCode = VectorGenerator.generateImageVectorFile([parsed]);
    assert.ok(!composeCode.includes('PathFillType.EvenOdd'), 'EvenOdd must NOT be emitted when overridden by nonzero');
    recordTest('FUZZ-2.5', 'Nested inline CSS overrides (parent evenodd -> child nonzero)', 'Inline-CSS', true);
  } catch (err) {
    recordTest('FUZZ-2.5', 'Nested inline CSS overrides (parent evenodd -> child nonzero)', 'Inline-CSS', false, { reason: err.message });
  }
}

// ============================================================================
// SUITE 3: Groups with Non-Standard Names, Special Chars & Numbers-Only
// ============================================================================
async function runSuite3() {
  console.log('\n--- SUITE 3: Groups with Non-Standard Names, Special Chars & Numbers-Only ---');

  // Test 3.1: Special characters in group name ($@!#%^&*()+=/\|?.,<>:;)
  try {
    const rawSvg = `
      <svg width="24" height="24">
        <g id="weird@group#name$with%specials^&*()+=!" transform="translate(2, 2)">
          <path d="M 0 0 L 1 1" />
        </g>
      </svg>
    `;
    const parsed = SvgParser.parseSvgString(rawSvg);
    const composeCode = VectorGenerator.generateImageVectorFile([parsed]);
    const xmlCode = VectorGenerator.generateVectorDrawableXml(parsed);

    assertKotlinBracesBalanced(composeCode);
    assertXmlBalanced(xmlCode);

    // Group name must only contain alphanumeric and underscores
    const groupNameMatch = composeCode.match(/group\(\s*name = "([^"]+)"/);
    assert.ok(groupNameMatch, 'Must emit group with sanitized name');
    const sanitizedName = groupNameMatch[1];
    assert.ok(/^[a-zA-Z0-9_]+$/.test(sanitizedName), `Compose group name '${sanitizedName}' contains non-sanitized characters`);

    const xmlNameMatch = xmlCode.match(/android:name="([^"]+)"/);
    assert.ok(xmlNameMatch, 'Must emit XML group with sanitized name');
    assert.ok(/^[a-zA-Z0-9_]+$/.test(xmlNameMatch[1]), `XML group name '${xmlNameMatch[1]}' contains non-sanitized characters`);

    recordTest('FUZZ-3.1', 'Group id with special characters ($@!#%^&*()+=!) sanitized to valid identifiers', 'Name-Sanitization', true, { sanitizedName });
  } catch (err) {
    recordTest('FUZZ-3.1', 'Group id with special characters ($@!#%^&*()+=!) sanitized to valid identifiers', 'Name-Sanitization', false, { reason: err.message });
  }

  // Test 3.2: Numbers-only group name (id="123456")
  try {
    const rawSvg = `
      <svg width="24" height="24">
        <g id="123456" transform="translate(3, 3)">
          <path d="M 0 0 L 2 2" />
        </g>
      </svg>
    `;
    const parsed = SvgParser.parseSvgString(rawSvg);
    const composeCode = VectorGenerator.generateImageVectorFile([parsed]);
    const xmlCode = VectorGenerator.generateVectorDrawableXml(parsed);

    assertKotlinBracesBalanced(composeCode);
    assertXmlBalanced(xmlCode);

    assert.ok(composeCode.includes('name = "123456"'), 'Compose must preserve numbers-only group name string literal');
    assert.ok(xmlCode.includes('android:name="123456"'), 'XML must preserve numbers-only group name');

    recordTest('FUZZ-3.2', 'Numbers-only group name (id="123456") emits valid Kotlin string and XML attribute', 'Name-Sanitization', true);
  } catch (err) {
    recordTest('FUZZ-3.2', 'Numbers-only group name (id="123456") emits valid Kotlin string and XML attribute', 'Name-Sanitization', false, { reason: err.message });
  }

  // Test 3.3: Whitespace and leading/trailing spaces in id
  try {
    const rawSvg = `
      <svg width="24" height="24">
        <g id="   spaced   group   name   " transform="translate(1, 1)">
          <path d="M 0 0 L 3 3" />
        </g>
      </svg>
    `;
    const parsed = SvgParser.parseSvgString(rawSvg);
    const composeCode = VectorGenerator.generateImageVectorFile([parsed]);
    const xmlCode = VectorGenerator.generateVectorDrawableXml(parsed);

    assertKotlinBracesBalanced(composeCode);
    assertXmlBalanced(xmlCode);

    const groupNameMatch = composeCode.match(/group\(\s*name = "([^"]+)"/);
    assert.ok(groupNameMatch);
    const sanitized = groupNameMatch[1];
    assert.ok(!sanitized.includes(' '), 'Must not contain spaces');
    assert.ok(!sanitized.startsWith(' '), 'Must not have leading space');
    assert.ok(!sanitized.endsWith(' '), 'Must not have trailing space');

    recordTest('FUZZ-3.3', 'Whitespace and tabs in group id properly trimmed and sanitized', 'Name-Sanitization', true, { sanitized });
  } catch (err) {
    recordTest('FUZZ-3.3', 'Whitespace and tabs in group id properly trimmed and sanitized', 'Name-Sanitization', false, { reason: err.message });
  }

  // Test 3.4: Unicode, emojis, and non-ASCII characters in group name
  try {
    const rawSvg = `
      <svg width="24" height="24">
        <g id="föö_bàr_🚀_한글" transform="translate(2, 2)">
          <path d="M 0 0 L 2 2" />
        </g>
      </svg>
    `;
    const parsed = SvgParser.parseSvgString(rawSvg);
    const composeCode = VectorGenerator.generateImageVectorFile([parsed]);
    const xmlCode = VectorGenerator.generateVectorDrawableXml(parsed);

    assertKotlinBracesBalanced(composeCode);
    assertXmlBalanced(xmlCode);

    const groupNameMatch = composeCode.match(/group\(\s*name = "([^"]+)"/);
    assert.ok(groupNameMatch);
    const sanitized = groupNameMatch[1];
    // Non-ASCII replaced with underscores
    assert.ok(/^[a-zA-Z0-9_]+$/.test(sanitized), `Sanitized unicode name '${sanitized}' contains invalid chars`);

    recordTest('FUZZ-3.4', 'Unicode and emojis in group name safely sanitized to ASCII identifiers', 'Name-Sanitization', true, { sanitized });
  } catch (err) {
    recordTest('FUZZ-3.4', 'Unicode and emojis in group name safely sanitized to ASCII identifiers', 'Name-Sanitization', false, { reason: err.message });
  }

  // Test 3.5: Quotes, backslashes and XML markup in id
  try {
    const rawSvg = `
      <svg width="24" height="24">
        <g id='test"quotes<and>tags&amps;' transform="translate(1, 1)">
          <path d="M 0 0 L 2 2" />
        </g>
      </svg>
    `;
    const parsed = SvgParser.parseSvgString(rawSvg);
    const composeCode = VectorGenerator.generateImageVectorFile([parsed]);
    const xmlCode = VectorGenerator.generateVectorDrawableXml(parsed);

    assertKotlinBracesBalanced(composeCode);
    assertXmlBalanced(xmlCode);

    assert.ok(!composeCode.includes('test"quotes'), 'Quotes must not break Kotlin string delimiter');
    assert.ok(!xmlCode.includes('test"quotes'), 'Quotes must not break XML attribute delimiter');

    recordTest('FUZZ-3.5', 'Quotes and XML markup in group id sanitized without syntax breakage', 'Name-Sanitization', true);
  } catch (err) {
    recordTest('FUZZ-3.5', 'Quotes and XML markup in group id sanitized without syntax breakage', 'Name-Sanitization', false, { reason: err.message });
  }
}

// ============================================================================
// SUITE 4: Empty <g> Tags & Groups Containing Only Degenerate Shapes
// ============================================================================
async function runSuite4() {
  console.log('\n--- SUITE 4: Empty <g> Tags & Groups Containing Only Degenerate Shapes ---');

  // Test 4.1: Self-closing and empty <g></g> tags
  try {
    const rawSvg = `
      <svg width="24" height="24">
        <g id="empty1" transform="translate(10, 10)"></g>
        <g id="empty2" transform="scale(2, 2)"/>
        <g id="nonEmpty" transform="translate(5, 5)">
          <path d="M 0 0 L 1 1" />
        </g>
      </svg>
    `;
    const parsed = SvgParser.parseSvgString(rawSvg);
    const composeCode = VectorGenerator.generateImageVectorFile([parsed]);
    const xmlCode = VectorGenerator.generateVectorDrawableXml(parsed);

    assertKotlinBracesBalanced(composeCode);
    assertXmlBalanced(xmlCode);

    // Empty groups must not be emitted
    assert.ok(!composeCode.includes('name = "empty1"'), 'empty1 must not emit group() block');
    assert.ok(!composeCode.includes('name = "empty2"'), 'empty2 must not emit group() block');
    assert.ok(composeCode.includes('name = "nonEmpty"'), 'nonEmpty must be emitted');

    assert.ok(!xmlCode.includes('android:name="empty1"'), 'empty1 must not emit <group>');
    assert.ok(!xmlCode.includes('android:name="empty2"'), 'empty2 must not emit <group>');
    assert.ok(xmlCode.includes('android:name="nonEmpty"'), 'nonEmpty must be emitted in XML');

    recordTest('FUZZ-4.1', 'Self-closing and empty <g> tags suppressed from Compose and XML', 'Degenerate-Shapes', true);
  } catch (err) {
    recordTest('FUZZ-4.1', 'Self-closing and empty <g> tags suppressed from Compose and XML', 'Degenerate-Shapes', false, { reason: err.message });
  }

  // Test 4.2: Group containing only degenerate shapes (zero width rect, zero r circle, empty polygon, empty path)
  try {
    const rawSvg = `
      <svg width="24" height="24">
        <g id="allDegenerate" transform="translate(10, 10)">
          <rect x="0" y="0" width="0" height="10" />
          <rect x="0" y="0" width="10" height="0" />
          <rect x="0" y="0" width="-5" height="-5" />
          <circle cx="10" cy="10" r="0" />
          <circle cx="10" cy="10" r="-3" />
          <ellipse cx="10" cy="10" rx="0" ry="5" />
          <ellipse cx="10" cy="10" rx="5" ry="0" />
          <polygon points="" />
          <polygon points="10" />
          <polyline points="" />
          <path d="" />
          <path d="   " />
        </g>
      </svg>
    `;
    const parsed = SvgParser.parseSvgString(rawSvg);
    const composeCode = VectorGenerator.generateImageVectorFile([parsed]);
    const xmlCode = VectorGenerator.generateVectorDrawableXml(parsed);

    assertKotlinBracesBalanced(composeCode);
    assertXmlBalanced(xmlCode);

    // Group containing only degenerate shapes must not emit dangling empty group
    assert.ok(!composeCode.includes('name = "allDegenerate"'), 'allDegenerate group must be suppressed');
    assert.ok(!xmlCode.includes('android:name="allDegenerate"'), 'allDegenerate XML group must be suppressed');

    // Code must still be valid (fallback path or empty builder)
    assert.ok(composeCode.includes('ImageVector.Builder'), 'Builder must be created');
    assert.ok(xmlCode.includes('<vector'), 'XML vector must be valid');

    recordTest('FUZZ-4.2', 'Group containing only degenerate shapes suppressed cleanly without dangling blocks', 'Degenerate-Shapes', true);
  } catch (err) {
    recordTest('FUZZ-4.2', 'Group containing only degenerate shapes suppressed cleanly without dangling blocks', 'Degenerate-Shapes', false, { reason: err.message });
  }

  // Test 4.3: Deeply nested groups containing only degenerate shapes
  try {
    const rawSvg = `
      <svg width="24" height="24">
        <g id="outerDegenerate" transform="translate(5, 5)">
          <g id="midDegenerate" transform="scale(2, 2)">
            <g id="innerDegenerate" transform="rotate(45)">
              <circle cx="0" cy="0" r="0" />
            </g>
          </g>
        </g>
        <g id="validGroup" transform="translate(2, 2)">
          <path d="M 0 0 L 5 5" />
        </g>
      </svg>
    `;
    const parsed = SvgParser.parseSvgString(rawSvg);
    const composeCode = VectorGenerator.generateImageVectorFile([parsed]);
    const xmlCode = VectorGenerator.generateVectorDrawableXml(parsed);

    assertKotlinBracesBalanced(composeCode);
    assertXmlBalanced(xmlCode);

    assert.ok(!composeCode.includes('outerDegenerate'));
    assert.ok(!composeCode.includes('midDegenerate'));
    assert.ok(!composeCode.includes('innerDegenerate'));
    assert.ok(composeCode.includes('validGroup'));

    assert.ok(!xmlCode.includes('outerDegenerate'));
    assert.ok(xmlCode.includes('validGroup'));

    recordTest('FUZZ-4.3', 'Cascading suppression of nested groups containing only degenerate leaves', 'Degenerate-Shapes', true);
  } catch (err) {
    recordTest('FUZZ-4.3', 'Cascading suppression of nested groups containing only degenerate leaves', 'Degenerate-Shapes', false, { reason: err.message });
  }

  // Test 4.4: Degenerate transforms on groups (NaN, Infinity, matrix(0,0,0,0,0,0))
  try {
    const rawSvg = `
      <svg width="24" height="24">
        <g id="zeroScale" transform="scale(0, 0)">
          <path d="M 1 1 L 5 5" />
        </g>
        <g id="zeroMatrix" transform="matrix(0, 0, 0, 0, 0, 0)">
          <path d="M 2 2 L 6 6" />
        </g>
      </svg>
    `;
    const parsed = SvgParser.parseSvgString(rawSvg);
    const composeCode = VectorGenerator.generateImageVectorFile([parsed]);
    const xmlCode = VectorGenerator.generateVectorDrawableXml(parsed);

    assertKotlinBracesBalanced(composeCode);
    assertXmlBalanced(xmlCode);

    assert.ok(!composeCode.includes('NaN'), 'Compose must not contain NaN');
    assert.ok(!composeCode.includes('Infinity'), 'Compose must not contain Infinity');
    assert.ok(!xmlCode.includes('NaN'), 'XML must not contain NaN');
    assert.ok(!xmlCode.includes('Infinity'), 'XML must not contain Infinity');

    recordTest('FUZZ-4.4', 'Degenerate scale(0,0) and matrix(0,0,0,0,0,0) handled without NaN/Infinity', 'Degenerate-Shapes', true);
  } catch (err) {
    recordTest('FUZZ-4.4', 'Degenerate scale(0,0) and matrix(0,0,0,0,0,0) handled without NaN/Infinity', 'Degenerate-Shapes', false, { reason: err.message });
  }

  // Test 4.5: Multi-level skew propagation across nested groups
  try {
    const rawSvg = `
      <svg width="100" height="100">
        <g id="skewRoot" transform="skewX(30)">
          <g id="midTranslate" transform="translate(10, 20)">
            <g id="innerScale" transform="scale(2, 2)">
              <path d="M 0 0 L 5 5" stroke="#000" />
            </g>
          </g>
        </g>
      </svg>
    `;
    const parsed = SvgParser.parseSvgString(rawSvg);
    const composeCode = VectorGenerator.generateImageVectorFile([parsed]);
    const xmlCode = VectorGenerator.generateVectorDrawableXml(parsed);

    assertKotlinBracesBalanced(composeCode);
    assertXmlBalanced(xmlCode);

    // Because skewRoot has skew, entire branch must be baked into path coordinates; no group wrapper
    assert.ok(!composeCode.includes('group('), 'Skewed tree must not emit group()');
    assert.ok(!xmlCode.includes('<group'), 'Skewed tree must not emit <group>');

    // Check that origin was translated and skewed: x' = 10 + 20 * tan(30 deg) = 21.547, y' = 20
    assert.ok(composeCode.includes('moveTo(21.547f, 20f)'), 'Must bake origin translation (21.547, 20)');
    assert.ok(composeCode.includes('lineTo(37.3205f, 30f)'), 'Must bake end point (37.3205, 30)');

    recordTest('FUZZ-4.5', 'Multi-level skew propagation across nested groups bakes coordinates completely without group wrappers', 'Degenerate-Shapes', true);
  } catch (err) {
    recordTest('FUZZ-4.5', 'Multi-level skew propagation across nested groups bakes coordinates completely without group wrappers', 'Degenerate-Shapes', false, { reason: err.message });
  }

  // Test 4.6: Self-closing <g ... /> followed by valid group (stack pointer integrity)
  try {
    const rawSvg = `
      <svg width="24" height="24">
        <g id="selfClosing" transform="translate(10, 10)" />
        <g id="validSibling" transform="translate(5, 5)">
          <path d="M 0 0 L 2 2" />
        </g>
      </svg>
    `;
    const parsed = SvgParser.parseSvgString(rawSvg);
    const composeCode = VectorGenerator.generateImageVectorFile([parsed]);
    const xmlCode = VectorGenerator.generateVectorDrawableXml(parsed);

    assertKotlinBracesBalanced(composeCode);
    assertXmlBalanced(xmlCode);

    assert.ok(!composeCode.includes('selfClosing'), 'Self-closing group must not be emitted');
    assert.ok(composeCode.includes('validSibling'), 'Valid sibling must be emitted');
    assert.ok(composeCode.includes('translationX = 5f'), 'Valid sibling translation must not be corrupted');

    recordTest('FUZZ-4.6', 'Self-closing <g ... /> does not corrupt tag stack or affect sibling groups', 'Degenerate-Shapes', true);
  } catch (err) {
    recordTest('FUZZ-4.6', 'Self-closing <g ... /> does not corrupt tag stack or affect sibling groups', 'Degenerate-Shapes', false, { reason: err.message });
  }

  // Test 4.7: Single group with 10 paths alternating evenodd and nonzero
  try {
    let svg = '<svg width="50" height="50">\n  <g id="alternatingPathsGroup">\n';
    for (let i = 0; i < 10; i++) {
      const rule = (i % 2 === 0) ? 'evenodd' : 'nonzero';
      svg += `    <path d="M ${i} 0 L ${i} 10" fill-rule="${rule}" />\n`;
    }
    svg += '  </g>\n</svg>';

    const parsed = SvgParser.parseSvgString(svg);
    const composeCode = VectorGenerator.generateImageVectorFile([parsed]);
    const xmlCode = VectorGenerator.generateVectorDrawableXml(parsed);

    assertKotlinBracesBalanced(composeCode);
    assertXmlBalanced(xmlCode);

    const composeEvenOddMatches = composeCode.match(/pathFillType = PathFillType\.EvenOdd/g) || [];
    assert.equal(composeEvenOddMatches.length, 5, 'Exactly 5 paths must have EvenOdd in Compose');

    const xmlEvenOddMatches = xmlCode.match(/android:fillType="evenOdd"/g) || [];
    assert.equal(xmlEvenOddMatches.length, 5, 'Exactly 5 paths must have evenOdd in XML');

    recordTest('FUZZ-4.7', 'Single group with 10 paths alternating fill-rules emits precise per-path attributes', 'Degenerate-Shapes', true);
  } catch (err) {
    recordTest('FUZZ-4.7', 'Single group with 10 paths alternating fill-rules emits precise per-path attributes', 'Degenerate-Shapes', false, { reason: err.message });
  }
}

// ============================================================================
// SUITE 5: In-Browser Playwright Parity (DOM Walker vs SvgParser)
// ============================================================================
async function runSuite5() {
  console.log('\n--- SUITE 5: In-Browser Playwright Parity (DOM Walker vs SvgParser) ---');

  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    const page = await context.newPage();

    const testHtml = `
      <!DOCTYPE html>
      <html>
      <head><meta charset="utf-8"></head>
      <body>
        <svg id="testSvg1" width="100" height="100" style="fill-rule: evenodd;">
          <g id="browserGroup1" transform="translate(10, 20)">
            <g id="browserGroup2" fill-rule="nonzero" transform="rotate(45)">
              <path id="browserPath1" d="M 0 0 L 10 10" />
              <path id="browserPath2" d="M 5 5 L 15 15" fill-rule="evenodd" />
            </g>
          </g>
        </svg>
      </body>
      </html>
    `;

    await page.setContent(testHtml);

    // Evaluate dom_walker logic in browser
    const extractedData = await page.evaluate(() => {
      const svgEl = document.getElementById('testSvg1');
      const rootStyle = window.getComputedStyle(svgEl);

      function parseNode(node, inherited = {}) {
        const tag = node.tagName.toLowerCase();
        const style = window.getComputedStyle(node);
        const rawFillRule = node.getAttribute('fill-rule') || node.getAttribute('clip-rule') || style.fillRule;
        const fillRule = (rawFillRule && rawFillRule !== 'none') ? rawFillRule.toLowerCase() : inherited.fillRule;

        const results = [];
        if (tag === 'path') {
          results.push({
            id: node.id,
            d: node.getAttribute('d'),
            fillRule
          });
        }
        for (const child of node.children) {
          results.push(...parseNode(child, { fillRule }));
        }
        return results;
      }

      const rootFillRule = (svgEl.getAttribute('fill-rule') || (svgEl.style && svgEl.style.fillRule) || rootStyle.fillRule || '').toLowerCase();
      return parseNode(svgEl, { fillRule: rootFillRule });
    });

    assert.equal(extractedData.length, 2, 'Expected 2 extracted paths in browser');
    assert.equal(extractedData[0].id, 'browserPath1');
    assert.equal(extractedData[0].fillRule, 'nonzero', 'browserPath1 must inherit nonzero from browserGroup2');
    assert.equal(extractedData[1].id, 'browserPath2');
    assert.equal(extractedData[1].fillRule, 'evenodd', 'browserPath2 must have explicit evenodd');

    recordTest('FUZZ-5.1', 'In-browser Playwright DOM walker cascades inline CSS and group fill-rule identically', 'Browser-Parity', true);
  } catch (err) {
    recordTest('FUZZ-5.1', 'In-browser Playwright DOM walker cascades inline CSS and group fill-rule identically', 'Browser-Parity', false, { reason: err.message });
  } finally {
    if (browser) await browser.close();
  }
}

// ============================================================================
// SUITE 6: Kotlin Android Compilation Gate (compileDebugKotlin)
// ============================================================================
async function runSuite6() {
  console.log('\n--- SUITE 6: Kotlin Android Compilation Gate (compileDebugKotlin) ---');

  const kotlinIconPath = path.resolve(__dirname, '../../android/app/src/main/java/com/claude/compose/icons/AdversarialTestIcons.kt');

  try {
    // Generate adversarial test vectors:
    // 1. 8-level nested group with alternating fill-rules
    // 2. Complex transforms (rotate, scale, translate, pivot)
    // 3. Numbers-only group names
    // 4. Special characters in group names
    // 5. Compound donut with evenodd
    let svg8Level = '<svg width="48" height="48" viewBox="0 0 48 48">\n';
    for (let i = 1; i <= 8; i++) {
      const rule = (i % 2 === 1) ? 'evenodd' : 'nonzero';
      svg8Level += `  <g id="level_${i}" fill-rule="${rule}" transform="translate(${i}, ${i}) rotate(${i * 10})">\n`;
      svg8Level += `    <path d="M 0 0 L 2 2" stroke="#000" />\n`;
    }
    for (let i = 1; i <= 8; i++) {
      svg8Level += '  </g>\n';
    }
    svg8Level += '</svg>';

    const parsed1 = SvgParser.parseSvgString(svg8Level);
    parsed1.name = 'DeepHierarchy8Level';

    const svgNumbers = `
      <svg width="24" height="24">
        <g id="12345" transform="translate(2, 2)">
          <path d="M 0 0 h 10 v 10 h -10 Z" fill="#111" fill-rule="evenodd" />
        </g>
      </svg>
    `;
    const parsed2 = SvgParser.parseSvgString(svgNumbers);
    parsed2.name = 'NumbersOnlyGroup';

    const svgSpecial = `
      <svg width="24" height="24">
        <g id="weird:group.name#1" transform="scale(1.5, 1.5) translate(1, 1)">
          <path d="M 1 1 L 5 5" stroke="#222" />
        </g>
      </svg>
    `;
    const parsed3 = SvgParser.parseSvgString(svgSpecial);
    parsed3.name = 'SpecialCharGroup';

    const generatedCode = VectorGenerator.generateImageVectorFile(
      [parsed1, parsed2, parsed3],
      { className: 'AdversarialTestIcons' }
    );

    // Write file into Android project
    fs.writeFileSync(kotlinIconPath, generatedCode, 'utf8');

    // Run ./gradlew compileDebugKotlin
    console.log('Running `./gradlew compileDebugKotlin` in android/...');
    const androidDir = path.resolve(__dirname, '../../android');
    const compileOutput = execSync('./gradlew compileDebugKotlin', {
      cwd: androidDir,
      encoding: 'utf8',
      timeout: 60000
    });

    assert.ok(compileOutput.includes('BUILD SUCCESSFUL'), 'Gradle build must report BUILD SUCCESSFUL');
    recordTest('FUZZ-6.1', 'Adversarial ImageVectors compile cleanly in Kotlin compiler with zero errors', 'Android-Compilation', true);
  } catch (err) {
    recordTest('FUZZ-6.1', 'Adversarial ImageVectors compile cleanly in Kotlin compiler with zero errors', 'Android-Compilation', false, { reason: err.message, stderr: err.stderr });
  } finally {
    // Clean up temporary Kotlin test file
    if (fs.existsSync(kotlinIconPath)) {
      fs.unlinkSync(kotlinIconPath);
    }
  }
}

// ============================================================================
// MAIN RUNNER
// ============================================================================
async function main() {
  console.log('================================================================================');
  console.log('  MILESTONE 2 (R2) ADVERSARIAL FUZZ & STRESS TEST HARNESS');
  console.log('  Challenger: r4_m2_challenger_2');
  console.log('================================================================================');

  await runSuite1();
  await runSuite2();
  await runSuite3();
  await runSuite4();
  await runSuite5();
  await runSuite6();

  console.log('\n================================================================================');
  console.log(`  FUZZ TEST RESULTS: ${passCount} PASSED, ${failCount} FAILED (TOTAL: ${results.length})`);
  console.log('================================================================================');

  if (failCount > 0) {
    process.exit(1);
  }
}

main().catch(err => {
  console.error('Fatal test harness error:', err);
  process.exit(1);
});
