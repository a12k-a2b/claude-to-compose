/**
 * extractor/svg_parser.js
 * Comprehensive SVG extraction, geometry normalization, and vector asset bundler.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

class SvgParser {
  /**
   * Parses an inline or external SVG string into structured vector data.
   * @param {string} rawSvgText - Raw SVG XML text
   * @param {Object} [computedContext={}] - Fallback colors or dimensions
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
    const width = Number.isFinite(parsedWidth) ? parsedWidth : (computedContext.width || 24);
    const height = Number.isFinite(parsedHeight) ? parsedHeight : (computedContext.height || 24);

    if (!viewBox) {
      viewBox = `0 0 ${width} ${height}`;
    }

    const paths = [];

    // Extract paths
    const pathRegex = /<path\b([^>]*)\/?>/gi;
    let match;
    while ((match = pathRegex.exec(rawSvgText)) !== null) {
      const attrs = match[1];
      const dMatch = attrs.match(/\bd=["']([^"']+)["']/i);
      if (!dMatch) continue;

      const fillMatch = attrs.match(/\bfill=["']([^"']+)["']/i);
      const strokeMatch = attrs.match(/\bstroke=["']([^"']+)["']/i);
      const strokeWidthMatch = attrs.match(/\bstroke-width=["']([^"']+)["']/i);
      const linecapMatch = attrs.match(/\bstroke-linecap=["']([^"']+)["']/i);
      const linejoinMatch = attrs.match(/\bstroke-linejoin=["']([^"']+)["']/i);
      const transformMatch = attrs.match(/\btransform=["']([^"']+)["']/i);
      const fillRuleMatch = attrs.match(/\bfill-rule=["']([^"']+)["']/i);
      const clipRuleMatch = attrs.match(/\bclip-rule=["']([^"']+)["']/i);

      let fill = fillMatch ? fillMatch[1] : undefined;
      let stroke = strokeMatch ? strokeMatch[1] : undefined;

      if (fill === 'currentColor') fill = computedContext.color || '#000000';
      if (stroke === 'currentColor') stroke = computedContext.color || '#000000';

      const pathObj = {
        d: dMatch[1].trim(),
        fill: fill !== 'none' ? fill : undefined,
        stroke: stroke !== 'none' ? stroke : undefined,
        strokeWidth: strokeWidthMatch ? parseFloat(strokeWidthMatch[1]) : undefined,
        strokeLinecap: linecapMatch ? linecapMatch[1].toLowerCase() : undefined,
        strokeLinejoin: linejoinMatch ? linejoinMatch[1].toLowerCase() : undefined
      };
      if (transformMatch) pathObj.transform = transformMatch[1].trim();
      const fillRule = fillRuleMatch ? fillRuleMatch[1].toLowerCase() : (clipRuleMatch ? clipRuleMatch[1].toLowerCase() : undefined);
      if (fillRule) pathObj.fillRule = fillRule;

      paths.push(pathObj);
    }

    // Extract circles
    const circleRegex = /<circle\b([^>]*)\/?>/gi;
    while ((match = circleRegex.exec(rawSvgText)) !== null) {
      const attrs = match[1];
      const cx = parseFloat(attrs.match(/\bcx=["']([^"']+)["']/i)?.[1] || 0);
      const cy = parseFloat(attrs.match(/\bcy=["']([^"']+)["']/i)?.[1] || 0);
      const r = parseFloat(attrs.match(/\br=["']([^"']+)["']/i)?.[1] || 0);
      const fill = attrs.match(/\bfill=["']([^"']+)["']/i)?.[1];
      const stroke = attrs.match(/\bstroke=["']([^"']+)["']/i)?.[1];
      const strokeWidth = parseFloat(attrs.match(/\bstroke-width=["']([^"']+)["']/i)?.[1] || 1);

      const d = `M ${cx - r},${cy} a ${r},${r} 0 1,0 ${r * 2},0 a ${r},${r} 0 1,0 -${r * 2},0 Z`;
      paths.push({
        d,
        fill: fill !== 'none' ? fill : undefined,
        stroke: stroke !== 'none' ? stroke : undefined,
        strokeWidth: stroke ? strokeWidth : undefined
      });
    }

    // Extract rects
    const rectRegex = /<rect\b([^>]*)\/?>/gi;
    while ((match = rectRegex.exec(rawSvgText)) !== null) {
      const attrs = match[1];
      const x = parseFloat(attrs.match(/\bx=["']([^"']+)["']/i)?.[1] || 0);
      const y = parseFloat(attrs.match(/\by=["']([^"']+)["']/i)?.[1] || 0);
      const w = parseFloat(attrs.match(/\bwidth=["']([^"']+)["']/i)?.[1] || 0);
      const h = parseFloat(attrs.match(/\bheight=["']([^"']+)["']/i)?.[1] || 0);
      let rx = Math.max(0, parseFloat(attrs.match(/\brx=["']([^"']+)["']/i)?.[1] || 0) || 0);
      let ry = Math.max(0, parseFloat(attrs.match(/\bry=["']([^"']+)["']/i)?.[1] || 0) || 0);
      const fill = attrs.match(/\bfill=["']([^"']+)["']/i)?.[1];
      const stroke = attrs.match(/\bstroke=["']([^"']+)["']/i)?.[1];
      const strokeWidth = parseFloat(attrs.match(/\bstroke-width=["']([^"']+)["']/i)?.[1] || 1);

      let d = '';
      if (!rx && !ry) {
        d = `M ${x},${y} h ${w} v ${h} h -${w} Z`;
      } else {
        rx = rx || ry; ry = ry || rx;
        d = `M ${x + rx},${y} h ${w - 2 * rx} a ${rx},${ry} 0 0 1 ${rx},${ry} v ${h - 2 * ry} a ${rx},${ry} 0 0 1 -${rx},${ry} h -${w - 2 * rx} a ${rx},${ry} 0 0 1 -${rx},-${ry} v -${h - 2 * ry} a ${rx},${ry} 0 0 1 ${rx},-${ry} Z`;
      }

      paths.push({
        d,
        fill: fill !== 'none' ? fill : undefined,
        stroke: stroke !== 'none' ? stroke : undefined,
        strokeWidth: stroke ? strokeWidth : undefined
      });
    }

    // Extract lines
    const lineRegex = /<line\b([^>]*)\/?>/gi;
    while ((match = lineRegex.exec(rawSvgText)) !== null) {
      const attrs = match[1];
      const x1 = parseFloat(attrs.match(/\bx1=["']([^"']+)["']/i)?.[1] || 0);
      const y1 = parseFloat(attrs.match(/\by1=["']([^"']+)["']/i)?.[1] || 0);
      const x2 = parseFloat(attrs.match(/\bx2=["']([^"']+)["']/i)?.[1] || 0);
      const y2 = parseFloat(attrs.match(/\by2=["']([^"']+)["']/i)?.[1] || 0);
      const stroke = attrs.match(/\bstroke=["']([^"']+)["']/i)?.[1];
      const strokeWidth = parseFloat(attrs.match(/\bstroke-width=["']([^"']+)["']/i)?.[1] || 1);
      const linecapMatch = attrs.match(/\bstroke-linecap=["']([^"']+)["']/i);
      const linejoinMatch = attrs.match(/\bstroke-linejoin=["']([^"']+)["']/i);

      paths.push({
        d: `M ${x1},${y1} L ${x2},${y2}`,
        stroke: stroke !== 'none' ? stroke : undefined,
        strokeWidth: stroke ? strokeWidth : undefined,
        strokeLinecap: linecapMatch ? linecapMatch[1].toLowerCase() : undefined,
        strokeLinejoin: linejoinMatch ? linejoinMatch[1].toLowerCase() : undefined
      });
    }

    // Extract polylines and polygons
    const polyRegex = /<(polygon|polyline)\b([^>]*)\/?>/gi;
    while ((match = polyRegex.exec(rawSvgText)) !== null) {
      const isPolygon = match[1].toLowerCase() === 'polygon';
      const attrs = match[2];
      const pts = (attrs.match(/\bpoints=["']([^"']+)["']/i)?.[1] || '').trim().split(/[\s,]+/).map(Number);
      if (pts.length >= 2) {
        let d = `M ${pts[0]},${pts[1]}`;
        for (let i = 2; i + 1 < pts.length; i += 2) d += ` L ${pts[i]},${pts[i + 1]}`;
        if (isPolygon) d += ' Z';

        const fill = attrs.match(/\bfill=["']([^"']+)["']/i)?.[1];
        const stroke = attrs.match(/\bstroke=["']([^"']+)["']/i)?.[1];
        const strokeWidth = parseFloat(attrs.match(/\bstroke-width=["']([^"']+)["']/i)?.[1] || 1);
        const polyLinecapMatch = attrs.match(/\bstroke-linecap=["']([^"']+)["']/i);
        const polyLinejoinMatch = attrs.match(/\bstroke-linejoin=["']([^"']+)["']/i);

        paths.push({
          d,
          fill: fill !== 'none' ? fill : undefined,
          stroke: stroke !== 'none' ? stroke : undefined,
          strokeWidth: stroke ? strokeWidth : undefined,
          strokeLinecap: polyLinecapMatch ? polyLinecapMatch[1].toLowerCase() : undefined,
          strokeLinejoin: polyLinejoinMatch ? polyLinejoinMatch[1].toLowerCase() : undefined
        });
      }
    }

    return {
      rawSvg: rawSvgText,
      viewBox,
      width,
      height,
      paths
    };
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

        // Traverse child shapes
        const paths = [];
        function parseNode(node, inherited = {}) {
          if (!node || node.nodeType !== Node.ELEMENT_NODE) return;
          const nodeTag = node.tagName.toLowerCase();
          const nodeStyle = window.getComputedStyle(node);

          let fill = nodeStyle.fill !== 'none' ? nodeStyle.fill : undefined;
          let stroke = nodeStyle.stroke !== 'none' ? nodeStyle.stroke : undefined;
          const strokeWidth = nodeStyle.strokeWidth && nodeStyle.strokeWidth !== '0px' ? parseFloat(nodeStyle.strokeWidth) : undefined;

          // Resolve currentColor
          if (fill === 'currentColor' || fill === 'rgb(0, 0, 0)') {
            fill = nodeStyle.color || style.color;
          }
          if (stroke === 'currentColor') {
            stroke = nodeStyle.color || style.color;
          }

          const rawTransform = node.getAttribute('transform');
          const transform = rawTransform || inherited.transform;
          const rawFillRule = node.getAttribute('fill-rule') || node.getAttribute('clip-rule') || nodeStyle.fillRule;
          const fillRule = (rawFillRule && rawFillRule !== 'none') ? rawFillRule : inherited.fillRule;

          const nextInherited = { transform, fillRule };

          let d = '';
          if (nodeTag === 'path') {
            d = node.getAttribute('d') || '';
          } else if (nodeTag === 'circle') {
            const cx = parseFloat(node.getAttribute('cx')) || 0;
            const cy = parseFloat(node.getAttribute('cy')) || 0;
            const r = parseFloat(node.getAttribute('r')) || 0;
            d = `M ${cx - r},${cy} a ${r},${r} 0 1,0 ${r * 2},0 a ${r},${r} 0 1,0 -${r * 2},0 Z`;
          } else if (nodeTag === 'ellipse') {
            const cx = parseFloat(node.getAttribute('cx')) || 0;
            const cy = parseFloat(node.getAttribute('cy')) || 0;
            const rx = parseFloat(node.getAttribute('rx')) || 0;
            const ry = parseFloat(node.getAttribute('ry')) || 0;
            d = `M ${cx - rx},${cy} a ${rx},${ry} 0 1,0 ${rx * 2},0 a ${rx},${ry} 0 1,0 -${rx * 2},0 Z`;
          } else if (nodeTag === 'line') {
            const x1 = parseFloat(node.getAttribute('x1')) || 0;
            const y1 = parseFloat(node.getAttribute('y1')) || 0;
            const x2 = parseFloat(node.getAttribute('x2')) || 0;
            const y2 = parseFloat(node.getAttribute('y2')) || 0;
            d = `M ${x1},${y1} L ${x2},${y2}`;
          } else if (nodeTag === 'polygon' || nodeTag === 'polyline') {
            const pts = (node.getAttribute('points') || '').trim().split(/[\s,]+/).map(Number);
            if (pts.length >= 2) {
              d = `M ${pts[0]},${pts[1]}`;
              for (let i = 2; i < pts.length; i += 2) d += ` L ${pts[i]},${pts[i + 1]}`;
              if (nodeTag === 'polygon') d += ' Z';
            }
          } else if (nodeTag === 'rect') {
            const x = parseFloat(node.getAttribute('x')) || 0;
            const y = parseFloat(node.getAttribute('y')) || 0;
            const rw = parseFloat(node.getAttribute('width')) || 0;
            const rh = parseFloat(node.getAttribute('height')) || 0;
            let rx = parseFloat(node.getAttribute('rx')) || 0;
            let ry = parseFloat(node.getAttribute('ry')) || 0;
            if (!rx && !ry) d = `M ${x},${y} h ${rw} v ${rh} h -${rw} Z`;
            else {
              rx = rx || ry; ry = ry || rx;
              d = `M ${x + rx},${y} h ${rw - 2 * rx} a ${rx},${ry} 0 0 1 ${rx},${ry} v ${rh - 2 * ry} a ${rx},${ry} 0 0 1 -${rx},${ry} h -${rw - 2 * rx} a ${rx},${ry} 0 0 1 -${rx},-${ry} v -${rh - 2 * ry} a ${rx},${ry} 0 0 1 ${rx},-${ry} Z`;
            }
          }

          if (d) {
            paths.push({
              d,
              fill: fill && fill !== 'none' ? fill : undefined,
              stroke: stroke && stroke !== 'none' ? stroke : undefined,
              strokeWidth,
              transform: transform || undefined,
              fillRule: fillRule ? fillRule.toLowerCase() : undefined
            });
          }

          for (const child of node.children) {
            parseNode(child, nextInherited);
          }
        }

        for (const child of svgEl.children) {
          parseNode(child, {});
        }

        const nameHint = svgEl.getAttribute('id') || svgEl.getAttribute('data-icon') || svgEl.getAttribute('aria-label') || `icon_${idx + 1}`;

        results.push({
          id: `vector_${idx + 1}`,
          name: nameHint,
          rawSvg: svgEl.outerHTML,
          viewBox,
          width: Math.round(w * 10) / 10,
          height: Math.round(h * 10) / 10,
          paths
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
        paths: item.paths
      });
    }

    return vectorAssets;
  }

  /**
   * Parses an SVG transform attribute string into numeric decomposition.
   * Supports matrix(a,b,c,d,e,f), translate(tx,[ty]), scale(sx,[sy]), rotate(deg,[cx,cy]).
   * @param {string} transformStr
   * @returns {Object|null}
   */
  static parseTransform(transformStr) {
    if (!transformStr || typeof transformStr !== 'string') return null;
    const t = transformStr.trim();

    // matrix(a, b, c, d, e, f)
    const matrixMatch = t.match(/matrix\(\s*([+-]?(?:\d*\.\d+|\d+)(?:[eE][+-]?\d+)?)[,\s]+([+-]?(?:\d*\.\d+|\d+)(?:[eE][+-]?\d+)?)[,\s]+([+-]?(?:\d*\.\d+|\d+)(?:[eE][+-]?\d+)?)[,\s]+([+-]?(?:\d*\.\d+|\d+)(?:[eE][+-]?\d+)?)[,\s]+([+-]?(?:\d*\.\d+|\d+)(?:[eE][+-]?\d+)?)[,\s]+([+-]?(?:\d*\.\d+|\d+)(?:[eE][+-]?\d+)?)\s*\)/i);
    if (matrixMatch) {
      const a = parseFloat(matrixMatch[1]);
      const b = parseFloat(matrixMatch[2]);
      const c = parseFloat(matrixMatch[3]);
      const d = parseFloat(matrixMatch[4]);
      const e = parseFloat(matrixMatch[5]);
      const f = parseFloat(matrixMatch[6]);
      return {
        type: 'matrix',
        a, b, c, d, e, f,
        translationX: Math.round(e * 1000) / 1000,
        translationY: Math.round(f * 1000) / 1000,
        scaleX: Math.round(a * 1000) / 1000,
        scaleY: Math.round(d * 1000) / 1000,
        hasTranslation: Math.abs(e) > 0.0001 || Math.abs(f) > 0.0001,
        hasScale: Math.abs(a - 1) > 0.0001 || Math.abs(d - 1) > 0.0001
      };
    }

    // translate(tx, [ty])
    const translateMatch = t.match(/translate\(\s*([+-]?(?:\d*\.\d+|\d+)(?:[eE][+-]?\d+)?)(?:[,\s]+([+-]?(?:\d*\.\d+|\d+)(?:[eE][+-]?\d+)?))?\s*\)/i);
    if (translateMatch) {
      const tx = parseFloat(translateMatch[1]);
      const ty = translateMatch[2] !== undefined ? parseFloat(translateMatch[2]) : 0;
      return {
        type: 'translate',
        translationX: Math.round(tx * 1000) / 1000,
        translationY: Math.round(ty * 1000) / 1000,
        hasTranslation: Math.abs(tx) > 0.0001 || Math.abs(ty) > 0.0001
      };
    }

    // scale(sx, [sy])
    const scaleMatch = t.match(/scale\(\s*([+-]?(?:\d*\.\d+|\d+)(?:[eE][+-]?\d+)?)(?:[,\s]+([+-]?(?:\d*\.\d+|\d+)(?:[eE][+-]?\d+)?))?\s*\)/i);
    if (scaleMatch) {
      const sx = parseFloat(scaleMatch[1]);
      const sy = scaleMatch[2] !== undefined ? parseFloat(scaleMatch[2]) : sx;
      return {
        type: 'scale',
        scaleX: Math.round(sx * 1000) / 1000,
        scaleY: Math.round(sy * 1000) / 1000,
        hasScale: Math.abs(sx - 1) > 0.0001 || Math.abs(sy - 1) > 0.0001
      };
    }

    // rotate(deg, [cx, cy])
    const rotateMatch = t.match(/rotate\(\s*([+-]?(?:\d*\.\d+|\d+)(?:[eE][+-]?\d+)?)(?:[,\s]+([+-]?(?:\d*\.\d+|\d+)(?:[eE][+-]?\d+)?)[,\s]+([+-]?(?:\d*\.\d+|\d+)(?:[eE][+-]?\d+)?))?\s*\)/i);
    if (rotateMatch) {
      const deg = parseFloat(rotateMatch[1]);
      const cx = rotateMatch[2] !== undefined ? parseFloat(rotateMatch[2]) : 0;
      const cy = rotateMatch[3] !== undefined ? parseFloat(rotateMatch[3]) : 0;
      return {
        type: 'rotate',
        rotate: Math.round(deg * 1000) / 1000,
        pivotX: Math.round(cx * 1000) / 1000,
        pivotY: Math.round(cy * 1000) / 1000,
        hasRotate: Math.abs(deg) > 0.0001
      };
    }

    return null;
  }
}

// Module exports
module.exports = {
  SvgParser,
  extractSVGs: SvgParser.extractSVGs,
  parseTransform: SvgParser.parseTransform
};
