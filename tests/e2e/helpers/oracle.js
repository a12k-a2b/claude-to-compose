'use strict';

/**
 * tests/e2e/helpers/oracle.js
 *
 * Authoritative Mathematical and Specification Oracles for ctc v2.
 * Used as the definitive ground truth for test assertions.
 */

// Sol:OS Neutral Grayscale Tokens
const SOL_OS_TOKENS = {
  '--os-0': { hex: '#FFFFFF', rgb: [255, 255, 255], luminance: 255, role: 'Base paper / primary canvas' },
  '--os-50': { hex: '#F7F7F7', rgb: [247, 247, 247], luminance: 247, role: 'Surface panels / cards' },
  '--os-100': { hex: '#DCD5C9', rgb: [220, 213, 201], luminance: 215, role: 'Hairline borders / subtle dividers' },
  '--os-150': { hex: '#F5F5F5', rgb: [245, 245, 245], luminance: 245, role: 'Recessed canvas / input fields' },
  '--os-200': { hex: '#CCCCCC', rgb: [204, 204, 204], luminance: 204, role: 'Disabled controls / inactive indicators' },
  '--os-300': { hex: '#858585', rgb: [133, 133, 133], luminance: 133, role: 'Low emphasis / tertiary text / placeholder' },
  '--os-400': { hex: '#535353', rgb: [83, 83, 83], luminance: 83, role: 'Secondary text ink / icons' },
  '--os-800': { hex: '#343434', rgb: [52, 52, 52], luminance: 52, role: 'Dark fields / pressed states' },
  '--os-900': { hex: '#1A1A1A', rgb: [26, 26, 26], luminance: 26, role: 'Primary text ink / headlines' },
  '--os-1000': { hex: '#000000', rgb: [0, 0, 0], luminance: 0, role: 'Max black ink / deep focus states' }
};

// Calibrated Brand Accents
const SOL_OS_BRAND_GRAYS = {
  Yellow: { hex: '#CECECE', rgb: [206, 206, 206], luminance: 206 },
  Amber: { hex: '#9D9D9E', rgb: [157, 157, 157], luminance: 157 },
  Orange: { hex: '#6C6C6D', rgb: [108, 108, 108], luminance: 108 }
};

// Daylight DC1 Hardware Specification
const DC1_SPEC = {
  model: 'DC_1',
  product: 'vext_jagar',
  panel: 'Sharp NT36523N Transflective / Reflective LCD (LivePaper)',
  refreshRateHz: { min: 60, max: 120 },
  colorDepthBits: 8,
  grayscaleLevels: 256,
  physicalWidth: 1200,
  physicalHeight: 1600,
  dpi: 270,
  logicalWidth: 1184,
  logicalHeight: 1584,
  density: 2.0,
  logicalWidthDp: 592,
  logicalHeightDp: 792,
  hardwareInsetPx: { left: 8, top: 8, right: 8, bottom: 8 },
  minTouchTargetDp: { width: 48, height: 48 },
  minTouchTargetPx: { width: 96, height: 96 },
  settleMsStandard: 150,
  zeroEpdWaveforms: true,
  allowedDevices: ['rooted 3', 'rooted 4', 'JMBR00380', 'JMBR00405']
};

// Converts 8-bit sRGB component [0..255] to linear luminance component
function srgbToLinear(c) {
  const v = c / 255.0;
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}

// Parses hex string '#RRGGBB' to [r, g, b]
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

// Computes relative luminance L from [r, g, b] or hex
function relativeLuminance(input) {
  const rgb = typeof input === 'string' ? hexToRgb(input) : input;
  const rLin = srgbToLinear(rgb[0]);
  const gLin = srgbToLinear(rgb[1]);
  const bLin = srgbToLinear(rgb[2]);
  return 0.2126 * rLin + 0.7152 * gLin + 0.0722 * bLin;
}

// Computes WCAG 2.1 contrast ratio between two colors
function contrastRatio(colorA, colorB) {
  const l1 = relativeLuminance(colorA);
  const l2 = relativeLuminance(colorB);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

// Computes Euclidean spatial drift distance
function spatialDrift(actualX, actualY, expectedX, expectedY) {
  const dx = actualX - expectedX;
  const dy = actualY - expectedY;
  return {
    dx,
    dy,
    distance: Math.sqrt(dx * dx + dy * dy)
  };
}

// Computes Bounding Box Intersection over Union (IoU)
function boxIoU(boxA, boxB) {
  const x1 = Math.max(boxA.left || boxA.x, boxB.left || boxB.x);
  const y1 = Math.max(boxA.top || boxA.y, boxB.top || boxB.y);
  const x2 = Math.min(
    (boxA.left || boxA.x) + (boxA.width || (boxA.right - boxA.left)),
    (boxB.left || boxB.x) + (boxB.width || (boxB.right - boxB.left))
  );
  const y2 = Math.min(
    (boxA.top || boxA.y) + (boxA.height || (boxA.bottom - boxA.top)),
    (boxB.top || boxB.y) + (boxB.height || (boxB.bottom - boxB.top))
  );

  const intersectionW = Math.max(0, x2 - x1);
  const intersectionH = Math.max(0, y2 - y1);
  const intersectionArea = intersectionW * intersectionH;

  const areaA = (boxA.width || (boxA.right - boxA.left)) * (boxA.height || (boxA.bottom - boxA.top));
  const areaB = (boxB.width || (boxB.right - boxB.left)) * (boxB.height || (boxB.bottom - boxB.top));
  const unionArea = areaA + areaB - intersectionArea;

  return unionArea <= 0 ? 0 : intersectionArea / unionArea;
}

// Computes Dice Coefficient
function diceCoefficient(intersection, sizeA, sizeB) {
  if (sizeA + sizeB <= 0) return 1.0;
  return (2.0 * intersection) / (sizeA + sizeB);
}

// Transform logical (1184x1584) coordinate to physical panel (1200x1600)
function logicalToPhysical(x, y) {
  return {
    x: x + DC1_SPEC.hardwareInsetPx.left,
    y: y + DC1_SPEC.hardwareInsetPx.top
  };
}

// Transform physical panel (1200x1600) coordinate to logical (1184x1584)
function physicalToLogical(x, y) {
  return {
    x: x - DC1_SPEC.hardwareInsetPx.left,
    y: y - DC1_SPEC.hardwareInsetPx.top
  };
}

// Models Fitts's Law duration
function fittsDurationMs(distancePx, targetWidthPx, a = 50, b = 100) {
  const id = Math.log2(1 + distancePx / Math.max(1, targetWidthPx));
  return Math.round(a + b * id);
}

module.exports = {
  SOL_OS_TOKENS,
  SOL_OS_BRAND_GRAYS,
  DC1_SPEC,
  srgbToLinear,
  hexToRgb,
  relativeLuminance,
  contrastRatio,
  spatialDrift,
  boxIoU,
  diceCoefficient,
  logicalToPhysical,
  physicalToLogical,
  fittsDurationMs
};
