'use strict';

/**
 * compiler_v2/index.js
 *
 * Main entrypoint for the v2 Design Compiler & Conformance Package pipeline.
 */

const fs = require('fs');
const path = require('path');
const { buildDesignIR } = require('./ir/builder');
const { validateDesignIR } = require('./ir/validator');
const { compileIRToCompose } = require('./backend/lowering_engine');
const { generateMappingReport } = require('./conformance/mapping_reporter');
const { generateFeatureMatrix } = require('./conformance/feature_matrix');
const { generateHandoffGuide } = require('./conformance/handoff_generator');

function compileDesignPackage(inputScenePath, outputOptions = {}) {
  const conformanceDir = outputOptions.conformanceDir || 'output/conformance';
  const kotlinOutputDir = outputOptions.kotlinOutputDir || 'android/app/src/main/java/com/claude/compose/screen';
  // 1. Ingest & validate scene
  const rawScene = JSON.parse(fs.readFileSync(inputScenePath, 'utf8'));
  const screenName = outputOptions.screenName || (rawScene.metadata?.orientation === 'landscape' ? 'GeneratedDc1LandscapeScreen' : 'GeneratedDc1Screen');
  const ir = buildDesignIR(rawScene);
  const validation = validateDesignIR(ir);

  if (!validation.valid) {
    throw new Error(`IR Validation failed: ${validation.errors.join('; ')}`);
  }

  // Write Deliverable 1: Evidence-preserving Intermediate Representation
  if (!fs.existsSync(conformanceDir)) {
    fs.mkdirSync(conformanceDir, { recursive: true });
  }
  const irPath = path.join(conformanceDir, 'design_ir.json');
  fs.writeFileSync(irPath, JSON.stringify(ir, null, 2), 'utf8');
  const inputDir = path.dirname(inputScenePath);
  try {
    fs.writeFileSync(path.join(inputDir, 'design_ir.json'), JSON.stringify(ir, null, 2), 'utf8');
  } catch (e) {
    // ignore if inputDir is read-only
  }

  // 2. Compile to Compose via capability-aware lowering engine
  const compilation = compileIRToCompose(ir, { screenName });

  // 3. Write generated Compose screen file
  if (!fs.existsSync(kotlinOutputDir)) {
    fs.mkdirSync(kotlinOutputDir, { recursive: true });
  }
  const screenFilePath = path.join(kotlinOutputDir, `${screenName}.kt`);
  fs.writeFileSync(screenFilePath, compilation.kotlinCode, 'utf8');

  // 4. Generate Deliverable 2: Lowering Mapping Report
  const mapping = generateMappingReport(compilation.telemetry, conformanceDir);

  // 5. Generate Deliverable 3: Feature Capability Matrix
  const matrix = generateFeatureMatrix(conformanceDir);

  // 6. Generate Developer Handoff Instructions
  const handoff = generateHandoffGuide(conformanceDir);

  return {
    success: true,
    ir,
    screenFilePath,
    mapping,
    matrix,
    handoff
  };
}

// CLI execution if run directly
if (require.main === module) {
  const input = process.argv[2] || 'benchmarks/dc1_onboarding/source_scene.json';
  try {
    const res = compileDesignPackage(input);
    console.log(`[v2 Compiler] Compilation complete.`);
    console.log(`- Screen File: ${res.screenFilePath}`);
    console.log(`- Mappings: output/conformance/mapping_report.md`);
    console.log(`- Feature Matrix: output/conformance/feature_matrix.json`);
    console.log(`- Handoff Guide: output/conformance/DEV_HANDOFF.md`);
  } catch (err) {
    console.error(`[v2 Compiler] Error:`, err.message);
    process.exit(1);
  }
}

module.exports = {
  compileDesignPackage
};
