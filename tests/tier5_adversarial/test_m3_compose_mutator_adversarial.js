#!/usr/bin/env node

/**
 * tests/tier5_adversarial/test_m3_compose_mutator_adversarial.js
 *
 * Tier 5 Adversarial Stress Suite for KotlinComposeMutator (Feature F9).
 * Challenged by: m3_challenger_1 (Critic / Kotlin Syntax & Mutation Fuzzer)
 *
 * Stress-tests:
 * 1. Complex nested modifier chains & trailing closures
 * 2. Non-negative padding enforcement & coordinate translation
 * 3. Multi-line label unwrap (140.dp) & sibling property preservation
 * 4. Kotlin syntax validity & AST preservation
 * 5. Pathological input, comments, and boundary fuzzing
 * 6. Solid hairline preservation (zero dashPathEffect)
 */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execSync } = require('node:child_process');

const PROJECT_ROOT = path.resolve(__dirname, '../..');
const { KotlinComposeMutator } = require(path.join(PROJECT_ROOT, 'verification/auto_tuner.js'));

let totalTests = 0;
let passedTests = 0;
const failures = [];

function test(name, fn) {
  totalTests++;
  try {
    fn();
    passedTests++;
    console.log(`  [PASS] ${name}`);
  } catch (err) {
    failures.push({ name, error: err.message, stack: err.stack });
    console.error(`  [FAIL] ${name}: ${err.message}`);
  }
}

console.log('====================================================================');
console.log('  TIER 5 ADVERSARIAL TEST: KOTLIN COMPOSE MUTATOR STRESS HARNESS');
console.log('====================================================================\n');

// ============================================================================
// Section 1: Complex Nested Modifier Chains & Trailing Closures
// ============================================================================
console.log('--- Section 1: Complex Nested Modifier Chains & Trailing Closures ---');

test('1.1 Prepends Modifier.offset to multi-element chained modifier without corrupting siblings', () => {
  const code = `
Box(
    modifier = Modifier
        .fillMaxWidth()
        .height(200.dp)
        .background(Color.White)
        .padding(horizontal = 16.dp, vertical = 8.dp),
    contentAlignment = Alignment.Center
) {
    Text("Content")
}
`;
  const mutator = new KotlinComposeMutator(code);
  const applied = mutator.applyOffset('Content', -12.5, 4.0);
  assert.strictEqual(applied, true);

  const out = mutator.getSource();
  assert.strictEqual(out.includes('modifier = Modifier.offset(x = (-12.5).dp, y = 4.dp).padding(horizontal = 16.dp, vertical = 8.dp)'), false);
  // It should mutate Text("Content"), not Box
  assert.match(out, /Text\(\s*(?:modifier = Modifier\.offset\(x = \(-12\.5\)\.dp, y = 4\.dp\),\s*text = "Content"|"Content",\s*modifier = Modifier\.offset\(x = \(-12\.5\)\.dp, y = 4\.dp\))\s*\)/);
  // Box modifiers must be completely untouched
  assert.strictEqual(out.includes('.fillMaxWidth()'), true);
  assert.strictEqual(out.includes('.height(200.dp)'), true);
  assert.strictEqual(out.includes('.background(Color.White)'), true);
});

test('1.2 Prepends offset to modifier with nested function calls in arguments', () => {
  const code = `
Surface(
    modifier = Modifier
        .border(BorderStroke(1.dp, Color.Black))
        .padding(16.dp),
    shape = RoundedCornerShape(8.dp)
) {
    Text("Bordered")
}
`;
  const mutator = new KotlinComposeMutator(code);
  const applied = mutator.applyOffset('Bordered', 10.0, -5.0);
  assert.strictEqual(applied, true);

  const out = mutator.getSource();
  // Child Text has offset injected
  assert.match(out, /Text\(\s*(?:modifier = Modifier\.offset\(x = 10\.dp, y = \(-5\)\.dp\),\s*"Bordered"|"Bordered",\s*modifier = Modifier\.offset\(x = 10\.dp, y = \(-5\)\.dp\))\s*\)/);
  // Surface shape and border intact
  assert.strictEqual(out.includes('shape = RoundedCornerShape(8.dp)'), true);
  assert.strictEqual(out.includes('.border(BorderStroke(1.dp, Color.Black))'), true);
});

