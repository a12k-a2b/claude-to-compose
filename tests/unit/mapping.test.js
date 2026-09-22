/**
 * tests/unit/mapping.test.js
 *
 * Unit test suite for Semantic Correspondence Engine (src/mapping/)
 */

'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert');
const Ajv = require('ajv/dist/2020');

const {
  generateCorrespondenceMap,
  scoreCandidateMapping,
  classifyMappingConfidence,
  detectDuplicateTargets
} = require('../../src/mapping/mapper');

const {
  tokenizeIdentifier,
  computeTokenOverlap,
  computeTagScore,
  computeRoleScore,
  computeBehaviorScore,
  computeTopologyScore,
  computeTextScore,
  WEIGHTS
} = require('../../src/mapping/multi_signal_scorer');

const { classifyCategory, CATEGORIES } = require('../../src/mapping/categorizer');
const { extractAlternativeCandidates, CONFIDENCE_LEVELS } = require('../../src/mapping/ambiguity_resolver');
const { buildPreservationObligations } = require('../../src/mapping/invariant_tracker');

const correspondenceSchema = require('../../src/mapping/schemas/correspondence_map.json');

describe('Multi-Signal Scorer Unit Tests', () => {
  it('tokenizes identifiers and expands standard abbreviations', () => {
    const tokens = tokenizeIdentifier('daylight#note_editor/toolbar/back_btn');
    assert.ok(tokens.includes('note'));
    assert.ok(tokens.includes('editor'));
    assert.ok(tokens.includes('toolbar'));
    assert.ok(tokens.includes('back'));
    assert.ok(tokens.includes('button'), 'btn must be expanded to button');
  });

  it('computes Jaccard token overlap correctly', () => {
    const overlap = computeTokenOverlap(['note', 'editor', 'back', 'button'], ['editor', 'back', 'button']);
    assert.strictEqual(overlap, 3 / 4);
    assert.strictEqual(computeTokenOverlap([], ['button']), 0.0);
  });

  it('computes tag score with exact match returning 1.0', () => {
    const score = computeTagScore(
      { sourceId: 'daylight#editor/back_btn' },
      { testTag: 'daylight#editor/back_btn' }
    );
    assert.strictEqual(score, 1.0);
  });

  it('computes tag score with token overlap and synonym expansion', () => {
    const score = computeTagScore(
      { sourceId: 'daylight#note_editor/toolbar/back_btn' },
      { testTag: 'editor_back_button' }
    );
    assert.ok(score >= 0.75, `Expected score >= 0.75, got ${score}`);
  });

  it('computes role score for matching button widgets', () => {
    const score = computeRoleScore(
      { semantics: { role: 'Button' } },
      { composableName: 'IconButton', targetType: 'COMPOSABLE_FUNCTION' }
    );
    assert.strictEqual(score, 1.0);
  });

  it('computes role score for text fields and inputs', () => {
    const score = computeRoleScore(
      { category: 'textbox', semantics: { role: 'input' } },
      { composableName: 'OutlinedTextField' }
    );
    assert.strictEqual(score, 1.0);
  });

  it('computes behavior score for matching back navigation lambda', () => {
    const score = computeBehaviorScore(
      { sourceId: 'daylight#editor/back_button', semantics: { isInteractive: true } },
      { name: 'onNavigateBack', isLambda: true }
    );
    assert.strictEqual(score, 1.0);
  });

  it('computes topology score for root screen and topbar', () => {
    const scoreRoot = computeTopologyScore(
      { sourceId: 'daylight#note_editor/root' },
      { symbol: 'NoteEditorScreen' }
    );
    assert.strictEqual(scoreRoot, 1.0);

    const scoreTopBar = computeTopologyScore(
      { sourceId: 'daylight#note_editor/toolbar' },
      { symbol: 'NoteEditorTopAppBar' }
    );
    assert.strictEqual(scoreTopBar, 1.0);
  });

  it('enforces anti-deception policy: text-only match cannot reach >= 0.50 without structural signals', () => {
    const result = scoreCandidateMapping(
      { text: 'Unique Title Text Here', sourceId: 'unrelated_node_xyz' },
      { text: 'Unique Title Text Here', symbol: 'CompletelyUnrelatedSymbol', testTag: 'different_tag' }
    );
    assert.ok(result.confidence < 0.50, `Text-only match must be < 0.50, received ${result.confidence}`);
  });

  it('combines all 5 signals with correct weights', () => {
    const result = scoreCandidateMapping(
      {
        sourceId: 'daylight#note_editor/toolbar/back_btn',
        semantics: { role: 'button', isInteractive: true },
        boundsDp: { y: 16 },
        text: 'Back'
      },
      {
        testTag: 'editor_back_button',
        composableName: 'IconButton',
        name: 'onNavigateBack',
        isLambda: true,
        text: 'Back'
      }
    );

    assert.ok(result.confidence >= 0.85, `Expected high confidence >= 0.85, got ${result.confidence}`);
    assert.strictEqual(typeof result.signals.tagScore, 'number');
    assert.strictEqual(typeof result.signals.roleScore, 'number');
    assert.strictEqual(typeof result.signals.behaviorScore, 'number');
    assert.strictEqual(typeof result.signals.topologyScore, 'number');
    assert.strictEqual(typeof result.signals.textScore, 'number');
  });
});

