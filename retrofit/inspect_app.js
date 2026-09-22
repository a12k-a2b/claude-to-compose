'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const Ajv2020 = require('ajv/dist/2020');
const addFormats = require('ajv-formats');
const { BlockedError, InputError } = require('./safety');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const SCHEMA_PATH = path.join(PROJECT_ROOT, 'schemas/v1/existing-app-model.schema.json');
const SOURCE_EXTENSIONS = new Set(['.kt', '.java', '.xml']);
const INSPECTION_FILES = new Set(['settings.gradle', 'settings.gradle.kts', 'build.gradle', 'build.gradle.kts']);
const SAFE_GIT_OPTIONS = [
  '-c', 'core.fsmonitor=false',
  '-c', 'core.hooksPath=/dev/null',
  '-c', 'diff.external=',
  '-c', 'core.pager=cat',
  '-c', 'pager.status=false',
  '-c', 'pager.diff=false',
  '-c', 'status.renames=false',
  '-c', 'diff.renames=false',
  '-c', 'status.showUntrackedFiles=all',
  '-c', 'core.quotepath=false'
];

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function stableId(prefix, value) {
  return `${prefix}.${sha256(value).slice(0, 16)}`;
}

function posix(relativePath) {
  return relativePath.split(path.sep).join('/');
}

function gitEnvironment() {
  const environment = { ...process.env };
  for (const name of Object.keys(environment)) {
    if (/^GIT_CONFIG_(?:COUNT|KEY_\d+|VALUE_\d+)$/.test(name)) delete environment[name];
  }
  for (const name of [
    'GIT_DIR', 'GIT_WORK_TREE', 'GIT_COMMON_DIR', 'GIT_INDEX_FILE', 'GIT_OBJECT_DIRECTORY',
    'GIT_ALTERNATE_OBJECT_DIRECTORIES', 'GIT_CEILING_DIRECTORIES'
  ]) delete environment[name];
  Object.assign(environment, {
    GIT_OPTIONAL_LOCKS: '0', GIT_TERMINAL_PROMPT: '0', GIT_CONFIG_NOSYSTEM: '1',
    GIT_CONFIG_GLOBAL: '/dev/null', GIT_EXTERNAL_DIFF: '', GIT_PAGER: 'cat'
  });
  return environment;
}

function git(root, args, options = {}) {
  return execFileSync('git', [...SAFE_GIT_OPTIONS, '-C', root, ...args], {
    encoding: options.encoding === null ? null : 'utf8',
    input: options.input,
    maxBuffer: 16 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: gitEnvironment()
  });
}

function gitVersion() {
  return execFileSync('git', [...SAFE_GIT_OPTIONS, '--version'], {
    encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: gitEnvironment()
  }).trim();
}

function specialPaths(root) {
  const found = [];
  function visit(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (entry.name === '.git') continue;
      const absolute = path.join(directory, entry.name);
      const stat = fs.lstatSync(absolute);
      if (stat.isDirectory()) visit(absolute);
      else if (!stat.isFile() && !stat.isSymbolicLink()) found.push(posix(path.relative(root, absolute)));
    }
  }
  visit(root);
  return found.sort();
}

function gitCommandRecord(root, args) {
  return `git argv ${JSON.stringify([...SAFE_GIT_OPTIONS, '-C', root, ...args])}`;
}

function sanitizeRemoteUrl(raw) {
  if (!raw) return null;
  try {
    const parsed = new URL(raw);
    if (!['http:', 'https:', 'ssh:', 'git:'].includes(parsed.protocol)) return null;
    parsed.username = '';
    parsed.password = '';
    parsed.search = '';
    parsed.hash = '';
    return parsed.toString();
  } catch (_) {
    return null;
  }
}

function untrackedEntry(root, relative) {
  const absolute = path.resolve(root, relative);
  if (absolute !== root && !absolute.startsWith(`${path.resolve(root)}${path.sep}`)) {
    throw new Error(`untracked path escapes repository: ${relative}`);
  }
  const stat = fs.lstatSync(absolute);
  if (stat.isFile()) return Buffer.concat([Buffer.from('file\0'), fs.readFileSync(absolute)]);
  if (stat.isSymbolicLink()) return Buffer.concat([
    Buffer.from('symlink\0'), fs.readlinkSync(absolute, { encoding: 'buffer' })
  ]);
  throw new Error(`unsupported untracked special file: ${relative}`);
}

