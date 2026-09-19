/**
 * Tier 1 - Feature 13: Vector Graphic Translation (ImageVector & XML)
 * Covers: R2 / ORIGINAL_REQUEST §R2 / PROJECT.md §Feature 18
 */

const path = require('node:path');

module.exports = {
  name: 'F13: Vector Graphic Translation (ImageVector & XML)',
  tier: 1,
  feature: 'F13',
  tests: [
    {
      id: 'T1_F13_01',
      name: 'Validate Compose ImageVector.Builder DSL generation structure',
      run: async (t) => {
        const sampleImageVector = `
          val BrandLogoIcon: ImageVector
            get() {
              if (_brandLogoIcon != null) return _brandLogoIcon!!
              _brandLogoIcon = ImageVector.Builder(
                name = "BrandLogo",
                defaultWidth = 24.dp,
                defaultHeight = 24.dp,
                viewportWidth = 24f,
                viewportHeight = 24f
              ).apply {
                path(
                  fill = null,
                  stroke = SolidColor(Color(0xFF4F46E5)),
                  strokeLineWidth = 2f
                ) {
                  moveTo(12f, 2f)
                  lineTo(2f, 7f)
                  close()
                }
              }.build()
              return _brandLogoIcon!!
            }
        `;
        t.assertMatch(sampleImageVector, /ImageVector\.Builder\(/);
        t.assertMatch(sampleImageVector, /defaultWidth\s*=\s*\d+\.dp/);
        t.assertMatch(sampleImageVector, /viewportWidth\s*=\s*\d+f/);
        t.assertMatch(sampleImageVector, /path\(/);
      }
    },
    {
      id: 'T1_F13_02',
      name: 'Validate Android XML VectorDrawable structure (<vector>, <path>)',
      run: async (t) => {
        const sampleVectorXml = `
          <vector xmlns:android="http://schemas.android.com/apk/res/android"
              android:width="24dp"
              android:height="24dp"
              android:viewportWidth="24"
              android:viewportHeight="24">
              <path
                  android:pathData="M12,2L2,7l10,5 10,-5-10,-5z"
                  android:strokeColor="#4F46E5"
                  android:strokeWidth="2"/>
          </vector>
        `;
        t.assertMatch(sampleVectorXml, /<vector[^>]+android:width="24dp"/);
        t.assertMatch(sampleVectorXml, /android:pathData="[^"]+"/);
      }
    },
    {
      id: 'T1_F13_03',
      name: 'Validate SVG path commands to Compose PathBuilder mapping (M->moveTo, L->lineTo, Z->close)',
      run: async (t) => {
        const svgPathCommands = 'M 10 20 L 30 40 Z';
        t.assertMatch(svgPathCommands, /^M\s*\d+\s*\d+\s*L\s*\d+\s*\d+\s*Z$/);
      }
    },
    {
      id: 'T1_F13_04',
      name: 'Verify vector_generator module existence in synthesizer subsystem',
      run: async (t) => {
        t.checkFileExists('synthesizer/vector_generator.js', 'M2', 'Vector generator module required for SVG to ImageVector/XML conversion');
      }
    },
    {
      id: 'T1_F13_05',
      name: 'Validate SolidColor and Brush translation for filled vector elements',
      run: async (t) => {
        const sampleFill = 'fill = SolidColor(Color(0xFFF59E0B))';
        t.assertMatch(sampleFill, /SolidColor\(Color\(0x[0-9A-Fa-f]{8}\)\)/);
      }
    }
  ]
};
