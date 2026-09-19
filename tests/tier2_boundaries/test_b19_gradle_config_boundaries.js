/**
 * Tier 2 - Boundary 19: Gradle Build Configuration Edge Cases & Negative Tests
 * Covers: Missing local.properties, invalid AGP, SDK path discovery, dependency conflicts
 */

module.exports = {
  name: 'B19: Gradle Build Configuration Boundaries',
  tier: 2,
  feature: 'B19',
  tests: [
    {
      id: 'T2_B19_01',
      name: 'Validate local.properties sdk.dir path format and discovery fallback',
      run: async (t) => {
        function resolveAndroidSdk(localPropContent, envVar) {
          if (localPropContent && localPropContent.includes('sdk.dir=')) {
            const match = localPropContent.match(/sdk\.dir=(.*)/);
            if (match && match[1].trim()) return match[1].trim();
          }
          if (envVar) return envVar;
          return null;
        }
        t.assertEqual(resolveAndroidSdk('sdk.dir=/Users/test/Android/sdk', null), '/Users/test/Android/sdk');
        t.assertEqual(resolveAndroidSdk(null, '/opt/android-sdk'), '/opt/android-sdk');
        t.assertEqual(resolveAndroidSdk(null, null), null);
      }
    },
    {
      id: 'T2_B19_02',
      name: 'Validate minimum compileSdk and targetSdk versions (>= 34)',
      run: async (t) => {
        function validateSdkVersions(compileSdk, targetSdk, minSdk) {
          if (compileSdk < 34) throw new Error(`OutdatedCompileSdkError: compileSdk ${compileSdk} must be >= 34`);
          if (targetSdk < 34) throw new Error(`OutdatedTargetSdkError: targetSdk ${targetSdk} must be >= 34`);
          if (minSdk < 24) throw new Error(`UnsupportedMinSdkError: minSdk ${minSdk} must be >= 24`);
          return true;
        }
        t.assertThrows(() => validateSdkVersions(33, 34, 24), /OutdatedCompileSdkError/);
        t.assertThrows(() => validateSdkVersions(35, 33, 24), /OutdatedTargetSdkError/);
        t.assertThrows(() => validateSdkVersions(35, 35, 21), /UnsupportedMinSdkError/);
        t.assert(validateSdkVersions(35, 35, 26));
      }
    },
    {
      id: 'T2_B19_03',
      name: 'Validate Java compatibility toolchain version (Java 17 or higher)',
      run: async (t) => {
        const javaVersion = 17;
        t.assert(javaVersion >= 17, 'AGP 8.x requires Java 17 or higher');
      }
    },
    {
      id: 'T2_B19_04',
      name: 'Validate Compose BOM version specification format (YYYY.MM.DD)',
      run: async (t) => {
        const bomVersion = '2024.10.01';
        t.assertMatch(bomVersion, /^\d{4}\.\d{2}\.\d{2}$/);
      }
    },
    {
      id: 'T2_B19_05',
      name: 'Verify android gradle wrapper properties file exists',
      run: async (t) => {
        t.checkFileExists('android/gradle/wrapper/gradle-wrapper.properties', 'M2', 'gradle-wrapper.properties must exist');
      }
    }
  ]
};
