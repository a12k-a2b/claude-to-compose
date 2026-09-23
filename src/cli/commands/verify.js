'use strict';

/**
 * src/cli/commands/verify.js
 *
 * Handler for `ctc verify <screen-id>`.
 */

const fs = require('node:fs');
const path = require('node:path');
const { runVerificationPipeline } = require('../../verification/pipeline');
const { verifyCandidateWorktree, InputError, BlockedError } = require('../../verification/candidate_verifier');

function execute(parsed) {
  const outputPath = parsed.flags.output || parsed.flags.o || parsed.flags.outputDir;
  if (outputPath && fs.existsSync(outputPath)) {
    const st = fs.statSync(outputPath);
    if (!st.isDirectory()) {
      throw new InputError(`output path "${outputPath}" collides with an existing protected file`);
    }
  }

  return (async () => {
    const screenId = parsed._[0] || parsed.flags.screen || 'note_editor';
  const appDir = parsed.flags.appDir || parsed.flags['app-dir'] || '.';
  const resolvedAppDir = path.resolve(process.cwd(), appDir);
  const candidatePath = parsed.flags.candidate || parsed.flags.c;
  const approvalPath = parsed.flags.approval || parsed.flags.A;

  let candidateInfo = null;
  if (candidatePath) {
    try {
      candidateInfo = verifyCandidateWorktree({
        candidate: candidatePath,
        baselineRoot: resolvedAppDir,
        contractPath: parsed.flags.contract,
        approval: approvalPath,
        screenId,
        throwOnError: true
      });
    } catch (err) {
      const exitCode = (err instanceof BlockedError) ? 2 : (err instanceof InputError ? 3 : 1);
      const status = (err instanceof BlockedError) ? 'BLOCKED' : 'FAIL';
      return {
        success: false,
        status,
        command: 'verify',
        timestamp: new Date().toISOString(),
        error: err.message,
        defects: [{
          stage: 'STAGE_1_SCHEMA_PROVENANCE',
          category: err.name === 'InputError' ? 'PROVENANCE' : (err.name === 'BlockedError' ? 'EVIDENCE_MISSING' : 'GENERAL'),
          severity: 'CRITICAL',
          message: err.message,
          path: candidatePath,
          errorCode: err.name || 'CANDIDATE_VERIFICATION_FAILED'
        }],
        exitCode,
        humanOutput: `Verification ${status}: Candidate worktree verification failed: ${err.message}`
      };
    }
  }

  const verificationTargetDir = candidateInfo ? candidateInfo.candidateRoot : resolvedAppDir;

  const res = await runVerificationPipeline(screenId, verificationTargetDir, {
    stage: parsed.flags.stage,
    untilStage: parsed.flags['until-stage'] || parsed.flags.untilStage,
    profile: parsed.flags.profile || 'daylight-dc1',
    evidenceDir: parsed.flags.evidence,
    outputDir: parsed.flags.output,
    approval: approvalPath,
    candidate: candidateInfo ? candidateInfo.candidateRoot : null,
    candidateInfo,
    baselineRoot: resolvedAppDir
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
    data: {
      ...res,
      candidateInfo: candidateInfo || null
    },
    defects: res.defects || [],
    exitCode,
    humanOutput: `Verification ${outcome}: ${passedStages}/${totalStages} stage(s) passed`
  };
  })();
}

module.exports = { execute };

