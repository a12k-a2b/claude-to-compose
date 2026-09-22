'use strict';

/**
 * src/contract/measured_scene_builder.js
 *
 * Layer 1 Measured Scene IR Builder for ctc v2.
 * Constructs exact, immutable physical observations conforming to
 * Draft 2020-12 MeasuredSceneBundle schema.
 */

const SHA256_REGEX = /^sha256:[a-f0-9]{64}$/;

/**
 * Validates a SHA-256 hash string against the standard 64-hex format.
 * @param {string} hash
 * @returns {boolean}
 */
function isValidSha256(hash) {
  if (typeof hash !== 'string') return false;
  return SHA256_REGEX.test(hash);
}

/**
 * Allocates a stable, semantic sourceId for a DOM node.
 * Uses a 5-tier deterministic allocation strategy:
 * 1. Author hooks: data-source-id, data-testid, data-test-id, data-component, data-node-id
 * 2. Clean element ID (non-UUID, non-generated)
 * 3. Semantic role / component uniqueness within parent
 * 4. Structural tag with 1-indexed nth-child disambiguation
 * 5. Screen namespace prefix
 *
 * @param {Object} element - Raw DOM element or descriptor
 * @param {string} [parentSourceId='root'] - Parent's allocated sourceId
 * @param {Object} [siblingContext={}] - Sibling occurrence map for disambiguation
 * @param {string} [screenId='default'] - Screen identifier namespace
 * @returns {string} Fully qualified stable sourceId
 */
function allocateSourceId(element, parentSourceId = 'root', siblingContext = {}, screenId = 'default') {
  if (!element) return `daylight#${screenId}/anonymous`;
  if (element.sourceId && element.sourceId.startsWith('daylight#')) {
    return element.sourceId;
  }

  const tag = (element.tag || element.tagName || element.domTag || 'node').toLowerCase();

  // Tier 1: Author-specified testing / source hooks
  const explicitHook =
    element.getAttribute?.('data-source-id') ||
    element.getAttribute?.('data-testid') ||
    element.getAttribute?.('data-test-id') ||
    element.getAttribute?.('data-component') ||
    element.getAttribute?.('data-node-id') ||
    element.dataset?.sourceId ||
    element.dataset?.testid ||
    element.dataset?.testId ||
    element.dataset?.component ||
    element.dataset?.nodeId;

  if (explicitHook && typeof explicitHook === 'string') {
    const sanitized = explicitHook.trim().replace(/[^a-zA-Z0-9_.:-]+/g, '_');
    if (sanitized) {
      return `${parentSourceId}/${tag}#${sanitized}`;
    }
  }

  // Tier 2: Author-specified semantic ID (filtering random/transient IDs)
  const rawId = element.id || element.getAttribute?.('id');
  if (rawId && typeof rawId === 'string') {
    const isTransient =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(rawId) ||
      /^(?:node|layer|vector|path|g|div|span)[-_]?\d+$/i.test(rawId);
    if (!isTransient) {
      const sanitized = rawId.trim().replace(/[^a-zA-Z0-9_.:-]+/g, '_');
      if (sanitized) {
        return `${parentSourceId}/${tag}#${sanitized}`;
      }
    }
  }

  // Tier 3: Semantic role or component classification
  const role = element.role || element.getAttribute?.('role') || element.componentType;
  if (role && typeof role === 'string' && role !== 'generic') {
    const sanitizedRole = role.toLowerCase().replace(/[^a-zA-Z0-9_]+/g, '_');
    const roleKey = `${tag}_${sanitizedRole}`;
    siblingContext[roleKey] = (siblingContext[roleKey] || 0) + 1;
    const indexSuffix = siblingContext[roleKey] > 1 ? `_${siblingContext[roleKey]}` : '';
    return `${parentSourceId}/${sanitizedRole}${indexSuffix}`;
  }

  // Tier 4: Structural tag with 1-indexed sibling counter
  const tagKey = tag;
  siblingContext[tagKey] = (siblingContext[tagKey] || 0) + 1;
  const childIndex = siblingContext[tagKey];
  const segment = childIndex === 1 && !siblingContext[`${tagKey}_has_multiple`]
    ? tag
    : `${tag}:nth-child(${childIndex})`;

  return `${parentSourceId}/${segment}`;
}

