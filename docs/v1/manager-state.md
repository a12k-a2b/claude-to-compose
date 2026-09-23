# Design Retrofit v1 Manager State

## Mission

Build and push a first locally testable v1 that helps Codex, Claude Code, or another coding harness restyle an existing Android app from Claude Design evidence while preserving the app's functionality. The v1 must fail closed and produce a reviewable design/app contract and agent packet. The owner has supplied two Claude Design artifacts as proof cases but has not selected a final direction; no real Note Overlay retrofit is claimed before visual validation and that choice.

## Starting state

- Repository: `https://github.com/a12k-a2b/claude-to-compose.git`
- Starting revision: `83bd5d7f1b36f9a71941f494ddfbd0eba7344120`
- Delivery branch: `codex/design-retrofit-v1`
- Existing uncommitted foundation work is intentional and must be preserved.
- Root Daylight quality contract applies.
- Owner has authorized source-relevant use of configured Grok Build and Claude Code Max CLI routes, excluding credentials, signing keys, real notes/customer data, account exports, and unrelated private material.

## Roles

- Manager: root Codex agent; owns phases, checklist, evidence review, integration, commit, and push.
- Architecture keeper: Astra medium; owns scope integrity and phase acceptance advice, read-only unless reassigned.
- Primary implementer: Sol; owns the active production surface for each dispatched phase.
- Independent reviewer/test designer: Luna; read-only review first, then bounded non-overlapping tasks.
- External builder/reviewer: Grok Build CLI; receives only task-relevant source and synthetic evidence.

## Definition of done for v1

1. A local CLI can diagnose prerequisites and initialize a retrofit workspace.
2. It can inspect a real Android repository without mutation and emit a versioned app model with provenance and uncertainty.
3. It can combine that model with an extracted design spec to emit a versioned retrofit contract and agent implementation packet.
4. Verification uses fail-closed PASS/FAIL/BLOCKED outcomes and provides structured defects.
5. Synthetic fixtures and negative controls prove the workflow.
6. Documentation supports a clean-clone local test.
7. Astra, Luna, Grok Build, and the manager review the integrated candidate.
8. The dedicated branch is committed and pushed to GitHub.

## Active phase

The bounded first testable v1 is published on `codex/design-retrofit-v1`. Owner correction on 2026-09-23: the two supplied Claude links are a proving ground, not authorization to choose one and immediately restyle the production app. Build a separate native Android gallery that reproduces every distinct direction and relevant UX state, validate its renders and interactions, let the owner compare directions, and only then graft a chosen design onto Note Overlay. The production app remains untouched until that gate. Work is on `codex/design-gallery-proof` in `/Users/anjan/Documents/SolOS/claude-to-compose-gallery-proof`, starting from `676b3d07a5c078ff7f5861409c760d240a118e12`.

P6-01 static reference inventory passed narrowly: both supplied artifacts have source-hash-pinned, geometry-verified captures in both 4:3 outer orientations. This does not prove motion, native fidelity, or 68 distinct directions. P7-01 da63 is a functional native proof but still fails visual parity after a source-SVG and packet-driven left-pill repair; the latest frozen toolbar region is 4.040 MAE against a provisional 4.0 limit. The e34f gallery routes native synthetic studies for 31 of 35 sections (all figure-bearing sections); four editorial headings remain visibly BLOCKED. Astra kept P7-02 and P7-03 RUNNING because source/native reference contexts and some behavior are not verified. P8-02 requires repeatable packet-to-native handoff; one packet-first da63 repair improved the named region but failed parity, and the g1/g3 agent still needed source images/spec context. The clean, read-only Note Overlay baseline is `/Users/anjan/Documents/SolOS/note-overlay-design-pilot` at `8807a760aaf8de0bcc228ba3f87768d9c4cab6e4`; captures and app lexical model are under `/Users/anjan/Documents/SolOS/note-overlay-retrofit-pilot/`. The inspector recognizes Java-built `PadChrome`, `PadService`, and `GlassPadView` as lexical UI/host clues, with runtime reachability still unresolved.

## Explicit exclusions

- No Railway or hosted dependency.
- No universal DOM/CSS/JavaScript compiler claim.
- No production account mutation or deployment.
- No real user note content in fixtures or packets.
- No claim that Note Overlay has been redesigned before its approved design links and source revision are selected.
- No physical DC-1 PASS without actual hardware evidence.

## Evidence locations

- Checklist: `docs/v1/checklist.json`
- Progress page: `docs/v1/progress.html`
- Architecture plan: `docs/END_TO_END_PROJECT_PLAN.md`
- Existing gap analysis: `docs/ARCHITECTURE_GAP_ANALYSIS.md`
- Phase evidence: `docs/v1/evidence/`

