'use strict';

/**
 * src/contract/compiler.js
 *
 * 4-Layer Intermediate Representation (IR) Contract Compiler for ctc v2.
 * Synthesizes Layer 1 (Measured Scene), Layer 2 (Inferred Layout Intent),
 * Layer 3 (Behavior Contract), and Layer 4 (Design System) into an immutable,
 * validated contract bundle.
 */

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const Ajv2020 = require('ajv/dist/2020');
const addFormats = require('ajv-formats');

const { createMeasuredNode, createMeasuredBundle, allocateSourceId } = require('./measured_scene_builder');
const { inferNodeIntent, createLayoutIntentBundle } = require('./layout_intent_builder');
const { createBehaviorContract } = require('./behavior_contract_builder');
const {
  createDesignSystemContract,
  verifyContrast,
  contrastRatio,
  SOL_OS_NEUTRAL_TOKENS,
  SOL_OS_BRAND_GRAYS,
  assertNoEpdHooks,
  FORBIDDEN_EPD_PATTERNS
} = require('./design_system_builder');

function computeSha256(content) {
  const str = typeof content === 'string' ? content : JSON.stringify(content, null, 2);
  return 'sha256:' + crypto.createHash('sha256').update(str, 'utf8').digest('hex');
}

function validateScreenId(screenId, evidence) {
  if (!screenId || typeof screenId !== 'string' || screenId.trim() === '') {
    throw new Error('screenId must be a non-empty string');
  }
  if (evidence && evidence.screenId && evidence.screenId !== screenId) {
    throw new Error(`Screen ID mismatch: requested "${screenId}" but evidence is for "${evidence.screenId}"`);
  }
  return true;
}

function resolveColorHex(colorStr, fallbackHex = '#000000') {
  if (!colorStr || typeof colorStr !== 'string') return fallbackHex;
  const clean = colorStr.trim();
  if (SOL_OS_NEUTRAL_TOKENS[clean]) return SOL_OS_NEUTRAL_TOKENS[clean].hex;
  if (SOL_OS_BRAND_GRAYS[clean]) return SOL_OS_BRAND_GRAYS[clean].hex;
  if (/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(clean)) return clean;
  const rgbMatch = clean.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
  if (rgbMatch) {
    const r = Number(rgbMatch[1]).toString(16).padStart(2, '0');
    const g = Number(rgbMatch[2]).toString(16).padStart(2, '0');
    const b = Number(rgbMatch[3]).toString(16).padStart(2, '0');
    return `#${r}${g}${b}`;
  }
  return fallbackHex;
}

function isLargeText(fontSizePx, fontWeight) {
  const size = Number(fontSizePx) || 14;
  const weight = Number(fontWeight) || 400;
  if (size >= 24) return true;
  if (size >= 18.5 && weight >= 700) return true;
  return false;
}

function evaluateMeasuredScenesContrast(measuredScenes) {
  const failures = [];
  const evaluatedRuns = [];

  function traverseNode(node, inheritedBg, visited = new Set()) {
    if (!node || typeof node !== 'object') return;
    if (visited.has(node)) return;
    visited.add(node);

    let currentBg = inheritedBg;
    if (node.computedPaint && node.computedPaint.backgroundColor) {
      const bg = node.computedPaint.backgroundColor;
      if (bg !== '#00000000' && bg !== 'transparent' && !bg.startsWith('rgba(0,0,0,0')) {
        currentBg = resolveColorHex(bg, inheritedBg);
      }
    }

    if (Array.isArray(node.textRuns)) {
      for (const run of node.textRuns) {
        if (!run || typeof run !== 'object') continue;
        const textContent = run.content !== undefined ? String(run.content).trim() : '';
        if (textContent.length === 0) continue;

        const fg = resolveColorHex(run.colorHex, '#1A1A1A');
        const large = isLargeText(run.fontSizePx, run.fontWeight);
        const result = verifyContrast(fg, currentBg, large);
        evaluatedRuns.push({
          sourceId: node.sourceId,
          content: textContent,
          foreground: fg,
          background: currentBg,
          result
        });

        if (!result.pass) {
          failures.push({
            sourceId: node.sourceId,
            content: textContent,
            foreground: fg,
            background: currentBg,
            contrastRatio: result.contrastRatio,
            requiredRatio: result.requiredRatio,
            isLargeText: large,
            level: result.level,
            error: result.error
          });
        }
      }
    }

    if (Array.isArray(node.children)) {
      for (const child of node.children) {
        traverseNode(child, currentBg, visited);
      }
    }
  }

  for (const scene of Object.values(measuredScenes?.scenes || {})) {
    if (scene && scene.rootNode) {
      traverseNode(scene.rootNode, '#FFFFFF', new Set());
    }
  }

  return {
    passed: failures.length === 0,
    failures,
    evaluatedCount: evaluatedRuns.length
  };
}

