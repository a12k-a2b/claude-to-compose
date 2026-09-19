/**
 * extractor/engine.js
 * Core Headless Extraction Engine for claude-to-compose.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { chromium } = require('playwright');
const { Screenshotter } = require('./screenshotter');
const { walkDOM } = require('./dom_walker');
const { extractSVGs } = require('./svg_parser');
const { buildAndValidateSpec } = require('./spec_builder');

// MIME taxonomy for local ephemeral server
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

class CustomEngineError extends Error {
  constructor(message, code) {
    super(message);
    this.code = code;
  }
}

/**
 * Ephemeral HTTP Server for serving local HTML/CSS bundles
 */
class EphemeralServer {
  constructor(targetFilePath, debug = false) {
    this.targetFilePath = path.resolve(targetFilePath);
    this.rootDir = path.dirname(this.targetFilePath);
    this.targetFileName = path.basename(this.targetFilePath);
    this.debug = debug;
    this.server = null;
    this.port = null;
  }

  async start() {
    return new Promise((resolve, reject) => {
      this.server = http.createServer((req, res) => {
        try {
          const parsedUrl = new URL(req.url, `http://${req.headers.host || '127.0.0.1'}`);
          let pathname = decodeURIComponent(parsedUrl.pathname);

          // Route root to target HTML file
          if (pathname === '/' || pathname === '') {
            pathname = `/${this.targetFileName}`;
          }

          const safePath = path.normalize(path.join(this.rootDir, pathname));
          if (!safePath.startsWith(this.rootDir)) {
            res.writeHead(403, { 'Content-Type': 'text/plain' });
            res.end('Forbidden');
            return;
          }

          if (!fs.existsSync(safePath) || fs.statSync(safePath).isDirectory()) {
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            res.end(`Not Found: ${pathname}`);
            return;
          }

          try {
            fs.accessSync(safePath, fs.constants.R_OK);
          } catch (e) {
            if (this.debug) console.error(`[SERVER ERROR] File not readable: ${e.message}`);
            res.writeHead(403, { 'Content-Type': 'text/plain' });
            res.end('Forbidden: File not readable');
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
        } catch (e) {
          if (this.debug) console.error(`[SERVER ERROR] ${e.message}`);
          res.writeHead(500, { 'Content-Type': 'text/plain' });
          res.end('Internal Server Error');
        }
      });

      this.server.on('error', (err) => {
        reject(new CustomEngineError(`Ephemeral server failed to start: ${err.message}`, 'NAVIGATION_FAILED'));
      });

      this.server.listen(0, '127.0.0.1', () => {
        this.port = this.server.address().port;
        if (this.debug) {
          console.log(`[INFO] Ephemeral server running at http://127.0.0.1:${this.port}/ (Root: ${this.rootDir})`);
        }
        resolve(`http://127.0.0.1:${this.port}/`);
      });
    });
  }

  async stop() {
    if (!this.server) return;
    return new Promise((resolve) => {
      this.server.close(() => {
        if (this.debug) console.log('[INFO] Ephemeral server closed');
        this.server = null;
        resolve();
      });
    });
  }
}

class ExtractionEngine {
  constructor(options = {}) {
    this.options = {
      outputDir: path.resolve(options.outputDir || './output'),
      viewport: options.viewport || 'both',
      mobileWidth: options.mobileWidth || 390,
      mobileHeight: options.mobileHeight || 844,
      mobileScale: options.mobileScale || 3.0,
      desktopWidth: options.desktopWidth || 1440,
      desktopHeight: options.desktopHeight || 900,
      desktopScale: options.desktopScale || 2.0,
      fullPage: options.fullPage !== false,
      timeout: options.timeout || 30000,
      headless: options.headless !== false,
      browserPath: options.browserPath || null,
      debug: options.debug || false
    };

    this.browser = null;
    this.ephemeralServer = null;
    this.screenshotter = new Screenshotter(this.options);
  }

