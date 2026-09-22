#!/usr/bin/env node

/**
 * ============================================================================
 * Milestone 3 Round 2 Empirical Edge Stress Suite:
 * Deep Edge Cases on Boundary Glob Overlap, Cyclic Dependency Detection,
 * and Pilot Note-App Correspondence Mapping
 *
 * Executed by: Challenger 1 (Milestone 3 Round 2 - Empirical Challenger)
 * Working Directory: /Users/anjan/.gemini/antigravity/scratch/claude_to_compose
 * ============================================================================
 */

'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const Ajv = require('ajv/dist/2020');
const addFormats = require('ajv-formats');

// Subsystems under test
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
  computeTextScore
} = require('../../src/mapping/multi_signal_scorer');

const {
  generateMigrationPlan,
  validateBoundaries,
  validateTaskGraph,
  computeTaskRiskScore,
  createRollbackAnchor,
  validateScreenId,
  validateForbiddenBehaviors,
  patternsOverlap,
  deriveAllowedPaths,
  PHASES,
  DEFAULT_FORBIDDEN_PATHS,
  DEFAULT_FORBIDDEN_BEHAVIORS
} = require('../../src/mapping/planner');

const { parseAndroidProject } = require('../../src/analyzer/index');

// Schemas
const correspondenceSchema = require('../../src/mapping/schemas/correspondence_map.json');
const planSchema = require('../../src/mapping/schemas/migration-plan.schema.json');

const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);
const validateCorrespondenceSchema = ajv.compile(correspondenceSchema);
const validatePlanSchema = ajv.compile(planSchema);

// Test Results Tracking
const results = [];
let passCount = 0;
let failCount = 0;

function recordTest(id, name, section, passed, details = {}) {
  results.push({ id, name, section, passed, details });
  if (passed) {
    passCount++;
    console.log(`\x1b[32m[PASS]\x1b[0m [${id}] ${name}`);
  } else {
    failCount++;
    console.log(`\x1b[31m[FAIL]\x1b[0m [${id}] ${name}`);
    console.log(`       \x1b[31mReason: ${details.reason || 'Assertion failed'}\x1b[0m`);
    if (details.error) console.log(`       Error: ${details.error}`);
    if (details.expected !== undefined) console.log(`       Expected: ${JSON.stringify(details.expected)}`);
    if (details.actual !== undefined) console.log(`       Actual:   ${JSON.stringify(details.actual)}`);
  }
}

