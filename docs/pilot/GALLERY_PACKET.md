# Build the native gallery source packet

`tools/pilot/build-gallery-packet.js` assembles the frozen Claude Design scene
inventory and a lexical Android app seam model into a JSON and Markdown packet
for coding agents. It does not generate Compose code or claim visual fidelity.

The command requires exactly four verified capture directories: one portrait
and one landscape capture for each of the two owner-supplied designs. The
builder also checks that each design has the same source text SHA, scene IDs,
section IDs, figure counts, and control labels in both orientations. Optional
`--design-spec` inputs must be supplied as a pair, one for each design, and
must identify the corresponding owner-supplied Claude artifact URL. Their
local files must be regular, and referenced vector/font assets cannot escape
the spec directory. Duplicate, wrong-source, or unsafe specs fail closed.

The ExistingAppModel must identify `PadChrome`, `PadService`, and
`GlassPadView` as UI/host symbols (filename presence alone is insufficient).
The packet retains exact section/figure IDs, source control labels, source
text identity, per-scene screenshot SHA-256, capture geometry, viewports, and
local screenshot paths. The app seam is marked high uncertainty because the
model is lexical evidence, not a runtime call graph.

Example:

```sh
node tools/pilot/build-gallery-packet.js \
  --manifest /path/to/da63-landscape \
  --manifest /path/to/da63-portrait \
  --manifest /path/to/e34f-landscape \
  --manifest /path/to/e34f-portrait \
  --design-spec /path/to/da63/design_spec.json \
  --design-spec /path/to/e34f/design_spec.json \
  --app-model /path/to/ExistingAppModel.json \
  --output /path/to/new-gallery-packet
```

The output directory must not already exist and must not overlap the capture
inputs or inspected app repository. The parent directory must exist. Writes use
the repository's no-follow atomic file writer. Re-running with identical input
bytes produces the same JSON and Markdown bytes; output paths naturally reflect
the supplied local capture locations.

When specs are supplied, the JSON packet records their paths, SHA-256 hashes,
extractor provenance, observed computed node font families/sizes and colors,
theme summary, and vector/font asset availability with content hashes. The
Markdown packet reports the compact highlights. The extracted theme can have
inferred defaults; it is not the CSS truth for every scene. Bundled font file
names are not reliably mapped to observed CSS family names. The specs have no
source-text or rendered-pixel hash tying them to the capture manifests, so the
packet marks the spec-to-capture revision match `UNVERIFIED`. A future capture
should record a shared source and style identity before treating these as one
locked reference.

A coding-agent probe on e34f `g1`/`g3` found another limit: the packet has
their IDs, headings, capture geometry/hashes, and style summaries, but its
control arrays are empty and it does not contain full per-node section text or
layout. The agent still needed the pinned PNGs, capture manifest, a narrow
design-spec excerpt, and nearby Compose conventions to author those studies.
That is source-grounded manual implementation, not packet-to-code synthesis.

All native fidelity, interaction coverage, motion, accessibility/input, and
production integration gates are emitted as `BLOCKED`. Source controls are
labels, not behavior evidence. The separate hand-coded Compose gallery is not
evidence that the translator generated or faithfully reproduced the design.
`sourceInventory: PASS` means the static manifests verified and the two
orientations agree on scene inventory. It makes no visual parity claim.
Never include note text or other private content in the app model supplied to
this command.
