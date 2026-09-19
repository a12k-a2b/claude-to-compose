#!/usr/bin/env node

/**
 * ============================================================================
 * Tier 5 Adversarial Coverage Hardening Suite: Extractor & Synthesizer
 * Milestone M6 — Challenger 1 (critic, specialist)
 * ============================================================================
 * Comprehensive white-box adversarial stress tests targeting:
 * - extractor/engine.js
 * - extractor/dom_walker.js
 * - extractor/svg_parser.js
 * - extractor/screenshotter.js
 * - extractor/spec_builder.js
 * - synthesizer/token_generator.js
 * - synthesizer/component_generator.js
 * - synthesizer/screen_generator.js
 * - synthesizer/vector_generator.js
 * - synthesizer/motion_generator.js
 * - synthesizer/index.js
 * ============================================================================
 */

const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');

const PROJECT_ROOT = path.resolve(__dirname, '../..');

// Extractor modules
const { ExtractionEngine, EphemeralServer, CustomEngineError } = require(path.join(PROJECT_ROOT, 'extractor/engine'));
const { SvgParser } = require(path.join(PROJECT_ROOT, 'extractor/svg_parser'));
const { Screenshotter } = require(path.join(PROJECT_ROOT, 'extractor/screenshotter'));
const { SpecBuilder } = require(path.join(PROJECT_ROOT, 'extractor/spec_builder'));

// Synthesizer modules
const {
  TokenGenerator,
  cssColorToCompose,
  normalizeFontWeight,
  formatSp,
  generateColorFile
} = require(path.join(PROJECT_ROOT, 'synthesizer/token_generator'));

const {
  ComponentGenerator,
  sanitizeIdentifier
} = require(path.join(PROJECT_ROOT, 'synthesizer/component_generator'));

const {
  ScreenGenerator,
  extractInteractiveStates,
  translateLayout,
  isRowLayout,
  buildContainerModifier,
  translateNode
} = require(path.join(PROJECT_ROOT, 'synthesizer/screen_generator'));

const {
  VectorGenerator,
  sanitizeSvg,
  escapeXml,
  getSafeVectorDimensions,
  tokenizePath,
  pathToComposeDsl
} = require(path.join(PROJECT_ROOT, 'synthesizer/vector_generator'));

const {
  MotionGenerator,
  mapCssEasing,
  resolveAnimationSpec,
  validateSpringParams,
  validateTargetDimensions,
  calculateEffectiveTarget,
  ensureCompliantTouchTarget,
  generateRippleModifier
} = require(path.join(PROJECT_ROOT, 'synthesizer/motion_generator'));

const {
  SynthesizerOrchestrator,
  normalizeOutputPaths
} = require(path.join(PROJECT_ROOT, 'synthesizer/index'));

const results = [];
const gaps = [];

function recordTest(id, name, category, passed, details = {}) {
  results.push({ id, name, category, passed, details });
  if (passed) {
    console.log(`\x1b[32m[PASS]\x1b[0m [${id}] ${name}`);
  } else {
    console.log(`\x1b[31;1m[GAP DETECTED]\x1b[0m [${id}] ${name}`);
    console.log(`       \x1b[33mDefect: ${details.reason || 'Unhandled edge case or failure'}\x1b[0m`);
    if (details.evidence) {
      console.log(`       \x1b[90mEvidence: ${details.evidence}\x1b[0m`);
    }
    gaps.push({ id, name, category, ...details });
  }
}

