import React, { useEffect, useRef, useState } from 'react';
import {
  REFERENCE_BOARDS, boardEvidence, boardTitle, readBoardLibrary, rememberedBoard,
  rememberBoard, resolveBoardMatch, updateBoardLibrary,
} from '../../lib/boardProfiles.js';
import { selectBoardLedPins } from '../../lib/boardLedPins.js';
import { CARD_HARDWARE_CONTRACT, readCardOutputCapabilities } from '../../lib/cardHardwareContract.js';
import { formatGpio } from '../../lib/cardPinout.js';
import { readCardFirmwareInfoEnvelope } from '../../lib/cardPushClient.js';
import { usbHardwareEvidenceForCard } from '../../lib/usbInspection.js';
import './connected-board-setup.css';

function readMatchingBoard(info, cardId) {
  const library = readBoardLibrary(window.localStorage);
  const profiles = [...REFERENCE_BOARDS, ...library.profiles];
  const evidence = boardEvidence(info, usbHardwareEvidenceForCard(cardId));
  const saved = rememberedBoard(library, cardId);
  const match = resolveBoardMatch(profiles, evidence, saved);
  const savedChoice = match.candidates.find(candidate =>
    candidate.confirmed && candidate.profile.id === match.profile?.id)?.profile;
  return { info, library, match, profiles, savedChoice };
}

function liveLedPins(profile, info, outputPins) {
  if (!outputPins || !Array.isArray(info.outputs) || !info.controls) return null;
  const { encoder, previous, next, blackout, statusLed, brightnessAnalog } = info.controls;
  const controls = [
    [encoder?.a, 'Used by the dial'], [encoder?.b, 'Used by the dial'],
    [encoder?.press, 'Used by the dial'],
    [encoder?.effectiveAlternatePress ?? encoder?.configuredAlternatePress ?? encoder?.alternatePress, 'Used by the dial'],
    [previous, 'Used by the Previous button'], [next, 'Used by the Next button'],
    [blackout, 'Used by the Stop button'], [statusLed, 'Used by the status light'],
    [brightnessAnalog ?? info.controls.brightness, 'Used by the brightness control'],
  ].filter(([pin]) => Number.isInteger(pin) && pin >= 0);
  const possible = selectBoardLedPins({ profile, firmwarePins: outputPins, controlPins: controls.map(([pin]) => pin) });
  const wired = new Set(info.outputs.map(output => output?.pin ?? output?.gpio)
    .filter(pin => Number.isInteger(pin) && pin >= 0));
  const shared = new Set(profile.groups.flatMap(group => group.pins)
    .filter(pin => pin.role === 'led' || pin.role === 'jtag').map(pin => pin.gpio));
  const unused = possible.filter(pin => !wired.has(pin));
  const blocked = new Map();
  for (const [pin, reason] of controls) {
    if (!outputPins.includes(pin) || wired.has(pin)) continue;
    if (!blocked.has(reason)) blocked.set(reason, new Set());
    blocked.get(reason).add(pin);
  }
  return {
    free: unused.filter(pin => !shared.has(pin)),
    shared: unused.filter(pin => shared.has(pin)),
    wired: [...wired],
    check: [...wired].filter(pin => !possible.includes(pin)),
    blocked: [...blocked].map(([reason, pins]) => [reason, [...pins]]),
  };
}

function RevisionGuide() {
  // Espressif publishes the revision on the back silkscreen of both reference
  // DevKitC-1 boards. The front silkscreen marks RGB@IO48 or RGB@IO38.
  return (
    <figure className="connected-board-setup__revision" aria-label="Where to find the board revision">
      <div className="connected-board-setup__back" aria-hidden="true">
        <small>Example marking</small>
        <span>ESP32-S3-DevKitC-1 <strong>v1.1</strong></span>
      </div>
      <figcaption>
        Turn the board over. Look between the two rows of pins for the version after the board name.
        If the back is hard to read, compare the RGB marking on the front.
      </figcaption>
    </figure>
  );
}

