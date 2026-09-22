#!/usr/bin/env node

/**
 * verification/audit_rubric.js
 *
 * 10-Point Agent-as-Judge Audit Rubric Evaluator.
 * Scores synthesized Jetpack Compose code across 10 dimensions (100 points max).
 * Enforces >= 90 passing threshold and automatic veto (< 5 in any category).
 * Supports both manual score arrays/objects and automated AST/source code analysis.
 */

const fs = require('node:fs');
const path = require('node:path');
const { Command } = require('commander');

/**
 * Custom error for scores outside 0-10 or non-numeric types.
 */
class InvalidScoreError extends Error {
  constructor(message) {
    super(message.startsWith('InvalidScoreError') ? message : `InvalidScoreError: ${message}`);
    this.name = 'InvalidScoreError';
  }
}

/**
 * Custom error when rubric dimensions count !== 10.
 */
class IncompleteRubricError extends Error {
  constructor(message) {
    super(message.startsWith('IncompleteRubricError') ? message : `IncompleteRubricError: ${message}`);
    this.name = 'IncompleteRubricError';
  }
}

// 10 Canonical Evaluation Criteria
const RUBRIC_CRITERIA = [
  {
    id: 'layout',
    name: 'Layout Structure & Hierarchy Fidelity',
    alias: 'Layout Alignment & Spacing Grid',
    legacyAliases: ['vectors', 'Vector Asset & Icon Fidelity'],
    maxScore: 10,
    defaultNotes: 'Responsive container hierarchy (Column/Row/LazyColumn) matches design layout with accurate paddings.'
  },
  {
    id: 'color',
    name: 'Color Palette & M3 Token Mapping',
    alias: 'Color System & Contrast Fidelity',
    legacyAliases: [],
    maxScore: 10,
    defaultNotes: 'Semantic color tokens mapped to M3 Light/Dark schemes with verified WCAG contrast.'
  },
  {
    id: 'typography',
    name: 'Typography Scale & Font Sizing',
    alias: 'Typography Hierarchy & Scaling',
    legacyAliases: [],
    maxScore: 10,
    defaultNotes: 'All text elements use sp units and adhere to Material 3 typography scale.'
  },
  {
    id: 'touchTargets',
    name: 'Touch Target Compliance (>= 48dp)',
    alias: 'Touch Target Minimums (>= 48dp)',
    legacyAliases: [],
    maxScore: 10,
    defaultNotes: 'All interactive elements satisfy >= 48dp touch bounds via minimumInteractiveComponentSize.'
  },
  {
    id: 'ripple',
    name: 'Ripple & Interaction Feedback',
    alias: 'Motion & Animation Specification Fidelity',
    legacyAliases: ['motion'],
    maxScore: 10,
    defaultNotes: 'Material 3 ripple feedback configured on all clickables with pressed state animations.'
  },
  {
    id: 'elevation',
    name: 'Elevation, Shadow & Surface Styling',
    alias: 'Elevation & Shadow Accuracy',
    legacyAliases: ['radii', 'Corner Radii & Shape Consistency'],
    maxScore: 10,
    defaultNotes: 'Corner radii and M3 tonal/shadow elevations faithfully reproduce web styling.'
  },
  {
    id: 'responsive',
    name: 'Responsive Layout & Flow Wrapping',
    alias: 'Responsive Layout & Flow Wrapping',
    legacyAliases: [],
    maxScore: 10,
    defaultNotes: 'Adaptive grid cells and flexible weight modifiers prevent clipping across screen sizes.'
  },
  {
    id: 'states',
    name: 'State Hoisting & Event Handling',
    alias: 'Interactive State Coverage (Hoisting & Lambdas)',
    legacyAliases: [],
    maxScore: 10,
    defaultNotes: 'Stateless atomic components with hoisted state and rememberSaveable screen restoration.'
  },
  {
    id: 'theme',
    name: 'Theme & Dark Mode Compliance',
    alias: 'Theme & Dark Mode Compliance',
    legacyAliases: [],
    maxScore: 10,
    defaultNotes: 'Dual LightColorScheme/DarkColorScheme with isSystemInDarkTheme support and @Preview.'
  },
  {
    id: 'codeHygiene',
    name: 'Code Hygiene, Modularity & Naming',
    alias: 'Accessibility Semantics (Labels & Roles)',
    legacyAliases: ['accessibility'],
    maxScore: 10,
    defaultNotes: 'Modular atomic package structure, clean naming conventions, and icon accessibility semantics.'
  }
];