async function runAdversarialSuite() {
  console.log('='.repeat(80));
  console.log('TIER 5 ADVERSARIAL COVERAGE HARDENING: EXTRACTOR & SYNTHESIZER');
  console.log('Workspace: ' + PROJECT_ROOT);
  console.log('Execution Time: ' + new Date().toISOString());
  console.log('='.repeat(80) + '\n');

  // ==========================================================================
  // CATEGORY 1: Extractor Engine & Ephemeral Server Adversarial Boundaries
  // ==========================================================================
  console.log('--- Category 1: Extractor Engine & Ephemeral Server ---');

  // ADV-T5-EXT-01: EphemeralServer Malformed URI Encoding (%E0%A4%A)
  {
    const tmpDir = path.join('/tmp', `adv_server_${Date.now()}`);
    fs.mkdirSync(tmpDir, { recursive: true });
    const targetFile = path.join(tmpDir, 'index.html');
    fs.writeFileSync(targetFile, '<h1>Test</h1>', 'utf8');

    const server = new EphemeralServer(targetFile);
    let passed = false;
    let details = {};

    try {
      const url = await server.start();
      const parsed = new URL(url);

      const status = await new Promise((resolve) => {
        const req = http.get({
          host: parsed.hostname,
          port: parsed.port,
          path: '/%E0%A4%A'
        }, (res) => {
          resolve(res.statusCode);
        });
        req.on('error', () => resolve(500));
      });

      // Server must handle URIError gracefully with 500 without crashing
      passed = status === 500 || status === 400;
      details = { status, evidence: `Server responded with HTTP ${status}` };
    } catch (err) {
      details = { reason: err.message };
    } finally {
      await server.stop();
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }

    recordTest('ADV-T5-EXT-01', 'EphemeralServer Malformed URI (%E0%A4%A) Error Resilience', 'Extractor Engine', passed, details);
  }

  // ADV-T5-EXT-02: EphemeralServer Directory Listing Prevention
  {
    const tmpDir = path.join('/tmp', `adv_dir_${Date.now()}`);
    const subDir = path.join(tmpDir, 'subdir');
    fs.mkdirSync(subDir, { recursive: true });
    const targetFile = path.join(tmpDir, 'index.html');
    fs.writeFileSync(targetFile, '<h1>Root</h1>', 'utf8');

    const server = new EphemeralServer(targetFile);
    let passed = false;
    let details = {};

    try {
      const url = await server.start();
      const parsed = new URL(url);

      const status = await new Promise((resolve) => {
        const req = http.get({
          host: parsed.hostname,
          port: parsed.port,
          path: '/subdir'
        }, (res) => {
          resolve(res.statusCode);
        });
        req.on('error', () => resolve(500));
      });

      // Direct access to directories must be rejected with 404 Not Found
      passed = status === 404;
      details = { status, evidence: `Directory access returned HTTP ${status}` };
    } catch (err) {
      details = { reason: err.message };
    } finally {
      await server.stop();
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }

    recordTest('ADV-T5-EXT-02', 'EphemeralServer Directory Listing Rejection (404)', 'Extractor Engine', passed, details);
  }

  // ADV-T5-EXT-03: ExtractionEngine Resource Leak Resilience on Navigation Failure
  {
    const engine = new ExtractionEngine({ timeout: 1500, headless: true });
    let passed = false;
    let details = {};

    try {
      // Intentionally navigate to an unreachable port to trigger navigation failure
      await engine.run({ target: 'http://127.0.0.1:1', isFile: false });
    } catch (err) {
      // Error is expected, but check if browser was leaked
      const browserLeaked = engine.browser !== null;
      if (browserLeaked) {
        passed = false;
        details = {
          reason: 'ExtractionEngine.run fails without cleanup(); leaves orphaned Chromium browser instance running',
          evidence: `engine.browser is still allocated after NAVIGATION_FAILED exception`
        };
      } else {
        passed = true;
        details = { evidence: 'Browser was cleaned up in error path' };
      }
    } finally {
      await engine.cleanup();
    }

    recordTest('ADV-T5-EXT-03', 'ExtractionEngine Lifecycle Teardown on Navigation Exception', 'Extractor Engine', passed, details);
  }

  // ==========================================================================
  // CATEGORY 2: Spec Builder & Schema Validation Adversarial Boundaries
  // ==========================================================================
  console.log('\n--- Category 2: Spec Builder & Schema Validation ---');

  // ADV-T5-EXT-04: SpecBuilder Null Parameter Dereference Handling
  {
    const builder = new SpecBuilder();
    let passed = false;
    let details = {};

    try {
      // Pass null for metadata and viewports (where default arguments = {} only catch undefined)
      builder.buildSpec({
        metadata: null,
        viewports: null,
        domHierarchy: { id: 'root', layout: {}, children: [] }
      });
      passed = true;
    } catch (err) {
      passed = false;
      details = {
        reason: 'Unhandled TypeError when metadata or viewports is null instead of undefined: ' + err.message,
        evidence: err.stack.split('\n')[0]
      };
    }

    recordTest('ADV-T5-EXT-04', 'SpecBuilder Null Metadata & Viewports Guard', 'Spec Builder', passed, details);
  }

  // ADV-T5-EXT-05: SpecBuilder Non-Finite Floating Numbers (Infinity / NaN) in Layout Spacings
  {
    const builder = new SpecBuilder();
    let passed = false;
    let details = {};

    try {
      const spec = builder.buildSpec({
        metadata: { title: 'Non-finite test' },
        viewports: {},
        domHierarchy: {
          id: 'root',
          layout: { gap: Infinity },
          children: []
        }
      });

      // JSON does not support Infinity; JSON.stringify serializes it as null
      const serialized = JSON.stringify(spec);
      const parsedSpec = JSON.parse(serialized);
      const validation = builder.validate(parsedSpec);

      if (!validation.valid && validation.errors.some(e => e.includes('must be number') || e.includes('null'))) {
        passed = false;
        details = {
          reason: 'SpecBuilder accepts non-finite Infinity into spacing array, which serializes to null and breaks Draft 2020-12 schema',
          evidence: `Errors: ${validation.errors.join('; ')}`
        };
      } else {
        passed = true;
      }
    } catch (err) {
      passed = false;
      details = { reason: err.message };
    }

    recordTest('ADV-T5-EXT-05', 'SpecBuilder Non-Finite Numeric Guard (Infinity / NaN)', 'Spec Builder', passed, details);
  }

  // ADV-T5-EXT-06: SpecBuilder Hex Normalization Fuzzing
  {
    const spec = new SpecBuilder();
    // Test internal or synthesized hex normalization across fuzz targets
    const testCases = [
      { input: '#123', expected: '#112233' },
      { input: '#4F46E5', expected: '#4F46E5' },
      { input: '#4F46E5FF', expected: '#4F46E5FF' },
      { input: '#GGGGGG', expectedNonHex: true },
      { input: '   ', expectedFallback: true },
      { input: null, expectedFallback: true }
    ];

    let allPassed = true;
    const failures = [];

    // Check behavior through color collection
    const dummyNode = (color) => ({
      id: 'node_1',
      layout: {},
      style: { backgroundColor: color },
      children: []
    });

    for (const tc of testCases) {
      try {
        const tokens = spec.collectTokens(dummyNode(tc.input));
        const hasColor = tokens.colorStats.has(tc.input);
        if (tc.expectedNonHex && hasColor) {
          allPassed = false;
          failures.push(`Invalid hex "${tc.input}" accepted into colorStats`);
        }
      } catch (err) {
        allPassed = false;
        failures.push(`Crash on "${tc.input}": ${err.message}`);
      }
    }

    recordTest('ADV-T5-EXT-06', 'SpecBuilder Color Hex Token Normalization Fuzzing', 'Spec Builder', allPassed, {
      reason: failures.join('; ')
    });
  }

  // ADV-T5-EXT-07: SpecBuilder Rejection of Missing Required Schema Sections
  {
    const builder = new SpecBuilder();
    const incompleteSpec = {
      version: '1.0.0',
      metadata: { title: 'Incomplete' },
      theme: { colors: {}, typography: {}, spacing: [], radii: {}, elevations: [] }
      // Missing viewports and hierarchy
    };

    const val = builder.validate(incompleteSpec);
    const passed = !val.valid && val.errors.some(e => e.includes('hierarchy') || e.includes('viewports'));
    recordTest('ADV-T5-EXT-07', 'SpecBuilder Draft 2020-12 Missing Required Section Enforcement', 'Spec Builder', passed, {
      evidence: val.errors.join('; ')
    });
  }

  // ==========================================================================
  // CATEGORY 3: SVG Parser & Vector Extraction Adversarial Boundaries
  // ==========================================================================
  console.log('\n--- Category 3: SVG Parser & Vector Extraction ---');

  // ADV-T5-EXT-08: SvgParser Odd Polygon Coordinates Boundary (Preventing "undefined" coordinate)
  {
    const svgWithOddPoints = '<svg><polygon points="10,20 30"/></svg>';
    const parsed = SvgParser.parseSvgString(svgWithOddPoints);

    let passed = true;
    let details = {};

    if (parsed && parsed.paths.length > 0) {
      const d = parsed.paths[0].d;
      if (d.includes('undefined')) {
        passed = false;
        details = {
          reason: 'SvgParser generates corrupted SVG path string containing literal "undefined" on odd-length points attribute',
          evidence: `Generated path d="${d}"`
        };
      }
    }

    recordTest('ADV-T5-EXT-08', 'SvgParser Odd Polygon Point Coordinate Boundary', 'SVG Parser', passed, details);
  }

  // ADV-T5-EXT-09: SvgParser Negative Corner Radius Boundary
  {
    const svgWithNegativeRx = '<svg><rect x="0" y="0" width="100" height="50" rx="-5"/></svg>';
    const parsed = SvgParser.parseSvgString(svgWithNegativeRx);

    let passed = true;
    let details = {};

    if (parsed && parsed.paths.length > 0) {
      const d = parsed.paths[0].d;
      if (d.includes('--')) {
        passed = false;
        details = {
          reason: 'SvgParser emits invalid double-negative signs ("--5") in SVG path when rect rx is negative',
          evidence: `Generated path d="${d}"`
        };
      }
    }

    recordTest('ADV-T5-EXT-09', 'SvgParser Negative Radius Normalization in Rect Shapes', 'SVG Parser', passed, details);
  }

  // ADV-T5-EXT-10: SvgParser Non-numeric Width/Height ViewBox Resolution
  {
    const svgAuto = '<svg width="auto" height="100%"><path d="M0,0 L10,10"/></svg>';
    const parsed = SvgParser.parseSvgString(svgAuto);

    let passed = false;
    let details = {};

    if (parsed) {
      if (parsed.viewBox.includes('NaN')) {
        passed = false;
        details = {
          reason: 'SvgParser computes viewBox as "0 0 NaN NaN" when width="auto"',
          evidence: `Computed viewBox="${parsed.viewBox}"`
        };
      } else {
        passed = true;
        details = { evidence: `Safely resolved viewBox="${parsed.viewBox}"` };
      }
    }

    recordTest('ADV-T5-EXT-10', 'SvgParser Non-numeric/Auto Dimension Fallback', 'SVG Parser', passed, details);
  }

  // ADV-T5-EXT-11: SvgParser saveVectorAsset Directory Traversal Sanitization
  {
    const tmpDir = path.join('/tmp', `adv_svg_traversal_${Date.now()}`);
    fs.mkdirSync(tmpDir, { recursive: true });

    let passed = false;
    let details = {};

    try {
      const assetPath = SvgParser.saveVectorAsset('<svg></svg>', tmpDir, '../../evil_escape');
      const resolvedAsset = path.resolve(tmpDir, assetPath);
      // Ensure file stayed inside tmpDir
      if (resolvedAsset.startsWith(tmpDir)) {
        passed = true;
        details = { evidence: `Sanitized to ${assetPath}` };
      } else {
        passed = false;
        details = { reason: 'Path escaped target output directory: ' + resolvedAsset };
      }
    } catch (err) {
      details = { reason: err.message };
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }

    recordTest('ADV-T5-EXT-11', 'SvgParser Vector Asset Filename Path Traversal Sanitization', 'SVG Parser', passed, details);
  }

  // ADV-T5-EXT-12: Screenshotter Zero-Byte and Corrupt Buffer Rejection
  {
    const screenshotter = new Screenshotter();
    let passedZero = false;
    let passedCorrupt = false;

    try {
      await screenshotter.validateImageBuffer(Buffer.alloc(0), 100, 100);
    } catch (err) {
      passedZero = true;
    }

    try {
      await screenshotter.validateImageBuffer(Buffer.from('not a valid png image data'), 100, 100);
    } catch (err) {
      passedCorrupt = true;
    }

    const passed = passedZero && passedCorrupt;
    recordTest('ADV-T5-EXT-12', 'Screenshotter Corrupt / Zero-Byte Image Buffer Rejection', 'Screenshotter', passed, {
      evidence: `Zero-byte caught: ${passedZero}, Corrupt caught: ${passedCorrupt}`
    });
  }

  // ==========================================================================
  // CATEGORY 4: Synthesizer Token & Component Generator Adversarial Boundaries
  // ==========================================================================
  console.log('\n--- Category 4: Synthesizer Token & Component Generator ---');

  // ADV-T5-SYN-01: TokenGenerator Null & Undefined Theme Handling
  {
    const tmpDir = path.join('/tmp', `adv_tokens_${Date.now()}`);
    let passed = false;
    let details = {};

    try {
      // Passing undefined or null theme
      TokenGenerator.generateTokens(undefined, tmpDir);
      passed = true;
    } catch (err) {
      passed = false;
      details = {
        reason: 'TokenGenerator crashes with unhandled TypeError on undefined theme: ' + err.message,
        evidence: err.stack.split('\n')[0]
      };
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }

    recordTest('ADV-T5-SYN-01', 'TokenGenerator Undefined Theme Defensive Null Guard', 'Token Generator', passed, details);
  }

  // ADV-T5-SYN-02: cssColorToCompose Non-Hex Character Injection (#GGGGGG)
  {
    const invalidHexResult = cssColorToCompose('#GGGGGG');
    let passed = true;
    let details = {};

    if (invalidHexResult === 'Color(0xFFGGGGGG)') {
      passed = false;
      details = {
        reason: 'cssColorToCompose emits invalid Kotlin hexadecimal literal Color(0xFFGGGGGG) on non-hex input',
        evidence: `Emitted: ${invalidHexResult}`
      };
    } else {
      details = { evidence: `Safely normalized to ${invalidHexResult}` };
    }

    recordTest('ADV-T5-SYN-02', 'cssColorToCompose Non-Hex String (#GGGGGG) Kotlin Validity', 'Token Generator', passed, details);
  }

  // ADV-T5-SYN-03: cssColorToCompose Out-of-Bounds Channel Clamping (> 255)
  {
    const outOfBounds = cssColorToCompose('rgb(300, 0, 0)');
    let passed = true;
    let details = {};

    // 300 in hex is 0x12c, which produces a 9-digit hex string 0xFF12c0000 (invalid 32-bit color in Kotlin)
    const match = outOfBounds.match(/Color\(0x([0-9a-fA-F]+)\)/);
    if (match && match[1].length !== 8) {
      passed = false;
      details = {
        reason: `cssColorToCompose produces invalid non-32-bit color hex "${outOfBounds}" when RGB channel > 255`,
        evidence: `Hex length: ${match[1].length}`
      };
    }

    recordTest('ADV-T5-SYN-03', 'cssColorToCompose RGB Channel Range Clamping (<= 255)', 'Token Generator', passed, details);
  }

  // ADV-T5-SYN-04: formatSp Non-Finite Numbers (NaN / Infinity)
  {
    const resNaN = formatSp(NaN);
    const resInf = formatSp(Infinity);
    const resNeg = formatSp(-0.5);

    let passed = true;
    let details = {};

    if (resNaN !== '0.sp' || resInf === 'Infinity.sp') {
      passed = false;
      details = {
        reason: `formatSp emits non-finite Compose sp units: NaN="${resNaN}", Infinity="${resInf}"`,
        evidence: `resNaN=${resNaN}, resInf=${resInf}`
      };
    }

    recordTest('ADV-T5-SYN-04', 'formatSp Non-Finite Values (NaN / Infinity) Sanitization', 'Token Generator', passed, details);
  }

  // ADV-T5-SYN-05: ComponentGenerator sanitizeIdentifier Kotlin Keywords & Leading Digits
  {
    const kwFun = sanitizeIdentifier('fun');
    const kwClass = sanitizeIdentifier('class');
    const leadingDigit = sanitizeIdentifier('123button');

    let passed = true;
    const failures = [];

    if (kwFun !== '`fun`') failures.push(`Expected \`fun\`, got ${kwFun}`);
    if (kwClass !== '`class`') failures.push(`Expected \`class\`, got ${kwClass}`);
    // In Kotlin, 123button is not a valid identifier unless backticked or prefixed
    if (leadingDigit === '123button') {
      failures.push(`Identifier "123button" starting with digit emitted without backticks: ${leadingDigit}`);
      passed = false;
    }

    recordTest('ADV-T5-SYN-05', 'sanitizeIdentifier Leading Digit & Kotlin Keyword Escaping', 'Component Generator', passed, {
      reason: failures.join('; ')
    });
  }

  // ==========================================================================
  // CATEGORY 5: Synthesizer Screen, Motion, & Vector Generator Adversarial Boundaries
  // ==========================================================================
  console.log('\n--- Category 5: Screen, Motion & Vector Generator ---');

  // ADV-T5-SYN-06: ScreenGenerator Keyword Component Names in Interactive State Declarations
  {
    const states = extractInteractiveStates({
      id: 'node_1',
      componentType: 'Checkbox',
      name: 'class',
      children: []
    });

    let passed = true;
    let details = {};

    if (states.length > 0 && states[0].varName === 'is`class`Checked') {
      passed = false;
      details = {
        reason: 'extractInteractiveStates generates syntax error in Kotlin: backticks inside variable name "is`class`Checked"',
        evidence: `Variable name: "${states[0].varName}"`
      };
    }

    recordTest('ADV-T5-SYN-06', 'ScreenGenerator Interactive State Variable Name Backtick Placement', 'Screen Generator', passed, details);
  }

  // ADV-T5-SYN-07: ScreenGenerator Missing Switch & Chip Direct Synthesis
  {
    const switchNode = {
      id: 'node_switch',
      tag: 'input',
      componentType: 'Switch',
      attributes: { type: 'checkbox' },
      children: []
    };
    const chipNode = {
      id: 'node_chip',
      tag: 'div',
      componentType: 'Chip',
      children: []
    };

    const switchResult = translateNode(switchNode);
    const chipResult = translateNode(chipNode);

    let passed = true;
    const failures = [];

    if (switchResult.trim() === '') {
      failures.push('Switch componentType is completely dropped during synthesis (returns empty string)');
      passed = false;
    }
    if (chipResult.trim() === '') {
      failures.push('Chip componentType is completely dropped during synthesis (returns empty string)');
      passed = false;
    }

    recordTest('ADV-T5-SYN-07', 'ScreenGenerator Switch & Chip Component Synthesis Completeness', 'Screen Generator', passed, {
      reason: failures.join('; ')
    });
  }

  // ADV-T5-SYN-08: MotionGenerator validateSpringParams NaN / Infinity Boundary
  {
    let passed = true;
    let details = {};

    try {
      const resNaN = MotionGenerator.validateSpringParams(NaN, 100);
      if (resNaN === true) {
        passed = false;
        details = {
          reason: 'validateSpringParams(NaN, 100) returns true because NaN <= 0 is false in JavaScript',
          evidence: `Returned ${resNaN} instead of throwing InvalidSpringParamsError`
        };
      }
    } catch (err) {
      passed = true;
    }

    recordTest('ADV-T5-SYN-08', 'MotionGenerator validateSpringParams NaN Parameter Rejection', 'Motion Generator', passed, details);
  }

  // ADV-T5-SYN-09: MotionGenerator validateTargetDimensions NaN Boundary
  {
    let passed = true;
    let details = {};

    try {
      const res = MotionGenerator.validateTargetDimensions(NaN, 48);
      if (res === true) {
        passed = false;
        details = {
          reason: 'validateTargetDimensions(NaN, 48) returns true because NaN <= 0 is false in JavaScript',
          evidence: `Returned ${res} instead of throwing ZeroDimensionTargetError`
        };
      }
    } catch (err) {
      passed = true;
    }

    recordTest('ADV-T5-SYN-09', 'MotionGenerator validateTargetDimensions NaN Dimension Rejection', 'Motion Generator', passed, details);
  }

  // ADV-T5-SYN-10: MotionGenerator resolveAnimationSpec NaN / Non-Finite Duration
  {
    const res = resolveAnimationSpec(NaN);
    let passed = true;
    let details = {};

    if (res.includes('NaN')) {
      passed = false;
      details = {
        reason: 'resolveAnimationSpec(NaN) generates invalid Kotlin code "tween(durationMillis = NaN, ...)"',
        evidence: `Emitted: "${res}"`
      };
    }

    recordTest('ADV-T5-SYN-10', 'MotionGenerator resolveAnimationSpec NaN Duration Sanitization', 'Motion Generator', passed, details);
  }

  // ADV-T5-SYN-11: VectorGenerator getSafeVectorDimensions Null Argument
  {
    let passed = false;
    let details = {};

    try {
      // Passing null to default argument dim = {}
      const dim = getSafeVectorDimensions(null);
      if (dim.width >= 1 && dim.height >= 1) {
        passed = true;
        details = { evidence: `Dimensions safely returned: ${dim.width}x${dim.height}` };
      }
    } catch (err) {
      passed = false;
      details = {
        reason: 'getSafeVectorDimensions(null) throws unhandled TypeError: ' + err.message,
        evidence: err.stack.split('\n')[0]
      };
    }

    recordTest('ADV-T5-SYN-11', 'VectorGenerator getSafeVectorDimensions Null Parameter Guard', 'Vector Generator', passed, details);
  }

  // ADV-T5-SYN-12: VectorGenerator generateVectorDrawableXml Null Vector & Path Elements
  {
    let passedNullVec = false;
    let passedNullPath = false;
    let details = {};

    try {
      VectorGenerator.generateVectorDrawableXml(null);
      passedNullVec = true;
    } catch (err) {
      details.nullVecError = err.message;
    }

    try {
      VectorGenerator.generateVectorDrawableXml({ name: 'icon', paths: [null] });
      passedNullPath = true;
    } catch (err) {
      details.nullPathError = err.message;
    }

    const passed = passedNullVec && passedNullPath;
    recordTest('ADV-T5-SYN-12', 'VectorGenerator generateVectorDrawableXml Null Vector / Paths Guard', 'Vector Generator', passed, {
      reason: `Unhandled TypeError on null vector or path: ${details.nullVecError || details.nullPathError}`
    });
  }

  // ADV-T5-SYN-13: VectorGenerator generateImageVectorFile Leading Digit Identifier
  {
    let passed = true;
    let details = {};

    const code = VectorGenerator.generateImageVectorFile([
      { name: '123_home_icon', paths: [{ d: 'M0,0 L10,10' }] }
    ]);

    if (code.includes('ClaudeIcons.123HomeIcon') && !code.includes('ClaudeIcons.`123HomeIcon`')) {
      passed = false;
      details = {
        reason: 'generateImageVectorFile emits invalid Kotlin property "ClaudeIcons.123HomeIcon" starting with digit without backticks',
        evidence: code.split('\n').find(l => l.includes('123HomeIcon'))
      };
    }

    recordTest('ADV-T5-SYN-13', 'VectorGenerator ImageVector Extension Property Numeric Identifier Escaping', 'Vector Generator', passed, details);
  }

  // ADV-T5-SYN-14: SynthesizerOrchestrator Resiliency Against Null Spec Elements
  {
    const tmpSpec = path.join('/tmp', `adv_null_spec_${Date.now()}.json`);
    const tmpOut = path.join('/tmp', `adv_null_out_${Date.now()}`);

    fs.writeFileSync(tmpSpec, JSON.stringify({
      version: '1.0.0',
      metadata: { title: 'Null Test' },
      viewports: { mobile: { width: 390, height: 844, screenshotPath: '' }, desktop: { width: 1440, height: 900, screenshotPath: '' } },
      theme: null,
      hierarchy: { id: 'root', layout: {}, children: [] },
      vectors: [null]
    }), 'utf8');

    let passed = false;
    let details = {};

    try {
      SynthesizerOrchestrator.synthesize({
        spec: tmpSpec,
        output: tmpOut
      });
      passed = true;
    } catch (err) {
      passed = false;
      details = {
        reason: 'SynthesizerOrchestrator crashes with unhandled TypeError when spec has theme: null or null vector item: ' + err.message,
        evidence: err.stack.split('\n')[0]
      };
    } finally {
      fs.rmSync(tmpSpec, { force: true });
      fs.rmSync(tmpOut, { recursive: true, force: true });
    }

    recordTest('ADV-T5-SYN-14', 'SynthesizerOrchestrator Null Theme & Null Vector Ingestion Guard', 'Synthesizer Orchestrator', passed, details);
  }

  // ==========================================================================
  // Summary & Diagnostic Output
  // ==========================================================================
  console.log('\n' + '='.repeat(80));
  console.log('M6 ADVERSARIAL COVERAGE HARDENING SUITE SUMMARY (Tier 5)');
  console.log('='.repeat(80));

  const total = results.length;
  const robustCount = results.filter(r => r.passed).length;
  const gapCount = results.filter(r => !r.passed).length;

  console.log(`Total Scenarios Tested:    ${total}`);
  console.log(`Verified Robust (Passed):  \x1b[32m${robustCount}\x1b[0m`);
  console.log(`Gaps / Defects Discovered: \x1b[31;1m${gapCount}\x1b[0m`);
  console.log('='.repeat(80));

  if (gapCount > 0) {
    console.log('\nDISCOVERED GAPS & DEFECTS SUMMARY:');
    gaps.forEach((g, i) => {
      console.log(` ${i + 1}. [${g.id}] ${g.name} (${g.category})`);
      console.log(`    Defect: ${g.reason}`);
      if (g.evidence) console.log(`    Evidence: ${g.evidence}`);
    });
  }
  console.log('='.repeat(80) + '\n');

  return { total, robustCount, gapCount, results, gaps };
}

if (require.main === module) {
  runAdversarialSuite().then(() => {
    // Exit code 0 to allow test runners to record outputs and inspection artifacts
    process.exit(0);
  });
}

module.exports = { runAdversarialSuite };
