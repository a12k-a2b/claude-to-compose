/**
 * tests/unit/e2e_runner.test.js
 * Unit tests for tests/e2e_runner.js CLI argument validation and discovery hardening.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { parseArgs, discoverTestFiles } = require('../e2e_runner');

const RUNNER_PATH = path.resolve(__dirname, '../e2e_runner.js');

describe('e2e_runner parseArgs Unit Tests', () => {
  test('parses valid tiers correctly', () => {
    assert.equal(parseArgs(['--tier', '1']).tier, 1);
    assert.equal(parseArgs(['-t', '2']).tier, 2);
    assert.equal(parseArgs(['--tier=3']).tier, 3);
    assert.equal(parseArgs(['-t=4']).tier, 4);
    assert.equal(parseArgs([]).tier, null);
  });

  test('parses filter and verbose flags correctly', () => {
    const opts = parseArgs(['--tier', '2', '--filter', '^T2_B1', '-v']);
    assert.equal(opts.tier, 2);
    assert.ok(opts.filter instanceof RegExp);
    assert.ok(opts.filter.test('T2_B1_01'));
    assert.equal(opts.verbose, true);
  });
});

describe('e2e_runner discoverTestFiles Guard Tests', () => {
  test('returns empty array on undefined or invalid tier without throwing', () => {
    assert.deepEqual(discoverTestFiles(undefined), []);
    assert.deepEqual(discoverTestFiles(null), []);
    assert.deepEqual(discoverTestFiles(0), []);
    assert.deepEqual(discoverTestFiles(99), []);
    assert.deepEqual(discoverTestFiles(-1), []);
    assert.deepEqual(discoverTestFiles('invalid'), []);
  });

  test('returns valid test suite files for existing tiers', () => {
    assert.ok(discoverTestFiles(1).length > 0);
    assert.ok(discoverTestFiles(2).length > 0);
    assert.ok(discoverTestFiles(3).length > 0);
    assert.ok(discoverTestFiles(4).length > 0);
  });
});

describe('e2e_runner CLI Process Execution Boundaries', () => {
  test('exits with code 2 and descriptive error for --tier 99', () => {
    const res = spawnSync(process.execPath, [RUNNER_PATH, '--tier', '99'], { encoding: 'utf8' });
    assert.equal(res.status, 2);
    assert.match(res.stderr + res.stdout, /Error: Invalid tier "99"\. Valid tiers are 1, 2, 3, 4\./);
  });

  test('exits with code 2 and descriptive error for --tier 0', () => {
    const res = spawnSync(process.execPath, [RUNNER_PATH, '--tier', '0'], { encoding: 'utf8' });
    assert.equal(res.status, 2);
    assert.match(res.stderr + res.stdout, /Error: Invalid tier "0"\. Valid tiers are 1, 2, 3, 4\./);
  });

  test('exits with code 2 and descriptive error for --tier abc', () => {
    const res = spawnSync(process.execPath, [RUNNER_PATH, '--tier', 'abc'], { encoding: 'utf8' });
    assert.equal(res.status, 2);
    assert.match(res.stderr + res.stdout, /Error: Invalid tier "abc"\. Valid tiers are 1, 2, 3, 4\./);
  });

  test('exits with code 2 and descriptive error for bare --tier', () => {
    const res = spawnSync(process.execPath, [RUNNER_PATH, '--tier'], { encoding: 'utf8' });
    assert.equal(res.status, 2);
    assert.match(res.stderr + res.stdout, /Error: Invalid tier "undefined"\. Valid tiers are 1, 2, 3, 4\./);
  });

  test('exits with code 2 and descriptive error for -t -1', () => {
    const res = spawnSync(process.execPath, [RUNNER_PATH, '-t', '-1'], { encoding: 'utf8' });
    assert.equal(res.status, 2);
    assert.match(res.stderr + res.stdout, /Error: Invalid tier "-1"\. Valid tiers are 1, 2, 3, 4\./);
  });

  test('exits with code 2 and descriptive error for --tier=99', () => {
    const res = spawnSync(process.execPath, [RUNNER_PATH, '--tier=99'], { encoding: 'utf8' });
    assert.equal(res.status, 2);
    assert.match(res.stderr + res.stdout, /Error: Invalid tier "99"\. Valid tiers are 1, 2, 3, 4\./);
  });
});
