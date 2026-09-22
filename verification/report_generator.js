/**
 * verification/report_generator.js
 *
 * Markdown Verification Report Generator.
 * Consolidates Gradle build outcomes, Robolectric preview tests,
 * perceptual visual diff metrics, composite screenshots, and
 * the 10-point Agent-as-Judge audit rubric into verification_report.md.
 */

const fs = require('node:fs');
const path = require('node:path');
const { evaluateVerificationEvidence } = require('./quality_gate');

/**
 * Custom error thrown when report inputs are empty.
 */
class EmptyReportDataError extends Error {
  constructor(message) {
    super(message.startsWith('EmptyReportDataError') ? message : `EmptyReportDataError: ${message}`);
    this.name = 'EmptyReportDataError';
  }
}

/**
 * Sanitizes markdown special characters to prevent table column disruption (T2_B23_01).
 * Escapes |, [, ], and * characters.
 *
 * @param {string} text
 * @returns {string}
 */
function escapeMarkdown(text) {
  if (text == null) return '';
  return String(text)
    .replace(/\|/g, '\\|')
    .replace(/\[/g, '\\[')
    .replace(/\]/g, '\\]')
    .replace(/\*/g, '\\*');
}

/**
 * Formats image embedding with fallback placeholder when missing (T2_B23_02).
 *
 * @param {string|null} imagePath
 * @param {string} [alt='Screenshot']
 * @returns {string}
 */
function renderImageMarkdown(imagePath, alt = 'Screenshot') {
  if (!imagePath) return '*No screenshot available*';
  return `![${escapeMarkdown(alt)}](${imagePath})`;
}

/**
 * Validates report inputs to ensure at least audit or diff metrics are present (T2_B23_03).
 *
 * @param {Object} inputs
 * @returns {boolean}
 */
function validateReportInputs(inputs) {
  if (
    !inputs ||
    (!inputs.auditScore &&
      !inputs.auditResult &&
      !inputs.diffMetrics &&
      !inputs.rubricScores &&
      !inputs.totalScore &&
      !inputs.buildResults)
  ) {
    throw new EmptyReportDataError(
      'EmptyReportDataError: Cannot generate report without audit or diff metrics'
    );
  }
  return true;
}

/**
 * Generates overall verdict banner (T2_B23_04).
 *
 * @param {boolean} passed
 * @returns {string}
 */
function generateVerdictBanner(passedOrOutcome) {
  if (typeof passedOrOutcome === 'string') {
    return `## Verdict: ${passedOrOutcome}`;
  }
  return passedOrOutcome ? '## Verdict: PASSED' : '## Verdict: FAILED';
}

/**
 * Generates complete verification report markdown content.
 *
 * @param {Object} data
 * @returns {string}
 */
