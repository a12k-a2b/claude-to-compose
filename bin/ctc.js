#!/usr/bin/env node
'use strict';

/**
 * bin/ctc.js
 *
 * Executable entrypoint for the Unified Claude to Compose (ctc) v2 CLI.
 * Dispatches command-line arguments to src/cli/dispatcher.js and propagates exit codes.
 */

const dispatcher = require('../src/cli/dispatcher');

async function main() {
  const args = process.argv.slice(2);
  const parsed = dispatcher.parseArgs(args);
  const isJson = Boolean(parsed.flags.json);
  const result = await dispatcher.dispatch(args);

  if (result.output && !process.stdout.destroyed) {
    if (isJson || result.exitCode === 0) {
      process.stdout.write(result.output + '\n');
    } else {
      process.stderr.write(result.output + '\n');
    }
  }

  process.exit(result.exitCode !== undefined ? result.exitCode : 0);
}

// Attach process signal handlers
dispatcher.handleSignals();

if (require.main === module) {
  main().catch((err) => {
    process.stderr.write(`Fatal Error: ${err.message}\n`);
    process.exit(dispatcher.EXIT_CODES.INFRASTRUCTURE_ERROR);
  });
}

module.exports = { main };