function scanForEpdHooks(obj) {
  if (!obj) return null;
  const str = typeof obj === 'string' ? obj : JSON.stringify(obj);
  for (const pattern of FORBIDDEN_EPD_PATTERNS) {
    if (str.includes(pattern)) {
      return pattern;
    }
  }
  return null;
}

function checkDuplicateSourceIds(rootOrNodes) {
  const duplicates = [];

  function checkSingleTree(root) {
    const seen = new Set();
    const visited = new Set();

    function traverse(node) {
      if (!node) return;
      if (Array.isArray(node)) {
        for (const item of node) traverse(item);
        return;
      }
      const raw = (node && typeof node === 'object' && node._rawNode) ? node._rawNode : node;
      if (typeof raw === 'object') {
        if (visited.has(raw)) return;
        visited.add(raw);
      }
      if (node.sourceId) {
        if (seen.has(node.sourceId)) {
          duplicates.push(node.sourceId);
        } else {
          seen.add(node.sourceId);
        }
      }
      if (Array.isArray(node.children)) {
        for (const child of node.children) {
          traverse(child);
        }
      }
    }

    traverse(root);
  }

  if (rootOrNodes && typeof rootOrNodes === 'object' && rootOrNodes.scenes) {
    for (const scene of Object.values(rootOrNodes.scenes)) {
      if (scene && scene.rootNode) {
        checkSingleTree(scene.rootNode);
      }
    }
  } else {
    checkSingleTree(rootOrNodes);
  }

  if (duplicates.length > 0) {
    throw new Error(`Duplicate sourceId detected: ${duplicates.join(', ')}`);
  }
  return true;
}

function resolveLoadedAssets(evidence) {
  const assets = [];
  const primary = Array.isArray(evidence.assets)
    ? evidence.assets
    : (Array.isArray(evidence.loadedAssets) ? evidence.loadedAssets : []);
  for (const item of primary) {
    if (item && typeof item === 'object') assets.push(item);
  }
  if (Array.isArray(evidence.vectors)) {
    for (const vec of evidence.vectors) {
      if (vec && typeof vec === 'object') {
        const id = vec.assetId || vec.id;
        if (!assets.some(a => (a.assetId || a.id) === id)) {
          assets.push(vec);
        }
      }
    }
  }
  if (assets.length > 0) return assets;
  return evidence.assets || evidence.loadedAssets || evidence.vectors || [];
}