function toFinite(val, fallback = 0) {
  const n = Number(val);
  return Number.isFinite(n) ? n : fallback;
}

function toNonNegative(val, fallback = 0) {
  const n = Number(val);
  return Number.isFinite(n) ? Math.max(0, n) : fallback;
}

/**
 * Creates an immutable Layer 1 MeasuredNode.
 * Handles zero-dimension nodes (width=0, height=0) and negative coordinates without clamping.
 * Recursively builds child trees safely up to deep hierarchies.
 *
 * @param {Object} options
 * @param {Set} [visited]
 * @returns {Object} MeasuredNode conforming to Draft 2020-12
 */
function createMeasuredNode(options = {}, visited = new Set()) {
  const rawNode = (options && typeof options === 'object' && options._rawNode) ? options._rawNode : options;
  if (rawNode && typeof rawNode === 'object') {
    if (visited.has(rawNode)) {
      const cyId = options.id || rawNode.id || `node_cycle_${Math.random().toString(36).substring(2, 7)}`;
      const cySourceId = (options.sourceId || rawNode.sourceId) ? `${options.sourceId || rawNode.sourceId}_cycle` : 'daylight#root/cyclic_node';
      return {
        id: cyId,
        sourceId: cySourceId,
        domTag: options.domTag || rawNode.domTag || options.tag || rawNode.tag || 'div',
        domClasses: [],
        bounds: { x: 0, y: 0, width: 0, height: 0 },
        boundsDp: { x: 0, y: 0, width: 0, height: 0 },
        paintBounds: { left: 0, top: 0, right: 0, bottom: 0 },
        paintBoundsDp: { left: 0, top: 0, right: 0, bottom: 0 },
        paintOrder: 0,
        zIndex: 0,
        clipChain: [],
        transformChain: [],
        textRuns: [],
        baselines: { firstBaselinePx: 0, lastBaselinePx: 0, alphabeticBaselineY: 0 },
        lineBreaks: [],
        computedPaint: { backgroundColor: '#00000000', opacity: 1.0 },
        semantics: { role: 'container', isInteractive: false },
        hitRegions: {
          visualBoundsDp: { x: 0, y: 0, width: 0, height: 0 },
          interactiveBoundsDp: { x: 0, y: 0, width: 0, height: 0 },
          meetsMinTouchTarget: false,
          slopInsetsDp: { top: 0, right: 0, bottom: 0, left: 0 }
        },
        children: []
      };
    }
    visited.add(rawNode);
  }

  const density = typeof options.density === 'number' && Number.isFinite(options.density) && options.density > 0 ? options.density : 2.0;

  // 1. Physical Bounds in device pixels (preserve exact values, including 0 and offscreen negatives for x/y; non-negative for width/height)
  const rawBounds = options.bounds || { x: 0, y: 0, width: 0, height: 0 };
  const bounds = {
    x: toFinite(rawBounds.x, 0),
    y: toFinite(rawBounds.y, 0),
    width: toNonNegative(rawBounds.width, 0),
    height: toNonNegative(rawBounds.height, 0)
  };

  // Logical bounds in dp
  const rawBoundsDp = options.boundsDp;
  const boundsDp = {
    x: toFinite(rawBoundsDp?.x, Number((bounds.x / density).toFixed(2))),
    y: toFinite(rawBoundsDp?.y, Number((bounds.y / density).toFixed(2))),
    width: toNonNegative(rawBoundsDp?.width, Number((bounds.width / density).toFixed(2))),
    height: toNonNegative(rawBoundsDp?.height, Number((bounds.height / density).toFixed(2)))
  };

  // 2. Paint Bounds in root coordinates (including shadows, outlines, borders, descenders)
  const rawPaintBounds = options.paintBounds || {
    left: bounds.x,
    top: bounds.y,
    right: bounds.x + bounds.width,
    bottom: bounds.y + bounds.height
  };

  const paintBounds = {
    left: toFinite(rawPaintBounds.left, bounds.x),
    top: toFinite(rawPaintBounds.top, bounds.y),
    right: toFinite(rawPaintBounds.right, bounds.x + bounds.width),
    bottom: toFinite(rawPaintBounds.bottom, bounds.y + bounds.height)
  };

  const rawPaintBoundsDp = options.paintBoundsDp;
  const paintBoundsDp = {
    left: toFinite(rawPaintBoundsDp?.left, Number((paintBounds.left / density).toFixed(2))),
    top: toFinite(rawPaintBoundsDp?.top, Number((paintBounds.top / density).toFixed(2))),
    right: toFinite(rawPaintBoundsDp?.right, Number((paintBounds.right / density).toFixed(2))),
    bottom: toFinite(rawPaintBoundsDp?.bottom, Number((paintBounds.bottom / density).toFixed(2)))
  };

  // 3. Paint Order and Z-Index
  const paintOrder = typeof options.paintOrder === 'number' ? options.paintOrder : 0;
  const zIndex = typeof options.zIndex === 'number' ? options.zIndex : 0;

  // 4. Stacking Context
  const stackingContext = options.stackingContext ? {
    isRoot: Boolean(options.stackingContext.isRoot),
    parentContextId: options.stackingContext.parentContextId || undefined,
    zIndex: typeof options.stackingContext.zIndex === 'number' ? options.stackingContext.zIndex : zIndex,
    reason: options.stackingContext.reason || undefined
  } : undefined;

  // 5. Clip Chain
  const clipChain = Array.isArray(options.clipChain)
    ? options.clipChain.map(clip => ({
        clipType: clip.clipType || 'rect',
        bounds: {
          x: toFinite(clip.bounds?.x, 0),
          y: toFinite(clip.bounds?.y, 0),
          width: toNonNegative(clip.bounds?.width, 0),
          height: toNonNegative(clip.bounds?.height, 0)
        },
        radiiDp: Array.isArray(clip.radiiDp) ? clip.radiiDp.map(r => toNonNegative(r, 0)) : undefined,
        pathData: clip.pathData || undefined
      }))
    : [];

  // 6. Transform Chain
  const transformChain = Array.isArray(options.transformChain)
    ? options.transformChain.map(t => ({
        matrix: Array.isArray(t.matrix) && t.matrix.length === 6 ? t.matrix.map(m => toFinite(m, 0)) : [1, 0, 0, 1, 0, 0],
        description: t.description || undefined,
        decomposed: t.decomposed || undefined
      }))
    : [];

  // 7. Typography Telemetry (Text Runs, Baselines, Line Breaks)
  // Handles empty text content without crashing
  const textRuns = Array.isArray(options.textRuns)
    ? options.textRuns.map(run => {
        const fontSizePx = toNonNegative(run.fontSizePx, 14);
        const fontSizeSp = toNonNegative(run.fontSizeSp, Number((fontSizePx / density).toFixed(1)));
        const lineHeightPx = toNonNegative(run.lineHeightPx, Math.round(fontSizePx * 1.3));
        const lineHeightSp = toNonNegative(run.lineHeightSp, Number((lineHeightPx / density).toFixed(1)));

        return {
          content: run.content !== undefined ? String(run.content) : '',
          fontFamily: run.fontFamily || 'ABC Arizona Sans',
          fontSizePx,
          fontSizeSp,
          fontWeight: Number(toFinite(run.fontWeight, 400)),
          fontStyle: run.fontStyle === 'italic' ? 'italic' : 'normal',
          letterSpacingEm: toFinite(run.letterSpacingEm, 0),
          lineHeightPx,
          lineHeightSp,
          colorHex: run.colorHex || '#1A1A1A',
          textAlign: run.textAlign || 'left',
          fontOpticalSizing: run.fontOpticalSizing || undefined,
          fontVariationSettings: run.fontVariationSettings || undefined,
          opticalSize: run.opticalSize !== undefined ? toFinite(run.opticalSize, 0) : undefined
        };
      })
    : [];

  const baselines = options.baselines ? {
    firstBaselinePx: toFinite(options.baselines.firstBaselinePx, bounds.y + bounds.height * 0.8),
    lastBaselinePx: toFinite(options.baselines.lastBaselinePx, bounds.y + bounds.height * 0.8),
    alphabeticBaselineY: toFinite(options.baselines.alphabeticBaselineY, bounds.y + bounds.height * 0.8),
    ideographicBaselineY: options.baselines.ideographicBaselineY !== undefined
      ? toFinite(options.baselines.ideographicBaselineY, 0)
      : undefined
  } : {
    firstBaselinePx: Number((bounds.y + bounds.height * 0.8).toFixed(2)),
    lastBaselinePx: Number((bounds.y + bounds.height * 0.8).toFixed(2)),
    alphabeticBaselineY: Number((bounds.y + bounds.height * 0.8).toFixed(2))
  };

  const lineBreaks = Array.isArray(options.lineBreaks)
    ? options.lineBreaks.map(lb => ({
        lineIndex: Number(toFinite(lb.lineIndex, 0)),
        startIndex: Number(toFinite(lb.startIndex, 0)),
        endIndex: Number(toFinite(lb.endIndex, 0)),
        text: lb.text || undefined,
        bounds: {
          x: toFinite(lb.bounds?.x, 0),
          y: toFinite(lb.bounds?.y, 0),
          width: toNonNegative(lb.bounds?.width, 0),
          height: toNonNegative(lb.bounds?.height, 0)
        }
      }))
    : [];

  // 8. Computed Paint Properties
  const computedPaint = {
    backgroundColor: options.computedPaint?.backgroundColor || options.style?.backgroundColor || '#00000000',
    opacity: Number(options.computedPaint?.opacity ?? options.style?.opacity ?? 1.0),
    borderRadius: options.computedPaint?.borderRadius || options.style?.borderRadius || {
      topLeft: 0, topRight: 0, bottomRight: 0, bottomLeft: 0
    },
    border: options.computedPaint?.border || options.style?.border || undefined,
    boxShadows: Array.isArray(options.computedPaint?.boxShadows || options.style?.boxShadows)
      ? (options.computedPaint?.boxShadows || options.style?.boxShadows)
      : []
  };

  // 9. Semantics and Hit Regions
  const semantics = {
    role: options.semantics?.role || (options.clickable ? 'button' : 'container'),
    isInteractive: Boolean(options.semantics?.isInteractive ?? options.clickable),
    contentDescription: options.semantics?.contentDescription || options.contentDescription || '',
    clickable: Boolean(options.semantics?.clickable ?? options.clickable),
    focusable: Boolean(options.semantics?.focusable ?? options.focusable),
    enabled: options.semantics?.enabled !== undefined ? Boolean(options.semantics.enabled) : true,
    selected: options.semantics?.selected !== undefined ? Boolean(options.semantics.selected) : undefined,
    checked: options.semantics?.checked !== undefined ? Boolean(options.semantics.checked) : undefined,
    expanded: options.semantics?.expanded !== undefined ? Boolean(options.semantics.expanded) : undefined
  };

  // Hit region expansion for touch target accessibility (>= 48dp)
  const minHitW = Math.max(48, boundsDp.width);
  const minHitH = Math.max(48, boundsDp.height);
  const slopX = Math.max(0, (48 - boundsDp.width) / 2);
  const slopY = Math.max(0, (48 - boundsDp.height) / 2);

  const hitRegions = {
    visualBoundsDp: { ...boundsDp },
    interactiveBoundsDp: {
      x: Number((boundsDp.x - slopX).toFixed(2)),
      y: Number((boundsDp.y - slopY).toFixed(2)),
      width: Number(minHitW.toFixed(2)),
      height: Number(minHitH.toFixed(2))
    },
    meetsMinTouchTarget: boundsDp.width >= 48 && boundsDp.height >= 48,
    slopInsetsDp: {
      top: Number(slopY.toFixed(2)),
      right: Number(slopX.toFixed(2)),
      bottom: Number(slopY.toFixed(2)),
      left: Number(slopX.toFixed(2))
    }
  };

  const node = {
    id: options.id || `node_${Math.random().toString(36).substring(2, 9)}`,
    sourceId: options.sourceId || 'daylight#root/node',
    domTag: options.domTag || options.tag || 'div',
    domClasses: Array.isArray(options.domClasses) ? [...options.domClasses] : [],
    bounds,
    boundsDp,
    paintBounds,
    paintBoundsDp,
    paintOrder,
    zIndex,
    stackingContext,
    clipChain,
    transformChain,
    textRuns,
    baselines,
    lineBreaks,
    computedPaint,
    semantics,
    hitRegions,
    children: []
  };

  if (Array.isArray(options.children) && options.children.length > 0) {
    node.children = options.children.map(child => createMeasuredNode({
      ...child,
      density,
      _rawNode: (child && typeof child === 'object' && child._rawNode) ? child._rawNode : child
    }, visited));
  }

  return node;
}

