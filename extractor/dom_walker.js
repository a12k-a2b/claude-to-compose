/**
 * extractor/dom_walker.js
 * In-browser recursive DOM tree evaluator and Material 3 design token extractor.
 */

/**
 * Traverses the DOM tree inside the target Playwright frame and returns the root DesignNode.
 * @param {import('playwright').Frame|import('playwright').Page} frame
 * @param {Object} [options={}]
 * @returns {Promise<Object>} The root DesignNode adhering to design_spec.json schema.
 */
async function walkDOM(frame, options = {}) {
  const rootSelector = options.rootSelector || null;

  const serialized = await frame.evaluate(({ rootSelector }) => {
    let idCounter = 0;
    let svgCounter = 0;

    // --- Helper: Font family normalizer ---
    function normalizeFontFamily(raw) {
      if (!raw || typeof raw !== 'string') return 'Roboto';
      const parts = raw.split(',').map(s => s.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean);
      if (parts.length === 0) return 'Roboto';

      const isGeneric = f => /^(-apple-system|system-ui|blinkmacsystemfont|sans-serif|serif|monospace)$/i.test(f);
      const named = parts.find(f => !isGeneric(f));
      if (named) return named;

      if (parts.some(f => /monospace/i.test(f))) return 'monospace';
      if (parts.some(f => /serif/i.test(f))) return 'serif';
      return 'Roboto';
    }

    // --- Helper: Parenthesis-safe comma splitting ---
    function splitCommaSafe(str) {
      if (!str) return [];
      const items = [];
      let current = '';
      let depth = 0;
      for (let i = 0; i < str.length; i++) {
        const ch = str[i];
        if (ch === '(') depth++;
        else if (ch === ')') depth--;
        else if (ch === ',' && depth === 0) {
          items.push(current.trim());
          current = '';
          continue;
        }
        current += ch;
      }
      if (current.trim()) items.push(current.trim());
      return items;
    }

    // --- Helper: Color parsing & normalization ---
    function parseColor(colorStr) {
      if (!colorStr || colorStr === 'transparent' || colorStr === 'rgba(0, 0, 0, 0)') {
        return { hex: undefined, argbHex: '#00000000', rgba: 'rgba(0, 0, 0, 0)', alpha: 0, isTransparent: true };
      }
      const rgbaMatch = colorStr.match(/rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,\s\/]+([\d.]+))?\s*\)/);
      if (rgbaMatch) {
        const r = Math.round(parseFloat(rgbaMatch[1]));
        const g = Math.round(parseFloat(rgbaMatch[2]));
        const b = Math.round(parseFloat(rgbaMatch[3]));
        const a = rgbaMatch[4] !== undefined ? parseFloat(rgbaMatch[4]) : 1.0;
        const clamp = v => Math.max(0, Math.min(255, v));
        const rH = clamp(r).toString(16).padStart(2, '0').toUpperCase();
        const gH = clamp(g).toString(16).padStart(2, '0').toUpperCase();
        const bH = clamp(b).toString(16).padStart(2, '0').toUpperCase();
        const a255 = Math.round(a * 255);
        const aH = clamp(a255).toString(16).padStart(2, '0').toUpperCase();
        return {
          hex: a < 1 ? `#${rH}${gH}${bH}${aH}` : `#${rH}${gH}${bH}`,
          argbHex: `#${aH}${rH}${gH}${bH}`,
          rgba: `rgba(${r}, ${g}, ${b}, ${a})`,
          alpha: a,
          isTransparent: a === 0
        };
      }
      const hexMatch = colorStr.match(/^#([0-9a-fA-F]{3,8})$/);
      if (hexMatch) {
        let raw = hexMatch[1];
        if (raw.length === 3) {
          raw = raw[0] + raw[0] + raw[1] + raw[1] + raw[2] + raw[2];
        }
        return { hex: `#${raw.toUpperCase()}`, argbHex: `#FF${raw.toUpperCase()}`, rgba: colorStr, alpha: 1, isTransparent: false };
      }
      return { hex: colorStr, argbHex: undefined, rgba: colorStr, alpha: 1, isTransparent: false };
    }

    // --- Helper: Box shadow parsing ---
    function parseShadows(shadowStr) {
      if (!shadowStr || shadowStr === 'none') return [];
      return splitCommaSafe(shadowStr).map(s => {
        let text = s.trim();
        const inset = /\binset\b/.test(text);
        if (inset) text = text.replace(/\binset\b/g, '').trim();

        let colorStr = 'rgba(0, 0, 0, 1)';
        const colorMatch = text.match(/(rgba?\([^)]+\)|color\([^)]+\)|#[0-9a-fA-F]{3,8}|[a-zA-Z]+)/);
        if (colorMatch) {
          colorStr = colorMatch[0];
          text = text.replace(colorStr, '').trim();
        }
        const nums = text.split(/\s+/).filter(Boolean).map(v => parseFloat(v) || 0);
        return {
          offsetX: nums[0] || 0,
          offsetY: nums[1] || 0,
          blurRadius: nums[2] || 0,
          spreadRadius: nums[3] || 0,
          color: parseColor(colorStr).hex || colorStr,
          inset
        };
      });
    }

    // --- Helper: Transition parsing ---
    function parseTransitions(style) {
      if (!style.transitionProperty || style.transitionProperty === 'none') return [];
      const props = splitCommaSafe(style.transitionProperty);
      const durations = splitCommaSafe(style.transitionDuration || '0s');
      const timings = splitCommaSafe(style.transitionTimingFunction || 'ease');
      const delays = splitCommaSafe(style.transitionDelay || '0s');

      const parseMs = val => {
        if (!val) return 0;
        if (val.endsWith('ms')) return parseFloat(val);
        if (val.endsWith('s')) return parseFloat(val) * 1000;
        return parseFloat(val) || 0;
      };

      const list = [];
      for (let i = 0; i < props.length; i++) {
        const p = props[i];
        if (!p || p === 'none') continue;
        const dur = parseMs(durations[i % durations.length]);
        const del = parseMs(delays[i % delays.length]);
        if (dur > 0 || del > 0) {
          list.push({
            property: p,
            durationMs: dur,
            easing: timings[i % timings.length] || 'ease',
            delayMs: del
          });
        }
      }
      return list;
    }

    // --- Helper: Animation parsing ---
    function parseAnimations(style) {
      if (!style.animationName || style.animationName === 'none') return [];
      const names = splitCommaSafe(style.animationName);
      const durations = splitCommaSafe(style.animationDuration || '0s');
      const timings = splitCommaSafe(style.animationTimingFunction || 'ease');
      const delays = splitCommaSafe(style.animationDelay || '0s');
      const iterationCounts = splitCommaSafe(style.animationIterationCount || '1');
      const directions = splitCommaSafe(style.animationDirection || 'normal');

      const parseMs = val => {
        if (!val) return 0;
        if (val.endsWith('ms')) return parseFloat(val);
        if (val.endsWith('s')) return parseFloat(val) * 1000;
        return parseFloat(val) || 0;
      };

      const list = [];
      for (let i = 0; i < names.length; i++) {
        const name = names[i];
        if (!name || name === 'none') continue;
        list.push({
          name,
          durationMs: parseMs(durations[i % durations.length]),
          easing: timings[i % timings.length] || 'ease',
          delayMs: parseMs(delays[i % delays.length]),
          iterationCount: iterationCounts[i % iterationCounts.length] || '1',
          direction: directions[i % directions.length] || 'normal'
        });
      }
      return list;
    }

    // --- Helper: Border radius & Pill/Circle detection ---
    function parseRadius(style, rect) {
      const parseVal = (v, dim) => {
        if (!v) return 0;
        if (v.endsWith('%')) return (parseFloat(v) / 100) * dim;
        return parseFloat(v) || 0;
      };
      const minDim = Math.min(rect.width || 0, rect.height || 0);
      const tl = parseVal(style.borderTopLeftRadius, minDim);
      const tr = parseVal(style.borderTopRightRadius, minDim);
      const br = parseVal(style.borderBottomRightRadius, minDim);
      const bl = parseVal(style.borderBottomLeftRadius, minDim);

      const raw = style.borderRadius || '0px';
      const isPercent50 = raw.includes('50%') || style.borderTopLeftRadius?.includes('50%');
      const isLargePill = tl >= 999 || (minDim > 0 && tl >= (minDim / 2) - 1);
      const isPill = isPercent50 || isLargePill;
      const isCircle = isPill && Math.abs((rect.width || 0) - (rect.height || 0)) <= 2;
      const isUniform = tl === tr && tr === br && br === bl;

      return {
        topLeft: Math.round(tl * 10) / 10,
        topRight: Math.round(tr * 10) / 10,
        bottomRight: Math.round(br * 10) / 10,
        bottomLeft: Math.round(bl * 10) / 10,
        isUniform,
        isPill,
        isCircle
      };
    }

    // --- Helper: Component classification heuristic machine ---
    function classifyComponent(el, style, rect, children, directText) {
      const tag = el.tagName.toLowerCase();
      const role = (el.getAttribute('role') || '').toLowerCase();
      const cls = (el.className && typeof el.className === 'string') ? el.className.toLowerCase() : '';
      const inputType = (el.type || el.getAttribute('type') || '').toLowerCase();
      const ariaLabel = (el.getAttribute('aria-label') || '').toLowerCase();
      const elId = (el.id || el.getAttribute('id') || '').toLowerCase();

      if (tag === 'body' || tag === 'html') return 'Screen';
      if (tag === 'svg') return 'Icon';
      if (tag === 'img' || tag === 'picture') return 'Image';
      if (tag === 'hr' || (rect.height <= 2 && rect.width >= 40) || (rect.width <= 2 && rect.height >= 40)) return 'Divider';

      // 1. Specific input and control types MUST precede generic input mapping
      if (inputType === 'checkbox' || role === 'checkbox') {
        if (role === 'switch' || /\b(switch|toggle)\b/.test(cls)) {
          return 'Switch';
        }
        return 'Checkbox';
      }

      if (inputType === 'radio' || role === 'radio') {
        return 'RadioButton';
      }

      if (role === 'switch' || /\b(switch|toggle)\b/.test(cls)) {
        return 'Switch';
      }

      // 2. Button and action elements (including <input type="button|submit|reset">)
      if (
        tag === 'button' ||
        role === 'button' ||
        inputType === 'button' ||
        inputType === 'submit' ||
        inputType === 'reset' ||
        /\b(btn|button|cta)\b/.test(cls)
      ) {
        if (children.length === 1 && children[0].componentType === 'Icon' && !directText) {
          return 'IconButton';
        }
        return 'Button';
      }

      // 3. Generic textual inputs
      if (['input', 'textarea', 'select'].includes(tag) || role === 'textbox') {
        return 'TextField';
      }

      if (role === 'toolbar' || /\b(toolbar)\b/.test(cls) || /\b(toolbar)\b/.test(elId) || /\b(toolbar)\b/.test(ariaLabel)) return 'Toolbar';
      if (role === 'dialog' || tag === 'dialog' || /\b(modal|overlay|dialog|backdrop)\b/.test(cls) || /\b(modal|overlay|dialog|backdrop)\b/.test(elId) || /\b(modal|overlay|dialog)\b/.test(ariaLabel)) return 'Overlay';

      if (/\b(badge|chip|tag|pill)\b/.test(cls)) return 'Badge';
      if (tag === 'nav' || role === 'navigation') return 'NavigationBar';
      if (tag === 'header' || role === 'banner' || /\b(navbar|appbar|topbar)\b/.test(cls)) return 'TopAppBar';

      const isCardClass = /\b(card|panel|surface)\b/.test(cls) && !/\b(header|footer|body|title|subtitle|content|text|icon|wrapper)\b/.test(cls);
      const hasCardStyle = children.length > 0 && rect.width > 120 && rect.height > 60 &&
        (style.boxShadow !== 'none' || (style.borderWidth !== '0px' && style.borderStyle !== 'none')) &&
        parseFloat(style.borderRadius) >= 6;

      if (isCardClass || hasCardStyle) return 'Card';
      if (children.length === 0 && directText) return 'Text';

      if (style.display === 'flex' || style.display === 'inline-flex') {
        return style.flexDirection.startsWith('column') ? 'Column' : 'Row';
      }
      if (style.display === 'grid' || style.display === 'inline-grid') return 'Grid';
      if (style.position === 'absolute' || style.position === 'fixed') return 'Box';

      return children.length > 0 ? 'Container' : 'Box';
    }

    // --- Helper: Inline SVG vector extractor ---
    function extractInlineSvgData(svgEl) {
      let viewBox = svgEl.getAttribute('viewBox');
      const rect = svgEl.getBoundingClientRect();
      const style = window.getComputedStyle(svgEl);
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

      function multiplyAffineMatrices(m1, m2) {
        return [
          m1[0] * m2[0] + m1[2] * m2[1],
          m1[1] * m2[0] + m1[3] * m2[1],
          m1[0] * m2[2] + m1[2] * m2[3],
          m1[1] * m2[2] + m1[3] * m2[3],
          m1[0] * m2[4] + m1[2] * m2[5] + m1[4],
          m1[1] * m2[4] + m1[3] * m2[5] + m1[5]
        ];
      }

      function isIdentityMatrix(m) {
        if (!m) return true;
        return Math.abs(m[0] - 1) < 1e-9 &&
               Math.abs(m[1]) < 1e-9 &&
               Math.abs(m[2]) < 1e-9 &&
               Math.abs(m[3] - 1) < 1e-9 &&
               Math.abs(m[4]) < 1e-9 &&
               Math.abs(m[5]) < 1e-9;
      }

      function formatMatrixString(m) {
        const round = v => {
          const r = Math.round(v * 1000000) / 1000000;
          return Number.isInteger(r) ? String(r) : String(r).replace(/(\.\d*?[1-9])0+$/, '$1');
        };
        return `matrix(${round(m[0])} ${round(m[1])} ${round(m[2])} ${round(m[3])} ${round(m[4])} ${round(m[5])})`;
      }

      function parseTransformToMatrix(transformStr) {
        if (!transformStr || typeof transformStr !== 'string') return [1, 0, 0, 1, 0, 0];
        const regex = /([a-zA-Z]+)\s*\(([^)]*)\)/g;
        let curr = [1, 0, 0, 1, 0, 0];
        let match;
        while ((match = regex.exec(transformStr)) !== null) {
          const name = match[1].toLowerCase();
          const args = match[2].trim().split(/[\s,]+/).map(Number).filter(n => !isNaN(n));
          let step = [1, 0, 0, 1, 0, 0];
          if (name === 'matrix' && args.length >= 6) {
            step = [args[0], args[1], args[2], args[3], args[4], args[5]];
          } else if (name === 'translate') {
            const tx = args[0] || 0;
            const ty = args[1] !== undefined ? args[1] : 0;
            step = [1, 0, 0, 1, tx, ty];
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

      function decomposeMatrix(m) {
        if (!m || isIdentityMatrix(m)) {
          return {
            translationX: 0, translationY: 0,
            scaleX: 1, scaleY: 1,
            rotate: 0, rotation: 0, pivotX: 0, pivotY: 0,
            hasSkew: false
          };
        }
        const [a, b, c, d, e, f] = m;
        const det = a * d - b * c;
        const scaleX = Math.round(Math.hypot(a, b) * 1000) / 1000;
        const scaleY = scaleX !== 0 ? Math.round((det / scaleX) * 1000) / 1000 : Math.round(Math.hypot(c, d) * 1000) / 1000;
        const rad = Math.atan2(b, a);
        const deg = Math.round((rad * 180 / Math.PI) * 1000) / 1000;
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

      const paths = [];
      const rootGroup = {
        type: 'group',
        name: 'root',
        children: [],
        paths: [],
        groups: []
      };
      rootGroup.elements = rootGroup.children;

      function parseNode(node, inherited = {}, currentGroup = rootGroup) {
        if (!node || node.nodeType !== Node.ELEMENT_NODE) return;
        const nodeTag = node.tagName.toLowerCase();
        if (nodeTag === 'defs' || nodeTag === 'clippath' || nodeTag === 'mask') return;

        const nodeStyle = window.getComputedStyle(node);
        let fill = nodeStyle.fill !== 'none' ? (parseColor(nodeStyle.fill).hex || nodeStyle.fill) : undefined;
        let stroke = nodeStyle.stroke !== 'none' ? (parseColor(nodeStyle.stroke).hex || nodeStyle.stroke) : undefined;
        const strokeWidth = nodeStyle.strokeWidth && nodeStyle.strokeWidth !== '0px' ? parseFloat(nodeStyle.strokeWidth) : undefined;

        const rawFillAttr = node.getAttribute('fill');
        const rawStrokeAttr = node.getAttribute('stroke');
        const isFillCurrentColor = rawFillAttr === 'currentColor' || nodeStyle.fill === 'currentColor';
        const isStrokeCurrentColor = rawStrokeAttr === 'currentColor' || nodeStyle.stroke === 'currentColor';
        const isCurrentColor = isFillCurrentColor || isStrokeCurrentColor;

        if (isFillCurrentColor) {
          fill = parseColor(nodeStyle.color || style.color).hex || nodeStyle.color || style.color;
        }
        if (isStrokeCurrentColor) {
          stroke = parseColor(nodeStyle.color || style.color).hex || nodeStyle.color || style.color;
        }

        const parentMatrix = inherited.transformMatrix || [1, 0, 0, 1, 0, 0];
        const rawTransform = node.getAttribute('transform');
        let currentMatrix = parentMatrix;
        let localMatrix = [1, 0, 0, 1, 0, 0];

        if (rawTransform && rawTransform.trim()) {
          const parsed = parseTransformToMatrix(rawTransform);
          if (parsed) {
            localMatrix = parsed;
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

        if (nodeTag === 'g') {
          const decomp = decomposeMatrix(localMatrix);
          const groupNode = {
            type: 'group',
            name: node.getAttribute('id') || node.getAttribute('name') || undefined,
            transform: rawTransform ? rawTransform.trim() : undefined,
            transformMatrix: localMatrix,
            translationX: decomp.translationX,
            translationY: decomp.translationY,
            scaleX: decomp.scaleX,
            scaleY: decomp.scaleY,
            rotate: decomp.rotate,
            rotation: decomp.rotate,
            pivotX: decomp.pivotX,
            pivotY: decomp.pivotY,
            hasSkew: decomp.hasSkew,
            fillRule: fillRule ? fillRule.toLowerCase() : undefined,
            children: [],
            paths: [],
            groups: []
          };
          groupNode.elements = groupNode.children;
          currentGroup.children.push(groupNode);
          currentGroup.groups.push(groupNode);

          for (const child of node.children) {
            parseNode(child, nextInherited, groupNode);
          }
          return;
        }

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
            transform: transform || undefined,
            transformMatrix: isIdentity ? undefined : currentMatrix,
            fillRule: fillRule ? fillRule.toLowerCase() : undefined,
            isCurrentColor: isCurrentColor || undefined,
            currentColorType: isFillCurrentColor && isStrokeCurrentColor ? 'both' : (isFillCurrentColor ? 'fill' : (isStrokeCurrentColor ? 'stroke' : undefined))
          });

          const isLocalIdentity = isIdentityMatrix(localMatrix);
          const childPathNode = {
            type: 'path',
            id: node.getAttribute('id') || undefined,
            d,
            fill: fill && fill !== 'none' ? fill : undefined,
            stroke: stroke && stroke !== 'none' ? stroke : undefined,
            strokeWidth,
            transform: isLocalIdentity ? undefined : (rawTransform ? rawTransform.trim() : formatMatrixString(localMatrix)),
            transformMatrix: isLocalIdentity ? undefined : localMatrix,
            fillRule: fillRule ? fillRule.toLowerCase() : undefined,
            isCurrentColor: isCurrentColor || undefined,
            currentColorType: isFillCurrentColor && isStrokeCurrentColor ? 'both' : (isFillCurrentColor ? 'fill' : (isStrokeCurrentColor ? 'stroke' : undefined))
          };
          currentGroup.children.push(childPathNode);
          currentGroup.paths.push(childPathNode);
        }

        for (const child of node.children) {
          parseNode(child, nextInherited, currentGroup);
        }
      }

      const rootSvgStyle = window.getComputedStyle(svgEl);
      let rootFillRule = svgEl.getAttribute('fill-rule') || svgEl.getAttribute('clip-rule') || (svgEl.style && svgEl.style.fillRule) || rootSvgStyle.fillRule;
      if (rootFillRule && rootFillRule !== 'none') {
        rootFillRule = rootFillRule.toLowerCase();
      } else {
        rootFillRule = undefined;
      }

      for (const child of svgEl.children) {
        parseNode(child, { fillRule: rootFillRule }, rootGroup);
      }

      const hasCurrentColor = paths.some(p => p.isCurrentColor);
      const explicitColors = new Set();
      const ctxColor = (style.color || '').toLowerCase().trim();
      for (const p of paths) {
        const isFillCC = p.currentColorType === 'fill' || p.currentColorType === 'both' || (p.isCurrentColor && !p.currentColorType && (p.fill === 'currentColor' || (ctxColor && p.fill && p.fill.toLowerCase() === ctxColor)));
        const isStrokeCC = p.currentColorType === 'stroke' || p.currentColorType === 'both' || (p.isCurrentColor && !p.currentColorType && (p.stroke === 'currentColor' || (ctxColor && p.stroke && p.stroke.toLowerCase() === ctxColor)));

        if (!isFillCC && p.fill && p.fill !== 'none' && p.fill.toLowerCase() !== 'currentcolor') {
          explicitColors.add(p.fill.toLowerCase());
        }
        if (!isStrokeCC && p.stroke && p.stroke !== 'none' && p.stroke.toLowerCase() !== 'currentcolor') {
          explicitColors.add(p.stroke.toLowerCase());
        }
      }
      const hasGradient = /<(linearGradient|radialGradient|stop)\b/i.test(svgEl.outerHTML);
      const isMultiColor = hasGradient || explicitColors.size >= 2 || (explicitColors.size >= 1 && hasCurrentColor && !explicitColors.has('#000000') && !explicitColors.has('#1a1a1a'));

      return {
        rawSvg: svgEl.outerHTML,
        viewBox,
        width: Math.round(w * 10) / 10,
        height: Math.round(h * 10) / 10,
        paths,
        groups: rootGroup.groups,
        children: rootGroup.children,
        elements: rootGroup.children,
        hasCurrentColor,
        isCurrentColor: hasCurrentColor,
        contextualColor: style.color || '#1A1A1A',
        isMultiColor,
        isMonochrome: !isMultiColor
      };
    }

    // --- Helper: Semantic icon name extractor (7-tier hierarchy) ---
    function extractSemanticIconName(el, fallbackCounter = 1) {
      if (!el) return `icon_${fallbackCounter}`;

      // Tier 1: Dedicated data attributes
      const dataIcon = (typeof el.getAttribute === 'function') ? (
        el.getAttribute('data-icon') ||
        el.getAttribute('data-lucide') ||
        el.getAttribute('data-feather') ||
        el.getAttribute('data-name')
      ) : null;
      if (dataIcon && dataIcon.trim()) return dataIcon.trim();

      const testId = (typeof el.getAttribute === 'function') ? (
        el.getAttribute('data-testid') || el.getAttribute('data-component')
      ) : null;
      if (testId && testId.trim()) {
        const cleaned = testId.trim().replace(/^(?:icon|btn|button)[-_]+/i, '').replace(/[-_]+(?:icon|btn|button)$/i, '');
        if (cleaned) return cleaned;
      }

      // Tier 2: CSS classes on the SVG
      const rawClass = (typeof el.getAttribute === 'function' ? el.getAttribute('class') : null) || el.className || '';
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

      // Tier 3: SVG child metadata (<title>, <desc>)
      try {
        if (typeof el.querySelector === 'function') {
          const titleEl = el.querySelector('title');
          if (titleEl && titleEl.textContent && titleEl.textContent.trim()) return titleEl.textContent.trim();
          const descEl = el.querySelector('desc');
          if (descEl && descEl.textContent && descEl.textContent.trim()) return descEl.textContent.trim();
        }
      } catch (_) {}

      // Tier 4: Direct SVG accessibility
      const ariaLabel = (typeof el.getAttribute === 'function') ? (
        el.getAttribute('aria-label') || el.getAttribute('aria-roledescription')
      ) : null;
      if (ariaLabel && ariaLabel.trim()) return ariaLabel.trim();

      // Tier 5: Enclosing interactive container (<button>, <a>, [role="button"])
      try {
        const btn = (typeof el.closest === 'function') ? el.closest('button, a, [role="button"]') : null;
        if (btn) {
          const btnAria = btn.getAttribute('aria-label') || btn.getAttribute('title');
          if (btnAria && btnAria.trim()) return btnAria.trim();

          const btnTestId = btn.getAttribute('data-testid');
          if (btnTestId && btnTestId.trim()) {
            const cleaned = btnTestId.trim().replace(/^(?:btn|button)[-_]+/i, '').replace(/[-_]+(?:btn|button)$/i, '');
            if (cleaned) return cleaned;
          }

          let btnText = '';
          if (btn.childNodes && btn.childNodes.length > 0) {
            for (const cn of btn.childNodes) {
              if (cn.nodeType === 3 || cn.nodeType === (typeof Node !== 'undefined' ? Node.TEXT_NODE : 3)) {
                const t = (cn.textContent || '').trim();
                if (t) btnText += (btnText ? ' ' : '') + t;
              }
            }
          }
          if (!btnText && (btn.innerText || btn.textContent)) {
            btnText = (btn.innerText || btn.textContent || '').trim();
          }
          if (btnText && btnText.length <= 30 && !/^\d+$/.test(btnText)) {
            return btnText;
          }

          const btnClass = btn.getAttribute('class') || '';
          if (typeof btnClass === 'string') {
            const btnClassMatch = btnClass.match(/\bbtn-([a-z0-9_-]+)\b/i);
            if (btnClassMatch && btnClassMatch[1] && !/^(?:icon|primary|secondary|default|outline|danger|sm|md|lg|xs)$/i.test(btnClassMatch[1])) {
              return btnClassMatch[1];
            }
          }
        }
      } catch (_) {}

      // Tier 6: Enclosing container wrapper class (e.g. brand-logo, search-wrapper)
      if (el.parentElement && typeof el.parentElement.getAttribute === 'function') {
        const parentClass = el.parentElement.getAttribute('class') || '';
        if (typeof parentClass === 'string') {
          const wrapperMatch = parentClass.match(/\b([a-z0-9_-]+)-(?:wrapper|box|container)\b/i);
          if (wrapperMatch && wrapperMatch[1] && !/^(?:icon|svg|metric|btn|button)$/i.test(wrapperMatch[1])) {
            return wrapperMatch[1];
          }
          const brandMatch = parentClass.match(/\b(brand-logo|app-logo|company-logo)\b/i);
          if (brandMatch) return brandMatch[1];
        }
      }

      // Tier 7: Filtered SVG ID
      const elId = (typeof el.getAttribute === 'function') ? el.getAttribute('id') : null;
      if (elId && elId.trim() && !/^(?:layer|svg|vector|icon|clip|path|shape|g)[-_]?[0-9]*$/i.test(elId.trim()) && !/^[0-9a-f]{8}-[0-9a-f]{4}/i.test(elId.trim())) {
        return elId.trim();
      }

      // Tier 8: Fallback
      return `icon_${fallbackCounter}`;
    }

    function sourceSegment(el, siblingIndex = 0) {
      const tagName = (el?.tagName || 'node').toLowerCase();
      const stableAttr =
        el?.getAttribute?.('data-testid') ||
        el?.getAttribute?.('data-test-id') ||
        el?.getAttribute?.('data-node-id') ||
        el?.getAttribute?.('id');
      if (stableAttr) {
        const normalized = String(stableAttr).trim().replace(/[^a-zA-Z0-9_.:-]+/g, '_');
        if (normalized) return `${tagName}#${normalized}`;
      }
      return `${tagName}:nth-child(${siblingIndex + 1})`;
    }

    // --- Main Recursive Walker Function ---
    function walkNode(el, sourcePath = '') {
      if (!el || el.nodeType !== Node.ELEMENT_NODE) return null;
      const tag = el.tagName.toLowerCase();
      const currentSourceId = sourcePath || sourceSegment(el, 0);
      if (['script', 'style', 'noscript', 'meta', 'link', 'template', 'head'].includes(tag)) return null;

      const style = window.getComputedStyle(el);
      const isHidden = style.display === 'none' || style.visibility === 'hidden';
      const isZeroOpacity = style.opacity === '0';
      const hasOpacityTransition = style.transitionProperty?.includes('opacity') || Boolean(style.animationName && style.animationName !== 'none');
      if (isZeroOpacity && !hasOpacityTransition && isHidden) return null;

      const rect = el.getBoundingClientRect();
      const isSvg = tag === 'svg';

      // Collect direct text
      let directText = '';
      for (const n of el.childNodes) {
        if (n.nodeType === Node.TEXT_NODE) {
          const t = n.textContent.replace(/\s+/g, ' ').trim();
          if (t) directText += (directText ? ' ' : '') + t;
        }
      }

      // Traverse children (do not recurse inside SVG; SVG handled as atomic unit)
      const children = [];
      if (!isSvg) {
        let childIndex = 0;
        for (const child of el.children) {
          const childPath = `${currentSourceId}/${sourceSegment(child, childIndex)}`;
          const c = walkNode(child, childPath);
          if (c) children.push(c);
          childIndex++;
        }
      }

      // Prune zero-dimension leaf nodes, preserving conditional/hidden elements if they contain children, text, or are SVG
      if (rect.width === 0 && rect.height === 0 && children.length === 0 && !directText && !isSvg) {
        return null;
      }

      const componentType = classifyComponent(el, style, rect, children, directText);
      const isClickable = style.cursor === 'pointer' || tag === 'button' || tag === 'a' || el.getAttribute('role') === 'button';
      const transitions = parseTransitions(style);
      const animations = parseAnimations(style);

      const parsedBgColor = parseColor(style.backgroundColor);
      const parsedTextColor = parseColor(style.color);
      const parsedBorderColor = parseColor(style.borderColor);

      const nodeObj = {
        id: `node_${++idCounter}`,
        sourceId: currentSourceId,
        tag,
        type: componentType.toUpperCase(),
        componentType,
        isConditional: isHidden ? true : undefined,
        bounds: {
          x: Math.round(rect.x * 10) / 10,
          y: Math.round(rect.y * 10) / 10,
          width: Math.round(rect.width * 10) / 10,
          height: Math.round(rect.height * 10) / 10
        },
        rect: {
          x: Math.round(rect.x * 10) / 10,
          y: Math.round(rect.y * 10) / 10,
          width: Math.round(rect.width * 10) / 10,
          height: Math.round(rect.height * 10) / 10
        },
        layout: {
          display: style.display === 'none' ? 'none' : (style.display.includes('flex') ? 'flex' : (style.display.includes('grid') ? 'grid' : (style.display === 'block' ? 'block' : 'inline'))),
          visibility: isHidden ? 'hidden' : 'visible',
          isConditional: isHidden ? true : undefined,
          flexDirection: style.flexDirection || undefined,
          justifyContent: style.justifyContent || undefined,
          alignItems: style.alignItems || undefined,
          flexWrap: style.flexWrap || undefined,
          gap: parseFloat(style.gap) || undefined,
          width: Math.round(rect.width * 10) / 10,
          height: Math.round(rect.height * 10) / 10,
          padding: {
            top: parseFloat(style.paddingTop) || 0,
            right: parseFloat(style.paddingRight) || 0,
            bottom: parseFloat(style.paddingBottom) || 0,
            left: parseFloat(style.paddingLeft) || 0
          },
          margin: {
            top: parseFloat(style.marginTop) || 0,
            right: parseFloat(style.marginRight) || 0,
            bottom: parseFloat(style.marginBottom) || 0,
            left: parseFloat(style.marginLeft) || 0
          },
          position: style.position || 'static',
          zIndex: style.zIndex !== 'auto' ? parseInt(style.zIndex, 10) : undefined
        },
        style: {
          backgroundColor: parsedBgColor.hex,
          color: parsedTextColor.hex,
          opacity: parseFloat(style.opacity) || 1,
          borderRadius: parseRadius(style, rect),
          border: (style.borderWidth !== '0px' && style.borderStyle !== 'none') ? {
            width: parseFloat(style.borderWidth) || 0,
            style: style.borderStyle,
            color: parsedBorderColor.hex || style.borderColor
          } : undefined,
          boxShadows: parseShadows(style.boxShadow)
        }
      };

      if (directText) {
        const parsedFontSize = parseFloat(style.fontSize) || 14;
        const fontOpticalSizing = style.fontOpticalSizing || undefined;
        const fontVariationSettings = style.fontVariationSettings || undefined;
        const explicitOpszMatch = fontVariationSettings ? fontVariationSettings.match(/["']opsz["']\s+([\d.]+)/) : null;
        const explicitOpsz = explicitOpszMatch ? parseFloat(explicitOpszMatch[1]) : undefined;
        const isAutoOptical = fontOpticalSizing !== 'none';
        const computedOpsz = explicitOpsz !== undefined
          ? explicitOpsz
          : (isAutoOptical ? Math.min(48, Math.max(16, Math.round(parsedFontSize))) : undefined);

        nodeObj.text = {
          content: directText,
          fontFamily: normalizeFontFamily(style.fontFamily),
          fontSize: parsedFontSize,
          fontWeight: parseInt(style.fontWeight, 10) || 400,
          lineHeight: parseFloat(style.lineHeight) || Math.round(parsedFontSize * 1.3),
          letterSpacing: parseFloat(style.letterSpacing) || 0,
          color: parsedTextColor.hex || '#000000',
          textAlign: style.textAlign || 'left',
          fontOpticalSizing,
          fontVariationSettings,
          opticalSize: computedOpsz
        };
      }

      if (isSvg) {
        svgCounter++;
        nodeObj.vectorId = `vector_${svgCounter}`;
        const semanticName = extractSemanticIconName(el, svgCounter);
        nodeObj.vectorName = semanticName;
        nodeObj.semanticName = semanticName;
        nodeObj.vectorData = extractInlineSvgData(el);
      }

      if (isClickable || transitions.length > 0 || animations.length > 0) {
        nodeObj.interactions = {
          isClickable,
          hasRipple: isClickable,
          transitions: transitions.length > 0 ? transitions : undefined,
          animations: animations.length > 0 ? animations : undefined
        };
      }

      if (children.length > 0) {
        nodeObj.children = children;
      }

      return nodeObj;
    }

    const startEl = rootSelector ? document.querySelector(rootSelector) : (document.getElementById('root') || document.getElementById('app') || document.body);
    const rootNode = walkNode(startEl, startEl ? sourceSegment(startEl, 0) : 'body:nth-child(1)') || {
      id: 'node_1',
      sourceId: 'body:nth-child(1)',
      tag: 'div',
      type: 'CONTAINER',
      componentType: 'Container',
      bounds: { x: 0, y: 0, width: 390, height: 844 },
      layout: { display: 'block', padding: { top: 0, right: 0, bottom: 0, left: 0 }, margin: { top: 0, right: 0, bottom: 0, left: 0 } },
      children: []
    };

    const themeHints = {
      keyframes: [],
      pseudoDeltas: []
    };
    try {
      const computedRoot = window.getComputedStyle(document.documentElement);
      const varKeys = ['--color-primary', '--primary', '--brand-primary', '--radius-sm', '--radius-md', '--radius-lg', '--radius-card'];
      for (const k of varKeys) {
        const val = computedRoot.getPropertyValue(k).trim();
        if (val) themeHints[k] = val;
      }
      for (const sheet of document.styleSheets) {
        try {
          for (const rule of sheet.cssRules) {
            if (rule.selectorText === ':root' || rule.selectorText === 'html') {
              for (let i = 0; i < rule.style.length; i++) {
                const prop = rule.style[i];
                if (prop.startsWith('--') && !themeHints[prop]) {
                  themeHints[prop] = rule.style.getPropertyValue(prop).trim();
                }
              }
            } else if (rule.type === CSSRule.KEYFRAMES_RULE || rule.type === 7 || rule.constructor?.name === 'CSSKeyframesRule') {
              const kf = {
                name: rule.name,
                steps: []
              };
              if (rule.cssRules) {
                for (const step of rule.cssRules) {
                  const stepProps = {};
                  if (step.style) {
                    for (let i = 0; i < step.style.length; i++) {
                      const p = step.style[i];
                      stepProps[p] = step.style.getPropertyValue(p).trim();
                    }
                  }
                  kf.steps.push({
                    keyText: step.keyText,
                    properties: stepProps
                  });
                }
              }
              themeHints.keyframes.push(kf);
            } else if (rule.selectorText && (rule.selectorText.includes(':hover') || rule.selectorText.includes(':active') || rule.selectorText.includes('[data-state]'))) {
              const deltaProps = {};
              if (rule.style) {
                for (let i = 0; i < rule.style.length; i++) {
                  const p = rule.style[i];
                  deltaProps[p] = rule.style.getPropertyValue(p).trim();
                }
              }
              themeHints.pseudoDeltas.push({
                selector: rule.selectorText,
                properties: deltaProps
              });
            }
          }
        } catch (_) {}
      }
    } catch (_) {}

    rootNode.themeHints = themeHints;

    return JSON.stringify(rootNode);
  }, { rootSelector });

  return JSON.parse(serialized);
}

/**
 * Standalone classifier for unit testing and DOM element inspection.
 */
function classifyComponent(el = {}, style = {}, rect = {}, children = [], directText = '') {
  const getAttr = (name) => {
    if (el && typeof el.getAttribute === 'function') return el.getAttribute(name) || '';
    if (!el) return '';
    if (name === 'role') return el.role || '';
    if (name === 'type') return el.type || '';
    if (name === 'aria-label') return el.ariaLabel || el['aria-label'] || '';
    if (name === 'id') return el.id || '';
    return '';
  };
  const tag = (el.tagName || el.tag || '').toLowerCase();
  const role = (getAttr('role') || '').toLowerCase();
  const cls = (el.className && typeof el.className === 'string') ? el.className.toLowerCase() : '';
  const inputType = (el.type || getAttr('type') || '').toLowerCase();
  const ariaLabel = (getAttr('aria-label') || '').toLowerCase();
  const elId = (el.id || getAttr('id') || '').toLowerCase();

  if (tag === 'body' || tag === 'html') return 'Screen';
  if (tag === 'svg') return 'Icon';
  if (tag === 'img' || tag === 'picture') return 'Image';
  if (tag === 'hr' || (rect.height <= 2 && rect.width >= 40) || (rect.width <= 2 && rect.height >= 40)) return 'Divider';

  if (inputType === 'checkbox' || role === 'checkbox') {
    if (role === 'switch' || /\b(switch|toggle)\b/.test(cls)) {
      return 'Switch';
    }
    return 'Checkbox';
  }

  if (inputType === 'radio' || role === 'radio') {
    return 'RadioButton';
  }

  if (role === 'switch' || /\b(switch|toggle)\b/.test(cls)) {
    return 'Switch';
  }

  if (
    tag === 'button' ||
    role === 'button' ||
    inputType === 'button' ||
    inputType === 'submit' ||
    inputType === 'reset' ||
    /\b(btn|button|cta)\b/.test(cls)
  ) {
    if (children.length === 1 && children[0].componentType === 'Icon' && !directText) {
      return 'IconButton';
    }
    return 'Button';
  }

  if (['input', 'textarea', 'select'].includes(tag) || role === 'textbox') {
    return 'TextField';
  }

  if (role === 'toolbar' || /\b(toolbar)\b/.test(cls) || /\b(toolbar)\b/.test(elId) || /\b(toolbar)\b/.test(ariaLabel)) return 'Toolbar';
  if (role === 'dialog' || tag === 'dialog' || /\b(modal|overlay|dialog|backdrop)\b/.test(cls) || /\b(modal|overlay|dialog|backdrop)\b/.test(elId) || /\b(modal|overlay|dialog)\b/.test(ariaLabel)) return 'Overlay';

  if (/\b(badge|chip|tag|pill)\b/.test(cls)) return 'Badge';
  if (tag === 'nav' || role === 'navigation') return 'NavigationBar';
  if (tag === 'header' || role === 'banner' || /\b(navbar|appbar|topbar)\b/.test(cls)) return 'TopAppBar';

  const isCardClass = /\b(card|panel|surface)\b/.test(cls) && !/\b(header|footer|body|title|subtitle|content|text|icon|wrapper)\b/.test(cls);
  const hasCardStyle = children.length > 0 && rect.width > 120 && rect.height > 60 &&
    (style.boxShadow !== 'none' || (style.borderWidth !== '0px' && style.borderStyle !== 'none')) &&
    parseFloat(style.borderRadius) >= 6;

  if (isCardClass || hasCardStyle) return 'Card';
  if (children.length === 0 && directText) return 'Text';

  if (style.display === 'flex' || style.display === 'inline-flex') {
    return style.flexDirection && style.flexDirection.startsWith('column') ? 'Column' : 'Row';
  }
  if (style.display === 'grid' || style.display === 'inline-grid') return 'Grid';
  if (style.position === 'absolute' || style.position === 'fixed') return 'Box';

  return children.length > 0 ? 'Container' : 'Box';
}

/**
 * Standalone semantic icon name extractor for unit testing and DOM element inspection.
 */
function extractSemanticIconName(el, fallbackCounter = 1) {
  if (!el) return `icon_${fallbackCounter}`;

  // Tier 1: Dedicated data attributes
  const getAttr = (name) => {
    if (typeof el.getAttribute === 'function') return el.getAttribute(name);
    if (el.attributes && el.attributes[name] !== undefined) return el.attributes[name];
    return el[name];
  };

  const dataIcon = getAttr('data-icon') ||
                   getAttr('data-lucide') ||
                   getAttr('data-feather') ||
                   getAttr('data-name');
  if (dataIcon && typeof dataIcon === 'string' && dataIcon.trim()) return dataIcon.trim();

  const testId = getAttr('data-testid') || getAttr('data-component');
  if (testId && typeof testId === 'string' && testId.trim()) {
    const cleaned = testId.trim().replace(/^(?:icon|btn|button)[-_]+/i, '').replace(/[-_]+(?:icon|btn|button)$/i, '');
    if (cleaned) return cleaned;
  }

  // Tier 2: CSS classes on the SVG
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

  // Tier 3: SVG child metadata (<title>, <desc>)
  try {
    if (typeof el.querySelector === 'function') {
      const titleEl = el.querySelector('title');
      if (titleEl && titleEl.textContent && titleEl.textContent.trim()) return titleEl.textContent.trim();
      const descEl = el.querySelector('desc');
      if (descEl && descEl.textContent && descEl.textContent.trim()) return descEl.textContent.trim();
    }
  } catch (_) {}

  // Tier 4: Direct SVG accessibility
  const ariaLabel = getAttr('aria-label') || getAttr('aria-roledescription');
  if (ariaLabel && typeof ariaLabel === 'string' && ariaLabel.trim()) return ariaLabel.trim();

  // Tier 5: Enclosing interactive container (<button>, <a>, [role="button"])
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
      if (btn.childNodes && btn.childNodes.length > 0) {
        for (const cn of btn.childNodes) {
          if (cn.nodeType === 3 || cn.nodeType === (typeof Node !== 'undefined' ? Node.TEXT_NODE : 3)) {
            const t = (cn.textContent || '').trim();
            if (t) btnText += (btnText ? ' ' : '') + t;
          }
        }
      }
      if (!btnText && (btn.textContent || btn.innerText)) {
        btnText = (btn.textContent || btn.innerText || '').trim();
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

  // Tier 6: Enclosing container wrapper class (e.g. brand-logo, search-wrapper)
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

  // Tier 7: Filtered SVG ID
  const elId = getAttr('id');
  if (elId && typeof elId === 'string' && elId.trim() && !/^(?:layer|svg|vector|icon|clip|path|shape|g)[-_]?[0-9]*$/i.test(elId.trim()) && !/^[0-9a-f]{8}-[0-9a-f]{4}/i.test(elId.trim())) {
    return elId.trim();
  }

  // Tier 8: Fallback
  return `icon_${fallbackCounter}`;
}

module.exports = { walkDOM, classifyComponent, extractSemanticIconName };