async function runEdgeStressSuite() {
  console.log('='.repeat(80));
  console.log('M3 ROUND 2 EMPIRICAL EDGE STRESS SUITE (Challenger 1)');
  console.log('='.repeat(80) + '\n');

  // ==========================================================================
  // Section 1: Boundary Glob Overlap Edge Cases
  // ==========================================================================
  console.log('--- Section 1: Boundary Glob Overlap Edge Cases ---');

  // 1.1 Cleanly disjoint sibling folders
  {
    const allowed = 'app/src/main/java/**/ui/components/**';
    const forbidden = 'app/src/main/java/**/ui/editor/**';
    const overlaps = patternsOverlap(allowed, forbidden);
    recordTest(
      'M3-EDGE-01',
      'Cleanly disjoint sibling folders (components/** vs editor/**) do not overlap',
      'Boundary Glob Overlap',
      overlaps === false,
      { expected: false, actual: overlaps }
    );
  }

  // 1.2 Disjoint architectural packages (UI vs Data)
  {
    const allowed = 'app/src/main/java/**/ui/*.kt';
    const forbidden = 'app/src/main/java/**/data/*.kt';
    const overlaps = patternsOverlap(allowed, forbidden);
    recordTest(
      'M3-EDGE-02',
      'Architecturally disjoint packages (ui/*.kt vs data/*.kt) do not overlap',
      'Boundary Glob Overlap',
      overlaps === false,
      { expected: false, actual: overlaps }
    );
  }

  // 1.3 Wildcard extension encompassing specific file overlaps
  {
    const allowed = 'app/src/main/java/**/ui/**/*.kt';
    const forbidden = 'app/src/main/java/com/example/notes/ui/Secret.kt';
    const overlaps = patternsOverlap(allowed, forbidden);
    recordTest(
      'M3-EDGE-03',
      'Wildcard extension encompassing specific file overlaps',
      'Boundary Glob Overlap',
      overlaps === true,
      { expected: true, actual: overlaps }
    );
  }

  // 1.4 Deeply nested wildcards with overlapping domain folder detect conflict
  {
    const allowed = 'app/**/main/**/*.kt';
    const forbidden = 'app/**/main/java/**/data/**';
    const overlaps = patternsOverlap(allowed, forbidden);
    recordTest(
      'M3-EDGE-04',
      'Deeply nested wildcards with overlapping domain folder detect conflict',
      'Boundary Glob Overlap',
      overlaps === true,
      { expected: true, actual: overlaps }
    );
  }

  // 1.5 Single star single-level boundary enforcement
  {
    const allowed = 'app/src/main/java/*.kt';
    const forbidden = 'app/src/main/java/sub/Deep.kt';
    const overlaps = patternsOverlap(allowed, forbidden);
    recordTest(
      'M3-EDGE-05',
      'Single star (*.kt) does not falsely overlap with nested subfolder file',
      'Boundary Glob Overlap',
      overlaps === false,
      { expected: false, actual: overlaps }
    );
  }

  // 1.6 Single star direct child matching
  {
    const allowed = 'app/src/main/java/*.kt';
    const forbidden = 'app/src/main/java/MainActivity.kt';
    const overlaps = patternsOverlap(allowed, forbidden);
    recordTest(
      'M3-EDGE-06',
      'Single star (*.kt) overlaps with direct child file in same directory',
      'Boundary Glob Overlap',
      overlaps === true,
      { expected: true, actual: overlaps }
    );
  }

  // 1.7 Special regex characters in path (parentheses, plus, brackets, dollars)
  {
    const allowed = 'app/src/main/java/com/example/notes/ui/components(preview)/**';
    const forbidden = 'app/src/main/java/com/example/notes/ui/components(preview)/Secret.kt';
    let passed = false;
    let err = null;
    try {
      const overlaps = patternsOverlap(allowed, forbidden);
      passed = (overlaps === true);
    } catch (e) {
      err = e.message;
    }
    recordTest(
      'M3-EDGE-07',
      'Special regex characters (e.g. parentheses) handled without crash or escaping bug',
      'Boundary Glob Overlap',
      passed,
      { error: err }
    );
  }

  // 1.8 Mixed Windows backslashes and slashes normalization
  {
    const allowed = 'app\\src\\main\\java\\com\\example\\notes\\ui\\**';
    const forbidden = 'app/src/main/java/com/example/notes/ui/NoteEditorScreen.kt';
    const overlaps = patternsOverlap(allowed, forbidden);
    recordTest(
      'M3-EDGE-08',
      'Mixed Windows backslashes vs POSIX slashes detected as overlapping',
      'Boundary Glob Overlap',
      overlaps === true,
      { expected: true, actual: overlaps }
    );
  }

  // 1.9 Prefix collision guard: editor vs editor_v2
  {
    const allowed = 'app/src/main/java/com/example/notes/ui/editor/**';
    const forbidden = 'app/src/main/java/com/example/notes/ui/editor_v2/**';
    const overlaps = patternsOverlap(allowed, forbidden);
    recordTest(
      'M3-EDGE-09',
      'Prefix collision guard: editor/** does not falsely match editor_v2/**',
      'Boundary Glob Overlap',
      overlaps === false,
      { expected: false, actual: overlaps }
    );
  }

  // 1.10 Empty boundaries object robustness in validateBoundaries
  {
    let passed = false;
    try {
      const res1 = validateBoundaries();
      const res2 = validateBoundaries({});
      const res3 = validateBoundaries({ allowed: [], forbidden: [] });
      passed = res1.valid && res2.valid && res3.valid;
    } catch (e) {
      passed = false;
    }
    recordTest(
      'M3-EDGE-10',
      'validateBoundaries gracefully handles undefined/empty boundaries',
      'Boundary Glob Overlap',
      passed
    );
  }

  // 1.11 validateBoundaries throws deterministic conflict error
  {
    let caught = false;
    let msg = '';
    try {
      validateBoundaries({
        allowed: ['app/src/main/java/com/example/notes/data/repository/NoteRepo.kt'],
        forbidden: ['app/src/main/java/**/data/**']
      });
    } catch (e) {
      caught = true;
      msg = e.message;
    }
    recordTest(
      'M3-EDGE-11',
      'validateBoundaries throws error matching /overlap|conflict/i on collision',
      'Boundary Glob Overlap',
      caught && /overlap|conflict/i.test(msg),
      { caught, msg }
    );
  }

  // ==========================================================================
  // Section 2: Cyclic Dependency Detection & Topological Ordering Edge Cases
  // ==========================================================================
  console.log('\n--- Section 2: Cyclic Dependency Detection & Topological Ordering ---');

  // 2.1 Self loop: A -> A
  {
    let threw = false;
    let msg = '';
    try {
      validateTaskGraph([{ id: 'task_self', dependencies: ['task_self'] }]);
    } catch (e) {
      threw = true;
      msg = e.message;
    }
    recordTest(
      'M3-EDGE-12',
      'Self-loop (A -> A) detected and throws circular dependency error',
      'Cycle Detection',
      threw && /circular|cycle/i.test(msg),
      { threw, msg }
    );
  }

  // 2.2 Dual intersecting cycles (Figure-8)
  {
    const tasks = [
      { id: 'C1', dependencies: ['Hub'] },
      { id: 'C2', dependencies: ['C1'] },
      { id: 'Hub', dependencies: ['C2', 'D2'] },
      { id: 'D1', dependencies: ['Hub'] },
      { id: 'D2', dependencies: ['D1'] }
    ];
    let threw = false;
    let msg = '';
    try {
      validateTaskGraph(tasks);
    } catch (e) {
      threw = true;
      msg = e.message;
    }
    recordTest(
      'M3-EDGE-13',
      'Figure-8 intersecting cycles sharing pivot hub detected',
      'Cycle Detection',
      threw && /circular|cycle/i.test(msg),
      { threw, msg }
    );
  }

  // 2.3 Secondary disconnected component with cycle
  {
    const tasks = [
      { id: 'valid_1', dependencies: [] },
      { id: 'valid_2', dependencies: ['valid_1'] },
      { id: 'valid_3', dependencies: ['valid_2'] },
      { id: 'cycle_x', dependencies: ['cycle_y'] },
      { id: 'cycle_y', dependencies: ['cycle_x'] }
    ];
    let threw = false;
    let msg = '';
    try {
      validateTaskGraph(tasks);
    } catch (e) {
      threw = true;
      msg = e.message;
    }
    recordTest(
      'M3-EDGE-14',
      'Detached secondary cycle detected even when primary component is clean DAG',
      'Cycle Detection',
      threw && /circular|cycle/i.test(msg),
      { threw, msg }
    );
  }

  // 2.4 Duplicate dependency entries in task array
  {
    const tasks = [
      { id: 'A', dependencies: [] },
      { id: 'B', dependencies: ['A', 'A', 'A'] },
      { id: 'C', dependencies: ['B', 'B'] }
    ];
    let passed = false;
    let order = [];
    try {
      const res = validateTaskGraph(tasks);
      order = res.topologicalOrder;
      passed = res.isValid && order[0] === 'A' && order[1] === 'B' && order[2] === 'C';
    } catch (e) {
      passed = false;
    }
    recordTest(
      'M3-EDGE-15',
      'Duplicate dependency IDs handled without double-counting or hang',
      'Topological Sort',
      passed,
      { order }
    );
  }

  // 2.5 External / missing dependency IDs
  {
    const tasks = [
      { id: 'T1', dependencies: ['EXTERNAL_GRADLE_TASK', 'EXTERNAL_SYSTEM_LIB'] },
      { id: 'T2', dependencies: ['T1', 'EXTERNAL_OTHER'] }
    ];
    let passed = false;
    let order = [];
    try {
      const res = validateTaskGraph(tasks);
      order = res.topologicalOrder;
      passed = res.isValid && order.length === 2 && order[0] === 'T1' && order[1] === 'T2';
    } catch (e) {
      passed = false;
    }
    recordTest(
      'M3-EDGE-16',
      'External non-existent dependencies safely skipped without false cycle',
      'Topological Sort',
      passed,
      { order }
    );
  }

  // 2.6 Empty tasks array
  {
    const res = validateTaskGraph([]);
    recordTest(
      'M3-EDGE-17',
      'Empty task array returns valid empty topological sort',
      'Topological Sort',
      res.isValid === true && res.hasCycles === false && res.topologicalOrder.length === 0
    );
  }

  // 2.7 Massive 500-node linear DAG execution performance
  {
    const chainSize = 500;
    const tasks = [];
    tasks.push({ id: 'task_0', dependencies: [] });
    for (let i = 1; i < chainSize; i++) {
      tasks.push({ id: `task_${i}`, dependencies: [`task_${i - 1}`] });
    }
    const start = Date.now();
    const res = validateTaskGraph(tasks);
    const elapsed = Date.now() - start;

    const correctOrder = res.topologicalOrder[0] === 'task_0' &&
      res.topologicalOrder[chainSize - 1] === `task_${chainSize - 1}` &&
      res.topologicalOrder.length === chainSize;

    recordTest(
      'M3-EDGE-18',
      `Massive 500-node linear chain DAG validated and topologically ordered in ${elapsed}ms (< 250ms)`,
      'Topological Sort',
      correctOrder && elapsed < 250,
      { elapsed, totalNodes: res.topologicalOrder.length }
    );
  }

  // 2.8 Wide parallel diamond DAG batches
  {
    const parallelCount = 50;
    const tasks = [{ id: 'Root', dependencies: [] }];
    for (let i = 0; i < parallelCount; i++) {
      tasks.push({ id: `Worker_${i}`, dependencies: ['Root'] });
    }
    const workerIds = tasks.slice(1).map(t => t.id);
    tasks.push({ id: 'Sink', dependencies: workerIds });

    const res = validateTaskGraph(tasks);
    const batches = res.parallelBatches;

    const b0 = batches[0]?.length === 1 && batches[0][0] === 'Root';
    const b1 = batches[1]?.length === parallelCount;
    const b2 = batches[2]?.length === 1 && batches[2][0] === 'Sink';

    recordTest(
      'M3-EDGE-19',
      'Wide parallel diamond DAG computes exact 3-stage parallel batches',
      'Topological Sort',
      b0 && b1 && b2,
      { batchCounts: batches.map(b => b.length) }
    );
  }

  // ==========================================================================
  // Section 3: Pilot Note-App Correspondence Edge Cases
  // ==========================================================================
  console.log('\n--- Section 3: Pilot Note-App Correspondence Edge Cases ---');

  const noteAppDir = path.resolve(__dirname, '../../fixtures/note-app');
  let appModel = null;

  // 3.1 Live AST extraction
  {
    let passed = false;
    let screenCount = 0;
    try {
      appModel = await parseAndroidProject(noteAppDir, 'app');
      screenCount = appModel.screens ? appModel.screens.length : 0;
      passed = screenCount >= 2;
    } catch (e) {
      passed = false;
    }
    recordTest(
      'M3-EDGE-20',
      'Live AST extraction from fixtures/note-app returns screens (>= 2)',
      'Pilot Note-App Correspondence',
      passed,
      { screenCount }
    );
  }

  // 3.2 Target screen scoping: note_editor vs note_list
  {
    const contractEditor = {
      measuredScenes: {
        scenes: {
          s1: {
            rootNode: {
              sourceId: 'daylight#note_editor/root',
              domTag: 'div',
              category: 'container'
            }
          }
        }
      }
    };

    const contractList = {
      measuredScenes: {
        scenes: {
          s1: {
            rootNode: {
              sourceId: 'daylight#notes_list/root',
              domTag: 'div',
              category: 'container'
            }
          }
        }
      }
    };

    const mapEditor = generateCorrespondenceMap({
      appModel,
      designContract: contractEditor,
      screenId: 'note_editor'
    });

    const mapList = generateCorrespondenceMap({
      appModel,
      designContract: contractList,
      screenId: 'notes_list'
    });

    const editorTarget = mapEditor.mappings[0]?.existingTarget?.composableSymbol;
    const listTarget = mapList.mappings[0]?.existingTarget?.composableSymbol;

    const correctlyScoped = (
      editorTarget === 'NoteEditorScreen' &&
      (listTarget === 'NotesListScreen' || listTarget === 'NoteListScreen')
    );

    recordTest(
      'M3-EDGE-21',
      'Target screenId parameter strictly scopes candidate extraction (NoteEditor vs NotesList)',
      'Pilot Note-App Correspondence',
      correctlyScoped,
      { editorTarget, listTarget }
    );
  }

  // 3.3 Element-level testTag candidate resolution without collapsing
  {
    const contract = {
      measuredScenes: {
        scenes: {
          s1: {
            rootNode: {
              sourceId: 'daylight#note_editor/root',
              domTag: 'div',
              category: 'container',
              children: [
                {
                  sourceId: 'daylight#note_editor/title_input',
                  role: 'textbox',
                  category: 'textbox',
                  testTag: 'editor_title_input',
                  semantics: { role: 'input' },
                  domTag: 'input'
                },
                {
                  sourceId: 'daylight#note_editor/content_input',
                  role: 'textbox',
                  category: 'textbox',
                  testTag: 'editor_content_input',
                  semantics: { role: 'input' },
                  domTag: 'textarea'
                }
              ]
            }
          }
        }
      }
    };

    const map = generateCorrespondenceMap({
      appModel,
      designContract: contract,
      screenId: 'note_editor'
    });

    const titleMapping = map.mappings.find(m => m.designSourceId === 'daylight#note_editor/title_input');
    const contentMapping = map.mappings.find(m => m.designSourceId === 'daylight#note_editor/content_input');

    const titleTarget = titleMapping?.existingTarget?.testTag;
    const contentTarget = contentMapping?.existingTarget?.testTag;

    const resolved = (
      titleTarget === 'editor_title_input' &&
      contentTarget === 'editor_content_input'
    );

    recordTest(
      'M3-EDGE-22',
      'Distinct input nodes resolve to distinct testTag candidates without collapsing',
      'Pilot Note-App Correspondence',
      resolved,
      { titleTarget, contentTarget }
    );
  }

  // 3.4 Specificity tie-breaker: testTag beats container screen
  {
    const contract = {
      measuredScenes: {
        scenes: {
          s1: {
            rootNode: {
              sourceId: 'editor_title_input',
              role: 'input',
              category: 'input',
              testTag: 'editor_title_input'
            }
          }
        }
      }
    };

    const map = generateCorrespondenceMap({
      appModel,
      designContract: contract,
      screenId: 'note_editor'
    });

    const m = map.mappings[0];
    const targetType = m?.existingTarget?.targetType;

    recordTest(
      'M3-EDGE-23',
      'Specificity tie-breaker prefers TEST_TAG over COMPOSABLE_SCREEN',
      'Pilot Note-App Correspondence',
      targetType === 'TEST_TAG',
      { targetType }
    );
  }

  // 3.5 Unmapped canvas element classification
  {
    const contract = {
      measuredScenes: {
        scenes: {
          s1: {
            rootNode: {
              sourceId: 'ink_layer_canvas',
              role: 'canvas',
              category: 'canvas',
              vectorData: 'M0,0 L10,10'
            }
          }
        }
      }
    };

    const map = generateCorrespondenceMap({
      appModel,
      designContract: contract,
      screenId: 'note_editor'
    });

    const unmapped = map.unmappedDesignNodes.find(n => n.designSourceId === 'ink_layer_canvas');
    const disposition = unmapped?.disposition;

    recordTest(
      'M3-EDGE-24',
      'Vector/canvas design node with no candidate is classified as REPLACE_CANVAS',
      'Pilot Note-App Correspondence',
      disposition === 'REPLACE_CANVAS',
      { disposition }
    );
  }

  // 3.6 Unmapped new component classification
  {
    const contract = {
      measuredScenes: {
        scenes: {
          s1: {
            rootNode: {
              sourceId: 'novel_word_counter_badge',
              role: 'badge',
              category: 'badge'
            }
          }
        }
      }
    };

    const map = generateCorrespondenceMap({
      appModel,
      designContract: contract,
      screenId: 'note_editor'
    });

    const unmapped = map.unmappedDesignNodes.find(n => n.designSourceId === 'novel_word_counter_badge');
    const disposition = unmapped?.disposition;

    recordTest(
      'M3-EDGE-25',
      'Novel UI component with no candidate is classified as NEW_COMPONENT',
      'Pilot Note-App Correspondence',
      disposition === 'NEW_COMPONENT',
      { disposition }
    );
  }

  // 3.7 Null suggestedParentSourceId schema validity
  {
    const contract = {
      measuredScenes: {
        scenes: {
          s1: {
            rootNode: {
              sourceId: 'root_orphan_widget',
              role: 'widget',
              category: 'widget',
              parentId: null
            }
          }
        }
      }
    };

    const map = generateCorrespondenceMap({
      appModel,
      designContract: contract,
      screenId: 'note_editor'
    });

    const unmapped = map.unmappedDesignNodes.find(n => n.designSourceId === 'root_orphan_widget');
    const parentId = unmapped?.suggestedParentSourceId;
    const isValidSchema = validateCorrespondenceSchema(map);

    recordTest(
      'M3-EDGE-26',
      'Unmapped node with parentId: null outputs suggestedParentSourceId: null and passes Draft 2020-12 schema',
      'Pilot Note-App Correspondence',
      parentId === null && isValidSchema === true,
      { parentId, isValidSchema, errors: validateCorrespondenceSchema.errors }
    );
  }

  // 3.8 Room autosave debounce preservation obligation
  {
    const contract = {
      measuredScenes: {
        scenes: {
          s1: {
            rootNode: {
              sourceId: 'content_input',
              role: 'input',
              category: 'input',
              testTag: 'editor_content_input'
            }
          }
        }
      }
    };

    const map = generateCorrespondenceMap({
      appModel,
      designContract: contract,
      screenId: 'note_editor'
    });

    const mapping = map.mappings.find(m => m.designSourceId === 'content_input');
    const obligations = mapping?.preservationObligations || [];
    const hasAutosave = obligations.some(o => typeof o === 'string' && /autosave|debounce/i.test(o));

    recordTest(
      'M3-EDGE-27',
      'Input editor mapping preserves Room autosave debounce obligation string',
      'Pilot Note-App Correspondence',
      hasAutosave,
      { obligationsCount: obligations.length, obligations }
    );
  }

  // 3.9 Duplicate collision detection on multi-claim targets
  {
    const contract = {
      measuredScenes: {
        scenes: {
          portrait: {
            rootNode: {
              sourceId: 'daylight#note_editor/root',
              domTag: 'div',
              category: 'container',
              children: [
                {
                  sourceId: 'daylight#note_editor/toolbar',
                  domTag: 'header',
                  category: 'row'
                }
              ]
            }
          }
        }
      }
    };

    const map = generateCorrespondenceMap({
      appModel,
      designContract: contract,
      screenId: 'note_editor'
    });

    const hasCollision = map.duplicateCollisions.length > 0;
    const collisionTarget = map.duplicateCollisions[0]?.existingTargetIdentifier;
    recordTest(
      'M3-EDGE-28',
      'Duplicate collisions detected when multiple design elements claim same screen target (screen_note_editor)',
      'Pilot Note-App Correspondence',
      hasCollision && collisionTarget === 'screen_note_editor',
      { collisionCount: map.duplicateCollisions.length, collisionTarget }
    );
  }

  // 3.10 Full MigrationPlan generation and schema validation
  {
    const contract = {
      version: '2.0.0',
      provenance: {
        measuredScenesHash: 'a'.repeat(64),
        layoutIntentHash: 'b'.repeat(64),
        behaviorContractHash: 'c'.repeat(64),
        designSystemHash: 'd'.repeat(64)
      },
      measuredScenes: {
        scenes: {
          s1: {
            rootNode: {
              sourceId: 'daylight#note_editor/root',
              domTag: 'div',
              category: 'container',
              children: [
                {
                  sourceId: 'daylight#note_editor/title_input',
                  role: 'textbox',
                  category: 'textbox',
                  testTag: 'editor_title_input',
                  semantics: { role: 'input' }
                },
                {
                  sourceId: 'daylight#note_editor/content_input',
                  role: 'textbox',
                  category: 'textbox',
                  testTag: 'editor_content_input',
                  semantics: { role: 'input' }
                }
              ]
            }
          }
        }
      }
    };

    const map = generateCorrespondenceMap({
      appModel,
      designContract: contract,
      screenId: 'note_editor'
    });

    const plan = generateMigrationPlan({
      correspondenceMap: map,
      designContract: contract,
      screenId: 'note_editor'
    });

    const isPlanValid = validatePlanSchema(plan);
    const phases = plan.phases || [];
    const allPhasesHaveAnchors = phases.length === 5 && phases.every(p => Boolean(p.rollbackAnchor?.gitCheckpoint));

    recordTest(
      'M3-EDGE-29',
      'Full MigrationPlan generated from CorrespondenceMap conforms 100% to Draft 2020-12 Schema with 5 phases & gitCheckpoint rollback anchors',
      'Migration Plan Schema Conformance',
      isPlanValid === true && allPhasesHaveAnchors,
      { isPlanValid, phaseCount: phases.length, errors: validatePlanSchema.errors }
    );
  }

  // ==========================================================================
  // Summary
  // ==========================================================================
  console.log('\n' + '='.repeat(80));
  console.log(`EDGE STRESS SUITE SUMMARY: Total: ${results.length} | Passed: ${passCount} | Failed: ${failCount}`);
  console.log('='.repeat(80) + '\n');

  if (failCount > 0) {
    process.exit(1);
  }
}

runEdgeStressSuite().catch(err => {
  console.error('Fatal error during edge stress suite execution:', err);
  process.exit(1);
});
