#!/usr/bin/env node

/**
 * verification/drift_resolver.js
 *
 * Spatial Drift Vector & Coordinate Resolver for claude-to-compose.
 * Translates empirical visual drift vectors (Δx, Δy) and dimension deltas (Δw, Δh)
 * from zonal perceptual diffing into deterministic Android Jetpack Compose
 * layout and typography modifiers:
 *   - Modifier.offset(x, y) for floating overlays and annotations
 *   - Modifier.padding(start, top) for in-flow layouts and containers
 *   - Modifier.size(width, height) / Modifier.width(...) for bound adjustments
 *   - Arrangement.spacedBy(...) for container spacing deltas
 *   - TextStyle(letterSpacing, lineHeight, fontSize, platformStyle, lineHeightStyle)
 */

const fs = require('fs');
const path = require('path');
const { Command } = require('commander');

/**
 * Helper to format dp numbers cleanly into Compose Kotlin syntax.
 * e.g. 10 -> "10.dp", -12.5 -> "(-12.5).dp"
 */
function formatDp(val) {
  const rounded = parseFloat(Number(val).toFixed(2));
  if (rounded < 0) {
    return `(${rounded}).dp`;
  }
  return `${rounded}.dp`;
}

/**
 * Helper to format sp numbers cleanly into Compose Kotlin syntax.
 * e.g. 16 -> "16.sp", -2.61 -> "(-2.61).sp"
 */
function formatSp(val) {
  const rounded = parseFloat(Number(val).toFixed(2));
  if (rounded < 0) {
    return `(${rounded}).sp`;
  }
  return `${rounded}.sp`;
}

class DriftResolver {
  /**
   * @param {Object} options
   * @param {number} [options.scale=2.0] Device pixel ratio / viewport scale (physical px to dp)
   * @param {number} [options.toleranceDp=0.5] Minimum drift threshold in dp to trigger adjustment
   * @param {number} [options.tolerancePx=1.0] Minimum drift threshold in px to trigger adjustment
   */
  constructor(options = {}) {
    this.scale = options.scale !== undefined ? options.scale : 2.0;
    this.toleranceDp = options.toleranceDp !== undefined ? options.toleranceDp : 0.5;
    this.tolerancePx = options.tolerancePx !== undefined ? options.tolerancePx : 1.0;
  }

  /**
   * Main entrypoint: Takes zonalReport (or drift vectors) and design spec, produces resolution plan.
   *
   * @param {Object} zonalReport Zonal diff report containing driftVectors and metrics
   * @param {Object} [designSpec] Full design_spec.json hierarchy or element mapping
   * @param {Object} [options] Optional override options
   * @returns {Object} Structured resolution plan with directives and summary
   */
  resolve(zonalReport, designSpec, options = {}) {
    const vectors = zonalReport.driftVectors || (Array.isArray(zonalReport) ? zonalReport : []);
    const specIndex = this._indexSpec(designSpec);

    const directives = [];
    let driftedCount = 0;
    let alignedCount = 0;
    let maxShiftPx = 0.0;

    for (const vec of vectors) {
      const shiftMag = vec.shiftMagnitude !== undefined
        ? vec.shiftMagnitude
        : Math.sqrt((vec.dx || 0) ** 2 + (vec.dy || 0) ** 2);

      if (shiftMag > maxShiftPx) {
        maxShiftPx = shiftMag;
      }

      const dxDp = vec.dxDp !== undefined ? vec.dxDp : (vec.dx || 0) / this.scale;
      const dyDp = vec.dyDp !== undefined ? vec.dyDp : (vec.dy || 0) / this.scale;

      const isDrifted = vec.status === 'DRIFTED' ||
        Math.abs(dxDp) >= this.toleranceDp ||
        Math.abs(dyDp) >= this.toleranceDp ||
        shiftMag >= this.tolerancePx;

      if (!isDrifted && vec.passed !== false) {
        alignedCount++;
        continue;
      }

      driftedCount++;
      const nodeSpec = specIndex.get(vec.elementId) || null;
      const directive = this.resolveElementDirective(vec, nodeSpec);
      directives.push(directive);
    }

    // Check for container spacing deltas among sibling groups
    const spacingDirectives = this.resolveContainerSpacing(vectors, specIndex);
    if (spacingDirectives.length > 0) {
      for (const sd of spacingDirectives) {
        directives.push(sd);
      }
    }

    return {
      summary: {
        totalEvaluated: vectors.length,
        driftedCount,
        alignedCount,
        maxSpatialShiftPx: parseFloat(maxShiftPx.toFixed(2)),
        scale: this.scale,
        toleranceDp: this.toleranceDp
      },
      directives,
      tuningDirectives: directives
    };
  }

