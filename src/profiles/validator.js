'use strict';

/**
 * src/profiles/validator.js
 *
 * Hardware Profile Validator.
 * Validates profiles against Daylight DC1 hardware invariants, display parameters,
 * touch specifications, and strict prohibition of EPD workarounds.
 */

const FORBIDDEN_EPD_PATTERNS = Object.freeze([
  'android.intent.action.ACTION_REFRESH_SCREEN',
  'ACTION_REFRESH_SCREEN',
  'com.eink.REFRESH_WAVEFORM',
  'REFRESH_WAVEFORM',
  'particle_refresh',
  'PARTICLE_REFRESH',
  'epd_clear',
  'EPD_CLEAR',
  'waveform_mode',
  'WAVEFORM_MODE',
  'modal_dismiss_pause',
  'artificial_modal_dismiss_pause',
  'artificial_pause',
  'epd_flash_on_modal_dismissal',
  'epd_flash'
]);

/**
 * Validates a profile object against DC1 hardware invariants.
 * @param {object} profile
 * @returns {{ valid: boolean, issues: string[] }}
 */
function validateProfileAgainstRules(profile) {
  const issues = [];

  if (!profile || typeof profile !== 'object') {
    return { valid: false, issues: ['Profile is not an object'] };
  }

  // Recursive scan for forbidden EPD patterns and properties across keys and values
  function scanForForbiddenPatterns(obj, currentPath = '') {
    if (!obj || typeof obj !== 'object') return;
    for (const [k, v] of Object.entries(obj)) {
      const propPath = currentPath ? `${currentPath}.${k}` : k;
      // Skip scanning inside rules.prohibitedPatterns definition list
      if (propPath === 'rules.prohibitedPatterns') continue;

      // Check key for epdFlashOnModalDismissal
      if (k.toLowerCase() === 'epdflashonmodaldismissal' && v !== false) {
        if (!issues.includes('epdFlashOnModalDismissal is forbidden on LivePaper displays')) {
          issues.push('epdFlashOnModalDismissal is forbidden on LivePaper displays');
        }
      }

      // Check key for forbidden patterns
      for (const pat of FORBIDDEN_EPD_PATTERNS) {
        if (k.toLowerCase().includes(pat.toLowerCase())) {
          issues.push(`Forbidden EPD pattern "${pat}" found in property key at ${propPath}`);
        }
      }

      // Check key for prohibited waveform properties (except zeroEpdWaveforms)
      if (k.toLowerCase().includes('waveform') && k !== 'zeroEpdWaveforms') {
        issues.push(`Prohibited EPD waveform property "${k}" at ${propPath}`);
      }

      // Check string values for forbidden patterns
      if (typeof v === 'string') {
        for (const pat of FORBIDDEN_EPD_PATTERNS) {
          if (v.toLowerCase().includes(pat.toLowerCase())) {
            issues.push(`Forbidden EPD pattern "${pat}" found in property value at ${propPath}: "${v}"`);
          }
        }
      }

      // Recurse into nested objects/arrays
      if (v && typeof v === 'object') {
        scanForForbiddenPatterns(v, propPath);
      }
    }
  }

  scanForForbiddenPatterns(profile);

  // Display block validation
  if (!profile.display || typeof profile.display !== 'object') {
    issues.push('Missing required display specification block');
  } else {
    const d = profile.display;

    // Technology
    if (d.technology !== 'Transflective / Reflective LCD (LivePaper)') {
      issues.push(`Invalid display technology: "${d.technology}". Must be Transflective / Reflective LCD (LivePaper)`);
    }

    // Panel
    if (d.panel && (d.panel.includes('EPD') || d.panel.toLowerCase().includes('e-ink'))) {
      issues.push('Panel specification must not indicate EPD or E-Ink architecture');
    }

    // Logical dimensions
    if (d.logicalWidth !== 1184 || d.logicalHeight !== 1584) {
      issues.push(`Invalid logical dimensions: ${d.logicalWidth}x${d.logicalHeight}. Expected 1184x1584`);
    }

    // Physical dimensions
    if (d.physicalWidth === undefined || d.physicalHeight === undefined) {
      issues.push('Missing required physical dimensions (physicalWidth, physicalHeight) in display specification');
    } else if (typeof d.physicalWidth !== 'number' || d.physicalWidth <= 0 || typeof d.physicalHeight !== 'number' || d.physicalHeight <= 0) {
      issues.push(`Invalid physical dimensions: ${d.physicalWidth}x${d.physicalHeight}. Must be positive numbers`);
    } else if (d.physicalWidth !== 1200 || d.physicalHeight !== 1600) {
      issues.push(`Invalid physical dimensions: ${d.physicalWidth}x${d.physicalHeight}. Expected 1200x1600 for DC1 panel`);
    }

    // Optional physical millimeter dimensions
    if (d.physicalWidthMm !== undefined && (typeof d.physicalWidthMm !== 'number' || d.physicalWidthMm <= 0)) {
      issues.push(`Invalid physicalWidthMm: ${d.physicalWidthMm}. Must be a positive number`);
    }
    if (d.physicalHeightMm !== undefined && (typeof d.physicalHeightMm !== 'number' || d.physicalHeightMm <= 0)) {
      issues.push(`Invalid physicalHeightMm: ${d.physicalHeightMm}. Must be a positive number`);
    }
    if (d.widthMm !== undefined && (typeof d.widthMm !== 'number' || d.widthMm <= 0)) {
      issues.push('Invalid widthMm. Must be a positive number');
    }
    if (d.heightMm !== undefined && (typeof d.heightMm !== 'number' || d.heightMm <= 0)) {
      issues.push('Invalid heightMm. Must be a positive number');
    }

    // Color depth & grayscale invariants (strictly 8-bit grayscale, 256 discrete levels)
    if (d.colorDepthBits !== 8) {
      issues.push(`Invalid color depth: ${d.colorDepthBits}-bit. LivePaper display requires strictly 8-bit grayscale`);
    }
    if (d.colorLevels !== undefined && d.colorLevels !== 256) {
      issues.push(`Invalid color levels: ${d.colorLevels}. Expected 256 for 8-bit grayscale`);
    }
    if (d.grayscaleLevels !== undefined && d.grayscaleLevels !== 256) {
      issues.push(`Invalid grayscale levels: ${d.grayscaleLevels}. Expected 256 for 8-bit grayscale`);
    }
    if (d.monochrome !== undefined && d.monochrome !== true) {
      issues.push('Display must be monochrome for LivePaper display profile');
    }

    // Hardware coordinate inset
    if (!d.hardwareInsetPx || d.hardwareInsetPx.left !== 8 || d.hardwareInsetPx.top !== 8) {
      issues.push('Hardware inset must be exactly 8px on left and top');
    }

    // Zero EPD waveforms & anti-EPD hooks
    if (d.zeroEpdWaveforms !== true) {
      issues.push('zeroEpdWaveforms must be strictly true');
    }
    if (d.allowScreenFlashHooks !== false) {
      issues.push('allowScreenFlashHooks must be strictly false on LivePaper displays');
    }
    if (d.waveformType !== undefined) {
      issues.push(`Prohibited EPD waveformType "${d.waveformType}" is forbidden on LivePaper displays`);
    }
    if (d.epdClearWaveform !== undefined && d.epdClearWaveform !== false) {
      issues.push('Prohibited EPD clear waveform: epdClearWaveform is forbidden on LivePaper displays');
    }
    if (d.epdFlashOnModalDismissal === true || (d.epdFlashOnModalDismissal !== undefined && d.epdFlashOnModalDismissal !== false)) {
      if (!issues.includes('epdFlashOnModalDismissal is forbidden on LivePaper displays')) {
        issues.push('epdFlashOnModalDismissal is forbidden on LivePaper displays');
      }
    }
    if (d.maxModalDismissPauseMs !== undefined && (typeof d.maxModalDismissPauseMs !== 'number' || d.maxModalDismissPauseMs > 0)) {
      if (!issues.includes('maxModalDismissPauseMs must be 0 (no artificial pauses on modal dismissal)')) {
        issues.push('maxModalDismissPauseMs must be 0 (no artificial pauses on modal dismissal)');
      }
    }

    // Settle time
    if (typeof d.settleMsStandard === 'number' && d.settleMsStandard < 150) {
      issues.push(`Standard settle time ${d.settleMsStandard}ms is below minimum 150ms fluid LivePaper standard`);
    }
  }

  // Touch block validation
  if (!profile.touch || typeof profile.touch !== 'object') {
    issues.push('Missing required touch specification block');
  } else {
    if (profile.touch.minTouchTargetDp && (profile.touch.minTouchTargetDp.width < 48 || profile.touch.minTouchTargetDp.height < 48)) {
      issues.push('Minimum touch target must be at least 48x48dp');
    }
  }

  // Hardware block validation
  if (profile.hardware) {
    if (!profile.hardware.serialPattern) {
      issues.push('Missing serialPattern in hardware specification');
    }
  }

  // Viewports validation
  if (profile.viewports && Array.isArray(profile.viewports.allowedOrientations)) {
    for (const ori of profile.viewports.allowedOrientations) {
      if (ori !== 'portrait' && ori !== 'landscape') {
        issues.push(`Invalid orientation: "${ori}". Only "portrait" and "landscape" permitted.`);
      }
    }
  }

  // Rules block validation
  if (profile.rules && typeof profile.rules === 'object') {
    if (profile.rules.epdFlashOnModalDismissal === true || (profile.rules.epdFlashOnModalDismissal !== undefined && profile.rules.epdFlashOnModalDismissal !== false)) {
      if (!issues.includes('epdFlashOnModalDismissal is forbidden on LivePaper displays')) {
        issues.push('epdFlashOnModalDismissal is forbidden on LivePaper displays');
      }
    }
    if (profile.rules.maxModalDismissPauseMs !== undefined && (typeof profile.rules.maxModalDismissPauseMs !== 'number' || profile.rules.maxModalDismissPauseMs > 0)) {
      if (!issues.includes('maxModalDismissPauseMs must be 0 (no artificial pauses on modal dismissal)')) {
        issues.push('maxModalDismissPauseMs must be 0 (no artificial pauses on modal dismissal)');
      }
    }
  }

  return {
    valid: issues.length === 0,
    issues
  };
}

module.exports = {
  validateProfileAgainstRules,
  FORBIDDEN_EPD_PATTERNS
};
