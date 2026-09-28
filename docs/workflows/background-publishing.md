# Background publishing

Owner decision, 2026-09-28: Adrian can continue building while an authorized
release publishes. Routine release waiting uses no model calls. This is the
manager's default; Adrian does not need to remember a special command.

## What runs where

The existing GitHub Tests → protected signer when needed → Deploy site chain
owns production publication. It survives closing Codex or putting the laptop to
sleep. No new deploy loop, credentials, gate bypass or firmware release is added.

A small local Node observer follows the exact merged revision. It records
`checking`, `publishing`, `verifying`, `shipped`, `blocked` or `superseded` under
Git's common directory, shared by worktrees. It observes at bounded 60–180 second
intervals without AI inference. GitHub runner time still has its normal cost.
The Mac service resumes interrupted observation after login; it does not
repeatedly relaunch failed releases. Offline observation can delay the local
notification, but it does not stop the hosted publishing chain.

A successful deploy retains a small receipt and exact staged Studio/firmware
metadata. The observer downloads the receipt for that run and attempt, requires
real publishing and passing strict CI proof, independently checks the no-store
Studio marker and every live byte in both graphs, and rechecks main. A skipped
green run, stale graph, newer unrelated commit or wrong build cannot say shipped.
The observer never builds against local dist or touches the preview/card.

## One-time installation

The manager installs the per-user macOS observer using:

```sh
node scripts/install-background-release.mjs
```

The installer pins the observer/proof runtime by content hash, records its
LaunchAgent identity in `install.json`, and resumes unfinished observation on
login and every five minutes. An idle or already-running observer exits the
resumption check immediately. It does not start a new release or an AI session.
Do not archive a checkout that still owns a live preview or other active work.

## Every authorized ship

1. Implement and verify the coherent candidate once. Keep required checks and
   exact evidence; use focused tests for bounded repairs instead of restarting
   all previously passed suites. Follow the normal authorized PR/merge route.
2. Resolve the full merged SHA from origin/main, then start observation:

   ```sh
   node scripts/background-release.mjs start --revision FULL_40_CHARACTER_SHA
   node scripts/background-release.mjs status
   ```

3. Confirm the saved revision and live observer PID. Record the candidate, owner,
   state and common-directory resumption path in the workboard. Only then return
   **publishing in background**, allowing the next build to start immediately.
4. Do not poll with a model or create a recurring AI heartbeat. The observer
   persists the terminal result and requests one desktop notification. Native
   delivery follows the user's macOS notification settings; persisted state is
   always the durable source of truth.
5. At a relevant follow-up, read `status` once. Report Studio and firmware build
   numbers only from verified proof. Failed publication is **not shipped**; repair
   the concrete cause without blocking unrelated editing or bypassing checks.

`resume` restarts interrupted observation; its service-only `--only-interrupted` form never retries a terminal failure. An explicit manual resume may retry
bounded recoverable connectivity/proof errors. It does not rerun GitHub jobs or
republish production. A new repaired commit follows the normal checks/deploy path.

## Scope and limits

The standing coding instructions and ship skill establish this behavior for
future projects. The executable observer here is specific to Lightweaver's
workflow names and release contract; other repos should use their own durable
CI/status mechanism, never silently run this one against an unrelated project.

This change separates building from publishing. It does not promise that every
CI test will pass, remove existing safety gates, or mint a fresh firmware build
for publishing-only workflow changes. All selected CI lanes still run. Further
narrowing of test selection requires dependency evidence and regression coverage.
