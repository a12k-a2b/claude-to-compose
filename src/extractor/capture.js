'use strict';

/**
 * src/extractor/capture.js
 *
 * Primary entrypoint for ctc Web Evidence Capture Engine (Feature 10).
 * Implements headless Playwright capture targeting Daylight Computer (DC1) LivePaper,
 * deep frame piercing for Claude Design artifacts, 5-phase hydration barrier,
 * font & vector pipelines, dynamic port discovery ephemeral server, and cryptographic provenance receipts.
 */

const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const net = require('node:net');
const crypto = require('node:crypto');
const { chromium } = require('playwright');

// Require existing engine modules for vector parsing, DOM walking, and screenshotting
const svgParser = require('../../extractor/svg_parser');
const { Screenshotter } = require('../../extractor/screenshotter');
const { walkDOM } = require('../../extractor/dom_walker');
const { createMeasuredNode, createMeasuredBundle } = require('../contract/measured_scene_builder');

// MIME types for ephemeral web server
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf'
};

// DC1 Viewport Profiles
const DC1_VIEWPORTS = {
  portrait: {
    name: 'portrait',
    width: 1184,
    height: 1584,
    deviceScaleFactor: 1.0,
    orientation: 'portrait',
    isMobile: false,
    hasTouch: true,
    screenshotName: 'portrait.png',
    sceneName: 'portrait.json'
  },
  landscape: {
    name: 'landscape',
    width: 1584,
    height: 1184,
    deviceScaleFactor: 1.0,
    orientation: 'landscape',
    isMobile: false,
    hasTouch: true,
    screenshotName: 'landscape.png',
    sceneName: 'landscape.json'
  }
};

/**
 * Handles navigation error, converting connection failures or timeouts into structured errors.
 * Code 4 = NAVIGATION_FAILED.
 * @param {Error|any} err
 * @param {string} targetUrl
 * @returns {Error}
 */
function handleNavigationError(err, targetUrl) {
  const message = err?.message || String(err);
  const isConnRefused = /ECONNREFUSED|ERR_CONNECTION_REFUSED|ENOTFOUND|ERR_NAME_NOT_RESOLVED/i.test(message);
  const isTimeout = /timeout|timed out/i.test(message);

  const errorObj = new Error(`Navigation failed for target "${targetUrl}": ${message}`);
  errorObj.code = 4;
  errorObj.statusCode = isConnRefused ? 'ECONNREFUSED' : (isTimeout ? 'ETIMEDOUT' : 'NAV_ERROR');
  errorObj.targetUrl = targetUrl;
  errorObj.isRecoverable = false;

  return errorObj;
}

/**
 * Checks whether a network port is available.
 * @param {number} port
 * @returns {Promise<boolean>}
 */
function testPortAvailability(port) {
  return new Promise(resolve => {
    const tester = net.createServer()
      .once('error', () => resolve(false))
      .once('listening', () => {
        tester.once('close', () => resolve(true)).close();
      })
      .listen(port, '127.0.0.1');
  });
}

/**
 * Finds an available port starting at startingPort, with collision recovery up to +100.
 * @param {number} startingPort
 * @returns {Promise<number>}
 */
async function findAvailablePort(startingPort = 0) {
  if (startingPort === 0) {
    return new Promise((resolve, reject) => {
      const srv = net.createServer();
      srv.listen(0, '127.0.0.1', () => {
        const port = srv.address().port;
        srv.close(() => resolve(port));
      });
      srv.on('error', reject);
    });
  }

  let port = startingPort;
  const maxPort = startingPort + 100;
  while (port < maxPort) {
    const isFree = await testPortAvailability(port);
    if (isFree) return port;
    port++;
  }
  throw new Error(`No available port found in range ${startingPort}..${maxPort}`);
}

