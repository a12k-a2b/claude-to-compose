'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync, spawnSync } = require('node:child_process');
const { afterEach, describe, it } = require('node:test');
const Ajv2020 = require('ajv/dist/2020');
const addFormats = require('ajv-formats');

const ROOT = path.resolve(__dirname, '../..');
const CLI = path.join(ROOT, 'bin/ctc.js');
const FIXTURE = path.join(ROOT, 'tests/fixtures/retrofit_v1/android-app');
const SCHEMA = JSON.parse(fs.readFileSync(path.join(ROOT, 'schemas/v1/existing-app-model.schema.json'), 'utf8'));
const temporary = [];

function tempDir() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ctc-v1-'));
  temporary.push(directory);
  return directory;
}

function copyFixture() {
  const root = path.join(tempDir(), 'android-app');
  fs.cpSync(FIXTURE, root, { recursive: true });
  fs.chmodSync(path.join(root, 'gradlew'), 0o755);
  return root;
}

function git(root, args) {
  return execFileSync('git', ['-C', root, ...args], { encoding: 'utf8' }).trim();
}

function initializeGit(root) {
  git(root, ['init', '-q']);
  git(root, ['config', 'user.email', 'fixture@example.invalid']);
  git(root, ['config', 'user.name', 'Fixture']);
  git(root, ['add', '.']);
  git(root, ['commit', '-qm', 'fixture']);
  return git(root, ['rev-parse', 'HEAD']);
}

function ctc(args, env = {}) {
  return spawnSync(process.execPath, [CLI, ...args], {
    cwd: ROOT, encoding: 'utf8', env: { ...process.env, ...env }
  });
}

function parseSingleJson(stdout) {
  const parsed = JSON.parse(stdout);
  assert.equal(stdout.trim(), JSON.stringify(parsed), 'JSON mode emits exactly one compact JSON document');
  return parsed;
}

function semantic(model) {
  const clone = structuredClone(model);
  delete clone.createdAt;
  delete clone.provenance.inspection.startedAt;
  delete clone.provenance.inspection.completedAt;
  return clone;
}

function treeDigest(root) {
  const hash = crypto.createHash('sha256');
  function walk(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      if (entry.name === '.git') continue;
      const absolute = path.join(directory, entry.name);
      const relative = path.relative(root, absolute);
      hash.update(`${relative}\0${entry.isDirectory() ? 'd' : 'f'}\0`);
      if (entry.isDirectory()) walk(absolute);
      else hash.update(fs.readFileSync(absolute));
    }
  }
  walk(root);
  return hash.digest('hex');
}

function metadataSnapshot(root) {
  const values = [];
  function walk(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      if (entry.name === '.git') continue;
      const absolute = path.join(directory, entry.name);
      const stat = fs.lstatSync(absolute);
      values.push([path.relative(root, absolute), stat.mode, stat.size, stat.mtimeMs]);
      if (entry.isDirectory()) walk(absolute);
    }
  }
  walk(root);
  return values;
}

function indexSnapshot(root) {
  const index = path.join(root, '.git/index');
  const stat = fs.statSync(index);
  return { bytes: fs.readFileSync(index), mtimeMs: stat.mtimeMs };
}

afterEach(() => {
  while (temporary.length) fs.rmSync(temporary.pop(), { recursive: true, force: true });
});

