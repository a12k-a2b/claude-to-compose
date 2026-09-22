#!/usr/bin/env node
'use strict';

/**
 * tests/adversarial/run_m2_challenger2_stress.js
 *
 * Empirical Adversarial Challenge Suite: Milestone 2 Web Evidence Capture Engine,
 * Multi-Viewport Orchestration, and Behavior Contract Transitions.
 *
 * Executed by: Challenger 2 (Milestone 2 Evidence Capture & Multi-Viewport Oracle)
 */

const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const net = require('node:net');
const os = require('node:os');
const assert = require('node:assert');
const crypto = require('node:crypto');
const sharp = require('sharp');

const {
  captureEvidenceBundle,
  captureLocalHtml,
  startEphemeralServer,
  findAvailablePort,
  handleNavigationError,
  extractFonts,
  DC1_VIEWPORTS
} = require('../../src/extractor/capture');

const {
  createBehaviorContract,
  validateStateGraph,
  validateTrigger,
  detectCircularLoops,
  normalizeSettleMs,
  SUPPORTED_EVENT_TYPES
} = require('../../src/contract/behavior_contract_builder');

const {
  inferNodeIntent,
  createBreakpointRules,
  normalizeSizing
} = require('../../src/contract/layout_intent_builder');

const { buildDesignContract, synthesizeLayers, validateContractAgainstSchemas } = require('../../src/contract/compiler');

const results = [];
let passCount = 0;
let failCount = 0;

function recordTest(id, name, group, passed, details = {}) {
  results.push({ id, name, group, passed, details });
  if (passed) {
    passCount++;
    console.log(`  \x1b[32m✔ [PASS]\x1b[0m [${id}] ${name}`);
  } else {
    failCount++;
    console.log(`  \x1b[31m✖ [FAIL]\x1b[0m [${id}] ${name}`);
    if (details.error) {
      console.log(`         \x1b[31mError: ${details.error}\x1b[0m`);
    }
  }
}

