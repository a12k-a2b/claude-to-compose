/**
 * tests/unit/drift_resolver.test.js
 *
 * Comprehensive Unit Test Suite for Spatial Drift Vector & Coordinate Resolver (Feature F6).
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');

const {
  DriftResolver,
  resolveDrift,
  formatDp,
  formatSp
} = require('../../verification/drift_resolver');

describe('DriftResolver Unit Tests (Feature F6)', () => {

  describe('Utility Formatting Functions', () => {
    it('formats positive and zero dp and sp values cleanly', () => {
      assert.equal(formatDp(16), '16.dp');
      assert.equal(formatDp(0), '0.dp');
      assert.equal(formatDp(24.5), '24.5.dp');
      assert.equal(formatSp(14), '14.sp');
      assert.equal(formatSp(0), '0.sp');
      assert.equal(formatSp(18.75), '18.75.sp');
    });

    it('formats negative dp and sp values with parentheses for Kotlin syntax validity', () => {
      assert.equal(formatDp(-12), '(-12).dp');
      assert.equal(formatDp(-18.02), '(-18.02).dp');
      assert.equal(formatSp(-1.36), '(-1.36).sp');
      assert.equal(formatSp(-2.61), '(-2.61).sp');
    });
  });

  describe('Translation Vector Resolution (Scale S = 2.0)', () => {
    it('resolves floating overlays to Modifier.offset with inverse compensation', () => {
      const resolver = new DriftResolver({ scale: 2.0, toleranceDp: 0.5 });
      const mockVector = {
        elementId: 'pill_nav_1',
        name: 'Active Pen Pill',
        category: 'pill',
        dx: 20.0,   // Rendered 20px (10dp) too far right
        dy: -10.0,  // Rendered 10px (5dp) too far up
        dWidth: 0,
        dHeight: 0,
        shiftMagnitude: 22.36,
        status: 'DRIFTED',
        passed: false
      };

      const directive = resolver.resolveElementDirective(mockVector, null);

      assert.equal(directive.elementId, 'pill_nav_1');
      assert.equal(directive.category, 'pill');
      assert.equal(directive.measuredShift.dxDp, 10.0);
      assert.equal(directive.measuredShift.dyDp, -5.0);

      // Inverse compensation: shift left by 10dp, shift down by 5dp
      assert.ok(directive.layoutModifiers.offset, 'Expected offset modifier for floating pill');
      assert.equal(directive.layoutModifiers.offset.deltaX, -10.0);
      assert.equal(directive.layoutModifiers.offset.deltaY, 5.0);
      assert.equal(
        directive.layoutModifiers.offset.snippet,
        'Modifier.offset(x = (-10).dp, y = 5.dp)'
      );
    });

    it('resolves in-flow elements to Modifier.padding with inverse compensation', () => {
      const resolver = new DriftResolver({ scale: 2.0, toleranceDp: 0.5 });
      const mockVector = {
        elementId: 'heading_title',
        name: 'The Meridian',
        category: 'heading',
        dx: 40.0,   // Rendered 40px (20dp) too far right
        dy: 30.0,   // Rendered 30px (15dp) too far down
        dWidth: 0,
        dHeight: 0,
        shiftMagnitude: 50.0,
        status: 'DRIFTED',
        passed: false
      };

      const directive = resolver.resolveElementDirective(mockVector, null);

      assert.equal(directive.category, 'heading');
      assert.equal(directive.measuredShift.dxDp, 20.0);
      assert.equal(directive.measuredShift.dyDp, 15.0);

      // Inverse compensation: reduce start by 20dp, reduce top by 15dp
      assert.ok(directive.layoutModifiers.padding, 'Expected padding modifier for in-flow heading');
      assert.equal(directive.layoutModifiers.padding.deltaStart, -20.0);
      assert.equal(directive.layoutModifiers.padding.deltaTop, -15.0);
      assert.equal(
        directive.layoutModifiers.padding.snippet,
        'Modifier.padding(start = (-20).dp, top = (-15).dp)'
      );
    });

    it('supports custom scale factor (e.g. S = 3.0 for xxxhdpi)', () => {
      const resolver = new DriftResolver({ scale: 3.0 });
      const mockVector = {
        elementId: 'icon_btn',
        category: 'overlay',
        dx: 30.0,
        dy: 60.0
      };

      const directive = resolver.resolveElementDirective(mockVector, null);
      assert.equal(directive.measuredShift.dxDp, 10.0);
      assert.equal(directive.measuredShift.dyDp, 20.0);
      assert.equal(directive.layoutModifiers.offset.deltaX, -10.0);
      assert.equal(directive.layoutModifiers.offset.deltaY, -20.0);
    });
  });

  describe('Dimension Vector Resolution (Modifier.size & width unwrapping)', () => {
    it('generates Modifier.size adjustments when element dimensions deviate', () => {
      const resolver = new DriftResolver({ scale: 2.0 });
      const mockVector = {
        elementId: 'card_box',
        category: 'box',
        dx: 0,
        dy: 0,
        dWidth: 40,   // Rendered 40px (20dp) too wide
        dHeight: -20  // Rendered 20px (10dp) too short
      };

      const directive = resolver.resolveElementDirective(mockVector, null);
      assert.ok(directive.layoutModifiers.size);
      assert.equal(directive.layoutModifiers.size.adjustWidthDp, -20.0);
      assert.equal(directive.layoutModifiers.size.adjustHeightDp, 10.0);
      assert.equal(
        directive.layoutModifiers.size.snippet,
        'Modifier.size(width = (-20).dp, height = 10.dp)'
      );
    });

    it('detects category label multi-line wrap collapse and resolves Modifier.width(140.dp)', () => {
      const resolver = new DriftResolver({ scale: 2.0 });
      const mockVector = {
        elementId: 'category_label_3',
        name: 'Beyond the bar category',
        category: 'text',
        text: 'BEYOND THE BAR',
        dx: 0,
        dy: 100,
        dWidth: -30,  // Compressed width
        dHeight: 36   // Height expanded due to line wrap (from 18px to 36px)
      };

      const directive = resolver.resolveElementDirective(mockVector, null);
      assert.ok(directive.layoutModifiers.width);
      assert.equal(directive.layoutModifiers.width.reason, 'multi_line_wrap_prevention');
      assert.ok(directive.layoutModifiers.width.widthDp >= 140);
      assert.equal(directive.layoutModifiers.width.snippet, 'Modifier.width(143.dp)');
    });
  });

  describe('Typography Normalization Directives', () => {
    it('synthesizes exact TextStyle parameters from design spec', () => {
      const resolver = new DriftResolver({ scale: 2.0 });
      const mockVector = {
        elementId: 'headline_node',
        category: 'heading',
        dx: 0,
        dy: 0,
        dWidth: 0,
        dHeight: 0
      };

      const mockSpecNode = {
        id: 'headline_node',
        text: {
          fontSize: 58,
          lineHeight: 63.8,
          letterSpacing: -2.61,
          fontFamily: 'ABC Arizona Flare'
        }
      };

      const directive = resolver.resolveElementDirective(mockVector, mockSpecNode);
      assert.ok(directive.typography);
      assert.equal(directive.typography.fontSize, '58sp');
      assert.equal(directive.typography.lineHeight, '63.8sp');
      assert.equal(directive.typography.letterSpacing, '-2.61sp');
      assert.equal(directive.typography.includeFontPadding, false);
      assert.ok(directive.typography.snippet.includes('fontSize = 58.sp'));
      assert.ok(directive.typography.snippet.includes('lineHeight = 63.8.sp'));
      assert.ok(directive.typography.snippet.includes('letterSpacing = (-2.61).sp'));
      assert.ok(directive.typography.snippet.includes('platformStyle = BasePlatformTextStyle'));
      assert.ok(directive.typography.snippet.includes('lineHeightStyle = BaseLineHeightStyle'));
    });
  });

  describe('Container Spacing Delta Resolution', () => {
    it('detects cumulative vertical drift across sibling list items and emits Arrangement.spacedBy', () => {
      const resolver = new DriftResolver({ scale: 2.0 });
      const mockVectors = [
        { elementId: 'row_0', category: 'pill_row', dyDp: 0.0 },
        { elementId: 'row_1', category: 'pill_row', dyDp: 4.0 },
        { elementId: 'row_2', category: 'pill_row', dyDp: 8.0 },
        { elementId: 'row_3', category: 'pill_row', dyDp: 12.0 }
      ];

      const directives = resolver.resolveContainerSpacing(mockVectors, new Map());
      assert.equal(directives.length, 1);
      assert.equal(directives[0].category, 'pill_row');
      assert.equal(directives[0].driftStepDp, 4.0);
      assert.equal(directives[0].compensationGapDp, -4.0);
      assert.equal(
        directives[0].layoutModifiers.spacedBy.snippet,
        'verticalArrangement = Arrangement.spacedBy((-4).dp)'
      );
    });
  });

  describe('Functional API: resolveDrift(driftVectors, elementBboxes, options)', () => {
    it('executes functional interface matching DISPATCH contract', () => {
      const vectors = [
        {
          elementId: 'masthead',
          name: 'The Meridian',
          category: 'heading',
          dx: 20.0,
          dy: 10.0,
          shiftMagnitude: 22.36,
          status: 'DRIFTED'
        }
      ];

      const specElements = [
        {
          id: 'masthead',
          text: {
            fontSize: 34,
            lineHeight: 51,
            letterSpacing: -1.36
          }
        }
      ];

      const plan = resolveDrift(vectors, specElements, { scale: 2.0 });
      assert.equal(plan.summary.totalEvaluated, 1);
      assert.equal(plan.summary.driftedCount, 1);
      assert.equal(plan.directives.length, 1);

      const d = plan.directives[0];
      assert.equal(d.elementId, 'masthead');
      assert.equal(d.measuredShift.dxDp, 10.0);
      assert.equal(d.measuredShift.dyDp, 5.0);
      assert.equal(d.layoutModifiers.padding.snippet, 'Modifier.padding(start = (-10).dp, top = (-5).dp)');
      assert.ok(d.typography.snippet.includes('letterSpacing = (-1.36).sp'));
    });
  });

  describe('End-to-End Resolution on Real Artifacts with Deterministic Fixtures', () => {
    it('resolves real drift vectors from deterministic da63 fixture', () => {
      const zonalPath = path.resolve(__dirname, '../fixtures/drift/da63_drift_sample.json');
      const specPath = path.resolve(__dirname, '../fixtures/drift/da63_spec_sample.json');

      const zonalData = JSON.parse(fs.readFileSync(zonalPath, 'utf-8'));
      const specData = JSON.parse(fs.readFileSync(specPath, 'utf-8'));

      const resolver = new DriftResolver();
      const plan = resolver.resolve(zonalData, specData);

      assert.ok(plan.summary.totalEvaluated > 0);
      assert.ok(plan.directives.length > 0);

      // Verify node_1 ("The Meridian") is resolved
      const meridianDirective = plan.directives.find(d => d.elementId === 'node_1');
      assert.ok(meridianDirective, 'node_1 should be in directives');
      assert.equal(meridianDirective.category, 'heading');
      assert.ok(meridianDirective.layoutModifiers.padding);
      assert.ok(meridianDirective.typography);
      assert.equal(meridianDirective.typography.fontSize, '34sp');
      assert.equal(meridianDirective.typography.letterSpacing, '-1.36sp');
    });

    it('resolves real drift vectors from deterministic e34f fixture', () => {
      const zonalPath = path.resolve(__dirname, '../fixtures/drift/e34f_drift_sample.json');
      const specPath = path.resolve(__dirname, '../fixtures/drift/e34f_spec_sample.json');

      const zonalData = JSON.parse(fs.readFileSync(zonalPath, 'utf-8'));
      const specData = JSON.parse(fs.readFileSync(specPath, 'utf-8'));

      const resolver = new DriftResolver();
      const plan = resolver.resolve(zonalData, specData);

      assert.ok(plan.summary.totalEvaluated > 0);
      assert.ok(plan.directives.length > 0);

      // Verify node_2 ("A sheet of glass") is resolved
      const glassDirective = plan.directives.find(d => d.elementId === 'node_2');
      assert.ok(glassDirective, 'node_2 should be in directives');
      assert.ok(glassDirective.typography);
      assert.equal(glassDirective.typography.fontSize, '76sp');
      assert.equal(glassDirective.typography.letterSpacing, '-3.8sp');
    });

    it('gracefully classifies aligned elements as zero-drift without directives', () => {
      const alignedZonal = {
        canvas: { width: 2880, height: 1720 },
        driftVectors: [
          {
            elementId: 'node_1',
            name: 'The Meridian',
            category: 'heading',
            dx: 0,
            dy: 0,
            dxDp: 0,
            dyDp: 0,
            shiftMagnitude: 0,
            status: 'ALIGNED',
            passed: true
          }
        ]
      };
      const specPath = path.resolve(__dirname, '../fixtures/drift/da63_spec_sample.json');
      const specData = JSON.parse(fs.readFileSync(specPath, 'utf-8'));

      const resolver = new DriftResolver();
      const plan = resolver.resolve(alignedZonal, specData);
      assert.equal(plan.summary.totalEvaluated, 1);
      assert.equal(plan.summary.alignedCount, 1);
      assert.equal(plan.summary.driftedCount, 0);
      assert.equal(plan.directives.length, 0);
    });
  });

});