describe('ctc v1 read-only app inspection', () => {
  it('finds Java-built overlay chrome and its accessibility-service host without claiming runtime reachability', () => {
    const app = copyFixture();
    const source = path.join(app, 'app/src/main/java/fixture/app');
    fs.writeFileSync(path.join(source, 'OverlayChrome.java'),
      'package fixture.app;\nfinal class OverlayChrome { void build(android.content.Context context) { new FrameLayout(context); } }\n');
    fs.writeFileSync(path.join(source, 'OverlayService.java'),
      'package fixture.app;\npublic class OverlayService extends AccessibilityService { }\n');
    initializeGit(app);
    const result = ctc(['inspect-app', '--android', app, '--output', path.join(tempDir(), 'model.json'), '--json']);
    assert.equal(result.status, 0, result.stderr);
    const model = parseSingleJson(result.stdout);
    for (const name of ['fixture.app.OverlayChrome', 'fixture.app.OverlayService']) {
      const symbol = model.uiSymbols.find(item => item.qualifiedName === name);
      assert.equal(symbol?.kind, 'OTHER', name);
      assert(model.uncertainties.some(item => item.subjectRef === symbol.id && item.impact === 'HIGH'));
    }
  });

  it('doctor reports narrow local capabilities and never invokes project Gradle', () => {
    const sentinel = path.join(tempDir(), 'gradle-ran');
    const result = ctc(['doctor', '--json'], { GRADLE_SENTINEL: sentinel });
    assert.equal(result.status, 0, result.stderr);
    const body = parseSingleJson(result.stdout);
    assert.equal(body.outcome, 'PASS');
    assert.equal(body.claimScope, 'LOCAL_CLI_PREREQUISITES_ONLY');
    assert.equal(body.capabilities.gradleTasksExecuted, false);
    assert.equal(fs.existsSync(sentinel), false);
  });

  it('emits a schema-valid multi-module model with Compose, XML, tests, source evidence, and ambiguity', () => {
    const app = copyFixture();
    const commit = initializeGit(app);
    const output = path.join(tempDir(), 'model.json');
    const sentinel = path.join(tempDir(), 'gradle-ran');
    const before = treeDigest(app);
    const metadataBefore = metadataSnapshot(app);
    const indexBefore = indexSnapshot(app);
    const result = ctc(['inspect-app', '--android', app, '--output', output, '--json'], { GRADLE_SENTINEL: sentinel });
    assert.equal(result.status, 0, result.stderr);
    const model = parseSingleJson(result.stdout);

    const ajv = new Ajv2020({ allErrors: true, strict: false, strictNumbers: true });
    addFormats(ajv);
    const validate = ajv.compile(SCHEMA);
    assert.equal(validate(model), true, JSON.stringify(validate.errors));
    assert.equal(model.provenance.revision.commit, commit);
    assert.equal(model.provenance.revision.dirty, false);
    assert.deepEqual(model.modules.map((item) => item.gradlePath), [':app', ':feature:notes']);
    assert(model.uiSymbols.some((item) => item.kind === 'COMPOSABLE' && item.qualifiedName === 'fixture.app.NoteScreen'));
    assert(model.uiSymbols.some((item) => item.kind === 'COMPOSABLE' && item.qualifiedName === 'fixture.app.TinyPreview'));
    assert(model.uiSymbols.some((item) => item.kind === 'VIEW' && item.qualifiedName === 'activity_main#title'));
    assert(model.tests.some((item) => item.kind === 'UNIT'));
    assert.deepEqual(
      model.buildCommandClues.map((item) => [item.purpose, item.command, item.status]).sort(),
      [
        ['ASSEMBLE', './gradlew :app:assembleDebug', 'HEURISTIC_NOT_EXECUTED'],
        ['UNIT_TEST', './gradlew :app:testDebugUnitTest', 'HEURISTIC_NOT_EXECUTED']
      ]
    );
    assert(model.buildCommandClues.every((item) => model.uncertainties.some((uncertainty) => (
      uncertainty.subjectRef === item.id && uncertainty.impact === 'HIGH'
    ))));
    assert(model.uncertainties.some((item) => item.statement.includes('multiple source locations')));
    assert.equal(model.uiSymbols.some((item) => item.qualifiedName.includes('Phantom')), false);
    assert.equal(model.uiSymbols.some((item) => item.qualifiedName.includes('Orphan')), false);
    assert.equal(model.uiSymbols.some((item) => ['fixture.app.NotAScreen', 'fixture.app.NotAView'].includes(item.qualifiedName)), false);
    assert(model.uiSymbols.every((item) => item.confidence < 1));
    assert(model.uiSymbols.every((item) => model.uncertainties.some((uncertainty) => (
      uncertainty.subjectRef === item.id && uncertainty.impact === 'HIGH'
    ))));
    assert.equal(model.provenance.inspection.commands.some((command) => command.includes('gradlew')), false);
    assert.equal(fs.existsSync(sentinel), false);
    assert.equal(treeDigest(app), before, 'inspection must not mutate the Android repository');
    assert.deepEqual(metadataSnapshot(app), metadataBefore, 'inspection must preserve source metadata');
    const indexAfter = indexSnapshot(app);
    assert.deepEqual(indexAfter.bytes, indexBefore.bytes, 'inspection must preserve Git index bytes');
    assert.equal(indexAfter.mtimeMs, indexBefore.mtimeMs, 'inspection must preserve Git index mtime');
  });

  it('returns BLOCKED without inventing a revision when no Git repository exists', () => {
    const app = copyFixture();
    const result = ctc(['inspect-app', '--android', app, '--output', path.join(tempDir(), 'model.json'), '--json']);
    assert.equal(result.status, 2);
    const body = parseSingleJson(result.stdout);
    assert.equal(body.outcome, 'BLOCKED');
    assert.equal(Object.hasOwn(body, 'revision'), false);
    assert.match(result.stderr, /requires an initialized Git repository/);
  });

  it('records a truthful, stable dirty-tree digest and stable semantic evidence', () => {
    const app = copyFixture();
    initializeGit(app);
    const tracked = path.join(app, 'app/src/main/java/fixture/app/MainActivity.kt');
    const originalTimes = fs.statSync(tracked);
    fs.utimesSync(tracked, originalTimes.atime, new Date(originalTimes.mtimeMs + 5000));
    const cleanAfterMtime = ctc(['inspect-app', '--android', app, '--output', path.join(tempDir(), 'mtime.json'), '--json']);
    assert.equal(cleanAfterMtime.status, 0, cleanAfterMtime.stderr);
    assert.equal(parseSingleJson(cleanAfterMtime.stdout).provenance.revision.dirty, false, 'mtime-only changes are not dirty');

    fs.appendFileSync(tracked, '\nclass DirtyStateHolder\n');
    git(app, ['add', 'app/src/main/java/fixture/app/MainActivity.kt']);
    const untracked = path.join(app, 'untracked.bin');
    fs.writeFileSync(untracked, Buffer.from([0, 1, 2, 255]));
    const first = ctc(['inspect-app', '--android', app, '--output', path.join(tempDir(), 'one.json'), '--json']);
    const second = ctc(['inspect-app', '--android', app, '--output', path.join(tempDir(), 'two.json'), '--json']);
    assert.equal(first.status, 0, first.stderr);
    assert.equal(second.status, 0, second.stderr);
    const firstModel = parseSingleJson(first.stdout);
    const secondModel = parseSingleJson(second.stdout);
    assert.equal(firstModel.provenance.revision.dirty, true);
    assert.match(firstModel.provenance.revision.workingTreeDiffSha256, /^[a-f0-9]{64}$/);
    assert.equal(firstModel.provenance.revision.workingTreeDiffSha256, secondModel.provenance.revision.workingTreeDiffSha256);
    assert.deepEqual(semantic(firstModel), semantic(secondModel));
    fs.writeFileSync(untracked, Buffer.from([0, 1, 3, 255]));
    const changed = ctc(['inspect-app', '--android', app, '--output', path.join(tempDir(), 'three.json'), '--json']);
    assert.equal(changed.status, 0, changed.stderr);
    assert.notEqual(
      parseSingleJson(changed.stdout).provenance.revision.workingTreeDiffSha256,
      firstModel.provenance.revision.workingTreeDiffSha256,
      'an untracked byte change must change the dirty digest'
    );
  });

  it('disables repository-controlled Git helpers and overrides hidden-untracked configuration', () => {
    const app = copyFixture();
    initializeGit(app);
    const sentinel = path.join(tempDir(), 'git-helper-ran');
    const helper = path.join(tempDir(), 'hostile-helper.sh');
    fs.writeFileSync(helper, `#!/bin/sh\nprintf invoked > "${sentinel}"\nexit 91\n`);
    fs.chmodSync(helper, 0o755);
    git(app, ['config', 'core.fsmonitor', helper]);
    git(app, ['config', 'diff.external', helper]);
    git(app, ['config', 'status.showUntrackedFiles', 'no']);
    fs.appendFileSync(path.join(app, 'app/src/main/java/fixture/app/MainActivity.kt'), '\n// tracked change\n');
    fs.writeFileSync(path.join(app, 'must-be-visible.untracked'), 'visible');

    const result = ctc(['inspect-app', '--android', app, '--output', path.join(tempDir(), 'model.json'), '--json']);
    assert.equal(result.status, 0, result.stderr);
    const model = parseSingleJson(result.stdout);
    assert.equal(model.provenance.revision.dirty, true);
    assert.equal(fs.existsSync(sentinel), false, 'repo-controlled Git helpers must not execute');
    assert(model.provenance.inspection.commands.every((command) => command.includes('core.fsmonitor=false')));
  });

  it('hashes untracked symlink text without following outside or broken targets and rejects special files', () => {
    const app = copyFixture();
    initializeGit(app);
    const outsideTarget = path.join(tempDir(), 'outside-target');
    fs.writeFileSync(outsideTarget, 'first outside bytes');
    fs.symlinkSync(outsideTarget, path.join(app, 'outside-link'));
    fs.symlinkSync(path.join(tempDir(), 'missing-target'), path.join(app, 'broken-link'));
    const first = ctc(['inspect-app', '--android', app, '--output', path.join(tempDir(), 'one.json'), '--json']);
    assert.equal(first.status, 0, first.stderr);
    const firstDigest = parseSingleJson(first.stdout).provenance.revision.workingTreeDiffSha256;
    fs.writeFileSync(outsideTarget, 'changed outside bytes');
    const second = ctc(['inspect-app', '--android', app, '--output', path.join(tempDir(), 'two.json'), '--json']);
    assert.equal(second.status, 0, second.stderr);
    assert.equal(parseSingleJson(second.stdout).provenance.revision.workingTreeDiffSha256, firstDigest);

    const fifo = path.join(app, 'unsupported-fifo');
    execFileSync('mkfifo', [fifo]);
    const special = ctc(['inspect-app', '--android', app, '--output', path.join(tempDir(), 'special.json'), '--json']);
    assert.equal(special.status, 4);
    assert.equal(parseSingleJson(special.stdout).outcome, 'INFRASTRUCTURE_ERROR');
    assert.match(special.stderr, /unsupported untracked special file/);
  });

  it('sanitizes authenticated remote provenance without leaking credentials, query, or fragment', () => {
    const app = copyFixture();
    initializeGit(app);
    git(app, ['remote', 'add', 'origin', 'https://user-secret:password-secret@example.invalid/repo.git?query-secret#fragment-secret']);
    const output = path.join(tempDir(), 'model.json');
    const result = ctc(['inspect-app', '--android', app, '--output', output, '--json']);
    assert.equal(result.status, 0, result.stderr);
    const model = parseSingleJson(result.stdout);
    assert.equal(model.provenance.repository.remoteUrl, 'https://example.invalid/repo.git');
    const allOutput = `${result.stdout}\n${result.stderr}\n${fs.readFileSync(output, 'utf8')}`;
    for (const secret of ['user-secret', 'password-secret', 'query-secret', 'fragment-secret']) {
      assert.equal(allOutput.includes(secret), false, `must redact ${secret}`);
    }
  });

  it('init preserves unrelated files in an explicit workspace outside the repository', () => {
    const app = copyFixture();
    initializeGit(app);
    const workspace = path.join(tempDir(), 'workspace');
    fs.mkdirSync(workspace);
    fs.writeFileSync(path.join(workspace, 'keep.txt'), 'preserve me');
    const initialized = ctc(['init', '--android', app, '--workspace', workspace, '--json']);
    assert.equal(initialized.status, 0, initialized.stderr);
    assert.equal(fs.readFileSync(path.join(workspace, 'keep.txt'), 'utf8'), 'preserve me');
    const inspected = ctc([
      'inspect-app', '--android', app, '--workspace', workspace,
      '--output', path.join(workspace, 'app-model.json'), '--json'
    ]);
    assert.equal(inspected.status, 0, inspected.stderr);
    assert.equal(fs.existsSync(path.join(workspace, 'app-model.json')), true);

    const outside = tempDir();
    const childLink = path.join(workspace, 'escaped-child');
    fs.symlinkSync(outside, childLink, 'dir');
    const childEscape = ctc([
      'inspect-app', '--android', app, '--workspace', workspace,
      '--output', path.join(childLink, 'escaped.json'), '--json'
    ]);
    assert.equal(childEscape.status, 3);
    assert.match(childEscape.stderr, /escapes the declared workspace/);

    const victim = path.join(outside, 'victim.json');
    fs.writeFileSync(victim, 'do not modify');
    const linkedFinal = path.join(workspace, 'linked-final.json');
    fs.symlinkSync(victim, linkedFinal);
    const finalSymlink = ctc([
      'inspect-app', '--android', app, '--workspace', workspace,
      '--output', linkedFinal, '--json'
    ]);
    assert.equal(finalSymlink.status, 3);
    assert.match(finalSymlink.stderr, /final output symlink/);
    assert.equal(fs.readFileSync(victim, 'utf8'), 'do not modify');
  });

  it('rejects traversal, dangerous roots, and undeclared output inside the inspected app', () => {
    const app = copyFixture();
    initializeGit(app);
    const traversal = ctc(['inspect-app', '--android', app, '--output', '../escape/model.json', '--json']);
    assert.equal(traversal.status, 3);
    assert.equal(parseSingleJson(traversal.stdout).outcome, 'INVALID_INPUT');
    const inside = ctc(['inspect-app', '--android', app, '--output', path.join(app, 'model.json'), '--json']);
    assert.equal(inside.status, 3);
    assert.match(inside.stderr, /must be outside/);
    const dangerous = ctc(['init', '--android', app, '--workspace', '/', '--json']);
    assert.equal(dangerous.status, 3);

    const linkedOutput = path.join(tempDir(), 'linked-output');
    fs.symlinkSync(app, linkedOutput, 'dir');
    const symlinkEscape = ctc(['inspect-app', '--android', app, '--output', path.join(linkedOutput, 'model.json'), '--json']);
    assert.equal(symlinkEscape.status, 3);
    assert.match(symlinkEscape.stderr, /must be outside/);

    const escapedModule = path.join(path.dirname(app), 'escaped-module');
    fs.mkdirSync(escapedModule);
    fs.writeFileSync(path.join(escapedModule, 'build.gradle.kts'), 'plugins { id("com.android.library") }\n');
    fs.appendFileSync(
      path.join(app, 'settings.gradle.kts'),
      '\ninclude(":escape")\nproject(":escape").projectDir = file("../escaped-module")\n'
    );
    const projectDirEscape = ctc(['inspect-app', '--android', app, '--output', path.join(tempDir(), 'safe.json'), '--json']);
    assert.equal(projectDirEscape.status, 3);
    assert.match(projectDirEscape.stderr, /resolves outside/);
  });

  it('uses exit 3 for invalid CLI input and keeps JSON stdout parseable', () => {
    const result = ctc(['inspect-app', '--wat', 'value', '--json']);
    assert.equal(result.status, 3);
    assert.equal(parseSingleJson(result.stdout).outcome, 'INVALID_INPUT');
    assert.match(result.stderr, /unknown option/);
  });
});
