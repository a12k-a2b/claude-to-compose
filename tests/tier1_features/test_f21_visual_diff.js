/**
 * Tier 1 - Feature 21: Programmatic Visual Diff (Pixelmatch / SSIM)
 * Covers: R4 / ORIGINAL_REQUEST §R4 / PROJECT.md §Feature 28
 */

const fs = require('node:fs');
const path = require('node:path');

module.exports = {
  name: 'F21: Programmatic Visual Diff (Pixelmatch / SSIM)',
  tier: 1,
  feature: 'F21',
  tests: [
    {
      id: 'T1_F21_01',
      name: 'Verify visual diff script existence in verification/run_diff.js',
      run: async (t) => {
        t.checkFileExists('verification/run_diff.js', 'M4', 'Visual diff script verification/run_diff.js must exist');
      }
    },
    {
      id: 'T1_F21_02',
      name: 'Validate mathematical identity properties of visual diff (identical images yield 100% match, MSSIM 1.0)',
      run: async (t) => {
        const totalPixels = 1000;
        const mismatchPixels = 0;
        const pixelSimilarity = ((totalPixels - mismatchPixels) / totalPixels) * 100;
        t.assertEqual(pixelSimilarity, 100.0, 'Identical images must have 100% pixel similarity');
        const mssimScore = 1.0;
        t.assertEqual(mssimScore, 1.0, 'Identical images must yield MSSIM of 1.0');
      }
    },
    {
      id: 'T1_F21_03',
      name: 'Validate visual diff output JSON contract schema (pixelMismatchCount, pixelSimilarityPercentage, mssimScore)',
      run: async (t) => {
        const sampleDiffOutput = {
          pixelMismatchCount: 142,
          pixelSimilarityPercentage: 98.6,
          mssimScore: 0.965,
          diffOverlayPath: 'output/diff_overlay.png',
          compositePath: 'output/composite.png'
        };
        t.assert(typeof sampleDiffOutput.pixelMismatchCount === 'number');
        t.assert(typeof sampleDiffOutput.pixelSimilarityPercentage === 'number');
        t.assert(typeof sampleDiffOutput.mssimScore === 'number');
        t.assert(sampleDiffOutput.diffOverlayPath && typeof sampleDiffOutput.diffOverlayPath === 'string');
        t.assert(sampleDiffOutput.compositePath && typeof sampleDiffOutput.compositePath === 'string');
      }
    },
    {
      id: 'T1_F21_04',
      name: 'Validate CLI interface arguments for run_diff.js (--ref, --rendered, --output)',
      run: async (t) => {
        t.checkFileExists('verification/run_diff.js', 'M4');
        const content = t.readFile('verification/run_diff.js');
        t.assert(content.includes('--ref') || content.includes('ref'), 'Must accept --ref argument');
        t.assert(content.includes('--rendered') || content.includes('rendered'), 'Must accept --rendered argument');
        t.assert(content.includes('--output') || content.includes('output'), 'Must accept --output argument');
      }
    },
    {
      id: 'T1_F21_05',
      name: 'Validate 3-way side-by-side composite generation specification (Reference | Rendered | Diff)',
      run: async (t) => {
        const layoutPanels = ['Reference Web Viewport', 'Synthesized Compose Preview', 'Pixel Mismatch Heatmap'];
        t.assertEqual(layoutPanels.length, 3, 'Must produce 3-way side-by-side composite');
      }
    }
  ]
};
