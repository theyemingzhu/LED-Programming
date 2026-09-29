// One durable dependency queue; GitHub CI remains the only publisher.
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, readFile, writeFile, rename, readdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { createReleaseController, startCandidate, withCandidateLock } from './release-controller.mjs';
import { publishReleaseEvent } from './release-events.mjs';
const exec = promisify(execFile);
const SHA = /^[a-f0-9]{40}$/;
const REPO = 'theyemingzhu/LED-Programming';
const number = value => /^[1-9][0-9]*$/.test(String(value));
const read = async path => { try { return JSON.parse(await readFile(path, 'utf8')); } catch (error) { if (error.code === 'ENOENT') return null; throw error; } };
function dependencies(overrides = {}) {
  return {
    now: Date.now,
    git: async (root, args) => (await exec('git', args, { cwd: root, timeout: 60_000, maxBuffer: 2_000_000 })).stdout.trim(),
    gh: async (path, options = {}) => JSON.parse((await exec('gh', ['api', path, ...(options.method ? ['--method', options.method] : []), ...Object.entries(options.fields || {}).flatMap(([key, value]) => ['-f', `${key}=${value}`])], { timeout: 30_000, maxBuffer: 2_000_000 })).stdout),
    controller: (root, stateDir) => createReleaseController({ root, stateDir }),
    start: startCandidate,
    publish: publishReleaseEvent,
    ...overrides,
  };
}
async function save(stateDir, state, now) {
  const dir = join(stateDir, 'queue'); await mkdir(dir, { recursive: true, mode: 0o700 });
  state.updatedAt = now(); const path = join(dir, `${state.id}.json`); const temporary = `${path}.${process.pid}.tmp`;
  await writeFile(temporary, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 }); await rename(temporary, path); return state;
}
async function clean(state, deps, revision) {
  if (await deps.git(state.root, ['status', '--porcelain', '--untracked-files=all'])) throw new Error('Queued checkout is dirty; no integration or push was attempted.');
  if (await deps.git(state.root, ['symbolic-ref', '--short', 'HEAD']) !== state.branch) throw new Error('Queued checkout branch changed.');
  if (await deps.git(state.root, ['rev-parse', 'HEAD']) !== revision) throw new Error('Queued checkout HEAD differs from the recorded revision.');
}
export async function enqueueRelease({ stateDir, root, pr, revision, afterPr, owner }, overrides = {}) {
  if (!stateDir || !root || !number(pr) || !number(afterPr) || String(pr) === String(afterPr) || !SHA.test(revision || '') || !String(owner || '').trim()) throw new Error('Queue requires exact root, PR, revision, different prerequisite PR and authorized owner.');
  const deps = dependencies(overrides); stateDir = resolve(stateDir); root = resolve(root);
  return withCandidateLock(join(stateDir, 'queue-lock'), async () => {
    const id = `pr${pr}`, previous = await read(join(stateDir, 'queue', `${id}.json`));
    if (previous) {
      if (previous.originalRevision === revision && previous.root === root && previous.afterPr === Number(afterPr)) return previous;
      throw new Error('Queued candidate is immutable; resolve the existing queue entry before replacing its revision.');
    }
    const branch = await deps.git(root, ['symbolic-ref', '--short', 'HEAD']);
    if (!branch || branch === 'main' || branch === 'master') throw new Error('Queue integration requires an isolated candidate branch.');
    const state = { schemaVersion: 1, id, pr: Number(pr), afterPr: Number(afterPr), root, checkout: root, repo: REPO, branch, owner: String(owner).trim(), authorization: 'explicit-owner-ship', originalRevision: revision, revision, originalTree: await deps.git(root, ['rev-parse', `${revision}^{tree}`]), phase: 'waiting', createdAt: deps.now(), nextAction: `Waiting for independently proven publication of PR ${afterPr}.` };
    await clean(state, deps, revision);
    const remote = await deps.gh(`repos/${REPO}/pulls/${pr}`);
    if (remote.head?.sha !== revision || remote.head?.ref !== branch || remote.state !== 'open') throw new Error('Remote queued PR does not match the pinned local branch and revision.');
    return save(stateDir, state, deps.now);
  });
}
async function block(stateDir, state, error, deps) {
  state.blockedFrom = state.phase; state.phase = 'blocked'; state.cause = state.reason = error.message || String(error);
  state.nextAction = `Owner ${state.owner}: inspect queued ${state.id} at ${state.root}; repair this concrete blocker, then call resumeQueuedRelease for this already-authorized queue entry.`;
  await save(stateDir, state, deps.now);
  try { const event = await deps.publish(stateDir, state); if (event?.key) { state.eventKey = event.key; await save(stateDir, state, deps.now); } }
  catch (notificationError) { state.notificationError = notificationError.message; await save(stateDir, state, deps.now); }
  return state;
}
async function dependency(stateDir, state, deps) {
  const candidate = await read(join(stateDir, 'candidates', `pr${state.afterPr}`, 'state.json'));
  if (!candidate) return { reason: `PR ${state.afterPr} has no recorded release candidate.` };
  if (candidate.phase === 'blocked') {
    // Surface the actual prerequisite failure, not a fabricated failure of this PR.
    if (SHA.test(candidate.revision || '')) {
      const event = await deps.publish(stateDir, candidate);
      if (event?.key) state.dependencyEventKey = event.key;
    }
    return { reason: `PR ${state.afterPr} is blocked: ${candidate.reason || candidate.cause || 'inspect its release log'}` };
  }
  if (!SHA.test(candidate.mergedRevision || '')) return { reason: `PR ${state.afterPr} has not recorded its exact merged revision (${candidate.phase || 'unknown'}).` };
  const proof = await read(join(stateDir, 'revisions', `${candidate.mergedRevision}.json`));
  if (proof?.revision === candidate.mergedRevision && proof.phase === 'blocked') {
    const event = await deps.publish(stateDir, {
      ...proof,
      checkout: candidate.checkout || candidate.root || candidate.checkoutRoot || proof.checkout,
      owner: candidate.owner || proof.owner,
    });
    if (event?.key) state.dependencyEventKey = event.key;
    return { reason: `PR ${state.afterPr} publication is blocked: ${proof.reason || proof.cause || 'inspect its exact release proof log'}` };
  }
  if (proof?.revision === candidate.mergedRevision && proof.phase === 'superseded') {
    return { blocked: true, reason: `PR ${state.afterPr} publication was superseded: ${proof.reason || proof.cause || 'its exact release is no longer current'}. Reconcile the prerequisite release before resuming this queue.` };
  }
  if (proof?.phase !== 'shipped' || proof.revision !== candidate.mergedRevision || !SHA.test(proof.deployRevision || '')) return { reason: `PR ${state.afterPr} is not independently proven live yet.` };
  const remote = await deps.gh(`repos/${state.repo}/pulls/${state.afterPr}`);
  if (!remote.merged || remote.merge_commit_sha !== candidate.mergedRevision || remote.head?.sha !== candidate.revision) return { blocked: true, reason: `PR ${state.afterPr} no longer matches its recorded release identity.` };
  const main = await deps.gh(`repos/${state.repo}/git/ref/heads/main`);
  if (main.object?.sha !== proof.deployRevision) return { blocked: true, reason: `main is ${main.object?.sha || 'unknown'}, while prerequisite live proof is ${proof.deployRevision}; a newer main requires its own proof before this queued release can proceed.` };
  return { base: proof.deployRevision, dependencyRevision: candidate.mergedRevision };
}
async function inspectIntegrated(state, deps) {
  const head = await deps.git(state.root, ['rev-parse', 'HEAD']);
  // Recover only a merge generated from our recorded original head and base.
  if (head !== state.originalRevision && head !== state.baseRevision) {
    const parents = (await deps.git(state.root, ['rev-list', '--parents', '-n', '1', head])).split(/\s+/);
    if (parents[0] !== head || parents[1] !== state.originalRevision || parents[2] !== state.baseRevision || parents.length !== 3) throw new Error('Checkout changed during queued integration; refusing to adopt an unrelated commit.');
  }
  await deps.git(state.root, ['merge-base', '--is-ancestor', state.originalRevision, head]);
  await deps.git(state.root, ['merge-base', '--is-ancestor', state.baseRevision, head]);
  await clean(state, deps, head);
  state.revision = head; state.tree = await deps.git(state.root, ['rev-parse', `${head}^{tree}`]); state.phase = 'integrated';
}
async function mergeOwned(state, deps) {
  try { await deps.git(state.root, ['merge', '--no-edit', 'origin/main']); }
  catch (error) {
    let mergeHead = ''; try { mergeHead = await deps.git(state.root, ['rev-parse', '--verify', 'MERGE_HEAD']); } catch {}
    if (mergeHead === state.baseRevision) await deps.git(state.root, ['merge', '--abort']);
    throw new Error(`Queued main integration failed: ${error.message}. ${mergeHead === state.baseRevision ? 'Only this queue-owned merge was aborted.' : 'No unrelated merge was aborted.'}`);
  }
}
async function tick(stateDir, state, deps) {
  if (state.phase === 'started' || state.phase === 'blocked') return state;
  try {
    if (state.phase === 'waiting') {
      const ready = await dependency(stateDir, state, deps);
      if (ready.blocked) throw new Error(ready.reason);
      if (!ready.base) { state.reason = ready.reason; state.nextAction = ready.reason; return save(stateDir, state, deps.now); }
      await clean(state, deps, state.originalRevision);
      const remote = await deps.gh(`repos/${state.repo}/pulls/${state.pr}`);
      if (remote.head?.sha !== state.originalRevision || remote.head?.ref !== state.branch) throw new Error('Queued PR head changed before integration.');
      await deps.git(state.root, ['fetch', 'origin', 'main']);
      const fetched = await deps.git(state.root, ['rev-parse', 'origin/main']);
      if (fetched !== ready.base) throw new Error('Fetched main changed from the independently proven prerequisite revision.');
      state.baseRevision = ready.base; state.dependencyRevision = ready.dependencyRevision; state.phase = 'integrating'; state.reason = ''; await save(stateDir, state, deps.now);
      await mergeOwned(state, deps);
      await inspectIntegrated(state, deps); await save(stateDir, state, deps.now);
    }
    if (state.phase === 'integrating') {
      let mergeHead = ''; try { mergeHead = await deps.git(state.root, ['rev-parse', '--verify', 'MERGE_HEAD']); } catch {}
      if (mergeHead) {
        if (mergeHead === state.baseRevision) await deps.git(state.root, ['merge', '--abort']);
        throw new Error('Queued integration was interrupted with an unfinished merge; review before retrying.');
      }
      const head = await deps.git(state.root, ['rev-parse', 'HEAD']);
      if (head === state.originalRevision) {
        await clean(state, deps, head);
        // Crash before invoking merge: pinned ref must still identify our base.
        if (await deps.git(state.root, ['rev-parse', 'origin/main']) !== state.baseRevision) throw new Error('Fetched base changed while integration was interrupted.');
        await mergeOwned(state, deps);
      }
      await inspectIntegrated(state, deps); await save(stateDir, state, deps.now);
    }
    if (state.phase === 'integrated') {
      await clean(state, deps, state.revision);
      if (await deps.git(state.root, ['rev-parse', 'HEAD^{tree}']) !== state.tree) throw new Error('Integrated candidate tree changed before push.');
      const remote = await deps.gh(`repos/${state.repo}/pulls/${state.pr}`);
      if (remote.head?.ref !== state.branch || ![state.originalRevision, state.revision].includes(remote.head?.sha)) throw new Error('Remote queued branch changed; exact push refused.');
      if (remote.head.sha !== state.revision) await deps.git(state.root, ['push', 'origin', `${state.revision}:refs/heads/${state.branch}`]);
      const pushed = await deps.gh(`repos/${state.repo}/pulls/${state.pr}`);
      if (pushed.head?.sha !== state.revision) throw new Error('GitHub did not confirm the exact integrated revision after push.');
      state.phase = 'pushed'; await save(stateDir, state, deps.now);
    }
    if (state.phase === 'pushed') {
      await deps.gh(`repos/${state.repo}/pulls/${state.pr}`, { method: 'PATCH', fields: { base: 'main' } });
      await clean(state, deps, state.revision);
      const controller = deps.controller(state.root, stateDir); const prior = await controller.read(state.id);
      if (prior) {
        if (prior.revision !== state.revision || prior.base !== state.baseRevision || prior.phase === 'blocked') throw new Error('Existing controller candidate conflicts with this queued handoff.');
      } else await controller.prepare({ pr: state.pr, revision: state.revision, base: state.baseRevision, owner: state.owner });
      state.phase = 'prepared'; await save(stateDir, state, deps.now);
    }
    if (state.phase === 'prepared') {
      const controller = deps.controller(state.root, stateDir); const candidate = await controller.read(state.id);
      if (candidate?.revision !== state.revision || candidate.base !== state.baseRevision) throw new Error('Prepared controller no longer matches the queued revision.');
      if (candidate.phase === 'blocked') throw new Error(`Prepared release is blocked: ${candidate.cause || candidate.reason}`);
      // Restart after start: use the already recorded candidate, not another merge.
      const result = ['prepared', 'interrupted', 'starting', 'checking', 'merging', 'handoff'].includes(candidate.phase)
        ? await deps.start(controller, state.id, { resume: true }) : candidate;
      if (!['starting', 'checking', 'merging', 'handoff', 'publishing', 'shipped'].includes(result.phase)) throw new Error(`Controller did not start: ${result.phase}`);
      state.phase = 'started'; state.controllerRevision = result.revision; state.nextAction = `Versioned controller owns ${state.id} at ${state.revision}; publishing has not yet been proven.`; await save(stateDir, state, deps.now);
    }
    return state;
  } catch (error) { return block(stateDir, state, error, deps); }
}
export async function processReleaseQueue(stateDir, overrides = {}) {
  stateDir = resolve(stateDir); const deps = dependencies(overrides);
  return withCandidateLock(join(stateDir, 'queue-lock'), async () => {
    let files; try { files = await readdir(join(stateDir, 'queue')); } catch (error) { if (error.code === 'ENOENT') return []; throw error; }
    const results = [];
    for (const file of files.filter(name => /^pr[1-9][0-9]*\.json$/.test(name)).sort()) {
      const state = await read(join(stateDir, 'queue', file));
      if (state?.schemaVersion === 1 && state.authorization === 'explicit-owner-ship') results.push(await tick(stateDir, state, deps));
    }
    return results;
  });
}


