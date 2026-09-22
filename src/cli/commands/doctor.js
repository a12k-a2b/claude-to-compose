'use strict';

/**
 * src/cli/commands/doctor.js
 *
 * Handler for `ctc doctor`.
 */

const { runDoctor } = require('../doctor');

function execute(parsed) {
  const options = {
    json: Boolean(parsed.flags.json),
    requireDevice: Boolean(parsed.flags['require-device'] || parsed.flags.requireDevice),
    android: parsed.flags.android || parsed.flags.appDir || parsed.flags['app-dir'] || '.',
    profile: parsed.flags.profile || 'daylight-dc1',
    strict: Boolean(parsed.flags.strict),
    quiet: true // Dispatcher handles printing
  };

  const result = runDoctor(options);
  return result;
}

module.exports = { execute };
