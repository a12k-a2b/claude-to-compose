# TEST_INFRA: claude-to-compose Visual Verification Overhaul Test Infrastructure

**Document Version**: 2.0.0  
**Status**: ACTIVE & RATIFIED  
**Author**: E2E Test Writer Agent (`e2e_test_writer`)  
**Project**: `claude-to-compose`  
**Working Directory**: `/Users/anjan/.gemini/antigravity/scratch/claude_to_compose`  
**Date**: 2026-09-20  

---

## 1. Executive Summary & Architecture

The `claude-to-compose` overhaul transforms the synthesis and verification pipeline between web Claude Design artifacts and Android Jetpack Compose into an objective, self-correcting system.

Historical testing revealed that traditional pixelmatch and fixed luminance thresholds (`lum < 245`) reported deceptive passing scores ($\ge 90\%$) despite severe visual defects:
1. **Whitespace Dilution**: Large blank backgrounds mathematically dilute text displacement (e.g. 40px headline displacement on `da63` still yielded $94.31\%$ pixelmatch similarity).
2. **Tinted Background Misclassification**: On Daylight Sol:OS warm sand (`#E7E4DE`, luminance $228.2$), any threshold of `lum < 245` misclassifies the entire canvas ($>4.3\text{M pixels}$) as ink, yielding a completely false $95.13\%$ Ink IoU on `e34f`.
3. **Absence of Anti-Deception Guardrails**: The pipeline lacked checks for spatial drift and contour double-vision, certifying misaligned screens with `VERDICT: PASSED`.

The test infrastructure defined here enforces an **opaque-box, 4-tier verification hierarchy** in `test/e2e/` that strictly validates:
- Sobel edge contour detection with distance-weighted scoring ($d \le 1\text{px} \rightarrow 1.0, d=2\text{px} \rightarrow 0.5, d \ge 3\text{px} \rightarrow 0.0$).
- Dynamic background color clustering per canvas/region.
- Zonal bounding box IoU per semantic element.
- Hard anti-deception guardrails where any spatial shift $> 3\text{px}$ or contour score $< 90\%$ **actively fails verification**.
- Automated closed-loop tuning directives and convergence.
- Multi-artifact visual validation on `da63` and `e34f`.

---

## 2. Test Runner Architecture

The test harness is implemented in `test/e2e/run_all.js`. It runs natively under Node.js ($\ge 18$) with zero external test framework dependencies, ensuring fast execution (< 2s for synthetic suites) and full isolation.

### Invocation Commands

```bash
# Run complete 4-tier E2E test suite
node test/e2e/run_all.js

# Run via npm script
npm run test:e2e

# Run specific tiers
node test/e2e/run_all.js --tier 1   # Tier 1: Isolated Feature Suites
node test/e2e/run_all.js --tier 2   # Tier 2: Boundary & Corner Cases (>3px shift veto)
node test/e2e/run_all.js --tier 3   # Tier 3: Cross-Feature Combinations (tinted bg + drift)
node test/e2e/run_all.js --tier 4   # Tier 4: Real-World Scenarios (da63 and e34f)

# Short flag syntax
node test/e2e/run_all.js -t 1

# Filter by test ID or name pattern
node test/e2e/run_all.js -f Sobel
node test/e2e/run_all.js -f "Anti-Deception"

# Verbose output with detailed metric breakdowns
node test/e2e/run_all.js -v

# Machine-readable JSON output
node test/e2e/run_all.js --json
```

### Test Context & Assertion API
Each test function receives an isolated test context `t`:
- `t.assert(condition, message)`: Boolean assertion.
- `t.assertEqual(actual, expected, message)`: Strict equality (`===`).
- `t.assertDeepEqual(actual, expected, message)`: Deep structural equality.
- `t.assertMatch(str, regex, message)`: Regular expression match.
- `t.assertThrows(fn, expected, message)`: Synchronous exception assertion.
- `t.assertRejects(promiseFn, expected, message)`: Asynchronous exception assertion.
- `t.checkFileExists(relPath, milestone, detail)`: Progressive testability checker; flags missing files as `UNIMPLEMENTED` without crashing.
- `t.skip(reason)`: Skips test with documented rationale.

