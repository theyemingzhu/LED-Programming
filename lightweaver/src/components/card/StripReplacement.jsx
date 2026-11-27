import React, { useEffect, useRef, useState } from 'react';
import { formatGpio } from '../../lib/cardPinout.js';
import {
  assignCardWiringIdentityForChange,
  cardGaveNoAnswer,
  pushConfigToCard,
  readCardFirmwareInfoEnvelope,
  readCardStatusEnvelope,
  withCardReadRetry,
} from '../../lib/cardPushClient.js';
import {
  activateAndWaitForCardWiring,
  confirmCardWiringCandidate,
  getCardWiringStatus,
  readCardWiringCandidateEvidence,
  rollbackCardWiringCandidate,
} from '../../lib/cardWiringSafety.js';
import { assertCardDeploymentPreflightIdentity, verifyCardDeployment, verifyCardWiringTestOutputs } from '../../lib/cardDeployment.js';
import { isCardLinkConnected, noteCardRestartPlanned, noteCardRestartSettled, reportCardStatusEnvelope } from '../../lib/cardLink.js';
import { reclaimCardFrameStreams } from '../../lib/cardFrameStream.js';
import { acquireCardWriteLease } from '../../lib/cardWriteLease.js';
import { beginStudioHardwareOperation } from '../../lib/studioHardwareOperation.js';
import { waitForCardOutputs } from '../../lib/cardSetupDeploy.js';
import { isUncertainCardWriteFailure } from '../../lib/cardTransientFailure.js';
import { PORT_ROLE_UNUSED } from '../../lib/portRoles.js';
import {
  designSlotForReplacement, prepareStripReplacement, replacementCapabilities, replacementOutputs, sameReplacementOutputs, updateReplacementPortRoles,
} from '../../lib/stripReplacement.js';
import { writeDiscoveredPortRoles } from '../../lib/stripDiscoveryStore.js';
import { useProject } from '../../state/ProjectContext.jsx';

const KEEP_CARD_POWERED = 'Keep the card powered. Reconnect to the card’s network, then choose';
const CONFIRMATION_UNVERIFIED = `Studio verified the light test. It couldn’t check whether the card saved the new pin. ${KEEP_CARD_POWERED} Check saved wiring.`;

function cardContactLost(error) {
  return cardGaveNoAnswer(error) || cardGaveNoAnswer(error?.cause)
    || ['network', 'bridge-missing', 'bridge-post-failed', 'reconnect-timeout', 'card-stopped-answering'].includes(error?.reason);
}

function replacementDraftKey(project) {
  return JSON.stringify([project.layout?.wiring, project.portRoles]);
}

function ownsCandidate(trial, wiring) {
  const { cardId, buildId, config } = trial.prepared;
  return Boolean(wiring.activationId) && wiring.cardId === cardId && wiring.buildId === buildId
    && (!trial.activationId || wiring.activationId === trial.activationId)
    && wiring.projectRevision === config.projectRevision && wiring.projectFingerprint === config.projectFingerprint
    && wiring.wiringDigest === config.wiringDigest && wiring.wiringRevision === config.wiringRevision
    && sameReplacementOutputs(trial.outputs, wiring.candidateOutputs);
}