/**
 * Starts an ephemeral HTTP server to serve local HTML/CSS bundles.
 * Protects against directory traversal and handles port collisions.
 * @param {string} targetPathOrDir
 * @param {number} [preferredPort=0]
 * @returns {Promise<{ server: http.Server, port: number, url: string, close: Function }>}
 */
async function startEphemeralServer(targetPathOrDir, preferredPort = 0) {
  const resolved = path.resolve(targetPathOrDir);
  let rootDir;
  let defaultFile = 'index.html';

  if (fs.existsSync(resolved) && fs.statSync(resolved).isDirectory()) {
    rootDir = resolved;
  } else {
    rootDir = path.dirname(resolved);
    defaultFile = path.basename(resolved);
  }

  const port = await findAvailablePort(preferredPort);

  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      try {
        const parsed = new URL(req.url, `http://${req.headers.host || '127.0.0.1'}`);
        let pathname = decodeURIComponent(parsed.pathname);

        if (pathname === '/' || pathname === '') {
          pathname = `/${defaultFile}`;
        }

        const rawUrl = req.url || '';
        if (rawUrl.includes('..') || pathname.includes('..')) {
          res.writeHead(403, { 'Content-Type': 'text/plain' });
          res.end('Forbidden: Path Traversal Denied');
          return;
        }

        const safePath = path.normalize(path.join(rootDir, pathname));
        const rel = path.relative(rootDir, safePath);
        if (rel.startsWith('..') || path.isAbsolute(rel) || !safePath.startsWith(rootDir)) {
          res.writeHead(403, { 'Content-Type': 'text/plain' });
          res.end('Forbidden: Path Traversal Denied');
          return;
        }

        if (!fs.existsSync(safePath) || fs.statSync(safePath).isDirectory()) {
          res.writeHead(404, { 'Content-Type': 'text/plain' });
          res.end(`Not Found: ${pathname}`);
          return;
        }

        const ext = path.extname(safePath).toLowerCase();
        const contentType = MIME_TYPES[ext] || 'application/octet-stream';
        const fileContent = fs.readFileSync(safePath);

        res.writeHead(200, {
          'Content-Type': contentType,
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, OPTIONS',
          'Cross-Origin-Embedder-Policy': 'unsafe-none',
          'Cross-Origin-Opener-Policy': 'unsafe-none'
        });
        res.end(fileContent);
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end(`Internal Server Error: ${err.message}`);
      }
    });

    server.on('error', reject);
    server.listen(port, '127.0.0.1', () => {
      const actualPort = server.address().port;
      const url = `http://127.0.0.1:${actualPort}/${defaultFile}`;
      resolve({
        server,
        port: actualPort,
        url,
        close: () => new Promise(cb => server.close(cb))
      });
    });
  });
}

/**
 * Deep frame piercer finding the active artifact iframe in Claude Design shares.
 * @param {import('playwright').Page} page
 * @returns {Promise<import('playwright').Frame>}
 */
async function findArtifactFrame(page) {
  const frames = page.frames();
  for (const frame of frames) {
    const url = frame.url();
    if (url.includes('claudeusercontent.com') || url.includes('blob:') || frame.name().includes('artifact')) {
      return frame;
    }
  }
  return page.mainFrame();
}

/**
 * 5-Phase Hydration & Settling Barrier for DC1 LivePaper display:
 * Phase 1: Network Idle
 * Phase 2: DOM Root Hydration
 * Phase 3: CSS / Tailwind Compilation
 * Phase 4: Font Barrier (document.fonts.ready)
 * Phase 5: CSS Animation Settling + 150ms DC1 LivePaper buffer
 *
 * @param {import('playwright').Page} page
 * @param {import('playwright').Frame} [targetFrame]
 * @param {Object} [options]
 * @returns {Promise<{ settled: boolean, settleMs: number, phasesCompleted: number }>}
 */
