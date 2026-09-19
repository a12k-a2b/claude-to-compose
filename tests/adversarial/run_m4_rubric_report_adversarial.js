#!/usr/bin/env node

/**
 * ============================================================================
 * Adversarial Challenge Suite: Audit Rubric & Verification Report Generator
 * Challenger 2 for Milestone M4 (R4 Dual Verification Suite)
 * ============================================================================
 */

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const PROJECT_ROOT = path.resolve(__dirname, '../..');
const {
  RUBRIC_CRITERIA,
  RUBRIC_DIMENSIONS,
  PASS_THRESHOLD,
  VETO_THRESHOLD,
  InvalidScoreError,
  IncompleteRubricError,
  validateDimensionScore,
  validateDimensionCount,
  auditTouchTarget,
  computeVisualQaScore,
  evaluateRubric,
  auditSynthesizedCode
} = require(path.join(PROJECT_ROOT, 'verification/audit_rubric.js'));

const {
  generateVerificationReport,
  generateReportMarkdown,
  escapeMarkdown,
  renderImageMarkdown,
  validateReportInputs,
  generateVerdictBanner,
  EmptyReportDataError
} = require(path.join(PROJECT_ROOT, 'verification/report_generator.js'));

const results = [];

function recordTest(id, name, category, passed, details = {}) {
  results.push({ id, name, category, passed, details });
  const statusBadge = passed ? '\x1b[32m[PASS]\x1b[0m' : '\x1b[31m[FAIL]\x1b[0m';
  console.log(`${statusBadge} [${id}] ${name}`);
  if (!passed) {
    console.log(`       \x1b[33mReason: ${details.reason}\x1b[0m`);
    if (details.error) console.log(`       Error: ${details.error}`);
  }
}