function gitMetadata(root) {
  try {
    const top = git(root, ['rev-parse', '--show-toplevel']).trim();
    if (fs.realpathSync(top) !== fs.realpathSync(root)) {
      throw new InputError('the Android root must be the Git repository root');
    }
  } catch (error) {
    if (error instanceof InputError) throw error;
    throw new BlockedError('inspect-app requires an initialized Git repository at the Android root');
  }

  let commit;
  try {
    commit = git(root, ['rev-parse', '--verify', 'HEAD']).trim();
  } catch (_) {
    throw new BlockedError('inspect-app requires a repository with a committed HEAD revision');
  }
  if (!/^[a-f0-9]{40}$/.test(commit)) throw new BlockedError('Git did not return a full commit revision');

  const specials = specialPaths(root);
  let checkedSpecialPaths = false;
  if (specials.length > 0) {
    let ignored = [];
    try {
      ignored = git(root, ['check-ignore', '--stdin', '-z'], {
        encoding: null,
        input: Buffer.from(`${specials.join('\0')}\0`)
      }).toString('utf8').split('\0').filter(Boolean);
    } catch (error) {
      if (error.status !== 1) throw error;
    }
    checkedSpecialPaths = true;
    const ignoredSet = new Set(ignored);
    const unsupported = specials.find((relative) => !ignoredSet.has(relative));
    if (unsupported) throw new Error(`unsupported untracked special file: ${unsupported}`);
  }

  const status = git(root, ['status', '--porcelain=v1', '-z', '--untracked-files=all'], { encoding: null });
  const dirty = status.length > 0;
  let workingTreeDiffSha256;
  if (dirty) {
    const trackedDiff = git(root, ['diff', '--no-ext-diff', '--no-textconv', '--binary', 'HEAD', '--'], { encoding: null });
    const untracked = git(root, ['ls-files', '--others', '--exclude-standard', '-z'], { encoding: null })
      .toString('utf8').split('\0').filter(Boolean).sort();
    const untrackedEvidence = untracked.map((relative) => Buffer.concat([
      Buffer.from(`${posix(relative)}\0`), untrackedEntry(root, relative), Buffer.from('\0')
    ]));
    workingTreeDiffSha256 = sha256(Buffer.concat([trackedDiff, Buffer.from('\0'), ...untrackedEvidence]));
  }
  let remoteUrl = null;
  try {
    remoteUrl = sanitizeRemoteUrl(git(root, ['config', '--get', 'remote.origin.url']).trim());
  } catch (_) {
    remoteUrl = null;
  }
  return { commit, dirty, workingTreeDiffSha256, remoteUrl, checkedSpecialPaths };
}

function gitChangedPaths(root, baselineCommit) {
  if (!/^[a-f0-9]{40}$/.test(baselineCommit)) throw new InputError('baseline commit must be a full Git revision');
  try { git(root, ['cat-file', '-e', `${baselineCommit}^{commit}`]); }
  catch (_) { throw new InputError('candidate repository does not contain the inspected baseline commit'); }
  try { git(root, ['merge-base', '--is-ancestor', baselineCommit, 'HEAD']); }
  catch (_) { throw new InputError('candidate HEAD does not descend from the inspected baseline commit'); }
  const tracked = git(root, ['diff', '--name-only', '-z', '--no-ext-diff', '--no-textconv', baselineCommit, '--'], { encoding: null })
    .toString('utf8').split('\0').filter(Boolean).map(posix);
  const untracked = git(root, ['ls-files', '--others', '--exclude-standard', '-z'], { encoding: null })
    .toString('utf8').split('\0').filter(Boolean).map(posix);
  return [...new Set([...tracked, ...untracked])].sort();
}

function gitIgnoredSourceEvidence(root) {
  const ignored = git(root, ['ls-files', '--others', '--ignored', '--exclude-standard', '-z'], { encoding: null })
    .toString('utf8').split('\0').filter(Boolean).map(posix)
    .filter((relative) => {
      const segments = relative.split('/');
      const sourceIndex = segments.indexOf('src');
      const generatedIndex = segments.findIndex((segment) => segment === 'build' || segment === '.gradle');
      if (generatedIndex >= 0 && (sourceIndex < 0 || generatedIndex < sourceIndex)) return false;
      return sourceIndex >= 0 || INSPECTION_FILES.has(path.basename(relative));
    }).sort();
  return ignored.map((relative) => {
    const absolute = path.resolve(root, relative);
    if (!absolute.startsWith(`${path.resolve(root)}${path.sep}`)) throw new InputError(`ignored source escapes candidate: ${relative}`);
    const stat = fs.lstatSync(absolute);
    if (stat.isFile()) return { path: relative, sha256: sha256(fs.readFileSync(absolute)) };
    if (stat.isSymbolicLink()) throw new InputError(`ignored source symlink is unsupported: ${relative}`);
    throw new InputError(`unsupported ignored source file: ${relative}`);
  });
}