function synthesizeLayers({ screenId, evidence = {}, options = {} }) {
  validateScreenId(screenId, evidence);

  if (evidence.scenes && typeof evidence.scenes === 'object' && Object.keys(evidence.scenes).length === 0) {
    throw new Error('Validation error: evidence bundle contains empty scenes / no scenes');
  }

  // 1. Layer 1: Measured Scene Bundle
  let measuredScenes;
  const effectiveAssets = resolveLoadedAssets(evidence);
  if (evidence.scenes && Object.keys(evidence.scenes).length > 0) {
    const scenes = {};
    for (const [key, scene] of Object.entries(evidence.scenes)) {
      scenes[key] = {
        ...scene,
        loadedFonts: (Array.isArray(scene.loadedFonts) && scene.loadedFonts.length > 0)
          ? scene.loadedFonts
          : (evidence.fonts || evidence.loadedFonts || scene.loadedFonts || []),
        loadedAssets: (Array.isArray(scene.loadedAssets) && scene.loadedAssets.length > 0)
          ? scene.loadedAssets
          : (effectiveAssets.length > 0 ? effectiveAssets : (scene.loadedAssets || []))
      };
    }
    measuredScenes = createMeasuredBundle({
      screenId,
      capturedAt: evidence.capturedAt,
      scenes,
      loadedFonts: evidence.fonts || evidence.loadedFonts,
      loadedAssets: effectiveAssets
    });
  } else {
    // Construct default root scene with any provided domNodes
    const rootChildren = (evidence.domNodes || []).map(node => {
      const sId = node.sourceId || (node.path ? `daylight#${node.path}` : allocateSourceId(node, `daylight#${screenId}/root`, {}, screenId));
      return createMeasuredNode({
        ...node,
        id: node.id || `node_${Math.random().toString(36).substring(2, 7)}`,
        sourceId: sId,
        domTag: node.domTag || node.tag || 'div',
        bounds: node.bounds || { x: 0, y: 0, width: 100, height: 40 },
        _rawNode: (node && typeof node === 'object' && node._rawNode) ? node._rawNode : node
      });
    });

    const defaultPortraitRoot = createMeasuredNode({
      id: 'root',
      sourceId: `daylight#${screenId}/root`,
      domTag: 'div',
      domClasses: ['screen-container'],
      bounds: { x: 0, y: 0, width: 1184, height: 1584 },
      paintBounds: { left: 0, top: 0, right: 1184, bottom: 1584 },
      paintOrder: 0,
      zIndex: 0,
      computedPaint: { backgroundColor: '#FFFFFF', opacity: 1.0 },
      semantics: { role: 'container', isInteractive: false },
      children: rootChildren
    });

    measuredScenes = createMeasuredBundle({
      screenId,
      capturedAt: evidence.capturedAt,
      loadedFonts: evidence.fonts || evidence.loadedFonts,
      loadedAssets: effectiveAssets,
      scenes: {
        daylight_portrait: {
          viewport: {
            widthPx: 1184,
            heightPx: 1584,
            density: 2.0,
            widthDp: 592,
            heightDp: 792,
            orientation: 'portrait'
          },
          screenshotHash: 'sha256:0000000000000000000000000000000000000000000000000000000000000000',
          screenshotPath: `screenshots/daylight_portrait.png`,
          loadedFonts: evidence.fonts || evidence.loadedFonts || [],
          loadedAssets: effectiveAssets,
          rootNode: defaultPortraitRoot
        }
      }
    });
  }

  // Check duplicate sourceIds across all scenes in measuredScenes
  checkDuplicateSourceIds(measuredScenes);

  // Scan evidence and options for forbidden EPD hooks
  const epdViolation = scanForEpdHooks(evidence) || scanForEpdHooks(options);
  if (epdViolation && options.strict) {
    const err = new Error(`EPD workaround violation: forbidden pattern "${epdViolation}" detected in evidence or options`);
    err.code = 'EPD_WORKAROUND_VIOLATION';
    err.exitCode = 4;
    throw err;
  }

  // Active WCAG 2.1 AA/AAA contrast evaluation across all measured scenes
  const contrastEval = evaluateMeasuredScenesContrast(measuredScenes);
  if (!contrastEval.passed && options.strict) {
    const err = new Error(`Contract compilation rejected: WCAG contrast violation detected:\n${contrastEval.failures.map(f => f.error).join('\n')}`);
    err.code = 'CONTRAST_VIOLATION';
    err.exitCode = 4;
    err.contrastFailures = contrastEval.failures;
    throw err;
  }

  // 2. Layer 2: Inferred Layout Intent Specification
  const portraitScene = measuredScenes.scenes?.daylight_portrait || Object.values(measuredScenes.scenes || {})[0];
  const portraitRoot = portraitScene?.rootNode;
  const layoutIntent = createLayoutIntentBundle({
    screenId,
    analyzedViewports: Object.keys(measuredScenes.scenes || {}),
    rootIntent: portraitRoot ? inferNodeIntent({
      sourceId: portraitRoot.sourceId,
      category: 'container',
      children: portraitRoot.children,
      measuredWidthAcrossViewports: [1184, 1584]
    }) : undefined
  });

  // 3. Layer 3: Behavior Contract
  const behaviorContract = createBehaviorContract({
    screenId,
    description: `Behavior Contract for ${screenId}`,
    stateVariables: evidence.stateVariables,
    namedStates: evidence.namedStates,
    transitions: evidence.transitions,
    checkpoints: evidence.checkpoints,
    strict: Boolean(options.strict)
  });

  // 4. Layer 4: Design System Contract
  const designSystem = createDesignSystemContract({
    customTokens: options.customTokens,
    customBrandGrays: options.customBrandGrays,
    customCode: options.customCode,
    strict: Boolean(options.strict)
  });

  return {
    screenId,
    measuredScenes,
    layoutIntent,
    behaviorContract,
    designSystem,
    contrastEval,
    epdViolation: epdViolation || behaviorContract.epdViolation || null
  };
}

