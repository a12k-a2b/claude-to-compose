#!/usr/bin/env node

// Pilot-only reference capture. Each section is photographed independently so
// a long design exploration cannot masquerade as a single verified screen.
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { ExtractionEngine } = require('../../extractor/engine');
const { contractForUrl } = require('./source-contracts');

const designs = {
  'da63f0b2-6919-408a-b3eb-68685f019fe6': {
    markers: ['The Meridian', 'The quiet economics of planting a city forest', 'Field notes'],
    minimumSections: 0
  },
  'e34f4387-f506-4de5-bced-ef318d7f8bdf': {
    markers: ['A sheet of glass', 'The toolbar band', 'The frosted plate'],
    minimumSections: 30
  }
};

function positiveInteger(value, label) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) throw new Error(`${label} must be a positive integer`);
  return parsed;
}

function parseArgs(argv) {
  const args = { width: 1440, height: 900, scale: 2, sections: [] };
  for (let i = 0; i < argv.length; i += 2) {
    const flag = argv[i];
    const value = argv[i + 1];
    if (!value) throw new Error(`Missing value for ${flag}`);
    if (flag === '--url') args.url = value;
    else if (flag === '--output') args.output = path.resolve(value);
    else if (flag === '--width') args.width = positiveInteger(value, flag);
    else if (flag === '--height') args.height = positiveInteger(value, flag);
    else if (flag === '--scale') args.scale = positiveInteger(value, flag);
    else if (flag === '--section') args.sections.push(value);
    else throw new Error(`Unknown option ${flag}`);
  }
  if (!args.url || !args.output) throw new Error('Required: --url and --output');
  args.designId = contractForUrl(args.url).id;
  if (args.sections.some(id => !/^[a-z0-9-]+$/.test(id))) throw new Error('Invalid section ID');
  return args;
}

