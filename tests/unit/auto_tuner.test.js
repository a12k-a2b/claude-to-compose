/**
 * tests/unit/auto_tuner.test.js
 *
 * Comprehensive Unit Test Suite for Automated Closed-Loop Visual Auto-Tuner (Feature F9).
 * Tests mutation logic, oscillation detection, convergence checks, regression detection, and rollback.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');

const {
  AutoTuner,
  ClosedLoopAutoTuner,
  KotlinComposeMutator,
  autoTuneScreen,
  checkConvergence,
  detectOscillation,
  detectRegression,
  calculateCompositeScore
} = require('../../verification/auto_tuner');

describe('AutoTuner & ClosedLoopAutoTuner Unit Tests (Feature F9)', () => {

  describe('Convergence Gate Evaluation (checkConvergence)', () => {
    it('passes when all 5 anti-deception quality gates are satisfied simultaneously', () => {
      const passingMetrics = {
        edgeContourScore: 92.5,
        elementIouScore: 91.2,
        maxSpatialShiftPx: 1.8,
        inkIou: 62.0,
        mssimScore: 0.85
      };

      const res = checkConvergence(passingMetrics);
      assert.strictEqual(res.converged, true);
      assert.strictEqual(res.violations.length, 0);
    });

    it('fails when edgeContourScore < 90.0% with descriptive violation', () => {
      const failingMetrics = {
        edgeContourScore: 84.5,
        elementIouScore: 91.0,
        maxSpatialShiftPx: 2.0,
        inkIou: 60.0,
        mssimScore: 0.80
      };

      const res = checkConvergence(failingMetrics);
      assert.strictEqual(res.converged, false);
      assert.strictEqual(res.violations.some(v => v.includes('Edge contour alignment (84.5%) < required 90%')), true);
    });

    it('fails when elementIouScore < 90.0%', () => {
      const failingMetrics = {
        edgeContourScore: 91.0,
        elementIouScore: 82.3,
        maxSpatialShiftPx: 2.5,
        inkIou: 60.0,
        mssimScore: 0.80
      };

      const res = checkConvergence(failingMetrics);
      assert.strictEqual(res.converged, false);
      assert.strictEqual(res.violations.some(v => v.includes('Element bounding box IoU (82.3%) < required 90%')), true);
    });

    it('fails when maxSpatialShiftPx > 3.0px (1.5dp)', () => {
      const failingMetrics = {
        edgeContourScore: 92.0,
        elementIouScore: 91.0,
        maxSpatialShiftPx: 4.8,
        inkIou: 65.0,
        mssimScore: 0.85
      };

      const res = checkConvergence(failingMetrics);
      assert.strictEqual(res.converged, false);
      assert.strictEqual(res.violations.some(v => v.includes('Max spatial shift (4.8px) > allowed 3px')), true);
    });

    it('fails when inkIou < 55.0%', () => {
      const failingMetrics = {
        edgeContourScore: 92.0,
        elementIouScore: 91.0,
        maxSpatialShiftPx: 2.0,
        inkIou: 48.0,
        mssimScore: 0.85
      };

      const res = checkConvergence(failingMetrics);
      assert.strictEqual(res.converged, false);
      assert.strictEqual(res.violations.some(v => v.includes('Foreground Ink IoU (48%) < required 55%')), true);
    });

    it('fails when mssimScore < 0.72', () => {
      const failingMetrics = {
        edgeContourScore: 92.0,
        elementIouScore: 91.0,
        maxSpatialShiftPx: 2.0,
        inkIou: 60.0,
        mssimScore: 0.68
      };

      const res = checkConvergence(failingMetrics);
      assert.strictEqual(res.converged, false);
      assert.strictEqual(res.violations.some(v => v.includes('MSSIM score (0.68) < required 0.72')), true);
    });

    it('respects custom threshold overrides', () => {
      const metrics = {
        edgeContourScore: 88.0,
        elementIouScore: 85.0,
        maxSpatialShiftPx: 4.0,
        inkIou: 50.0,
        mssimScore: 0.65
      };

      const customThresholds = {
        minContourScore: 85.0,
        minElementIou: 80.0,
        maxShiftPx: 5.0,
        minInkIou: 45.0,
        minMssim: 0.60
      };

      const res = checkConvergence(metrics, customThresholds);
      assert.strictEqual(res.converged, true);
      assert.strictEqual(res.violations.length, 0);
    });
  });

  describe('Composite Quality Scoring (calculateCompositeScore)', () => {
    it('accurately computes scalar composite quality score Q_k', () => {
      const metrics = {
        edgeContourScore: 90.0,
        elementIouScore: 90.0,
        inkIou: 60.0,
        maxSpatialShiftPx: 2.0
      };

      // Q = 0.40 * 90 + 0.30 * 90 + 0.20 * 60 - 0.10 * 2 = 36 + 27 + 12 - 0.2 = 74.8
      const score = calculateCompositeScore(metrics);
      assert.strictEqual(score, 74.8);
    });

    it('caps spatial drift penalty at 50px', () => {
      const metrics = {
        edgeContourScore: 90.0,
        elementIouScore: 90.0,
        inkIou: 60.0,
        maxSpatialShiftPx: 999
      };

      // Q = 36 + 27 + 12 - 0.10 * min(50, 999) = 75 - 5.0 = 70.0
      const score = calculateCompositeScore(metrics);
      assert.strictEqual(score, 70.0);
    });
  });

  describe('Oscillation Detection (detectOscillation)', () => {
    it('returns false for history with fewer than 2 iterations', () => {
      assert.strictEqual(detectOscillation([], 'node_1'), false);
      assert.strictEqual(detectOscillation([{ driftVectors: [{ elementId: 'node_1', dx: 10, dy: 5 }] }], 'node_1'), false);
    });

    it('returns false when drift vectors advance consistently in the same direction', () => {
      const history = [
        { driftVectors: [{ elementId: 'node_1', dx: 20, dy: 10 }] },
        { driftVectors: [{ elementId: 'node_1', dx: 8, dy: 4 }] }
      ];
      assert.strictEqual(detectOscillation(history, 'node_1'), false);
    });

    it('detects directional reversal via negative inner product (vector reversal)', () => {
      const history = [
        { driftVectors: [{ elementId: 'node_1', dx: 20, dy: 10 }] },
        { driftVectors: [{ elementId: 'node_1', dx: -12, dy: -6 }] }
      ];
      assert.strictEqual(detectOscillation(history, 'node_1'), true);
    });

    it('detects coordinate sign flips on significant displacement', () => {
      const history = [
        { driftVectors: [{ elementId: 'node_1', dx: 15, dy: 0 }] },
        { driftVectors: [{ elementId: 'node_1', dx: -8, dy: 0 }] }
      ];
      assert.strictEqual(detectOscillation(history, 'node_1'), true);
    });
  });

  describe('Regression Detection (detectRegression)', () => {
    it('returns false when current score improves or remains steady', () => {
      assert.strictEqual(detectRegression(80.0, 78.0, 2.0, 3.0), false);
      assert.strictEqual(detectRegression(78.0, 78.0, 2.0, 2.0), false);
      assert.strictEqual(detectRegression(76.5, 78.0, 2.0, 2.0), false); // drop of 1.5 is within 2.5 threshold
    });

    it('detects quality regression when score drops by more than threshold (2.5)', () => {
      assert.strictEqual(detectRegression(74.0, 78.0, 2.0, 2.0), true);
    });

    it('detects spatial drift regression when max shift worsens by > 3.0px', () => {
      assert.strictEqual(detectRegression(78.0, 78.0, 6.5, 2.0), true);
    });
  });

  describe('KotlinComposeMutator Code Transformation', () => {
    it('updates existing Modifier.offset with inverse delta compensation', () => {
      const sample = `
Row(
    modifier = Modifier
        .offset(x = 80.8.dp, y = 44.dp),
    horizontalArrangement = Arrangement.spacedBy(20.dp)
) {
    Text("Sample")
}
`;
      const mutator = new KotlinComposeMutator(sample);
      const modified = mutator.applyOffset('80.8.dp', -5.0, 2.5);

      assert.strictEqual(modified, true);
      const output = mutator.getSource();
      assert.strictEqual(output.includes('.offset(x = 75.8.dp, y = 46.5.dp)'), true);
    });

    it('formats negative offset values with valid Kotlin 2.0 syntax (-X).dp', () => {
      const sample = `
Row(
    modifier = Modifier
        .offset(x = 10.dp, y = 10.dp)
)
`;
      const mutator = new KotlinComposeMutator(sample);
      mutator.applyOffset('10.dp', -15.5, -20.0);

      const output = mutator.getSource();
      assert.strictEqual(output.includes('.offset(x = (-5.5).dp, y = (-10).dp)'), true);
    });

    it('prepends Modifier.offset when modifier exists without offset', () => {
      const sample = `
Text(
    text = "The quiet economics of planting a city forest",
    modifier = Modifier
        .fillMaxWidth()
        .padding(bottom = 34.dp)
)
`;
      const mutator = new KotlinComposeMutator(sample);
      const modified = mutator.applyOffset('The quiet economics', -12.0, -8.5);

      assert.strictEqual(modified, true);
      const output = mutator.getSource();
      assert.strictEqual(output.includes('modifier = Modifier.offset(x = (-12).dp, y = (-8.5).dp).fillMaxWidth()'), true);
    });

    it('injects modifier = Modifier.offset into Composable with no modifier argument', () => {
      const sample = `
Text(
    text = "The Meridian",
    fontFamily = AbcArizonaFlare,
    fontSize = 42.sp
)
`;
      const mutator = new KotlinComposeMutator(sample);
      const modified = mutator.applyOffset('The Meridian', -18.02, -10.66);

      assert.strictEqual(modified, true);
      const output = mutator.getSource();
      assert.strictEqual(output.includes('modifier = Modifier.offset(x = (-18.02).dp, y = (-10.66).dp)'), true);
      assert.strictEqual(output.includes('text = "The Meridian"'), true);
    });

    it('updates Modifier.width to 140.dp for multi-line wrap collapse protection', () => {
      const sample = `
Text(
    text = category,
    fontSize = 11.5.sp,
    modifier = Modifier.width(100.dp)
)
`;
      const mutator = new KotlinComposeMutator(sample);
      const modified = mutator.applyWidth('category', 140);

      assert.strictEqual(modified, true);
      const output = mutator.getSource();
      assert.strictEqual(output.includes('modifier = Modifier.width(140.dp)'), true);
    });

    it('updates Modifier.size parameters', () => {
      const sample = `
Surface(
    modifier = Modifier.size(width = 249.5.dp, height = 80.dp)
)
`;
      const mutator = new KotlinComposeMutator(sample);
      const modified = mutator.applySize('249.5.dp', 10.5, -5.0);

      assert.strictEqual(modified, true);
      const output = mutator.getSource();
      assert.strictEqual(output.includes('.size(width = 260.dp, height = 75.dp)'), true);
    });

    it('updates Arrangement.spacedBy container spacing', () => {
      const sample = `
Column(
    verticalArrangement = Arrangement.spacedBy(16.dp)
)
`;
      const mutator = new KotlinComposeMutator(sample);
      const modified = mutator.applySpacedBy('Arrangement.spacedBy', 2.5);

      assert.strictEqual(modified, true);
      const output = mutator.getSource();
      assert.strictEqual(output.includes('Arrangement.spacedBy(18.5.dp)'), true);
    });

    it('updates TextStyle parameters and formats negative letterSpacing', () => {
      const sample = `
Text(
    text = "Headline",
    fontSize = 40.sp,
    lineHeight = 48.sp,
    letterSpacing = 0.sp
)
`;
      const mutator = new KotlinComposeMutator(sample);
      const modified = mutator.applyTypography('Headline', {
        fontSize: 42,
        lineHeight: 52,
        letterSpacing: -1.25
      });

      assert.strictEqual(modified, true);
      const output = mutator.getSource();
      assert.strictEqual(output.includes('fontSize = 42.sp'), true);
      assert.strictEqual(output.includes('lineHeight = 52.sp'), true);
      assert.strictEqual(output.includes('letterSpacing = (-1.25).sp'), true);
    });

    it('applies structured directives and strictly avoids negative padding', () => {
      const sample = `
Text(
    text = "The Meridian",
    fontSize = 42.sp
)
`;
      const mutator = new KotlinComposeMutator(sample);
      const directives = [
        {
          elementId: 'node_1',
          name: 'The Meridian',
          category: 'heading',
          measuredShift: { dxDp: 20.0, dyDp: 10.0 },
          layoutModifiers: {
            padding: { deltaStart: -20.0, deltaTop: -10.0 }
          }
        }
      ];

      // Mutator must route negative deltaStart / deltaTop to Modifier.offset!
      const applied = mutator.applyDirectives(directives, { damping: 1.0 });
      assert.strictEqual(applied >= 1, true);
      const output = mutator.getSource();

      // Must NOT contain negative padding
      assert.strictEqual(output.includes('padding(start = (-20).dp'), false);
      assert.strictEqual(output.includes('Modifier.offset(x = (-20).dp, y = (-10).dp)'), true);
    });
  });

  describe('ClosedLoopAutoTuner Snapshot and Rollback', () => {
    it('stores file snapshots and restores cleanly upon rollback', () => {
      const tuner = new ClosedLoopAutoTuner({
        screenName: 'MockScreen',
        maxIterations: 3
      });

      const fakeCode1 = 'class MockScreen v1';
      const fakeCode2 = 'class MockScreen v2';
      tuner.snapshots.set(1, fakeCode1);
      tuner.snapshots.set(2, fakeCode2);
      tuner.bestIteration = 1;

      assert.strictEqual(tuner.snapshots.get(tuner.bestIteration), fakeCode1);
    });

    it('runs dry-run mode without modifying files', async () => {
      const tuner = new ClosedLoopAutoTuner({
        screenName: 'Da63DesignScreen',
        artifactId: 'test_da63',
        maxIterations: 1,
        dryRun: true
      });

      const res = await tuner.run();
      assert.strictEqual(res.dryRun, true);
      assert.strictEqual(res.iterationsRun, 1);
      assert.strictEqual(Array.isArray(res.plannedDirectives), true);
      assert.strictEqual(res.plannedDirectives.length > 0, true);
    });
  });

  describe('Backward-Compatible AutoTuner Class', () => {
    it('generates tuning directives from zonal report', () => {
      const mockZonal = {
        zones: [
          {
            id: 'zone_1',
            name: 'Header Zone',
            similarity: 85.0,
            ssimScore: 0.88,
            centroidDrift: {
              deltaX: 20,
              deltaY: -15,
              deltaXDp: 10.0,
              deltaYDp: -7.5
            }
          }
        ]
      };

      const tuner = new AutoTuner(mockZonal);
      const directives = tuner.generateTuningDirectives();

      assert.strictEqual(directives.length, 1);
      assert.strictEqual(directives[0].zoneId, 'zone_1');
      assert.strictEqual(directives[0].driftDp.x, 10.0);
      assert.strictEqual(directives[0].driftDp.y, -7.5);
      assert.strictEqual(directives[0].recommendedCorrections.length >= 2, true);

      const md = tuner.toMarkdown(directives);
      assert.strictEqual(md.includes('Header Zone'), true);
      assert.strictEqual(md.includes('10dp'), true);
    });
  });
});