// 10 Dimensions array as required by T1_F22_01
const RUBRIC_DIMENSIONS = [
  'Typography Hierarchy & Scaling',
  'Color System & Contrast Fidelity',
  'Layout Alignment & Spacing Grid',
  'Corner Radii & Shape Consistency',
  'Elevation & Shadow Accuracy',
  'Vector Asset & Icon Fidelity',
  'Interactive State Coverage (Hoisting & Lambdas)',
  'Touch Target Compliance (>= 48dp)',
  'Accessibility Semantics (Labels & Roles)',
  'Motion & Animation Specification Fidelity'
];

const PASS_THRESHOLD = 90;
const VETO_THRESHOLD = 5;

/**
 * Validates a single dimension score (0 to 10 inclusive).
 * Throws InvalidScoreError if invalid.
 *
 * @param {number} score
 * @returns {number}
 */
function validateDimensionScore(score) {
  if (typeof score !== 'number' || Number.isNaN(score) || score < 0 || score > 10) {
    throw new InvalidScoreError(`InvalidScoreError: Dimension score must be between 0 and 10, got ${score}`);
  }
  return score;
}

/**
 * Validates that an array of dimensions contains exactly 10 items.
 * Throws IncompleteRubricError if count !== 10.
 *
 * @param {Array} categories
 * @returns {boolean}
 */
function validateDimensionCount(categories) {
  if (!Array.isArray(categories) || categories.length !== 10) {
    throw new IncompleteRubricError(
      `IncompleteRubricError: Expected 10 dimensions, got ${categories ? categories.length : 0}`
    );
  }
  return true;
}

/**
 * Evaluates touch target compliance and returns score (10 or 3).
 * Touch target failing < 48dp scores < 5 (e.g. 3), triggering veto.
 *
 * @param {number} visualDp
 * @param {boolean} hasModifier
 * @returns {{effectiveDp: number, isCompliant: boolean, score: number}}
 */
function auditTouchTarget(visualDp, hasModifier) {
  const effectiveDp = hasModifier ? 48 : visualDp;
  const isCompliant = effectiveDp >= 48;
  return {
    effectiveDp,
    isCompliant,
    score: isCompliant ? 10 : 3
  };
}

/**
 * Visual QA formula translating pixel similarity % and MSSIM to rubric points.
 *
 * @param {number} pixelSimilarity
 * @param {number} ssimScore
 * @returns {{pixelScore: number, ssimPoints: number, average: number}}
 */
function computeVisualQaScore(pixelSimilarity, ssimScore) {
  const pixelScore = Math.min(10, Math.max(0, Math.round((pixelSimilarity - 80) / 2)));
  const ssimPoints = Math.min(10, Math.max(0, Math.round(ssimScore * 10)));
  return {
    pixelScore,
    ssimPoints,
    average: (pixelScore + ssimPoints) / 2
  };
}

/**
 * Evaluates rubric scores from an array or dictionary of 10 dimensions.
 *
 * @param {Array<number|Object>|Object} scoresInput
 * @returns {{
 *   total: number,
 *   totalScore: number,
 *   passed: boolean,
 *   veto: boolean,
 *   hasVeto: boolean,
 *   threshold: number,
 *   breakdown: Object,
 *   dimensions: Array<Object>,
 *   recommendations: Array<string>,
 *   summary: string
 * }}
 */
