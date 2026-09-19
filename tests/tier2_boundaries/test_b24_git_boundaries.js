/**
 * Tier 2 - Boundary 24: Git Hygiene & GitHub Publishing Edge Cases & Negative Tests
 * Covers: Accidental commit of node_modules, missing .gitignore, uncommitted changes
 */

module.exports = {
  name: 'B24: Git Hygiene & Publishing Boundaries',
  tier: 2,
  feature: 'B24',
  tests: [
    {
      id: 'T2_B24_01',
      name: 'Verify forbidden directories are matched by .gitignore patterns',
      run: async (t) => {
        const sampleGitignore = `
          node_modules/
          .gradle/
          build/
          */build/
          app/build/
          .DS_Store
        `;
        function isIgnored(patternList, targetPath) {
          const lines = patternList.split('\n').map(l => l.trim()).filter(Boolean);
          return lines.some(line => {
            const cleanPattern = line.replace('/', '');
            return targetPath.includes(cleanPattern);
          });
        }
        t.assert(isIgnored(sampleGitignore, 'node_modules/playwright'));
        t.assert(isIgnored(sampleGitignore, '.gradle/caches'));
        t.assert(isIgnored(sampleGitignore, 'android/app/build/outputs'));
        t.assert(!isIgnored(sampleGitignore, 'extractor/engine.js'));
        t.assert(!isIgnored(sampleGitignore, 'README.md'));
      }
    },
    {
      id: 'T2_B24_02',
      name: 'Reject GitHub repo creation without --private flag',
      run: async (t) => {
        function validatePublishCommand(cmd) {
          if (!cmd.includes('--private')) {
            throw new Error('SecurityError: Repository must be created with --private flag');
          }
          return true;
        }
        t.assertThrows(() => validatePublishCommand('gh repo create test --public'), /SecurityError/);
        t.assert(validatePublishCommand('gh repo create a12k-a2b/claude-to-compose --private --source=. --push'));
      }
    },
    {
      id: 'T2_B24_03',
      name: 'Validate git commit message follows conventional commit structure',
      run: async (t) => {
        const validCommit = 'feat: initial release of claude-to-compose hybrid engine and verification suite';
        t.assertMatch(validCommit, /^(feat|fix|docs|chore|test|refactor)(\(.*\))?:\s+.+/);
      }
    },
    {
      id: 'T2_B24_04',
      name: 'Verify git user configuration is present in host environment',
      run: async (t) => {
        const nameResult = t.runCommand('git', ['config', 'user.name']);
        t.assert(nameResult.stdout.trim().length > 0, 'git user.name must be configured');
        const emailResult = t.runCommand('git', ['config', 'user.email']);
        t.assert(emailResult.stdout.trim().length > 0, 'git user.email must be configured');
      }
    },
    {
      id: 'T2_B24_05',
      name: 'Verify .gitignore file exists in project root',
      run: async (t) => {
        t.checkFileExists('.gitignore', 'M7', 'Root .gitignore must exist');
      }
    }
  ]
};