function generateReportMarkdown(data = {}) {
  validateReportInputs(data);

  const build = data.buildResults || {};
  const diff = data.diffMetrics || {};
  const audit = data.auditResult || {};
  const auditScore = data.auditScore ?? audit.totalScore ?? audit.total ?? null;

  const buildErrors = build.compileErrors ?? (build.errors ? build.errors.length : null);
  const unitTestsFailed = build.unitTestsFailed ?? null;
  const buildPassed = build.compileSuccess === true && build.previewSuccess === true;

  const diffSimilarity = diff.pixelSimilarityPercentage;
  const qualityGate = data.qualityGate || evaluateVerificationEvidence({
    compile: build.compileSuccess === true
      ? { success: true }
      : (build.compileSkipped ? { success: false, skipped: true } : undefined),
    previewTest: build.previewSuccess === true
      ? { success: true }
      : (build.previewSkipped ? { success: false, skipped: true } : undefined),
    vectorLinter: data.vectorLinter,
    audit,
    diff: Object.keys(diff).length > 0
      ? { success: true, metrics: diff, zonal: data.zonalDiff || diff.zonal }
      : undefined
  }, { thresholds: data.thresholds });
  const outcome = qualityGate.outcome;
  const overallPassed = qualityGate.passed;
  const verdictBanner = generateVerdictBanner(outcome);
  const verdictText = outcome;
  const auditScoreDisplay = typeof auditScore === 'number' ? `${auditScore} / 100` : 'N/A (evidence missing)';

  const dateStr = data.metadata?.timestamp || new Date().toISOString();
  const appName = data.metadata?.appName || 'Claude to Compose';

  let md = `# Verification Report: Claude to Compose\n\n`;

  // Section 1: Executive Summary
  md += `## 1. Executive Summary\n`;
  md += `${verdictBanner}\n`;
  md += `Verdict: ${verdictText}\n\n`;
  md += `- **Execution Date**: ${dateStr}\n`;
  md += `- **Target Application**: ${escapeMarkdown(appName)}\n`;
  md += `- **Audit Score**: ${auditScoreDisplay} (pass threshold: >= 90, never a substitute for rendered evidence)\n`;
  md += `- **Build Status**: ${buildPassed ? 'PASSED' : (build.compileSkipped || build.previewSkipped ? 'BLOCKED' : 'FAILED')}\n`;
  if (typeof diffSimilarity === 'number' && !Number.isNaN(diffSimilarity)) {
    md += `- **Visual Similarity**: ${diffSimilarity.toFixed(1)}%\n`;
  }
  if (typeof diff.inkIou === 'number' && !Number.isNaN(diff.inkIou)) {
    md += `- **Ink IoU (Non-White Ink)**: ${diff.inkIou.toFixed(2)}%\n`;
  }
  if (typeof diff.inkDice === 'number' && !Number.isNaN(diff.inkDice)) {
    md += `- **Ink Dice Coefficient**: ${diff.inkDice.toFixed(2)}%\n`;
  }
  if (qualityGate.failures.length > 0) {
    md += `- **Gate Failures**: ${qualityGate.failures.length}\n`;
  }
  if (qualityGate.blockers.length > 0) {
    md += `- **Blocked Evidence Requirements**: ${qualityGate.blockers.length}\n`;
  }
  md += `\n`;

  // Section 2: Programmatic Build & Unit Test Results
  md += `## 2. Programmatic Build & Unit Test Results\n`;
  md += `- Gradle Compilation: ${build.compileSuccess === true ? `${buildErrors ?? 0} errors` : (build.compileSkipped ? 'BLOCKED (skipped)' : 'FAILED or unavailable')}\n`;
  const testsPassedCount = build.unitTestsPassed;
  if (Number.isInteger(testsPassedCount) && Number.isInteger(unitTestsFailed)) {
    md += `- Unit Tests: ${unitTestsFailed === 0 ? 'PASSED' : 'FAILED'} (${testsPassedCount} passed, ${unitTestsFailed} failed)\n`;
  } else {
    md += `- Unit Tests: BLOCKED (exact executed-test counts unavailable)\n`;
  }
  if (build.previewPath || build.renderedPreviewPath) {
    const preview = build.previewPath || build.renderedPreviewPath;
    md += `- Headless Preview Capture: Captured successfully to \`${preview}\`\n`;
  }
  md += `\n`;

  // Section 3: Programmatic Visual Diff Analysis
  md += `## 3. Programmatic Visual Diff Analysis\n`;
  if (typeof diffSimilarity === 'number' && !Number.isNaN(diffSimilarity)) {
    md += `- Pixel Similarity: ${diffSimilarity.toFixed(1)}%\n`;
  }
  if (typeof diff.inkIou === 'number' && !Number.isNaN(diff.inkIou)) {
    md += `- Ink IoU: ${diff.inkIou.toFixed(2)}%\n`;
  }
  if (typeof diff.inkDice === 'number' && !Number.isNaN(diff.inkDice)) {
    md += `- Ink Dice: ${diff.inkDice.toFixed(2)}%\n`;
  }
  if (typeof diff.mssimScore === 'number' && !Number.isNaN(diff.mssimScore)) {
    md += `- MSSIM Score: ${diff.mssimScore.toFixed(3)}\n`;
  }
  if (typeof diff.pixelMismatchCount === 'number' && !Number.isNaN(diff.pixelMismatchCount)) {
    md += `- Pixel Mismatch Count: ${diff.pixelMismatchCount}\n`;
  }
  md += `\n`;

  const compositeImagePath = diff.compositePath || diff.diffCompositePath || null;

  md += `### Visual Diff Artifacts\n`;
  if (diff.refImagePath) {
    md += `- **Reference Web Viewport**: ${renderImageMarkdown(diff.refImagePath, 'Reference Web Viewport')}\n`;
  }
  if (diff.renderedImagePath) {
    md += `- **Synthesized Compose Preview**: ${renderImageMarkdown(diff.renderedImagePath, 'Synthesized Compose Preview')}\n`;
  }
  md += `\n`;
  md += `${renderImageMarkdown(compositeImagePath, 'Visual Diff Composite')}\n\n`;

  const zonalData = data.zonalDiff || diff.zonalDiff;
  if (zonalData && Array.isArray(zonalData.zones) && zonalData.zones.length > 0) {
    md += `### Multi-Zone Perceptual Breakdown (Daylight DC1 1184 × 1584)\n\n`;
    md += `| Zone | Y Range (px) | Similarity | Ink IoU | Ink Dice | SSIM | Mismatches | Drift (Δx, Δy px) | Drift (dp) |\n`;
    md += `| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |\n`;
    for (const z of zonalData.zones) {
      const driftPx = `${z.centroidDrift?.deltaX ?? 0}, ${z.centroidDrift?.deltaY ?? 0}`;
      const driftDp = `${z.centroidDrift?.deltaXDp ?? 0}dp, ${z.centroidDrift?.deltaYDp ?? 0}dp`;
      const inkIouStr = z.inkIou !== undefined ? `${z.inkIou}%` : 'N/A';
      const inkDiceStr = z.inkDice !== undefined ? `${z.inkDice}%` : 'N/A';
      md += `| **${escapeMarkdown(z.name)}** | ${z.yStart}-${z.yEnd} | ${z.similarity}% | ${inkIouStr} | ${inkDiceStr} | ${z.ssimScore} | ${z.mismatchCount} | \`${driftPx}\` | \`${driftDp}\` |\n`;
    }
    md += `\n`;
    if (zonalData.zonalDiffOverlay) {
      md += `![Multi-Zone Heatmap Overlay](${zonalData.zonalDiffOverlay})\n\n`;
    }
  }

  if (data.autoTunerDirectives && Array.isArray(data.autoTunerDirectives) && data.autoTunerDirectives.length > 0) {
    md += `### Auto-Tuner Layout Compensations\n\n`;
    md += `| Zone | Measured Drift (dp) | Match | Recommended Action |\n`;
    md += `| :--- | :--- | :--- | :--- |\n`;
    for (const d of data.autoTunerDirectives) {
      const driftStr = `Δx: ${d.driftDp?.x ?? 0}dp, Δy: ${d.driftDp?.y ?? 0}dp`;
      const actions = (d.recommendedCorrections || []).map(c => `• **${escapeMarkdown(c.target)}**: ${escapeMarkdown(c.action)}`).join('<br>');
      md += `| **${escapeMarkdown(d.zoneName)}** | \`${driftStr}\` | ${d.currentSimilarity}% | ${actions || 'Within tolerance'} |\n`;
    }
    md += `\n`;
  }

  // Section 4: Agent-as-Judge 10-Point Audit Rubric
  md += `## 4. Agent-as-Judge 10-Point Audit Rubric\n`;
  md += `| Dimension | Score (0-10) | Notes |\n`;
  md += `|---|---|---|\n`;

  if (audit.dimensions && Array.isArray(audit.dimensions) && audit.dimensions.length > 0) {
    for (const d of audit.dimensions) {
      let displayName = d.name;
      // Ensure Touch Target Compliance row format matches regex /^\|\s*Touch Target Compliance.*\|\s*\d+\/10\s*\|/
      if (d.id === 'touchTargets') {
        displayName = 'Touch Target Compliance (>= 48dp)';
      }
      md += `| ${escapeMarkdown(displayName)} | ${d.score}/10 | ${escapeMarkdown(d.notes)} |\n`;
    }
  } else {
    md += `| Evidence unavailable | N/A | Static audit did not produce a complete result |\n`;
  }
  md += `\n**Total Score: ${auditScoreDisplay}**\n\n`;

  // Section 5: Refinement Loop Guidance & Action Items
  md += `## 5. Refinement Loop Guidance & Action Items\n`;
  if (overallPassed) {
    md += `- **Verdict Code**: PROCEED_PUBLISH\n`;
    md += `- **Action**: All quality gates satisfied. Proceed to Milestone M5 E2E test verification and Milestone M7 GitHub release publishing.\n`;
  } else if (outcome === 'FAIL') {
    md += `- **Verdict Code**: TRIGGER_REFINEMENT\n`;
    md += `- **Action**: Iterative refinement required before release publication. Address the following items:\n`;
    if (audit.recommendations && audit.recommendations.length > 0) {
      for (const rec of audit.recommendations) {
        md += `  - ${escapeMarkdown(rec)}\n`;
      }
    }
    if (!buildPassed) {
      md += `  - Resolve Kotlin compilation errors and failing unit tests.\n`;
    }
    for (const failure of qualityGate.failures) md += `  - ${escapeMarkdown(failure)}\n`;
  } else {
    md += `- **Verdict Code**: BLOCKED_EVIDENCE\n`;
    md += `- **Action**: Collect the missing evidence before making a release or fidelity claim:\n`;
    for (const blocker of qualityGate.blockers) md += `  - ${escapeMarkdown(blocker)}\n`;
  }

  return md;
}

/**
 * Generates and saves verification_report.md.
 *
 * @param {Object} data
 * @param {string} [outputPath='verification_report.md']
 * @returns {string} The generated markdown content
 */
function generateVerificationReport(data = {}, outputPath = 'verification_report.md') {
  const markdown = generateReportMarkdown(data);
  const targetPath = outputPath || 'verification_report.md';
  const targetDir = path.dirname(targetPath);
  if (targetDir && !fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }
  fs.writeFileSync(targetPath, markdown, 'utf8');
  return markdown;
}

module.exports = {
  generateVerificationReport,
  generateReportMarkdown,
  escapeMarkdown,
  renderImageMarkdown,
  validateReportInputs,
  generateVerdictBanner,
  EmptyReportDataError
};