  /**
   * Resolves layout and typography directives for a single drift vector.
   *
   * @param {Object} vec Drift vector from zonal_diff
   * @param {Object|null} nodeSpec Node specification from design_spec
   * @returns {Object} Structured element directive
   */
  resolveElementDirective(vec, nodeSpec = null) {
    const dx = vec.dx || 0;
    const dy = vec.dy || 0;
    const dxDp = vec.dxDp !== undefined ? vec.dxDp : parseFloat((dx / this.scale).toFixed(2));
    const dyDp = vec.dyDp !== undefined ? vec.dyDp : parseFloat((dy / this.scale).toFixed(2));

    const dWidth = vec.dWidth !== undefined ? vec.dWidth : 0;
    const dHeight = vec.dHeight !== undefined ? vec.dHeight : 0;
    const dWidthDp = parseFloat((dWidth / this.scale).toFixed(2));
    const dHeightDp = parseFloat((dHeight / this.scale).toFixed(2));
    const shiftMag = vec.shiftMagnitude !== undefined ? vec.shiftMagnitude : Math.sqrt(dx * dx + dy * dy);

    const category = vec.category || (nodeSpec ? nodeSpec.type : 'unknown');
    const isOverlay = category === 'pill' ||
      category === 'overlay' ||
      category === 'badge' ||
      category === 'dialog' ||
      category === 'toolbar' ||
      (nodeSpec?.style?.position === 'absolute');

    const isText = category === 'heading' ||
      category === 'paragraph' ||
      category === 'text' ||
      Boolean(vec.text || nodeSpec?.text);

    // Inverse compensation vectors:
    // If rendered element is displaced by +dx (to the right), we shift by -dx (to the left)
    const compensationXDp = -dxDp;
    const compensationYDp = -dyDp;

    const directive = {
      elementId: vec.elementId,
      name: vec.name || vec.elementId,
      category,
      measuredShift: {
        dx,
        dy,
        dxDp,
        dyDp,
        magnitude: parseFloat(shiftMag.toFixed(2))
      },
      dimensionShift: {
        dWidth,
        dHeight,
        dWidthDp,
        dHeightDp
      },
      layoutModifiers: {},
      typography: null,
      kotlinSnippets: []
    };

    // 1. Translation Resolution: Modifier.offset vs Modifier.padding
    if (isOverlay) {
      directive.layoutModifiers.offset = {
        type: 'offset',
        deltaX: compensationXDp,
        deltaY: compensationYDp,
        snippet: `Modifier.offset(x = ${formatDp(compensationXDp)}, y = ${formatDp(compensationYDp)})`
      };
      directive.kotlinSnippets.push(directive.layoutModifiers.offset.snippet);
    } else {
      directive.layoutModifiers.padding = {
        type: 'padding',
        deltaStart: compensationXDp,
        deltaTop: compensationYDp,
        snippet: `Modifier.padding(start = ${formatDp(compensationXDp)}, top = ${formatDp(compensationYDp)})`
      };
      directive.kotlinSnippets.push(directive.layoutModifiers.padding.snippet);
    }

    // 2. Dimension Resolution: Modifier.size, width, height
    const hasWidthDrift = Math.abs(dWidthDp) >= this.toleranceDp;
    const hasHeightDrift = Math.abs(dHeightDp) >= this.toleranceDp;

    if (hasWidthDrift || hasHeightDrift) {
      // Special case: Category labels wrapping onto multiple lines (e.g. "BEYOND THE BAR" in e34f)
      const textContent = vec.text || nodeSpec?.text?.content || '';
      if (textContent.length > 10 && dHeightDp > 8 && dWidthDp < 0) {
        // Multi-line wrap collapse detected! Expand container width
        const charCount = textContent.length;
        const estimatedMinWidth = Math.ceil(charCount * 9.5 + 10);
        const resolvedWidth = Math.max(140, estimatedMinWidth);

        directive.layoutModifiers.width = {
          type: 'width',
          widthDp: resolvedWidth,
          reason: 'multi_line_wrap_prevention',
          snippet: `Modifier.width(${resolvedWidth}.dp)`
        };
        directive.kotlinSnippets.push(directive.layoutModifiers.width.snippet);
      } else {
        const sizeMod = {
          type: 'size',
          adjustWidthDp: -dWidthDp,
          adjustHeightDp: -dHeightDp
        };

        if (hasWidthDrift && hasHeightDrift) {
          sizeMod.snippet = `Modifier.size(width = ${formatDp(-dWidthDp)}, height = ${formatDp(-dHeightDp)})`;
        } else if (hasWidthDrift) {
          sizeMod.snippet = `Modifier.width(${formatDp(-dWidthDp)})`;
        } else {
          sizeMod.snippet = `Modifier.height(${formatDp(-dHeightDp)})`;
        }
        directive.layoutModifiers.size = sizeMod;
        directive.kotlinSnippets.push(sizeMod.snippet);
      }
    }

    // 3. Typography Resolution: letterSpacing, lineHeight, fontSize, platformStyle
    if (isText) {
      const specText = nodeSpec?.text || (nodeSpec?.style ? {
        fontSize: nodeSpec.style.fontSize,
        lineHeight: nodeSpec.style.lineHeight,
        letterSpacing: nodeSpec.style.letterSpacing,
        fontFamily: nodeSpec.style.fontFamily
      } : null);

      if (specText) {
        let resolvedLetterSpacing = specText.letterSpacing !== undefined ? specText.letterSpacing : null;
        let resolvedLineHeight = specText.lineHeight !== undefined ? specText.lineHeight : null;
        const resolvedFontSize = specText.fontSize !== undefined ? specText.fontSize : null;

        // If rendered element is wider than reference, tracking might need negative adjustment
        if (dWidthDp > 0 && vec.text && resolvedLetterSpacing === null) {
          const charCount = Math.max(1, vec.text.length);
          const excessTrackingPerChar = dWidthDp / charCount;
          if (excessTrackingPerChar >= 0.1) {
            resolvedLetterSpacing = parseFloat((-excessTrackingPerChar).toFixed(2));
          }
        }

        const typo = {
          fontSize: resolvedFontSize !== null ? `${resolvedFontSize}sp` : undefined,
          lineHeight: resolvedLineHeight !== null ? `${resolvedLineHeight}sp` : undefined,
          letterSpacing: resolvedLetterSpacing !== null ? `${resolvedLetterSpacing}sp` : undefined,
          includeFontPadding: false,
          lineHeightStyle: 'LineHeightStyle(alignment = LineHeightStyle.Alignment.Center, trim = LineHeightStyle.Trim.Both)'
        };

        const params = [];
        if (resolvedFontSize !== null && resolvedFontSize >= 36) {
          params.push('fontFamily = AbcArizonaFlareHeadline');
          typo.fontFamily = 'AbcArizonaFlareHeadline';
          typo.opticalSize = 48;
        }
        if (resolvedFontSize !== null) params.push(`fontSize = ${formatSp(resolvedFontSize)}`);
        if (resolvedLineHeight !== null) params.push(`lineHeight = ${formatSp(resolvedLineHeight)}`);
        if (resolvedLetterSpacing !== null) params.push(`letterSpacing = ${formatSp(resolvedLetterSpacing)}`);
        params.push(`platformStyle = BasePlatformTextStyle`);
        params.push(`lineHeightStyle = BaseLineHeightStyle`);

        typo.snippet = `TextStyle(${params.join(', ')})`;
        directive.typography = typo;
        directive.kotlinSnippets.push(typo.snippet);
      }
    }

    return directive;
  }

