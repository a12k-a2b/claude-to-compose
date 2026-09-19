#!/usr/bin/env node

/**
 * claude-extract CLI Entry Point
 * Part of the claude-to-compose toolchain.
 */

const { Command, InvalidArgumentError } = require('commander');
const path = require('path');
const fs = require('fs');
const { ExtractionEngine } = require('../extractor/engine');

function parsePositiveInt(val, name) {
  const n = parseInt(val, 10);
  if (isNaN(n) || n <= 0 || !/^\d+$/.test(val.trim())) {
    throw new InvalidArgumentError(`${name || 'Value'} must be a positive integer.`);
  }
  return n;
}

function parsePositiveFloat(val, name) {
  const n = parseFloat(val);
  if (isNaN(n) || n <= 0) {
    throw new InvalidArgumentError(`${name || 'Value'} must be a positive number.`);
  }
  return n;
}

const EXIT_CODES = {
  SUCCESS: 0,
  GENERAL_ERROR: 1,
  INVALID_ARGUMENTS: 2,
  BROWSER_LAUNCH_FAILED: 3,
  NAVIGATION_FAILED: 4,
  HYDRATION_TIMEOUT: 5,
  SCHEMA_VALIDATION_FAILED: 6
};

const program = new Command();

program.exitOverride((err) => {
  if (err.code === 'commander.helpDisplayed' || err.code === 'commander.version') {
    process.exit(0);
  }
  process.exit(EXIT_CODES.INVALID_ARGUMENTS);
});

program
  .name('claude-extract')
  .description('Headless extraction engine for Claude Design shareable URLs and exported HTML artifacts.')
  .version('1.0.0')
  .argument('[input]', 'Target URL (https://claude.site/...) or local HTML file path')
  .option('-u, --url <url>', 'Explicit Claude shareable URL')
  .option('-f, --file <path>', 'Explicit path to local HTML file or artifact bundle')
  .option('-o, --output <dir>', 'Output directory for spec, screenshots, and assets', './output')
  .option('--clean', 'Clean output directory before extraction', false)
  .option('--viewport <types>', "Viewports to extract: 'mobile', 'desktop', or 'both'", 'both')
  .option('--mobile-width <pixels>', 'Mobile viewport width in CSS pixels', (v) => parsePositiveInt(v, '--mobile-width'), 390)
  .option('--mobile-height <pixels>', 'Mobile viewport height in CSS pixels', (v) => parsePositiveInt(v, '--mobile-height'), 844)
  .option('--mobile-scale <dpr>', 'Mobile device scale factor', (v) => parsePositiveFloat(v, '--mobile-scale'), 3.0)
  .option('--desktop-width <pixels>', 'Desktop viewport width in CSS pixels', (v) => parsePositiveInt(v, '--desktop-width'), 1440)
  .option('--desktop-height <pixels>', 'Desktop viewport height in CSS pixels', (v) => parsePositiveInt(v, '--desktop-height'), 900)
  .option('--desktop-scale <dpr>', 'Desktop device scale factor', (v) => parsePositiveFloat(v, '--desktop-scale'), 2.0)
  .option('--full-page', 'Capture full scrollable page screenshots', true)
  .option('--no-full-page', 'Disable full scrollable page screenshots')
  .option('-t, --timeout <ms>', 'Navigation and hydration timeout in ms', (v) => parsePositiveInt(v, '--timeout'), 30000)
  .option('--headless', 'Run browser in headless mode', true)
  .option('--no-headless', 'Run browser in visible window mode')
  .option('--browser-path <path>', 'Explicit path to Chromium executable')
  .option('-d, --debug', 'Enable verbose diagnostic logging', false)
  .addHelpText('after', `
Examples:
  $ claude-extract https://claude.site/artifacts/4a1b2c3d -o ./output/spec
  $ claude-extract --file ./fixtures/dashboard.html -o ./output/dashboard
  $ claude-extract ./fixtures/analytics.html --viewport mobile --debug
  $ claude-extract -u https://claude.ai/share/7b3e -o ./dist --timeout 45000
`);

program.parse(process.argv);

const options = program.opts();
const positionalInput = program.args[0];

