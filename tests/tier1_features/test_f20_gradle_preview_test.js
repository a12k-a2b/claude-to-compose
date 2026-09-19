/**
 * Tier 1 - Feature 20: Gradle Unit & Preview Test (./gradlew test)
 * Covers: R4 / ORIGINAL_REQUEST §R4 / PROJECT.md §Feature 27
 */

const fs = require('node:fs');
const path = require('node:path');

module.exports = {
  name: 'F20: Gradle Unit & Preview Test (./gradlew test)',
  tier: 1,
  feature: 'F20',
  tests: [
    {
      id: 'T1_F20_01',
      name: 'Verify PreviewScreenshotTest.kt existence in android/app/src/test/',
      run: async (t) => {
        t.checkFileExists(
          'android/app/src/test/java/com/claude/compose/PreviewScreenshotTest.kt',
          'M2',
          'Robolectric preview screenshot capture test must exist'
        );
      }
    },
    {
      id: 'T1_F20_02',
      name: 'Validate Robolectric Native Graphics mode annotation (@GraphicsMode(GraphicsMode.Mode.NATIVE))',
      run: async (t) => {
        t.checkFileExists('android/app/src/test/java/com/claude/compose/PreviewScreenshotTest.kt', 'M2');
        const content = t.readFile('android/app/src/test/java/com/claude/compose/PreviewScreenshotTest.kt');
        t.assertMatch(content, /@GraphicsMode\(GraphicsMode\.Mode\.NATIVE\)/, 'Must enable Robolectric Native Graphics mode');
        t.assertMatch(content, /@RunWith\(RobolectricTestRunner::class\)/, 'Must use RobolectricTestRunner');
      }
    },
    {
      id: 'T1_F20_03',
      name: 'Validate JUnit4 test rule creates Compose test rule (createComposeRule())',
      run: async (t) => {
        t.checkFileExists('android/app/src/test/java/com/claude/compose/PreviewScreenshotTest.kt', 'M2');
        const content = t.readFile('android/app/src/test/java/com/claude/compose/PreviewScreenshotTest.kt');
        t.assertMatch(content, /createComposeRule\(\)/, 'Must instantiate createComposeRule()');
      }
    },
    {
      id: 'T1_F20_04',
      name: 'Validate rendered screenshot output destination path (rendered_preview.png)',
      run: async (t) => {
        t.checkFileExists('android/app/src/test/java/com/claude/compose/PreviewScreenshotTest.kt', 'M2');
        const content = t.readFile('android/app/src/test/java/com/claude/compose/PreviewScreenshotTest.kt');
        t.assert(content.includes('rendered_preview.png'), 'Must save bitmap to rendered_preview.png');
      }
    },
    {
      id: 'T1_F20_05',
      name: 'Verify Robolectric test dependencies in app/build.gradle.kts',
      run: async (t) => {
        t.checkFileExists('android/app/build.gradle.kts', 'M2');
        const buildGradle = t.readFile('android/app/build.gradle.kts');
        t.assert(buildGradle.includes('robolectric'), 'build.gradle.kts must include robolectric dependency');
        t.assert(buildGradle.includes('ui-test-junit4'), 'build.gradle.kts must include compose ui-test-junit4 dependency');
      }
    }
  ]
};