  /**
   * Resolves Chromium executable binary path from overrides, environment, or Playwright cache
   */
  resolveChromiumBinary() {
    if (this.options.browserPath && fs.existsSync(this.options.browserPath)) {
      return this.options.browserPath;
    }
    if (process.env.CHROMIUM_PATH && fs.existsSync(process.env.CHROMIUM_PATH)) {
      return process.env.CHROMIUM_PATH;
    }

    const home = os.homedir();
    const cacheDirs = [
      path.join(home, 'Library/Caches/ms-playwright'), // macOS
      path.join(home, '.cache/ms-playwright')          // Linux
    ];

    for (const cacheDir of cacheDirs) {
      if (!fs.existsSync(cacheDir)) continue;
      const entries = fs.readdirSync(cacheDir);
      for (const entry of entries) {
        if (entry.startsWith('chromium-')) {
          const macApp = path.join(cacheDir, entry, 'chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing');
          if (fs.existsSync(macApp)) return macApp;
          const macX64 = path.join(cacheDir, entry, 'chrome-mac-x64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing');
          if (fs.existsSync(macX64)) return macX64;
          const macGen = path.join(cacheDir, entry, 'chrome-mac/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing');
          if (fs.existsSync(macGen)) return macGen;
          const linuxBin = path.join(cacheDir, entry, 'chrome-linux/chrome');
          if (fs.existsSync(linuxBin)) return linuxBin;
        }
      }
    }
    return undefined; // Let Playwright default mechanism attempt discovery
  }

  /**
   * Spawns headless Chromium instance
   */
  async launchBrowser() {
    const execPath = this.resolveChromiumBinary();
    if (this.options.debug) {
      console.log(`[INFO] Resolved Chromium executable: ${execPath || 'Playwright Default'}`);
    }

    const launchArgs = [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-web-security',
      '--allow-file-access-from-files',
      '--disable-features=IsolateOrigins,site-per-process'
    ];

    try {
      this.browser = await chromium.launch({
        executablePath: execPath,
        headless: this.options.headless,
        args: launchArgs
      });
      return this.browser;
    } catch (err) {
      throw new CustomEngineError(`Failed to launch Chromium browser: ${err.message}`, 'BROWSER_LAUNCH_FAILED');
    }
  }

  /**
   * Pierces sandboxed iframes (e.g. claudeusercontent.com) to locate true artifact document
   */
  async findArtifactFrame(page) {
    const initialChildren = page.frames().filter(f => f !== page.mainFrame());
    if (initialChildren.length === 0) {
      if (this.options.debug) console.log('[INFO] Operating on main frame.');
      return page.mainFrame();
    }

    const startTime = Date.now();
    const timeout = Math.min(this.options.timeout, 5000);

    while (Date.now() - startTime < timeout) {
      const frames = page.frames();
      const target = frames.find(f => {
        if (f === page.mainFrame()) return false;
        const url = f.url();
        const name = f.name();
        return (
          url.includes('claudeusercontent.com') ||
          url.includes('blob:') ||
          name.includes('artifact') ||
          name.includes('preview')
        );
      });

      if (target) {
        try {
          const hasContent = await target.evaluate(() => {
            const root = document.getElementById('root') || document.getElementById('app') || document.body;
            return root && (root.children.length > 0 || root.innerText.trim().length > 0);
          });
          if (hasContent) {
            if (this.options.debug) console.log(`[INFO] Pierced into artifact frame: ${target.url()}`);
            return target;
          }
        } catch (_) {}
      }
      await page.waitForTimeout(100);
    }

    const childFrames = page.frames().filter(f => f !== page.mainFrame());
    if (childFrames.length === 1) {
      if (this.options.debug) console.log(`[INFO] Defaulted to single child frame: ${childFrames[0].url()}`);
      return childFrames[0];
    }

    if (this.options.debug) console.log('[INFO] Operating on main frame.');
    return page.mainFrame();
  }

