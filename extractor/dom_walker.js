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

      const paths = [];
      function parseNode(node) {
        if (!node || node.nodeType !== Node.ELEMENT_NODE) return;
        const nodeTag = node.tagName.toLowerCase();
        const nodeStyle = window.getComputedStyle(node);
        let fill = nodeStyle.fill !== 'none' ? (parseColor(nodeStyle.fill).hex || nodeStyle.fill) : undefined;
        let stroke = nodeStyle.stroke !== 'none' ? (parseColor(nodeStyle.stroke).hex || nodeStyle.stroke) : undefined;
        const strokeWidth = nodeStyle.strokeWidth && nodeStyle.strokeWidth !== '0px' ? parseFloat(nodeStyle.strokeWidth) : undefined;

        if (fill === 'currentColor') fill = parseColor(nodeStyle.color || style.color).hex;
        if (stroke === 'currentColor') stroke = parseColor(nodeStyle.color || style.color).hex;

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
            strokeWidth
          });
        }

        for (const child of node.children) {
          parseNode(child);
        }
      }

      for (const child of svgEl.children) {
        parseNode(child);
      }

      return {
        rawSvg: svgEl.outerHTML,
        viewBox,
        width: Math.round(w * 10) / 10,
        height: Math.round(h * 10) / 10,
        paths
      };
    }

    // --- Main Recursive Walker Function ---
    function walkNode(el) {
      if (!el || el.nodeType !== Node.ELEMENT_NODE) return null;
      const tag = el.tagName.toLowerCase();
      if (['script', 'style', 'noscript', 'meta', 'link', 'template', 'head'].includes(tag)) return null;

      const style = window.getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden') return null;
      if (style.opacity === '0' && !style.transitionProperty?.includes('opacity')) return null;

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
        for (const child of el.children) {
          const c = walkNode(child);
          if (c) children.push(c);
        }
      }

      // Prune zero-dimension leaf nodes
      if (rect.width === 0 && rect.height === 0 && children.length === 0 && !directText) {
        return null;
      }

      const componentType = classifyComponent(el, style, rect, children, directText);
      const isClickable = style.cursor === 'pointer' || tag === 'button' || tag === 'a' || el.getAttribute('role') === 'button';
      const transitions = parseTransitions(style);

      const parsedBgColor = parseColor(style.backgroundColor);
      const parsedTextColor = parseColor(style.color);
      const parsedBorderColor = parseColor(style.borderColor);

      const nodeObj = {
        id: `node_${++idCounter}`,
        tag,
        type: componentType.toUpperCase(),
        componentType,
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
          display: style.display.includes('flex') ? 'flex' : (style.display.includes('grid') ? 'grid' : (style.display === 'block' ? 'block' : 'inline')),
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
        nodeObj.text = {
          content: directText,
          fontFamily: normalizeFontFamily(style.fontFamily),
          fontSize: parseFloat(style.fontSize) || 14,
          fontWeight: parseInt(style.fontWeight, 10) || 400,
          lineHeight: parseFloat(style.lineHeight) || Math.round((parseFloat(style.fontSize) || 14) * 1.3),
          letterSpacing: parseFloat(style.letterSpacing) || 0,
          color: parsedTextColor.hex || '#000000',
          textAlign: style.textAlign || 'left'
        };
      }

      if (isSvg) {
        nodeObj.vectorData = extractInlineSvgData(el);
      }

      if (isClickable || transitions.length > 0) {
        nodeObj.interactions = {
          isClickable,
          hasRipple: isClickable,
          transitions: transitions.length > 0 ? transitions : undefined
        };
      }

      if (children.length > 0) {
        nodeObj.children = children;
      }

      return nodeObj;
    }

    const startEl = rootSelector ? document.querySelector(rootSelector) : (document.getElementById('root') || document.getElementById('app') || document.body);
    const rootNode = walkNode(startEl) || {
      id: 'node_1',
      tag: 'div',
      type: 'CONTAINER',
      componentType: 'Container',
      bounds: { x: 0, y: 0, width: 390, height: 844 },
      layout: { display: 'block', padding: { top: 0, right: 0, bottom: 0, left: 0 }, margin: { top: 0, right: 0, bottom: 0, left: 0 } },
      children: []
    };

    const themeHints = {};
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

module.exports = { walkDOM };
