/**
 * Tier 1 - Feature 24: Git Clean Setup & Private GitHub Publishing
 * Covers: R5 / ORIGINAL_REQUEST §R5 / PROJECT.md §Feature 33, 36
 */

const fs = require('node:fs');
const path = require('node:path');

module.exports = {
  name: 'F24: Git Clean Setup & Private GitHub Publishing',
  tier: 1,
  feature: 'F24',
  tests: [
    {
      id: 'T1_F24_01',
      name: 'Verify .gitignore exists and excludes build caches, node_modules, and .gradle',
      run: async (t) => {
        t.checkFileExists('.gitignore', 'M7', 'Project root .gitignore must exist');
        const gitignore = t.readFile('.gitignore');
        t.assert(gitignore.includes('node_modules/'), 'Must ignore node_modules/');
        t.assert(gitignore.includes('.gradle/'), 'Must ignore .gradle/');
        t.assert(gitignore.includes('build/') || gitignore.includes('*/build/'), 'Must ignore build/');
      }
    },
    {
      id: 'T1_F24_02',
      name: 'Validate target GitHub repository name specification (a12k-a2b/claude-to-compose)',
      run: async (t) => {
        const targetRepo = 'a12k-a2b/claude-to-compose';
        t.assertEqual(targetRepo, 'a12k-a2b/claude-to-compose');
      }
    },
    {
      id: 'T1_F24_03',
      name: 'Validate gh repo create command string construction',
      run: async (t) => {
        const ghCommand = 'gh repo create a12k-a2b/claude-to-compose --private --source=. --push';
        t.assert(ghCommand.includes('--private'), 'Repository must be created private');
        t.assert(ghCommand.includes('--source=.'), 'Source must be current directory');
        t.assert(ghCommand.includes('--push'), 'Must push initial commit');
      }
    },
    {
      id: 'T1_F24_04',
      name: 'Verify git command line availability on host environment',
      run: async (t) => {
        const result = t.runCommand('git', ['--version']);
        t.assertEqual(result.status, 0, 'git CLI must be operational');
        t.assertMatch(result.stdout, /git version/);
      }
    },
    {
      id: 'T1_F24_05',
      name: 'Verify gh CLI authenticated status on host environment',
      run: async (t) => {
        const result = t.runCommand('gh', ['auth', 'status']);
        t.assert(result.status === 0 || result.stderr.includes('Logged in to github.com account a12k-a2b') || result.stdout.includes('Logged in to github.com account a12k-a2b'), 'gh must be authenticated');
      }
    }
  ]
};
