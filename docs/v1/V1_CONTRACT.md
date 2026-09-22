# Retrofit artifact contract v1

## Purpose and boundary

Retrofit v1 is a local, agent-assisted contract for restyling an existing Android application from captured design evidence without silently replacing existing behavior. Its artifacts make inputs, mappings, preservation obligations, capability limits, and verification evidence reviewable. They do not turn lexical source inspection into semantic program understanding, prove an action executes at runtime, or prove visual fidelity merely by validating JSON.

The v1 schemas use JSON Schema Draft 2020-12 and live in `schemas/v1/`:

- `ExistingAppModel` records repository/revision provenance, modules, lexically observed UI symbols, state/action clues, heuristic build-command clues, tests, and unresolved uncertainty.
- `RetrofitContract` maps stable design identities to observed existing UI symbols and actions, declares behavior-preservation obligations, classifies implementation capability, and bounds agent edits.
- `VerificationResult` records one fail-closed `PASS`, `FAIL`, or `BLOCKED` decision with named requirements, evidence completeness, defects, and blockers.

Every artifact has the common envelope fields `kind`, `schemaVersion`, `id`, `createdAt`, `producer`, and `inputs`. Every input carries an identity, kind, path, and SHA-256 hash. The artifact-specific `claimScope` is fixed by its schema.

## Artifact relationships

```text
repository inputs ──> ExistingAppModel
                          │ lexical symbol/action refs + hash
design evidence ──────────┼──────────────> RetrofitContract
                          │                  │ mappings + obligations + hash
baseline evidence ────────┼──────────────────┼────> VerificationResult
candidate evidence ───────┘                  └────> PASS | FAIL | BLOCKED
```

`RetrofitContract.sources.existingAppModel` and `.designEvidence` pin the source artifact identity, version, path, and digest. Its element mappings reference a captured design identity and an existing UI-symbol identity. An action binding may be either:

- `VERIFIED_EXISTING`, with a non-placeholder `existingActionRef` supported by evidence; or
- `OWNER_APPROVED_NEW_BEHAVIOR`, with both a concrete behavior statement and an owner-approval reference.

The word “verified” in `VERIFIED_EXISTING` means that the contract author resolved the reference against the supplied model and evidence. Schema validation alone cannot perform that resolution. A later semantic validation stage must still reject a dangling reference.

Preservation obligations remain `REQUIRED` unless an explicit `OWNER_APPROVED_CHANGE` includes an approval reference. Every observed design feature receives one capability classification: `EXACT_NATIVE`, `BOUNDED_APPROXIMATION`, `ASSET_FALLBACK`, `AGENT_IMPLEMENTATION_REQUIRED`, `UNSUPPORTED_BLOCKING`, or `INTENTIONAL_DEVIATION`. Approximation requires a declared budget; intentional deviation requires owner approval. Unsupported blocking work prevents project acceptance.

### Frozen acceptance matrix

Acceptance is defined upstream in `RetrofitContract.acceptanceMatrix`, not inferred after implementation. Each requirement declares:

- a stable requirement ID and description;
- one or more domains such as build, behavior, render, semantics, or performance;
- every required scene/scenario/state combination;
- the exact viewport, device profile, build variant, locale, theme, font scale, orientation, and reduced-motion configuration for each context;
- zero or more typed numeric budgets, including metric, comparison operator, threshold, and unit; and
- evidence supporting why the requirement exists.

The canonical requirements array is hashed using JCS RFC 8785 and the digest is stored as `requirementsSha256`. `VerificationResult.subject.acceptanceMatrixSha256` pins that digest. Verification requirement records reference contract requirement IDs, and their context results reference contract context IDs. A semantic validator must recalculate the matrix digest and require exact set equality: no required requirement or context may disappear, no extra item may silently broaden a PASS, and every declared domain/context must have the required baseline and candidate evidence. Array order is not semantic.

Implementation boundaries are normalized repository-relative directory paths, not repository root, parent traversal, absolute paths, or glob expressions. Owner-approval references must resolve to hashed `OWNER_APPROVAL` inputs whose recorded scope covers the exact new behavior, changed obligation, or intentional deviation. Merely supplying a syntactically valid approval-like ID is insufficient.

