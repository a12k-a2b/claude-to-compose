#!/usr/bin/env node

/**
 * ============================================================================
 * Adversarial Stress & Empirical Verification Suite: Milestone 2 (R2)
 * Hierarchical Compose group() & Fill-Rule DSL Synthesizer
 *
 * Executed by: r4_m2_challenger_1 (Role: critic, specialist)
 * Working Directory: /Users/anjan/.gemini/antigravity/scratch/claude_to_compose
 * Targets:
 *   - Compose ImageVector Kotlin synthesis & Gradle compilation (compileDebugKotlin)
 *   - Android VectorDrawable XML generation & AAPT2 resource processing (processDebugResources)
 *   - Mathematical skew detection invariant (|ac + bd| > 10^-4) and coordinate baking
 *   - Fill-rule cascading, compound geometries, and adversarial boundary cases
 * ============================================================================
 */

const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { execSync } = require('node:child_process');

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

function assertClose(actual, expected, eps = 1e-3, msg = '') {
  const diff = Math.abs(actual - expected);
  if (diff > eps) {
    throw new Error(`${msg}: expected ${actual} to be within ${eps} of ${expected} (diff: ${diff})`);
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

  const groupOpen = (xml.match(/<group[\s>]/g) || []).length;
  const groupClose = (xml.match(/<\/group>/g) || []).length;
  assert.equal(groupOpen, groupClose, 'Mismatched <group> tags');

  const pathMatches = (xml.match(/<path[\s\S]*?\/>/g) || []).length;
  const unclosedPaths = (xml.match(/<path[\s\S]*?(?!(\/>|>[\s\S]*?<\/path>))/g) || []).length;
  assert.ok(pathMatches > 0, 'Must have at least one self-closing path');
}

const PROJECT_ROOT = path.resolve(__dirname, '../..');
const ANDROID_DIR = path.join(PROJECT_ROOT, 'android');
const KOTLIN_ICONS_DIR = path.join(ANDROID_DIR, 'app/src/main/java/com/claude/compose/icons');
const RES_DRAWABLE_DIR = path.join(ANDROID_DIR, 'app/src/main/res/drawable');

// ============================================================================
// SUITE 1: Compose ImageVector Kotlin Synthesis & Real Gradle Compilation
// ============================================================================
async function runSuite1() {
  console.log('\n======================================================================');
  console.log(' SUITE 1: Compose ImageVector Kotlin Synthesis & Gradle Compilation');
  console.log('======================================================================');

  // Test 1.1: Multi-level nested groups (4 levels) with heterogeneous transforms & evenOdd
  const complexSvg1 = `
    <svg width="48" height="48" viewBox="0 0 48 48" fill-rule="evenodd">
      <g id="RootContainer" transform="translate(4, 6)">
        <g id="SubCanvas" transform="rotate(30) scale(1.2, 1.2)">
          <g id="ToolbarGroup" transform="translate(10, 10)">
            <g id="ActionBadge" transform="scale(0.8, 0.8) rotate(15)">
              <path d="M 0 0 L 20 0 L 20 20 L 0 20 Z M 4 4 L 16 4 L 16 16 L 4 16 Z"
                    fill="#4F46E5" stroke="#FFFFFF" stroke-width="2"
                    stroke-linecap="round" stroke-linejoin="round" />
            </g>
          </g>
        </g>
      </g>
    </svg>
  `;

  // Test 1.2: Complex donut geometry with cutout and sibling groups
  const complexSvg2 = `
    <svg width="64" height="64" viewBox="0 0 64 64">
      <g id="ParentSystem" transform="translate(8, 8)">
        <g id="DonutGlyph" transform="scale(1.5, 1.5)" fill-rule="evenodd">
          <path d="M 16 2 A 14 14 0 1 0 16 30 A 14 14 0 1 0 16 2 Z M 16 8 A 8 8 0 1 1 16 24 A 8 8 0 1 1 16 8 Z"
                fill="#10B981" />
        </g>
        <g id="AccentMarker" transform="translate(20, 20) rotate(45)">
          <path d="M 0 0 L 8 8" stroke="#EF4444" stroke-width="3" stroke-linecap="round" />
          <path d="M 8 0 L 0 8" stroke="#EF4444" stroke-width="3" stroke-linecap="round" />
        </g>
      </g>
    </svg>
  `;

  // Test 1.3: Deeply nested hierarchy (10 levels)
  let deepSvg = '<svg width="100" height="100">';
  const levels = 10;
  for (let i = 1; i <= levels; i++) {
    deepSvg += `<g id="deep_level_${i}" transform="translate(1, 1)">`;
  }
  deepSvg += '<path d="M 0 0 L 5 5 Z" fill="#333333" fill-rule="evenodd" />';
  for (let i = 1; i <= levels; i++) {
    deepSvg += '</g>';
  }
  deepSvg += '</svg>';

  // Test 1.4: Group name sanitization with Kotlin keywords and special characters
  const keywordSvg = `
    <svg width="32" height="32">
      <g id="val-123_test$@class" transform="translate(2, 3)">
        <path d="M 0 0 L 4 4" stroke="#000" />
      </g>
    </svg>
  `;

  const parsed1 = SvgParser.parseSvgString(complexSvg1);
  const parsed2 = SvgParser.parseSvgString(complexSvg2);
  const parsed3 = SvgParser.parseSvgString(deepSvg);
  const parsed4 = SvgParser.parseSvgString(keywordSvg);

  parsed1.name = 'ComplexActionBadge';
  parsed2.name = 'DonutWithMarker';
  parsed3.name = 'DeepTenLevel';
  parsed4.name = 'KeywordSanitized';

  try {
    const kotlinCode = VectorGenerator.generateImageVectorFile(
      [parsed1, parsed2, parsed3, parsed4],
      {
        packageName: 'com.claude.compose.icons',
        className: 'M2StressTestIcons'
      }
    );

    // Verify DSL syntax & structure invariants
    assert.ok(kotlinCode.includes('public object M2StressTestIcons'), 'Must declare M2StressTestIcons object');
    assert.ok(kotlinCode.includes('import androidx.compose.ui.graphics.vector.group'), 'Must import group');
    assert.ok(kotlinCode.includes('import androidx.compose.ui.graphics.PathFillType'), 'Must import PathFillType');
    assert.ok(kotlinCode.includes('pathFillType = PathFillType.EvenOdd'), 'Must emit PathFillType.EvenOdd');
    assert.ok(kotlinCode.includes('rotate = 30f') || kotlinCode.includes('rotate = 30.0f'), 'Must emit rotate for rotation');
    assert.ok(!kotlinCode.includes('rotation ='), 'Must NEVER emit rotation = in Compose group');
    assert.ok(!kotlinCode.includes('val-123_test$@class'), 'Must sanitize special characters in group names');
    assertKotlinBracesBalanced(kotlinCode);

    recordTest('STRESS-1.1', 'Synthesize 4-icon complex ImageVector Kotlin file with 4-level nesting and evenOdd', 'Kotlin-DSL', true);

    // Write to android source folder and run real compiler
    const targetFile = path.join(KOTLIN_ICONS_DIR, 'M2StressTestIcons.kt');
    fs.writeFileSync(targetFile, kotlinCode, 'utf8');

    console.log('       [Gradle] Compiling generated Kotlin file via ./gradlew compileDebugKotlin...');
    const gradlewCmd = process.platform === 'win32' ? 'gradlew.bat' : './gradlew';
    const gradleOutput = execSync(`${gradlewCmd} compileDebugKotlin`, {
      cwd: ANDROID_DIR,
      encoding: 'utf8',
      timeout: 120000
    });

    assert.ok(
      gradleOutput.includes('BUILD SUCCESSFUL'),
      'Gradle compileDebugKotlin must succeed'
    );

    recordTest('STRESS-1.2', 'Full Gradle compileDebugKotlin compiles generated M2 Kotlin ImageVectors cleanly (0 errors)', 'Gradle-Kotlin', true, {
      outputSummary: 'BUILD SUCCESSFUL'
    });

    // Cleanup generated file so repo is clean
    if (fs.existsSync(targetFile)) {
      fs.unlinkSync(targetFile);
    }
  } catch (err) {
    const targetFile = path.join(KOTLIN_ICONS_DIR, 'M2StressTestIcons.kt');
    if (fs.existsSync(targetFile)) fs.unlinkSync(targetFile);
    recordTest('STRESS-1.1', 'Synthesize 4-icon complex ImageVector Kotlin file with 4-level nesting and evenOdd', 'Kotlin-DSL', false, { reason: err.message });
    recordTest('STRESS-1.2', 'Full Gradle compileDebugKotlin compiles generated M2 Kotlin ImageVectors cleanly (0 errors)', 'Gradle-Kotlin', false, { reason: err.message });
  }
}

// ============================================================================
// SUITE 2: Android VectorDrawable XML Emission & Real AAPT2 Compilation
// ============================================================================
async function runSuite2() {
  console.log('\n======================================================================');
  console.log(' SUITE 2: Android VectorDrawable XML Emission & Real AAPT2 Compilation');
  console.log('======================================================================');

  // Test 2.1: Multi-level nested <group> with evenOdd and negative scale (reflection)
  const stressXmlSvg = `
    <svg width="48" height="48" viewBox="0 0 48 48">
      <g id="OuterContainer" transform="translate(6, 12)">
        <g id="RotatedCluster" transform="rotate(-45) scale(1, -1)">
          <g id="NestedBadge" transform="translate(4, 4)">
            <path d="M 0 0 L 12 0 L 12 12 L 0 12 Z M 3 3 L 9 3 L 9 9 L 3 9 Z"
                  fill="#F59E0B"
                  fill-rule="evenodd"
                  stroke="#1E293B"
                  stroke-width="1.5"
                  stroke-linecap="round"
                  stroke-linejoin="bevel" />
            <path d="M 6 0 L 6 12" stroke="#FFFFFF" stroke-width="1" />
          </g>
        </g>
        <g id="SiblingMarker" transform="translate(24, 0)">
          <path d="M 0 0 L 6 6 L 12 0" stroke="#000000" stroke-width="2" />
        </g>
      </g>
    </svg>
  `;

  try {
    const parsed = SvgParser.parseSvgString(stressXmlSvg);
    const xml = VectorGenerator.generateVectorDrawableXml(parsed);

    assertXmlBalanced(xml);
    assert.ok(xml.includes('android:fillType="evenOdd"'), 'Must emit android:fillType="evenOdd"');
    assert.ok(xml.includes('android:name="OuterContainer"'), 'Must emit android:name="OuterContainer"');
    assert.ok(xml.includes('android:name="RotatedCluster"'), 'Must emit android:name="RotatedCluster"');
    assert.ok(xml.includes('android:translateX="6"'), 'Must emit android:translateX="6"');
    assert.ok(xml.includes('android:translateY="12"'), 'Must emit android:translateY="12"');
    assert.ok(xml.includes('android:rotation='), 'Must emit android:rotation');
    assert.ok(xml.includes('android:scaleY="-1"'), 'Must emit reflection android:scaleY="-1"');

    recordTest('STRESS-2.1', 'Synthesize complex VectorDrawable XML with nested <group>, evenOdd, reflection', 'XML-Emission', true);

    // Write to android res/drawable folder and run AAPT2 resource compiler
    const targetXmlFile = path.join(RES_DRAWABLE_DIR, 'ic_m2_stress_test.xml');
    fs.writeFileSync(targetXmlFile, xml, 'utf8');

    console.log('       [Gradle] Validating XML resource structure via ./gradlew :app:processDebugResources...');
    const gradlewCmd = process.platform === 'win32' ? 'gradlew.bat' : './gradlew';
    const gradleOutput = execSync(`${gradlewCmd} :app:processDebugResources`, {
      cwd: ANDROID_DIR,
      encoding: 'utf8',
      timeout: 120000
    });

    assert.ok(
      gradleOutput.includes('BUILD SUCCESSFUL'),
      'Gradle processDebugResources must succeed with exit code 0'
    );

    recordTest('STRESS-2.2', 'Full AAPT2 processDebugResources processes synthesized XML with zero errors', 'AAPT2-XML', true, {
      outputSummary: 'BUILD SUCCESSFUL'
    });

    // Cleanup generated XML file
    if (fs.existsSync(targetXmlFile)) {
      fs.unlinkSync(targetXmlFile);
    }
  } catch (err) {
    const targetXmlFile = path.join(RES_DRAWABLE_DIR, 'ic_m2_stress_test.xml');
    if (fs.existsSync(targetXmlFile)) fs.unlinkSync(targetXmlFile);
    recordTest('STRESS-2.1', 'Synthesize complex VectorDrawable XML with nested <group>, evenOdd, reflection', 'XML-Emission', false, { reason: err.message });
    recordTest('STRESS-2.2', 'Full AAPT2 processDebugResources processes synthesized XML with zero errors', 'AAPT2-XML', false, { reason: err.message });
  }
}

// ============================================================================
// SUITE 3: Skew Transform Invariant & Coordinate Baking (|ac + bd| > 10^-4)
// ============================================================================
async function runSuite3() {
  console.log('\n======================================================================');
  console.log(' SUITE 3: Skew Transform Invariant & Coordinate Baking (|ac + bd| > 10^-4)');
  console.log('======================================================================');

  // Test 3.1: Sheared transform skewX(30) -> bakes coordinates, zero group emitted
  try {
    const svg = `
      <svg width="24" height="24">
        <g id="SkewXGroup" transform="skewX(30)">
          <path d="M 0 0 L 10 0 L 10 10 L 0 10 Z" fill="#000" />
        </g>
      </svg>
    `;
    const parsed = SvgParser.parseSvgString(svg);
    const code = VectorGenerator.generateImageVectorFile([parsed]);
    const xml = VectorGenerator.generateVectorDrawableXml(parsed);

    // Skew MUST be baked: no group( or <group> should be emitted for SkewXGroup
    assert.ok(!code.includes('name = "SkewXGroup"'), 'Compose must NOT emit group() for skewed group');
    assert.ok(!code.includes('group('), 'Compose must have zero group() statements');
    assert.ok(!xml.includes('android:name="SkewXGroup"'), 'XML must NOT emit <group> for skewed group');
    assert.ok(!xml.includes('<group'), 'XML must have zero <group> tags');

    // tan(30 deg) = 0.577350269...
    // For y = 10, x' = x + y * tan(30) = 10 + 5.7735 = 15.7735
    assert.ok(code.includes('15.7735'), 'Coordinates must be baked using affine skewX matrix');
    assert.ok(xml.includes('15.7735'), 'XML pathData must contain baked coordinates');
    assertKotlinBracesBalanced(code);
    assertXmlBalanced(xml);

    recordTest('STRESS-3.1', 'Sheared skewX(30) bakes directly into path coordinates (zero group emitted)', 'Skew-Baking', true);
  } catch (err) {
    recordTest('STRESS-3.1', 'Sheared skewX(30) bakes directly into path coordinates (zero group emitted)', 'Skew-Baking', false, { reason: err.message });
  }

  // Test 3.2: Sheared transform skewY(20) -> bakes coordinates, zero group emitted
  try {
    const svg = `
      <svg width="24" height="24">
        <g id="SkewYGroup" transform="skewY(20)">
          <path d="M 0 0 L 10 0 L 10 10 L 0 10 Z" fill="#000" />
        </g>
      </svg>
    `;
    const parsed = SvgParser.parseSvgString(svg);
    const code = VectorGenerator.generateImageVectorFile([parsed]);
    const xml = VectorGenerator.generateVectorDrawableXml(parsed);

    assert.ok(!code.includes('name = "SkewYGroup"'), 'Must NOT emit group() for skewY');
    assert.ok(!code.includes('group('), 'Must have zero group() statements');
    assert.ok(!xml.includes('<group'), 'XML must have zero <group> tags');

    // tan(20 deg) = 0.36397023...
    // For x = 10, y' = y + x * tan(20) = 0 + 3.6397 = 3.6397
    assert.ok(code.includes('3.6397'), 'Coordinates must be baked using affine skewY matrix');
    assertKotlinBracesBalanced(code);
    assertXmlBalanced(xml);

    recordTest('STRESS-3.2', 'Sheared skewY(20) bakes directly into path coordinates (zero group emitted)', 'Skew-Baking', true);
  } catch (err) {
    recordTest('STRESS-3.2', 'Sheared skewY(20) bakes directly into path coordinates (zero group emitted)', 'Skew-Baking', false, { reason: err.message });
  }

  // Test 3.3: Arbitrary sheared matrix matrix(1, 0.5, 0.2, 1, 10, 20)
  // a = 1, b = 0.5, c = 0.2, d = 1 -> ac + bd = (1)(0.2) + (0.5)(1) = 0.7 > 10^-4
  try {
    const svg = `
      <svg width="50" height="50">
        <g id="GeneralSheared" transform="matrix(1 0.5 0.2 1 10 20)">
          <path d="M 0 0 L 5 5 Z" stroke="#000" />
        </g>
      </svg>
    `;
    const parsed = SvgParser.parseSvgString(svg);
    const code = VectorGenerator.generateImageVectorFile([parsed]);
    const xml = VectorGenerator.generateVectorDrawableXml(parsed);

    assert.ok(!code.includes('name = "GeneralSheared"'), 'Must NOT emit group() for general sheared matrix');
    assert.ok(!xml.includes('android:name="GeneralSheared"'), 'Must NOT emit <group> for general sheared matrix');
    // x' = 1*0 + 0.2*0 + 10 = 10; y' = 0.5*0 + 1*0 + 20 = 20 -> M 10 20
    // x' = 1*5 + 0.2*5 + 10 = 16; y' = 0.5*5 + 1*5 + 20 = 27.5 -> L 16 27.5
    assert.ok(code.includes('10f') && code.includes('20f'), 'Must transform origin with translation');
    assert.ok(code.includes('16f') && code.includes('27.5f'), 'Must transform endpoint with shear + translation');
    assertKotlinBracesBalanced(code);
    assertXmlBalanced(xml);

    recordTest('STRESS-3.3', 'General sheared matrix(1, 0.5, 0.2, 1, 10, 20) baked without group()', 'Skew-Baking', true);
  } catch (err) {
    recordTest('STRESS-3.3', 'General sheared matrix(1, 0.5, 0.2, 1, 10, 20) baked without group()', 'Skew-Baking', false, { reason: err.message });
  }

  // Test 3.4: Skew decision boundary: |ac + bd| threshold epsilon = 1e-4
  // Case A: ac + bd = 1.05e-4 > 1e-4 -> hasSkew = true -> bake coordinates, suppress group()
  // Case B: ac + bd = 0.95e-4 <= 1e-4 -> hasSkew = false -> preserve group()
  try {
    // Construct matrix A: a=1, b=0, c=1.05e-4, d=1 -> ac + bd = 1.05e-4 > 1e-4
    const matA = [1, 0, 0.000105, 1, 0, 0];
    const decompA = VectorGenerator.decomposeMatrix(matA);
    assert.equal(decompA.hasSkew, true, 'ac + bd = 1.05e-4 must trigger hasSkew = true');

    // Construct matrix B: a=1, b=0, c=0.000095, d=1 -> ac + bd = 0.95e-4 <= 1e-4
    const matB = [1, 0, 0.000095, 1, 0, 0];
    const decompB = VectorGenerator.decomposeMatrix(matB);
    assert.equal(decompB.hasSkew, false, 'ac + bd = 0.95e-4 must trigger hasSkew = false');

    recordTest('STRESS-3.4', 'Mathematical precision boundary at |ac + bd| = 10^-4 correctly discriminates skew vs orthogonal', 'Boundary', true, {
      aboveThreshold: decompA.hasSkew,
      belowThreshold: decompB.hasSkew
    });
  } catch (err) {
    recordTest('STRESS-3.4', 'Mathematical precision boundary at |ac + bd| = 10^-4 correctly discriminates skew vs orthogonal', 'Boundary', false, { reason: err.message });
  }

  // Test 3.5: Mixed hierarchy: Orthogonal parent <g> preserved, skewed child <g> baked
  try {
    const mixedSvg = `
      <svg width="40" height="40">
        <g id="OrthogonalParent" transform="translate(15, 25)">
          <g id="SkewedChild" transform="skewX(20)">
            <path d="M 0 0 L 10 10" stroke="#000" />
          </g>
        </g>
      </svg>
    `;
    const parsed = SvgParser.parseSvgString(mixedSvg);
    const code = VectorGenerator.generateImageVectorFile([parsed]);
    const xml = VectorGenerator.generateVectorDrawableXml(parsed);

    // Parent group MUST be preserved as group() / <group>
    assert.ok(code.includes('name = "OrthogonalParent"'), 'Must emit group() for orthogonal parent');
    assert.ok(code.includes('translationX = 15f'), 'Must preserve translationX');
    assert.ok(code.includes('translationY = 25f'), 'Must preserve translationY');
    assert.ok(xml.includes('android:name="OrthogonalParent"'), 'Must emit <group> for orthogonal parent');

    // Child group MUST NOT emit a nested group() / <group>
    assert.ok(!code.includes('name = "SkewedChild"'), 'Must NOT emit group() for skewed child');
    assert.ok(!xml.includes('android:name="SkewedChild"'), 'Must NOT emit <group> for skewed child');

    assertKotlinBracesBalanced(code);
    assertXmlBalanced(xml);

    recordTest('STRESS-3.5', 'Mixed hierarchy: Orthogonal parent <g> preserved as group(), skewed child <g> baked', 'Mixed-Hierarchy', true);
  } catch (err) {
    recordTest('STRESS-3.5', 'Mixed hierarchy: Orthogonal parent <g> preserved as group(), skewed child <g> baked', 'Mixed-Hierarchy', false, { reason: err.message });
  }
}

// ============================================================================
// SUITE 4: Fill-Rule Cascading, Donut Shapes, & Style Properties
// ============================================================================
async function runSuite4() {
  console.log('\n======================================================================');
  console.log(' SUITE 4: Fill-Rule Cascading, Donut Shapes, & Style Properties');
  console.log('======================================================================');

  // Test 4.1: Root <svg> cascaded fill-rule="evenodd" to multiple groups and paths
  try {
    const svg = `
      <svg width="24" height="24" fill-rule="evenodd">
        <g id="g1">
          <path d="M 0 0 L 10 10 Z" />
          <g id="g2">
            <path d="M 2 2 L 8 8 Z" />
          </g>
        </g>
      </svg>
    `;
    const parsed = SvgParser.parseSvgString(svg);
    const code = VectorGenerator.generateImageVectorFile([parsed]);
    const xml = VectorGenerator.generateVectorDrawableXml(parsed);

    const evenOddCountKotlin = (code.match(/pathFillType = PathFillType\.EvenOdd/g) || []).length;
    assert.equal(evenOddCountKotlin, 2, 'Both paths must inherit EvenOdd from root SVG in Kotlin');

    const evenOddCountXml = (xml.match(/android:fillType="evenOdd"/g) || []).length;
    assert.equal(evenOddCountXml, 2, 'Both paths must inherit evenOdd in XML');

    recordTest('STRESS-4.1', 'Root <svg fill-rule="evenodd"> cascades to all leaf paths across nested groups', 'Fill-Rule', true);
  } catch (err) {
    recordTest('STRESS-4.1', 'Root <svg fill-rule="evenodd"> cascades to all leaf paths across nested groups', 'Fill-Rule', false, { reason: err.message });
  }

  // Test 4.2: Child path explicit fill-rule="nonzero" overrides parent <g fill-rule="evenodd">
  try {
    const svg = `
      <svg width="24" height="24">
        <g id="container" fill-rule="evenodd">
          <path id="child1" d="M 0 0 L 1 1 Z" />
          <path id="child2" d="M 2 2 L 3 3 Z" fill-rule="nonzero" />
        </g>
      </svg>
    `;
    const parsed = SvgParser.parseSvgString(svg);
    const code = VectorGenerator.generateImageVectorFile([parsed]);
    const xml = VectorGenerator.generateVectorDrawableXml(parsed);

    const evenOddCountKotlin = (code.match(/pathFillType = PathFillType\.EvenOdd/g) || []).length;
    assert.equal(evenOddCountKotlin, 1, 'Only child1 must have EvenOdd in Kotlin');

    const evenOddCountXml = (xml.match(/android:fillType="evenOdd"/g) || []).length;
    assert.equal(evenOddCountXml, 1, 'Only child1 must have evenOdd in XML');

    recordTest('STRESS-4.2', 'Child path explicit fill-rule="nonzero" overrides parent <g evenodd>', 'Fill-Rule', true);
  } catch (err) {
    recordTest('STRESS-4.2', 'Child path explicit fill-rule="nonzero" overrides parent <g evenodd>', 'Fill-Rule', false, { reason: err.message });
  }

  // Test 4.3: Inline CSS style cascading style="fill-rule: evenodd; fill: #FF0000"
  try {
    const svg = `
      <svg width="24" height="24">
        <g style="fill-rule: evenodd; stroke: #333333">
          <path d="M 0 0 L 5 5 Z" />
        </g>
      </svg>
    `;
    const parsed = SvgParser.parseSvgString(svg);
    const code = VectorGenerator.generateImageVectorFile([parsed]);
    const xml = VectorGenerator.generateVectorDrawableXml(parsed);

    assert.ok(code.includes('pathFillType = PathFillType.EvenOdd'), 'Must parse fill-rule from style attribute in Kotlin');
    assert.ok(xml.includes('android:fillType="evenOdd"'), 'Must parse fill-rule from style attribute in XML');

    recordTest('STRESS-4.3', 'Inline CSS style="fill-rule: evenodd" parsed and cascaded to leaf paths', 'Fill-Rule', true);
  } catch (err) {
    recordTest('STRESS-4.3', 'Inline CSS style="fill-rule: evenodd" parsed and cascaded to leaf paths', 'Fill-Rule', false, { reason: err.message });
  }
}

// ============================================================================
// SUITE 5: Adversarial Boundary & Stress Cases
// ============================================================================
async function runSuite5() {
  console.log('\n======================================================================');
  console.log(' SUITE 5: Adversarial Boundary & Stress Cases');
  console.log('======================================================================');

  // Test 5.1: Empty <g></g> and self-closing <g transform="..." /> with whitespace
  try {
    const svg = `
      <svg width="24" height="24">
        <g id="empty1" transform="translate(10, 10)"></g>
        <g id="empty2" transform="scale(2, 2)" />
        <g id="populated" transform="translate(5, 5)">
          <path d="M 0 0 L 2 2" stroke="#000" />
        </g>
      </svg>
    `;
    const parsed = SvgParser.parseSvgString(svg);
    const code = VectorGenerator.generateImageVectorFile([parsed]);
    const xml = VectorGenerator.generateVectorDrawableXml(parsed);

    // Empty groups should NOT emit empty group() blocks or empty <group> tags
    assert.ok(!code.includes('name = "empty1"'), 'Must prune empty group1');
    assert.ok(!code.includes('name = "empty2"'), 'Must prune empty group2');
    assert.ok(code.includes('name = "populated"'), 'Must keep populated group');

    assert.ok(!xml.includes('android:name="empty1"'), 'Must prune empty group1 in XML');
    assert.ok(!xml.includes('android:name="empty2"'), 'Must prune empty group2 in XML');
    assert.ok(xml.includes('android:name="populated"'), 'Must keep populated group in XML');

    assertKotlinBracesBalanced(code);
    assertXmlBalanced(xml);

    recordTest('STRESS-5.1', 'Empty <g></g> and self-closing <g /> tags pruned without emitting invalid empty blocks', 'Adversarial', true);
  } catch (err) {
    recordTest('STRESS-5.1', 'Empty <g></g> and self-closing <g /> tags pruned without emitting invalid empty blocks', 'Adversarial', false, { reason: err.message });
  }

  // Test 5.2: Degenerate matrix (det = 0, scale = 0)
  try {
    const m = [0, 0, 0, 0, 10, 20];
    const decomp = VectorGenerator.decomposeMatrix(m);
    assert.equal(decomp.scaleX, 0);
    assert.equal(decomp.scaleY, 0);
    assert.ok(!Number.isNaN(decomp.rotate), 'Rotation must not be NaN');
    assert.ok(Number.isFinite(decomp.rotate), 'Rotation must be finite');

    const svg = `
      <svg width="24" height="24">
        <g transform="matrix(0 0 0 0 10 20)">
          <path d="M 0 0 L 5 5" />
        </g>
      </svg>
    `;
    const parsed = SvgParser.parseSvgString(svg);
    const code = VectorGenerator.generateImageVectorFile([parsed]);
    assert.ok(!code.includes('NaN'), 'Generated Kotlin must not contain NaN');
    assertKotlinBracesBalanced(code);

    recordTest('STRESS-5.2', 'Degenerate matrix with zero determinant handled safely without NaN or Infinity', 'Adversarial', true);
  } catch (err) {
    recordTest('STRESS-5.2', 'Degenerate matrix with zero determinant handled safely without NaN or Infinity', 'Adversarial', false, { reason: err.message });
  }

  // Test 5.3: Deep hierarchy (15 levels of nested <g>)
  try {
    let svg = '<svg width="200" height="200">';
    const depth = 15;
    for (let i = 1; i <= depth; i++) {
      svg += `<g id="lvl_${i}" transform="translate(1, 1)">`;
    }
    svg += '<path d="M 0 0 L 2 2" stroke="#000" />';
    for (let i = 1; i <= depth; i++) {
      svg += '</g>';
    }
    svg += '</svg>';

    const parsed = SvgParser.parseSvgString(svg);
    const code = VectorGenerator.generateImageVectorFile([parsed]);
    const xml = VectorGenerator.generateVectorDrawableXml(parsed);

    // Verify 15 nested group openings
    const groupMatches = code.match(/group\s*\(/g) || [];
    assert.equal(groupMatches.length, depth, `Expected ${depth} group() statements`);

    const xmlGroupMatches = xml.match(/<group[\s>]/g) || [];
    assert.equal(xmlGroupMatches.length, depth, `Expected ${depth} <group> tags`);

    assertKotlinBracesBalanced(code);
    assertXmlBalanced(xml);

    recordTest('STRESS-5.3', '15-level deeply nested <g> hierarchy generates well-balanced Kotlin and XML', 'Adversarial', true);
  } catch (err) {
    recordTest('STRESS-5.3', '15-level deeply nested <g> hierarchy generates well-balanced Kotlin and XML', 'Adversarial', false, { reason: err.message });
  }

  // Test 5.4: Primitive shape normalization inside transformed groups
  try {
    const svg = `
      <svg width="60" height="60" fill-rule="evenodd">
        <g id="PrimitivesGroup" transform="translate(10, 10) rotate(45)">
          <rect x="0" y="0" width="20" height="20" rx="4" fill="#4F46E5" />
          <circle cx="10" cy="10" r="5" fill="#FFFFFF" />
          <polygon points="5,5 15,5 10,15" fill="#EF4444" />
        </g>
      </svg>
    `;
    const parsed = SvgParser.parseSvgString(svg);
    const code = VectorGenerator.generateImageVectorFile([parsed]);
    const xml = VectorGenerator.generateVectorDrawableXml(parsed);

    // All primitives should be normalized into paths inside PrimitivesGroup
    assert.ok(code.includes('name = "PrimitivesGroup"'), 'Must emit group for PrimitivesGroup');
    const pathMatches = code.match(/path\s*\(/g) || [];
    assert.equal(pathMatches.length, 3, 'All 3 normalized primitives must emit path() statements');

    const xmlPaths = xml.match(/<path[\s\S]*?\/>/g) || [];
    assert.equal(xmlPaths.length, 3, 'All 3 normalized primitives must emit <path> in XML');

    assertKotlinBracesBalanced(code);
    assertXmlBalanced(xml);

    recordTest('STRESS-5.4', 'Normalized SVG primitives (<rect>, <circle>, <polygon>) inside transformed <g> emit valid paths', 'Primitives-Group', true);
  } catch (err) {
    recordTest('STRESS-5.4', 'Normalized SVG primitives (<rect>, <circle>, <polygon>) inside transformed <g> emit valid paths', 'Primitives-Group', false, { reason: err.message });
  }
}

// ============================================================================
// SUITE 6: Matrix Decomposition & Orthogonal Reconstruction Empirical Oracles
// ============================================================================
async function runSuite6() {
  console.log('\n======================================================================');
  console.log(' SUITE 6: Matrix Decomposition & Orthogonal Reconstruction Oracles');
  console.log('======================================================================');

  // Test 6.1: Pure rotation matrix decomposition
  try {
    const deg = 37.5;
    const rad = deg * Math.PI / 180;
    const m = [Math.cos(rad), Math.sin(rad), -Math.sin(rad), Math.cos(rad), 0, 0];
    const decomp = VectorGenerator.decomposeMatrix(m);
    assertClose(decomp.rotate, deg, 1e-2, 'Pure rotation angle');
    assertClose(decomp.scaleX, 1, 1e-3, 'Pure rotation scaleX');
    assertClose(decomp.scaleY, 1, 1e-3, 'Pure rotation scaleY');
    assert.equal(decomp.hasSkew, false);
    recordTest('STRESS-6.1', 'Pure rotation matrix decomp preserves exact angle and unit scales', 'Matrix-Oracle', true);
  } catch (err) {
    recordTest('STRESS-6.1', 'Pure rotation matrix decomp preserves exact angle and unit scales', 'Matrix-Oracle', false, { reason: err.message });
  }

  // Test 6.2: Non-uniform scale with translation
  try {
    const m = [2.5, 0, 0, -3.5, 14.2, -8.7];
    const decomp = VectorGenerator.decomposeMatrix(m);
    assertClose(decomp.scaleX, 2.5, 1e-3, 'scaleX');
    assertClose(decomp.scaleY, -3.5, 1e-3, 'scaleY');
    assertClose(decomp.translationX, 14.2, 1e-3, 'translationX');
    assertClose(decomp.translationY, -8.7, 1e-3, 'translationY');
    assert.equal(decomp.hasSkew, false);
    recordTest('STRESS-6.2', 'Non-uniform scale + translation preserves dimensions and signs', 'Matrix-Oracle', true);
  } catch (err) {
    recordTest('STRESS-6.2', 'Non-uniform scale + translation preserves dimensions and signs', 'Matrix-Oracle', false, { reason: err.message });
  }

  // Test 6.3: Orthogonality dot-product invariant
  try {
    // For any orthogonal matrix (rotation + scale), column vectors dot product must be zero: a*c + b*d = 0
    const angles = [-90, -45, 0, 30, 60, 90, 180, 270];
    const scales = [[1, 1], [2, 3], [0.5, 2], [1, -1], [-2, -2]];
    for (const a of angles) {
      const rad = a * Math.PI / 180;
      for (const [sx, sy] of scales) {
        const mat = [sx * Math.cos(rad), sx * Math.sin(rad), -sy * Math.sin(rad), sy * Math.cos(rad), 0, 0];
        const dot = mat[0] * mat[2] + mat[1] * mat[3];
        assertClose(dot, 0, 1e-6, `Orthogonality dot product at angle ${a}, scale [${sx}, ${sy}]`);
        const decomp = VectorGenerator.decomposeMatrix(mat);
        assert.equal(decomp.hasSkew, false, `hasSkew must be false for orthogonal matrix at ${a} deg`);
      }
    }
    recordTest('STRESS-6.3', 'Orthogonality invariant (|ac + bd| = 0) verified across 40 rotation/scale configurations', 'Matrix-Oracle', true);
  } catch (err) {
    recordTest('STRESS-6.3', 'Orthogonality invariant (|ac + bd| = 0) verified across 40 rotation/scale configurations', 'Matrix-Oracle', false, { reason: err.message });
  }
}

// ============================================================================
// MAIN RUNNER
// ============================================================================
async function main() {
  console.log('======================================================================');
  console.log(' STARTING R4 M2 EMPIRICAL CHALLENGER STRESS SUITE');
  console.log('======================================================================');

  await runSuite1();
  await runSuite2();
  await runSuite3();
  await runSuite4();
  await runSuite5();
  await runSuite6();

  console.log('\n======================================================================');
  console.log(' STRESS TEST SUMMARY');
  console.log('======================================================================');
  console.log(`Total Tests Run:  ${results.length}`);
  console.log(`Passed:           \x1b[32m${passCount}\x1b[0m`);
  console.log(`Failed:           \x1b[31m${failCount}\x1b[0m`);

  if (failCount > 0) {
    console.log('\nFAILED TESTS:');
    for (const r of results.filter(x => !x.passed)) {
      console.log(`  - [${r.id}] ${r.name}: ${r.details.reason || 'Failed'}`);
    }
    process.exit(1);
  } else {
    console.log('\n\x1b[32mALL EMPIRICAL STRESS TESTS PASSED WITH ZERO ERRORS.\x1b[0m');
    process.exit(0);
  }
}

main().catch(err => {
  console.error('Unhandled runner error:', err);
  process.exit(1);
});
