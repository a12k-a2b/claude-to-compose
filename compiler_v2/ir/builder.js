'use strict';

/**
 * compiler_v2/ir/builder.js
 *
 * Constructs the evidence-preserving 3-layer Intermediate Representation (IR).
 * Facts (measured) are kept strictly distinct from Layout Intent and Behavior.
 */

function buildNodeIR(rawNode, parent = null, density = 2.0) {
  const id = rawNode.id || `node_${Math.random().toString(36).substring(2, 9)}`;
  const sourceId = rawNode.sourceId || `${parent ? parent.sourceId : 'root'}/${rawNode.tag || 'node'}`;
  
  // 1. Measured Layer (Physical observations)
  const bounds = rawNode.bounds || { x: 0, y: 0, width: 0, height: 0 };
  const boundsDp = rawNode.boundsDp || {
    x: Number((bounds.x / density).toFixed(2)),
    y: Number((bounds.y / density).toFixed(2)),
    width: Number((bounds.width / density).toFixed(2)),
    height: Number((bounds.height / density).toFixed(2))
  };

  const measured = {
    bounds: { ...bounds },
    boundsDp: { ...boundsDp },
    style: { ...(rawNode.style || {}) }
  };

  if (rawNode.text) {
    measured.textRun = {
      content: rawNode.text.content || '',
      fontFamily: rawNode.text.fontFamily || 'ABC Arizona Sans',
      fontSizeSp: rawNode.text.fontSize || 14,
      fontWeight: rawNode.text.fontWeight || 400,
      lineHeightSp: rawNode.text.lineHeight || (rawNode.text.fontSize ? rawNode.text.fontSize * 1.25 : 18),
      letterSpacing: rawNode.text.letterSpacing ?? 0,
      color: rawNode.text.color || '#1A1A1A',
      textAlign: rawNode.text.textAlign || 'left',
      opticalSize: rawNode.text.opticalSize || null
    };
  }

  // 2. Category & Strategy Classification
  let category = 'container';
  let loweringStrategy = rawNode.strategy || 'native-first';

  if (rawNode.type === 'CANVAS' || rawNode.tag === 'canvas' || rawNode.componentType === 'IllustrationCanvas' || rawNode.componentType === 'Compass' || rawNode.componentType === 'Frames') {
    category = 'canvas';
    loweringStrategy = 'fidelity-first';
  } else if (rawNode.type === 'IMAGE' || rawNode.tag === 'img' || rawNode.componentType === 'Image') {
    category = 'image';
    loweringStrategy = 'native-first';
  } else if (rawNode.type === 'BUTTON' || rawNode.tag === 'button' || rawNode.componentType === 'Button') {
    category = 'button';
    loweringStrategy = 'native-first';
  } else if (rawNode.type === 'TEXT' || rawNode.componentType === 'Text' || (rawNode.text && !rawNode.children?.length)) {
    category = 'text';
    loweringStrategy = 'native-first';
  } else if (rawNode.componentType === 'ChipGroup' || rawNode.chips) {
    category = 'chip_group';
    loweringStrategy = 'native-first';
  }

  // 3. Layout Intent Layer
  const layoutIntent = {
    sizing: {
      width: boundsDp.width >= 590 ? 'fill' : 'fixed',
      height: boundsDp.height >= 790 ? 'fill' : (category === 'text' ? 'wrap' : 'fixed'),
      fixedWidthDp: boundsDp.width,
      fixedHeightDp: boundsDp.height
    },
    flow: category === 'canvas' ? 'canvas_draw' : (category === 'container' ? 'overlay' : 'none'),
    alignment: category === 'text' && measured.textRun?.textAlign === 'center' ? 'CenterHorizontally' : 'Start',
    padding: {
      topDp: rawNode.layout?.padding?.top || 0,
      rightDp: rawNode.layout?.padding?.right || 0,
      bottomDp: rawNode.layout?.padding?.bottom || 0,
      leftDp: rawNode.layout?.padding?.left || 0
    }
  };

  // 4. Behavior Contract Layer
  const isDirectlyInteractive = category === 'button' || category === 'chip';
  const actionPascal = rawNode.text?.content
    ? rawNode.text.content.split(/\s+/).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join('')
    : 'Click';
  const behavior = {
    role: category === 'button' ? 'button' : (category === 'chip_group' ? 'group' : 'none'),
    isInteractive: isDirectlyInteractive,
    action: category === 'button' ? `on${actionPascal}Click` : null,
    minTouchTargetDp: isDirectlyInteractive ? { width: Math.max(48, boundsDp.width), height: Math.max(48, boundsDp.height) } : null,
    states: isDirectlyInteractive ? ['idle', 'pressed', 'focused'] : []
  };

  const irNode = {
    id,
    sourceId,
    category,
    loweringStrategy,
    measured,
    layoutIntent,
    behavior
  };

  if (rawNode.componentType) {
    irNode.componentType = rawNode.componentType;
  }

  if (rawNode.chips) {
    irNode.chipsData = { ...rawNode.chips };
  }

  if (rawNode.vectors) {
    irNode.vectors = [...rawNode.vectors];
  }

  if (Array.isArray(rawNode.children) && rawNode.children.length > 0) {
    irNode.children = rawNode.children.map(child => buildNodeIR(child, irNode, density));
  }

  return irNode;
}

function buildDesignIR(sourceScene) {
  if (!sourceScene || !sourceScene.root) {
    throw new Error('Invalid source scene: missing root node');
  }

  const viewport = sourceScene.metadata?.viewport || {
    width: 1184,
    height: 1584,
    widthDp: 592,
    heightDp: 792,
    density: 2.0,
    orientation: 'portrait'
  };

  const root = buildNodeIR(sourceScene.root, null, viewport.density);

  return {
    version: '2.0.0',
    viewport,
    tokens: {
      colors: {
        os0: '#FFFFFF',
        os50: '#F7F7F7',
        os100: '#E2E0D8',
        os150: '#F5F5F5',
        os200: '#CECECE',
        os300: '#858585',
        os400: '#535353',
        os800: '#343434',
        os900: '#1A1A1A',
        os1000: '#000000'
      },
      typography: {
        headline: 'ABC Arizona Flare',
        body: 'ABC Arizona Sans',
        mono: 'ABC ROM Mono'
      }
    },
    root
  };
}

module.exports = {
  buildDesignIR,
  buildNodeIR
};
