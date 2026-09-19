#!/usr/bin/env node

/**
 * synthesizer/index.js
 * Main CLI orchestrator and programmatic entrypoint for the Jetpack Compose Synthesizer.
 * Ingests design_spec.json and coordinates token, vector, motion, component, and screen generators.
 */

const fs = require('node:fs');
const path = require('node:path');
const { Command } = require('commander');

// Subsystem generators
const { TokenGenerator } = require('./token_generator');
const { ComponentGenerator } = require('./component_generator');
const { ScreenGenerator } = require('./screen_generator');
const { VectorGenerator } = require('./vector_generator');
const { MotionGenerator } = require('./motion_generator');

/**
 * Resolves and normalizes output directory and package directory paths
 * to avoid duplicate package segments (e.g. java/com/claude/compose/java/com/claude/compose).
 *
 * @param {string} rawOutput - Provided --output option or default
 * @param {string} basePackage - e.g. "com.claude.compose"
 * @returns {{ packageDir: string, drawableDir: string, srcMainDir: string }}
 */
function normalizeOutputPaths(rawOutput, basePackage = 'com.claude.compose') {
  const resolved = path.resolve(rawOutput || 'android/app/src/main');
  const pkgParts = basePackage.split('.').filter(Boolean);
  const pkgRelPath = path.join(...pkgParts);
  const javaPkgRelPath = path.join('java', pkgRelPath);

  let packageDir;
  let srcMainDir;

  if (resolved.endsWith(javaPkgRelPath)) {
    // User passed .../java/com/claude/compose
    packageDir = resolved;
    srcMainDir = resolved.slice(0, -(javaPkgRelPath.length + 1));
  } else if (resolved.endsWith(pkgRelPath)) {
    // User passed .../com/claude/compose
    packageDir = resolved;
    const parent = path.dirname(resolved);
    srcMainDir = path.basename(parent) === 'java' ? path.dirname(parent) : parent;
  } else if (path.basename(resolved) === 'java') {
    // User passed .../src/main/java
    packageDir = path.join(resolved, ...pkgParts);
    srcMainDir = path.dirname(resolved);
  } else {
    // Default: User passed .../src/main or arbitrary target directory
    packageDir = path.join(resolved, 'java', ...pkgParts);
    srcMainDir = resolved;
  }

  const drawableDir = path.join(srcMainDir, 'res', 'drawable');

  return {
    packageDir,
    drawableDir,
    srcMainDir
  };
}

