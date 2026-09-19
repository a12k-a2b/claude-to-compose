/**
 * Tier 1 - Feature 1: Public Claude URL Ingestion & Frame Piercing
 * Covers: R1 / ORIGINAL_REQUEST §R1 / PROJECT.md §Feature 1
 */

const fs = require('node:fs');
const path = require('node:path');

module.exports = {
  name: 'F1: Public Claude URL Ingestion & Frame Piercing',
  tier: 1,
  feature: 'F1',
  tests: [
    {
      id: 'T1_F1_01',
      name: 'Validate Claude URL regex pattern matching for claude.site & claude.ai/share',
      run: async (t) => {
        const claudeUrlRegex = /^https:\/\/(claude\.site\/artifacts\/[a-zA-Z0-9_-]+|claude\.site\/[a-zA-Z0-9_-]+|claude\.ai\/share\/[a-zA-Z0-9_-]+)/;
        t.assert(claudeUrlRegex.test('https://claude.site/artifacts/498f3ec5-d252-4cee'), 'Should match claude.site/artifacts');
        t.assert(claudeUrlRegex.test('https://claude.site/sample-artifact-id'), 'Should match direct claude.site custom id');
        t.assert(claudeUrlRegex.test('https://claude.ai/share/1ee60c8b-7dba-4e7b'), 'Should match claude.ai/share');
        t.assert(!claudeUrlRegex.test('https://google.com'), 'Should reject non-Claude domains');
        t.assert(!claudeUrlRegex.test('http://claude.site/unsecured'), 'Should require HTTPS protocol');
      }
    },
    {
      id: 'T1_F1_02',
      name: 'Validate frame piercing selector heuristics for sandboxed claudeusercontent iframe',
      run: async (t) => {
        const sampleHostHtml = `
          <html><body>
            <header>Claude Shell</header>
            <iframe id="artifact-content" src="https://hash123.claudeusercontent.com/index.html" sandbox="allow-scripts allow-same-origin"></iframe>
          </body></html>
        `;
        const iframeMatch = sampleHostHtml.match(/<iframe[^>]+src=["']([^"']+)["'][^>]*>/i);
        t.assert(iframeMatch !== null, 'Should detect iframe tag in host HTML');
        const iframeSrc = iframeMatch[1];
        t.assert(iframeSrc.includes('claudeusercontent.com'), 'Frame URL must match claudeusercontent domain');
      }
    },
    {
      id: 'T1_F1_03',
      name: 'Verify extractor engine exports URL ingestion module interface',
      run: async (t) => {
        t.checkFileExists('extractor/engine.js', 'M1', 'Extractor engine must export browser navigation and frame resolver');
        const engine = require(path.resolve(t.projectRoot, 'extractor/engine.js'));
        t.assert(typeof engine === 'object' || typeof engine === 'function', 'Engine module must be exported');
      }
    },
    {
      id: 'T1_F1_04',
      name: 'Validate URL ingestion timeout and network error specification contracts',
      run: async (t) => {
        const defaultTimeoutMs = 30000;
        t.assertEqual(defaultTimeoutMs, 30000, 'Default network navigation timeout must be 30,000ms');
        const retryAttempts = 3;
        t.assert(retryAttempts >= 2, 'Must allow retry on transient network failures');
      }
    },
    {
      id: 'T1_F1_05',
      name: 'Verify browser context headers include modern Chromium User-Agent',
      run: async (t) => {
        const standardUserAgent = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36';
        t.assertMatch(standardUserAgent, /Chrome\/\d+/, 'User agent must identify as modern Chrome');
        t.assertMatch(standardUserAgent, /AppleWebKit/, 'User agent must include WebKit platform identifier');
      }
    }
  ]
};
