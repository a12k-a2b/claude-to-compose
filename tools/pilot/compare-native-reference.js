#!/usr/bin/env node

// Strict, region-scoped visual gate for pilot screenshots. Unlike the legacy
// diff preview, this refuses dimension mismatches and never resizes an image.
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const sharp = require('sharp');
const { atomicWriteNoFollow, rejectDangerousRoot, resolveExplicit } = require('../../retrofit/safety');

function parseArgs(argv) {
  const options = { regions: [], negatives: {} };
  for (let i = 0; i < argv.length; i += 2) {
    const name = argv[i];
    const value = argv[i + 1];
    if (!value) throw new Error(`Missing value for ${name}`);
    if (name === '--reference') options.reference = value;
    else if (name === '--candidate') options.candidate = value;
    else if (name === '--output') options.output = value;
    else if (name === '--region') {
      const match = value.match(/^([a-z][a-z0-9-]*):(\d+),(\d+),(\d+),(\d+):([0-9]+(?:\.[0-9]+)?)$/);
      if (!match) throw new Error('Region format: name:x,y,width,height:maxMae');
      const [, id, x, y, width, height, maxMae] = match;
      if (options.regions.some(region => region.id === id)) throw new Error(`Duplicate region: ${id}`);
      options.regions.push({ id, x: Number(x), y: Number(y), width: Number(width), height: Number(height), maxMae: Number(maxMae) });
    } else if (name === '--negative') {
      const match = value.match(/^([a-z][a-z0-9-]*):(.+)$/);
      if (!match || options.negatives[match[1]]) throw new Error('Negative format: region-name:image-path (unique per region)');
      options.negatives[match[1]] = match[2];
    } else throw new Error(`Unknown option: ${name}`);
  }
  if (!options.reference || !options.candidate || !options.output || options.regions.length === 0) {
    throw new Error('Required: --reference, --candidate, --output, and at least one --region');
  }
  if (options.regions.some(region => !options.negatives[region.id] || region.width === 0 || region.height === 0)) {
    throw new Error('Every nonempty region needs its own deliberate negative-control image');
  }
  if (Object.keys(options.negatives).some(id => !options.regions.some(region => region.id === id))) {
    throw new Error('A negative control has no matching region');
  }
  return options;
}

async function readImage(rawPath) {
  const file = resolveExplicit(rawPath, 'image');
  if (!fs.lstatSync(file).isFile()) throw new Error(`Image is not a regular file: ${file}`);
  const bytes = fs.readFileSync(file);
  const metadata = await sharp(bytes).metadata();
  if (metadata.format !== 'png' || !metadata.width || !metadata.height) throw new Error(`Expected a PNG: ${file}`);
  const pixels = await sharp(bytes).ensureAlpha().raw().toBuffer();
  return { file, sha256: crypto.createHash('sha256').update(bytes).digest('hex'), width: metadata.width, height: metadata.height, pixels };
}

function regionMae(reference, candidate, region) {
  let total = 0;
  for (let y = region.y; y < region.y + region.height; y += 1) {
    for (let x = region.x; x < region.x + region.width; x += 1) {
      const offset = (y * reference.width + x) * 4;
      for (let channel = 0; channel < 3; channel += 1) {
        total += Math.abs(reference.pixels[offset + channel] - candidate.pixels[offset + channel]);
      }
    }
  }
  return total / (region.width * region.height * 3);
}

async function compare(options) {
  const reference = await readImage(options.reference);
  const candidate = await readImage(options.candidate);
  if (reference.width !== candidate.width || reference.height !== candidate.height) {
    throw new Error('Reference and native screenshot dimensions differ; align capture geometry, do not resize');
  }
  const rows = [];
  for (const region of options.regions) {
    if (region.x + region.width > reference.width || region.y + region.height > reference.height) {
      throw new Error(`Region ${region.id} falls outside the images`);
    }
    const negative = await readImage(options.negatives[region.id]);
    if (reference.width !== negative.width || reference.height !== negative.height) {
      throw new Error(`Negative-control dimensions differ for ${region.id}`);
    }
    const candidateMae = regionMae(reference, candidate, region);
    const negativeMae = regionMae(reference, negative, region);
    const metricValid = negativeMae >= candidateMae + 1;
    rows.push({
      ...region, candidateMae, negativeMae,
      negativeSha256: negative.sha256,
      outcome: metricValid ? (candidateMae <= region.maxMae ? 'PASS' : 'FAIL') : 'BLOCKED',
      condition: metricValid ? (candidateMae <= region.maxMae ? 'within pre-registered MAE' : 'native MAE exceeds pre-registered limit')
        : 'negative control did not worsen this region by at least 1 MAE point'
    });
  }
  const outcome = rows.some(row => row.outcome === 'BLOCKED') ? 'BLOCKED'
    : rows.some(row => row.outcome === 'FAIL') ? 'FAIL' : 'PASS';
  return {
    kind: 'StrictNativeReferenceComparison', outcome,
    claimScope: 'REGISTERED_STATIC_PIXEL_REGIONS_ONLY',
    alignment: 'EXACT_PIXEL_DIMENSIONS_NO_RESIZE',
    reference: { path: reference.file, sha256: reference.sha256 },
    candidate: { path: candidate.file, sha256: candidate.sha256 },
    dimensions: { width: reference.width, height: reference.height }, regions: rows
  };
}

async function main(argv) {
  const options = parseArgs(argv);
  const output = resolveExplicit(options.output, '--output');
  rejectDangerousRoot(path.dirname(output), '--output');
  if ([options.reference, options.candidate, ...Object.values(options.negatives)]
    .some(image => path.resolve(image) === output)) throw new Error('Report must not overwrite an input image');
  const result = await compare(options);
  fs.mkdirSync(path.dirname(output), { recursive: true });
  atomicWriteNoFollow(output, `${JSON.stringify(result, null, 2)}\n`);
  process.stdout.write(`${result.outcome}: ${output}\n`);
  return result.outcome === 'PASS' ? 0 : result.outcome === 'FAIL' ? 1 : 2;
}

if (require.main === module) {
  main(process.argv.slice(2)).then(code => { process.exitCode = code; }, error => {
    console.error(`strict comparison failed: ${error.message}`); process.exitCode = 2;
  });
}

module.exports = { parseArgs, regionMae, compare, main };
