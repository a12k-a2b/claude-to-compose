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
The native candidate is the same dimensions, SHA-256
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
