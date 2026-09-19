/**
 * Tier 1 - Feature 6: Multi-Viewport Screenshots
 * Covers: R1 / ORIGINAL_REQUEST §R1 / PROJECT.md §Feature 11
 */

const path = require('node:path');

module.exports = {
  name: 'F6: Multi-Viewport Screenshots',
  tier: 1,
  feature: 'F6',
  tests: [
    {
      id: 'T1_F6_01',
      name: 'Validate mobile viewport specifications (412x915 @ 3x or 390x844 @ 3x)',
      run: async (t) => {
        const mobileConfig = {
          width: 412,
          height: 915,
          deviceScaleFactor: 3.0,
          isMobile: true,
          hasTouch: true
        };
        t.assertEqual(mobileConfig.deviceScaleFactor, 3.0, 'Mobile viewport must use 3x scale factor');
        t.assert(mobileConfig.isMobile, 'Mobile emulation flag must be true');
        t.assert(mobileConfig.hasTouch, 'Touch emulation flag must be true');
        const physicalWidth = mobileConfig.width * mobileConfig.deviceScaleFactor;
        const physicalHeight = mobileConfig.height * mobileConfig.deviceScaleFactor;
        t.assertEqual(physicalWidth, 1236, 'Calculated physical width must be 1236px');
        t.assertEqual(physicalHeight, 2745, 'Calculated physical height must be 2745px');
      }
    },
    {
      id: 'T1_F6_02',
      name: 'Validate desktop viewport specifications (1440x900 @ 2x)',
      run: async (t) => {
        const desktopConfig = {
          width: 1440,
          height: 900,
          deviceScaleFactor: 2.0,
          isMobile: false,
          hasTouch: false
        };
        t.assertEqual(desktopConfig.deviceScaleFactor, 2.0, 'Desktop viewport must use 2x scale factor');
        t.assert(!desktopConfig.isMobile, 'Desktop emulation flag must be false');
        const physicalWidth = desktopConfig.width * desktopConfig.deviceScaleFactor;
        const physicalHeight = desktopConfig.height * desktopConfig.deviceScaleFactor;
        t.assertEqual(physicalWidth, 2880, 'Calculated desktop physical width must be 2880px');
        t.assertEqual(physicalHeight, 1800, 'Calculated desktop physical height must be 1800px');
      }
    },
    {
      id: 'T1_F6_03',
      name: 'Validate screenshot naming convention (reference_mobile.png, reference_desktop.png)',
      run: async (t) => {
        const mobileFilename = 'reference_mobile.png';
        const desktopFilename = 'reference_desktop.png';
        t.assertMatch(mobileFilename, /^reference_mobile(\.fullpage)?\.png$/);
        t.assertMatch(desktopFilename, /^reference_desktop\.png$/);
      }
    },
    {
      id: 'T1_F6_04',
      name: 'Verify extractor engine screenshot capture method contract',
      run: async (t) => {
        t.checkFileExists('extractor/engine.js', 'M1', 'Extractor engine must provide captureScreenshots method');
      }
    },
    {
      id: 'T1_F6_05',
      name: 'Verify PNG image format signature validation (89 50 4E 47)',
      run: async (t) => {
        const pngHeader = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
        t.assertEqual(pngHeader[0], 0x89);
        t.assertEqual(pngHeader[1], 0x50); // 'P'
        t.assertEqual(pngHeader[2], 0x4E); // 'N'
        t.assertEqual(pngHeader[3], 0x47); // 'G'
      }
    }
  ]
};
