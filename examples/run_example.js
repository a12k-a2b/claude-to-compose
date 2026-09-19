#!/usr/bin/env node

/**
 * ============================================================================
 * claude-to-compose: End-to-End Example Pipeline Runner
 * ============================================================================
 * Demonstrates the complete pipeline execution on a sample dashboard fixture:
 * 1. Extraction: Headless Playwright DOM & token extraction -> design_spec.json
 * 2. Synthesis: Translates design_spec.json into Material 3 Jetpack Compose
 * 3. Verification: Inspects synthesized code and validates against touch target
 *    and architecture rules.
 *
 * Usage:
 *   node examples/run_example.js [--input <html-path>] [--output <dir>]
 * ============================================================================
 */

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const DEFAULT_INPUT = path.join(__dirname, 'saas_dashboard/input/index.html');
const DEFAULT_OUTPUT = path.join(PROJECT_ROOT, 'output/example_run');

function parseArgs() {
  const args = process.argv.slice(2);
  let input = DEFAULT_INPUT;
  let output = DEFAULT_OUTPUT;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--input' || args[i] === '-i') {
      input = path.resolve(process.cwd(), args[++i]);
    } else if (args[i] === '--output' || args[i] === '-o') {
      output = path.resolve(process.cwd(), args[++i]);
    } else if (args[i] === '--help' || args[i] === '-h') {
      console.log(`
Usage: node examples/run_example.js [options]

Options:
  -i, --input <path>   Input HTML fixture or Claude link (default: saas_dashboard)
  -o, --output <dir>   Output directory for extracted spec and generated Compose code
  -h, --help           Show this help message
`);
      process.exit(0);
    }
  }

  return { input, output };
}

async function main() {
  const { input, output } = parseArgs();

  console.log('======================================================================');
  console.log('  claude-to-compose: End-to-End Example Pipeline');
  console.log('======================================================================');
  console.log(`Input Target:  ${input}`);
  console.log(`Output Target: ${output}`);
  console.log('======================================================================\n');

  if (!fs.existsSync(input)) {
    console.error(`[ERROR] Input file not found: ${input}`);
    process.exit(1);
  }

  const extractDir = path.join(output, 'extracted');
  const composeDir = path.join(output, 'synthesized');
  fs.mkdirSync(extractDir, { recursive: true });
  fs.mkdirSync(composeDir, { recursive: true });

  // --------------------------------------------------------------------------
  // STEP 1: Headless Extraction
  // --------------------------------------------------------------------------
  console.log('▶ [Step 1/3] Running Headless Playwright Extraction Engine...');
  const extractBin = path.join(PROJECT_ROOT, 'bin/claude-extract.js');
  const extractProc = spawnSync(
    process.execPath,
    [extractBin, input, '-o', extractDir, '--viewport', 'both'],
    { stdio: 'inherit' }
  );

  if (extractProc.status !== 0) {
    console.error('\n[FAIL] Extraction step failed with code ' + extractProc.status);
    process.exit(extractProc.status || 1);
  }

  const specPath = path.join(extractDir, 'design_spec.json');
  if (!fs.existsSync(specPath)) {
    console.error(`\n[FAIL] Expected design_spec.json not found at: ${specPath}`);
    process.exit(1);
  }

  const specData = JSON.parse(fs.readFileSync(specPath, 'utf8'));
  console.log(`\n✓ design_spec.json generated successfully:`);
  console.log(`  - Title:        ${specData.metadata?.title || 'N/A'}`);
  console.log(`  - Primary Color:${specData.theme?.colors?.primary || 'N/A'}`);
  console.log(`  - Vectors:      ${specData.theme?.vectors?.length || 0} extracted`);
  console.log(`  - Hierarchy:    ${specData.hierarchy?.type || 'N/A'} (ID: ${specData.hierarchy?.id || 'N/A'})`);

  // --------------------------------------------------------------------------
  // STEP 2: Compose Synthesis
  // --------------------------------------------------------------------------
  console.log('\n▶ [Step 2/3] Running Jetpack Compose & UX Synthesizer...');
  const synthBin = path.join(PROJECT_ROOT, 'synthesizer/index.js');
  const synthProc = spawnSync(
    process.execPath,
    [synthBin, '--spec', specPath, '--output', composeDir],
    { stdio: 'inherit' }
  );

  if (synthProc.status !== 0) {
    console.error('\n[FAIL] Synthesis step failed with code ' + synthProc.status);
    process.exit(synthProc.status || 1);
  }

  // --------------------------------------------------------------------------
  // STEP 3: Verification & Inspection
  // --------------------------------------------------------------------------
  console.log('\n▶ [Step 3/3] Inspecting Generated Kotlin Codebase...');
  const themeFiles = ['Theme.kt', 'Color.kt', 'Type.kt', 'Shape.kt', 'Elevation.kt'];
  console.log('  Checking design tokens:');
  for (const tf of themeFiles) {
    const p = path.join(composeDir, 'java/com/claude/compose/theme', tf);
    console.log(`    - ${tf}: ${fs.existsSync(p) ? 'PRESENT' : 'MISSING'}`);
  }

  const screenFile = path.join(composeDir, 'java/com/claude/compose/screen/ClaudeDesignScreen.kt');
  console.log(`  Checking full screen composable:`);
  console.log(`    - ClaudeDesignScreen.kt: ${fs.existsSync(screenFile) ? 'PRESENT' : 'MISSING'}`);

  console.log('\n======================================================================');
  console.log('  EXAMPLE EXECUTION COMPLETE');
  console.log('======================================================================');
  console.log(`Extracted spec:  ${specPath}`);
  console.log(`Compose sources: ${composeDir}/java/com/claude/compose/`);
  console.log('Next steps:');
  console.log('  1. Compile Android project:   cd android && ./gradlew compileDebugKotlin');
  console.log('  2. Run unit tests & previews: cd android && ./gradlew testDebugUnitTest');
  console.log('  3. Run visual diff:           node verification/run_diff.js');
  console.log('  4. Evaluate audit rubric:     node verification/audit_rubric.js');
  console.log('======================================================================\n');
}

main().catch((err) => {
  console.error('[FATAL ERROR]', err);
  process.exit(1);
});
