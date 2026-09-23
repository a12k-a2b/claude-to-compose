# Native gallery visual gate (pilot)

`tools/pilot/compare-native-reference.js` compares raw PNG pixels in named,
explicitly configured regions. It rejects dimension mismatches instead of rescaling;
each region requires a deliberately wrong negative-control image that must
score at least one MAE point worse than the candidate. A `PASS` is scoped only
to the registered static pixel regions, not the whole UI, interaction behavior,
motion, accessibility, or a real Note Overlay build. A large blank page cannot
substitute for a chrome-region comparison.

Current da63 landscape reference is the pinned `1200×900` outer viewport's
`2400×1720` iframe capture, SHA-256
`d2cf631229ff97d63e459823b5788b231851a8cc618aa2445fb4339545a45977`.
The first measured native candidate had the same dimensions, SHA-256
`2b90b442f932c08e0ab44e613b050e5d31a227da9829f15147843536fb837e57`.
The deliberately magenta toolbar negative has SHA-256
`63d4ccfde019d53b1834cf4eac27f9a87299b9db486b487dc2663da76c9dd531`.

The first pilot run configured a toolbar crop of `(x=0, y=0, width=2368,
height=200)` pixels and a provisional mean absolute RGB channel-error limit
of `4.0/255`. This is not yet an owner-approved final tolerance. Result: **FAIL**;
candidate `5.651`, negative control `54.141`. The negative control establishes
that this region metric detects that particular surface defect, not icon
shape, motion, or all possible layout errors. The JSON report is at
`/Users/anjan/Documents/SolOS/note-overlay-retrofit-pilot/da63-strict-visual-report.json`.
The previous prototype scored `16.569` on the same crop, so the repair is a
meaningful improvement but not visual acceptance. A separate article crop
worsened from `4.561` to `5.049`; it is not folded into the toolbar score.

A subsequent source-SVG import at commit `085b8a5` reduced the same landscape
top-band MAE from `5.651` to `4.752` (new native PNG SHA-256
`918275db75c78a6af8a495ca6840b2f8dfeea9d72ea4d640e7ac2c3700b1b1bf`;
deliberately magenta negative `53.259`). The pill ellipse mask improved from
`9.969` to `8.258`, while the article crop remained `5.049`. Portrait
top-band MAE is `5.766`. The 4.0 provisional landscape gate still **FAILS**,
with a second strict report at
`/Users/anjan/Documents/SolOS/note-overlay-retrofit-pilot/da63-strict-visual-report-v2.json`,
and a better toolbar does not imply full-page fidelity. The vector importer
validated all 11 captured SVGs; its `--check` and four unit tests passed, as
did the four focused da63 Android tests. None of those checks substitutes for
a native-device or motion evaluation.

To reproduce after rendering fresh same-sized native and negative PNGs:

```sh
node tools/pilot/compare-native-reference.js \
  --reference /path/to/verified-claude-reference.png \
  --candidate /path/to/native-screenshot.png \
  --negative toolbar:/path/to/deliberately-wrong-toolbar.png \
  --region toolbar:0,0,2368,200:4 \
  --output /path/to/new-visual-report.json
```

The e34f agent's exploratory MAE values used an upscaled native render against
`1640×1482` source sections and are diagnostic only; strict parity remains
`BLOCKED` until source/native image dimensions, density, state, and masks match.
`node --test tests/unit/pilot_strict_compare.test.js` passes its mismatch,
ineffective-control, and no-resize negative controls.

A packet-driven left-document-pill repair at `a1f17cc` rendered a fresh native
candidate, SHA-256
`5a3c3d9b1b66d1e9e0e30b8d5a3c93180b44a05db627dfc463d81df598995c23`.
The **same registered** landscape top-band region improved `4.751655` →
`4.040023` MAE but still **FAILS** the provisional `4.0` limit. Its deliberately
wrong toolbar scored `52.566824`. The post-hoc left-pill diagnostic improved
`10.258207` → `6.148098` MAE; the center and right pills and article region
did not improve. The strict report is at
`android/app/build/da63-gallery-evidence/repair-packet-v1-strict-report.json`;
the final integrated build produced the same candidate hash and result at
`android/app/build/da63-gallery-evidence/final-integrated-strict-report.json`.
This is evidence that the packet helped a targeted repair, not evidence that
the tool can synthesize other scenes or that the finished UI matches the
source. The registered crop still cuts off pill bottoms and lacks a sensitive
single-glyph control.

Independent Grok Build review found that the first toolbar crop ended at
`200px`, while the pills extend to about `249px`; it omitted their bottoms.
Exploratory re-scoring through `248px` produced MAE `4.092` and still fails the
same 4.0 limit. Splitting the pill bounding rectangles produced left `10.032`,
center `8.076`, and right `2.855` MAE; the first two fail the provisional 4.0
limit. These post-hoc regions are diagnostic, **not** pre-registered green
gates. The magenta negative is too coarse to prove sensitivity to a single
wrong glyph, and the comparator's caller still supplies the crop and limit.
It now rejects byte-identical reference/candidate input, closing one trivial
self-comparison false green, and rejects transparent screenshots that could
hide RGB mismatches behind alpha. An authenticated native render receipt and a
frozen scene/region contract remain required for any future PASS claim.
