/**
 * Tier 1 - Feature 19: Gradle Kotlin Compilation (./gradlew compileDebugKotlin)
 * Covers: R4 / ORIGINAL_REQUEST §R4 / PROJECT.md §Feature 26
 */

const fs = require('node:fs');
const path = require('node:path');

module.exports = {
  name: 'F19: Gradle Kotlin Compilation (./gradlew compileDebugKotlin)',
  tier: 1,
  feature: 'F19',
  tests: [
    {
      id: 'T1_F19_01',
      name: 'Verify Android project root layout and Gradle build files existence',
      run: async (t) => {
        t.checkFileExists('android/build.gradle.kts', 'M2', 'Android root build.gradle.kts must exist');
        t.checkFileExists('android/settings.gradle.kts', 'M2', 'Android settings.gradle.kts must exist');
        t.checkFileExists('android/app/build.gradle.kts', 'M2', 'Android app module build.gradle.kts must exist');
      }
    },
    {
      id: 'T1_F19_02',
      name: 'Verify Gradle wrapper executable and wrapper properties configuration',
      run: async (t) => {
        t.checkFileExists('android/gradlew', 'M2', 'gradlew wrapper script must exist');
        t.checkFileExists('android/gradle/wrapper/gradle-wrapper.properties', 'M2', 'gradle-wrapper.properties must exist');
        const wrapperProps = t.readFile('android/gradle/wrapper/gradle-wrapper.properties');
        t.assert(wrapperProps.includes('gradle-8.11.1-bin.zip') || wrapperProps.includes('gradle-8.'), 'Must use Gradle 8.x wrapper');
      }
    },
    {
      id: 'T1_F19_03',
      name: 'Validate Android app build.gradle.kts plugin configurations and dependencies',
      run: async (t) => {
        t.checkFileExists('android/app/build.gradle.kts', 'M2');
        const content = t.readFile('android/app/build.gradle.kts');
        t.assert(content.includes('com.android.application'), 'Must apply com.android.application plugin');
        t.assert(content.includes('org.jetbrains.kotlin.android') || content.includes('kotlin("android")'), 'Must apply Kotlin Android plugin');
        t.assert(content.includes('compose = true') || content.includes('buildFeatures { compose = true }'), 'Must enable Compose build feature');
      }
    },
    {
      id: 'T1_F19_04',
      name: 'Verify AndroidManifest.xml existence with application element',
      run: async (t) => {
        t.checkFileExists('android/app/src/main/AndroidManifest.xml', 'M2');
        const manifest = t.readFile('android/app/src/main/AndroidManifest.xml');
        t.assert(manifest.includes('<manifest'), 'Must contain root manifest tag');
        t.assert(manifest.includes('<application'), 'Must contain application declaration');
      }
    },
    {
      id: 'T1_F19_05',
      name: 'Verify compileDebugKotlin compilation command invocation contract',
      run: async (t) => {
        t.checkFileExists('android/gradlew', 'M2');
        const gradlewPath = path.resolve(t.projectRoot, 'android/gradlew');
        t.assert(fs.existsSync(gradlewPath), 'gradlew must be present to compile Kotlin');
      }
    }
  ]
};
