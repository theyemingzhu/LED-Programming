import { formatGpio } from '../../../lib/cardPinout.js';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useProject } from '../../../state/ProjectContext.jsx';
import { CARD_HARDWARE_CAPABILITIES } from '../../../lib/cardRuntimeContract.js';
import { normalizeCardLedType } from '../../../lib/cardHardwareContract.js';
import { DEFAULT_STANDALONE_LED } from '../../../lib/standaloneController.js';
import { LedChipsetSelect } from '../shared/LedChipsetSelect.jsx';
import { WireHoverDescription } from '../shared/WireHoverDescription.jsx';
import { WiringAssemblyMap } from '../wire/WiringAssemblyMap.jsx';
import { InstallerWiringSheetButton } from '../wire/InstallerWiringSheet.jsx';
import { WireDiscovery } from '../wire/WireDiscovery.jsx';
import { CardPinMap } from '../../card/CardPinMap.jsx';
import { activeBoardGpios, assignWiringRunToPin, BOARD_CONTROL_FIELDS, planBoardGpioAssignment } from '../../../lib/gpioAssignments.js';
import { designPixelTotal } from '../../../lib/designCapacity.js';
import { WIRING_DISCOVERY_LINK, WiringPinEvidence, WiringReplacementLinks, wiringPinEvidence } from '../../card/WiringPinEvidence.jsx';
import { estimatePowerBudget } from '../../../lib/controllerProfiles.js';
import { readPowerSupplySettings, withPowerSupplySettings } from '../../../lib/powerSupplySettings.js';
import { estimateWiringFrameTiming } from '../../../lib/wiringFrameTiming.js';
import { useWiringCard } from './useWiringCard.js';
import '../../../styles/lw-wire.css';

const nextRunId = (runs, prefix) => {
  const ids = new Set(runs.map(run => run.id));
  let index = 1;
  while (ids.has(`${prefix}-${index}`)) index += 1;
  return `${prefix}-${index}`;
};
const parsePositive = (raw, fallback) => {
  const value = Number.parseFloat(raw);
  return Number.isFinite(value) && value > 0 ? value : fallback;
};