---

## 3. Feature Inventory & Tier Mapping

The 13 overhaul features defined in `PROJECT.md` map to the 4 test tiers as follows:

| Feature ID | Feature Name | Primary Scope | Test Tier | Validation Focus |
|:---|:---|:---|:---:|:---|
| **F1** | Canvas Dilution Penalty | `verification/run_diff.js` | Tier 1, Tier 2 | Penalizes empty background canvas; asserts white padding does not inflate similarity. |
| **F2** | Dynamic Background Subtraction | `verification/run_diff.js` | Tier 1, Tier 3 | Clusters modal canvas background color ($C_{bg}$); verifies Sol:OS `#E7E4DE` is not labeled as ink. |
| **F3** | Sobel/Canny Edge Contour Alignment | `verification/run_diff.js` | Tier 1, Tier 2 | Discrete 3x3 Sobel kernel convolution, edge extraction, distance-weighted scoring ($d \le 1\text{px}: 1.0, 2\text{px}: 0.5, \ge 3\text{px}: 0.0$). |
| **F4** | Zonal Bounding Box IoU | `verification/zonal_diff.js` | Tier 1, Tier 3 | Computes spatial overlap $\frac{A \cap B}{A \cup B}$ per semantic UI node from `design_spec.json`. |
| **F5** | Hard Anti-Deception Guardrail | `verification/index.js` | Tier 1, Tier 2 | Actively forces `verdict = 'FAILED'` when contour $< 90\%$, IoU $< 90\%$, or drift $> 3\text{px}$. |
| **F6** | Spatial Drift Vector Resolver | `verification/zonal_diff.js` | Tier 1, Tier 3 | Computes signed $(\Delta x, \Delta y)$ translation vectors and bounding dimension deltas $(\Delta w, \Delta h)$. |
| **F7** | Font Metric & Leading Normalization | `Type.kt`, Synthesizer | Tier 1, Tier 3 | Eliminates font padding (`includeFontPadding = false`, `LineHeightStyle`), checks `letterSpacing`, `lineHeight`. |
| **F8** | Font Asset Bundling | `android/res/font/` | Tier 1, Tier 4 | Bundling custom webfonts (`ABC Arizona Sans`, `ABC ROM Mono`, `ABC Arizona Flare`) into Compose. |
| **F9** | Closed-Loop Visual Auto-Tuner | `verification/auto_tuner.js` | Tier 1, Tier 3 | Evaluates translation deltas, maps them to Compose modifiers (`offset`, `padding`, `size`), tests convergence. |
| **F10** | Artifact `da63` Visual Parity | `Da63DesignScreen.kt` | Tier 4 | Zero double-vision on headline, masthead, body columns, 3 floating pills, pen indicator, ink circle. |
| **F11** | Artifact `e34f` Visual Parity | `E34fDesignScreen.kt` | Tier 4 | Zero double-vision on "A sheet of glass", fixes `100.dp` category label overflow, aligns all 6 pill rows. |
| **F12** | Gradle Build & Test Parity | `android/` | Tier 1, Tier 4 | Clean compilation (`compileDebugKotlin`) and Robolectric 2880x1720 Native Graphics render tests. |
| **F13** | Remote Repository Parity | Git / GitHub | Tier 4 | Working tree cleanliness, commit integrity, remote synchronization. |

---

## 4. Coverage Thresholds & Specifications

### Tier 1: Feature Coverage (>= 5 tests per core feature)
- **Sobel Edge Detection & Contour Alignment**:
  1. Discrete 3x3 Sobel kernel computation ($G_x, G_y$).
  2. Edge magnitude gradient thresholding ($|G_x| + |G_y| > 30$).
  3. Distance-decayed scoring kernel ($d \le 1\text{px} \rightarrow 1.0, d=2\text{px} \rightarrow 0.5, d \ge 3\text{px} \rightarrow 0.0$).
  4. Exact alignment identity (identical shapes yield $100.0\%$ contour score).
  5. Directional sensitivity (horizontal vs vertical edge shifts).
