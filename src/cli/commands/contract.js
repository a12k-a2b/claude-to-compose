'use strict';

/**
 * src/cli/commands/contract.js
 *
 * Handler for `ctc contract build <screen-id>` and `ctc contract validate <contract-file>`.
 */

const fs = require('node:fs');
const path = require('node:path');
const { buildDesignContract, validateContractAgainstSchemas } = require('../../contract/compiler');

function execute(parsed) {
  const subAction = parsed._[0];

  if (subAction === 'build') {
    const screenId = parsed._[1] || parsed.flags.screen;
    if (!screenId) {
      throw new Error('Screen ID required for "contract build" (e.g. ctc contract build note_editor)');
    }
    const outputPath = parsed.flags.output || parsed.flags.o || parsed.flags.outputDir;
    if (outputPath && fs.existsSync(outputPath)) {
      const st = fs.statSync(outputPath);
      if (!st.isDirectory()) {
        const { InputError } = require('../../agent/safety');
        throw new InputError(`output directory "${outputPath}" collides with a protected regular file`);
      }
    }
    const evidenceDir = parsed.flags.evidence || (parsed.flags.workspace ? path.join(parsed.flags.workspace, 'evidence') : path.resolve('.ctc/designs', screenId, 'evidence'));
    const res = buildDesignContract(screenId, evidenceDir, {
      outputDir: parsed.flags.output,
      profile: parsed.flags.profile,
      strict: Boolean(parsed.flags.strict)
    });

    return {
      success: res.success,
      status: res.success ? 'PASS' : 'FAIL',
      command: 'contract build',
      timestamp: new Date().toISOString(),
      data: res,
      defects: res.validation?.errors || [],
      exitCode: res.success ? 0 : 1,
      humanOutput: `Contract built for screen "${screenId}" at ${res.outputDir}`
    };
  }

  if (subAction === 'validate') {
    const contractPath = parsed._[1] || parsed.flags.contract || parsed.flags.file;
    if (!contractPath) {
      throw new Error('Contract file required for "contract validate" (e.g. ctc contract validate path/to/contract.json)');
    }
    const resolvedPath = path.resolve(process.cwd(), contractPath);
    if (!fs.existsSync(resolvedPath)) {
      throw new Error(`Contract file does not exist: "${resolvedPath}"`);
    }

    const contract = JSON.parse(fs.readFileSync(resolvedPath, 'utf8'));
    const validation = validateContractAgainstSchemas(contract);

    return {
      success: validation.valid,
      status: validation.valid ? 'PASS' : 'FAIL',
      command: 'contract validate',
      timestamp: new Date().toISOString(),
      data: validation,
      defects: validation.errors || [],
      exitCode: validation.valid ? 0 : 1,
      humanOutput: validation.valid ? 'Contract validation PASS (all 4 layers valid)' : `Contract validation FAIL:\n  - ${validation.errors.join('\n  - ')}`
    };
  }

  throw new Error(`Unknown contract action: "${subAction}". Allowed: build, validate`);
}

module.exports = { execute };