/**
 * Normalizes viewport properties, preserving explicit negative/invalid inputs for schema validation,
 * while defaulting missing density, widthDp, heightDp, orientation.
 */
function normalizeViewport(vp = {}, defaultOrientation = 'portrait') {
  const widthPx = vp.widthPx;
  const heightPx = vp.heightPx;
  const density = typeof vp.density === 'number' && Number.isFinite(vp.density) && vp.density > 0 ? vp.density : 2.0;
  const widthDp = typeof vp.widthDp === 'number' && Number.isFinite(vp.widthDp) ? vp.widthDp : (typeof widthPx === 'number' ? widthPx / density : (defaultOrientation === 'landscape' ? 792 : 592));
  const heightDp = typeof vp.heightDp === 'number' && Number.isFinite(vp.heightDp) ? vp.heightDp : (typeof heightPx === 'number' ? heightPx / density : (defaultOrientation === 'landscape' ? 592 : 792));
  const orientation = vp.orientation || defaultOrientation;

  return {
    ...vp,
    widthPx: widthPx !== undefined ? widthPx : (orientation === 'landscape' ? 1584 : 1184),
    heightPx: heightPx !== undefined ? heightPx : (orientation === 'landscape' ? 1184 : 1584),
    density: vp.density !== undefined ? vp.density : density,
    widthDp: vp.widthDp !== undefined ? vp.widthDp : widthDp,
    heightDp: vp.heightDp !== undefined ? vp.heightDp : heightDp,
    orientation
  };
}

