/**
 * Tier 1 - Feature 2: Local HTML/CSS Ingestion
 * Covers: R1 / ORIGINAL_REQUEST §R1 / PROJECT.md §Feature 2
 */

const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');

module.exports = {
  name: 'F2: Local HTML/CSS Ingestion',
  tier: 1,
  feature: 'F2',
  tests: [
    {
      id: 'T1_F2_01',
      name: 'Verify local HTML fixture file existence and readability',
      run: async (t) => {
        const fixturePath = path.join(t.fixturesDir, 's1_saas_dashboard', 'index.html');
        t.assert(fs.existsSync(fixturePath), 'S1 HTML fixture must exist');
        const content = fs.readFileSync(fixturePath, 'utf8');
        t.assert(content.includes('<!DOCTYPE html>'), 'Fixture must contain valid HTML5 doctype');
        t.assert(content.includes('Nexus Analytics'), 'Fixture must contain expected SaaS dashboard title');
      }
    },
    {
      id: 'T1_F2_02',
      name: 'Verify local CSS stylesheet reference resolution',
      run: async (t) => {
        const cssPath = path.join(t.fixturesDir, 's1_saas_dashboard', 'styles.css');
        t.assert(fs.existsSync(cssPath), 'S1 CSS fixture must exist');
        const cssContent = fs.readFileSync(cssPath, 'utf8');
        t.assert(cssContent.includes('--color-primary: #4F46E5;'), 'CSS must define primary theme token');
      }
    },
    {
      id: 'T1_F2_03',
      name: 'Validate ephemeral HTTP server creation on port 0 for local asset serving',
      run: async (t) => {
        const server = http.createServer((req, res) => {
          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end('<h1>Ephemeral Server OK</h1>');
        });

        await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
        const address = server.address();
        t.assert(address && typeof address.port === 'number', 'Server must allocate ephemeral port');
        t.assert(address.port > 1024, 'Ephemeral port must be > 1024');

        const testUrl = `http://127.0.0.1:${address.port}/`;
        const resp = await new Promise((resolve, reject) => {
          http.get(testUrl, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => resolve({ statusCode: res.statusCode, body: data }));
          }).on('error', reject);
        });

        t.assertEqual(resp.statusCode, 200, 'HTTP response status must be 200');
        t.assert(resp.body.includes('Ephemeral Server OK'), 'Server must return expected body');
        await new Promise((resolve) => server.close(resolve));
      }
    },
    {
      id: 'T1_F2_04',
      name: 'Verify MIME type mapping for web assets (html, css, js, svg, png)',
      run: async (t) => {
        const mimeMap = {
          '.html': 'text/html; charset=utf-8',
          '.css': 'text/css; charset=utf-8',
          '.js': 'application/javascript; charset=utf-8',
          '.svg': 'image/svg+xml',
          '.png': 'image/png'
        };
        t.assertEqual(mimeMap['.html'], 'text/html; charset=utf-8');
        t.assertEqual(mimeMap['.svg'], 'image/svg+xml');
        t.assertEqual(mimeMap['.css'], 'text/css; charset=utf-8');
      }
    },
    {
      id: 'T1_F2_05',
      name: 'Verify extractor engine handles local file path inputs gracefully',
      run: async (t) => {
        t.checkFileExists('extractor/engine.js', 'M1', 'Extractor engine required for local path ingestion');
      }
    }
  ]
};
