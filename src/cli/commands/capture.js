'use strict';

/**
 * src/cli/commands/capture.js
 *
 * Handler for `ctc capture <design-artifact-dir>`.
 */

const path = require('node:path');
const { captureEvidenceBundle } = require('../../extractor/capture');

async function execute(parsed) {
  const input = parsed._[0] || parsed.flags.input || '.';
  const isUrl = typeof input === 'string' && (input.startsWith('http://') || input.startsWith('https://'));
  const resolvedInput = isUrl ? input : path.resolve(process.cwd(), input);

  const screenId = parsed.flags.screen || parsed.flags.screenId;
  const profile = parsed.flags.profile || 'daylight-dc1';
  const outputDir = parsed.flags.output || parsed.flags.outputDir;

  const res = await captureEvidenceBundle(resolvedInput, {
    screenId,
    profile,
    outputDir
  });

  return {
    success: res.success,
    status: res.success ? 'PASS' : 'FAIL',
    command: 'capture',
    timestamp: new Date().toISOString(),
    data: res,
    defects: [],
    exitCode: res.success ? 0 : 1,
    humanOutput: `Evidence bundle captured successfully at ${res.evidenceDir || 'output'}`
  };
}

module.exports = { execute };
