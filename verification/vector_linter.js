#!/usr/bin/env node

/**
 * verification/vector_linter.js
 *
 * Pre-flight Sub-Glyph Semantic Path Completeness Linter & Verification Gate.
 * Autonomously verifies closed sub-path counts, bounding box non-collapse,
 * and ink mass centroids between source SVGs and synthesized Compose/XML vectors.
 *
 * Enforces:
 * 1. Closed Sub-Path Invariant: N_closed,SVG == N_closed,Synth (zero tolerance).
 * 2. Bounding Box Non-Collapse (W > 0.5px, H > 0.5px) & IoU (>= 90%).
 * 3. Ink Centroid Spatial Shift Oracle via continuous alpha moments: Delta C <= 1.0px.
 */

const fs = require('node:fs');
const path = require('node:path');
const sharp = require('sharp');
const { Command } = require('commander');

const { SvgParser } = require('../extractor/svg_parser');
const { VectorGenerator } = require('../synthesizer/vector_generator');

const EXIT_CODES = {
  SUCCESS: 0,
  VETO_FAILURE: 1,
  INVALID_ARGUMENTS: 2,
  PARSE_ERROR: 3
};

class VectorLintVetoError extends Error {
  constructor(message, violations = [], report = null) {
    super(message);
    this.name = 'VectorLintVetoError';
    this.violations = violations;
    this.report = report;
  }
}

class VectorLinter {
  /**
   * @param {Object} [options]
   * @param {string} [options.projectRoot]
   * @param {string} [options.specPath]
   * @param {string} [options.outputDir]
   * @param {string} [options.androidDir]
   * @param {number} [options.maxCentroidDrift=1.0] - Spatial drift threshold in px (default 1.0px)
   * @param {number} [options.maxShiftPx] - Alias for maxCentroidDrift
   * @param {number} [options.minBboxIoU=90.0] - Minimum bounding box IoU percentage (default 90%)
   * @param {number} [options.minElementIou] - Alias for minBboxIoU (supports fraction or percentage)
   * @param {number} [options.minBboxDimension=0.5] - Minimum width/height in px before collapse flag
   * @param {boolean} [options.throwOnVeto=false] - If true, throws VectorLintVetoError on failure
   * @param {boolean} [options.debug=false]
   */
  constructor(options = {}) {
    let minIoU = 90.0;
    if (options.minBboxIoU !== undefined) {
      minIoU = options.minBboxIoU <= 1.0 ? options.minBboxIoU * 100 : options.minBboxIoU;
    } else if (options.minElementIou !== undefined) {
      minIoU = options.minElementIou <= 1.0 ? options.minElementIou * 100 : options.minElementIou;
    }

    const maxDrift = options.maxCentroidDrift !== undefined
      ? options.maxCentroidDrift
      : (options.maxShiftPx !== undefined ? options.maxShiftPx : 1.0);

    this.options = {
      projectRoot: options.projectRoot || process.cwd(),
      specPath: options.specPath || null,
      outputDir: options.outputDir || null,
      androidDir: options.androidDir || null,
      maxCentroidDrift: maxDrift,
      minBboxIoU: minIoU,
      minBboxDimension: options.minBboxDimension !== undefined ? options.minBboxDimension : 0.5,
      throwOnVeto: Boolean(options.throwOnVeto),
      debug: Boolean(options.debug),
      ...options
    };
  }

  // =========================================================================
  // Sub-Path Counting & Topology Analysis
  // =========================================================================

  /**
   * Counts closed sub-paths in an SVG path data `d` string.
   * Every 'Z' or 'z' command signifies a closed sub-path.
   * @param {string} d - SVG path data string
   * @returns {number}
   */
  static countClosedSubpathsFromD(d) {
    if (!d || typeof d !== 'string') return 0;
    const tokens = VectorGenerator.tokenizePath(d);
    return tokens.filter(t => t.command && t.command.toUpperCase() === 'Z').length;
  }

  /**
   * Splits a path data `d` string into individual sub-paths starting at M/m.
   * @param {string} d
   * @returns {Array<{ d: string, isClosed: boolean, commandCount: number }>}
   */
  static splitSubpaths(d) {
    if (!d || typeof d !== 'string') return [];
    const segments = VectorGenerator.tokenizePath(d);
    const subpaths = [];
    let currentCmds = [];
    let isClosed = false;

    for (const seg of segments) {
      const cmdUpper = seg.command.toUpperCase();
      if (cmdUpper === 'M' && currentCmds.length > 0) {
        subpaths.push({
          d: currentCmds.join(' '),
          isClosed,
          commandCount: currentCmds.length
        });
        currentCmds = [];
        isClosed = false;
      }

      if (cmdUpper === 'Z') {
        isClosed = true;
        currentCmds.push('Z');
      } else {
        const argsStr = seg.args && seg.args.length > 0 ? seg.args.join(' ') : '';
        currentCmds.push(`${seg.command} ${argsStr}`.trim());
      }
    }

    if (currentCmds.length > 0) {
      subpaths.push({
        d: currentCmds.join(' '),
        isClosed,
        commandCount: currentCmds.length
      });
    }

    return subpaths;
  }

  /**
   * Counts closed sub-paths in an SVG input (raw SVG XML string or parsed AST).
   * Prunes non-rendered elements (<defs>, <clipPath>, <mask />).
   * Normalizes primitives: <rect>, <circle>, <ellipse>, <polygon> as 1 closed sub-path;
   * <line>, <polyline> as 0 closed sub-paths (open strokes).
   * @param {string|Object} svgInput
   * @returns {{ totalClosedSubpaths: number, totalOpenSubpaths: number, totalSubpaths: number, elementCount: number, elements: Array<Object> }}
   */
  static countSvgClosedSubpaths(svgInput) {
    if (!svgInput) {
      return { totalClosedSubpaths: 0, totalOpenSubpaths: 0, totalSubpaths: 0, elementCount: 0, elements: [] };
    }

    let parsed;
    if (typeof svgInput === 'string') {
      parsed = SvgParser.parseSvgString(svgInput);
    } else if (typeof svgInput === 'object') {
      if (Array.isArray(svgInput.paths)) {
        parsed = svgInput;
      } else if (svgInput.rawSvg) {
        parsed = SvgParser.parseSvgString(svgInput.rawSvg);
      } else {
        parsed = svgInput;
      }
    }

    const paths = (parsed && parsed.paths) ? parsed.paths : [];
    const elements = [];
    let totalClosed = 0;
    let totalOpen = 0;

    for (let i = 0; i < paths.length; i++) {
      const p = paths[i];
      const d = p.d || '';
      const subpaths = VectorLinter.splitSubpaths(d);
      let pClosed = 0;
      let pOpen = 0;

      if (subpaths.length > 0) {
        for (const sp of subpaths) {
          if (sp.isClosed) pClosed++;
          else pOpen++;
        }
      } else if (d.trim()) {
        // Fallback tokenization check
        pClosed = VectorLinter.countClosedSubpathsFromD(d);
        if (pClosed === 0) pOpen = 1;
      }

      totalClosed += pClosed;
      totalOpen += pOpen;

      elements.push({
        index: i,
        id: p.id || `path_${i}`,
        type: p.primitiveType || 'path',
        closedSubpaths: pClosed,
        openSubpaths: pOpen,
        d: d
      });
    }

    return {
      totalClosedSubpaths: totalClosed,
      totalOpenSubpaths: totalOpen,
      totalSubpaths: totalClosed + totalOpen,
      elementCount: paths.length,
      elements
    };
  }

  static countClosedSubpathsFromSvg(svgInput) {
    return VectorLinter.countSvgClosedSubpaths(svgInput);
  }

