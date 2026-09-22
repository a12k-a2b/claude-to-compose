'use strict';

/**
 * src/verification/display_profile.js
 *
 * Daylight DC1 Hardware Profile Rules Validator.
 * Validates display architecture, Sol:OS grayscale tokens, capacitive touch
 * coordinates, settling times, and strict prohibition of EPD workarounds.
 */

const fs = require('fs');
const path = require('path');

const DC1_PROFILE_PATH = path.resolve(__dirname, '../profiles/daylight-dc1.json');

const SOL_OS_TOKENS = Object.freeze({
  '--os-0': { hex: '#FFFFFF', rgb: [255, 255, 255], lum: 255, role: 'Base paper' },
  '--os-50': { hex: '#F7F7F7', rgb: [247, 247, 247], lum: 247, role: 'Surface cards' },
  '--os-100': { hex: '#DCD5C9', rgb: [220, 213, 201], lum: 215, role: 'Hairline borders' },
  '--os-150': { hex: '#F5F5F5', rgb: [245, 245, 245], lum: 245, role: 'Recessed canvas' },
  '--os-200': { hex: '#CCCCCC', rgb: [204, 204, 204], lum: 204, role: 'Disabled controls' },
  '--os-300': { hex: '#858585', rgb: [133, 133, 133], lum: 133, role: 'Low emphasis text' },
  '--os-400': { hex: '#535353', rgb: [83, 83, 83], lum: 83, role: 'Secondary text ink' },
  '--os-800': { hex: '#343434', rgb: [52, 52, 52], lum: 52, role: 'Dark fields' },
  '--os-900': { hex: '#1A1A1A', rgb: [26, 26, 26], lum: 26, role: 'Primary text ink' },
  '--os-1000': { hex: '#000000', rgb: [0, 0, 0], lum: 0, role: 'Max black ink' }
});

const BRAND_GRAYS = Object.freeze({
  yellow: { hex: '#CECECE', lum: 206, role: 'Brand yellow accent' },
  amber: { hex: '#9D9D9E', lum: 157, role: 'Brand amber accent' },
  orange: { hex: '#6C6C6D', lum: 108, role: 'Brand orange accent' }
});

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
  'artificial_pause'
]);

class DisplayProfileValidator {
  constructor(customProfile = null) {
    if (customProfile) {
      this.profile = customProfile;
    } else if (fs.existsSync(DC1_PROFILE_PATH)) {
      try {
        this.profile = JSON.parse(fs.readFileSync(DC1_PROFILE_PATH, 'utf8'));
      } catch (_) {
        this.profile = this._getDefaultDc1Profile();
      }
    } else {
      this.profile = this._getDefaultDc1Profile();
    }
  }

  _getDefaultDc1Profile() {
    return {
      schemaVersion: '2.0.0',
      id: 'daylight-dc1',
      hardware: {
        model: 'DC_1',
        product: 'vext_jagar',
        dpi: 270,
        density: 2.0,
        serialPattern: '^JMBR[0-9]{5}$',
        allowedDevices: ['rooted 3', 'rooted 4', 'JMBR00380', 'JMBR00405']
      },
      display: {
        technology: 'Transflective / Reflective LCD (LivePaper)',
        panel: 'Sharp NT36523N Transflective / Reflective LCD (LivePaper)',
        physicalWidth: 1200,
        physicalHeight: 1600,
        logicalWidth: 1184,
        logicalHeight: 1584,
        logicalWidthDp: 592,
        logicalHeightDp: 792,
        density: 2.0,
        refreshRateHz: { min: 60, max: 120 },
        hardwareInsetPx: { left: 8, top: 8, right: 8, bottom: 8 },
        settleMsStandard: 150,
        settleMsMin: 150,
        settleMsMax: 300,
        zeroEpdWaveforms: true
      },
      touch: {
        technology: 'Capacitive Multi-Touch (Linux MT Protocol B)',
        eventDevice: '/dev/input/event2',
        coordinateInsetPx: { dx: 8, dy: 8 },
        minTouchTargetDp: { width: 48, height: 48 },
        minTouchTargetPx: { width: 96, height: 96 },
        standardDwellMs: 80.0,
        minPhysiologicalDwellMs: 40.0
      },
      rules: {
        prohibitedPatterns: FORBIDDEN_EPD_PATTERNS
      }
    };
  }