async function runSuite() {
  console.log('='.repeat(80));
  console.log('CHALLENGER 2: EMPIRICAL ADVERSARIAL STRESS TEST SUITE (M4 AUDIT & REPORT)');
  console.log('='.repeat(80));

  // --------------------------------------------------------------------------
  // SECTION 1: Out-of-bounds scores (< 0, > 10, strings, NaN, Infinity)
  // --------------------------------------------------------------------------
  console.log('\n--- Section 1: Out-of-bounds Scores & Type Enforcement ---');

  const negativeScores = [-1, -0.0001, -50, -Infinity];
  for (const s of negativeScores) {
    let threw = false;
    let errName = '';
    try {
      validateDimensionScore(s);
    } catch (e) {
      threw = e instanceof InvalidScoreError || e.name === 'InvalidScoreError';
      errName = e.name;
    }
    recordTest(
      `OOB_NEG_${s}`,
      `validateDimensionScore rejects negative score: ${s}`,
      'Rubric Score Bounds',
      threw,
      { error: errName }
    );
  }

  const excessScores = [10.0001, 11, 25, 100, Infinity];
  for (const s of excessScores) {
    let threw = false;
    let errName = '';
    try {
      validateDimensionScore(s);
    } catch (e) {
      threw = e instanceof InvalidScoreError || e.name === 'InvalidScoreError';
      errName = e.name;
    }
    recordTest(
      `OOB_EXC_${s}`,
      `validateDimensionScore rejects excessive score: ${s}`,
      'Rubric Score Bounds',
      threw,
      { error: errName }
    );
  }

  const nonNumberScores = [
    { label: 'string_number_10', val: '10' },
    { label: 'string_number_0', val: '0' },
    { label: 'string_word', val: 'perfect' },
    { label: 'empty_string', val: '' },
    { label: 'boolean_true', val: true },
    { label: 'boolean_false', val: false },
    { label: 'null_val', val: null },
    { label: 'undefined_val', val: undefined },
    { label: 'nan_val', val: NaN },
    { label: 'object_empty', val: {} },
    { label: 'array_val', val: [8] }
  ];

  for (const item of nonNumberScores) {
    let threw = false;
    let errName = '';
    try {
      validateDimensionScore(item.val);
    } catch (e) {
      threw = e instanceof InvalidScoreError || e.name === 'InvalidScoreError';
      errName = e.name;
    }
    recordTest(
      `OOB_TYPE_${item.label}`,
      `validateDimensionScore rejects non-number ${item.label} (${String(item.val)})`,
      'Rubric Score Types',
      threw,
      { error: errName }
    );
  }

  // evaluateRubric with out-of-bounds in array
  {
    const invalidArrays = [
      { label: 'negative_in_array', arr: [10, 10, 10, 10, 10, 10, 10, 10, 10, -1] },
      { label: 'excess_in_array', arr: [10, 10, 10, 10, 10, 10, 10, 10, 10, 11] },
      { label: 'nan_in_array', arr: [10, 10, 10, 10, 10, 10, 10, 10, 10, NaN] },
      { label: 'string_in_array', arr: [10, 10, 10, 10, 10, 10, 10, 10, 10, '9'] },
      { label: 'infinity_in_array', arr: [10, 10, 10, 10, 10, 10, 10, 10, 10, Infinity] },
      { label: 'obj_neg_score', arr: [10, 10, 10, 10, 10, 10, 10, 10, 10, { score: -2 }] },
      { label: 'obj_excess_score', arr: [10, 10, 10, 10, 10, 10, 10, 10, 10, { score: 15 }] }
    ];

    for (const testCase of invalidArrays) {
      let threw = false;
      let errName = '';
      try {
        evaluateRubric(testCase.arr);
      } catch (e) {
        threw = e instanceof InvalidScoreError || e.name === 'InvalidScoreError';
        errName = e.name;
      }
      recordTest(
        `EVAL_ARR_${testCase.label}`,
        `evaluateRubric throws InvalidScoreError for ${testCase.label}`,
        'evaluateRubric Bounds',
        threw,
        { error: errName }
      );
    }
  }

  // --------------------------------------------------------------------------
  // SECTION 2: Missing categories (< 10 categories) and dimension count checks
  // --------------------------------------------------------------------------
  console.log('\n--- Section 2: Missing Categories & Incomplete Rubrics ---');

  const incompleteInputs = [
    { label: 'empty_array', input: [] },
    { label: 'array_of_1', input: [10] },
    { label: 'array_of_5', input: [10, 9, 8, 10, 9] },
    { label: 'array_of_9', input: [10, 10, 10, 10, 10, 10, 10, 10, 10] },
    { label: 'array_of_11', input: [10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10] },
    { label: 'empty_object', input: {} },
    { label: 'object_of_3', input: { layout: 10, color: 10, typography: 10 } },
    { label: 'object_of_9', input: {
      layout: 10, color: 10, typography: 10, touchTargets: 10,
      ripple: 10, elevation: 10, responsive: 10, states: 10, theme: 10
    }},
    { label: 'object_of_11', input: {
      layout: 10, color: 10, typography: 10, touchTargets: 10,
      ripple: 10, elevation: 10, responsive: 10, states: 10, theme: 10,
      codeHygiene: 10, extraDimension: 10
    }},
    { label: 'null_input', input: null },
    { label: 'undefined_input', input: undefined },
    { label: 'number_input', input: 42 },
    { label: 'string_input', input: 'all_tens' }
  ];

  for (const testCase of incompleteInputs) {
    let threw = false;
    let errName = '';
    try {
      evaluateRubric(testCase.input);
    } catch (e) {
      threw = e instanceof IncompleteRubricError || e.name === 'IncompleteRubricError';
      errName = e.name;
    }
    recordTest(
      `INCOMPLETE_${testCase.label}`,
      `evaluateRubric throws IncompleteRubricError for ${testCase.label}`,
      'Rubric Category Count',
      threw,
      { error: errName }
    );
  }

  // Also verify validateDimensionCount directly
  {
    let threwUnder = false;
    try {
      validateDimensionCount(new Array(9).fill(10));
    } catch (e) {
      threwUnder = e instanceof IncompleteRubricError || e.name === 'IncompleteRubricError';
    }
    recordTest('DIM_COUNT_UNDER', 'validateDimensionCount(length=9) throws IncompleteRubricError', 'Rubric Dimension Count', threwUnder);

    let threwOver = false;
    try {
      validateDimensionCount(new Array(11).fill(10));
    } catch (e) {
      threwOver = e instanceof IncompleteRubricError || e.name === 'IncompleteRubricError';
    }
    recordTest('DIM_COUNT_OVER', 'validateDimensionCount(length=11) throws IncompleteRubricError', 'Rubric Dimension Count', threwOver);

    let passedExact = false;
    try {
      passedExact = validateDimensionCount(new Array(10).fill(10)) === true;
    } catch (e) {
      passedExact = false;
    }
    recordTest('DIM_COUNT_EXACT_10', 'validateDimensionCount(length=10) returns true', 'Rubric Dimension Count', passedExact);
  }

  // --------------------------------------------------------------------------
  // SECTION 3: Veto Logic & Score Thresholds
  // --------------------------------------------------------------------------
  console.log('\n--- Section 3: Veto & Passing Threshold Logic ---');

  // Case 1: Score 91/100 with one category score 4 -> Must FAIL due to veto!
  {
    const scores91Veto = [10, 10, 10, 10, 10, 10, 10, 10, 7, 4]; // sum = 91
    const res = evaluateRubric(scores91Veto);
    const sumCorrect = res.totalScore === 91;
    const vetoFlagged = res.hasVeto === true && res.veto === true;
    const passedFalse = res.passed === false;
    const recContainsVeto = res.recommendations.some(r => r.includes('CRITICAL VETO'));

    recordTest(
      'VETO_91_SCORE',
      'Score 91/100 with category score 4 fails due to automatic veto',
      'Veto Logic',
      sumCorrect && vetoFlagged && passedFalse && recContainsVeto,
      { totalScore: res.totalScore, hasVeto: res.hasVeto, passed: res.passed }
    );
  }

  // Case 2: Score 94/100 with one category score 4 (nine 10s and one 4) -> Must FAIL due to veto!
  {
    const scores94Veto = [10, 10, 10, 10, 10, 10, 10, 10, 10, 4]; // sum = 94
    const res = evaluateRubric(scores94Veto);
    recordTest(
      'VETO_94_SCORE',
      'Score 94/100 (nine 10s, one 4) fails due to automatic veto',
      'Veto Logic',
      res.totalScore === 94 && res.hasVeto === true && res.passed === false,
      { totalScore: res.totalScore, hasVeto: res.hasVeto, passed: res.passed }
    );
  }

  // Case 3: Score 90/100 with one category score 0 (nine 10s and one 0) -> Must FAIL due to veto!
  {
    const scores90Veto = [10, 10, 10, 10, 10, 10, 10, 10, 10, 0]; // sum = 90
    const res = evaluateRubric(scores90Veto);
    recordTest(
      'VETO_90_ZERO_SCORE',
      'Score 90/100 with category score 0 fails due to automatic veto',
      'Veto Logic',
      res.totalScore === 90 && res.hasVeto === true && res.passed === false,
      { totalScore: res.totalScore, hasVeto: res.hasVeto, passed: res.passed }
    );
  }

  // Case 4: Category score 4.999 (sub-5 float) -> Must trigger veto
  {
    const scoresSub5Float = [10, 10, 10, 10, 10, 10, 10, 10, 10, 4.99]; // sum = 94.99
    const res = evaluateRubric(scoresSub5Float);
    recordTest(
      'VETO_SUB5_FLOAT',
      'Score 4.99 (< 5) triggers automatic veto',
      'Veto Logic',
      res.hasVeto === true && res.passed === false,
      { totalScore: res.totalScore, hasVeto: res.hasVeto }
    );
  }

  // Case 5: Category score exactly 5.0 -> NOT vetoed!
  {
    // Nine 10s and one 5 = 95 totalScore, no category < 5 -> passed!
    const scoresExact5 = [10, 10, 10, 10, 10, 10, 10, 10, 10, 5];
    const res = evaluateRubric(scoresExact5);
    recordTest(
      'VETO_EXACT_5_NO_VETO',
      'Category score exactly 5.0 does NOT trigger veto and passes with 95/100',
      'Veto Logic',
      res.totalScore === 95 && res.hasVeto === false && res.passed === true,
      { totalScore: res.totalScore, hasVeto: res.hasVeto, passed: res.passed }
    );
  }

  // Case 6: Score of 89/100 with no veto -> Must FAIL due to score < 90!
  {
    const scores89NoVeto = [9, 9, 9, 9, 9, 9, 9, 9, 9, 8]; // sum = 89, all >= 5
    const res = evaluateRubric(scores89NoVeto);
    recordTest(
      'SCORE_89_NO_VETO_FAILS',
      'Score of 89/100 with no veto (<5) fails due to totalScore < 90',
      'Pass Threshold',
      res.totalScore === 89 && res.hasVeto === false && res.passed === false,
      { totalScore: res.totalScore, hasVeto: res.hasVeto, passed: res.passed }
    );
  }

  // Case 7: Score of 89.9/100 with no veto -> Must FAIL due to < 90!
  {
    const scores89_9 = [9, 9, 9, 9, 9, 9, 9, 9, 9, 8.9]; // sum = 89.9
    const res = evaluateRubric(scores89_9);
    recordTest(
      'SCORE_89_9_FAILS',
      'Score of 89.9/100 fails strict >= 90 threshold',
      'Pass Threshold',
      res.totalScore < 90 && res.passed === false,
      { totalScore: res.totalScore, passed: res.passed }
    );
  }

  // Case 8: Score of exactly 90/100 with no veto -> Must PASS!
  {
    const scores90NoVeto = [9, 9, 9, 9, 9, 9, 9, 9, 9, 9]; // sum = 90, all >= 5
    const res = evaluateRubric(scores90NoVeto);
    recordTest(
      'SCORE_EXACT_90_PASSES',
      'Score of exactly 90/100 with no veto passes',
      'Pass Threshold',
      res.totalScore === 90 && res.hasVeto === false && res.passed === true,
      { totalScore: res.totalScore, hasVeto: res.hasVeto, passed: res.passed }
    );
  }

  // Case 9: Touch target compliance audit check
  {
    const nonCompliant = auditTouchTarget(40, false);
    const compliantWithoutModifier = auditTouchTarget(48, false);
    const compliantWithModifier = auditTouchTarget(32, true);

    const check1 = nonCompliant.isCompliant === false && nonCompliant.score === 3 && nonCompliant.score < VETO_THRESHOLD;
    const check2 = compliantWithoutModifier.isCompliant === true && compliantWithoutModifier.score === 10;
    const check3 = compliantWithModifier.isCompliant === true && compliantWithModifier.score === 10 && compliantWithModifier.effectiveDp === 48;

    recordTest(
      'AUDIT_TOUCH_TARGET_VETO',
      'auditTouchTarget generates score 3 (<5 veto) when failing <48dp without modifier',
      'Touch Target Audit',
      check1 && check2 && check3,
      { nonCompliantScore: nonCompliant.score, compliantScore: compliantWithModifier.score }
    );
  }

  // --------------------------------------------------------------------------
  // SECTION 4: Report Generator Empty Input Handling
  // --------------------------------------------------------------------------
  console.log('\n--- Section 4: Report Generator Empty Input Stress Testing ---');

  const emptyInputs = [
    { label: 'empty_object', data: {} },
    { label: 'null_data', data: null },
    { label: 'undefined_data', data: undefined },
    { label: 'unrelated_keys_only', data: { foo: 'bar', random: 123 } }
  ];

  for (const testCase of emptyInputs) {
    let validateThrew = false;
    let validateErr = '';
    try {
      validateReportInputs(testCase.data);
    } catch (e) {
      validateThrew = e instanceof EmptyReportDataError || e.name === 'EmptyReportDataError';
      validateErr = e.name;
    }
    recordTest(
      `VALIDATE_EMPTY_${testCase.label}`,
      `validateReportInputs throws EmptyReportDataError for ${testCase.label}`,
      'Report Generator Validation',
      validateThrew,
      { error: validateErr }
    );

    let generateThrew = false;
    let generateErr = '';
    try {
      generateReportMarkdown(testCase.data);
    } catch (e) {
      generateThrew = e instanceof EmptyReportDataError || e.name === 'EmptyReportDataError';
      generateErr = e.name;
    }
    recordTest(
      `GEN_MARKDOWN_EMPTY_${testCase.label}`,
      `generateReportMarkdown throws EmptyReportDataError for ${testCase.label}`,
      'Report Generator Validation',
      generateThrew,
      { error: generateErr }
    );
  }

  // Valid report inputs should not throw
  {
    let passAuditScore = false;
    let passDiff = false;
    try {
      passAuditScore = validateReportInputs({ auditScore: 92 }) === true;
      passDiff = validateReportInputs({ diffMetrics: { pixelSimilarityPercentage: 95.0 } }) === true;
    } catch (e) {}
    recordTest(
      'VALIDATE_VALID_INPUTS',
      'validateReportInputs accepts valid auditScore or diffMetrics',
      'Report Generator Validation',
      passAuditScore && passDiff
    );
  }

  // --------------------------------------------------------------------------
  // SECTION 5: Special Characters Sanitization in Markdown Tables
  // --------------------------------------------------------------------------
  console.log('\n--- Section 5: Special Character Sanitization in Markdown Tables ---');

  // Test individual characters
  const rawPipe = 'Button | Primary';
  const escapedPipe = escapeMarkdown(rawPipe);
  recordTest(
    'ESCAPE_PIPE',
    'escapeMarkdown escapes pipe character (| -> \\|)',
    'Markdown Sanitization',
    escapedPipe === 'Button \\| Primary',
    { actual: escapedPipe }
  );

  const rawBrackets = '[Link](https://example.com)';
  const escapedBrackets = escapeMarkdown(rawBrackets);
  recordTest(
    'ESCAPE_BRACKETS',
    'escapeMarkdown escapes square brackets ([...] -> \\[...\\])',
    'Markdown Sanitization',
    escapedBrackets === '\\[Link\\](https://example.com)',
    { actual: escapedBrackets }
  );

  const rawAsterisk = '*Bold* and **Italic**';
  const escapedAsterisk = escapeMarkdown(rawAsterisk);
  recordTest(
    'ESCAPE_ASTERISK',
    'escapeMarkdown escapes asterisks (* -> \\*)',
    'Markdown Sanitization',
    escapedAsterisk === '\\*Bold\\* and \\*\\*Italic\\*\\*',
    { actual: escapedAsterisk }
  );

  const compositeSpecial = 'Component | [Tag] *Rating* | [Detail]';
  const escapedComposite = escapeMarkdown(compositeSpecial);
  recordTest(
    'ESCAPE_COMPOSITE',
    'escapeMarkdown escapes pipe, brackets, and asterisks simultaneously',
    'Markdown Sanitization',
    escapedComposite === 'Component \\| \\[Tag\\] \\*Rating\\* \\| \\[Detail\\]',
    { actual: escapedComposite }
  );

  // Markdown Table Integrity Stress Test
  // Generate a report where audit dimensions contain adversarial strings with pipes, brackets, asterisks.
  // Then parse the markdown table to confirm no row has corrupted column counts!
  {
    const adversarialDimensions = [
      { id: 'layout', name: 'Layout | Flex | Grid', score: 10, notes: 'Col 1 | Col 2 | Col 3 notes' },
      { id: 'color', name: 'Color [Theme] *Dark*', score: 9, notes: 'M3 tokens [primary] *verified*' },
      { id: 'typography', name: 'Type | Scale [Display]', score: 9, notes: 'sp | em | px scale' },
      { id: 'touchTargets', name: 'Touch Target Compliance (>= 48dp)', score: 10, notes: 'min | bounds | 48dp' },
      { id: 'ripple', name: 'Ripple | Feedback *Press*', score: 9, notes: 'Bounded | Unbounded' },
      { id: 'elevation', name: 'Elevation [Shadow] *Tonal*', score: 9, notes: 'Tonal | Shadow elevation' },
      { id: 'responsive', name: 'Responsive | Flow [Grid]', score: 9, notes: 'FlowRow | FlowColumn' },
      { id: 'states', name: 'States [Hoisting] *Saveable*', score: 10, notes: 'remember | mutableStateOf' },
      { id: 'theme', name: 'Theme [M3] | Scheme', score: 9, notes: 'Light | Dark palettes' },
      { id: 'codeHygiene', name: 'Hygiene | Semantics *A11y*', score: 9, notes: 'ContentDescription | Role' }
    ];

    const reportData = {
      auditScore: 94,
      auditResult: {
        totalScore: 94,
        passed: true,
        hasVeto: false,
        dimensions: adversarialDimensions
      },
      diffMetrics: {
        pixelSimilarityPercentage: 96.5,
        mssimScore: 0.985,
        pixelMismatchCount: 120
      },
      buildResults: {
        compileErrors: 0,
        unitTestsFailed: 0,
        unitTestsPassed: 2
      },
      metadata: {
        appName: 'TestApp | [Beta] *V1*'
      }
    };

    const reportMd = generateReportMarkdown(reportData);

    // Verify table lines in Section 4
    const lines = reportMd.split('\n');
    const tableHeaderIdx = lines.findIndex(l => l.includes('| Dimension | Score (0-10) | Notes |'));
    const tableSeparatorIdx = tableHeaderIdx + 1;
    const tableRows = lines.slice(tableSeparatorIdx + 1, tableSeparatorIdx + 1 + 10);

    let allRowsValidColumns = true;
    const rowViolations = [];

    for (const [idx, row] of tableRows.entries()) {
      // In Markdown, a 3-column table row delimited by | should have 4 unescaped pipes
      // e.g. "| Col1 | Col2 | Col3 |"
      // Count unescaped pipes: (?<!\\)\|
      const unescapedPipes = (row.match(/(?<!\\)\|/g) || []).length;
      if (unescapedPipes !== 4) {
        allRowsValidColumns = false;
        rowViolations.push({ rowIdx: idx, row, unescapedPipes });
      }
    }

    recordTest(
      'TABLE_INTEGRITY_STRESS',
      'Adversarial table content preserves exactly 3 columns (4 unescaped pipes per row)',
      'Markdown Table Formatting',
      allRowsValidColumns && tableRows.length === 10,
      { rowViolations }
    );
  }

  // --------------------------------------------------------------------------
  // SECTION 6: Missing Screenshot Fallback Handling
  // --------------------------------------------------------------------------
  console.log('\n--- Section 6: Missing Screenshot Fallback Handling ---');

  const missingImageFallbacks = [
    { label: 'null_image', val: null },
    { label: 'undefined_image', val: undefined },
    { label: 'empty_string_image', val: '' }
  ];

  for (const item of missingImageFallbacks) {
    const rendered = renderImageMarkdown(item.val);
    recordTest(
      `IMG_FALLBACK_${item.label}`,
      `renderImageMarkdown(${item.label}) returns '*No screenshot available*'`,
      'Screenshot Fallback',
      rendered === '*No screenshot available*',
      { actual: rendered }
    );
  }

  // Valid image path rendering
  {
    const validRendered = renderImageMarkdown('output/preview.png', 'Sample Preview');
    recordTest(
      'IMG_VALID_PATH',
      'renderImageMarkdown renders markdown image syntax when path provided',
      'Screenshot Fallback',
      validRendered === '![Sample Preview](output/preview.png)',
      { actual: validRendered }
    );

    const specialAltRendered = renderImageMarkdown('output/diff.png', 'Diff | [Test] *A*');
    recordTest(
      'IMG_SPECIAL_ALT',
      'renderImageMarkdown escapes special characters in alt text',
      'Screenshot Fallback',
      specialAltRendered === '![Diff \\| \\[Test\\] \\*A\\*](output/diff.png)',
      { actual: specialAltRendered }
    );
  }

  // Report generation with missing reference and rendered preview images
  {
    const reportDataNoImages = {
      auditScore: 92,
      auditResult: { totalScore: 92, passed: true, hasVeto: false },
      diffMetrics: {
        pixelSimilarityPercentage: 94.0,
        refImagePath: null,
        renderedImagePath: null
      }
    };

    let reportGenerated = false;
    let reportContent = '';
    try {
      reportContent = generateReportMarkdown(reportDataNoImages);
      reportGenerated = true;
    } catch (e) {
      reportGenerated = false;
    }

    const noRefSectionMissing = !reportContent.includes('Reference Web Viewport: ![');
    recordTest(
      'REPORT_NULL_IMAGES',
      'generateReportMarkdown handles null screenshot paths gracefully without throwing',
      'Screenshot Fallback',
      reportGenerated && noRefSectionMissing
    );
  }

  // --------------------------------------------------------------------------
  // SECTION 7: Verdict Banner & Multi-Gate Synthesis
  // --------------------------------------------------------------------------
  console.log('\n--- Section 7: Overall Verdict Banner & Multi-Gate Synthesis ---');

  recordTest('VERDICT_BANNER_PASS', 'generateVerdictBanner(true) -> "## Verdict: PASSED"', 'Verdict Banner',
    generateVerdictBanner(true) === '## Verdict: PASSED');
  recordTest('VERDICT_BANNER_FAIL', 'generateVerdictBanner(false) -> "## Verdict: FAILED"', 'Verdict Banner',
    generateVerdictBanner(false) === '## Verdict: FAILED');

  // Multi-gate check: build fail forces overall FAILED even if audit passes
  {
    const reportBuildFail = generateReportMarkdown({
      auditScore: 95,
      auditResult: { totalScore: 95, passed: true, hasVeto: false },
      buildResults: { compileErrors: 1, unitTestsFailed: 0 }
    });
    recordTest(
      'GATE_BUILD_FAIL_OVERALL_FAIL',
      'Compile errors in buildResults forces overall FAILED verdict',
      'Multi-Gate Verification',
      reportBuildFail.includes('## Verdict: FAILED') && reportBuildFail.includes('TRIGGER_REFINEMENT')
    );
  }

  // Multi-gate check: visual similarity < 90% forces overall FAILED even if audit passes
  {
    const reportDiffFail = generateReportMarkdown({
      auditScore: 95,
      auditResult: { totalScore: 95, passed: true, hasVeto: false },
      diffMetrics: { pixelSimilarityPercentage: 88.5 }
    });
    recordTest(
      'GATE_DIFF_FAIL_OVERALL_FAIL',
      'Diff similarity < 90% forces overall FAILED verdict',
      'Multi-Gate Verification',
      reportDiffFail.includes('## Verdict: FAILED') && reportDiffFail.includes('TRIGGER_REFINEMENT')
    );
  }

  // Multi-gate check: audit veto forces overall FAILED even if build & diff pass
  {
    const reportAuditVeto = generateReportMarkdown({
      auditScore: 91,
      auditResult: { totalScore: 91, passed: false, hasVeto: true },
      diffMetrics: { pixelSimilarityPercentage: 98.0 },
      buildResults: { compileErrors: 0, unitTestsFailed: 0 }
    });
    recordTest(
      'GATE_AUDIT_VETO_OVERALL_FAIL',
      'Audit veto forces overall FAILED verdict',
      'Multi-Gate Verification',
      reportAuditVeto.includes('## Verdict: FAILED') && reportAuditVeto.includes('TRIGGER_REFINEMENT')
    );
  }

  // Multi-gate check: all pass produces overall PASSED
  {
    const reportAllPass = generateReportMarkdown({
      auditScore: 95,
      auditResult: { totalScore: 95, passed: true, hasVeto: false },
      diffMetrics: { pixelSimilarityPercentage: 95.0 },
      buildResults: { compileErrors: 0, unitTestsFailed: 0 }
    });
    recordTest(
      'GATE_ALL_PASS_OVERALL_PASS',
      'All gates satisfied produces overall PASSED verdict and PROCEED_PUBLISH',
      'Multi-Gate Verification',
      reportAllPass.includes('## Verdict: PASSED') && reportAllPass.includes('PROCEED_PUBLISH')
    );
  }

  // --------------------------------------------------------------------------
  // SECTION 8: Object Inputs with Invalid Scores & Legacy Keys
  // --------------------------------------------------------------------------
  console.log('\n--- Section 8: Object-Based Rubric Score Stress Tests ---');

  const invalidObjectScores = [
    { label: 'obj_neg_score', obj: {
      layout: 10, color: 10, typography: 10, touchTargets: -1,
      ripple: 10, elevation: 10, responsive: 10, states: 10, theme: 10, codeHygiene: 10
    }},
    { label: 'obj_excess_score', obj: {
      layout: 10, color: 10, typography: 10, touchTargets: 15,
      ripple: 10, elevation: 10, responsive: 10, states: 10, theme: 10, codeHygiene: 10
    }},
    { label: 'obj_nan_score', obj: {
      layout: 10, color: 10, typography: 10, touchTargets: NaN,
      ripple: 10, elevation: 10, responsive: 10, states: 10, theme: 10, codeHygiene: 10
    }},
    { label: 'obj_string_score', obj: {
      layout: 10, color: 10, typography: 10, touchTargets: 'high',
      ripple: 10, elevation: 10, responsive: 10, states: 10, theme: 10, codeHygiene: 10
    }},
    { label: 'obj_nested_invalid', obj: {
      layout: 10, color: 10, typography: 10, touchTargets: { score: -3 },
      ripple: 10, elevation: 10, responsive: 10, states: 10, theme: 10, codeHygiene: 10
    }}
  ];

  for (const testCase of invalidObjectScores) {
    let threw = false;
    let errName = '';
    try {
      evaluateRubric(testCase.obj);
    } catch (e) {
      threw = e instanceof InvalidScoreError || e.name === 'InvalidScoreError';
      errName = e.name;
    }
    recordTest(
      `EVAL_OBJ_${testCase.label}`,
      `evaluateRubric throws InvalidScoreError for ${testCase.label}`,
      'Object Score Validation',
      threw,
      { error: errName }
    );
  }

  // Legacy key support in evaluateRubric
  {
    const legacyValidObj = {
      typography: 10,
      color: 9,
      layout: 10,
      radii: 9,
      elevation: 9,
      vectors: 10,
      states: 10,
      touchTargets: 10,
      accessibility: 9,
      motion: 9
    };
    const resLegacy = evaluateRubric(legacyValidObj);
    const legacyPassed = resLegacy.passed === true && resLegacy.totalScore === 95;
    const legacyPropertiesAccessible =
      resLegacy.breakdown.radii === 9 &&
      resLegacy.breakdown.vectors === 10 &&
      resLegacy.breakdown.motion === 9 &&
      resLegacy.breakdown.accessibility === 9;
    const legacyKeyCount = Object.keys(resLegacy.breakdown).length === 10;

    recordTest(
      'LEGACY_KEYS_EVALUATION',
      'evaluateRubric correctly handles legacy key mapping and non-enumerable getters',
      'Legacy Keys',
      legacyPassed && legacyPropertiesAccessible && legacyKeyCount,
      { totalScore: resLegacy.totalScore, breakdownKeys: Object.keys(resLegacy.breakdown).length }
    );
  }

  // --------------------------------------------------------------------------
  // SECTION 9: Static Code Auditor (auditSynthesizedCode) Adversarial Tests
  // --------------------------------------------------------------------------
  console.log('\n--- Section 9: Static Code Auditor Synthetic Tests ---');

  // Test 1: Real android project inspection passes 100/100
  {
    const realResult = auditSynthesizedCode();
    recordTest(
      'AUDIT_REAL_PROJECT',
      'auditSynthesizedCode audits current codebase with score >= 90 and 0 vetos',
      'Code Auditor',
      realResult.totalScore >= 90 && !realResult.hasVeto && realResult.passed === true,
      { totalScore: realResult.totalScore, hasVeto: realResult.hasVeto }
    );
  }

  // Test 2: Adversarial fake android project with undersized button (<48dp) triggers veto
  {
    const fakeDir = path.join(PROJECT_ROOT, 'output/test_adversarial_android');
    const fakeCompDir = path.join(fakeDir, 'app/src/main/java/com/claude/compose/components');
    fs.mkdirSync(fakeCompDir, { recursive: true });

    // Undersized button without modifier
    const badButtonKt = `
      package com.claude.compose.components
      import androidx.compose.material3.Button
      import androidx.compose.ui.Modifier
      import androidx.compose.ui.unit.dp

      @Composable
      fun BadButton() {
        Button(
          modifier = Modifier.size(36.dp)
        )
      }
    `;
    fs.writeFileSync(path.join(fakeCompDir, 'BadButton.kt'), badButtonKt, 'utf8');

    const fakeResult = auditSynthesizedCode({ androidDir: fakeDir });

    // Cleanup
    fs.rmSync(fakeDir, { recursive: true, force: true });

    const detectedVeto = fakeResult.hasVeto === true && fakeResult.breakdown.touchTargets === 3;
    recordTest(
      'AUDIT_DETECTS_UNDERSIZED_BUTTON',
      'auditSynthesizedCode detects undersized button (36dp) and assigns score 3 (VETO)',
      'Code Auditor',
      detectedVeto,
      { touchTargetsScore: fakeResult.breakdown.touchTargets, hasVeto: fakeResult.hasVeto }
    );
  }

  // --------------------------------------------------------------------------
  // SECTION 10: Report File Generation & Directory Creation
  // --------------------------------------------------------------------------
  console.log('\n--- Section 10: Report Disk Writing & Section Verification ---');

  {
    const reportTestPath = path.join(PROJECT_ROOT, 'output/test_adversarial_report/report.md');
    const sampleData = {
      auditScore: 96,
      auditResult: {
        totalScore: 96,
        passed: true,
        hasVeto: false,
        dimensions: RUBRIC_CRITERIA.map(c => ({
          id: c.id,
          name: c.name,
          score: 10,
          maxScore: 10,
          passed: true,
          veto: false,
          notes: c.defaultNotes
        }))
      },
      diffMetrics: {
        pixelSimilarityPercentage: 97.2,
        mssimScore: 0.991,
        pixelMismatchCount: 85,
        refImagePath: 'output/ref.png',
        renderedImagePath: 'output/rendered.png',
        compositePath: 'output/composite.png'
      },
      buildResults: {
        compileErrors: 0,
        unitTestsPassed: 3,
        unitTestsFailed: 0,
        previewPath: 'android/app/build/outputs/preview/rendered_preview.png'
      },
      metadata: {
        appName: 'Adversarial Test App',
        timestamp: '2026-09-19T05:00:00Z'
      }
    };

    const generated = generateVerificationReport(sampleData, reportTestPath);
    const fileExists = fs.existsSync(reportTestPath);
    const contentMatches = fs.readFileSync(reportTestPath, 'utf8') === generated;

    // Verify all 5 required sections
    const hasSec1 = generated.includes('## 1. Executive Summary');
    const hasSec2 = generated.includes('## 2. Programmatic Build & Unit Test Results');
    const hasSec3 = generated.includes('## 3. Programmatic Visual Diff Analysis');
    const hasSec4 = generated.includes('## 4. Agent-as-Judge 10-Point Audit Rubric');
    const hasSec5 = generated.includes('## 5. Refinement Loop Guidance & Action Items');
    const hasAllSections = hasSec1 && hasSec2 && hasSec3 && hasSec4 && hasSec5;

    // Cleanup
    if (fileExists) {
      fs.rmSync(path.dirname(reportTestPath), { recursive: true, force: true });
    }

    recordTest(
      'GEN_REPORT_FILE_AND_SECTIONS',
      'generateVerificationReport creates directories, writes file, and includes all 5 sections',
      'Report Generation',
      fileExists && contentMatches && hasAllSections,
      { fileExists, hasAllSections }
    );
  }

  // --------------------------------------------------------------------------
  // SECTION 11: CLI Execution Verification
  // --------------------------------------------------------------------------
  console.log('\n--- Section 11: CLI Integration Tests ---');

  // Test CLI with failing scores (veto)
  {
    const tempScoresPath = path.join(PROJECT_ROOT, 'verification/temp_veto_scores.json');
    fs.writeFileSync(tempScoresPath, JSON.stringify([10, 10, 10, 10, 10, 10, 10, 10, 7, 4]), 'utf8');

    const cliResult = spawnSync(
      'node',
      [path.join(PROJECT_ROOT, 'verification/audit_rubric.js'), '--scores', tempScoresPath, '--json'],
      { encoding: 'utf8' }
    );

    fs.unlinkSync(tempScoresPath);

    let parsed = null;
    try {
      parsed = JSON.parse(cliResult.stdout);
    } catch (e) {}

    const cliFailed = cliResult.status === 1; // exit 1 on fail
    const parsedVeto = parsed && parsed.hasVeto === true && parsed.passed === false;

    recordTest(
      'CLI_VETO_EXIT_CODE',
      'audit_rubric.js CLI exits with code 1 and outputs JSON with vetoed results',
      'CLI Integration',
      cliFailed && parsedVeto,
      { exitCode: cliResult.status, parsed }
    );
  }

  // Test CLI with passing scores (no veto, >= 90)
  {
    const tempScoresPath = path.join(PROJECT_ROOT, 'verification/temp_pass_scores.json');
    fs.writeFileSync(tempScoresPath, JSON.stringify([10, 10, 10, 9, 9, 9, 9, 10, 10, 9]), 'utf8'); // sum = 95

    const cliResult = spawnSync(
      'node',
      [path.join(PROJECT_ROOT, 'verification/audit_rubric.js'), '--scores', tempScoresPath, '--json'],
      { encoding: 'utf8' }
    );

    fs.unlinkSync(tempScoresPath);

    let parsed = null;
    try {
      parsed = JSON.parse(cliResult.stdout);
    } catch (e) {}

    const cliSuccess = cliResult.status === 0; // exit 0 on pass
    const parsedPass = parsed && parsed.hasVeto === false && parsed.passed === true;

    recordTest(
      'CLI_PASS_EXIT_CODE',
      'audit_rubric.js CLI exits with code 0 for passing scores',
      'CLI Integration',
      cliSuccess && parsedPass,
      { exitCode: cliResult.status, parsed }
    );
  }

  // Summary
  console.log('\n' + '='.repeat(80));
  const total = results.length;
  const passedCount = results.filter(r => r.passed).length;
  const failedCount = total - passedCount;

  console.log(`TOTAL TESTS: ${total}`);
  console.log(`PASSED:      ${passedCount}`);
  console.log(`FAILED:      ${failedCount}`);
  console.log('='.repeat(80));

  return { total, passedCount, failedCount, results };
}

if (require.main === module) {
  runSuite().then(summary => {
    process.exit(summary.failedCount === 0 ? 0 : 1);
  });
}

module.exports = { runSuite };
