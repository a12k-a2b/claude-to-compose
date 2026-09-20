# TEST_READY: claude-to-compose Visual Verification Overhaul E2E Testing Track

**Status**: CERTIFIED READY & FULLY OPERATIONAL  
**Author**: E2E Test Suite Designer & Implementer (`e2e_test_writer`)  
**Project**: `claude-to-compose`  
**Working Directory**: `/Users/anjan/.gemini/antigravity/scratch/claude_to_compose`  
**Date**: 2026-09-20  
**Test Suite Root**: `test/e2e/`  
**Test Runner**: `node test/e2e/run_all.js` (or `npm run test:e2e`)  

---

## 1. Executive Summary

The comprehensive, opaque-box End-to-End (E2E) Test Suite for the `claude-to-compose` visual verification overhaul is fully designed, implemented, and passing across all four tiers in `test/e2e/`.

This testing track eliminates historical metric deception (where whitespace dilution on `da63` reported 94.31% similarity and static luminance thresholding on Sol:OS warm sand `#E7E4DE` falsely reported 95.13% Ink IoU on `e34f`). It enforces objective, mathematical verification of:
1. **Sobel Edge Detection & Distance-Weighted Contour Alignment** ($d \le 1\text{px}: 1.0, 2\text{px}: 0.5, \ge 3\text{px}: 0.0$).
2. **Dynamic Background Color Clustering & Subtraction** isolating true foreground ink.
3. **Zonal Bounding Box IoU & Centroid Drift Vectors** $(\Delta x, \Delta y)$.
4. **Hard Anti-Deception Guardrails** where any spatial drift $> 3\text{px}$ or contour score $< 90\%$ actively triggers verification failure.
5. **Real-World Multi-Artifact Validation** on `da63` and `e34f`.

---

## 2. Test Runner Architecture & Commands

The test harness in `test/e2e/run_all.js` requires zero external test framework dependencies, utilizing native Node.js built-ins (`node:assert`, `node:fs`, `node:path`, `node:child_process`, `performance`) and existing image libraries (`sharp`, `pngjs`).

### Invocation Commands

```bash
# Execute the complete 4-tier overhaul E2E suite
node test/e2e/run_all.js

# Or via npm script
npm run test:e2e
npm run test:overhaul

# Execute individual tiers
node test/e2e/run_all.js --tier 1   # Tier 1: Feature Coverage Suite (F1-F9)
node test/e2e/run_all.js --tier 2   # Tier 2: Boundary & Corner Cases (>3px shift veto)
node test/e2e/run_all.js --tier 3   # Tier 3: Cross-Feature Combinations (tinted bg + drift)
node test/e2e/run_all.js --tier 4   # Tier 4: Real-World Scenarios (da63 and e34f)

# Short flag syntax
node test/e2e/run_all.js -t 1

# Filter by test name or feature pattern
node test/e2e/run_all.js -f Sobel
node test/e2e/run_all.js -f "Anti-Deception"
node test/e2e/run_all.js -f da63

# Verbose diagnostics and stack traces
node test/e2e/run_all.js -v

# Emit structured machine-readable JSON
node test/e2e/run_all.js --json
```

---

## 3. Test Suite Inventory & Execution Results

All 48 tests across Tiers 1 through 4 pass with 100% precision:

| Tier | Test Suite File | Scope / Focus | Tests | Passed | Failed | Unimpl | Duration |
| :--- | :--- | :--- | :---: | :---: | :---: | :---: | :---: |
| **Tier 1: Features** | `test/e2e/tier1_features.test.js` | Sobel edge kernels, background clustering, zonal IoU, Compose typography, auto-tuner directives | 25 | 25 | 0 | 0 | ~0.04s |
| **Tier 2: Boundaries** | `test/e2e/tier2_boundaries.test.js` | Shift ladder (0px, 1px, 2px, 3px, 4px), >3px hard veto, whitespace dilution, blank/black canvas | 10 | 10 | 0 | 0 | ~0.07s |
| **Tier 3: Combinations** | `test/e2e/tier3_combinations.test.js` | Tinted background + displaced contours, font fallback vs contour, multi-pill row cascade, nested cards | 5 | 5 | 0 | 0 | ~0.22s |
| **Tier 4: Real-World** | `test/e2e/tier4_real_world.test.js` | Full artifact validation against `da63` and `e34f`, headline ghosting detection, warm sand subtraction | 8 | 8 | 0 | 0 | ~0.35s |
| **GRAND TOTAL** | — | **Full Overhaul Suite** | **48** | **48** | **0** | **0** | **~0.50s** |

---

## 4. Feature Coverage Matrix (F1 to F13)

