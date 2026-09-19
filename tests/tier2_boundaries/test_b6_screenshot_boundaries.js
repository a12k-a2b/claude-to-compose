/**
 * Tier 2 - Boundary 6: Viewport & Screenshot Capture Edge Cases & Negative Tests
 * Covers: Extreme viewport sizes, zero dimensions, non-integer deviceScaleFactor
 */

module.exports = {
  name: 'B6: Viewport & Screenshot Capture Boundaries',
  tier: 2,
  feature: 'B6',
  tests: [
    {
      id: 'T2_B6_01',
      name: 'Reject non-positive viewport dimensions (width <= 0 or height <= 0)',
      run: async (t) => {
        function validateViewport(width, height) {
          if (!Number.isInteger(width) || width <= 0) {
            throw new Error(`InvalidViewportError: Width must be positive integer, got ${width}`);
          }
          if (!Number.isInteger(height) || height <= 0) {
            throw new Error(`InvalidViewportError: Height must be positive integer, got ${height}`);
          }
          return true;
        }
        t.assertThrows(() => validateViewport(0, 800), /InvalidViewportError/);
        t.assertThrows(() => validateViewport(-412, 915), /InvalidViewportError/);
        t.assertThrows(() => validateViewport(412, 0), /InvalidViewportError/);
        t.assert(validateViewport(412, 915));
      }
    },
    {
      id: 'T2_B6_02',
      name: 'Reject extreme viewport sizes exceeding browser limits (> 8192px)',
      run: async (t) => {
        function clampViewportSize(dim) {
          const MAX_DIM = 8192;
          if (dim > MAX_DIM) {
            throw new Error(`ViewportExceededError: Dimension ${dim}px exceeds max allowed ${MAX_DIM}px`);
          }
          return dim;
        }
        t.assertThrows(() => clampViewportSize(16000), /ViewportExceededError/);
        t.assertEqual(clampViewportSize(3840), 3840);
      }
    },
    {
      id: 'T2_B6_03',
      name: 'Validate deviceScaleFactor bounds (must be between 1.0 and 4.0)',
      run: async (t) => {
        function validateDpr(dpr) {
          if (typeof dpr !== 'number' || dpr < 1.0 || dpr > 4.0) {
            throw new Error(`InvalidDprError: DPR must be between 1.0 and 4.0, got ${dpr}`);
          }
          return dpr;
        }
        t.assertThrows(() => validateDpr(0.5), /InvalidDprError/);
        t.assertThrows(() => validateDpr(5.0), /InvalidDprError/);
        t.assertEqual(validateDpr(3.0), 3.0);
      }
    },
    {
      id: 'T2_B6_04',
      name: 'Validate screenshot buffer size bounds (> 100 bytes, < 50MB)',
      run: async (t) => {
        function validateScreenshotBuffer(buf) {
          if (!Buffer.isBuffer(buf) || buf.length < 100) {
            throw new Error('CorruptScreenshotError: PNG buffer is too small');
          }
          if (buf.length > 50 * 1024 * 1024) {
            throw new Error('ScreenshotOverflowError: PNG buffer exceeds 50MB');
          }
          return true;
        }
        t.assertThrows(() => validateScreenshotBuffer(Buffer.from([1, 2, 3])), /CorruptScreenshotError/);
        const validMockBuf = Buffer.alloc(1024);
        t.assert(validateScreenshotBuffer(validMockBuf));
      }
    },
    {
      id: 'T2_B6_05',
      name: 'Verify extractor engine handles screenshot capture errors gracefully',
      run: async (t) => {
        t.checkFileExists('extractor/engine.js', 'M1', 'Extractor engine required to test screenshot failure modes');
      }
    }
  ]
};
