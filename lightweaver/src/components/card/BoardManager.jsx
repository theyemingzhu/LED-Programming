import React, { useCallback, useEffect, useRef, useState } from 'react';
import { STRIP_DISCOVERY_ROUTE } from '../../lib/cardAction.js';
import { cardConnectionOptionsFor } from '../../lib/cardConnection.js';
import { CARD_HARDWARE_CONTRACT, readCardOutputCapabilities } from '../../lib/cardHardwareContract.js';
import { readCardFirmwareInfoEnvelope } from '../../lib/cardPushClient.js';
import { selectBoardLedPins } from '../../lib/boardLedPins.js';
import { formatGpio } from '../../lib/cardPinout.js';
import { usbHardwareEvidenceForCard } from '../../lib/usbInspection.js';
import {
  BOARD_CATALOG, BOARD_VENDOR_TOOL, BOARD_PROFILE_STORAGE, BOARD_PROFILE_FILE_LIMIT,
  BOARD_LIMITS, PIN_ROLES, REFERENCE_BOARDS, boardEvidence, boardEvidenceConflicts,
  boardTitle, draftBoard, exportBoardProfile, importBoardProfile, isReferenceBoard,
  newBoardGroup, newBoardPin, readBoardLibrary, rememberBoard, rememberedBoard,
  resolveBoardMatch, storeBoardProfile, updateBoardLibrary, validateBoardProfile,
} from '../../lib/boardProfiles.js';
import { BoardDrawing } from './BoardDrawing.jsx';
import '../../styles/lw-board-manager.css';

const EMPTY_LIBRARY = { profiles: [], confirmations: {} };
const BASIC_FIELDS = [
  ['name', 'Board name', 100], ['manufacturer', 'Manufacturer', 80],
  ['pcbRevision', 'PCB revision', 48], ['supplier', 'Supplier or listing', 100],
  ['chip', 'Chip', 80], ['module', 'Module marking', 80], ['orientation', 'Map orientation', 180],
];
const CURRENT_SD = { 10: 'microSD CS', 11: 'microSD MOSI', 12: 'microSD SCK', 13: 'microSD MISO' };
const INSTALLATION_FUNCTIONS = ['LED data', ...Object.values(CURRENT_SD), 'Dial A', 'Dial B',
  'Dial press', 'Previous', 'Next', 'Blackout', 'Brightness', 'Status LED'];

function defaultInstallationRole(profile, pin) {
  return profile.id.startsWith('espressif-devkitc-1-') ? CURRENT_SD[pin.gpio] : undefined;
}

function initialLibrary() {
  try { return { library: readBoardLibrary(window.localStorage), storageError: '' }; }
  catch { return { library: EMPTY_LIBRARY, storageError: 'Studio could not read the board library in this browser.' }; }
}

function useBoardLibrary() {
  const [state, setState] = useState(initialLibrary);
  useEffect(() => {
    const refresh = event => {
      if (event.key === BOARD_PROFILE_STORAGE || event.key === null) setState(initialLibrary());
    };
    window.addEventListener('storage', refresh);
    return () => window.removeEventListener('storage', refresh);
  }, []);
  return [state, update => {
    const library = updateBoardLibrary(window.localStorage, update);
    setState({ library, storageError: '' });
    return library;
  }];
}

export function BoardManagerEntry({ cardId, onOpen }) {
  const [{ library }] = useBoardLibrary();
  const choice = rememberedBoard(library, cardId);
  return (
    <div className="lw-board-entry">
      <div>
        <strong>{choice?.current ? boardTitle(choice.profile) : 'Which board are you using?'}</strong>
        <span>{choice?.current ? 'Saved for this card'
          : choice ? 'The saved profile revision changed. Confirm the current version.'
            : 'Find your board and see where to plug in the LEDs.'}</span>
      </div>
      <button type="button" className="btn" onClick={onOpen}>Board Manager</button>
    </div>
  );
}

function sourceLabel(url) {
  const parsed = new URL(url);
  const filename = parsed.pathname.split('/').filter(Boolean).at(-1);
  if (parsed.hostname === 'docs.espressif.com') return 'Pinout guide';
  if (parsed.hostname === 'dl.espressif.com') return 'Schematic';
  if (filename?.endsWith('_datasheet_en.pdf')) return 'Module datasheet';
  if (filename === 'board_devices.yaml') return 'Device YAML';
  if (filename === 'board_peripherals.yaml') return 'Peripheral YAML';
  return filename || parsed.host;
}

