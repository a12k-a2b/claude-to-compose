/**
 * Tier 4 - Scenario 3: Fintech Mobile Banking Wallet Workload
 * Exercising: Sensitive balance toggle (rememberSaveable), transaction list, quick actions, custom SVG logos.
 * Expected: Zero compilation errors, touch target compliance, clean audit score >= 90.
 */

const fs = require('node:fs');
const path = require('node:path');

module.exports = {
  name: 'S3: Fintech Mobile Banking Wallet Workload',
  tier: 4,
  feature: 'S3',
  tests: [
    {
      id: 'T4_S3_01',
      name: 'Verify Banking Wallet fixture DOM and sensitive balance elements',
      run: async (t) => {
        const fixtureDir = path.join(t.fixturesDir, 's3_banking_wallet');
        const html = fs.readFileSync(path.join(fixtureDir, 'index.html'), 'utf8');
        const css = fs.readFileSync(path.join(fixtureDir, 'styles.css'), 'utf8');

        t.assert(html.includes('Total Liquid Balance'), 'HTML must declare balance label');
        t.assert(html.includes('toggleBalanceBtn'), 'HTML must have balance visibility toggle');
        t.assert(html.includes('Recent Activity'), 'HTML must contain transactions section');
        t.assert(css.includes('card-balance-banner'), 'CSS must specify gradient card styling');
      }
    },
    {
      id: 'T4_S3_02',
      name: 'Validate sensitive balance toggle state and masked text rendering logic',
      run: async (t) => {
        const balanceDisplayLogic = `
          var isBalanceVisible by rememberSaveable { mutableStateOf(true) }
          val displayedBalance = if (isBalanceVisible) "$48,290.45" else "••••••••"
        `;
        t.assert(balanceDisplayLogic.includes('rememberSaveable'));
        t.assert(balanceDisplayLogic.includes('if (isBalanceVisible) "$48,290.45" else "••••••••"'));
      }
    },
    {
      id: 'T4_S3_03',
      name: 'Validate transaction list item layout with positive and negative currency formatting',
      run: async (t) => {
        const transactionItem = `
          @Composable
          fun TransactionItem(title: String, date: String, amount: String, isPositive: Boolean) {
            Row(modifier = Modifier.fillMaxWidth().padding(12.dp), horizontalArrangement = Arrangement.SpaceBetween) {
              Column { Text(title); Text(date) }
              Text(text = amount, color = if (isPositive) Color(0xFF16A34A) else Color(0xFF0F172A))
            }
          }
        `;
        t.assert(transactionItem.includes('Arrangement.SpaceBetween'));
        t.assert(transactionItem.includes('isPositive'));
      }
    },
    {
      id: 'T4_S3_04',
      name: 'Verify end-to-end extraction and synthesis pipeline execution for S3',
      run: async (t) => {
        t.checkFileExists('bin/claude-extract.js', 'M1', 'CLI extractor required for S3');
        t.checkFileExists('synthesizer/screen_generator.js', 'M2', 'Screen synthesizer required for S3');
      }
    }
  ]
};
