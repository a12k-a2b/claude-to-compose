# Node Lowering Mapping Report (Deliverable 2)

**Execution Date**: 2026-09-22T09:51:40.356Z  
**Total Lowered Nodes**: 10  

| Source ID | Category | Strategy | Target Composable | Lowering Status |
| :--- | :--- | :--- | :--- | :--- |
| `daylight#onboarding/frames` | canvas | fidelity-first | `Canvas` | **EXACT** |
| `daylight#onboarding/nav/skip` | button | native-first | `Surface(shape = CircleShape) / Button` | **EXACT** |
| `daylight#onboarding/hero/illustration` | canvas | fidelity-first | `Canvas` | **EXACT** |
| `daylight#onboarding/hero/compass` | canvas | fidelity-first | `CompassRoseGraphic` | **EXACT** |
| `daylight#onboarding/hero/brand_glyph` | image | native-first | `Image` | **EXACT** |
| `daylight#onboarding/typography/kicker` | text | native-first | `Text` | **EXACT** |
| `daylight#onboarding/typography/headline` | text | native-first | `Text` | **EXACT** |
| `daylight#onboarding/typography/subtitle` | text | native-first | `Text` | **EXACT** |
| `daylight#onboarding/action/get_started` | button | native-first | `Surface(shape = CircleShape) / Button` | **EXACT** |
| `daylight#onboarding/chips/container` | chip_group | native-first | `Column / DaylightChip (Surface)` | **EXACT** |

## Lowering Strategy Breakdown

- **Native-First (Accessible UI components)**: 7 elements (70.0%)
- **Fidelity-First (Canvas & Vector drawing)**: 3 elements (30.0%)