// 1. Resolve and validate input target
function resolveInputTarget() {
  let target = null;
  let isFile = false;

  if (options.url && options.file) {
    console.error('[ERROR] Cannot specify both --url and --file simultaneously.');
    process.exit(EXIT_CODES.INVALID_ARGUMENTS);
  }

  if (options.url) {
    target = options.url.trim();
    isFile = false;
  } else if (options.file) {
    target = path.resolve(process.cwd(), options.file.trim());
    isFile = true;
  } else if (positionalInput) {
    const raw = positionalInput.trim();
    if (raw.startsWith('http://') || raw.startsWith('https://')) {
      target = raw;
      isFile = false;
    } else {
      target = path.resolve(process.cwd(), raw);
      isFile = true;
    }
  } else {
    console.error('[ERROR] No input provided. Specify a URL or file path via arguments or flags.');
    program.outputHelp();
    process.exit(EXIT_CODES.INVALID_ARGUMENTS);
  }

  // Validate URL format or file existence
  if (!isFile) {
    try {
      new URL(target);
    } catch (_) {
      console.error(`[ERROR] Invalid URL specified: "${target}"`);
      process.exit(EXIT_CODES.INVALID_ARGUMENTS);
    }
  } else {
    if (!fs.existsSync(target)) {
      console.error(`[ERROR] Specified file not found: "${target}"`);
      process.exit(EXIT_CODES.INVALID_ARGUMENTS);
    }
    const stat = fs.statSync(target);
    if (stat.isDirectory()) {
      const candidate = path.join(target, 'index.html');
      if (fs.existsSync(candidate)) {
        target = candidate;
      } else {
        console.error(`[ERROR] Directory does not contain an "index.html" file: "${target}"`);
        process.exit(EXIT_CODES.INVALID_ARGUMENTS);
      }
    }
    try {
      fs.accessSync(target, fs.constants.R_OK);
    } catch (err) {
      console.error(`[ERROR] Specified file is not readable (permission denied): "${target}"`);
      process.exit(EXIT_CODES.INVALID_ARGUMENTS);
    }
  }

  return { target, isFile };
}

async function main() {
  const { target, isFile } = resolveInputTarget();
  const outputDir = path.resolve(process.cwd(), options.output);

  // Validate viewport option
  const validViewports = ['mobile', 'desktop', 'both'];
  if (!validViewports.includes(options.viewport)) {
    console.error(`[ERROR] Invalid --viewport "${options.viewport}". Must be one of: ${validViewports.join(', ')}`);
    process.exit(EXIT_CODES.INVALID_ARGUMENTS);
  }

  try {
    if (options.clean && fs.existsSync(outputDir)) {
      if (options.debug) console.log(`[INFO] Cleaning output directory: ${outputDir}`);
      fs.rmSync(outputDir, { recursive: true, force: true });
    }
    fs.mkdirSync(outputDir, { recursive: true });
  } catch (err) {
    console.error(`[ERROR] Failed to create or access output directory "${outputDir}": ${err.message}`);
    process.exit(EXIT_CODES.INVALID_ARGUMENTS);
  }

  const engine = new ExtractionEngine({
    outputDir,
    viewport: options.viewport,
    mobileWidth: options.mobileWidth,
    mobileHeight: options.mobileHeight,
    mobileScale: options.mobileScale,
    desktopWidth: options.desktopWidth,
    desktopHeight: options.desktopHeight,
    desktopScale: options.desktopScale,
    fullPage: options.fullPage,
    timeout: options.timeout,
    headless: options.headless,
    browserPath: options.browserPath,
    debug: options.debug
  });

  // Handle process termination signals
  const cleanupAndExit = async (signal) => {
    console.log(`\n[WARN] Received ${signal}. Shutting down extraction engine...`);
    await engine.cleanup();
    process.exit(EXIT_CODES.GENERAL_ERROR);
  };
  process.on('SIGINT', () => cleanupAndExit('SIGINT'));
  process.on('SIGTERM', () => cleanupAndExit('SIGTERM'));

  console.log('='.repeat(70));
  console.log(`claude-extract: R1 Headless Extraction Engine v1.0.0`);
  console.log(`Target:     ${isFile ? '[Local File] ' + target : '[Remote URL] ' + target}`);
  console.log(`Output Dir: ${outputDir}`);
  console.log(`Viewports:  ${options.viewport} (Mobile: ${options.mobileWidth}x${options.mobileHeight}@${options.mobileScale}x, Desktop: ${options.desktopWidth}x${options.desktopHeight}@${options.desktopScale}x)`);
  console.log('='.repeat(70));

  try {
    const result = await engine.run({ target, isFile });
    console.log('\n[SUCCESS] Extraction completed successfully!');
    console.log(`- Spec file:    ${result.specPath}`);
    console.log(`- Screenshots:  ${result.screenshots.length} captured`);
    console.log(`- Vector assets:${result.vectorCount} extracted`);
    console.log(`- Total nodes:  ${result.nodeCount} resolved`);
    process.exit(EXIT_CODES.SUCCESS);
  } catch (err) {
    console.error(`\n[FATAL] Extraction failed: ${err.message}`);
    if (options.debug && err.stack) {
      console.error(err.stack);
    }
    await engine.cleanup();

    if (err.code && typeof EXIT_CODES[err.code] === 'number') {
      process.exit(EXIT_CODES[err.code]);
    }
    process.exit(EXIT_CODES.GENERAL_ERROR);
  }
}

main();