function isSourceSensitivePath(relative) {
  const segments = posix(relative).split('/');
  return segments.includes('src') || INSPECTION_FILES.has(segments[segments.length - 1]);
}

function assertNoSourceSensitiveSymlinks(root, label = 'repository') {
  const canonicalRoot = fs.realpathSync(root);
  function visit(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (entry.name === '.git') continue;
      const absolute = path.join(directory, entry.name);
      const stat = fs.lstatSync(absolute);
      const relative = posix(path.relative(canonicalRoot, absolute));
      if (stat.isSymbolicLink()) {
        if (isSourceSensitivePath(relative)) throw new InputError(`${label} contains a source-sensitive symlink: ${relative}`);
        continue;
      }
      if (stat.isDirectory()) visit(absolute);
    }
  }
  visit(canonicalRoot);
}

function gitCommonDirectory(root) {
  let raw;
  try { raw = git(root, ['rev-parse', '--git-common-dir']).trim(); }
  catch (_) { throw new InputError('path is not a Git worktree'); }
  const resolved = path.isAbsolute(raw) ? raw : path.resolve(root, raw);
  try { return fs.realpathSync(resolved); }
  catch (_) { throw new InputError('Git common directory cannot be resolved'); }
}

function walk(root) {
  const found = [];
  function visit(directory) {
    const entries = fs.readdirSync(directory, { withFileTypes: true })
      .sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      if (entry.name === '.git' || entry.name === '.gradle' || entry.name === 'build') continue;
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(absolute);
      else if (entry.isFile()) {
        const relative = posix(path.relative(root, absolute));
        if (SOURCE_EXTENSIONS.has(path.extname(entry.name)) || INSPECTION_FILES.has(entry.name)) found.push(relative);
      }
    }
  }
  visit(root);
  return found;
}

function maskCode(text) {
  let output = '';
  let index = 0;
  let state = 'code';
  let quote = '';
  while (index < text.length) {
    const char = text[index];
    const next = text[index + 1];
    if (state === 'code' && char === '/' && next === '/') { output += '  '; index += 2; state = 'line'; continue; }
    if (state === 'code' && char === '/' && next === '*') { output += '  '; index += 2; state = 'block'; continue; }
    if (state === 'code' && (char === '"' || char === '\'')) { quote = char; output += ' '; index += 1; state = 'string'; continue; }
    if (state === 'line') {
      if (char === '\n') { output += '\n'; state = 'code'; } else output += ' ';
      index += 1; continue;
    }
    if (state === 'block') {
      if (char === '*' && next === '/') { output += '  '; index += 2; state = 'code'; }
      else { output += char === '\n' ? '\n' : ' '; index += 1; }
      continue;
    }
    if (state === 'string') {
      if (char === '\\') { output += '  '; index += Math.min(2, text.length - index); }
      else if (char === quote) { output += ' '; index += 1; state = 'code'; }
      else { output += char === '\n' ? '\n' : ' '; index += 1; }
      continue;
    }
    output += char;
    index += 1;
  }
  return output;
}

function maskComments(text) {
  let output = '';
  let index = 0;
  let state = 'code';
  let quote = '';
  while (index < text.length) {
    const char = text[index];
    const next = text[index + 1];
    if (state === 'code' && char === '/' && next === '/') { output += '  '; index += 2; state = 'line'; continue; }
    if (state === 'code' && char === '/' && next === '*') { output += '  '; index += 2; state = 'block'; continue; }
    if (state === 'code' && (char === '"' || char === '\'')) { quote = char; output += char; index += 1; state = 'string'; continue; }
    if (state === 'line') {
      if (char === '\n') { output += '\n'; state = 'code'; } else output += ' ';
      index += 1; continue;
    }
    if (state === 'block') {
      if (char === '*' && next === '/') { output += '  '; index += 2; state = 'code'; }
      else { output += char === '\n' ? '\n' : ' '; index += 1; }
      continue;
    }
    output += char;
    if (state === 'string') {
      if (char === '\\') {
        if (index + 1 < text.length) { output += text[index + 1]; index += 2; continue; }
      } else if (char === quote) state = 'code';
    }
    index += 1;
  }
  return output;
}