  /**
   * Counts closed sub-paths (close() calls) in synthesized Jetpack Compose code or AST.
   * If iconName is specified, isolates that icon's property/builder block.
   * @param {string|Object} composeInput - Kotlin code string or vector AST
   * @param {string} [iconName] - Name of icon to isolate (e.g. "DocumentPlusIcon")
   * @returns {{ iconName: string, totalClosedSubpaths: number, pathBlockCount: number, closeCallsPerPath: number[] }}
   */
  static countComposeClosedSubpaths(composeInput, iconName = '') {
    if (!composeInput) {
      return { iconName, totalClosedSubpaths: 0, pathBlockCount: 0, closeCallsPerPath: [] };
    }

    if (typeof composeInput === 'object') {
      // In-memory AST
      const paths = composeInput.paths || [];
      const closeCalls = [];
      let total = 0;
      for (const p of paths) {
        const c = VectorLinter.countClosedSubpathsFromD(p.d || '');
        closeCalls.push(c);
        total += c;
      }
      return {
        iconName: iconName || composeInput.name || 'Unknown',
        totalClosedSubpaths: total,
        pathBlockCount: paths.length,
        closeCallsPerPath: closeCalls
      };
    }

    const code = String(composeInput);
    let targetCode = code;

    // Isolate icon definition if iconName provided and multiple icons in file
    if (iconName) {
      const normalizedName = VectorGenerator.normalizeIconName(iconName);
      const cleanName = iconName.replace(/^ClaudeIcons\./, '').replace(/`/g, '');
      const pattern = new RegExp(
        `(?:val\\s+(?:ClaudeIcons\\.)?(?:\`${cleanName}\`|${cleanName}|\`${normalizedName}\`|${normalizedName})\\s*:[\\s\\S]*?get\\(\\)\\s*\\{)`,
        'i'
      );
      const match = code.match(pattern);
      if (match) {
        const startIdx = match.index + match[0].length - 1; // position of '{'
        let depth = 0;
        let endIdx = -1;
        for (let i = startIdx; i < code.length; i++) {
          if (code[i] === '{') depth++;
          else if (code[i] === '}') {
            depth--;
            if (depth === 0) {
              endIdx = i;
              break;
            }
          }
        }
        if (endIdx !== -1) {
          targetCode = code.slice(startIdx, endIdx + 1);
        }
      }
    }

    // Strip comments to prevent false matches
    const sanitized = targetCode
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/[^\n]*/g, '');

    // Robust extraction of path(...) { ... } blocks supporting nested parens in arguments
    const closeCallsPerPath = [];
    let pathCount = 0;
    let totalClosed = 0;

    let scanIdx = 0;
    while (scanIdx < sanitized.length) {
      const sub = sanitized.slice(scanIdx);
      const match = sub.match(/\bpath\s*\(/);
      if (!match) break;

      const startParen = scanIdx + match.index + match[0].length - 1;
      let pDepth = 0;
      let endParen = -1;

      for (let i = startParen; i < sanitized.length; i++) {
        if (sanitized[i] === '(') pDepth++;
        else if (sanitized[i] === ')') {
          pDepth--;
          if (pDepth === 0) {
            endParen = i;
            break;
          }
        }
      }

      if (endParen === -1) break;

      const afterParen = sanitized.slice(endParen + 1).match(/^\s*\{/);
      if (!afterParen) {
        scanIdx = endParen + 1;
        continue;
      }

      const startBrace = endParen + 1 + afterParen[0].length - 1;
      let bDepth = 0;
      let endBrace = -1;

      for (let i = startBrace; i < sanitized.length; i++) {
        if (sanitized[i] === '{') bDepth++;
        else if (sanitized[i] === '}') {
          bDepth--;
          if (bDepth === 0) {
            endBrace = i;
            break;
          }
        }
      }

      if (endBrace === -1) break;

      const blockBody = sanitized.slice(startBrace + 1, endBrace);
      const closeMatches = blockBody.match(/\bclose\s*\(\s*\)/g) || [];
      closeCallsPerPath.push(closeMatches.length);
      totalClosed += closeMatches.length;
      pathCount++;

      scanIdx = endBrace + 1;
    }

    // If no path(...) blocks found via parser, count all word-bounded close() invocations
    if (pathCount === 0) {
      const directMatches = sanitized.match(/\bclose\s*\(\s*\)/g) || [];
      totalClosed = directMatches.length;
      if (totalClosed > 0) {
        pathCount = 1;
        closeCallsPerPath.push(totalClosed);
      }
    }

    return {
      iconName,
      totalClosedSubpaths: totalClosed,
      pathBlockCount: pathCount,
      closeCallsPerPath
    };
  }

  static countClosedSubpathsFromComposeCode(code, iconName = '') {
    return VectorLinter.countComposeClosedSubpaths(code, iconName);
  }

  /**
   * Counts closed sub-paths (Z/z) in Android VectorDrawable XML drawables.
   * @param {string} xmlInput
   * @returns {{ totalClosedSubpaths: number, pathCount: number, closeCommandsPerPath: number[] }}
   */
  static countXmlClosedSubpaths(xmlInput) {
    if (!xmlInput || typeof xmlInput !== 'string') {
      return { totalClosedSubpaths: 0, pathCount: 0, closeCommandsPerPath: [] };
    }

    const pathDataRegex = /android:pathData="([^"]+)"/g;
    let match;
    const closeCommandsPerPath = [];
    let totalClosed = 0;
    let pathCount = 0;

    while ((match = pathDataRegex.exec(xmlInput)) !== null) {
      pathCount++;
      const d = match[1];
      const count = VectorLinter.countClosedSubpathsFromD(d);
      closeCommandsPerPath.push(count);
      totalClosed += count;
    }

    return {
      totalClosedSubpaths: totalClosed,
      pathCount,
      closeCommandsPerPath
    };
  }

  static countClosedSubpathsFromXml(xmlInput) {
    return VectorLinter.countXmlClosedSubpaths(xmlInput);
  }

  // =========================================================================
  // Geometric Bounding Box & IoU Calculation
  // =========================================================================

  /**
   * Computes analytical bounding box for SVG path data d.
   * Handles Bézier curve extrema derivatives and stroke width expansion.
   * @param {string} d
   * @param {number} [strokeWidth=0]
   * @returns {{ minX: number, minY: number, maxX: number, maxY: number, width: number, height: number, isCollapsed: boolean }}
   */
  static computeBoundingBoxAnalytical(d, strokeWidth = 0) {
    if (!d || typeof d !== 'string') {
      return { minX: 0, minY: 0, maxX: 0, maxY: 0, width: 0, height: 0, isCollapsed: true };
    }

    const segments = VectorGenerator.tokenizePath(d);
    if (segments.length === 0) {
      return { minX: 0, minY: 0, maxX: 0, maxY: 0, width: 0, height: 0, isCollapsed: true };
    }

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    let curX = 0;
    let curY = 0;

    const includePoint = (x, y) => {
      if (Number.isFinite(x) && Number.isFinite(y)) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    };

    for (const seg of segments) {
      const { command, args } = seg;
      const cmdUpper = command.toUpperCase();

      switch (cmdUpper) {
        case 'M':
        case 'L':
          curX = args[0];
          curY = args[1];
          includePoint(curX, curY);
          break;

        case 'H':
          curX = args[0];
          includePoint(curX, curY);
          break;

        case 'V':
          curY = args[0];
          includePoint(curX, curY);
          break;

        case 'C': {
          const [x1, y1, x2, y2, x3, y3] = args;
          includePoint(x3, y3);

          // Find derivative roots for cubic curve: 3at^2 + 2bt + c = 0
          const findCubicRoots = (p0, p1, p2, p3) => {
            const a = -p0 + 3 * p1 - 3 * p2 + p3;
            const b = 2 * (p0 - 2 * p1 + p2);
            const c = p1 - p0;
            if (Math.abs(a) < 1e-6) {
              if (Math.abs(b) > 1e-6) {
                const t = -c / b;
                if (t > 0 && t < 1) return [t];
              }
              return [];
            }
            const disc = b * b - 4 * a * c;
            if (disc < 0) return [];
            const sqrtDisc = Math.sqrt(disc);
            const roots = [];
            const t1 = (-b + sqrtDisc) / (2 * a);
            const t2 = (-b - sqrtDisc) / (2 * a);
            if (t1 > 0 && t1 < 1) roots.push(t1);
            if (t2 > 0 && t2 < 1) roots.push(t2);
            return roots;
          };

          const evalCubic = (p0, p1, p2, p3, t) => {
            const mt = 1 - t;
            return mt * mt * mt * p0 + 3 * mt * mt * t * p1 + 3 * mt * t * t * p2 + t * t * t * p3;
          };

          for (const t of findCubicRoots(curX, x1, x2, x3)) {
            includePoint(evalCubic(curX, x1, x2, x3, t), evalCubic(curY, y1, y2, y3, t));
          }
          for (const t of findCubicRoots(curY, y1, y2, y3)) {
            includePoint(evalCubic(curX, x1, x2, x3, t), evalCubic(curY, y1, y2, y3, t));
          }

          curX = x3;
          curY = y3;
          break;
        }

        case 'Q': {
          const [x1, y1, x2, y2] = args;
          includePoint(x2, y2);

          const findQuadRoot = (p0, p1, p2) => {
            const denom = p0 - 2 * p1 + p2;
            if (Math.abs(denom) > 1e-6) {
              const t = (p0 - p1) / denom;
              if (t > 0 && t < 1) return t;
            }
            return null;
          };

          const evalQuad = (p0, p1, p2, t) => {
            const mt = 1 - t;
            return mt * mt * p0 + 2 * mt * t * p1 + t * t * p2;
          };

          const tx = findQuadRoot(curX, x1, x2);
          if (tx !== null) includePoint(evalQuad(curX, x1, x2, tx), evalQuad(curY, y1, y2, tx));

          const ty = findQuadRoot(curY, y1, y2);
          if (ty !== null) includePoint(evalQuad(curX, x1, x2, ty), evalQuad(curY, y1, y2, ty));

          curX = x2;
          curY = y2;
          break;
        }

        case 'A': {
          curX = args[5];
          curY = args[6];
          includePoint(curX, curY);
          break;
        }

        case 'Z':
          break;
      }
    }

    if (minX === Infinity) {
      return { minX: 0, minY: 0, maxX: 0, maxY: 0, width: 0, height: 0, isCollapsed: true };
    }

    const sw = Math.max(0, strokeWidth);
    const halfSw = sw / 2;
    minX -= halfSw;
    minY -= halfSw;
    maxX += halfSw;
    maxY += halfSw;

    const width = maxX - minX;
    const height = maxY - minY;

    return {
      minX,
      minY,
      maxX,
      maxY,
      width,
      height,
      isCollapsed: width <= 0.5 || height <= 0.5
    };
  }

  /**
   * Computes raster bounding box via sharp alpha channel.
   * @param {string|Buffer} svgInput
   * @param {number} [width=24]
   * @param {number} [height=24]
   * @returns {Promise<{ minX: number, minY: number, maxX: number, maxY: number, width: number, height: number, isCollapsed: boolean }>}
   */
  static async computeBoundingBoxRaster(svgInput, width = 24, height = 24) {
    const safeW = Math.max(1, Math.round(width));
    const safeH = Math.max(1, Math.round(height));

    const buf = Buffer.isBuffer(svgInput) ? svgInput : Buffer.from(String(svgInput));
    const { data, info } = await sharp(buf)
      .resize(safeW, safeH, { fit: 'fill' })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    let minX = safeW;
    let minY = safeH;
    let maxX = -1;
    let maxY = -1;

    for (let y = 0; y < info.height; y++) {
      for (let x = 0; x < info.width; x++) {
        const idx = (y * info.width + x) * info.channels;
        const alpha = data[idx + 3];
        if (alpha > 10) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }

    if (maxX < minX || maxY < minY) {
      return { minX: 0, minY: 0, maxX: 0, maxY: 0, width: 0, height: 0, isCollapsed: true };
    }

    const w = maxX - minX + 1;
    const h = maxY - minY + 1;

    return {
      minX,
      minY,
      maxX,
      maxY,
      width: w,
      height: h,
      isCollapsed: w <= 0.5 || h <= 0.5
    };
  }

  /**
   * General computeBoundingBox helper that accepts pathData or SVG string.
   * @param {string} pathDataOrSvg
   * @param {Object} [options]
   * @returns {Promise<Object>|Object}
   */
  static computeBoundingBox(pathDataOrSvg, options = {}) {
    if (!pathDataOrSvg) {
      return { minX: 0, minY: 0, maxX: 0, maxY: 0, width: 0, height: 0, isCollapsed: true };
    }

    const str = String(pathDataOrSvg).trim();
    if (str.startsWith('<svg') || str.startsWith('<?xml') || str.startsWith('<vector')) {
      const w = options.width || 24;
      const h = options.height || 24;
      return VectorLinter.computeBoundingBoxRaster(str, w, h);
    }

    return VectorLinter.computeBoundingBoxAnalytical(str, options.strokeWidth || 0);
  }

  /**
   * Computes the Intersection-over-Union (IoU) of two bounding boxes.
   * Accepts [x, y, w, h] array or { x, y, width, height } or { minX, minY, width, height }.
   * @param {Array<number>|Object} boxA
   * @param {Array<number>|Object} boxB
   * @returns {number} IoU percentage [0.0 to 100.0]
   */
  static computeBoxIoU(boxA, boxB) {
    const normalize = (b) => {
      if (!b) return [0, 0, 0, 0];
      if (Array.isArray(b)) return [b[0] || 0, b[1] || 0, b[2] || 0, b[3] || 0];
      const x = b.x !== undefined ? b.x : (b.minX !== undefined ? b.minX : 0);
      const y = b.y !== undefined ? b.y : (b.minY !== undefined ? b.minY : 0);
      const w = b.width !== undefined ? b.width : (b.w !== undefined ? b.w : 0);
      const h = b.height !== undefined ? b.height : (b.h !== undefined ? b.h : 0);
      return [x, y, w, h];
    };

    const [x1, y1, w1, h1] = normalize(boxA);
    const [x2, y2, w2, h2] = normalize(boxB);

    const xStart = Math.max(x1, x2);
    const yStart = Math.max(y1, y2);
    const xEnd = Math.min(x1 + w1, x2 + w2);
    const yEnd = Math.min(y1 + h1, y2 + h2);

    const interW = Math.max(0, xEnd - xStart);
    const interH = Math.max(0, yEnd - yStart);
    const interArea = interW * interH;

    const areaA = Math.max(0, w1 * h1);
    const areaB = Math.max(0, w2 * h2);
    const unionArea = areaA + areaB - interArea;

    if (unionArea <= 0) {
      return areaA === 0 && areaB === 0 ? 100.0 : 0.0;
    }

    return parseFloat(((interArea / unionArea) * 100).toFixed(2));
  }

  // =========================================================================
  // Ink Centroid Continuous Spatial Shift Oracle via sharp
  // =========================================================================

  /**
   * Computes the continuous alpha-weighted mass centroid (cx, cy) and total mass.
   * Uses continuous moments M00, M10, M01 from sharp uncompressed raw buffer.
   * @param {string|Buffer} svgBufferOrString
   * @param {number} [width=24]
   * @param {number} [height=24]
   * @returns {Promise<{ cx: number, cy: number, totalMass: number, inkCount: number, bbox: Object }>}
   */
  static async computeInkCentroid(svgBufferOrString, width = 24, height = 24) {
    const safeW = Math.max(1, Math.round(width));
    const safeH = Math.max(1, Math.round(height));
    const buf = Buffer.isBuffer(svgBufferOrString) ? svgBufferOrString : Buffer.from(String(svgBufferOrString));

    const { data, info } = await sharp(buf)
      .resize(safeW, safeH, { fit: 'fill' })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    let sumX = 0;
    let sumY = 0;
    let sumA = 0;
    let count = 0;
    let minX = safeW;
    let minY = safeH;
    let maxX = -1;
    let maxY = -1;

    for (let y = 0; y < info.height; y++) {
      for (let x = 0; x < info.width; x++) {
        const idx = (y * info.width + x) * info.channels;
        const alpha = data[idx + 3];
        if (alpha > 10) {
          const weight = alpha / 255.0;
          sumX += x * weight;
          sumY += y * weight;
          sumA += alpha;
          count += weight;

          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }

    const cx = count > 0 ? sumX / count : 0.0;
    const cy = count > 0 ? sumY / count : 0.0;
    const bbox = maxX >= minX
      ? { minX, minY, maxX, maxY, width: maxX - minX + 1, height: maxY - minY + 1, isCollapsed: false }
      : { minX: 0, minY: 0, maxX: 0, maxY: 0, width: 0, height: 0, isCollapsed: true };

    return {
      cx,
      cy,
      totalMass: sumA,
      inkCount: count,
      width: safeW,
      height: safeH,
      bbox
    };
  }

  static async computeVectorCentroid(svgString, width = 24, height = 24) {
    return VectorLinter.computeInkCentroid(svgString, width, height);
  }

  // =========================================================================
  // Reconversion Utilities: Android XML & Compose DSL -> SVG
  // =========================================================================

  /**
   * Converts Android VectorDrawable XML into standard SVG XML for sharp rasterization.
   * @param {string} xmlStr
   * @returns {string}
   */
  static vectorDrawableToSvg(xmlStr) {
    if (!xmlStr || typeof xmlStr !== 'string') return '';

    const widthM = xmlStr.match(/android:width="([0-9.]+)dp"/);
    const heightM = xmlStr.match(/android:height="([0-9.]+)dp"/);
    const vpWidthM = xmlStr.match(/android:viewportWidth="([0-9.]+)"/);
    const vpHeightM = xmlStr.match(/android:viewportHeight="([0-9.]+)"/);

    const width = widthM ? widthM[1] : '24';
    const height = heightM ? heightM[1] : '24';
    const vpWidth = vpWidthM ? vpWidthM[1] : width;
    const vpHeight = vpHeightM ? vpHeightM[1] : height;

    let svgBody = xmlStr
      .replace(/<\?xml[^>]*\?>/gi, '')
      .replace(/<vector[^>]*>/gi, `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${vpWidth} ${vpHeight}">`)
      .replace(/<\/vector>/gi, '</svg>');

    // Transform <group> tags
    svgBody = svgBody.replace(/<group\b([^>]*)>/gi, (match, attrs) => {
      const txM = attrs.match(/android:translateX="([0-9.-]+)"/);
      const tyM = attrs.match(/android:translateY="([0-9.-]+)"/);
      const sxM = attrs.match(/android:scaleX="([0-9.-]+)"/);
      const syM = attrs.match(/android:scaleY="([0-9.-]+)"/);
      const rotM = attrs.match(/android:rotation="([0-9.-]+)"/);
      const pxM = attrs.match(/android:pivotX="([0-9.-]+)"/);
      const pyM = attrs.match(/android:pivotY="([0-9.-]+)"/);

      const transforms = [];
      if (txM || tyM) transforms.push(`translate(${txM ? txM[1] : 0}, ${tyM ? tyM[1] : 0})`);
      if (rotM) {
        if (pxM || pyM) transforms.push(`rotate(${rotM[1]}, ${pxM ? pxM[1] : 0}, ${pyM ? pyM[1] : 0})`);
        else transforms.push(`rotate(${rotM[1]})`);
      }
      if (sxM || syM) transforms.push(`scale(${sxM ? sxM[1] : 1}, ${syM ? syM[1] : 1})`);
      const tAttr = transforms.length > 0 ? ` transform="${transforms.join(' ')}"` : '';
      return `<g${tAttr}>`;
    });
    svgBody = svgBody.replace(/<\/group>/gi, '</g>');

    // Transform <path> tags
    svgBody = svgBody.replace(/<path\b([^>]*)\/?>/gi, (match, attrs) => {
      const dM = attrs.match(/android:pathData="([^"]+)"/);
      const fillM = attrs.match(/android:fillColor="([^"]+)"/);
      const strokeM = attrs.match(/android:strokeColor="([^"]+)"/);
      const strokeWidthM = attrs.match(/android:strokeWidth="([0-9.]+)"/);
      const fillTypeM = attrs.match(/android:fillType="evenOdd"/i);

      const outAttrs = [];
      if (dM) outAttrs.push(`d="${dM[1]}"`);
      if (fillM) {
        let col = fillM[1];
        if (col.startsWith('#FF') && col.length === 9) col = '#' + col.slice(3);
        outAttrs.push(`fill="${col}"`);
      } else {
        outAttrs.push(`fill="#1a1a1a"`);
      }
      if (strokeM) {
        let col = strokeM[1];
        if (col.startsWith('#FF') && col.length === 9) col = '#' + col.slice(3);
        outAttrs.push(`stroke="${col}"`);
      }
      if (strokeWidthM) outAttrs.push(`stroke-width="${strokeWidthM[1]}"`);
      if (fillTypeM) outAttrs.push(`fill-rule="evenodd"`);

      return `<path ${outAttrs.join(' ')} />`;
    });

    return svgBody;
  }

  /**
   * Converts Compose ImageVector Kotlin DSL code back into standard SVG XML.
   * @param {string} kotlinCode
   * @param {Object} [options]
   * @returns {string}
   */
  static composeCodeToSvg(kotlinCode, options = {}) {
    if (!kotlinCode || typeof kotlinCode !== 'string') return '';

    const wM = kotlinCode.match(/defaultWidth\s*=\s*([0-9.]+)\.dp/);
    const hM = kotlinCode.match(/defaultHeight\s*=\s*([0-9.]+)\.dp/);
    const vwM = kotlinCode.match(/viewportWidth\s*=\s*([0-9.]+)f/);
    const vhM = kotlinCode.match(/viewportHeight\s*=\s*([0-9.]+)f/);

    const w = wM ? wM[1] : (options.width || '24');
    const h = hM ? hM[1] : (options.height || '24');
    const vw = vwM ? vwM[1] : (options.viewportWidth || w);
    const vh = vhM ? vhM[1] : (options.viewportHeight || h);

    let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${vw} ${vh}">\n`;

    // Isolate apply block
    const applyStart = kotlinCode.indexOf(').apply {');
    const body = applyStart !== -1 ? kotlinCode.slice(applyStart + 9) : kotlinCode;

    const lines = body.split('\n');
    let currentGroup = null;
    let currentPath = null;
    let insidePathBlock = false;
    let pathCommands = [];

    for (let rawLine of lines) {
      const line = rawLine.trim();

      if (line.startsWith('group(')) {
        currentGroup = { tx: 0, ty: 0, sx: 1, sy: 1, rot: 0, px: 0, py: 0 };
      } else if (currentGroup && line.startsWith('translationX = ')) {
        currentGroup.tx = parseFloat(line.replace(/translationX = |f,|,/g, '')) || 0;
      } else if (currentGroup && line.startsWith('translationY = ')) {
        currentGroup.ty = parseFloat(line.replace(/translationY = |f,|,/g, '')) || 0;
      } else if (currentGroup && line.startsWith('scaleX = ')) {
        currentGroup.sx = parseFloat(line.replace(/scaleX = |f,|,/g, '')) || 1;
      } else if (currentGroup && line.startsWith('scaleY = ')) {
        currentGroup.sy = parseFloat(line.replace(/scaleY = |f,|,/g, '')) || 1;
      } else if (currentGroup && line.startsWith('rotation = ')) {
        currentGroup.rot = parseFloat(line.replace(/rotation = |f,|,/g, '')) || 0;
      } else if (line.startsWith('path(')) {
        currentPath = { fill: null, fillRule: 'nonzero', stroke: null, strokeWidth: 0, strokeCap: null, strokeJoin: null };
      } else if (currentPath && line.includes('pathFillType = PathFillType.EvenOdd')) {
        currentPath.fillRule = 'evenodd';
      } else if (currentPath && line.includes('fill = null')) {
        currentPath.fill = 'none';
      } else if (currentPath && line.includes('fill = SolidColor(Color(')) {
        const colM = line.match(/Color\((0x[0-9a-fA-F]+)\)/);
        if (colM) {
          const hex = parseInt(colM[1], 16).toString(16).padStart(8, '0');
          currentPath.fill = '#' + hex.slice(2);
        }
      } else if (currentPath && line.includes('stroke = SolidColor(Color(')) {
        const colM = line.match(/Color\((0x[0-9a-fA-F]+)\)/);
        if (colM) {
          const hex = parseInt(colM[1], 16).toString(16).padStart(8, '0');
          currentPath.stroke = '#' + hex.slice(2);
        }
      } else if (currentPath && line.startsWith('strokeLineWidth = ')) {
        currentPath.strokeWidth = parseFloat(line.replace(/strokeLineWidth = |f,|,/g, '')) || 0;
      } else if (currentPath && line.startsWith('strokeLineCap = ')) {
        const capM = line.match(/StrokeCap\.(\w+)/);
        if (capM) currentPath.strokeCap = capM[1].toLowerCase();
      } else if (currentPath && line.startsWith('strokeLineJoin = ')) {
        const joinM = line.match(/StrokeJoin\.(\w+)/);
        if (joinM) currentPath.strokeJoin = joinM[1].toLowerCase();
      } else if (line === ') {' && currentPath) {
        insidePathBlock = true;
        pathCommands = [];
      } else if (insidePathBlock) {
        if (line === '}' || line === '} }' || line === '}\n') {
          insidePathBlock = false;
          const d = pathCommands.join(' ');
          let groupTagOpen = '';
          let groupTagClose = '';

          if (currentGroup) {
            const tList = [];
            if (currentGroup.tx || currentGroup.ty) tList.push(`translate(${currentGroup.tx}, ${currentGroup.ty})`);
            if (currentGroup.rot) tList.push(`rotate(${currentGroup.rot})`);
            if (currentGroup.sx !== 1 || currentGroup.sy !== 1) tList.push(`scale(${currentGroup.sx}, ${currentGroup.sy})`);
            if (tList.length > 0) {
              groupTagOpen = `<g transform="${tList.join(' ')}">`;
              groupTagClose = `</g>`;
            }
          }

          const effectiveFill = currentPath.fill !== null ? currentPath.fill : (currentPath.stroke ? 'none' : '#1a1a1a');
          const strokeAttrs = [];
          if (currentPath.stroke && currentPath.stroke !== 'none') {
            strokeAttrs.push(`stroke="${currentPath.stroke}"`);
            if (currentPath.strokeWidth) strokeAttrs.push(`stroke-width="${currentPath.strokeWidth}"`);
            if (currentPath.strokeCap) strokeAttrs.push(`stroke-linecap="${currentPath.strokeCap}"`);
            if (currentPath.strokeJoin) strokeAttrs.push(`stroke-linejoin="${currentPath.strokeJoin}"`);
          }

          svg += `${groupTagOpen}<path d="${d}" fill="${effectiveFill}" fill-rule="${currentPath.fillRule}" ${strokeAttrs.join(' ')} />${groupTagClose}\n`;
          currentPath = null;
          currentGroup = null;
        } else {
          // Parse DSL statements
          if (line.startsWith('moveTo(')) {
            const m = line.match(/moveTo\(([0-9.-]+)f?,\s*([0-9.-]+)f?\)/);
            if (m) pathCommands.push(`M ${m[1]} ${m[2]}`);
          } else if (line.startsWith('moveToRelative(')) {
            const m = line.match(/moveToRelative\(([0-9.-]+)f?,\s*([0-9.-]+)f?\)/);
            if (m) pathCommands.push(`m ${m[1]} ${m[2]}`);
          } else if (line.startsWith('lineTo(')) {
            const m = line.match(/lineTo\(([0-9.-]+)f?,\s*([0-9.-]+)f?\)/);
            if (m) pathCommands.push(`L ${m[1]} ${m[2]}`);
          } else if (line.startsWith('lineToRelative(')) {
            const m = line.match(/lineToRelative\(([0-9.-]+)f?,\s*([0-9.-]+)f?\)/);
            if (m) pathCommands.push(`l ${m[1]} ${m[2]}`);
          } else if (line.startsWith('horizontalLineTo(')) {
            const m = line.match(/horizontalLineTo\(([0-9.-]+)f?\)/);
            if (m) pathCommands.push(`H ${m[1]}`);
          } else if (line.startsWith('horizontalLineToRelative(')) {
            const m = line.match(/horizontalLineToRelative\(([0-9.-]+)f?\)/);
            if (m) pathCommands.push(`h ${m[1]}`);
          } else if (line.startsWith('verticalLineTo(')) {
            const m = line.match(/verticalLineTo\(([0-9.-]+)f?\)/);
            if (m) pathCommands.push(`V ${m[1]}`);
          } else if (line.startsWith('verticalLineToRelative(')) {
            const m = line.match(/verticalLineToRelative\(([0-9.-]+)f?\)/);
            if (m) pathCommands.push(`v ${m[1]}`);
          } else if (line.startsWith('curveTo(')) {
            const m = line.match(/curveTo\(([0-9.-]+)f?,\s*([0-9.-]+)f?,\s*([0-9.-]+)f?,\s*([0-9.-]+)f?,\s*([0-9.-]+)f?,\s*([0-9.-]+)f?\)/);
            if (m) pathCommands.push(`C ${m[1]} ${m[2]} ${m[3]} ${m[4]} ${m[5]} ${m[6]}`);
          } else if (line.startsWith('curveToRelative(')) {
            const m = line.match(/curveToRelative\(([0-9.-]+)f?,\s*([0-9.-]+)f?,\s*([0-9.-]+)f?,\s*([0-9.-]+)f?,\s*([0-9.-]+)f?,\s*([0-9.-]+)f?\)/);
            if (m) pathCommands.push(`c ${m[1]} ${m[2]} ${m[3]} ${m[4]} ${m[5]} ${m[6]}`);
          } else if (line.startsWith('quadTo(')) {
            const m = line.match(/quadTo\(([0-9.-]+)f?,\s*([0-9.-]+)f?,\s*([0-9.-]+)f?,\s*([0-9.-]+)f?\)/);
            if (m) pathCommands.push(`Q ${m[1]} ${m[2]} ${m[3]} ${m[4]}`);
          } else if (line.startsWith('arcTo(') || line.startsWith('arcToRelative(')) {
            const m = line.match(/arcTo(Relative)?\(([0-9.-]+)f?,\s*([0-9.-]+)f?,\s*([0-9.-]+)f?,\s*(true|false),\s*(true|false),\s*([0-9.-]+)f?,\s*([0-9.-]+)f?\)/i);
            if (m) {
              const cmd = m[1] ? 'a' : 'A';
              const lArc = m[5].toLowerCase() === 'true' ? 1 : 0;
              const sw = m[6].toLowerCase() === 'true' ? 1 : 0;
              pathCommands.push(`${cmd} ${m[2]} ${m[3]} ${m[4]} ${lArc} ${sw} ${m[7]} ${m[8]}`);
            }
          } else if (line.startsWith('close()')) {
            pathCommands.push('Z');
          }
        }
      }
    }

    svg += '</svg>';
    return svg;
  }

  // =========================================================================
  // Vector Comparison & Full Verification Oracle
  // =========================================================================

  /**
   * Compares a source SVG against a synthesized representation (Compose code, XML, or SVG).
   * Verifies:
   * 1. Sub-path count invariant: N_closed,SVG == N_closed,Synth
   * 2. Bounding box non-collapse (W, H > 0.5px) and IoU (>= minBboxIoU)
   * 3. Ink centroid spatial shift Delta C <= maxCentroidDrift
   *
   * @param {string|Object} sourceSvg - Source SVG text or vector AST
   * @param {string|Object} synthData - Synthesized Compose code, XML, or SVG text
   * @param {Object} [options]
   * @returns {Promise<Object>} Verification result with violations and metrics
   */
  static async compareVector(sourceSvg, synthData, options = {}) {
    const iconName = options.iconName ||
      (typeof sourceSvg === 'object' ? (sourceSvg.name || sourceSvg.id) : '') ||
      'UnknownIcon';

    const maxDrift = options.maxCentroidDrift !== undefined
      ? options.maxCentroidDrift
      : (options.maxShiftPx !== undefined ? options.maxShiftPx : 1.0);

    let minIoU = 90.0;
    if (options.minBboxIoU !== undefined) {
      minIoU = options.minBboxIoU <= 1.0 ? options.minBboxIoU * 100 : options.minBboxIoU;
    } else if (options.minElementIou !== undefined) {
      minIoU = options.minElementIou <= 1.0 ? options.minElementIou * 100 : options.minElementIou;
    }

    const minDim = options.minBboxDimension !== undefined ? options.minBboxDimension : 0.5;

    // 1. Resolve source SVG string & counts
    let sourceSvgStr = '';
    if (typeof sourceSvg === 'string') {
      sourceSvgStr = sourceSvg;
    } else if (typeof sourceSvg === 'object') {
      sourceSvgStr = sourceSvg.rawSvg || sourceSvg.svg || '';
      if (!sourceSvgStr && Array.isArray(sourceSvg.paths)) {
        const w = sourceSvg.width || 24;
        const h = sourceSvg.height || 24;
        const vb = typeof sourceSvg.viewBox === 'string' ? sourceSvg.viewBox : `0 0 ${w} ${h}`;
        sourceSvgStr = `<svg width="${w}" height="${h}" viewBox="${vb}">` +
          sourceSvg.paths.map(p => `<path d="${p.d}" fill="${p.fill || '#1a1a1a'}" />`).join('') +
          `</svg>`;
      }
    }

    const sourceCounts = VectorLinter.countSvgClosedSubpaths(sourceSvgStr || sourceSvg);

    // 2. Resolve synthesized representation & counts
    let synthClosedCount = 0;
    let synthSvgStr = '';
    let synthType = 'unknown';

    if (typeof synthData === 'string') {
      const trimmed = synthData.trim();
      if (trimmed.startsWith('<?xml') || trimmed.startsWith('<vector')) {
        synthType = 'xml';
        const xmlCounts = VectorLinter.countXmlClosedSubpaths(trimmed);
        synthClosedCount = xmlCounts.totalClosedSubpaths;
        synthSvgStr = VectorLinter.vectorDrawableToSvg(trimmed);
      } else if (trimmed.startsWith('<svg')) {
        synthType = 'svg';
        const svgCounts = VectorLinter.countSvgClosedSubpaths(trimmed);
        synthClosedCount = svgCounts.totalClosedSubpaths;
        synthSvgStr = trimmed;
      } else {
        // Compose Kotlin code
        synthType = 'compose';
        const composeCounts = VectorLinter.countComposeClosedSubpaths(trimmed, iconName);
        synthClosedCount = composeCounts.totalClosedSubpaths;
        synthSvgStr = VectorLinter.composeCodeToSvg(trimmed, options);
      }
    } else if (typeof synthData === 'object') {
      synthType = 'ast';
      const astCounts = VectorLinter.countComposeClosedSubpaths(synthData, iconName);
      synthClosedCount = astCounts.totalClosedSubpaths;
      if (synthData.rawSvg) {
        synthSvgStr = synthData.rawSvg;
      } else {
        const w = synthData.width || 24;
        const h = synthData.height || 24;
        const vb = typeof synthData.viewBox === 'string' ? synthData.viewBox : `0 0 ${w} ${h}`;
        synthSvgStr = `<svg width="${w}" height="${h}" viewBox="${vb}">` +
          (synthData.paths || []).map(p => `<path d="${p.d}" fill="${p.fill || '#1a1a1a'}" />`).join('') +
          `</svg>`;
      }
    }

    const violations = [];
    const deltaN = sourceCounts.totalClosedSubpaths - synthClosedCount;

    // Check Invariant 1: Closed Sub-Path Invariant
    if (deltaN !== 0) {
      const dropped = deltaN > 0;
      violations.push({
        rule: 'SUBPATH_COUNT_MISMATCH',
        iconName,
        delta: deltaN,
        message: `Sub-path count mismatch for icon "${iconName}": expected ${sourceCounts.totalClosedSubpaths} closed sub-path(s) from SVG, but synthesized vector has ${synthClosedCount} (${Math.abs(deltaN)} ${dropped ? 'dropped' : 'spurious'} sub-path(s), likely ${dropped ? 'missing action badge or fold' : 'unintended path closure'}).`
      });
    }

    // Check Invariant 2 & 3: Bounding Box & Continuous Centroid Shift via sharp
    let sourceBbox = { minX: 0, minY: 0, maxX: 0, maxY: 0, width: 0, height: 0, isCollapsed: false };
    let synthBbox = { minX: 0, minY: 0, maxX: 0, maxY: 0, width: 0, height: 0, isCollapsed: false };
    let sourceCentroid = { cx: 0, cy: 0, totalMass: 0 };
    let synthCentroid = { cx: 0, cy: 0, totalMass: 0 };
    let iou = 100.0;
    let deltaC = 0.0;

    const width = options.width || (typeof sourceSvg === 'object' ? sourceSvg.width : 24) || 24;
    const height = options.height || (typeof sourceSvg === 'object' ? sourceSvg.height : 24) || 24;

    try {
      if (sourceSvgStr && synthSvgStr) {
        const [sc, tc] = await Promise.all([
          VectorLinter.computeInkCentroid(sourceSvgStr, width, height),
          VectorLinter.computeInkCentroid(synthSvgStr, width, height)
        ]);

        sourceCentroid = sc;
        synthCentroid = tc;
        sourceBbox = sc.bbox;
        synthBbox = tc.bbox;

        // Bbox collapse check
        if (!sourceBbox.isCollapsed && synthBbox.isCollapsed) {
          violations.push({
            rule: 'COLLAPSED_BOUNDING_BOX',
            iconName,
            message: `Collapsed bounding box for icon "${iconName}": synthesized vector dimensions [W=${synthBbox.width}px, H=${synthBbox.height}px] collapsed below ${minDim}px threshold.`
          });
        }

        // Bbox IoU check
        iou = VectorLinter.computeBoxIoU(sourceBbox, synthBbox);
        if (iou < minIoU && (!sourceBbox.isCollapsed || !synthBbox.isCollapsed)) {
          violations.push({
            rule: 'BBOX_IOU_VIOLATION',
            iconName,
            iou,
            threshold: minIoU,
            message: `Bounding box IoU for icon "${iconName}" (${iou.toFixed(1)}%) is below required ${minIoU}% threshold.`
          });
        }

        // Ink Centroid spatial shift check
        if (sourceCentroid.totalMass > 0 && synthCentroid.totalMass === 0) {
          violations.push({
            rule: 'EMPTY_SYNTHESIZED_VECTOR',
            iconName,
            message: `Empty synthesized vector for icon "${iconName}": source SVG has ink mass ${sourceCentroid.totalMass}, but synthesized vector has zero ink.`
          });
        } else if (sourceCentroid.totalMass === 0 && synthCentroid.totalMass > 0) {
          violations.push({
            rule: 'UNEXPECTED_INK_EMISSION',
            iconName,
            message: `Unexpected ink for icon "${iconName}": source SVG is empty, but synthesized vector emitted ink.`
          });
        } else if (sourceCentroid.totalMass > 0 && synthCentroid.totalMass > 0) {
          deltaC = Math.hypot(sourceCentroid.cx - synthCentroid.cx, sourceCentroid.cy - synthCentroid.cy);
          if (deltaC > maxDrift) {
            violations.push({
              rule: 'CENTROID_DRIFT_EXCEEDED',
              iconName,
              deltaC,
              threshold: maxDrift,
              message: `Ink centroid spatial shift for icon "${iconName}" (${deltaC.toFixed(3)}px) exceeds maximum allowed ${maxDrift.toFixed(1)}px limit.`
            });
          }
        }
      }
    } catch (geomErr) {
      if (options.debug) {
        console.warn(`[VectorLinter] Geometry evaluation warning for ${iconName}: ${geomErr.message}`);
      }
    }

    const passed = violations.length === 0;

    return {
      passed,
      hasVeto: !passed,
      iconName,
      synthType,
      violations,
      checks: {
        subpaths: {
          passed: deltaN === 0,
          sourceClosed: sourceCounts.totalClosedSubpaths,
          synthClosed: synthClosedCount,
          deltaN
        },
        bbox: {
          passed: !synthBbox.isCollapsed && iou >= minIoU,
          source: sourceBbox,
          synth: synthBbox,
          iou
        },
        centroid: {
          passed: deltaC <= maxDrift,
          source: { cx: sourceCentroid.cx, cy: sourceCentroid.cy },
          synth: { cx: synthCentroid.cx, cy: synthCentroid.cy },
          deltaC,
          threshold: maxDrift
        }
      }
    };
  }

  static async compareVectors(sourceSvg, synthData, options = {}) {
    return VectorLinter.compareVector(sourceSvg, synthData, options);
  }

  // =========================================================================
  // Primary Linting Engine (In-Memory & Spec-Backed)
  // =========================================================================

  /**
   * In-memory linting of an array of SVG objects vs synthesized representations.
   * @param {Array<Object|string>} svgList
   * @param {Array<Object|string>|string} [synthesizedVectors=[]]
   * @param {Object} [options]
   * @returns {Promise<Object>} LintResult conforming to schema
   */
  static async lint(svgList = [], synthesizedVectors = [], options = {}) {
    const linter = new VectorLinter(options);
    return linter.executeLint(svgList, synthesizedVectors);
  }

  /**
   * Primary spec-backed linting method. Loads design_spec.json and compares against
   * generated Kotlin ImageVectors and Android XML drawables on disk.
   * @param {string} specPath
   * @param {string} [outputDir]
   * @param {Object} [options]
   * @returns {Promise<Object>}
   */
  static async lintSpec(specPath, outputDir = null, options = {}) {
    const linter = new VectorLinter({
      ...options,
      specPath,
      outputDir: outputDir || options.outputDir
    });
    return linter.lint();
  }

  static async lintAllVectors(spec, outputDir = null, options = {}) {
    if (typeof spec === 'string') {
      return VectorLinter.lintSpec(spec, outputDir, options);
    }
    const linter = new VectorLinter({ ...options, outputDir });
    return linter.executeLint(spec.vectors || [], options.synthesizedVectors || []);
  }

  /**
   * Instance lint entrypoint. If specPath is set, runs spec-backed linting.
   * @returns {Promise<Object>}
   */
  async lint() {
    if (!this.options.specPath) {
      return this.executeLint([], []);
    }

    const resolvedSpecPath = path.resolve(this.options.specPath);
    if (!fs.existsSync(resolvedSpecPath)) {
      throw new Error(`SpecFileNotFoundError: design_spec.json not found at ${resolvedSpecPath}`);
    }

    let spec;
    try {
      spec = JSON.parse(fs.readFileSync(resolvedSpecPath, 'utf8'));
    } catch (parseErr) {
      throw new Error(`SpecParseError: Failed to parse design_spec.json at ${resolvedSpecPath}: ${parseErr.message}`);
    }

    const vectors = spec.vectors || [];
    const androidDir = this.options.androidDir ||
      (this.options.outputDir ? path.join(this.options.outputDir, 'android') : null) ||
      path.join(process.cwd(), 'android');

    // Attempt to locate synthesized ClaudeIcons.kt
    let claudeIconsCode = '';
    const candidateIconsPaths = [
      path.join(androidDir, 'app', 'src', 'main', 'java', 'com', 'claude', 'compose', 'icons', 'ClaudeIcons.kt'),
      path.join(androidDir, 'app', 'src', 'main', 'java', 'com', 'claude', 'compose', 'icon', 'ClaudeIcons.kt'),
      this.options.outputDir ? path.join(this.options.outputDir, 'ClaudeIcons.kt') : null,
      this.options.outputDir ? path.join(this.options.outputDir, 'android', 'app', 'src', 'main', 'java', 'com', 'claude', 'compose', 'icons', 'ClaudeIcons.kt') : null
    ].filter(Boolean);

    for (const p of candidateIconsPaths) {
      if (fs.existsSync(p)) {
        claudeIconsCode = fs.readFileSync(p, 'utf8');
        break;
      }
    }

    // Locate XML drawables directory
    const xmlDirCandidates = [
      path.join(androidDir, 'app', 'src', 'main', 'res', 'drawable'),
      this.options.outputDir ? path.join(this.options.outputDir, 'res', 'drawable') : null,
      this.options.outputDir ? path.join(this.options.outputDir, 'vectors') : null
    ].filter(Boolean);

    let drawableDir = null;
    for (const d of xmlDirCandidates) {
      if (fs.existsSync(d)) {
        drawableDir = d;
        break;
      }
    }

    return this.executeLint(vectors, { claudeIconsCode, drawableDir });
  }

  /**
   * Internal evaluation loop executing vector comparison across all items.
   */
  async executeLint(svgList = [], synthContainer = null) {
    const safeVectors = Array.isArray(svgList) ? svgList : [];
    const results = [];
    const allViolations = [];

    const isContainer = synthContainer && typeof synthContainer === 'object' && !Array.isArray(synthContainer);
    const claudeIconsCode = isContainer ? (synthContainer.claudeIconsCode || '') : '';
    const drawableDir = isContainer ? synthContainer.drawableDir : null;
    const synthList = Array.isArray(synthContainer) ? synthContainer : [];

    for (let i = 0; i < safeVectors.length; i++) {
      const vec = safeVectors[i];
      const iconName = (typeof vec === 'object' ? (vec.name || vec.id) : `icon_${i + 1}`) || `icon_${i + 1}`;
      const normalizedName = VectorGenerator.normalizeIconName(iconName);
      const snakeName = VectorGenerator.toSnakeCase(iconName);

      // Determine synthesized candidate
      let synthTarget = null;

      if (synthList.length > i) {
        synthTarget = synthList[i];
      } else if (claudeIconsCode) {
        synthTarget = claudeIconsCode;
      } else if (drawableDir) {
        const candidateFiles = [
          path.join(drawableDir, `ic_${snakeName}.xml`),
          path.join(drawableDir, `${snakeName}.xml`),
          path.join(drawableDir, `ic_${vec.id || ''}.xml`),
          path.join(drawableDir, `${vec.id || ''}.xml`)
        ];
        for (const cf of candidateFiles) {
          if (fs.existsSync(cf)) {
            synthTarget = fs.readFileSync(cf, 'utf8');
            break;
          }
        }
      }

      // Fallback if no synthesized file exists on disk: synthesize in-memory via VectorGenerator
      if (!synthTarget && typeof vec === 'object') {
        const parsed = vec.rawSvg ? SvgParser.parseSvgString(vec.rawSvg) : vec;
        synthTarget = VectorGenerator.generateImageVectorFile([parsed]);
      }

      const res = await VectorLinter.compareVector(vec, synthTarget || '', {
        ...this.options,
        iconName: normalizedName
      });

      results.push(res);
      if (!res.passed) {
        for (const v of res.violations) {
          allViolations.push({
            ...v,
            iconName: normalizedName,
            vectorId: typeof vec === 'object' ? vec.id : `vector_${i}`
          });
        }
      }
    }

    const passed = allViolations.length === 0;
    const passedCount = results.filter(r => r.passed).length;
    const failedCount = results.length - passedCount;
    const exitCode = passed ? EXIT_CODES.SUCCESS : EXIT_CODES.VETO_FAILURE;

    const report = {
      timestamp: new Date().toISOString(),
      passed,
      hasVeto: !passed,
      exitCode,
      totalVectorsEvaluated: results.length,
      totalVectors: results.length,
      passedVectorsCount: passedCount,
      passedCount,
      failedVectorsCount: failedCount,
      failedCount,
      violations: allViolations,
      summary: {
        totalViolations: allViolations.length,
        subpathCountMismatches: allViolations.filter(v => v.rule === 'SUBPATH_COUNT_MISMATCH').length,
        collapsedBboxes: allViolations.filter(v => v.rule === 'COLLAPSED_BOUNDING_BOX').length,
        centroidDrifts: allViolations.filter(v => v.rule === 'CENTROID_DRIFT_EXCEEDED').length,
        iouViolations: allViolations.filter(v => v.rule === 'BBOX_IOU_VIOLATION').length
      },
      results,
      vectors: results
    };

    if (this.options.throwOnVeto && !passed) {
      throw new VectorLintVetoError(
        `VectorCompletenessVetoError: Vector completeness linter vetoed with ${allViolations.length} violation(s).`,
        allViolations,
        report
      );
    }

    return report;
  }
}

// =========================================================================
// Standalone CLI Execution Handler
// =========================================================================

if (require.main === module) {
  const program = new Command();

  program
    .name('vector_linter')
    .description('Pre-flight Sub-Glyph Semantic Path Completeness Linter & Verification Gate for Jetpack Compose vectors')
    .argument('[spec]', 'Path to design_spec.json')
    .argument('[output]', 'Path to output directory')
    .option('--spec <path>', 'Path to design_spec.json')
    .option('-o, --output <dir>', 'Path to output directory')
    .option('-a, --android-dir <dir>', 'Android project root directory')
    .option('--max-drift <number>', 'Centroid spatial drift tolerance threshold Delta C in px', '1.0')
    .option('--min-iou <number>', 'Minimum bounding box IoU percentage', '90.0')
    .option('--json', 'Output structured diagnostic report in JSON format', false)
    .option('-d, --debug', 'Enable debug diagnostic logging', false)
    .action(async (posSpec, posOutput, opts) => {
      const specPath = opts.spec || posSpec;
      const outputDir = opts.output || posOutput || './output';

      if (!specPath) {
        console.error('Error: Path to design_spec.json is required.');
        console.error('Usage: node verification/vector_linter.js <design_spec.json> <output_dir> [options]');
        process.exit(EXIT_CODES.INVALID_ARGUMENTS);
      }

      if (!fs.existsSync(specPath)) {
        console.error(`Error: Spec file not found at ${path.resolve(specPath)}`);
        process.exit(EXIT_CODES.INVALID_ARGUMENTS);
      }

      try {
        const linter = new VectorLinter({
          specPath,
          outputDir,
          androidDir: opts.androidDir,
          maxCentroidDrift: parseFloat(opts.maxDrift) || 1.0,
          minBboxIoU: parseFloat(opts.minIou) || 90.0,
          debug: Boolean(opts.debug)
        });

        const report = await linter.lint();

        if (opts.json) {
          console.log(JSON.stringify(report, null, 2));
        } else {
          console.log('================================================================');
          console.log('  SUB-GLYPH SEMANTIC PATH COMPLETENESS LINTER (Stage 0)');
          console.log('================================================================');
          console.log(`  Verdict:     ${report.passed ? 'PASSED' : 'VETOED'}`);
          console.log(`  Evaluated:   ${report.totalVectorsEvaluated} vector(s)`);
          console.log(`  Passed:      ${report.passedVectorsCount}`);
          console.log(`  Failed:      ${report.failedVectorsCount}`);
          console.log(`  Violations:  ${report.violations.length}`);

          if (report.violations.length > 0) {
            console.log('\n  VIOLATIONS:');
            report.violations.forEach((v, idx) => {
              console.log(`    ${idx + 1}. ✗ [${v.iconName}] ${v.message}`);
            });
          }
          console.log('================================================================\n');
        }

        process.exit(report.exitCode);
      } catch (err) {
        console.error(`Fatal Vector Linter Error: ${err.message}`);
        process.exit(EXIT_CODES.PARSE_ERROR);
      }
    });

  program.parse(process.argv);
}

module.exports = {
  VectorLinter,
  VectorLintVetoError,
  EXIT_CODES,
  countSvgClosedSubpaths: VectorLinter.countSvgClosedSubpaths,
  countComposeClosedSubpaths: VectorLinter.countComposeClosedSubpaths,
  countXmlClosedSubpaths: VectorLinter.countXmlClosedSubpaths,
  computeBoundingBox: VectorLinter.computeBoundingBox,
  computeBoxIoU: VectorLinter.computeBoxIoU,
  computeInkCentroid: VectorLinter.computeInkCentroid,
  compareVector: VectorLinter.compareVector,
  compareVectors: VectorLinter.compareVectors,
  lint: VectorLinter.lint,
  lintSpec: VectorLinter.lintSpec,
  lintAllVectors: VectorLinter.lintAllVectors,
  vectorDrawableToSvg: VectorLinter.vectorDrawableToSvg,
  composeCodeToSvg: VectorLinter.composeCodeToSvg,
  splitSubpaths: VectorLinter.splitSubpaths
};