  validateProfileConfiguration(profile = this.profile) {
    const issues = [];
    if (!profile || typeof profile !== 'object') {
      return { valid: false, issues: ['Profile is not an object'] };
    }
    if (!profile.display || typeof profile.display !== 'object') {
      issues.push('Missing required display specification block');
    } else {
      if (profile.display.technology !== 'Transflective / Reflective LCD (LivePaper)') {
        issues.push(`Invalid display technology: "${profile.display.technology}". Must be Transflective / Reflective LCD (LivePaper)`);
      }
      if (profile.display.logicalWidth !== 1184 || profile.display.logicalHeight !== 1584) {
        issues.push(`Invalid logical dimensions: ${profile.display.logicalWidth}x${profile.display.logicalHeight}. Expected 1184x1584`);
      }
      if (profile.display.hardwareInsetPx?.left !== 8 || profile.display.hardwareInsetPx?.top !== 8) {
        issues.push('Hardware inset must be exactly 8px on left and top');
      }
      if (profile.display.zeroEpdWaveforms !== true) {
        issues.push('zeroEpdWaveforms must be strictly true');
      }
    }
    return { valid: issues.length === 0, issues };
  }

  logicalToPhysical(x, y) {
    const inset = this.profile.display?.hardwareInsetPx || { left: 8, top: 8 };
    return { x: x + inset.left, y: y + inset.top };
  }

  physicalToLogical(x, y) {
    const inset = this.profile.display?.hardwareInsetPx || { left: 8, top: 8 };
    return { x: x - inset.left, y: y - inset.top };
  }

  validateViewport(widthPx, heightPx, orientation = 'portrait') {
    const allowedOrientations = ['portrait', 'landscape'];
    if (!allowedOrientations.includes(orientation)) {
      return { valid: false, error: `Invalid orientation: "${orientation}". Allowed: portrait, landscape` };
    }
    const expectedW = orientation === 'portrait' ? 1184 : 1584;
    const expectedH = orientation === 'portrait' ? 1584 : 1184;

    const valid = widthPx === expectedW && heightPx === expectedH;
    return {
      valid,
      orientation,
      expected: { widthPx: expectedW, heightPx: expectedH },
      actual: { widthPx, heightPx },
      error: valid ? null : `Viewport ${widthPx}x${heightPx} does not match DC1 active canvas ${expectedW}x${expectedH}`
    };
  }

  validateTouchTarget(widthPx, heightPx, density = 2.0) {
    const minDp = this.profile.touch?.minTouchTargetDp?.width || 48;
    const minPx = minDp * density;
    const widthDp = widthPx / density;
    const heightDp = heightPx / density;

    const valid = widthPx >= minPx && heightPx >= minPx;
    return {
      valid,
      widthDp,
      heightDp,
      minDp,
      minPx,
      error: valid ? null : `Touch target ${widthDp.toFixed(1)}x${heightDp.toFixed(1)}dp is smaller than minimum ${minDp}x${minDp}dp (${minPx}px)`
    };
  }

  validateSettleTime(settleMs) {
    const standard = this.profile.display?.settleMsStandard || 150;
    if (typeof settleMs !== 'number' || Number.isNaN(settleMs)) {
      return { valid: false, settleMs, error: 'Settle time must be a finite number' };
    }
    if (settleMs < 150) {
      return { valid: false, settleMs, error: `Settle time ${settleMs}ms is below minimum 150ms fluid LivePaper standard` };
    }
    if (settleMs >= 500) {
      return { valid: false, settleMs, error: `Settle time ${settleMs}ms violates zero EPD waveform rule (artificial pause detected)` };
    }
    return { valid: true, settleMs, error: null };
  }

