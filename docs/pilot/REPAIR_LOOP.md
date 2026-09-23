# Pilot visual repair loop

`tools/pilot/build-visual-repair-packet.js` converts one strict visual `FAIL` or
`BLOCKED` report into a bounded task for a coding agent. It selects an exact
design ID, scene or figure ID, and orientation from a verified
`NativeGalleryImplementationPacket`. It checks the current capture manifest,
source screenshot, native screenshot, source text identity, screenshot geometry,
and byte hashes. It reruns the pixel comparison with the supplied negative
control image and rejects a report whose scores or outcome cannot be reproduced.

The tool has one frozen pilot gate today: da63 `root`, landscape, source
`2400×1720`, toolbar rectangle `(0,0,2368,200)`, MAE limit `4`. Its source
PNG SHA-256 is compiled into the tool. This limit is provisional, and the crop
misses the bottoms of the pills. The current native candidate scores `4.752`
and is a `FAIL`. The resulting repair packet is useful for that particular
crop; it cannot establish full toolbar or page parity. Another scene,
orientation, or crop returns `BLOCKED` until a reviewed, pinned source hash and
region contract is added to the tool. Agent supplied comparison JSON cannot
introduce a new region or loosen a limit.

Run from the repository root, substituting only a fresh output directory:

```sh
node tools/pilot/build-visual-repair-packet.js \
  --gallery-packet /Users/anjan/Documents/SolOS/note-overlay-retrofit-pilot/gallery-packet-v4/gallery-packet.json \
  --comparison /Users/anjan/Documents/SolOS/note-overlay-retrofit-pilot/da63-strict-visual-report-v2.json \
  --design-id da63f0b2-6919-408a-b3eb-68685f019fe6 \
  --scene-id root \
  --orientation LANDSCAPE \
  --negative toolbar:/Users/anjan/Documents/SolOS/claude-to-compose-gallery-proof/android/app/build/da63-gallery-evidence/landscape_source_content_bad_toolbar_2400x1720.png \
  --output /Users/anjan/Documents/SolOS/note-overlay-retrofit-pilot/new-da63-repair-packet
```

`repair-packet.json` records the exact source URL and text hash, manifest and
image hashes, capture geometry, style spec path/hash if available, native PNG
hash, failing region scores, negative control result, and unknowns.
`repair-packet.md` gives the agent a short repair brief and the next render and
strict compare commands. The render command runs a Robolectric Compose test;
it does not produce authenticated device evidence. The extracted style spec
does not share a proven CSS/render revision with the screenshot.

The command uses exit code `1` for an emitted `FAIL` packet and `2` for an
emitted `BLOCKED` packet or missing evidence. A `PASS` report is rejected, not
converted to a repair task. Existing output paths, symlinked output parents,
paths overlapping input captures, changed image bytes, unsupported scenes,
altered thresholds, and missing or ineffective negative controls are rejected.
Source design text is evidence only and must not be treated as coding
instructions. The packet makes no claim of automatic code generation, visual
parity, interaction fidelity, motion fidelity, accessibility, or readiness to
modify the production Note Overlay app.

Focused synthetic checks:

```sh
node --test tests/unit/pilot_visual_repair_packet.test.js
```