function BoardDetails({ profile, onChange }) {
  if (!onChange) return (
    <>
      <dl className="lw-board-facts">
        {[
          ['Manufacturer', profile.manufacturer], ['PCB revision', profile.pcbRevision],
          ['Chip', profile.chip], ['Module', profile.module], ['Supplier', profile.supplier],
          ['Flash', profile.flashMb === null ? '' : `${profile.flashMb} MB`],
          ['PSRAM', profile.psramMb === null ? '' : profile.psramMb === 0 ? 'None' : `${profile.psramMb} MB`],
        ].filter(([, value]) => value).map(([label, value]) => (
          <div key={label}><dt>{label}</dt><dd>{value}</dd></div>
        ))}
      </dl>
      {profile.sources.length > 0 && (
        <ul className="lw-board-source-list" aria-label="Profile sources">
          {profile.sources.map(url => (
            <li key={url}><a href={url} target="_blank" rel="noreferrer">{sourceLabel(url)}</a></li>
          ))}
        </ul>
      )}
    </>
  );
  return (
    <div className="lw-board-fields">
      {BASIC_FIELDS.map(([key, label, max]) => (
        <label key={key} className={key === 'orientation' ? 'lw-board-wide' : undefined}>
          {label}
          <input value={profile[key]} maxLength={max} onChange={event => onChange({ [key]: event.target.value })} />
        </label>
      ))}
      {['flashMb', 'psramMb'].map(key => (
        <label key={key}>
          {key === 'flashMb' ? 'Flash (MB)' : 'PSRAM (MB, 0 for none)'}
          <input type="number" min={key === 'flashMb' ? 1 : 0} max="1024" value={profile[key] ?? ''}
            onChange={event => onChange({ [key]: event.target.value })} />
        </label>
      ))}
      <label className="lw-board-wide">Source links (one per line)
        <textarea rows={2} value={profile.sources.join('\n')}
          onChange={event => onChange({ sources: event.target.value.split('\n') })} />
      </label>
    </div>
  );
}

function pinNumber(group, index) {
  return Number(group.start) + index * Number(group.step);
}

function samePosition(a, b) {
  return Boolean(a && b && a.group === b.group && a.pin === b.pin);
}

function describePinAt(profile, position) {
  const group = profile.groups[position?.group];
  const pin = group?.pins[position?.pin];
  if (!pin) return '';
  const label = pin.gpio === null || pin.gpio === '' ? pin.label || 'unnamed pin' : formatGpio(pin.gpio);
  return `${group.name || 'New group'} pin ${pinNumber(group, position.pin)} (${label})`;
}

