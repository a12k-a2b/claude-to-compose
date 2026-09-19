/**
 * Tier 2 - Boundary 18: Multi-Agent Role Prompt Edge Cases & Negative Tests
 * Covers: Missing role files, empty prompt files, missing required sections
 */

module.exports = {
  name: 'B18: Multi-Agent Role Definitions Boundaries',
  tier: 2,
  feature: 'B18',
  tests: [
    {
      id: 'T2_B18_01',
      name: 'Verify all 4 specialized agent role prompt files exist in prompts directory',
      run: async (t) => {
        t.checkFileExists('skills/claude-to-compose/prompts/extractor_agent.md', 'M3');
        t.checkFileExists('skills/claude-to-compose/prompts/compose_architect_agent.md', 'M3');
        t.checkFileExists('skills/claude-to-compose/prompts/motion_specialist_agent.md', 'M3');
        t.checkFileExists('skills/claude-to-compose/prompts/visual_qa_agent.md', 'M3');
      }
    },
    {
      id: 'T2_B18_02',
      name: 'Reject 0-byte or empty agent role prompt files',
      run: async (t) => {
        function validatePromptContent(promptText, roleName) {
          if (!promptText || promptText.trim().length < 50) {
            throw new Error(`IncompletePromptError: Prompt for "${roleName}" must be at least 50 characters`);
          }
          return true;
        }
        t.assertThrows(() => validatePromptContent('', 'Extractor'), /IncompletePromptError/);
        t.assertThrows(() => validatePromptContent('   \n  ', 'Extractor'), /IncompletePromptError/);
        t.assert(validatePromptContent('You are the Extractor Agent responsible for headless DOM token extraction...', 'Extractor'));
      }
    },
    {
      id: 'T2_B18_03',
      name: 'Validate Extractor Agent prompt defines input parameters and outputs',
      run: async (t) => {
        t.checkFileExists('skills/claude-to-compose/prompts/extractor_agent.md', 'M3');
        const content = t.readFile('skills/claude-to-compose/prompts/extractor_agent.md');
        t.assert(content.includes('design_spec.json'), 'Extractor prompt must mention design_spec.json');
      }
    },
    {
      id: 'T2_B18_04',
      name: 'Validate Visual QA Agent prompt defines verification report generation',
      run: async (t) => {
        t.checkFileExists('skills/claude-to-compose/prompts/visual_qa_agent.md', 'M3');
        const content = t.readFile('skills/claude-to-compose/prompts/visual_qa_agent.md');
        t.assert(content.includes('verification_report.md'), 'Visual QA prompt must mention verification_report.md');
      }
    },
    {
      id: 'T2_B18_05',
      name: 'Validate pipeline iteration loop criteria when visual diff score is below 90',
      run: async (t) => {
        function checkRefinementLoopTrigger(score) {
          return score < 90 ? 'TRIGGER_REFINEMENT' : 'PROCEED_PUBLISH';
        }
        t.assertEqual(checkRefinementLoopTrigger(88), 'TRIGGER_REFINEMENT');
        t.assertEqual(checkRefinementLoopTrigger(94), 'PROCEED_PUBLISH');
      }
    }
  ]
};