  assertNoEpdWorkarounds(content) {
    if (!content) return { pass: true };
    const str = typeof content === 'string' ? content : JSON.stringify(content);
    for (const pattern of FORBIDDEN_EPD_PATTERNS) {
      if (str.includes(pattern)) {
        return {
          pass: false,
          pattern,
          error: `EPD workaround violation: forbidden pattern "${pattern}" detected. DC1 LivePaper display requires standard SurfaceFlinger rendering.`
        };
      }
    }
    // Also scan for sleep calls with >= 500ms
    const sleepMatch = str.match(/Thread\.sleep\((\d+)\)/);
    if (sleepMatch && parseInt(sleepMatch[1], 10) >= 500) {
      return {
        pass: false,
        pattern: sleepMatch[0],
        error: `EPD workaround violation: artificial sleep delay (${sleepMatch[1]}ms) detected on LivePaper display.`
      };
    }
    return { pass: true };
  }

  validateDeviceSerial(serial) {
    const regex = new RegExp(this.profile.hardware?.serialPattern || '^JMBR[0-9]{5}$');
    const allowed = this.profile.hardware?.allowedDevices || [];
    const valid = regex.test(serial) || allowed.includes(serial);
    return {
      valid,
      serial,
      error: valid ? null : `Device target "${serial}" does not match Daylight DC1 hardware fleet format`
    };
  }

  srgbToLinear(c) {
    const v = c / 255.0;
    return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  }

  hexToRgb(hex) {
    const clean = hex.replace('#', '');
    if (clean.length === 3) {
      return [
        parseInt(clean[0] + clean[0], 16),
        parseInt(clean[1] + clean[1], 16),
        parseInt(clean[2] + clean[2], 16)
      ];
    }
    return [
      parseInt(clean.slice(0, 2), 16),
      parseInt(clean.slice(2, 4), 16),
      parseInt(clean.slice(4, 6), 16)
    ];
  }

  computeRelativeLuminance(hexOrRgb) {
    const rgb = typeof hexOrRgb === 'string' ? this.hexToRgb(hexOrRgb) : hexOrRgb;
    return 0.2126 * this.srgbToLinear(rgb[0]) + 0.7152 * this.srgbToLinear(rgb[1]) + 0.0722 * this.srgbToLinear(rgb[2]);
  }

  computeContrastRatio(colorA, colorB) {
    const l1 = this.computeRelativeLuminance(colorA);
    const l2 = this.computeRelativeLuminance(colorB);
    const lighter = Math.max(l1, l2);
    const darker = Math.min(l1, l2);
    return Number(((lighter + 0.05) / (darker + 0.05)).toFixed(2));
  }

  validateGrayscaleContrast(foregroundHex, backgroundHex, isLargeText = false) {
    const ratio = this.computeContrastRatio(foregroundHex, backgroundHex);
    const requiredAA = isLargeText ? 3.0 : 4.5;
    const requiredAAA = isLargeText ? 4.5 : 7.0;

    const passAA = ratio >= requiredAA;
    const passAAA = ratio >= requiredAAA;
    return {
      foregroundHex,
      backgroundHex,
      ratio,
      passAA,
      passAAA,
      requiredAA,
      requiredAAA,
      isLargeText,
      verdict: passAAA ? 'PASS_AAA' : passAA ? 'PASS_AA' : 'FAIL'
    };
  }

  computeGrayscaleLevel(hexOrRgb) {
    const rgb = typeof hexOrRgb === 'string' ? this.hexToRgb(hexOrRgb) : hexOrRgb;
    // Discrete unlinearized 8-bit grayscale level on reflective LCD (sRGB weights)
    return Math.round(0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2]);
  }

  validateAdjacentSurfaces(surfaceAHex, surfaceBHex, hasHairlineBorder = false) {
    const l1 = this.computeGrayscaleLevel(surfaceAHex);
    const l2 = this.computeGrayscaleLevel(surfaceBHex);
    const deltaL = Math.abs(l1 - l2);

    if (deltaL < 15 && !hasHairlineBorder) {
      return {
        valid: false,
        deltaL,
        error: `Adjacent surfaces (${surfaceAHex}, ${surfaceBHex}) have discrete grayscale delta ${deltaL} < 15. Requires explicit --os-100 hairline border (0.5dp).`
      };
    }

    return {
      valid: true,
      deltaL,
      hasHairlineBorder
    };
  }
}

module.exports = {
  DisplayProfileValidator,
  SOL_OS_TOKENS,
  BRAND_GRAYS,
  FORBIDDEN_EPD_PATTERNS
};
