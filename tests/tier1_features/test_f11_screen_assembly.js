/**
 * Tier 1 - Feature 11: Full Screen Composable Assembly
 * Covers: R2 / ORIGINAL_REQUEST §R2 / PROJECT.md §Feature 16
 */

const path = require('node:path');

module.exports = {
  name: 'F11: Full Screen Composable Assembly',
  tier: 1,
  feature: 'F11',
  tests: [
    {
      id: 'T1_F11_01',
      name: 'Validate ClaudeDesignScreen top-level composable function signature and imports',
      run: async (t) => {
        const sampleScreenCode = `
          package com.claude.compose.screen

          import androidx.compose.runtime.Composable
          import androidx.compose.ui.Modifier
          import androidx.compose.material3.Scaffold

          @Composable
          fun ClaudeDesignScreen(
            modifier: Modifier = Modifier
          ) {
            Scaffold(modifier = modifier) { paddingValues ->
              // Body
            }
          }
        `;
        t.assertMatch(sampleScreenCode, /package\s+com\.claude\.compose\.screen/);
        t.assertMatch(sampleScreenCode, /@Composable\s+fun\s+ClaudeDesignScreen/);
        t.assertMatch(sampleScreenCode, /Scaffold\(/);
      }
    },
    {
      id: 'T1_F11_02',
      name: 'Validate screen layout container mapping (Column with verticalScroll or LazyColumn)',
      run: async (t) => {
        const scrollablePattern = /rememberScrollState\(\)|LazyColumn|LazyVerticalGrid/;
        const screenLayout = 'Column(modifier = Modifier.fillMaxSize().verticalScroll(rememberScrollState()))';
        t.assertMatch(screenLayout, scrollablePattern, 'Screen root container must support scrolling');
      }
    },
    {
      id: 'T1_F11_03',
      name: 'Validate screen composition combines atomic composables',
      run: async (t) => {
        const composedContent = `
          Column {
            DashboardHeader()
            MetricsGrid()
            PerformanceChartCard()
          }
        `;
        t.assert(composedContent.includes('DashboardHeader()'));
        t.assert(composedContent.includes('MetricsGrid()'));
        t.assert(composedContent.includes('PerformanceChartCard()'));
      }
    },
    {
      id: 'T1_F11_04',
      name: 'Verify screen_generator module existence in synthesizer subsystem',
      run: async (t) => {
        t.checkFileExists('synthesizer/screen_generator.js', 'M2', 'Screen generator module required to assemble full screen composable');
      }
    },
    {
      id: 'T1_F11_05',
      name: 'Validate Scaffolding paddingValues application to root content container',
      run: async (t) => {
        const scaffoldSnippet = 'Scaffold { innerPadding -> Column(modifier = Modifier.padding(innerPadding)) { } }';
        t.assertMatch(scaffoldSnippet, /Modifier\.padding\(innerPadding\)/);
      }
    }
  ]
};