  /**
   * Enforces 5-Phase Hydration Barrier
   */
  async waitForHydrationBarrier(page, targetFrame) {
    const frame = targetFrame || page.mainFrame();

    // Phase 1: Network Idle
    if (this.options.debug) console.log('[WAIT] Phase 1: Awaiting networkidle...');
    await page.waitForLoadState('networkidle', { timeout: 15000 }).catch((e) => {
      if (this.options.debug) console.log(`[WARN] Networkidle timeout (${e.message}), continuing.`);
    });

    // Phase 2: Root DOM Hydration
    if (this.options.debug) console.log('[WAIT] Phase 2: Awaiting DOM/Root Hydration...');
    try {
      await frame.waitForFunction(() => {
        const root = document.getElementById('root') || document.getElementById('app') || document.querySelector('[data-reactroot]') || document.querySelector('main') || document.body;
        return root && (root.children.length > 0 || root.innerText.trim().length > 0);
      }, { timeout: 15000 });
    } catch (e) {
      throw new CustomEngineError(`Hydration barrier failed in Phase 2 (Root DOM): ${e.message}`, 'HYDRATION_TIMEOUT');
    }

    // Phase 3: Tailwind CDN / Style Injection
    if (this.options.debug) console.log('[WAIT] Phase 3: Awaiting Tailwind CDN / Style Injection...');
    try {
      await frame.waitForFunction(() => {
        const hasTailwind = !!document.querySelector('script[src*="tailwindcss"]');
        if (!hasTailwind) return true;
        return window.tailwind !== undefined && (document.querySelectorAll('style').length > 0 || !!document.querySelector('style[id*="tailwind"]'));
      }, { timeout: 10000 });
    } catch (e) {
      if (this.options.debug) console.log(`[WARN] Tailwind readiness wait exceeded: ${e.message}`);
    }

    // Phase 4: Web Font readiness
    if (this.options.debug) console.log('[WAIT] Phase 4: Awaiting Web Font readiness...');
    try {
      await frame.evaluate(async () => {
        if (document.fonts && document.fonts.ready) {
          await document.fonts.ready;
        }
      });
    } catch (e) {
      if (this.options.debug) console.log(`[WARN] Font readiness check failed: ${e.message}`);
    }

    // Phase 5: Transition & animation settling buffer (350ms)
    if (this.options.debug) console.log('[WAIT] Phase 5: Transition & animation settling buffer (350ms)...');
    await page.waitForTimeout(350);
  }

  /**
   * Alias for test suite compatibility
   */
  async waitForArtifactReadiness(page, targetFrame) {
    return await this.waitForHydrationBarrier(page, targetFrame);
  }

  /**
   * Screenshot capture method contract
   */
  async captureScreenshots(page, targetFrame, config = {}) {
    return await this.screenshotter.captureViewport(page, targetFrame, {
      name: config.name || 'mobile',
      width: config.width || this.options.mobileWidth,
      height: config.height || this.options.mobileHeight,
      scale: config.scale || this.options.mobileScale,
      outputDir: config.outputDir || path.join(this.options.outputDir, 'screenshots')
    });
  }

