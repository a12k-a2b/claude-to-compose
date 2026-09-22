'use strict';

/**
 * compiler_v2/conformance/mapping_reporter.js
 *
 * Generates the lowering mapping report (Deliverable 2).
 * Shows exactly how each source node was lowered to Compose.
 */

const fs = require('fs');
const path = require('path');

function generateMappingReport(telemetryList, outputPath = 'output/conformance') {
  const jsonReport = {
    version: '2.0.0',
    timestamp: new Date().toISOString(),
    nodesCount: telemetryList.length,
    mappings: telemetryList.map(t => ({
      id: t.id,
      sourceId: t.sourceId,
      category: t.category,
      strategy: t.strategy,
      targetComposable: t.targetComposable,
      status: t.status
    }))
  };

  let md = `# Node Lowering Mapping Report (Deliverable 2)\n\n`;
  md += `**Execution Date**: ${jsonReport.timestamp}  \n`;
  md += `**Total Lowered Nodes**: ${telemetryList.length}  \n\n`;
  md += `| Source ID | Category | Strategy | Target Composable | Lowering Status |\n`;
  md += `| :--- | :--- | :--- | :--- | :--- |\n`;

  for (const item of jsonReport.mappings) {
    md += `| \`${item.sourceId}\` | ${item.category} | ${item.strategy} | \`${item.targetComposable}\` | **${item.status}** |\n`;
  }

  md += `\n## Lowering Strategy Breakdown\n\n`;
  const nativeCount = telemetryList.filter(t => t.strategy === 'native-first').length;
  const fidelityCount = telemetryList.filter(t => t.strategy === 'fidelity-first').length;

  md += `- **Native-First (Accessible UI components)**: ${nativeCount} elements (${((nativeCount / telemetryList.length) * 100).toFixed(1)}%)\n`;
  md += `- **Fidelity-First (Canvas & Vector drawing)**: ${fidelityCount} elements (${((fidelityCount / telemetryList.length) * 100).toFixed(1)}%)\n`;

  if (!fs.existsSync(outputPath)) {
    fs.mkdirSync(outputPath, { recursive: true });
  }

  fs.writeFileSync(path.join(outputPath, 'lowering_report.json'), JSON.stringify(jsonReport, null, 2), 'utf8');
  fs.writeFileSync(path.join(outputPath, 'mapping_report.md'), md, 'utf8');

  return { jsonReport, markdown: md };
}

module.exports = {
  generateMappingReport
};
