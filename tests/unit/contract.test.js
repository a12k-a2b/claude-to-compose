/**
 * tests/unit/contract.test.js
 * Comprehensive unit test suite for 4-Layer Intermediate Representation & Contract Compiler.
 */

'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const Ajv = require('ajv/dist/2020');
const addFormats = require('ajv-formats');

const {
  createMeasuredNode,
  createMeasuredBundle,
  allocateSourceId,
  isValidSha256,
  inferNodeIntent,
  createLayoutIntentBundle,
  createBreakpointRules,
  normalizeSizing,
  normalizeInsets,
  resolveFlowType,
  clampConfidence,
  createBehaviorContract,
  validateStateGraph,
  validateTrigger,
  detectCircularLoops,
  normalizeSettleMs,
  SUPPORTED_EVENT_TYPES,
  SOL_OS_NEUTRAL_TOKENS,
  SOL_OS_BRAND_GRAYS,
  FORBIDDEN_EPD_PATTERNS,
  srgbToLinear,
  hexToRgb,
  relativeLuminance,
  contrastRatio,
  verifyContrast,
  detectColorCollision,
  assertNoEpdHooks,
  createDesignSystemContract,
  buildDesignContract,
  synthesizeLayers,
  validateContractAgainstSchemas,
  validateScreenId,
  checkDuplicateSourceIds,
  writeContractToDisk,
  computeSha256
} = require('../../src/contract');

const measuredSchema = require('../../src/contract/schemas/measured_scene.json');
const layoutSchema = require('../../src/contract/schemas/layout_intent.json');
const behaviorSchema = require('../../src/contract/schemas/behavior_contract.json');
const designSystemSchema = require('../../src/contract/schemas/design_system.json');
const receiptSchema = require('../../src/contract/schemas/contract_receipt.json');

const ajv = new Ajv({ strict: false });
addFormats(ajv);

describe('Schema Integrity (JSON Schema Draft 2020-12)', () => {
  it('compiles Layer 1 Measured Scene schema', () => {
    const validate = ajv.compile(measuredSchema);
    assert.strictEqual(typeof validate, 'function');
    assert.ok(measuredSchema.$schema.includes('2020-12'));
    assert.strictEqual(measuredSchema.title, 'MeasuredSceneBundle');
  });

  it('compiles Layer 2 Layout Intent schema', () => {
    const validate = ajv.compile(layoutSchema);
    assert.strictEqual(typeof validate, 'function');
    assert.ok(layoutSchema.$schema.includes('2020-12'));
    assert.strictEqual(layoutSchema.title, 'LayoutIntentSpecification');
  });

  it('compiles Layer 3 Behavior Contract schema', () => {
    const validate = ajv.compile(behaviorSchema);
    assert.strictEqual(typeof validate, 'function');
    assert.ok(behaviorSchema.$schema.includes('2020-12'));
    assert.strictEqual(behaviorSchema.title, 'BehaviorContractSpecification');
  });

  it('compiles Layer 4 Design System schema', () => {
    const validate = ajv.compile(designSystemSchema);
    assert.strictEqual(typeof validate, 'function');
    assert.ok(designSystemSchema.$schema.includes('2020-12'));
    assert.strictEqual(designSystemSchema.title, 'DesignSystemContract');
  });

  it('compiles Contract Receipt schema', () => {
    const validate = ajv.compile(receiptSchema);
    assert.strictEqual(typeof validate, 'function');
    assert.ok(receiptSchema.$schema.includes('2020-12'));
    assert.strictEqual(receiptSchema.title, 'ContractReceipt');
  });
});