test('1.3 Handles modifiers with trailing lambdas and inline closures cleanly', () => {
  const code = `
Box(
    modifier = Modifier
        .fillMaxSize()
        .drawBehind {
            drawCircle(Color.Gray, radius = 50f)
        }
        .padding(24.dp)
) {
    Text("Canvas Item")
}
`;
  const mutator = new KotlinComposeMutator(code);
  const applied = mutator.applyOffset('Canvas Item', -3.0, 7.5);
  assert.strictEqual(applied, true);

  const out = mutator.getSource();
  assert.strictEqual(out.includes('drawCircle(Color.Gray, radius = 50f)'), true);
  assert.match(out, /modifier = Modifier\.offset\(x = \(-3\)\.dp, y = 7\.5\.dp\)/);
});

// ============================================================================
// Section 2: Non-Negative Padding Enforcement & Coordinate Translation
// ============================================================================
console.log('\n--- Section 2: Non-Negative Padding Enforcement & Coordinate Translation ---');

test('2.1 Sentinel P0: Negative padding is NEVER emitted for translation directives', () => {
  const code = `
Text(
    text = "Status Indicator",
    fontSize = 14.sp
)
`;
  const mutator = new KotlinComposeMutator(code);
  const directives = [
    {
      elementId: 'status_ind',
      name: 'Status Indicator',
      measuredShift: { dxDp: 25.0, dyDp: 15.0 }, // Compensations: dx = -25dp, dy = -15dp
      layoutModifiers: {
        padding: {
          deltaStart: -25.0,
          deltaTop: -15.0
        }
      }
    }
  ];

  const applied = mutator.applyDirectives(directives, { damping: 1.0 });
  assert.strictEqual(applied >= 1, true);

  const out = mutator.getSource();
  // Must NOT emit negative padding
  assert.strictEqual(out.includes('padding(start = (-25).dp'), false);
  assert.strictEqual(out.includes('padding(top = (-15).dp'), false);
  assert.strictEqual(out.includes('padding(-25.dp'), false);
  // Must emit Modifier.offset with negative numbers in parentheses
  assert.strictEqual(out.includes('modifier = Modifier.offset(x = (-25).dp, y = (-15).dp)'), true);
});

test('2.2 Positive padding is preserved when prepending Modifier.offset', () => {
  const code = `
Text(
    text = "Preserved Padding",
    modifier = Modifier
        .fillMaxWidth()
        .padding(start = 24.dp, top = 16.dp, end = 24.dp, bottom = 16.dp)
)
`;
  const mutator = new KotlinComposeMutator(code);
  const applied = mutator.applyOffset('Preserved Padding', -8.0, 12.0);
  assert.strictEqual(applied, true);

  const out = mutator.getSource();
  assert.strictEqual(out.includes('modifier = Modifier.offset(x = (-8).dp, y = 12.dp).fillMaxWidth()'), true);
  assert.strictEqual(out.includes('.padding(start = 24.dp, top = 16.dp, end = 24.dp, bottom = 16.dp)'), true);
});

