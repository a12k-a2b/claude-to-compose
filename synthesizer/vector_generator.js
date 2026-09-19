/**
 * synthesizer/vector_generator.js
 * Comprehensive SVG vector translation to Jetpack Compose ImageVector DSL and Android VectorDrawable XML.
 * Adheres strictly to Compose 2024.10 / Material 3 and Android SDK platforms 33-36 standards.
 */

const fs = require('node:fs');
const path = require('node:path');

class VectorGenerator {
  /**
   * Sanitizes raw SVG text by stripping script, foreignObject, and filter tags.
   * @param {string} rawSvg
   * @returns {string}
   */
  static sanitizeSvg(rawSvg) {
    if (!rawSvg || typeof rawSvg !== 'string') return '';
    return rawSvg
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/<foreignObject\b[^<]*(?:(?!<\/foreignObject>)<[^<]*)*<\/foreignObject>/gi, '')
      .replace(/<filter\b[^<]*(?:(?!<\/filter>)<[^<]*)*<\/filter>/gi, '');
  }

  /**
   * Escapes XML reserved characters.
   * @param {string} str
   * @returns {string}
   */
  static escapeXml(str) {
    if (!str || typeof str !== 'string') return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  /**
   * Normalizes dimensions, falling back to 24dp x 24dp if missing, 0, or negative.
   * @param {Object} dim - { width, height, viewBox }
   * @returns {{ width: number, height: number, viewportWidth: number, viewportHeight: number }}
   */
  static getSafeVectorDimensions(dim) {
    const d = dim || {};
    let w = parseFloat(d.width) || 0;
    let h = parseFloat(d.height) || 0;
    let vw = w;
    let vh = h;

    if (d.viewBox && typeof d.viewBox === 'string') {
      const parts = d.viewBox.trim().split(/[\s,]+/).map(Number);
      if (parts.length === 4 && parts[2] > 0 && parts[3] > 0) {
        vw = parts[2];
        vh = parts[3];
        if (!w) w = vw;
        if (!h) h = vh;
      }
    }

    if (w <= 0) w = 24;
    if (h <= 0) h = 24;
    if (vw <= 0) vw = w;
    if (vh <= 0) vh = h;

    return {
      width: Math.max(Math.round(w), 1),
      height: Math.max(Math.round(h), 1),
      viewportWidth: Math.max(vw, 1),
      viewportHeight: Math.max(vh, 1)
    };
  }

  /**
   * Formats a CSS color into a Compose 32-bit ARGB hex string (0xAARRGGBB).
   * @param {string} colorStr
   * @returns {string|null} e.g. "0xFF4F46E5" or null
   */
  static formatComposeColor(colorStr) {
    if (!colorStr || colorStr === 'none' || colorStr === 'transparent') return null;

    // 6-digit hex: #RRGGBB
    let m = colorStr.match(/^#([A-Fa-f0-9]{2})([A-Fa-f0-9]{2})([A-Fa-f0-9]{2})$/);
    if (m) return `0xFF${m[1].toUpperCase()}${m[2].toUpperCase()}${m[3].toUpperCase()}`;

    // 3-digit hex: #RGB
    m = colorStr.match(/^#([A-Fa-f0-9])([A-Fa-f0-9])([A-Fa-f0-9])$/);
    if (m) return `0xFF${m[1].toUpperCase()}${m[1].toUpperCase()}${m[2].toUpperCase()}${m[2].toUpperCase()}${m[3].toUpperCase()}${m[3].toUpperCase()}`;

    // 8-digit hex: #RRGGBBAA -> 0xAARRGGBB
    m = colorStr.match(/^#([A-Fa-f0-9]{2})([A-Fa-f0-9]{2})([A-Fa-f0-9]{2})([A-Fa-f0-9]{2})$/);
    if (m) return `0x${m[4].toUpperCase()}${m[1].toUpperCase()}${m[2].toUpperCase()}${m[3].toUpperCase()}`;

    // rgb(r, g, b) or rgba(r, g, b, a)
    m = colorStr.match(/^rgba?\((\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*([\d.]+))?\)$/i);
    if (m) {
      const r = parseInt(m[1], 10).toString(16).padStart(2, '0').toUpperCase();
      const g = parseInt(m[2], 10).toString(16).padStart(2, '0').toUpperCase();
      const b = parseInt(m[3], 10).toString(16).padStart(2, '0').toUpperCase();
      const a = m[4] !== undefined ? Math.round(parseFloat(m[4]) * 255).toString(16).padStart(2, '0').toUpperCase() : 'FF';
      return `0x${a}${r}${g}${b}`;
    }

    return '0xFF000000';
  }

  /**
   * Formats a CSS color into Android XML hex format (#AARRGGBB or #RRGGBB).
   * @param {string} colorStr
   * @returns {string|null}
   */
  static formatXmlColor(colorStr) {
    const composeHex = VectorGenerator.formatComposeColor(colorStr);
    if (!composeHex) return null;
    return '#' + composeHex.replace('0x', '');
  }

  /**
   * Tokenizes an SVG path string into commands and numeric arguments.
   * Handles compact numbers (e.g. "M10-20.5.5"), scientific notation, and multiple subpaths.
   * @param {string} d
   * @returns {Array<{ command: string, isRelative: boolean, args: number[] }>}
   */
  static tokenizePath(d) {
    if (!d || typeof d !== 'string') return [];

    const regex = /([a-df-z])|([+-]?(?:\d*\.\d+|\d+)(?:[eE][+-]?\d+)?)/gi;
    const tokens = [];
    let m;

    while ((m = regex.exec(d)) !== null) {
      if (m[1]) tokens.push({ type: 'cmd', val: m[1] });
      else if (m[2]) tokens.push({ type: 'num', val: parseFloat(m[2]) });
    }

    const segments = [];
    let i = 0;
    let currentCmd = null;

    while (i < tokens.length) {
      const prevI = i;
      if (tokens[i].type === 'cmd') {
        currentCmd = tokens[i].val;
        i++;
      }

      if (!currentCmd) break;
      const isRelative = currentCmd === currentCmd.toLowerCase();
      const cmdUpper = currentCmd.toUpperCase();

      if (cmdUpper === 'Z') {
        segments.push({ command: currentCmd, isRelative, args: [] });
        currentCmd = null;
      } else if (cmdUpper === 'H' || cmdUpper === 'V') {
        while (i < tokens.length && tokens[i].type === 'num') {
          segments.push({ command: currentCmd, isRelative, args: [tokens[i].val] });
          i++;
        }
      } else if (cmdUpper === 'M' || cmdUpper === 'L' || cmdUpper === 'T') {
        let first = true;
        while (i + 1 < tokens.length && tokens[i].type === 'num' && tokens[i + 1].type === 'num') {
          const effectiveCmd = first ? currentCmd : (isRelative ? 'l' : 'L');
          segments.push({
            command: effectiveCmd,
            isRelative: effectiveCmd === effectiveCmd.toLowerCase(),
            args: [tokens[i].val, tokens[i + 1].val]
          });
          i += 2;
          first = false;
        }
      } else if (cmdUpper === 'S' || cmdUpper === 'Q') {
        while (i + 3 < tokens.length &&
               tokens[i].type === 'num' && tokens[i + 1].type === 'num' &&
               tokens[i + 2].type === 'num' && tokens[i + 3].type === 'num') {
          segments.push({
            command: currentCmd,
            isRelative,
            args: [tokens[i].val, tokens[i + 1].val, tokens[i + 2].val, tokens[i + 3].val]
          });
          i += 4;
        }
      } else if (cmdUpper === 'C') {
        while (i + 5 < tokens.length &&
               tokens[i].type === 'num' && tokens[i + 1].type === 'num' &&
               tokens[i + 2].type === 'num' && tokens[i + 3].type === 'num' &&
               tokens[i + 4].type === 'num' && tokens[i + 5].type === 'num') {
          segments.push({
            command: currentCmd,
            isRelative,
            args: [tokens[i].val, tokens[i + 1].val, tokens[i + 2].val, tokens[i + 3].val, tokens[i + 4].val, tokens[i + 5].val]
          });
          i += 6;
        }
      } else if (cmdUpper === 'A') {
        while (i + 6 < tokens.length &&
               tokens[i].type === 'num' && tokens[i + 1].type === 'num' &&
               tokens[i + 2].type === 'num' && tokens[i + 3].type === 'num' &&
               tokens[i + 4].type === 'num' && tokens[i + 5].type === 'num' &&
               tokens[i + 6].type === 'num') {
          segments.push({
            command: currentCmd,
            isRelative,
            args: [tokens[i].val, tokens[i + 1].val, tokens[i + 2].val, tokens[i + 3].val, tokens[i + 4].val, tokens[i + 5].val, tokens[i + 6].val]
          });
          i += 7;
        }
      } else {
        i++;
      }

      if (i === prevI) {
        i++;
      }
    }

    return segments;
  }

  /**
   * Converts tokenized SVG path commands into Jetpack Compose PathBuilder DSL statements.
   * @param {string} d
   * @returns {string[]} Array of Kotlin DSL lines
   */
  static pathToComposeDsl(d) {
    const segments = VectorGenerator.tokenizePath(d);
    const lines = [];

    for (const seg of segments) {
      const { command, isRelative, args } = seg;
      const cmdUpper = command.toUpperCase();

      switch (cmdUpper) {
        case 'M':
          lines.push(isRelative ? `moveToRelative(${args[0]}f, ${args[1]}f)` : `moveTo(${args[0]}f, ${args[1]}f)`);
          break;
        case 'L':
          lines.push(isRelative ? `lineToRelative(${args[0]}f, ${args[1]}f)` : `lineTo(${args[0]}f, ${args[1]}f)`);
          break;
        case 'H':
          lines.push(isRelative ? `horizontalLineToRelative(${args[0]}f)` : `horizontalLineTo(${args[0]}f)`);
          break;
        case 'V':
          lines.push(isRelative ? `verticalLineToRelative(${args[0]}f)` : `verticalLineTo(${args[0]}f)`);
          break;
        case 'C':
          lines.push(isRelative
            ? `curveToRelative(${args[0]}f, ${args[1]}f, ${args[2]}f, ${args[3]}f, ${args[4]}f, ${args[5]}f)`
            : `curveTo(${args[0]}f, ${args[1]}f, ${args[2]}f, ${args[3]}f, ${args[4]}f, ${args[5]}f)`);
          break;
        case 'S':
          lines.push(isRelative
            ? `reflectiveCurveToRelative(${args[0]}f, ${args[1]}f, ${args[2]}f, ${args[3]}f)`
            : `reflectiveCurveTo(${args[0]}f, ${args[1]}f, ${args[2]}f, ${args[3]}f)`);
          break;
        case 'Q':
          lines.push(isRelative
            ? `quadToRelative(${args[0]}f, ${args[1]}f, ${args[2]}f, ${args[3]}f)`
            : `quadTo(${args[0]}f, ${args[1]}f, ${args[2]}f, ${args[3]}f)`);
          break;
        case 'T':
          lines.push(isRelative
            ? `reflectiveQuadToRelative(${args[0]}f, ${args[1]}f)`
            : `reflectiveQuadTo(${args[0]}f, ${args[1]}f)`);
          break;
        case 'A': {
          const rx = args[0];
          const ry = args[1];
          const theta = args[2];
          const isMoreThanHalf = args[3] === 1;
          const isPositiveArc = args[4] === 1;
          const x = args[5];
          const y = args[6];
          lines.push(isRelative
            ? `arcToRelative(${rx}f, ${ry}f, ${theta}f, ${isMoreThanHalf}, ${isPositiveArc}, ${x}f, ${y}f)`
            : `arcTo(${rx}f, ${ry}f, ${theta}f, ${isMoreThanHalf}, ${isPositiveArc}, ${x}f, ${y}f)`);
          break;
        }
        case 'Z':
          lines.push('close()');
          break;
      }
    }

    return lines;
  }

  /**
   * Sanitizes a name to PascalCase identifier suitable for Kotlin properties.
   * @param {string} rawName
   * @returns {string}
   */
  static toPascalCase(rawName) {
    if (!rawName) return 'Icon';
    return rawName
      .replace(/[^a-zA-Z0-9]+/g, ' ')
      .trim()
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join('');
  }

  /**
   * Sanitizes a name to snake_case identifier suitable for Android resources.
   * @param {string} rawName
   * @returns {string}
   */
  static toSnakeCase(rawName) {
    if (!rawName) return 'icon';
    return rawName
      .replace(/([a-z])([A-Z])/g, '$1_$2')
      .replace(/[^a-zA-Z0-9]+/g, '_')
      .toLowerCase()
      .replace(/^_+|_+$/g, '');
  }

  /**
   * Generates an individual Android XML VectorDrawable string.
   * @param {Object} vector - Vector object from design_spec.json
   * @returns {string} Android XML VectorDrawable
   */
  static generateVectorDrawableXml(vector) {
    const vec = vector || {};
    const dim = VectorGenerator.getSafeVectorDimensions(vec);
    const paths = (vec.paths || []).filter(p => p && typeof p === 'object');

    let xml = `<?xml version="1.0" encoding="utf-8"?>\n`;
    xml += `<vector xmlns:android="http://schemas.android.com/apk/res/android"\n`;
    xml += `    android:width="${dim.width}dp"\n`;
    xml += `    android:height="${dim.height}dp"\n`;
    xml += `    android:viewportWidth="${dim.viewportWidth}"\n`;
    xml += `    android:viewportHeight="${dim.viewportHeight}">\n`;

    if (paths.length === 0) {
      xml += `    <path\n`;
      xml += `        android:pathData="M0,0h24v24h-24z"\n`;
      xml += `        android:fillColor="#00000000" />\n`;
    } else {
      for (const p of paths) {
        const fillColor = VectorGenerator.formatXmlColor(p.fill);
        const strokeColor = VectorGenerator.formatXmlColor(p.stroke);
        const strokeWidth = p.strokeWidth !== undefined ? p.strokeWidth : (strokeColor ? 2 : 0);
        const escapedPathData = VectorGenerator.escapeXml(p.d || '');

        xml += `    <path\n`;
        if (fillColor) xml += `        android:fillColor="${fillColor}"\n`;
        if (strokeColor) {
          xml += `        android:strokeColor="${strokeColor}"\n`;
          xml += `        android:strokeWidth="${strokeWidth}"\n`;
          xml += `        android:strokeLineCap="round"\n`;
          xml += `        android:strokeLineJoin="round"\n`;
        }
        xml += `        android:pathData="${escapedPathData}" />\n`;
      }
    }

    xml += `</vector>\n`;
    return xml;
  }

  /**
   * Generates a complete Kotlin source file defining Compose ImageVectors.
   * @param {Array<Object>} vectors - Array of vector objects from design_spec.json
   * @param {Object} [options] - Configuration options
   * @returns {string} Kotlin source code
   */
  static generateImageVectorFile(vectors = [], options = {}) {
    const packageName = options.packageName || 'com.claude.compose.icons';
    const className = options.className || 'ClaudeIcons';

    let code = `package ${packageName}\n\n`;
    code += `import androidx.compose.ui.graphics.Color\n`;
    code += `import androidx.compose.ui.graphics.SolidColor\n`;
    code += `import androidx.compose.ui.graphics.StrokeCap\n`;
    code += `import androidx.compose.ui.graphics.StrokeJoin\n`;
    code += `import androidx.compose.ui.graphics.vector.ImageVector\n`;
    code += `import androidx.compose.ui.graphics.vector.PathBuilder\n`;
    code += `import androidx.compose.ui.graphics.vector.path\n`;
    code += `import androidx.compose.ui.unit.dp\n\n`;
    code += `public object ${className}\n\n`;

    const generatedNames = new Set();
    const safeVectors = (vectors || []).filter(v => v && typeof v === 'object');

    for (let idx = 0; idx < safeVectors.length; idx++) {
      const vec = safeVectors[idx];
      let baseName = VectorGenerator.toPascalCase(vec.name || `Icon_${idx + 1}`);
      if (!baseName.endsWith('Icon')) baseName += 'Icon';

      let propName = baseName;
      let counter = 1;
      while (generatedNames.has(propName)) {
        propName = `${baseName}_${++counter}`;
      }
      generatedNames.add(propName);

      const safeProp = /^[0-9]/.test(propName) ? `\`${propName}\`` : propName;
      const cleanPropForField = propName.replace(/`/g, '');
      const backingField = `_${cleanPropForField.charAt(0).toLowerCase() + cleanPropForField.slice(1)}`;
      const dim = VectorGenerator.getSafeVectorDimensions(vec);
      const paths = (vec.paths || []).filter(p => p && typeof p === 'object');

      code += `public val ${className}.${safeProp}: ImageVector\n`;
      code += `    get() {\n`;
      code += `        if (${backingField} != null) return ${backingField}!!\n`;
      code += `        ${backingField} = ImageVector.Builder(\n`;
      code += `            name = "${propName}",\n`;
      code += `            defaultWidth = ${dim.width}.dp,\n`;
      code += `            defaultHeight = ${dim.height}.dp,\n`;
      code += `            viewportWidth = ${dim.viewportWidth}f,\n`;
      code += `            viewportHeight = ${dim.viewportHeight}f\n`;
      code += `        ).apply {\n`;

      if (paths.length === 0) {
        code += `            path(\n`;
        code += `                fill = null,\n`;
        code += `                stroke = null\n`;
        code += `            ) {\n`;
        code += `                moveTo(0f, 0f)\n`;
        code += `                close()\n`;
        code += `            }\n`;
      } else {
        for (const p of paths) {
          const fillHex = VectorGenerator.formatComposeColor(p.fill);
          const strokeHex = VectorGenerator.formatComposeColor(p.stroke);
          const strokeWidth = p.strokeWidth !== undefined ? p.strokeWidth : (strokeHex ? 2 : 0);

          const fillExpr = fillHex ? `SolidColor(Color(${fillHex}))` : 'null';
          const strokeExpr = strokeHex ? `SolidColor(Color(${strokeHex}))` : 'null';

          code += `            path(\n`;
          code += `                fill = ${fillExpr},\n`;
          code += `                stroke = ${strokeExpr},\n`;
          code += `                strokeLineWidth = ${strokeWidth}f,\n`;
          code += `                strokeLineCap = StrokeCap.Round,\n`;
          code += `                strokeLineJoin = StrokeJoin.Round\n`;
          code += `            ) {\n`;

          const dslLines = VectorGenerator.pathToComposeDsl(p.d || '');
          if (dslLines.length === 0) {
            code += `                moveTo(0f, 0f)\n`;
            code += `                close()\n`;
          } else {
            for (const line of dslLines) {
              code += `                ${line}\n`;
            }
          }

          code += `            }\n`;
        }
      }

      code += `        }.build()\n`;
      code += `        return ${backingField}!!\n`;
      code += `    }\n\n`;
      code += `private var ${backingField}: ImageVector? = null\n\n`;
    }

    return code;
  }
}

module.exports = {
  VectorGenerator,
  sanitizeSvg: VectorGenerator.sanitizeSvg,
  escapeXml: VectorGenerator.escapeXml,
  getSafeVectorDimensions: VectorGenerator.getSafeVectorDimensions,
  tokenizePath: VectorGenerator.tokenizePath,
  pathToComposeDsl: VectorGenerator.pathToComposeDsl,
  generateImageVectorFile: VectorGenerator.generateImageVectorFile,
  generateVectorDrawableXml: VectorGenerator.generateVectorDrawableXml
};