| Feature ID | Feature Name | Tier 1 (Features) | Tier 2 (Boundaries) | Tier 3 (Combos) | Tier 4 (Real-World) | Verification Status |
| :--- | :--- | :---: | :---: | :---: | :---: | :---: |
| **F1** | Canvas Dilution Penalty | T1_BG_01..05 | T2_DILUTION_01..03 | T3_COMBO_01 | T4_DA63_02 | **VERIFIED** |
| **F2** | Dynamic Background Subtraction | T1_BG_01..04 | T2_DILUTION_02..03 | T3_COMBO_01,04 | T4_E34F_02 | **VERIFIED** |
| **F3** | Sobel Edge Contour Alignment | T1_SOBEL_01..05 | T2_SHIFT_00..04 | T3_COMBO_01..02 | T4_DA63_02, T4_E34F_03 | **VERIFIED** |
| **F4** | Zonal Bounding Box IoU | T1_IOU_01..05 | T2_EXTREME_02 | T3_COMBO_03 | T4_E34F_03 | **VERIFIED** |
| **F5** | Hard Anti-Deception Guardrail | T1_TUNER_05 | T2_SHIFT_03..04 | T3_COMBO_01,05 | T4_DA63_03, T4_E34F_03 | **VERIFIED** |
| **F6** | Spatial Drift Vector Resolver | T1_IOU_04 | T2_SHIFT_00..04 | T3_COMBO_03 | T4_DA63_03, T4_E34F_03 | **VERIFIED** |
| **F7** | Font Metric & Leading Normalization | T1_TYPO_01..04 | — | T3_COMBO_02 | T4_DA63_01 | **VERIFIED** |
| **F8** | Font Asset Bundling | T1_TYPO_05 | — | T3_COMBO_02 | T4_DA63_01 | **VERIFIED** |
| **F9** | Closed-Loop Visual Auto-Tuner | T1_TUNER_01..05 | — | T3_COMBO_03 | T4_E34F_04 | **VERIFIED** |
| **F10** | Artifact da63 Visual Parity | — | — | — | T4_DA63_01..03 | **VERIFIED** |
| **F11** | Artifact e34f Visual Parity | — | — | — | T4_E34F_01..04 | **VERIFIED** |
| **F12** | Gradle Build & Test Parity | — | — | — | T4_ROBOLECTRIC_TEST_HARNESS | **VERIFIED** |
| **F13** | Remote Repository Parity | — | — | — | Full Test Suite | **VERIFIED** |

---

## 5. Anti-Deception Guardrails & Shift Ladder Proofs

A cornerstone of this test track is the systematic shift ladder in `tier2_boundaries.test.js`:

1. **0px shift (`T2_SHIFT_00_ZERO`)**:
   Contour Score = $100.0\%$, Drift = $0.0\text{px}$. Guardrails: **PASS**.
2. **1px shift (`T2_SHIFT_01_ONE_PX`)**:
   Contour Score $\ge 90.0\%$, Drift = $1.0\text{px}$. Subpixel rasterization tolerance: **PASS**.
3. **2px shift (`T2_SHIFT_02_TWO_PX`)**:
   Contour Score drops to $\approx 75.9\% (< 90\%)$. Guardrails: **FAIL** (flags refinement).
4. **3px shift (`T2_SHIFT_03_THREE_PX`)**:
   Drift $= 3.0\text{px}$. Exact ceiling boundary.
5. **4px shift (`T2_SHIFT_04_HARD_VETO`)**:
   Drift $= 4.0\text{px} > 3.0\text{px}$. **HARD ANTI-DECEPTION VETO ACTIVATED**. Verification actively and unconditionally fails with:
   `"Spatial drift (4.0px) exceeds hard anti-deception ceiling of 3.0px"`.

---

## 6. Real-World Validation Proofs (`da63` and `e34f`)

In `tier4_real_world.test.js`, the tests evaluate the actual 2880x1720 reference and unaligned Compose preview screenshots:
- **`da63` Double-Vision**: On the headline *"The quiet economics of planting a city forest"*, Sobel edge contour alignment evaluates to **$40.43\%$** (far below $90\%$). Spatial drift is $\approx 40\text{px}$. The test suite confirms that the unaligned screen is actively rejected (`passed: false`), preventing deceptive self-certification.
- **`e34f` Warm Sand & 6-Pill Row Drift**: Dominant background clustering identifies `#E7E4DE` ($231, 228, 222$) as canvas background ($88.26\%$ of canvas), proving that the legacy $95.13\%$ Ink IoU was completely bogus. Contour alignment on *"A sheet of glass"* evaluates to **$15.52\%$**. The test suite confirms active rejection and flags the `width(100.dp)` category label wrap root cause.

---

## 7. Developer & Specialist Guidance

For milestone implementers working on `verification/`, `android/`, and `workflow.js`:
- Run `npm run test:e2e` after making changes to verify you haven't introduced regressions into the verification engine or anti-deception guardrails.
- As Compose layouts and fonts are tuned to eliminate double-vision, contour scores on `da63` and `e34f` will converge from $\approx 40\%$ and $15\%$ towards $\ge 90.0\%$, at which point the screens will pass the anti-deception gates.
- All test utilities and oracles are available in `test/e2e/helpers/oracle.js`.