- **Dynamic Background Clustering**:
  1. Modal color histogram extraction on white canvas (`#FFFFFF`).
  2. Modal color histogram extraction on Sol:OS warm sand canvas (`#E7E4DE`).
  3. Color distance calculation in RGB/Lab space.
  4. Dynamic thresholding distinguishing ink from canvas.
  5. Multi-tonal regional background support (nested cards).
- **Zonal Bounding Box IoU**:
  1. Standard IoU calculation for identical boxes (IoU = 1.0).
  2. Disjoint boxes (IoU = 0.0).
  3. Partially overlapping boxes (mathematical verification).
  4. Centroid translation $(\Delta x, \Delta y)$ derivation.
  5. Semantic node mapping from `design_spec.json`.
- **Compose Typography & Font Metrics**:
  1. `PlatformTextStyle(includeFontPadding = false)` verification.
  2. `LineHeightStyle(alignment = Alignment.Center, trim = Trim.Both)` verification.
  3. `letterSpacing` preservation in `sp`.
  4. `lineHeight` preservation in `sp`.
  5. `baselineShift` token preservation.
- **Closed-Loop Tuner Directives**:
  1. Translation drift $(\Delta x, \Delta y)$ to `Modifier.offset` directive mapping.
  2. Padding drift to `Modifier.padding` directive mapping.
  3. Dimension drift $(\Delta w, \Delta h)$ to `Modifier.size` directive mapping.
  4. Spacing drift to `Arrangement.spacedBy` directive mapping.
  5. Convergence stopping condition check ($\le 2\text{px}$ drift, $\ge 90\%$ contour).

### Tier 2: Boundary & Corner Cases (Anti-Deception Guardrails)
- **Systematic Pixel Shift Ladder**:
  - **0px shift**: Contour alignment $= 100.0\%$, verdict `PASSED`.
  - **1px shift**: Contour alignment $\ge 95.0\%$, minor subpixel rasterization acceptable, verdict `PASSED`.
  - **2px shift**: Contour alignment drops to $\approx 50-70\%$, flagged for refinement.
  - **3px shift**: Exact boundary threshold; maximum allowable tolerance before hard veto.
  - **4px shift (> 3px)**: HARD VETO ACTIVATED. The verification score MUST actively FAIL (`antiDeceptionPassed = false`, `verdict = 'FAILED'`).
- **Canvas Edge Cases**:
  - Empty white canvas vs empty white canvas (zero ink; IoU must evaluate to 0.0% or handle empty state without NaN / division by zero).
  - Pure black canvas vs pure black canvas.
  - 1px single-dot canvas vs empty canvas.
  - Extreme aspect ratio mismatch (e.g. 100x1000 vs 1000x100).
  - Extreme spatial drift (> 100px displacement).

### Tier 3: Cross-Feature Combinations (Pairwise & Interaction Testing)
- **Pairwise Interaction 1**: Tinted background (`#E7E4DE`) + 5px displaced typography.
  - Demonstrates that old static `lum < 245` metric reported a false 95% pass.
  - Proves new dynamic background clustering + Sobel edge diff correctly detects the 5px shift and fails.
- **Pairwise Interaction 2**: Missing font fallback + contour edge diff.
  - Serif reference vs sans-serif fallback: bounding box centers align, but letterform contours diverge significantly (< 70% contour score).
- **Pairwise Interaction 3**: Closed-loop auto-tuner + multi-pill row layout.
  - Simulates `100.dp` category label width overflow wrapping to 2 lines and displacing 6 pill rows down by 24-48px.
  - Verifies that the tuner identifies the root cause and generates width expansion and offset compensation directives.
- **Pairwise Interaction 4**: Nested multi-container backgrounds.
  - Outer warm sand background with an inner white card container and dark text.
- **Pairwise Interaction 5**: Dark mode canvas with light ink and 4px shift.
  - Verifies inversion symmetry of background clustering and edge detection.

### Tier 4: Real-World Scenarios (`da63` and `e34f`)
- **Artifact `da63`**:
  - Verifies presence and dimensions of reference (`2880x1720`) and rendered compose screenshot.
  - Evaluates contour edge diff and detects ghosting on headline, masthead, body text, and 3 floating pills.
  - Asserts that the unaligned Compose preview is NOT self-certified as passed.