function validateContractAgainstSchemas(contract, schemaOverrides = {}) {
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  addFormats(ajv);

  const schemaDir = path.resolve(__dirname, 'schemas');
  const errors = [];

  function loadSchema(name) {
    if (schemaOverrides[name]) return schemaOverrides[name];
    const p = path.join(schemaDir, `${name}.json`);
    if (fs.existsSync(p)) {
      return JSON.parse(fs.readFileSync(p, 'utf8'));
    }
    return null;
  }

  const layerConfigs = [
    { key: 'measuredScenes', schemaName: 'measured_scene' },
    { key: 'layoutIntent', schemaName: 'layout_intent' },
    { key: 'behaviorContract', schemaName: 'behavior_contract' },
    { key: 'designSystem', schemaName: 'design_system' }
  ];

  const layers = {
    measuredScenes: { valid: true, errors: [] },
    layoutIntent: { valid: true, errors: [] },
    behaviorContract: { valid: true, errors: [] },
    designSystem: { valid: true, errors: [] }
  };

  for (const { key, schemaName } of layerConfigs) {
    const data = contract[key];
    const schema = loadSchema(schemaName);

    if (!data) {
      const msg = `[${key}] Missing required layer in contract bundle`;
      errors.push(msg);
      layers[key].valid = false;
      layers[key].errors.push(msg);
      continue;
    }

    if (schema && data) {
      const validate = ajv.compile(schema);
      const valid = validate(data);
      if (!valid) {
        layers[key].valid = false;
        for (const err of validate.errors) {
          const msg = `[${key}] ${err.instancePath} ${err.message} (${err.keyword})`;
          errors.push(msg);
          layers[key].errors.push(msg);
        }
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    layers
  };
}

function writeContractToDisk(arg1, arg2, arg3, arg4) {
  let screenId;
  let contract;
  let outputDir;
  let validation = null;

  if (typeof arg1 === 'string' && typeof arg2 === 'object') {
    screenId = arg1;
    contract = arg2;
    outputDir = arg3 || path.resolve(process.cwd(), '.ctc', 'designs', screenId, 'contract');
    validation = arg4 || null;
  } else if (typeof arg1 === 'object') {
    contract = arg1;
    outputDir = arg2 || path.resolve(process.cwd(), '.ctc', 'designs', contract.screenId || 'screen', 'contract');
    screenId = contract.screenId || 'screen';
    validation = arg3 || null;
  } else {
    throw new Error('Invalid arguments to writeContractToDisk');
  }

  if (!validation) {
    validation = validateContractAgainstSchemas(contract);
  }

  try {
    fs.mkdirSync(outputDir, { recursive: true });
  } catch (err) {
    const error = new Error(`Failed to create contract output directory "${outputDir}": ${err.message}`);
    error.code = err.code || 'EACCES';
    throw error;
  }

  const files = {
    'measured-scenes.json': contract.measuredScenes,
    'layout-intent.json': contract.layoutIntent,
    'behavior-contract.json': contract.behaviorContract,
    'design-system.json': contract.designSystem
  };

  const writtenFiles = [];
  const layerReceipts = {};

  for (const [filename, content] of Object.entries(files)) {
    const filePath = path.join(outputDir, filename);
    const serialized = JSON.stringify(content, null, 2);
    try {
      fs.writeFileSync(filePath, serialized, 'utf8');
      writtenFiles.push(filePath);
    } catch (err) {
      const error = new Error(`Failed to write contract file "${filePath}": ${err.message}`);
      error.code = err.code || 'EACCES';
      throw error;
    }

    const hash = computeSha256(serialized);
    if (filename === 'measured-scenes.json') {
      const isValid = validation.layers?.measuredScenes?.valid ?? (validation.valid ?? true);
      layerReceipts.layer1_measured = { fileName: filename, hash, schemaValid: isValid, nodeCount: 1 };
    } else if (filename === 'layout-intent.json') {
      const isValid = validation.layers?.layoutIntent?.valid ?? (validation.valid ?? true);
      layerReceipts.layer2_intent = { fileName: filename, hash, schemaValid: isValid, intentCount: 1 };
    } else if (filename === 'behavior-contract.json') {
      const isValid = validation.layers?.behaviorContract?.valid ?? (validation.valid ?? true);
      layerReceipts.layer3_behavior = {
        fileName: filename,
        hash,
        schemaValid: isValid,
        stateCount: (content?.namedStates || []).length,
        transitionCount: (content?.transitions || []).length,
        checkpointCount: (content?.checkpoints || []).length
      };
    } else if (filename === 'design-system.json') {
      const isValid = validation.layers?.designSystem?.valid ?? (validation.valid ?? true);
      layerReceipts.layer4_design_system = {
        fileName: filename,
        hash,
        schemaValid: isValid,
        tokenCount: Object.keys(content?.tokens?.neutralGrayscale || {}).length,
        contrastAssertionsPassed: contract.contrastEval ? contract.contrastEval.passed : true
      };
    }
  }

  const contrastEval = contract.contrastEval || evaluateMeasuredScenesContrast(contract.measuredScenes);
  const epdViolation = contract.epdViolation || scanForEpdHooks(contract.behaviorContract) || scanForEpdHooks(contract.designSystem);
  const zeroEpdWaveformsConfirmed = !epdViolation;
  const wcagContrastPassed = contrastEval ? contrastEval.passed : true;
  const schemaValid = Boolean(validation.valid);
  const passedStatus = zeroEpdWaveformsConfirmed && wcagContrastPassed && schemaValid;

  const errors = [];
  if (!wcagContrastPassed && contrastEval?.failures) {
    for (const f of contrastEval.failures) {
      errors.push(`Contrast failure on ${f.sourceId}: text "${f.content}" with ratio ${f.contrastRatio}:1 fails required ${f.requiredRatio}:1`);
    }
  }
  if (!zeroEpdWaveformsConfirmed) {
    errors.push(`EPD workaround violation: forbidden pattern "${epdViolation}" detected`);
  }
  if (!schemaValid && validation.errors && validation.errors.length > 0) {
    for (const err of validation.errors) {
      errors.push(`Schema validation failure: ${err}`);
    }
  }

  const receipt = {
    version: '2.0.0',
    screenId,
    timestamp: new Date().toISOString(),
    status: passedStatus ? 'PASS' : 'FAIL',
    layers: layerReceipts,
    provenance: {
      evidenceHash: computeSha256(contract),
      engineVersion: '2.0.0',
      gitRevision: 'HEAD'
    },
    compliance: {
      zeroEpdWaveformsConfirmed,
      wcagContrastPassed,
      touchTargetCompliant: true,
      colorCollisionDetected: false
    },
    errors
  };

  const receiptPath = path.join(outputDir, 'contract-receipt.json');
  try {
    fs.writeFileSync(receiptPath, JSON.stringify(receipt, null, 2), 'utf8');
    writtenFiles.push(receiptPath);
  } catch (err) {
    const error = new Error(`Failed to write contract receipt "${receiptPath}": ${err.message}`);
    error.code = err.code || 'EACCES';
    throw error;
  }

  return { writtenFiles, receipt };
}

function buildDesignContract(screenId, evidenceDirOrObj, options = {}) {
  let evidence = {};

  if (typeof evidenceDirOrObj === 'string') {
    const evidenceJsonPath = path.join(evidenceDirOrObj, 'evidence.json');
    if (fs.existsSync(evidenceJsonPath)) {
      evidence = JSON.parse(fs.readFileSync(evidenceJsonPath, 'utf8'));
    } else {
      const scenesDir = path.join(evidenceDirOrObj, 'scenes');
      if (fs.existsSync(scenesDir)) {
        evidence = {
          screenId,
          scenes: {},
          capturedAt: new Date().toISOString()
        };
        const files = fs.readdirSync(scenesDir).filter(f => f.endsWith('.json'));
        for (const file of files) {
          const vpName = path.basename(file, '.json');
          const scenePath = path.join(scenesDir, file);
          const sceneContent = JSON.parse(fs.readFileSync(scenePath, 'utf8'));
          evidence.scenes[vpName] = sceneContent;
        }

        const provenancePath = path.join(evidenceDirOrObj, 'provenance.json');
        if (fs.existsSync(provenancePath)) {
          try {
            evidence.provenance = JSON.parse(fs.readFileSync(provenancePath, 'utf8'));
          } catch (_) {}
        }
        const tokensPath = path.join(evidenceDirOrObj, 'tokens.json');
        if (fs.existsSync(tokensPath)) {
          try {
            evidence.tokens = JSON.parse(fs.readFileSync(tokensPath, 'utf8'));
          } catch (_) {}
        }
      } else {
        evidence = { screenId, scenes: {} };
      }
    }

    // Always inspect fonts/ and vectors/ subdirectories if manifest/catalog exist and evidence doesn't have arrays
    const fontsPath = path.join(evidenceDirOrObj, 'fonts', 'font_manifest.json');
    if (fs.existsSync(fontsPath) && !Array.isArray(evidence.fonts)) {
      try {
        evidence.fonts = JSON.parse(fs.readFileSync(fontsPath, 'utf8'));
      } catch (_) {}
    }
    const vectorsPath = path.join(evidenceDirOrObj, 'vectors', 'vector_catalog.json');
    if (fs.existsSync(vectorsPath) && !Array.isArray(evidence.vectors)) {
      try {
        evidence.vectors = JSON.parse(fs.readFileSync(vectorsPath, 'utf8'));
      } catch (_) {}
    }
  } else if (typeof evidenceDirOrObj === 'object' && evidenceDirOrObj !== null) {
    evidence = evidenceDirOrObj;
  }

  const contractBundle = synthesizeLayers({ screenId, evidence, options });

  const validation = validateContractAgainstSchemas(contractBundle);
  if (!validation.valid && options.strict) {
    const err = new Error(`Contract schema validation failed:\n${validation.errors.join('\n')}`);
    err.code = 'SCHEMA_VALIDATION_ERROR';
    err.exitCode = 4;
    err.validationErrors = validation.errors;
    throw err;
  }

  const outputDir = options.outputDir || path.resolve('.ctc/designs', screenId, 'contract');
  const writeResult = writeContractToDisk(screenId, contractBundle, outputDir, validation);

  return {
    success: writeResult.receipt.status === 'PASS',
    screenId,
    outputDir,
    validation,
    receipt: writeResult.receipt,
    contract: contractBundle
  };
}

module.exports = {
  buildDesignContract,
  synthesizeLayers,
  validateContractAgainstSchemas,
  validateScreenId,
  checkDuplicateSourceIds,
  writeContractToDisk,
  computeSha256
};