export function WirePlanTools({ state, cardHost, onAttentionChange, openOnEntry = false }) {
  const advancedToolsRef = useRef(null);
  useEffect(() => {
    if (openOnEntry && advancedToolsRef.current) advancedToolsRef.current.open = true;
  }, [openOnEntry]);
  const {
    strips, selStripId, pxPerMm,
    selectedWireCut, nudgeSelectedWireCut, deleteSelectedWireCut,
    wireOverlayMode, setWireOverlayMode,
    setDrawMode, setGhostPt,
  } = state;
  const {
    wiring, updateWiring, compiledWiring,
    standaloneController, setStandaloneController, portRoles, projectId, origin,
  } = useProject();
  const ledType = normalizeCardLedType(standaloneController?.led?.type, DEFAULT_STANDALONE_LED.type);
  const setLedType = useCallback(nextType => {
    const type = normalizeCardLedType(nextType, DEFAULT_STANDALONE_LED.type);
    setStandaloneController(current => ({
      ...current,
      led: { ...(current?.led || {}), type },
    }));
  }, [setStandaloneController]);
  const [mutationError, setMutationError] = useState('');
  const [showAssembly, setShowAssembly] = useState(false);
  const [pinError, setPinError] = useState('');
  const [selectedCustomRunId, setSelectedCustomRunId] = useState('');
  const [selectedOutputId, setSelectedOutputId] = useState('');
  const [remappedOutput, setRemappedOutput] = useState(null);
  const [psuAmpsDraft, setPsuAmpsDraft] = useState(() => String(readPowerSupplySettings(standaloneController).psuAmps));
  const [milliampsDraft, setMilliampsDraft] = useState(() => String(readPowerSupplySettings(standaloneController).milliampsPerPixel));
  const stripsById = useMemo(() => new Map(strips.map(strip => [strip.id, strip])), [strips]);
  const runsById = useMemo(() => new Map(wiring.runs.map(run => [run.id, run])), [wiring.runs]);
  const mutate = (callback, options = {}) => {
    const result = updateWiring(callback, options);
    if (!result.ok) setMutationError(result.errors?.[0]?.message || 'Wiring change rejected.');
    else setMutationError('');
    return result;
  };

  const addInactive = () => mutate(draft => {
    const id = nextRunId(draft.runs, 'reserved');
    draft.runs.push({ id, type: 'inactive', count: 1, verified: false });
    draft.outputs[0].runIds.push(id);
  }, { changeKind: 'route' });

  const { availablePins: availableOutputPins, cardId: liveCardId,
    capacity: outputCapacity, maxOutputs, link } = useWiringCard();
  const pinEvidence = wiringPinEvidence({ wiring, compiledWiring, portRoles, cardLink: link, projectId, origin });
  const tooManyOutputs = outputCapacity && wiring.outputs.length > maxOutputs;
  const { minimumFrameDataMs } = estimateWiringFrameTiming(compiledWiring);
  const selectedOutput = wiring.outputs.find(output => output.id === selectedOutputId) || wiring.outputs[0];

  const changeOutputPin = (outputId, pin) => {
    const plan = planBoardGpioAssignment({
      outputs: wiring.outputs,
      controls: standaloneController?.controls,
      target: { kind: 'output', id: outputId }, pin,
      supportedOutputPins: availableOutputPins,
    });
    if (!plan.ok) { setPinError(plan.error); return plan; }
    setPinError('');
    const previous = wiring.outputs.find(output => output.id === outputId);
    const result = mutate(draft => {
      const output = draft.outputs.find(item => item.id === outputId);
      const planned = plan.outputs.find(item => item.id === outputId);
      if (output && planned) output.pin = planned.pin;
    }, { changeKind: 'gpio' });
    if (result.ok && previous?.pin !== pin) setRemappedOutput({ id: outputId, from: previous.pin, to: pin });
    return result;
  };

  const changeControlPin = (key, pin) => {
    const plan = planBoardGpioAssignment({
      outputs: wiring.outputs,
      controls: standaloneController?.controls,
      target: { kind: 'control', key }, pin,
      supportedOutputPins: CARD_HARDWARE_CAPABILITIES.supportedOutputPins,
    });
    if (!plan.ok) { setPinError(plan.error); return; }
    const result = setStandaloneController(previous => ({ ...previous, controls: plan.controls }));
    if (result?.ok === false) setPinError(result.errors?.[0]?.message || 'Pin change rejected.');
    else setPinError('');
  };

  const unlockWiring = () => mutate(draft => {
    draft.locked = false;
    draft.verified = false;
    draft.runs.forEach(run => { run.verified = false; });
  }, { changeKind: null });

  // Canvas overlay tool for the specialist split workflow.
  const toggleSplitTool = () => {
    setDrawMode(false);
    setGhostPt(null);
    setWireOverlayMode(mode => mode === 'chop' ? 'idle' : 'chop');
  };

  const selectedStripRuns = useMemo(
    () => wiring.runs.filter(run => run.type === 'strip' && run.source.stripId === selStripId),
    [wiring.runs, selStripId],
  );
  const selectedRun = selectedStripRuns.find(run => run.id === selectedCustomRunId) || selectedStripRuns[0];
  useEffect(() => {
    setSelectedCustomRunId(current => selectedStripRuns.some(run => run.id === current) ? current : selectedStripRuns[0]?.id || '');
  }, [selectedStripRuns]);
  const selectedRunPlacement = useMemo(() => {
    if (!selectedRun) return null;
    const output = wiring.outputs.find(item => item.runIds.includes(selectedRun.id));
    const index = output?.runIds.indexOf(selectedRun.id) ?? -1;
    if (!output || index < 0) return null;
    const followingRun = output.runIds
      .slice(index + 1)
      .map(id => runsById.get(id))
      .find(run => run && run.type !== 'cable');
    const hasImmediateCable = runsById.get(output.runIds[index + 1])?.type === 'cable';
    return { output, canAddCable: Boolean(followingRun && !hasImmediateCable) };
  }, [selectedRun, wiring.outputs, runsById]);
  const selectedRunOutput = selectedRunPlacement?.output;
  const controlPins = new Set(activeBoardGpios([], standaloneController?.controls).map(item => item.pin));
  const canAddRunOutput = wiring.outputs.length < maxOutputs || selectedRunOutput?.runIds.length <= 1;
  const runPinChoices = CARD_HARDWARE_CAPABILITIES.supportedOutputPins.map(pin => ({
    pin,
    disabled: pin !== selectedRunOutput?.pin && (!availableOutputPins.includes(pin) || controlPins.has(pin)
      || (!canAddRunOutput && !wiring.outputs.some(output => output.pin === pin))),
  }));
  const changeSelectedRunPin = pin => {
    if (!selectedRun) return;
    return mutate(draft => assignWiringRunToPin(draft, {
      runId: selectedRun.id,
      pin,
      controls: standaloneController?.controls,
      supportedOutputPins: availableOutputPins,
      maxOutputs,
    }), { changeKind: 'gpio' });
  };
  const runName = run => run?.type === 'strip'
    ? (stripsById.get(run.source.stripId)?.name || run.source.stripId)
    : run?.type === 'inactive' ? 'Reserved LEDs' : run?.id || 'Unknown run';
  const cableJumps = useMemo(() => wiring.outputs.flatMap(output => output.runIds.flatMap((runId, index) => {
    const run = runsById.get(runId);
    if (run?.type !== 'cable') return [];
    const previousRun = output.runIds.slice(0, index).reverse().map(id => runsById.get(id)).find(item => item && item.type !== 'cable');
    const followingRun = output.runIds.slice(index + 1).map(id => runsById.get(id)).find(item => item && item.type !== 'cable');
    return [{ run, previousRun, followingRun }];
  })), [wiring.outputs, runsById]);
  const addCableJump = () => {
    if (!selectedRunPlacement?.canAddCable) return;
    mutate(draft => {
      const output = draft.outputs.find(item => item.id === selectedRunPlacement.output.id);
      const outputIndex = output?.runIds.indexOf(selectedRun.id) ?? -1;
      if (!output || outputIndex < 0) throw new Error('Select a strip that is followed by another physical run.');
      const followingRun = output.runIds.slice(outputIndex + 1)
        .map(id => draft.runs.find(run => run.id === id))
        .find(run => run && run.type !== 'cable');
      if (!followingRun || draft.runs.find(run => run.id === output.runIds[outputIndex + 1])?.type === 'cable') {
        throw new Error('This strip does not have an available following run.');
      }
      const id = nextRunId(draft.runs, 'cable-jump');
      const cable = { id, type: 'cable', verified: false };
      const runIndex = draft.runs.findIndex(run => run.id === selectedRun.id);
      draft.runs.splice(runIndex + 1, 0, cable);
      output.runIds.splice(outputIndex + 1, 0, id);
    }, { changeKind: 'route' });
  };
  const removeCableJump = runId => mutate(draft => {
    draft.runs = draft.runs.filter(run => run.id !== runId);
    draft.outputs.forEach(output => { output.runIds = output.runIds.filter(id => id !== runId); });
  }, { changeKind: 'route' });
  const boardAssignments = activeBoardGpios(wiring.outputs, standaloneController?.controls);
  const unavailablePinsFor = owner => boardAssignments.filter(item => item.owner !== owner).map(item => item.pin);
  const controlPinValue = field => field.path.reduce((value, part) => value?.[part], standaloneController?.controls) ?? -1;
  const derivedCut = selectedWireCut || (() => {
    const cuts = wiring.runs
      .filter(run => run.type === 'strip')
      .map(run => ({ stripId: run.source.stripId, cutLed: run.source.to }))
      .filter(cut => stripsById.get(cut.stripId) && cut.cutLed < stripsById.get(cut.stripId).pixelCount - 1)
      .sort((a, b) => a.cutLed - b.cutLed);
    return cuts[0] || null;
  })();
  const splitStripIds = useMemo(() => {
    const seen = new Set();
    const split = new Set();
    wiring.runs.forEach(run => {
      if (run.type !== 'strip') return;
      if (seen.has(run.source.stripId)) split.add(run.source.stripId);
      else seen.add(run.source.stripId);
    });
    return split;
  }, [wiring.runs]);
  const updateSelectedRange = (field, value) => mutate(draft => {
    const run = draft.runs.find(item => item.id === selectedRun?.id);
    if (run?.type === 'strip') run.source[field] = Math.max(0, Math.trunc(Number(value) || 0));
  }, { changeKind: 'seam', runIds: selectedRun ? [selectedRun.id] : [] });

  // Same worst-case basis as the Size & Power "Max draw" tile (full white,
  // user-set supply settings) so the two panels never disagree about amps.
  const powerSettings = readPowerSupplySettings(standaloneController);
  const powerEstimate = useMemo(() => estimatePowerBudget({
    led: { length: compiledWiring.totalPixels, maxBrightness: 255 },
    power: powerSettings,
  }), [compiledWiring.totalPixels, powerSettings.psuAmps, powerSettings.milliampsPerPixel]);
  // Project hydration can land after mount (autosave/import load): follow the
  // stored settings unless the draft already parses to the same value, so
  // mid-typing edits are never clobbered.
  useEffect(() => {
    setPsuAmpsDraft(current => parsePositive(current, null) === powerSettings.psuAmps ? current : String(powerSettings.psuAmps));
    setMilliampsDraft(current => parsePositive(current, null) === powerSettings.milliampsPerPixel ? current : String(powerSettings.milliampsPerPixel));
  }, [powerSettings.psuAmps, powerSettings.milliampsPerPixel]);
  const psuAmps = parsePositive(psuAmpsDraft, powerSettings.psuAmps);
  const milliampsPerPixel = parsePositive(milliampsDraft, powerSettings.milliampsPerPixel);
  const persistPowerSettings = next => setStandaloneController(previous => withPowerSupplySettings(previous, {
    psuAmps,
    milliampsPerPixel,
    ...next,
  }));
  const designPixels = designPixelTotal(strips);
  const showCountComparison = pinEvidence.lastCount > 0 && pinEvidence.lastCount !== designPixels;
  const needsAttention = pinEvidence.hasMismatch
    || powerEstimate.status === 'over'
    || tooManyOutputs
    || Boolean(mutationError || pinError);
  useEffect(() => {
    onAttentionChange?.(needsAttention);
  }, [needsAttention, onAttentionChange]);

  return (
    <WireHoverDescription className="lw-wire-path is-embedded la-wire-panel" data-testid="layout-wire-tools">
      <section className="wire-discovered-list" aria-label="Wiring evidence">
        <WiringPinEvidence evidence={pinEvidence}>
          {showCountComparison && (
            <p className="wire-capacity-line" data-testid="wire-capacity">
              Design: {designPixels.toLocaleString()} LEDs · Last counted: {pinEvidence.lastCount.toLocaleString()} LEDs
            </p>
          )}
          {(pinEvidence.plannedPins.size > 0 || pinEvidence.lastCount > 0) && (
            <div className="wiring-pin-actions">
              <a className="btn" data-testid="wire-recount" href={WIRING_DISCOVERY_LINK}>Scan pins</a>
              <WiringReplacementLinks slots={pinEvidence.replaceSlots} />
            </div>
          )}
        </WiringPinEvidence>
      </section>
      <p className="wire-capacity-line" data-testid="wire-full-white">Full white estimate: {powerEstimate.maxAmps.toFixed(2)} A</p>
      {powerEstimate.status === 'over' && (
        <p className="lww-power-warning" role="alert">
          Needs {powerEstimate.maxAmps.toFixed(1)} A at full white — your supply is {powerSettings.psuAmps} A.
        </p>
      )}

      {mutationError && <p className="lw-wiring-error" role="alert">{mutationError}</p>}
      {pinError && <p className="lw-wiring-error" role="alert">{pinError}</p>}
      {tooManyOutputs && <p className="wire-capacity-line" role="alert">
        This design uses {wiring.outputs.length} LED outputs. The connected card supports up to {outputCapacity.maxOutputs}.
      </p>}
      {wiring.locked && (
        <div className="lww-unlock">
          <span>Wiring locked after the check — unlocking clears the verification.</span>
          <button type="button" className="btn" data-testid="unlock-wiring" title="Reopen wiring edits and clear the completed verification before changing connections." data-tooltip="Reopen wiring edits and clear the completed verification before changing connections." onClick={unlockWiring}>Unlock to edit</button>
        </div>
      )}
      {selectedOutput && <div className="lww-output-pin-editor">
        <label>Output <select aria-label="LED output to move" value={selectedOutput.id} onChange={event => setSelectedOutputId(event.target.value)}>
          {wiring.outputs.map(output => <option key={output.id} value={output.id}>{output.name}</option>)}
        </select></label>
        <label>Planned pin <select aria-label="Pin for LED output" value={selectedOutput.pin} disabled={wiring.locked}
                             onChange={event => changeOutputPin(selectedOutput.id, Number(event.target.value))}>
          {CARD_HARDWARE_CAPABILITIES.supportedOutputPins.map(pin => <option key={pin} value={pin} disabled={pin !== selectedOutput.pin
            && (!availableOutputPins.includes(pin) || unavailablePinsFor(`output:${selectedOutput.id}`).includes(pin))}>{pin}</option>)}
        </select></label>
      </div>}
      {remappedOutput && selectedOutput?.id === remappedOutput.id && selectedOutput.pin === remappedOutput.to && (
        <p className="wire-capacity-line" role="status">{selectedOutput.name} moved from {formatGpio(remappedOutput.from)} to {formatGpio(remappedOutput.to)} in the design.</p>
      )}
      <InstallerWiringSheetButton />

      <details ref={advancedToolsRef} className="lww-tools-panel" data-testid="advanced-installation-tools" aria-label="Wiring & hardware">
        <summary className="panel-head">
          <span className="ttl">Wiring &amp; hardware</span>
        </summary>
        <div className="lww-advanced-tools-body">
          <div className="la-led-chipset-row" data-testid="project-led-chipset">
            <LedChipsetSelect value={ledType} onChange={setLedType}/>
          </div>
          <p className="wire-capacity-line" data-testid="wire-output-capacity">
            {wiring.outputs.length} LED {wiring.outputs.length === 1 ? 'output' : 'outputs'} · {outputCapacity ? 'Card supports' : 'Design supports'} up to {maxOutputs}
          </p>
          {minimumFrameDataMs > 0 && <p className="wire-capacity-line">
            {compiledWiring.totalPixels.toLocaleString()} LEDs · {minimumFrameDataMs.toFixed(1)} ms minimum data time per frame
          </p>}
          <CardPinMap testId="wire-pin-map" title="Planned output pins" cardId={liveCardId} outputCapabilities={outputCapacity} outputs={wiring.outputs} controls={standaloneController?.controls} availablePins={availableOutputPins} lit={wiring.outputs.map((output, index) => ({ pin: output.pin, tag: String(index + 1), name: `Port ${index + 1}` }))}/>
          <WireDiscovery outputs={wiring.outputs} controls={standaloneController?.controls} cardHost={cardHost} cardId={liveCardId} outputCapabilities={outputCapacity} disabled={wiring.locked} onPinConfirmed={changeOutputPin}/>
          {compiledWiring.sendReady && <button className="btn lw-open-assembly" title="Show or hide the assembly map used to build the verified LED wiring." data-tooltip="Show or hide the assembly map used to build the verified LED wiring." onClick={() => setShowAssembly(value => !value)}>{showAssembly ? 'Hide assembly map' : 'Open assembly map'}</button>}
          {showAssembly && compiledWiring.sendReady && <WiringAssemblyMap wiring={wiring} compiled={compiledWiring} strips={strips} physicalScale={Number(pxPerMm) > 0 ? { pxPerMm: Number(pxPerMm) } : null} onClose={() => setShowAssembly(false)}/>}
          <details className="lww-custom-mapping">
            <summary>Advanced mapping</summary>
            <div className="lww-specialist-actions">
              <button className="btn" disabled={wiring.locked} aria-pressed={wireOverlayMode === 'chop'} title="Turn on the canvas tool for dividing the selected LED strip at a physical cut point." data-tooltip="Turn on the canvas tool for dividing the selected LED strip at a physical cut point." onClick={toggleSplitTool}>Split a strip mid-wire</button>
              <button
                className="btn"
                disabled={wiring.locked || !selectedRunPlacement?.canAddCable}
                title={selectedRunPlacement?.canAddCable ? 'Insert an unlit cable section after the selected strip without consuming LED addresses.' : 'Select a strip that has another physical run after it.'}
                data-tooltip={selectedRunPlacement?.canAddCable ? 'Insert an unlit cable section after the selected strip without consuming LED addresses.' : 'Select a strip that has another physical run after it.'}
                onClick={addCableJump}
              >Add a cable jump</button>
            </div>
            {cableJumps.length > 0 && (
              <div className="lww-cable-jumps" aria-label="Cable jumps">
                {cableJumps.map(({ run, previousRun, followingRun }) => (
                  <div className="lww-cable-jump-row" data-testid="cable-jump-row" key={run.id}>
                    <span><strong>Cable jump</strong><small>{runName(previousRun)} → {runName(followingRun)}</small></span>
                    <button type="button" className="btn btn-ghost" disabled={wiring.locked} aria-label="Remove cable jump" title="Remove this cable section so the neighboring physical runs connect directly in the plan." data-tooltip="Remove this cable section so the neighboring physical runs connect directly in the plan." onClick={() => removeCableJump(run.id)}>Remove</button>
                  </div>
                ))}
              </div>
            )}
            <div className="lw-wiring-additions">
              <button className="btn" disabled={wiring.locked} aria-label="Add skipped LEDs" title="Reserve an unlit LED position in the output order for LEDs that are intentionally skipped." data-tooltip="Reserve an unlit LED position in the output order for LEDs that are intentionally skipped." onClick={addInactive}>Add skipped LEDs</button>
            </div>
            {derivedCut && (
              <section className="lw-wire-selected-detail">
                <div className="lw-wire-section-title"><span>Selected split</span><strong>LED {derivedCut.cutLed}</strong></div>
                <div className="lw-wire-tool-row">
                  <button className="btn" disabled={wiring.locked} aria-label="Move split earlier" title="Move this split one LED toward the start of the strip." data-tooltip="Move this split one LED toward the start of the strip." onClick={() => nudgeSelectedWireCut(-1, derivedCut)}>−</button>
                  <button className="btn" disabled={wiring.locked} aria-label="Move split later" title="Move this split one LED toward the end of the strip." data-tooltip="Move this split one LED toward the end of the strip." onClick={() => nudgeSelectedWireCut(1, derivedCut)}>+</button>
                  <button className="btn" disabled={wiring.locked} aria-label="Merge split runs" title="Rejoin the split sections into one continuous LED run." data-tooltip="Rejoin the split sections into one continuous LED run." onClick={() => deleteSelectedWireCut(derivedCut)}>Merge</button>
                  <button className="btn lw-btn-danger" disabled={wiring.locked} aria-label="Delete split" title="Remove this split and merge its LED sections back together." data-tooltip="Remove this split and merge its LED sections back together." onClick={() => deleteSelectedWireCut(derivedCut)}>Delete</button>
                </div>
              </section>
            )}
            {selectedRun?.type === 'strip' && splitStripIds.has(selectedRun.source.stripId) && (
              <div className="lw-wiring-range">
              <strong>Custom source range</strong>
              <label>Physical run
                <select aria-label="Physical run" value={selectedRun.id} onChange={event => setSelectedCustomRunId(event.target.value)}>
                  {selectedStripRuns.map(run => <option key={run.id} value={run.id}>LEDs {run.source.from}–{run.source.to}</option>)}
                </select>
              </label>
              <label>GPIO output for this run
                <select aria-label="GPIO for selected run" value={selectedRunOutput?.pin ?? ''} disabled={wiring.locked || !selectedRunOutput}
                        onChange={event => changeSelectedRunPin(Number(event.target.value))}>
                  {runPinChoices.map(choice => <option key={choice.pin} value={choice.pin} disabled={choice.disabled}>GPIO {choice.pin}</option>)}
                </select>
              </label>
              <label>Start LED <input type="number" min="0" disabled={wiring.locked} value={selectedRun.source.from} onChange={event => updateSelectedRange('from', event.target.value)}/></label>
              <label>End LED <input type="number" min="0" disabled={wiring.locked} value={selectedRun.source.to} onChange={event => updateSelectedRange('to', event.target.value)}/></label>
              <label>Direction policy
                <select disabled={wiring.locked} value={selectedRun.directionPolicy} onChange={event => mutate(draft => {
                  const run = draft.runs.find(item => item.id === selectedRun.id);
                  if (run?.type === 'strip') run.directionPolicy = event.target.value;
                }, { changeKind: 'direction', runIds: [selectedRun.id] })}>
                  <option value="flexible">Flexible</option>
                  <option value="fixed">Fixed</option>
                </select>
              </label>
              <label>Physical DATA IN
                <select disabled={wiring.locked || selectedRun.directionPolicy === 'fixed'} value={selectedRun.physicalDirection} onChange={event => mutate(draft => {
                  const run = draft.runs.find(item => item.id === selectedRun.id);
                  if (run?.type === 'strip') run.physicalDirection = event.target.value;
                }, { changeKind: 'direction', runIds: [selectedRun.id] })}>
                  <option value="source-forward">Start LED</option>
                  <option value="source-reverse">End LED</option>
                </select>
              </label>
              <label>Connector seam LED
                <input type="number" min={selectedRun.source.from} max={selectedRun.source.to}
                       disabled={wiring.locked || selectedRun.verified || selectedRun.directionPolicy === 'fixed'}
                       value={selectedRun.seamLed ?? selectedRun.source.from}
                       onChange={event => mutate(draft => {
                         const run = draft.runs.find(item => item.id === selectedRun.id);
                         if (!run || run.verified || run.directionPolicy === 'fixed') throw new Error('Verified or fixed connector seams cannot move.');
                         run.seamLed = Math.max(run.source.from, Math.min(run.source.to, Math.trunc(Number(event.target.value))));
                       }, { changeKind: 'seam', runIds: [selectedRun.id] })}/>
              </label>
              </div>
            )}
          </details>
          <details className="lww-card-hardware" data-testid="wire-power-section">
            <summary>Hardware &amp; power</summary>
            <div className="lw-pin-group">
              <strong>Physical controls</strong>
              {BOARD_CONTROL_FIELDS.map(field => <label key={field.key}>{field.label}
                <select aria-label={`${field.label} pin`} value={controlPinValue(field)} disabled={wiring.locked} onChange={event => changeControlPin(field.key, Number(event.target.value))}>
                  {field.allowOff && <option value={-1}>Off</option>}
                  {Array.from({ length: 49 }, (_, pin) => <option key={pin} value={pin} disabled={pin !== controlPinValue(field) && unavailablePinsFor(`control:${field.key}`).includes(pin)}>GPIO {pin}</option>)}
                </select>
              </label>)}
            </div>
            <div className="lww-power-fields">
              <label>Power supply amps
                <input type="number" min="0.5" step="0.5" inputMode="decimal"
                       value={psuAmpsDraft} aria-label="Power supply amps"
                       onFocus={event => event.target.select()}
                       onChange={event => {
                         setPsuAmpsDraft(event.target.value);
                         const value = Number.parseFloat(event.target.value);
                         if (Number.isFinite(value) && value > 0) persistPowerSettings({ psuAmps: value });
                       }}
                       onBlur={() => setPsuAmpsDraft(String(psuAmps))}/>
              </label>
              <label>Milliamps per LED
                <input type="number" min="1" step="1" inputMode="numeric"
                       value={milliampsDraft} aria-label="Milliamps per LED"
                       onFocus={event => event.target.select()}
                       onChange={event => {
                         setMilliampsDraft(event.target.value);
                         const value = Number.parseFloat(event.target.value);
                         if (Number.isFinite(value) && value > 0) persistPowerSettings({ milliampsPerPixel: value });
                       }}
                       onBlur={() => setMilliampsDraft(String(milliampsPerPixel))}/>
              </label>
            </div>
            <p className={`lww-power-headroom${powerEstimate.status === 'over' ? ' is-over' : ''}`}>
              {powerEstimate.status === 'over'
                ? `Over by ${Math.abs(powerEstimate.headroomAmps).toFixed(1)} A`
                : `Headroom ${powerEstimate.headroomAmps.toFixed(1)} A`}
            </p>
          </details>
        </div>
      </details>
    </WireHoverDescription>
  );
}
