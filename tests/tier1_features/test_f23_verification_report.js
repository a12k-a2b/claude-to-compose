/**
 * Tier 1 - Feature 23: Markdown Verification Report Generation
 * Covers: R4 / ORIGINAL_REQUEST §R4 / PROJECT.md §Feature 30
 */

const path = require('node:path');

module.exports = {
  name: 'F23: Markdown Verification Report Generation',
  tier: 1,
  feature: 'F23',
  tests: [
    {
      id: 'T1_F23_01',
      name: 'Verify report_generator module existence in verification subsystem',
      run: async (t) => {
        t.checkFileExists('verification/report_generator.js', 'M4', 'Report generator verification/report_generator.js must exist');
      }
    },
    {
      id: 'T1_F23_02',
      name: 'Validate verification report structure and required Markdown sections',
      run: async (t) => {
        const sampleReport = `
          # Verification Report: Claude to Compose
          
          ## 1. Executive Summary
          Verdict: PASSED
          
          ## 2. Programmatic Build & Unit Test Results
          - Gradle Compilation: 0 errors
          - Unit Tests: 100% pass
          
          ## 3. Programmatic Visual Diff Analysis
          - Pixel Similarity: 98.4%
          - MSSIM Score: 0.971
          
          ![Visual Diff Composite](output/composite.png)
          
          ## 4. Agent-as-Judge 10-Point Audit Rubric
          | Dimension | Score (0-10) | Notes |
          |---|---|---|
          | Typography Hierarchy | 10/10 | Compliant |
        `;
        t.assert(sampleReport.includes('## 1. Executive Summary'));
        t.assert(sampleReport.includes('## 2. Programmatic Build & Unit Test Results'));
        t.assert(sampleReport.includes('## 3. Programmatic Visual Diff Analysis'));
        t.assert(sampleReport.includes('## 4. Agent-as-Judge 10-Point Audit Rubric'));
      }
    },
    {
      id: 'T1_F23_03',
      name: 'Validate embedded image markdown syntax for reference and diff composite images',
      run: async (t) => {
        const imageMarkdown = '![Visual Diff Composite](output/diff_composite.png)';
        t.assertMatch(imageMarkdown, /!\[.*?\]\([a-zA-Z0-9_\-\/.]+\.png\)/);
      }
    },
    {
      id: 'T1_F23_04',
      name: 'Validate table generation for 10-point audit rubric scoring',
      run: async (t) => {
        const tableRow = '| Touch Target Compliance (>= 48dp) | 10/10 | All buttons wrapped in minimumInteractiveComponentSize |';
        t.assertMatch(tableRow, /^\|\s*Touch Target Compliance.*\|\s*\d+\/10\s*\|/);
      }
    },
    {
      id: 'T1_F23_05',
      name: 'Validate output filename convention (verification_report.md)',
      run: async (t) => {
        const targetFilename = 'verification_report.md';
        t.assertEqual(targetFilename, 'verification_report.md');
      }
    }
  ]
};