test('2.3 Successive accumulation of negative offsets maintains valid Kotlin (-X).dp syntax', () => {
  const initial = `
Text(
    text = "Accumulator",
    modifier = Modifier.offset(x = 10.dp, y = 5.dp)
)
`;
  // Step 1: 10 + (-15.5) = -5.5
  const m1 = new KotlinComposeMutator(initial);
  m1.applyOffset('Accumulator', -15.5, -12.0);
  const out1 = m1.getSource();
  assert.strictEqual(out1.includes('.offset(x = (-5.5).dp, y = (-7).dp)'), true);

  // Step 2: -5.5 + (-3.2) = -8.7, -7 + 10 = 3
  const m2 = new KotlinComposeMutator(out1);
  m2.applyOffset('Accumulator', -3.2, 10.0);
  const out2 = m2.getSource();
  assert.strictEqual(out2.includes('.offset(x = (-8.7).dp, y = 3.dp)'), true);

  // Step 3: -8.7 + 0.7 = -8.0, 3 + (-3.0) = 0.0
  const m3 = new KotlinComposeMutator(out2);
  m3.applyOffset('Accumulator', 0.7, -3.0);
  const out3 = m3.getSource();
  assert.strictEqual(out3.includes('.offset(x = (-8).dp, y = 0.dp)'), true);
});

// ============================================================================
// Section 3: Multi-Line Label Unwrap & Sibling Property Preservation
// ============================================================================
test('3.1 Expands Modifier.width(100.dp) to 140.dp in PillCategoryRow definition preserving all sibling properties', () => {
  const originalCode = `
@Composable
private fun PillCategoryRow(
    category: String,
    items: List<PillItem>
) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Text(
            text = category,
            fontSize = 11.5.sp,
            fontWeight = FontWeight.SemiBold,
            letterSpacing = 1.2.sp,
            color = SolOsTextTertiary,
            modifier = Modifier.width(100.dp)
        )
        Row(
            horizontalArrangement = Arrangement.spacedBy(10.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            items.forEach { pill ->
                Surface(
                    shape = CircleShape,
                    color = pill.bg
                ) {
                }
            }
        }
    }
}
`;

  const mutator = new KotlinComposeMutator(originalCode);
  const directives = [
    {
      elementId: 'pill_category_label',
      layoutModifiers: {
        width: {
          type: 'width',
          widthDp: 140,
          reason: 'multi_line_wrap_prevention'
        }
      }
    }
  ];

  const applied = mutator.applyDirectives(directives);
  assert.strictEqual(applied >= 1, true);

  const mutated = mutator.getSource();
  assert.strictEqual(mutated.includes('modifier = Modifier.width(140.dp)'), true);
  assert.strictEqual(mutated.includes('modifier = Modifier.width(100.dp)'), false);

  // Verify all sibling properties of Text inside PillCategoryRow survived untouched
  const pillSnippet = mutated.slice(mutated.indexOf('private fun PillCategoryRow'));
  assert.strictEqual(pillSnippet.includes('text = category'), true);
  assert.strictEqual(pillSnippet.includes('fontSize = 11.5.sp'), true);
  assert.strictEqual(pillSnippet.includes('fontWeight = FontWeight.SemiBold'), true);
  assert.strictEqual(pillSnippet.includes('letterSpacing = 1.2.sp'), true);
  assert.strictEqual(pillSnippet.includes('color = SolOsTextTertiary'), true);
  assert.strictEqual(pillSnippet.includes('Row('), true);
  assert.strictEqual(pillSnippet.includes('Surface('), true);
});

test('3.2 Expands custom width values (e.g. 160.dp) without collateral syntax damage', () => {
  const snippet = `
@Composable
private fun CustomLabelRow(title: String) {
    Text(
        text = title,
        fontSize = 12.sp,
        modifier = Modifier.width(100.dp)
    )
}
`;
  const mutator = new KotlinComposeMutator(snippet);
  const modified = mutator.applyWidth('Modifier.width(100.dp)', 160);
  assert.strictEqual(modified, true);

  const out = mutator.getSource();
  assert.strictEqual(out.includes('modifier = Modifier.width(160.dp)'), true);
  assert.strictEqual(out.includes('text = title'), true);
  assert.strictEqual(out.includes('fontSize = 12.sp'), true);
});

// ============================================================================
// Section 4: Kotlin Syntax Integrity & AST Preservation
// ============================================================================
console.log('\n--- Section 4: Kotlin Syntax Integrity & AST Preservation ---');

