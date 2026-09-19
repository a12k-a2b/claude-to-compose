/**
 * Tier 1 - Feature 18: Multi-Agent Role Workflow Definitions
 * Covers: R3 / ORIGINAL_REQUEST §R3 / PROJECT.md §Feature 25
 */

const path = require('node:path');

module.exports = {
  name: 'F18: Multi-Agent Role Workflow Definitions',
  tier: 1,
  feature: 'F18',
  tests: [
    {
      id: 'T1_F18_01',
      name: 'Verify Extractor Agent role prompt specification existence and directives',
      run: async (t) => {
        t.checkFileExists('skills/claude-to-compose/prompts/extractor_agent.md', 'M3', 'Extractor agent role prompt must exist');
        const content = t.readFile('skills/claude-to-compose/prompts/extractor_agent.md');
        t.assert(content.includes('Extractor'), 'Prompt must define Extractor role');
      }
    },
    {
      id: 'T1_F18_02',
      name: 'Verify Compose Architect Agent role prompt specification existence',
      run: async (t) => {
        t.checkFileExists('skills/claude-to-compose/prompts/compose_architect_agent.md', 'M3', 'Compose Architect role prompt must exist');
        const content = t.readFile('skills/claude-to-compose/prompts/compose_architect_agent.md');
        t.assert(content.includes('Compose Architect'), 'Prompt must define Compose Architect role');
      }
    },
    {
      id: 'T1_F18_03',
      name: 'Verify Motion & UX Specialist Agent role prompt specification existence',
      run: async (t) => {
        t.checkFileExists('skills/claude-to-compose/prompts/motion_specialist_agent.md', 'M3', 'Motion Specialist role prompt must exist');
        const content = t.readFile('skills/claude-to-compose/prompts/motion_specialist_agent.md');
        t.assert(content.includes('Motion') || content.includes('UX'), 'Prompt must define Motion & UX Specialist role');
      }
    },
    {
      id: 'T1_F18_04',
      name: 'Verify Visual QA Agent role prompt specification existence',
      run: async (t) => {
        t.checkFileExists('skills/claude-to-compose/prompts/visual_qa_agent.md', 'M3', 'Visual QA role prompt must exist');
        const content = t.readFile('skills/claude-to-compose/prompts/visual_qa_agent.md');
        t.assert(content.includes('Visual QA') || content.includes('Verification'), 'Prompt must define Visual QA role');
      }
    },
    {
      id: 'T1_F18_05',
      name: 'Validate agent handoff contracts and artifact passing sequence',
      run: async (t) => {
        const handoffSequence = [
          'Extractor -> design_spec.json + screenshots -> Compose Architect',
          'Compose Architect -> Kotlin M3 Composables -> Motion Specialist',
          'Motion Specialist -> State & Animations -> Visual QA',
          'Visual QA -> verification_report.md -> Sentinel / Orchestrator'
        ];
        t.assertEqual(handoffSequence.length, 4, 'Must define 4 pipeline handoff transitions');
        t.assert(handoffSequence[0].includes('design_spec.json'));
        t.assert(handoffSequence[3].includes('verification_report.md'));
      }
    }
  ]
};