function BoardMap({ profile, selection, onSelect, onAddPin, onSwap, onSwapPreview, ledPins, assignments }) {
  const [swapSource, setSwapSource] = useState(null);
  const [dragTarget, setDragTarget] = useState(null);
  const gesture = useRef(null);
  const skipClick = useRef(false);
  const indexed = profile.groups.map((group, index) => ({ group, index }));
  useEffect(() => {
    if (!onSwapPreview) return;
    onSwapPreview(swapSource ? {
      source: swapSource,
      target: samePosition(swapSource, dragTarget) ? null : dragTarget,
    } : null);
  }, [swapSource, dragTarget, onSwapPreview]);
  const clearSwap = () => {
    gesture.current = null;
    setSwapSource(null);
    setDragTarget(null);
  };
  const locateTarget = event => {
    const row = document.elementFromPoint(event.clientX, event.clientY)?.closest('[data-board-pin]');
    if (!row) return null;
    const [group, pin] = row.dataset.boardPin.split(':').map(Number);
    return { group, pin };
  };
  const selectPosition = position => {
    if (swapSource) {
      if (!samePosition(position, swapSource)) onSwap(swapSource, position);
      clearSwap();
    } else {
      onSelect(position.group, position.pin);
    }
  };
  return (
    <div className="lw-board-map-set" onKeyDown={event => {
      if (event.key === 'Escape' && swapSource) clearSwap();
    }}>
      {onSwap && <p className="lw-board-muted">Select a numbered position to edit its pin. Drag the handle onto another pin, or tap the handle and then the destination. A swap exchanges the two pin records. Connector positions keep their numbers.</p>}
      {['header', 'onboard'].map(kind => {
        const groups = indexed.filter(({ group }) => group.kind === kind);
        if (!groups.length) return null;
        const paired = kind === 'header' && groups.length === 2 && groups.every(({ group }) => group.pins.length);
        const contactRows = paired ? Math.max(...groups.map(({ group }) => group.pins.length)) : 0;
        const devkitDrawing = paired && profile.chip.toUpperCase() === 'ESP32-S3'
          && groups[0].group.name === 'J1' && groups[1].group.name === 'J3'
          && groups.every(({ group }) => group.pins.length === 22);
        return (
          <div className={`lw-board-map lw-board-map-${kind}${devkitDrawing ? ' lw-board-map-with-art' : ''}`}
            data-paired={paired || undefined} key={kind} aria-label={kind === 'header' ? 'Connector map' : 'Onboard wiring'}
            style={paired ? { '--lw-board-contact-rows': contactRows, '--lw-board-connector-rows': contactRows + (onAddPin ? 2 : 1) } : undefined}>
            {devkitDrawing && <BoardDrawing chip={profile.chip} antenna />}
            {groups.map(({ group, index: groupIndex }) => (
              <section key={groupIndex} className="lw-board-connector" aria-label={group.name || 'New group'}>
                <h3>{group.name || 'New group'}</h3>
                <ol>
                  {group.pins.map((pin, index) => {
                    const number = pinNumber(group, index);
                    const position = { group: groupIndex, pin: index };
                    const label = `${group.name} ${number}: ${pin.label || 'New pin'}`;
                    const selected = samePosition(selection, position);
                    const source = samePosition(swapSource, position);
                    const installation = pin.installation || defaultInstallationRole(profile, pin);
                    const liveRole = assignments?.get(pin.gpio);
                    const ledPin = ledPins?.includes(pin.gpio);
                    const ledLabel = ledPin && !liveRole && !installation ? 'LED data' : '';
                    const usage = liveRole || (installation && `Lightweaver ${installation}`) || ledLabel;
                    return (
                      <li key={index} value={number} data-board-pin={`${groupIndex}:${index}`}
                        data-swap-source={source || undefined} data-swap-target={samePosition(dragTarget, position) || undefined}>
                        <button type="button" className="lw-board-contact" aria-pressed={selected} onClick={() => selectPosition(position)}
                          aria-label={`${label} · ${pin.detail || PIN_ROLES[pin.role]}${usage ? ` · ${usage}` : ''}`}>
                          {kind === 'header' && <span className="lw-board-position">{number}</span>}
                          <span className={`lw-board-pad lw-board-pad-${pin.role}${ledPin ? ' lw-board-pad-capable' : ''}`} aria-hidden="true" />
                          <strong>{pin.label || 'New pin'}</strong>
                          {(pin.role !== 'gpio' || pin.detail) && <span className="lw-board-pin-role">{pin.detail || PIN_ROLES[pin.role]}</span>}
                          {usage && <span className={ledLabel ? 'lw-board-pin-available' : 'lw-board-pin-installation'}>{usage}</span>}
                        </button>
                        {onSwap && <button type="button" className="lw-board-swap" aria-label={`Swap ${label}`} aria-pressed={source}
                          onPointerDown={event => {
                            if (!event.isPrimary || event.button !== 0) return;
                            skipClick.current = false;
                            gesture.current = { id: event.pointerId, position, x: event.clientX, y: event.clientY, moving: false };
                            event.currentTarget.setPointerCapture(event.pointerId);
                          }}
                          onPointerMove={event => {
                            const active = gesture.current;
                            if (!active || active.id !== event.pointerId) return;
                            if (!active.moving && Math.hypot(event.clientX - active.x, event.clientY - active.y) < 5) return;
                            active.moving = true;
                            setSwapSource(active.position);
                            setDragTarget(locateTarget(event));
                          }}
                          onPointerUp={event => {
                            const active = gesture.current;
                            if (!active || active.id !== event.pointerId) return;
                            gesture.current = null;
                            if (active.moving) {
                              skipClick.current = true;
                              const target = locateTarget(event);
                              if (target && !samePosition(active.position, target)) onSwap(active.position, target);
                              clearSwap();
                            }
                          }}
                          onPointerCancel={clearSwap}
                          onClick={event => {
                            if (event.detail && skipClick.current) return;
                            setSwapSource(source ? null : position);
                          }}>
                          <span aria-hidden="true">⠿</span>
                        </button>}
                      </li>
                    );
                  })}
                </ol>
                {onAddPin && (
                  <button type="button" className="btn" aria-label={`Add pin to ${group.name || 'new group'}`}
                    disabled={group.pins.length >= BOARD_LIMITS.pins} onClick={() => onAddPin(groupIndex)}>Add pin</button>
                )}
              </section>
            ))}
          </div>
        );
      })}
    </div>
  );
}

function pinProtection(profile, pin) {
  if (profile.chip.toUpperCase() !== 'ESP32-S3' || pin.gpio === null || pin.gpio === '') return '';
  const gpio = Number(pin.gpio);
  if ([0, 3, 45, 46].includes(gpio)) return 'ESP32-S3 boot strap. Keep this pin available at reset.';
  if ([19, 20].includes(gpio)) return 'ESP32-S3 native USB signals can be needed for recovery.';
  if (gpio >= 26 && gpio <= 32) return 'Check the module schematic for internal flash wiring.';
  if (gpio >= 33 && gpio <= 37) return 'Check the module schematic for internal flash or PSRAM wiring.';
  return '';
}

