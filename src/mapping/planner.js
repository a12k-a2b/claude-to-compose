/**
 * src/mapping/planner.js
 *
 * Migration Planner & Dependency Graph Engine for Claude to Compose (ctc) v2.
 *
 * Generates a phased, topologically ordered migration plan for retrofitting an
 * existing functional Android Jetpack Compose application to an approved Claude
 * Design redesign while strictly preserving business behavior, navigation,
 * Room data persistence, coroutine debounced autosave, and accessibility.
 *
 * Complies strictly with Daylight DC1 LivePaper hardware specifications:
 * - 8-bit grayscale neutral scale (--os-0 to --os-1000)
 * - Sharp NT36523N transflective LCD (60Hz–120Hz fluid pipeline)
 * - Zero EPD waveforms / electrophoretic clear flashes
 * - WCAG 2.1 AAA contrast validation
 * - +8px hardware coordinate inset
 * - 150ms fluid settling time
 */

'use strict';

const crypto = require('crypto');

/**
 * Standard 5 sequential execution phases.
 * (Phase 0 Pre-Flight Baseline + 4 Core Retrofit Phases)
 */
const PHASES = Object.freeze({
  PHASE_0_BASELINE: {
    index: 0,
    id: 'PHASE_0_BASELINE',
    name: 'Baseline & Invariants Verification',
    objective: 'Verify pre-existing app compilation and test suite health; record and lock Room DB, navigation backstack, and debounced autosave behavior invariants.',
    gate: 'BASELINE_QUALITY_GATE',
    defaultCommand: 'node bin/ctc.js baseline --verify'
  },
  PHASE_1_FOUNDATION: {
    index: 1,
    id: 'PHASE_1_FOUNDATION',
    name: 'Foundation (Theme, Sol:OS Tokens, Typography, Preview Harness)',
    objective: 'Establish Daylight Sol:OS 8-bit grayscale neutral tokens (--os-0 to --os-1000), typography metrics (AbcArizonaFlare / AbcArizonaSans), hairline dividers, and component preview harness without mutating screen composables.',
    gate: 'FOUNDATION_COMPILE_AND_PREVIEW_GATE',
    defaultCommand: './gradlew compileDebugKotlin --rerun-tasks'
  },
  PHASE_2_SHELL_NAV: {
    index: 2,
    id: 'PHASE_2_SHELL_NAV',
    name: 'Structural Shell & Navigation',
    objective: 'Retrofit Scaffold, TopAppBar, and navigation structure while preserving route arguments, back-stack popping semantics, and responsive DC1 breakpoints.',
    gate: 'NAVIGATION_STACK_GATE',
    defaultCommand: './gradlew testDebugUnitTest --tests "*.NoteAppNavigationTest" --rerun-tasks'
  },
  PHASE_3_SCREEN_RETROFIT: {
    index: 3,
    id: 'PHASE_3_SCREEN_RETROFIT',
    name: 'Screen-by-Screen Component Retrofit',
    objective: 'Retrofit leaf and composite UI composables in topological order, preserving ViewModel StateFlow bindings, event action callbacks, and 300ms/500ms Room autosave debounce.',
    gate: 'VIEWMODEL_AND_AUTOSAVE_GATE',
    defaultCommand: './gradlew testDebugUnitTest --tests "*.NoteEditorViewModelTest" --rerun-tasks'
  },
  PHASE_4_VERIFICATION_POLISH: {
    index: 4,
    id: 'PHASE_4_VERIFICATION_POLISH',
    name: 'Verification & Polish (WCAG AAA, +8px Inset, 150ms LivePaper)',
    objective: 'Execute progressive fail-closed verification: WCAG AAA 8-bit contrast, +8px touch inset, capacitive touch >=48dp, 150ms fluid settle time, and perceptual ink alignment.',
    gate: 'DC1_PROGRESSIVE_VERIFICATION_GATE',
    defaultCommand: 'node bin/ctc.js verify --progressive --profile daylight-dc1'
  }
});

const DEFAULT_FORBIDDEN_PATHS = Object.freeze([
  'app/src/main/java/**/data/**',
  'app/src/main/java/**/database/**',
  'app/src/main/java/**/dao/**',
  'app/src/main/java/**/entities/**',
  'app/src/main/java/**/repository/**',
  '**/build.gradle*',
  '**/settings.gradle*',
  '**/gradle/**'
]);