function lineAt(text, offset) {
  return text.slice(0, offset).split('\n').length;
}

function modulePathForFile(relative, modules) {
  const candidates = modules.filter((module) => relative === module.directory || relative.startsWith(`${module.directory}/`));
  return candidates.sort((a, b) => b.directory.length - a.directory.length)[0] || modules[0];
}

function discoverModulePaths(settingsText) {
  const clean = maskComments(settingsText);
  const modules = new Set();
  for (const match of clean.matchAll(/(?:^|\n)\s*include\s*(?:\(([^)]*)\)|([^\n]+))/g)) {
    const raw = match[1] || match[2] || '';
    for (const quoted of raw.matchAll(/["'](:[A-Za-z0-9_.:-]+)["']/g)) modules.add(quoted[1]);
  }
  return [...modules].sort();
}

function projectDirectories(settingsText) {
  const clean = maskComments(settingsText);
  const result = new Map();
  for (const match of clean.matchAll(/(?:^|\n)\s*project\s*\(\s*["'](:[A-Za-z0-9_.:-]+)["']\s*\)\.projectDir\s*=\s*file\s*\(\s*["']([^"']+)["']\s*\)/g)) {
    result.set(match[1], match[2]);
  }
  return result;
}

function extractNamedBlock(buildText, name) {
  const clean = maskComments(buildText);
  const marker = new RegExp(`\\b${name}\\s*\\{`).exec(clean);
  if (!marker) return null;
  const start = marker.index + marker[0].length;
  let depth = 1;
  let end = start;
  let quote = null;
  for (; end < clean.length && depth > 0; end += 1) {
    const char = clean[end];
    if (quote) {
      if (char === '\\') end += 1;
      else if (char === quote) quote = null;
    } else if (char === '"' || char === '\'') quote = char;
    else if (char === '{') depth += 1;
    else if (char === '}') depth -= 1;
  }
  return clean.slice(start, Math.max(start, end - 1));
}

function braceDeltaOutsideStrings(text) {
  let delta = 0;
  let quote = null;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quote) {
      if (char === '\\') index += 1;
      else if (char === quote) quote = null;
    } else if (char === '"' || char === '\'') quote = char;
    else if (char === '{') delta += 1;
    else if (char === '}') delta -= 1;
  }
  return delta;
}

function extractLiteralBuildTypes(buildText) {
  const block = extractNamedBlock(buildText, 'buildTypes');
  if (block === null) return [];
  const names = new Set();
  let depth = 0;
  for (const line of block.split('\n')) {
    if (depth === 0) {
      const created = /\b(?:create|getByName|maybeCreate)\s*\(\s*["']([A-Za-z_][\w.-]*)["']\s*\)/.exec(line);
      const named = /^\s*([A-Za-z_][\w.-]*)\s*\{/.exec(line);
      if (created) names.add(created[1]);
      else if (named) names.add(named[1]);
    }
    depth += braceDeltaOutsideStrings(line);
  }
  return [...names].sort();
}

function literalPluginKind(buildText) {
  const plugins = extractNamedBlock(buildText, 'plugins');
  if (plugins === null) return 'UNKNOWN';
  const ids = [...plugins.matchAll(/\bid\s*(?:\(\s*["']([^"']+)["']\s*\)|\s+["']([^"']+)["'])/g)]
    .map((match) => match[1] || match[2]);
  if (ids.includes('com.android.application')) return 'APPLICATION';
  if (ids.includes('com.android.dynamic-feature')) return 'DYNAMIC_FEATURE';
  if (ids.includes('com.android.library')) return 'ANDROID_LIBRARY';
  if (ids.includes('java-library') || ids.includes('org.jetbrains.kotlin.jvm')) return 'JVM_LIBRARY';
  return 'UNKNOWN';
}

function braceDepthAt(text, offset) {
  let depth = 0;
  for (let index = 0; index < offset; index += 1) {
    if (text[index] === '{') depth += 1;
    else if (text[index] === '}') depth = Math.max(0, depth - 1);
  }
  return depth;
}

function kotlinClassSupertype(clean, afterName) {
  let parentheses = 0;
  let colon = -1;
  for (let index = afterName; index < clean.length; index += 1) {
    const char = clean[index];
    if (char === '(') parentheses += 1;
    else if (char === ')') parentheses = Math.max(0, parentheses - 1);
    else if (char === ':' && parentheses === 0 && colon === -1) colon = index;
    else if ((char === '{' || char === '=') && parentheses === 0) {
      return colon === -1 ? '' : clean.slice(colon + 1, index);
    } else if (char === '\n' && parentheses === 0) {
      return colon === -1 ? '' : clean.slice(colon + 1, index);
    }
  }
  return colon === -1 ? '' : clean.slice(colon + 1);
}

function classifyKotlinClass(supertypeText) {
  const names = [...supertypeText.matchAll(/(?:^|,)\s*([A-Za-z_][\w.]*)/g)].map((match) => match[1].split('.').pop());
  if (names.some((name) => ['ComponentActivity', 'AppCompatActivity', 'Activity'].includes(name))) return { kind: 'ACTIVITY', confidence: 0.94 };
  if (names.some((name) => name === 'Fragment')) return { kind: 'FRAGMENT', confidence: 0.94 };
  if (names.some((name) => name === 'ViewModel')) return { kind: 'VIEW_MODEL', confidence: 0.94 };
  if (names.some((name) => ['View', 'ViewGroup'].includes(name))) return { kind: 'CUSTOM_VIEW', confidence: 0.9 };
  return null;
}

function evidenceFor(relative, bytes) {
  return {
    id: stableId('evidence', relative),
    kind: 'SOURCE_FILE',
    path: relative,
    sha256: sha256(bytes)
  };
}

function inspectRepository(root, clock = () => new Date()) {
  const startedAt = clock().toISOString();
  const revision = gitMetadata(root);
  const allFiles = walk(root);
  if (allFiles.length === 0) throw new InputError('no inspectable Android source or Gradle files were found');
  const settingsPath = ['settings.gradle.kts', 'settings.gradle'].find((file) => allFiles.includes(file));
  if (!settingsPath) throw new InputError('settings.gradle or settings.gradle.kts is required for module discovery');
  const settingsText = fs.readFileSync(path.join(root, settingsPath), 'utf8');
  const gradlePaths = discoverModulePaths(settingsText);
  if (gradlePaths.length === 0) throw new InputError('no included Gradle modules were found in settings');

  const directoryOverrides = projectDirectories(settingsText);
  const rootReal = fs.realpathSync(root);
  const moduleDirectories = gradlePaths.map((gradlePath) => {
    const directory = posix(directoryOverrides.get(gradlePath) || gradlePath.slice(1).replaceAll(':', '/'));
    const absoluteDirectory = path.resolve(root, directory);
    if (!absoluteDirectory.startsWith(`${path.resolve(root)}${path.sep}`) || !fs.existsSync(absoluteDirectory)) {
      throw new InputError(`module ${gradlePath} resolves outside the repository or does not exist`);
    }
    const moduleReal = fs.realpathSync(absoluteDirectory);
    if (!moduleReal.startsWith(`${rootReal}${path.sep}`)) throw new InputError(`module ${gradlePath} escapes the repository through a symlink`);
    return { gradlePath, directory };
  });
  const files = allFiles.filter((file) => (
    file === settingsPath
    || file === 'build.gradle'
    || file === 'build.gradle.kts'
    || moduleDirectories.some(({ directory }) => file === directory || file.startsWith(`${directory}/`))
  ));
  const content = new Map();
  const evidence = [];
  for (const relative of files) {
    const bytes = fs.readFileSync(path.join(root, relative));
    content.set(relative, bytes.toString('utf8'));
    evidence.push(evidenceFor(relative, bytes));
  }
  const evidenceByPath = new Map(evidence.map((item) => [item.path, item]));
  const modules = gradlePaths.map((gradlePath) => {
    const { directory } = moduleDirectories.find((candidate) => candidate.gradlePath === gradlePath);
    const buildFile = [`${directory}/build.gradle.kts`, `${directory}/build.gradle`].find((file) => content.has(file));
    const buildText = buildFile ? maskComments(content.get(buildFile)) : '';
    const kind = literalPluginKind(buildText);
    const sourceSets = [...new Set(files
      .filter((file) => file.startsWith(`${directory}/src/`))
      .map((file) => file.slice(`${directory}/src/`.length).split('/')[0]))].sort();
    const moduleEvidence = [settingsPath, buildFile].filter(Boolean).map((file) => evidenceByPath.get(file).id);
    const hasProductFlavors = /\bproductFlavors\s*\{/.test(buildText);
    return {
      id: stableId('module', gradlePath), gradlePath, kind, sourceSets,
      buildVariants: buildFile && !hasProductFlavors ? extractLiteralBuildTypes(content.get(buildFile)) : [],
      evidenceRefs: [...new Set(moduleEvidence)].sort(), directory, hasProductFlavors, buildFile
    };
  });

  const uiSymbols = [];
  const states = [];
  const actions = [];
  const tests = [];
  const buildCommandClues = [];
  const uncertainties = [];
  function addClue(target, prefix, symbol, relative, offset, confidence) {
    const evidenceRef = evidenceByPath.get(relative).id;
    target.push({
      id: stableId(prefix, `${relative}:${offset}:${symbol}`), symbol,
      location: { path: relative, line: lineAt(content.get(relative), offset) }, confidence,
      evidenceRefs: [evidenceRef]
    });
  }

  for (const relative of files.filter((file) => /\.(kt|java)$/.test(file))) {
    const raw = content.get(relative);
    const clean = maskCode(raw);
    const module = modulePathForFile(relative, modules);
    const packageMatch = clean.match(/\bpackage\s+([A-Za-z_][\w.]*)/);
    const packageName = packageMatch ? packageMatch[1] : '';
    const productionSource = /\/src\/main\//.test(relative);
    const patterns = [{ regex: /@Composable\s+(?:@[\w.()\s]+\s+)*fun\s+([A-Za-z_]\w*)/g, kind: 'COMPOSABLE', confidence: 0.96 }];
    for (const pattern of productionSource ? patterns : []) {
      for (const match of clean.matchAll(pattern.regex)) {
        if (pattern.kind === 'COMPOSABLE' && braceDepthAt(clean, match.index) !== 0) continue;
        const name = match[1];
        const qualifiedName = packageName ? `${packageName}.${name}` : name;
        uiSymbols.push({
          id: stableId('ui', `${relative}:${match.index}:${pattern.kind}:${qualifiedName}`),
          moduleRef: module.id, qualifiedName, kind: pattern.kind,
          location: { path: relative, line: lineAt(raw, match.index) }, confidence: pattern.confidence,
          evidenceRefs: [evidenceByPath.get(relative).id]
        });
      }
    }
    if (productionSource && relative.endsWith('.kt')) {
      for (const match of clean.matchAll(/\bclass\s+([A-Za-z_]\w*)/g)) {
        const classification = classifyKotlinClass(kotlinClassSupertype(clean, match.index + match[0].length));
        if (!classification) continue;
        const name = match[1];
        const qualifiedName = packageName ? `${packageName}.${name}` : name;
        uiSymbols.push({
          id: stableId('ui', `${relative}:${match.index}:${classification.kind}:${qualifiedName}`),
          moduleRef: module.id, qualifiedName, kind: classification.kind,
          location: { path: relative, line: lineAt(raw, match.index) }, confidence: classification.confidence,
          evidenceRefs: [evidenceByPath.get(relative).id]
        });
      }
    }
    if (productionSource && relative.endsWith('.java')) {
      for (const match of clean.matchAll(/\bclass\s+([A-Za-z_]\w*)\s+extends\s+([A-Za-z_][\w.]*)/g)) {
        const classification = classifyKotlinClass(match[2]);
        if (!classification) continue;
        const name = match[1];
        const qualifiedName = packageName ? `${packageName}.${name}` : name;
        uiSymbols.push({
          id: stableId('ui', `${relative}:${match.index}:${classification.kind}:${qualifiedName}`),
          moduleRef: module.id, qualifiedName, kind: classification.kind,
          location: { path: relative, line: lineAt(raw, match.index) }, confidence: classification.confidence,
          evidenceRefs: [evidenceByPath.get(relative).id]
        });
      }
    }
    for (const match of productionSource ? clean.matchAll(/\b(?:data\s+class|sealed\s+(?:class|interface)|class|interface)\s+([A-Za-z_]\w*(?:State|UiState|StateHolder))\b/g) : []) {
      addClue(states, 'state', match[1], relative, match.index, 0.82);
    }
    for (const match of productionSource ? clean.matchAll(/\b(?:sealed\s+(?:class|interface)|class|interface|object)\s+([A-Za-z_]\w*(?:Action|Event|Intent))\b/g) : []) {
      addClue(actions, 'action', match[1], relative, match.index, 0.82);
    }
    if (/(^|\/)src\/(test|androidTest)\//.test(relative)) {
      for (const match of clean.matchAll(/@Test\b[^\n]*\n\s*(?:public\s+)?(?:fun|void)\s+([A-Za-z_]\w*)/g)) {
        const sourceSet = relative.includes('/androidTest/') ? 'INSTRUMENTED' : 'UNIT';
        tests.push({
          id: stableId('test', `${relative}:${match.index}:${match[1]}`), kind: sourceSet,
          command: 'not executed; lexical test declaration only',
          location: { path: relative, line: lineAt(raw, match.index) }, covers: [],
          evidenceRefs: [evidenceByPath.get(relative).id]
        });
      }
    }
  }

  for (const relative of files.filter((file) => /\/src\/[^/]+\/res\/layout[^/]*\/.*\.xml$/.test(file))) {
    const raw = content.get(relative);
    const clean = raw.replace(/<!--[\s\S]*?-->/g, (comment) => comment.replace(/[^\n]/g, ' '));
    const module = modulePathForFile(relative, modules);
    for (const match of clean.matchAll(/<([A-Za-z_][\w.$-]*)([^>]*?)(?:\/?>)/g)) {
      if (match[1] === 'layout' || match[1] === 'data' || match[1] === 'variable' || match[1] === 'import') continue;
      const idMatch = match[2].match(/android:id\s*=\s*["']@\+?id\/([A-Za-z_]\w*)["']/);
      const name = idMatch ? `${path.basename(relative, '.xml')}#${idMatch[1]}` : `${path.basename(relative, '.xml')}#${match[1]}`;
      uiSymbols.push({
        id: stableId('ui', `${relative}:${match.index}:xml:${name}`), moduleRef: module.id,
        qualifiedName: name, kind: match[1].includes('.') ? 'CUSTOM_VIEW' : 'VIEW',
        location: { path: relative, line: lineAt(raw, match.index) }, confidence: idMatch ? 0.93 : 0.72,
        evidenceRefs: [evidenceByPath.get(relative).id]
      });
    }
  }

  const byQualifiedName = new Map();
  for (const symbol of uiSymbols) {
    const group = byQualifiedName.get(symbol.qualifiedName) || [];
    group.push(symbol);
    byQualifiedName.set(symbol.qualifiedName, group);
  }
  for (const [name, symbols] of byQualifiedName) {
    if (symbols.length < 2) continue;
    for (const symbol of symbols) {
      uncertainties.push({
        id: stableId('uncertainty', `ambiguous:${symbol.id}`), subjectRef: symbol.id,
        statement: `The lexical symbol name ${name} occurs at multiple source locations; identity and runtime target remain distinct and unresolved.`,
        impact: 'MEDIUM', resolution: 'Resolve call sites and runtime dispatch with characterization evidence.',
        evidenceRefs: symbol.evidenceRefs
      });
    }
  }
  for (const symbol of uiSymbols) {
    uncertainties.push({
      id: stableId('uncertainty', `lexical-runtime:${symbol.id}`), subjectRef: symbol.id,
      statement: 'Lexical presence does not prove reachability, runtime dispatch, behavior, or rendering.',
      impact: 'HIGH', resolution: 'Collect characterization and runtime evidence for this exact source identity.',
      evidenceRefs: symbol.evidenceRefs
    });
  }
  for (const module of modules.filter((item) => item.buildVariants.length === 0)) {
    uncertainties.push({
      id: stableId('uncertainty', `variants:${module.id}`), subjectRef: module.id,
      statement: module.hasProductFlavors
        ? 'Product flavors were observed; combined variants were left empty rather than inferred lexically.'
        : 'No literal buildTypes were observed; variants were not inferred from Android plugin conventions.',
      impact: 'HIGH', resolution: 'Resolve the concrete build variant from trusted Gradle model evidence in a later phase.',
      evidenceRefs: module.evidenceRefs
    });
  }
  for (const module of modules.filter((item) => item.kind === 'APPLICATION' && item.buildFile)) {
    const buildEvidenceRef = evidenceByPath.get(module.buildFile).id;
    for (const variant of module.buildVariants) {
      const variantTask = `${variant[0].toUpperCase()}${variant.slice(1)}`;
      for (const candidate of [
        { purpose: 'ASSEMBLE', task: `assemble${variantTask}` },
        { purpose: 'UNIT_TEST', task: `test${variantTask}UnitTest` }
      ]) {
        const command = `./gradlew ${module.gradlePath}:${candidate.task}`;
        const clue = {
          id: stableId('build-command', `${module.id}:${candidate.purpose}:${variant}`),
          moduleRef: module.id, purpose: candidate.purpose, command,
          status: 'HEURISTIC_NOT_EXECUTED', confidence: 0.65, evidenceRefs: [buildEvidenceRef]
        };
        buildCommandClues.push(clue);
        uncertainties.push({
          id: stableId('uncertainty', `build-command:${clue.id}`), subjectRef: clue.id,
          statement: `The candidate command ${command} was derived from literal plugin and buildType text but was not executed and may not exist in the resolved Gradle model.`,
          impact: 'HIGH', resolution: 'Resolve the Gradle model and execute the exact task in an authorized build phase.',
          evidenceRefs: clue.evidenceRefs
        });
      }
    }
  }
  if (uiSymbols.length === 0) {
    uncertainties.push({
      id: stableId('uncertainty', 'no-ui-symbols'), subjectRef: modules[0].id,
      statement: 'Lexical inspection found no recognized Kotlin, Java, or XML UI symbols.', impact: 'HIGH',
      resolution: 'Review source conventions or add a bounded parser before mapping UI behavior.',
      evidenceRefs: modules[0].evidenceRefs
    });
  }

  const repositoryDigest = sha256(JSON.stringify({
    commit: revision.commit,
    dirty: revision.dirty,
    workingTreeDiffSha256: revision.workingTreeDiffSha256 || null,
    files: evidence.map(({ path: filePath, sha256: digest }) => [filePath, digest])
  }));
  const completedAt = clock().toISOString();
  const revisionModel = { vcs: 'git', commit: revision.commit, dirty: revision.dirty };
  if (revision.dirty) revisionModel.workingTreeDiffSha256 = revision.workingTreeDiffSha256;
  const model = {
    schemaVersion: '1.0.0', kind: 'ExistingAppModel',
    id: `app-model.${revision.commit.slice(0, 12)}.${repositoryDigest.slice(0, 12)}`,
    createdAt: completedAt, producer: { name: 'ctc', version: '1.0.0' },
    inputs: [{ id: stableId('repository', root), kind: 'REPOSITORY', path: root, sha256: repositoryDigest }],
    claimScope: 'LEXICAL_EVIDENCE_WITH_UNCERTAINTY',
    provenance: {
      repository: { root, remoteUrl: revision.remoteUrl }, revision: revisionModel,
      inspection: {
        startedAt, completedAt,
        commands: [
          gitCommandRecord(root, ['rev-parse', '--show-toplevel']),
          gitCommandRecord(root, ['rev-parse', '--verify', 'HEAD']),
          ...(revision.checkedSpecialPaths ? [gitCommandRecord(root, ['check-ignore', '--stdin', '-z'])] : []),
          gitCommandRecord(root, ['status', '--porcelain=v1', '-z', '--untracked-files=all']),
          ...(revision.dirty ? [
            gitCommandRecord(root, ['diff', '--no-ext-diff', '--no-textconv', '--binary', 'HEAD', '--']),
            gitCommandRecord(root, ['ls-files', '--others', '--exclude-standard', '-z'])
          ] : []),
          gitCommandRecord(root, ['config', '--get', 'remote.origin.url'])
        ],
        filesRead: files, mutatedRepository: false
      }, evidence
    },
    modules: modules.map(({ directory, hasProductFlavors, buildFile, ...module }) => module),
    uiSymbols: uiSymbols.sort((a, b) => a.id.localeCompare(b.id)),
    stateActionClues: {
      states: states.sort((a, b) => a.id.localeCompare(b.id)),
      actions: actions.sort((a, b) => a.id.localeCompare(b.id))
    },
    buildCommandClues: buildCommandClues.sort((a, b) => a.id.localeCompare(b.id)),
    tests: tests.sort((a, b) => a.id.localeCompare(b.id)),
    uncertainties: uncertainties.sort((a, b) => a.id.localeCompare(b.id))
  };

  const schema = JSON.parse(fs.readFileSync(SCHEMA_PATH, 'utf8'));
  const ajv = new Ajv2020({ allErrors: true, strict: false, strictNumbers: true });
  addFormats(ajv);
  const validate = ajv.compile(schema);
  if (!validate(model)) {
    throw new Error(`generated ExistingAppModel failed schema validation: ${ajv.errorsText(validate.errors)}`);
  }
  return model;
}

module.exports = {
  assertNoSourceSensitiveSymlinks, gitChangedPaths, gitCommonDirectory, gitIgnoredSourceEvidence,
  gitMetadata, gitVersion, inspectRepository, maskCode, sha256
};
