# SaaS Analytics Dashboard Example

This example demonstrates the complete end-to-end extraction and synthesis pipeline using the `SaaS Analytics Dashboard` fixture.

## Directory Structure

- `input/`:
  - `index.html`: Source HTML artifact containing dashboard header, metrics grid, interactive tabs, buttons, and SVG icons.
  - `styles.css`: CSS styles defining colors, typography, flexbox/grid layout, and responsive styles.
- `extracted/`:
  - `design_spec.json`: Machine-readable intermediate design token specification (Draft 2020-12 schema compliant).
  - `screenshots/`: Reference high-resolution viewport captures (mobile 390x844@3x and desktop 1440x900@2x).
  - `assets/`: Extracted SVG vector graphics.

## How to Run

### 1. Extract from Input HTML
```bash
node bin/claude-extract.js examples/saas_dashboard/input/index.html -o output/saas_extract --viewport both
```

### 2. Synthesize Android Jetpack Compose Code
```bash
node synthesizer/index.js --spec output/saas_extract/design_spec.json --output android/app/src/main
```

### 3. Verify Android Compilation & Previews
```bash
cd android
./gradlew compileDebugKotlin
./gradlew testDebugUnitTest
```

### 4. Or Run Automatically via Example Runner
```bash
node examples/run_example.js -i examples/saas_dashboard/input/index.html -o output/saas_dashboard_run
```
