/**
 * synthesizer/vector_generator.js
 * Comprehensive SVG vector translation to Jetpack Compose ImageVector DSL and Android VectorDrawable XML.
 * Adheres strictly to Compose 2024.10 / Material 3 and Android SDK platforms 33-36 standards.
 */

const fs = require('node:fs');
const path = require('node:path');

class VectorGenerator {
  /**
   * Sanitizes raw SVG text by stripping script, foreignObject, and filter tags.
   * @param {string} rawSvg
   * @returns {string}
   */
  static sanitizeSvg(rawSvg) {
    if (!rawSvg || typeof rawSvg !== 'string') return '';
    return rawSvg
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/<foreignObject\b[^<]*(?:(?!<\/foreignObject>)<[^<]*)*<\/foreignObject>/gi, '')
      .replace(/<filter\b[^<]*(?:(?!<\/filter>)<[^<]*)*<\/filter>/gi, '');
  }

  /**
   * Escapes XML reserved characters.
   * @param {string} str
   * @returns {string}
   */
  static escapeXml(str) {
    if (!str || typeof str !== 'string') return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  /**
   * Normalizes dimensions, falling back to 24dp x 24dp if missing, 0, or negative.
   * @param {Object} dim - { width, height, viewBox }
   * @returns {{ width: number, height: number, viewportWidth: number, viewportHeight: number }}
   */
  static getSafeVectorDimensions(dim) {
    const d = dim || {};
    let w = parseFloat(d.width) || 0;
    let h = parseFloat(d.height) || 0;
    let vw = w;
    let vh = h;

    if (d.viewBox && typeof d.viewBox === 'string') {
      const parts = d.viewBox.trim().split(/[\s,]+/).map(Number);
      if (parts.length === 4 && parts[2] > 0 && parts[3] > 0) {
        vw = parts[2];
        vh = parts[3];
        if (!w) w = vw;
        if (!h) h = vh;
      }
    }

    if (w <= 0) w = 24;
    if (h <= 0) h = 24;
    if (vw <= 0) vw = w;
    if (vh <= 0) vh = h;

    return {
      width: Math.max(Math.round(w), 1),
      height: Math.max(Math.round(h), 1),
      viewportWidth: Math.max(vw, 1),
      viewportHeight: Math.max(vh, 1)
    };
  }

  /**
   * Formats a CSS color into a Compose 32-bit ARGB hex string (0xAARRGGBB).
   * @param {string} colorStr
   * @returns {string|null} e.g. "0xFF4F46E5" or null
   */
  static formatComposeColor(colorStr) {
    if (!colorStr || colorStr === 'none' || colorStr === 'transparent') return null;

    // 6-digit hex: #RRGGBB
    let m = colorStr.match(/^#([A-Fa-f0-9]{2})([A-Fa-f0-9]{2})([A-Fa-f0-9]{2})$/);
    if (m) return `0xFF${m[1].toUpperCase()}${m[2].toUpperCase()}${m[3].toUpperCase()}`;

    // 3-digit hex: #RGB
    m = colorStr.match(/^#([A-Fa-f0-9])([A-Fa-f0-9])([A-Fa-f0-9])$/);
    if (m) return `0xFF${m[1].toUpperCase()}${m[1].toUpperCase()}${m[2].toUpperCase()}${m[2].toUpperCase()}${m[3].toUpperCase()}${m[3].toUpperCase()}`;

    // 8-digit hex: #RRGGBBAA -> 0xAARRGGBB
    m = colorStr.match(/^#([A-Fa-f0-9]{2})([A-Fa-f0-9]{2})([A-Fa-f0-9]{2})([A-Fa-f0-9]{2})$/);
    if (m) return `0x${m[4].toUpperCase()}${m[1].toUpperCase()}${m[2].toUpperCase()}${m[3].toUpperCase()}`;

    // rgb(r, g, b) or rgba(r, g, b, a)
    m = colorStr.match(/^rgba?\((\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*([\d.]+))?\)$/i);
    if (m) {
      const r = parseInt(m[1], 10).toString(16).padStart(2, '0').toUpperCase();
      const g = parseInt(m[2], 10).toString(16).padStart(2, '0').toUpperCase();
      const b = parseInt(m[3], 10).toString(16).padStart(2, '0').toUpperCase();
      const a = m[4] !== undefined ? Math.round(parseFloat(m[4]) * 255).toString(16).padStart(2, '0').toUpperCase() : 'FF';
      return `0x${a}${r}${g}${b}`;
    }

    return '0xFF000000';
  }

  /**
   * Formats a CSS color into Android XML hex format (#AARRGGBB or #RRGGBB).
   * @param {string} colorStr
   * @returns {string|null}
   */
  static formatXmlColor(colorStr) {
    const composeHex = VectorGenerator.formatComposeColor(colorStr);
    if (!composeHex) return null;
    return '#' + composeHex.replace('0x', '');
  }

  /**
   * Tokenizes an SVG path string into commands and numeric arguments.
   * Handles compact numbers (e.g. "M10-20.5.5"), scientific notation, and multiple subpaths.
   * @param {string} d
   * @returns {Array<{ command: string, isRelative: boolean, args: number[] }>}
   */
  static tokenizePath(d) {
    if (!d || typeof d !== 'string') return [];

    const regex = /([a-df-z])|([+-]?(?:\d*\.\d+|\d+)(?:[eE][+-]?\d+)?)/gi;
    const tokens = [];
    let m;

    while ((m = regex.exec(d)) !== null) {
      if (m[1]) tokens.push({ type: 'cmd', val: m[1] });
      else if (m[2]) tokens.push({ type: 'num', val: parseFloat(m[2]), raw: m[2] });
    }

    // Unpack concatenated arc flags for A/a commands (e.g. "01", "012")
    let currentCmdType = null;
    let numCountForCmd = 0;

    for (let idx = 0; idx < tokens.length; idx++) {
      const t = tokens[idx];
      if (t.type === 'cmd') {
        currentCmdType = t.val.toUpperCase();
        numCountForCmd = 0;
        continue;
      }
      if (currentCmdType === 'A') {
        const pos = numCountForCmd % 7;
        if (pos === 3 || pos === 4) {
          const raw = String(t.raw || t.val);
          if (raw.length > 1 && (raw[0] === '0' || raw[0] === '1')) {
            const flag = parseInt(raw[0], 10);
            const remainder = raw.slice(1);
            tokens[idx] = { type: 'num', val: flag, raw: raw[0] };
            tokens.splice(idx + 1, 0, { type: 'num', val: parseFloat(remainder), raw: remainder });
          }
        }
        numCountForCmd++;
      }
    }

    const segments = [];
    let i = 0;
    let currentCmd = null;

    while (i < tokens.length) {
      const prevI = i;
      if (tokens[i].type === 'cmd') {
        currentCmd = tokens[i].val;
        i++;
      }

      if (!currentCmd) break;
      const isRelative = currentCmd === currentCmd.toLowerCase();
      const cmdUpper = currentCmd.toUpperCase();

      if (cmdUpper === 'Z') {
        segments.push({ command: currentCmd, isRelative, args: [] });
        currentCmd = null;
      } else if (cmdUpper === 'H' || cmdUpper === 'V') {
        while (i < tokens.length && tokens[i].type === 'num') {
          segments.push({ command: currentCmd, isRelative, args: [tokens[i].val] });
          i++;
        }
      } else if (cmdUpper === 'M' || cmdUpper === 'L' || cmdUpper === 'T') {
        let first = true;
        while (i + 1 < tokens.length && tokens[i].type === 'num' && tokens[i + 1].type === 'num') {
          const effectiveCmd = first ? currentCmd : (isRelative ? 'l' : 'L');
          segments.push({
            command: effectiveCmd,
            isRelative: effectiveCmd === effectiveCmd.toLowerCase(),
            args: [tokens[i].val, tokens[i + 1].val]
          });
          i += 2;
          first = false;
        }
      } else if (cmdUpper === 'S' || cmdUpper === 'Q') {
        while (i + 3 < tokens.length &&
               tokens[i].type === 'num' && tokens[i + 1].type === 'num' &&
               tokens[i + 2].type === 'num' && tokens[i + 3].type === 'num') {
          segments.push({
            command: currentCmd,
            isRelative,
            args: [tokens[i].val, tokens[i + 1].val, tokens[i + 2].val, tokens[i + 3].val]
          });
          i += 4;
        }
      } else if (cmdUpper === 'C') {
        while (i + 5 < tokens.length &&
               tokens[i].type === 'num' && tokens[i + 1].type === 'num' &&
               tokens[i + 2].type === 'num' && tokens[i + 3].type === 'num' &&
               tokens[i + 4].type === 'num' && tokens[i + 5].type === 'num') {
          segments.push({
            command: currentCmd,
            isRelative,
            args: [tokens[i].val, tokens[i + 1].val, tokens[i + 2].val, tokens[i + 3].val, tokens[i + 4].val, tokens[i + 5].val]
          });
          i += 6;
        }
      } else if (cmdUpper === 'A') {
        while (i + 6 < tokens.length &&
               tokens[i].type === 'num' && tokens[i + 1].type === 'num' &&
               tokens[i + 2].type === 'num' && tokens[i + 3].type === 'num' &&
               tokens[i + 4].type === 'num' && tokens[i + 5].type === 'num' &&
               tokens[i + 6].type === 'num') {
          segments.push({
            command: currentCmd,
            isRelative,
            args: [tokens[i].val, tokens[i + 1].val, tokens[i + 2].val, tokens[i + 3].val, tokens[i + 4].val, tokens[i + 5].val, tokens[i + 6].val]
          });
          i += 7;
        }
      } else {
        i++;
      }

      if (i === prevI) {
        i++;
      }
    }

    return segments;
  }

  /**
   * Converts tokenized SVG path commands into Jetpack Compose PathBuilder DSL statements.
   * @param {string} d
   * @returns {string[]} Array of Kotlin DSL lines
   */
  static pathToComposeDsl(d) {
    const segments = VectorGenerator.tokenizePath(d);
    const lines = [];

    for (const seg of segments) {
      const { command, isRelative, args } = seg;
      const cmdUpper = command.toUpperCase();

      switch (cmdUpper) {
        case 'M':
          lines.push(isRelative ? `moveToRelative(${args[0]}f, ${args[1]}f)` : `moveTo(${args[0]}f, ${args[1]}f)`);
          break;
        case 'L':
          lines.push(isRelative ? `lineToRelative(${args[0]}f, ${args[1]}f)` : `lineTo(${args[0]}f, ${args[1]}f)`);
          break;
        case 'H':
          lines.push(isRelative ? `horizontalLineToRelative(${args[0]}f)` : `horizontalLineTo(${args[0]}f)`);
          break;
        case 'V':
          lines.push(isRelative ? `verticalLineToRelative(${args[0]}f)` : `verticalLineTo(${args[0]}f)`);
          break;
        case 'C':
          lines.push(isRelative
            ? `curveToRelative(${args[0]}f, ${args[1]}f, ${args[2]}f, ${args[3]}f, ${args[4]}f, ${args[5]}f)`
            : `curveTo(${args[0]}f, ${args[1]}f, ${args[2]}f, ${args[3]}f, ${args[4]}f, ${args[5]}f)`);
          break;
        case 'S':
          lines.push(isRelative
            ? `reflectiveCurveToRelative(${args[0]}f, ${args[1]}f, ${args[2]}f, ${args[3]}f)`
            : `reflectiveCurveTo(${args[0]}f, ${args[1]}f, ${args[2]}f, ${args[3]}f)`);
          break;
        case 'Q':
          lines.push(isRelative
            ? `quadToRelative(${args[0]}f, ${args[1]}f, ${args[2]}f, ${args[3]}f)`
            : `quadTo(${args[0]}f, ${args[1]}f, ${args[2]}f, ${args[3]}f)`);
          break;
        case 'T':
          lines.push(isRelative
            ? `reflectiveQuadToRelative(${args[0]}f, ${args[1]}f)`
            : `reflectiveQuadTo(${args[0]}f, ${args[1]}f)`);
          break;
        case 'A': {
          const rx = args[0];
          const ry = args[1];
          const theta = args[2];
          const isMoreThanHalf = args[3] === 1;
          const isPositiveArc = args[4] === 1;
          const x = args[5];
          const y = args[6];
          lines.push(isRelative
            ? `arcToRelative(${rx}f, ${ry}f, ${theta}f, ${isMoreThanHalf}, ${isPositiveArc}, ${x}f, ${y}f)`
            : `arcTo(${rx}f, ${ry}f, ${theta}f, ${isMoreThanHalf}, ${isPositiveArc}, ${x}f, ${y}f)`);
          break;
        }
        case 'Z':
          lines.push('close()');
          break;
      }
    }

    return lines;
  }

  /**
   * Sanitizes a name to PascalCase identifier suitable for Kotlin properties.
   * @param {string} rawName
   * @returns {string}
   */
  static toPascalCase(rawName) {
    if (!rawName) return 'Icon';
    return rawName
      .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
      .replace(/[^a-zA-Z0-9]+/g, ' ')
      .trim()
      .split(/\s+/)
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join('') || 'Icon';
  }

  /**
   * Normalizes an icon identifier to a deterministic PascalCase symbol ending in 'Icon'.
   * Strips common icon library prefixes (lucide-, feather-, heroicons-, icon-) while
   * preserving standard generic fallbacks (icon_1 -> Icon1Icon).
   * @param {string} rawName
   * @param {number} [fallbackIdx=1]
   * @returns {string} e.g. "FilePlusIcon" or "ChevronDownIcon"
   */
  static normalizeIconName(rawName, fallbackIdx = 1) {
    if (!rawName || typeof rawName !== 'string' || !rawName.trim()) {
      return `Icon${fallbackIdx}Icon`;
    }
    let trimmed = rawName.trim();
    if (trimmed.startsWith('ClaudeIcons.')) {
      trimmed = trimmed.replace(/^ClaudeIcons\./, '');
    }
    // Preserve standard generic numbered fallbacks (e.g. icon_1 -> Icon1Icon, vector_2 -> Icon2Icon)
    const genericMatch = trimmed.match(/^(?:icon|vector|svg)[_-]?(\d+)$/i);
    if (genericMatch) {
      return `Icon${genericMatch[1]}Icon`;
    }
    if (/^(?:icon|vector|svg)$/i.test(trimmed)) {
      return `Icon${fallbackIdx}Icon`;
    }

    // Strip icon library prefixes
    let cleaned = trimmed.replace(/\b(?:lucide|feather|tabler-icon|tabler|ri)\s+/gi, ' ');
    cleaned = cleaned.replace(/^(?:lucide|feather|heroicons?|tabler(?:-icon)?|bi|material-symbols|ri)[-_:]+/i, '');
    cleaned = cleaned.replace(/^fa[srlbd]?[-_]+/i, '');
    cleaned = cleaned.replace(/^icon[-_]+/i, '');
    cleaned = cleaned.replace(/^btn[-_]+/i, '');
    cleaned = cleaned.replace(/[-_]+(?:icon|btn|button|wrapper)$/i, '');

    let pascal = VectorGenerator.toPascalCase(cleaned);
    if (!pascal.endsWith('Icon')) {
      pascal += 'Icon';
    } else if (pascal.endsWith('IconIcon')) {
      pascal = pascal.slice(0, -4);
    }
    return pascal;
  }

  /**
   * Computes a canonical geometry fingerprint string for a vector object.
   * @param {Object} vec
   * @returns {string}
   */
  static computeVectorFingerprint(vec) {
    if (!vec || typeof vec !== 'object') return '';
    const dim = VectorGenerator.getSafeVectorDimensions(vec);
    let vb = '';
    if (typeof vec.viewBox === 'string') {
      vb = vec.viewBox.trim();
    } else if (vec.viewBox && typeof vec.viewBox === 'object') {
      vb = `${vec.viewBox.minX || 0} ${vec.viewBox.minY || 0} ${vec.viewBox.width || dim.viewportWidth} ${vec.viewBox.height || dim.viewportHeight}`.trim();
    } else {
      vb = `0 0 ${dim.viewportWidth} ${dim.viewportHeight}`;
    }
    const paths = (vec.paths || []).filter(p => p && typeof p === 'object').map(p => {
      const d = (p.d || '').trim().replace(/\s+/g, ' ');
      const fill = p.fill || 'none';
      const stroke = p.stroke || 'none';
      const fillRule = p.fillRule || 'nonzero';
      return `${d}|${fill}|${stroke}|${fillRule}`;
    }).filter(s => s && !s.startsWith('|')).sort().join(';;');
    if (!paths) return '';
    return `${dim.width}x${dim.height}|${vb}|${paths}`;
  }

  /**
   * Analyzes vector colors to determine multi-color, monochrome, gradient, and currentColor status.
   * @param {Object} vectorData
   * @returns {Object} { isMultiColor, isMonochrome, hasCurrentColor, distinctCount, colors, contextualColor }
   */
  static analyzeVectorColors(vectorData) {
    if (!vectorData) return { isMultiColor: false, isMonochrome: true, hasCurrentColor: false, distinctCount: 0, colors: [], contextualColor: undefined };

    const explicitColors = new Set();
    let hasCurrentColor = Boolean(vectorData.hasCurrentColor || vectorData.isCurrentColor);
    let hasGradient = false;

    if (vectorData.rawSvg && /<(linearGradient|radialGradient|stop)\b/i.test(vectorData.rawSvg)) {
      hasGradient = true;
    }

    const checkColor = (c) => {
      if (!c || typeof c !== 'string') return;
      const lower = c.toLowerCase().trim();
      if (lower === 'none' || lower === 'transparent') return;
      if (lower === 'currentcolor') {
        hasCurrentColor = true;
      } else {
        explicitColors.add(lower);
      }
    };

    const ctxColor = (vectorData.contextualColor || '').toLowerCase().trim();
    const isCtxOrCurrent = (val) => {
      if (!val || typeof val !== 'string') return true;
      const lower = val.toLowerCase().trim();
      return lower === 'none' || lower === 'transparent' || lower === 'currentcolor' || (ctxColor && lower === ctxColor);
    };

    const inspectPath = (p) => {
      if (!p) return;
      if (p.currentColorType === 'stroke') {
        hasCurrentColor = true;
        checkColor(p.fill);
      } else if (p.currentColorType === 'fill') {
        hasCurrentColor = true;
        checkColor(p.stroke);
      } else if (p.currentColorType === 'both') {
        hasCurrentColor = true;
      } else if (p.isCurrentColor) {
        hasCurrentColor = true;
        if (!isCtxOrCurrent(p.fill)) checkColor(p.fill);
        if (!isCtxOrCurrent(p.stroke)) checkColor(p.stroke);
      } else {
        checkColor(p.fill);
        checkColor(p.stroke);
      }
    };

    const traversePaths = (paths = []) => {
      for (const p of paths) {
        inspectPath(p);
      }
    };

    traversePaths(vectorData.paths);
    if (vectorData.children) {
      const visit = (nodes) => {
        for (const n of nodes) {
          if (n.type === 'path') {
            inspectPath(n);
          }
          if (n.children) visit(n.children);
        }
      };
      visit(vectorData.children);
    }

    const distinctCount = explicitColors.size;
    const isMultiColor = hasGradient || distinctCount >= 2 || (distinctCount >= 1 && hasCurrentColor && !explicitColors.has('#000000') && !explicitColors.has('#1a1a1a'));
    const isMonochrome = !isMultiColor;

    return {
      isMultiColor,
      isMonochrome,
      hasCurrentColor,
      distinctCount,
      colors: Array.from(explicitColors),
      contextualColor: vectorData.contextualColor
    };
  }

  /**
   * Sanitizes a name to snake_case identifier suitable for Android resources.
   * @param {string} rawName
   * @returns {string}
   */
  static toSnakeCase(rawName) {
    if (!rawName) return 'icon';
    return rawName
      .replace(/([a-z])([A-Z])/g, '$1_$2')
      .replace(/[^a-zA-Z0-9]+/g, '_')
      .toLowerCase()
      .replace(/^_+|_+$/g, '');
  }

  /**
   * Sanitizes a group name into a valid identifier/name string.
   * @param {string} rawName
   * @returns {string}
   */
  static sanitizeGroupName(rawName) {
    if (!rawName || typeof rawName !== 'string') return '';
    return rawName.trim().replace(/[^a-zA-Z0-9_]/g, '_');
  }

  /**
   * Parses an SVG transform attribute string into a 6-element matrix array.
   * @param {string} transformStr
   * @returns {number[]}
   */
  static parseTransformToMatrix(transformStr) {
    const parsed = VectorGenerator.parseTransform(transformStr);
    return (parsed && Array.isArray(parsed.matrix)) ? parsed.matrix : [1, 0, 0, 1, 0, 0];
  }

  /**
   * Decomposes a 2D affine matrix [a, b, c, d, e, f] into translation, scale, and rotation.
   * Uses high-precision float math without intermediate string formatting.
   * @param {number[]} m
   * @returns {Object}
   */
  static decomposeMatrix(m) {
    if (!m || VectorGenerator.isIdentityMatrix(m)) {
      return {
        translationX: 0,
        translationY: 0,
        scaleX: 1,
        scaleY: 1,
        rotate: 0,
        rotation: 0,
        pivotX: 0,
        pivotY: 0,
        hasSkew: false
      };
    }
    const [a, b, c, d, e, f] = m;
    const det = a * d - b * c;
    const scaleX = Math.round(Math.hypot(a, b) * 1000) / 1000;
    const scaleY = scaleX !== 0 ? Math.round((det / scaleX) * 1000) / 1000 : Math.round(Math.hypot(c, d) * 1000) / 1000;
    const rad = (scaleX !== 0 && scaleY !== 0) ? Math.atan2(b / scaleY, a / scaleX) : Math.atan2(b, a);
    let deg = Math.round((rad * 180 / Math.PI) * 1000) / 1000;
    if (Object.is(deg, -0) || Math.abs(deg) < 1e-4) deg = 0;
    const hasSkew = Math.abs(a * c + b * d) > 1e-4;
    return {
      translationX: Math.round(e * 1000) / 1000,
      translationY: Math.round(f * 1000) / 1000,
      scaleX,
      scaleY,
      rotate: deg,
      rotation: deg,
      pivotX: 0,
      pivotY: 0,
      hasSkew
    };
  }

  /**
   * Generates an individual Android XML VectorDrawable string.
   * Supports recursive hierarchical <group> tags and android:fillType="evenOdd".
   * @param {Object} vector - Vector object from design_spec.json
   * @param {Object} [options] - Configuration options
   * @returns {string} Android XML VectorDrawable
   */
  static generateVectorDrawableXml(vector, options = {}) {
    const vec = vector || {};
    const dim = VectorGenerator.getSafeVectorDimensions(vec);
    const isFlat = Boolean(options.flat || options.bakeTransforms);
    const paths = (vec.paths || []).filter(p => p && typeof p === 'object');
    const nodes = (!isFlat && (vec.children?.length > 0 || vec.elements?.length > 0 || vec.groups?.length > 0))
      ? (vec.children || vec.elements || vec.groups)
      : null;

    let xml = `<?xml version="1.0" encoding="utf-8"?>\n`;
    xml += `<vector xmlns:android="http://schemas.android.com/apk/res/android"\n`;
    xml += `    android:width="${dim.width}dp"\n`;
    xml += `    android:height="${dim.height}dp"\n`;
    xml += `    android:viewportWidth="${dim.viewportWidth}"\n`;
    xml += `    android:viewportHeight="${dim.viewportHeight}">\n`;

    if (!nodes && paths.length === 0) {
      xml += `    <path\n`;
      xml += `        android:pathData="M0,0h24v24h-24z"\n`;
      xml += `        android:fillColor="#00000000" />\n`;
      xml += `</vector>\n`;
      return xml;
    }

    if (nodes) {
      const emitXmlNode = (node, indentLevel, pendingMatrix = null) => {
        if (!node || typeof node !== 'object') return '';
        const indent = '    '.repeat(indentLevel);
        const isGroup = node.type === 'group' || Array.isArray(node.children) || Array.isArray(node.elements) || (Array.isArray(node.groups) && node.groups.length > 0);

        if (isGroup) {
          const childNodes = node.children || node.elements || node.paths || [];
          if (childNodes.length === 0) return ''; // Empty group does not emit

          let localMat = node.transformMatrix;
          if (!localMat && node.transform) {
            localMat = VectorGenerator.parseTransformToMatrix(node.transform);
          }
          if (!localMat) localMat = [1, 0, 0, 1, 0, 0];

          const effectiveMat = pendingMatrix
            ? VectorGenerator.multiplyMatrices(pendingMatrix, localMat)
            : localMat;

          const hasSkew = Math.abs(effectiveMat[0] * effectiveMat[2] + effectiveMat[1] * effectiveMat[3]) > 1e-4;

          if (hasSkew) {
            // Skewed group: bake effective transform into child paths without <group>
            let out = '';
            for (const child of childNodes) {
              out += emitXmlNode(child, indentLevel, effectiveMat);
            }
            return out;
          }

          // Pure orthogonal group: decompose and emit <group>
          let decomp = null;
          if (pendingMatrix === null && (node.rotate !== undefined || node.scaleX !== undefined || node.translationX !== undefined)) {
            decomp = {
              translationX: node.translationX || 0,
              translationY: node.translationY || 0,
              scaleX: node.scaleX !== undefined ? node.scaleX : 1,
              scaleY: node.scaleY !== undefined ? node.scaleY : 1,
              rotate: node.rotate || node.rotation || 0,
              pivotX: node.pivotX || 0,
              pivotY: node.pivotY || 0
            };
          } else {
            decomp = VectorGenerator.decomposeMatrix(effectiveMat);
          }

          const groupAttrs = [];
          const name = VectorGenerator.sanitizeGroupName(node.name || '');
          if (name) groupAttrs.push(`android:name="${name}"`);

          if (decomp) {
            if (Number.isFinite(decomp.translationX) && Math.abs(decomp.translationX) > 1e-4) {
              groupAttrs.push(`android:translateX="${decomp.translationX}"`);
            }
            if (Number.isFinite(decomp.translationY) && Math.abs(decomp.translationY) > 1e-4) {
              groupAttrs.push(`android:translateY="${decomp.translationY}"`);
            }
            if (Number.isFinite(decomp.scaleX) && Math.abs(decomp.scaleX - 1) > 1e-4) {
              groupAttrs.push(`android:scaleX="${decomp.scaleX}"`);
            }
            if (Number.isFinite(decomp.scaleY) && Math.abs(decomp.scaleY - 1) > 1e-4) {
              groupAttrs.push(`android:scaleY="${decomp.scaleY}"`);
            }
            if (Number.isFinite(decomp.rotate) && Math.abs(decomp.rotate) > 1e-4) {
              groupAttrs.push(`android:rotation="${decomp.rotate}"`);
              if (Number.isFinite(decomp.pivotX) && Math.abs(decomp.pivotX) > 1e-4) {
                groupAttrs.push(`android:pivotX="${decomp.pivotX}"`);
              }
              if (Number.isFinite(decomp.pivotY) && Math.abs(decomp.pivotY) > 1e-4) {
                groupAttrs.push(`android:pivotY="${decomp.pivotY}"`);
              }
            }
          }

          let childContent = '';
          for (const child of childNodes) {
            childContent += emitXmlNode(child, groupAttrs.length > 0 ? indentLevel + 1 : indentLevel, null);
          }

          if (!childContent) return '';

          if (groupAttrs.length > 0) {
            return `${indent}<group\n${indent}    ${groupAttrs.join(`\n${indent}    `)}>\n${childContent}${indent}</group>\n`;
          } else {
            return childContent;
          }
        }

        // Leaf path
        let pathD = node.d || '';
        let localMat = node.transformMatrix;
        if (!localMat && node.transform) {
          localMat = VectorGenerator.parseTransformToMatrix(node.transform);
        }
        const effectiveMat = pendingMatrix
          ? (localMat ? VectorGenerator.multiplyMatrices(pendingMatrix, localMat) : pendingMatrix)
          : localMat;

        let pathWrapperDecomp = null;
        if (effectiveMat && !VectorGenerator.isIdentityMatrix(effectiveMat)) {
          const hasSkew = Math.abs(effectiveMat[0] * effectiveMat[2] + effectiveMat[1] * effectiveMat[3]) > 1e-4;
          if (hasSkew || pendingMatrix) {
            pathD = VectorGenerator.bakeMatrixToPath(pathD, effectiveMat);
          } else {
            const decomp = VectorGenerator.parseTransform(VectorGenerator.formatMatrixString(effectiveMat));
            if (decomp && (decomp.hasTranslation || decomp.hasScale || decomp.hasRotate)) {
              pathWrapperDecomp = decomp;
            }
          }
        }

        const fillColor = VectorGenerator.formatXmlColor(node.fill);
        const strokeColor = VectorGenerator.formatXmlColor(node.stroke);
        const strokeWidth = node.strokeWidth !== undefined ? node.strokeWidth : (strokeColor ? 2 : 0);
        const escapedPathData = VectorGenerator.escapeXml(pathD);
        const strokeCap = VectorGenerator.mapXmlStrokeCap(node.strokeLinecap);
        const strokeJoin = VectorGenerator.mapXmlStrokeJoin(node.strokeLinejoin);

        const isEvenOdd = (node.fillRule || node.clipRule || '').trim().toLowerCase() === 'evenodd';

        let pathIndent = indent;
        let prefix = '';
        let suffix = '';

        if (pathWrapperDecomp) {
          const groupAttrs = [];
          if (pathWrapperDecomp.hasTranslation) {
            if (pathWrapperDecomp.translationX !== 0) groupAttrs.push(`android:translateX="${pathWrapperDecomp.translationX}"`);
            if (pathWrapperDecomp.translationY !== 0) groupAttrs.push(`android:translateY="${pathWrapperDecomp.translationY}"`);
          }
          if (pathWrapperDecomp.hasScale) {
            if (pathWrapperDecomp.scaleX !== 1) groupAttrs.push(`android:scaleX="${pathWrapperDecomp.scaleX}"`);
            if (pathWrapperDecomp.scaleY !== 1) groupAttrs.push(`android:scaleY="${pathWrapperDecomp.scaleY}"`);
          }
          if (pathWrapperDecomp.hasRotate) {
            groupAttrs.push(`android:rotation="${pathWrapperDecomp.rotate}"`);
            if (pathWrapperDecomp.pivotX && pathWrapperDecomp.pivotX !== 0) groupAttrs.push(`android:pivotX="${pathWrapperDecomp.pivotX}"`);
            if (pathWrapperDecomp.pivotY && pathWrapperDecomp.pivotY !== 0) groupAttrs.push(`android:pivotY="${pathWrapperDecomp.pivotY}"`);
          }
          prefix = `${indent}<group\n${indent}    ${groupAttrs.join(`\n${indent}    `)}>\n`;
          pathIndent = indent + '    ';
          suffix = `${indent}</group>\n`;
        }

        const fillTypeAttr = isEvenOdd ? `\n${pathIndent}    android:fillType="evenOdd"` : '';

        let pathXml = `${pathIndent}<path\n`;
        if (fillColor) pathXml += `${pathIndent}    android:fillColor="${fillColor}"\n`;
        if (strokeColor) {
          pathXml += `${pathIndent}    android:strokeColor="${strokeColor}"\n`;
          pathXml += `${pathIndent}    android:strokeWidth="${strokeWidth}"\n`;
          pathXml += `${pathIndent}    android:strokeLineCap="${strokeCap}"\n`;
          pathXml += `${pathIndent}    android:strokeLineJoin="${strokeJoin}"\n`;
        }
        pathXml += `${pathIndent}    android:pathData="${escapedPathData}"${fillTypeAttr} />\n`;

        return prefix + pathXml + suffix;
      };

      for (const node of nodes) {
        xml += emitXmlNode(node, 1, null);
      }
    } else {
      // Flat path fallback
      for (const p of paths) {
        const fillColor = VectorGenerator.formatXmlColor(p.fill);
        const strokeColor = VectorGenerator.formatXmlColor(p.stroke);
        const strokeWidth = p.strokeWidth !== undefined ? p.strokeWidth : (strokeColor ? 2 : 0);
        const t = VectorGenerator.parseTransform(p.transform);
        const hasSkew = t && t.matrix && Math.abs(t.a * t.c + t.b * t.d) > 1e-4;
        const shouldBake = t && t.matrix && (isFlat || hasSkew);

        let pathD = p.d || '';
        if (shouldBake) {
          pathD = VectorGenerator.bakeMatrixToPath(pathD, t.matrix);
        }

        const escapedPathData = VectorGenerator.escapeXml(pathD);
        const strokeCap = VectorGenerator.mapXmlStrokeCap(p.strokeLinecap);
        const strokeJoin = VectorGenerator.mapXmlStrokeJoin(p.strokeLinejoin);

        const hasGroup = !shouldBake && t && (t.hasTranslation || t.hasScale || t.hasRotate);

        const pathIndent = hasGroup ? '        ' : '    ';
        if (hasGroup) {
          const groupAttrs = [];
          if (t.hasTranslation) {
            if (t.translationX !== 0) groupAttrs.push(`android:translateX="${t.translationX}"`);
            if (t.translationY !== 0) groupAttrs.push(`android:translateY="${t.translationY}"`);
          }
          if (t.hasScale) {
            if (t.scaleX !== 1) groupAttrs.push(`android:scaleX="${t.scaleX}"`);
            if (t.scaleY !== 1) groupAttrs.push(`android:scaleY="${t.scaleY}"`);
          }
          if (t.hasRotate) {
            groupAttrs.push(`android:rotation="${t.rotate}"`);
            if (t.pivotX && t.pivotX !== 0) groupAttrs.push(`android:pivotX="${t.pivotX}"`);
            if (t.pivotY && t.pivotY !== 0) groupAttrs.push(`android:pivotY="${t.pivotY}"`);
          }
          xml += `    <group\n        ${groupAttrs.join('\n        ')}>\n`;
        }

        const isEvenOdd = (p.fillRule || p.clipRule || '').trim().toLowerCase() === 'evenodd';
        const fillTypeAttr = isEvenOdd ? `\n${pathIndent}    android:fillType="evenOdd"` : '';

        xml += `${pathIndent}<path\n`;
        if (fillColor) xml += `${pathIndent}    android:fillColor="${fillColor}"\n`;
        if (strokeColor) {
          xml += `${pathIndent}    android:strokeColor="${strokeColor}"\n`;
          xml += `${pathIndent}    android:strokeWidth="${strokeWidth}"\n`;
          xml += `${pathIndent}    android:strokeLineCap="${strokeCap}"\n`;
          xml += `${pathIndent}    android:strokeLineJoin="${strokeJoin}"\n`;
        }
        xml += `${pathIndent}    android:pathData="${escapedPathData}"${fillTypeAttr} />\n`;

        if (hasGroup) {
          xml += `    </group>\n`;
        }
      }
    }

    xml += `</vector>\n`;
    return xml;
  }

  /**
   * Generates a complete Kotlin source file defining Compose ImageVectors.
   * Supports recursive hierarchical group(...) DSL and PathFillType.EvenOdd.
   * @param {Array<Object>} vectors - Array of vector objects from design_spec.json
   * @param {Object} [options] - Configuration options
   * @returns {string} Kotlin source code
   */
  static generateImageVectorFile(vectors = [], options = {}) {
    const packageName = options.packageName || 'com.claude.compose.icons';
    const className = options.className || 'ClaudeIcons';

    let code = `package ${packageName}\n\n`;
    code += `import androidx.compose.ui.graphics.Color\n`;
    code += `import androidx.compose.ui.graphics.PathFillType\n`;
    code += `import androidx.compose.ui.graphics.SolidColor\n`;
    code += `import androidx.compose.ui.graphics.StrokeCap\n`;
    code += `import androidx.compose.ui.graphics.StrokeJoin\n`;
    code += `import androidx.compose.ui.graphics.vector.ImageVector\n`;
    code += `import androidx.compose.ui.graphics.vector.PathBuilder\n`;
    code += `import androidx.compose.ui.graphics.vector.group\n`;
    code += `import androidx.compose.ui.graphics.vector.path\n`;
    code += `import androidx.compose.ui.unit.dp\n\n`;
    code += `public object ${className}\n\n`;

    const generatedNames = new Set();
    const geometryFingerprintToProp = new Map();
    const safeVectors = (vectors || []).filter(v => v && typeof v === 'object');
    const isFlat = Boolean(options.flat || options.bakeTransforms);

    for (let idx = 0; idx < safeVectors.length; idx++) {
      const vec = safeVectors[idx];
      const fingerprint = VectorGenerator.computeVectorFingerprint(vec);
      let propName;

      if (fingerprint && geometryFingerprintToProp.has(fingerprint)) {
        propName = geometryFingerprintToProp.get(fingerprint);
        vec.propName = propName;
        continue;
      }

      let baseName = VectorGenerator.normalizeIconName(vec.name, idx + 1);
      propName = baseName;
      let counter = 1;
      while (generatedNames.has(propName)) {
        propName = `${baseName}_${++counter}`;
      }
      generatedNames.add(propName);
      if (fingerprint) {
        geometryFingerprintToProp.set(fingerprint, propName);
      }
      vec.propName = propName;

      const safeProp = /^[0-9]/.test(propName) ? `\`${propName}\`` : propName;
      const cleanPropForField = propName.replace(/`/g, '');
      const backingField = `_${cleanPropForField.charAt(0).toLowerCase() + cleanPropForField.slice(1)}`;
      const dim = VectorGenerator.getSafeVectorDimensions(vec);
      const paths = (vec.paths || []).filter(p => p && typeof p === 'object');
      const nodes = (!isFlat && (vec.children?.length > 0 || vec.elements?.length > 0 || vec.groups?.length > 0))
        ? (vec.children || vec.elements || vec.groups)
        : null;

      code += `public val ${className}.${safeProp}: ImageVector\n`;
      code += `    get() {\n`;
      code += `        if (${backingField} != null) return ${backingField}!!\n`;
      code += `        ${backingField} = ImageVector.Builder(\n`;
      code += `            name = "${propName}",\n`;
      code += `            defaultWidth = ${dim.width}.dp,\n`;
      code += `            defaultHeight = ${dim.height}.dp,\n`;
      code += `            viewportWidth = ${dim.viewportWidth}f,\n`;
      code += `            viewportHeight = ${dim.viewportHeight}f\n`;
      code += `        ).apply {\n`;

      if (!nodes && paths.length === 0) {
        code += `            path(\n`;
        code += `                fill = null,\n`;
        code += `                stroke = null\n`;
        code += `            ) {\n`;
        code += `                moveTo(0f, 0f)\n`;
        code += `                close()\n`;
        code += `            }\n`;
      } else if (nodes) {
        const emitComposeNode = (node, indentLevel, pendingMatrix = null) => {
          if (!node || typeof node !== 'object') return '';
          const indent = '    '.repeat(indentLevel);
          const isGroup = node.type === 'group' || Array.isArray(node.children) || Array.isArray(node.elements) || (Array.isArray(node.groups) && node.groups.length > 0);

          if (isGroup) {
            const childNodes = node.children || node.elements || node.paths || [];
            if (childNodes.length === 0) return ''; // Empty group does not emit

            let localMat = node.transformMatrix;
            if (!localMat && node.transform) {
              localMat = VectorGenerator.parseTransformToMatrix(node.transform);
            }
            if (!localMat) localMat = [1, 0, 0, 1, 0, 0];

            const effectiveMat = pendingMatrix
              ? VectorGenerator.multiplyMatrices(pendingMatrix, localMat)
              : localMat;

            const hasSkew = Math.abs(effectiveMat[0] * effectiveMat[2] + effectiveMat[1] * effectiveMat[3]) > 1e-4;

            if (hasSkew) {
              // Skewed group: bake effective transform into child paths without group() wrapper
              let out = '';
              for (const child of childNodes) {
                out += emitComposeNode(child, indentLevel, effectiveMat);
              }
              return out;
            }

            // Pure orthogonal group: decompose and emit group()
            let decomp = null;
            if (pendingMatrix === null && (node.rotate !== undefined || node.scaleX !== undefined || node.translationX !== undefined)) {
              decomp = {
                translationX: node.translationX || 0,
                translationY: node.translationY || 0,
                scaleX: node.scaleX !== undefined ? node.scaleX : 1,
                scaleY: node.scaleY !== undefined ? node.scaleY : 1,
                rotate: node.rotate || node.rotation || 0,
                pivotX: node.pivotX || 0,
                pivotY: node.pivotY || 0
              };
            } else {
              decomp = VectorGenerator.decomposeMatrix(effectiveMat);
            }

            const groupArgs = [];
            const name = VectorGenerator.sanitizeGroupName(node.name || '');
            if (name) groupArgs.push(`name = "${name}"`);

            if (decomp) {
              if (Number.isFinite(decomp.rotate) && Math.abs(decomp.rotate) > 1e-4) {
                groupArgs.push(`rotate = ${decomp.rotate}f`);
              }
              if (Number.isFinite(decomp.pivotX) && Math.abs(decomp.pivotX) > 1e-4) {
                groupArgs.push(`pivotX = ${decomp.pivotX}f`);
              }
              if (Number.isFinite(decomp.pivotY) && Math.abs(decomp.pivotY) > 1e-4) {
                groupArgs.push(`pivotY = ${decomp.pivotY}f`);
              }
              if (Number.isFinite(decomp.scaleX) && Math.abs(decomp.scaleX - 1) > 1e-4) {
                groupArgs.push(`scaleX = ${decomp.scaleX}f`);
              }
              if (Number.isFinite(decomp.scaleY) && Math.abs(decomp.scaleY - 1) > 1e-4) {
                groupArgs.push(`scaleY = ${decomp.scaleY}f`);
              }
              if (Number.isFinite(decomp.translationX) && Math.abs(decomp.translationX) > 1e-4) {
                groupArgs.push(`translationX = ${decomp.translationX}f`);
              }
              if (Number.isFinite(decomp.translationY) && Math.abs(decomp.translationY) > 1e-4) {
                groupArgs.push(`translationY = ${decomp.translationY}f`);
              }
            }

            let childContent = '';
            for (const child of childNodes) {
              childContent += emitComposeNode(child, groupArgs.length > 0 ? indentLevel + 1 : indentLevel, null);
            }

            if (!childContent) return '';

            if (groupArgs.length > 0) {
              return `${indent}group(\n${indent}    ${groupArgs.join(`,\n${indent}    `)}\n${indent}) {\n${childContent}${indent}}\n`;
            } else {
              return childContent;
            }
          }

          // Leaf path
          let pathD = node.d || '';
          let localMat = node.transformMatrix;
          if (!localMat && node.transform) {
            localMat = VectorGenerator.parseTransformToMatrix(node.transform);
          }
          const effectiveMat = pendingMatrix
            ? (localMat ? VectorGenerator.multiplyMatrices(pendingMatrix, localMat) : pendingMatrix)
            : localMat;

          let pathWrapperDecomp = null;
          if (effectiveMat && !VectorGenerator.isIdentityMatrix(effectiveMat)) {
            const hasSkew = Math.abs(effectiveMat[0] * effectiveMat[2] + effectiveMat[1] * effectiveMat[3]) > 1e-4;
            if (hasSkew || pendingMatrix) {
              pathD = VectorGenerator.bakeMatrixToPath(pathD, effectiveMat);
            } else {
              const decomp = VectorGenerator.parseTransform(VectorGenerator.formatMatrixString(effectiveMat));
              if (decomp && (decomp.hasTranslation || decomp.hasScale || decomp.hasRotate)) {
                pathWrapperDecomp = decomp;
              }
            }
          }

          const fillHex = VectorGenerator.formatComposeColor(node.fill);
          const strokeHex = VectorGenerator.formatComposeColor(node.stroke);
          const strokeWidth = node.strokeWidth !== undefined ? node.strokeWidth : (strokeHex ? 2 : 0);

          const fillExpr = fillHex ? `SolidColor(Color(${fillHex}))` : 'null';
          const strokeExpr = strokeHex ? `SolidColor(Color(${strokeHex}))` : 'null';

          const composeCap = VectorGenerator.mapComposeStrokeCap(node.strokeLinecap);
          const composeJoin = VectorGenerator.mapComposeStrokeJoin(node.strokeLinejoin);

          const isEvenOdd = (node.fillRule || node.clipRule || '').trim().toLowerCase() === 'evenodd';

          let pathIndent = indent;
          let prefix = '';
          let suffix = '';

          if (pathWrapperDecomp) {
            const groupArgs = [];
            if (pathWrapperDecomp.hasTranslation) {
              if (pathWrapperDecomp.translationX !== 0) groupArgs.push(`translationX = ${pathWrapperDecomp.translationX}f`);
              if (pathWrapperDecomp.translationY !== 0) groupArgs.push(`translationY = ${pathWrapperDecomp.translationY}f`);
            }
            if (pathWrapperDecomp.hasScale) {
              if (pathWrapperDecomp.scaleX !== 1) groupArgs.push(`scaleX = ${pathWrapperDecomp.scaleX}f`);
              if (pathWrapperDecomp.scaleY !== 1) groupArgs.push(`scaleY = ${pathWrapperDecomp.scaleY}f`);
            }
            if (pathWrapperDecomp.hasRotate) {
              groupArgs.push(`rotate = ${pathWrapperDecomp.rotate}f`);
              if (pathWrapperDecomp.pivotX && pathWrapperDecomp.pivotX !== 0) groupArgs.push(`pivotX = ${pathWrapperDecomp.pivotX}f`);
              if (pathWrapperDecomp.pivotY && pathWrapperDecomp.pivotY !== 0) groupArgs.push(`pivotY = ${pathWrapperDecomp.pivotY}f`);
            }
            prefix = `${indent}group(\n${indent}    ${groupArgs.join(`,\n${indent}    `)}\n${indent}) {\n`;
            pathIndent = indent + '    ';
            suffix = `${indent}}\n`;
          }

          const fillRuleAttr = isEvenOdd
            ? `,\n${pathIndent}    pathFillType = PathFillType.EvenOdd`
            : '';

          let pathCode = `${pathIndent}path(\n`;
          pathCode += `${pathIndent}    fill = ${fillExpr},\n`;
          pathCode += `${pathIndent}    stroke = ${strokeExpr},\n`;
          pathCode += `${pathIndent}    strokeLineWidth = ${strokeWidth}f,\n`;
          pathCode += `${pathIndent}    strokeLineCap = ${composeCap},\n`;
          pathCode += `${pathIndent}    strokeLineJoin = ${composeJoin}${fillRuleAttr}\n`;
          pathCode += `${pathIndent}) {\n`;

          const dslLines = VectorGenerator.pathToComposeDsl(pathD);
          if (dslLines.length === 0) {
            pathCode += `${pathIndent}    moveTo(0f, 0f)\n`;
            pathCode += `${pathIndent}    close()\n`;
          } else {
            for (const line of dslLines) {
              pathCode += `${pathIndent}    ${line}\n`;
            }
          }

          pathCode += `${pathIndent}}\n`;

          return prefix + pathCode + suffix;
        };

        for (const node of nodes) {
          code += emitComposeNode(node, 3, null);
        }
      } else {
        // Flat path fallback
        for (const p of paths) {
          const fillHex = VectorGenerator.formatComposeColor(p.fill);
          const strokeHex = VectorGenerator.formatComposeColor(p.stroke);
          const strokeWidth = p.strokeWidth !== undefined ? p.strokeWidth : (strokeHex ? 2 : 0);

          const fillExpr = fillHex ? `SolidColor(Color(${fillHex}))` : 'null';
          const strokeExpr = strokeHex ? `SolidColor(Color(${strokeHex}))` : 'null';

          const composeCap = VectorGenerator.mapComposeStrokeCap(p.strokeLinecap);
          const composeJoin = VectorGenerator.mapComposeStrokeJoin(p.strokeLinejoin);

          const t = VectorGenerator.parseTransform(p.transform);
          const hasSkew = t && t.matrix && Math.abs(t.a * t.c + t.b * t.d) > 1e-4;
          const shouldBake = t && t.matrix && (isFlat || hasSkew);

          let pathD = p.d || '';
          if (shouldBake) {
            pathD = VectorGenerator.bakeMatrixToPath(pathD, t.matrix);
          }

          const hasGroup = !shouldBake && t && (t.hasTranslation || t.hasScale || t.hasRotate);

          const groupIndent = hasGroup ? '                ' : '            ';
          if (hasGroup) {
            const groupArgs = [];
            if (t.hasTranslation) {
              if (t.translationX !== 0) groupArgs.push(`translationX = ${t.translationX}f`);
              if (t.translationY !== 0) groupArgs.push(`translationY = ${t.translationY}f`);
            }
            if (t.hasScale) {
              if (t.scaleX !== 1) groupArgs.push(`scaleX = ${t.scaleX}f`);
              if (t.scaleY !== 1) groupArgs.push(`scaleY = ${t.scaleY}f`);
            }
            if (t.hasRotate) {
              groupArgs.push(`rotate = ${t.rotate}f`);
              if (t.pivotX && t.pivotX !== 0) groupArgs.push(`pivotX = ${t.pivotX}f`);
              if (t.pivotY && t.pivotY !== 0) groupArgs.push(`pivotY = ${t.pivotY}f`);
            }
            code += `            group(\n                ${groupArgs.join(',\n                ')}\n            ) {\n`;
          }

          const isEvenOdd = (p.fillRule || p.clipRule || '').trim().toLowerCase() === 'evenodd';
          const fillRuleAttr = isEvenOdd
            ? `,\n${groupIndent}    pathFillType = PathFillType.EvenOdd`
            : '';

          code += `${groupIndent}path(\n`;
          code += `${groupIndent}    fill = ${fillExpr},\n`;
          code += `${groupIndent}    stroke = ${strokeExpr},\n`;
          code += `${groupIndent}    strokeLineWidth = ${strokeWidth}f,\n`;
          code += `${groupIndent}    strokeLineCap = ${composeCap},\n`;
          code += `${groupIndent}    strokeLineJoin = ${composeJoin}${fillRuleAttr}\n`;
          code += `${groupIndent}) {\n`;

          const dslLines = VectorGenerator.pathToComposeDsl(pathD);
          if (dslLines.length === 0) {
            code += `${groupIndent}    moveTo(0f, 0f)\n`;
            code += `${groupIndent}    close()\n`;
          } else {
            for (const line of dslLines) {
              code += `${groupIndent}    ${line}\n`;
            }
          }

          code += `${groupIndent}}\n`;

          if (hasGroup) {
            code += `            }\n`;
          }
        }
      }

      code += `        }.build()\n`;
      code += `        return ${backingField}!!\n`;
      code += `    }\n\n`;
      code += `private var ${backingField}: ImageVector? = null\n\n`;
    }

    return code;
  }

  static mapComposeStrokeCap(cap) {
    switch ((cap || '').toLowerCase()) {
      case 'square': return 'StrokeCap.Square';
      case 'butt': return 'StrokeCap.Butt';
      case 'round':
      default: return 'StrokeCap.Round';
    }
  }

  static mapComposeStrokeJoin(join) {
    switch ((join || '').toLowerCase()) {
      case 'bevel': return 'StrokeJoin.Bevel';
      case 'miter': return 'StrokeJoin.Miter';
      case 'round':
      default: return 'StrokeJoin.Round';
    }
  }

  static mapXmlStrokeCap(cap) {
    switch ((cap || '').toLowerCase()) {
      case 'square': return 'square';
      case 'butt': return 'butt';
      case 'round':
      default: return 'round';
    }
  }

  static mapXmlStrokeJoin(join) {
    switch ((join || '').toLowerCase()) {
      case 'bevel': return 'bevel';
      case 'miter': return 'miter';
      case 'round':
      default: return 'round';
    }
  }

  /**
   * Multiplies two 2D affine matrices: M = M1 * M2.
   * @param {number[]} m1 - [a1, b1, c1, d1, e1, f1]
   * @param {number[]} m2 - [a2, b2, c2, d2, e2, f2]
   * @returns {number[]} [a, b, c, d, e, f]
   */
  static multiplyMatrices(m1, m2) {
    const [a1, b1, c1, d1, e1, f1] = m1;
    const [a2, b2, c2, d2, e2, f2] = m2;
    return [
      a1 * a2 + c1 * b2,
      b1 * a2 + d1 * b2,
      a1 * c2 + c1 * d2,
      b1 * c2 + d1 * d2,
      a1 * e2 + c1 * f2 + e1,
      b1 * e2 + d1 * f2 + f1
    ];
  }

  /**
   * Transforms a 2D point (x, y) by affine matrix M = [a, b, c, d, e, f].
   * @param {number[]} m
   * @param {number} x
   * @param {number} y
   * @returns {number[]} [x', y']
   */
  static transformPoint(arg1, arg2, arg3) {
    let m, x, y;
    if (Array.isArray(arg1) && arg1.length === 6) {
      m = arg1;
      if (typeof arg2 === 'object' && arg2 !== null) {
        x = arg2.x !== undefined ? arg2.x : arg2[0];
        y = arg2.y !== undefined ? arg2.y : arg2[1];
      } else {
        x = arg2;
        y = arg3;
      }
    } else {
      const pt = arg1;
      m = arg2;
      x = pt.x !== undefined ? pt.x : pt[0];
      y = pt.y !== undefined ? pt.y : pt[1];
    }
    const resX = m[0] * x + m[2] * y + m[4];
    const resY = m[1] * x + m[3] * y + m[5];
    const arr = [resX, resY];
    arr.x = resX;
    arr.y = resY;
    return arr;
  }

  /**
   * Transforms a 2D displacement delta (dx, dy) by affine matrix linear components.
   * @param {number[]|Object} arg1
   * @param {number|number[]|Object} arg2
   * @param {number} [arg3]
   * @returns {number[]} [dx', dy']
   */
  static transformDelta(arg1, arg2, arg3) {
    let m, dx, dy;
    if (Array.isArray(arg1) && arg1.length === 6) {
      m = arg1;
      if (typeof arg2 === 'object' && arg2 !== null) {
        dx = arg2.dx !== undefined ? arg2.dx : (arg2.x !== undefined ? arg2.x : arg2[0]);
        dy = arg2.dy !== undefined ? arg2.dy : (arg2.y !== undefined ? arg2.y : arg2[1]);
      } else {
        dx = arg2;
        dy = arg3;
      }
    } else {
      const pt = arg1;
      m = arg2;
      dx = pt.dx !== undefined ? pt.dx : (pt.x !== undefined ? pt.x : pt[0]);
      dy = pt.dy !== undefined ? pt.dy : (pt.y !== undefined ? pt.y : pt[1]);
    }
    const resDx = m[0] * dx + m[2] * dy;
    const resDy = m[1] * dx + m[3] * dy;
    const arr = [resDx, resDy];
    arr.dx = resDx;
    arr.dy = resDy;
    arr.x = resDx;
    arr.y = resDy;
    return arr;
  }

  /**
   * Checks if matrix is approximately the identity matrix [1, 0, 0, 1, 0, 0].
   * @param {number[]} m
   * @param {number} [eps=1e-5]
   * @returns {boolean}
   */
  static isIdentityMatrix(m, eps = 1e-5) {
    if (!m || !Array.isArray(m) || m.length < 6) return true;
    return Math.abs(m[0] - 1) < eps &&
           Math.abs(m[1]) < eps &&
           Math.abs(m[2]) < eps &&
           Math.abs(m[3] - 1) < eps &&
           Math.abs(m[4]) < eps &&
           Math.abs(m[5]) < eps;
  }

  /**
   * Formats a matrix array into an SVG matrix(...) string.
   * @param {number[]} m
   * @returns {string}
   */
  static formatMatrixString(m) {
    const clean = (v) => {
      const r = Math.round(v * 10000) / 10000;
      return Object.is(r, -0) || Math.abs(r) < 1e-6 ? 0 : r;
    };
    return `matrix(${clean(m[0])} ${clean(m[1])} ${clean(m[2])} ${clean(m[3])} ${clean(m[4])} ${clean(m[5])})`;
  }

  /**
   * Decomposes an SVG elliptical arc into one or more cubic Bézier curves (W3C Appendix F.6).
   * @param {number} x0 - Start X
   * @param {number} y0 - Start Y
   * @param {number} rx - Radius X
   * @param {number} ry - Radius Y
   * @param {number} angle - X-axis rotation angle in degrees
   * @param {number} largeArc - Large arc flag (0 or 1)
   * @param {number} sweep - Sweep flag (0 or 1)
   * @param {number} x - End X
   * @param {number} y - End Y
   * @returns {Array<{ command: 'C', args: number[] }>} Array of cubic Béziers
   */
  static arcToCubic(x0, y0, rx, ry, angle, largeArc, sweep, x, y) {
    if (x0 === x && y0 === y) return [];
    if (rx === 0 || ry === 0) {
      return [{ command: 'C', args: [x0, y0, x, y, x, y] }];
    }
    rx = Math.abs(rx);
    ry = Math.abs(ry);
    const phi = (angle * Math.PI) / 180;
    const cosPhi = Math.cos(phi);
    const sinPhi = Math.sin(phi);

    const dx = (x0 - x) / 2;
    const dy = (y0 - y) / 2;
    const x1p = cosPhi * dx + sinPhi * dy;
    const y1p = -sinPhi * dx + cosPhi * dy;

    const lambda = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry);
    if (lambda > 1) {
      const sqrtLambda = Math.sqrt(lambda);
      rx *= sqrtLambda;
      ry *= sqrtLambda;
    }

    const rxSq = rx * rx;
    const rySq = ry * ry;
    const x1pSq = x1p * x1p;
    const y1pSq = y1p * y1p;

    const num = rxSq * rySq - rxSq * y1pSq - rySq * x1pSq;
    const denom = rxSq * y1pSq + rySq * x1pSq;
    let ratio = denom === 0 ? 0 : num / denom;
    if (ratio < 0) ratio = 0;
    const factor = (largeArc === sweep ? -1 : 1) * Math.sqrt(ratio);

    const cxp = factor * ((rx * y1p) / ry);
    const cyp = factor * (-(ry * x1p) / rx);

    const cx = cosPhi * cxp - sinPhi * cyp + (x0 + x) / 2;
    const cy = sinPhi * cxp + cosPhi * cyp + (y0 + y) / 2;

    function vecAngle(ux, uy, vx, vy) {
      const dot = ux * vx + uy * vy;
      const len = Math.hypot(ux, uy) * Math.hypot(vx, vy);
      if (len === 0) return 0;
      let val = dot / len;
      if (val < -1) val = -1;
      if (val > 1) val = 1;
      let ang = Math.acos(val);
      if (ux * vy - uy * vx < 0) ang = -ang;
      return ang;
    }

    const ux = (x1p - cxp) / rx;
    const uy = (y1p - cyp) / ry;
    const vx = (-x1p - cxp) / rx;
    const vy = (-y1p - cyp) / ry;

    let theta1 = vecAngle(1, 0, ux, uy);
    let dTheta = vecAngle(ux, uy, vx, vy);

    if (!sweep && dTheta > 0) dTheta -= 2 * Math.PI;
    if (sweep && dTheta < 0) dTheta += 2 * Math.PI;

    const segCount = Math.max(1, Math.ceil(Math.abs(dTheta) / (Math.PI / 2)));
    const delta = dTheta / segCount;
    const alpha = (4 / 3) * Math.tan(delta / 4);

    const cubics = [];
    let currentTheta = theta1;

    for (let j = 0; j < segCount; j++) {
      const nextTheta = currentTheta + delta;
      const isLast = j === segCount - 1;

      const cosA = Math.cos(currentTheta);
      const sinA = Math.sin(currentTheta);
      const cosB = Math.cos(nextTheta);
      const sinB = Math.sin(nextTheta);

      const p0x = cx + rx * cosA * cosPhi - ry * sinA * sinPhi;
      const p0y = cy + rx * cosA * sinPhi + ry * sinA * cosPhi;
      const d0x = -rx * sinA * cosPhi - ry * cosA * sinPhi;
      const d0y = -rx * sinA * sinPhi + ry * cosA * cosPhi;

      const p3x = isLast ? x : (cx + rx * cosB * cosPhi - ry * sinB * sinPhi);
      const p3y = isLast ? y : (cy + rx * cosB * sinPhi + ry * sinB * cosPhi);
      const d3x = -rx * sinB * cosPhi - ry * cosB * sinPhi;
      const d3y = -rx * sinB * sinPhi + ry * cosB * cosPhi;

      const p1x = p0x + alpha * d0x;
      const p1y = p0y + alpha * d0y;
      const p2x = p3x - alpha * d3x;
      const p2y = p3y - alpha * d3y;

      cubics.push({
        command: 'C',
        args: [p1x, p1y, p2x, p2y, p3x, p3y]
      });

      currentTheta = nextTheta;
    }

    return cubics;
  }

  /**
   * Bakes a 2D affine transformation matrix directly into SVG path coordinates (x', y') = M * (x, y).
   * Supports all 10 path command families (M/m, L/l, H/h, V/v, C/c, S/s, Q/q, T/t, A/a, Z/z).
   * Morphs H/V to general L, expands S/T to explicit C/Q, and decomposes A to cubic Béziers when needed.
   * @param {string} d - SVG path data string
   * @param {number[]} matrix - [a, b, c, d, e, f] 2D affine matrix
   * @returns {string} Transformed path data string
   */
  static bakeMatrixToPath(d, matrix) {
    if (!d || typeof d !== 'string') return '';
    const m = (Array.isArray(matrix) && matrix.length >= 6) ? matrix : [1, 0, 0, 1, 0, 0];
    if (VectorGenerator.isIdentityMatrix(m)) return d.trim();

    const transformPoint = (x, y) => [
      m[0] * x + m[2] * y + m[4],
      m[1] * x + m[3] * y + m[5]
    ];

    const formatNum = (n) => {
      const rounded = Math.round(n * 10000) / 10000;
      return Object.is(rounded, -0) || Math.abs(rounded) < 1e-6 ? 0 : rounded;
    };

    const isUniformScale = Math.abs(m[1]) < 1e-5 && Math.abs(m[2]) < 1e-5 && Math.abs(m[0] - m[3]) < 1e-5 && m[0] > 0;

    const segments = VectorGenerator.tokenizePath(d);
    const out = [];

    let curX = 0, curY = 0;
    let startX = 0, startY = 0;
    let lastCtrlX = 0, lastCtrlY = 0;
    let lastCmd = null;

    for (const seg of segments) {
      const { command, isRelative, args } = seg;
      const cmdUpper = command.toUpperCase();

      switch (cmdUpper) {
        case 'M': {
          let x = args[0], y = args[1];
          if (isRelative) { x += curX; y += curY; }
          curX = x; curY = y;
          startX = x; startY = y;
          lastCtrlX = x; lastCtrlY = y;
          const [tx, ty] = transformPoint(x, y);
          out.push(`M ${formatNum(tx)} ${formatNum(ty)}`);
          lastCmd = 'M';
          break;
        }
        case 'L': {
          let x = args[0], y = args[1];
          if (isRelative) { x += curX; y += curY; }
          curX = x; curY = y;
          lastCtrlX = x; lastCtrlY = y;
          const [tx, ty] = transformPoint(x, y);
          out.push(`L ${formatNum(tx)} ${formatNum(ty)}`);
          lastCmd = 'L';
          break;
        }
        case 'H': {
          let x = args[0];
          if (isRelative) x += curX;
          const [tx, ty] = transformPoint(x, curY);
          curX = x;
          lastCtrlX = curX; lastCtrlY = curY;
          out.push(`L ${formatNum(tx)} ${formatNum(ty)}`);
          lastCmd = 'L';
          break;
        }
        case 'V': {
          let y = args[0];
          if (isRelative) y += curY;
          const [tx, ty] = transformPoint(curX, y);
          curY = y;
          lastCtrlX = curX; lastCtrlY = curY;
          out.push(`L ${formatNum(tx)} ${formatNum(ty)}`);
          lastCmd = 'L';
          break;
        }
        case 'C': {
          let [x1, y1, x2, y2, x, y] = args;
          if (isRelative) {
            x1 += curX; y1 += curY;
            x2 += curX; y2 += curY;
            x += curX; y += curY;
          }
          lastCtrlX = x2; lastCtrlY = y2;
          curX = x; curY = y;
          const [tx1, ty1] = transformPoint(x1, y1);
          const [tx2, ty2] = transformPoint(x2, y2);
          const [tx, ty] = transformPoint(x, y);
          out.push(`C ${formatNum(tx1)} ${formatNum(ty1)} ${formatNum(tx2)} ${formatNum(ty2)} ${formatNum(tx)} ${formatNum(ty)}`);
          lastCmd = 'C';
          break;
        }
        case 'S': {
          let [x2, y2, x, y] = args;
          if (isRelative) {
            x2 += curX; y2 += curY;
            x += curX; y += curY;
          }
          const x1 = (lastCmd === 'C' || lastCmd === 'S') ? (2 * curX - lastCtrlX) : curX;
          const y1 = (lastCmd === 'C' || lastCmd === 'S') ? (2 * curY - lastCtrlY) : curY;
          lastCtrlX = x2; lastCtrlY = y2;
          curX = x; curY = y;
          const [tx1, ty1] = transformPoint(x1, y1);
          const [tx2, ty2] = transformPoint(x2, y2);
          const [tx, ty] = transformPoint(x, y);
          out.push(`C ${formatNum(tx1)} ${formatNum(ty1)} ${formatNum(tx2)} ${formatNum(ty2)} ${formatNum(tx)} ${formatNum(ty)}`);
          lastCmd = 'C';
          break;
        }
        case 'Q': {
          let [x1, y1, x, y] = args;
          if (isRelative) {
            x1 += curX; y1 += curY;
            x += curX; y += curY;
          }
          lastCtrlX = x1; lastCtrlY = y1;
          curX = x; curY = y;
          const [tx1, ty1] = transformPoint(x1, y1);
          const [tx, ty] = transformPoint(x, y);
          out.push(`Q ${formatNum(tx1)} ${formatNum(ty1)} ${formatNum(tx)} ${formatNum(ty)}`);
          lastCmd = 'Q';
          break;
        }
        case 'T': {
          let [x, y] = args;
          if (isRelative) {
            x += curX; y += curY;
          }
          const x1 = (lastCmd === 'Q' || lastCmd === 'T') ? (2 * curX - lastCtrlX) : curX;
          const y1 = (lastCmd === 'Q' || lastCmd === 'T') ? (2 * curY - lastCtrlY) : curY;
          lastCtrlX = x1; lastCtrlY = y1;
          curX = x; curY = y;
          const [tx1, ty1] = transformPoint(x1, y1);
          const [tx, ty] = transformPoint(x, y);
          out.push(`Q ${formatNum(tx1)} ${formatNum(ty1)} ${formatNum(tx)} ${formatNum(ty)}`);
          lastCmd = 'Q';
          break;
        }
        case 'A': {
          let [rx, ry, rot, largeArc, sweep, x, y] = args;
          if (isRelative) {
            x += curX;
            y += curY;
          }
          if (isUniformScale) {
            const s = m[0];
            const [tx, ty] = transformPoint(x, y);
            out.push(`A ${formatNum(rx * s)} ${formatNum(ry * s)} ${rot} ${largeArc} ${sweep} ${formatNum(tx)} ${formatNum(ty)}`);
          } else {
            const cubics = VectorGenerator.arcToCubic(curX, curY, rx, ry, rot, largeArc, sweep, x, y);
            for (const c of cubics) {
              const [tx1, ty1] = transformPoint(c.args[0], c.args[1]);
              const [tx2, ty2] = transformPoint(c.args[2], c.args[3]);
              const [tx, ty] = transformPoint(c.args[4], c.args[5]);
              out.push(`C ${formatNum(tx1)} ${formatNum(ty1)} ${formatNum(tx2)} ${formatNum(ty2)} ${formatNum(tx)} ${formatNum(ty)}`);
            }
          }
          lastCtrlX = x; lastCtrlY = y;
          curX = x; curY = y;
          lastCmd = 'A';
          break;
        }
        case 'Z': {
          out.push('Z');
          curX = startX; curY = startY;
          lastCtrlX = curX; lastCtrlY = curY;
          lastCmd = 'Z';
          break;
        }
      }
    }

    return out.join(' ');
  }

  /**
   * Parses an SVG transform attribute string into numeric decomposition.
   * Supports matrix(a,b,c,d,e,f), translate(tx,[ty]), scale(sx,[sy]), rotate(deg,[cx,cy]),
   * skewX(deg/rad), skewY(deg/rad), including chained transforms with 2D affine matrix multiplication.
   * @param {string} transformStr
   * @returns {Object|null}
   */
  static parseTransform(transformStr) {
    if (!transformStr || typeof transformStr !== 'string') return null;
    const t = transformStr.trim();
    if (!t) return null;

    const fnRegex = /([a-zA-Z]+)\s*\(([^)]*)\)/g;
    const matches = [];
    let m;
    while ((m = fnRegex.exec(t)) !== null) {
      matches.push({ name: m[1].toLowerCase(), rawArgs: m[2] });
    }

    if (matches.length === 0) return null;

    const parseArgs = (raw) => {
      const parts = raw.trim().split(/[\s,]+/).filter(Boolean);
      return parts.map(p => {
        const isRad = /rad$/i.test(p);
        const num = parseFloat(p.replace(/(px|deg|rad)$/i, ''));
        if (!Number.isFinite(num)) return NaN;
        return isRad ? (num * 180 / Math.PI) : num;
      }).filter(Number.isFinite);
    };

    // Fast-path / backward compatibility for single non-chained transform
    if (matches.length === 1) {
      const match = matches[0];
      const args = parseArgs(match.rawArgs);

      if (match.name === 'matrix' && args.length >= 6) {
        const [a, b, c, d, e, f] = args;
        const det = a * d - b * c;
        const scaleX = Math.round(Math.hypot(a, b) * 1000) / 1000;
        const scaleY = scaleX !== 0 ? Math.round((det / scaleX) * 1000) / 1000 : Math.round(Math.hypot(c, d) * 1000) / 1000;
        const rad = Math.atan2(b, a);
        const deg = Math.round((rad * 180 / Math.PI) * 1000) / 1000;
        const hasSkew = Math.abs(a * c + b * d) > 1e-4;
        return {
          type: 'matrix',
          a, b, c, d, e, f,
          matrix: [a, b, c, d, e, f],
          translationX: Math.round(e * 1000) / 1000,
          translationY: Math.round(f * 1000) / 1000,
          scaleX,
          scaleY,
          rotate: deg,
          rotation: deg,
          pivotX: 0,
          pivotY: 0,
          hasTranslation: Math.abs(e) > 0.0001 || Math.abs(f) > 0.0001,
          hasScale: Math.abs(scaleX - 1) > 0.0001 || Math.abs(scaleY - 1) > 0.0001,
          hasRotate: Math.abs(deg) > 0.0001,
          hasSkew
        };
      }

      if (match.name === 'translate') {
        const tx = args[0] || 0;
        const ty = args[1] !== undefined ? args[1] : 0;
        return {
          type: 'translate',
          a: 1, b: 0, c: 0, d: 1, e: tx, f: ty,
          matrix: [1, 0, 0, 1, tx, ty],
          translationX: Math.round(tx * 1000) / 1000,
          translationY: Math.round(ty * 1000) / 1000,
          scaleX: 1,
          scaleY: 1,
          rotate: 0,
          rotation: 0,
          pivotX: 0,
          pivotY: 0,
          hasTranslation: Math.abs(tx) > 0.0001 || Math.abs(ty) > 0.0001,
          hasScale: false,
          hasRotate: false,
          hasSkew: false
        };
      }

      if (match.name === 'scale') {
        const sx = args[0] !== undefined ? args[0] : 1;
        const sy = args[1] !== undefined ? args[1] : sx;
        return {
          type: 'scale',
          a: sx, b: 0, c: 0, d: sy, e: 0, f: 0,
          matrix: [sx, 0, 0, sy, 0, 0],
          scaleX: Math.round(sx * 1000) / 1000,
          scaleY: Math.round(sy * 1000) / 1000,
          translationX: 0,
          translationY: 0,
          rotate: 0,
          rotation: 0,
          pivotX: 0,
          pivotY: 0,
          hasTranslation: false,
          hasScale: Math.abs(sx - 1) > 0.0001 || Math.abs(sy - 1) > 0.0001,
          hasRotate: false,
          hasSkew: false
        };
      }

      if (match.name === 'rotate') {
        const deg = args[0] || 0;
        const cx = args[1] !== undefined ? args[1] : 0;
        const cy = args[2] !== undefined ? args[2] : 0;
        const rad = deg * Math.PI / 180;
        let cos = Math.cos(rad);
        let sin = Math.sin(rad);
        if (Math.abs(cos) < 1e-12) cos = 0;
        if (Math.abs(sin) < 1e-12) sin = 0;
        const e = (cx !== 0 || cy !== 0) ? (cx - cx * cos + cy * sin) : 0;
        const f = (cx !== 0 || cy !== 0) ? (cy - cx * sin - cy * cos) : 0;
        return {
          type: 'rotate',
          a: cos, b: sin, c: -sin, d: cos, e, f,
          matrix: [cos, sin, -sin, cos, e, f],
          rotate: Math.round(deg * 1000) / 1000,
          rotation: Math.round(deg * 1000) / 1000,
          pivotX: Math.round(cx * 1000) / 1000,
          pivotY: Math.round(cy * 1000) / 1000,
          translationX: 0,
          translationY: 0,
          scaleX: 1,
          scaleY: 1,
          hasTranslation: false,
          hasScale: false,
          hasRotate: Math.abs(deg) > 0.0001,
          hasSkew: false
        };
      }

      if (match.name === 'skewx') {
        const deg = args[0] || 0;
        const rad = deg * Math.PI / 180;
        const tan = Math.tan(rad);
        return {
          type: 'skewx',
          a: 1, b: 0, c: tan, d: 1, e: 0, f: 0,
          matrix: [1, 0, tan, 1, 0, 0],
          translationX: 0,
          translationY: 0,
          scaleX: 1,
          scaleY: 1,
          rotate: 0,
          rotation: 0,
          pivotX: 0,
          pivotY: 0,
          hasTranslation: false,
          hasScale: false,
          hasRotate: false,
          hasSkew: Math.abs(tan) > 1e-4
        };
      }

      if (match.name === 'skewy') {
        const deg = args[0] || 0;
        const rad = deg * Math.PI / 180;
        const tan = Math.tan(rad);
        return {
          type: 'skewy',
          a: 1, b: tan, c: 0, d: 1, e: 0, f: 0,
          matrix: [1, tan, 0, 1, 0, 0],
          translationX: 0,
          translationY: 0,
          scaleX: 1,
          scaleY: 1,
          rotate: 0,
          rotation: 0,
          pivotX: 0,
          pivotY: 0,
          hasTranslation: false,
          hasScale: false,
          hasRotate: false,
          hasSkew: Math.abs(tan) > 1e-4
        };
      }
    }

    // Chained transforms: 2D affine matrix multiplication
    let curr = [1, 0, 0, 1, 0, 0];

    for (const match of matches) {
      const args = parseArgs(match.rawArgs);
      let stepMatrix = [1, 0, 0, 1, 0, 0];

      if (match.name === 'matrix' && args.length >= 6) {
        stepMatrix = [args[0], args[1], args[2], args[3], args[4], args[5]];
      } else if (match.name === 'translate') {
        const tx = args[0] || 0;
        const ty = args[1] !== undefined ? args[1] : 0;
        stepMatrix = [1, 0, 0, 1, tx, ty];
      } else if (match.name === 'scale') {
        const sx = args[0] !== undefined ? args[0] : 1;
        const sy = args[1] !== undefined ? args[1] : sx;
        stepMatrix = [sx, 0, 0, sy, 0, 0];
      } else if (match.name === 'rotate') {
        const deg = args[0] || 0;
        const cx = args[1] !== undefined ? args[1] : 0;
        const cy = args[2] !== undefined ? args[2] : 0;
        const rad = deg * Math.PI / 180;
        let cos = Math.cos(rad);
        let sin = Math.sin(rad);
        if (Math.abs(cos) < 1e-12) cos = 0;
        if (Math.abs(sin) < 1e-12) sin = 0;
        if (cx !== 0 || cy !== 0) {
          const e = cx - cx * cos + cy * sin;
          const f = cy - cx * sin - cy * cos;
          stepMatrix = [cos, sin, -sin, cos, e, f];
        } else {
          stepMatrix = [cos, sin, -sin, cos, 0, 0];
        }
      } else if (match.name === 'skewx') {
        const deg = args[0] || 0;
        const rad = deg * Math.PI / 180;
        stepMatrix = [1, 0, Math.tan(rad), 1, 0, 0];
      } else if (match.name === 'skewy') {
        const deg = args[0] || 0;
        const rad = deg * Math.PI / 180;
        stepMatrix = [1, Math.tan(rad), 0, 1, 0, 0];
      }

      curr = VectorGenerator.multiplyMatrices(curr, stepMatrix);
    }

    const [a, b, c, d, e, f] = curr;
    const det = a * d - b * c;
    const scaleX = Math.round(Math.hypot(a, b) * 1000) / 1000;
    const scaleY = scaleX !== 0 ? Math.round((det / scaleX) * 1000) / 1000 : Math.round(Math.hypot(c, d) * 1000) / 1000;
    const rad = (scaleX !== 0 && scaleY !== 0) ? Math.atan2(b / scaleY, a / scaleX) : Math.atan2(b, a);
    let deg = Math.round((rad * 180 / Math.PI) * 1000) / 1000;
    if (Object.is(deg, -0) || Math.abs(deg) < 1e-4) deg = 0;
    const hasSkew = Math.abs(a * c + b * d) > 1e-4;

    return {
      type: 'matrix',
      a: Math.round(a * 1000) / 1000,
      b: Math.round(b * 1000) / 1000,
      c: Math.round(c * 1000) / 1000,
      d: Math.round(d * 1000) / 1000,
      e: Math.round(e * 1000) / 1000,
      f: Math.round(f * 1000) / 1000,
      matrix: curr,
      translationX: Math.round(e * 1000) / 1000,
      translationY: Math.round(f * 1000) / 1000,
      scaleX,
      scaleY,
      rotate: deg,
      rotation: deg,
      pivotX: 0,
      pivotY: 0,
      hasTranslation: Math.abs(e) > 0.0001 || Math.abs(f) > 0.0001,
      hasScale: Math.abs(scaleX - 1) > 0.0001 || Math.abs(scaleY - 1) > 0.0001,
      hasRotate: Math.abs(deg) > 0.0001,
      hasSkew
    };
  }
}

module.exports = {
  VectorGenerator,
  sanitizeSvg: VectorGenerator.sanitizeSvg,
  escapeXml: VectorGenerator.escapeXml,
  getSafeVectorDimensions: VectorGenerator.getSafeVectorDimensions,
  tokenizePath: VectorGenerator.tokenizePath,
  pathToComposeDsl: VectorGenerator.pathToComposeDsl,
  generateImageVectorFile: VectorGenerator.generateImageVectorFile,
  generateVectorDrawableXml: VectorGenerator.generateVectorDrawableXml,
  parseTransform: VectorGenerator.parseTransform,
  decomposeMatrix: VectorGenerator.decomposeMatrix,
  bakeMatrixToPath: VectorGenerator.bakeMatrixToPath,
  arcToCubic: VectorGenerator.arcToCubic,
  multiplyMatrices: VectorGenerator.multiplyMatrices,
  transformPoint: VectorGenerator.transformPoint,
  transformDelta: VectorGenerator.transformDelta,
  isIdentityMatrix: VectorGenerator.isIdentityMatrix,
  formatMatrixString: VectorGenerator.formatMatrixString,
  sanitizeGroupName: VectorGenerator.sanitizeGroupName,
  parseTransformToMatrix: VectorGenerator.parseTransformToMatrix,
  toPascalCase: VectorGenerator.toPascalCase,
  normalizeIconName: VectorGenerator.normalizeIconName,
  computeVectorFingerprint: VectorGenerator.computeVectorFingerprint,
  analyzeVectorColors: VectorGenerator.analyzeVectorColors
};