## Existing-app evidence semantics

`ExistingAppModel.claimScope` is always `LEXICAL_EVIDENCE_WITH_UNCERTAINTY`. Its source locations, confidence values, evidence references, and uncertainty records describe what inspection observed. They do not claim whole-program call-graph resolution, runtime dispatch correctness, or complete behavior discovery. A real preservation claim requires characterization or device/runtime evidence in a later verification result.

Inspection provenance includes the exact Git commit, dirty-tree digest when applicable, commands, files read, and retained evidence hashes. `mutatedRepository` is fixed to `false`; a mutating analyzer output is invalid as an `ExistingAppModel` v1.

`buildCommandClues` are evidence-backed candidates derived only from literal module-plugin and build-type text. Their status is always `HEURISTIC_NOT_EXECUTED`; they do not claim the Gradle task exists, resolves, or succeeds. Each emitted candidate therefore carries confidence below one and a high-impact uncertainty requiring later Gradle-model resolution and authorized execution.

## Verification semantics

The inspected baseline checkout is immutable verification input. Semantic verification rebuilds the RetrofitContract against that checkout, so any Git-state or captured-source mutation makes verification invalid. Project-candidate verification requires a clean, committed inspected baseline plus `--candidate <separate-git-worktree>` sharing the baseline Git common directory and descending from the inspected commit. Dirty inspected baselines are limited to fixture replay in v1 because a new worktree cannot materialize their uncommitted bytes. The verifier derives the candidate's actual revision, dirty digest, source-snapshot digest, and committed/dirty/untracked path inventory relative to the baseline commit. It also raw-hashes ignored files under real `src/` segments (including code, assets, fonts, and images) plus ignored Gradle configuration. Generated `build` and `.gradle` roots are excluded only when they occur before any `src` segment; same-named directories below a real source set remain evidence-bearing. Source-sensitive symlinks are invalid. The BUILD receipt must match that inventory exactly. Candidate changes do not alter the baseline, and every derived changed path must remain within the contract implementation boundary. Fixture replay may omit `--candidate` but cannot be promoted to project or release acceptance.

Outcomes are fail-closed:

- `PASS`: every named requirement passes; all required evidence is present and valid; there are no defects or blockers; and baseline plus candidate coverage exists for build, behavior, and render domains.
- `FAIL`: the evidence ran and proves at least one requirement failed. At least one structured defect and failed-requirement count are required.
- `BLOCKED`: a required claim cannot be evaluated because evidence, capability, infrastructure, hardware, credentials, or another prerequisite is unavailable or invalid. At least one structured blocker and blocked-requirement count are required.

A passing artifact must name `subject.buildArtifactSha256` and contain required, present baseline and candidate evidence for all three of build, behavior, and render. A truthful pre-build `BLOCKED` result may omit that hash and all candidate artifact, behavior, and render records; it must not invent an artifact digest or capture timestamp. `capturedAt` and the content hash are required only when an evidence record is `PRESENT` and are prohibited for missing, invalid, or not-run evidence.

Evidence identity is typed rather than hidden in a free-form details object. Every record names its scene, scenario, state, viewport, device profile, full configuration, producer/runtime, source snapshot hash, and—when captured from a baseline or candidate artifact—the subject artifact hash.

Each evidence record also carries a `pairId`. For a comparison pair, baseline and candidate must have the same pair ID, domain, scene, scenario, state, viewport, device profile, configuration, and producer/runtime. Their source snapshot and subject artifact hashes may differ and are validated independently: the candidate evidence artifact hash must equal `VerificationResult.subject.buildArtifactSha256`; baseline evidence must resolve to the declared baseline input. Comparison evidence must identify both resolved members. A stale artifact, changed locale, viewport, runtime, scenario, or other context is invalid input, not a visual or behavioral failure.