const DEFAULT_FORBIDDEN_BEHAVIORS = Object.freeze([
  'EPD screen clear waveforms / ACTION_REFRESH_SCREEN broadcast or artificial dismissal delays',
  'Mock domain data / Fake repositories in production screens replacing Room DAO',
  'Hardcoded dummy lists replacing ViewModel StateFlow collections',
  'Removing contentDescription or accessibility semantics from interactive IconButtons',
  'Tampering with verification thresholds, tolerance budgets, or golden references to force pass'
]);

/**
 * Validates that screenId is provided and non-empty.
 * Throws Error matching /screenId required/i if invalid.
 */
function validateScreenId(screenId) {
  if (typeof screenId !== 'string' || screenId.trim().length === 0) {
    throw new Error(`screenId required: screenId must be a non-empty string, received "${screenId}"`);
  }
  return screenId.trim();
}

/**
 * Validates array of forbidden behaviors.
 * Rejects with Error if entries are null, undefined, non-string, or empty.
 */
function validateForbiddenBehaviors(behaviors) {
  if (!Array.isArray(behaviors)) {
    throw new Error('Invalid forbidden behaviors: must be an array of string rules');
  }
  for (let i = 0; i < behaviors.length; i++) {
    const item = behaviors[i];
    if (item === null || item === undefined || typeof item !== 'string' || item.trim().length === 0) {
      throw new Error(`Invalid forbidden behaviors: entry at index ${i} is null or invalid ("${item}")`);
    }
  }
  return behaviors;
}

/**
 * Normalizes a path/glob string by converting backslashes to forward slashes
 * and trimming leading/trailing slashes.
 */
function normalizeGlob(pattern) {
  return String(pattern || '')
    .replace(/\\/g, '/')
    .replace(/^\/+/, '')
    .replace(/\/+$/, '');
}

/**
 * Converts a glob pattern into an accurate RegExp.
 */