  /**
   * Resolves container spacing (Arrangement.spacedBy) for collections of sibling items
   * that exhibit progressive, cumulative drift.
   *
   * @param {Array<Object>} vectors
   * @param {Map<string, Object>} specIndex
   * @returns {Array<Object>} Spacing directives
   */
  resolveContainerSpacing(vectors, specIndex) {
    const directives = [];
    if (!Array.isArray(vectors) || vectors.length < 3) return directives;

    // Group vectors by category or prefix (e.g. pill rows, list items)
    const groups = new Map();
    for (const v of vectors) {
      const key = v.category || 'default';
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(v);
    }

    for (const [category, items] of groups.entries()) {
      if (items.length < 3) continue;

      // Check for progressive vertical drift: Δy_k = Δy_0 + k * δ_gap
      let isProgressiveY = true;
      const yDeltas = [];
      for (let i = 0; i < items.length; i++) {
        const itemDyDp = items[i].dyDp !== undefined ? items[i].dyDp : (items[i].dy || 0) / this.scale;
        yDeltas.push(itemDyDp);
      }

      const diffs = [];
      for (let i = 1; i < yDeltas.length; i++) {
        diffs.push(yDeltas[i] - yDeltas[i - 1]);
      }

      const avgDiff = diffs.reduce((a, b) => a + b, 0) / diffs.length;
      if (Math.abs(avgDiff) >= this.toleranceDp) {
        // Cumulative drift detected: adjust container spacedBy
        const compensationGapDp = parseFloat((-avgDiff).toFixed(2));
        directives.push({
          type: 'containerSpacing',
          category,
          axis: 'vertical',
          elementCount: items.length,
          driftStepDp: parseFloat(avgDiff.toFixed(2)),
          compensationGapDp,
          layoutModifiers: {
            spacedBy: {
              deltaGapDp: compensationGapDp,
              snippet: `verticalArrangement = Arrangement.spacedBy(${formatDp(compensationGapDp)})`
            }
          },
          kotlinSnippets: [`verticalArrangement = Arrangement.spacedBy(${formatDp(compensationGapDp)})`]
        });
      }
    }

    return directives;
  }

