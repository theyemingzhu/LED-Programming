import React, { useCallback, useEffect, useRef, useState } from 'react';
import { STRIP_DISCOVERY_ROUTE } from '../../lib/cardAction.js';
import { cardConnectionOptionsFor } from '../../lib/cardConnection.js';
import { CARD_HARDWARE_CONTRACT, readCardOutputCapabilities } from '../../lib/cardHardwareContract.js';
import { readCardFirmwareInfoEnvelope } from '../../lib/cardPushClient.js';
import { selectBoardLedPins } from '../../lib/boardLedPins.js';
import { formatGpio } from '../../lib/cardPinout.js';
import { usbHardwareEvidenceForCard } from '../../lib/usbInspection.js';
import {
  BOARD_CATALOG, BOARD_VENDOR_TOOL, BOARD_PROFILE_STORAGE, BOARD_PROFILE_FILE_LIMIT, BOARD_LIBRARY_CHANGED,
  BOARD_LIMITS, PIN_ROLES, REFERENCE_BOARDS, boardEvidence, boardEvidenceConflicts,
  boardTitle, draftBoard, exportBoardProfile, importBoardProfile, isReferenceBoard,
  newBoardGroup, newBoardPin, readBoardLibrary, rememberBoard, rememberedBoard,
  resolveBoardMatch, storeBoardProfile, updateBoardLibrary, validateBoardProfile,
} from '../../lib/boardProfiles.js';
import { BoardDrawing } from './BoardDrawing.jsx';
import { InstallerSetupProgress } from './InstallerSetupProgress.jsx';
import '../../styles/lw-board-manager.css';

const EMPTY_LIBRARY = { profiles: [], confirmations: {} };
const BASIC_FIELDS = [
  ['manufacturer', 'Manufacturer', 80],
  ['supplier', 'Supplier or listing', 100],
  ['chip', 'Chip', 80], ['module', 'Module marking', 80], ['orientation', 'Map orientation', 180],
];
const CURRENT_SD = { 10: 'microSD CS', 11: 'microSD MOSI', 12: 'microSD SCK', 13: 'microSD MISO' };
const INSTALLATION_FUNCTIONS = ['LED data', ...Object.values(CURRENT_SD), 'Dial A', 'Dial B',
  'Dial press', 'Previous', 'Next', 'Blackout', 'Brightness', 'Status LED'];

function defaultInstallationRole(profile, pin) {
  return profile.id.startsWith('espressif-devkitc-1-') ? CURRENT_SD[pin.gpio] : undefined;
}

function copyBoardDraft(source) {
  const next = draftBoard(source);
  if (source) next.pcbRevision = '';
  if (source && isReferenceBoard(source.id)) {
    next.groups = source.groups.map(group => ({
      ...group, pins: group.pins.map(pin => ({
        ...pin, installation: pin.installation || defaultInstallationRole(source, pin) || '',
      })),
    }));
  }
  return next;
}

function initialLibrary() {
  try { return { library: readBoardLibrary(window.localStorage), storageError: '' }; }
  catch { return { library: EMPTY_LIBRARY, storageError: 'Studio could not read the board library in this browser.' }; }
}

function useBoardLibrary() {
  const [state, setState] = useState(initialLibrary);
  useEffect(() => {
    const refreshLibrary = () => setState(initialLibrary());
    const refresh = event => {
      if (event.key === BOARD_PROFILE_STORAGE || event.key === null) refreshLibrary();
    };
    window.addEventListener('storage', refresh);
    window.addEventListener(BOARD_LIBRARY_CHANGED, refreshLibrary);
    return () => {
      window.removeEventListener('storage', refresh);
      window.removeEventListener(BOARD_LIBRARY_CHANGED, refreshLibrary);
    };
  }, []);
  return [state, update => updateBoardLibrary(window.localStorage, update)];
}

