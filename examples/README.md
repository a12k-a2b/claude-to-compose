# Examples & Walkthroughs

This directory provides working examples, sample input fixtures, extracted design tokens, and runnable scripts illustrating the `claude-to-compose` pipeline.

## Available Examples

### 1. SaaS Analytics Dashboard (`saas_dashboard/`)
- **Type**: Modern Web Dashboard with Header, Interactive Period Tabs, Metric Cards Grid, and SVG Vectors.
- **Input**: `saas_dashboard/input/index.html` & `styles.css`
- **Extracted Spec**: `saas_dashboard/extracted/design_spec.json`
- **Reference Screenshots**: `saas_dashboard/extracted/screenshots/`

### 2. Multi-Tier Fixtures (`../tests/fixtures/`)
Additional real-world workloads are available in `tests/fixtures/`:
- `s1_saas_dashboard`: Enterprise SaaS analytics dashboard with grid layouts.
- `s2_ecommerce_details`: Product details screen with sticky bottom bar and quantity stepper.
- `s3_banking_wallet`: Fintech mobile banking wallet with sensitive balance toggle.
- `s4_social_feed`: Social media profile & post feed with dynamic like animation.
- `s5_multistep_form`: Multi-step form with animated step indicators and form validation.

## Automated Example Runner

To run a complete end-to-end extraction, synthesis, and code inspection flow in a single command:

```bash
# Run on the default SaaS dashboard fixture
node examples/run_example.js

# Or provide a custom HTML file or Claude URL
node examples/run_example.js --input tests/fixtures/s3_banking_wallet/index.html --output output/banking_run
```

## Using the Slash Workflow

You can also run the full 4-agent Antigravity workflow on any example:

```bash
node skills/claude-to-compose/workflow.js --input examples/saas_dashboard/input/index.html --skip-gradle
```
