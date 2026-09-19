/**
 * Tier 1 - Feature 17: Antigravity Custom Skill (SKILL.md)
 * Covers: R3 / ORIGINAL_REQUEST §R3 / PROJECT.md §Feature 24
 */

const fs = require('node:fs');
const path = require('node:path');

module.exports = {
  name: 'F17: Antigravity Custom Skill (SKILL.md)',
  tier: 1,
  feature: 'F17',
  tests: [
    {
      id: 'T1_F17_01',
      name: 'Verify Antigravity skill directory layout and SKILL.md location',
      run: async (t) => {
        t.checkFileExists('skills/claude-to-compose/SKILL.md', 'M3', 'Antigravity skill definition file skills/claude-to-compose/SKILL.md must exist');
      }
    },
    {
      id: 'T1_F17_02',
      name: 'Validate YAML frontmatter in SKILL.md (name: claude-to-compose & description)',
      run: async (t) => {
        t.checkFileExists('skills/claude-to-compose/SKILL.md', 'M3');
        const content = t.readFile('skills/claude-to-compose/SKILL.md');
        t.assertMatch(content, /^---\s*[\r\n]+/, 'SKILL.md must begin with YAML frontmatter delimiter (---)');
        t.assertMatch(content, /name:\s*claude-to-compose/, 'YAML frontmatter must define name: claude-to-compose');
        t.assertMatch(content, /description:\s*.+/, 'YAML frontmatter must define description');
      }
    },
    {
      id: 'T1_F17_03',
      name: 'Validate slash command workflow trigger (/claude-to-compose)',
      run: async (t) => {
        t.checkFileExists('skills/claude-to-compose/SKILL.md', 'M3');
        const content = t.readFile('skills/claude-to-compose/SKILL.md');
        t.assert(content.includes('/claude-to-compose'), 'SKILL.md must document the /claude-to-compose slash command workflow');
      }
    },
    {
      id: 'T1_F17_04',
      name: 'Validate execution steps and phase transitions defined in SKILL.md',
      run: async (t) => {
        t.checkFileExists('skills/claude-to-compose/SKILL.md', 'M3');
        const content = t.readFile('skills/claude-to-compose/SKILL.md');
        t.assert(content.includes('Extraction'), 'Must detail extraction phase');
        t.assert(content.includes('Synthesis'), 'Must detail synthesis phase');
        t.assert(content.includes('Verification'), 'Must detail verification phase');
      }
    },
    {
      id: 'T1_F17_05',
      name: 'Validate error escalation and recovery protocols in SKILL.md',
      run: async (t) => {
        t.checkFileExists('skills/claude-to-compose/SKILL.md', 'M3');
        const content = t.readFile('skills/claude-to-compose/SKILL.md');
        t.assert(content.toLowerCase().includes('error') || content.toLowerCase().includes('troubleshooting'), 'SKILL.md must cover error handling');
      }
    }
  ]
};