function globToRegex(pattern) {
  const norm = normalizeGlob(pattern);
  if (!norm) return /^$/;
  let re = norm
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\/\*\*\//g, '/__SLASH_DOUBLE_STAR_SLASH__')
    .replace(/\/\*\*$/g, '__SLASH_DOUBLE_STAR_END__')
    .replace(/^\*\*\//g, '__START_DOUBLE_STAR_SLASH__')
    .replace(/\*\*/g, '__DOUBLE_STAR__')
    .replace(/\*/g, '[^/]*')
    .replace(/\?/g, '[^/]')
    .replace(/__SLASH_DOUBLE_STAR_SLASH__/g, '(?:.*/)?')
    .replace(/__SLASH_DOUBLE_STAR_END__/g, '(?:\/.*)?')
    .replace(/__START_DOUBLE_STAR_SLASH__/g, '(?:.*/)?')
    .replace(/__DOUBLE_STAR__/g, '.*');
  return new RegExp('^' + re + '$');
}

/**
 * Checks whether an allowed pattern and a forbidden pattern overlap/conflict.
 * An overlap occurs when an allowed pattern encompasses or coincides with a forbidden path.
 */
function patternsOverlap(allowedPattern, forbiddenPattern) {
  const normA = normalizeGlob(allowedPattern);
  const normF = normalizeGlob(forbiddenPattern);

  if (normA === normF) return true;
  if (normA === '**' || normF === '**') return true;

  const baseA = normA.replace(/\/\*\*$/, '').replace(/\/\*$/, '');
  const baseF = normF.replace(/\/\*\*$/, '').replace(/\/\*$/, '');

  if (baseA === baseF) return true;

  const reA = globToRegex(normA);
  const reF = globToRegex(normF);

  const isDirA = normA.endsWith('/**') || normA.endsWith('/*') || !/\.[a-zA-Z0-9_-]+$/.test(normA.split('/').pop() || '');
  const isDirF = normF.endsWith('/**') || normF.endsWith('/*') || !/\.[a-zA-Z0-9_-]+$/.test(normF.split('/').pop() || '');

  // Test paths allowed by A against forbidden regex F:
  const samplePathsA = [
    baseA,
    normA
  ];
  if (isDirA) {
    samplePathsA.push(baseA + '/File.kt');
  }
  for (const p of samplePathsA) {
    if (reF.test(p)) return true;
  }

  // Test paths forbidden by F against allowed regex A:
  const samplePathsF = [
    baseF,
    normF
  ];
  if (isDirF) {
    samplePathsF.push(baseF + '/File.kt');
  }
  for (const p of samplePathsF) {
    if (reA.test(p)) return true;
  }

  if (normA.endsWith('/**') || normA.endsWith('/*')) {
    if (baseF.startsWith(baseA + '/')) return true;
  }
  if (normF.endsWith('/**') || normF.endsWith('/*')) {
    if (baseA.startsWith(baseF + '/')) return true;
  }

  return false;
}

/**
 * Validates allowed and forbidden path boundaries to ensure no conflicts or overlaps.
 * Throws Error matching /overlap|conflict/i if a conflict is detected.
 */
function validateBoundaries(boundaries = {}) {
  const b = boundaries || {};
  const allowed = b.allowed || b.allowedModificationPaths || [];
  const forbidden = b.forbidden || b.forbiddenPaths || [];

  for (const a of allowed) {
    for (const f of forbidden) {
      if (patternsOverlap(a, f)) {
        throw new Error(
          `Conflicting path boundaries: allowed pattern "${a}" overlaps with forbidden pattern "${f}". Boundaries must be strictly disjoint.`
        );
      }
    }
  }

  return { valid: true };
}

/**
 * Detects circular dependencies in a task or component graph and computes
 * a valid topological execution order.
 *
 * @param {Array<object>} tasks Array of { id, dependencies: string[] }
 * @returns {object} { isValid: boolean, topologicalOrder: string[], parallelBatches: string[][], hasCycles: boolean }
 * @throws {Error} Throws error matching /circular|cycle/i if a cycle is detected.
 */
function validateTaskGraph(tasks = []) {
  if (!Array.isArray(tasks)) {
    throw new TypeError('Tasks must be an array');
  }

  const nodes = new Map();
  for (const t of tasks) {
    const id = t.id || t.taskId;
    if (!id) continue;
    nodes.set(id, {
      id,
      dependencies: Array.isArray(t.dependencies) ? [...t.dependencies] : []
    });
  }

  // Check for circular dependencies using DFS with 3 states
  // 0: unvisited, 1: visiting (in stack), 2: visited
  const state = new Map();
  const parent = new Map();
  let detectedCycle = null;

  function dfs(u) {
    state.set(u, 1); // visiting
    const node = nodes.get(u);
    if (node) {
      for (const v of node.dependencies) {
        if (!nodes.has(v)) {
          // External or pre-existing node, safe to skip
          continue;
        }
        const vState = state.get(v) || 0;
        if (vState === 1) {
          // Cycle found! Reconstruct cycle path
          const cycle = [v, u];
          let curr = u;
          while (curr && parent.has(curr) && parent.get(curr) !== v) {
            curr = parent.get(curr);
            cycle.push(curr);
          }
          cycle.reverse();
          detectedCycle = cycle;
          return true;
        }
        if (vState === 0) {
          parent.set(v, u);
          if (dfs(v)) return true;
        }
      }
    }
    state.set(u, 2); // visited
    return false;
  }

  for (const [id] of nodes) {
    if ((state.get(id) || 0) === 0) {
      if (dfs(id)) {
        break;
      }
    }
  }

  if (detectedCycle) {
    const cycleStr = detectedCycle.join(' -> ');
    throw new Error(`Circular dependency detected in migration task graph: ${cycleStr}`);
  }

  // Compute topological order using Kahn's algorithm
  // Dependency: if A depends on B, B must precede A. (in-degree of A counts how many B's A needs)
  const inDegree = new Map();
  const dependents = new Map(); // B -> list of A's that depend on B

  for (const [id] of nodes) {
    inDegree.set(id, 0);
    dependents.set(id, []);
  }

  for (const [id, node] of nodes) {
    let internalPrereqs = 0;
    for (const dep of node.dependencies) {
      if (nodes.has(dep)) {
        internalPrereqs++;
        dependents.get(dep).push(id);
      }
    }
    inDegree.set(id, internalPrereqs);
  }

  // Queue nodes with 0 internal prerequisites
  let currentBatch = [];
  for (const [id, deg] of inDegree) {
    if (deg === 0) {
      currentBatch.push(id);
    }
  }

  const topologicalOrder = [];
  const parallelBatches = [];

  while (currentBatch.length > 0) {
    parallelBatches.push([...currentBatch]);
    const nextBatch = [];

    for (const u of currentBatch) {
      topologicalOrder.push(u);
      for (const v of dependents.get(u)) {
        const newDeg = inDegree.get(v) - 1;
        inDegree.set(v, newDeg);
        if (newDeg === 0) {
          nextBatch.push(v);
        }
      }
    }

    currentBatch = nextBatch;
  }

  if (topologicalOrder.length < nodes.size) {
    throw new Error('Circular dependency detected: unresolved dependencies remain');
  }

  return {
    isValid: true,
    hasCycles: false,
    topologicalOrder,
    parallelBatches
  };
}

/**
 * Computes multi-factor risk score for a retrofit task.
 * Returns { score: number, level: 'LOW'|'MEDIUM'|'HIGH'|'CRITICAL', factors: object }
 */
function computeTaskRiskScore(task, context = {}) {
  const t = task || {};
  const componentType = (t.componentType || '').toUpperCase();
  const filePath = (t.filePath || '').toLowerCase();

  // 1. Criticality (1..10)
  let criticality = 4;
  if (filePath.includes('data') || filePath.includes('dao') || filePath.includes('entity')) {
    criticality = 10;
  } else if (filePath.includes('navigation') || componentType.includes('NAV')) {
    criticality = 9;
  } else if (filePath.includes('viewmodel') || componentType.includes('VIEWMODEL')) {
    criticality = 8;
  } else if (componentType.includes('SCAFFOLD') || componentType.includes('TOPAPPBAR')) {
    criticality = 6;
  } else if (componentType.includes('SCREEN')) {
    criticality = 5;
  } else if (componentType.includes('THEME') || componentType.includes('TOKEN')) {
    criticality = 2;
  }

  // 2. Downstream dependents blast radius (1..10)
  const depCount = Array.isArray(t.dependents) ? t.dependents.length : 0;
  const blastRadius = Math.min(10, 1 + depCount * 2);

  // 3. Invariants preservation impact (1..10)
  let invariantsImpact = 1;
  const invariantRefs = Array.isArray(t.preservationInvariants) ? t.preservationInvariants : [];
  if (invariantRefs.some(inv => typeof inv === 'string' && (inv.includes('PERSIST') || inv.includes('NAV') || inv.includes('SAVE')))) {
    invariantsImpact = 10;
  } else if (invariantRefs.some(inv => typeof inv === 'string' && inv.includes('OFFLINE'))) {
    invariantsImpact = 8;
  } else if (invariantRefs.some(inv => typeof inv === 'string' && inv.includes('A11Y'))) {
    invariantsImpact = 5;
  }

  // 4. Mapping confidence penalty (0..10)
  const confidence = typeof t.confidence === 'number' ? t.confidence : 1.0;
  const confidencePenalty = Math.max(0, Math.min(10, (1.0 - confidence) * 10));

  // Weighted composite score (0..10)
  const rawScore = 0.35 * criticality + 0.25 * blastRadius + 0.25 * invariantsImpact + 0.15 * confidencePenalty;
  const score = Math.round(rawScore * 10) / 10;

  let level = 'LOW';
  if (score >= 8.5) {
    level = 'CRITICAL';
  } else if (score >= 6.5) {
    level = 'HIGH';
  } else if (score >= 4.0) {
    level = 'MEDIUM';
  }

  return {
    score,
    level,
    factors: {
      criticality,
      blastRadius,
      invariantsImpact,
      confidencePenalty: Math.round(confidencePenalty * 10) / 10
    }
  };
}

/**
 * Creates a structured Rollback Anchor for a phase or critical step.
 */
function createRollbackAnchor(phase, targetFiles = [], options = {}) {
  const phaseId = typeof phase === 'string' ? phase : (phase && phase.id) || 'PHASE';
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const anchorId = `anchor-${phaseId.toLowerCase()}-${timestamp}`;

  return {
    anchorId,
    phaseId,
    gitCheckpoint: `ctc-anchor-${phaseId.toLowerCase()}`,
    snapshotFiles: [...targetFiles],
    preConditionCheck: options.preConditionCheck || 'git status --porcelain',
    verificationGate: options.verificationGate || (phase && phase.defaultCommand) || 'npm test',
    rollbackCommand: `git checkout -f HEAD -- ${targetFiles.join(' ')}`,
    timeoutMs: options.timeoutMs || 60000,
    establishedAt: new Date().toISOString()
  };
}

/**
 * Generates the default scoped allowed paths based on screenId.
 */
function deriveAllowedPaths(screenId, targetPackage = 'com.example.notes') {
  const packagePath = targetPackage.replace(/\./g, '/');
  const screenSlug = screenId.replace(/_/g, '').toLowerCase();

  return [
    `app/src/main/java/${packagePath}/ui/editor/**`,
    `app/src/main/java/${packagePath}/ui/list/**`,
    `app/src/main/java/${packagePath}/ui/components/**`,
    `app/src/main/java/${packagePath}/ui/theme/**`,
    `app/src/main/java/**/ui/editor/**`
  ];
}

/**
 * Generates the standardized 5 sequential execution phases.
 */
function buildPhases(screenId, correspondenceMap = {}, options = {}) {
  const mappings = Array.isArray(correspondenceMap.mappings) ? correspondenceMap.mappings : [];

  // Phase 0: Baseline & Invariants Pre-Flight Check
  const phase0Tasks = [
    {
      taskId: 'TASK-P0-001',
      name: 'Verify Baseline Compilation and Tests',
      componentType: 'BASELINE',
      filePath: 'app-baseline.json',
      dependencies: [],
      preservationInvariants: ['INV-PERSIST-001', 'INV-NAV-001', 'INV-SAVE-001', 'INV-OFFLINE-001'],
      riskScore: 2.0,
      riskLevel: 'LOW'
    },
    {
      taskId: 'TASK-P0-002',
      name: 'Lock Behavior Invariants Manifest',
      componentType: 'INVARIANTS',
      filePath: 'behavior-invariants.json',
      dependencies: ['TASK-P0-001'],
      preservationInvariants: ['INV-PERSIST-001', 'INV-NAV-001', 'INV-SAVE-001'],
      riskScore: 3.0,
      riskLevel: 'LOW'
    }
  ];

  // Phase 1: Foundation (Sol:OS tokens, typography, preview harness)
  const phase1Tasks = [
    {
      taskId: 'TASK-P1-001',
      name: 'Synthesize Sol:OS 8-bit Neutral Tokens',
      componentType: 'DESIGN_SYSTEM_TOKEN',
      filePath: 'app/src/main/java/**/ui/theme/Color.kt',
      dependencies: ['TASK-P0-002'],
      tokens: ['--os-0', '--os-50', '--os-100', '--os-150', '--os-200', '--os-300', '--os-400', '--os-800', '--os-900', '--os-1000'],
      preservationInvariants: [],
      riskScore: 2.5,
      riskLevel: 'LOW'
    },
    {
      taskId: 'TASK-P1-002',
      name: 'Configure Daylight Typography Metrics',
      componentType: 'TYPOGRAPHY',
      filePath: 'app/src/main/java/**/ui/theme/Type.kt',
      dependencies: ['TASK-P1-001'],
      fontFamilies: ['AbcArizonaFlare', 'AbcArizonaSans'],
      preservationInvariants: [],
      riskScore: 3.0,
      riskLevel: 'LOW'
    },
    {
      taskId: 'TASK-P1-003',
      name: 'Setup Transflective Component Preview Harness',
      componentType: 'PREVIEW_HARNESS',
      filePath: 'app/src/main/java/**/ui/theme/Theme.kt',
      dependencies: ['TASK-P1-002'],
      viewports: ['1184x1584', '1584x1184'],
      settleMs: 150,
      preservationInvariants: [],
      riskScore: 3.2,
      riskLevel: 'LOW'
    }
  ];

  // Phase 2: Structural Shell & Navigation
  const phase2Tasks = [
    {
      taskId: 'TASK-P2-001',
      name: 'Retrofit Screen Scaffold & Insets',
      componentType: 'SCAFFOLD',
      filePath: 'app/src/main/java/**/ui/editor/NoteEditorScreen.kt',
      dependencies: ['TASK-P1-003'],
      preservationInvariants: ['INV-A11Y-001'],
      riskScore: 5.5,
      riskLevel: 'MEDIUM'
    },
    {
      taskId: 'TASK-P2-002',
      name: 'Retrofit TopAppBar & Preserve Up/Back Navigation',
      componentType: 'TOPAPPBAR',
      filePath: 'app/src/main/java/**/ui/editor/NoteEditorScreen.kt',
      dependencies: ['TASK-P2-001'],
      preservationInvariants: ['INV-NAV-001', 'INV-A11Y-001'],
      preservationRule: 'Preserve onBackClick callback triggering navController.popBackStack(). Never alter route names or drop backstack history.',
      riskScore: 7.8,
      riskLevel: 'HIGH'
    }
  ];

  // Phase 3: Screen-by-Screen Component Retrofit
  const phase3Tasks = [];
  let prevTaskId = 'TASK-P2-002';

  const unmappedNodes = Array.isArray(correspondenceMap?.unmappedDesignNodes) ? correspondenceMap.unmappedDesignNodes : [];
  const unmappedExisting = Array.isArray(correspondenceMap?.unmappedExistingSymbols) ? correspondenceMap.unmappedExistingSymbols : [];

  if (mappings.length > 0 || unmappedNodes.length > 0 || unmappedExisting.length > 0) {
    let taskIdx = 1;
    // 1. Tasks for mapped components
    for (const m of mappings) {
      const target = m.existingTarget || {};
      const cat = m.category || 'RETROFIT_STYLE';
      const taskId = `TASK-P3-${String(taskIdx++).padStart(3, '0')}`;
      const compName = target.composableSymbol || target.testTag || m.designSourceId;

      let taskName = `Retrofit ${compName} Styling & Tokens`;
      let compType = 'RETROFIT_STYLE';
      if (cat === 'RESTRUCTURE_LAYOUT') {
        taskName = `Restructure ${compName} Layout & Hierarchy`;
        compType = 'RESTRUCTURE_LAYOUT';
      } else if (cat === 'REPLACE_CANVAS') {
        taskName = `Replace Canvas Layer ${m.designSourceId}`;
        compType = 'REPLACE_CANVAS';
      } else if (cat === 'REUSE_AS_IS') {
        taskName = `Verify ${compName} Layout and Tokens`;
        compType = 'REUSE_AS_IS';
      }

      const risk = computeTaskRiskScore({
        componentType: compType,
        filePath: target.filePath,
        preservationInvariants: m.preservationObligations,
        confidence: m.confidence
      });

      phase3Tasks.push({
        taskId,
        name: taskName,
        componentType: compType,
        filePath: target.filePath || `app/src/main/java/**/ui/editor/${screenId}.kt`,
        dependencies: [prevTaskId],
        preservationInvariants: m.preservationObligations || [],
        riskScore: risk.score,
        riskLevel: risk.level
      });
      prevTaskId = taskId;
    }

    // 2. Tasks for unmapped design nodes (NEW_COMPONENT or REPLACE_CANVAS)
    for (const node of unmappedNodes) {
      const taskId = `TASK-P3-${String(taskIdx++).padStart(3, '0')}`;
      const disposition = node.disposition || 'NEW_COMPONENT';
      const taskName = disposition === 'REPLACE_CANVAS'
        ? `Implement Canvas Layer ${node.designSourceId}`
        : `Implement New Component ${node.designSourceId}`;

      const risk = computeTaskRiskScore({ componentType: disposition });

      phase3Tasks.push({
        taskId,
        name: taskName,
        componentType: disposition,
        filePath: `app/src/main/java/**/ui/components/${node.suggestedComposableName || 'Component'}.kt`,
        dependencies: [prevTaskId],
        preservationInvariants: ['ENFORCE_DAYLIGHT_SOL_OS_TOKENS', 'ZERO_EPD_WAVEFORMS_PROHIBITION'],
        riskScore: risk.score,
        riskLevel: risk.level
      });
      prevTaskId = taskId;
    }

    // 3. Tasks for unmapped existing symbols (DEPRECATE)
    for (const sym of unmappedExisting) {
      const taskId = `TASK-P3-${String(taskIdx++).padStart(3, '0')}`;
      phase3Tasks.push({
        taskId,
        name: `Deprecate Unused Existing Symbol ${sym.symbol || sym.testTag}`,
        componentType: 'DEPRECATE',
        filePath: sym.sourceFile || '',
        dependencies: [prevTaskId],
        preservationInvariants: [],
        riskScore: 2.0,
        riskLevel: 'LOW'
      });
      prevTaskId = taskId;
    }
  } else {
    // Fallback default tasks for empty correspondence map (e.g. baseline tests)
    phase3Tasks.push(
      {
        taskId: 'TASK-P3-001',
        name: 'Retrofit Headline Title Input Composable',
        componentType: 'INPUT_FIELD',
        filePath: 'app/src/main/java/**/ui/editor/NoteEditorScreen.kt',
        dependencies: ['TASK-P2-002'],
        preservationInvariants: ['INV-SAVE-001'],
        preservationRule: 'Retain onTitleChange callback bound to ViewModel StateFlow. Do NOT introduce blocking Room calls.',
        riskScore: 6.2,
        riskLevel: 'MEDIUM'
      },
      {
        taskId: 'TASK-P3-002',
        name: 'Retrofit Body Editor Composable with Autosave Debounce',
        componentType: 'INPUT_FIELD',
        filePath: 'app/src/main/java/**/ui/editor/NoteEditorScreen.kt',
        dependencies: ['TASK-P3-001'],
        preservationInvariants: ['INV-PERSIST-001', 'INV-SAVE-001'],
        preservationRule: 'Retain 300ms/500ms coroutine debounce in NoteEditorViewModel before persisting to Room NoteDao. Flush pending edits on pause.',
        riskScore: 8.2,
        riskLevel: 'HIGH'
      },
      {
        taskId: 'TASK-P3-003',
        name: 'Bind Interactive Action Buttons with Native Hit Slop',
        componentType: 'ACTION_BUTTON',
        filePath: 'app/src/main/java/**/ui/editor/NoteEditorScreen.kt',
        dependencies: ['TASK-P3-002'],
        preservationInvariants: ['INV-A11Y-001'],
        preservationRule: 'Ensure capacitive touch target >= 48dp x 48dp via invisible hit slop without expanding visual hairline geometry.',
        riskScore: 5.0,
        riskLevel: 'MEDIUM'
      }
    );
    prevTaskId = 'TASK-P3-003';
  }

  // Phase 4: Verification & Polish
  const phase4Tasks = [
    {
      taskId: 'TASK-P4-001',
      name: 'Evaluate WCAG 2.1 AAA Grayscale Contrast',
      componentType: 'VERIFICATION',
      filePath: 'verification/contrast_report.json',
      dependencies: [prevTaskId],
      contrastStandard: 'AAA (>= 7.0:1 for normal text, >= 4.5:1 for large text)',
      preservationInvariants: [],
      riskScore: 4.5,
      riskLevel: 'MEDIUM'
    },
    {
      taskId: 'TASK-P4-002',
      name: 'Verify +8px Hardware Inset and 150ms Settle Time',
      componentType: 'HARDWARE_QUALIFICATION',
      filePath: 'verification/dc1_telemetry.json',
      dependencies: ['TASK-P4-001'],
      hardwareProfile: 'Daylight DC1 LivePaper (1184x1584 active, 1200x1600 panel, +8px inset)',
      preservationInvariants: [],
      riskScore: 5.2,
      riskLevel: 'MEDIUM'
    },
    {
      taskId: 'TASK-P4-003',
      name: 'Assert Zero EPD Waveform Workarounds',
      componentType: 'EPD_GUARDRAIL',
      filePath: 'verification/epd_check.json',
      dependencies: ['TASK-P4-002'],
      preservationRule: 'Strict prohibition of ACTION_REFRESH_SCREEN broadcasts, modal clear flashes, or artificial dismissal delays on transflective LCD panel.',
      riskScore: 3.5,
      riskLevel: 'LOW'
    }
  ];

  const phaseDefinitions = [
    {
      ...PHASES.PHASE_0_BASELINE,
      tasks: phase0Tasks,
      rollbackAnchor: createRollbackAnchor(PHASES.PHASE_0_BASELINE, ['app-baseline.json', 'behavior-invariants.json'])
    },
    {
      ...PHASES.PHASE_1_FOUNDATION,
      tasks: phase1Tasks,
      rollbackAnchor: createRollbackAnchor(PHASES.PHASE_1_FOUNDATION, [
        'app/src/main/java/**/ui/theme/Color.kt',
        'app/src/main/java/**/ui/theme/Type.kt',
        'app/src/main/java/**/ui/theme/Theme.kt'
      ])
    },
    {
      ...PHASES.PHASE_2_SHELL_NAV,
      tasks: phase2Tasks,
      rollbackAnchor: createRollbackAnchor(PHASES.PHASE_2_SHELL_NAV, [
        'app/src/main/java/com/example/notes/ui/editor/NoteEditorScreen.kt'
      ])
    },
    {
      ...PHASES.PHASE_3_SCREEN_RETROFIT,
      tasks: phase3Tasks,
      rollbackAnchor: createRollbackAnchor(PHASES.PHASE_3_SCREEN_RETROFIT, [
        'app/src/main/java/com/example/notes/ui/editor/NoteEditorScreen.kt',
        'app/src/main/java/com/example/notes/presentation/editor/NoteEditorViewModel.kt'
      ])
    },
    {
      ...PHASES.PHASE_4_VERIFICATION_POLISH,
      tasks: phase4Tasks,
      rollbackAnchor: createRollbackAnchor(PHASES.PHASE_4_VERIFICATION_POLISH, [
        'verification/contrast_report.json',
        'verification/dc1_telemetry.json'
      ])
    }
  ];

  return phaseDefinitions;
}

/**
 * Generates the comprehensive MigrationPlan for an Android screen redesign.
 *
 * @param {object} params
 * @param {string} params.screenId Target screen identifier (e.g. 'note_editor')
 * @param {object} [params.correspondenceMap] Semantic correspondence mapping output
 * @param {object} [params.appModel] Inspected ExistingAppModel
 * @param {object} [params.designContract] 4-layer design contract
 * @param {object} [params.invariantsManifest] Behavior invariants manifest
 * @param {object} [params.boundaries] Optional boundary overrides
 * @param {object} [params.options] Additional configuration options
 * @returns {object} Standardized MigrationPlan
 */
function generateMigrationPlan(params = {}) {
  const p = params || {};

  // 1. Validate screenId
  const screenId = validateScreenId(p.screenId);

  // 2. Validate correspondenceMap (allows zero mappings)
  const correspondenceMap = p.correspondenceMap || { mappings: [] };
  if (!Array.isArray(correspondenceMap.mappings)) {
    correspondenceMap.mappings = [];
  }

  // 3. Assemble boundaries
  const allowed = Array.isArray(p.boundaries && p.boundaries.allowedModificationPaths)
    ? [...p.boundaries.allowedModificationPaths]
    : deriveAllowedPaths(screenId, (p.appModel && p.appModel.packageName) || 'com.example.notes');

  const forbidden = Array.isArray(p.boundaries && p.boundaries.forbiddenPaths)
    ? [...p.boundaries.forbiddenPaths]
    : [...DEFAULT_FORBIDDEN_PATHS];

  const rawBehaviors = (p.boundaries && p.boundaries.forbiddenBehaviors) || DEFAULT_FORBIDDEN_BEHAVIORS;
  const forbiddenBehaviors = validateForbiddenBehaviors(rawBehaviors);

  // Validate boundaries for overlaps
  validateBoundaries({
    allowed,
    forbidden
  });

  // 4. Build sequential phases (5 phases)
  const phases = buildPhases(screenId, correspondenceMap, params.options);

  // 5. Flatten all tasks across phases and perform Dependency Graph validation
  const allTasks = [];
  for (const phase of phases) {
    for (const task of phase.tasks) {
      allTasks.push(task);
    }
  }

  const graphAnalysis = validateTaskGraph(allTasks);

  // 6. Compute composite risk assessment
  let maxRisk = 0;
  let sumRisk = 0;
  const taskRiskScores = [];

  for (const task of allTasks) {
    const risk = computeTaskRiskScore(task, { screenId });
    taskRiskScores.push({
      taskId: task.taskId,
      score: risk.score,
      level: risk.level,
      factors: risk.factors
    });
    sumRisk += risk.score;
    if (risk.score > maxRisk) maxRisk = risk.score;
  }

  const compositeScore = allTasks.length > 0 ? Math.round((sumRisk / allTasks.length) * 10) / 10 : 0.0;
  let overallRisk = 'LOW';
  if (compositeScore >= 7.0 || maxRisk >= 8.5) {
    overallRisk = 'HIGH';
  } else if (compositeScore >= 4.5) {
    overallRisk = 'MEDIUM';
  }

  // 7. Hash generation for deterministic plan identity
  const planPayload = JSON.stringify({
    screenId,
    phasesCount: phases.length,
    allowedCount: allowed.length,
    forbiddenCount: forbidden.length,
    topologicalOrder: graphAnalysis.topologicalOrder
  });
  const planHash = crypto.createHash('sha256').update(planPayload).digest('hex').slice(0, 12);
  const planId = `plan-${screenId}-${planHash}`;

  return {
    schemaVersion: '2.0.0',
    planId,
    screenId,
    generatedAt: new Date().toISOString(),
    boundaries: {
      allowedModificationPaths: allowed,
      forbiddenPaths: forbidden,
      forbiddenBehaviors
    },
    phases,
    dependencyGraph: {
      nodes: allTasks.map(t => ({
        id: t.taskId,
        name: t.name,
        componentType: t.componentType,
        filePath: t.filePath
      })),
      topologicalOrder: graphAnalysis.topologicalOrder,
      parallelBatches: graphAnalysis.parallelBatches,
      hasCycles: false,
      cyclePaths: []
    },
    riskAssessment: {
      overallRisk,
      compositeScore,
      maxTaskRisk: maxRisk,
      taskRiskScores
    },
    invariantsManifestRef: {
      refId: 'behavior-invariants.json',
      lockedInvariants: [
        'INV-PERSIST-001',
        'INV-NAV-001',
        'INV-SAVE-001',
        'INV-OFFLINE-001',
        'INV-A11Y-001'
      ]
    },
    hardwareProfile: {
      name: 'Daylight DC1 LivePaper',
      model: 'DC_1',
      panel: 'Sharp NT36523N Transflective LCD',
      refreshRateHz: '60Hz–120Hz fluid framerate',
      zeroEpdWaveforms: true,
      activeViewport: '1184x1584',
      physicalPanel: '1200x1600',
      hardwareInsetPx: { left: 8, top: 8, right: 8, bottom: 8 },
      settleMsStandard: 150,
      minTouchTargetDp: 48
    }
  };
}

module.exports = {
  PHASES,
  DEFAULT_FORBIDDEN_PATHS,
  DEFAULT_FORBIDDEN_BEHAVIORS,
  validateScreenId,
  validateForbiddenBehaviors,
  validateBoundaries,
  patternsOverlap,
  validateTaskGraph,
  computeTaskRiskScore,
  createRollbackAnchor,
  deriveAllowedPaths,
  generateMigrationPlan
};
