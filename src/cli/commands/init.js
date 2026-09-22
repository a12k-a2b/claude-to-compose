'use strict';

/**
 * src/cli/commands/init.js
 *
 * Handler for `ctc init [dir]`.
 */

const path = require('node:path');
const { initWorkspace } = require('../../config/workspace');

function execute(parsed) {
  const targetDir = parsed._[0] || process.cwd();
  const options = {
    profile: parsed.flags.profile,
    module: parsed.flags.module,
    variant: parsed.flags.variant,
    android: parsed.flags.android || parsed.flags.appDir || parsed.flags['app-dir']
  };

  const res = initWorkspace(targetDir, options);
  return {
    success: true,
    status: 'PASS',
    command: 'init',
    timestamp: new Date().toISOString(),
    data: res,
    defects: [],
    exitCode: 0,
    humanOutput: `Initialized .ctc workspace in ${res.workspaceDir}\nConfiguration written to .ctc/config.json and .ctc/project.toml`
  };
}

module.exports = { execute };
