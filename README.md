# Claude Design to Jetpack Compose

An automated developer tool and multi-agent pipeline that ingests Claude Design shareable links (`https://claude.site/...`, `https://claude.ai/share/...`) or exported HTML/CSS artifacts, extracts computed layout, typography, colors, and SVG vectors via a headless Playwright engine, and translates them into production-ready, pixel-perfect Jetpack Compose / Kotlin Android components and complete screens.

---

## Features

- **Dual Ingestion**: Accepts public Claude shareable URLs or local HTML/CSS files.
- **Client-Side Hydration Engine**: 5-phase hydration barrier that waits for dynamic React/Tailwind hydration, CSS transitions, and network idle.
- **Computed Token Extraction**: Resolves exact CSS properties into structured JSON (`design_spec.json`) conforming to JSON Schema Draft 2020-12.
- **Modular Jetpack Compose Output**:
  - **Tokens**: `Theme.kt`, `Color.kt`, `Type.kt`, `Shape.kt`, `Elevation.kt` (Material 3 compliant).
  - **Atomic Composables**: `AppButton`, `AppCard`, `AppTextField`, `AppBadge`, `AppCheckbox`, `AppRadioButton`, `AppNavigation`.
  - **Full Screen Assembly**: `ClaudeDesignScreen.kt` with state hoisting, event callbacks, and interactive `@Preview`s.
  - **Vector Graphics**: Extracted SVGs translated to both Android `ImageVector` DSL (`ClaudeIcons.kt`) and XML `VectorDrawable`s.
  - **Motion & Touch**: Native touch ripples, pressed elevations, and `AnimatedVisibility` transitions.
- **Automated Verification**: Headless preview screenshot capture (Robolectric Native Graphics), Gradle compilation verification (`./gradlew compileDebugKotlin`), and perceptual visual diffing.

---

## Architecture

```
claude_to_compose/
├── bin/
│   └── claude-extract.js          # CLI entrypoint for extraction
├── extractor/
│   ├── engine.js                  # Playwright headless browser manager
│   ├── dom_walker.js              # Computes DOM geometry, layout & tokens
│   ├── svg_parser.js              # Extracts and standardizes SVG vectors
│   ├── spec_builder.js            # Assembles design_spec.json
│   └── screenshotter.js           # Captures mobile/desktop high-res snapshots
├── synthesizer/
│   ├── index.js                   # CLI & orchestrator for Compose generation
│   ├── token_generator.js         # Generates Theme.kt, Color.kt, Type.kt, Shape.kt
│   ├── component_generator.js     # Generates modular atomic composables
│   ├── screen_generator.js        # Generates screen composable & previews
│   ├── vector_generator.js        # Generates ImageVectors & VectorDrawables
│   └── motion_generator.js        # Generates touch targets and motion tokens
└── android/
    ├── app/src/main/java/com/claude/compose/
    │   ├── theme/                 # Design tokens
    │   ├── components/            # Atomic composables
    │   ├── screen/                # Screen composable & previews
    │   ├── icons/                 # ImageVector icon definitions
    │   └── motion/                # Motion & interaction helpers
    └── build.gradle.kts           # AGP 8.10 + Kotlin 2.0.21 + Compose M3
```

---

## Quick Start

### 1. Ingest a Claude Design URL or HTML file

```bash
# Extract from a public Claude shareable URL
node bin/claude-extract.js https://claude.site/artifacts/YOUR_ARTIFACT_ID -o ./output/my_screen

# Or extract from a local HTML file
node bin/claude-extract.js ./fixtures/dashboard.html -o ./output/dashboard
```

### 2. Synthesize Jetpack Compose Code

```bash
node synthesizer/index.js --spec ./output/my_screen/design_spec.json
```

### 3. Verify Android Compilation

```bash
cd android
./gradlew compileDebugKotlin
./gradlew test
```

---

## Verification & Gating

- **Compilation**: Validated against Kotlin 2.0.21 & Jetpack Compose Material 3.
- **Perceptual Diffing**: Compares web reference screenshots against Robolectric-rendered Android screenshots.
- **Audit Rubric**: 10-point design fidelity audit (typography, colors, spacing, corner radii, elevation, vectors, state, touch targets >= 48dp, a11y, and motion).

---

## License

MIT © a12k