async function runAllTests() {
  console.log('='.repeat(80));
  console.log('  CHALLENGER 2: EMPIRICAL ADVERSARIAL STRESS SUITE (MILESTONE 2)');
  console.log('  Target: Web Evidence Capture, Multi-Viewport & Behavior Contracts');
  console.log('='.repeat(80) + '\n');

  // =========================================================================
  // GROUP 1: Capture Engine Boundary Conditions
  // =========================================================================
  console.log('─── Group 1: Capture Engine Boundary Conditions ───');

  // 1.1 Unreachable Port (ECONNREFUSED) -> Exit code 4
  {
    const id = 'M2-C2-1.1';
    const name = 'Unreachable local port throws Error with exit code 4 (NAVIGATION_FAILED)';
    try {
      const freePort = await findAvailablePort(45000);
      const unreachableUrl = `http://127.0.0.1:${freePort}`;
      let caughtErr = null;

      try {
        await captureEvidenceBundle(unreachableUrl, { timeout: 2000, screenId: 'test_unreachable' });
      } catch (err) {
        caughtErr = err;
      }

      assert.ok(caughtErr, 'Expected captureEvidenceBundle to reject for unreachable port');
      assert.strictEqual(caughtErr.code, 4, `Expected code 4, received ${caughtErr.code}`);
      assert.strictEqual(caughtErr.statusCode, 'ECONNREFUSED', `Expected statusCode ECONNREFUSED, received ${caughtErr.statusCode}`);
      assert.strictEqual(caughtErr.targetUrl, unreachableUrl);
      assert.strictEqual(caughtErr.isRecoverable, false);
      recordTest(id, name, 'Capture Boundaries', true);
    } catch (err) {
      recordTest(id, name, 'Capture Boundaries', false, { error: err.message });
    }
  }

  // 1.2 Non-Existent Remote Domain (ENOTFOUND) -> Exit code 4
  {
    const id = 'M2-C2-1.2';
    const name = 'Unresolvable remote domain throws Error with exit code 4 (NAVIGATION_FAILED)';
    try {
      const nonExistentUrl = 'http://domain-never-registered-xyz-9876543210.org';
      let caughtErr = null;

      try {
        await captureEvidenceBundle(nonExistentUrl, { timeout: 3000, screenId: 'test_dns_fail' });
      } catch (err) {
        caughtErr = err;
      }

      assert.ok(caughtErr, 'Expected captureEvidenceBundle to reject for unresolvable domain');
      assert.strictEqual(caughtErr.code, 4, `Expected code 4, received ${caughtErr.code}`);
      assert.strictEqual(caughtErr.statusCode, 'ECONNREFUSED');
      assert.strictEqual(caughtErr.targetUrl, nonExistentUrl);
      recordTest(id, name, 'Capture Boundaries', true);
    } catch (err) {
      recordTest(id, name, 'Capture Boundaries', false, { error: err.message });
    }
  }

  // 1.3 Navigation Timeout Scenario -> Exit code 4 (ETIMEDOUT)
  {
    const id = 'M2-C2-1.3';
    const name = 'Hung HTTP server connection timeout throws Error with exit code 4 and ETIMEDOUT';
    let hungServer = null;
    try {
      hungServer = http.createServer((req, res) => {
        // Keep socket open without writing response
      });
      const hungPort = await new Promise(resolve => hungServer.listen(0, '127.0.0.1', () => resolve(hungServer.address().port)));
      const hungUrl = `http://127.0.0.1:${hungPort}`;

      let caughtErr = null;
      try {
        await captureEvidenceBundle(hungUrl, { timeout: 800, screenId: 'test_timeout' });
      } catch (err) {
        caughtErr = err;
      }

      assert.ok(caughtErr, 'Expected captureEvidenceBundle to time out');
      assert.strictEqual(caughtErr.code, 4, `Expected code 4, received ${caughtErr.code}`);
      assert.strictEqual(caughtErr.statusCode, 'ETIMEDOUT', `Expected statusCode ETIMEDOUT, received ${caughtErr.statusCode}`);
      recordTest(id, name, 'Capture Boundaries', true);
    } catch (err) {
      recordTest(id, name, 'Capture Boundaries', false, { error: err.message });
    } finally {
      if (hungServer) {
        await new Promise(r => hungServer.close(r));
      }
    }
  }

  // 1.4 Malformed URL Format -> Exit code 4
  {
    const id = 'M2-C2-1.4';
    const name = 'Malformed URL string (http://) throws Error with exit code 4';
    try {
      let caughtErr = null;
      try {
        await captureEvidenceBundle('http://', { timeout: 1000, screenId: 'test_malformed' });
      } catch (err) {
        caughtErr = err;
      }

      assert.ok(caughtErr, 'Expected malformed URL to throw');
      assert.strictEqual(caughtErr.code, 4, `Expected code 4, received ${caughtErr.code}`);
      recordTest(id, name, 'Capture Boundaries', true);
    } catch (err) {
      recordTest(id, name, 'Capture Boundaries', false, { error: err.message });
    }
  }

  // 1.5 Comprehensive handleNavigationError Oracle
  {
    const id = 'M2-C2-1.5';
    const name = 'handleNavigationError maps various network failure errors deterministically to code 4';
    try {
      const econn = handleNavigationError(new Error('connect ECONNREFUSED 127.0.0.1:80'), 'http://127.0.0.1:80');
      assert.strictEqual(econn.code, 4);
      assert.strictEqual(econn.statusCode, 'ECONNREFUSED');

      const enotfound = handleNavigationError(new Error('getaddrinfo ENOTFOUND invalid.local'), 'http://invalid.local');
      assert.strictEqual(enotfound.code, 4);
      assert.strictEqual(enotfound.statusCode, 'ECONNREFUSED');

      const etimedout = handleNavigationError(new Error('Navigation timed out after 5000ms'), 'http://example.com');
      assert.strictEqual(etimedout.code, 4);
      assert.strictEqual(etimedout.statusCode, 'ETIMEDOUT');

      const generic = handleNavigationError(new Error('net::ERR_UNEXPECTED'), 'http://foo.com');
      assert.strictEqual(generic.code, 4);
      assert.strictEqual(generic.statusCode, 'NAV_ERROR');

      recordTest(id, name, 'Capture Boundaries', true);
    } catch (err) {
      recordTest(id, name, 'Capture Boundaries', false, { error: err.message });
    }
  }

  // 1.6 Live HTML Page with 404 Font Reference -> Graceful Fallback
  {
    const id = 'M2-C2-1.6';
    const name = 'Live capture with 404 web font completes successfully without crash or abort';
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ctc_font404_'));
    const htmlPath = path.join(tmpDir, 'font404.html');

    try {
      fs.writeFileSync(htmlPath, `<!DOCTYPE html>
<html>
<head>
  <style>
    @font-face {
      font-family: 'NonExistentFont';
      src: url('/fonts/missing_font_12345.woff2') format('woff2');
    }
    body { font-family: 'NonExistentFont', sans-serif; background: #FFFFFF; }
    h1 { color: #1A1A1A; font-size: 24px; }
  </style>
</head>
<body>
  <div id="root">
    <h1>Resilient Heading</h1>
    <p>Body text rendered with system fallback font.</p>
  </div>
</body>
</html>`, 'utf8');

      const outDir = path.join(tmpDir, 'evidence');
      const result = await captureEvidenceBundle(htmlPath, {
        screenId: 'test_font_fallback',
        outputDir: outDir,
        viewports: ['portrait']
      });

      assert.strictEqual(result.success, true);
      assert.ok(fs.existsSync(path.join(outDir, 'screenshots', 'portrait.png')));
      assert.ok(fs.existsSync(path.join(outDir, 'scenes', 'portrait.json')));
      assert.ok(fs.existsSync(path.join(outDir, 'provenance.json')));

      const scene = JSON.parse(fs.readFileSync(path.join(outDir, 'scenes', 'portrait.json'), 'utf8'));
      assert.ok(scene.rootNode, 'Root node must be populated even when font 404s');
      assert.strictEqual(scene.viewport.widthPx, 1184);

      recordTest(id, name, 'Capture Boundaries', true);
    } catch (err) {
      recordTest(id, name, 'Capture Boundaries', false, { error: err.message });
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  }

  // 1.7 Mocked extractFonts handles mix of 404, 200, and declared fonts
  {
    const id = 'M2-C2-1.7';
    const name = 'extractFonts filters out 404 responses while extracting 200 fonts with SHA-256';
    try {
      let responseHandler;
      const mockPage = {
        on: (ev, cb) => { if (ev === 'response') responseHandler = cb; },
        evaluate: async () => []
      };
      const mockFrame = {
        evaluate: async () => [
          { family: 'SystemSans', weight: '400', style: 'normal', status: 'loaded' }
        ]
      };

      const fontPromise = extractFonts(mockPage, mockFrame);

      // Fire 404 font response
      responseHandler({
        url: () => 'https://example.com/fonts/missing.woff2',
        status: () => 404,
        headers: () => ({ 'content-type': 'font/woff2' }),
        request: () => ({ resourceType: () => 'font' })
      });

      // Fire 200 font response
      const fakeFontData = Buffer.from('FAKE_WOFF2_BINARY_DATA');
      responseHandler({
        url: () => 'https://example.com/fonts/RealFont.woff2',
        status: () => 200,
        headers: () => ({ 'content-type': 'font/woff2' }),
        request: () => ({ resourceType: () => 'font' }),
        body: async () => fakeFontData
      });

      const extracted = await fontPromise;
      assert.ok(Array.isArray(extracted));
      assert.ok(!extracted.some(f => f.url && f.url.includes('missing.woff2')));
      const realFont = extracted.find(f => f.url && f.url.includes('RealFont.woff2'));
      assert.ok(realFont, 'RealFont should be extracted');
      assert.strictEqual(realFont.sizeBytes, fakeFontData.length);
      assert.ok(realFont.hash.startsWith('sha256:'));
      assert.ok(extracted.some(f => f.family === 'SystemSans'));

      recordTest(id, name, 'Capture Boundaries', true);
    } catch (err) {
      recordTest(id, name, 'Capture Boundaries', false, { error: err.message });
    }
  }

  // 1.8 Dynamic Port Search with Single Occupied Port
  {
    const id = 'M2-C2-1.8';
    const name = 'findAvailablePort detects single occupied port and reallocates to next free port';
    const blocker = http.createServer();
    try {
      const blockedPort = await new Promise(resolve => blocker.listen(0, '127.0.0.1', () => resolve(blocker.address().port)));
      const reallocated = await findAvailablePort(blockedPort);

      assert.notStrictEqual(reallocated, blockedPort);
      assert.ok(reallocated > blockedPort, `Reallocated port (${reallocated}) must be > blocked port (${blockedPort})`);

      const tester = net.createServer();
      await new Promise((resolve, reject) => {
        tester.listen(reallocated, '127.0.0.1', () => {
          tester.close(resolve);
        }).on('error', reject);
      });

      recordTest(id, name, 'Capture Boundaries', true);
    } catch (err) {
      recordTest(id, name, 'Capture Boundaries', false, { error: err.message });
    } finally {
      await new Promise(r => blocker.close(r));
    }
  }

  // 1.9 Dense Port Collision (10 contiguous blocked ports)
  {
    const id = 'M2-C2-1.9';
    const name = 'findAvailablePort cleanly bypasses a contiguous block of 10 occupied ports';
    const servers = [];
    try {
      const basePort = await findAvailablePort(46000);

      for (let i = 0; i < 10; i++) {
        const s = http.createServer();
        await new Promise((resolve, reject) => {
          s.listen(basePort + i, '127.0.0.1', () => resolve()).on('error', reject);
        });
        servers.push(s);
      }

      const reallocated = await findAvailablePort(basePort);
      assert.ok(reallocated >= basePort + 10, `Expected reallocated port >= ${basePort + 10}, received ${reallocated}`);

      recordTest(id, name, 'Capture Boundaries', true);
    } catch (err) {
      recordTest(id, name, 'Capture Boundaries', false, { error: err.message });
    } finally {
      for (const s of servers) {
        await new Promise(r => s.close(r));
      }
    }
  }

  // 1.10 Ephemeral Server Port Collision & Directory Traversal Rejection
  {
    const id = 'M2-C2-1.10';
    const name = 'startEphemeralServer handles port collision and rejects directory traversal with 403';
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ctc_traversal_oracle_'));
    const indexHtml = path.join(tmpDir, 'index.html');
    fs.writeFileSync(indexHtml, '<html><body>Valid Ingestion Content</body></html>', 'utf8');

    const blocker = http.createServer();
    try {
      const blockedPort = await new Promise(resolve => blocker.listen(0, '127.0.0.1', () => resolve(blocker.address().port)));

      const ephemeral = await startEphemeralServer(indexHtml, blockedPort);
      assert.notStrictEqual(ephemeral.port, blockedPort, 'Must reallocate away from blocked port');

      const validRes = await new Promise((resolve, reject) => {
        http.get(ephemeral.url, res => {
          let data = '';
          res.on('data', chunk => { data += chunk; });
          res.on('end', () => resolve({ statusCode: res.statusCode, data }));
        }).on('error', reject);
      });
      assert.strictEqual(validRes.statusCode, 200);
      assert.ok(validRes.data.includes('Valid Ingestion Content'));

      const traversalRes = await new Promise((resolve, reject) => {
        http.get({ host: '127.0.0.1', port: ephemeral.port, path: '/../../../etc/hosts' }, res => {
          resolve({ statusCode: res.statusCode });
        }).on('error', reject);
      });
      assert.strictEqual(traversalRes.statusCode, 403, 'Directory traversal must return 403 Forbidden');

      await ephemeral.close();
      recordTest(id, name, 'Capture Boundaries', true);
    } catch (err) {
      recordTest(id, name, 'Capture Boundaries', false, { error: err.message });
    } finally {
      await new Promise(r => blocker.close(r));
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  }

  // =========================================================================
  // GROUP 2: Multi-Viewport Validation (DC1 Portrait vs Landscape)
  // =========================================================================
  console.log('\n─── Group 2: Multi-Viewport Validation (DC1 Portrait vs Landscape) ───');

  // 2.1 DC1 Viewport Constants Oracle
  {
    const id = 'M2-C2-2.1';
    const name = 'DC1 Viewport specifications adhere exactly to hardware profile (1184x1584 vs 1584x1184)';
    try {
      assert.strictEqual(DC1_VIEWPORTS.portrait.width, 1184);
      assert.strictEqual(DC1_VIEWPORTS.portrait.height, 1584);
      assert.strictEqual(DC1_VIEWPORTS.portrait.orientation, 'portrait');
      assert.strictEqual(DC1_VIEWPORTS.portrait.hasTouch, true);
      assert.strictEqual(DC1_VIEWPORTS.portrait.deviceScaleFactor, 1.0);

      assert.strictEqual(DC1_VIEWPORTS.landscape.width, 1584);
      assert.strictEqual(DC1_VIEWPORTS.landscape.height, 1184);
      assert.strictEqual(DC1_VIEWPORTS.landscape.orientation, 'landscape');
      assert.strictEqual(DC1_VIEWPORTS.landscape.hasTouch, true);
      assert.strictEqual(DC1_VIEWPORTS.landscape.deviceScaleFactor, 1.0);

      recordTest(id, name, 'Multi-Viewport', true);
    } catch (err) {
      recordTest(id, name, 'Multi-Viewport', false, { error: err.message });
    }
  }

  // 2.2 Live Multi-Viewport Capture & Dimension Verification
  {
    const id = 'M2-C2-2.2';
    const name = 'Live capture generates distinct, pixel-accurate screenshots and scene measurements across portrait and landscape';
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ctc_multivp_oracle_'));
    const htmlFile = path.join(tmpDir, 'responsive.html');

    try {
      fs.writeFileSync(htmlFile, `<!DOCTYPE html>
<html>
<head>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { background: #FFFFFF; width: 100vw; height: 100vh; display: flex; flex-direction: column; }
    header { width: 100%; height: 80px; background: #F7F7F7; border-bottom: 1px solid #DCD5C9; }
    main { display: flex; flex: 1; }
    aside { width: 280px; height: 100%; background: #F5F5F5; }
    section { flex: 1; padding: 20px; }
    .fluid-card { width: 50%; height: 200px; background: #EEEEEE; }
  </style>
</head>
<body>
  <header id="masthead" data-source-id="masthead"><h1>Title</h1></header>
  <main id="main_layout" data-source-id="main_layout">
    <aside id="sidebar" data-source-id="sidebar">Sidebar</aside>
    <section id="content" data-source-id="content">
      <div id="card" data-source-id="card" class="fluid-card">Card</div>
    </section>
  </main>
</body>
</html>`, 'utf8');

      const outDir = path.join(tmpDir, 'evidence');
      const captureResult = await captureEvidenceBundle(htmlFile, {
        screenId: 'responsive_pilot',
        outputDir: outDir,
        viewports: ['portrait', 'landscape']
      });

      assert.strictEqual(captureResult.success, true);

      const portraitImgPath = path.join(outDir, 'screenshots', 'portrait.png');
      const landscapeImgPath = path.join(outDir, 'screenshots', 'landscape.png');

      assert.ok(fs.existsSync(portraitImgPath), 'Portrait screenshot must exist');
      assert.ok(fs.existsSync(landscapeImgPath), 'Landscape screenshot must exist');

      const portraitMeta = await sharp(portraitImgPath).metadata();
      assert.strictEqual(portraitMeta.width, 1184, `Portrait width must be 1184, got ${portraitMeta.width}`);
      assert.strictEqual(portraitMeta.height, 1584, `Portrait height must be 1584, got ${portraitMeta.height}`);

      const landscapeMeta = await sharp(landscapeImgPath).metadata();
      assert.strictEqual(landscapeMeta.width, 1584, `Landscape width must be 1584, got ${landscapeMeta.width}`);
      assert.strictEqual(landscapeMeta.height, 1184, `Landscape height must be 1184, got ${landscapeMeta.height}`);

      const portraitScene = JSON.parse(fs.readFileSync(path.join(outDir, 'scenes', 'portrait.json'), 'utf8'));
      const landscapeScene = JSON.parse(fs.readFileSync(path.join(outDir, 'scenes', 'landscape.json'), 'utf8'));

      assert.strictEqual(portraitScene.viewport.widthPx, 1184);
      assert.strictEqual(portraitScene.viewport.heightPx, 1584);
      assert.strictEqual(portraitScene.viewport.orientation, 'portrait');

      assert.strictEqual(landscapeScene.viewport.widthPx, 1584);
      assert.strictEqual(landscapeScene.viewport.heightPx, 1184);
      assert.strictEqual(landscapeScene.viewport.orientation, 'landscape');

      function findNode(node, sourceIdSub) {
        if (!node) return null;
        if (node.sourceId && node.sourceId.includes(sourceIdSub)) return node;
        for (const child of (node.children || [])) {
          const res = findNode(child, sourceIdSub);
          if (res) return res;
        }
        return null;
      }

      const pMasthead = findNode(portraitScene.rootNode, 'masthead');
      const lMasthead = findNode(landscapeScene.rootNode, 'masthead');

      assert.ok(pMasthead, 'Masthead node must exist in portrait scene');
      assert.ok(lMasthead, 'Masthead node must exist in landscape scene');

      assert.strictEqual(pMasthead.bounds.width, 1184, `Expected portrait masthead width 1184, got ${pMasthead.bounds.width}`);
      assert.strictEqual(lMasthead.bounds.width, 1584, `Expected landscape masthead width 1584, got ${lMasthead.bounds.width}`);

      const pSidebar = findNode(portraitScene.rootNode, 'sidebar');
      const lSidebar = findNode(landscapeScene.rootNode, 'sidebar');
      assert.ok(pSidebar && lSidebar);
      assert.strictEqual(pSidebar.bounds.width, 280);
      assert.strictEqual(lSidebar.bounds.width, 280);

      recordTest(id, name, 'Multi-Viewport', true);
    } catch (err) {
      recordTest(id, name, 'Multi-Viewport', false, { error: err.message });
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  }

  // 2.3 Sizing Intent Inference Oracle across Viewport Dimensions
  {
    const id = 'M2-C2-2.3';
    const name = 'inferNodeIntent differentiates FILL_PARENT vs FIXED vs PROPORTIONAL_WEIGHT based on viewport expansion delta';
    try {
      const fillIntent = inferNodeIntent({
        sourceId: 'masthead',
        category: 'container',
        measuredWidthAcrossViewports: [1184, 1584]
      });
      assert.strictEqual(fillIntent.sizing.widthMode, 'FILL_PARENT', 'Delta >= 300px must infer FILL_PARENT');
      assert.strictEqual(fillIntent.sizing.fixedWidthDp, undefined, 'FILL_PARENT must omit fixedWidthDp');
      assert.ok(fillIntent.confidence >= 0.95, 'High confidence for multi-viewport measurement');

      const fixedIntent = inferNodeIntent({
        sourceId: 'sidebar',
        category: 'box',
        measuredWidthAcrossViewports: [280, 280]
      });
      assert.strictEqual(fixedIntent.sizing.widthMode, 'FIXED', 'Delta <= 2px on container must infer FIXED');
      assert.strictEqual(fixedIntent.sizing.fixedWidthDp, 140, 'Fixed width dp must be half px (280 / 2 = 140dp)');
      assert.ok(fixedIntent.confidence >= 0.95);

      const textIntent = inferNodeIntent({
        sourceId: 'label',
        category: 'text',
        isText: true,
        measuredWidthAcrossViewports: [120, 120]
      });
      assert.strictEqual(textIntent.sizing.widthMode, 'INTRINSIC_WRAP', 'Constant text width must infer INTRINSIC_WRAP');

      const propIntent = inferNodeIntent({
        sourceId: 'card',
        category: 'container',
        measuredWidthAcrossViewports: [592, 792]
      });
      assert.strictEqual(propIntent.sizing.widthMode, 'PROPORTIONAL_WEIGHT');
      assert.ok(propIntent.sizing.weight > 0);

      const singleVpIntent = inferNodeIntent({
        sourceId: 'unknown_elem',
        singleViewportOnly: true,
        measuredWidthDp: 200
      });
      assert.strictEqual(singleVpIntent.confidence, 0.70, 'Single viewport must yield 0.70 confidence');

      recordTest(id, name, 'Multi-Viewport', true);
    } catch (err) {
      recordTest(id, name, 'Multi-Viewport', false, { error: err.message });
    }
  }

  // 2.4 Multi-Viewport Breakpoint Rules Oracle
  {
    const id = 'M2-C2-2.4';
    const name = 'createBreakpointRules emits valid responsive rules for portrait and landscape';
    try {
      const rules = createBreakpointRules({
        portrait: { visibility: 'VISIBLE', flowOverride: 'COLUMN' },
        landscape: { visibility: 'VISIBLE', flowOverride: 'ROW' }
      });

      assert.strictEqual(rules.daylightPortrait.flowOverride, 'COLUMN');
      assert.strictEqual(rules.daylightPortrait.visibility, 'VISIBLE');
      assert.strictEqual(rules.daylightLandscape.flowOverride, 'ROW');
      assert.strictEqual(rules.daylightLandscape.visibility, 'VISIBLE');

      recordTest(id, name, 'Multi-Viewport', true);
    } catch (err) {
      recordTest(id, name, 'Multi-Viewport', false, { error: err.message });
    }
  }

  // =========================================================================
  // GROUP 3: Behavior Contract Transitions
  // =========================================================================
  console.log('\n─── Group 3: Behavior Contract Transitions ───');

  // 3.1 Checkpoints Construction & DC1 Settle Normalization
  {
    const id = 'M2-C2-3.1';
    const name = 'createBehaviorContract constructs t0 -> t1 -> t2 replay checkpoints and normalizes settle standard to 150ms';
    try {
      const contract = createBehaviorContract({
        screenId: 'note_editor',
        settleStandardMs: 150
      });

      assert.strictEqual(contract.targetDisplay.settleStandardMs, 150);
      assert.strictEqual(contract.targetDisplay.zeroEpdWaveforms, true);
      assert.strictEqual(contract.targetDisplay.allowScreenClearFlashes, false);

      const checkpoints = contract.checkpoints;
      assert.strictEqual(checkpoints.length, 3);
      assert.strictEqual(checkpoints[0].id, 't0_initial');
      assert.strictEqual(checkpoints[0].timestampMs, 0);
      assert.strictEqual(checkpoints[1].id, 't1_interaction');
      assert.strictEqual(checkpoints[1].timestampMs, 50);
      assert.strictEqual(checkpoints[2].id, 't2_settled');
      assert.strictEqual(checkpoints[2].timestampMs, 150);

      recordTest(id, name, 'Behavior Contracts', true);
    } catch (err) {
      recordTest(id, name, 'Behavior Contracts', false, { error: err.message });
    }
  }

  // 3.2 State Transition Graph Validation
  {
    const id = 'M2-C2-3.2';
    const name = 'validateStateGraph verifies transition consistency and rejects undefined state references';
    try {
      const validGraph = {
        namedStates: ['EMPTY', 'EDITING', 'SAVED'],
        transitions: [
          { fromState: 'EMPTY', toState: 'EDITING', triggerEvent: { eventType: 'TAP', targetSourceId: 'new_note_btn' } },
          { fromState: 'EDITING', toState: 'SAVED', triggerEvent: { eventType: 'KEY_EVENT', targetSourceId: 'body_input' } }
        ]
      };
      assert.strictEqual(validateStateGraph(validGraph), true);

      assert.throws(() => {
        validateStateGraph({
          namedStates: ['EMPTY', 'SAVED'],
          transitions: [
            { fromState: 'NON_EXISTENT_STATE', toState: 'SAVED', triggerEvent: { targetSourceId: 'btn' } }
          ]
        });
      }, /fromState "NON_EXISTENT_STATE" not found in namedStates/);

      assert.throws(() => {
        validateStateGraph({
          namedStates: ['EMPTY', 'SAVED'],
          transitions: [
            { fromState: 'EMPTY', toState: 'ORPHAN_STATE', triggerEvent: { targetSourceId: 'btn' } }
          ]
        });
      }, /toState "ORPHAN_STATE" not found in namedStates/);

      recordTest(id, name, 'Behavior Contracts', true);
    } catch (err) {
      recordTest(id, name, 'Behavior Contracts', false, { error: err.message });
    }
  }

  // 3.3 Trigger Event Validation & Supported Event Types
  {
    const id = 'M2-C2-3.3';
    const name = 'validateTrigger enforces targetSourceId and restricts to supported hardware & UI event types';
    try {
      assert.strictEqual(validateTrigger({ targetSourceId: 'save_icon', eventType: 'TAP' }), true);

      assert.throws(() => {
        validateTrigger({ eventType: 'TAP' });
      }, /targetSourceId required/);

      assert.throws(() => {
        validateTrigger({ targetSourceId: '   ', eventType: 'TAP' });
      }, /targetSourceId required/);

      assert.throws(() => {
        validateTrigger({ targetSourceId: 'btn', eventType: 'MOUSE_HOVER' });
      }, /Invalid eventType: "MOUSE_HOVER"/);

      for (const evType of SUPPORTED_EVENT_TYPES) {
        assert.strictEqual(validateTrigger({ targetSourceId: 'valid_target', eventType: evType }), true);
      }

      recordTest(id, name, 'Behavior Contracts', true);
    } catch (err) {
      recordTest(id, name, 'Behavior Contracts', false, { error: err.message });
    }
  }

  // 3.4 Circular State Transition Loop Detection
  {
    const id = 'M2-C2-3.4';
    const name = 'detectCircularLoops flags unguarded circular transition cycles while permitting guarded loops';
    try {
      const unguardedGraph = {
        transitions: [
          { fromState: 'STATE_A', toState: 'STATE_B' },
          { fromState: 'STATE_B', toState: 'STATE_A' }
        ]
      };
      const check1 = detectCircularLoops(unguardedGraph);
      assert.strictEqual(check1.hasUnguardedCycle, true);
      assert.ok(check1.cycles.length > 0);

      const guardedGraph = {
        transitions: [
          { fromState: 'STATE_A', toState: 'STATE_B' },
          { fromState: 'STATE_B', toState: 'STATE_A', guardCondition: 'retryCount < 3' }
        ]
      };
      const check2 = detectCircularLoops(guardedGraph);
      assert.strictEqual(check2.hasUnguardedCycle, false, 'Guarded transition must not be treated as infinite unguarded cycle');

      const selfLoopGraph = {
        transitions: [
          { fromState: 'STATE_A', toState: 'STATE_A' }
        ]
      };
      const check3 = detectCircularLoops(selfLoopGraph);
      assert.strictEqual(check3.hasUnguardedCycle, true);

      const dagGraph = {
        transitions: [
          { fromState: 'STATE_A', toState: 'STATE_B' },
          { fromState: 'STATE_B', toState: 'STATE_C' }
        ]
      };
      const check4 = detectCircularLoops(dagGraph);
      assert.strictEqual(check4.hasUnguardedCycle, false);

      recordTest(id, name, 'Behavior Contracts', true);
    } catch (err) {
      recordTest(id, name, 'Behavior Contracts', false, { error: err.message });
    }
  }

  // 3.5 Settle Time Normalization Oracle
  {
    const id = 'M2-C2-3.5';
    const name = 'normalizeSettleMs clamps aberrant settle durations to 150ms DC1 LivePaper standard';
    try {
      assert.strictEqual(normalizeSettleMs(150), 150);
      assert.strictEqual(normalizeSettleMs(undefined), 150);
      assert.strictEqual(normalizeSettleMs(null), 150);
      assert.strictEqual(normalizeSettleMs(-100), 150, 'Negative settle time must clamp to 150ms');
      assert.strictEqual(normalizeSettleMs(10000), 150, 'Extreme delay > 5000ms must clamp to 150ms');
      assert.strictEqual(normalizeSettleMs('invalid'), 150);
      assert.strictEqual(normalizeSettleMs(200), 200, 'Valid reasonable delay within [0, 5000] is preserved');

      recordTest(id, name, 'Behavior Contracts', true);
    } catch (err) {
      recordTest(id, name, 'Behavior Contracts', false, { error: err.message });
    }
  }

  // =========================================================================
  // GROUP 4: Contract Compilation & Pipeline Integration
  // =========================================================================
  console.log('\n─── Group 4: Contract Compilation & Pipeline Integration ───');

  // 4.1 In-Memory Evidence Contract Compilation
  {
    const id = 'M2-C2-4.1';
    const name = 'buildDesignContract compiles in-memory evidence bundle with Draft 2020-12 validation and cryptographic receipt';
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ctc_compiler_inmem_'));
    const contractDir = path.join(tmpDir, 'contract');

    try {
      const portraitScene = {
        viewport: { widthPx: 1184, heightPx: 1584, orientation: 'portrait' },
        screenshotHash: 'sha256:' + 'a'.repeat(64),
        screenshotPath: 'screenshots/portrait.png',
        rootNode: {
          domTag: 'body',
          sourceId: 'daylight#pilot/root',
          bounds: { x: 0, y: 0, width: 1184, height: 1584 },
          children: [
            {
              domTag: 'header',
              sourceId: 'daylight#pilot/header',
              bounds: { x: 0, y: 0, width: 1184, height: 80 },
              children: []
            }
          ]
        }
      };

      const landscapeScene = {
        viewport: { widthPx: 1584, heightPx: 1184, orientation: 'landscape' },
        screenshotHash: 'sha256:' + 'b'.repeat(64),
        screenshotPath: 'screenshots/landscape.png',
        rootNode: {
          domTag: 'body',
          sourceId: 'daylight#pilot/root',
          bounds: { x: 0, y: 0, width: 1584, height: 1184 },
          children: [
            {
              domTag: 'header',
              sourceId: 'daylight#pilot/header',
              bounds: { x: 0, y: 0, width: 1584, height: 80 },
              children: []
            }
          ]
        }
      };

      const inMemoryEvidence = {
        screenId: 'pilot',
        scenes: {
          portrait: portraitScene,
          landscape: landscapeScene
        }
      };

      const compiled = await buildDesignContract('pilot', inMemoryEvidence, { outputDir: contractDir });

      assert.strictEqual(compiled.screenId, 'pilot');
      assert.ok(compiled.contract);
      assert.ok(compiled.receipt);
      assert.ok(compiled.contract.measuredScenes);
      assert.ok(compiled.contract.layoutIntent);
      assert.ok(compiled.contract.behaviorContract);
      assert.ok(compiled.contract.designSystem);

      assert.ok(fs.existsSync(path.join(contractDir, 'measured-scenes.json')));
      assert.ok(fs.existsSync(path.join(contractDir, 'layout-intent.json')));
      assert.ok(fs.existsSync(path.join(contractDir, 'behavior-contract.json')));
      assert.ok(fs.existsSync(path.join(contractDir, 'design-system.json')));
      assert.ok(fs.existsSync(path.join(contractDir, 'contract-receipt.json')));

      recordTest(id, name, 'Contract Compilation', true);
    } catch (err) {
      recordTest(id, name, 'Contract Compilation', false, { error: err.message });
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  }

  // 4.2 Verified: File-based evidenceDir path integration with scenes/ layout
  {
    const id = 'M2-C2-4.2';
    const name = 'buildDesignContract directory input successfully ingests scenes/ layout without evidence.json';
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ctc_probe_dir_'));
    const evidenceDir = path.join(tmpDir, 'evidence');
    const contractDir = path.join(tmpDir, 'contract');
    fs.mkdirSync(path.join(evidenceDir, 'scenes'), { recursive: true });

    try {
      fs.writeFileSync(path.join(evidenceDir, 'scenes', 'daylight_portrait.json'), JSON.stringify({
        viewport: { widthPx: 1184, heightPx: 1584, orientation: 'portrait' },
        rootNode: { domTag: 'div', bounds: { x: 0, y: 0, width: 1184, height: 1584 } }
      }));

      const compiled = await buildDesignContract('probe_screen', evidenceDir, { outputDir: contractDir });
      assert.ok(compiled);
      assert.strictEqual(compiled.screenId, 'probe_screen');
      assert.ok(compiled.contract.measuredScenes);
      assert.ok(fs.existsSync(path.join(contractDir, 'measured-scenes.json')));
      assert.ok(fs.existsSync(path.join(contractDir, 'contract-receipt.json')));
      recordTest(id, name, 'Contract Compilation', true, {
        note: 'Confirmed: compiler.js successfully reads scenes/ directory layout emitted by captureEvidenceBundle'
      });
    } catch (err) {
      recordTest(id, name, 'Contract Compilation', false, { error: err.message });
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  }

  // =========================================================================
  // SUMMARY
  // =========================================================================
  console.log('\n' + '='.repeat(80));
  console.log('  CHALLENGER 2 TEST EXECUTION SUMMARY');
  console.log('='.repeat(80));
  console.log(`  Total Tests: ${results.length}`);
  console.log(`  Passed:      ${passCount}`);
  console.log(`  Failed:      ${failCount}`);
  console.log('='.repeat(80) + '\n');

  if (failCount > 0) {
    console.error(`\x1b[31mFAIL: ${failCount} stress tests failed.\x1b[0m`);
    process.exit(1);
  } else {
    console.log(`\x1b[32mSUCCESS: All ${passCount} empirical stress tests completed!\x1b[0m`);
    process.exit(0);
  }
}

runAllTests().catch(err => {
  console.error('Fatal unhandled error in test execution:', err);
  process.exit(1);
});