describe('Categorizer 6-Way Classification Unit Tests', () => {
  it('classifies design-only canvas or svg nodes as REPLACE_CANVAS', () => {
    const cat = classifyCategory({ category: 'canvas', vectorData: '<svg></svg>' }, null);
    assert.strictEqual(cat, CATEGORIES.REPLACE_CANVAS);
  });

  it('classifies design-only standard nodes as NEW_COMPONENT', () => {
    const cat = classifyCategory({ category: 'button' }, null);
    assert.strictEqual(cat, CATEGORIES.NEW_COMPONENT);
  });

  it('classifies existing-only nodes as DEPRECATE', () => {
    const cat = classifyCategory(null, { symbol: 'OldUnusedButton' });
    assert.strictEqual(cat, CATEGORIES.DEPRECATE);
  });

  it('classifies layout topology or sizing mode changes as RESTRUCTURE_LAYOUT', () => {
    const cat = classifyCategory(
      { category: 'row' },
      { symbol: 'NoteCard' },
      { layoutChanged: true }
    );
    assert.strictEqual(cat, CATEGORIES.RESTRUCTURE_LAYOUT);
  });

  it('classifies paired nodes with styling differences as RETROFIT_STYLE', () => {
    const cat = classifyCategory(
      { category: 'textbox' },
      { symbol: 'TitleInput' },
      { styleMatches: false }
    );
    assert.strictEqual(cat, CATEGORIES.RETROFIT_STYLE);
  });

  it('classifies perfectly matching nodes as REUSE_AS_IS', () => {
    const cat = classifyCategory(
      { category: 'text' },
      { symbol: 'StaticText' },
      { styleMatches: true, drift: 0.2 }
    );
    assert.strictEqual(cat, CATEGORIES.REUSE_AS_IS);
  });
});

describe('Ambiguity Resolver Unit Tests', () => {
  it('classifies confidence tiers accurately', () => {
    assert.strictEqual(classifyMappingConfidence(0.95), CONFIDENCE_LEVELS.CONFIRMED_HIGH);
    assert.strictEqual(classifyMappingConfidence(0.85), CONFIDENCE_LEVELS.CONFIRMED_HIGH);
    assert.strictEqual(classifyMappingConfidence(0.70), CONFIDENCE_LEVELS.CANDIDATE_MEDIUM);
    assert.strictEqual(classifyMappingConfidence(0.50), CONFIDENCE_LEVELS.CANDIDATE_MEDIUM);
    assert.strictEqual(classifyMappingConfidence(0.49), CONFIDENCE_LEVELS.UNRESOLVED_AMBIGUITY);
    assert.strictEqual(classifyMappingConfidence(0.10), CONFIDENCE_LEVELS.UNRESOLVED_AMBIGUITY);
  });

  it('detects duplicate target collisions when multiple design nodes target same callback', () => {
    const mappings = [
      {
        id: 'm1',
        designSourceId: 'daylight#editor/action1',
        confidence: 0.88,
        existingTarget: { testTag: 'common_action_btn' }
      },
      {
        id: 'm2',
        designSourceId: 'daylight#editor/action2',
        confidence: 0.85,
        existingTarget: { testTag: 'common_action_btn' }
      }
    ];

    const collisions = detectDuplicateTargets(mappings);
    assert.strictEqual(collisions.length, 1);
    assert.strictEqual(collisions[0].existingTargetIdentifier, 'common_action_btn');
    assert.strictEqual(collisions[0].conflictingDesignSourceIds.length, 2);
    assert.strictEqual(collisions[0].resolution, 'UNRESOLVED_COLLISION');
  });

  it('extracts alternative candidate mappings within score tolerance', () => {
    const candidates = [
      { candidate: { symbol: 'TargetA' }, confidence: 0.88 },
      { candidate: { symbol: 'TargetB' }, confidence: 0.82 },
      { candidate: { symbol: 'TargetC' }, confidence: 0.40 }
    ];
    const alts = extractAlternativeCandidates(candidates, 0.10);
    assert.strictEqual(alts.length, 1);
    assert.strictEqual(alts[0].symbol, 'TargetB');
  });
});

