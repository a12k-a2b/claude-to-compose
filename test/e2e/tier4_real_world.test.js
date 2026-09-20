/**
 * test/e2e/tier4_real_world.test.js
 *
 * Tier 4: Real-World Application Scenarios Suite.
 * Validates the verification overhaul against the actual target Claude Design artifacts:
 * - Artifact da63 (da63f0b2-6919-408a-b3eb-68685f019fe6):
 *   Headline, masthead, floating pills, vector ink circle annotations
 * - Artifact e34f (e34f4387-f506-4de5-bced-ef318d7f8bdf):
 *   Sol:OS warm sand background, "A sheet of glass", 6 categorized pill rows
 * - Headless Robolectric Native Graphics render test infrastructure
 */

const path = require('node:path');
const fs = require('node:fs');
const sharp = require('sharp');

module.exports = {
  name: 'Tier 4: Real-World Scenarios Suite (da63 & e34f)',
  tier: 4,
  feature: 'F10, F11, F12 Multi-Artifact Validation',
  tests: [
    // -------------------------------------------------------------------------
    // Target Artifact 1: da63 (Reading Canvas, Masthead & Floating Pills)
    // -------------------------------------------------------------------------
    {
      id: 'T4_DA63_01_INPUT_ARTIFACTS',
      name: 'da63 Artifact: Reference and rendered Compose screenshots exist at exact 2880x1720 resolution',
      run: async (t) => {
        const refPath = path.resolve(t.projectRoot, 'output/test_da63/screenshots/desktop_reference.png');
        const rendPath = path.resolve(t.projectRoot, 'output/test_da63/rendered_compose.png');
        const specPath = path.resolve(t.projectRoot, 'output/test_da63/design_spec.json');
        const screenKtPath = path.resolve(t.projectRoot, 'android/app/src/main/java/com/claude/compose/screen/Da63DesignScreen.kt');

        t.assert(fs.existsSync(refPath), `Reference screenshot must exist at ${refPath}`);
        t.assert(fs.existsSync(rendPath), `Rendered screenshot must exist at ${rendPath}`);
        t.assert(fs.existsSync(specPath), `Design spec must exist at ${specPath}`);
        t.assert(fs.existsSync(screenKtPath), `Da63DesignScreen.kt must exist at ${screenKtPath}`);

        const refMeta = await sharp(refPath).metadata();
        const rendMeta = await sharp(rendPath).metadata();

        t.assertEqual(refMeta.width, 2880, 'Reference width must be 2880px');
        t.assertEqual(refMeta.height, 1720, 'Reference height must be 1720px');
        t.assertEqual(rendMeta.width, 2880, 'Rendered width must be 2880px');
        t.assertEqual(rendMeta.height, 1720, 'Rendered height must be 1720px');

        const spec = t.readJson('output/test_da63/design_spec.json');
        const sourceUrl = spec.metadata?.source || spec.source || '';
        t.assert(sourceUrl.includes('da63f0b2'), 'Design spec source must cite da63 artifact');
      }
    },
    {
      id: 'T4_DA63_02_CONTOUR_DIVERGENCE_DETECTION',
      name: 'da63 Artifact: Sobel contour detection identifies headline double-vision (< 90.0% alignment)',
      run: async (t) => {
        const refPath = path.resolve(t.projectRoot, 'output/test_da63/screenshots/desktop_reference.png');
        const rendPath = path.resolve(t.projectRoot, 'output/test_da63/rendered_compose.png');

        // Extract headline region: left 160, top 80, width 1200, height 600
        const bRef = await sharp(refPath).extract({ left: 160, top: 80, width: 1200, height: 600 }).png().toBuffer();
        const bRend = await sharp(rendPath).extract({ left: 160, top: 80, width: 1200, height: 600 }).png().toBuffer();

        const eRef = await t.oracle.extractSobelEdges(bRef);
        const eRend = await t.oracle.extractSobelEdges(bRend);

        t.assert(eRef.count > 10000, `Headline reference must contain letterform edges (found ${eRef.count})`);

        const contourScore = t.oracle.computeSobelContourAlignment(eRef, eRend);
        // On unaligned da63 with word wrap differences ("planting a" vs "planting a city"), score is ~40.4%
        t.assert(
          contourScore < 90.0,
          `Objective contour score (${contourScore}%) must detect double-vision and remain strictly < 90.0%`
        );
      }
    },
    {
      id: 'T4_DA63_03_ANTI_DECEPTION_GUARDRAIL_VETO',
      name: 'da63 Artifact: Anti-deception guardrails actively fail unaligned preview, preventing self-certification',
      run: async (t) => {
        // Evaluate guardrails using da63 empirical metrics:
        // Edge contour is ~40.4%, spatial drift on headline is ~40px (> 3.0px)
        const guardrail = t.oracle.evaluateAntiDeceptionGuardrails({
          edgeContourScore: 40.4,
          maxSpatialShiftPx: 40.0,
          elementIouScore: 68.0
        });

        t.assert(!guardrail.passed, 'da63 with red ghosting MUST actively fail anti-deception guardrails');
        t.assert(guardrail.violations.length >= 2, 'Must cite both contour alignment and spatial drift violations');
      }
    },

    // -------------------------------------------------------------------------
    // Target Artifact 2: e34f (Sol:OS Warm Sand Background & 6 Pill Rows)
    // -------------------------------------------------------------------------
    {
      id: 'T4_E34F_01_INPUT_ARTIFACTS',
      name: 'e34f Artifact: Reference and rendered Compose screenshots exist at exact 2880x1720 resolution',
      run: async (t) => {
        const refPath = path.resolve(t.projectRoot, 'output/test_e34f/screenshots/desktop_reference.png');
        const rendPath = path.resolve(t.projectRoot, 'output/test_e34f/rendered_compose.png');
        const specPath = path.resolve(t.projectRoot, 'output/test_e34f/design_spec.json');
        const screenKtPath = path.resolve(t.projectRoot, 'android/app/src/main/java/com/claude/compose/screen/E34fDesignScreen.kt');

        t.assert(fs.existsSync(refPath), `Reference screenshot must exist at ${refPath}`);
        t.assert(fs.existsSync(rendPath), `Rendered screenshot must exist at ${rendPath}`);
        t.assert(fs.existsSync(specPath), `Design spec must exist at ${specPath}`);
        t.assert(fs.existsSync(screenKtPath), `E34fDesignScreen.kt must exist at ${screenKtPath}`);

        const refMeta = await sharp(refPath).metadata();
        const rendMeta = await sharp(rendPath).metadata();

        t.assertEqual(refMeta.width, 2880, 'Reference width must be 2880px');
        t.assertEqual(refMeta.height, 1720, 'Reference height must be 1720px');
        t.assertEqual(rendMeta.width, 2880, 'Rendered width must be 2880px');
        t.assertEqual(rendMeta.height, 1720, 'Rendered height must be 1720px');
      }
    },
    {
      id: 'T4_E34F_02_WARM_SAND_BACKGROUND_SUBTRACTION',
      name: 'e34f Artifact: Dynamic background clustering isolates Sol:OS warm sand canvas and prevents deceptive 95% IoU',
      run: async (t) => {
        const refPath = path.resolve(t.projectRoot, 'output/test_e34f/screenshots/desktop_reference.png');
        const buf = await sharp(refPath).toBuffer();

        const bgResult = await t.oracle.clusterDominantBackground(buf);

        // Sol:OS warm sand RGB is ~ (231, 228, 222)
        t.assert(
          Math.abs(bgResult.dominantBg.r - 231) <= 16 &&
          Math.abs(bgResult.dominantBg.g - 228) <= 16 &&
          Math.abs(bgResult.dominantBg.b - 222) <= 16,
          `Dominant background must cluster to Sol:OS warm sand, got RGB(${bgResult.dominantBg.r}, ${bgResult.dominantBg.g}, ${bgResult.dominantBg.b})`
        );
        t.assert(
          bgResult.coverageFraction > 0.85,
          `Warm sand canvas must account for >85% of display (found ${(bgResult.coverageFraction * 100).toFixed(1)}%)`
        );
      }
    },
    {
      id: 'T4_E34F_03_CONTOUR_AND_GUARDRAIL_VETO',
      name: 'e34f Artifact: Headline "A sheet of glass" contour divergence (< 90%) triggers hard veto',
      run: async (t) => {
        const refPath = path.resolve(t.projectRoot, 'output/test_e34f/screenshots/desktop_reference.png');
        const rendPath = path.resolve(t.projectRoot, 'output/test_e34f/rendered_compose.png');

        // Extract "A sheet of glass" headline region: left 160, top 100, width 1200, height 400
        const c1 = await sharp(refPath).extract({ left: 160, top: 100, width: 1200, height: 400 }).png().toBuffer();
        const c2 = await sharp(rendPath).extract({ left: 160, top: 100, width: 1200, height: 400 }).png().toBuffer();

        const e1 = await t.oracle.extractSobelEdges(c1);
        const e2 = await t.oracle.extractSobelEdges(c2);

        const contourScore = t.oracle.computeSobelContourAlignment(e1, e2);
        // Due to 28px downward displacement, contour score is ~15.5%
        t.assert(contourScore < 90.0, `e34f headline contour score (${contourScore}%) must detect displacement (< 90%)`);

        const guardrail = t.oracle.evaluateAntiDeceptionGuardrails({
          edgeContourScore: contourScore,
          maxSpatialShiftPx: 28.0,
          elementIouScore: 45.0
        });

        t.assert(!guardrail.passed, 'e34f with displaced pill rows must actively fail anti-deception guardrails');
      }
    },
    {
      id: 'T4_E34F_04_CATEGORY_LABEL_WRAP_ROOT_CAUSE',
      name: 'e34f Artifact: Verifies category label wrap overflow is prevented via width(140.dp) and softWrap = false',
      run: async (t) => {
        const screenContent = t.readFile('android/app/src/main/java/com/claude/compose/screen/E34fDesignScreen.kt');
        // Verify absence of buggy width(100.dp) constraint and presence of 140.dp with softWrap = false
        const has100DpWidth = screenContent.includes('width(100.dp)');
        t.assert(!has100DpWidth, 'E34fDesignScreen.kt must NOT contain buggy width(100.dp) constraint');

        const has140DpWidth = screenContent.includes('width(140.dp)');
        t.assert(has140DpWidth, 'E34fDesignScreen.kt must enforce width(140.dp) on category labels');

        const hasSoftWrapFalse = screenContent.includes('softWrap = false');
        t.assert(hasSoftWrapFalse, 'E34fDesignScreen.kt must enforce softWrap = false to prevent label wrapping');
      }
    },

    // -------------------------------------------------------------------------
    // Headless Robolectric Preview Infrastructure
    // -------------------------------------------------------------------------
    {
      id: 'T4_ROBOLECTRIC_TEST_HARNESS',
      name: 'Robolectric Test Harness: ArtifactScreenshotsTest.kt exists and targets 1440x860dp @ 2x density',
      run: async (t) => {
        const testKtPath = path.resolve(t.projectRoot, 'android/app/src/test/java/com/claude/compose/ArtifactScreenshotsTest.kt');
        t.assert(fs.existsSync(testKtPath), 'ArtifactScreenshotsTest.kt must exist');

        const content = fs.readFileSync(testKtPath, 'utf8');
        t.assert(content.includes('@GraphicsMode(GraphicsMode.Mode.NATIVE)'), 'Must configure Robolectric Native Graphics');
        t.assert(content.includes('w1440dp-h860dp-xhdpi'), 'Must configure qualifiers for 2880x1720px preview render');
        t.assert(content.includes('renderDa63Preview'), 'Must include da63 preview capture test');
        t.assert(content.includes('renderE34fPreview'), 'Must include e34f preview capture test');
      }
    }
  ]
};
