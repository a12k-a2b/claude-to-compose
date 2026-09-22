'use strict';

/**
 * src/cli/commands/defects.js
 *
 * Handler for `ctc defects <verification-report>`.
 */

const fs = require('node:fs');
const path = require('node:path');
const { diagnoseDefects } = require('../../defects/oracle');

function execute(parsed) {
  const reportFile = parsed._[0] || parsed.flags.report;
  let report = null;

  if (reportFile) {
    const resolvedPath = path.resolve(process.cwd(), reportFile);
    if (!fs.existsSync(resolvedPath)) {
      throw new Error(`Verification report file does not exist: "${resolvedPath}"`);
    }
    report = JSON.parse(fs.readFileSync(resolvedPath, 'utf8'));
  } else {
    // Look for latest report in .ctc/reports
    const defaultReport = path.resolve('.ctc/reports/verification-report.json');
    if (fs.existsSync(defaultReport)) {
      report = JSON.parse(fs.readFileSync(defaultReport, 'utf8'));
    } else {
      report = { status: 'PASS', stages: {} };
    }
  }

  const diagnosis = diagnoseDefects(report, {
    outputDir: parsed.flags.output
  });

  const hasDefects = (diagnosis.defects && diagnosis.defects.length > 0);
  return {
    success: !hasDefects,
    status: hasDefects ? 'FAIL' : 'PASS',
    command: 'defects',
    timestamp: new Date().toISOString(),
    data: diagnosis,
    defects: diagnosis.defects || [],
    exitCode: hasDefects ? 1 : 0,
    humanOutput: hasDefects ? `Defect Oracle diagnosed ${diagnosis.defects.length} defect(s)` : 'Defect Oracle: 0 defects detected'
  };
}

module.exports = { execute };