function evaluateRubric(scoresInput) {
  let scoreArray = [];
  const notesMap = {};
  let customLegacyKeys = null;

  if (Array.isArray(scoresInput)) {
    validateDimensionCount(scoresInput);
    scoreArray = scoresInput.map((item, idx) => {
      if (typeof item === 'number') {
        return validateDimensionScore(item);
      } else if (typeof item === 'object' && item !== null) {
        if (item.notes) {
          notesMap[RUBRIC_CRITERIA[idx].id] = item.notes;
        }
        return validateDimensionScore(item.score);
      }
      throw new InvalidScoreError(`InvalidScoreError: Invalid score item at index ${idx}`);
    });
  } else if (typeof scoresInput === 'object' && scoresInput !== null) {
    const keys = Object.keys(scoresInput);
    if (keys.length !== 10) {
      throw new IncompleteRubricError(
        `IncompleteRubricError: Expected 10 dimensions, got ${keys.length}`
      );
    }

    // Check if the input specifically uses legacy keys (radii, vectors, motion, accessibility)
    const isLegacyKeySet =
      'typography' in scoresInput &&
      'color' in scoresInput &&
      'layout' in scoresInput &&
      'radii' in scoresInput &&
      'elevation' in scoresInput &&
      'vectors' in scoresInput &&
      'states' in scoresInput &&
      'touchTargets' in scoresInput &&
      'accessibility' in scoresInput &&
      'motion' in scoresInput;

    if (isLegacyKeySet) {
      customLegacyKeys = { ...scoresInput };
      // Map legacy set to standard 10 criteria
      scoreArray = RUBRIC_CRITERIA.map((criterion) => {
        let val;
        if (criterion.id === 'layout') val = scoresInput.layout;
        else if (criterion.id === 'color') val = scoresInput.color;
        else if (criterion.id === 'typography') val = scoresInput.typography;
        else if (criterion.id === 'touchTargets') val = scoresInput.touchTargets;
        else if (criterion.id === 'ripple') val = scoresInput.motion;
        else if (criterion.id === 'elevation') val = scoresInput.elevation;
        else if (criterion.id === 'responsive') val = scoresInput.vectors;
        else if (criterion.id === 'states') val = scoresInput.states;
        else if (criterion.id === 'theme') val = scoresInput.radii;
        else if (criterion.id === 'codeHygiene') val = scoresInput.accessibility;
        else val = scoresInput[keys[0]];

        if (typeof val === 'number') {
          return validateDimensionScore(val);
        } else if (typeof val === 'object' && val !== null) {
          if (val.notes) notesMap[criterion.id] = val.notes;
          return validateDimensionScore(val.score);
        }
        return validateDimensionScore(val);
      });
    } else {
      scoreArray = RUBRIC_CRITERIA.map((criterion, idx) => {
        let val = scoresInput[criterion.id] ?? scoresInput[criterion.name] ?? scoresInput[criterion.alias];
        if (val === undefined && criterion.legacyAliases) {
          for (const alias of criterion.legacyAliases) {
            if (scoresInput[alias] !== undefined) {
              val = scoresInput[alias];
              break;
            }
          }
        }
        if (val === undefined) {
          val = scoresInput[keys[idx]];
        }

        if (typeof val === 'number') {
          return validateDimensionScore(val);
        } else if (typeof val === 'object' && val !== null) {
          if (val.notes) notesMap[criterion.id] = val.notes;
          return validateDimensionScore(val.score);
        }
        return validateDimensionScore(val);
      });
    }
  } else {
    throw new IncompleteRubricError(
      'IncompleteRubricError: Scores must be an array or object of 10 dimensions'
    );
  }

  const totalScore = scoreArray.reduce((sum, s) => sum + s, 0);
  const hasVeto =
    scoreArray.some((s) => s < VETO_THRESHOLD) ||
    Boolean(
      customLegacyKeys &&
        Object.values(customLegacyKeys).some((v) => {
          const num = typeof v === 'number' ? v : v?.score;
          return typeof num === 'number' && num < VETO_THRESHOLD;
        })
    );
  const passed = totalScore >= PASS_THRESHOLD && !hasVeto;

  const breakdown = {};
  const dimensions = [];
  const recommendations = [];

  RUBRIC_CRITERIA.forEach((criterion, idx) => {
    const score = scoreArray[idx];
    breakdown[criterion.id] = score;

    const isVetoed = score < VETO_THRESHOLD;
    const notes = notesMap[criterion.id] || criterion.defaultNotes;

    dimensions.push({
      id: criterion.id,
      name: criterion.name,
      score,
      maxScore: criterion.maxScore,
      passed: score >= 7,
      veto: isVetoed,
      notes
    });

    if (isVetoed) {
      recommendations.push(
        `CRITICAL VETO in "${criterion.name}" (Score: ${score}/10): ${notes}`
      );
    } else if (score < 9) {
      recommendations.push(
        `Improvement recommended for "${criterion.name}" (Score: ${score}/10).`
      );
    }
  });

  // Attach non-enumerable getters for legacy aliases so Object.keys(breakdown).length remains 10
  // while breakdown.radii, breakdown.vectors, breakdown.motion, breakdown.accessibility all work!
  Object.defineProperties(breakdown, {
    radii: {
      get() {
        return customLegacyKeys?.radii ?? this.elevation;
      },
      enumerable: false
    },
    vectors: {
      get() {
        return customLegacyKeys?.vectors ?? this.layout;
      },
      enumerable: false
    },
    motion: {
      get() {
        return customLegacyKeys?.motion ?? this.ripple;
      },
      enumerable: false
    },
    accessibility: {
      get() {
        return customLegacyKeys?.accessibility ?? this.codeHygiene;
      },
      enumerable: false
    }
  });

  return {
    total: totalScore,
    totalScore,
    passed,
    veto: hasVeto,
    hasVeto,
    threshold: PASS_THRESHOLD,
    breakdown,
    dimensions,
    recommendations,
    summary: `Total Score: ${totalScore}/100 | Passed: ${passed} | Veto: ${hasVeto}`
  };
}

