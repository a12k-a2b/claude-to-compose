'use strict';

/**
 * src/hardware/index.js
 *
 * Public Entry Point for Daylight Computer (DC1) Hardware Subsystem.
 * Exports FleetManager, McpBridge, Dc1Runner, and qualifyDc1Hardware.
 */

const { FleetManager, DC1_KNOWN_DEVICES, DC1_SERIAL_PATTERN, MIN_BATTERY_PERCENT } = require('./fleet_manager');
const { McpBridge, DC1_LOGICAL_WIDTH, DC1_LOGICAL_HEIGHT, DC1_INSET_PX, MIN_PHYSIOLOGICAL_DWELL_MS, STANDARD_DWELL_MS, FLUID_SETTLE_MS } = require('./mcp_bridge');
const { Dc1Runner, runDc1Qualification, DEFAULT_NOTE_APP_APK, DEFAULT_LEGACY_APK } = require('./dc1_runner');

module.exports = {
  FleetManager,
  McpBridge,
  Dc1Runner,
  qualifyDc1Hardware: runDc1Qualification,
  runDc1Qualification,
  DC1_KNOWN_DEVICES,
  DC1_SERIAL_PATTERN,
  MIN_BATTERY_PERCENT,
  DC1_LOGICAL_WIDTH,
  DC1_LOGICAL_HEIGHT,
  DC1_INSET_PX,
  MIN_PHYSIOLOGICAL_DWELL_MS,
  STANDARD_DWELL_MS,
  FLUID_SETTLE_MS,
  DEFAULT_NOTE_APP_APK,
  DEFAULT_LEGACY_APK
};