## Next action

Finish the focused popup, pulse, and six-gesture corrections; rerun the full Android suite and pin the exact APK hash. Publish the gallery as an explicitly incomplete proof once that build passes. Next, freeze source CSS/font/state identity with native render receipts, compare exact scene-sized pairs with glyph-sensitive controls, and reuse a packet-first repair on a second scene. Keep fidelity and UX verdicts FAIL/BLOCKED until those checks pass. Do not promote synthetic fixture replay into project or DC-1 acceptance, and do not change Note Overlay before the native gallery has been validated and a direction selected.

## Review log

- P1-01 revision 1: Sol's isolated schema suite passed 8/8, but Astra rejected the boundary because a blocked run could be forced to invent an artifact hash, the result could choose an incomplete requirement set, and evidence lacked typed scenario/configuration identity. P1 remains `RUNNING`; no acceptance credit was awarded.
- P1-01 revision 2: Sol closed all three findings and added adversarial controls; the isolated suite passed 13/13. Astra and Luna independently returned `PASS` for the P1 contract boundary. Manager accepted P1 at `2026-09-22T16:31:59Z`; production semantic validation remains P4.
- P2-01 revision 1: Sol's combined isolated suite passed 20/20, but Astra, Luna, Grok Build, and the manager rejected it. Configured Git helpers could execute, untracked symlinks could read outside the repository, a workspace output symlink could escape, authenticated remotes could leak secrets, and constructor parameters could be misclassified as supertypes. P2 remains `RUNNING`; no acceptance credit was awarded.
- P2-01 revision 2: Sol closed every revision-1 defect and added hostile Git-config, symlink, special-file, remote-sanitization, constructor, and schema-backed build-clue controls. The combined manager suite passed 24/24; Astra and Luna independently returned `PASS`. Manager accepted P2 at `2026-09-22T17:15:37Z`. Grok Build's follow-up process re-read the fixes but exhausted its session turn/bootstrap limit before a final second verdict; its revision-1 findings are nevertheless covered by explicit regression tests.
- P3-01 revision 1: Sol's combined focused suite passed 34/34, but Astra, Luna, and the manager rejected it. Outputs could overwrite pinned inputs, ignored captured source files could become stale without changing Git provenance, and unrelated manifest/approval IDs could satisfy evidence references. P3 remained `RUNNING`; no acceptance credit was awarded.
- P3-01 revision 2: Sol added protected-output collision checks, raw source-evidence revalidation, exact location/evidence and mapping/action subject linkage, typed evidence namespaces, deterministic packet completeness, and corresponding adversarial tests. The manager suite passed 37/37; Astra and Luna independently returned `PASS`. Manager accepted P3 at `2026-09-22T18:01:05Z`. Stable source IDs are intentionally shared across responsive viewport scenes and are not treated as duplicate semantic elements.
- P4-01 revisions 1–2: Sol implemented the production semantic verifier and candidate-worktree binding. Astra and Luna found false-green paths involving forged namespaces, subject provenance, ratio ranges, omitted candidate changes, and blocker linkage; explicit negative controls were added for each. The resulting focused suite passed 26/26, but Astra found one final tracked/untracked source-symlink provenance gap.
- P4-01 revision 3: Sol added no-follow source-sensitive symlink preflight for both baseline and candidate plus tracked-file and untracked-directory regression controls. The focused suite passed 27/27. Astra independently reran the suite and returned `PASS`; Luna additionally tested ignored broken source links in both baseline and candidate and returned final `PASS`. Manager accepted P4 at `2026-09-22T19:01:01Z`. The acceptance is only for fail-closed semantic evaluation of supplied evidence, not for Android behavior, visual fidelity, DC-1 hardware, or release readiness.
- P4-01 revision 4: Grok Build found that ignored files beneath source descendants literally named `build` or `.gradle` could be filtered out before the changed-path comparison. Sol changed the filter to use segment order and added ignored Kotlin/asset omission controls beneath both names while retaining generated-root exclusion. Grok, Astra, and Luna each returned targeted `PASS`; the final integrated v1 suite passed 64/64.
- P5-01: The clean-clone quickstart, aggregate v1 command, package metadata, evidence-containment instructions, and local-first deployment boundary were audited. The final v1 gate passed 64/64, fidelity foundations passed 30/30, doctor and package dry-run passed, and all requested independent reviewers returned PASS. The broader legacy unit suite remained 315/324 because of one sandbox listener restriction and absent historical `output/test_da63` artifacts; those were recorded as blockers, not green. Implementation revision `68b583684f78b1e40d4d076f16c78a93fe0a2c74` was pushed to `codex/design-retrofit-v1`, and P5 was accepted at `2026-09-22T19:31:16Z`.
- P6-01: A Luna audit found that 35 sections plus 33 figures are not 68 separate directions and that early screenshot manifests lacked element geometry; P6 stayed RUNNING. The manager added exact frozen source identities/ID counts, element rectangles and scroll offsets, pixel/hash verification, and source-change/tampered-image negative controls. Four refreshed manifests now pass verification: da63 landscape/portrait (1 root each), e34f landscape/portrait (35 sections plus 33 figures each). The focused capture suite passed 5/5. P6 was accepted for **static source inventory only** at `2026-09-23T06:54:29Z`; motion and native correspondence remain P7/P8 blockers.
- P7-01 revision 1: The da63 gallery build and 14 unit tests passed, but an independent screenshot inspection found toolbar footprint, icon, and synthetic article mismatches. A selected-icon negative control improved the old metric and was invalid; a backdrop control worsened a narrower chrome metric. No native visual acceptance credit was awarded; Sol is repairing the screen against the pinned capture.
- P6-02: A Luna implementer built a deterministic gallery evidence packet from four verified manifests and the real Note Overlay lexical model. Manager required actual UI/host symbols rather than filename-only seam hits and used the now-verified e34f v3 captures. Two real runs produced byte-identical JSON and Markdown: 69 source capture IDs, PadChrome/PadService/GlassPadView candidates, all native/UX/production gates BLOCKED. Packet unit tests passed 4/4. P6-02 accepted as an evidence handoff, **not** a code generator or native-fidelity proof.
- P7-01 revision 2: Sol aligned the three floating pills and synthetic context against the source-sized web capture. The landscape top-band MAE improved 16.569→5.651; a wrong-magenta-toolbar control scored 54.141. Portrait top-band improved 21.034→6.459. The article-region score worsened 4.561→5.049. The integrated gallery build and all 18 unit tests passed at `b9050c1`; P7-01 was accepted narrowly as a functional native prototype. P8's visual parity remains FAIL. E34f currently implements only four docked variants, with all other scene IDs explicitly BLOCKED.
- P7-01 revision 3: Sol imported 11 source SVGs as native Canvas vectors with fail-closed importer checks (four Python tests and `--check` pass). Four da63 Android tests pass. Landscape top-band MAE improved 5.651→4.752, still above the provisional 4.0 limit; the wrong-toolbar control scored 53.259. Portrait top-band is 5.766, and article layout remains mismatched. P8 remains FAIL; no production graft.
- P7-02 glass slice: Sol added native 1a/1b/tb/2a component studies with eight figure captures and three passing focused Android tests. Upscaled source/native comparisons score 12–19 MAE over full glass figures and 20–28 in chrome regions; they are diagnostic and visually fail. No strict same-render-scale parity or motion acceptance was awarded.
- Astra's gallery architecture audit found three false-success risks: the packet has not been proven to produce native code repeatably, source text/IDs do not lock CSS/font/motion (43 of 68 e34f recapture PNGs matched exactly), and journey tests can pass while runtime clock and selection actions are inert. P8-02 was added as an explicit packet-first generalization gate. The proposed smallest proof is one scene implemented by a fresh agent from the packet with captured repairs, then a controlled second change using the same loop.
- P8-02 first repair iteration: A fresh Sol agent consumed the fail-closed da63 repair packet first, inspected only its named native screen plus a narrow style excerpt, and changed the document pill. A focused native render passed. The registered top-band MAE improved 4.751655→4.040023 against a provisional 4.0 limit, so the visual result remains **FAIL**; the deliberate wrong toolbar scored 52.566824. The later g1/g3 agent needed source PNGs, manifest, design-spec text, and local Compose conventions because packet control arrays were empty. Since that agent had seen screenshots before the packet, this is not a second packet-first repeatability proof. P8-02 remains RUNNING.
- P7-02/P7-03 integrated coverage audit: Astra independently verified 35 e34f sections and 33 figures in both capture manifests; the router dispatches native synthetic studies for 31 sections, including all figure-bearing sections, while four editorial headings display BLOCKED. It kept both P7 tasks RUNNING because matching web/native render context is absent and some source behaviors are not implemented. It found inert popup labels, zero-width-risk popup choices, and a pulse that stayed on. A bounded Sol repair gave all eight size/shade choices real selected hit targets, Glass/Peek/Snap explicit synthetic effects, and a controlled-clock returning pulse; eight focused tests passed. Another Sol repair corrected g1 to all six captured gestures; four focused tests passed. Neither repair proves source motion, ink physics, or device input.
