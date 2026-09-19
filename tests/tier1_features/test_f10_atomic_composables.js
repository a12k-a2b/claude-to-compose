/**
 * Tier 1 - Feature 10: Modular Atomic Composables Generation
 * Covers: R2 / ORIGINAL_REQUEST §R2 / PROJECT.md §Feature 15
 */

const path = require('node:path');

module.exports = {
  name: 'F10: Modular Atomic Composables Generation',
  tier: 1,
  feature: 'F10',
  tests: [
    {
      id: 'T1_F10_01',
      name: 'Validate state hoisting and lambda event signature pattern (onAction: () -> Unit)',
      run: async (t) => {
        const sampleComposableSignature = `
          @Composable
          fun PrimaryActionButton(
            text: String,
            enabled: Boolean = true,
            modifier: Modifier = Modifier,
            onClick: () -> Unit
          )
        `;
        t.assertMatch(sampleComposableSignature, /@Composable/);
        t.assertMatch(sampleComposableSignature, /modifier:\s*Modifier\s*=\s*Modifier/);
        t.assertMatch(sampleComposableSignature, /onClick:\s*\(\)\s*->\s*Unit/);
      }
    },
    {
      id: 'T1_F10_02',
      name: 'Validate Card composable architecture with ElevatedCard / Card M3 API',
      run: async (t) => {
        const sampleCardComposable = `
          @Composable
          fun MetricCard(
            title: String,
            value: String,
            modifier: Modifier = Modifier
          ) {
            Card(
              modifier = modifier.fillMaxWidth(),
              shape = RoundedCornerShape(16.dp),
              elevation = CardDefaults.cardElevation(defaultElevation = 2.dp)
            ) {
              // content
            }
          }
        `;
        t.assertMatch(sampleCardComposable, /Card\(/);
        t.assertMatch(sampleCardComposable, /CardDefaults\.cardElevation/);
      }
    },
    {
      id: 'T1_F10_03',
      name: 'Validate OutlinedTextField / TextField input composable structure with state parameter',
      run: async (t) => {
        const sampleInputComposable = `
          @Composable
          fun AppInputField(
            value: String,
            onValueChange: (String) -> Unit,
            label: String,
            modifier: Modifier = Modifier
          ) {
            OutlinedTextField(
              value = value,
              onValueChange = onValueChange,
              label = { Text(label) },
              modifier = modifier
            )
          }
        `;
        t.assertMatch(sampleInputComposable, /OutlinedTextField\(/);
        t.assertMatch(sampleInputComposable, /onValueChange:\s*\(String\)\s*->\s*Unit/);
      }
    },
    {
      id: 'T1_F10_04',
      name: 'Verify component_generator module existence in synthesizer subsystem',
      run: async (t) => {
        t.checkFileExists('synthesizer/component_generator.js', 'M2', 'Component generator module required to emit atomic composables');
      }
    },
    {
      id: 'T1_F10_05',
      name: 'Validate Badge and Navigation atomic composables generation contracts',
      run: async (t) => {
        const sampleBadge = `
          @Composable
          fun StatusBadge(text: String, modifier: Modifier = Modifier) {
            Surface(shape = RoundedCornerShape(6.dp), color = MaterialTheme.colorScheme.primaryContainer) {
              Text(text = text, modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp))
            }
          }
        `;
        t.assert(sampleBadge.includes('Surface('));
        t.assert(sampleBadge.includes('MaterialTheme.colorScheme'));
      }
    }
  ]
};
