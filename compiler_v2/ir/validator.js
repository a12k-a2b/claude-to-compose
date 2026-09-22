'use strict';

/**
 * compiler_v2/ir/validator.js
 *
 * Validates Design IR against fail-closed correctness invariants.
 */

function validateNode(node, errors = [], visitedSourceIds = new Set()) {
  if (!node) {
    errors.push('Null or undefined node encountered');
    return errors;
  }

  if (!node.id || typeof node.id !== 'string') {
    errors.push(`Node missing valid string id: ${JSON.stringify(node)}`);
  }

  if (!node.sourceId || typeof node.sourceId !== 'string') {
    errors.push(`Node ${node.id} missing valid string sourceId`);
  } else {
    if (visitedSourceIds.has(node.sourceId)) {
      errors.push(`Duplicate sourceId detected: ${node.sourceId}`);
    }
    visitedSourceIds.add(node.sourceId);
  }

  if (!node.category) {
    errors.push(`Node ${node.id} (${node.sourceId}) missing category`);
  }

  if (!node.loweringStrategy || !['native-first', 'fidelity-first', 'hybrid'].includes(node.loweringStrategy)) {
    errors.push(`Node ${node.id} (${node.sourceId}) has invalid loweringStrategy: ${node.loweringStrategy}`);
  }

  const measured = node.measured;
  if (!measured || !measured.bounds || !measured.boundsDp) {
    errors.push(`Node ${node.id} (${node.sourceId}) missing measured bounds or boundsDp`);
  } else {
    const { width, height } = measured.boundsDp;
    if (typeof width !== 'number' || typeof height !== 'number' || Number.isNaN(width) || Number.isNaN(height)) {
      errors.push(`Node ${node.id} (${node.sourceId}) has non-numeric boundsDp dimensions: ${width}x${height}`);
    }
  }

  if (node.behavior?.isInteractive) {
    const target = node.behavior.minTouchTargetDp;
    if (!target || target.width < 48 || target.height < 48) {
      errors.push(`Interactive node ${node.id} (${node.sourceId}) does not meet 48dp minimum touch target: ${JSON.stringify(target)}`);
    }
  }

  if (Array.isArray(node.children)) {
    for (const child of node.children) {
      validateNode(child, errors, visitedSourceIds);
    }
  }

  return errors;
}

function validateDesignIR(ir) {
  const errors = [];

  if (!ir) {
    return { valid: false, errors: ['IR is null or undefined'] };
  }

  if (ir.version !== '2.0.0') {
    errors.push(`Unsupported IR version: ${ir.version}`);
  }

  if (!ir.viewport || !ir.viewport.width || !ir.viewport.height) {
    errors.push('IR missing valid viewport specification');
  }

  if (!ir.root) {
    errors.push('IR missing root node');
  } else {
    validateNode(ir.root, errors);
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

module.exports = {
  validateDesignIR,
  validateNode
};
