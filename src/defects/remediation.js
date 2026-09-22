'use strict';

/**
 * src/defects/remediation.js
 *
 * Deterministic Actionable Remediation & Unified Diff Generator for ctc v2.
 * Strictly avoids fuzzy regex patching, emitting structured AST directives and exact diffs.
 */

/**
 * Generates remediation advice and unified diff for parent padding adjustment.
 * @param {object} params
 * @returns {object}
 */
function generateSpatialRemediation({
  parentSymbol = 'Column',
  targetFile = 'NoteEditorScreen.kt',
  startLine = 98,
  currentPaddingDp = 32,
  shiftPx = 18,
  density = 2.0
} = {}) {
  const shiftDp = Math.round(shiftPx / density);
  const adjustedPaddingDp = Math.max(0, currentPaddingDp - shiftDp);

  const action = `Adjust parent ${parentSymbol} vertical padding from ${currentPaddingDp}dp to ${adjustedPaddingDp}dp to eliminate +${shiftPx}px (+${shiftDp}dp) cumulative drift`;

  const oldCode = `        modifier = Modifier.fillMaxSize().padding(top = ${currentPaddingDp}.dp, start = 16.dp, end = 16.dp)`;
  const newCode = `        modifier = Modifier.fillMaxSize().padding(top = ${adjustedPaddingDp}.dp, start = 16.dp, end = 16.dp)`;

  const diff = `@@ -${startLine},1 +${startLine},1 @@\n-${oldCode}\n+${newCode}`;

  return {
    action,
    patchType: 'MODIFIER_REPLACEMENT',
    targetFile,
    targetLineRange: { start: startLine, end: startLine },
    suggestedReplacement: newCode,
    diff
  };
}

/**
 * Generates remediation advice and unified diff for contrast/token replacement.
 * @param {object} params
 * @returns {object}
 */
function generateContrastRemediation({
  composableSymbol = 'HeadlineText',
  targetFile = 'NoteEditorScreen.kt',
  startLine = 55,
  currentToken = 'SolTheme.colors.os200',
  compliantToken = 'SolTheme.colors.os900'
} = {}) {
  const action = `Replace low-contrast token ${currentToken} with compliant Daylight Sol:OS token ${compliantToken} on ${composableSymbol}`;

  const oldCode = `            color = ${currentToken}`;
  const newCode = `            color = ${compliantToken}`;

  const diff = `@@ -${startLine},1 +${startLine},1 @@\n-${oldCode}\n+${newCode}`;

  return {
    action,
    patchType: 'TOKEN_REPLACEMENT',
    targetFile,
    targetLineRange: { start: startLine, end: startLine },
    suggestedReplacement: newCode,
    diff
  };
}

/**
 * Generates remediation advice and diff for touch target size expansion.
 * @param {object} params
 * @returns {object}
 */
function generateTouchTargetRemediation({
  composableSymbol = 'IconButton',
  targetFile = 'NoteEditorScreen.kt',
  startLine = 60
} = {}) {
  const action = `Apply Modifier.minimumInteractiveComponentSize() to ${composableSymbol} to ensure 48dp hit-slop bounds without altering visual hairline boundaries`;

  const oldCode = `        modifier = Modifier.clickable { onAction() }`;
  const newCode = `        modifier = Modifier.minimumInteractiveComponentSize().clickable { onAction() }`;

  const diff = `@@ -${startLine},1 +${startLine},1 @@\n-${oldCode}\n+${newCode}`;

  return {
    action,
    patchType: 'MODIFIER_REPLACEMENT',
    targetFile,
    targetLineRange: { start: startLine, end: startLine },
    suggestedReplacement: newCode,
    diff
  };
}

/**
 * Generates remediation advice and diff for removing prohibited EPD workarounds.
 * @param {object} params
 * @returns {object}
 */
function generateEpdRemovalRemediation({
  targetFile = 'NoteEditorScreen.kt',
  startLine = 85,
  forbiddenCode = 'context.sendBroadcast(Intent("android.intent.action.ACTION_REFRESH_SCREEN"))'
} = {}) {
  const action = `Remove prohibited EPD waveform clear hook or artificial pause from ${targetFile}. DC1 uses standard SurfaceFlinger fluid pipeline.`;

  const diff = `@@ -${startLine},1 +${startLine},0 @@\n-${forbiddenCode}`;

  return {
    action,
    patchType: 'CODE_REMOVAL',
    targetFile,
    targetLineRange: { start: startLine, end: startLine },
    suggestedReplacement: '',
    diff
  };
}

/**
 * Generates generic remediation advice when no specific rule matches.
 * @param {object} params
 * @returns {object}
 */
function generateGenericRemediation({
  sourceId = 'unknown_node',
  targetFile = null,
  action = null
} = {}) {
  return {
    action: action || `Adjust local composable layout modifier padding or offset for element "${sourceId}" to eliminate measured discrepancy.`,
    patchType: 'MODIFIER_REPLACEMENT',
    targetFile,
    targetLineRange: null,
    suggestedReplacement: null,
    diff: null
  };
}

module.exports = {
  generateSpatialRemediation,
  generateContrastRemediation,
  generateTouchTargetRemediation,
  generateEpdRemovalRemediation,
  generateGenericRemediation
};