export function BoardManagerEntry({ cardId, onOpen, onConnect }) {
  const [{ library }] = useBoardLibrary();
  const choice = rememberedBoard(library, cardId);
  return (
    <div className="lw-board-entry">
      <div className="lw-board-entry-copy">
        <strong>{choice?.current ? boardTitle(choice.profile) : 'Which board are you using?'}</strong>
        <span>{choice?.current ? 'Saved for this card'
          : choice ? 'The saved profile revision changed. Confirm the current version.'
            : 'Find your board and see where to plug in the LEDs.'}</span>
      </div>
      <div className="lw-board-actions">
        {onConnect && (
          <button type="button" className="btn primary" data-testid="setup-connect-card" onClick={onConnect}>Set up this card</button>
        )}
        <button type="button" className="btn" onClick={onOpen}>Board Manager</button>
      </div>
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

function describePinWithFunction(profile, position) {
  const pin = profile.groups[position?.group]?.pins[position?.pin];
  return pin ? `${describePinAt(profile, position)} · ${pinFunction(profile, pin)}` : '';
}

function pinFunction(profile, pin) {
  return pin.installation || defaultInstallationRole(profile, pin) || pin.detail || PIN_ROLES[pin.role];
}

function pinUse(profile, pin, ledPins, assignments, outputLimitReached) {
  const installation = pin.installation || defaultInstallationRole(profile, pin);
  const assignment = assignments?.get(pin.gpio);
  if (assignment === 'LED data') return { kind: 'used', caption: 'LED output assigned', detail: 'This card already uses the pin for LED data.' };
  if (assignment) return { kind: 'used', caption: `Used by ${assignment}`, detail: `Used by ${assignment} on this card.` };
  if (installation && installation !== 'LED data' && INSTALLATION_FUNCTIONS.includes(installation)) {
    return { kind: 'reserved', caption: `${installation} · Reserved`, detail: `Reserved for ${installation}.` };
  }
  if (ledPins.includes(pin.gpio)) {
    if (outputLimitReached) {
      return { kind: 'reserved', caption: 'Output limit reached', detail: 'This card already uses all its LED outputs. Change an existing output to use this pin.' };
    }
    if (pin.role === 'led' || pin.role === 'jtag') {
      const sharing = pin.role === 'jtag' ? 'JTAG' : pin.detail?.replace(/\s+\(shared\)$/i, '') || PIN_ROLES.led;
      return { kind: 'shared', caption: `Shared · ${sharing}`, sharing, detail: `Shared with ${sharing}. Check that this board function is not in use before wiring LEDs.` };
    }
    return assignments
      ? { kind: 'free', caption: 'Free for LED data', detail: 'Free for LED data.' }
      : { kind: 'possible', caption: 'Check before use', detail: 'Can carry LED data. Check that the pin is free before wiring.' };
  }
  const reason = pin.role !== 'gpio' ? pin.detail || PIN_ROLES[pin.role] : '';
  return {
    kind: 'reserved',
    caption: reason || pin.detail || '',
    detail: reason ? `Unavailable for LED data · ${reason}.`
      : assignments ? 'This pin is outside the LED pin list for this card.'
        : 'Confirm this board on a connected card to check this pin.',
  };
}

function BoardMap({ profile, selection, onSelect, onAddPin, onSwap, onChooseSwap, onSwapPreview, ledPins, assignments, outputLimitReached }) {
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
  const selectPosition = (position, trigger) => {
    if (swapSource) {
      if (!samePosition(position, swapSource)) onChooseSwap(swapSource, position, trigger);
      clearSwap();
    } else {
      onSelect(position.group, position.pin, trigger);
    }
  };
  return (
    <div className="lw-board-map-set" onKeyDown={event => {
      if (event.key === 'Escape' && swapSource) clearSwap();
    }}>
      {['header', 'onboard'].map(kind => {
        const groups = indexed.filter(({ group }) => group.kind === kind);
        if (!groups.length) return null;
        const paired = kind === 'header' && groups.length === 2 && groups.every(({ group }) => group.pins.length);
        const contactRows = paired ? Math.max(...groups.map(({ group }) => group.pins.length)) : 0;
        const devkitDrawing = paired && profile.chip.toUpperCase() === 'ESP32-S3'
          && profile.orientation === REFERENCE_BOARDS[0].orientation
          && groups[0].group.name === 'J1' && groups[1].group.name === 'J3'
          && groups.every(({ group }) => group.pins.length === 22);
        return (
          <React.Fragment key={kind}>
            {devkitDrawing ? <p className="lw-board-map-orientation" data-testid="board-antenna-end">Antenna end · pin 1</p>
              : kind === 'header' && profile.orientation && <p className="lw-board-map-orientation">{profile.orientation}</p>}
            <div className={`lw-board-map lw-board-map-${kind}${devkitDrawing ? ' lw-board-map-with-art' : ''}`}
              data-paired={paired || undefined} aria-label={kind === 'header' ? 'Connector map' : 'Onboard wiring'}
              style={paired ? { '--lw-board-contact-rows': contactRows, '--lw-board-connector-rows': contactRows + (onAddPin ? 2 : 1) } : undefined}>
              {devkitDrawing && <BoardDrawing chip={profile.chip} antenna />}
              {groups.map(({ group, index: groupIndex }, groupPosition) => (
                <section key={groupIndex} className="lw-board-connector" aria-label={group.name || 'New group'}
                  data-board-side={devkitDrawing ? (groupPosition === 0 ? 'left' : 'right') : undefined}>
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
                      const boardRole = pin.detail || (pin.role !== 'gpio' ? PIN_ROLES[pin.role] : '');
                      const pinState = pinUse(profile, pin, ledPins, assignments, outputLimitReached);
                      const caption = pinState.caption || installation || boardRole || ledLabel;
                      return (
                        <li key={index} value={number} data-board-pin={`${groupIndex}:${index}`}
                          data-swap-source={source || undefined} data-swap-target={samePosition(dragTarget, position) || undefined}>
                          {devkitDrawing && <span className="lw-board-socket" aria-hidden="true" />}
                          <button type="button" className="lw-board-contact" aria-pressed={selected}
                            onClick={event => selectPosition(position, event.currentTarget)}
                            aria-label={`${label} · ${pin.detail || PIN_ROLES[pin.role]}${usage ? ` · ${usage}` : ''}`}
                            aria-description={pinState.detail}>
                            {kind === 'header' && <span className="lw-board-position">{number}</span>}
                            {!devkitDrawing && <span className={`lw-board-pad lw-board-pad-${pin.role}${ledPin ? ' lw-board-pad-capable' : ''}`} aria-hidden="true" />}
                            <span className="lw-board-contact-copy">
                              <strong>{pin.label || 'New pin'}</strong>
                              {caption && <span className={installation || liveRole || pinState.kind === 'free'
                                ? 'lw-board-pin-installation' : 'lw-board-pin-role'} title={caption}>{caption}</span>}
                            </span>
                          </button>
                          {onSwap && <button type="button" className="lw-board-swap" aria-label={`Swap ${label}`} aria-pressed={source}
                            title={`Drag to swap ${label}`}
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
            {devkitDrawing && <p className="lw-board-map-orientation" data-testid="board-usb-end">USB end</p>}
          </React.Fragment>
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

function PinAssignmentEditor({ installation, onChange }) {
  const [chooseCustom, setChooseCustom] = useState(false);
  const custom = chooseCustom || (installation && !INSTALLATION_FUNCTIONS.includes(installation));
  return (
    <>
      <label>Installation function
        <select value={custom ? 'custom' : installation} onChange={event => {
          const value = event.target.value;
          setChooseCustom(value === 'custom');
          onChange({ installation: value === 'custom' ? '' : value });
        }}>
          <option value="">None</option>
          {INSTALLATION_FUNCTIONS.map(role => <option key={role}>{role}</option>)}
          <option value="custom">Custom label…</option>
        </select>
      </label>
      {custom && <label className="lw-board-wide">Lightweaver assignment note
        <input value={installation} maxLength={100} onChange={event => onChange({ installation: event.target.value })} />
      </label>}
    </>
  );
}

function PinInspector({ profile, selection, onSelectGroup, onChangeGroup, onRemoveGroup, onChangePin, onOpenMove, onRemovePin, ledPins, assignments, outputLimitReached }) {
  const group = profile.groups[selection.group];
  const pin = group?.pins[selection.pin];
  if (!onChangePin && !pin) return <p className="lw-board-muted">Select a position to inspect its wiring and LED output status.</p>;

  const pinHeading = pin && `${group.name || 'New group'} pin ${pinNumber(group, selection.pin)}`;
  if (!onChangePin) {
    const installation = defaultInstallationRole(profile, pin);
    return (
      <div className="lw-board-inspector">
        <h3>{pinHeading} · {pin.gpio === null ? pin.label : formatGpio(pin.gpio)}</h3>
        <dl className="lw-board-facts">
          {pin.gpio !== null && pin.label !== formatGpio(pin.gpio) && <div><dt>Printed label</dt><dd>{pin.label}</dd></div>}
          <div><dt>What it does</dt><dd>{pin.detail || PIN_ROLES[pin.role]}</dd></div>
          {pin.installation && <div><dt>Lightweaver assignment note</dt><dd>{pin.installation}</dd></div>}
          {installation && <div><dt>Lightweaver target default</dt><dd>{installation}</dd></div>}
          <div><dt>LED output</dt><dd>{pinUse(profile, pin, ledPins, assignments, outputLimitReached).detail}</dd></div>
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
        <h3>{pinHeading} · {pin.label || 'New pin'}</h3>
        <div className="lw-board-fields">
          <label>Pin label<input value={pin.label} maxLength={48} onChange={event => onChangePin({ label: event.target.value })} /></label>
          <label>Pin number<input type="number" min="0" max="255" value={pin.gpio ?? ''} onChange={event => onChangePin({ gpio: event.target.value })} /></label>
          <label>What it does
            <select value={pin.role} onChange={event => onChangePin({ role: event.target.value })}>
              {Object.entries(PIN_ROLES).map(([key, label]) => <option key={key} value={key}>{key === 'gpio' ? 'General purpose' : label}</option>)}
            </select>
          </label>
          <PinAssignmentEditor key={`${selection.group}:${selection.pin}`} installation={pin.installation} onChange={onChangePin} />
          <label className="lw-board-wide">Board signal or note<input value={pin.detail} maxLength={160} onChange={event => onChangePin({ detail: event.target.value })} /></label>
        </div>
        {pinProtection(profile, pin) && <p className="lw-board-muted">{pinProtection(profile, pin)}</p>}
        <div className="lw-board-actions">
          <button type="button" className="btn" onClick={onOpenMove}>Move or swap pin</button>
          <button type="button" className="btn" onClick={() => onSelectGroup(selection.group)}>Edit group</button>
          <button type="button" className="btn" onClick={onRemovePin}>Remove pin</button>
        </div>
      </>}
    </div>
  );
}

function PinMove({ profile, source, initialTarget, onApply }) {
  const [operation, setOperation] = useState(initialTarget ? 'swap' : 'move');
  const [destination, setDestination] = useState(initialTarget ? `${initialTarget.group}:${initialTarget.pin}` : '');
  const choiceRef = useRef(null);
  useEffect(() => { choiceRef.current?.focus({ preventScroll: true }); }, []);
  const [groupIndex, pinIndex] = destination.split(':').map(Number);
  const targetGroup = destination ? profile.groups[groupIndex] : null;
  const target = targetGroup ? { group: groupIndex, pin: pinIndex } : null;
  const resultIndex = target && source.group === target.group && source.pin < pinIndex && operation === 'move' ? pinIndex - 1 : pinIndex;
  const valid = target && !samePosition(source, { group: groupIndex, pin: resultIndex });
  const sourcePin = profile.groups[source.group].pins[source.pin];
  const targetPin = operation === 'swap' ? targetGroup?.pins[pinIndex] : sourcePin;
  return (
    <div className="lw-board-inspector">
      <div className="lw-board-fields">
        <label>Action
          <select ref={choiceRef} value={operation} onChange={event => { setOperation(event.target.value); setDestination(''); }}>
            <option value="move">Move pin</option>
            <option value="swap">Swap two pins</option>
          </select>
        </label>
        <label>{operation === 'move' ? 'Move to' : 'Swap with'}
          <select value={destination} onChange={event => setDestination(event.target.value)}>
            <option value="">Choose a position</option>
            {profile.groups.map((group, index) => {
              const positions = group.pins.map((_, pin) => ({ group: index, pin }));
              if (operation === 'move' && (index === source.group || group.pins.length < BOARD_LIMITS.pins)) {
                positions.push({ group: index, pin: group.pins.length });
              }
              return (
                <optgroup label={group.name || 'New group'} key={index}>
                  {positions.filter(position => !samePosition(source, position)
                    && (operation === 'swap' || index !== source.group || position.pin !== source.pin + 1)).map(position => {
                    const atEnd = position.pin === group.pins.length;
                    const name = describePinAt(profile, position);
                    return <option key={position.pin} value={`${index}:${position.pin}`}
                      disabled={operation === 'move' && index !== source.group && group.pins.length >= BOARD_LIMITS.pins}>
                      {atEnd ? `End of ${group.name || 'new group'}` : operation === 'move' ? `Before ${name}` : name}
                    </option>;
                  })}
                </optgroup>
              );
            })}
          </select>
        </label>
      </div>
      <dl className="lw-board-facts lw-board-move-preview" aria-live="polite">
        <div><dt>From</dt><dd><span>{describePinAt(profile, source)}</span><small>{pinFunction(profile, sourcePin)}</small></dd></div>
        <div><dt>To</dt><dd>{valid ? <>
          <span>{operation === 'swap' ? describePinAt(profile, target)
            : `${targetGroup.name || 'New group'} pin ${pinNumber(targetGroup, resultIndex)}`}</span>
          <small>{pinFunction(profile, targetPin)}</small>
        </> : 'Choose a position'}</dd></div>
      </dl>
      <p className="lw-board-muted">{operation === 'swap' ? 'The two pins exchange positions.' : 'Pins after the move may change position numbers.'}</p>
      <div className="lw-board-actions">
        <button type="button" className="btn primary" disabled={!valid} onClick={() => onApply(operation, source, target, resultIndex)}>
          {operation === 'swap' ? 'Apply swap' : 'Apply move'}
        </button>
      </div>
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

function BoardLedSummary({ profile, pins, assignments, current, maxOutputs, outputLimitReached }) {
  const positions = profile.groups.filter(group => group.kind === 'header').flatMap(group =>
    group.pins.flatMap((pin, index) => !Number.isInteger(pin.gpio) ? [] : [{
      ...pinUse(profile, pin, pins, assignments, outputLimitReached),
      label: `${group.name} pin ${pinNumber(group, index)} · ${formatGpio(pin.gpio)}`,
    }]));
  const free = positions.filter(pin => pin.kind === 'free');
  const shared = positions.filter(pin => pin.kind === 'shared');
  const used = positions.filter(pin => pin.kind === 'used');
  return (
    <section className="lw-board-led-summary" aria-label="LED pins">
      <div className="lw-board-title-row">
        <h3>LED pins</h3>
        {current && <div className="lw-board-actions">
          <a className="btn" href="#screen=layout&mode=draw">Open Wiring</a>
          {pins.length > 0 && <a className="btn" href={`#${STRIP_DISCOVERY_ROUTE}`}>Count LEDs</a>}
        </div>}
      </div>
      {!assignments ? <p>Connect and confirm this board to see which pins are free.</p> : <>
        <dl className="lw-board-led-status">
          <div><dt>Free for LED data</dt>
            <dd>{free.length ? <ul className="lw-board-free-pins">
              {free.map(pin => <li key={pin.label}>{pin.label}</li>)}
            </ul> : 'No free LED pins.'}</dd></div>
          {used.length > 0 && <div><dt>In use</dt><dd>{used.map(pin => `${pin.label} · ${pin.caption}`).join('; ')}</dd></div>}
          {shared.length > 0 && <div><dt>Shared</dt><dd>{shared.map(pin => `${pin.label} (${pin.sharing})`).join('; ')}</dd></div>}
        </dl>
        {outputLimitReached ? <p>{maxOutputs === 1 ? 'This card’s only LED output is in use.' : `This card already uses all ${maxOutputs} LED outputs.`} Change an existing output in Wiring.</p> :
          <p>This card supports up to {maxOutputs} LED outputs.</p>}
      </>}
    </section>
  );
}

export function BoardManager({
  connected, cardLink, cardHost, onOpenConnectionCenter,
  initialProfileId, copyOnEntry = false, expectedCardId, onBoardUsed, onCancelEdit,
}) {
  const [{ library, storageError }, updateLibrary] = useBoardLibrary();
  const profiles = [...REFERENCE_BOARDS, ...library.profiles];
  const liveCardId = connected ? cardLink?.card?.id || '' : '';
  const choice = rememberedBoard(library, liveCardId);
  const [selectedId, setSelectedId] = useState(() => initialProfileId || choice?.profile.id || REFERENCE_BOARDS[1].id);
  const [draft, setDraft] = useState(() => copyOnEntry ? copyBoardDraft(profiles.find(item => item.id === initialProfileId)) : null);
  const boundCardId = useRef(expectedCardId || liveCardId);
  const [pinMove, setPinMove] = useState(null);
  const [selection, setSelection] = useState({ group: 0, pin: -1 });
  const [notice, setNotice] = useState(null);
  const [swapPreview, setSwapPreview] = useState(null);
  const [lastPositionChange, setLastPositionChange] = useState(null);
  const [cardRead, setCardRead] = useState(null);
  const fileInput = useRef(null);
  const inspectorRef = useRef(null);
  const inspectorTrigger = useRef(null);
  const inspectorDone = useRef(null);
  const boardDrawing = useRef(null);
  const detailsRef = useRef(null);
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
      if (!initialProfileId && choice?.profile.id) {
        setSelectedId(choice.profile.id);
        setSelection({ group: 0, pin: -1 });
      }
    }
  }, [cardKey, choice?.profile.id, initialProfileId]);

  const profile = draft || profiles.find(item => item.id === selectedId) || REFERENCE_BOARDS[1];
  const reference = isReferenceBoard(profile.id);
  const baseline = profile.id.startsWith('espressif-devkitc-1-');
  const liveRead = cardRead?.key === cardKey ? cardRead : null;
  const evidence = liveRead?.evidence || null;
  const checkingGuidedCard = copyOnEntry && Boolean(host && liveCardId && liveCardId === boundCardId.current
    && !evidence && !liveRead?.error);
  const match = resolveBoardMatch(profiles, evidence, choice);
  const confirmed = choice?.current && choice.profile.id === profile.id;
  const exact = match.status === 'reported' && match.profile?.id === profile.id;
  const linkedProfile = confirmed || exact;
  const assignments = linkedProfile ? liveRead?.assignments : null;
  const firmwarePins = linkedProfile && liveRead ? liveRead.firmwarePins : null;
  const ledPins = selectBoardLedPins({ profile, firmwarePins: firmwarePins ?? (linkedProfile || baseline ? CARD_HARDWARE_CONTRACT.outputPins : []) });
  const outputLimitReached = assignments && liveRead.outputCount >= liveRead.maxOutputs;
  const choose = id => {
    selectionSequence.current++;
    setSelectedId(id);
    setSelection({ group: 0, pin: -1 });
    setNotice(null);
    setSwapPreview(null);
    setLastPositionChange(null);
  };
  const selectPin = (group, pin, trigger = document.activeElement) => {
    setPinMove(null);
    setSelection({ group, pin });
    const inspector = inspectorRef.current;
    if (inspector && !inspector.open) {
      inspectorTrigger.current = trigger;
      inspector.showModal();
      inspectorDone.current?.focus({ preventScroll: true });
    }
  };
  const begin = source => {
    selectionSequence.current++;
    setDraft(copyBoardDraft(source));
    if (!source) setSelection({ group: 0, pin: -1 });
    setNotice(null);
    setLastPositionChange(null);
  };
  const changeDraft = patch => {
    if (patch.groups) setLastPositionChange(null);
    setDraft(current => ({ ...current, ...patch }));
  };
  const updateGroup = (index, patch) => {
    setLastPositionChange(null);
    setDraft(current => ({
      ...current, groups: current.groups.map((group, groupIndex) => groupIndex === index ? { ...group, ...patch } : group),
    }));
  };
  const save = () => {
    try {
      const saved = validateBoardProfile({
        ...draft, revision: draft.revision + 1, sources: draft.sources.map(source => source.trim()).filter(Boolean),
      });
      if (copyOnEntry) {
        if (!boundCardId.current || boundCardId.current !== liveCardId || evidence?.cardId !== liveCardId) {
          throw new Error('Connect to the same card and read it before saving this board.');
        }
        if (boardEvidenceConflicts(evidence, saved)) {
          throw new Error('The chip or memory does not match this card. Check Board details.');
        }
        updateLibrary(state => rememberBoard(storeBoardProfile(state, saved, draft.revision), liveCardId, saved));
      } else {
        updateLibrary(state => storeBoardProfile(state, saved, draft.revision));
      }
      choose(saved.id);
      setDraft(null);
      setNotice({ text: `Saved in this browser · profile revision ${saved.revision}.` });
      if (copyOnEntry) onBoardUsed?.(saved, liveCardId);
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
    if (!liveCardId || !host || (copyOnEntry && boundCardId.current !== liveCardId)) return;
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
      if (!initialProfileId && result.profile && selectionSequence.current === selection) {
        setSelectedId(result.profile.id);
        setSelection({ group: 0, pin: -1 });
      }
      const { outputPins, maxOutputs } = readCardOutputCapabilities(info);
      setCardRead({ key: cardKey, evidence: next, maxOutputs,
        outputCount: Array.isArray(info.outputs) ? info.outputs.length : 0,
        assignments: Array.isArray(info.outputs) && info.controls
          ? new Map(reportedAssignments(info).map(([label, gpio]) => [gpio, label])) : null,
        firmwarePins: outputPins,
      });
    } catch (error) {
      if (readSequence.current === request && currentKey.current === cardKey) {
        setCardRead({ key: cardKey, error: error.message });
      }
    }
  }, [cardKey, host, transport, liveCardId, initialProfileId, copyOnEntry]);
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
  const recordPinMove = (groups, action, source, target, positions) => {
    setDraft(current => ({ ...current, groups }));
    setSelection(target);
    setLastPositionChange({ action, positions, previousGroups: profile.groups, source });
  };
  const undoPinMove = () => {
    const { source, previousGroups, positions } = lastPositionChange;
    setDraft(current => ({ ...current, groups: previousGroups }));
    setSelection(source);
    setLastPositionChange({ action: 'Change undone', positions });
    requestAnimationFrame(() => {
      boardDrawing.current?.querySelector(`[data-board-pin="${source.group}:${source.pin}"] .lw-board-contact`)?.focus({ preventScroll: true });
    });
  };
  const swapPins = (source, target) => {
    const sourcePin = profile.groups[source.group]?.pins[source.pin];
    const targetPin = profile.groups[target.group]?.pins[target.pin];
    if (!sourcePin || !targetPin) return;
    const groups = profile.groups.map((entry, groupIndex) => ({
      ...entry, pins: entry.pins.map((pin, index) => {
        if (groupIndex === source.group && index === source.pin) return targetPin;
        if (groupIndex === target.group && index === target.pin) return sourcePin;
        return pin;
      }),
    }));
    recordPinMove(groups, 'Swapped', source, target, `${describePinAt(profile, source)} ↔ ${describePinAt(profile, target)}`);
  };
  const applyPinMove = (operation, source, target, resultIndex) => {
    if (operation === 'swap') {
      swapPins(source, target);
    } else {
      const groups = profile.groups.map(entry => ({ ...entry, pins: [...entry.pins] }));
      const [pin] = groups[source.group].pins.splice(source.pin, 1);
      groups[target.group].pins.splice(resultIndex, 0, pin);
      const position = { group: target.group, pin: resultIndex };
      const destination = describePinAt({ groups }, position);
      recordPinMove(groups, 'Moved', source, position, `${describePinAt(profile, source)} → ${destination}`);
    }
    setPinMove(null);
    inspectorRef.current.close();
  };
  const saveLabel = copyOnEntry ? 'Save and use this board' : 'Save profile';
  const swapSource = describePinWithFunction(profile, swapPreview?.source);
  const swapTarget = describePinWithFunction(profile, swapPreview?.target);
  const swapAction = swapTarget ? 'Release to swap'
    : swapSource ? 'Choose the second pin'
      : lastPositionChange ? (lastPositionChange.previousGroups
        ? `${lastPositionChange.action} · ${saveLabel} to keep the change` : lastPositionChange.action)
        : checkingGuidedCard ? 'Checking card…' : 'Tap a pin to edit · Drag a handle to swap';
  const swapPositions = swapTarget ? `From ${swapSource}. To ${swapTarget}.` : swapSource || lastPositionChange?.positions;

  return (
    <div className={`lw-board-manager${draft ? ' lw-board-editing' : ''}`}>
      {copyOnEntry && <InstallerSetupProgress step="board" />}
      {!draft && <BoardMatching evidence={evidence} match={match} choice={choice} profile={profile}
        canRead={Boolean(liveCardId && host)} checking={liveRead?.checking} readCard={readCard}
        openProfile={choose} confirmProfile={confirmProfile} onConnect={onOpenConnectionCenter} />}
      {!draft && liveRead?.error && <p role="alert">Could not read the board. Check the connection and try again.</p>}
      {storageError && <p role="alert">{storageError}</p>}
      {draft && <div className="lw-board-fields lw-board-draft-fields">
        <label>Board name
          <input value={profile.name} maxLength={100} onChange={event => changeDraft({ name: event.target.value })} />
        </label>
        <label>Printed revision (if shown)
          <input value={profile.pcbRevision} maxLength={48} onChange={event => changeDraft({ pcbRevision: event.target.value })} />
        </label>
      </div>}
      <div className={`lw-board-toolbar${draft ? ' lw-board-toolbar-editing' : ''}`}>
        {!draft && <>
          <label>Board profile
            <select value={profile.id} onChange={event => choose(event.target.value)}>
              <optgroup label="Espressif references">{REFERENCE_BOARDS.map(item => <option key={item.id} value={item.id}>{boardTitle(item)}</option>)}</optgroup>
              {library.profiles.length > 0 && <optgroup label="Saved in this browser">{library.profiles.map(item => <option key={item.id} value={item.id}>{boardTitle(item)}</option>)}</optgroup>}
            </select>
          </label>
          <div className="lw-board-actions">
            {!reference && <button type="button" className="btn" onClick={() => { setDraft(profile); setNotice(null); setLastPositionChange(null); }}>Edit profile</button>}
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
            <button type="button" className="btn primary" disabled={checkingGuidedCard} onClick={save}>{saveLabel}</button>
            <button type="button" className="btn" onClick={() => {
              if (onCancelEdit) onCancelEdit();
              else { setDraft(null); choose(selectedId); }
            }}>Cancel edit</button>
          </div>
          {notice?.error && <span className="lw-board-edit-message" role="alert">{notice.text}</span>}
          {copyOnEntry && liveRead?.error && <p className="lw-board-edit-message" role="alert">
            Could not read this card. <button type="button" className="btn" onClick={readCard}>Read again</button>
          </p>}
          <div className="lw-board-swap-feedback">
            <div role="status" title={swapPositions}>
              <strong>{swapAction}</strong>
              {swapSource ? <div className="lw-board-drag-preview">
                <span title={swapSource}><b>From</b> {swapSource}</span>
                {swapTarget && <span title={swapTarget}><b>To</b> {swapTarget}</span>}
              </div> : <span>{swapPositions}</span>}
            </div>
            {!swapSource && lastPositionChange?.previousGroups && <button type="button" className="btn" onClick={undoPinMove}>Undo</button>}
          </div>
        </>}
      </div>
      {notice && !draft && <p className="lw-board-notice" role={notice.error ? 'alert' : 'status'}>{notice.text}</p>}
      <div className="lw-board-workspace">
        <section className="lw-board-panel lw-board-wiring" aria-label="Board pin map">
          <div className="lw-board-title-row">
            <h2>Board pin map</h2>
            <div className="lw-board-actions">
              <button type="button" className="btn" onClick={() => detailsRef.current.showModal()}>Board details</button>
              {draft && <button type="button" className="btn" disabled={profile.groups.length >= BOARD_LIMITS.groups}
                onClick={() => {
                  changeDraft({ groups: [...profile.groups, newBoardGroup()] });
                  selectPin(profile.groups.length, -1);
                }}>Add pin group</button>}
            </div>
          </div>
          {!draft && <BoardLedSummary profile={profile} pins={ledPins} assignments={assignments} current={confirmed} maxOutputs={liveRead?.maxOutputs} outputLimitReached={outputLimitReached} />}
          {!draft && <p>Tap a pin to see what it does.</p>}
          <dialog className="lw-board-pin-dialog" ref={detailsRef} aria-labelledby="lw-board-details-dialog-title">
            <div className="lw-board-dialog-header">
              <h3 id="lw-board-details-dialog-title">Board details</h3>
              <button type="button" className="btn" onClick={() => detailsRef.current.close()}>Done</button>
            </div>
            <div className="lw-board-inspector">
              {!draft && <>
                <h3>{boardTitle(profile)}</h3>
                <p>{reference ? 'Espressif reference' : 'Saved in this browser'} · profile revision {profile.revision}</p>
                {reference && baseline && profile.pcbRevision === 'v1.0' && (
                  <p>Check the v1.0 PCB and N16R8 module markings on the board.</p>
                )}
                {profile.orientation && <p>{profile.orientation}</p>}
              </>}
              <BoardDetails profile={profile} onChange={draft ? changeDraft : null} />
            </div>
          </dialog>
          <div className="lw-board-drawing" ref={boardDrawing}>
            <BoardMap key={draft ? 'edit' : 'read'} profile={profile} selection={selection} onSelect={selectPin} onSwap={draft ? swapPins : null}
              onChooseSwap={(source, target, trigger) => {
                selectPin(source.group, source.pin, trigger);
                setPinMove({ source, target });
              }} onSwapPreview={draft ? setSwapPreview : null} ledPins={ledPins} assignments={assignments} outputLimitReached={outputLimitReached}
              onAddPin={draft ? index => {
                const pins = profile.groups[index].pins;
                updateGroup(index, { pins: [...pins, newBoardPin()] });
                selectPin(index, pins.length);
              } : null} />
          </div>
          <dialog className="lw-board-pin-dialog" ref={inspectorRef} aria-labelledby="lw-board-pin-dialog-title"
            onClose={() => inspectorTrigger.current?.focus({ preventScroll: true })}>
            <div className="lw-board-dialog-header">
              <h3 id="lw-board-pin-dialog-title">{pinMove ? 'Move or swap pin' : draft
                ? (group?.pins[selection.pin] ? 'Edit pin' : 'Edit pin group') : 'Pin details'}</h3>
              <button type="button" className="btn" ref={inspectorDone} onClick={() => {
                if (pinMove) setPinMove(null);
                else inspectorRef.current.close();
              }}>{pinMove ? 'Back to pin' : 'Done'}</button>
            </div>
            {pinMove
              ? <PinMove profile={profile} source={pinMove.source} initialTarget={pinMove.target} onApply={applyPinMove} />
              : <PinInspector profile={profile} selection={selection} ledPins={ledPins} assignments={assignments} outputLimitReached={outputLimitReached}
                onSelectGroup={index => setSelection({ group: index, pin: -1 })}
                onChangeGroup={patch => updateGroup(selection.group, patch)}
                onRemoveGroup={() => {
                  changeDraft({ groups: profile.groups.filter((_, index) => index !== selection.group) });
                  setSelection({ group: 0, pin: -1 });
                }}
                onChangePin={draft ? patch => updatePins(group.pins.map((pin, index) => index === selection.pin ? { ...pin, ...patch } : pin)) : null}
                onOpenMove={() => setPinMove({ source: selection })}
                onRemovePin={() => {
                  updatePins(group.pins.filter((_, index) => index !== selection.pin));
                  setSelection({ group: selection.group, pin: Math.min(selection.pin, group.pins.length - 2) });
                }} />}
            {!draft && <div className="lw-board-actions">
              <button type="button" className="btn primary" onClick={() => {
                if (reference) begin(profile);
                else { setDraft(profile); setNotice(null); }
              }}>{reference ? 'Copy this board' : 'Edit pin'}</button>
            </div>}
          </dialog>
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