async function capture(args) {
  if (fs.existsSync(path.join(args.output, 'capture-manifest.json'))) {
    throw new Error('Output already has a capture manifest; use a fresh directory to preserve evidence');
  }
  fs.mkdirSync(args.output, { recursive: true });
  const engine = new ExtractionEngine({ outputDir: args.output });
  const browser = await engine.launchBrowser();
  try {
    const context = await browser.newContext({
      viewport: { width: args.width, height: args.height },
      deviceScaleFactor: args.scale,
      isMobile: false,
      hasTouch: false,
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36'
    });
    const page = await context.newPage();
    await page.goto(args.url, { waitUntil: 'load', timeout: 45000 });
    const artifactElement = page.locator('iframe#frame-content');
    await artifactElement.waitFor({ state: 'attached', timeout: 30000 });
    const frame = await (await artifactElement.elementHandle()).contentFrame();
    if (!frame) throw new Error('Claude artifact frame did not attach');
    await engine.waitForHydrationBarrier(page, frame);
    const sourceText = await frame.locator('body').innerText();
    const sourceTextSha256 = crypto.createHash('sha256').update(sourceText).digest('hex');
    const contract = contractForUrl(args.url).contract;
    if (sourceTextSha256 !== contract.sourceTextSha256) {
      throw new Error('Claude source text changed from the frozen reference; review it before recapturing');
    }
    const artifactViewport = await frame.evaluate(() => ({ width: window.innerWidth, height: window.innerHeight }));
    const design = designs[args.designId];
    for (const marker of design.markers) {
      if (!sourceText.includes(marker)) throw new Error(`Artifact did not contain expected marker: ${marker}`);
    }
    const sections = await frame.locator('section[id]').evaluateAll(elements => elements.map((element, index) => ({
      id: element.id,
      index,
      heading: element.querySelector('h2,h3')?.textContent?.trim() || element.textContent?.trim().slice(0, 80) || '',
      figureCount: element.querySelectorAll('figure').length,
      controls: [...new Set(Array.from(element.querySelectorAll('button, input, [role="button"]'))
        .map(control => control.getAttribute('aria-label') || control.getAttribute('title') || control.textContent?.trim())
        .filter(Boolean))]
    })));
    if (sections.length < design.minimumSections) {
      throw new Error(`Only ${sections.length} sections found; expected at least ${design.minimumSections}`);
    }
    const observedSections = Object.fromEntries(sections.map(section => [section.id, section.figureCount]));
    if (JSON.stringify(observedSections) !== JSON.stringify(contract.sections)) {
      throw new Error('Claude section/figure inventory changed from the frozen reference');
    }
    const wanted = args.sections.length
      ? sections.filter(section => args.sections.includes(section.id))
      : sections.length ? sections : [{ id: 'root', index: 0, heading: 'Note Overlay floating toolbar' }];
    const missing = args.sections.filter(id => !sections.some(section => section.id === id));
    if (missing.length) throw new Error(`Missing requested sections: ${missing.join(', ')}`);
    const captures = [];
    async function saveCapture(locator, id, heading, filename) {
      const outputPath = path.join(args.output, filename);
      await locator.screenshot({ path: outputPath, type: 'png', animations: 'disabled', timeout: 30000 });
      const bytes = fs.readFileSync(outputPath);
      if (bytes.length < 1000 || bytes.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') {
        throw new Error(`Invalid screenshot for ${id}`);
      }
      const geometry = await locator.evaluate(element => {
        const rect = element.getBoundingClientRect();
        return {
          cssRect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
          scrollOffset: { x: window.scrollX, y: window.scrollY },
          elementScrollSize: { width: element.scrollWidth, height: element.scrollHeight }
        };
      });
      const pixelSize = { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
      const expectedWidth = geometry.cssRect.width * args.scale;
      const expectedHeight = geometry.cssRect.height * args.scale;
      // Playwright rounds fractional CSS bounds to device pixels and may include
      // a one-pixel border on both sides of a captured element.
      if (Math.abs(pixelSize.width - expectedWidth) > 5 || Math.abs(pixelSize.height - expectedHeight) > 5) {
        throw new Error(`Screenshot geometry mismatch for ${id}: ${pixelSize.width}x${pixelSize.height} pixels vs ${geometry.cssRect.width}x${geometry.cssRect.height} CSS at ${args.scale}x`);
      }
      captures.push({
        id,
        sectionId: id.split('/')[0],
        figureIndex: id.includes('/figure-') ? Number(id.split('/figure-')[1]) : null,
        heading,
        path: filename,
        captureMode: id === 'root' ? 'IFRAME_ELEMENT' : 'LIVE_DOM_ELEMENT',
        geometry,
        pixelSize,
        sha256: crypto.createHash('sha256').update(bytes).digest('hex')
      });
      process.stdout.write(`captured ${id}: ${heading}\n`);
    }
    for (const section of wanted) {
      const locator = section.id === 'root' ? page.locator('iframe#frame-content') : frame.locator('section[id]').nth(section.index);
      const ordinal = String(section.index + 1).padStart(2, '0');
      await saveCapture(locator, section.id, section.heading, `${ordinal}-${section.id}.png`);
      if (section.id !== 'root') {
        const figures = locator.locator('figure');
        const figureCount = await figures.count();
        for (let index = 0; index < figureCount; index += 1) {
          const figure = figures.nth(index);
          const figcaption = figure.locator('figcaption').first();
          const caption = ((await figcaption.count()) ? await figcaption.textContent() : null)?.trim()
            || (await figure.getAttribute('aria-label'))
            || `${section.heading} figure ${index + 1}`;
          await saveCapture(figure, `${section.id}/figure-${index + 1}`, caption,
            `${ordinal}-${section.id}-figure-${index + 1}.png`);
        }
      }
    }
    const manifest = {
      kind: 'ClaudeDesignSectionCapture',
      source: args.url,
      capturedAt: new Date().toISOString(),
      viewport: { width: args.width, height: args.height, deviceScaleFactor: args.scale },
      artifactViewport,
      referenceKind: 'Independent live-DOM element screenshots, not crops from a full-page image',
      sourceTextSha256,
      discoveredSectionCount: sections.length,
      sections,
      captures
    };
    fs.writeFileSync(path.join(args.output, 'capture-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
    return manifest;
  } finally {
    await browser.close();
  }
}

if (require.main === module) {
  capture(parseArgs(process.argv.slice(2))).then(
    manifest => process.stdout.write(`captured ${manifest.captures.length} scenes from ${manifest.discoveredSectionCount || 1} sections\n`),
    error => { console.error(`capture failed: ${error.message}`); process.exitCode = 1; }
  );
}

module.exports = { parseArgs, capture };
