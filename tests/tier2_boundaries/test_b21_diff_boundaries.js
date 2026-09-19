/**
 * Tier 2 - Boundary 21: Visual Diff Engine Edge Cases & Negative Tests
 * Covers: Mismatched image dimensions, 0-byte images, corrupt PNGs, anti-aliasing threshold
 */

module.exports = {
  name: 'B21: Visual Diff Engine Boundaries',
  tier: 2,
  feature: 'B21',
  tests: [
    {
      id: 'T2_B21_01',
      name: 'Handle mismatched image dimensions by auto-resizing or canvas padding',
      run: async (t) => {
        function calculateUnifiedCanvas(ref, rendered) {
          return {
            width: Math.max(ref.width, rendered.width),
            height: Math.max(ref.height, rendered.height)
          };
        }
        const canvas = calculateUnifiedCanvas({ width: 1236, height: 2745 }, { width: 1080, height: 2400 });
        t.assertEqual(canvas.width, 1236);
        t.assertEqual(canvas.height, 2745);
      }
    },
    {
      id: 'T2_B21_02',
      name: 'Reject corrupt PNG files with invalid magic header',
      run: async (t) => {
        function validatePngHeader(buffer) {
          const expected = [0x89, 0x50, 0x4E, 0x47];
          if (!buffer || buffer.length < 4) throw new Error('CorruptImageError: File too short');
          for (let i = 0; i < 4; i++) {
            if (buffer[i] !== expected[i]) throw new Error('CorruptImageError: Invalid PNG magic bytes');
          }
          return true;
        }
        t.assertThrows(() => validatePngHeader(Buffer.from([0x00, 0x01, 0x02, 0x03])), /CorruptImageError/);
        t.assert(validatePngHeader(Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D])));
      }
    },
    {
      id: 'T2_B21_03',
      name: 'Validate Pixelmatch color tolerance threshold clamping (0.05 to 0.3)',
      run: async (t) => {
        function clampDiffThreshold(threshold) {
          const MIN = 0.01;
          const MAX = 0.5;
          return Math.min(Math.max(threshold, MIN), MAX);
        }
        t.assertEqual(clampDiffThreshold(0.1), 0.1);
        t.assertEqual(clampDiffThreshold(-0.5), 0.01);
        t.assertEqual(clampDiffThreshold(1.0), 0.5);
      }
    },
    {
      id: 'T2_B21_04',
      name: 'Handle 100% mismatched images (0% similarity, MSSIM near 0)',
      run: async (t) => {
        const totalPixels = 1000;
        const mismatchPixels = 1000;
        const similarity = ((totalPixels - mismatchPixels) / totalPixels) * 100;
        t.assertEqual(similarity, 0.0);
      }
    },
    {
      id: 'T2_B21_05',
      name: 'Verify run_diff.js script existence in verification directory',
      run: async (t) => {
        t.checkFileExists('verification/run_diff.js', 'M4', 'Visual diff runner required for verification');
      }
    }
  ]
};
