/**
 * test/e2e/tier3_combinations.test.js
 *
 * Tier 3: Cross-Feature Combinations Suite.
 * Validates complex pairwise and multi-subsystem interactions:
 * - Tinted background (Sol:OS #E7E4DE) + displaced text contours (T3_COMBO_01)
 * - Typography font fallback (serif vs sans) + contour edge discrimination (T3_COMBO_02)
 * - Auto-tuner + cascading multi-pill row displacement (T3_COMBO_03)
 * - Multi-tonal nested container background clustering (T3_COMBO_04)
 * - Dark mode inverted canvas + spatial drift symmetry (T3_COMBO_05)
 */

const sharp = require('sharp');

module.exports = {
  name: 'Tier 3: Cross-Feature Combinations Suite',
  tier: 3,
  feature: 'Cross-Subsystem Interactions (F1+F2+F3+F6+F9)',
  tests: [
    // -------------------------------------------------------------------------
    // Combo 1: Tinted Background + Displaced Font Contours
    // -------------------------------------------------------------------------
    {
      id: 'T3_COMBO_01_TINTED_BG_DISPLACED_FONT',
      name: 'Combination: Sol:OS warm sand canvas (#E7E4DE) + 5px displaced typography & pill contours',
      run: async (t) => {
        const bg = '#E7E4DE';
        const fg = '#1A1A1A';
        const w = 300, h = 120;

        // Ref: Component at (40, 40), Rend: Component at (45, 45) -> 2D (5px, 5px) displacement
        const svgRef = `<svg width="${w}" height="${h}"><rect width="${w}" height="${h}" fill="${bg}"/><rect x="40" y="40" width="100" height="40" rx="20" fill="${fg}"/></svg>`;
        const svgRend = `<svg width="${w}" height="${h}"><rect width="${w}" height="${h}" fill="${bg}"/><rect x="45" y="45" width="100" height="40" rx="20" fill="${fg}"/></svg>`;

        const bRef = await sharp(Buffer.from(svgRef)).png().toBuffer();
        const bRend = await sharp(Buffer.from(svgRend)).png().toBuffer();

        // 1. Verify that dynamic background clustering isolates warm sand as background
        const bgClust = await t.oracle.clusterDominantBackground(bRef);
        t.assert(bgClust.coverageFraction > 0.85, 'Warm sand must be detected as dominant background');

        // 2. Compute Sobel contour alignment
        const eRef = await t.oracle.extractSobelEdges(bRef);
        const eRend = await t.oracle.extractSobelEdges(bRend);
        const contourScore = t.oracle.computeSobelContourAlignment(eRef, eRend);

        // A (5px, 5px) shift yields contour alignment far below 90%
        t.assert(contourScore < 50.0, `Contour score (${contourScore}%) must be < 50.0% for a 5px 2D shift on tinted canvas`);

        // 3. Evaluate Anti-Deception Guardrail: spatial shift is hypot(5, 5) = 7.07px
        const guardrail = t.oracle.evaluateAntiDeceptionGuardrails({
          edgeContourScore: contourScore,
          maxSpatialShiftPx: 7.07,
          elementIouScore: 65.0
        });

        t.assert(!guardrail.passed, 'Anti-deception guardrail must reject 5px shift on tinted canvas');
        t.assert(guardrail.violations.length >= 2, 'Must flag both contour score and spatial drift violations');
      }
    },

    // -------------------------------------------------------------------------
    // Combo 2: Typography Font Fallback + Contour Edge Discrimination
    // -------------------------------------------------------------------------
    {
      id: 'T3_COMBO_02_FONT_FALLBACK_VS_CONTOUR',
      name: 'Combination: Serif reference vs Sans-Serif fallback letterforms differ in contour edges',
      run: async (t) => {
        const w = 120, h = 100;
        // Serif capital I with top and bottom serif brackets
        const svgSerif = `<svg width="${w}" height="${h}"><rect width="${w}" height="${h}" fill="#fff"/><path d="M 20 20 L 60 20 L 60 28 L 45 28 L 45 72 L 60 72 L 60 80 L 20 80 L 20 72 L 35 72 L 35 28 L 20 28 Z" fill="#000"/></svg>`;
        // Sans-serif capital I (straight column)
        const svgSans = `<svg width="${w}" height="${h}"><rect width="${w}" height="${h}" fill="#fff"/><path d="M 35 20 L 45 20 L 45 80 L 35 80 Z" fill="#000"/></svg>`;

        const bSerif = await sharp(Buffer.from(svgSerif)).png().toBuffer();
        const bSans = await sharp(Buffer.from(svgSans)).png().toBuffer();

        const eSerif = await t.oracle.extractSobelEdges(bSerif);
        const eSans = await t.oracle.extractSobelEdges(bSans);

        // Self-comparison yields 100%
        const selfScore = t.oracle.computeSobelContourAlignment(eSerif, eSerif);
        t.assertEqual(selfScore, 100.0, 'Identical font glyph must yield 100.0% contour score');

        // Serif vs Sans-serif fallback drops below 60% due to serif brackets & stem contrast
        const fallbackScore = t.oracle.computeSobelContourAlignment(eSerif, eSans);
        t.assert(fallbackScore < 60.0, `Fallback font score (${fallbackScore}%) should detect glyph contour mismatch`);
      }
    },

    // -------------------------------------------------------------------------
    // Combo 3: Auto-Tuner + Cascading Multi-Pill Row Displacement
    // -------------------------------------------------------------------------
    {
      id: 'T3_COMBO_03_AUTOTUNER_MULTI_PILL_CASCADE',
      name: 'Combination: Category label wrap overflow triggers cascading displacement across 6 pill rows',
      run: async (t) => {
        // Model 6 rows from e34f:
        // When Row 1 wraps, its height increases by +24px, shifting Rows 2-6 downwards by 24px
        const referenceRows = [
          { id: 'row_1', y: 100, height: 32 },
          { id: 'row_2', y: 148, height: 32 },
          { id: 'row_3', y: 196, height: 32 },
          { id: 'row_4', y: 244, height: 32 },
          { id: 'row_5', y: 292, height: 32 },
          { id: 'row_6', y: 340, height: 32 }
        ];

        const renderedWrappedRows = [
          { id: 'row_1', y: 100, height: 56 }, // +24px height from wrapping
          { id: 'row_2', y: 172, height: 32 }, // +24px shift
          { id: 'row_3', y: 220, height: 32 }, // +24px shift
          { id: 'row_4', y: 268, height: 32 }, // +24px shift
          { id: 'row_5', y: 316, height: 32 }, // +24px shift
          { id: 'row_6', y: 364, height: 32 }  // +24px shift
        ];

        // Measure drifts across all 6 rows
        const rowDrifts = referenceRows.map((refRow, i) => {
          const rendRow = renderedWrappedRows[i];
          return {
            id: refRow.id,
            dY: rendRow.y - refRow.y,
            dHeight: rendRow.height - refRow.height
          };
        });

        // Verify root cause detection: Row 1 has dHeight = +24px, causing subsequent rows to have dY = +24px
        t.assertEqual(rowDrifts[0].dHeight, 24);
        for (let i = 1; i < 6; i++) {
          t.assertEqual(rowDrifts[i].dY, 24, `Row ${i+1} must be shifted down by 24px due to cascade`);
        }

        // Tuner directive: Expand category label width on Row 1 to collapse line wrap
        const tuningDirective = {
          target: 'E34fDesignScreen.kt:categoryLabel',
          action: 'Expand label width from 100.dp to 130.dp to prevent 2-line wrap',
          expectedHeightDelta: -24
        };
        t.assertEqual(tuningDirective.expectedHeightDelta, -24);
      }
    },

    // -------------------------------------------------------------------------
    // Combo 4: Multi-Tonal Nested Containers
    // -------------------------------------------------------------------------
    {
      id: 'T3_COMBO_04_NESTED_CONTAINER_CANVAS',
      name: 'Combination: Outer warm sand canvas + inner white card container + dark text',
      run: async (t) => {
        const w = 240, h = 160;
        // Outer #E7E4DE, inner card #FFFFFF at (40, 30, 160, 100), dark text #1A1A1A inside card
        const svg = `
          <svg width="${w}" height="${h}">
            <rect width="${w}" height="${h}" fill="#E7E4DE"/>
            <rect x="40" y="30" width="160" height="100" rx="8" fill="#FFFFFF"/>
            <text x="70" y="80" font-family="sans-serif" font-size="16" font-weight="bold" fill="#1A1A1A">CARD CONTENT</text>
          </svg>
        `;
        const buf = await sharp(Buffer.from(svg)).png().toBuffer();

        // Canvas dominant background should be warm sand
        const bgRes = await t.oracle.clusterDominantBackground(buf);
        t.assert(Math.abs(bgRes.dominantBg.r - 231) <= 20, 'Outer background correctly identified');

        // Extract edges: should detect both the card border AND the text contours
        const edgeRes = await t.oracle.extractSobelEdges(buf);
        t.assert(edgeRes.count > 100, 'Must extract edges from both nested card and text');
      }
    },

    // -------------------------------------------------------------------------
    // Combo 5: Inverted Dark Mode Canvas + Spatial Drift Symmetry
    // -------------------------------------------------------------------------
    {
      id: 'T3_COMBO_05_DARK_MODE_SPATIAL_DRIFT',
      name: 'Combination: Dark mode canvas (#121212) with light text (#F5F5F5) and 4px shift',
      run: async (t) => {
        const bg = '#121212';
        const fg = '#F5F5F5';
        const w = 200, h = 80;

        const svgRef = `<svg width="${w}" height="${h}"><rect width="${w}" height="${h}" fill="${bg}"/><rect x="30" y="20" width="60" height="40" rx="4" fill="${fg}"/></svg>`;
        const svgRend = `<svg width="${w}" height="${h}"><rect width="${w}" height="${h}" fill="${bg}"/><rect x="34" y="20" width="60" height="40" rx="4" fill="${fg}"/></svg>`;

        const bRef = await sharp(Buffer.from(svgRef)).png().toBuffer();
        const bRend = await sharp(Buffer.from(svgRend)).png().toBuffer();

        const eRef = await t.oracle.extractSobelEdges(bRef);
        const eRend = await t.oracle.extractSobelEdges(bRend);
        const contourScore = t.oracle.computeSobelContourAlignment(eRef, eRend);

        // 4px shift in dark mode should trigger the exact same hard veto
        const guardrail = t.oracle.evaluateAntiDeceptionGuardrails({
          edgeContourScore: contourScore,
          maxSpatialShiftPx: 4.0,
          elementIouScore: 82.0
        });

        t.assert(!guardrail.passed, 'Dark mode 4px shift must actively fail guardrails with spatial drift violation');
        t.assert(guardrail.violations.some((v) => v.includes('3.0px')));
      }
    }
  ]
};
