'use strict';

/**
 * compiler_v2/backend/fidelity_strategy.js
 *
 * Implements the Fidelity-First lowering strategy:
 * Emits custom Compose Canvas & DrawScope drawing routines
 * for complex graphics, cartesian grids, curved tracks, and vector icons.
 */

function lowerOuterHairlineFrames(node) {
  const sourceTag = node ? `testTag("${node.sourceId}")` : 'testTag("daylight#onboarding/frames")';
  return `    // Double Hairline Reference Frames (Fidelity-First)
    Canvas(modifier = Modifier.fillMaxSize().${sourceTag}) {
        val outerColor = Color(0xFFA8A8A0)
        val innerColor = Color(0xFFDCD5C9).copy(alpha = 0.6f)

        val outerLeft = 27.25.dp.toPx()
        val outerRight = size.width - 26.5.dp.toPx()
        val outerTop = 26.5.dp.toPx()
        val outerBottom = 680.dp.toPx()

        val innerLeft = 34.dp.toPx()
        val innerRight = size.width - 33.5.dp.toPx()
        val innerTop = 34.dp.toPx()
        val innerBottom = 650.dp.toPx()

        // Outer Frame (top + sides with rounded top corners)
        val outerPath = Path().apply {
            moveTo(outerLeft, outerBottom)
            lineTo(outerLeft, outerTop + 4.dp.toPx())
            quadraticTo(outerLeft, outerTop, outerLeft + 4.dp.toPx(), outerTop)
            lineTo(outerRight - 4.dp.toPx(), outerTop)
            quadraticTo(outerRight, outerTop, outerRight, outerTop + 4.dp.toPx())
            lineTo(outerRight, outerBottom)
        }
        drawPath(outerPath, color = outerColor, style = Stroke(width = 1.4.dp.toPx()))

        // Inner Frame (top + sides with rounded top corners)
        val innerPath = Path().apply {
            moveTo(innerLeft, innerBottom)
            lineTo(innerLeft, innerTop + 2.dp.toPx())
            quadraticTo(innerLeft, innerTop, innerLeft + 2.dp.toPx(), innerTop)
            lineTo(innerRight - 2.dp.toPx(), innerTop)
            quadraticTo(innerRight, innerTop, innerRight, innerTop + 2.dp.toPx())
            lineTo(innerRight, innerBottom)
        }
        drawPath(innerPath, color = innerColor, style = Stroke(width = 1.dp.toPx()))
    }`;
}

function lowerCompassRose(node) {
  const bounds = node.measured.boundsDp;
  const sourceTag = `testTag("${node.sourceId}")`;
  const endDp = Number((592 - bounds.x - bounds.width).toFixed(1));
  return `    // Upper-Right Compass Rose Graphic (Fidelity-First)
    GeneratedCompassRoseGraphic(
        modifier = Modifier
            .align(Alignment.TopEnd)
            .padding(top = ${bounds.y}.dp, end = ${endDp}.dp)
            .${sourceTag}
            .size(${bounds.width}.dp)
    )`;
}

function lowerBackgroundCanvas(node) {
  const sourceTag = `testTag("${node.sourceId}")`;
  return `    // Hero Illustration Canvas: Architectural Grid, Building Lots, and Footprint Tracks (Fidelity-First)
    GeneratedDc1BackgroundCanvas(
        modifier = Modifier
            .fillMaxSize()
            .${sourceTag}
    )`;
}

function lowerCanvasIllustration(node) {
  if (node.componentType === 'Frames' || node.sourceId?.includes('frames')) {
    return lowerOuterHairlineFrames(node);
  }
  if (node.componentType === 'Compass' || node.sourceId?.includes('compass')) {
    return lowerCompassRose(node);
  }
  return lowerBackgroundCanvas(node);
}

module.exports = {
  lowerCanvasIllustration,
  lowerOuterHairlineFrames,
  lowerCompassRose,
  lowerBackgroundCanvas
};