// Explicit repair continuation under the original ship authorization. Service
// ticks never reset a blocked entry or retry its failed operation on their own.
export async function resumeQueuedRelease({ stateDir, pr }, overrides = {}) {
  if (!stateDir || !number(pr)) throw new Error('Resume requires stateDir and queued PR number.');
  stateDir = resolve(stateDir); const deps = dependencies(overrides);
  return withCandidateLock(join(stateDir, 'queue-lock'), async () => {
    const state = await read(join(stateDir, 'queue', `pr${pr}.json`));
    if (state?.schemaVersion !== 1 || state.authorization !== 'explicit-owner-ship' || state.phase !== 'blocked') throw new Error('Only an explicitly authorized blocked queue entry may resume.');
    if (!['waiting', 'integrating', 'integrated', 'pushed', 'prepared'].includes(state.blockedFrom)) throw new Error('Blocked entry has no safe recorded resumption phase.');
    state.previousBlock = { cause: state.cause, eventKey: state.eventKey || null, updatedAt: state.updatedAt };
    state.phase = state.blockedFrom; state.cause = ''; state.reason = ''; state.eventKey = null;
    state.nextAction = 'The next durable queue tick will revalidate the repaired operation under the original ship authorization.';
    return save(stateDir, state, deps.now);
  });
}
