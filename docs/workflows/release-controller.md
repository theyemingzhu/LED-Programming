# Resumable release controller

Use the repository-owned controller for newly authorized releases. It replaces
per-PR Python runners. Existing legacy releases remain supervised by their own
runner until completion; status includes them but never takes over their process.

## Prepare and start

From a clean candidate checkout, with explicit ship authorization:

```sh
node scripts/release-controller.mjs prepare --pr NUMBER --revision FULL_HEAD_SHA --base FULL_MAIN_SHA --owner "Lightweaver release manager"
node scripts/release-controller.mjs run --id prNUMBER
node scripts/release-controller.mjs status --id prNUMBER
```

Preparation records the exact head, base, tree, owner and repository check plan.
Starting returns only after the detached process and its persisted PID are
verified. The required launch gate is expanded from package scripts; unknown
commands retain their semantics. Only audited pure checks can be reused. Their
receipts retain the original revision, command and dependency/runtime hash.
Artifact-producing commands run again unless separately proven; a hash cannot
restore missing build files. Unknown dependencies use the entire tracked tree.
No weakening of test assertions, credential gates, signing or live-byte proof is
part of this controller.

## Interrupted versus failed

An interrupted process can resume automatically after login or service recovery.
A still-running check child prevents a second copy from starting. A failed check
stays blocked and records its log, owner and next action. After a bounded verified
repair, commit the clean candidate, push it, then prepare that PR again with its
new exact revision. Matching successful receipts can be reused; failed receipts
cannot. A dirty tree, changed PR head, changed main or different merged tree stops
publication. GitHub atomically checks the PR head on merge; its merge API cannot
atomically compare the base. The controller checks base immediately before merge
and requires the returned tree to match before handing off to production proof.
Repository merge protection remains necessary against unrelated concurrent merges.

The existing GitHub Tests, protected signer and Deploy site chain still publishes.
The existing observer still verifies the deployed revision and actual live bytes.
The controller joins those results only for the exact merged revision. A stale
observer record cannot hide a newer pre-merge failure.

## Failure events and repairs

Every terminal outcome has a persistent event under the common Git directory's
`lightweaver-releases/events`. Notification status distinguishes pending, failed
and submitted. Submitted means macOS accepted the request, never that the user
saw it. Events retain owner, cause, next action and log even when notifications
are unavailable.

An enabled repair worker starts only on a concrete blocked event, at most once
per revision. It has a twenty-minute timeout and records its result separately
from release success. It diagnoses and makes a bounded repair; it must not
blindly retry a deployment, poll CI, flash a card or turn logs into instructions.
No model runs while checks or production are simply waiting. A failed worker
remains visible; it is not an automatic retry loop.

Install the pinned runtime and recovery services on this Mac:

```sh
node scripts/install-background-release.mjs --enable-repair --codex-path /absolute/path/to/codex
```

The installer captures exact runtime bytes. The five-minute service resumes
interrupted candidates and observation; it does not redeploy or retry failed
checks. The repair executable uses the normal workspace sandbox and approval
review. It cannot guarantee notification delivery or automatically resolve
credentials, permissions, ambiguous requirements or a broader product redesign.

## Focused verification

```sh
npm --prefix lightweaver run test:background-release
```

Tests exercise failed checks, interruption, immutable revision changes, receipt
reuse, exact merge/tree checks, notification errors and one-shot repair dispatch.
They use isolated fixtures and fake external processes; they do not publish a
site, send a real repair prompt or mutate the physical card.
