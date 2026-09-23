# Note Overlay native proof gallery — source matrix

This is a **standalone Android proof**, not a Note Overlay retrofit. The owner
has not chosen a final direction. The production app at
`a12k-a2b/note-overlay` stays untouched until native visual and interaction
evidence is reviewed and a direction is chosen. The clean app baseline for a
later, disposable design branch is `8807a760aaf8de0bcc228ba3f87768d9c4cab6e4`.

## Reference identity and what is being compared

- `da63` — [single floating-toolbar overlay](https://claude.ai/code/artifact/da63f0b2-6919-408a-b3eb-68685f019fe6). The Meridian article is **synthetic context beneath the overlay**; it must not be grafted into Note Overlay. Native chrome, ruled glass, controls, and interaction states are the product target.
- `e34f` — [exploration gallery](https://claude.ai/code/artifact/e34f4387-f506-4de5-bced-ef318d7f8bdf), not one chosen design. It contains 35 named sections and at least 33 figure sub-scenes. The source text hash across the captured desktop and 4:3 viewports is `ed3c4347330f5e1b876ec08d62f50fef413924e5d4af1a235337a8af604f2d7d`.
- Geometry-verified reference captures live in `scene-captures-da63-1200x900-v2`, `scene-captures-da63-900x1200-v2`, `scene-captures-e34f-1200x900-v3`, and `scene-captures-e34f-900x1200-v3` under `/Users/anjan/Documents/SolOS/note-overlay-retrofit-pilot/`. Each e34f manifest has 35 section and 33 figure screenshots (68 static captures, **not** 68 distinct design directions). Each capture is taken independently from the live DOM element; it is not a crop of a full-page screenshot. The manifest records the outer browser viewport, inner artifact viewport, element rectangle and scroll offset, actual pixel dimensions, source-text identity, and PNG SHA-256. `tools/pilot/verify-scene-captures.js` checks those facts against frozen source IDs and figure counts. Earlier capture folders remain as historical evidence but fail the current geometry/source verifier. These are static **web** references, not proof of native fidelity or motion.

## Native gallery coverage inventory

| Family | Source IDs | Native proof states required |
| --- | --- | --- |
| Floating three-pill overlay | `da63/root` | Synthetic article underneath, ruled glass, three toolbar clusters, selected pen/highlighter/eraser, notebook picker, opacity, history, overflow; portrait and landscape. |
| Docked toolbar band | `6`, `6a`, `6b`, `6c`, `6d` | Paper shelf, frosted-pill shelf, raised shelf, dark ledger band; held tool and page seam. |
| Continuous frosted plate | `1a`, `1b`, `tb`, `2a` | Day and Night at 42/79/100% glass over distinct backgrounds; anatomy including High Contrast; sun-bloom expanded/collapsed. Source figures: 3 + 3 + 2. |
| Floating slips | `3a`, `3b`, `3c` | Day/Night, article and opaque paper, pen card open, tool dial open; source figures: 2 + 2 + 2. |
| Loose-coin family | `4`, `4a`, `4b`, `4c` | Loose coins, one capsule, side rail, with selection and accessible targets. |
| Rotation stress test | `5` | Six source figure permutations across portrait/landscape, including band, slips, capsule, rail, dial. |
| Beyond the bar | `explore`, `g1`–`g6` | Gesture grammar, glass interaction, ink/nib, selection→action, pages/navigation, empty page→first stroke. Static captures alone do not prove behavior. |
| Mildliner | `mild`, `m0`–`m4` | Tool distinction, day/night marking, size card, highlights list, timed jump flash. |
| Shared system | `presets`, `cards`, `snip`, `small`, `onboard` | Preset row, long-press/reorder, popup cards, snip controls, small controls, onboarding/settings. |

The ID inventory is taken from the actual captured DOM hierarchy, not from the
old opening-screen-only `E34fDesignScreen`. A source section may contain
multiple figures or interactive states; implementing its heading alone does
not satisfy that row. The `capture-manifest.json` records every static figure
found under each section and its image hash.

## Acceptance rules

1. The gallery APK must let a person navigate to every listed direction and
   figure variant. Interactive examples must have working native state
   transitions, not just painted labels. Missing motion is `BLOCKED`, not a
   static-screenshot `PASS`.
2. Compare web/native renders at the same content dimensions, density,
   orientation, state, theme, and synthetic background. Report whole-frame
   and chrome-region metrics separately. A high overall similarity caused by
   blank paper must not hide a wrong toolbar. Retain images and pixel-diff
   overlays for every claimed comparison.
3. Pre-register at least one visible negative control per comparison family,
   such as a deliberately wrong toolbar surface or icon placement, and show
   that the relevant metric fails. If the negative control improves the score,
   the metric is not yet valid for that claim.
4. Accessibility semantics, target sizes, and input behavior need native
   checks. Motion needs timestamped state captures and reduced-motion cases;
   a final static frame cannot prove timing or first-stroke behavior.
5. A native gallery `PASS` never implies the production Note Overlay has been
   restyled. Later integration must preserve its Java/custom-view ink path,
   coordinate transform, writer lease, save guard, and real-note isolation.
   Only a separately identified `codex/` design branch may host that trial.

The v1 app inspector now emits lexical candidates for Note Overlay's Java
`PadChrome`, `PadService`, and `GlassPadView` seam. Runtime reachability and
native graft safety are still unverified. Neither the existing 100%-passing
synthetic suite nor the gallery's opening screen is a substitute for these
acceptance rules.
