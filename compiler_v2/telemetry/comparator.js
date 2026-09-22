'use strict';

/**
 * compiler_v2/telemetry/comparator.js
 *
 * Compares Design IR layout specifications directly against native Compose
 * layout telemetry (extracted from Compose Semantics boundsInRoot).
 */

const fs = require('fs');
const path = require('path');

function compareTelemetry(irOrPath, telemetryOrPath, options = {}) {
  const maxDriftPx = options.maxDriftPx !== undefined ? options.maxDriftPx : 3.0;

  const ir = typeof irOrPath === 'string' ? JSON.parse(fs.readFileSync(irOrPath, 'utf8')) : irOrPath;
  const telemetry = typeof telemetryOrPath === 'string' ? JSON.parse(fs.readFileSync(telemetryOrPath, 'utf8')) : telemetryOrPath;

  const results = [];
  let allPass = true;

  // Flatten IR nodes
  const irNodes = [];
  function traverse(node) {
    if (!node) return;
    if (node.sourceId && (node.measured?.bounds || node.bounds)) {
      irNodes.push(node);
    }
    if (node.children && Array.isArray(node.children)) {
      node.children.forEach(traverse);
    }
  }

  traverse(ir.root || ir);

  for (const irNode of irNodes) {
    const nativeNode = telemetry[irNode.sourceId];
    if (!nativeNode) continue;

    const irBounds = irNode.measured?.bounds || irNode.bounds;
    const nativeBounds = nativeNode.boundsPx;

    const irCx = irBounds.x + irBounds.width / 2;
    const irCy = irBounds.y + irBounds.height / 2;

    const nativeCx = nativeNode.centroid?.x ?? (nativeBounds.left + nativeBounds.width / 2);
    const nativeCy = nativeNode.centroid?.y ?? (nativeBounds.top + nativeBounds.height / 2);

    const dx = nativeCx - irCx;
    const dy = nativeCy - irCy;
    const drift = Math.hypot(dx, dy);
    const pass = drift <= maxDriftPx;

    if (!pass) allPass = false;

    results.push({
      sourceId: irNode.sourceId,
      irBounds: { x: irBounds.x, y: irBounds.y, width: irBounds.width, height: irBounds.height },
      nativeBounds: {
        left: nativeBounds.left,
        top: nativeBounds.top,
        width: nativeBounds.width,
        height: nativeBounds.height
      },
      irCentroid: { x: irCx, y: irCy },
      nativeCentroid: { x: nativeCx, y: nativeCy },
      delta: { dx, dy, drift },
      pass
    });
  }

  const comparisonReport = {
    timestamp: new Date().toISOString(),
    nodesCompared: results.length,
    maxDriftThresholdPx: maxDriftPx,
    allPass,
    results
  };

  if (options.outputPath) {
    fs.writeFileSync(options.outputPath, JSON.stringify(comparisonReport, null, 2), 'utf8');
  }

  return comparisonReport;
}

if (require.main === module) {
  const irPath = process.argv[2] || 'benchmarks/dc1_onboarding/design_ir.json';
  const telPath = process.argv[3] || 'output/conformance/native_telemetry.json';
  const outPath = process.argv[4] || 'output/conformance/telemetry_comparison.json';

  const report = compareTelemetry(irPath, telPath, { outputPath: outPath });
  console.log(`[Telemetry Comparator] Evaluated ${report.nodesCompared} nodes: ${report.allPass ? 'PASS' : 'FAIL'}`);
  report.results.forEach(r => {
    console.log(`- ${r.sourceId.padEnd(35)} | drift: ${r.delta.drift.toFixed(2)}px | ${r.pass ? 'PASS' : 'FAIL'}`);
  });
}

module.exports = {
  compareTelemetry
};