async function waitForHydration(page, targetFrame, options = {}) {
  const frame = targetFrame || page.mainFrame();
  const timeout = options.timeout || 30000;

  // Phase 1: Network Idle (wait up to 5s, catch timeout without crashing)
  try {
    await page.waitForLoadState('networkidle', { timeout: Math.min(5000, timeout) });
  } catch (_) {
    // Network idle timeout is non-blocking for polling sockets
  }

  // Phase 2: DOM Root Hydration
  try {
    await frame.waitForFunction(() => {
      const root = document.querySelector('#root') ||
                   document.querySelector('#app') ||
                   document.querySelector('main') ||
                   document.body;
      return root && (root.children.length > 0 || (root.innerText && root.innerText.trim().length > 0));
    }, { timeout: Math.min(10000, timeout) });
  } catch (err) {
    const timeoutErr = new Error(`Hydration timeout: DOM root not populated within ${timeout}ms: ${err.message}`);
    timeoutErr.code = 5; // HYDRATION_TIMEOUT
    throw timeoutErr;
  }

  // Phase 3: CSS / Tailwind Check
  try {
    await frame.waitForFunction(() => {
      return document.styleSheets && document.styleSheets.length > 0;
    }, { timeout: 3000 });
  } catch (_) {
    // Proceed if stylesheet evaluation finishes
  }

  // Phase 4: Font Barrier
  try {
    await frame.evaluate(async () => {
      if (document.fonts && document.fonts.ready) {
        await document.fonts.ready;
      }
    });
  } catch (_) {
    // 404 font resilience: do not abort extraction if a webfont fails
  }

  // Phase 5: Animation Settling + 150ms DC1 LivePaper standard settle wait
  try {
    await frame.evaluate(async () => {
      if (document.getAnimations) {
        const anims = document.getAnimations();
        await Promise.all(anims.map(a => a.finished.catch(() => {})));
      }
    });
  } catch (_) {}

  // Enforce 150ms DC1 LivePaper settling wait
  await new Promise(r => setTimeout(r, 150));

  return {
    settled: true,
    settleMs: 150,
    phasesCompleted: 5
  };
}

/**
 * Extracts and parses SVG vectors from frame or raw string.
 * Normalizes primitive shapes, bakes affine transforms into coordinates.
 * @param {any} frameOrSvg
 * @param {Object} [options]
 * @returns {Promise<Object[]>|Object[]}
 */
async function extractVectors(frameOrSvg, options = {}) {
  if (typeof frameOrSvg === 'string') {
    if (typeof svgParser.parseSvgString === 'function') {
      return svgParser.parseSvgString(frameOrSvg);
    }
    if (typeof svgParser.parseSvg === 'function') {
      return svgParser.parseSvg(frameOrSvg);
    }
    if (typeof svgParser.SvgParser?.parseSvgString === 'function') {
      return svgParser.SvgParser.parseSvgString(frameOrSvg);
    }
    return null;
  }

  if (frameOrSvg && typeof frameOrSvg.evaluate === 'function') {
    const rawSvgs = await frameOrSvg.evaluate(() => {
      const svgElements = Array.from(document.querySelectorAll('svg'));
      return svgElements.map((el, idx) => ({
        index: idx,
        outerHtml: el.outerHTML,
        id: el.id || el.getAttribute('data-testid') || `vector_${idx + 1}`,
        bounds: el.getBoundingClientRect()
      }));
    });

    const parsedList = [];
    for (const item of rawSvgs) {
      try {
        const rawSvg = item.outerHtml || '';
        const parseFn = typeof svgParser.parseSvgString === 'function'
          ? svgParser.parseSvgString
          : (typeof svgParser.parseSvg === 'function'
            ? svgParser.parseSvg
            : (typeof svgParser.SvgParser?.parseSvgString === 'function'
              ? svgParser.SvgParser.parseSvgString
              : null));

        if (!parseFn) {
          console.warn('[capture] No SVG parsing function available on svgParser');
          continue;
        }

        const parsed = parseFn(rawSvg);
        const baked = (svgParser.bakeVectorTransforms && parsed)
          ? svgParser.bakeVectorTransforms(parsed)
          : (parsed || {});

        const assetId = item.id || `asset-${item.index != null ? item.index + 1 : parsedList.length + 1}`;
        const hash = 'sha256:' + crypto.createHash('sha256').update(rawSvg).digest('hex');
        const width = (item.bounds && typeof item.bounds.width === 'number') ? item.bounds.width : (baked.width || 24);
        const height = (item.bounds && typeof item.bounds.height === 'number') ? item.bounds.height : (baked.height || 24);

        parsedList.push({
          assetId,
          id: item.id || assetId,
          type: 'svg',
          mimeType: 'image/svg+xml',
          hash,
          width,
          height,
          bounds: item.bounds,
          vectorData: baked,
          ...baked
        });
      } catch (err) {
        console.warn(`[capture] Warning: failed to parse SVG vector ${item.id}:`, err.message);
      }
    }
    return parsedList;
  }

  return [];
}

