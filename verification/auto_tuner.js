#!/usr/bin/env node

/**
 * verification/auto_tuner.js
 *
 * Automated Closed-Loop Visual Auto-Tuner for claude-to-compose (Feature F9).
 * Orchestrates the iterative closed-loop optimization cycle:
 *   1. Headless Robolectric Native Graphics render (via BuildRunner)
 *   2. Objective visual verification (Sobel edge contour diff, dynamic background clustering, zonal drift IoU)
 *   3. Hard anti-deception convergence evaluation (Contour >= 90%, Element IoU >= 90%, Max Shift <= 3px, Ink IoU >= 55%, MSSIM >= 0.72)
 *   4. Drift vector resolution & syntax-aware Kotlin Compose code mutation (KotlinComposeMutator)
 *   5. Oscillation damping (adaptive alpha reduction upon vector reversal)
 *   6. Regression guard & snapshot rollback
 *
 * Enforces Sentinel P0 Directives:
 *   - Route translation adjustments to Modifier.offset (never negative padding)
 *   - Multi-line wrap collapse protection (Modifier.width(140.dp))
 *   - Solid hairlines preservation (zero leftover dash effects)
 *   - Daylight LivePaper fidelity mode without M3 button bloat
 */

const fs = require('node:fs');
const path = require('node:path');
const { Command } = require('commander');
const { BuildRunner } = require('./build_runner');
const { DriftResolver, formatDp, formatSp } = require('./drift_resolver');

/**
 * Escapes regex special characters in dynamic strings.
 */