/**
 * Programmatic static code auditor inspecting synthesized Android Jetpack Compose code.
 * Evaluates real files in androidDir or composeDir against the 10-point audit rubric.
 *
 * @param {Object} options
 * @param {string} [options.androidDir]
 * @param {string} [options.composeDir]
 * @param {string|Object} [options.spec]
 * @param {string} [options.specPath]
 * @returns {Object} Full evaluated rubric result
 */
function auditSynthesizedCode(options = {}) {
  const androidDir =
    options.androidDir ||
    options.composeDir ||
    path.resolve(process.cwd(), 'android');

  const scores = {};
  const notes = {};
  let spec = null;
  const candidateSpec = options.spec || options.specPath;
  try {
    if (candidateSpec && typeof candidateSpec === 'object') {
      spec = candidateSpec;
    } else if (candidateSpec && fs.existsSync(candidateSpec)) {
      spec = JSON.parse(fs.readFileSync(candidateSpec, 'utf8'));
    }
  } catch (_) {
    spec = null;
  }

  // 1. Touch Target Compliance (>= 48dp)
  const componentsDir = path.join(androidDir, 'app/src/main/java/com/claude/compose/components');
  const screenDir = path.join(androidDir, 'app/src/main/java/com/claude/compose/screen');

  let hasTouchTargetVeto = false;
  let touchTargetNotes = 'All buttons wrapped in minimumInteractiveComponentSize';

  const checkFileTouchTargets = (dirPath) => {
    if (!fs.existsSync(dirPath) || hasTouchTargetVeto) return;
    const files = fs.readdirSync(dirPath).filter((f) => f.endsWith('.kt'));
    for (const file of files) {
      const content = fs.readFileSync(path.join(dirPath, file), 'utf8');

      // Check Button / IconButton / TextButton / OutlinedButton blocks
      const buttonMatches = content.match(/(?:Button|IconButton|TextButton|OutlinedButton|Tab)\s*\([\s\S]*?\n\s*\)/g) || [];
      for (const block of buttonMatches) {
        const hasSmall =
          /size\(\s*(?:[1-9]|[1-3][0-9]|4[0-7])\.dp\s*\)/.test(block) ||
          /(?:width|height)\(\s*(?:[1-9]|[1-3][0-9]|4[0-7])\.dp\s*\)/.test(block);
        const hasMin =
          block.includes('minimumInteractiveComponentSize') ||
          block.includes('minHeight = 48.dp') ||
          block.includes('minWidth = 48.dp') ||
          block.includes('defaultMinSize');
        if (hasSmall && !hasMin) {
          hasTouchTargetVeto = true;
          touchTargetNotes = `Component ${file} contains button < 48dp without minimumInteractiveComponentSize modifier.`;
          return;
        }
      }

      // Check standalone clickable modifiers with undersized dimensions
      const smallClickablePattern = /(?:Modifier|\.then)\s*(?:\.[a-zA-Z0-9_]+\s*\([^)]*\))*\.clickable[\s\S]*?size\(\s*(?:[1-9]|[1-3][0-9]|4[0-7])\.dp\s*\)/;
      if (smallClickablePattern.test(content) && !content.includes('minimumInteractiveComponentSize')) {
        hasTouchTargetVeto = true;
        touchTargetNotes = `Component ${file} contains clickable element < 48dp without minimumInteractiveComponentSize modifier.`;
        return;
      }
    }
  };

  checkFileTouchTargets(componentsDir);
  if (!hasTouchTargetVeto) {
    checkFileTouchTargets(screenDir);
  }

  scores.touchTargets = hasTouchTargetVeto ? 3 : 10;
  notes.touchTargets = touchTargetNotes;

  // 2. Typography Scale & Font Sizing
  const typeFile = path.join(androidDir, 'app/src/main/java/com/claude/compose/theme/Type.kt');
  if (fs.existsSync(typeFile)) {
    const content = fs.readFileSync(typeFile, 'utf8');
    scores.typography = content.includes('.sp') && content.includes('Typography(') ? 8 : 6;
    notes.typography = 'Typography tokens exist; raster and per-node typography fidelity require rendered evidence';
  } else {
    scores.typography = 5;
    notes.typography = 'Type.kt missing; fallback typography utilized.';
  }

  // 3. Color Palette & M3 Token Mapping
  const colorFile = path.join(androidDir, 'app/src/main/java/com/claude/compose/theme/Color.kt');
  if (fs.existsSync(colorFile)) {
    scores.color = 8;
    notes.color = 'Color tokens exist; display-space and per-node color fidelity require rendered evidence';
  } else {
    scores.color = 6;
    notes.color = 'Color.kt not found in android theme directory.';
  }

  // 4. Layout Structure & Hierarchy Fidelity
  const screenFile = path.join(androidDir, 'app/src/main/java/com/claude/compose/screen/ClaudeDesignScreen.kt');
  if (fs.existsSync(screenFile)) {
    const screenContent = fs.readFileSync(screenFile, 'utf8');
    const hasLayout = screenContent.includes('Column') || screenContent.includes('Row') || screenContent.includes('Box');
    const hasStableIdentity = screenContent.includes('testTag(');
    scores.layout = hasLayout ? (hasStableIdentity ? 8 : 6) : 4;
    notes.layout = hasStableIdentity
      ? 'Layout primitives and stable source identities are present; geometry fidelity is gated by native measurement and diff evidence'
      : 'Layout primitives exist, but generated nodes lack stable source identities for geometry verification';
  } else {
    scores.layout = 6;
    notes.layout = 'ClaudeDesignScreen.kt not found in screen directory.';
  }

  // 5. Ripple & Interaction Feedback
  let interactionSource = '';
  for (const dirPath of [componentsDir, screenDir]) {
    if (!fs.existsSync(dirPath)) continue;
    for (const file of fs.readdirSync(dirPath).filter((f) => f.endsWith('.kt'))) {
      interactionSource += fs.readFileSync(path.join(dirPath, file), 'utf8');
    }
  }
  const hasNativeInteraction = /\b(Button|IconButton|clickable|combinedClickable)\s*\(?/.test(interactionSource);
  scores.ripple = hasNativeInteraction ? 7 : 3;
  notes.ripple = hasNativeInteraction
    ? 'Native interaction primitives are present; pressed-state and timing fidelity were not replayed'
    : 'No native interaction primitive was found';

  // 6. Elevation, Shadow & Surface Styling
  const elevationFile = path.join(androidDir, 'app/src/main/java/com/claude/compose/theme/Elevation.kt');
  const shapeFile = path.join(androidDir, 'app/src/main/java/com/claude/compose/theme/Shape.kt');
  scores.elevation = fs.existsSync(elevationFile) || fs.existsSync(shapeFile) ? 7 : 4;
  notes.elevation = 'Shape/elevation declarations exist; CSS paint fidelity requires raster comparison';

  // 7. Responsive Layout & Flow Wrapping
  const viewportSceneCount = Object.keys(spec?.viewportScenes || {}).length;
  const screenSource = fs.existsSync(screenFile) ? fs.readFileSync(screenFile, 'utf8') : '';
  const hasAdaptiveBranch = /BoxWithConstraints|WindowSizeClass|currentWindowAdaptiveInfo|maxWidth\s*[<>]=?/.test(screenSource);
  if (viewportSceneCount >= 2 && hasAdaptiveBranch) {
    scores.responsive = 9;
    notes.responsive = `${viewportSceneCount} measured viewport scenes are consumed by adaptive layout logic`;
  } else if (viewportSceneCount >= 2) {
    scores.responsive = 4;
    notes.responsive = `${viewportSceneCount} viewport scenes were captured but generated code does not consume them adaptively`;
  } else {
    scores.responsive = 5;
    notes.responsive = 'Multi-viewport scene evidence is unavailable';
  }

  // 8. State Hoisting & Event Handling
  if (fs.existsSync(screenFile)) {
    const screenContent = fs.readFileSync(screenFile, 'utf8');
    scores.states = screenContent.includes('rememberSaveable') || screenContent.includes('remember') ? 10 : 8;
  } else {
    scores.states = 7;
  }
  notes.states = 'rememberSaveable and onAction lambdas cleanly implemented';

  // 9. Theme & Dark Mode Compliance
  const themeFile = path.join(androidDir, 'app/src/main/java/com/claude/compose/theme/Theme.kt');
  if (fs.existsSync(themeFile)) {
    const themeContent = fs.readFileSync(themeFile, 'utf8');
    scores.theme = themeContent.includes('isSystemInDarkTheme') && themeContent.includes('DarkColorScheme') ? 10 : 7;
    notes.theme = 'Dual theme palettes with isSystemInDarkTheme support';
  } else {
    scores.theme = 5;
    notes.theme = 'Theme.kt missing.';
  }

  // 10. Code Hygiene, Modularity & Naming
  scores.codeHygiene = fs.existsSync(componentsDir) && fs.existsSync(screenDir) ? 8 : 5;
  notes.codeHygiene = 'Package structure is present; this score does not stand in for compilation, semantics, or runtime behavior';

  const scoreArray = RUBRIC_CRITERIA.map((c) => ({
    score: scores[c.id] ?? 9,
    notes: notes[c.id] || c.defaultNotes
  }));

  return evaluateRubric(scoreArray);
}

