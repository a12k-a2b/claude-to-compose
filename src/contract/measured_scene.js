'use strict';

/**
 * src/contract/measured_scene.js
 *
 * Layer 1 (Measured Scene) interface for ctc v2 design contract.
 */

const {
  createMeasuredNode,
  createMeasuredBundle,
  allocateSourceId,
  isValidSha256
} = require('./measured_scene_builder');

module.exports = {
  createMeasuredNode,
  createMeasuredBundle,
  allocateSourceId,
  isValidSha256
};
