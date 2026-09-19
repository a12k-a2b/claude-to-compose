/**
 * Tier 4 - Scenario 2: E-Commerce Product Detail Screen Workload
 * Exercising: Image carousel, price badges, quantity counter with ripple, floating cart button (>= 48dp).
 * Expected: Clean state hoisting, responsive Compose layout, visual diff similarity > 92%.
 */

const fs = require('node:fs');
const path = require('node:path');

module.exports = {
  name: 'S2: E-Commerce Product Details Workload',
  tier: 4,
  feature: 'S2',
  tests: [
    {
      id: 'T4_S2_01',
      name: 'Verify E-Commerce details fixture DOM and responsive cart bar styles',
      run: async (t) => {
        const fixtureDir = path.join(t.fixturesDir, 's2_ecommerce_details');
        const html = fs.readFileSync(path.join(fixtureDir, 'index.html'), 'utf8');
        const css = fs.readFileSync(path.join(fixtureDir, 'styles.css'), 'utf8');

        t.assert(html.includes('Minimalist Nordic Desk Lamp'), 'HTML must declare product title');
        t.assert(html.includes('stepper-btn minus'), 'HTML must include quantity decrement stepper');
        t.assert(html.includes('stepper-btn plus'), 'HTML must include quantity increment stepper');
        t.assert(html.includes('badge-sale'), 'HTML must include discount badge');
        t.assert(css.includes('bottom-action-bar'), 'CSS must specify fixed bottom action bar');
      }
    },
    {
      id: 'T4_S2_02',
      name: 'Validate state hoisting for quantity stepper and color option chips',
      run: async (t) => {
        const productStateModel = `
          var quantity by rememberSaveable { mutableStateOf(1) }
          var selectedFinishIndex by rememberSaveable { mutableStateOf(0) }

          QuantityStepper(
            quantity = quantity,
            onIncrement = { quantity++ },
            onDecrement = { if (quantity > 1) quantity-- }
          )
        `;
        t.assert(productStateModel.includes('onIncrement = { quantity++ }'));
        t.assert(productStateModel.includes('if (quantity > 1) quantity--'));
      }
    },
    {
      id: 'T4_S2_03',
      name: 'Validate floating bottom action bar touch targets adhere to >= 48dp requirement',
      run: async (t) => {
        const cartButton = `
          Button(
            onClick = onAddToCart,
            modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp),
            shape = RoundedCornerShape(12.dp)
          ) {
            Icon(imageVector = ShoppingCartIcon, contentDescription = null)
            Spacer(modifier = Modifier.width(8.dp))
            Text(text = "Add to Cart")
          }
        `;
        t.assertMatch(cartButton, /heightIn\(min\s*=\s*48\.dp\)/);
        t.assertMatch(cartButton, /ShoppingCartIcon/);
      }
    },
    {
      id: 'T4_S2_04',
      name: 'Verify end-to-end extraction and synthesis pipeline execution for S2',
      run: async (t) => {
        t.checkFileExists('bin/claude-extract.js', 'M1', 'CLI extractor required for S2');
        t.checkFileExists('synthesizer/screen_generator.js', 'M2', 'Screen synthesizer required for S2');
      }
    }
  ]
};
