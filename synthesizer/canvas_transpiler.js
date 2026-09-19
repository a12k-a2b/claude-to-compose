/**
 * synthesizer/canvas_transpiler.js
 *
 * Transpiles intercepted HTML5 Canvas 2D call streams into production-ready
 * Jetpack Compose Canvas() and DrawScope drawing routines.
 */

function mapColorToCompose(cssColor, alphaMultiplier = 1.0) {
  if (!cssColor) return 'Color.Black';
  const clean = cssColor.trim().toLowerCase();

  if (clean === '#ffffff' || clean === '#fff' || clean === 'white') return 'Os0';
  if (clean === '#f7f7f7') return 'Os50';
  if (clean === '#f5f5f5') return 'Os150';
  if (clean === '#cccccc' || clean === '#ccc') return 'Os200';
  if (clean === '#858585') return 'Os300';
  if (clean === '#535353') return 'Os400';
  if (clean === '#343434') return 'Os800';
  if (clean === '#1a1a1a') return 'Os900';
  if (clean === '#000000' || clean === '#000' || clean === 'black') return 'Os1000';

  const rgbaMatch = clean.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
  if (rgbaMatch) {
    const r = parseInt(rgbaMatch[1], 10);
    const g = parseInt(rgbaMatch[2], 10);
    const b = parseInt(rgbaMatch[3], 10);
    const a = rgbaMatch[4] !== undefined ? parseFloat(rgbaMatch[4]) * alphaMultiplier : alphaMultiplier;
    return `Color(${r}, ${g}, ${b}, ${(a * 255).toFixed(0)})`;
  }

  if (clean.startsWith('#')) {
    let hex = clean.substring(1);
    if (hex.length === 3) {
      hex = hex.split('').map(c => c + c).join('');
    }
    if (hex.length === 6) {
      const alphaHex = Math.round(alphaMultiplier * 255).toString(16).padStart(2, '0').toUpperCase();
      return `Color(0x${alphaHex}${hex.toUpperCase()})`;
    }
    if (hex.length === 8) {
      return `Color(0x${hex.toUpperCase()})`;
    }
  }

  return 'Color.Black';
}

function mapStrokeCap(cap) {
  switch ((cap || '').toLowerCase()) {
    case 'round': return 'StrokeCap.Round';
    case 'square': return 'StrokeCap.Square';
    case 'butt':
    default:
      return 'StrokeCap.Butt';
  }
}

function mapStrokeJoin(join) {
  switch ((join || '').toLowerCase()) {
    case 'round': return 'StrokeJoin.Round';
    case 'bevel': return 'StrokeJoin.Bevel';
    case 'miter':
    default:
      return 'StrokeJoin.Miter';
  }
}

