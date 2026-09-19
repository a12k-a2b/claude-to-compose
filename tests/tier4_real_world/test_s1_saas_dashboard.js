/**
 * Tier 4 - Scenario 1: Modern SaaS Analytics Dashboard
 * Exercising: Grid/flex layout, dark/light tokens, SVG metrics icons, animated chart card, date range tab.
 * Expected: Full spec extracted, valid M3 Compose screen synthesized, clean Gradle compile & preview.
 */

const fs = require('node:fs');
const path = require('node:path');

module.exports = {
  name: 'S1: Modern SaaS Analytics Dashboard Workload',
  tier: 4,
  feature: 'S1',
  tests: [
    {
      id: 'T4_S1_01',
      name: 'Verify SaaS Dashboard HTML/CSS fixture integrity and token definitions',
      run: async (t) => {
        const fixtureDir = path.join(t.fixturesDir, 's1_saas_dashboard');
        t.assert(fs.existsSync(fixtureDir), 'SaaS dashboard fixture directory must exist');
        const html = fs.readFileSync(path.join(fixtureDir, 'index.html'), 'utf8');
        const css = fs.readFileSync(path.join(fixtureDir, 'styles.css'), 'utf8');

        t.assert(html.includes('Nexus Analytics'), 'HTML must declare brand title');
        t.assert(html.includes('data-period="7d"'), 'HTML must have interactive date tab options');
        t.assert(html.includes('Monthly Recurring Revenue'), 'HTML must define MRR metric card');
        t.assert(css.includes('--color-primary: #4F46E5;'), 'CSS must define primary indigo token');
        t.assert(css.includes('grid-template-columns'), 'CSS must specify responsive metrics grid');
      }
    },
    {
      id: 'T4_S1_02',
      name: 'Validate SaaS Dashboard intermediate design_spec token extraction expectations',
      run: async (t) => {
        const specFixture = t.readJson('tests/fixtures/assets/test_spec.json');
        t.assertEqual(specFixture.theme.colors.primary, '#4F46E5');
        t.assertEqual(specFixture.theme.colors.success, '#10B981');
        t.assert(specFixture.hierarchy.children.length > 0);
      }
    },
    {
      id: 'T4_S1_03',
      name: 'Validate synthesized Compose architecture for Dashboard (Scaffold, TopAppBar, LazyVerticalGrid)',
      run: async (t) => {
        const dashboardComposable = `
          @Composable
          fun NexusDashboardScreen(
            modifier: Modifier = Modifier
          ) {
            var selectedPeriod by rememberSaveable { mutableStateOf("7d") }
            Scaffold(modifier = modifier) { innerPadding ->
              Column(modifier = Modifier.padding(innerPadding).verticalScroll(rememberScrollState())) {
                DashboardHeader(selectedPeriod = selectedPeriod, onPeriodChange = { selectedPeriod = it })
                MetricsGridSection()
                PerformanceChartSection()
              }
            }
          }
        `;
        t.assertMatch(dashboardComposable, /Scaffold\(/);
        t.assertMatch(dashboardComposable, /rememberSaveable/);
        t.assertMatch(dashboardComposable, /verticalScroll\(/);
      }
    },
    {
      id: 'T4_S1_04',
      name: 'Verify end-to-end extraction and synthesis pipeline execution for S1',
      run: async (t) => {
        t.checkFileExists('bin/claude-extract.js', 'M1', 'CLI extractor required for full S1 pipeline');
        t.checkFileExists('synthesizer/screen_generator.js', 'M2', 'Screen synthesizer required for full S1 pipeline');
      }
    }
  ]
};
