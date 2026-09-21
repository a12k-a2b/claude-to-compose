/**
 * extractor/svg_parser.js
 * Comprehensive SVG extraction, geometry normalization, and vector asset bundler.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

class SvgParser {
  /**
   * Normalizes an SVG <rect> into path data `d` string with half-dimension clamping.
   * @param {Object} attrs
   * @returns {string}
   */
  static normalizeRect(attrs) {
    const x = parseFloat(attrs.x || 0) || 0;
    const y = parseFloat(attrs.y || 0) || 0;
    const w = parseFloat(attrs.width || 0);
    const h = parseFloat(attrs.height || 0);
    if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return '';

    let rx = parseFloat(attrs.rx);
    let ry = parseFloat(attrs.ry);
    const hasRx = Number.isFinite(rx);
    const hasRy = Number.isFinite(ry);

    if (!hasRx && !hasRy) {
      rx = 0;
      ry = 0;
    } else if (hasRx && !hasRy) {
      ry = rx;
    } else if (!hasRx && hasRy) {
      rx = ry;
    }

    rx = Math.max(0, rx);
    ry = Math.max(0, ry);
    rx = Math.min(rx, w / 2);
    ry = Math.min(ry, h / 2);

    if (rx === 0 || ry === 0) {
      return `M ${x},${y} h ${w} v ${h} h -${w} Z`;
    }

    const segW = w - 2 * rx;
    const segH = h - 2 * ry;
    const negSegW = -segW || 0;
    const negSegH = -segH || 0;

    return `M ${x + rx},${y} h ${segW} a ${rx},${ry} 0 0 1 ${rx},${ry} v ${segH} a ${rx},${ry} 0 0 1 -${rx},${ry} h ${negSegW} a ${rx},${ry} 0 0 1 -${rx},-${ry} v ${negSegH} a ${rx},${ry} 0 0 1 ${rx},-${ry} Z`;
  }

  /**
   * Normalizes an SVG <circle> into standard 2-arc path data string.
   * @param {Object} attrs
   * @returns {string}
   */
  static normalizeCircle(attrs) {
    const cx = parseFloat(attrs.cx || 0) || 0;
    const cy = parseFloat(attrs.cy || 0) || 0;
    const r = parseFloat(attrs.r || 0);
    if (!Number.isFinite(r) || r <= 0) return '';
    return `M ${cx - r},${cy} a ${r},${r} 0 1,0 ${r * 2},0 a ${r},${r} 0 1,0 -${r * 2},0 Z`;
  }

  /**
   * Normalizes an SVG <ellipse> into standard 2-arc path data string.
   * @param {Object} attrs
   * @returns {string}
   */
  static normalizeEllipse(attrs) {
    const cx = parseFloat(attrs.cx || 0) || 0;
    const cy = parseFloat(attrs.cy || 0) || 0;
    const rx = parseFloat(attrs.rx || 0);
    const ry = parseFloat(attrs.ry || 0);
    if (!Number.isFinite(rx) || !Number.isFinite(ry) || rx <= 0 || ry <= 0) return '';
    return `M ${cx - rx},${cy} a ${rx},${ry} 0 1,0 ${rx * 2},0 a ${rx},${ry} 0 1,0 -${rx * 2},0 Z`;
  }

  /**
   * Normalizes an SVG <line> into path data string.
   * @param {Object} attrs
   * @returns {string}
   */
  static normalizeLine(attrs) {
    const x1 = parseFloat(attrs.x1 || 0) || 0;
    const y1 = parseFloat(attrs.y1 || 0) || 0;
    const x2 = parseFloat(attrs.x2 || 0) || 0;
    const y2 = parseFloat(attrs.y2 || 0) || 0;
    return `M ${x1},${y1} L ${x2},${y2}`;
  }

  /**
   * Normalizes SVG <polygon> and <polyline> into path data string.
   * Handles glued negative numbers, whitespace, and discards odd trailing coordinates.
   * @param {Object} attrs
   * @param {boolean} [isPolygon=false]
   * @returns {string}
   */
  static normalizePolygonPolyline(attrs, isPolygon = false) {
    const raw = attrs.points || '';
    const matches = raw.match(/[+-]?(?:\d*\.\d+|\d+)(?:[eE][+-]?\d+)?/g);
    const pts = matches ? matches.map(Number).filter(Number.isFinite) : [];
    const pairCount = Math.floor(pts.length / 2);
    if (pairCount < 1) return '';

    let d = `M ${pts[0]},${pts[1]}`;
    for (let i = 1; i < pairCount; i++) {
      d += ` L ${pts[i * 2]},${pts[i * 2 + 1]}`;
    }
    if (isPolygon) d += ' Z';
    return d;
  }

  /**
   * Parses an inline or external SVG string into structured vector data.
   * Uses hierarchical tag-stack parsing to inherit cumulative affine transformations across nested <g> groups.
   * @param {string} rawSvgText - Raw SVG XML text
   * @param {Object} [computedContext={}] - Fallback colors, dimensions, or baking options
   * @returns {Object} Standardized vector data
   */
  static parseSvgString(rawSvgText, computedContext = {}) {
    if (!rawSvgText || typeof rawSvgText !== 'string') return null;

    const viewBoxMatch = rawSvgText.match(/viewBox=["']([^"']+)["']/i);
    const widthMatch = rawSvgText.match(/\bwidth=["']([^"']+)["']/i);
    const heightMatch = rawSvgText.match(/\bheight=["']([^"']+)["']/i);

    let viewBox = viewBoxMatch ? viewBoxMatch[1].trim() : null;
    const parsedWidth = widthMatch ? parseFloat(widthMatch[1]) : NaN;
    const parsedHeight = heightMatch ? parseFloat(heightMatch[1]) : NaN;
    let width = Number.isFinite(parsedWidth) ? parsedWidth : (computedContext.width || undefined);
    let height = Number.isFinite(parsedHeight) ? parsedHeight : (computedContext.height || undefined);

    if (viewBox && (!width || !height)) {
      const vbParts = viewBox.split(/[\s,]+/).map(Number);
      if (vbParts.length === 4 && Number.isFinite(vbParts[2]) && Number.isFinite(vbParts[3])) {
        if (!width) width = vbParts[2];
        if (!height) height = vbParts[3];
      }
    }
    if (!width) width = 24;
    if (!height) height = 24;

    if (!viewBox) {
      viewBox = `0 0 ${width} ${height}`;
    }

    const paths = [];

    // Strip comments
    const sanitized = rawSvgText.replace(/<!--[\s\S]*?-->/g, '');

    function parseAttributes(attrStr) {
      const attrs = {};
      if (!attrStr) return attrs;
      const attrRegex = /([a-zA-Z0-9:_-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
      let m;
      while ((m = attrRegex.exec(attrStr)) !== null) {
        const name = m[1].toLowerCase();
        const val = m[2] !== undefined ? m[2] : (m[3] !== undefined ? m[3] : (m[4] !== undefined ? m[4] : ''));
        attrs[name] = val;
      }
      return attrs;
    }

    const tagRegex = /<(\/)?([a-zA-Z0-9:_-]+)((?:\s+[^'">=/\s]+(?:=(?:"[^"]*"|'[^']*'|[^'"\s>]+))?)*)\s*(\/)?>/g;

    const rootGroup = {
      type: 'group',
      name: 'root',
      children: [],
      paths: [],
      groups: []
    };
    rootGroup.elements = rootGroup.children;

    const stack = [{
      matrix: [1, 0, 0, 1, 0, 0],
      fillRule: undefined,
      fill: undefined,
      stroke: undefined,
      strokeWidth: undefined,
      strokeLinecap: undefined,
      strokeLinejoin: undefined,
      isPruned: false,
      groupNode: rootGroup
    }];

    let tagMatch;
    while ((tagMatch = tagRegex.exec(sanitized)) !== null) {
      const isClosing = Boolean(tagMatch[1]);
      const tagName = tagMatch[2].toLowerCase();
      const attrStr = tagMatch[3];
      const isSelfClosing = Boolean(tagMatch[4]);

      if (isClosing) {
        if (tagName === 'g' || tagName === 'defs' || tagName === 'clippath' || tagName === 'mask') {
          if (stack.length > 1) {
            stack.pop();
          }
        }
        continue;
      }

      const attrs = parseAttributes(attrStr);
      const parentCtx = stack[stack.length - 1];

      if (tagName === 'defs' || tagName === 'clippath' || tagName === 'mask') {
        if (!isSelfClosing) {
          stack.push({
            ...parentCtx,
            isPruned: true,
            groupNode: { type: 'group', children: [], paths: [], groups: [], elements: [] }
          });
        }
        continue;
      }

      if (parentCtx.isPruned) {
        if (tagName === 'g' && !isSelfClosing) {
          stack.push({ ...parentCtx });
        }
        continue;
      }

      if (tagName === 'g') {
        const localMatrix = attrs.transform ? SvgParser.parseTransformToMatrix(attrs.transform) : [1, 0, 0, 1, 0, 0];
        const cumMatrix = SvgParser.multiplyMatrices(parentCtx.matrix, localMatrix);

        const fillRule = SvgParser.extractFillRule(attrs, parentCtx.fillRule);

        let fill = attrs.fill !== undefined ? attrs.fill : SvgParser.extractStyleProp(attrs.style, 'fill');
        if (fill === undefined) fill = parentCtx.fill;

        let stroke = attrs.stroke !== undefined ? attrs.stroke : SvgParser.extractStyleProp(attrs.style, 'stroke');
        if (stroke === undefined) stroke = parentCtx.stroke;

        let rawStrokeWidth = attrs['stroke-width'] !== undefined ? attrs['stroke-width'] : SvgParser.extractStyleProp(attrs.style, 'stroke-width');
        let strokeWidth = rawStrokeWidth !== undefined ? parseFloat(rawStrokeWidth) : parentCtx.strokeWidth;

        let strokeLinecap = attrs['stroke-linecap'] !== undefined ? attrs['stroke-linecap'] : SvgParser.extractStyleProp(attrs.style, 'stroke-linecap');
        if (strokeLinecap === undefined) strokeLinecap = parentCtx.strokeLinecap;

        let strokeLinejoin = attrs['stroke-linejoin'] !== undefined ? attrs['stroke-linejoin'] : SvgParser.extractStyleProp(attrs.style, 'stroke-linejoin');
        if (strokeLinejoin === undefined) strokeLinejoin = parentCtx.strokeLinejoin;

        const decomp = attrs.transform ? SvgParser.parseTransform(attrs.transform) : null;
        const groupNode = {
          type: 'group',
          name: attrs.id || attrs.name || undefined,
          transform: attrs.transform ? attrs.transform.trim() : undefined,
          transformMatrix: localMatrix,
          translationX: decomp ? (decomp.translationX || 0) : 0,
          translationY: decomp ? (decomp.translationY || 0) : 0,
          scaleX: decomp ? (decomp.scaleX !== undefined ? decomp.scaleX : 1) : 1,
          scaleY: decomp ? (decomp.scaleY !== undefined ? decomp.scaleY : 1) : 1,
          rotate: decomp ? (decomp.rotate || 0) : 0,
          rotation: decomp ? (decomp.rotate || 0) : 0,
          pivotX: decomp ? (decomp.pivotX || 0) : 0,
          pivotY: decomp ? (decomp.pivotY || 0) : 0,
          hasSkew: decomp ? Boolean(decomp.hasSkew) : false,
          fillRule,
          children: [],
          paths: [],
          groups: []
        };
        groupNode.elements = groupNode.children;

        parentCtx.groupNode.children.push(groupNode);
        parentCtx.groupNode.groups.push(groupNode);

        if (!isSelfClosing) {
          stack.push({
            matrix: cumMatrix,
            fillRule,
            fill,
            stroke,
            strokeWidth,
            strokeLinecap,
            strokeLinejoin,
            isPruned: false,
            groupNode
          });
        }
        continue;
      }

      if (tagName === 'svg') {
        const rootFillRule = SvgParser.extractFillRule(attrs, computedContext.fillRule ? computedContext.fillRule.toLowerCase() : undefined);
        if (rootFillRule) stack[0].fillRule = rootFillRule;
        if (attrs.fill !== undefined) stack[0].fill = attrs.fill;
        if (attrs.stroke !== undefined) stack[0].stroke = attrs.stroke;
        if (attrs['stroke-width'] !== undefined) stack[0].strokeWidth = parseFloat(attrs['stroke-width']);
        if (attrs['stroke-linecap'] !== undefined) stack[0].strokeLinecap = attrs['stroke-linecap'];
        if (attrs['stroke-linejoin'] !== undefined) stack[0].strokeLinejoin = attrs['stroke-linejoin'];
        continue;
      }

      let d = '';
      let isKnownShape = false;

      if (tagName === 'path') {
        d = (attrs.d || '').trim();
        isKnownShape = true;
      } else if (tagName === 'circle') {
        d = SvgParser.normalizeCircle(attrs);
        isKnownShape = true;
      } else if (tagName === 'ellipse') {
        d = SvgParser.normalizeEllipse(attrs);
        isKnownShape = true;
      } else if (tagName === 'rect') {
        d = SvgParser.normalizeRect(attrs);
        isKnownShape = true;
      } else if (tagName === 'line') {
        d = SvgParser.normalizeLine(attrs);
        isKnownShape = true;
      } else if (tagName === 'polygon') {
        d = SvgParser.normalizePolygonPolyline(attrs, true);
        isKnownShape = true;
      } else if (tagName === 'polyline') {
        d = SvgParser.normalizePolygonPolyline(attrs, false);
        isKnownShape = true;
      }

      if (isKnownShape && d) {
        const localMatrix = attrs.transform ? SvgParser.parseTransformToMatrix(attrs.transform) : [1, 0, 0, 1, 0, 0];
        const cumMatrix = SvgParser.multiplyMatrices(parentCtx.matrix, localMatrix);
        const isIdentity = SvgParser.isIdentityMatrix(cumMatrix);

        let transformStr;
        if (isIdentity) {
          transformStr = undefined;
        } else if (SvgParser.isIdentityMatrix(parentCtx.matrix) && attrs.transform) {
          transformStr = attrs.transform.trim();
        } else {
          transformStr = SvgParser.formatMatrixString(cumMatrix);
        }
        const transformMat = isIdentity ? undefined : cumMatrix;

        let fill = attrs.fill !== undefined ? attrs.fill : SvgParser.extractStyleProp(attrs.style, 'fill');
        if (fill === undefined) fill = parentCtx.fill;

        let stroke = attrs.stroke !== undefined ? attrs.stroke : SvgParser.extractStyleProp(attrs.style, 'stroke');
        if (stroke === undefined) stroke = parentCtx.stroke;

        const rawFill = attrs.fill;
        const rawStroke = attrs.stroke;
        const styleFill = SvgParser.extractStyleProp(attrs.style, 'fill');
        const styleStroke = SvgParser.extractStyleProp(attrs.style, 'stroke');
        const isFillCurrentColor = rawFill === 'currentColor' || styleFill === 'currentColor' || fill === 'currentColor';
        const isStrokeCurrentColor = rawStroke === 'currentColor' || styleStroke === 'currentColor' || stroke === 'currentColor';
        const isCurrentColor = isFillCurrentColor || isStrokeCurrentColor;

        if (isFillCurrentColor) fill = computedContext.color || '#000000';
        if (isStrokeCurrentColor) stroke = computedContext.color || '#000000';

        const rawStrokeWidth = attrs['stroke-width'] !== undefined ? attrs['stroke-width'] : SvgParser.extractStyleProp(attrs.style, 'stroke-width');
        const parsedStrokeWidth = rawStrokeWidth !== undefined ? parseFloat(rawStrokeWidth) : parentCtx.strokeWidth;
        let strokeWidth = Number.isFinite(parsedStrokeWidth) ? parsedStrokeWidth : undefined;
        if (stroke && stroke !== 'none' && strokeWidth === undefined && tagName !== 'path') {
          strokeWidth = 1;
        }

        const linecap = attrs['stroke-linecap'] !== undefined ? attrs['stroke-linecap'] : (SvgParser.extractStyleProp(attrs.style, 'stroke-linecap') || parentCtx.strokeLinecap);
        const linejoin = attrs['stroke-linejoin'] !== undefined ? attrs['stroke-linejoin'] : (SvgParser.extractStyleProp(attrs.style, 'stroke-linejoin') || parentCtx.strokeLinejoin);
        const fillRule = SvgParser.extractFillRule(attrs, parentCtx.fillRule);

        const flatPathObj = {
          d,
          fill: fill && fill !== 'none' ? fill : undefined,
          stroke: stroke && stroke !== 'none' ? stroke : undefined,
          strokeWidth,
          strokeLinecap: linecap ? linecap.toLowerCase() : undefined,
          strokeLinejoin: linejoin ? linejoin.toLowerCase() : undefined,
          transform: transformStr,
          transformMatrix: transformMat,
          fillRule,
          isCurrentColor: isCurrentColor || undefined,
          currentColorType: isFillCurrentColor && isStrokeCurrentColor ? 'both' : (isFillCurrentColor ? 'fill' : (isStrokeCurrentColor ? 'stroke' : undefined))
        };
        paths.push(flatPathObj);

        const isLocalIdentity = SvgParser.isIdentityMatrix(localMatrix);
        const childPathNode = {
          type: 'path',
          id: attrs.id || undefined,
          d,
          fill: fill && fill !== 'none' ? fill : undefined,
          stroke: stroke && stroke !== 'none' ? stroke : undefined,
          strokeWidth,
          strokeLinecap: linecap ? linecap.toLowerCase() : undefined,
          strokeLinejoin: linejoin ? linejoin.toLowerCase() : undefined,
          transform: isLocalIdentity ? undefined : (attrs.transform ? attrs.transform.trim() : SvgParser.formatMatrixString(localMatrix)),
          transformMatrix: isLocalIdentity ? undefined : localMatrix,
          fillRule,
          isCurrentColor: isCurrentColor || undefined,
          currentColorType: isFillCurrentColor && isStrokeCurrentColor ? 'both' : (isFillCurrentColor ? 'fill' : (isStrokeCurrentColor ? 'stroke' : undefined))
        };
        parentCtx.groupNode.children.push(childPathNode);
        parentCtx.groupNode.paths.push(childPathNode);
      }
    }

    const hasCurrentColor = paths.some(p => p.isCurrentColor);
    const colorAnalysis = SvgParser.analyzeVectorColors({ rawSvg: rawSvgText, paths, hasCurrentColor, contextualColor: computedContext.color || '#1A1A1A' });
    const semanticName = SvgParser.extractSemanticName(rawSvgText, { fallback: computedContext.nameHint || 'icon' });

    const result = {
      name: semanticName,
      rawSvg: rawSvgText,
      viewBox,
      width,
      height,
      paths,
      groups: rootGroup.groups,
      children: rootGroup.children,
      elements: rootGroup.children,
      hasCurrentColor,
      isCurrentColor: hasCurrentColor,
      contextualColor: computedContext.color || '#1A1A1A',
      isMultiColor: colorAnalysis.isMultiColor,
      isMonochrome: colorAnalysis.isMonochrome
    };

    if (computedContext.bakeTransforms || computedContext.flat) {
      SvgParser.bakeVectorTransforms(result);
    }

    return result;
  }

  /**
   * Extracts external SVG from data URI or URL
   */
  static async resolveExternalSvg(src, frame) {
    if (!src) return null;

    if (src.startsWith('data:image/svg+xml;base64,')) {
      const base64Data = src.split(',')[1];
      return Buffer.from(base64Data, 'base64').toString('utf8');
    }

    if (src.startsWith('data:image/svg+xml;utf8,') || src.startsWith('data:image/svg+xml,')) {
      const rawData = src.substring(src.indexOf(',') + 1);
      return decodeURIComponent(rawData);
    }

    if (frame && (src.startsWith('http://') || src.startsWith('https://') || src.endsWith('.svg'))) {
      try {
        return await frame.evaluate(async (url) => {
          const res = await fetch(url);
          return await res.text();
        }, src);
      } catch (_) {
        return null;
      }
    }

    return null;
  }

  /**
   * Bundles an extracted SVG into the project assets directory.
   */
  static saveVectorAsset(rawSvg, outputDir, suggestedName = 'vector') {
    const vectorsDir = path.join(outputDir, 'assets', 'vectors');
    fs.mkdirSync(vectorsDir, { recursive: true });

    const hash = crypto.createHash('md5').update(rawSvg).digest('hex').slice(0, 8);
    const sanitizedName = suggestedName.toLowerCase().replace(/[^a-z0-9_-]/g, '_');
    const filename = `${sanitizedName}_${hash}.svg`;
    const fullPath = path.join(vectorsDir, filename);

    fs.writeFileSync(fullPath, rawSvg, 'utf8');
    return `assets/vectors/${filename}`;
  }

  /**
   * In-frame extraction of all SVGs in the target page/frame
   */
  static async extractSVGs(frame, options = {}) {
    const outputDir = options.outputDir || path.resolve('./output');
    const vectorsDir = path.join(outputDir, 'assets', 'vectors');
    fs.mkdirSync(vectorsDir, { recursive: true });

    // In-page SVG harvest
    const inPageSvgList = await frame.evaluate(() => {
      const results = [];
      const svgEls = document.querySelectorAll('svg');

      svgEls.forEach((svgEl, idx) => {
        const rect = svgEl.getBoundingClientRect();
        const style = window.getComputedStyle(svgEl);

        let viewBox = svgEl.getAttribute('viewBox');
        const w = parseFloat(svgEl.getAttribute('width')) || rect.width || 24;
        const h = parseFloat(svgEl.getAttribute('height')) || rect.height || 24;

        if (!viewBox) {
          try {
            const bb = svgEl.getBBox();
            viewBox = `${Math.round(bb.x)} ${Math.round(bb.y)} ${Math.round(bb.width || w)} ${Math.round(bb.height || h)}`;
          } catch (_) {
            viewBox = `0 0 ${Math.round(w)} ${Math.round(h)}`;
          }
        }

        // Helper: Affine matrix math for browser context
        function multiplyAffineMatrices(m1, m2) {
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

        function isIdentityMatrix(m, eps = 1e-5) {
          if (!m || !Array.isArray(m) || m.length < 6) return true;
          return Math.abs(m[0] - 1) < eps &&
                 Math.abs(m[1]) < eps &&
                 Math.abs(m[2]) < eps &&
                 Math.abs(m[3] - 1) < eps &&
                 Math.abs(m[4]) < eps &&
                 Math.abs(m[5]) < eps;
        }

        function formatMatrixString(m) {
          const clean = (v) => {
            const r = Math.round(v * 10000) / 10000;
            return Object.is(r, -0) || Math.abs(r) < 1e-6 ? 0 : r;
          };
          return `matrix(${clean(m[0])} ${clean(m[1])} ${clean(m[2])} ${clean(m[3])} ${clean(m[4])} ${clean(m[5])})`;
        }

        function parseTransformToMatrix(str) {
          if (!str || typeof str !== 'string') return [1, 0, 0, 1, 0, 0];
          const fnRegex = /([a-zA-Z]+)\s*\(([^)]*)\)/g;
          let curr = [1, 0, 0, 1, 0, 0];
          let m;
          while ((m = fnRegex.exec(str)) !== null) {
            const name = m[1].toLowerCase();
            const parts = m[2].trim().split(/[\s,]+/).filter(Boolean);
            const args = parts.map(p => {
              const isRad = /rad$/i.test(p);
              const num = parseFloat(p.replace(/(px|deg|rad)$/i, ''));
              return isRad ? (num * 180 / Math.PI) : num;
            }).filter(Number.isFinite);

            let step = [1, 0, 0, 1, 0, 0];
            if (name === 'matrix' && args.length >= 6) {
              step = [args[0], args[1], args[2], args[3], args[4], args[5]];
            } else if (name === 'translate') {
              step = [1, 0, 0, 1, args[0] || 0, args[1] !== undefined ? args[1] : 0];
            } else if (name === 'scale') {
              const sx = args[0] !== undefined ? args[0] : 1;
              const sy = args[1] !== undefined ? args[1] : sx;
              step = [sx, 0, 0, sy, 0, 0];
            } else if (name === 'rotate') {
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
              step = [cos, sin, -sin, cos, e, f];
            } else if (name === 'skewx') {
              const deg = args[0] || 0;
              step = [1, 0, Math.tan(deg * Math.PI / 180), 1, 0, 0];
            } else if (name === 'skewy') {
              const deg = args[0] || 0;
              step = [1, Math.tan(deg * Math.PI / 180), 0, 1, 0, 0];
            }
            curr = multiplyAffineMatrices(curr, step);
          }
          return curr;
        }

        function extractSemanticIconName(el, fallbackCounter = 1) {
          if (!el) return `icon_${fallbackCounter}`;
          const getAttr = (name) => {
            if (typeof el.getAttribute === 'function') return el.getAttribute(name);
            if (el.attributes && el.attributes[name] !== undefined) return el.attributes[name];
            return el[name];
          };

          const dataIcon = getAttr('data-icon') || getAttr('data-lucide') || getAttr('data-feather') || getAttr('data-name');
          if (dataIcon && typeof dataIcon === 'string' && dataIcon.trim()) return dataIcon.trim();

          const testId = getAttr('data-testid') || getAttr('data-component');
          if (testId && typeof testId === 'string' && testId.trim()) {
            const cleaned = testId.trim().replace(/^(?:icon|btn|button)[-_]+/i, '').replace(/[-_]+(?:icon|btn|button)$/i, '');
            if (cleaned) return cleaned;
          }

          const rawClass = getAttr('class') || el.className || '';
          const classStr = typeof rawClass === 'string' ? rawClass : (rawClass && rawClass.baseVal ? rawClass.baseVal : '');
          if (classStr) {
            const lucideMatch = classStr.match(/\blucide-([a-z0-9-]+)\b/i);
            if (lucideMatch && lucideMatch[1]) return lucideMatch[1];
            const featherMatch = classStr.match(/\bfeather-([a-z0-9-]+)\b/i);
            if (featherMatch && featherMatch[1]) return featherMatch[1];
            const tablerMatch = classStr.match(/\btabler-icon-([a-z0-9-]+)\b/i);
            if (tablerMatch && tablerMatch[1]) return tablerMatch[1];
            const heroMatch = classStr.match(/\bheroicon-(?:outline-|solid-|mini-)?([a-z0-9-]+)\b/i);
            if (heroMatch && heroMatch[1]) return heroMatch[1];
            const faMatch = classStr.match(/\bfa[srlbd]?-([a-z0-9-]+)\b/i);
            if (faMatch && faMatch[1] && !/^(?:solid|regular|brands|light|fw|lg|\d+x)$/i.test(faMatch[1])) {
              return faMatch[1];
            }
            const riMatch = classStr.match(/\bri-([a-z0-9-]+?)(?:-line|-fill)?\b/i);
            if (riMatch && riMatch[1]) return riMatch[1];
            const iconPrefixMatch = classStr.match(/\bicon[-_]([a-z0-9_-]+)\b/i);
            if (iconPrefixMatch && iconPrefixMatch[1]) return iconPrefixMatch[1];
            const iconSuffixMatch = classStr.match(/\b([a-z0-9_-]+)[-_]icon\b/i);
            if (iconSuffixMatch && iconSuffixMatch[1] && !/^(?:svg|app)$/i.test(iconSuffixMatch[1])) {
              return iconSuffixMatch[1];
            }
          }

          try {
            if (typeof el.querySelector === 'function') {
              const titleEl = el.querySelector('title');
              if (titleEl && titleEl.textContent && titleEl.textContent.trim()) return titleEl.textContent.trim();
              const descEl = el.querySelector('desc');
              if (descEl && descEl.textContent && descEl.textContent.trim()) return descEl.textContent.trim();
            }
          } catch (_) {}

          const ariaLabel = getAttr('aria-label') || getAttr('aria-roledescription');
          if (ariaLabel && typeof ariaLabel === 'string' && ariaLabel.trim()) return ariaLabel.trim();

          try {
            const btn = (typeof el.closest === 'function') ? el.closest('button, a, [role="button"]') : (el.parentElement && (el.parentElement.tagName === 'BUTTON' || el.parentElement.tagName === 'A' || el.parentElement.tag === 'button') ? el.parentElement : null);
            if (btn) {
              const btnGetAttr = (n) => (typeof btn.getAttribute === 'function' ? btn.getAttribute(n) : (btn.attributes && btn.attributes[n] !== undefined ? btn.attributes[n] : btn[n]));
              const btnAria = btnGetAttr('aria-label') || btnGetAttr('title');
              if (btnAria && typeof btnAria === 'string' && btnAria.trim()) return btnAria.trim();

              const btnTestId = btnGetAttr('data-testid');
              if (btnTestId && typeof btnTestId === 'string' && btnTestId.trim()) {
                const cleaned = btnTestId.trim().replace(/^(?:btn|button)[-_]+/i, '').replace(/[-_]+(?:btn|button)$/i, '');
                if (cleaned) return cleaned;
              }

              let btnText = '';
              if (btn.childNodes) {
                for (const cn of btn.childNodes) {
                  if (cn.nodeType === 3 || cn.nodeType === (typeof Node !== 'undefined' ? Node.TEXT_NODE : 3)) {
                    const t = (cn.textContent || '').trim();
                    if (t) btnText += (btnText ? ' ' : '') + t;
                  }
                }
              } else if (btn.textContent) {
                btnText = btn.textContent.trim();
              }
              if (btnText && btnText.length <= 30 && !/^\d+$/.test(btnText)) {
                return btnText;
              }

              const btnClass = btnGetAttr('class') || btn.className || '';
              if (typeof btnClass === 'string') {
                const btnClassMatch = btnClass.match(/\bbtn-([a-z0-9_-]+)\b/i);
                if (btnClassMatch && btnClassMatch[1] && !/^(?:icon|primary|secondary|default|outline|danger|sm|md|lg|xs)$/i.test(btnClassMatch[1])) {
                  return btnClassMatch[1];
                }
              }
            }
          } catch (_) {}

          if (el.parentElement) {
            const parentGetAttr = (n) => (typeof el.parentElement.getAttribute === 'function' ? el.parentElement.getAttribute(n) : (el.parentElement.attributes && el.parentElement.attributes[n] !== undefined ? el.parentElement.attributes[n] : el.parentElement[n]));
            const parentClass = parentGetAttr('class') || el.parentElement.className || '';
            if (typeof parentClass === 'string') {
              const wrapperMatch = parentClass.match(/\b([a-z0-9_-]+)-(?:wrapper|box|container)\b/i);
              if (wrapperMatch && wrapperMatch[1] && !/^(?:icon|svg|metric|btn|button)$/i.test(wrapperMatch[1])) {
                return wrapperMatch[1];
              }
              const brandMatch = parentClass.match(/\b(brand-logo|app-logo|company-logo)\b/i);
              if (brandMatch) return brandMatch[1];
            }
          }

          const elId = getAttr('id');
          if (elId && typeof elId === 'string' && elId.trim() && !/^(?:layer|svg|vector|icon|clip|path|shape|g)[-_]?[0-9]*$/i.test(elId.trim()) && !/^[0-9a-f]{8}-[0-9a-f]{4}/i.test(elId.trim())) {
            return elId.trim();
          }

          return `icon_${fallbackCounter}`;
        }

        // Traverse child shapes
        const paths = [];
        function parseNode(node, inherited = {}) {
          if (!node || node.nodeType !== Node.ELEMENT_NODE) return;
          const nodeTag = node.tagName.toLowerCase();
          const nodeStyle = window.getComputedStyle(node);

          let fill = nodeStyle.fill !== 'none' ? nodeStyle.fill : undefined;
          let stroke = nodeStyle.stroke !== 'none' ? nodeStyle.stroke : undefined;
          const strokeWidth = nodeStyle.strokeWidth && nodeStyle.strokeWidth !== '0px' ? parseFloat(nodeStyle.strokeWidth) : undefined;

          const rawFillAttr = node.getAttribute('fill');
          const rawStrokeAttr = node.getAttribute('stroke');
          const isFillCurrentColor = rawFillAttr === 'currentColor' || nodeStyle.fill === 'currentColor';
          const isStrokeCurrentColor = rawStrokeAttr === 'currentColor' || nodeStyle.stroke === 'currentColor';
          const isCurrentColor = isFillCurrentColor || isStrokeCurrentColor;

          if (isFillCurrentColor) {
            fill = nodeStyle.color || style.color;
          }
          if (isStrokeCurrentColor) {
            stroke = nodeStyle.color || style.color;
          }

          const parentMatrix = inherited.transformMatrix || [1, 0, 0, 1, 0, 0];
          const rawTransform = node.getAttribute('transform');
          let currentMatrix = parentMatrix;

          if (rawTransform && rawTransform.trim()) {
            const parsed = parseTransformToMatrix(rawTransform);
            if (parsed) {
              currentMatrix = multiplyAffineMatrices(parentMatrix, parsed);
            }
          }

          const isIdentity = isIdentityMatrix(currentMatrix);
          let transform;
          if (isIdentity) {
            transform = undefined;
          } else if (isIdentityMatrix(parentMatrix) && rawTransform) {
            transform = rawTransform.trim();
          } else {
            transform = formatMatrixString(currentMatrix);
          }

          const rawFillRule = node.getAttribute('fill-rule') || node.getAttribute('clip-rule') || nodeStyle.fillRule;
          const fillRule = (rawFillRule && rawFillRule !== 'none') ? rawFillRule : inherited.fillRule;

          const nextInherited = { transformMatrix: currentMatrix, fillRule };

          let d = '';
          if (nodeTag === 'path') {
            d = node.getAttribute('d') || '';
          } else if (nodeTag === 'circle') {
            const cx = parseFloat(node.getAttribute('cx')) || 0;
            const cy = parseFloat(node.getAttribute('cy')) || 0;
            const r = parseFloat(node.getAttribute('r')) || 0;
            if (r > 0) {
              d = `M ${cx - r},${cy} a ${r},${r} 0 1,0 ${r * 2},0 a ${r},${r} 0 1,0 -${r * 2},0 Z`;
            }
          } else if (nodeTag === 'ellipse') {
            const cx = parseFloat(node.getAttribute('cx')) || 0;
            const cy = parseFloat(node.getAttribute('cy')) || 0;
            const rx = parseFloat(node.getAttribute('rx')) || 0;
            const ry = parseFloat(node.getAttribute('ry')) || 0;
            if (rx > 0 && ry > 0) {
              d = `M ${cx - rx},${cy} a ${rx},${ry} 0 1,0 ${rx * 2},0 a ${rx},${ry} 0 1,0 -${rx * 2},0 Z`;
            }
          } else if (nodeTag === 'line') {
            const x1 = parseFloat(node.getAttribute('x1')) || 0;
            const y1 = parseFloat(node.getAttribute('y1')) || 0;
            const x2 = parseFloat(node.getAttribute('x2')) || 0;
            const y2 = parseFloat(node.getAttribute('y2')) || 0;
            d = `M ${x1},${y1} L ${x2},${y2}`;
          } else if (nodeTag === 'polygon' || nodeTag === 'polyline') {
            const rawPts = node.getAttribute('points') || '';
            const matches = rawPts.match(/[+-]?(?:\d*\.\d+|\d+)(?:[eE][+-]?\d+)?/g);
            const pts = matches ? matches.map(Number).filter(Number.isFinite) : [];
            const pairCount = Math.floor(pts.length / 2);
            if (pairCount >= 1) {
              d = `M ${pts[0]},${pts[1]}`;
              for (let i = 1; i < pairCount; i++) d += ` L ${pts[i * 2]},${pts[i * 2 + 1]}`;
              if (nodeTag === 'polygon') d += ' Z';
            }
          } else if (nodeTag === 'rect') {
            const x = parseFloat(node.getAttribute('x')) || 0;
            const y = parseFloat(node.getAttribute('y')) || 0;
            const rw = parseFloat(node.getAttribute('width')) || 0;
            const rh = parseFloat(node.getAttribute('height')) || 0;
            if (rw > 0 && rh > 0) {
              let rx = Math.max(0, parseFloat(node.getAttribute('rx')) || 0);
              let ry = Math.max(0, parseFloat(node.getAttribute('ry')) || 0);
              if (!rx && ry) rx = ry;
              if (!ry && rx) ry = rx;
              rx = Math.min(rx, rw / 2);
              ry = Math.min(ry, rh / 2);
              if (rx === 0 || ry === 0) d = `M ${x},${y} h ${rw} v ${rh} h -${rw} Z`;
              else {
                d = `M ${x + rx},${y} h ${rw - 2 * rx} a ${rx},${ry} 0 0 1 ${rx},${ry} v ${rh - 2 * ry} a ${rx},${ry} 0 0 1 -${rx},${ry} h -${rw - 2 * rx} a ${rx},${ry} 0 0 1 -${rx},-${ry} v -${rh - 2 * ry} a ${rx},${ry} 0 0 1 ${rx},-${ry} Z`;
              }
            }
          }

          if (d) {
            paths.push({
              d,
              fill: fill && fill !== 'none' ? fill : undefined,
              stroke: stroke && stroke !== 'none' ? stroke : undefined,
              strokeWidth,
              transform,
              transformMatrix: isIdentity ? undefined : currentMatrix,
              fillRule: fillRule ? fillRule.toLowerCase() : undefined,
              isCurrentColor: isCurrentColor || undefined,
              currentColorType: isFillCurrentColor && isStrokeCurrentColor ? 'both' : (isFillCurrentColor ? 'fill' : (isStrokeCurrentColor ? 'stroke' : undefined))
            });
          }

          for (const child of node.children) {
            parseNode(child, nextInherited);
          }
        }

        for (const child of svgEl.children) {
          parseNode(child, {});
        }

        const nameHint = extractSemanticIconName(svgEl, idx + 1);
        const hasCurrentColor = paths.some(p => p.isCurrentColor);
        const explicitColors = new Set();
        for (const p of paths) {
          if (!p.isCurrentColor) {
            if (p.fill && p.fill !== 'none') explicitColors.add(p.fill.toLowerCase());
            if (p.stroke && p.stroke !== 'none') explicitColors.add(p.stroke.toLowerCase());
          }
        }
        const hasGradient = /<(linearGradient|radialGradient|stop)\b/i.test(svgEl.outerHTML);
        const isMultiColor = hasGradient || explicitColors.size >= 2 || (explicitColors.size >= 1 && hasCurrentColor && !explicitColors.has('#000000') && !explicitColors.has('#1a1a1a'));

        results.push({
          id: `vector_${idx + 1}`,
          name: nameHint,
          rawSvg: svgEl.outerHTML,
          viewBox,
          width: Math.round(w * 10) / 10,
          height: Math.round(h * 10) / 10,
          paths,
          hasCurrentColor,
          isCurrentColor: hasCurrentColor,
          isMultiColor,
          isMonochrome: !isMultiColor,
          contextualColor: style.color || '#1A1A1A'
        });
      });

      return results;
    });

    // Save SVGs and attach assetPath
    const vectorAssets = [];
    for (const item of inPageSvgList) {
      const assetPath = SvgParser.saveVectorAsset(item.rawSvg, outputDir, item.name);
      vectorAssets.push({
        id: item.id,
        name: item.name,
        fileName: path.basename(assetPath),
        assetPath,
        width: item.width,
        height: item.height,
        viewBox: item.viewBox,
        rawSvg: item.rawSvg,
        paths: item.paths,
        hasCurrentColor: item.hasCurrentColor,
        isCurrentColor: item.isCurrentColor,
        isMultiColor: item.isMultiColor,
        isMonochrome: item.isMonochrome,
        contextualColor: item.contextualColor
      });
    }

    return vectorAssets;
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

  static multiplyAffineMatrices(m1, m2) {
    return SvgParser.multiplyMatrices(m1, m2);
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
   * Parses an SVG transform attribute string into a 6-element matrix array.
   * @param {string} transformStr
   * @returns {number[]}
   */
  static parseTransformToMatrix(transformStr) {
    const parsed = SvgParser.parseTransform(transformStr);
    return (parsed && Array.isArray(parsed.matrix)) ? parsed.matrix : [1, 0, 0, 1, 0, 0];
  }

  /**
   * Bakes a 2D affine transformation matrix directly into SVG path coordinates (x', y') = M * (x, y).
   * @param {string} d - SVG path data string
   * @param {number[]} matrix - [a, b, c, d, e, f] 2D affine matrix
   * @returns {string}
   */
  static bakeMatrixToPath(d, matrix) {
    const { VectorGenerator } = require('../synthesizer/vector_generator');
    return VectorGenerator.bakeMatrixToPath(d, matrix);
  }

  /**
   * Bakes all path transformations in a vector data object into flat path coordinates.
   * @param {Object} vectorData - Vector object with paths array
   * @returns {Object}
   */
  static bakeVectorTransforms(vectorData) {
    if (!vectorData) return vectorData;
    if (Array.isArray(vectorData.paths)) {
      for (const p of vectorData.paths) {
        if (p.transform || p.transformMatrix) {
          const m = p.transformMatrix || SvgParser.parseTransformToMatrix(p.transform);
          if (!SvgParser.isIdentityMatrix(m)) {
            p.d = SvgParser.bakeMatrixToPath(p.d, m);
          }
          p.transform = undefined;
          p.transformMatrix = undefined;
        }
      }
    }

    const bakeTree = (nodes, parentMat = null) => {
      if (!Array.isArray(nodes)) return;
      for (const node of nodes) {
        if (node.type === 'group' || node.children || node.paths) {
          const localMat = node.transformMatrix || (node.transform ? SvgParser.parseTransformToMatrix(node.transform) : null);
          const effectiveMat = (parentMat && localMat)
            ? SvgParser.multiplyMatrices(parentMat, localMat)
            : (localMat || parentMat);
          bakeTree(node.children || node.elements || node.paths, effectiveMat);
          node.transform = undefined;
          node.transformMatrix = undefined;
          node.translationX = 0;
          node.translationY = 0;
          node.scaleX = 1;
          node.scaleY = 1;
          node.rotate = 0;
          node.rotation = 0;
          node.pivotX = 0;
          node.pivotY = 0;
          node.hasSkew = false;
        } else if (node.type === 'path' || node.d) {
          const localMat = node.transformMatrix || (node.transform ? SvgParser.parseTransformToMatrix(node.transform) : null);
          const effectiveMat = (parentMat && localMat)
            ? SvgParser.multiplyMatrices(parentMat, localMat)
            : (localMat || parentMat);
          if (effectiveMat && !SvgParser.isIdentityMatrix(effectiveMat)) {
            node.d = SvgParser.bakeMatrixToPath(node.d, effectiveMat);
          }
          node.transform = undefined;
          node.transformMatrix = undefined;
        }
      }
    };

    if (Array.isArray(vectorData.children)) {
      bakeTree(vectorData.children);
    } else if (Array.isArray(vectorData.groups)) {
      bakeTree(vectorData.groups);
    }
    return vectorData;
  }

  /**
   * Parses an SVG transform attribute string into numeric decomposition.
   * Supports matrix(a,b,c,d,e,f), translate(tx,[ty]), scale(sx,[sy]), rotate(deg,[cx,cy]),
   * skewX(deg/rad), skewY(deg/rad), including chained transforms with 2D affine matrix multiplication.
   * @param {string} transformStr
   * @returns {Object|null}
   */
  static parseTransform(transformStr) {
    const { VectorGenerator } = require('../synthesizer/vector_generator');
    return VectorGenerator.parseTransform(transformStr);
  }

  /**
   * Extracts fill-rule or clip-rule from attributes or inline CSS style.
   * Cascades down from parentFillRule if omitted or invalid.
   * @param {Object} attrs
   * @param {string|undefined} parentFillRule
   * @returns {string|undefined}
   */
  static extractFillRule(attrs, parentFillRule) {
    if (!attrs) return parentFillRule;
    let rule = attrs['fill-rule'] || attrs['clip-rule'];
    if (!rule && attrs.style) {
      const m = attrs.style.match(/(?:fill-rule|clip-rule)\s*:\s*([a-zA-Z-]+)/i);
      if (m) rule = m[1];
    }
    if (rule) {
      const trimmed = rule.trim().toLowerCase();
      if (trimmed !== 'none') return trimmed;
    }
    return parentFillRule;
  }

  /**
   * Extracts a specific CSS property from an inline style string.
   * @param {string} styleStr
   * @param {string} propName
   * @returns {string|undefined}
   */
  static extractStyleProp(styleStr, propName) {
    if (!styleStr || typeof styleStr !== 'string') return undefined;
    const regex = new RegExp(`(?:^|;)\\s*${propName}\\s*:\\s*([^;]+)`, 'i');
    const m = styleStr.match(regex);
    return m ? m[1].trim() : undefined;
  }

  /**
   * Deterministically extracts a semantic icon name candidate from an SVG string or DOM element
   * using the 7-tier classification ladder.
   * @param {string|Object} svgElOrString
   * @param {Object} [options={}]
   * @returns {string}
   */
  static extractSemanticName(svgElOrString, options = {}) {
    if (!svgElOrString) return options.fallback || 'icon';
    if (typeof svgElOrString !== 'string') {
      const getAttr = (name) => {
        if (typeof svgElOrString.getAttribute === 'function') return svgElOrString.getAttribute(name);
        if (svgElOrString.attributes && svgElOrString.attributes[name] !== undefined) return svgElOrString.attributes[name];
        return svgElOrString[name];
      };
      const dataIcon = getAttr('data-icon') || getAttr('data-lucide') || getAttr('data-feather') || getAttr('data-name');
      if (dataIcon && dataIcon.trim()) return dataIcon.trim();

      const testId = getAttr('data-testid') || getAttr('data-component');
      if (testId && testId.trim()) {
        const cleaned = testId.trim().replace(/^(?:icon|btn|button)[-_]+/i, '').replace(/[-_]+(?:icon|btn|button)$/i, '');
        if (cleaned) return cleaned;
      }

      const rawClass = getAttr('class') || svgElOrString.className || '';
      const classStr = typeof rawClass === 'string' ? rawClass : (rawClass && rawClass.baseVal ? rawClass.baseVal : '');
      if (classStr) {
        const lucideMatch = classStr.match(/\blucide-([a-z0-9-]+)\b/i);
        if (lucideMatch && lucideMatch[1]) return lucideMatch[1];
        const featherMatch = classStr.match(/\bfeather-([a-z0-9-]+)\b/i);
        if (featherMatch && featherMatch[1]) return featherMatch[1];
        const tablerMatch = classStr.match(/\btabler-icon-([a-z0-9-]+)\b/i);
        if (tablerMatch && tablerMatch[1]) return tablerMatch[1];
        const heroMatch = classStr.match(/\bheroicon-(?:outline-|solid-|mini-)?([a-z0-9-]+)\b/i);
        if (heroMatch && heroMatch[1]) return heroMatch[1];
        const faMatch = classStr.match(/\bfa[srlbd]?-([a-z0-9-]+)\b/i);
        if (faMatch && faMatch[1] && !/^(?:solid|regular|brands|light|fw|lg|\d+x)$/i.test(faMatch[1])) {
          return faMatch[1];
        }
        const riMatch = classStr.match(/\bri-([a-z0-9-]+?)(?:-line|-fill)?\b/i);
        if (riMatch && riMatch[1]) return riMatch[1];
        const iconPrefixMatch = classStr.match(/\bicon[-_]([a-z0-9_-]+)\b/i);
        if (iconPrefixMatch && iconPrefixMatch[1]) return iconPrefixMatch[1];
        const iconSuffixMatch = classStr.match(/\b([a-z0-9_-]+)[-_]icon\b/i);
        if (iconSuffixMatch && iconSuffixMatch[1] && !/^(?:svg|app)$/i.test(iconSuffixMatch[1])) {
          return iconSuffixMatch[1];
        }
      }

      try {
        if (typeof svgElOrString.querySelector === 'function') {
          const titleEl = svgElOrString.querySelector('title');
          if (titleEl && titleEl.textContent && titleEl.textContent.trim()) return titleEl.textContent.trim();
          const descEl = svgElOrString.querySelector('desc');
          if (descEl && descEl.textContent && descEl.textContent.trim()) return descEl.textContent.trim();
        }
      } catch (_) {}

      const ariaLabel = getAttr('aria-label') || getAttr('aria-roledescription');
      if (ariaLabel && ariaLabel.trim()) return ariaLabel.trim();

      const elId = getAttr('id');
      if (elId && elId.trim() && !/^(?:layer|svg|vector|icon|clip|path|shape|g)[-_]?[0-9]*$/i.test(elId.trim())) {
        return elId.trim();
      }

      return options.fallback || 'icon';
    }

    const raw = svgElOrString;
    // Tier 1: Data attributes
    const dataIconMatch = raw.match(/\bdata-(?:icon|lucide|feather|name)=["']([^"']+)["']/i);
    if (dataIconMatch && dataIconMatch[1].trim()) return dataIconMatch[1].trim();

    const testIdMatch = raw.match(/\bdata-(?:testid|component)=["']([^"']+)["']/i);
    if (testIdMatch && testIdMatch[1].trim()) {
      const cleaned = testIdMatch[1].trim().replace(/^(?:icon|btn|button)[-_]+/i, '').replace(/[-_]+(?:icon|btn|button)$/i, '');
      if (cleaned) return cleaned;
    }

    // Tier 2: CSS classes
    const classMatch = raw.match(/\bclass=["']([^"']+)["']/i);
    if (classMatch && classMatch[1]) {
      const cls = classMatch[1];
      const lucideMatch = cls.match(/\blucide-([a-z0-9-]+)\b/i);
      if (lucideMatch && lucideMatch[1]) return lucideMatch[1];

      const featherMatch = cls.match(/\bfeather-([a-z0-9-]+)\b/i);
      if (featherMatch && featherMatch[1]) return featherMatch[1];

      const tablerMatch = cls.match(/\btabler-icon-([a-z0-9-]+)\b/i);
      if (tablerMatch && tablerMatch[1]) return tablerMatch[1];

      const heroMatch = cls.match(/\bheroicon-(?:outline-|solid-|mini-)?([a-z0-9-]+)\b/i);
      if (heroMatch && heroMatch[1]) return heroMatch[1];

      const faMatch = cls.match(/\bfa[srlbd]?-([a-z0-9-]+)\b/i);
      if (faMatch && faMatch[1] && !/^(?:solid|regular|brands|light|fw|lg|\d+x)$/i.test(faMatch[1])) {
        return faMatch[1];
      }

      const riMatch = cls.match(/\bri-([a-z0-9-]+?)(?:-line|-fill)?\b/i);
      if (riMatch && riMatch[1]) return riMatch[1];

      const iconPrefixMatch = cls.match(/\bicon[-_]([a-z0-9_-]+)\b/i);
      if (iconPrefixMatch && iconPrefixMatch[1]) return iconPrefixMatch[1];

      const iconSuffixMatch = cls.match(/\b([a-z0-9_-]+)[-_]icon\b/i);
      if (iconSuffixMatch && iconSuffixMatch[1] && !/^(?:svg|app)$/i.test(iconSuffixMatch[1])) {
        return iconSuffixMatch[1];
      }
    }

    // Tier 3: Metadata <title> or <desc>
    const titleMatch = raw.match(/<title\b[^>]*>([^<]+)<\/title>/i);
    if (titleMatch && titleMatch[1].trim()) return titleMatch[1].trim();

    const descMatch = raw.match(/<desc\b[^>]*>([^<]+)<\/desc>/i);
    if (descMatch && descMatch[1].trim()) return descMatch[1].trim();

    // Tier 4: Direct aria-label
    const ariaMatch = raw.match(/\baria-label=["']([^"']+)["']/i);
    if (ariaMatch && ariaMatch[1].trim()) return ariaMatch[1].trim();

    // Tier 7: Filtered ID
    const idMatch = raw.match(/\bid=["']([^"']+)["']/i);
    if (idMatch && idMatch[1].trim()) {
      const id = idMatch[1].trim();
      if (!/^(?:layer|svg|vector|icon|clip|path|shape|g)[-_]?[0-9]*$/i.test(id) && !/^[0-9a-f]{8}-[0-9a-f]{4}/i.test(id)) {
        return id;
      }
    }

    return options.fallback || 'icon';
  }

  /**
   * Deterministically analyzes vector colors to determine multi-color, monochrome,
   * gradient, and currentColor status.
   * @param {Object} vectorData
   * @returns {Object} { isMultiColor, isMonochrome, hasCurrentColor, distinctCount, colors }
   */
  static analyzeVectorColors(vectorData) {
    if (!vectorData) return { isMultiColor: false, isMonochrome: true, hasCurrentColor: false, distinctCount: 0, colors: [] };

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
}

// Module exports
module.exports = {
  SvgParser,
  extractSVGs: SvgParser.extractSVGs,
  parseTransform: SvgParser.parseTransform,
  bakeMatrixToPath: SvgParser.bakeMatrixToPath,
  bakeVectorTransforms: SvgParser.bakeVectorTransforms,
  multiplyMatrices: SvgParser.multiplyMatrices,
  multiplyAffineMatrices: SvgParser.multiplyAffineMatrices,
  transformPoint: SvgParser.transformPoint,
  transformDelta: SvgParser.transformDelta,
  isIdentityMatrix: SvgParser.isIdentityMatrix,
  formatMatrixString: SvgParser.formatMatrixString,
  normalizeRect: SvgParser.normalizeRect,
  normalizeCircle: SvgParser.normalizeCircle,
  normalizeEllipse: SvgParser.normalizeEllipse,
  normalizeLine: SvgParser.normalizeLine,
  normalizePolygonPolyline: SvgParser.normalizePolygonPolyline,
  extractFillRule: SvgParser.extractFillRule,
  extractStyleProp: SvgParser.extractStyleProp,
  extractSemanticName: SvgParser.extractSemanticName,
  analyzeVectorColors: SvgParser.analyzeVectorColors
};
