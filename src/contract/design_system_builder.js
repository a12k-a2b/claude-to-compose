'use strict';

/**
 * src/contract/design_system_builder.js
 *
 * Layer 4 Design System Contract IR Builder & Contrast Verifier for ctc v2.
 * Conforms to Draft 2020-12 DesignSystemContract schema.
 */

const SOL_OS_NEUTRAL_TOKENS = {
  '--os-0': { hex: '#FFFFFF', rgb: [255, 255, 255], luminance: 255, role: 'Base paper / primary canvas' },
  '--os-50': { hex: '#F7F7F7', rgb: [247, 247, 247], luminance: 247, role: 'Surface panels / cards' },
  '--os-100': { hex: '#DCD5C9', rgba: 'rgba(0,0,0,0.08)', rgb: [220, 213, 201], luminance: 215, role: 'Hairline borders / subtle dividers' },
  '--os-150': { hex: '#F5F5F5', rgb: [245, 245, 245], luminance: 245, role: 'Recessed canvas / input fields' },
  '--os-200': { hex: '#CCCCCC', rgb: [204, 204, 204], luminance: 204, role: 'Disabled controls / inactive indicators' },
  '--os-300': { hex: '#858585', rgb: [133, 133, 133], luminance: 133, role: 'Low emphasis / tertiary text / placeholder' },
  '--os-400': { hex: '#535353', rgb: [83, 83, 83], luminance: 83, role: 'Secondary text ink / icons' },
  '--os-800': { hex: '#343434', rgb: [52, 52, 52], luminance: 52, role: 'Dark fields / pressed states' },
  '--os-900': { hex: '#1A1A1A', rgb: [26, 26, 26], luminance: 26, role: 'Primary text ink / headlines' },
  '--os-1000': { hex: '#000000', rgb: [0, 0, 0], luminance: 0, role: 'Max black ink / deep focus states' }
};

const SOL_OS_BRAND_GRAYS = {
  Yellow: { hex: '#CECECE', rgb: [206, 206, 206], luminance: 206 },
  Amber: { hex: '#9D9D9E', rgb: [157, 157, 157], luminance: 157 },
  Orange: { hex: '#6C6C6D', rgb: [108, 108, 108], luminance: 108 }
};

const FORBIDDEN_EPD_PATTERNS = [
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
  'Thread.sleep',
  'modal_dismiss_pause',
  'artificial_modal_dismiss_pause',
  'artificial_pause'
];

function srgbToLinear(c) {
  const v = c / 255.0;
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}