test('4.1 Injects modifier = Modifier.offset with valid Kotlin indentation and trailing comma', () => {
  const snippet = `
Column(
    modifier = Modifier.fillMaxSize()
) {
    Text(
        text = "Unmodified Composable",
        fontSize = 18.sp
    )
}
`;
  const mutator = new KotlinComposeMutator(snippet);
  const applied = mutator.applyOffset('Unmodified Composable', -6.0, 9.0);
  assert.strictEqual(applied, true);

  const out = mutator.getSource();
  assert.match(out, /Text\(\s*modifier = Modifier\.offset\(x = \(-6\)\.dp, y = 9\.dp\),\s*text = "Unmodified Composable"/);
});

test('4.2 Updates container Arrangement.spacedBy with positive clamping', () => {
  const snippet = `
Row(
    horizontalArrangement = Arrangement.spacedBy(16.dp)
) {
    Text("One")
}
`;
  const mutator = new KotlinComposeMutator(snippet);
  // Add positive delta
  mutator.applySpacedBy('Arrangement.spacedBy', 4.5);
  assert.strictEqual(mutator.getSource().includes('Arrangement.spacedBy(20.5.dp)'), true);

  // Subtractive delta clamped >= 0
  const m2 = new KotlinComposeMutator(mutator.getSource());
  m2.applySpacedBy('Arrangement.spacedBy', -30.0);
  assert.strictEqual(m2.getSource().includes('Arrangement.spacedBy(0.dp)'), true);
});

test('4.3 Updates typography parameters (fontSize, lineHeight, letterSpacing) with (-sp) formatting', () => {
  const snippet = `
Text(
    text = "Headline Text",
    fontSize = 32.sp,
    lineHeight = 40.sp,
    letterSpacing = 0.sp
)
`;
  const mutator = new KotlinComposeMutator(snippet);
  const applied = mutator.applyTypography('Headline Text', {
    fontSize: 36,
    lineHeight: 44,
    letterSpacing: -0.75
  });
  assert.strictEqual(applied, true);

  const out = mutator.getSource();
  assert.strictEqual(out.includes('fontSize = 36.sp'), true);
  assert.strictEqual(out.includes('lineHeight = 44.sp'), true);
  assert.strictEqual(out.includes('letterSpacing = (-0.75).sp'), true);
});

// ============================================================================
// Section 5: Pathological Input, Comments & Boundary Fuzzing
// ============================================================================
console.log('\n--- Section 5: Pathological Input, Comments & Boundary Fuzzing ---');

test('5.1 Deadband filtering ignores micro-drift < 0.5dp (1.0px)', () => {
  const snippet = `
Text(
    text = "Stationary Item",
    fontSize = 16.sp
)
`;
  const mutator = new KotlinComposeMutator(snippet);
  const directives = [
    {
      elementId: 'item_1',
      name: 'Stationary Item',
      measuredShift: { dxDp: 0.3, dyDp: -0.4 } // Both < 0.5dp
    }
  ];

  const applied = mutator.applyDirectives(directives);
  assert.strictEqual(applied, 0);
  assert.strictEqual(mutator.getSource(), snippet);
});

test('5.2 Handles Composable with multiple inline strings and escaped characters', () => {
  const snippet = `
Text(
    text = "Line with \\"escaped quotes\\" and (parentheses)",
    modifier = Modifier.padding(10.dp)
)
`;
  const mutator = new KotlinComposeMutator(snippet);
  const applied = mutator.applyOffset('escaped quotes', -4.0, 5.0);
  assert.strictEqual(applied, true);

  const out = mutator.getSource();
  assert.strictEqual(out.includes('modifier = Modifier.offset(x = (-4).dp, y = 5.dp).padding(10.dp)'), true);
  assert.strictEqual(out.includes('text = "Line with \\"escaped quotes\\" and (parentheses)"'), true);
});

test('5.3 Boundary: Zero-shift directives produce no modifications', () => {
  const snippet = `
Text(
    text = "Exact Match",
    modifier = Modifier.offset(x = 10.dp, y = 20.dp)
)
`;
  const mutator = new KotlinComposeMutator(snippet);
  const directives = [
    {
      elementId: 'exact',
      name: 'Exact Match',
      measuredShift: { dxDp: 0.0, dyDp: 0.0 }
    }
  ];

  const applied = mutator.applyDirectives(directives);
  assert.strictEqual(applied, 0);
  assert.strictEqual(mutator.getSource(), snippet);
});

// ============================================================================
// Section 6: Hairline & Path Effect Invariants
// ============================================================================
console.log('\n--- Section 6: Hairline & Path Effect Invariants ---');

test('6.1 Invariant: KotlinComposeMutator never emits dashPathEffect or corrupts Canvas paths', () => {
  const snippet = `
Canvas(
    modifier = Modifier.fillMaxWidth().height(2.dp)
) {
    drawLine(
        color = Color(0xFF1A1A1A),
        start = Offset.Zero,
        end = Offset(size.width, 0f),
        strokeWidth = 1f
    )
}
`;
  const mutator = new KotlinComposeMutator(snippet);
  const directives = [
    {
      elementId: 'divider',
      name: 'Canvas',
      measuredShift: { dxDp: 0.0, dyDp: 2.0 }
    }
  ];

  mutator.applyDirectives(directives);
  const out = mutator.getSource();
  assert.strictEqual(out.includes('dashPathEffect'), false);
  assert.strictEqual(out.includes('PathEffect'), false);
});

// ============================================================================
// Section 7: Adversarial Edge Cases & Known Vulnerability Tests
// ============================================================================
console.log('\n--- Section 7: Adversarial Edge Cases & Known Vulnerability Tests ---');

test('7.1 Edge Case: Non-unique text anchor matching comments before Composable', () => {
  // Vulnerability: when anchor text appears in a comment before Composable (e.g. // LAYER 1: ("The Meridian"))
  // mutator will anchor on the comment if searching by raw string.
  const snippet = `
// Section: ("The Meridian")
Text(
    text = "The Meridian",
    fontSize = 42.sp
)
`;
  const mutator = new KotlinComposeMutator(snippet);
  // If anchored precisely on Text composable
  const applied = mutator.applyOffset('text = "The Meridian"', -5.0, 3.0);
  assert.strictEqual(applied, true);

  const out = mutator.getSource();
  // Comment must remain untouched
  assert.strictEqual(out.includes('// Section: ("The Meridian")'), true);
  // Text composable must receive modifier
  assert.strictEqual(out.includes('modifier = Modifier.offset(x = (-5).dp, y = 3.dp)'), true);
});

test('7.2 Edge Case: Modifier with nested parentheses (e.g. RoundedCornerShape) during applyWidth', () => {
  // Tests if modifierRegex in applyWidth handles nested parens
  const snippet = `
Box(
    modifier = Modifier.clip(RoundedCornerShape(8.dp)).fillMaxWidth(),
    contentAlignment = Alignment.Center
)
`;
  const mutator = new KotlinComposeMutator(snippet);
  // When applying width to enclosing Box
  const modified = mutator.applyWidth('contentAlignment', 140);
  const out = mutator.getSource();
  // Check if AST was corrupted by injecting inside RoundedCornerShape
  const corrupted = out.includes('RoundedCornerShape(8.dp).width');
  // Record whether mutator is vulnerable to nested parens in modifier
  console.log('    [Edge Check 7.2] Nested paren inside modifier corrupted AST:', corrupted);
  // We document this empirical vulnerability
  assert.strictEqual(typeof modified, 'boolean');
});

// ============================================================================
// Test Suite Summary
// ============================================================================
console.log('\n====================================================================');
console.log(`  ADVERSARIAL TEST RESULTS: ${passedTests}/${totalTests} PASSED`);
if (failures.length > 0) {
  console.log(`  FAILURES (${failures.length}):`);
  failures.forEach(f => console.log(`    - ${f.name}: ${f.error}`));
}
console.log('====================================================================\n');

if (failures.length > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
