# Build the native gallery source packet

`tools/pilot/build-gallery-packet.js` assembles the frozen Claude Design scene
inventory and a lexical Android app seam model into a JSON and Markdown packet
for coding agents. It does not generate Compose code or claim visual fidelity.

The command requires exactly four verified capture directories: one portrait
and one landscape capture for each of the two owner-supplied designs. The
ExistingAppModel must identify `PadChrome`, `PadService`, and `GlassPadView` as
UI/host symbols (filename presence alone is insufficient). The packet retains exact section/figure IDs,
source control labels, source text identity, per-scene screenshot SHA-256,
capture geometry, viewports, and local screenshot paths. The app seam is marked
high uncertainty because the model is lexical evidence, not a runtime call
graph.

Example:

```sh
node tools/pilot/build-gallery-packet.js \
  --manifest /path/to/da63-landscape \
  --manifest /path/to/da63-portrait \
  --manifest /path/to/e34f-landscape \
  --manifest /path/to/e34f-portrait \
  --app-model /path/to/ExistingAppModel.json \
  --output /path/to/new-gallery-packet
```

The output directory must not already exist and must not overlap the capture
inputs or inspected app repository. The parent directory must exist. Writes use
the repository's no-follow atomic file writer. Re-running with identical input
bytes produces the same JSON and Markdown bytes; output paths naturally reflect
the supplied local capture locations.

All native fidelity, interaction coverage, motion, accessibility/input, and
production integration gates are emitted as `BLOCKED`. Source controls are
labels, not behavior evidence. The separate hand-coded Compose gallery is not
evidence that the translator generated or faithfully reproduced the design.
Never include note text or other private content in the app model supplied to
this command.
