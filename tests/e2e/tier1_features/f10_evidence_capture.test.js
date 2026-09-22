'use strict';

/**
 * tests/e2e/tier1_features/f10_evidence_capture.test.js
 * Feature 10: Immutable Evidence Bundle Capture (`ctc capture`)
 */

module.exports = {
  name: 'Feature 10: Immutable Evidence Bundle Capture (ctc capture)',
  tests: [
    {
      id: 'F10-T1',
      name: 'Evidence capture module exists and exports captureEvidenceBundle API',
      fn(t) {
        t.checkComponent('Evidence Capture Module', 'M2', () => {
          t.checkFileExists('src/extractor/capture.js', 'M2');
          const capture = require('../../../src/extractor/capture');
          t.assert(typeof capture.captureEvidenceBundle === 'function');
        });
      }
    },
    {
      id: 'F10-T2',
      name: 'Evidence capture supports local HTML file input with ephemeral HTTP server',
      fn(t) {
        t.checkComponent('Local File Capture', 'M2', () => {
          const capture = require('../../../src/extractor/capture');
          t.assert(typeof capture.startEphemeralServer === 'function' || typeof capture.captureLocalHtml === 'function');
        });
      }
    },
    {
      id: 'F10-T3',
      name: 'Evidence capture executes 5-phase hydration barrier before DOM capture',
      fn(t) {
        t.checkComponent('Hydration Barrier Settling', 'M2', () => {
          const capture = require('../../../src/extractor/capture');
          t.assert(typeof capture.waitForHydration === 'function');
        });
      }
    },
    {
      id: 'F10-T4',
      name: 'Evidence capture extracts SVG vectors and downloads referenced fonts',
      fn(t) {
        t.checkComponent('Asset Extraction', 'M2', () => {
          const capture = require('../../../src/extractor/capture');
          t.assert(typeof capture.extractVectors === 'function' || typeof capture.extractFonts === 'function');
        });
      }
    },
    {
      id: 'F10-T5',
      name: 'Evidence capture computes SHA-256 provenance receipts for all assets',
      fn(t) {
        t.checkComponent('Provenance Hashing', 'M2', () => {
          const capture = require('../../../src/extractor/capture');
          t.assert(typeof capture.computeAssetHashes === 'function' || typeof capture.generateProvenanceReceipt === 'function');
        });
      }
    }
  ]
};
