const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const sharp = require('sharp');
const { parseArgs, compare } = require('../../tools/pilot/compare-native-reference');

async function png(file, width, height, color) {
  await sharp({ create: { width, height, channels: 4, background: color } }).png().toFile(file);
}

test('strict comparison requires a deliberate negative for every named region', () => {
  assert.throws(() => parseArgs([
    '--reference', '/tmp/a.png', '--candidate', '/tmp/b.png', '--output', '/tmp/report.json',
    '--region', 'toolbar:0,0,4,4:4'
  ]), /negative-control/);
  assert.throws(() => parseArgs([
    '--reference', '/tmp/a.png', '--candidate', '/tmp/b.png', '--output', '/tmp/report.json',
    '--region', 'toolbar:0,0,4,4:4', '--negative', 'other:/tmp/c.png'
  ]), /negative-control/);
});

test('strict comparison fails visible mismatch, blocks ineffective controls, and refuses resize', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ctc-visual-'));
  try {
    const reference = path.join(directory, 'reference.png');
    const exact = path.join(directory, 'exact.png');
    const mismatched = path.join(directory, 'mismatched.png');
    const deliberatelyBad = path.join(directory, 'bad.png');
    const wrongSize = path.join(directory, 'wrong-size.png');
    await Promise.all([
      png(reference, 8, 8, '#ffffff'), png(exact, 8, 8, '#ffffff'),
      png(mismatched, 8, 8, '#dddddd'), png(deliberatelyBad, 8, 8, '#ff00ff'),
      png(wrongSize, 7, 8, '#ffffff')
    ]);
    const regions = [{ id: 'toolbar', x: 0, y: 0, width: 8, height: 8, maxMae: 1 }];
    const base = { reference, regions, negatives: { toolbar: deliberatelyBad } };
    const pass = await compare({ ...base, candidate: exact });
    assert.equal(pass.outcome, 'PASS');
    assert.equal(pass.regions[0].candidateMae, 0);
    const fail = await compare({ ...base, candidate: mismatched });
    assert.equal(fail.outcome, 'FAIL');
    const blocked = await compare({ ...base, candidate: exact, negatives: { toolbar: exact } });
    assert.equal(blocked.outcome, 'BLOCKED');
    await assert.rejects(() => compare({ ...base, candidate: wrongSize }), /dimensions differ/);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
