import React, { useEffect, useRef, useState } from 'react';
import { normalizeClientPattern, normalizeLookTuning, normalizeSavedLookTuning, sameTuningValues, verifySavedPattern } from './clientPattern.js';
import { connectClient } from './clientTransport.js';
import { CLIENT_PLAYLIST_LIMIT, controlPatch, movePlaylistEntry, normalizeClientPlaylist, updatePlaylistEntry } from './clientModel.js';
import { readClientTarget, saveClientPairing } from './clientPairing.js';
import './client.css';

const release = typeof __LIGHTWEAVER_CLIENT_RELEASE__ !== 'undefined' ? __LIGHTWEAVER_CLIENT_RELEASE__ : null;

function RangeControl({ label, value, min, max, step = 1, suffix = '', disabled, onCommit }) {
  const [draft, setDraft] = useState(value);
  const dragging = useRef(false);
  useEffect(() => { if (!dragging.current) setDraft(value); }, [value, disabled]);
  const commit = () => { dragging.current = false; if (draft !== value) onCommit(draft); };
  return <label className="cl-range"><span>{label}<output>{Math.round(draft * 100) / 100}{suffix}</output></span><input type="range" aria-label={label} min={min} max={max} step={step} value={draft} disabled={disabled} onPointerDown={() => { dragging.current = true; }} onChange={event => setDraft(Number(event.target.value))} onPointerUp={commit} onKeyUp={commit} onBlur={commit} /></label>;
}

function DurationInput({ value, label, disabled, onCommit }) {
  const [text, setText] = useState(String(value));
  const [invalid, setInvalid] = useState(false);
  useEffect(() => { setText(String(value)); setInvalid(false); }, [value]);
  const commit = () => {
    const number = Number(text);
    if (!text.trim() || !Number.isInteger(number) || number < 1 || number > 3600) { setInvalid(true); return; }
    setInvalid(false); onCommit(number);
  };
  return <label className="cl-duration"><input type="number" aria-label={label} aria-invalid={invalid} title={invalid ? 'Use 1 to 3,600 whole seconds' : undefined} min={1} max={3600} step={1} value={text} disabled={disabled} onChange={event => { setText(event.target.value); setInvalid(false); }} onBlur={commit} onKeyDown={event => { if (event.key === 'Enter') { commit(); event.currentTarget.blur(); } }} /><span>sec</span>{invalid && <span role="alert">1–3,600</span>}</label>;
}