function escapeRegExp(string) {
  return String(string).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Pure helper to evaluate all 5 hard anti-deception convergence gates.
 *
 * @param {Object} metrics
 * @param {Object} [thresholds]
 * @returns {{ converged: boolean, violations: Array<string> }}
 */
function checkConvergence(metrics, thresholds = {}) {
  const m = (metrics && typeof metrics === 'object') ? metrics : {};
  const th = thresholds || {};
  const minContour = th.minContourScore !== undefined ? th.minContourScore : 90.0;
  const minElementIou = th.minElementIou !== undefined ? th.minElementIou : 90.0;
  const maxShiftPx = th.maxShiftPx !== undefined ? th.maxShiftPx : 3.0;
  const minInkIou = th.minInkIou !== undefined ? th.minInkIou : 55.0;
  const minMssim = th.minMssim !== undefined ? th.minMssim : 0.72;

  const violations = [];

  const isValidNumber = (val) => typeof val === 'number' && !Number.isNaN(val);
  const parseNum = (val) => {
    if (typeof val === 'number') return val;
    if (typeof val === 'string' && val.trim() !== '') {
      const n = Number(val);
      return Number.isNaN(n) ? NaN : n;
    }
    return NaN;
  };

  const contour = parseNum(m.edgeContourScore);
  if (!isValidNumber(contour)) {
    violations.push('Edge contour alignment is invalid (NaN or missing)');
  } else if (contour < minContour) {
    violations.push(`Edge contour alignment (${contour}%) < required ${minContour}%`);
  }

  const elementIou = parseNum(m.elementIouScore);
  if (!isValidNumber(elementIou)) {
    violations.push('Element bounding box IoU is invalid (NaN or missing)');
  } else if (elementIou < minElementIou) {
    violations.push(`Element bounding box IoU (${elementIou}%) < required ${minElementIou}%`);
  }

  const shift = parseNum(m.maxSpatialShiftPx);
  if (!isValidNumber(shift)) {
    violations.push('Max spatial shift is invalid (NaN or missing)');
  } else if (shift > maxShiftPx) {
    violations.push(`Max spatial shift (${shift}px) > allowed ${maxShiftPx}px`);
  }

  const inkIou = parseNum(m.inkIou);
  if (!isValidNumber(inkIou)) {
    violations.push('Foreground Ink IoU is invalid (NaN or missing)');
  } else if (inkIou < minInkIou) {
    violations.push(`Foreground Ink IoU (${inkIou}%) < required ${minInkIou}%`);
  }

  const mssim = parseNum(m.mssimScore);
  if (!isValidNumber(mssim)) {
    violations.push('MSSIM score is invalid (NaN or missing)');
  } else if (mssim < minMssim) {
    violations.push(`MSSIM score (${mssim}) < required ${minMssim}`);
  }

  return {
    converged: violations.length === 0,
    violations
  };
}

/**
 * Computes scalar objective quality composite score Q_k.
 * Q_k = 0.40 * S_contour + 0.30 * S_elementIou + 0.20 * S_inkIou - 0.10 * min(50, d_max)
 *
 * @param {Object} metrics
 * @returns {number}
 */
function calculateCompositeScore(metrics = {}) {
  const contour = metrics.edgeContourScore || 0;
  const elementIou = metrics.elementIouScore || 0;
  const inkIou = metrics.inkIou || 0;
  const maxShift = metrics.maxSpatialShiftPx !== undefined ? metrics.maxSpatialShiftPx : 50;

  return parseFloat((
    0.40 * contour +
    0.30 * elementIou +
    0.20 * inkIou -
    0.10 * Math.min(50, maxShift)
  ).toFixed(2));
}

/**
 * Detects whether an element's drift vector reversed direction between iterations.
 * Triggers adaptive damping reduction (halving alpha).
 *
 * @param {Array<Object>} history
 * @param {string} elementId
 * @returns {boolean}
 */
function detectOscillation(history = [], elementId) {
  if (!history || history.length < 2 || !elementId) return false;

  const vectors = [];
  for (const h of history) {
    if (h.driftVectors && Array.isArray(h.driftVectors)) {
      const vec = h.driftVectors.find(v => v.elementId === elementId || v.name === elementId);
      if (vec) vectors.push(vec);
    }
  }

  if (vectors.length < 2) return false;

  const curr = vectors[vectors.length - 1];
  const prev = vectors[vectors.length - 2];

  const dxCurr = curr.dx || 0;
  const dyCurr = curr.dy || 0;
  const dxPrev = prev.dx || 0;
  const dyPrev = prev.dy || 0;

  // Inner product: negative indicates directional reversal
  const dot = dxCurr * dxPrev + dyCurr * dyPrev;
  if (dot < 0) return true;

  // Sign flip on either coordinate if magnitude > 1px
  if ((Math.abs(dxCurr) >= 1.0 && Math.abs(dxPrev) >= 1.0 && Math.sign(dxCurr) !== Math.sign(dxPrev)) ||
      (Math.abs(dyCurr) >= 1.0 && Math.abs(dyPrev) >= 1.0 && Math.sign(dyCurr) !== Math.sign(dyPrev))) {
    return true;
  }

  return false;
}

/**
 * Detects quality score regression against the best achieved iteration.
 *
 * @param {number} currentScore
 * @param {number} bestScore
 * @param {number} currentMaxShift
 * @param {number} bestMaxShift
 * @param {number} [threshold=2.5]
 * @returns {boolean}
 */
function detectRegression(currentScore, bestScore, currentMaxShift, bestMaxShift, threshold = 2.5) {
  if (bestScore === -Infinity) return false;
  if (currentScore < bestScore - threshold) return true;
  if (currentMaxShift !== undefined && bestMaxShift !== undefined && currentMaxShift > bestMaxShift + 3.0) {
    return true;
  }
  return false;
}

/**
 * Checks whether an index in source code is located within a comment.
 * Handles // single-line comments, /* ... * / block comments, and avoids
 * false positives inside Kotlin regular or multiline strings.
 *
 * @param {string} source
 * @param {number} targetIndex
 * @returns {boolean}
 */
function isIndexInComment(source, targetIndex) {
  let inLineComment = false;
  let inBlockComment = 0;
  let inString = false;
  let inMultiString = false;

  for (let i = 0; i < targetIndex; i++) {
    if (inLineComment) {
      if (source[i] === '\n') inLineComment = false;
    } else if (inBlockComment > 0) {
      if (source[i] === '/' && source[i + 1] === '*') {
        inBlockComment++;
        i++;
      } else if (source[i] === '*' && source[i + 1] === '/') {
        inBlockComment--;
        i++;
      }
    } else if (inMultiString) {
      if (source[i] === '"' && source[i + 1] === '"' && source[i + 2] === '"') {
        inMultiString = false;
        i += 2;
      }
    } else if (inString) {
      if (source[i] === '\\') {
        i++;
      } else if (source[i] === '"') {
        inString = false;
      }
    } else {
      if (source[i] === '/' && source[i + 1] === '/') {
        inLineComment = true;
        i++;
      } else if (source[i] === '/' && source[i + 1] === '*') {
        inBlockComment = 1;
        i++;
      } else if (source[i] === '"' && source[i + 1] === '"' && source[i + 2] === '"') {
        inMultiString = true;
        i += 2;
      } else if (source[i] === '"') {
        inString = true;
      }
    }
  }

  return inLineComment || inBlockComment > 0;
}

/**
 * Syntax-aware Kotlin Jetpack Compose code mutator.
 * Uses a token-aware balanced bracket scanner to parse Composable calls
 * and rewrite modifiers without syntax corruption or negative padding crashes.
 */
class KotlinComposeMutator {
  /**
   * @param {string} sourceCode
   */
  constructor(sourceCode = '') {
    this.source = sourceCode;
  }

  /**
   * Returns current mutated source code.
   * @returns {string}
   */
  getSource() {
    return this.source;
  }

  /**
   * Finds index of an anchor in source code outside of comments.
   * Supports regex, string literals, case-insensitivity, and prefix fallbacks.
   *
   * @param {string|RegExp} anchor
   * @returns {number}
   */
  findAnchorIndex(anchor) {
    if (!anchor) return -1;
    const s = this.source;

    const findNonComment = (sub, caseInsensitive = false) => {
      let idx = 0;
      const target = caseInsensitive ? sub.toLowerCase() : sub;
      const haystack = caseInsensitive ? s.toLowerCase() : s;
      while ((idx = haystack.indexOf(target, idx)) !== -1) {
        if (!isIndexInComment(s, idx)) {
          return idx;
        }
        idx += 1;
      }
      return -1;
    };

    if (anchor instanceof RegExp) {
      let match;
      const globalRegex = new RegExp(anchor.source, anchor.flags.includes('g') ? anchor.flags : anchor.flags + 'g');
      while ((match = globalRegex.exec(s)) !== null) {
        if (!isIndexInComment(s, match.index)) {
          return match.index;
        }
      }
      return -1;
    }

    if (typeof anchor === 'string') {
      // 1. Exact match outside comments
      let found = findNonComment(anchor);
      if (found !== -1) return found;

      // 2. Case-insensitive match outside comments
      found = findNonComment(anchor, true);
      if (found !== -1) return found;

      // 3. String literal match (in case quotes were omitted)
      found = findNonComment(`"${anchor}"`);
      if (found !== -1) return found + 1;

      // 4. Truncated prefix match (zonal diff names capped at 50 chars)
      if (anchor.length > 20) {
        for (const len of [40, 30, 25, 20]) {
          if (anchor.length > len) {
            const prefix = anchor.slice(0, len);
            found = findNonComment(prefix, true);
            if (found !== -1) return found;
          }
        }
      }
    }

    return -1;
  }

  /**
   * Scans a full Modifier chain starting at startIdx using balanced parenthesis and brace tracking.
   * Safely captures chains with nested parentheses (e.g. RoundedCornerShape, Color, BorderStroke).
   *
   * @param {string} text
   * @param {number} [startIdx=0]
   * @returns {{ start: number, end: number, text: string }|null}
   */
  findModifierChain(text, startIdx = 0) {
    const modHeaderMatch = /modifier\s*=\s*Modifier/.exec(text.slice(startIdx));
    if (!modHeaderMatch) return null;

    const chainStart = startIdx + modHeaderMatch.index;
    let i = chainStart + modHeaderMatch[0].length;

    while (i < text.length) {
      while (i < text.length && /\s/.test(text[i])) i++;

      if (text[i] !== '.') {
        break;
      }
      i++;

      while (i < text.length && /\s/.test(text[i])) i++;

      const idMatch = /^[a-zA-Z0-9_]+/.exec(text.slice(i));
      if (!idMatch) {
        break;
      }
      i += idMatch[0].length;

      while (i < text.length && /\s/.test(text[i])) i++;

      if (text[i] === '(') {
        let depth = 1;
        i++;
        let inString = false;
        let inMultiString = false;
        while (i < text.length && depth > 0) {
          if (!inString && !inMultiString) {
            if (text[i] === '"' && text[i + 1] === '"' && text[i + 2] === '"') {
              inMultiString = true;
              i += 2;
            } else if (text[i] === '"') {
              inString = true;
            } else if (text[i] === '(') {
              depth++;
            } else if (text[i] === ')') {
              depth--;
            }
          } else if (inString) {
            if (text[i] === '\\') {
              i++;
            } else if (text[i] === '"') {
              inString = false;
            }
          } else if (inMultiString) {
            if (text[i] === '"' && text[i + 1] === '"' && text[i + 2] === '"') {
              inMultiString = false;
              i += 2;
            }
          }
          i++;
        }
      } else if (text[i] === '{') {
        let depth = 1;
        i++;
        while (i < text.length && depth > 0) {
          if (text[i] === '{') depth++;
          else if (text[i] === '}') depth--;
          i++;
        }
      }
    }

    return {
      start: chainStart,
      end: i,
      text: text.slice(chainStart, i)
    };
  }

  /**
   * Finds the enclosing Composable function call surrounding a character index.
   *
   * @param {number} anchorIdx
   * @returns {Object|null}
   */
  findEnclosingCall(anchorIdx) {
    if (anchorIdx < 0 || anchorIdx >= this.source.length) return null;
    const s = this.source;

    // Comments must never be treated as code calls
    if (isIndexInComment(s, anchorIdx)) return null;

    let openParenIdx = -1;

    // Helper: set of non-composable helper constructors to skip when identifying UI composables
    const nonComposableNames = new Set([
      'Modifier', 'Color', 'RoundedCornerShape', 'BorderStroke', 'TextStyle',
      'FontWeight', 'Brush', 'Alignment', 'Arrangement', 'PaddingValues',
      'SolidColor', 'Offset', 'IntOffset', 'Size', 'Rect', 'Shadow', 'Dp', 'Sp'
    ]);

    // First: if anchorIdx points to a Composable function call (or identifier followed by '(')
    // e.g. "Icon(", "Button (", "Surface("
    // Scan forward from anchorIdx to find opening '('
    const rest = s.slice(anchorIdx);
    const forwardCallMatch = /^([A-Z][a-zA-Z0-9_]*)\s*\(/.exec(rest);
    if (forwardCallMatch && !nonComposableNames.has(forwardCallMatch[1])) {
      const candidateParen = anchorIdx + forwardCallMatch[0].lastIndexOf('(');
      if (!isIndexInComment(s, candidateParen)) {
        openParenIdx = candidateParen;
      }
    }

    // Otherwise, scan backward from anchorIdx to find opening '(' at depth 0
    if (openParenIdx === -1) {
      let depth = 0;
      for (let i = anchorIdx; i >= 0; i--) {
        const ch = s[i];
        if (ch === ')') {
          if (!isIndexInComment(s, i)) {
            depth++;
          }
        } else if (ch === '(') {
          if (!isIndexInComment(s, i)) {
            if (depth > 0) {
              depth--;
            } else {
              // Ensure this '(' belongs to a Composable call (preceded by PascalCase identifier)
              let nameEnd = i;
              while (nameEnd > 0 && /\s/.test(s[nameEnd - 1])) nameEnd--;
              let nameStart = nameEnd;
              while (nameStart > 0 && /[a-zA-Z0-9_]/.test(s[nameStart - 1])) nameStart--;
              const candName = s.slice(nameStart, nameEnd);
              if (/^[A-Z]/.test(candName) && !nonComposableNames.has(candName)) {
                openParenIdx = i;
                break;
              } else {
                depth = 0;
              }
            }
          }
        }
      }
    }

    if (openParenIdx === -1) return null;

    // Scan backwards from openParenIdx to get the Composable identifier
    let nameEnd = openParenIdx;
    while (nameEnd > 0 && /\s/.test(s[nameEnd - 1])) nameEnd--;
    let nameStart = nameEnd;
    while (nameStart > 0 && /[a-zA-Z0-9_]/.test(s[nameStart - 1])) nameStart--;
    const name = s.slice(nameStart, nameEnd);

    // Scan forward from openParenIdx to find matching closing ')'
    let forwardDepth = 1;
    let closeParenIdx = -1;
    let inString = false;
    let inMultiString = false;

    for (let i = openParenIdx + 1; i < s.length; i++) {
      if (!inString && !inMultiString) {
        if (s[i] === '"' && s[i + 1] === '"' && s[i + 2] === '"') {
          inMultiString = true;
          i += 2;
        } else if (s[i] === '"') {
          inString = true;
        } else if (s[i] === '/' && s[i + 1] === '/') {
          while (i < s.length && s[i] !== '\n') i++;
        } else if (s[i] === '/' && s[i + 1] === '*') {
          i += 2;
          while (i < s.length - 1 && !(s[i] === '*' && s[i + 1] === '/')) i++;
          i++;
        } else if (s[i] === '(') {
          forwardDepth++;
        } else if (s[i] === ')') {
          forwardDepth--;
          if (forwardDepth === 0) {
            closeParenIdx = i;
            break;
          }
        }
      } else if (inString) {
        if (s[i] === '\\') {
          i++;
        } else if (s[i] === '"') {
          inString = false;
        }
      } else if (inMultiString) {
        if (s[i] === '"' && s[i + 1] === '"' && s[i + 2] === '"') {
          inMultiString = false;
          i += 2;
        }
      }
    }

    if (closeParenIdx === -1) return null;

    return {
      name,
      callStart: nameStart,
      callEnd: closeParenIdx + 1,
      openParen: openParenIdx,
      closeParen: closeParenIdx,
      argText: s.slice(openParenIdx + 1, closeParenIdx)
    };
  }

  /**
   * Applies translation offset using inverse delta compensation.
   * Enforces Sentinel P0: all translations are routed to Modifier.offset.
   * Isolates search and updates strictly to the enclosing Composable's arguments.
   *
   * @param {string|RegExp} anchor
   * @param {number} compXDp
   * @param {number} compYDp
   * @returns {boolean} true if modified
   */
  applyOffset(anchor, compXDp, compYDp) {
    const anchorIdx = this.findAnchorIndex(anchor);
    if (anchorIdx === -1) return false;

    // Locate the enclosing Composable call
    const call = this.findEnclosingCall(anchorIdx);
    if (!call) return false;

    const callArgText = call.argText;

    // Support single and two parameter offsets:
    // .offset(x = 10.dp, y = 20.dp), .offset(x = 10.dp), .offset(y = 20.dp), .offset(10.dp, 20.dp)
    const directOffsetRegex = /\.offset\s*\(\s*(?:x\s*=\s*([-\d.()]+)\.dp(?:\s*,\s*y\s*=\s*([-\d.()]+)\.dp)?|y\s*=\s*([-\d.()]+)\.dp(?:\s*,\s*x\s*=\s*([-\d.()]+)\.dp)?|([-\d.()]+)\.dp\s*,\s*([-\d.()]+)\.dp|([-\d.()]+)\.dp)\s*\)/;

    // Scenario A: .offset(...) already exists inside call.argText (isolated to call.argText, no cross-boundary search window)
    const insideOffsetMatch = directOffsetRegex.exec(callArgText);
    if (insideOffsetMatch) {
      const parseVal = (str) => (str ? parseFloat(str.replace(/[()]/g, '')) : 0);
      let currX = 0;
      let currY = 0;

      if (insideOffsetMatch[1] !== undefined) {
        currX = parseVal(insideOffsetMatch[1]);
        currY = parseVal(insideOffsetMatch[2]);
      } else if (insideOffsetMatch[3] !== undefined) {
        currY = parseVal(insideOffsetMatch[3]);
        currX = parseVal(insideOffsetMatch[4]);
      } else if (insideOffsetMatch[5] !== undefined) {
        currX = parseVal(insideOffsetMatch[5]);
        currY = parseVal(insideOffsetMatch[6]);
      } else if (insideOffsetMatch[7] !== undefined) {
        currX = parseVal(insideOffsetMatch[7]);
      }

      const newX = parseFloat((currX + compXDp).toFixed(2));
      const newY = parseFloat((currY + compYDp).toFixed(2));
      const replacement = `.offset(x = ${formatDp(newX)}, y = ${formatDp(newY)})`;

      const newArgText = callArgText.slice(0, insideOffsetMatch.index) + replacement + callArgText.slice(insideOffsetMatch.index + insideOffsetMatch[0].length);
      this.source = this.source.slice(0, call.openParen + 1) + newArgText + this.source.slice(call.closeParen);
      return true;
    }

    // Scenario B: modifier = Modifier exists inside call.argText, but no .offset
    const modifierRegex = /modifier\s*=\s*Modifier(\s*\.)?/;
    const modMatch = modifierRegex.exec(callArgText);
    if (modMatch) {
      const offsetSnippet = `.offset(x = ${formatDp(compXDp)}, y = ${formatDp(compYDp)})`;
      let replacement;
      if (modMatch[1]) {
        replacement = `modifier = Modifier${offsetSnippet}.`;
      } else {
        replacement = `modifier = Modifier${offsetSnippet}`;
      }
      const newArgText = callArgText.slice(0, modMatch.index) + replacement + callArgText.slice(modMatch.index + modMatch[0].length);
      this.source = this.source.slice(0, call.openParen + 1) + newArgText + this.source.slice(call.closeParen);
      return true;
    }

    // Scenario C: No modifier argument in Composable call
    const trimmedArgs = callArgText.trim();
    const lineStart = this.source.lastIndexOf('\n', call.callStart) + 1;
    const baseIndent = this.source.slice(lineStart, call.callStart).match(/^\s*/)[0];
    const argIndent = baseIndent + '    ';
    const offsetCode = `modifier = Modifier.offset(x = ${formatDp(compXDp)}, y = ${formatDp(compYDp)})`;

    if (trimmedArgs.length === 0) {
      const newArgText = `\n${argIndent}${offsetCode}\n${baseIndent}`;
      this.source = this.source.slice(0, call.openParen + 1) + newArgText + this.source.slice(call.closeParen);
      return true;
    }

    const startsWithNamed = /^\s*[a-zA-Z0-9_]+\s*=/.test(callArgText);

    if (startsWithNamed) {
      // Named arguments: prepend modifier
      const offsetArg = `\n${argIndent}${offsetCode},`;
      const newArgText = offsetArg + callArgText;
      this.source = this.source.slice(0, call.openParen + 1) + newArgText + this.source.slice(call.closeParen);
      return true;
    } else {
      // Positional arguments: append modifier at end of argument list
      if (callArgText.includes('\n')) {
        const rtrimmed = callArgText.trimEnd();
        const hasTrailingComma = rtrimmed.endsWith(',');
        const separator = hasTrailingComma ? `\n${argIndent}` : `,\n${argIndent}`;
        const newArgText = rtrimmed + separator + offsetCode + `\n${baseIndent}`;
        this.source = this.source.slice(0, call.openParen + 1) + newArgText + this.source.slice(call.closeParen);
      } else {
        const rtrimmed = callArgText.trimEnd();
        const separator = rtrimmed.endsWith(',') ? ' ' : ', ';
        const newArgText = rtrimmed + separator + offsetCode;
        this.source = this.source.slice(0, call.openParen + 1) + newArgText + this.source.slice(call.closeParen);
      }
      return true;
    }
  }

  /**
   * Applies dimension constraint adjustments (Modifier.width).
   * Enforces multi-line wrap collapse protection (e.g. 140.dp).
   *
   * @param {string|RegExp} anchor
   * @param {number} widthDp
   * @returns {boolean}
   */
  applyWidth(anchor, widthDp) {
    const anchorIdx = this.findAnchorIndex(anchor);
    if (anchorIdx === -1) return false;

    const widthRegex = /\.width\s*\(\s*([-\d.]+)\.dp\s*\)/;

    // Check enclosing call first
    const call = this.findEnclosingCall(anchorIdx);
    if (!call) return false;

    const callWidthMatch = widthRegex.exec(call.argText);
    if (callWidthMatch) {
      const replacement = `.width(${formatDp(widthDp)})`;
      const newArgText = call.argText.slice(0, callWidthMatch.index) + replacement + call.argText.slice(callWidthMatch.index + callWidthMatch[0].length);
      this.source = this.source.slice(0, call.openParen + 1) + newArgText + this.source.slice(call.closeParen);
      return true;
    }

    // Balanced parenthesis scanner for modifier chain
    const modIdx = call.argText.indexOf('modifier = Modifier');
    const altModIdx = modIdx === -1 ? call.argText.indexOf('modifier=Modifier') : modIdx;
    const finalModIdx = modIdx !== -1 ? modIdx : altModIdx;

    if (finalModIdx !== -1) {
      const chain = this.findModifierChain(call.argText, finalModIdx);
      if (chain) {
        const replacement = `${chain.text}.width(${formatDp(widthDp)})`;
        const newArgText = call.argText.slice(0, chain.start) + replacement + call.argText.slice(chain.end);
        this.source = this.source.slice(0, call.openParen + 1) + newArgText + this.source.slice(call.closeParen);
        return true;
      }
    }

    // Direct match fallback if anchor itself points to or is near .width(...)
    const localWindow = this.source.slice(anchorIdx, Math.min(this.source.length, anchorIdx + 200));
    const localMatch = widthRegex.exec(localWindow);
    if (localMatch) {
      const globalStart = anchorIdx + localMatch.index;
      const replacement = `.width(${formatDp(widthDp)})`;
      this.source = this.source.slice(0, globalStart) + replacement + this.source.slice(globalStart + localMatch[0].length);
      return true;
    }

    return false;
  }

  /**
   * Applies size adjustments (Modifier.size).
   *
   * @param {string|RegExp} anchor
   * @param {number} widthDp
   * @param {number} heightDp
   * @returns {boolean}
   */
  applySize(anchor, widthDp, heightDp) {
    const anchorIdx = this.findAnchorIndex(anchor);
    if (anchorIdx === -1) return false;

    const sizeNamedRegex = /\.size\s*\(\s*width\s*=\s*([-\d.]+)\.dp\s*,\s*height\s*=\s*([-\d.]+)\.dp\s*\)/;
    const call = this.findEnclosingCall(anchorIdx);
    const searchTarget = call ? call.argText : this.source.slice(Math.max(0, anchorIdx - 200), Math.min(this.source.length, anchorIdx + 400));
    const matchNamed = sizeNamedRegex.exec(searchTarget);

    if (matchNamed) {
      const currW = parseFloat(matchNamed[1]);
      const currH = parseFloat(matchNamed[2]);
      const newW = Math.max(1.0, parseFloat((currW + widthDp).toFixed(2)));
      const newH = Math.max(1.0, parseFloat((currH + heightDp).toFixed(2)));
      const replacement = `.size(width = ${formatDp(newW)}, height = ${formatDp(newH)})`;

      if (call) {
        const newArgText = call.argText.slice(0, matchNamed.index) + replacement + call.argText.slice(matchNamed.index + matchNamed[0].length);
        this.source = this.source.slice(0, call.openParen + 1) + newArgText + this.source.slice(call.closeParen);
      } else {
        const globalIdx = Math.max(0, anchorIdx - 200) + matchNamed.index;
        this.source = this.source.slice(0, globalIdx) + replacement + this.source.slice(globalIdx + matchNamed[0].length);
      }
      return true;
    }

    return false;
  }

  /**
   * Adjusts container spacing (Arrangement.spacedBy).
   *
   * @param {string|RegExp} containerAnchor
   * @param {number} deltaGapDp
   * @returns {boolean}
   */
  applySpacedBy(containerAnchor, deltaGapDp) {
    const anchorIdx = this.findAnchorIndex(containerAnchor);
    if (anchorIdx === -1) return false;

    const spacedByRegex = /Arrangement\.spacedBy\s*\(\s*([-\d.]+)\.dp\s*\)/;
    const searchWindow = this.source.slice(Math.max(0, anchorIdx - 300), Math.min(this.source.length, anchorIdx + 600));
    const match = spacedByRegex.exec(searchWindow);

    if (match) {
      const globalIdx = Math.max(0, anchorIdx - 300) + match.index;
      const currGap = parseFloat(match[1]);
      const newGap = Math.max(0.0, parseFloat((currGap + deltaGapDp).toFixed(2)));
      const replacement = `Arrangement.spacedBy(${formatDp(newGap)})`;
      this.source = this.source.slice(0, globalIdx) + replacement + this.source.slice(globalIdx + match[0].length);
      return true;
    }

    return false;
  }

  /**
   * Updates TextStyle typography parameters (fontSize, lineHeight, letterSpacing).
   *
   * @param {string|RegExp} anchor
   * @param {Object} typoParams
   * @returns {boolean}
   */
  applyTypography(anchor, typoParams = {}) {
    const anchorIdx = this.findAnchorIndex(anchor);
    if (anchorIdx === -1) return false;

    const call = this.findEnclosingCall(anchorIdx);
    if (!call) return false;

    let argText = call.argText;
    let modified = false;

    if (typoParams.fontSize) {
      const fsVal = typeof typoParams.fontSize === 'number' ? typoParams.fontSize : parseFloat(typoParams.fontSize);
      const fsRegex = /fontSize\s*=\s*([-\d.()]+)\.sp/;
      if (fsRegex.test(argText)) {
        argText = argText.replace(fsRegex, `fontSize = ${formatSp(fsVal)}`);
        modified = true;
      }
    }

    if (typoParams.lineHeight) {
      const lhVal = typeof typoParams.lineHeight === 'number' ? typoParams.lineHeight : parseFloat(typoParams.lineHeight);
      const lhRegex = /lineHeight\s*=\s*([-\d.()]+)\.sp/;
      if (lhRegex.test(argText)) {
        argText = argText.replace(lhRegex, `lineHeight = ${formatSp(lhVal)}`);
        modified = true;
      }
    }

    if (typoParams.letterSpacing) {
      const lsVal = typeof typoParams.letterSpacing === 'number' ? typoParams.letterSpacing : parseFloat(typoParams.letterSpacing);
      const lsRegex = /letterSpacing\s*=\s*([-\d.()]+)\.sp/;
      if (lsRegex.test(argText)) {
        argText = argText.replace(lsRegex, `letterSpacing = ${formatSp(lsVal)}`);
        modified = true;
      }
    }

    if (modified) {
      this.source = this.source.slice(0, call.openParen + 1) + argText + this.source.slice(call.closeParen);
      return true;
    }

    return false;
  }

  /**
   * Applies a suite of structured resolution directives from DriftResolver.
   * Enforces Sentinel P0 directives:
   *   - Routes translation to Modifier.offset (never negative padding)
   *   - Protects multi-line wrap collapse with Modifier.width(140.dp)
   *   - Damps step-sizes via adaptive alpha factor
   *
   * @param {Array<Object>} directives
   * @param {Object} [options]
   * @returns {number} Count of applied mutations
   */
  applyDirectives(directives, options = {}) {
    if (!Array.isArray(directives)) return 0;
    const globalDamping = options.damping !== undefined ? options.damping : 1.0;
    const dampingMap = options.dampingMap || new Map();
    let appliedCount = 0;

    for (const dir of directives) {
      // 1. Spacing directives (Arrangement.spacedBy)
      if (dir.type === 'containerSpacing' || dir.layoutModifiers?.containerSpacing) {
        const delta = dir.deltaGapDp || dir.layoutModifiers?.containerSpacing?.deltaGapDp;
        if (delta && Math.abs(delta) >= 0.2) {
          const changed = this.applySpacedBy('PillCategoryRow', delta * globalDamping) ||
                          this.applySpacedBy('Arrangement.spacedBy', delta * globalDamping);
          if (changed) appliedCount++;
        }
        continue;
      }

      // 2. Multi-line wrap collapse protection (Modifier.width)
      if (dir.layoutModifiers?.width && (dir.layoutModifiers.width.reason === 'multi_line_wrap_prevention' || dir.layoutModifiers.width.widthDp >= 140)) {
        const targetWidth = dir.layoutModifiers.width.widthDp || 140;
        const changed = this.applyWidth('PillCategoryRow', targetWidth) ||
                        this.applyWidth('category', targetWidth) ||
                        this.applyWidth('Modifier.width(100.dp)', targetWidth);
        if (changed) appliedCount++;
      }

      // 2b. Typography adjustments (fontSize, lineHeight, letterSpacing)
      if (dir.typography) {
        const typoCandidates = [dir.text, dir.name, dir.elementId].filter(c => typeof c === 'string' && c.trim().length > 0);
        for (const anchor of typoCandidates) {
          if (this.applyTypography(anchor, dir.typography)) {
            appliedCount++;
            break;
          }
        }
      }

      // 3. Translation and Size adjustments
      const alpha = dampingMap.has(dir.elementId) ? dampingMap.get(dir.elementId) : globalDamping;
      const dxDp = dir.measuredShift?.dxDp || 0;
      const dyDp = dir.measuredShift?.dyDp || 0;

      // Deadband check: ignore sub-dp drift <= 0.5dp (1.0px)
      if (Math.abs(dxDp) < 0.5 && Math.abs(dyDp) < 0.5) {
        continue;
      }

      // Inverse compensation
      const compX = -dxDp * alpha;
      const compY = -dyDp * alpha;

      // Try multiple candidate anchors: specific text, then name, then elementId
      const candidates = [dir.text, dir.name, dir.elementId].filter(c => typeof c === 'string' && c.trim().length > 0);
      let offsetApplied = false;
      for (const anchor of candidates) {
        if (this.applyOffset(anchor, compX, compY)) {
          offsetApplied = true;
          break;
        }
      }

      if (offsetApplied) {
        appliedCount++;
      }

      // Size adjustment if present
      if (dir.layoutModifiers?.size && dir.dimensionShift) {
        const dW = dir.dimensionShift.dWidthDp || 0;
        const dH = dir.dimensionShift.dHeightDp || 0;
        if (Math.abs(dW) >= 1.0 || Math.abs(dH) >= 1.0) {
          for (const anchor of candidates) {
            if (this.applySize(anchor, -dW * alpha, -dH * alpha)) {
              break;
            }
          }
        }
      }
    }

    return appliedCount;
  }
}

/**
 * Autonomous Closed-Loop Visual Auto-Tuner Controller.
 */
class ClosedLoopAutoTuner {
  /**
   * @param {Object} options
   */
  constructor(options = {}) {
    this.screenName = options.screenName || options.screen || null;
    this.artifactId = options.artifactId || options.artifact || null;
    this.maxIterations = options.maxIterations !== undefined ? options.maxIterations : 5;
    this.damping = options.damping !== undefined ? options.damping : 0.70;
    this.dryRun = Boolean(options.dryRun);
    this.json = Boolean(options.json);
    this.projectRoot = options.projectRoot || path.resolve(__dirname, '..');
    this.androidDir = options.androidDir || path.join(this.projectRoot, 'android');
    this.outputDir = options.outputDir || options.output || path.join(this.projectRoot, 'verification');

    this.thresholds = {
      minContourScore: options.minContourScore !== undefined ? options.minContourScore : 90.0,
      minElementIou: options.minElementIou !== undefined ? options.minElementIou : 90.0,
      maxShiftPx: options.maxShiftPx !== undefined ? options.maxShiftPx : 3.0,
      minInkIou: options.minInkIou !== undefined ? options.minInkIou : 55.0,
      minMssim: options.minMssim !== undefined ? options.minMssim : 0.72
    };

    this._resolvePaths(options);

    this.adaptiveDamping = new Map();
    this.history = [];
    this.snapshots = new Map();
    this.bestIteration = 0;
    this.bestScore = -Infinity;
    this.bestMaxShift = Infinity;
  }

  log(msg) {
    if (!this.json) {
      console.log(`[ClosedLoopAutoTuner] ${msg}`);
    }
  }

  _resolvePaths(options) {
    const artKey = String(this.artifactId || this.screenName || '').toLowerCase();

    if (artKey.includes('da63')) {
      if (!this.screenName) this.screenName = 'Da63DesignScreen';
      if (!this.artifactId) this.artifactId = 'da63';
      this.refScreenshot = options.refScreenshot || options.desktopReferenceScreenshot || path.resolve(this.projectRoot, 'output/test_da63/screenshots/desktop_reference.png');
      this.renderedScreenshot = options.renderedScreenshot || options.renderedPreviewScreenshot || path.resolve(this.projectRoot, 'output/test_da63/rendered_compose.png');
      this.specPath = options.specPath || options.spec || path.resolve(this.projectRoot, 'output/test_da63/design_spec.json');
      this.screenFilePath = options.screenFilePath || options.screenFile || path.resolve(this.androidDir, 'app/src/main/java/com/claude/compose/screen/Da63DesignScreen.kt');
    } else if (artKey.includes('e34f')) {
      if (!this.screenName) this.screenName = 'E34fDesignScreen';
      if (!this.artifactId) this.artifactId = 'e34f';
      this.refScreenshot = options.refScreenshot || options.desktopReferenceScreenshot || path.resolve(this.projectRoot, 'output/test_e34f/screenshots/desktop_reference.png');
      this.renderedScreenshot = options.renderedScreenshot || options.renderedPreviewScreenshot || path.resolve(this.projectRoot, 'output/test_e34f/rendered_compose.png');
      this.specPath = options.specPath || options.spec || path.resolve(this.projectRoot, 'output/test_e34f/design_spec.json');
      this.screenFilePath = options.screenFilePath || options.screenFile || path.resolve(this.androidDir, 'app/src/main/java/com/claude/compose/screen/E34fDesignScreen.kt');
    } else {
      const defaultRef = fs.existsSync(path.resolve(this.outputDir, 'screenshots/desktop_reference.png'))
        ? path.resolve(this.outputDir, 'screenshots/desktop_reference.png')
        : path.resolve(this.outputDir, 'desktop_reference.png');
      this.refScreenshot = options.refScreenshot || options.desktopReferenceScreenshot || defaultRef;
      this.renderedScreenshot = options.renderedScreenshot || options.renderedPreviewScreenshot || path.resolve(this.outputDir, 'rendered_compose.png');
      this.specPath = options.specPath || options.spec || path.resolve(this.projectRoot, 'design_spec.json');
      this.screenFilePath = options.screenFilePath || options.screenFile || (this.screenName ? path.resolve(this.androidDir, `app/src/main/java/com/claude/compose/screen/${this.screenName}.kt`) : null);
    }
  }

  rollbackToBest() {
    if (this.screenFilePath && this.snapshots.has(this.bestIteration)) {
      const bestCode = this.snapshots.get(this.bestIteration);
      fs.writeFileSync(this.screenFilePath, bestCode, 'utf8');
      this.log(`Rolled back ${path.basename(this.screenFilePath)} to snapshot of iteration ${this.bestIteration}.`);
    }
  }

  async run() {
    this.log(`Target: ${this.screenName} (${this.artifactId}) | Max Iterations: ${this.maxIterations} | Damping: ${this.damping} | Dry-Run: ${this.dryRun}`);

    // Disable Sharp caching to guarantee fresh bitmap decoding
    try {
      const sharp = require('sharp');
      sharp.cache(false);
    } catch (_) {}

    const buildRunner = new BuildRunner({
      projectRoot: this.projectRoot,
      androidDir: this.androidDir
    });

    // Save initial backup of screen file
    if (this.screenFilePath && fs.existsSync(this.screenFilePath)) {
      const initialCode = fs.readFileSync(this.screenFilePath, 'utf8');
      this.snapshots.set(0, initialCode);
      const bakPath = `${this.screenFilePath}.bak`;
      fs.writeFileSync(bakPath, initialCode, 'utf8');
    }

    let finalResult = null;
    let consecutiveNoImprovement = 0;
    const patienceLimit = 2;

    for (let k = 1; k <= this.maxIterations; k++) {
      this.log(`\n=== Iteration ${k}/${this.maxIterations} ===`);

      // 1. Headless Preview Render (via Robolectric Native Graphics)
      if (!this.dryRun) {
        this.log(`Compiling & rendering preview headlessly via Robolectric...`);
        const renderRes = await buildRunner.runArtifactScreenshot(this.artifactId, { daemon: true });
        if (!renderRes.success) {
          this.log(`Robolectric preview execution failed: ${renderRes.failureReason}`);
          this.rollbackToBest();
          finalResult = {
            converged: false,
            iterationsRun: k,
            bestIteration: this.bestIteration,
            error: `Robolectric render test failed: ${renderRes.failureReason}`,
            history: this.history
          };
          break;
        }
      }

      // Check rendered image existence
      if (!fs.existsSync(this.renderedScreenshot)) {
        throw new Error(`Rendered screenshot not found at: ${this.renderedScreenshot}`);
      }
      if (!fs.existsSync(this.refScreenshot)) {
        throw new Error(`Reference screenshot not found at: ${this.refScreenshot}`);
      }

      // 2. Execute Objective Visual Diff
      this.log(`Executing objective visual diff (Sobel edge contour + dynamic bg + zonal drift)...`);
      const { runDiff } = require('./run_diff');
      const diffOutput = path.join(this.outputDir, `iter_${k}`);
      if (!fs.existsSync(diffOutput)) {
        fs.mkdirSync(diffOutput, { recursive: true });
      }

      const diffResult = await runDiff({
        ref: this.refScreenshot,
        rendered: this.renderedScreenshot,
        output: diffOutput,
        specPath: this.specPath,
        threshold: 0.1
      });

      const metrics = {
        edgeContourScore: diffResult.edgeContourScore !== undefined ? diffResult.edgeContourScore : 0,
        elementIouScore: diffResult.elementIouScore !== undefined ? diffResult.elementIouScore : 0,
        maxSpatialShiftPx: diffResult.maxSpatialShiftPx !== undefined ? diffResult.maxSpatialShiftPx : 999,
        inkIou: diffResult.inkIou !== undefined ? diffResult.inkIou : 0,
        mssimScore: diffResult.mssimScore !== undefined ? diffResult.mssimScore : 0,
        pixelSimilarityPercentage: diffResult.pixelSimilarityPercentage || 0
      };

      const compositeScore = calculateCompositeScore(metrics);
      this.log(`Scores: Contour=${metrics.edgeContourScore}% | ElementIoU=${metrics.elementIouScore}% | MaxShift=${metrics.maxSpatialShiftPx}px | InkIoU=${metrics.inkIou}% | MSSIM=${metrics.mssimScore} | Q=${compositeScore.toFixed(2)}`);

      // 3. Check Convergence Criteria
      const convCheck = checkConvergence(metrics, this.thresholds);
      const iterRecord = {
        iteration: k,
        metrics,
        compositeScore,
        converged: convCheck.converged,
        violations: convCheck.violations,
        driftVectors: diffResult.driftVectors || []
      };
      this.history.push(iterRecord);

      if (convCheck.converged) {
        this.log(`✓ ALL ANTI-DECEPTION QUALITY GATES PASSED! Auto-Tuner converged on iteration ${k}.`);
        this.bestIteration = k;
        finalResult = {
          converged: true,
          iterationsRun: k,
          bestIteration: k,
          metrics,
          antiDeceptionPassed: true,
          deceptionViolations: [],
          history: this.history
        };
        break;
      }

      this.log(`Violations: ${convCheck.violations.join('; ')}`);

      // Track best snapshot
      if (compositeScore > this.bestScore) {
        this.bestScore = compositeScore;
        this.bestMaxShift = metrics.maxSpatialShiftPx;
        this.bestIteration = k;
        consecutiveNoImprovement = 0;
        if (this.screenFilePath && fs.existsSync(this.screenFilePath)) {
          this.snapshots.set(k, fs.readFileSync(this.screenFilePath, 'utf8'));
        }
      } else {
        consecutiveNoImprovement++;
      }

      // Check for regression
      if (k > 1 && detectRegression(compositeScore, this.bestScore, metrics.maxSpatialShiftPx, this.bestMaxShift)) {
        this.log(`⚠️ Quality regression detected (Q=${compositeScore.toFixed(2)} vs Q_best=${this.bestScore.toFixed(2)}). Rolling back to snapshot ${this.bestIteration}...`);
        this.rollbackToBest();
        this.damping = Math.max(0.2, this.damping * 0.7);
      }

      // 4. Resolve Drift Directives
      const resolver = new DriftResolver({ scale: 2.0 });
      let specData = null;
      if (this.specPath && fs.existsSync(this.specPath)) {
        try { specData = JSON.parse(fs.readFileSync(this.specPath, 'utf8')); } catch (_) {}
      }
      const plan = resolver.resolve(diffResult.zonal || { driftVectors: diffResult.driftVectors }, specData);

      // Check oscillation per element
      for (const d of plan.directives) {
        if (detectOscillation(this.history, d.elementId)) {
          const prevAlpha = this.adaptiveDamping.get(d.elementId) || this.damping;
          const newAlpha = Math.max(0.2, prevAlpha * 0.5);
          this.adaptiveDamping.set(d.elementId, newAlpha);
          this.log(`[Oscillation Guard] Vector reversal detected on "${d.name}" (${d.elementId}). Halving damping: ${prevAlpha.toFixed(2)} -> ${newAlpha.toFixed(2)}`);
        }
      }

      // Dry run exit: report planned directives without mutating files
      if (this.dryRun) {
        this.log(`[Dry Run] Successfully planned ${plan.directives.length} mutation directives without modifying files.`);
        if (plan.directives.length > 0) {
          this.log(`Sample planned directives:`);
          plan.directives.slice(0, 5).forEach((d) => {
            this.log(`  - [${d.name || d.elementId}] (${d.category}): shift=(${d.measuredShift.dxDp}dp, ${d.measuredShift.dyDp}dp)`);
          });
        }
        finalResult = {
          converged: false,
          iterationsRun: k,
          bestIteration: k,
          metrics,
          dryRun: true,
          plannedDirectives: plan.directives,
          antiDeceptionPassed: false,
          deceptionViolations: convCheck.violations,
          history: this.history
        };
        break;
      }

      if (k >= this.maxIterations) {
        this.log(`Max iterations (${this.maxIterations}) exhausted without full convergence.`);
        if (this.bestIteration > 0 && this.bestIteration !== k) {
          this.log(`Restoring screen to best snapshot (iteration ${this.bestIteration}, score: ${this.bestScore}).`);
          this.rollbackToBest();
        }
        finalResult = {
          converged: false,
          iterationsRun: k,
          bestIteration: this.bestIteration,
          metrics,
          antiDeceptionPassed: false,
          deceptionViolations: convCheck.violations,
          history: this.history
        };
        break;
      }

      if (consecutiveNoImprovement >= patienceLimit) {
        this.log(`Patience limit (${patienceLimit}) reached with no improvement. Halting tuning loop.`);
        this.rollbackToBest();
        finalResult = {
          converged: false,
          iterationsRun: k,
          bestIteration: this.bestIteration,
          metrics,
          antiDeceptionPassed: false,
          deceptionViolations: convCheck.violations,
          history: this.history
        };
        break;
      }

      // 5. Mutate Target Screen File
      if (this.screenFilePath && fs.existsSync(this.screenFilePath)) {
        const currentCode = fs.readFileSync(this.screenFilePath, 'utf8');
        this.snapshots.set(k, currentCode);

        const mutator = new KotlinComposeMutator(currentCode);
        const applied = mutator.applyDirectives(plan.directives, {
          damping: this.damping,
          dampingMap: this.adaptiveDamping
        });

        const mutatedCode = mutator.getSource();
        if (mutatedCode !== currentCode) {
          fs.writeFileSync(this.screenFilePath, mutatedCode, 'utf8');
          this.log(`Applied ${applied} mutations to ${path.basename(this.screenFilePath)}.`);

          // Verify Kotlin compilation
          this.log(`Verifying Kotlin compilation (./gradlew compileDebugKotlin)...`);
          const compileRes = await buildRunner.compile({ daemon: true });
          if (!compileRes.success) {
            this.log(`⚠️ Compilation failed: ${compileRes.failureReason}. Reverting mutation...`);
            fs.writeFileSync(this.screenFilePath, currentCode, 'utf8');
            this.damping = Math.max(0.2, this.damping * 0.7);
          } else {
            this.log(`✓ Compilation succeeded.`);
          }
        } else {
          this.log(`No applicable code modifications found for current directives.`);
        }
      }
    }

    if (this.json) {
      process.stdout.write(JSON.stringify(finalResult, null, 2) + '\n');
    }

    return finalResult;
  }
}

/**
 * Functional entrypoint for auto-tuning a screen.
 *
 * @param {Object} options
 * @returns {Promise<Object>}
 */
async function autoTuneScreen(options = {}) {
  const tuner = new ClosedLoopAutoTuner(options);
  return tuner.run();
}

/**
 * Backward-compatible advisory AutoTuner class for zonal diff analysis.
 */
class AutoTuner {
  constructor(zonalReport) {
    this.report = zonalReport;
  }

  generateTuningDirectives() {
    if (!this.report || !Array.isArray(this.report.zones)) return [];

    const directives = [];

    for (const zone of this.report.zones) {
      const { id, name, similarity, centroidDrift, ssimScore } = zone;
      const { deltaX, deltaY, deltaXDp, deltaYDp } = centroidDrift;

      const needsXAdjustment = Math.abs(deltaXDp) >= 1.5;
      const needsYAdjustment = Math.abs(deltaYDp) >= 1.5;

      if (needsXAdjustment || needsYAdjustment || similarity < 90.0) {
        const directive = {
          zoneId: id,
          zoneName: name,
          currentSimilarity: similarity,
          ssimScore,
          driftPx: { x: deltaX, y: deltaY },
          driftDp: { x: deltaXDp, y: deltaYDp },
          recommendedCorrections: []
        };

        if (needsYAdjustment) {
          if (deltaYDp > 0) {
            directive.recommendedCorrections.push({
              target: 'Vertical Alignment / Padding',
              action: `Reduce top padding or Spacer height by ${Math.abs(deltaYDp)}dp (element rendered ${deltaYDp}dp too low)`
            });
          } else {
            directive.recommendedCorrections.push({
              target: 'Vertical Alignment / Padding',
              action: `Increase top padding or Spacer height by ${Math.abs(deltaYDp)}dp (element rendered ${Math.abs(deltaYDp)}dp too high)`
            });
          }
        }

        if (needsXAdjustment) {
          if (deltaXDp > 0) {
            directive.recommendedCorrections.push({
              target: 'Horizontal Offset / Origin',
              action: `Shift horizontal start anchor or reduce start padding by ${Math.abs(deltaXDp)}dp (rendered ${deltaXDp}dp too far right)`
            });
          } else {
            directive.recommendedCorrections.push({
              target: 'Horizontal Offset / Origin',
              action: `Shift horizontal start anchor or increase start padding by ${Math.abs(deltaXDp)}dp (rendered ${Math.abs(deltaXDp)}dp too far left)`
            });
          }
        }

        if (similarity < 88.0 && !needsYAdjustment && !needsXAdjustment) {
          directive.recommendedCorrections.push({
            target: 'Shape / Stroke Geometry',
            action: 'Internal path mismatch detected without centroid drift; refine stroke linecaps or curve control points'
          });
        }

        directives.push(directive);
      }
    }

    return directives;
  }

  toMarkdown(directives) {
    let md = `### Localized Auto-Tuner Directives\n\n`;
    md += `| Zone | Measured Drift (dp) | Current Match | Recommended Compensation |\n`;
    md += `| :--- | :--- | :--- | :--- |\n`;

    for (const d of directives) {
      const driftStr = `Δx: ${d.driftDp.x}dp, Δy: ${d.driftDp.y}dp`;
      const actions = d.recommendedCorrections.map(c => `• **${c.target}**: ${c.action}`).join('<br>');
      md += `| **${d.zoneName}** | \`${driftStr}\` | ${d.currentSimilarity}% | ${actions || 'Within tolerance'} |\n`;
    }

    return md;
  }
}

// CLI Execution Entrypoint
if (require.main === module) {
  const program = new Command();

  program
    .name('auto_tuner')
    .description('Automated Closed-Loop Visual Auto-Tuner for claude-to-compose')
    .option('-s, --screen <name>', 'Target Compose screen composable name (e.g. Da63DesignScreen, E34fDesignScreen)')
    .option('-a, --artifact <id>', 'Target Claude Design artifact ID or folder name (e.g. test_da63, test_e34f, da63, e34f)')
    .option('-n, --max-iterations <number>', 'Maximum tuning iterations', val => parseInt(val, 10), 5)
    .option('--damping <number>', 'Initial damping factor (0.1 - 1.0)', parseFloat, 0.70)
    .option('--spec <path>', 'Path to design_spec.json')
    .option('--ref <path>', 'Path to reference screenshot (desktop_reference.png)')
    .option('--rendered <path>', 'Path to rendered Compose preview screenshot (rendered_compose.png)')
    .option('--android-dir <path>', 'Path to android project directory')
    .option('--output <dir>', 'Output directory for diffs and report')
    .option('--min-contour <number>', 'Minimum edge contour alignment score', parseFloat, 90.0)
    .option('--min-element-iou <number>', 'Minimum element bounding box IoU', parseFloat, 90.0)
    .option('--max-shift-px <number>', 'Maximum allowable spatial shift in pixels', parseFloat, 3.0)
    .option('--min-ink-iou <number>', 'Minimum ink IoU percentage', parseFloat, 55.0)
    .option('--min-mssim <number>', 'Minimum MSSIM score', parseFloat, 0.72)
    .option('--dry-run', 'Compute drift vectors and planned mutations without writing to disk or executing Gradle', false)
    .option('--json', 'Output results as JSON to stdout', false)
    // Legacy advisory option:
    .option('-i, --input <path>', 'Legacy advisory mode: Path to zonal_diff.json')
    .parse(process.argv);

  const opts = program.opts();

  // If invoked with legacy --input without --screen or --artifact, run advisory mode
  if (opts.input && !opts.screen && !opts.artifact) {
    const inputPath = path.resolve(opts.input);
    if (!fs.existsSync(inputPath)) {
      console.error(`Error: Zonal diff file not found at ${inputPath}`);
      process.exit(1);
    }
    const raw = JSON.parse(fs.readFileSync(inputPath, 'utf-8'));
    const tuner = new AutoTuner(raw);
    const directives = tuner.generateTuningDirectives();
    if (opts.json) {
      console.log(JSON.stringify(directives, null, 2));
    } else {
      console.log('\n=== Compose Layout Auto-Tuner Directives ===\n');
      for (const d of directives) {
        console.log(`Zone: ${d.zoneName} (${d.currentSimilarity}%, SSIM: ${d.ssimScore})`);
        console.log(`  Centroid Drift: Δx = ${d.driftDp.x} dp, Δy = ${d.driftDp.y} dp`);
        d.recommendedCorrections.forEach(c => console.log(`  -> [${c.target}] ${c.action}`));
        console.log('');
      }
      console.log(tuner.toMarkdown(directives));
    }
    process.exit(0);
  }

  const tuner = new ClosedLoopAutoTuner({
    screenName: opts.screen,
    artifactId: opts.artifact,
    maxIterations: opts.maxIterations,
    damping: opts.damping,
    specPath: opts.spec,
    refScreenshot: opts.ref,
    renderedScreenshot: opts.rendered,
    androidDir: opts.androidDir,
    outputDir: opts.output,
    minContourScore: opts.minContour,
    minElementIou: opts.minElementIou,
    maxShiftPx: opts.maxShiftPx,
    minInkIou: opts.minInkIou,
    minMssim: opts.minMssim,
    dryRun: opts.dryRun,
    json: opts.json
  });

  function safeExit(code) {
    if (process.stdout.writableNeedDrain || process.stdout.writableLength > 0) {
      process.stdout.once('drain', () => process.exit(code));
    } else {
      process.stdout.write('', () => process.exit(code));
    }
  }

  tuner.run()
    .then((res) => {
      const exitCode = (res && (res.converged || res.dryRun)) ? 0 : 1;
      safeExit(exitCode);
    })
    .catch((err) => {
      console.error(`Auto-Tuner Error: ${err.message}`);
      safeExit(1);
    });
}

module.exports = {
  AutoTuner,
  ClosedLoopAutoTuner,
  KotlinComposeMutator,
  autoTuneScreen,
  runClosedLoopTuning: autoTuneScreen,
  checkConvergence,
  detectOscillation,
  detectRegression,
  calculateCompositeScore
};
