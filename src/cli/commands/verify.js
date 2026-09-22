'use strict';

/**
 * src/cli/commands/verify.js
 *
 * Handler for `ctc verify <screen-id>`.
 */

const path = require('node:path');
const { runVerificationPipeline } = require('../../verification/pipeline');

async function execute(parsed) {
  const screenId = parsed._[0] || parsed.flags.screen || 'note_editor';
  const appDir = parsed.flags.appDir || parsed.flags['app-dir'] || '.';
  const resolvedAppDir = path.resolve(process.cwd(), appDir);

  const res = await runVerificationPipeline(screenId, resolvedAppDir, {
    stage: parsed.flags.stage,
    untilStage: parsed.flags['until-stage'] || parsed.flags.untilStage,
    profile: parsed.flags.profile || 'daylight-dc1',
    evidenceDir: parsed.flags.evidence,
    outputDir: parsed.flags.output
  });

  const outcome = res.outcome || res.status || (res.passed || res.success ? 'PASS' : 'FAIL');
  const isPass = outcome === 'PASS';
  let exitCode = 0;
  if (outcome === 'BLOCKED') {
    exitCode = 2;
  } else if (outcome === 'FAIL' || outcome === 'ERROR' || !isPass) {
    exitCode = 1;
  } else {
    exitCode = 0;
  }

  const passedStages = Array.isArray(res.stages)
    ? res.stages.filter((s) => s.status === 'PASS').length
    : (res.stagesExecutedCount || 0);
  const totalStages = res.stagesTotal || 6;

  return {
    success: isPass,
    status: outcome,
    command: 'verify',
    timestamp: new Date().toISOString(),
    data: res,
    defects: res.defects || [],
    exitCode,
    humanOutput: `Verification ${outcome}: ${passedStages}/${totalStages} stage(s) passed`
  };
}

module.exports = { execute };