export default function ClientApp() {
  const [initialTarget] = useState(() => {
    try { return readClientTarget(window.location.href, window.localStorage); }
    catch (cause) { return { error: cause.message }; }
  });
  const targetRef = useRef(initialTarget);
  const [useBridge, setUseBridge] = useState(false);
  const started = useRef(false);
  const [session, setSession] = useState(null);
  const sessionRef = useRef(null);
  const generation = useRef(0);
  const busyRef = useRef(false);
  const [busy, setBusy] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [data, setData] = useState(null);
  const [playlist, setPlaylist] = useState(null);
  const [draft, setDraft] = useState([]);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [playlistError, setPlaylistError] = useState('');
  const [tab, setTab] = useState('looks');
  const [addId, setAddId] = useState('');
  const [patternEdits, setPatternEdits] = useState({});
  const editPatternId = useRef(null);

  const connect = async bridge => {
    if (connecting) return;
    const target = targetRef.current;
    if (target.error) { setError(target.error); return; }
    const cleanHost = target.host;
    const token = ++generation.current;
    sessionRef.current = null;
    setSession(null); setData(null); setPlaylist(null); setPatternEdits({}); editPatternId.current = null; setDirty(false); setError(''); setNotice(''); setPlaylistError(''); setConnecting(true);
    try {
      // Called directly in the button gesture so the card-page popup is allowed.
      const connected = await connectClient(cleanHost, { bridge, expectedCardId: target.cardId });
      const next = await connected.read();
      if (token !== generation.current) return;
      sessionRef.current = connected; setSession(connected); setData(next);
      targetRef.current = saveClientPairing({ host: cleanHost, cardId: connected.identity.cardId, name: next.status.piece?.name || target.name }, window.localStorage);
      setUseBridge(bridge); setAddId(next.controls.patterns[0]?.id || '');
      if (next.status.capabilities?.clientPlaylist?.version >= 1) {
        try {
          const saved = await connected.readPlaylist(next.controls.patterns);
          if (token !== generation.current) return;
          setPlaylist(saved); setDraft(saved.entries);
        } catch (cause) { if (token === generation.current) setPlaylistError(cause.message); }
      }
    } catch (cause) { if (token === generation.current) { setError(cause.message || 'Your lights could not be reached.'); setUseBridge(true); } }
    finally { if (token === generation.current) setConnecting(false); }
  };

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void connect(false);
  }, []);

  useEffect(() => {
    if (!session) return undefined;
    let cancelled = false;
    let refreshing = false;
    const timer = window.setInterval(async () => {
      if (cancelled || refreshing || busyRef.current || document.hidden) return;
      refreshing = true;
      try {
        const next = await session.read();
        if (!cancelled && sessionRef.current === session && !busyRef.current) setData(next);
      } catch (cause) {
        if (!cancelled && sessionRef.current === session) {
          sessionRef.current = null; setSession(null); setError(`${cause.message} Reconnect to continue.`);
        }
      } finally { refreshing = false; }
    }, 3000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [session]);

  useEffect(() => {
    const patternId = data?.controls.activePatternId || null;
    if (editPatternId.current !== patternId) { editPatternId.current = patternId; setPatternEdits({}); }
  }, [data?.controls.activePatternId]);

  const mutate = async action => {
    const current = sessionRef.current;
    if (!current || busyRef.current) return;
    const token = generation.current;
    busyRef.current = true; setBusy(true); setError(''); setNotice('');
    try {
      await action(current, token);
      const next = await current.read();
      if (token === generation.current && sessionRef.current === current) setData(next);
    } catch (cause) {
      if (token === generation.current) setError(cause.message || 'The card did not confirm that change.');
    } finally { if (token === generation.current) { busyRef.current = false; setBusy(false); } }
  };

  const control = (key, value) => mutate(async (current, token) => {
    const editedId = data?.controls.activePatternId;
    const installed = data?.controls.patterns.find(pattern => pattern.id === editedId);
    const response = await current.write('/api/control', controlPatch(key, value));
    const field = key === 'patternId' ? 'appliedPatternId' : key;
    if (['brightness', 'speed', 'hueShift'].includes(key) && !data?.status.playlist?.playing && response.appliedPatternId && response.appliedPatternId !== editedId) throw new Error('The playing look changed during the adjustment. Check the current look before adjusting it again.');
    if (key !== 'playlist' && response[field] === undefined) throw new Error('The card did not confirm the changed control. Reconnect to check its state.');
    if (token === generation.current && ['brightness', 'speed', 'hueShift'].includes(key) && !data?.status.playlist?.playing
      && data?.status.capabilities?.clientPattern?.version >= 1 && installed?.savedControlsRevision) {
      setPatternEdits(previous => {
        const held = previous[editedId];
        return { ...previous, [editedId]: { patternId: editedId, cardId: current.identity.cardId, revision: held?.revision || installed.savedControlsRevision, changes: { ...held?.changes, [key]: response[field] } } };
      });
    }
  });
  const setLookTuning = (key, value) => mutate(async current => {
    const { patternId, session: lookSession } = data.controls.tuning;
    const response = await current.write('/api/control', { lookTuning: {
      patternId, session: lookSession, expectedCardId: current.identity.cardId,
      expectedBootId: current.identity.bootId, changes: { [key]: value },
    } });
    const applied = normalizeLookTuning(response.lookTuning, patternId);
    if (response.bootId !== current.identity.bootId || applied.session !== lookSession) {
      throw new Error('The active look changed. Check its settings before adjusting again.');
    }
  });

  const saveLookTuning = () => mutate(async current => {
    const { patternId, session: lookSession, revision, live } = data.controls.tuning;
    const response = await current.write('/api/client-pattern', {
      patternId, expectedCardId: current.identity.cardId, expectedRevision: revision,
      tuning: { session: lookSession, expectedBootId: current.identity.bootId, values: live },
    });
    const receipt = normalizeSavedLookTuning(response, current.identity.cardId, patternId);
    const readback = await current.readTuning(patternId);
    if (receipt.revision === revision || receipt.revision !== readback.revision
      || !sameTuningValues(receipt.values, live) || !sameTuningValues(readback.values, live)) {
      throw new Error('The saved adjustments could not be verified. Check the current look before saving again.');
    }
    setNotice('Adjustments saved to this look.');
  });

  const savePattern = () => mutate(async (current, token) => {
    const patternId = data?.controls.activePatternId;
    const edit = patternEdits[patternId];
    if (!edit || edit.cardId !== current.identity.cardId || data?.status.playlist?.playing) throw new Error('Stay on this look before saving adjustments.');
    const live = await current.read();
    if (live.controls.activePatternId !== patternId || live.status.playlist?.playing
      || Object.entries(edit.changes).some(([key, value]) => Math.abs(Number(live.controls.look[key]) - Number(value)) > 0.00001)) {
      throw new Error('The look changed since your adjustment. Adjust it again before saving.');
    }
    const response = await current.write('/api/client-pattern', {
      expectedCardId: edit.cardId, expectedRevision: edit.revision, patternId, changes: edit.changes,
    });
    const receipt = normalizeClientPattern(response, edit.cardId, patternId);
    const readback = await current.readPattern(patternId);
    verifySavedPattern(receipt, readback, edit.changes);
    if (token !== generation.current || sessionRef.current !== current) return;
    setPatternEdits(previous => { const next = { ...previous }; delete next[patternId]; return next; });
    setNotice('Adjustments saved to this look.');
  });
  const savePlaylist = () => mutate(async (current, token) => {
    const response = await current.write('/api/client-playlist', {
      expectedCardId: current.identity.cardId, expectedRevision: playlist.revision,
      enabled: draft.length > 0, fadeMs: playlist.fadeMs, entries: draft,
    });
    const saved = normalizeClientPlaylist(response, data.controls.patterns, current.identity.cardId);
    if (token !== generation.current) return;
    setPlaylist(saved); setDraft(saved.entries); setDirty(false); setNotice('Playlist saved on your card.');
  });
  const reloadPlaylist = () => mutate(async (current, token) => {
    const saved = await current.readPlaylist(data.controls.patterns);
    if (token !== generation.current) return;
    setPlaylist(saved); setDraft(saved.entries); setDirty(false); setPlaylistError(''); setNotice('Loaded the playlist from your card.');
  });
  const editEntries = entries => { setDraft(entries); setDirty(true); setNotice(''); };
  const patterns = data?.controls.patterns || [];
  const activeId = data?.controls.activePatternId;
  const active = patterns.find(pattern => pattern.id === activeId);
  const playing = data?.status.playlist?.playing === true;
  const connected = Boolean(session);
  const blackout = data?.controls.blackout === true;
  const activeLabel = !connected ? 'Last selected' : blackout ? 'Selected' : 'Playing';
  const activeEdit = patternEdits[activeId];
  const relative = data?.status.capabilities?.lookTuning?.version === 1;
  const tuning = data?.controls.tuning;
  const legacyControls = !relative && !data?.controls.multipleZones && active?.mode !== 'sequence';
  const legacySave = legacyControls && data?.status.capabilities?.clientPattern?.version >= 1 && Boolean(active?.savedControlsRevision);
  const canSave = Boolean(tuning) || legacySave;
  const unsavedTuning = tuning ? !sameTuningValues(tuning.live, tuning.saved) : Boolean(activeEdit);
  const tuningUnavailable = relative
    ? data?.status.streaming ? 'Stop live playback to adjust this look.'
      : 'Select an installed look to adjust and save its settings.'
    : 'Update the card to adjust and save this whole look.';
  const disabled = !connected || busy;
  const totalSeconds = draft.reduce((sum, entry) => sum + entry.dwellSeconds, 0);

  return <div className="cl-shell">
    <header className="cl-header"><a className="cl-brand" href={window.location.pathname + window.location.hash} aria-label="Lightweaver player"><span className="cl-brand-mark">✳</span> lightweaver<span className="cl-brand-sub">PLAYER</span></a><span className={`cl-connection ${connected ? 'is-connected' : ''}`}><i />{connected ? 'Lights connected' : connecting ? 'Connecting…' : 'Lights unavailable'}</span></header>
    <main className="cl-main">
      {!connected && <section className="cl-connect" aria-labelledby="connect-title"><span className="cl-eyebrow">{targetRef.current.name}</span><h1 id="connect-title">{connecting ? 'Connecting to your lights' : 'Lights unavailable'}</h1><p>{connecting ? 'Reading the looks installed on your card.' : 'Join the same Wi-Fi as your lights, then try again.'}</p>{!connecting && !initialTarget.error && <button className="cl-button cl-primary cl-reconnect" onClick={() => connect(useBridge)}>{useBridge ? 'Connect to lights' : 'Reconnect'}</button>}</section>}
      {error && <div className="cl-message cl-error" role="alert"><span>{error}</span>{connected && <button onClick={() => connect(session.mode === 'Card page')} disabled={busy || connecting}>Reconnect</button>}</div>}
      {data && <>
        <section className="cl-installation" aria-labelledby="installation-title">
          <h1 id="installation-title">{data.status.piece?.name || 'Your Lightweaver'}</h1>
          <div className="cl-controls">
            <div className="cl-light-controls">
              {tuning ? <RangeControl key={tuning.session} label="Brightness" value={Math.round(tuning.live.brightnessScale * 100)} min={2} max={100} suffix="%" disabled={disabled} onCommit={value => setLookTuning('brightnessScale', value / 100)} />
                : legacyControls ? <RangeControl label="Brightness" value={Math.round((data.controls.look.brightness || 0) * 100)} min={2} max={100} suffix="%" disabled={disabled} onCommit={value => control('brightness', value / 100)} />
                  : <p className="cl-hint">{tuningUnavailable}</p>}
              <button className="cl-button" disabled={disabled} onClick={() => control('blackout', !blackout)}>{blackout ? 'Turn lights on' : 'Turn lights off'}</button>
            </div>
            {(playing || data.status.playlist?.configured) && <div className="cl-playback">
              <button className="cl-button" disabled={disabled || (!playing && dirty)} onClick={() => control('playlist', playing ? 'pause' : 'play')}>{playing ? 'Pause playlist' : 'Play playlist'}</button>
              {playing && <span className="cl-playing-detail">Look {Number(data.status.playlist.entryIndex || 0) + 1} of {data.status.playlist.entryCount}{Number.isFinite(data.status.playlist.remainingSeconds) ? ` · ${data.status.playlist.remainingSeconds}s left` : ''}</span>}
            </div>}
          </div>
        </section>
        <nav className="cl-tabs" aria-label="Player views">
          <button aria-current={tab === 'looks' ? 'page' : undefined} onClick={() => setTab('looks')}>Looks</button>
          <button aria-current={tab === 'tuning' ? 'page' : undefined} onClick={() => setTab('tuning')}>Tuning</button>
          <button aria-current={tab === 'playlist' ? 'page' : undefined} onClick={() => setTab('playlist')}>Playlist</button>
        </nav>
        <div className="cl-sr-only" role="status">{active ? `${activeLabel}: ${active.label}` : ''}{blackout ? '. Lights off.' : ''}</div>
        {tab === 'looks' && <section aria-label="Installed looks">
          <div className="cl-pattern-grid">
            {patterns.map(pattern => {
              const selected = pattern.id === activeId;
              return <button key={pattern.id} className="cl-pattern" disabled={disabled} aria-pressed={selected} onClick={() => control('patternId', pattern.id)}>
                <span>{pattern.label}</span>
                {selected && <span className="cl-active-tag" aria-hidden="true">{activeLabel}</span>}
              </button>;
            })}
          </div>
        </section>}
        {tab === 'tuning' && <section className="cl-tuning" aria-labelledby="tuning-title">
          <h2 id="tuning-title">{active?.label || 'Current look'}</h2>
          {tuning?.motion ? <div className="cl-tuning-sliders" key={tuning.session}>
            <RangeControl label="Speed" value={tuning.live.speedScale} min={tuning.speedMin} max={tuning.speedMax} step="any" suffix="×" disabled={disabled} onCommit={value => setLookTuning('speedScale', value)} />
            <RangeControl label="Hue shift" value={tuning.live.hueOffset} min={-128} max={127} disabled={disabled} onCommit={value => setLookTuning('hueOffset', value)} />
          </div> : legacyControls ? <div className="cl-tuning-sliders">
            <RangeControl label="Speed" value={data.controls.look.speed} min={0.05} max={3} step={0.05} suffix="×" disabled={disabled} onCommit={value => control('speed', value)} />
            <RangeControl label="Hue shift" value={data.controls.look.hueShift} min={-128} max={128} disabled={disabled} onCommit={value => control('hueShift', value)} />
          </div> : tuning && <p className="cl-hint">Recorded looks support brightness. Their speed and hue are fixed.</p>}
          <div className="cl-pattern-save">
            <div>
              {unsavedTuning && !playing && <p role="status">Unsaved adjustments</p>}
              <p className="cl-hint">{!canSave
                ? legacyControls ? 'Saving adjustments to this look is unavailable.' : tuningUnavailable
                : playing ? 'Pause the playlist to save adjustments to a look.'
                  : tuning ? 'Save to keep these adjustments when the look starts again.'
                    : 'Save to this look before switching looks or reconnecting.'}</p>
            </div>
            {(canSave || !legacyControls) && <button className="cl-button" disabled={disabled || !canSave || playing || !unsavedTuning} onClick={tuning ? saveLookTuning : savePattern}>Save adjustments</button>}
          </div>
        </section>}
        {tab === 'playlist' && <section className="cl-playlist" aria-label="Edit playlist">
          {playlist && <p className="cl-hint cl-playlist-duration">Loop duration {Math.floor(totalSeconds / 60)}m {totalSeconds % 60}s</p>}
          {!playlist ? <div className="cl-empty">
            <h3>{playlistError ? 'Playlist unavailable' : 'Playlist editing needs a card update'}</h3>
            <p>{playlistError || 'You can still choose looks and adjust your lights. Ask the installation owner to update your lights to enable playlist editing.'}</p>
            {data.status.capabilities?.clientPlaylist?.version >= 1 && <button className="cl-button" onClick={reloadPlaylist} disabled={disabled}>Read playlist again</button>}
          </div> : <>
            {draft.map((entry, index) => {
              const label = patterns.find(pattern => pattern.id === entry.patternId)?.label || entry.patternId;
              return <div className="cl-playlist-row" key={`${entry.patternId}-${index}`}>
                <span className="cl-row-number">{index + 1}</span>
                <span className="cl-row-title">{label}</span>
                <DurationInput label={`Duration for ${label}, entry ${index + 1}`} value={entry.dwellSeconds} disabled={disabled} onCommit={value => editEntries(updatePlaylistEntry(draft, index, value))} />
                <div className="cl-row-actions">
                  <button aria-label={`Move entry ${index + 1} up`} disabled={disabled || index === 0} onClick={() => editEntries(movePlaylistEntry(draft, index, index - 1))}>↑</button>
                  <button aria-label={`Move entry ${index + 1} down`} disabled={disabled || index === draft.length - 1} onClick={() => editEntries(movePlaylistEntry(draft, index, index + 1))}>↓</button>
                  <button aria-label={`Remove entry ${index + 1}`} disabled={disabled} onClick={() => editEntries(draft.filter((_, position) => position !== index))}>×</button>
                </div>
              </div>;
            })}
            {!draft.length && <div className="cl-empty"><h3>Playlist is empty</h3><p>Add a look and choose how long it plays.</p></div>}
            <div className="cl-add-row">
              <select aria-label="Look to add" value={addId} onChange={event => setAddId(event.target.value)} disabled={disabled || draft.length >= CLIENT_PLAYLIST_LIMIT}>
                {patterns.map(pattern => <option key={pattern.id} value={pattern.id}>{pattern.label}</option>)}
              </select>
              <button className="cl-button" disabled={disabled || !addId || draft.length >= CLIENT_PLAYLIST_LIMIT} onClick={() => editEntries([...draft, { patternId: addId, dwellSeconds: 30 }])}>Add look</button>
            </div>
            <div className="cl-playlist-footer">
              <span>{draft.length} of {CLIENT_PLAYLIST_LIMIT} entries · 1–3,600 sec each</span>
              <div>
                <button className="cl-text-button" onClick={reloadPlaylist} disabled={disabled}>Reload from card</button>
                <button className="cl-button cl-primary" disabled={disabled || !dirty} onClick={savePlaylist}>{busy ? 'Saving…' : 'Save playlist'}</button>
              </div>
            </div>
            {dirty && <p className="cl-hint">Unsaved changes. Save your playlist before starting a new loop.</p>}
          </>}
        </section>}
        {notice && <div className="cl-message" role="status">{notice}</div>}
      </>}
    </main><footer className="cl-footer"><div><a href="https://led.mandalacodes.com/api/owner/studio">Owner tools</a><span>{release?.buildNumber ? `Client build ${release.buildNumber}` : 'Client preview'}</span></div></footer>
  </div>;
}
