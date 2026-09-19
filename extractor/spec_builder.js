/**
 * extractor/spec_builder.js
 * Assembles normalized design specification, synthesizes theme tokens,
 * and validates against Draft 2020-12 schema using Ajv.
 */

const fs = require('fs');
const path = require('path');
const Ajv2020 = require('ajv/dist/2020');
const addFormats = require('ajv-formats');

function normalizeHex(hexStr, defaultHex = '#000000') {
  if (!hexStr || typeof hexStr !== 'string') return defaultHex;
  let clean = hexStr.trim();
  if (!clean.startsWith('#')) {
    clean = '#' + clean;
  }
  // Validate 6 or 8 hex characters
  if (/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{8})$/.test(clean)) {
    return clean.toUpperCase();
  }
  // Handle 3 hex characters
  if (/^#([A-Fa-f0-9]{3})$/.test(clean)) {
    const r = clean[1], g = clean[2], b = clean[3];
    return `#${r}${r}${g}${g}${b}${b}`.toUpperCase();
  }
  return defaultHex;
}

function calculateLuminance(hex) {
  const norm = normalizeHex(hex, '#000000');
  const r = parseInt(norm.slice(1, 3), 16) / 255;
  const g = parseInt(norm.slice(3, 5), 16) / 255;
  const b = parseInt(norm.slice(5, 7), 16) / 255;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function hexToRgb(hex) {
  const norm = normalizeHex(hex, '#000000');
  return {
    r: parseInt(norm.slice(1, 3), 16),
    g: parseInt(norm.slice(3, 5), 16),
    b: parseInt(norm.slice(5, 7), 16)
  };
}

function calculateSaturation(hex) {
  const { r, g, b } = hexToRgb(hex);
  const max = Math.max(r, g, b) / 255;
  const min = Math.min(r, g, b) / 255;
  const delta = max - min;
  const l = (max + min) / 2;
  if (delta === 0) return 0;
  return delta / (1 - Math.abs(2 * l - 1));
}

function calculateChroma(hex) {
  const { r, g, b } = hexToRgb(hex);
  return Math.max(r, g, b) - Math.min(r, g, b);
}

function isAchromatic(hex) {
  const chroma = calculateChroma(hex);
  const sat = calculateSaturation(hex);
  return chroma < 28 || sat < 0.18;
}

class SpecBuilder {
  constructor(options = {}) {
    this.options = options;
    this.schemaPath = path.resolve(__dirname, 'schema.json');
    this.ajv = new Ajv2020({ allErrors: true, strict: false });
    addFormats(this.ajv);

    if (fs.existsSync(this.schemaPath)) {
      const schemaData = JSON.parse(fs.readFileSync(this.schemaPath, 'utf8'));
      this.validateFn = this.ajv.compile(schemaData);
    } else {
      throw new Error(`Schema file not found at: ${this.schemaPath}`);
    }
  }

  /**
   * Traverses DOM hierarchy and collects color, typography, spacing, radius statistics
   */
  collectTokens(rootNode) {
    const colorStats = new Map(); // hex -> { occurrences, buttonBg, interactiveBg, textOccurrences, bgOccurrences }
    const fontFamilies = new Set();
    const spacings = new Set([0, 2, 4, 8, 12, 16, 20, 24, 32, 48, 64]);
    const radii = new Set();
    const shadows = [];
    const textStyles = [];

    function recordColor(hex, type) {
      if (!hex || hex === 'transparent' || hex === '#00000000') return;
      const norm = normalizeHex(hex, null);
      if (!norm) return;
      if (!colorStats.has(norm)) {
        colorStats.set(norm, { occurrences: 0, buttonBg: 0, interactiveBg: 0, textOccurrences: 0, bgOccurrences: 0 });
      }
      const stat = colorStats.get(norm);
      stat.occurrences++;
      if (type === 'buttonBg') stat.buttonBg++;
      if (type === 'interactiveBg') stat.interactiveBg++;
      if (type === 'text') stat.textOccurrences++;
      if (type === 'bg') stat.bgOccurrences++;
    }

    function traverse(node) {
      if (!node) return;

      const isBtn = node.componentType === 'Button' || node.componentType === 'IconButton' || node.tag === 'button';
      const isInteractive = isBtn || node.interactions?.isClickable || node.componentType === 'Badge' || node.componentType === 'Switch' || node.componentType === 'Checkbox' || node.componentType === 'RadioButton';

      if (node.style) {
        if (node.style.backgroundColor && node.style.backgroundColor !== 'transparent') {
          if (isBtn) recordColor(node.style.backgroundColor, 'buttonBg');
          else if (isInteractive) recordColor(node.style.backgroundColor, 'interactiveBg');
          else recordColor(node.style.backgroundColor, 'bg');
        }
        if (node.style.color) {
          recordColor(node.style.color, 'text');
        }
        if (node.style.border?.color) {
          recordColor(node.style.border.color, 'border');
        }
        if (node.style.boxShadows && node.style.boxShadows.length > 0) {
          shadows.push(...node.style.boxShadows);
        }
        if (node.style.borderRadius) {
          const r = node.style.borderRadius;
          if (typeof r === 'object') {
            if (r.isPill || r.isCircle) radii.add(9999);
            if (Number.isFinite(r.topLeft) && r.topLeft > 0) radii.add(Math.round(r.topLeft));
            if (Number.isFinite(r.topRight) && r.topRight > 0) radii.add(Math.round(r.topRight));
            if (Number.isFinite(r.bottomRight) && r.bottomRight > 0) radii.add(Math.round(r.bottomRight));
            if (Number.isFinite(r.bottomLeft) && r.bottomLeft > 0) radii.add(Math.round(r.bottomLeft));
          } else if (Number.isFinite(r) && r > 0) {
            radii.add(Math.round(r));
          }
        }
      }

      if (node.layout) {
        if (Number.isFinite(node.layout.gap) && node.layout.gap > 0) spacings.add(Math.round(node.layout.gap));
        if (node.layout.padding) {
          ['top', 'right', 'bottom', 'left'].forEach(k => {
            const v = node.layout.padding[k];
            if (Number.isFinite(v) && v > 0) spacings.add(Math.round(v));
          });
        }
        if (node.layout.margin) {
          ['top', 'right', 'bottom', 'left'].forEach(k => {
            const v = node.layout.margin[k];
            if (Number.isFinite(v) && v > 0) spacings.add(Math.round(v));
          });
        }
      }

      if (node.text && typeof node.text === 'object') {
        const t = node.text;
        if (t.fontFamily && typeof t.fontFamily === 'string') {
          fontFamilies.add(t.fontFamily);
        }
        if (t.fontSize) {
          const validWeights = [100, 200, 300, 400, 500, 600, 700, 800, 900];
          let weight = 400;
          if (t.fontWeight) {
            weight = validWeights.reduce((prev, curr) => Math.abs(curr - t.fontWeight) < Math.abs(prev - t.fontWeight) ? curr : prev);
          }
          textStyles.push({
            fontSize: t.fontSize,
            fontWeight: weight,
            lineHeight: t.lineHeight || Math.round(t.fontSize * 1.3),
            letterSpacing: t.letterSpacing || 0,
            textAlign: t.textAlign || 'left'
          });
        }
      }

      if (node.children && Array.isArray(node.children)) {
        for (const child of node.children) {
          traverse(child);
        }
      }
    }

    traverse(rootNode);

    const themeHints = Object.assign({}, rootNode?.themeHints);

    return {
      colorStats,
      fontFamilies,
      textStyles,
      spacings,
      radii,
      shadows,
      themeHints
    };
  }

  /**
   * Synthesizes Material 3 theme block
   */
  synthesizeTheme(tokens) {
    const { colorStats, fontFamilies, textStyles, spacings, radii, shadows, themeHints = {} } = tokens;

    // 1. Primary brand color selection
    let primaryCandidate = null;
    const rawHint = themeHints['--color-primary'] || themeHints['--primary'] || themeHints['--brand-primary'];
    if (rawHint) {
      const normalizedHint = normalizeHex(rawHint, null);
      if (normalizedHint && !isAchromatic(normalizedHint)) {
        primaryCandidate = normalizedHint;
      }
    }

    if (!primaryCandidate) {
      const scored = [];
      for (const [hex, stat] of colorStats.entries()) {
        const lum = calculateLuminance(hex);
        const sat = calculateSaturation(hex);
        const chroma = calculateChroma(hex);
        const neutral = isAchromatic(hex);

        // Exclude extreme white / black
        if (lum > 0.95 || lum < 0.03) continue;

        let score = sat * 100 + (chroma / 255) * 50;
        score += stat.buttonBg * 120;
        score += stat.interactiveBg * 40;
        score += stat.bgOccurrences * 5;
        score += Math.min(stat.textOccurrences, 5) * 2;

        if (lum > 0.70) score *= 0.4;
        else if (lum >= 0.20 && lum <= 0.65) score *= 1.2;

        if (neutral) score *= 0.05;

        scored.push({ hex, score });
      }

      scored.sort((a, b) => b.score - a.score);
      primaryCandidate = scored[0]?.hex || '#4F46E5';
    }

    // 2. Background, surface, text candidates
    const allColors = Array.from(colorStats.entries()).sort((a, b) => b[1].occurrences - a[1].occurrences).map(e => e[0]);
    const bgCandidate = allColors.find(c => calculateLuminance(c) > 0.85) || '#F8FAFC';
    const surfaceCandidate = allColors.find(c => c !== bgCandidate && calculateLuminance(c) > 0.70) || '#FFFFFF';
    const textCandidate = allColors.find(c => calculateLuminance(c) < 0.25) || '#0F172A';

    const lightScheme = {
      primary: normalizeHex(primaryCandidate, '#4F46E5'),
      onPrimary: '#FFFFFF',
      primaryContainer: '#E0E7FF',
      onPrimaryContainer: '#312E81',
      secondary: '#10B981',
      onSecondary: '#FFFFFF',
      secondaryContainer: '#D1FAE5',
      onSecondaryContainer: '#064E3B',
      tertiary: '#F59E0B',
      onTertiary: '#FFFFFF',
      background: normalizeHex(bgCandidate, '#F8FAFC'),
      onBackground: normalizeHex(textCandidate, '#0F172A'),
      surface: normalizeHex(surfaceCandidate, '#FFFFFF'),
      onSurface: normalizeHex(textCandidate, '#0F172A'),
      surfaceVariant: '#F1F5F9',
      onSurfaceVariant: '#64748B',
      outline: '#CBD5E1',
      outlineVariant: '#E2E8F0',
      error: '#EF4444',
      onError: '#FFFFFF'
    };

    const darkScheme = {
      primary: '#818CF8',
      onPrimary: '#1E1B4B',
      primaryContainer: '#3730A3',
      onPrimaryContainer: '#EEF2FF',
      secondary: '#34D399',
      onSecondary: '#064E3B',
      secondaryContainer: '#065F46',
      onSecondaryContainer: '#ECFDF5',
      tertiary: '#FBBF24',
      onTertiary: '#78350F',
      background: '#0F172A',
      onBackground: '#F8FAFC',
      surface: '#1E293B',
      onSurface: '#F8FAFC',
      surfaceVariant: '#334155',
      onSurfaceVariant: '#94A3B8',
      outline: '#475569',
      outlineVariant: '#334155',
      error: '#F87171',
      onError: '#450A0A'
    };

    // 3. Dynamic Radii Synthesis
    const extractedRadii = Array.from(radii).filter(r => Number.isFinite(r) && r > 0 && r < 999).sort((a, b) => a - b);
    let small = 4, medium = 8, large = 16;
    if (extractedRadii.length === 1) {
      medium = extractedRadii[0];
      small = Math.max(2, Math.round(medium / 2));
      large = Math.round(medium * 1.5);
    } else if (extractedRadii.length === 2) {
      small = extractedRadii[0];
      medium = extractedRadii[0];
      large = extractedRadii[1];
    } else if (extractedRadii.length === 3) {
      small = extractedRadii[0];
      medium = extractedRadii[1];
      large = extractedRadii[2];
    } else if (extractedRadii.length >= 4) {
      small = extractedRadii[0];
      medium = extractedRadii[Math.floor(extractedRadii.length / 2)];
      large = extractedRadii[extractedRadii.length - 1];
    }

    const radiiScale = {
      none: 0,
      small,
      medium,
      large,
      full: 9999
    };

    // 4. Dynamic Typography Synthesis
    const famList = Array.from(fontFamilies);
    const defaultFamily = famList[0] || 'Roboto';

    const typographyStyles = {
      displayLarge: { fontFamily: defaultFamily, fontSize: 36, fontWeight: 700, lineHeight: 44, letterSpacing: 0, textAlign: 'left', fontStyle: 'normal' },
      headlineSmall: { fontFamily: defaultFamily, fontSize: 24, fontWeight: 600, lineHeight: 32, letterSpacing: 0, textAlign: 'left', fontStyle: 'normal' },
      titleLarge: { fontFamily: defaultFamily, fontSize: 20, fontWeight: 600, lineHeight: 28, letterSpacing: 0, textAlign: 'left', fontStyle: 'normal' },
      titleMedium: { fontFamily: defaultFamily, fontSize: 16, fontWeight: 600, lineHeight: 24, letterSpacing: 0.15, textAlign: 'left', fontStyle: 'normal' },
      bodyLarge: { fontFamily: defaultFamily, fontSize: 16, fontWeight: 400, lineHeight: 24, letterSpacing: 0.5, textAlign: 'left', fontStyle: 'normal' },
      bodyMedium: { fontFamily: defaultFamily, fontSize: 14, fontWeight: 400, lineHeight: 20, letterSpacing: 0.25, textAlign: 'left', fontStyle: 'normal' },
      bodySmall: { fontFamily: defaultFamily, fontSize: 12, fontWeight: 400, lineHeight: 16, letterSpacing: 0.4, textAlign: 'left', fontStyle: 'normal' },
      labelLarge: { fontFamily: defaultFamily, fontSize: 14, fontWeight: 600, lineHeight: 20, letterSpacing: 0.1, textAlign: 'left', fontStyle: 'normal' },
      labelSmall: { fontFamily: defaultFamily, fontSize: 11, fontWeight: 500, lineHeight: 16, letterSpacing: 0.5, textAlign: 'left', fontStyle: 'normal' }
    };

    for (const ts of textStyles) {
      if (ts.fontSize >= 30) {
        typographyStyles.displayLarge.fontSize = ts.fontSize;
        typographyStyles.displayLarge.fontWeight = ts.fontWeight;
      } else if (ts.fontSize >= 22) {
        typographyStyles.headlineSmall.fontSize = ts.fontSize;
        typographyStyles.headlineSmall.fontWeight = ts.fontWeight;
      } else if (ts.fontSize >= 18) {
        typographyStyles.titleLarge.fontSize = ts.fontSize;
        typographyStyles.titleLarge.fontWeight = ts.fontWeight;
      } else if (ts.fontSize >= 15) {
        typographyStyles.bodyLarge.fontSize = ts.fontSize;
      } else if (ts.fontSize >= 13) {
        typographyStyles.bodyMedium.fontSize = ts.fontSize;
      }
    }

    const defaultShadows = shadows.length > 0 ? shadows.slice(0, 2) : [
      { offsetX: 0, offsetY: 4, blurRadius: 6, spreadRadius: -1, color: 'rgba(0, 0, 0, 0.1)', inset: false }
    ];

    const elevations = [
      { level: 0, elevationDp: 0, shadows: [] },
      { level: 1, elevationDp: 1, shadows: [{ offsetX: 0, offsetY: 1, blurRadius: 2, spreadRadius: 0, color: 'rgba(0, 0, 0, 0.05)', inset: false }] },
      { level: 2, elevationDp: 3, shadows: defaultShadows },
      { level: 3, elevationDp: 6, shadows: [{ offsetX: 0, offsetY: 10, blurRadius: 15, spreadRadius: -3, color: 'rgba(0, 0, 0, 0.1)', inset: false }] },
      { level: 4, elevationDp: 8, shadows: [{ offsetX: 0, offsetY: 20, blurRadius: 25, spreadRadius: -5, color: 'rgba(0, 0, 0, 0.1)', inset: false }] },
      { level: 5, elevationDp: 12, shadows: [{ offsetX: 0, offsetY: 25, blurRadius: 50, spreadRadius: -12, color: 'rgba(0, 0, 0, 0.25)', inset: false }] }
    ];

    return {
      colors: {
        light: lightScheme,
        dark: darkScheme,
        primary: lightScheme.primary,
        onPrimary: lightScheme.onPrimary,
        background: lightScheme.background,
        surface: lightScheme.surface,
        onSurface: lightScheme.onSurface,
        border: lightScheme.outline,
        error: lightScheme.error
      },
      typography: {
        fontFamily: defaultFamily,
        fontFamilies: famList.length > 0 ? famList : ['Roboto', 'sans-serif'],
        styles: typographyStyles
      },
      spacing: Array.from(spacings).sort((a, b) => a - b),
      radii: radiiScale,
      elevations
    };
  }

  /**
   * Sanitizes hierarchy nodes, removing non-finite numeric properties that break JSON schema.
   */
  sanitizeHierarchy(node) {
    if (!node || typeof node !== 'object') return;
    if (node.layout && typeof node.layout === 'object') {
      for (const [k, v] of Object.entries(node.layout)) {
        if (typeof v === 'number' && !Number.isFinite(v)) {
          delete node.layout[k];
        } else if (v && typeof v === 'object') {
          for (const [subK, subV] of Object.entries(v)) {
            if (typeof subV === 'number' && !Number.isFinite(subV)) {
              delete v[subK];
            }
          }
        }
      }
    }
    if (node.style && typeof node.style === 'object') {
      for (const [k, v] of Object.entries(node.style)) {
        if (typeof v === 'number' && !Number.isFinite(v)) {
          delete node.style[k];
        } else if (v && typeof v === 'object') {
          for (const [subK, subV] of Object.entries(v)) {
            if (typeof subV === 'number' && !Number.isFinite(subV)) {
              delete v[subK];
            }
          }
        }
      }
    }
    if (node.children && Array.isArray(node.children)) {
      for (const child of node.children) {
        this.sanitizeHierarchy(child);
      }
    }
  }

  /**
   * Builds the complete design specification object
   */
  buildSpec({ metadata = {}, viewports = {}, domHierarchy, vectorAssets = [] } = {}) {
    const meta = metadata || {};
    const vports = viewports || {};
    const vectors = vectorAssets || [];

    if (domHierarchy) {
      this.sanitizeHierarchy(domHierarchy);
    }

    const tokens = this.collectTokens(domHierarchy);
    const theme = this.synthesizeTheme(tokens);

    if (domHierarchy && domHierarchy.themeHints) {
      delete domHierarchy.themeHints;
    }

    const spec = {
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      version: '1.0.0',
      metadata: {
        title: meta.title || 'Claude Design Artifact',
        source: meta.source || 'inline',
        timestamp: meta.timestamp || new Date().toISOString(),
        generator: meta.generator || 'claude-to-compose-extractor/1.0.0'
      },
      viewports: {
        mobile: {
          width: Math.round(vports.mobile?.width || 390),
          height: Math.round(vports.mobile?.height || 844),
          deviceScaleFactor: vports.mobile?.deviceScaleFactor || 3.0,
          scale: vports.mobile?.deviceScaleFactor || 3.0,
          screenshotPath: vports.mobile?.screenshotPath || 'screenshots/mobile_reference.png'
        },
        desktop: {
          width: Math.round(vports.desktop?.width || 1440),
          height: Math.round(vports.desktop?.height || 900),
          deviceScaleFactor: vports.desktop?.deviceScaleFactor || 2.0,
          scale: vports.desktop?.deviceScaleFactor || 2.0,
          screenshotPath: vports.desktop?.screenshotPath || 'screenshots/desktop_reference.png'
        }
      },
      theme,
      hierarchy: domHierarchy,
      vectors
    };

    return spec;
  }

  /**
   * Validates spec object against schema.json
   */
  validate(spec) {
    const valid = this.validateFn(spec);
    if (!valid) {
      const errors = (this.validateFn.errors || []).map(err => {
        return `${err.instancePath || 'root'}: ${err.message} (${JSON.stringify(err.params)})`;
      });
      return { valid: false, errors };
    }
    return { valid: true, errors: [] };
  }

  /**
   * Builds, validates, and writes design_spec.json
   */
  buildAndValidateSpec(params) {
    const spec = this.buildSpec(params);
    const validation = this.validate(spec);

    const outputDir = path.resolve(params.outputDir || './output');
    fs.mkdirSync(outputDir, { recursive: true });
    const specPath = path.join(outputDir, 'design_spec.json');

    fs.writeFileSync(specPath, JSON.stringify(spec, null, 2), 'utf8');

    return {
      valid: validation.valid,
      errors: validation.errors,
      specPath,
      specData: spec
    };
  }
}

// Module exports
module.exports = {
  SpecBuilder,
  buildAndValidateSpec: (params) => {
    const builder = new SpecBuilder();
    return builder.buildAndValidateSpec(params);
  }
};
