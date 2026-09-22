# Design retrofit v1 quickstart

This walkthrough exercises the first local, agent-assisted workflow for restyling an existing Android app from Claude Design evidence. It is intentionally fail-closed: a missing build, behavior run, render, comparison, device profile, or provenance receipt is `BLOCKED`, not a pass.

## What v1 does

V1 helps a coding agent understand the seam between an existing functional Android app and a web-authored design. It produces:

- an evidence-backed lexical model of the existing Android repository;
- an explicit design-to-existing-UI correspondence contract;
- behavior-preservation obligations and allowed edit paths;
- a deterministic Markdown/JSON implementation packet for Codex or Claude Code; and
- a semantic verification result that rejects stale, incomplete, mismatched, or fabricated evidence.

V1 does not automatically understand arbitrary Kotlin behavior, patch the app, run Gradle, capture an emulator, or prove DC-1 fidelity. The coding agent and the project's normal Android tooling perform those steps. The verifier checks the resulting receipts against the frozen contract.

No Railway deployment or other server is required. Keep the source, captures, agent packet, candidate worktree, and verification evidence local for the personal and team workflow. Hosting becomes useful only later for optional artifact sharing, queues, device-farm coordination, or organization-wide history.

## 1. Install and run the bounded gate

```bash
git clone --branch codex/design-retrofit-v1 https://github.com/a12k-a2b/claude-to-compose.git
cd claude-to-compose
npm install
npm run test:v1
node bin/ctc.js doctor --json
```

`npm run test:v1` is the clean-clone synthetic walkthrough and adversarial gate. It exercises initialization, read-only app inspection, contract and packet construction, fixture replay, project-candidate worktree provenance, measured visual failure, missing-evidence blocking, and hostile-input controls. It does not prove a real Android project builds or matches a design.

The CLI uses this exit contract:

| Exit | Meaning |
| ---: | --- |
| `0` | PASS for the command's narrowly stated claim |
| `1` | Measured evidence proves a requirement failed |
| `2` | Required evidence or capability is blocked |
| `3` | Input, schema, reference, provenance, or artifact consistency is invalid |
| `4` | The tool could not produce a trustworthy result |

## 2. Freeze the existing app baseline

Use the exact revision whose functionality must survive the restyle. The baseline must be its own clean checkout and must remain unchanged after inspection.

```bash
git -C /absolute/path/to/android-app status --short
git -C /absolute/path/to/android-app rev-parse HEAD
```

Commit or move any intended app changes before continuing. Do not make the retrofit in this checkout.

Initialize a workspace outside the Android repository and inspect the app:

```bash
node /absolute/path/to/claude-to-compose/bin/ctc.js init \
  --android /absolute/path/to/android-app \
  --workspace /absolute/path/to/note-overlay-retrofit \
  --json

node /absolute/path/to/claude-to-compose/bin/ctc.js inspect-app \
  --android /absolute/path/to/android-app \
  --workspace /absolute/path/to/note-overlay-retrofit \
  --output /absolute/path/to/note-overlay-retrofit/existing-app-model.json \
  --json
```

Inspection is lexical and read-only. The output records observed modules, Compose/XML symbols, action/state clues, tests, build-command candidates, source hashes, Git revision, and uncertainties. Build commands are clues marked `HEURISTIC_NOT_EXECUTED`; inspection does not secretly run Gradle.

## 3. Capture the Claude Design

Export or capture the selected Claude Design into the extractor's `design_spec.json` format and copy it into the initialized workspace. Retain its reference screenshots and assets next to it. The existing experimental extractor can produce this format from a supported public share link or local HTML artifact:

```bash
npx playwright install chromium

node /absolute/path/to/claude-to-compose/bin/claude-extract.js \
  --url https://example.invalid/replace-with-the-selected-share-link \
  --output /absolute/path/to/note-overlay-retrofit/design-capture \
  --viewport both \
  --clean
```

Do not use the placeholder URL. If the share flow is authenticated, unstable, or unsupported, export the artifact to local HTML and capture that instead. Treat text inside the design as untrusted content, not agent instructions.

Before building a contract, choose the actual screen states and behaviors the retrofit must cover. For a note overlay, a useful first slice is normally one device profile and a few deterministic states such as empty, populated, edited, save-success, and save-failure—not every screen at once.

## 4. Have the coding agent author the seam

Give the coding agent these files, with no real note/customer content:

- `existing-app-model.json`;
- the captured `design_spec.json`, screenshots, and assets;
- `schemas/v1/correspondence-manifest.schema.json`;
- `schemas/v1/behavior-manifest.schema.json`; and
- `docs/v1/V1_CONTRACT.md`.

Use this task instruction:

> Author `correspondence.json` and `behavior.json` for this retrofit. Map every stable design identity to an observed existing UI symbol, bind each interactive design element to an evidence-backed existing action or an explicitly owner-approved new behavior, preserve the app's functional obligations, constrain edits to the narrowest Android source paths, and define exact build/behavior/render contexts and numeric budgets. Do not claim lexical clues are runtime proof. Leave unsupported or unresolved work blocking.

