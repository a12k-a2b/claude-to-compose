/**
 * tests/unit/extractor_capture.test.js
 * Comprehensive unit test suite for Web Evidence Capture Engine (src/extractor/capture.js).
 */

'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const http = require('node:http');

const {
  findAvailablePort,
  startEphemeralServer,
  handleNavigationError,
  waitForHydration,
  extractVectors,
  extractFonts,
  computeAssetHashes,
  generateProvenanceReceipt,
  DC1_VIEWPORTS
} = require('../../src/extractor/capture');

const svgParser = require('../../extractor/svg_parser');

describe('Port Discovery & Collision Recovery', () => {
  it('finds a free port dynamically when port 0 is passed', async () => {
    const port = await findAvailablePort(0);
    assert.ok(typeof port === 'number');
    assert.ok(port > 1024);
  });

  it('detects an occupied port and selects an alternate available port', async () => {
    const blocker = http.createServer();
    const blockerPort = await new Promise(resolve => {
      blocker.listen(0, '127.0.0.1', () => {
        resolve(blocker.address().port);
      });
    });

    try {
      const nextPort = await findAvailablePort(blockerPort);
      assert.notStrictEqual(nextPort, blockerPort);
      assert.ok(nextPort > blockerPort);
    } finally {
      await new Promise(r => blocker.close(r));
    }
  });
});

