/**
 * extractor/font_extractor.js
 *
 * Sniffs, intercepts, and downloads web fonts (@font-face, WOFF2/TTF/OTF)
 * during headless extraction and formats them for Android Jetpack Compose.
 */

const fs = require('fs');
const path = require('path');

class FontExtractor {
  constructor(options = {}) {
    this.outputDir = options.outputDir || './output';
    this.fontsDir = path.join(this.outputDir, 'assets', 'fonts');
    this.downloadedFonts = new Map();
    this.debug = options.debug || false;
  }

  /**
   * Attaches network interception to a Playwright page.
   *
   * @param {import('playwright').Page} page
   */
  attachNetworkSniffer(page) {
    page.on('response', async (response) => {
      try {
        const url = response.url();
        const request = response.request();
        const resourceType = request.resourceType();
        const contentType = response.headers()['content-type'] || '';

        const isFont =
          resourceType === 'font' ||
          contentType.includes('font') ||
          contentType.includes('woff') ||
          contentType.includes('truetype') ||
          contentType.includes('opentype') ||
          /\.(woff2|woff|ttf|otf)(\?.*)?$/i.test(url);

        if (isFont && response.status() === 200) {
          const buffer = await response.body().catch(() => null);
          if (buffer && buffer.length > 0) {
            let ext = path.extname(new URL(url).pathname).replace('.', '').toLowerCase();
            if (!ext || !['woff2', 'woff', 'ttf', 'otf'].includes(ext)) {
              if (contentType.includes('woff2')) ext = 'woff2';
              else if (contentType.includes('woff')) ext = 'woff';
              else if (contentType.includes('opentype') || contentType.includes('otf')) ext = 'otf';
              else ext = 'ttf';
            }

            const rawBaseName = path.basename(new URL(url).pathname).replace(/\.[^.]+$/, '');
            const sanitizedName = sanitizeAndroidFontName(rawBaseName) || `font_${this.downloadedFonts.size + 1}`;
            const filename = `${sanitizedName}.${ext}`;

            this.downloadedFonts.set(url, {
              url,
              filename,
              extension: ext,
              buffer,
              size: buffer.length
            });

            if (this.debug) {
              console.log(`[FONT] Captured font asset: ${filename} (${buffer.length} bytes) from ${url}`);
            }
          }
        }
      } catch (_) {}
    });
  }

  /**
   * Evaluates CSS @font-face rules and document.fonts within the target frame.
   *
   * @param {import('playwright').Frame | import('playwright').Page} targetFrame
   * @returns {Promise<Array<Object>>}
   */
  async discoverFontFaceRules(targetFrame) {
    if (!targetFrame) return [];
    try {
      return await targetFrame.evaluate(() => {
        const results = [];
        if (document.fonts) {
          for (const f of document.fonts) {
            results.push({
              family: f.family.replace(/['"]/g, ''),
              weight: f.weight,
              style: f.style,
              status: f.status
            });
          }
        }

        try {
          for (const sheet of document.styleSheets) {
            try {
              const rules = sheet.cssRules || sheet.rules || [];
              for (const rule of rules) {
                if (rule.type === CSSRule.FONT_FACE_RULE || (rule.cssText && rule.cssText.startsWith('@font-face'))) {
                  const style = rule.style;
                  const family = (style.getPropertyValue('font-family') || '').replace(/['"]/g, '').trim();
                  const src = style.getPropertyValue('src') || '';
                  const weight = style.getPropertyValue('font-weight') || 'normal';
                  const fontStyle = style.getPropertyValue('font-style') || 'normal';

                  const urlMatch = src.match(/url\(["']?([^"')]+)["']?\)/);
                  const fontUrl = urlMatch ? urlMatch[1] : null;

                  results.push({
                    family,
                    weight,
                    style: fontStyle,
                    src: fontUrl,
                    rawSrc: src
                  });
                }
              }
            } catch (_) {}
          }
        } catch (_) {}

        return results;
      });
    } catch (_) {
      return [];
    }
  }

  /**
   * Writes all captured fonts to outputDir and generates font_manifest.json.
   *
   * @param {Array<Object>} fontFaceRules
   * @returns {string} Path to font_manifest.json
   */
  saveFonts(fontFaceRules = []) {
    fs.mkdirSync(this.fontsDir, { recursive: true });

    const manifest = [];

    for (const [url, item] of this.downloadedFonts.entries()) {
      const destPath = path.join(this.fontsDir, item.filename);
      fs.writeFileSync(destPath, item.buffer);

      const matchingRule = fontFaceRules.find(r => r.src && (url.includes(r.src) || r.src.includes(url)));

      manifest.push({
        family: matchingRule ? matchingRule.family : sanitizeAndroidFontName(item.filename),
        weight: matchingRule ? matchingRule.weight : '400',
        style: matchingRule ? matchingRule.style : 'normal',
        filename: item.filename,
        path: path.relative(this.outputDir, destPath),
        sizeBytes: item.size
      });
    }

    const manifestPath = path.join(this.fontsDir, 'font_manifest.json');
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf-8');
    return manifestPath;
  }

  /**
   * Syncs fonts to an Android project's res/font/ directory.
   *
   * @param {string} androidResFontDir
   * @returns {Array<string>} List of synced font file paths
   */
  syncToAndroidProject(androidResFontDir) {
    if (!androidResFontDir || !fs.existsSync(this.fontsDir)) return [];
    fs.mkdirSync(androidResFontDir, { recursive: true });

    const synced = [];
    for (const [, item] of this.downloadedFonts.entries()) {
      const androidName = sanitizeAndroidFontName(item.filename) + '.' + item.extension;
      const target = path.join(androidResFontDir, androidName);
      fs.writeFileSync(target, item.buffer);
      synced.push(target);
    }
    return synced;
  }
}

/**
 * Sanitizes a font name to adhere to Android resource naming: ^[a-z0-9_]+$
 */
function sanitizeAndroidFontName(name) {
  if (!name) return 'custom_font';
  const clean = name
    .replace(/\.[^.]+$/, '')
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
  return clean || 'custom_font';
}

module.exports = {
  FontExtractor,
  sanitizeAndroidFontName
};