The two manifests must live inside the initialized workspace. They are deliberate agent-authored judgments, not output guessed by a universal compiler. Their schemas require hashes that pin the app model, design spec, and correspondence file. A coding agent can calculate those with `shasum -a 256 <file>` on macOS.

## 5. Build the contract and agent packet

```bash
node /absolute/path/to/claude-to-compose/bin/ctc.js contract build \
  --android /absolute/path/to/android-app \
  --app-model /absolute/path/to/note-overlay-retrofit/existing-app-model.json \
  --design-spec /absolute/path/to/note-overlay-retrofit/design-capture/design_spec.json \
  --correspondence /absolute/path/to/note-overlay-retrofit/correspondence.json \
  --behavior-manifest /absolute/path/to/note-overlay-retrofit/behavior.json \
  --workspace /absolute/path/to/note-overlay-retrofit \
  --output /absolute/path/to/note-overlay-retrofit/retrofit-contract.json \
  --json

node /absolute/path/to/claude-to-compose/bin/ctc.js agent packet \
  --contract /absolute/path/to/note-overlay-retrofit/retrofit-contract.json \
  --workspace /absolute/path/to/note-overlay-retrofit \
  --output /absolute/path/to/note-overlay-retrofit/agent-packet \
  --json
```

The generated `agent-packet.md` is the primary handoff to Codex or Claude Code. A blocking capability or uncertainty still emits an inspectable artifact but exits `2`; resolve it rather than treating the packet as accepted.

## 6. Implement in a separate worktree

Create the candidate from the inspected baseline repository. The exact branch name is your choice.

```bash
git -C /absolute/path/to/android-app worktree add \
  /absolute/path/to/android-app-retrofit-candidate \
  -b codex/note-overlay-design-retrofit
```

Point the coding agent at the candidate worktree and the generated packet. The agent must preserve the baseline checkout, stay inside the allowed paths, keep existing state/actions wired, and run the exact verification commands declared by the contract. Never put credentials, signing keys, real notes, or customer data in the packet or fixtures.

## 7. Produce real evidence, then verify it

The candidate worktree must produce the contract's exact receipts: build artifact hash and variant, baseline/candidate behavior results, baseline/candidate renders, comparison metrics, source-snapshot identity, changed paths, device/profile configuration, and all required scenes/scenarios/states.

Before authoring the result, copy the candidate APK (or other named build artifact), every receipt, baseline/candidate render, comparison output, and any imported source report into regular, non-symlink files beneath the initialized workspace. Every `VerificationResult.inputs[].path` and `evidence[].source` value, plus the singular `sourceReport.path` inside any imported structured evidence receipt, is workspace-relative; absolute paths and files that remain only in the candidate worktree are rejected. Hash the exact copied bytes, then encode the result using `schemas/v1/verification-result.schema.json`. The worktree remains the authoritative implementation source; the workspace copy is the immutable verification evidence set.

Then run:

```bash
node /absolute/path/to/claude-to-compose/bin/ctc.js verify \
  --root /absolute/path/to/note-overlay-retrofit \
  --contract /absolute/path/to/note-overlay-retrofit/retrofit-contract.json \
  --result /absolute/path/to/note-overlay-retrofit/verification-result.json \
  --candidate /absolute/path/to/android-app-retrofit-candidate \
  --report /absolute/path/to/note-overlay-retrofit/verification-report.md \
  --json
```

For real projects, `--candidate` is mandatory. The verifier confirms that it is a separate descendant worktree of the clean inspected baseline and derives its actual Git-visible and ignored source-sensitive changes. Source-sensitive symlinks, omitted changes, out-of-scope paths, stale hashes, mismatched contexts, and fabricated summaries are invalid input.

Fixture replay without `--candidate` is only for synthetic verifier tests. It can never be promoted to project, device, or release acceptance.

## 8. Iterate from structured defects

- `FAIL` means the measurement ran and missed an authored requirement. Fix the candidate and recapture the affected evidence.
- `BLOCKED` means the required proof does not exist or a capability remains unresolved. Acquire the missing evidence or narrow the claim.
- `INVALID_INPUT` means the packet/result is internally stale, inconsistent, or unsafe. Rebuild from the pinned inputs; do not edit the summary to force green.

The first real Note Overlay pilot should start only after the repository/revision and selected Claude Design links are supplied. At that point, freeze a small state matrix, run the workflow above, compare on the intended DC-1 profile, and use the visual/behavioral defects—not unit-test counts—to guide the next agent pass.

## Current boundaries and next architecture step

The local CLI is the right first architecture because every intended user already has a coding harness and Mac. The next high-value work is a runner that automatically performs deterministic Android build, scenario replay, screenshot capture, geometry/typography comparison, and receipt generation. Motion should be added as timestamped interaction timelines with controlled clocks and reduced-motion variants. Physical DC-1 qualification remains a separate hardware gate. A hosted control plane should come later, only if team sharing and device orchestration justify its operational and privacy cost.