/**
 * Creates an immutable MeasuredSceneBundle conforming to Draft 2020-12 schema.
 * Exposes loadedFonts and loadedAssets directly for test ergonomics and within scenes.
 *
 * @param {Object} options
 * @returns {Object} MeasuredSceneBundle
 */
function createMeasuredBundle(options = {}) {
  const version = '2.0.0';
  const screenId = options.screenId || 'default_screen';
  const capturedAt = options.capturedAt || new Date().toISOString();
  const engineVersion = options.engineVersion || 'ctc-playwright-2.0.0';

  const loadedFonts = Array.isArray(options.loadedFonts) ? [...options.loadedFonts] : [];
  const loadedAssets = Array.isArray(options.loadedAssets)
    ? [...options.loadedAssets]
    : (Array.isArray(options.assets) ? [...options.assets] : (Array.isArray(options.vectors) ? [...options.vectors] : []));

  const scenes = {};
  if (options.scenes && typeof options.scenes === 'object' && Object.keys(options.scenes).length > 0) {
    for (const [key, scene] of Object.entries(options.scenes)) {
      const defaultOrient = key.includes('landscape') ? 'landscape' : 'portrait';
      scenes[key] = {
        viewport: normalizeViewport(scene.viewport, defaultOrient),
        screenshotHash: scene.screenshotHash || 'sha256:0000000000000000000000000000000000000000000000000000000000000000',
        screenshotPath: scene.screenshotPath || `screenshots/${key}.png`,
        loadedFonts: (Array.isArray(scene.loadedFonts) && scene.loadedFonts.length > 0) ? scene.loadedFonts : loadedFonts,
        loadedAssets: (Array.isArray(scene.loadedAssets) && scene.loadedAssets.length > 0) ? scene.loadedAssets : loadedAssets,
        rootNode: scene.rootNode ? createMeasuredNode(scene.rootNode) : createMeasuredNode({ sourceId: `daylight#${screenId}/root` })
      };
    }
  } else {
    scenes.daylight_portrait = {
      viewport: normalizeViewport(options.viewport, 'portrait'),
      screenshotHash: options.screenshotHash || 'sha256:0000000000000000000000000000000000000000000000000000000000000000',
      screenshotPath: options.screenshotPath || 'screenshots/daylight_portrait.png',
      loadedFonts,
      loadedAssets,
      rootNode: options.rootNode ? createMeasuredNode(options.rootNode) : createMeasuredNode({ sourceId: `daylight#${screenId}/root` })
    };
  }

  const bundle = {
    version,
    screenId,
    capturedAt,
    engineVersion,
    loadedFonts,
    loadedAssets,
    scenes
  };

  return bundle;
}

module.exports = {
  createMeasuredNode,
  createMeasuredBundle,
  allocateSourceId,
  isValidSha256
};