describe('Layer 1: Measured Scene (Physical Facts)', () => {
  it('preserves exact coordinates and paint bounds', () => {
    const node = createMeasuredNode({
      sourceId: 'daylight#note/title',
      bounds: { x: 32.5, y: 64.0, width: 1120.0, height: 80.0 },
      paintBounds: { left: 28.0, top: 60.0, right: 1156.0, bottom: 148.0 }
    });
    assert.strictEqual(node.bounds.x, 32.5);
    assert.strictEqual(node.paintBounds.right, 1156.0);
    assert.strictEqual(node.boundsDp.x, 16.25);
  });

  it('handles zero dimensions and negative offscreen coordinates', () => {
    const zeroNode = createMeasuredNode({ sourceId: 'zero', bounds: { x: 0, y: 0, width: 0, height: 0 } });
    assert.strictEqual(zeroNode.bounds.width, 0);
    assert.strictEqual(zeroNode.bounds.height, 0);

    const negNode = createMeasuredNode({ sourceId: 'neg', bounds: { x: -250, y: -50, width: 250, height: 500 } });
    assert.strictEqual(negNode.bounds.x, -250);
    assert.strictEqual(negNode.bounds.y, -50);
  });

  it('records paint order, stacking context, and z-index', () => {
    const node = createMeasuredNode({
      sourceId: 'daylight#fab',
      paintOrder: 42,
      zIndex: 100,
      stackingContext: { isRoot: true, zIndex: 100, reason: 'fixed positioning' }
    });
    assert.strictEqual(node.paintOrder, 42);
    assert.strictEqual(node.zIndex, 100);
    assert.strictEqual(node.stackingContext.isRoot, true);
  });

  it('handles empty text content and formats baselines', () => {
    const node = createMeasuredNode({
      sourceId: 'daylight#empty_text',
      textRuns: [{ content: '', fontFamily: 'ABC Arizona Flare', fontSizePx: 16 }]
    });
    assert.strictEqual(node.textRuns[0].content, '');
    assert.strictEqual(node.textRuns[0].fontFamily, 'ABC Arizona Flare');
    assert.ok(typeof node.baselines.alphabeticBaselineY === 'number');
  });

  it('allocates stable sourceId deterministically using 5-tier strategy', () => {
    const el1 = { getAttribute: attr => (attr === 'data-testid' ? 'save_button' : null), tag: 'button' };
    assert.strictEqual(allocateSourceId(el1, 'root', {}, 'screen1'), 'root/button#save_button');

    const el2 = { id: 'header_nav', tag: 'nav' };
    assert.strictEqual(allocateSourceId(el2, 'root', {}, 'screen1'), 'root/nav#header_nav');

    const el3 = { role: 'toolbar', tag: 'div' };
    assert.strictEqual(allocateSourceId(el3, 'root', {}, 'screen1'), 'root/toolbar');

    const el4 = { tag: 'p' };
    const ctx = {};
    assert.strictEqual(allocateSourceId(el4, 'root', ctx, 'screen1'), 'root/p');
    assert.strictEqual(allocateSourceId(el4, 'root', ctx, 'screen1'), 'root/p:nth-child(2)');
  });

  it('validates SHA-256 regex format', () => {
    assert.strictEqual(isValidSha256('sha256:7f83b1657ff1fc53b92dc18148a1d65dfc2d4b1fa3d677284addd200126d9069'), true);
    assert.strictEqual(isValidSha256('sha256:abc123short'), false);
    assert.strictEqual(isValidSha256('invalid_prefix'), false);
  });
});

describe('Layer 2: Inferred Layout Intent (Constraints & Topology)', () => {
  it('infers FILL_PARENT sizing across multi-viewport width expansion', () => {
    const intent = inferNodeIntent({
      sourceId: 'daylight#card',
      measuredWidthAcrossViewports: [1120, 1520]
    });
    assert.strictEqual(intent.sizing.widthMode, 'FILL_PARENT');
    assert.strictEqual(intent.confidence, 0.98);
  });

  it('infers FIXED sizing when width remains constant across viewports', () => {
    const intent = inferNodeIntent({
      sourceId: 'daylight#avatar',
      measuredWidthAcrossViewports: [80, 80]
    });
    assert.strictEqual(intent.sizing.widthMode, 'FIXED');
    assert.strictEqual(intent.sizing.fixedWidthDp, 40);
  });

  it('infers INTRINSIC_WRAP for text elements with constant width', () => {
    const intent = inferNodeIntent({
      sourceId: 'daylight#badge_text',
      category: 'chip',
      measuredWidthAcrossViewports: [140, 140]
    });
    assert.strictEqual(intent.sizing.widthMode, 'INTRINSIC_WRAP');
  });

  it('normalizes contradictory sizing definitions and clamps negative insets', () => {
    const norm = normalizeSizing({ widthMode: 'FILL_PARENT', fixedWidthDp: 200 });
    assert.strictEqual(norm.widthMode, 'FILL_PARENT');
    assert.strictEqual(norm.fixedWidthDp, undefined);

    const insets = normalizeInsets({ paddingDp: { top: -15, left: 10 } });
    assert.strictEqual(insets.paddingDp.top, 0);
    assert.strictEqual(insets.paddingDp.left, 10);
  });

  it('resolves flow types with safe fallback to COLUMN', () => {
    assert.strictEqual(resolveFlowType('row'), 'ROW');
    assert.strictEqual(resolveFlowType('grid'), 'GRID');
    assert.strictEqual(resolveFlowType('NON_EXISTENT_FLOW'), 'COLUMN');
  });

  it('creates multi-viewport breakpoint rules for DC1', () => {
    const rules = createBreakpointRules({
      portrait: { flowOverride: 'COLUMN', visibility: 'VISIBLE' },
      landscape: { flowOverride: 'ROW', visibility: 'VISIBLE' }
    });
    assert.strictEqual(rules.daylightPortrait.flowOverride, 'COLUMN');
    assert.strictEqual(rules.daylightLandscape.flowOverride, 'ROW');
  });
});