export function ConnectedBoardSetup({ cardId, host, transport, bootId, buildId, onOpenBoardManager, onSetUpLights }) {
  const [reading, setReading] = useState(null);
  const [attempt, setAttempt] = useState(0);
  const [problem, setProblem] = useState('');
  const [selection, setSelection] = useState('');
  const [confirmed, setConfirmed] = useState('');
  const [browse, setBrowse] = useState(false);
  const [query, setQuery] = useState('');
  const focusAfterAction = useRef(false);
  const boardHeading = useRef(null);
  const searchInput = useRef(null);

  useEffect(() => {
    if (!focusAfterAction.current) return;
    focusAfterAction.current = false;
    (confirmed ? boardHeading.current : searchInput.current)?.focus({ preventScroll: true });
  }, [browse, confirmed]);

  useEffect(() => {
    let active = true;
    async function checkBoard() {
      try {
        const info = await readCardFirmwareInfoEnvelope({ host, transport });
        if (!active) return;
        if (info?.app !== 'Lightweaver' || info.cardId !== cardId
          || (bootId && info.bootId && bootId !== info.bootId)
          || (buildId && info.buildId && buildId !== info.buildId)) {
          setProblem('This reply came from a different card or firmware session. Check the connection and try again.');
          return;
        }
        const next = readMatchingBoard(info, cardId);
        setSelection(next.savedChoice?.id || next.match.profile?.id || '');
        setConfirmed(next.savedChoice?.id || '');
        setReading(next);
      } catch {
        if (active) setProblem('Could not check this board. Try again.');
      }
    }
    checkBoard();
    return () => { active = false; };
  }, [cardId, host, transport, bootId, buildId, attempt]);

  function retry() {
    setProblem('');
    setAttempt(value => value + 1);
  }

  if (!reading) {
    return (
      <section className="connected-board-setup" data-testid="connect-board-setup" aria-label="Choose your board">
        <p role={problem ? 'alert' : 'status'}>{problem || 'Checking your board…'}</p>
        {problem && <button type="button" className="btn" onClick={retry}>Check again</button>}
      </section>
    );
  }

  const { info, library, match, profiles } = reading;
  const selected = match.candidates.find(candidate => candidate.profile.id === selection)?.profile;
  const board = profiles.find(profile => profile.id === confirmed);
  const choices = new Set(match.candidates.map(candidate => candidate.profile.id));
  const exact = match.status === 'reported' && !browse;
  const conflict = match.reason === 'hardware-readings-conflict';
  const showRevisionGuide = !conflict && match.candidates.some(({ profile }) => profile.id.startsWith('espressif-devkitc-1-'));
  const recent = new Set(Object.values(library.confirmations).map(choice => choice?.id));
  const search = query.toLowerCase().split(/\s+/).filter(Boolean);
  const visibleProfiles = profiles.filter(profile => {
    const text = [boardTitle(profile), profile.manufacturer, profile.chip, profile.module].join(' ').toLowerCase();
    return search.every(term => text.includes(term));
  });
  const recentProfiles = visibleProfiles.filter(profile => recent.has(profile.id) && choices.has(profile.id));
  const otherProfiles = visibleProfiles.filter(profile => !recentProfiles.includes(profile));

  function confirmBoard() {
    if (!selected) return;
    try {
      const next = updateBoardLibrary(window.localStorage, current => rememberBoard(current, cardId, selected));
      setReading({ ...reading, library: next });
      focusAfterAction.current = true;
      setConfirmed(selected.id);
      setProblem('');
    } catch {
      setProblem('Could not save this board. Reopen Connect and try again.');
    }
  }

  function browseBoards() {
    focusAfterAction.current = true;
    setConfirmed('');
    setBrowse(true);
    setQuery('');
  }

  function openEditor() {
    onOpenBoardManager?.({ profileId: board?.id || selected?.id, copy: true });
  }

  function profileOptions(options) {
    return (
      <div className="connected-board-setup__options">
        {options.map(profile => {
          const compatible = choices.has(profile.id);
          const rgb = compatible && profile.groups.flatMap(group => group.pins)
            .find(pin => pin.detail?.startsWith('Onboard RGB'));
          const hint = compatible ? rgb && `Look for RGB@IO${rgb.gpio} on the front` : 'Different hardware';
          const hintId = `connect-board-${profile.id}-hint`;
          return (
            <button key={profile.id} type="button" className="btn connected-board-setup__option"
              aria-label={boardTitle(profile)} aria-describedby={hint ? hintId : undefined}
              aria-pressed={selection === profile.id} disabled={!compatible}
              onClick={() => { setSelection(profile.id); setProblem(''); }}>
              <span>{boardTitle(profile)}</span>
              {hint && <small id={hintId}>{hint}</small>}
            </button>
          );
        })}
      </div>
    );
  }

  if (board) {
    const { maxOutputs, outputPins } = readCardOutputCapabilities(info);
    const pins = liveLedPins(board, info, outputPins ?? CARD_HARDWARE_CONTRACT.outputPins);
    const positions = new Map(board.groups.filter(group => group.kind === 'header').flatMap(group => group.pins.map(
      (pin, index) => [pin.gpio, `${group.name} pin ${group.start + index * group.step}`],
    )));
    return (
      <section className="connected-board-setup" data-testid="connect-board-setup" aria-label="Board and LED pins">
        <h3 ref={boardHeading} tabIndex={-1}>{boardTitle(board)}</h3>
        {pins ? <dl className="connected-board-setup__pins">
          <div><dt>Free for LED data</dt><dd>{pins.free.length ? pins.free.map(pin => (
            <span className="connected-board-setup__pin" key={pin}>
              {positions.has(pin) && <span>{positions.get(pin)} · </span>}<span>{formatGpio(pin)}</span>
            </span>
          )) : 'None'}</dd></div>
          {pins.shared.length > 0 && <div><dt>Shared with board functions</dt><dd>{pins.shared.map(formatGpio).join(', ')}</dd></div>}
          {pins.wired.length > 0 && <div><dt>LEDs already set up</dt><dd>{pins.wired.map(formatGpio).join(', ')}</dd></div>}
          {pins.check.length > 0 && <div><dt>Check these LED pins</dt><dd>{pins.check.map(formatGpio).join(', ')}</dd></div>}
          {pins.blocked.map(([reason, blocked]) => <div key={reason}><dt>{reason}</dt><dd>{blocked.map(formatGpio).join(', ')}</dd></div>)}
        </dl> : <p>The card did not report its LED and control wiring.</p>}
        {pins && !outputPins && <p>Pin choices use the standard Lightweaver list for this firmware.</p>}
        <p>{pins && pins.wired.length >= maxOutputs
          ? 'This card is already using all its LED outputs. You can move an existing strip to a free pin.'
          : `This card supports up to ${maxOutputs} LED outputs.`}</p>
        <div className="card-connection-actions">
          <button type="button" className="btn primary" onClick={onSetUpLights}>Connect strips</button>
          <button type="button" className="btn" onClick={() => onOpenBoardManager?.({ profileId: board.id })}>See all pins</button>
          <button type="button" className="btn" onClick={browseBoards}>Change board</button>
          <button type="button" className="btn" onClick={openEditor}>My board looks different</button>
        </div>
      </section>
    );
  }

  return (
    <section className="connected-board-setup" data-testid="connect-board-setup" aria-label="Choose your board">
      <h3>Choose your board</h3>
      {conflict ? <p role="alert">USB and Wi-Fi reported different hardware. Reconnect this card and check again.</p>
        : exact ? <p>Your card reports <strong>{boardTitle(selected)}</strong>. Check the name printed on your board.</p>
          : match.status === 'no-match' ? <p>No saved board matches this card. Make a board profile to continue.</p>
            : <p>Which version is printed on your board? Choose the one that matches.</p>}
      {showRevisionGuide && <RevisionGuide />}
      {!conflict && (browse ? <>
        <label className="connected-board-setup__search">
          Search board profiles
          <input ref={searchInput} type="search" value={query} placeholder="Name or revision" onChange={event => setQuery(event.target.value)} />
        </label>
        {recentProfiles.length > 0 && <><h4>Previously used</h4>{profileOptions(recentProfiles)}</>}
        {otherProfiles.length > 0 && <><h4>{recentProfiles.length > 0 ? 'Other boards' : 'Board profiles'}</h4>{profileOptions(otherProfiles)}</>}
        {visibleProfiles.length === 0 && <p>No boards match your search.</p>}
      </> : !exact && profileOptions(match.candidates.slice(0, 2).map(candidate => candidate.profile)))}
      {problem && <p role="alert">{problem}</p>}
      <div className="card-connection-actions">
        {!conflict && <button type="button" className="btn primary" disabled={!selected} onClick={confirmBoard}>Use this board</button>}
        {!conflict && !browse && <button type="button" className="btn" onClick={browseBoards}>Browse boards</button>}
        {!conflict && <button type="button" className="btn" onClick={openEditor}>{selected ? 'My board looks different' : 'Make a board profile'}</button>}
      </div>
    </section>
  );
}