describe('Invariant Tracker Unit Tests', () => {
  it('generates testTag preservation and dual-tagging obligations', () => {
    const obligations = buildPreservationObligations(
      { sourceId: 'daylight#editor/title' },
      { testTag: 'editor_title_input', composableSymbol: 'NoteEditorScreen' }
    );
    assert.ok(obligations.some(o => o.includes('PRESERVE_TEST_TAG:editor_title_input')));
    assert.ok(obligations.some(o => o.includes('DUAL_TAG_SEMANTICS')));
    assert.ok(obligations.some(o => o.includes('ZERO_EPD_WAVEFORMS_PROHIBITION')));
    assert.ok(obligations.some(o => o.includes('ENFORCE_DAYLIGHT_SOL_OS_TOKENS')));
  });

  it('generates Room autosave debounce and forbidden data path obligations for editor screens', () => {
    const obligations = buildPreservationObligations(
      { sourceId: 'daylight#editor/content' },
      { composableSymbol: 'NoteEditorScreen' }
    );
    assert.ok(obligations.includes('PRESERVE_ROOM_AUTOSAVE_DEBOUNCE'));
    assert.ok(obligations.includes('LOCK_FORBIDDEN_PATH:data/**'));
  });

  it('enforces >=48dp touch target on interactive nodes', () => {
    const obligations = buildPreservationObligations(
      { sourceId: 'daylight#editor/btn', semantics: { isInteractive: true }, boundsDp: { width: 32, height: 32 } },
      null
    );
    assert.ok(obligations.includes('PRESERVE_MIN_TOUCH_TARGET_48DP'));
  });
});

describe('Correspondence Map Schema & Integration Validation', () => {
  const ajv = new Ajv({ allErrors: true, strict: false });
  require('ajv-formats')(ajv);
  const validate = ajv.compile(correspondenceSchema);

  it('validates generated CorrespondenceMap against Draft 2020-12 Schema', () => {
    const map = generateCorrespondenceMap({
      screenId: 'note_editor',
      appModel: {
        provenance: { hash: 'a'.repeat(64) },
        targetModule: 'app',
        packageName: 'com.claude.noteapp',
        screens: [
          {
            symbol: 'NoteEditorScreen',
            filePath: 'app/src/main/java/com/claude/noteapp/ui/editor/NoteEditorScreen.kt',
            testTags: ['editor_back_button', 'editor_title_input'],
            parameters: [
              { name: 'onNavigateBack', isLambda: true },
              { name: 'uiState', isState: true }
            ]
          }
        ]
      },
      designContract: {
        provenance: {
          measuredScenesHash: 'b'.repeat(64),
          layoutIntentHash: 'c'.repeat(64),
          behaviorContractHash: 'd'.repeat(64),
          designSystemHash: 'e'.repeat(64)
        },
        measuredScenes: {
          scenes: {
            portrait: {
              rootNode: {
                sourceId: 'daylight#note_editor/root',
                category: 'container',
                children: [
                  {
                    sourceId: 'daylight#note_editor/toolbar/back_btn',
                    role: 'button',
                    category: 'button',
                    semantics: { role: 'Button', isInteractive: true },
                    boundsDp: { x: 8, y: 16, width: 48, height: 48 }
                  },
                  {
                    sourceId: 'daylight#note_editor/title_input',
                    role: 'textbox',
                    category: 'textbox',
                    semantics: { role: 'input' },
                    boundsDp: { x: 24, y: 72, width: 544, height: 48 }
                  }
                ]
              }
            }
          }
        }
      }
    });

    assert.strictEqual(map.version, '2.0.0');
    assert.strictEqual(map.screenId, 'note_editor');
    assert.ok(map.mappings.length >= 2, `Expected >= 2 mappings, got ${map.mappings.length}`);

    const isValid = validate(map);
    if (!isValid) {
      console.error('AJV validation errors:', validate.errors);
    }
    assert.ok(isValid, 'CorrespondenceMap must conform 100% to Draft 2020-12 Schema');
  });

  it('handles empty inputs cleanly and validates against schema', () => {
    const map = generateCorrespondenceMap({
      screenId: 'empty_screen',
      appModel: { screens: [] },
      designContract: { measuredScenes: { scenes: {} } }
    });

    assert.strictEqual(map.mappings.length, 0);
    assert.strictEqual(map.summary.mappedCount, 0);
    const isValid = validate(map);
    assert.ok(isValid, 'Empty CorrespondenceMap must conform to schema');
  });
});