  /**
   * Generates formatted Kotlin patch code from an element directive.
   *
   * @param {Object} directive
   * @returns {string} Kotlin code snippet
   */
  formatKotlinPatch(directive) {
    return directive.kotlinSnippets.join('\n');
  }

  /**
   * Helper to build a lookup map from design_spec hierarchy.
   */
  _indexSpec(designSpec) {
    const map = new Map();
    if (!designSpec) return map;

    // If designSpec is already a Map, return it
    if (designSpec instanceof Map) return designSpec;

    // If designSpec is an array of elements
    if (Array.isArray(designSpec)) {
      for (const item of designSpec) {
        if (item && item.id) map.set(item.id, item);
      }
      return map;
    }

    // If designSpec has hierarchy
    const walk = (node) => {
      if (!node) return;
      if (node.id) map.set(node.id, node);
      if (Array.isArray(node.children)) {
        for (const child of node.children) {
          walk(child);
        }
      }
    };

    if (designSpec.hierarchy) {
      walk(designSpec.hierarchy);
    } else if (designSpec.elements) {
      for (const el of designSpec.elements) {
        if (el && el.id) map.set(el.id, el);
      }
    }

    return map;
  }
}

/**
 * Functional export as required by DISPATCH.md:
 * resolveDrift(driftVectors, elementBboxes, options)
 *
 * @param {Array<Object>} driftVectors Measured drift vectors from zonal diff
 * @param {Object|Map} [elementBboxes] Design spec elements / bounds
 * @param {Object} [options] Tuning options (scale, toleranceDp, etc.)
 * @returns {Object} Resolution plan
 */
function resolveDrift(driftVectors, elementBboxes = null, options = {}) {
  const resolver = new DriftResolver(options);
  const zonalReport = {
    driftVectors: Array.isArray(driftVectors) ? driftVectors : []
  };
  return resolver.resolve(zonalReport, elementBboxes, options);
}

// CLI Execution
if (require.main === module) {
  const program = new Command();

  program
    .name('drift_resolver')
    .description('Spatial Drift Vector & Coordinate Resolver for claude-to-compose')
    .option('-z, --zonal <path>', 'Path to zonal_diff.json', 'verification/zonal_diff.json')
    .option('-s, --spec <path>', 'Path to design_spec.json')
    .option('--scale <number>', 'Device pixel ratio / scale factor', parseFloat, 2.0)
    .option('--json', 'Output resolution plan as JSON', false)
    .parse(process.argv);

  const opts = program.opts();
  const zonalPath = path.resolve(opts.zonal);

  if (!fs.existsSync(zonalPath)) {
    console.error(`Error: Zonal diff file not found at ${zonalPath}`);
    process.exit(1);
  }

  const zonalData = JSON.parse(fs.readFileSync(zonalPath, 'utf-8'));
  let specData = null;
  if (opts.spec && fs.existsSync(path.resolve(opts.spec))) {
    specData = JSON.parse(fs.readFileSync(path.resolve(opts.spec), 'utf-8'));
  }

  const resolver = new DriftResolver({ scale: opts.scale });
  const plan = resolver.resolve(zonalData, specData);

  if (opts.json) {
    console.log(JSON.stringify(plan, null, 2));
  } else {
    console.log('\n=== Spatial Drift Vector Resolution Plan ===\n');
    console.log(`Total evaluated: ${plan.summary.totalEvaluated}`);
    console.log(`Drifted elements: ${plan.summary.driftedCount}`);
    console.log(`Max spatial shift: ${plan.summary.maxSpatialShiftPx} px\n`);

    for (const d of plan.directives) {
      console.log(`Element: ${d.name} (${d.elementId}) [${d.category}]`);
      console.log(`  Measured Shift: dx = ${d.measuredShift.dx}px (${d.measuredShift.dxDp}dp), dy = ${d.measuredShift.dy}px (${d.measuredShift.dyDp}dp)`);
      if (d.kotlinSnippets.length > 0) {
        console.log(`  Target Modifiers:`);
        d.kotlinSnippets.forEach(s => console.log(`    ${s}`));
      }
      console.log('');
    }
  }
}

module.exports = {
  DriftResolver,
  resolveDrift,
  formatDp,
  formatSp
};