  /**
   * Executes complete extraction workflow
   */
  async run({ target, isFile }) {
    let navigationUrl = target;

    // 1. Start ephemeral HTTP server if input is a local file
    if (isFile) {
      try {
        fs.accessSync(target, fs.constants.R_OK);
      } catch (err) {
        throw new CustomEngineError(`Cannot read target file "${target}": ${err.message}`, 'NAVIGATION_FAILED');
      }
      this.ephemeralServer = new EphemeralServer(target, this.options.debug);
      navigationUrl = await this.ephemeralServer.start();
    }

    // 2. Launch browser
    await this.launchBrowser();

    const outputAssetsDir = path.join(this.options.outputDir, 'assets', 'vectors');
    const outputScreenshotsDir = path.join(this.options.outputDir, 'screenshots');
    fs.mkdirSync(outputAssetsDir, { recursive: true });
    fs.mkdirSync(outputScreenshotsDir, { recursive: true });

    const capturedScreenshots = [];

    // Helper to extract for a specific viewport context
    const processViewport = async ({ name, width, height, scale, isMobile }) => {
      if (this.options.debug) console.log(`\n[INFO] Starting extraction for viewport: ${name} (${width}x${height}@${scale}x)`);
      const context = await this.browser.newContext({
        viewport: { width, height },
        deviceScaleFactor: scale,
        isMobile,
        hasTouch: isMobile,
        userAgent: isMobile
          ? 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Mobile Safari/537.36'
          : 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36'
      });

      const page = await context.newPage();
      page.setDefaultTimeout(this.options.timeout);

      let response;
      try {
        response = await page.goto(navigationUrl, { waitUntil: 'load', timeout: this.options.timeout });
      } catch (err) {
        throw new CustomEngineError(`Failed to navigate to ${navigationUrl}: ${err.message}`, 'NAVIGATION_FAILED');
      }

      if (response && response.status() >= 400) {
        throw new CustomEngineError(
          `Navigation failed: server responded with HTTP status ${response.status()} (${response.statusText() || 'Error'}) for ${navigationUrl}`,
          'NAVIGATION_FAILED'
        );
      }

      const targetFrame = await this.findArtifactFrame(page);
      await this.waitForHydrationBarrier(page, targetFrame);

      // Capture screenshots for this viewport
      const screenshots = await this.screenshotter.captureViewport(page, targetFrame, {
        name,
        width,
        height,
        scale,
        outputDir: outputScreenshotsDir
      });
      capturedScreenshots.push(...screenshots);

      return { context, page, targetFrame };
    };

    let primaryContext = null;
    let primaryPage = null;
    let primaryFrame = null;

    // Execute viewport captures according to configuration
    if (this.options.viewport === 'mobile' || this.options.viewport === 'both') {
      const res = await processViewport({
        name: 'mobile',
        width: this.options.mobileWidth,
        height: this.options.mobileHeight,
        scale: this.options.mobileScale,
        isMobile: true
      });
      primaryContext = res.context;
      primaryPage = res.page;
      primaryFrame = res.targetFrame;
    }

    if (this.options.viewport === 'desktop' || this.options.viewport === 'both') {
      const res = await processViewport({
        name: 'desktop',
        width: this.options.desktopWidth,
        height: this.options.desktopHeight,
        scale: this.options.desktopScale,
        isMobile: false
      });
      if (!primaryFrame) {
        primaryContext = res.context;
        primaryPage = res.page;
        primaryFrame = res.targetFrame;
      }
    }

    // 3. Coordinate DOM Walker & SVG Parser in primaryFrame
    if (this.options.debug) console.log('[EXTRACT] Executing DOM Walker and SVG Parser...');
    const domHierarchy = await walkDOM(primaryFrame, { debug: this.options.debug });
    const vectorAssets = await extractSVGs(primaryFrame, {
      outputDir: this.options.outputDir,
      debug: this.options.debug
    });

    // 4. Assemble and validate design_spec.json
    if (this.options.debug) console.log('[BUILD] Assembling and validating design_spec.json...');
    const pageTitle = await primaryFrame.evaluate(() => document.title || 'Claude Design Artifact').catch(() => 'Claude Design Artifact');

    const specResult = buildAndValidateSpec({
      metadata: {
        source: target,
        timestamp: new Date().toISOString(),
        generator: 'claude-to-compose-extractor/1.0.0',
        title: pageTitle
      },
      viewports: {
        mobile: {
          width: this.options.mobileWidth,
          height: this.options.mobileHeight,
          deviceScaleFactor: this.options.mobileScale,
          screenshotPath: 'screenshots/mobile_reference.png'
        },
        desktop: {
          width: this.options.desktopWidth,
          height: this.options.desktopHeight,
          deviceScaleFactor: this.options.desktopScale,
          screenshotPath: 'screenshots/desktop_reference.png'
        }
      },
      domHierarchy,
      vectorAssets,
      outputDir: this.options.outputDir
    });

    if (!specResult.valid) {
      throw new CustomEngineError(`design_spec.json failed schema validation: ${specResult.errors.join(', ')}`, 'SCHEMA_VALIDATION_FAILED');
    }

    // 5. Teardown
    await this.cleanup();

    function countNodes(node) {
      if (!node) return 0;
      let count = 1;
      if (node.children && Array.isArray(node.children)) {
        for (const child of node.children) count += countNodes(child);
      }
      return count;
    }

    return {
      success: true,
      specPath: specResult.specPath,
      screenshots: capturedScreenshots,
      vectorCount: vectorAssets.length,
      nodeCount: countNodes(domHierarchy)
    };
  }

  async cleanup() {
    if (this.browser) {
      try {
        await this.browser.close();
      } catch (_) {}
      this.browser = null;
    }
    if (this.ephemeralServer) {
      try {
        await this.ephemeralServer.stop();
      } catch (_) {}
      this.ephemeralServer = null;
    }
  }
}

module.exports = {
  ExtractionEngine,
  EphemeralServer,
  CustomEngineError,
  captureScreenshots: (page, targetFrame, config) => new ExtractionEngine().captureScreenshots(page, targetFrame, config),
  waitForArtifactReadiness: (page, targetFrame) => new ExtractionEngine().waitForArtifactReadiness(page, targetFrame)
};