describe('Layer 3: Behavior Contract (State Machines & Gestures)', () => {
  it('constructs behavior contract with state variables and transitions', () => {
    const contract = createBehaviorContract({
      screenId: 'note_editor',
      stateVariables: [
        { name: 'noteBody', type: 'String', defaultValue: '', isHoisted: true, preservationRequired: true }
      ],
      transitions: [
        {
          fromState: 'DEFAULT',
          toState: 'EDITING',
          triggerEvent: { eventType: 'FOCUS', targetSourceId: 'body_input' },
          appAction: { actionName: 'startEditing' }
        }
      ]
    });
    assert.strictEqual(contract.version, '2.0.0');
    assert.strictEqual(contract.stateVariables[0].name, 'noteBody');
    assert.strictEqual(contract.transitions[0].toState, 'EDITING');
    assert.strictEqual(contract.targetDisplay.settleStandardMs, 150);
    assert.strictEqual(contract.targetDisplay.zeroEpdWaveforms, true);
  });

  it('validates state graph, rejecting transitions with non-existent states', () => {
    assert.throws(() => {
      validateStateGraph({
        namedStates: [{ stateId: 'STATE_A' }],
        transitions: [{ fromState: 'STATE_A', toState: 'MISSING_STATE' }]
      });
    }, /not found/i);
  });

  it('validates trigger event targetSourceId requirement', () => {
    assert.throws(() => {
      validateTrigger({ eventType: 'TAP' });
    }, /targetSourceId required/i);
  });

  it('detects circular unguarded transition loops', () => {
    const loop = detectCircularLoops({
      transitions: [
        { fromState: 'A', toState: 'B' },
        { fromState: 'B', toState: 'A' }
      ]
    });
    assert.strictEqual(loop.hasUnguardedCycle, true);
  });

  it('normalizes settle times to 150ms DC1 LivePaper standard', () => {
    assert.strictEqual(normalizeSettleMs(-200), 150);
    assert.strictEqual(normalizeSettleMs(8000), 150);
    assert.strictEqual(normalizeSettleMs(150), 150);
    assert.strictEqual(normalizeSettleMs(null), 150);
  });
});

describe('Layer 4: Design System (Sol:OS Grayscale & LivePaper)', () => {
  it('contains official Sol:OS neutral scale (--os-0 to --os-1000)', () => {
    assert.strictEqual(SOL_OS_NEUTRAL_TOKENS['--os-0'].hex, '#FFFFFF');
    assert.strictEqual(SOL_OS_NEUTRAL_TOKENS['--os-50'].hex, '#F7F7F7');
    assert.strictEqual(SOL_OS_NEUTRAL_TOKENS['--os-400'].hex, '#535353');
    assert.strictEqual(SOL_OS_NEUTRAL_TOKENS['--os-900'].hex, '#1A1A1A');
    assert.strictEqual(SOL_OS_NEUTRAL_TOKENS['--os-1000'].hex, '#000000');
  });

  it('contains calibrated brand grays', () => {
    assert.strictEqual(SOL_OS_BRAND_GRAYS.Yellow.hex, '#CECECE');
    assert.strictEqual(SOL_OS_BRAND_GRAYS.Amber.hex, '#9D9D9E');
    assert.strictEqual(SOL_OS_BRAND_GRAYS.Orange.hex, '#6C6C6D');
  });

  it('calculates WCAG contrast ratio accurately', () => {
    const whiteOnWhite = contrastRatio('#FFFFFF', '#FFFFFF');
    assert.strictEqual(whiteOnWhite, 1.0);

    const blackOnWhite = contrastRatio('#000000', '#FFFFFF');
    assert.ok(Math.abs(blackOnWhite - 21.0) < 0.1);

    const os900OnWhite = contrastRatio(SOL_OS_NEUTRAL_TOKENS['--os-900'].hex, '#FFFFFF');
    assert.ok(os900OnWhite >= 7.0, `Primary text must meet AAA (>= 7.0:1), got ${os900OnWhite}`);

    const os400OnWhite = contrastRatio(SOL_OS_NEUTRAL_TOKENS['--os-400'].hex, '#FFFFFF');
    assert.ok(os400OnWhite >= 4.5, `Secondary text must meet AA (>= 4.5:1), got ${os400OnWhite}`);
  });

  it('detects color collisions for low-delta surfaces', () => {
    const collision = detectColorCollision('#FFFFFF', '#F7F7F7');
    assert.strictEqual(collision.collision, true);
    assert.strictEqual(collision.requiresHairlineBorder, true);
    assert.strictEqual(collision.recommendedBorderToken, '--os-100');
  });

  it('vetoes forbidden EPD waveforms and refresh hooks', () => {
    assert.throws(() => {
      assertNoEpdHooks('val intent = Intent("android.intent.action.ACTION_REFRESH_SCREEN")');
    }, /EPD workaround violation/i);
    assert.strictEqual(assertNoEpdHooks('val smoothColor = Color(0xFF1A1A1A)'), true);
  });
});