- **Artifact `e34f`**:
  - Verifies Sol:OS warm sand background `#E7E4DE` (lum ~228.2).
  - Validates that dynamic background subtraction does not misclassify the canvas as ink.
  - Validates detection of `100.dp` category label overflow displacing pill rows.
  - Asserts that unaligned `e34f` fails verification rather than passing with deceptive 95.13% Ink IoU.

---

## 5. Authoritative Expected Output Derivations & Mathematical Oracles

For every test case, the expected output is derived from explicit mathematical models and formal specifications:

### 1. Sobel Gradient Magnitude & Direction
Given a grayscale image $I(x, y)$, the horizontal and vertical spatial derivatives are computed via $3 \times 3$ convolution kernels:
$$G_x = \begin{bmatrix} -1 & 0 & +1 \\ -2 & 0 & +2 \\ -1 & 0 & +1 \end{bmatrix} * I, \quad G_y = \begin{bmatrix} -1 & -2 & -1 \\ 0 & 0 & 0 \\ +1 & +2 & +1 \end{bmatrix} * I$$
The gradient magnitude $G$ is:
$$G(x, y) = |G_x(x, y)| + |G_y(x, y)|$$
An edge pixel is defined where $G(x, y) > \tau_{\text{edge}}$ (with standard threshold $\tau_{\text{edge}} = 30$).

### 2. Distance-Weighted Contour Alignment Score
For each edge pixel $p \in E_{\text{ref}}$, find the Euclidean or Chebyshev distance $d(p, E_{\text{rendered}})$ to the nearest edge pixel in the rendered image:
$$w(d) = \begin{cases} 1.0 & \text{if } d \le 1\text{ px} \\ 0.5 & \text{if } d = 2\text{ px} \\ 0.0 & \text{if } d \ge 3\text{ px} \end{cases}$$
The contour alignment score is:
$$S_{\text{contour}} = \frac{\sum_{p \in E_{\text{ref}}} w(d(p, E_{\text{rendered}}))}{|E_{\text{ref}}|} \times 100\%$$

### 3. Dynamic Modal Color Histogram Clustering
For image $I$ with dimensions $W \times H$, compute the 3D RGB color histogram quantizing each channel into 16 bins (bin width = 16).
The modal bin $B_{\text{modal}} = \arg\max_{B} \text{count}(B)$ defines the dominant canvas background color $C_{bg} = (R_{bg}, G_{bg}, B_{bg})$.
A pixel $(r, g, b)$ is classified as foreground ink if and only if:
$$\Delta C = \sqrt{(r - R_{bg})^2 + (g - G_{bg})^2 + (b - B_{bg})^2} > \tau_{bg} \quad (\tau_{bg} = 25)$$
This guarantees that Sol:OS `#E7E4DE` ($\Delta C = 0$) is classified as background, whereas ink (`#1A1A1A`, $\Delta C \approx 360$) is classified as ink.

### 4. Bounding Box IoU
For two axis-aligned bounding boxes $A = (x_1, y_1, x_2, y_2)$ and $B = (x'_1, y'_1, x'_2, y'_2)$:
$$\text{Intersection} = \max(0, \min(x_2, x'_2) - \max(x_1, x'_1)) \times \max(0, \min(y_2, y'_2) - \max(y_1, y'_1))$$
$$\text{Union} = \text{Area}(A) + \text{Area}(B) - \text{Intersection}$$
$$\text{IoU} = \frac{\text{Intersection}}{\text{Union}} \times 100\%$$

---

## 6. Progressive Testability & Verification Sign-Off

The test suite in `test/e2e/` is fully operational and executable immediately. When run against the current repository state:
1. All mathematical proofs, synthetic image edge detectors, dynamic background clustering algorithms, boundary shift ladders, and cross-feature combinations pass with 100% precision.
2. Real-world validation tests against `da63` and `e34f` accurately detect existing double-vision and layout drift, asserting that the anti-deception guardrails correctly prevent false self-certification.
3. As subsequent milestones (M1 through M4) land and refine the implementation, the test suite provides an uncompromised, objective quality gate ensuring zero red ghosting and verified visual parity.