function transpileCanvasToCompose(canvasStream, options = {}) {
  const functionName = options.functionName || 'TranspiledCanvasGraphics';
  const widthDp = options.widthDp || Math.round((canvasStream.width || 400) / 2);
  const heightDp = options.heightDp || Math.round((canvasStream.height || 400) / 2);

  const ops = canvasStream.operations || [];
  const bodyLines = [];

  let currentPathIndex = 0;
  let activePathOpen = false;
  let currentDashEffect = null;

  for (let i = 0; i < ops.length; i++) {
    const item = ops[i];
    const op = item.op;
    const args = item.args || [];
    const style = item.style || {};

    switch (op) {
      case 'beginPath':
        currentPathIndex++;
        bodyLines.push(`    val path${currentPathIndex} = Path()`);
        activePathOpen = true;
        break;

      case 'moveTo':
        if (!activePathOpen) {
          currentPathIndex++;
          bodyLines.push(`    val path${currentPathIndex} = Path()`);
          activePathOpen = true;
        }
        bodyLines.push(`    path${currentPathIndex}.moveTo(${args[0]}f, ${args[1]}f)`);
        break;

      case 'lineTo':
        if (activePathOpen) {
          bodyLines.push(`    path${currentPathIndex}.lineTo(${args[0]}f, ${args[1]}f)`);
        }
        break;

      case 'bezierCurveTo':
        if (activePathOpen) {
          bodyLines.push(
            `    path${currentPathIndex}.cubicTo(${args[0]}f, ${args[1]}f, ${args[2]}f, ${args[3]}f, ${args[4]}f, ${args[5]}f)`
          );
        }
        break;

      case 'quadraticCurveTo':
        if (activePathOpen) {
          bodyLines.push(
            `    path${currentPathIndex}.quadraticTo(${args[0]}f, ${args[1]}f, ${args[2]}f, ${args[3]}f)`
          );
        }
        break;

      case 'arc': {
        const [cx, cy, r, startAngle, endAngle] = args;
        const sweepDegrees = (((endAngle - startAngle) * 180) / Math.PI).toFixed(1);
        const startDegrees = ((startAngle * 180) / Math.PI).toFixed(1);
        if (activePathOpen) {
          bodyLines.push(
            `    path${currentPathIndex}.arcTo(` +
            `Rect(Offset(${cx - r}f, ${cy - r}f), Size(${r * 2}f, ${r * 2}f)), ` +
            `${startDegrees}f, ${sweepDegrees}f, forceMoveTo = false)`
          );
        } else {
          bodyLines.push(
            `    drawArc(` +
            `color = ${mapColorToCompose(style.strokeStyle || '#000000', style.globalAlpha)}, ` +
            `startAngle = ${startDegrees}f, sweepAngle = ${sweepDegrees}f, useCenter = false, ` +
            `topLeft = Offset(${cx - r}f, ${cy - r}f), size = Size(${r * 2}f, ${r * 2}f), ` +
            `style = Stroke(width = ${(style.lineWidth || 1)}f, cap = ${mapStrokeCap(style.lineCap)}))`
          );
        }
        break;
      }

      case 'closePath':
        if (activePathOpen) {
          bodyLines.push(`    path${currentPathIndex}.close()`);
        }
        break;

      case 'setLineDash': {
        const segments = args[0] || [];
        if (segments.length > 0) {
          currentDashEffect = `PathEffect.dashPathEffect(floatArrayOf(${segments.map(s => `${s}f`).join(', ')}))`;
        } else {
          currentDashEffect = null;
        }
        break;
      }

      case 'stroke': {
        if (activePathOpen) {
          const colorVal = mapColorToCompose(style.strokeStyle || '#000000', style.globalAlpha);
          const strokeWidth = (style.lineWidth || 1) + 'f';
          const cap = mapStrokeCap(style.lineCap);
          const join = mapStrokeJoin(style.lineJoin);
          const pathEffectParam = currentDashEffect ? `, pathEffect = ${currentDashEffect}` : '';

          bodyLines.push(
            `    drawPath(` +
            `path = path${currentPathIndex}, ` +
            `color = ${colorVal}, ` +
            `style = Stroke(width = ${strokeWidth}, cap = ${cap}, join = ${join}${pathEffectParam}))`
          );
        }
        break;
      }

      case 'fill': {
        if (activePathOpen) {
          const colorVal = mapColorToCompose(style.fillStyle || '#000000', style.globalAlpha);
          bodyLines.push(
            `    drawPath(path = path${currentPathIndex}, color = ${colorVal}, style = Fill)`
          );
        }
        break;
      }

      case 'fillRect': {
        const [x, y, w, h] = args;
        const colorVal = mapColorToCompose(style.fillStyle || '#000000', style.globalAlpha);
        bodyLines.push(
          `    drawRect(color = ${colorVal}, topLeft = Offset(${x}f, ${y}f), size = Size(${w}f, ${h}f), style = Fill)`
        );
        break;
      }

      case 'strokeRect': {
        const [x, y, w, h] = args;
        const colorVal = mapColorToCompose(style.strokeStyle || '#000000', style.globalAlpha);
        const strokeWidth = (style.lineWidth || 1) + 'f';
        bodyLines.push(
          `    drawRect(color = ${colorVal}, topLeft = Offset(${x}f, ${y}f), size = Size(${w}f, ${h}f), style = Stroke(width = ${strokeWidth}))`
        );
        break;
      }

      default:
        break;
    }
  }

  const kotlin = `package com.claude.compose.ui

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.size
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.drawscope.Fill
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.unit.dp
import com.claude.compose.theme.*

/**
 * Auto-generated Jetpack Compose representation of HTML5 Canvas stream [${canvasStream.id}].
 * Canvas resolution: ${canvasStream.width} x ${canvasStream.height} px.
 */
@Composable
fun ${functionName}(
    modifier: Modifier = Modifier.size(${widthDp}.dp, ${heightDp}.dp)
) {
    Canvas(modifier = modifier) {
${bodyLines.join('\n')}
    }
}
`;

  return kotlin;
}

module.exports = {
  transpileCanvasToCompose,
  mapColorToCompose,
  mapStrokeCap,
  mapStrokeJoin
};
