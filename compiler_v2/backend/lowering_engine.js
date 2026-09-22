'use strict';

/**
 * compiler_v2/backend/lowering_engine.js
 *
 * Core capability-aware Compose backend.
 * Operates strictly on generic IR properties without artifact-ID conditionals.
 */

const { lowerTextNode, lowerButtonNode, lowerChipGroupNode, lowerImageNode } = require('./native_strategy');
const { lowerCanvasIllustration } = require('./fidelity_strategy');
const { emitKotlinScreen } = require('./compose_emitter');

function lowerNode(node, context) {
  const telemetry = {
    id: node.id,
    sourceId: node.sourceId,
    category: node.category,
    strategy: node.loweringStrategy,
    status: 'EXACT',
    targetComposable: '',
    codeSnippet: ''
  };

  let code = '';

  if (node.category === 'canvas' || node.loweringStrategy === 'fidelity-first') {
    code = lowerCanvasIllustration(node);
    telemetry.targetComposable = node.componentType === 'Compass' ? 'CompassRoseGraphic' : 'Canvas';
    telemetry.status = 'EXACT';
  } else if (node.category === 'image') {
    code = lowerImageNode(node);
    telemetry.targetComposable = 'Image';
    telemetry.status = 'EXACT';
  } else if (node.category === 'button') {
    code = lowerButtonNode(node);
    telemetry.targetComposable = 'Surface(shape = CircleShape) / Button';
    telemetry.status = 'EXACT';
  } else if (node.category === 'text') {
    code = lowerTextNode(node);
    telemetry.targetComposable = 'Text';
    telemetry.status = 'EXACT';
  } else if (node.category === 'chip_group') {
    code = lowerChipGroupNode(node);
    telemetry.targetComposable = 'Column / DaylightChip (Surface)';
    telemetry.status = 'EXACT';
  }

  telemetry.codeSnippet = code;
  context.telemetryList.push(telemetry);
  return code;
}

function compileIRToCompose(ir, options = {}) {
  const screenName = options.screenName || 'GeneratedDc1Screen';
  const packagePath = options.packagePath || 'com.claude.compose.screen';

  const context = {
    telemetryList: []
  };

  const components = [];

  // Traverse and lower root children generically
  if (Array.isArray(ir.root.children)) {
    for (const child of ir.root.children) {
      const code = lowerNode(child, context);
      if (code) components.push(code);
    }
  }

  const kotlinCode = emitKotlinScreen(screenName, packagePath, components);

  return {
    kotlinCode,
    telemetry: context.telemetryList
  };
}

module.exports = {
  compileIRToCompose,
  lowerNode
};
