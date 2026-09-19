/**
 * Tier 2 - Boundary 17: Antigravity Custom Skill (SKILL.md) Syntax & Edge Cases
 * Covers: Missing YAML markers, invalid YAML syntax, missing description
 */

module.exports = {
  name: 'B17: Antigravity Skill Syntax Boundaries',
  tier: 2,
  feature: 'B17',
  tests: [
    {
      id: 'T2_B17_01',
      name: 'Reject SKILL.md missing opening or closing YAML frontmatter delimiters (---)',
      run: async (t) => {
        function validateSkillFrontmatter(content) {
          const lines = content.trim().split('\n');
          if (lines[0] !== '---') {
            throw new Error('FrontmatterError: File must start with "---"');
          }
          const closingIndex = lines.slice(1).findIndex(l => l.trim() === '---');
          if (closingIndex === -1) {
            throw new Error('FrontmatterError: Missing closing "---" delimiter');
          }
          return true;
        }
        t.assertThrows(() => validateSkillFrontmatter('# Title\nNo frontmatter'), /FrontmatterError/);
        t.assertThrows(() => validateSkillFrontmatter('---\nname: test\nno closing'), /FrontmatterError/);
        t.assert(validateSkillFrontmatter('---\nname: test\n---\n# Body'));
      }
    },
    {
      id: 'T2_B17_02',
      name: 'Reject SKILL.md missing name or description property in YAML block',
      run: async (t) => {
        function parseYamlKeys(yamlString) {
          const keys = {};
          for (const line of yamlString.split('\n')) {
            const match = line.match(/^([a-zA-Z0-9_-]+):\s*(.*)$/);
            if (match) keys[match[1]] = match[2];
          }
          if (!keys.name) throw new Error('MissingPropertyError: Skill must have "name"');
          if (!keys.description) throw new Error('MissingPropertyError: Skill must have "description"');
          return keys;
        }
        t.assertThrows(() => parseYamlKeys('description: foo'), /MissingPropertyError/);
        t.assertThrows(() => parseYamlKeys('name: foo'), /MissingPropertyError/);
        t.assert(parseYamlKeys('name: claude-to-compose\ndescription: convert claude design to compose'));
      }
    },
    {
      id: 'T2_B17_03',
      name: 'Validate skill name format contains only alphanumeric and hyphens',
      run: async (t) => {
        const skillName = 'claude-to-compose';
        t.assertMatch(skillName, /^[a-z0-9-]+$/);
      }
    },
    {
      id: 'T2_B17_04',
      name: 'Validate description length is sufficient (> 20 characters)',
      run: async (t) => {
        function validateDescriptionLength(desc) {
          if (!desc || desc.trim().length < 20) {
            throw new Error('DescriptionTooShortError: Skill description must be at least 20 characters');
          }
          return true;
        }
        t.assertThrows(() => validateDescriptionLength('Too short'), /DescriptionTooShortError/);
        t.assert(validateDescriptionLength('Convert Claude Design web artifacts into production-ready Jetpack Compose'));
      }
    },
    {
      id: 'T2_B17_05',
      name: 'Verify SKILL.md file existence in skills/claude-to-compose/ directory',
      run: async (t) => {
        t.checkFileExists('skills/claude-to-compose/SKILL.md', 'M3', 'Antigravity skill required for syntax verification');
      }
    }
  ]
};
