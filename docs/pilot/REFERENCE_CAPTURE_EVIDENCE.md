# Pilot reference-capture evidence

Outcome: **PASS for static source inventory and capture integrity only.** Native
fidelity, controls, interaction timing, and the real app retrofit are **BLOCKED**
until their own evidence exists. Captures are local and deliberately not checked
into this source branch. Re-run the supplied-artifact capture command to make
new evidence; a changed Claude source-text digest stops the capture.

The capture tool photographed each live DOM section and figure independently,
with animations disabled. It recorded actual element bounds and PNG dimensions,
the outer browser viewport and inner artifact viewport, scroll offsets, source
text SHA-256, and image SHA-256. The verifier checks the complete frozen ID and
figure inventory as well as geometry and image bytes. The outer viewport is
4:3; the inner artifact is shorter because Claude's page header occupies 40 CSS
pixels. A reference screenshot is not a native screenshot.

| Local folder below `/Users/anjan/Documents/SolOS/note-overlay-retrofit-pilot/` | Result | Manifest SHA-256 |
| --- | --- | --- |
| `scene-captures-da63-1200x900-v2` | 1 root, 1200×900 at 2×; verifier exit 0 | `baa273643f43e4594b362072f9f3067e71de8a87ea1c61f44ff7705a1e27b221` |
| `scene-captures-da63-900x1200-v2` | 1 root, 900×1200 at 2×; verifier exit 0 | `78dd6e2f296c1dfcb8f0c16e362174d3fb159e699a1f22a131c07650009d87e1` |
| `scene-captures-e34f-1200x900-v3` | 35 sections + 33 figures, 1200×900 at 2×; verifier exit 0 | `b4cc6cc41391f21bdd024fc1f693d6d2cf5ffe322015941fa586be3c4852938b` |
| `scene-captures-e34f-900x1200-v3` | 35 sections + 33 figures, 900×1200 at 2×; verifier exit 0 | `9e10e3d33c7b48d0aa802e67c2bcd5d03fab42527799ec11eede27f31d67ddeb` |

The `da63` source-text SHA-256 is
`cc3731bf6f0378e66011f209f0caeda86e541aaea3abbb3617ae075514ab6b93`;
the `e34f` source-text SHA-256 is
`ed3c4347330f5e1b876ec08d62f50fef413924e5d4af1a235337a8af604f2d7d`.
`node --test tests/unit/pilot_capture_scenes.test.js` passed 5/5, including a
tampered-image negative control and changed-source-identity control.

Source IDs in `e34f` are 35 editorial sections and 33 nested figure views.
They are an exact capture inventory, not 68 separate native designs or proof
that a web interaction works. Dynamic states must be characterized separately.