export function StripReplacement({
  host, cardLink, profile, firmware, selectedPin, choose, close, onSaved, onRoles, onProtected, probeBusy,
  showSlots, lastCounts, testablePins, testedPin, onTestPin,
}) {
  const cardId = cardLink?.card?.id;
  const options = { host, transport: cardLink?.transport };
  const connected = isCardLinkConnected(cardLink);
  const reportedOutputs = connected ? cardLink?.readiness?.outputs : null;
  const [readBack, setReadBack] = useState(null);
  const currentReadBack = connected && readBack?.cardId === cardId && readBack?.bootId === cardLink.readiness?.bootId
    && readBack?.fingerprint === cardLink.readiness?.projectFingerprint;
  const seen = currentReadBack ? readBack.outputs : reportedOutputs || [];
  const slot = seen.find(output => output.pin === selectedPin.old);
  const stalePin = (currentReadBack || Array.isArray(reportedOutputs)) && !slot;
  const [targetPin, setTargetPin] = useState(selectedPin.target ?? null);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [phase, setPhase] = useState('pick');
  const trialRef = useRef(null);
  const runningRef = useRef(false);
  const mountedRef = useRef(true);
  const selectRef = useRef(null);
  const headingRef = useRef(null);
  const sectionRef = useRef(null);
  const keepButtonRef = useRef(null);
  const {
    wiring, projectId, portRoles, serializeProject, readProjectLifecycle, updateWiring, setPortRoles, flushProjectAutosave,
  } = useProject();
  const latestProjectRef = useRef(serializeProject);
  latestProjectRef.current = serializeProject;
  const lifecycleRef = useRef(readProjectLifecycle);
  lifecycleRef.current = readProjectLifecycle;
  const { pins, maxOutputs } = replacementCapabilities(firmware, profile);
  const unusedPins = pins?.filter(pin => !seen.some(output => output.pin === pin)
    && !portRoles.some(role => role.pin === pin && role.role !== PORT_ROLE_UNUSED)) || [];
  const eligible = connected && cardLink?.readiness?.knownGoodProject === true
    && Boolean(projectId) && cardLink.readiness.projectId === projectId;
  const matching = wiring?.outputs?.length === seen.length && seen.every(output => wiring.outputs.some(planned => planned.id === output.id));
  const planned = wiring?.outputs?.find(output => output.id === slot?.id);
  const plannedTarget = unusedPins.includes(planned?.pin) ? planned.pin : '';
  const target = targetPin ?? plannedTarget;
  const protectedWork = ['starting', 'testing', 'finishing'].includes(phase);
  const targetInputVisible = phase === 'pick' && connected && !stalePin && Boolean(slot)
    && eligible && matching && pins !== null && unusedPins.length > 0;

  const cancel = () => {
    setTargetPin(null);
    setStatus('');
    setError('');
    close();
  };

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      trialRef.current?.release?.();
    };
  }, []);
  useEffect(() => { onProtected(protectedWork); return () => onProtected(false); }, [onProtected, protectedWork]);
  useEffect(() => {
    if (phase === 'saved') headingRef.current?.focus();
    else if (selectedPin.old != null) {
      if (phase === 'testing') keepButtonRef.current?.focus();
      else if (phase === 'pick' && selectRef.current) {
        const active = document.activeElement;
        if (active === headingRef.current || !sectionRef.current?.contains(active)) selectRef.current.focus();
      } else headingRef.current?.focus();
    }
  }, [phase, targetInputVisible, selectedPin.old]);

  const currentProject = trial => {
    const now = lifecycleRef.current();
    const project = latestProjectRef.current();
    if (!mountedRef.current || now.generation !== trial.marker.generation
      || now.editedRevision !== trial.marker.editedRevision
      || project.id !== trial.projectId || replacementDraftKey(project) !== trial.draftKey) {
      throw new Error('The project changed during the light test. Restore the previous setup and reopen the matching project.');
    }
  };

  const rollback = async trial => {
    const wiringState = await getCardWiringStatus(trial.options);
    if (wiringState.hasCandidate && ownsCandidate(trial, wiringState)) {
      await rollbackCardWiringCandidate(wiringState.activationId, trial.options);
    }
    const restored = await waitForCardOutputs(trial.options.host, trial.before, {
      ...trial.options, attempts: 12, expectedCardId: trial.prepared.cardId,
      statusImpl: async request => {
        const [status, state] = await Promise.all([readCardStatusEnvelope(request), getCardWiringStatus(request)]);
        return status.knownGoodProject === true && status.wiringProbation?.active !== true
          && ['known-good', 'rolled-back'].includes(state.state) && !state.hasCandidate
          && state.cardId === trial.prepared.cardId && sameReplacementOutputs(trial.before.led.outputs, state.outputs)
          ? status : null;
      },
    });
    if (!restored) {
      throw new Error(`Studio couldn’t verify the previous setup. ${KEEP_CARD_POWERED} Restore previous setup.`);
    }
    return restored;
  };

  const start = async () => {
    if (runningRef.current || !eligible || !slot || !unusedPins.includes(target)) return;
    runningRef.current = true;
    let release;
    let attempt;
    setError('');
    setPhase('starting');
    setStatus('Checking the card and its installed project…');
    try {
      const claim = acquireCardWriteLease({ cardId, operation: 'activate-wiring' });
      if (!claim.ok) throw new Error(claim.message);
      const finish = beginStudioHardwareOperation('activate-wiring');
      release = () => { finish(); claim.release(); };
      const project = latestProjectRef.current();
      const marker = lifecycleRef.current();
      await reclaimCardFrameStreams(host);
      const [before, info, wiringState] = await withCardReadRetry(() => Promise.all([
        readCardStatusEnvelope(options), readCardFirmwareInfoEnvelope(options), getCardWiringStatus(options),
      ]));
      assertCardDeploymentPreflightIdentity(info, before);
      if (before.cardId !== cardId || wiringState.cardId !== cardId || wiringState.buildId !== before.buildId) {
        throw new Error('A different card answered. Reconnect the paired card before testing.');
      }
      if (wiringState.state !== 'known-good' || wiringState.hasCandidate || before.commandReady !== true) {
        throw new Error('The card is not ready to start another wiring test. Finish or restore the existing test first.');
      }
      if (!sameReplacementOutputs(before.outputs, wiringState.outputs)
        || seen.length !== before.outputs.length || seen.some((entry, i) => (
        entry.id !== before.outputs[i]?.id || entry.pin !== before.outputs[i]?.pin || entry.pixels !== before.outputs[i]?.pixels
      ))) {
        throw new Error('The card’s configured outputs changed. Reopen the light check before testing.');
      }
      const outputs = replacementOutputs(before.outputs, slot.id, target, replacementCapabilities(info, profile));
      const design = project.layout?.wiring;
      const designSlot = designSlotForReplacement(design, slot.id, selectedPin.old, target);
      const plannedPin = design?.outputs.find(output => output.id === slot.id)?.pin;
      if (designSlot && design.locked) {
        throw new Error('Unlock the wiring plan in Layout before replacing this pin.');
      }
      const nextRoles = updateReplacementPortRoles(project.portRoles, selectedPin.old, target);
      const prepared = prepareStripReplacement({ project, status: before, outputs });
      if (prepared.runtimePackage.mediaAssets?.length) {
        throw new Error('This setup includes recordings. Use the full Install playlist on card check to update the wiring.');
      }
      await assignCardWiringIdentityForChange(prepared.config, before);
      attempt = {
        prepared, outputs, target, nextRoles, projectId: project.id, marker, options, release, boot: before.bootId,
        designSlot, plannedPin, draftKey: replacementDraftKey(project), updateWiring,
        before: {
          piece: { id: before.projectId }, projectRevision: before.projectRevision,
          projectFingerprint: before.projectFingerprint, led: { outputs: before.outputs },
        },
      };
      currentProject(attempt);
      trialRef.current = attempt;
      setStatus('Starting the light test. The card may take a moment to restart…');
      const staged = await pushConfigToCard(prepared.runtimePackage, {
        ...options, allowLayoutChange: true, allowProjectChange: false,
      });
      if (staged.state !== 'staged' || !staged.activationId) {
        throw new Error('The card did not acknowledge the staged replacement.');
      }
      attempt.activationId = staged.activationId;
      const stagedReadBack = await withCardReadRetry(() => readCardWiringCandidateEvidence(attempt.activationId, options));
      if (!ownsCandidate(attempt, stagedReadBack)) {
        throw new Error('The card did not report the exact staged replacement.');
      }
      currentProject(attempt);
      noteCardRestartPlanned();
      try {
        await activateAndWaitForCardWiring(attempt.activationId, { ...options, timeoutMs: 45_000 });
      } finally {
        noteCardRestartSettled();
      }
      const testing = await withCardReadRetry(() => readCardStatusEnvelope(options));
      if (!verifyCardWiringTestOutputs(prepared, testing, before.bootId).ok
        || !sameReplacementOutputs(outputs, testing.outputs)) {
        throw new Error('The card could not verify the tested outputs.');
      }
      currentProject(attempt);
      setPhase('testing');
      setStatus('');
    } catch (failure) {
      let detail = cardContactLost(failure)
        ? 'Studio lost contact before it could verify the light test.'
        : failure.message;
      if (attempt) {
        try {
          await rollback(attempt);
          detail += ' The card confirmed its previous setup.';
        } catch {
          detail += ` Studio couldn’t verify what the card is running. Keep it powered, reconnect to its network, then reopen this light check.`;
        }
      } else if (cardContactLost(failure)) {
        detail += ` ${KEEP_CARD_POWERED} Test replacement.`;
      }
      trialRef.current = null;
      release?.();
      setPhase('pick');
      setStatus('');
      setError(detail);
    } finally {
      runningRef.current = false;
    }
  };

  const finish = async keep => {
    const trial = trialRef.current;
    if (!trial || runningRef.current) return;
    runningRef.current = true;
    setPhase('finishing');
    setStatus(keep ? 'Verifying and saving the tested output…' : 'Restoring the previous setup…');
    setError('');
    try {
      if (!keep) {
        const previous = await rollback(trial);
        reportCardStatusEnvelope({ ...trial.options, status: previous });
        setStatus('The card confirmed its previous setup.');
      } else {
        if (!trial.confirmSent) {
          currentProject(trial);
          const tested = await withCardReadRetry(() => readCardStatusEnvelope(trial.options));
          if (!verifyCardWiringTestOutputs(trial.prepared, tested, trial.boot).ok
            || !sameReplacementOutputs(trial.outputs, tested.outputs)) {
            throw new Error('The card no longer verifies the tested outputs. Restore the previous setup.');
          }
          currentProject(trial);
          // A lost reply can follow a committed write. Read back the result
          // before treating a second press as permission to send it again.
          trial.confirmSent = true;
          try {
            await confirmCardWiringCandidate(trial.activationId, trial.options);
          } catch (confirmationError) {
            if (!isUncertainCardWriteFailure(confirmationError)) {
              trial.confirmSent = false;
              throw confirmationError;
            }
          }
        }
        const verified = await waitForCardOutputs(host, trial.prepared.config, {
          ...trial.options, expectedCardId: trial.prepared.cardId, attempts: 12,
          statusImpl: async request => {
            const [read, wiringStatus] = await Promise.all([readCardStatusEnvelope(request), getCardWiringStatus(request)]);
            return wiringStatus.state === 'known-good' && !wiringStatus.hasCandidate
              && wiringStatus.cardId === trial.prepared.cardId && wiringStatus.buildId === trial.prepared.buildId
              && read.buildId === trial.prepared.buildId
              && wiringStatus.wiringRevision === trial.prepared.config.wiringRevision
              && wiringStatus.wiringDigest === trial.prepared.config.wiringDigest
              && verifyCardDeployment(trial.prepared, read, { requireReady: true }).ok
              && sameReplacementOutputs(trial.outputs, wiringStatus.outputs) ? read : null;
          },
        });
        if (!verified) throw new Error(CONFIRMATION_UNVERIFIED);
        reportCardStatusEnvelope({ ...trial.options, status: verified });
        setReadBack({ cardId, bootId: verified.bootId, fingerprint: verified.projectFingerprint, outputs: trial.outputs });
        const saved = `${formatGpio(trial.target)} saved and verified on the card.`;
        try {
          currentProject(trial);
          let layoutUpdated = trial.plannedPin === trial.target;
          if (trial.designSlot) {
            const result = trial.updateWiring(draft => {
              const output = draft.outputs.find(item => item.id === trial.designSlot.id);
              output.pin = trial.target;
            }, { changeKind: 'gpio', runIds: trial.designSlot.runIds });
            layoutUpdated = result.ok;
          }
          setPortRoles(trial.nextRoles);
          onRoles(writeDiscoveredPortRoles(trial.nextRoles));
          setStatus(layoutUpdated ? saved : `${saved} Review the different pin in Layout before reinstalling.`);
        } catch {
          setStatus(`${saved} The open project changed during confirmation. Reopen the installed project to update its records.`);
        }
      }
      trial.release();
      trialRef.current = null;
      setPhase(keep ? 'saved' : 'pick');
      if (keep) onSaved?.();
    } catch (failure) {
      setStatus('');
      let detail = failure.message;
      if (cardContactLost(failure)) {
        if (!keep) {
          detail = `Studio lost contact before it could verify the previous setup. ${KEEP_CARD_POWERED} Restore previous setup.`;
        } else if (trial.confirmSent) {
          detail = CONFIRMATION_UNVERIFIED;
        } else {
          detail = `Studio verified the light test, then lost contact before sending confirmation. ${KEEP_CARD_POWERED} Restore previous setup.`;
        }
      }
      setError(detail);
      setPhase('testing');
    } finally {
      runningRef.current = false;
    }
  };

  useEffect(() => {
    if (phase === 'saved') flushProjectAutosave();
  }, [phase, flushProjectAutosave]);

  if (selectedPin.old == null) {
    if (!showSlots) return null;
    if (!seen.length) {
      return phase === 'saved' && status
        ? <p role="status" data-testid="replacement-status">{status}</p>
        : null;
    }
    return (
      <section className="strip-discovery-step" data-testid="replacement-slots" aria-label="Configured outputs">
        <h3 ref={headingRef} tabIndex={-1} data-light-check-heading>Configured pins</h3>
        {status && <p role="status" data-testid="replacement-status">{status}</p>}
        <ul className="strip-discovery-configured-list">
          {seen.map(output => {
            const pin = output.pin;
            const label = formatGpio(pin);
            const lastCount = lastCounts.get(pin);
            return (
              <li key={output.id}>
                <div className="strip-discovery-configured-pin">
                  <strong>{label}</strong>
                  {lastCount > 0 && <small>Last counted: {lastCount}</small>}
                </div>
                <div className="strip-discovery-configured-actions">
                  <button type="button" className="btn" aria-label={`Test ${label}`}
                    data-testid={`discovery-probe-${pin}`} data-pin={pin} aria-pressed={testedPin === pin}
                    disabled={probeBusy || !testablePins.includes(pin)} onClick={() => onTestPin(pin)}>Test</button>
                  <button type="button" className="btn btn-ghost" aria-label={`Replace ${label}`} data-replace-pin={pin} disabled={probeBusy} onClick={() => {
                    setTargetPin(choose(pin));
                    setStatus('');
                    setError('');
                    setPhase('pick');
                  }}>Replace</button>
                </div>
              </li>
            );
          })}
        </ul>
      </section>
    );
  }

  return (
    <section className="strip-discovery-step" aria-label="Replace configured output" data-testid="replacement-flow" ref={sectionRef}>
      <h3 ref={headingRef} tabIndex={-1} data-light-check-heading>Replace {formatGpio(selectedPin.old)}</h3>
      {slot && <p className="strip-discovery-note">Keeps the card’s {slot.pixels}-LED setting.</p>}
      {status && <p role="status" data-testid="replacement-status">{status}</p>}
      {error && <p role="alert" data-testid="replacement-error">{error}</p>}
      {phase === 'pick' && <>
        {!connected ? <p>Connect the paired card to see its configured pins.</p>
          : stalePin ? <p>This pin is not configured on the connected card.</p>
          : !slot ? <p>Studio has not verified the card’s configured pins yet.</p>
          : !eligible ? <p>Connect the card and open its installed project to replace a pin.</p>
            : !matching ? <p>The design and card have different output slots. Review the wiring plan first.</p>
              : pins === null ? <p>Studio has no verified pin list for this card. <a href="#screen=layout&mode=draw&panel=specs">Open the wiring plan and scan the board.</a></p>
                : !unusedPins.length ? <p>No free LED output pin is available on this card.</p>
                  : <label>New pin{' '}
                    <select ref={selectRef} data-light-check-action value={target} onChange={event => setTargetPin(event.target.value ? Number(event.target.value) : '')}>
                      <option value="">Choose a pin</option>
                      {unusedPins.map(pin => <option key={pin} value={pin}>{formatGpio(pin)}</option>)}
                    </select>
                  </label>}
        <div className="strip-discovery-actions">
          {!stalePin && <button type="button" className="btn primary" data-testid="replacement-test" disabled={!eligible || !matching || !unusedPins.includes(target)}
            onClick={() => void start()}>Test replacement</button>}
          <button type="button" className={stalePin ? 'btn primary' : 'btn btn-ghost'}
            data-light-check-cancel onClick={cancel}>
            {stalePin ? 'Show configured outputs' : 'Cancel'}
          </button>
        </div>
      </>}
      {phase === 'testing' && <>
        <p>
          Each output shows blue first, green in the middle, red last. Check those lights on the strip you moved to {formatGpio(trialRef.current?.target)}.
          {trialRef.current?.designSlot ? ' Keeping it also updates the pin in Layout.'
            : trialRef.current?.plannedPin !== trialRef.current?.target ? ' Layout keeps its planned pin.' : ''}
        </p>
        <div className="strip-discovery-actions">
          <button type="button" className="btn primary" ref={keepButtonRef} data-light-check-action onClick={() => void finish(true)}>
            {trialRef.current?.confirmSent ? 'Check saved wiring' : 'Keep this pin'}
          </button>
          <button type="button" className="btn" onClick={() => void finish(false)}>Restore previous setup</button>
          {error && <button type="button" className="btn btn-ghost" onClick={() => {
            trialRef.current?.release();
            trialRef.current = null;
            setPhase('pick');
            setTargetPin(null);
            close();
          }}>Back to pin check</button>}
        </div>
      </>}
    </section>
  );
}
