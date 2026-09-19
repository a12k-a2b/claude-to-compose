/**
 * extractor/canvas_interceptor.js
 *
 * Intercepts, records, and serializes the HTML5 Canvas 2D rendering pipeline.
 * Captures vector paths, bezier curves, stroke/fill styles, and line-caps
 * for 100% mathematical vector transposition into Jetpack Compose.
 */

const fs = require('fs');
const path = require('path');

/**
 * Returns JavaScript string injected into the browser context before any user script executes.
 */
function getCanvasInterceptionScript() {
  return `
  (function() {
    if (window.__claudeCanvasInterceptorActive) return;
    window.__claudeCanvasInterceptorActive = true;
    window.__claudeCanvasStreams = [];

    const originalGetContext = HTMLCanvasElement.prototype.getContext;
    let canvasCounter = 0;

    HTMLCanvasElement.prototype.getContext = function(type, ...args) {
      const ctx = originalGetContext.call(this, type, ...args);
      if (!ctx || type !== '2d') return ctx;

      // Assign canvas tracking ID
      if (!this.__claudeCanvasId) {
        canvasCounter++;
        this.__claudeCanvasId = this.id || ('canvas_stream_' + canvasCounter);
      }

      const canvasId = this.__claudeCanvasId;
      const canvasEl = this;

      let streamEntry = window.__claudeCanvasStreams.find(s => s.id === canvasId);
      if (!streamEntry) {
        streamEntry = {
          id: canvasId,
          width: canvasEl.width,
          height: canvasEl.height,
          clientWidth: canvasEl.clientWidth,
          clientHeight: canvasEl.clientHeight,
          className: canvasEl.className || '',
          operations: []
        };
        window.__claudeCanvasStreams.push(streamEntry);
      }

      function getStyleSnapshot() {
        return {
          strokeStyle: ctx.strokeStyle,
          fillStyle: ctx.fillStyle,
          lineWidth: ctx.lineWidth,
          lineCap: ctx.lineCap || 'butt',
          lineJoin: ctx.lineJoin || 'miter',
          miterLimit: ctx.miterLimit || 10,
          lineDash: typeof ctx.getLineDash === 'function' ? ctx.getLineDash() : [],
          lineDashOffset: ctx.lineDashOffset || 0,
          globalAlpha: ctx.globalAlpha !== undefined ? ctx.globalAlpha : 1.0,
          font: ctx.font || '',
          textAlign: ctx.textAlign || 'start',
          textBaseline: ctx.textBaseline || 'alphabetic'
        };
      }

      // Methods to intercept
      const interceptMethods = [
        'beginPath', 'closePath',
        'moveTo', 'lineTo',
        'bezierCurveTo', 'quadraticCurveTo',
        'arc', 'arcTo', 'ellipse',
        'rect', 'roundRect',
        'stroke', 'fill',
        'strokeRect', 'fillRect', 'clearRect',
        'save', 'restore',
        'scale', 'rotate', 'translate', 'transform', 'setTransform', 'resetTransform',
        'clip',
        'fillText', 'strokeText'
      ];

      for (const method of interceptMethods) {
        if (typeof ctx[method] === 'function' && !ctx[method].__claudeIntercepted) {
          const originalMethod = ctx[method];
          ctx[method] = function(...mArgs) {
            streamEntry.width = canvasEl.width;
            streamEntry.height = canvasEl.height;
            streamEntry.clientWidth = canvasEl.clientWidth;
            streamEntry.clientHeight = canvasEl.clientHeight;

            const op = {
              op: method,
              args: Array.from(mArgs).map(v => (typeof v === 'number' ? parseFloat(v.toFixed(3)) : v)),
              timestamp: Date.now()
            };

            if (['stroke', 'fill', 'strokeRect', 'fillRect', 'fillText', 'strokeText'].includes(method)) {
              op.style = getStyleSnapshot();
            }

            streamEntry.operations.push(op);
            return originalMethod.apply(this, mArgs);
          };
          ctx[method].__claudeIntercepted = true;
        }
      }

      if (typeof ctx.setLineDash === 'function' && !ctx.setLineDash.__claudeIntercepted) {
        const origSetLineDash = ctx.setLineDash;
        ctx.setLineDash = function(segments) {
          streamEntry.operations.push({
            op: 'setLineDash',
            args: [Array.from(segments || [])],
            timestamp: Date.now()
          });
          return origSetLineDash.apply(this, [segments]);
        };
        ctx.setLineDash.__claudeIntercepted = true;
      }

      return ctx;
    };
  })();
  `;
}

/**
 * Extracts recorded canvas streams from the active Playwright frame or page.
 *
 * @param {import('playwright').Page | import('playwright').Frame} targetFrame
 * @returns {Promise<Array<Object>>}
 */
async function extractCanvasOperations(targetFrame) {
  if (!targetFrame) return [];
  try {
    const streams = await targetFrame.evaluate(() => {
      const rawStreams = window.__claudeCanvasStreams || [];
      return rawStreams.map(stream => {
        const firstClass = stream.className ? stream.className.split(' ')[0] : '';
        const el = document.getElementById(stream.id) || (firstClass ? document.querySelector('canvas.' + firstClass) : null) || document.querySelector('canvas');
        let rect = null;
        if (el) {
          const r = el.getBoundingClientRect();
          rect = {
            x: Math.round(r.x),
            y: Math.round(r.y),
            width: Math.round(r.width),
            height: Math.round(r.height)
          };
        }
        return {
          ...stream,
          bounds: rect || { x: 0, y: 0, width: stream.width, height: stream.height }
        };
      });
    });
    return streams;
  } catch (err) {
    return [];
  }
}

/**
 * Persists extracted canvas operations to JSON bundle.
 *
 * @param {Array<Object>} canvasStreams
 * @param {string} outputDir
 * @returns {string} Absolute path to canvas_ops.json
 */
function saveCanvasOperations(canvasStreams, outputDir) {
  const filePath = path.join(outputDir, 'canvas_ops.json');
  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(canvasStreams, null, 2), 'utf-8');
  return filePath;
}

module.exports = {
  getCanvasInterceptionScript,
  extractCanvasOperations,
  saveCanvasOperations
};
