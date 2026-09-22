# Design Retrofit v1 Manager State

## Mission

Build and push a first locally testable v1 that helps Codex, Claude Code, or another coding harness restyle an existing Android app from Claude Design evidence while preserving the app's functionality. The v1 must fail closed and produce a reviewable design/app contract and agent packet; it must not claim a real Note Overlay retrofit before the owner supplies and selects the Claude Design artifacts.

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

Complete — the bounded first testable v1 is published on `codex/design-retrofit-v1`. The next phase is the deferred real Note Overlay pilot after the owner supplies the selected source revision and Claude Design links.

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

Select a small Note Overlay state matrix, freeze the exact app revision and design captures, then execute the published workflow against real Android build, behavior, native-render, and comparison evidence. Do not promote synthetic fixture replay into project or DC-1 acceptance.

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
