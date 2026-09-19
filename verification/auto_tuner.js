#!/usr/bin/env node

/**
 * verification/auto_tuner.js
 *
 * Automated Layout Tuning Engine for claude-to-compose.
 * Reads zonal diff metrics (zonal_diff.json), detects systematic translational drift
 * (Δx, Δy) and ink distribution discrepancies, and computes precision offset corrections
 * in Compose density-independent pixels (dp).
 */

const fs = require('fs');
const path = require('path');
const { Command } = require('commander');

class AutoTuner {
  constructor(zonalReport) {
    this.report = zonalReport;
  }

  /**
   * Evaluates zonal metrics and generates concrete layout adjustment directives.
   *
   * @returns {Array<Object>} List of tuning directives
   */
  generateTuningDirectives() {
    if (!this.report || !Array.isArray(this.report.zones)) return [];

    const directives = [];

    for (const zone of this.report.zones) {
      const { id, name, similarity, centroidDrift, ssimScore } = zone;
      const { deltaX, deltaY, deltaXDp, deltaYDp } = centroidDrift;

      // Thresholds: drift > 1.5dp is considered systematic
      const needsXAdjustment = Math.abs(deltaXDp) >= 1.5;
      const needsYAdjustment = Math.abs(deltaYDp) >= 1.5;

      if (needsXAdjustment || needsYAdjustment || similarity < 90.0) {
        const directive = {
          zoneId: id,
          zoneName: name,
          currentSimilarity: similarity,
          ssimScore,
          driftPx: { x: deltaX, y: deltaY },
          driftDp: { x: deltaXDp, y: deltaYDp },
          recommendedCorrections: []
        };

        if (needsYAdjustment) {
          if (deltaYDp > 0) {
            directive.recommendedCorrections.push({
              target: 'Vertical Alignment / Padding',
              action: `Reduce top padding or Spacer height by ${Math.abs(deltaYDp)}dp (element rendered ${deltaYDp}dp too low)`
            });
          } else {
            directive.recommendedCorrections.push({
              target: 'Vertical Alignment / Padding',
              action: `Increase top padding or Spacer height by ${Math.abs(deltaYDp)}dp (element rendered ${Math.abs(deltaYDp)}dp too high)`
            });
          }
        }

        if (needsXAdjustment) {
          if (deltaXDp > 0) {
            directive.recommendedCorrections.push({
              target: 'Horizontal Offset / Origin',
              action: `Shift horizontal start anchor or reduce start padding by ${Math.abs(deltaXDp)}dp (rendered ${deltaXDp}dp too far right)`
            });
          } else {
            directive.recommendedCorrections.push({
              target: 'Horizontal Offset / Origin',
              action: `Shift horizontal start anchor or increase start padding by ${Math.abs(deltaXDp)}dp (rendered ${Math.abs(deltaXDp)}dp too far left)`
            });
          }
        }

        if (similarity < 88.0 && !needsYAdjustment && !needsXAdjustment) {
          directive.recommendedCorrections.push({
            target: 'Shape / Stroke Geometry',
            action: 'Internal path mismatch detected without centroid drift; refine stroke linecaps or curve control points'
          });
        }

        directives.push(directive);
      }
    }

    return directives;
  }

  /**
   * Formats recommendations as a Markdown table.
   */
  toMarkdown(directives) {
    let md = `### Localized Auto-Tuner Directives\n\n`;
    md += `| Zone | Measured Drift (dp) | Current Match | Recommended Compensation |\n`;
    md += `| :--- | :--- | :--- | :--- |\n`;

    for (const d of directives) {
      const driftStr = `Δx: ${d.driftDp.x}dp, Δy: ${d.driftDp.y}dp`;
      const actions = d.recommendedCorrections.map(c => `• **${c.target}**: ${c.action}`).join('<br>');
      md += `| **${d.zoneName}** | \`${driftStr}\` | ${d.currentSimilarity}% | ${actions || 'Within tolerance'} |\n`;
    }

    return md;
  }
}

// CLI Execution
if (require.main === module) {
  const program = new Command();

  program
    .name('auto_tuner')
    .description('Layout auto-tuning advisor for claude-to-compose')
    .option('-i, --input <path>', 'Path to zonal_diff.json', 'verification/zonal_diff.json')
    .option('--json', 'Output directives as JSON', false)
    .parse(process.argv);

  const opts = program.opts();
  const inputPath = path.resolve(opts.input);

  if (!fs.existsSync(inputPath)) {
    console.error(`Error: Zonal diff file not found at ${inputPath}`);
    process.exit(1);
  }

  const raw = JSON.parse(fs.readFileSync(inputPath, 'utf-8'));
  const tuner = new AutoTuner(raw);
  const directives = tuner.generateTuningDirectives();

  if (opts.json) {
    console.log(JSON.stringify(directives, null, 2));
  } else {
    console.log('\n=== Compose Layout Auto-Tuner Directives ===\n');
    for (const d of directives) {
      console.log(`Zone: ${d.zoneName} (${d.currentSimilarity}%, SSIM: ${d.ssimScore})`);
      console.log(`  Centroid Drift: Δx = ${d.driftDp.x} dp, Δy = ${d.driftDp.y} dp`);
      d.recommendedCorrections.forEach(c => console.log(`  -> [${c.target}] ${c.action}`));
      console.log('');
    }
    console.log(tuner.toMarkdown(directives));
  }
}

module.exports = {
  AutoTuner
};