describe('Design Contract Compiler & Packaging', () => {
  it('synthesizes all 4 layers from evidence bundle', () => {
    const contract = synthesizeLayers({
      screenId: 'test_screen',
      evidence: {
        domNodes: [
          { id: 'h1', tag: 'h1', bounds: { x: 20, y: 40, width: 800, height: 60 } }
        ]
      }
    });

    assert.ok(contract.measuredScenes);
    assert.ok(contract.layoutIntent);
    assert.ok(contract.behaviorContract);
    assert.ok(contract.designSystem);
    assert.strictEqual(contract.screenId, 'test_screen');
  });

  it('validates synthesized contract against schemas', () => {
    const contract = synthesizeLayers({ screenId: 'valid_screen' });
    const validation = validateContractAgainstSchemas(contract);
    assert.strictEqual(validation.valid, true);
    assert.strictEqual(validation.errors.length, 0);
  });

  it('rejects duplicate sourceId definitions', () => {
    assert.throws(() => {
      checkDuplicateSourceIds([
        { sourceId: 'daylight#dup' },
        { sourceId: 'daylight#dup' }
      ]);
    }, /duplicate sourceid/i);
  });

  it('rejects duplicate sourceId definitions across scenes', () => {
    assert.throws(() => {
      checkDuplicateSourceIds({
        scenes: {
          portrait: {
            rootNode: {
              sourceId: 'root',
              children: [
                { sourceId: 'child_1' },
                { sourceId: 'child_1' }
              ]
            }
          }
        }
      });
    }, /duplicate sourceid/i);
  });

  it('handles circular node references gracefully without stack overflow', () => {
    const parent = { sourceId: 'parent', children: [] };
    const child = { sourceId: 'child', children: [parent] };
    parent.children.push(child);

    // createMeasuredNode must not throw Maximum call stack size exceeded
    assert.doesNotThrow(() => {
      createMeasuredNode(parent);
    });

    // checkDuplicateSourceIds must not throw Maximum call stack size exceeded
    assert.doesNotThrow(() => {
      checkDuplicateSourceIds(parent);
    });

    // inferNodeIntent must not throw Maximum call stack size exceeded
    assert.doesNotThrow(() => {
      inferNodeIntent({
        sourceId: 'parent',
        category: 'container',
        children: [child]
      });
    });
  });

  it('sanitizes negative dimensions and non-finite numbers in Layer 1 and Layer 2', () => {
    const node = createMeasuredNode({
      sourceId: 'neg_bounds',
      bounds: { x: -10, y: -20, width: -100, height: -50 }
    });
    assert.strictEqual(node.bounds.x, -10);
    assert.strictEqual(node.bounds.y, -20);
    assert.strictEqual(node.bounds.width, 0);
    assert.strictEqual(node.bounds.height, 0);

    const intent = inferNodeIntent({
      sourceId: 'inf_bounds',
      measuredWidthAcrossViewports: [Infinity, NaN]
    });
    assert.ok(intent);
    assert.ok(Number.isFinite(intent.sizing.minWidthDp) || intent.sizing.minWidthDp === undefined);
  });

  it('fails contract receipt with status FAIL when contrast violation is present (NC-05)', () => {
    const tmpDir = path.join(os.tmpdir(), `ctc_contrast_fail_${Date.now()}`);
    const evidence = {
      screenId: 'bad_contrast',
      domNodes: [{
        sourceId: 'daylight#bad_contrast/low_text',
        tag: 'p',
        textRuns: [{
          content: 'Unreadable faint text',
          fontSizePx: 14,
          fontWeight: 400,
          colorHex: '#CCCCCC' // --os-200 on #FFFFFF (1.61:1 < 7.0:1 AAA)
        }]
      }]
    };

    const res = buildDesignContract('bad_contrast', evidence, { outputDir: tmpDir });
    assert.strictEqual(res.receipt.status, 'FAIL');
    assert.strictEqual(res.receipt.compliance.wcagContrastPassed, false);
    assert.ok(res.receipt.errors.length > 0);
    assert.match(res.receipt.errors[0], /contrast/i);

    // In strict mode, must reject with CONTRAST_VIOLATION
    assert.throws(() => {
      buildDesignContract('bad_contrast', evidence, { outputDir: tmpDir, strict: true });
    }, err => err.code === 'CONTRAST_VIOLATION');

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('fails contract receipt with status FAIL and rejects EPD waveform clear hooks (NC-06)', () => {
    const tmpDir = path.join(os.tmpdir(), `ctc_epd_fail_${Date.now()}`);
    const evidenceWithEpd = {
      screenId: 'epd_screen',
      transitions: [{
        fromState: 'IDLE',
        toState: 'REFRESHED',
        triggerEvent: { eventType: 'TAP', targetSourceId: 'daylight#root/btn' },
        appAction: { actionName: 'ACTION_REFRESH_SCREEN', script: 'particle_refresh()' }
      }]
    };

    // Expanded forbidden patterns test
    assert.ok(FORBIDDEN_EPD_PATTERNS.includes('particle_refresh'));
    assert.ok(FORBIDDEN_EPD_PATTERNS.includes('Thread.sleep'));

    assert.throws(() => {
      createBehaviorContract({ ...evidenceWithEpd, strict: true });
    }, err => err.code === 'EPD_WORKAROUND_VIOLATION');

    const res = buildDesignContract('epd_screen', evidenceWithEpd, { outputDir: tmpDir, strict: false });
    assert.strictEqual(res.receipt.status, 'FAIL');
    assert.strictEqual(res.receipt.compliance.zeroEpdWaveformsConfirmed, false);
    assert.strictEqual(res.success, false);
    assert.ok(res.receipt.errors.some(e => e.includes('EPD')));

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('certifies genuine schemaValid per layer and fails receipt status when schema validation fails', () => {
    const invalidEvidence = {
      screenId: 'test_invalid_schema',
      scenes: { portrait: { viewport: { widthPx: -100, heightPx: -200, orientation: 'portrait' } } }
    };
    const res = buildDesignContract('test_invalid_schema', invalidEvidence, { strict: false });
    assert.strictEqual(res.validation.valid, false);
    assert.strictEqual(res.receipt.status, 'FAIL');
    assert.strictEqual(res.receipt.layers.layer1_measured.schemaValid, false);
    assert.strictEqual(res.success, false);
    assert.ok(res.receipt.errors.some(e => e.includes('Schema validation failure')));
  });

  it('ingests evidence from directory with scenes/ layout without evidence.json', () => {
    const tmpDir = path.join(os.tmpdir(), `ctc_scenes_dir_${Date.now()}`);
    const evDir = path.join(tmpDir, 'evidence');
    const contractDir = path.join(tmpDir, 'contract');
    fs.mkdirSync(path.join(evDir, 'scenes'), { recursive: true });

    fs.writeFileSync(path.join(evDir, 'scenes', 'daylight_portrait.json'), JSON.stringify({
      viewport: { widthPx: 1184, heightPx: 1584, orientation: 'portrait' },
      rootNode: { domTag: 'div', bounds: { x: 0, y: 0, width: 1184, height: 1584 } }
    }));

    const compiled = buildDesignContract('dir_screen', evDir, { outputDir: contractDir });
    assert.ok(compiled);
    assert.strictEqual(compiled.receipt.status, 'PASS');
    assert.ok(fs.existsSync(path.join(contractDir, 'measured-scenes.json')));
    assert.ok(fs.existsSync(path.join(contractDir, 'contract-receipt.json')));

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('writes contract files and receipt to output directory', () => {
    const tmpDir = path.join(os.tmpdir(), `ctc_contract_test_${Date.now()}`);
    const contract = synthesizeLayers({ screenId: 'writer_test' });

    const result = writeContractToDisk(contract, tmpDir);
    assert.ok(fs.existsSync(path.join(tmpDir, 'measured-scenes.json')));
    assert.ok(fs.existsSync(path.join(tmpDir, 'layout-intent.json')));
    assert.ok(fs.existsSync(path.join(tmpDir, 'behavior-contract.json')));
    assert.ok(fs.existsSync(path.join(tmpDir, 'design-system.json')));
    assert.ok(fs.existsSync(path.join(tmpDir, 'contract-receipt.json')));
    assert.strictEqual(result.receipt.status, 'PASS');

    // Clean up
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });
});