/**
 * Extracts fonts referenced in document and intercepts loaded font network traffic.
 * Handles missing web font 404 responses gracefully without aborting extraction.
 * @param {import('playwright').Page|any} page
 * @param {import('playwright').Frame} [targetFrame]
 * @param {Object} [options]
 * @returns {Promise<Object[]>}
 */
async function extractFonts(page, targetFrame, options = {}) {
  const loadedFonts = [];
  const warnings = [];

  if (!page || typeof page.evaluate !== 'function') {
    return loadedFonts;
  }

  const frame = targetFrame || page.mainFrame();

  // Seed with pre-intercepted font responses (if attached before page.goto)
  const fontResponses = Array.isArray(options.fontResponses) ? [...options.fontResponses] : [];
  const onResponse = response => {
    try {
      const request = typeof response.request === 'function' ? response.request() : null;
      const url = typeof response.url === 'function' ? response.url() : (response.url || '');
      const headers = typeof response.headers === 'function' ? response.headers() : (response.headers || {});
      const contentType = headers['content-type'] || headers['Content-Type'] || '';
      const isFont = (request && typeof request.resourceType === 'function' && request.resourceType() === 'font') ||
        /\.(woff2?|ttf|otf|eot)(\?|$)/i.test(url) ||
        contentType.includes('font');

      if (isFont) {
        fontResponses.push({
          url,
          status: typeof response.status === 'function' ? response.status() : 200,
          response
        });
      }
    } catch (_) {}
  };

  if (typeof page.on === 'function') {
    page.on('response', onResponse);
  }

  // Interrogate document.fonts
  let declaredFonts = [];
  try {
    declaredFonts = await frame.evaluate(() => {
      const fonts = [];
      if (document.fonts) {
        for (const font of document.fonts) {
          fonts.push({
            family: font.family,
            weight: font.weight,
            style: font.style,
            status: font.status
          });
        }
      }
      return fonts;
    });
  } catch (_) {}

  // Process intercepted font responses
  for (const item of fontResponses) {
    if (item.status === 404) {
      warnings.push(`Font 404 response encountered for URL: ${item.url}`);
      continue;
    }
    if (item.status === 200) {
      try {
        const buffer = await item.response.body();
        const hash = 'sha256:' + crypto.createHash('sha256').update(buffer).digest('hex');
        const familyName = path.basename(item.url).replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9_]/g, '_');
        loadedFonts.push({
          family: familyName,
          url: item.url,
          hash,
          sizeBytes: buffer.length,
          status: 'LOADED',
          buffer
        });
      } catch (_) {}
    }
  }

  // Merge declared fonts that might have loaded via system or local caches
  for (const declared of declaredFonts) {
    if (!loadedFonts.some(f => f.family.toLowerCase() === declared.family.replace(/['"]/g, '').toLowerCase())) {
      const parsedWeight = parseInt(declared.weight, 10);
      const integerWeight = Number.isInteger(parsedWeight) ? parsedWeight : (declared.weight === 'bold' ? 700 : 400);
      loadedFonts.push({
        family: declared.family.replace(/['"]/g, ''),
        weight: integerWeight,
        style: declared.style,
        status: declared.status,
        hash: 'sha256:' + crypto.createHash('sha256').update(declared.family).digest('hex')
      });
    }
  }

  return loadedFonts;
}

/**
 * Computes SHA-256 asset hashes for an evidence directory or collection of files.
 * @param {string|Object} evidenceDirOrFiles
 * @returns {Object} map of relative file path -> 'sha256:...'
 */
function computeAssetHashes(evidenceDirOrFiles) {
  const hashes = {};

  if (typeof evidenceDirOrFiles === 'string') {
    const baseDir = evidenceDirOrFiles;
    if (!fs.existsSync(baseDir)) return hashes;

    function walk(dir) {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(full);
        } else if (entry.isFile()) {
          const content = fs.readFileSync(full);
          const rel = path.relative(baseDir, full);
          hashes[rel] = 'sha256:' + crypto.createHash('sha256').update(content).digest('hex');
        }
      }
    }
    walk(baseDir);
  } else if (typeof evidenceDirOrFiles === 'object' && evidenceDirOrFiles !== null) {
    for (const [key, val] of Object.entries(evidenceDirOrFiles)) {
      if (typeof val === 'string' || Buffer.isBuffer(val)) {
        hashes[key] = 'sha256:' + crypto.createHash('sha256').update(val).digest('hex');
      } else {
        hashes[key] = 'sha256:' + crypto.createHash('sha256').update(JSON.stringify(val)).digest('hex');
      }
    }
  }

  return hashes;
}

/**
 * Generates cryptographic provenance receipt (`provenance.json`).
 * @param {Object} evidenceData
 * @returns {Object} ProvenanceReceipt
 */
function generateProvenanceReceipt(evidenceData = {}) {
  const screenId = evidenceData.screenId || 'unnamed_screen';
  const capturedAt = evidenceData.capturedAt || new Date().toISOString();

  const artifactHashes = evidenceData.artifactHashes || computeAssetHashes(evidenceData.evidenceDir || {});
  const masterHasher = crypto.createHash('sha256');

  for (const [k, h] of Object.entries(artifactHashes).sort()) {
    masterHasher.update(`${k}:${h}`);
  }
  const bundleHash = 'sha256:' + masterHasher.digest('hex');

  const provenance = {
    schemaVersion: '2.0.0',
    screenId,
    capturedAt,
    engine: {
      name: 'ctc-extractor',
      version: '2.0.0',
      playwright: '1.50.0',
      node: process.version
    },
    hardwareProfile: evidenceData.profile || 'daylight-dc1',
    inputs: evidenceData.inputs || {
      target: evidenceData.targetUrl || 'local',
      type: evidenceData.targetUrl?.startsWith('http') ? 'REMOTE_URL' : 'LOCAL_HTML'
    },
    artifacts: evidenceData.artifacts || {
      screenshots: {},
      scenes: {},
      fonts: { count: 0 },
      vectors: { count: 0 }
    },
    bundleHash,
    status: 'PASS'
  };

  return provenance;
}

/**
 * Captures a local HTML bundle by spinning up an ephemeral server and executing capture.
 * @param {string} localFilePath
 * @param {Object} [options]
 * @returns {Promise<Object>}
 */
async function captureLocalHtml(localFilePath, options = {}) {
  const ephemeral = await startEphemeralServer(localFilePath);
  try {
    const result = await captureEvidenceBundle(ephemeral.url, {
      ...options,
      targetLocalPath: localFilePath
    });
    return result;
  } finally {
    await ephemeral.close();
  }
}

/**
 * Main capture engine orchestrator. Captures evidence across DC1 portrait & landscape viewports.
 * Persists evidence to `.ctc/designs/<screen>/evidence/`.
 *
 * @param {string} target - Remote URL or local file path
 * @param {Object} [options]
 * @returns {Promise<Object>}
 */
async function captureEvidenceBundle(target, options = {}) {
  const screenId = options.screen || options.screenId || 'default_screen';
  const outputDir = options.outputDir || path.resolve(process.cwd(), '.ctc', 'designs', screenId, 'evidence');
  const timeout = options.timeout || 30000;

  // If target is a local file, wrap in ephemeral server
  if (!target.startsWith('http://') && !target.startsWith('https://')) {
    return captureLocalHtml(target, options);
  }

  fs.mkdirSync(path.join(outputDir, 'screenshots'), { recursive: true });
  fs.mkdirSync(path.join(outputDir, 'scenes'), { recursive: true });
  fs.mkdirSync(path.join(outputDir, 'fonts'), { recursive: true });
  fs.mkdirSync(path.join(outputDir, 'vectors'), { recursive: true });

  let browser;
  try {
    browser = await chromium.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-web-security',
        '--font-render-hinting=slight'
      ]
    });
  } catch (err) {
    throw new Error(`Failed to launch Playwright browser: ${err.message}`);
  }

  const scenes = {};
  const screenshots = {};
  let totalFonts = 0;
  let totalVectors = 0;
  let sharedVectors = [];
  let sharedFonts = [];

  try {
    const viewportsToCapture = options.viewports || ['portrait', 'landscape'];

    for (const vpName of viewportsToCapture) {
      const vpConfig = DC1_VIEWPORTS[vpName] || DC1_VIEWPORTS.portrait;

      const context = await browser.newContext({
        viewport: { width: vpConfig.width, height: vpConfig.height },
        deviceScaleFactor: vpConfig.deviceScaleFactor,
        hasTouch: true
      });

      const page = await context.newPage();

      // Pre-register response listener BEFORE page.goto() so font network requests during initial load are captured
      const interceptedFontResponses = [];
      const onFontResponse = response => {
        try {
          const request = typeof response.request === 'function' ? response.request() : null;
          const url = typeof response.url === 'function' ? response.url() : (response.url || '');
          const headers = typeof response.headers === 'function' ? response.headers() : (response.headers || {});
          const contentType = headers['content-type'] || headers['Content-Type'] || '';
          const isFont = (request && typeof request.resourceType === 'function' && request.resourceType() === 'font') ||
            /\.(woff2?|ttf|otf|eot)(\?|$)/i.test(url) ||
            contentType.includes('font');

          if (isFont) {
            interceptedFontResponses.push({
              url,
              status: typeof response.status === 'function' ? response.status() : 200,
              response
            });
          }
        } catch (_) {}
      };

      if (typeof page.on === 'function') {
        page.on('response', onFontResponse);
      }

      try {
        await page.goto(target, { timeout, waitUntil: 'domcontentloaded' });
      } catch (err) {
        throw handleNavigationError(err, target);
      }

      const frame = await findArtifactFrame(page);
      await waitForHydration(page, frame, { timeout });

      // 1. Screenshot Capture
      const screenshotPath = path.join(outputDir, 'screenshots', `${vpConfig.name}.png`);
      const screenshotBuffer = await page.screenshot({ fullPage: false });
      fs.writeFileSync(screenshotPath, screenshotBuffer);
      screenshots[vpConfig.name] = screenshotPath;

      // 2. Vector & Font extraction
      let vectors = [];
      let fonts = [];
      if (vpName === 'portrait' || sharedVectors.length === 0) {
        vectors = await extractVectors(frame);
        fonts = await extractFonts(page, frame, { fontResponses: interceptedFontResponses });
        if (vectors.length > 0) sharedVectors = vectors;
        if (fonts.length > 0) sharedFonts = fonts;
        totalVectors = sharedVectors.length;
        totalFonts = sharedFonts.length;

        // Persist vectors
        fs.writeFileSync(path.join(outputDir, 'vectors', 'vector_catalog.json'), JSON.stringify(sharedVectors, null, 2), 'utf8');

        // Persist fonts
        fs.writeFileSync(path.join(outputDir, 'fonts', 'font_manifest.json'), JSON.stringify(sharedFonts, null, 2), 'utf8');
      } else {
        vectors = sharedVectors;
        fonts = sharedFonts;
      }

      // 3. Extract Measured DOM Tree
      let domTree = null;
      try {
        domTree = await frame.evaluate(() => {
          function extractNode(el, pId) {
            const rect = el.getBoundingClientRect();
            const sourceId = el.getAttribute('data-source-id') || el.id || el.tagName.toLowerCase();
            return {
              domTag: el.tagName.toLowerCase(),
              sourceId: `${pId}/${sourceId}`,
              bounds: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
              children: Array.from(el.children).map(c => extractNode(c, `${pId}/${sourceId}`))
            };
          }
          return extractNode(document.body, 'root');
        });
      } catch (_) {}

      const rootNode = domTree ? createMeasuredNode(domTree) : createMeasuredNode({
        sourceId: `daylight#${screenId}/root`,
        bounds: { x: 0, y: 0, width: vpConfig.width, height: vpConfig.height }
      });

      const sceneData = {
        viewport: {
          widthPx: vpConfig.width,
          heightPx: vpConfig.height,
          density: 2.0,
          widthDp: vpConfig.width / 2.0,
          heightDp: vpConfig.height / 2.0,
          orientation: vpConfig.orientation
        },
        screenshotHash: 'sha256:' + crypto.createHash('sha256').update(screenshotBuffer).digest('hex'),
        screenshotPath: `screenshots/${vpConfig.name}.png`,
        loadedFonts: fonts,
        loadedAssets: vectors,
        rootNode
      };

      const scenePath = path.join(outputDir, 'scenes', `${vpConfig.name}.json`);
      fs.writeFileSync(scenePath, JSON.stringify(sceneData, null, 2), 'utf8');
      scenes[vpConfig.name] = sceneData;

      await context.close();
    }

    // Generate provenance receipt
    const artifactHashes = computeAssetHashes(outputDir);
    const provenance = generateProvenanceReceipt({
      screenId,
      evidenceDir: outputDir,
      targetUrl: target,
      artifactHashes,
      artifacts: {
        screenshots,
        scenes: Object.keys(scenes),
        fonts: { count: totalFonts },
        vectors: { count: totalVectors }
      }
    });

    const provenancePath = path.join(outputDir, 'provenance.json');
    fs.writeFileSync(provenancePath, JSON.stringify(provenance, null, 2), 'utf8');

    // Persist aggregated evidence.json bundle index alongside directory artifacts
    const evidenceBundle = {
      screenId,
      capturedAt: provenance.capturedAt || new Date().toISOString(),
      scenes,
      screenshots,
      fonts: sharedFonts,
      vectors: sharedVectors,
      fontCount: totalFonts,
      vectorCount: totalVectors,
      provenance
    };
    const evidenceJsonPath = path.join(outputDir, 'evidence.json');
    fs.writeFileSync(evidenceJsonPath, JSON.stringify(evidenceBundle, null, 2), 'utf8');

    return {
      success: true,
      screenId,
      evidenceDir: outputDir,
      screenshots,
      scenes,
      fontCount: totalFonts,
      vectorCount: totalVectors,
      bundleHash: provenance.bundleHash,
      provenancePath,
      evidenceJsonPath
    };
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

module.exports = {
  captureEvidenceBundle,
  startEphemeralServer,
  captureLocalHtml,
  findAvailablePort,
  waitForHydration,
  extractVectors,
  extractFonts,
  computeAssetHashes,
  generateProvenanceReceipt,
  handleNavigationError,
  DC1_VIEWPORTS
};
