#!/usr/bin/env node

/**
 * bin/claude-to-compose.js
 * CLI executable for claude-to-compose.
 * Autonomous end-to-end pipeline executing Extraction, Synthesis, Verification, and Closed-Loop Auto-Tuning.
 */

const { runCli } = require('../skills/claude-to-compose/workflow.js');

runCli();
