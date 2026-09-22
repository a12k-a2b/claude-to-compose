'use strict';

/**
 * src/cli/commands/profile.js
 *
 * Handler for `ctc profile export [name]`, `list`, `validate`.
 */

const { exportProfile, listProfiles, loadProfile, validateProfile } = require('../../profiles');

function execute(parsed) {
  const subAction = parsed._[0] || 'list';

  if (subAction === 'export') {
    const profileId = parsed._[1] || 'daylight-dc1';
    const outputPath = parsed.flags.output || parsed.flags.o;
    const force = Boolean(parsed.flags.force || parsed.flags.f);

    const receipt = exportProfile(profileId, outputPath, { force });
    return {
      success: true,
      status: 'PASS',
      command: 'profile export',
      timestamp: new Date().toISOString(),
      data: receipt,
      defects: [],
      exitCode: 0,
      humanOutput: `Exported profile "${receipt.profileId}" (v${receipt.version}) to ${receipt.outputPath}`
    };
  }

  if (subAction === 'list') {
    const profiles = listProfiles();
    return {
      success: true,
      status: 'PASS',
      command: 'profile list',
      timestamp: new Date().toISOString(),
      data: { profiles },
      defects: [],
      exitCode: 0,
      humanOutput: profiles.map((p) => `  * ${p.id}: ${p.name} (${p.technology}, ${p.dimensions})`).join('\n')
    };
  }

  if (subAction === 'validate') {
    const profileId = parsed._[1] || 'daylight-dc1';
    const profile = loadProfile(profileId);
    const val = validateProfile(profile);

    return {
      success: val.valid,
      status: val.valid ? 'PASS' : 'FAIL',
      command: 'profile validate',
      timestamp: new Date().toISOString(),
      data: val,
      defects: val.issues || [],
      exitCode: val.valid ? 0 : 1,
      humanOutput: val.valid ? `Profile "${profileId}" is valid` : `Profile "${profileId}" validation failed:\n  - ${val.issues.join('\n  - ')}`
    };
  }

  throw new Error(`Unknown profile action: "${subAction}". Allowed: export, list, validate`);
}

module.exports = { execute };