function hexToRgb(hex) {
  if (typeof hex !== 'string') {
    throw new TypeError(`Expected hex string, got ${typeof hex}`);
  }
  const clean = hex.replace('#', '');
  if (!/^[0-9a-fA-F]{3}$|^[0-9a-fA-F]{6}$/.test(clean)) {
    throw new Error(`Invalid hex color string: "${hex}"`);
  }
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

function relativeLuminance(input) {
  const rgb = typeof input === 'string' ? hexToRgb(input) : input;
  const rLin = srgbToLinear(rgb[0]);
  const gLin = srgbToLinear(rgb[1]);
  const bLin = srgbToLinear(rgb[2]);
  return 0.2126 * rLin + 0.7152 * gLin + 0.0722 * bLin;
}

function contrastRatio(colorA, colorB) {
  const l1 = relativeLuminance(colorA);
  const l2 = relativeLuminance(colorB);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return Number(((lighter + 0.05) / (darker + 0.05)).toFixed(2));
}

function verifyContrast(foregroundHex, backgroundHex, isLargeText = false) {
  const ratio = contrastRatio(foregroundHex, backgroundHex);
  const requiredRatio = isLargeText ? 4.5 : 7.0;
  const pass = ratio >= requiredRatio;
  const level = ratio >= 7.0 ? 'AAA' : ratio >= 4.5 ? 'AA' : 'FAIL';

  return {
    foreground: foregroundHex,
    background: backgroundHex,
    contrastRatio: ratio,
    requiredRatio,
    isLargeText,
    pass,
    level,
    error: pass ? null : `Contrast ratio ${ratio.toFixed(2)}:1 fails required ${requiredRatio}:1 (${isLargeText ? 'AA' : 'AAA'})`
  };
}

function detectColorCollision(surfaceAHex, surfaceBHex) {
  const rgbA = hexToRgb(surfaceAHex);
  const rgbB = hexToRgb(surfaceBHex);
  const lumA = Math.round(0.299 * rgbA[0] + 0.587 * rgbA[1] + 0.114 * rgbA[2]);
  const lumB = Math.round(0.299 * rgbB[0] + 0.587 * rgbB[1] + 0.114 * rgbB[2]);
  const delta = Math.abs(lumA - lumB);

  const collision = delta < 15;
  return {
    lumA,
    lumB,
    delta,
    collision,
    requiresHairlineBorder: collision,
    recommendedBorderToken: '--os-100'
  };
}

function assertNoEpdHooks(textOrCode) {
  if (!textOrCode) return true;
  const str = typeof textOrCode === 'string' ? textOrCode : JSON.stringify(textOrCode);
  for (const pattern of FORBIDDEN_EPD_PATTERNS) {
    if (str.includes(pattern)) {
      const err = new Error(`EPD workaround violation: forbidden pattern "${pattern}" detected. DC1 LivePaper is a transflective LCD with zero EPD waveforms.`);
      err.code = 'EPD_WORKAROUND_VIOLATION';
      throw err;
    }
  }
  return true;
}

function createDesignSystemContract(options = {}) {
  if (options.customCode) {
    assertNoEpdHooks(options.customCode);
  }

  return {
    version: '2.0.0',
    system: 'Daylight Sol:OS',
    displayProfile: {
      technology: 'Transflective LivePaper LCD (60Hz - 120Hz)',
      colorDepth: '8-bit Grayscale (256 discrete levels)',
      framerate: '60Hz - 120Hz native fluid VSYNC',
      frontlight: 'Pure Amber (Zero Blue Light)',
      zeroEpdWaveforms: true,
      epdRestrictions: {
        allowWaveforms: false,
        allowScreenClearFlashes: false,
        allowActionRefreshBroadcast: false
      }
    },
    tokens: {
      neutralGrayscale: { ...SOL_OS_NEUTRAL_TOKENS, ...(options.customTokens || {}) },
      calibratedBrandGrays: { ...SOL_OS_BRAND_GRAYS, ...(options.customBrandGrays || {}) },
      typography: {
        headline: {
          family: 'ABC Arizona Flare',
          fallback: 'serif',
          variableAxes: { opsz: [12, 100], wght: [100, 900] },
          resource: 'res/font/abc_arizona_flare_variable.ttf',
          weights: [400, 700],
          lineHeightMultiplier: 1.2,
          letterSpacingEm: -0.02
        },
        body: {
          family: 'ABC Arizona Sans',
          fallback: 'sans-serif',
          variableAxes: { opsz: [12, 100], wght: [100, 900] },
          resource: 'res/font/abc_arizona_sans_variable.ttf',
          weights: [400, 600, 700],
          lineHeightMultiplier: 1.45,
          letterSpacingEm: 0.0
        },
        mono: {
          family: 'ABC ROM Mono',
          fallback: 'monospace',
          weights: [400, 700],
          resource: 'res/font/abc_rom_mono_regular.ttf',
          lineHeightMultiplier: 1.3,
          letterSpacingEm: -0.01
        }
      },
      spacingGrid: {
        baseUnitDp: 4,
        scale: [0, 2, 4, 8, 12, 16, 20, 24, 32, 40, 48, 64]
      },
      shapes: {
        pill: { radiusDp: 1000, isUniform: true },
        card: { radiusDp: 16, isUniform: true },
        button: { radiusDp: 21, isUniform: true },
        chip: { radiusDp: 11, isUniform: true },
        hairline: { widthDp: 0.5, defaultColor: '--os-100' }
      }
    },
    transflectiveContrastRules: {
      minTextContrastRatio: 4.5,
      minHeadlineContrastRatio: 7.0,
      minTouchTargetDp: { width: 48, height: 48 },
      minAdjacentSurfaceDeltaLuminance: 15,
      rasterizationEngine: 'Android Skia 8-bit Grayscale Stem Darkening (No RGB subpixel color fringing)'
    }
  };
}

module.exports = {
  SOL_OS_NEUTRAL_TOKENS,
  SOL_OS_BRAND_GRAYS,
  FORBIDDEN_EPD_PATTERNS,
  srgbToLinear,
  hexToRgb,
  relativeLuminance,
  contrastRatio,
  verifyContrast,
  detectColorCollision,
  assertNoEpdHooks,
  createDesignSystemContract
};
