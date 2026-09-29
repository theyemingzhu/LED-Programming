import React, { useEffect, useRef, useState } from 'react';
import { normalizeClientPattern, verifySavedPattern } from './clientPattern.js';
import { connectClient } from './clientTransport.js';
import { CLIENT_PLAYLIST_LIMIT, controlPatch, movePlaylistEntry, normalizeClientPlaylist, updatePlaylistEntry } from './clientModel.js';
import { readClientTarget, saveClientPairing } from './clientPairing.js';
import './client.css';

const release = typeof __LIGHTWEAVER_CLIENT_RELEASE__ !== 'undefined' ? __LIGHTWEAVER_CLIENT_RELEASE__ : null;

function PatternArt({ index = 0, large = false }) {
  return <div className={`cl-art ${large ? 'cl-art-large' : ''}`} style={{ '--pattern-hue': `${(index * 47 + 24) % 360}deg` }} aria-hidden="true"><span /><span /><span /><span /><i /></div>;
}

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
  const [tab, setTab] = useState('patterns');
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
    if (['brightness', 'speed', 'hueShift'].includes(key) && !data?.status.playlist?.playing && response.appliedPatternId && response.appliedPatternId !== editedId) throw new Error('The playing pattern changed. This adjustment was not saved to your pattern.');
    if (key !== 'playlist' && response[field] === undefined) throw new Error('The card did not confirm the changed control. Reconnect to check its state.');
    if (token === generation.current && ['brightness', 'speed', 'hueShift'].includes(key) && !data?.status.playlist?.playing
      && data?.status.capabilities?.clientPattern?.version >= 1 && installed?.savedControlsRevision) {
      setPatternEdits(previous => {
        const held = previous[editedId];
        return { ...previous, [editedId]: { patternId: editedId, cardId: current.identity.cardId, revision: held?.revision || installed.savedControlsRevision, changes: { ...held?.changes, [key]: response[field] } } };
      });
    }
  });
  const savePattern = () => mutate(async (current, token) => {
    const patternId = data?.controls.activePatternId;
    const edit = patternEdits[patternId];
    if (!edit || edit.cardId !== current.identity.cardId || data?.status.playlist?.playing) throw new Error('Stay on this pattern before updating it.');
    const live = await current.read();
    if (live.controls.activePatternId !== patternId || live.status.playlist?.playing
      || Object.entries(edit.changes).some(([key, value]) => Math.abs(Number(live.controls.look[key]) - Number(value)) > 0.00001)) {
      throw new Error('The pattern changed since your adjustment. Adjust it again before updating.');
    }
    const response = await current.write('/api/client-pattern', {
      expectedCardId: edit.cardId, expectedRevision: edit.revision, patternId, changes: edit.changes,
    });
    const receipt = normalizeClientPattern(response, edit.cardId, patternId);
    const readback = await current.readPattern(patternId);
    verifySavedPattern(receipt, readback, edit.changes);
    if (token !== generation.current || sessionRef.current !== current) return;
    setPatternEdits(previous => { const next = { ...previous }; delete next[patternId]; return next; });
    setNotice('Pattern updated on your lights.');
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
  const activeIndex = Math.max(0, patterns.findIndex(pattern => pattern.id === activeId));
  const active = patterns.find(pattern => pattern.id === activeId);
  const playing = data?.status.playlist?.playing === true;
  const connected = Boolean(session);
  const activeEdit = patternEdits[activeId];
  const canSavePattern = data?.status.capabilities?.clientPattern?.version >= 1 && Boolean(active?.savedControlsRevision);
  const disabled = !connected || busy;
  const totalSeconds = draft.reduce((sum, entry) => sum + entry.dwellSeconds, 0);


  return <div className="cl-shell">
    <header className="cl-header"><a className="cl-brand" href={window.location.pathname + window.location.hash} aria-label="Lightweaver player"><span className="cl-brand-mark">✳</span> lightweaver<span className="cl-brand-sub">PLAYER</span></a><span className={`cl-connection ${connected ? 'is-connected' : ''}`}><i />{connected ? 'Lights connected' : connecting ? 'Connecting…' : 'Lights unavailable'}</span></header>
    <main className="cl-main">
      {!connected && <section className="cl-connect" aria-labelledby="connect-title"><span className="cl-eyebrow">{targetRef.current.name || 'YOUR LIGHT, YOUR RHYTHM'}</span><h1 id="connect-title">{connecting ? 'Connecting to your lights' : 'Lights unavailable'}</h1><p>{connecting ? 'Your patterns and playlist will be here in a moment.' : 'Join the same Wi-Fi as your lights, then try again.'}</p>{!connecting && !initialTarget.error && <button className="cl-button cl-primary cl-reconnect" onClick={() => connect(useBridge)}>{useBridge ? 'Connect to lights' : 'Reconnect'}</button>}</section>}
      {error && <div className="cl-message cl-error" role="alert"><span>{error}</span>{connected && <button onClick={() => connect(session.mode === 'Card page')} disabled={busy || connecting}>Reconnect</button>}</div>}
      {data && <>
        <section className="cl-now" aria-labelledby="now-title"><div className="cl-now-art"><PatternArt index={activeIndex} large /><span className="cl-art-caption">LIGHTWEAVER COLLECTION</span></div><div className="cl-now-body"><div className="cl-now-kicker"><span className="cl-eyebrow">{connected ? 'NOW PLAYING' : 'LAST KNOWN PATTERN'}</span><span className="cl-mode-label">{playing ? 'Playlist cycling' : 'Staying on one pattern'}</span></div><h1 id="now-title">{active?.label || 'Your lights'}</h1><p className="cl-piece-name">{data.status.piece?.name || 'Your Lightweaver'}</p><div className="cl-play-modes" role="group" aria-label="Playback mode"><button className={!playing ? 'is-selected' : ''} aria-pressed={!playing} disabled={disabled} onClick={() => { if (playing) control('playlist', 'pause'); }}><span aria-hidden="true">∞</span> Stay on pattern</button><button className={playing ? 'is-selected' : ''} aria-pressed={playing} disabled={disabled || !data.status.playlist?.configured || dirty} onClick={() => control('playlist', 'play')}><span aria-hidden="true">↻</span> Repeat playlist</button></div>{playing && <p className="cl-playing-detail" role="status">Pattern {Number(data.status.playlist.entryIndex || 0) + 1} of {data.status.playlist.entryCount}{Number.isFinite(data.status.playlist.remainingSeconds) ? ` · ${data.status.playlist.remainingSeconds}s remaining` : ''}</p>}<RangeControl label="Brightness" value={Math.round((data.controls.look.brightness || 0) * 100)} min={2} max={100} suffix="%" disabled={disabled} onCommit={value => control('brightness', value / 100)} /><div className="cl-now-bottom"><RangeControl label="Speed" value={data.controls.look.speed} min={0.05} max={3} step={0.05} suffix="×" disabled={disabled} onCommit={value => control('speed', value)} /><button className="cl-blackout" aria-pressed={data.controls.blackout} disabled={disabled} onClick={() => control('blackout', !data.controls.blackout)}>{data.controls.blackout ? 'Lights on' : 'Lights off'}</button></div><RangeControl label="Hue shift" value={data.controls.look.hueShift} min={-128} max={128} disabled={disabled} onCommit={value => control('hueShift', value)} />{canSavePattern && <div className="cl-pattern-save"><span role="status">{activeEdit ? 'Unsaved pattern changes' : 'Save adjustments to this pattern'}{playing ? ' · Stay on a pattern to save edits' : ''}</span><button className="cl-button" disabled={disabled || playing || !activeEdit} onClick={savePattern}>Update pattern</button></div>}</div></section>
        <nav className="cl-tabs" aria-label="Player views"><button aria-current={tab === 'patterns' ? 'page' : undefined} onClick={() => setTab('patterns')}>Patterns <span>{patterns.length}</span></button><button aria-current={tab === 'playlist' ? 'page' : undefined} onClick={() => setTab('playlist')}>Your playlist <span>{playlist ? draft.length : '—'}</span></button></nav>
        {tab === 'patterns' ? <section aria-labelledby="patterns-title"><div className="cl-section-head"><div><h2 id="patterns-title">Find your mood.</h2><p>Patterns loaded on your card. Tap one to let it stay.</p></div><span className="cl-small-note">ON YOUR CARD</span></div><div className="cl-pattern-grid">{patterns.map((pattern, index) => <button key={pattern.id} className={`cl-pattern ${pattern.id === activeId ? 'is-active' : ''}`} disabled={disabled} aria-pressed={pattern.id === activeId} onClick={() => control('patternId', pattern.id)}><PatternArt index={index} /><span className="cl-pattern-label"><span>{pattern.label}</span><span className="cl-pattern-play" aria-hidden="true">{pattern.id === activeId ? 'Ⅱ' : '↗'}</span></span>{pattern.id === activeId && <span className="cl-active-tag">Playing</span>}</button>)}</div></section> : <section className="cl-playlist" aria-labelledby="playlist-title"><div className="cl-section-head"><div><h2 id="playlist-title">Set the pace.</h2><p>A sequence for your space, saved on the card.</p></div>{playlist && <span className="cl-small-note">{Math.floor(totalSeconds / 60)}m {totalSeconds % 60}s / LOOP</span>}</div>
          {!playlist ? <div className="cl-empty"><h3>{playlistError ? 'Playlist unavailable' : 'Playlist editing needs a card update'}</h3><p>{playlistError || 'You can still choose patterns and adjust your lights. Ask the installation owner to update your lights to enable playlist editing.'}</p>{data.status.capabilities?.clientPlaylist?.version >= 1 && <button className="cl-button" onClick={reloadPlaylist} disabled={disabled}>Read playlist again</button>}</div> : <>
          <div className="cl-playlist-rows">{draft.map((entry, index) => <div className="cl-playlist-row" key={`${entry.patternId}-${index}`}><span className="cl-row-number">{String(index + 1).padStart(2, '0')}</span><span className="cl-row-title">{patterns.find(pattern => pattern.id === entry.patternId)?.label || entry.patternId}</span><DurationInput label={`Duration for ${patterns.find(pattern => pattern.id === entry.patternId)?.label || entry.patternId}, entry ${index + 1}`} value={entry.dwellSeconds} disabled={disabled} onCommit={value => editEntries(updatePlaylistEntry(draft, index, value))} /><div className="cl-row-actions"><button aria-label={`Move entry ${index + 1} up`} disabled={disabled || index === 0} onClick={() => editEntries(movePlaylistEntry(draft, index, index - 1))}>↑</button><button aria-label={`Move entry ${index + 1} down`} disabled={disabled || index === draft.length - 1} onClick={() => editEntries(movePlaylistEntry(draft, index, index + 1))}>↓</button><button aria-label={`Remove entry ${index + 1}`} disabled={disabled} onClick={() => editEntries(draft.filter((_, position) => position !== index))}>×</button></div></div>)}</div>
          {!draft.length && <div className="cl-empty"><h3>Start with a favorite.</h3><p>Add a pattern below, then choose how long it plays.</p></div>}
          <div className="cl-add-row"><select aria-label="Pattern to add" value={addId} onChange={event => setAddId(event.target.value)} disabled={disabled || draft.length >= CLIENT_PLAYLIST_LIMIT}>{patterns.map(pattern => <option key={pattern.id} value={pattern.id}>{pattern.label}</option>)}</select><button className="cl-button" disabled={disabled || !addId || draft.length >= CLIENT_PLAYLIST_LIMIT} onClick={() => editEntries([...draft, { patternId: addId, dwellSeconds: 30 }])}>+ Add pattern</button></div><div className="cl-playlist-footer"><span>{draft.length} of {CLIENT_PLAYLIST_LIMIT} places · 1–3,600 sec each</span><div><button className="cl-text-button" onClick={reloadPlaylist} disabled={disabled}>Reload from card</button><button className="cl-button cl-primary" disabled={disabled || !dirty} onClick={savePlaylist}>{busy ? 'Saving…' : 'Save playlist'}</button></div></div>{dirty && <p className="cl-hint">Unsaved changes. Save your playlist before starting a new loop.</p>}
          </>}
        </section>}
        {notice && <div className="cl-message" role="status">{notice}</div>}
      </>}
    </main><footer className="cl-footer"><span>Made for a moment of wonder.</span><div><a href="https://led.mandalacodes.com/api/owner/studio">Owner tools</a><span>{release?.buildNumber ? `Client build ${release.buildNumber}` : 'Client preview'}</span></div></footer>
  </div>;
}