Synthetic acceptance evidence must set `verificationScope.kind` to the immutable value `fixture-replay` and name its `fixtureId`. Such a PASS proves only replay of that fixture; it is never project, release, live-device, or Note Overlay acceptance. A real candidate uses `project-candidate` and remains subject to the named repository revision, artifact hash, build variant, device profile, and requirements.

## Validation layers

Parsing and schema validation are necessary but insufficient:

1. JSON parsing rejects non-JSON values. Metric fields are finite JSON numbers; `NaN` and infinities are invalid.
2. Draft 2020-12 schema validation rejects unknown v1 versions, missing envelope/provenance/evidence fields, placeholder action references, unsupported outcome values, and internally invalid PASS declarations.
3. Semantic validation is mandatory before any `PASS`. It must reject:
   - duplicate IDs in every identity namespace and all dangling requirement, context, evidence, symbol, action, approval, subject, and input references;
   - a missing source file, a non-file source, path escape, or any source/input/evidence file whose calculated SHA-256 differs from its declared hash;
   - a matrix digest mismatch, missing or extra contract requirement, missing or extra required context, unevaluated declared domain, or numeric budget without a result;
   - baseline/candidate pair, context, configuration, producer/runtime, source snapshot, or subject-artifact mismatches, including stale candidate evidence;
   - requirement/context/evidence status inconsistency, required evidence with an empty reference list, or a reference to evidence that is not present in the result;
   - summary counts that differ from the exact requirement-status, defect, and blocker array counts;
   - an owner approval that is absent, hash-invalid, dangling, or out of scope;
   - an edit outside normalized `implementationBoundary.allowedPaths`; and
   - `PASS` while any capability is `UNSUPPORTED_BLOCKING` or any required uncertainty remains blocking.
4. Execution and comparison determine whether build, behavior, semantics, and fidelity requirements actually pass. Schema success must never be reported as source-analysis correctness, action correctness, behavior preservation, or visual fidelity.

Production semantic validation is a P4 requirement. The P1 schema tests include executable negative-control examples for missing scenarios, mismatched contexts, and stale candidate artifacts, but those test helpers are not a production validator. Until the P4 validator implements all rules above, no CLI may claim project `PASS`.

Unknown major schema versions are invalid input. Minor/patch compatibility is not inferred: this initial family accepts exactly `1.0.0` until a version policy and migrations are implemented.

## CLI outcome contract

All v1 CLI surfaces use one stable process-exit contract:

| Exit code | Meaning |
| ---: | --- |
| `0` | `PASS` |
| `1` | `FAIL` |
| `2` | `BLOCKED` |
| `3` | Invalid input, JSON, schema, reference, or artifact consistency |
| `4` | Tool or infrastructure error that prevented a trustworthy result |

An infrastructure failure must not be converted to `FAIL` or `PASS`. When it prevents required evaluation and can be represented normally, the emitted result is `BLOCKED` and the CLI exits `2`; exit `4` is reserved for failure to produce a trustworthy result artifact at all.

`ctc contract build` assembles only explicit, hash-pinned correspondence and behavior declarations. Missing mappings, dangling or cross-namespace references, stale hashes, unscoped approvals, unsafe paths, and malformed artifacts are invalid input (`3`). An authored `UNSUPPORTED_BLOCKING` capability or blocking uncertainty produces a schema-valid contract artifact but exits `2`; it is not a successful verification. Contract construction performs no measured execution, so it does not use measured-failure exit `1`.

`ctc agent packet` revalidates and semantically rebuilds the contract from every hash-pinned input before projecting one canonical packet model to JSON and Markdown. It requires an explicit initialized workspace, does not execute its listed commands, and inherits blocking exit `2`. Neither command patches the Android repository, invokes Gradle, contacts a network service, or claims implementation verification.

## V1 exclusions

This contract does not claim a universal web-to-Compose compiler, hosted execution, automatic semantic resolution of arbitrary Kotlin, real Note Overlay redesign, physical DC-1 qualification, or release readiness. It defines the bounded handoff and evidence language needed for subsequent analyzer, mapping, agent-packet, and closed-loop verification phases.
