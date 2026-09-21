# Project Loose Ends & Hardware Calibration Follow-ups

This document tracks potential project follow-ups, design considerations, and architectural observations where synthetic verification metrics diverge from web references, but where the divergence may represent a significant user-experience enhancement on the physical **Daylight Computer (DC1)** hardware.

---

## 1. Sol:OS LivePaper Monochrome Profile vs. Desktop RGB Rendering

### Summary & Context
- **Web Reference Display Profile**: The original Claude Design web artifacts (`claude.site`, `claude.ai/share`) are rendered inside standard desktop/mobile browsers for 24-bit RGB panels utilizing subpixel color anti-aliasing (macOS CoreText font smoothing or Windows ClearType).
- **Jetpack Compose DC1 Target**: Our Compose application targets the **Daylight Computer (DC1)** running Sol:OS, featuring an 8-bit grayscale transflective **LivePaper** panel (256 discrete levels of gray, illuminated by a pure amber frontlight, 60–120Hz refresh rate).
- **Design System Tokens**: Layouts use pre-calibrated Sol:OS monochrome tokens:
  - `--os-0`: `#FFFFFF` (Base paper)
  - `--os-50`: `#F7F7F7` (Surface panels)
  - `--os-100`: `rgba(0,0,0,0.08)` (Hairline borders)
  - `--os-400`: `#535353` (Secondary text)
  - `--os-900`: `#1A1A1A` (Primary headline ink)
  - `--os-1000`: `#000000` (Max black ink)

### Synthetic Diff Perspective ("Current Bug")
In automated programmatic visual diffing (`verification/run_diff.js` using Pixelmatch, SSIM, and Dynamic Ink IoU) against desktop browser screenshots:
- Differences in ink weight, stem thickness, and color mapping register as "mismatches" or "bugs".
- Android Skia's stem-darkening algorithm renders text in pure 8-bit grayscale density without color fringing, making the strokes appear slightly denser and darker than the airy subpixel-smoothed text on macOS Chromium.
- Subtle background tint variations between desktop web hex values (`#FAF4F2`) and Sol:OS calibrated neutrals (`--os-50` / `--os-150`) drop pixel-perfect match percentages.

### Physical Hardware Perspective ("Potential Benefit")
- **Zero Subpixel Striping**: Because the DC1 LivePaper display has no red/green/blue subpixel filters, standard RGB subpixel font smoothing causes blurry micro-fringes on transflective panels.
- **Enhanced Legibility in Ambient Sunlight**: Android's solid 8-bit grayscale density and calibrated `--os-900` ink provide vastly superior contrast, crispness, and edge definition in direct sunlight or under the warm amber frontlight.
- **Print-Like Aesthetics**: The denser ink delivers a tactile, book-like reading quality that feels intentional and tailored to the hardware, rather than an unadapted web port.

### Planned Follow-up Action
- When hardware testing on connected DC1 tablets (`rooted 3` / `rooted 4`) via the `daylight-qa` skill:
  1. Capture live screen frames and high-contrast ambient photos using `daylight_capture_screen`.
  2. Perform user readability tests comparing exact 1:1 web RGB color mapping vs. native Sol:OS grayscale tokens.
  3. Validate whether the denser Compose rendering is preferred by readers over the lighter web rendering.

---

## 2. Headline Font Family: Web Fallback (Sans-Serif) vs. CSS System Intention (Flared Serif)

### Summary & Context
In `E34fDesignScreen.kt`, the headline **"A sheet of glass"** exhibits an architectural duality:
1. **Option 1: Match the Visual Screenshot (Sans-Serif)**
   - Uses `AbcArizonaSans`.
   - Matches the actual pixels rendered in the web browser screenshot because the webfont asset for `ABC Arizona Flare` was missing in the browser environment, quietly falling back to `ABC Arizona Sans`.
2. **Option 2: Honor the CSS Token Spec (Flared Serif)**
   - Uses `AbcArizonaFlareHeadline` with variable optical size `opsz: 48f`.
   - Loyally honors the designer's declared CSS font family (`font-family: 'ABC Arizona Flare', 'ABC Arizona Sans', sans-serif`).

Both options are maintained in the test harness and preview system with visual side-by-side artifacts for stakeholder evaluation.