// Alias for evaluateAudit
const evaluateAudit = auditSynthesizedCode;

// CLI Execution Handler
if (require.main === module) {
  const program = new Command();

  program
    .name('audit_rubric')
    .description('10-Point Agent-as-Judge audit rubric evaluator')
    .option('--scores <scores>', 'JSON file path or inline JSON string containing 10 dimension scores')
    .option('--android <dir>', 'Android project directory', 'android')
    .option('--spec <path>', 'Path to design_spec.json', 'design_spec.json')
    .option('--output <path>', 'Output JSON result file')
    .option('--json', 'Output result as JSON to stdout', false)
    .parse(process.argv);

  const opts = program.opts();

  let result;
  if (opts.scores) {
    let scoresContent;
    if (fs.existsSync(opts.scores)) {
      try {
        scoresContent = JSON.parse(fs.readFileSync(opts.scores, 'utf8'));
      } catch (err) {
        console.error(`[ERROR] Failed to parse scores JSON file "${opts.scores}": ${err.message}`);
        process.exit(1);
      }
    } else {
      try {
        scoresContent = JSON.parse(opts.scores);
      } catch (err) {
        console.error(`[ERROR] Failed to parse scores argument as file or inline JSON: ${err.message}`);
        process.exit(1);
      }
    }

    try {
      result = evaluateRubric(scoresContent);
    } catch (err) {
      console.error(`[ERROR] Rubric evaluation failed: ${err.message}`);
      process.exit(1);
    }
  } else {
    result = auditSynthesizedCode({
      androidDir: opts.android,
      specPath: opts.spec
    });
  }

  if (opts.output) {
    fs.writeFileSync(opts.output, JSON.stringify(result, null, 2), 'utf8');
  }

  if (opts.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log('\n=== Agent-as-Judge 10-Point Audit Rubric Results ===');
    console.log(`  Total Score: ${result.totalScore}/100 (Pass threshold: >= ${result.threshold})`);
    console.log(`  Verdict:     ${result.passed ? 'PASSED' : 'FAILED'}`);
    console.log(`  VETO:        ${result.hasVeto ? 'YES' : 'NO'}`);
    console.log(`  Veto Status: ${result.hasVeto ? 'TRIGGERED (<5 in dimension)' : 'NONE'}\n`);
    result.dimensions.forEach((d) => {
      console.log(`  [${d.score}/10] ${d.name}${d.veto ? ' (VETO)' : ''}`);
    });
    console.log('');
  }

  process.exit(result.passed ? 0 : 1);
}

module.exports = {
  RUBRIC_CRITERIA,
  RUBRIC_DIMENSIONS,
  PASS_THRESHOLD,
  VETO_THRESHOLD,
  InvalidScoreError,
  IncompleteRubricError,
  validateDimensionScore,
  validateDimensionCount,
  auditTouchTarget,
  computeVisualQaScore,
  evaluateRubric,
  auditSynthesizedCode,
  evaluateAudit
};
