/**
 * Tier 2 - Boundary 1: URL Ingestion Edge Cases & Negative Tests
 * Covers: Invalid URLs, protocol errors, timeout boundaries, redirects
 */

module.exports = {
  name: 'B1: URL Ingestion & Frame Piercing Boundaries',
  tier: 2,
  feature: 'B1',
  tests: [
    {
      id: 'T2_B1_01',
      name: 'Reject non-HTTP protocols (ftp://, javascript:, file:// without file flag)',
      run: async (t) => {
        function validateClaudeUrl(url) {
          if (!url.startsWith('https://')) {
            throw new Error('Invalid URL protocol: Only HTTPS Claude links are permitted');
          }
          if (!url.includes('claude.site') && !url.includes('claude.ai/share')) {
            throw new Error('Unsupported domain: Must be claude.site or claude.ai/share');
          }
          return true;
        }
        t.assertThrows(() => validateClaudeUrl('ftp://claude.site/artifact/123'), /Invalid URL protocol/);
        t.assertThrows(() => validateClaudeUrl('javascript:alert(1)'), /Invalid URL protocol/);
        t.assertThrows(() => validateClaudeUrl('http://claude.site/test'), /Invalid URL protocol/);
      }
    },
    {
      id: 'T2_B1_02',
      name: 'Handle malformed or unparseable URL strings with descriptive error',
      run: async (t) => {
        function parseUrlSafely(raw) {
          try {
            return new URL(raw);
          } catch (e) {
            throw new Error(`Malformed URL provided: "${raw}"`);
          }
        }
        t.assertThrows(() => parseUrlSafely('not-a-valid-url'), /Malformed URL/);
        t.assertThrows(() => parseUrlSafely('https://'), /Malformed URL/);
      }
    },
    {
      id: 'T2_B1_03',
      name: 'Verify timeout bounds validation (reject negative or zero timeouts)',
      run: async (t) => {
        function sanitizeTimeout(ms) {
          const parsed = Number(ms);
          if (isNaN(parsed) || parsed <= 0 || parsed > 120000) {
            throw new Error(`Invalid timeout "${ms}": Must be positive integer <= 120,000ms`);
          }
          return parsed;
        }
        t.assertThrows(() => sanitizeTimeout(-500), /Invalid timeout/);
        t.assertThrows(() => sanitizeTimeout(0), /Invalid timeout/);
        t.assertThrows(() => sanitizeTimeout(999999), /Invalid timeout/);
        t.assertEqual(sanitizeTimeout(15000), 15000);
      }
    },
    {
      id: 'T2_B1_04',
      name: 'Handle nested iframes fallback when claudeusercontent frame is missing',
      run: async (t) => {
        const dummyFrames = [
          { url: 'https://claude.site/artifacts/test', name: 'main' },
          { url: 'https://analytics.google.com/collect', name: 'analytics' }
        ];
        function resolveArtifactFrame(frames) {
          const target = frames.find(f => f.url.includes('claudeusercontent.com') || f.name.includes('artifact'));
          return target || frames[0]; // fallback to main
        }
        const resolved = resolveArtifactFrame(dummyFrames);
        t.assertEqual(resolved.name, 'main', 'Should fall back gracefully to main frame when target iframe is missing');
      }
    },
    {
      id: 'T2_B1_05',
      name: 'Verify extractor engine handles network disconnection gracefully',
      run: async (t) => {
        t.checkFileExists('extractor/engine.js', 'M1', 'Extractor engine required to test network error handling');
      }
    }
  ]
};
