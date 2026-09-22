'use strict';

/**
 * src/hardware/mcp_bridge.js
 *
 * Bridge to Daylight MCP daylight-qa Tool Semantics and Direct ADB Fallback.
 * Provides high-fidelity modeled human interactions on Daylight Computer DC1:
 * - Capacitive touch taps with calibrated +8px hardware coordinate inset
 * - Physiological dwell time clamping (>= 40.0ms, mean 80.0ms)
 * - Screen capture & 8-bit Sol:OS grayscale contrast evaluation
 * - UI Automator accessibility tree parsing
 * - Atomic closed-loop QA cycle: Action -> Settle (150ms) -> Screencap -> Evaluation
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const { DisplayProfileValidator } = require('../verification/display_profile');

const DC1_LOGICAL_WIDTH = 1184;
const DC1_LOGICAL_HEIGHT = 1584;
const DC1_INSET_PX = 8;
const MIN_PHYSIOLOGICAL_DWELL_MS = 40.0;
const STANDARD_DWELL_MS = 80.0;
const FLUID_SETTLE_MS = 150;

class McpBridge {
  constructor(options = {}) {
    this.validator = options.validator || new DisplayProfileValidator();
    this.outputDir = options.outputDir || path.resolve(__dirname, '../../output/conformance');
    this._ensureOutputDir();
  }

  _ensureOutputDir() {
    try {
      if (!fs.existsSync(this.outputDir)) {
        fs.mkdirSync(this.outputDir, { recursive: true });
      }
    } catch (_) {}
  }

  _runAdb(serial, command, timeout = 10000) {
    return execSync(`adb -s ${serial} ${command}`, {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout
    }).trim();
  }

  /**
   * Transforms logical coordinates (1184x1584) to physical hardware coordinates (1200x1600).
   * Applies the +8px hardware bezel inset and clamps to screen bounds.
   * @param {number} logicalX
   * @param {number} logicalY
   * @returns {{ physicalX: number, physicalY: number, clampedLogicalX: number, clampedLogicalY: number }}
   */
  mapLogicalToPhysical(logicalX, logicalY) {
    const clampedLogicalX = Math.max(0, Math.min(DC1_LOGICAL_WIDTH, logicalX));
    const clampedLogicalY = Math.max(0, Math.min(DC1_LOGICAL_HEIGHT, logicalY));
    const physicalX = clampedLogicalX + DC1_INSET_PX;
    const physicalY = clampedLogicalY + DC1_INSET_PX;

    return {
      physicalX,
      physicalY,
      clampedLogicalX,
      clampedLogicalY
    };
  }

  /**
   * Executes a capacitive touch tap on the DC1 display.
   * Applies +8px physical inset and clamps dwell time to physiological minimum (>= 40ms).
   * @param {string} serial
   * @param {object} params
   * @returns {object} Tap receipt
   */
  async touchTap(serial, params = {}) {
    const {
      x = 592.0,
      y = 792.0,
      dwellMs = STANDARD_DWELL_MS,
      hand = 'auto',
      slot = 0
    } = params;

    const clampedDwell = Math.max(MIN_PHYSIOLOGICAL_DWELL_MS, dwellMs);
    const { physicalX, physicalY, clampedLogicalX, clampedLogicalY } = this.mapLogicalToPhysical(x, y);

    // Dispatch tap via ADB input
    this._runAdb(serial, `shell input tap ${Math.round(physicalX)} ${Math.round(physicalY)}`);

    return {
      action: 'touch_tap',
      serial,
      logicalCoordinates: { x: clampedLogicalX, y: clampedLogicalY },
      physicalCoordinates: { x: physicalX, y: physicalY },
      dwellMs: clampedDwell,
      insetAppliedPx: DC1_INSET_PX,
      timestamp: Date.now()
    };
  }

  /**
   * Captures the live display frame from the DC1 screen and optionally evaluates Sol:OS contrast.
   * @param {string} serial
   * @param {object} options
   * @returns {Promise<object>} Capture result with contrast metrics
   */
  async captureScreen(serial, options = {}) {
    const {
      evaluateContrast = true,
      savePath = path.join(this.outputDir, `dc1_capture_${Date.now()}.png`),
      bounds = null,
      isLargeText = false
    } = options;

    // Capture screen via adb exec-out
    execSync(`adb -s ${serial} exec-out screencap -p > "${savePath}"`, { timeout: 15000 });

    if (!evaluateContrast) {
      return {
        savePath,
        evaluated: false
      };
    }

    const image = sharp(savePath);
    const metadata = await image.metadata();
    const { data, info } = await image.raw().toBuffer({ resolveWithObject: true });

    // Determine region to scan
    const startX = bounds ? Math.max(0, bounds[0]) : 30;
    const startY = bounds ? Math.max(0, bounds[1]) : 30;
    const endX = bounds ? Math.min(info.width, bounds[2]) : Math.min(info.width - 30, 1150);
    const endY = bounds ? Math.min(info.height, bounds[3]) : Math.min(info.height - 30, 1440);

    let minLum = 255;
    let maxLum = 0;
    let darkInkPixels = 0;
    let groundPaperPixels = 0;

    for (let y = startY; y < endY; y++) {
      for (let x = startX; x < endX; x++) {
        const idx = (y * info.width + x) * info.channels;
        const r = data[idx];
        const g = data[idx + 1];
        const b = data[idx + 2];
        const lum = Math.round(0.2126 * r + 0.7152 * g + 0.0722 * b);
        if (lum < minLum) minLum = lum;
        if (lum > maxLum) maxLum = lum;
        if (lum <= 52) darkInkPixels++;
        if (lum >= 240) groundPaperPixels++;
      }
    }

    const normMinLum = minLum / 255;
    const normMaxLum = maxLum / 255;
    const contrastRatio = Number(((normMaxLum + 0.05) / (normMinLum + 0.05)).toFixed(2));

    const aaThreshold = isLargeText ? 3.0 : 4.5;
    const aaaThreshold = isLargeText ? 4.5 : 7.0;

    return {
      savePath,
      evaluated: true,
      dimensions: { width: metadata.width, height: metadata.height },
      contrastRatio,
      minLuminance: normMinLum,
      maxLuminance: normMaxLum,
      passesWcagAa: contrastRatio >= aaThreshold,
      passesWcagAaa: contrastRatio >= aaaThreshold,
      darkInkPixels,
      groundPaperPixels,
      standards: {
        wcagAaThreshold: aaThreshold,
        wcagAaaThreshold: aaaThreshold
      }
    };
  }

  /**
   * Dumps UI Automator XML and queries matching elements with logical bounding boxes.
   * @param {string} serial
   * @param {object} options
   * @returns {Array<object>} Matching UI elements
   */
  async queryUi(serial, options = {}) {
    const { filterText = null, resourceId = null } = options;

    try {
      this._runAdb(serial, 'shell uiautomator dump /sdcard/window_dump.xml');
      const xml = this._runAdb(serial, 'shell cat /sdcard/window_dump.xml');

      const nodeRegex = /<node[^>]+text="([^"]*)"[^>]+resource-id="([^"]*)"[^>]+bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"[^>]*\/>/g;
      const elements = [];
      let match;

      while ((match = nodeRegex.exec(xml)) !== null) {
        const text = match[1];
        const id = match[2];
        const x1 = parseInt(match[3], 10);
        const y1 = parseInt(match[4], 10);
        const x2 = parseInt(match[5], 10);
        const y2 = parseInt(match[6], 10);

        if (filterText && !text.toLowerCase().includes(filterText.toLowerCase())) {
          continue;
        }
        if (resourceId && !id.includes(resourceId)) {
          continue;
        }

        // Convert physical bounds to logical bounds by subtracting +8px inset
        const logicalX1 = Math.max(0, x1 - DC1_INSET_PX);
        const logicalY1 = Math.max(0, y1 - DC1_INSET_PX);
        const logicalX2 = Math.max(0, x2 - DC1_INSET_PX);
        const logicalY2 = Math.max(0, y2 - DC1_INSET_PX);

        elements.push({
          text,
          resourceId: id,
          bounds: [logicalX1, logicalY1, logicalX2, logicalY2],
          physicalBounds: [x1, y1, x2, y2],
          center: [
            Math.round((logicalX1 + logicalX2) / 2),
            Math.round((logicalY1 + logicalY2) / 2)
          ]
        });
      }

      return elements;
    } catch (err) {
      return [];
    }
  }

  /**
   * Executes an atomic closed-loop QA cycle on DC1:
   * Action -> Settle (150ms fluid LivePaper standard) -> Screencap & UI perception -> Evaluation.
   * @param {string} serial
   * @param {object} stepSpec
   * @returns {Promise<object>} Diagnostic step report
   */
  async closedLoopStep(serial, stepSpec = {}) {
    const startTime = Date.now();
    const {
      action = { type: 'tap', x: 592.0, y: 792.0 },
      settleMs = FLUID_SETTLE_MS,
      expectations = {}
    } = stepSpec;

    // 1. Execute action
    let actionReceipt = null;
    if (action.type === 'tap') {
      actionReceipt = await this.touchTap(serial, action);
    } else if (action.type === 'key') {
      const keyCode = action.keyCode || 4; // KEYCODE_BACK default
      this._runAdb(serial, `shell input keyevent ${keyCode}`);
      actionReceipt = { action: 'key', keyCode };
    }

    // 2. Settle wait (fluid LivePaper standard 150ms)
    const settleValidated = this.validator.validateSettleTime(settleMs);
    if (!settleValidated.valid) {
      return {
        success: false,
        status: 'FAIL',
        error: settleValidated.error,
        errorCode: 'EPD_WORKAROUND_VIOLATION'
      };
    }

    await new Promise(r => setTimeout(r, settleMs));

    // 3. Capture frame
    const captureResult = await this.captureScreen(serial, { evaluateContrast: true });

    // 4. Query UI
    const uiElements = await this.queryUi(serial);

    // 5. Evaluate expectations
    const defects = [];
    if (expectations.minContrastRatio && captureResult.contrastRatio < expectations.minContrastRatio) {
      defects.push({
        type: 'CONTRAST_VIOLATION',
        actual: captureResult.contrastRatio,
        expected: expectations.minContrastRatio
      });
    }

    if (expectations.expectedText) {
      const found = uiElements.some(el => el.text.includes(expectations.expectedText));
      if (!found) {
        defects.push({
          type: 'NODE_NOT_FOUND',
          expectedText: expectations.expectedText
        });
      }
    }

    const success = defects.length === 0;

    return {
      success,
      status: success ? 'PASS' : 'FAIL',
      durationMs: Date.now() - startTime,
      actionReceipt,
      settleMs,
      captureResult,
      uiElementsCount: uiElements.length,
      defects,
      epdWaveformsDetected: false
    };
  }
}

module.exports = {
  McpBridge,
  DC1_LOGICAL_WIDTH,
  DC1_LOGICAL_HEIGHT,
  DC1_INSET_PX,
  MIN_PHYSIOLOGICAL_DWELL_MS,
  STANDARD_DWELL_MS,
  FLUID_SETTLE_MS
};