function PinInspector({ profile, selection, onSelectGroup, onChangeGroup, onRemoveGroup, onChangePin, onMovePin, onTransferPin, onRemovePin, ledPins, assignments }) {
  const group = profile.groups[selection.group];
  const pin = group?.pins[selection.pin];
  if (!onChangePin && !pin) return <p className="lw-board-muted">Select a position to inspect its wiring and LED output status.</p>;

  const pinHeading = pin && `${group.name || 'New group'} ${pinNumber(group, selection.pin)}`;
  if (!onChangePin) {
    const targetPin = ledPins.includes(pin.gpio);
    const usage = assignments?.get(pin.gpio);
    const installation = defaultInstallationRole(profile, pin);
    return (
      <div className="lw-board-inspector">
        <h3>{pinHeading} · {pin.label}</h3>
        <dl className="lw-board-facts">
          <div><dt>Board role</dt><dd>{pin.detail || PIN_ROLES[pin.role]}</dd></div>
          {pin.gpio !== null && <div><dt>Chip pin number</dt><dd>{pin.gpio}</dd></div>}
          {pin.installation && <div><dt>Lightweaver assignment note</dt><dd>{pin.installation}</dd></div>}
          {installation && <div><dt>Lightweaver target default</dt><dd>{installation}</dd></div>}
          <div><dt>LED output</dt><dd>{usage ? `In use for ${usage}.` : targetPin
            ? (assignments ? 'Free for LED data.' : 'Can carry LED data. Check that the pin is free before wiring.')
            : 'This pin is outside the LED pin list.'}</dd></div>
        </dl>
        {pinProtection(profile, pin) && <p className="lw-board-muted">{pinProtection(profile, pin)}</p>}
      </div>
    );
  }

  return (
    <div className="lw-board-inspector">
      {!pin && <div className="lw-board-fields">
        <label className="lw-board-wide">Pin group
          <select value={group ? selection.group : ''} onChange={event => onSelectGroup(Number(event.target.value))}>
            {!group && <option value="">Choose a group</option>}
            {profile.groups.map((entry, index) => <option key={index} value={index}>{entry.name || 'New group'}</option>)}
          </select>
        </label>
        {group && <>
          <label>Group name<input value={group.name} maxLength={48} onChange={event => onChangeGroup({ name: event.target.value })} /></label>
          <label>Group type
            <select value={group.kind} onChange={event => onChangeGroup({ kind: event.target.value })}>
              <option value="header">Header row</option>
              <option value="onboard">Onboard wiring</option>
            </select>
          </label>
          {group.kind === 'header' && <>
            <label>First position<input type="number" min="1" max="128" value={group.start} onChange={event => onChangeGroup({ start: event.target.value })} /></label>
            <label>Numbering step<input type="number" min="1" max="8" value={group.step} onChange={event => onChangeGroup({ step: event.target.value })} /></label>
          </>}
        </>}
      </div>}
      {group && group.pins.length === 0 && (
        <div className="lw-board-actions">
          <span>Use Add pin on the map to start this group.</span>
          <button type="button" className="btn" onClick={onRemoveGroup}>Remove empty group</button>
        </div>
      )}
      {pin && <>
        <h3>{pinHeading}</h3>
        <div className="lw-board-fields">
          <label>Pin label<input value={pin.label} maxLength={48} onChange={event => onChangePin({ label: event.target.value })} /></label>
          <label>Chip pin number<input type="number" min="0" max="255" value={pin.gpio ?? ''} onChange={event => onChangePin({ gpio: event.target.value })} /></label>
          <label>Board role
            <select value={pin.role} onChange={event => onChangePin({ role: event.target.value })}>
              {Object.entries(PIN_ROLES).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
            </select>
          </label>
          <label>Board signal or note<input value={pin.detail} maxLength={160} onChange={event => onChangePin({ detail: event.target.value })} /></label>
          <label>Installation function
            <select value={INSTALLATION_FUNCTIONS.includes(pin.installation) ? pin.installation : ''}
              onChange={event => onChangePin({ installation: event.target.value })}>
              <option value="">Choose a function</option>
              {INSTALLATION_FUNCTIONS.map(role => <option key={role}>{role}</option>)}
            </select>
          </label>
          <label>Lightweaver assignment note
            <input value={pin.installation} maxLength={100} onChange={event => onChangePin({ installation: event.target.value })} />
          </label>
        </div>
        {pinProtection(profile, pin) && <p className="lw-board-muted">{pinProtection(profile, pin)}</p>}
        {profile.groups.length > 1 && (
          <label className="lw-board-transfer">Move to another group
            <select value="" onChange={event => onTransferPin(Number(event.target.value))}>
              <option value="" disabled>Choose a destination</option>
              {profile.groups.map((entry, index) => index !== selection.group && (
                <option key={index} value={index} disabled={entry.pins.length >= BOARD_LIMITS.pins}>{entry.name || 'New group'}</option>
              ))}
            </select>
          </label>
        )}
        <div className="lw-board-actions">
          <button type="button" className="btn" disabled={selection.pin === 0} onClick={() => onMovePin(-1)}>Move up</button>
          <button type="button" className="btn" disabled={selection.pin === group.pins.length - 1} onClick={() => onMovePin(1)}>Move down</button>
          <button type="button" className="btn" onClick={() => onSelectGroup(selection.group)}>Edit group</button>
          <button type="button" className="btn" onClick={onRemovePin}>Remove pin</button>
        </div>
      </>}
    </div>
  );
}

function reportedAssignments(info) {
  const controls = info?.controls;
  const labels = [
    ['Dial A', controls?.encoder?.a], ['Dial B', controls?.encoder?.b],
    ['Dial press', controls?.encoder?.press], ['Alternate dial press', controls?.encoder?.effectiveAlternatePress],
    ['Previous', controls?.previous], ['Next', controls?.next], ['Blackout', controls?.blackout],
    ['Status LED', controls?.statusLed], ['Brightness', controls?.brightnessAnalog],
  ];
  return [
    ...(Array.isArray(info?.outputs) ? info.outputs.map(output => ['LED data', output?.pin ?? output?.gpio]) : []),
    ...labels,
  ].filter(([, gpio]) => Number.isInteger(gpio) && gpio >= 0);
}

function BoardMatching({ evidence, match, choice, profile, canRead, checking, readCard, openProfile, confirmProfile, onConnect }) {
  const conflicts = evidence && boardEvidenceConflicts(evidence, profile);
  const active = choice?.current && choice.profile.id === profile.id;
  const exact = match.status === 'reported' && match.profile?.id === profile.id;
  return (
    <section className="lw-board-panel lw-board-match" aria-label="Find your board">
      <div className="lw-board-title-row">
        <h2>Find your board</h2>
        {canRead ? <button type="button" className="btn" disabled={checking} onClick={readCard}>
          {checking ? 'Checking board…' : 'Check board again'}
        </button> : <button type="button" className="btn primary" onClick={onConnect}>Connect card</button>}
      </div>
      {!canRead && <p>Connect your Lightweaver card to look for a match. You can also choose a board below.</p>}
      {canRead && !evidence && checking && <p role="status">Reading your connected card.</p>}
      {evidence && <>
        {active ? <p><strong>{boardTitle(profile)}</strong> is saved for this card.</p>
          : exact ? <p>Your card reports <strong>{boardTitle(profile)}</strong>. Check its pin map, then choose <strong>Use this board</strong>.</p>
            : <p>Check the name and version printed on your board. Choose the matching map below.</p>}
        {conflicts && <p role="alert">The selected board has a different chip or memory size.</p>}
        {match.status === 'reported' && !exact && <p role="alert">Your card reports a different board. Select it below.</p>}
        {(match.status === 'review' || match.status === 'unavailable') && match.candidates.length > 0 && !active && (
          <div className="lw-board-actions" aria-label="Possible boards">
            {match.candidates.slice(0, 3).map(({ profile: candidate }) => (
              <button type="button" className="btn" key={candidate.id}
                onClick={() => openProfile(candidate.id)}>{boardTitle(candidate)}</button>
            ))}
          </div>
        )}
        {match.status === 'no-match' && <p>No saved board matches this card’s chip and memory. Add a profile for your board.</p>}
        {match.status === 'reported' && !exact && (
          <button type="button" className="btn" onClick={() => openProfile(match.profile.id)}>{boardTitle(match.profile)}</button>
        )}
        {!active && <div><button type="button" className="btn primary"
          disabled={conflicts || (match.status === 'reported' && !exact)} onClick={confirmProfile}>Use this board</button></div>}
      </>}
    </section>
  );
}

function BoardLedSummary({ pins, assignments, current, maxOutputs }) {
  const used = pins.filter(pin => assignments?.has(pin));
  const free = pins.filter(pin => !assignments?.has(pin));
  return (
    <section className="lw-board-led-summary" aria-label="LED pins">
      <div className="lw-board-title-row">
        <h3>LED pins</h3>
        {current && <div className="lw-board-actions">
          <a className="btn" href="#screen=layout&mode=draw">Open Wiring</a>
          {pins.length > 0 && <a className="btn" href={`#${STRIP_DISCOVERY_ROUTE}`}>Count LEDs</a>}
        </div>}
      </div>
      {pins.length > 0 ? <>
        <p><strong>{assignments ? 'Free now' : 'Check before use'}</strong> · {free.length ? free.map(formatGpio).join(', ') : 'No free LED pins'}</p>
        {used.length > 0 && <p><strong>In use</strong> · {used.map(pin => `${formatGpio(pin)} (${assignments.get(pin)})`).join(', ')}</p>}
        <p>{assignments
          ? `Free pins can carry LED data. This card supports up to ${maxOutputs} LED outputs.`
          : 'These pins are in the Lightweaver pin list. Check which pins are free on your card before wiring.'}</p>
      </> : <p>Check this board’s pin map and firmware before wiring an LED strip.</p>}
    </section>
  );
}

export function BoardManager({ connected, cardLink, cardHost, onOpenConnectionCenter }) {
  const [{ library, storageError }, updateLibrary] = useBoardLibrary();
  const profiles = [...REFERENCE_BOARDS, ...library.profiles];
  const liveCardId = connected ? cardLink?.card?.id || '' : '';
  const choice = rememberedBoard(library, liveCardId);
  const [selectedId, setSelectedId] = useState(() => choice?.profile.id || REFERENCE_BOARDS[1].id);
  const [draft, setDraft] = useState(null);
  const [selection, setSelection] = useState({ group: 0, pin: -1 });
  const [notice, setNotice] = useState(null);
  const [swapPreview, setSwapPreview] = useState(null);
  const [lastSwap, setLastSwap] = useState('');
  const [cardRead, setCardRead] = useState(null);
  const fileInput = useRef(null);
  const inspectorRef = useRef(null);
  const readSequence = useRef(0);
  const selectionSequence = useRef(0);
  const { host, transport } = cardConnectionOptionsFor(cardLink, cardHost);
  const cardKey = connected ? JSON.stringify([host, transport, liveCardId]) : '';
  const currentKey = useRef(cardKey);
  const lastKey = useRef(cardKey);
  currentKey.current = cardKey;
  useEffect(() => {
    if (lastKey.current !== cardKey) {
      lastKey.current = cardKey;
      readSequence.current++;
      setCardRead(null);
      if (choice?.profile.id) {
        setSelectedId(choice.profile.id);
        setSelection({ group: 0, pin: -1 });
      }
    }
  }, [cardKey, choice?.profile.id]);

  const profile = draft || profiles.find(item => item.id === selectedId) || REFERENCE_BOARDS[1];
  const reference = isReferenceBoard(profile.id);
  const baseline = profile.id.startsWith('espressif-devkitc-1-');
  const liveRead = cardRead?.key === cardKey ? cardRead : null;
  const evidence = liveRead?.evidence || null;
  const match = resolveBoardMatch(profiles, evidence, choice);
  const confirmed = choice?.current && choice.profile.id === profile.id;
  const exact = match.status === 'reported' && match.profile?.id === profile.id;
  const linkedProfile = confirmed || exact;
  const assignments = linkedProfile ? liveRead?.assignments : null;
  const firmwarePins = linkedProfile && liveRead ? liveRead.firmwarePins : null;
  const ledPins = selectBoardLedPins({ profile, firmwarePins: firmwarePins ?? (linkedProfile || baseline ? CARD_HARDWARE_CONTRACT.outputPins : []) });
  const choose = id => {
    selectionSequence.current++;
    setSelectedId(id);
    setSelection({ group: 0, pin: -1 });
    setNotice(null);
    setSwapPreview(null);
    setLastSwap('');
  };
  const selectPin = (group, pin) => {
    setSelection({ group, pin });
    const inspector = inspectorRef.current;
    if (inspector && !inspector.open) inspector.showModal();
  };
  const begin = source => {
    const next = draftBoard(source);
    if (source && isReferenceBoard(source.id)) {
      next.groups = source.groups.map(group => ({
        ...group, pins: group.pins.map(pin => ({
          ...pin, installation: pin.installation || defaultInstallationRole(source, pin) || '',
        })),
      }));
    }
    selectionSequence.current++;
    setDraft(next);
    if (!source) setSelection({ group: 0, pin: -1 });
    setNotice(null);
  };
  const changeDraft = patch => setDraft(current => ({ ...current, ...patch }));
  const updateGroup = (index, patch) => setDraft(current => ({
    ...current, groups: current.groups.map((group, groupIndex) => groupIndex === index ? { ...group, ...patch } : group),
  }));
  const save = () => {
    try {
      const saved = validateBoardProfile({
        ...draft, revision: draft.revision + 1, sources: draft.sources.map(source => source.trim()).filter(Boolean),
      });
      updateLibrary(state => storeBoardProfile(state, saved, draft.revision));
      choose(saved.id);
      setDraft(null);
      setNotice({ text: `Saved in this browser · profile revision ${saved.revision}.` });
    } catch (error) { setNotice({ error: true, text: error.message }); }
  };
  const importFile = async event => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    try {
      if (file.size > BOARD_PROFILE_FILE_LIMIT) throw new Error('This file exceeds the 256 KB board profile limit.');
      const imported = importBoardProfile(await file.text());
      if (!isReferenceBoard(imported.id)) updateLibrary(state => storeBoardProfile(state, imported));
      choose(imported.id);
      setNotice({ text: isReferenceBoard(imported.id) ? 'Opened the built-in reference from this file.' : 'Imported and saved in this browser.' });
    } catch (error) { setNotice({ error: true, text: error.message }); }
  };
  const exportFile = () => {
    const url = URL.createObjectURL(new Blob([exportBoardProfile(profile)], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `${profile.id}-r${profile.revision}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const readCard = useCallback(async () => {
    if (!liveCardId || !host) return;
    const request = ++readSequence.current;
    const selection = selectionSequence.current;
    setCardRead({ key: cardKey, checking: true });
    try {
      const info = await readCardFirmwareInfoEnvelope({ host, transport });
      if (readSequence.current !== request || currentKey.current !== cardKey) return;
      const next = boardEvidence(info, usbHardwareEvidenceForCard(liveCardId));
      if (info?.app !== 'Lightweaver' || !liveCardId || next.cardId !== liveCardId) {
        throw new Error('Readback did not match the connected Lightweaver card ID. Reconnect the card and read again.');
      }
      const latestLibrary = initialLibrary().library;
      const result = resolveBoardMatch([...REFERENCE_BOARDS, ...latestLibrary.profiles], next, rememberedBoard(latestLibrary, liveCardId));
      if (result.profile && selectionSequence.current === selection) {
        setSelectedId(result.profile.id);
        setSelection({ group: 0, pin: -1 });
      }
      const { outputPins, maxOutputs } = readCardOutputCapabilities(info);
      setCardRead({ key: cardKey, evidence: next, maxOutputs,
        assignments: Array.isArray(info.outputs) && info.controls
          ? new Map(reportedAssignments(info).map(([label, gpio]) => [gpio, label])) : null,
        firmwarePins: outputPins,
      });
    } catch (error) {
      if (readSequence.current === request && currentKey.current === cardKey) {
        setCardRead({ key: cardKey, error: error.message });
      }
    }
  }, [cardKey, host, transport, liveCardId]);
  useEffect(() => {
    void readCard();
    return () => { readSequence.current++; };
  }, [readCard]);
  const confirmProfile = () => {
    try {
      if (!evidence?.cardId || currentKey.current !== cardKey || boardEvidenceConflicts(evidence, profile)
        || (match.status === 'reported' && !exact)) return;
      updateLibrary(state => rememberBoard(state, evidence.cardId, profile));
      setNotice({ text: `${boardTitle(profile)} saved for this card. Open Wiring to set up your lights.` });
    } catch (error) { setNotice({ error: true, text: error.message }); }
  };
  const group = profile.groups[selection.group];
  const updatePins = pins => updateGroup(selection.group, { pins });
  const swapPins = (source, target) => {
    const sourcePin = profile.groups[source.group]?.pins[source.pin];
    const targetPin = profile.groups[target.group]?.pins[target.pin];
    if (!sourcePin || !targetPin) return;
    changeDraft({ groups: profile.groups.map((entry, groupIndex) => ({
      ...entry, pins: entry.pins.map((pin, index) => {
        if (groupIndex === source.group && index === source.pin) return targetPin;
        if (groupIndex === target.group && index === target.pin) return sourcePin;
        return pin;
      }),
    })) });
    setSelection(target);
    setLastSwap(`${describePinAt(profile, source)} ↔ ${describePinAt(profile, target)}`);
  };
  const swapSource = describePinAt(profile, swapPreview?.source);
  const swapTarget = describePinAt(profile, swapPreview?.target);
  const swapAction = swapTarget ? 'Release to swap'
    : swapSource ? 'Choose the second pin' : lastSwap ? 'Swapped · Save profile to keep the change' : 'Changes are saved to this browser';
  const swapPositions = swapTarget ? `${swapSource} ↔ ${swapTarget}` : swapSource || lastSwap;

  return (
    <div className={`lw-board-manager${draft ? ' lw-board-editing' : ''}`}>
      {!draft && <BoardMatching evidence={evidence} match={match} choice={choice} profile={profile}
        canRead={Boolean(liveCardId && host)} checking={liveRead?.checking} readCard={readCard}
        openProfile={choose} confirmProfile={confirmProfile} onConnect={onOpenConnectionCenter} />}
      {!draft && liveRead?.error && <p role="alert">Could not read the board. Check the connection and try again.</p>}
      {storageError && <p role="alert">{storageError}</p>}
      <div className={`lw-board-toolbar${draft ? ' lw-board-toolbar-editing' : ''}`}>
        {!draft && <>
          <label>Board profile
            <select value={profile.id} onChange={event => choose(event.target.value)}>
              <optgroup label="Espressif references">{REFERENCE_BOARDS.map(item => <option key={item.id} value={item.id}>{boardTitle(item)}</option>)}</optgroup>
              {library.profiles.length > 0 && <optgroup label="Saved in this browser">{library.profiles.map(item => <option key={item.id} value={item.id}>{boardTitle(item)}</option>)}</optgroup>}
            </select>
          </label>
          <div className="lw-board-actions">
            {!reference && <button type="button" className="btn" onClick={() => { setDraft(profile); setNotice(null); }}>Edit profile</button>}
            <button type="button" className={reference ? "btn primary" : "btn"} onClick={() => begin(profile)}>Copy this board</button>
            <button type="button" className="btn" onClick={() => begin()}>Start blank</button>
            <button type="button" className="btn" onClick={() => fileInput.current.click()}>Import JSON</button>
            <button type="button" className="btn" onClick={exportFile}>Export JSON</button>
            <input ref={fileInput} type="file" accept=".json,application/json" hidden aria-label="Import board profile JSON file" onChange={importFile} />
          </div>
          <p className="lw-board-help">Different pin labels? Copy the closest board and edit its map.</p>
        </>}
        {draft && <>
          <div className="lw-board-actions">
            <button type="button" className="btn primary" onClick={save}>Save profile</button>
            <button type="button" className="btn" onClick={() => { setDraft(null); choose(selectedId); }}>Cancel edit</button>
            {notice?.error && <span role="alert">{notice.text}</span>}
          </div>
          <div className="lw-board-swap-feedback" role="status" title={swapPositions}>
            <strong>{swapAction}</strong>
            <span>{swapPositions}</span>
          </div>
        </>}
      </div>
      {notice && !draft && <p className="lw-board-notice" role={notice.error ? 'alert' : 'status'}>{notice.text}</p>}
      <div className="lw-board-workspace">
        <div className="lw-board-sidebar">
          <section className="lw-board-panel" aria-label="Profile details">
            <h2>{draft ? (draft.revision ? 'Edit board profile' : 'New board profile') : boardTitle(profile)}</h2>
            {!draft && <p>{reference ? 'Read-only Espressif reference' : 'Saved in this browser'} · profile revision {profile.revision}</p>}
            {reference && baseline && profile.pcbRevision === 'v1.0' && (
              <p>Combines the v1.0 PCB schematic with the N16R8 module pin restrictions. Verify both markings on the board.</p>
            )}
            <BoardDetails profile={profile} onChange={draft ? changeDraft : null} />
          </section>

        </div>
        <section className="lw-board-panel lw-board-wiring" aria-label="Board pin map">
          <div className="lw-board-title-row">
            <h2>Board pin map</h2>
            {draft && <button type="button" className="btn" disabled={profile.groups.length >= BOARD_LIMITS.groups}
              onClick={() => {
                changeDraft({ groups: [...profile.groups, newBoardGroup()] });
                selectPin(profile.groups.length, -1);
              }}>Add pin group</button>}
          </div>
          {!draft && <BoardLedSummary pins={ledPins} assignments={assignments} current={confirmed} maxOutputs={liveRead?.maxOutputs} />}
          {!draft && <p>Tap a pin to see what it does.</p>}
          {profile.orientation && <p>{profile.orientation}</p>}
          <div className="lw-board-drawing">
            <BoardMap key={draft ? 'edit' : 'read'} profile={profile} selection={selection} onSelect={selectPin} onSwap={draft ? swapPins : null}
              onSwapPreview={draft ? setSwapPreview : null} ledPins={ledPins} assignments={assignments}
              onAddPin={draft ? index => {
                const pins = profile.groups[index].pins;
                updateGroup(index, { pins: [...pins, newBoardPin()] });
                selectPin(index, pins.length);
              } : null} />
          </div>
          <dialog className="lw-board-pin-dialog" ref={inspectorRef} aria-labelledby="lw-board-pin-dialog-title">
            <div className="lw-board-dialog-header">
              <h3 id="lw-board-pin-dialog-title">{draft ? (group?.pins[selection.pin] ? 'Edit pin' : 'Edit pin group') : 'Pin details'}</h3>
              <button type="button" className="btn" onClick={() => inspectorRef.current.close()}>Done</button>
            </div>
            <PinInspector profile={profile} selection={selection} ledPins={ledPins} assignments={assignments}
            onSelectGroup={index => setSelection({ group: index, pin: -1 })}
            onChangeGroup={patch => updateGroup(selection.group, patch)}
            onRemoveGroup={() => {
              changeDraft({ groups: profile.groups.filter((_, index) => index !== selection.group) });
              setSelection({ group: 0, pin: -1 });
            }}
            onChangePin={draft ? patch => updatePins(group.pins.map((pin, index) => index === selection.pin ? { ...pin, ...patch } : pin)) : null}
            onMovePin={step => {
              const pins = [...group.pins];
              const next = selection.pin + step;
              [pins[selection.pin], pins[next]] = [pins[next], pins[selection.pin]];
              updatePins(pins);
              setSelection({ group: selection.group, pin: next });
            }}
            onTransferPin={target => {
              const moved = group.pins[selection.pin];
              const destination = profile.groups[target];
              changeDraft({ groups: profile.groups.map((entry, index) => {
                if (index === target) return { ...entry, pins: [...entry.pins, moved] };
                if (index === selection.group) return { ...entry, pins: entry.pins.filter((_, position) => position !== selection.pin) };
                return entry;
              }) });
              setSelection({ group: target, pin: destination.pins.length });
            }}
            onRemovePin={() => {
              updatePins(group.pins.filter((_, index) => index !== selection.pin));
              setSelection({ group: selection.group, pin: Math.min(selection.pin, group.pins.length - 2) });
            }} />
            {!draft && <div className="lw-board-actions">
              <button type="button" className="btn primary" onClick={() => {
                if (reference) begin(profile);
                else { setDraft(profile); setNotice(null); }
              }}>{reference ? 'Copy this board' : 'Edit pin'}</button>
            </div>}
          </dialog>
          <div className="lw-board-installation">
            <h3>Lightweaver installation</h3>
            <p>Save the board map here. Set or move LED outputs in Wiring.</p>
          </div>
        </section>
      </div>
      <p className="lw-board-muted lw-board-provenance">
        For unlisted boards, copy verified signals from the manufacturer’s schematic and leave unresolved pins marked as such.
        Espressif YAML is source material; bring complete Lightweaver profiles into Studio with Import JSON.
        {' '}<a href={BOARD_CATALOG} target="_blank" rel="noreferrer">Espressif board catalog</a>
        {' · '}<a href={BOARD_VENDOR_TOOL} target="_blank" rel="noreferrer">Espressif YAML tool</a>
      </p>
    </div>
  );
}