class SynthesizerOrchestrator {
  /**
   * Executes the full synthesis pipeline.
   * @param {Object} options - CLI and configuration options
   * @returns {Object} Synthesis result summary
   */
  static synthesize(options) {
    if (!options || !options.spec) {
      throw new Error("MissingArgumentError: Path to design_spec.json is required via '--spec <path>'");
    }

    const specPath = path.resolve(options.spec);
    if (!fs.existsSync(specPath)) {
      throw new Error(`DesignSpecNotFoundError: Specified file does not exist at '${specPath}'`);
    }

    let spec;
    try {
      const specContent = fs.readFileSync(specPath, 'utf8');
      spec = JSON.parse(specContent);
    } catch (err) {
      throw new Error(`DesignSpecParseError: Failed to parse JSON spec: ${err.message}`);
    }

    const basePackage = options.package || 'com.claude.compose';
    const vectorTarget = options.vectorTarget || 'both'; // 'both', 'compose', 'xml'

    const { packageDir, drawableDir, srcMainDir } = normalizeOutputPaths(options.output, basePackage);
    const outputDir = srcMainDir;

    const themeDir = path.join(packageDir, 'theme');
    const iconsDir = path.join(packageDir, 'icons');
    const motionDir = path.join(packageDir, 'motion');
    const componentsDir = path.join(packageDir, 'components');
    const screenDir = path.join(packageDir, 'screen');

    // Clean if requested
    if (options.clean) {
      [themeDir, iconsDir, motionDir, componentsDir, screenDir].forEach(dir => {
        if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
      });
    }

    // Create directory tree
    [themeDir, iconsDir, motionDir, componentsDir, screenDir, drawableDir].forEach(dir => {
      fs.mkdirSync(dir, { recursive: true });
    });

    const emittedFiles = [];

    // 1. Tokens Synthesis
    const tokenFiles = TokenGenerator.generateTokens(spec.theme || {}, {
      outputDir: themeDir,
      packageName: `${basePackage}.theme`
    });
    if (Array.isArray(tokenFiles)) {
      tokenFiles.forEach(f => emittedFiles.push({ path: f, type: 'DesignToken' }));
    }

    // 2. Vector Graphics Synthesis
    const vectors = (spec.vectors || []).filter(v => v && typeof v === 'object');
    if (vectorTarget === 'compose' || vectorTarget === 'both') {
      const imageVectorCode = VectorGenerator.generateImageVectorFile(vectors, {
        packageName: `${basePackage}.icons`,
        className: 'ClaudeIcons'
      });
      const iconFilePath = path.join(iconsDir, 'ClaudeIcons.kt');
      fs.writeFileSync(iconFilePath, imageVectorCode, 'utf8');
      emittedFiles.push({ path: iconFilePath, type: 'ImageVector', count: vectors.length });
    }

    if (vectorTarget === 'xml' || vectorTarget === 'both') {
      for (let i = 0; i < vectors.length; i++) {
        const vec = vectors[i];
        const resName = `ic_${VectorGenerator.toSnakeCase(vec.name || `icon_${i + 1}`)}.xml`;
        const xmlContent = VectorGenerator.generateVectorDrawableXml(vec);
        const xmlPath = path.join(drawableDir, resName);
        fs.writeFileSync(xmlPath, xmlContent, 'utf8');
        emittedFiles.push({ path: xmlPath, type: 'VectorDrawable', name: resName });
      }
    }

    // 3. Motion & UX Synthesis
    const touchTargetCode = MotionGenerator.generateTouchTargetKotlinFile(`${basePackage}.motion`);
    const touchTargetPath = path.join(motionDir, 'TouchTarget.kt');
    fs.writeFileSync(touchTargetPath, touchTargetCode, 'utf8');
    emittedFiles.push({ path: touchTargetPath, type: 'MotionHelper' });

    const motionTokensCode = MotionGenerator.generateMotionTokensKotlinFile(`${basePackage}.motion`);
    const motionTokensPath = path.join(motionDir, 'MotionTokens.kt');
    fs.writeFileSync(motionTokensPath, motionTokensCode, 'utf8');
    emittedFiles.push({ path: motionTokensPath, type: 'MotionTokens' });

    // 4. Atomic Components Synthesis
    const compFiles = ComponentGenerator.generateComponents(spec.hierarchy, {
      outputDir: componentsDir,
      packageName: `${basePackage}.components`
    });
    if (Array.isArray(compFiles)) {
      compFiles.forEach(f => emittedFiles.push({ path: f, type: 'AtomicComponent' }));
    }

    // 5. Full Screen Assembly & Previews
    const screenFiles = ScreenGenerator.generateScreen(spec, {
      outputDir: screenDir,
      packageName: `${basePackage}.screen`
    });
    if (Array.isArray(screenFiles)) {
      screenFiles.forEach(f => emittedFiles.push({ path: f, type: 'ScreenAssembly' }));
    }

    return {
      status: 'SUCCESS',
      specPath,
      outputDir,
      basePackage,
      vectorCount: vectors.length,
      emittedFilesCount: emittedFiles.length,
      emittedFiles
    };
  }
}

// CLI Execution Entry Point
if (require.main === module) {
  const program = new Command();

  program
    .name('claude-synthesize')
    .description('Jetpack Compose & UX Code Synthesizer translating design_spec.json to Kotlin Material 3 code.')
    .version('1.0.0')
    .requiredOption('-s, --spec <path>', 'Path to design_spec.json')
    .option('-o, --output <dir>', 'Target Android src/main directory', 'android/app/src/main')
    .option('-p, --package <pkg>', 'Kotlin base package name', 'com.claude.compose')
    .option('--vector-target <target>', 'Vector format: compose, xml, or both', 'both')
    .option('--clean', 'Clean existing generated files before synthesizing', false)
    .action((options) => {
      try {
        const result = SynthesizerOrchestrator.synthesize(options);
        console.log(`[SYNTHESIZER] Successfully synthesized Jetpack Compose codebase:`);
        console.log(`  Spec Source:        ${result.specPath}`);
        console.log(`  Output Dir:         ${result.outputDir}`);
        console.log(`  Base Package:       ${result.basePackage}`);
        console.log(`  Vectors Extracted:  ${result.vectorCount}`);
        console.log(`  Total Files Emitted:${result.emittedFilesCount}`);
        result.emittedFiles.forEach(f => console.log(`   + ${path.relative(result.outputDir, f.path)}`));
      } catch (err) {
        console.error(`[SYNTHESIZER ERROR] ${err.message}`);
        process.exit(1);
      }
    });

  program.parse(process.argv);
}

module.exports = {
  SynthesizerOrchestrator,
  synthesize: SynthesizerOrchestrator.synthesize,
  normalizeOutputPaths
};