describe('Ephemeral Server & Ingestion Security', () => {
  it('serves local static files with CORS headers', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ctc_ephemeral_'));
    const testHtml = path.join(tmpDir, 'test.html');
    fs.writeFileSync(testHtml, '<!DOCTYPE html><html><body><h1>Test Page</h1></body></html>', 'utf8');

    const server = await startEphemeralServer(testHtml);
    assert.ok(server.port > 0);
    assert.ok(server.url.includes(String(server.port)));

    try {
      const res = await new Promise((resolve, reject) => {
        http.get(server.url, res => {
          let data = '';
          res.on('data', chunk => { data += chunk; });
          res.on('end', () => resolve({ statusCode: res.statusCode, headers: res.headers, data }));
        }).on('error', reject);
      });

      assert.strictEqual(res.statusCode, 200);
      assert.ok(res.data.includes('<h1>Test Page</h1>'));
      assert.strictEqual(res.headers['access-control-allow-origin'], '*');
    } finally {
      await server.close();
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('rejects directory traversal attempts with HTTP 403', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ctc_traversal_'));
    const indexHtml = path.join(tmpDir, 'index.html');
    fs.writeFileSync(indexHtml, '<html><body>OK</body></html>', 'utf8');

    const server = await startEphemeralServer(indexHtml);

    try {
      const res = await new Promise((resolve, reject) => {
        http.get({ host: '127.0.0.1', port: server.port, path: '/../../etc/passwd' }, res => {
          resolve({ statusCode: res.statusCode });
        }).on('error', reject);
      });

      assert.strictEqual(res.statusCode, 403);
    } finally {
      await server.close();
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('returns HTTP 404 for non-existent files', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ctc_notfound_'));
    const indexHtml = path.join(tmpDir, 'index.html');
    fs.writeFileSync(indexHtml, '<html><body>OK</body></html>', 'utf8');

    const server = await startEphemeralServer(indexHtml);

    try {
      const res = await new Promise((resolve, reject) => {
        http.get(`http://127.0.0.1:${server.port}/missing_file.html`, res => {
          resolve({ statusCode: res.statusCode });
        }).on('error', reject);
      });

      assert.strictEqual(res.statusCode, 404);
    } finally {
      await server.close();
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});

describe('Navigation Error Handling', () => {
  it('formats connection refused error with exit code 4', () => {
    const err = new Error('connect ECONNREFUSED 127.0.0.1:9999');
    const navErr = handleNavigationError(err, 'http://127.0.0.1:9999');

    assert.strictEqual(navErr.code, 4);
    assert.strictEqual(navErr.statusCode, 'ECONNREFUSED');
    assert.strictEqual(navErr.targetUrl, 'http://127.0.0.1:9999');
    assert.strictEqual(navErr.isRecoverable, false);
  });

  it('formats navigation timeout error with exit code 4', () => {
    const err = new Error('Navigation timed out after 30000ms');
    const navErr = handleNavigationError(err, 'https://example.com/timeout');

    assert.strictEqual(navErr.code, 4);
    assert.strictEqual(navErr.statusCode, 'ETIMEDOUT');
  });
});

describe('Hydration Barrier Settling', () => {
  it('times out cleanly throwing error with code 5 when root element is not populated', async () => {
    const mockPage = {
      waitForLoadState: async () => {},
      mainFrame: () => mockFrame
    };

    const mockFrame = {
      waitForFunction: async () => {
        throw new Error('Waiting for function failed: timeout 500ms exceeded');
      }
    };

    await assert.rejects(
      async () => {
        await waitForHydration(mockPage, mockFrame, { timeout: 500 });
      },
      err => {
        assert.strictEqual(err.code, 5);
        assert.ok(err.message.includes('Hydration timeout'));
        return true;
      }
    );
  });

  it('completes 5-phase hydration when DOM and fonts resolve', async () => {
    const mockPage = {
      waitForLoadState: async () => {},
      mainFrame: () => mockFrame
    };

    const mockFrame = {
      waitForFunction: async () => true,
      evaluate: async () => true
    };

    const result = await waitForHydration(mockPage, mockFrame, { timeout: 5000 });
    assert.strictEqual(result.settled, true);
    assert.strictEqual(result.settleMs, 150);
    assert.strictEqual(result.phasesCompleted, 5);
  });
});

describe('Vector Extraction & Transform Baking', () => {
  it('parses well-formed SVG string and normalizes path data', async () => {
    const svgStr = '<svg viewBox="0 0 24 24"><rect x="2" y="2" width="20" height="20" rx="4"/></svg>';
    const parsed = await extractVectors(svgStr);
    assert.ok(parsed);
  });

  it('throws on corrupted SVG markup with unclosed tags', () => {
    const corrupted = '<svg><path d="M0 0 L10 10"';
    assert.throws(() => {
      svgParser.parseSvg(corrupted);
    }, /Unexpected|unclosed|error/i);
  });
});

describe('Font Extraction & 404 Resilience', () => {
  it('handles missing font 404 response without throwing', async () => {
    let responseHandler;
    const mockPage = {
      on: (event, handler) => {
        if (event === 'response') responseHandler = handler;
      },
      evaluate: async () => []
    };

    const mockFrame = {
      evaluate: async () => []
    };

    const fontPromise = extractFonts(mockPage, mockFrame);

    // Simulate 404 response from missing font URL
    if (responseHandler) {
      responseHandler({
        url: () => 'https://example.com/fonts/missing.woff2',
        status: () => 404,
        headers: () => ({ 'content-type': 'font/woff2' }),
        request: () => ({ resourceType: () => 'font' })
      });
    }

    const fonts = await fontPromise;
    assert.ok(Array.isArray(fonts));
    // Extraction proceeds without throwing
  });
});

describe('Provenance Hashing & Receipt Generation', () => {
  it('computes SHA-256 asset hashes for object mapping', () => {
    const hashes = computeAssetHashes({
      'test.txt': 'Hello World'
    });
    assert.ok(hashes['test.txt'].startsWith('sha256:'));
    assert.strictEqual(hashes['test.txt'].length, 71); // 'sha256:' + 64 hex chars
  });

  it('generates provenance receipt conforming to schema', () => {
    const receipt = generateProvenanceReceipt({
      screenId: 'receipt_test',
      profile: 'daylight-dc1',
      artifactHashes: {
        'screenshots/portrait.png': 'sha256:7f83b1657ff1fc53b92dc18148a1d65dfc2d4b1fa3d677284addd200126d9069'
      }
    });

    assert.strictEqual(receipt.schemaVersion, '2.0.0');
    assert.strictEqual(receipt.screenId, 'receipt_test');
    assert.strictEqual(receipt.hardwareProfile, 'daylight-dc1');
    assert.ok(receipt.bundleHash.startsWith('sha256:'));
    assert.strictEqual(receipt.status, 'PASS');
  });

  it('DC1 viewports match 1184x1584 portrait and 1584x1184 landscape specification', () => {
    assert.strictEqual(DC1_VIEWPORTS.portrait.width, 1184);
    assert.strictEqual(DC1_VIEWPORTS.portrait.height, 1584);
    assert.strictEqual(DC1_VIEWPORTS.landscape.width, 1584);
    assert.strictEqual(DC1_VIEWPORTS.landscape.height, 1184);
  });
});
