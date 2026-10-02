import React, { useEffect, useMemo, useRef, useState } from 'react';
import { REAL_PATTERNS } from '../v3/v3-data.js';
import { clientPatternGradient } from './ClientPatternArt.jsx';
import { clientLibraryTargets } from './clientLibraryInstall.js';
import './clientLibraryBrowser.css';

function SectionMap({ sections, outputs = [], name, ready }) {
  const lastPixel = Math.max(1, ...sections.flatMap(section => section.ranges.map(range => range.start + range.count)));
  const directionFor = section => {
    const directions = new Set(outputs.flatMap(output => output.segments || []).filter(segment => typeof segment.reversed === 'boolean' && section.ranges.some(range => range.start < segment.start + segment.count && segment.start < range.start + range.count)).map(segment => segment.reversed));
    return directions.size > 1 ? ' · directions ← →' : directions.size === 1 ? (directions.has(true) ? ' · direction ←' : ' · direction →') : '';
  };
  return <section className="cl-library-map" aria-label="Installed section map"><div><h3>{name || 'Your piece'}</h3><span>{ready ? 'Installed map verified' : 'Section readback'}</span></div><p>LED positions on your lights. Layout and mirroring stay unchanged.</p>
    {sections.map(section => <div className="cl-library-map-row" key={section.id}><div><strong>{section.label}</strong><small>{section.mirrorOf ? `Mirrors ${sections.find(source => source.id === section.mirrorOf)?.label || section.mirrorOf}${section.mirrorFlip ? ' · reversed' : ''}` : section.continuous ? 'Continuous across its ranges' : 'Source section'}{directionFor(section)}</small></div><div className="cl-library-map-track" aria-label={`${section.label}: ${section.ranges.map(range => `${range.start + 1}–${range.start + range.count}`).join(', ')}`}>{section.ranges.map((range, index) => <span key={index} style={{ left: `${range.start / lastPixel * 100}%`, width: `${range.count / lastPixel * 100}%` }} />)}</div><small>{section.ranges.reduce((sum, range) => sum + range.count, 0)} LEDs</small></div>)}
  </section>;
}

function SectionBoard({ targets, sections, placements, selected, saving, onPlace, onRemove, onTune, palette, search, onSearch, onChoose }) {
  const drop = (event, targetId) => {
    event.preventDefault();
    const id = event.dataTransfer.getData('application/x-lightweaver-pattern');
    if (REAL_PATTERNS.some(pattern => pattern.id === id)) onPlace(id, targetId);
  };
  return <section className="cl-section-board" aria-label="Place patterns on your piece">
    <div className="cl-section-board-heading"><h3>Build your look</h3><p>Tap a pattern, then tap where it goes. You can also drag patterns onto sections.</p></div>
    <label className="cl-board-search">Find a pattern<input type="search" aria-label="Search board patterns" value={search} onChange={event => onSearch(event.target.value)} placeholder="Name or mood" /></label>
    <div className="cl-section-workspace"><div className="cl-board-palette" aria-label="Patterns to place">{palette.map(pattern => <button type="button" key={pattern.id} className={selected?.id === pattern.id ? 'is-selected' : ''} aria-label={`Select ${pattern.label}`} aria-pressed={selected?.id === pattern.id} disabled={saving} draggable={!saving} onDragStart={event => { event.dataTransfer.setData('application/x-lightweaver-pattern', pattern.id); event.dataTransfer.effectAllowed = 'copy'; }} onClick={() => onChoose(pattern)}><span style={{ background: pattern.grad }} aria-hidden="true" /><strong>{pattern.label}</strong></button>)}</div>
    <div className="cl-section-board-targets">{targets.map(target => {
      const assignment = target.id === '*' ? null : placements[target.id];
      const pattern = REAL_PATTERNS.find(pattern => pattern.id === assignment?.presetId);
      const allPlaced = target.sectionIds.every(id => placements[id]);
      return <div className={`cl-section-slot${target.id === '*' ? ' cl-section-slot-whole' : ''}`} key={target.id}><button type="button" className={`cl-section-target${assignment ? ' is-placed' : ''}${target.id === '*' ? ' cl-section-target-whole' : ''}`} key={target.id}
        aria-label={selected ? `Place ${selected.label} on ${target.label}` : `Choose a pattern for ${target.label}`}
        aria-pressed={target.id === '*' ? allPlaced : Boolean(assignment)} disabled={saving}
        onClick={() => selected && onPlace(selected.id, target.id)} onDragOver={event => { if (!saving) { event.preventDefault(); event.dataTransfer.dropEffect = 'copy'; } }} onDrop={event => !saving && drop(event, target.id)}>
        <span className="cl-section-target-art" data-placement-preview={assignment?.presetId || ''} style={pattern ? { background: pattern.grad, filter: `hue-rotate(${(assignment.tuning?.hueShift || 0) * 360 / 256}deg) brightness(${assignment.tuning?.brightness ?? .7})` } : undefined} aria-hidden="true">{!pattern && <span>{target.id === '*' ? '↔' : '+'}</span>}</span>
        <strong>{target.label}</strong><span>{pattern ? pattern.label : target.id === '*' ? 'Apply to all source sections' : 'Keeps its current look'}</span>
        {target.id !== '*' && target.mirroredIds.length > 0 && <small>Also mirrors to {target.mirroredIds.map(id => sections.find(section => section.id === id)?.label || id).join(', ')}</small>}
      </button>{assignment && <div className="cl-section-placement-actions"><button className="cl-section-remove" type="button" aria-label={`Tune ${target.label}`} disabled={saving} onClick={() => onTune(target.id)}>Tune section</button><button className="cl-section-remove" type="button" aria-label={`Keep current look on ${target.label}`} disabled={saving} onClick={() => onRemove(target.id)}>Remove placement</button></div>}</div>;
    })}</div></div>
    <p className="cl-library-footnote">Section names follow the lights. Mirrors move with their source; the installed map stays unchanged.</p>
  </section>;
}

export default function ClientLibrary({ session, data, disabled = false, onSaveLook, onInstalled, onAddToPlaylist, canAddToPlaylist = false, remainingPlaylistSlots }) {
  const [creating, setCreating] = useState(false);
  const [search, setSearch] = useState('');
  const [visibleCount, setVisibleCount] = useState(12);
  const [selected, setSelected] = useState(null);
  const [name, setName] = useState('');
  const [brightness, setBrightness] = useState(70);
  const [speed, setSpeed] = useState(1);
  const [hueShift, setHueShift] = useState(0);
  const [dwell, setDwell] = useState('30');
  const [targetMode, setTargetMode] = useState('whole');
  const [selectedSections, setSelectedSections] = useState([]);
  const [placements, setPlacements] = useState({});
  const [activeTargetId, setActiveTargetId] = useState('');
  const [draftLayoutRevision, setDraftLayoutRevision] = useState('');
  const [readLibrary, setReadLibrary] = useState(null);
  const [libraryError, setLibraryError] = useState('');
  const library = data?.library || readLibrary;
  const layout = data?.layout || library?.layout;
  const sections = layout?.sections || library?.sections || data?.sections || [];
  const layoutRevision = layout?.installationFingerprint || layout?.revision || library?.layoutRevision || '';
  const mapReady = Boolean(session && layout?.ready === true && layoutRevision && library?.cardId === session.identity.cardId && library?.bootId === session.identity.bootId);
  const targets = useMemo(() => { try { return clientLibraryTargets(sections); } catch { return []; } }, [sections]);
  const roots = targets.slice(1);
  const [drafts, setDrafts] = useState(() => {
    try { return JSON.parse(localStorage.getItem('lw_client_library_drafts_v1') || '[]').filter(draft => REAL_PATTERNS.some(pattern => pattern.id === draft.patternId) && typeof draft.name === 'string' && draft.name.length <= 48 && Number.isFinite(draft.brightness) && draft.brightness >= 2 && draft.brightness <= 100 && Number.isFinite(draft.speed) && draft.speed >= 0.05 && draft.speed <= 3 && Number.isInteger(draft.hueShift) && draft.hueShift >= -128 && draft.hueShift <= 128).slice(0,16); } catch { return []; }
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [savedReceipt, setSavedReceipt] = useState(null);
  const editor = useRef(null);
  const board = useRef(null);
  const generation = useRef(0);
  const currentLayout = useRef(layoutRevision); currentLayout.current = layoutRevision;
  useEffect(() => {
    const token = ++generation.current;
    setSelectedSections([]); setPlacements({}); setTargetMode('whole'); setNotice(''); setReadLibrary(null); setLibraryError(''); setSavedReceipt(null);
    if (session?.readLibrary && data?.libraryInstallAvailable && !data?.library) void session.readLibrary().then(value => { if (token === generation.current) setReadLibrary(value); }).catch(cause => { if (token === generation.current) setLibraryError(cause.message); });
    return () => { generation.current++; };
  }, [session]);
  const installedPatterns = data?.controls?.patterns || [];
  const patterns = useMemo(() => REAL_PATTERNS.filter(pattern => `${pattern.label} ${pattern.desc} ${pattern.cat}`.toLowerCase().includes(search.trim().toLowerCase())), [search]);
  const duration = Number(dwell);
  const validDuration = dwell.trim() !== '' && Number.isInteger(duration) && duration >= 1 && duration <= 3600;
  const targetIds = Object.keys(placements);
  const assignments = targetIds.map(targetId => ({ targetId, ...placements[targetId] }));
  const supported = assignments.length > 0 && assignments.every(assignment => library?.supportedPresetIds?.includes(assignment.presetId));
  const canInstall = mapReady && draftLayoutRevision === layoutRevision && library?.canInstall === true && library.remaining > 0 && supported && targetIds.length > 0;
  const signature = JSON.stringify([name.trim(), assignments, layoutRevision]);
  const savedForDraft = savedReceipt?.signature === signature && savedReceipt.result?.cardId === session?.identity?.cardId && savedReceipt.result?.layoutRevision === layoutRevision;
  const choose = pattern => {
    setSelected(pattern); setActiveTargetId(''); if (!name.trim()) setName(`${pattern.label} look`); setBrightness(70); setSpeed(1); setHueShift(0); if (!Object.keys(placements).length) setDraftLayoutRevision(layoutRevision); setError(''); setNotice('');
    if (targetMode === 'whole') {
      const next = Object.fromEntries(roots.map(root => [root.id, { presetId: pattern.id, tuning: { brightness: .7, speed: 1, hueShift: 0 } }]));
      setPlacements(next); setSelectedSections(Object.keys(next)); setActiveTargetId('*'); setDraftLayoutRevision(layoutRevision); setSavedReceipt(null);
    }
    requestAnimationFrame(() => (targetMode === 'sections' ? board.current : editor.current)?.scrollIntoView({ block: 'start', behavior: 'smooth' }));
  };
  const place = (presetId, targetId) => {
    const pattern = REAL_PATTERNS.find(pattern => pattern.id === presetId);
    const target = targets.find(target => target.id === targetId);
    if (!pattern || !target || saving) return;
    if (Object.keys(placements).length && draftLayoutRevision !== layoutRevision) { setError('The section map changed. Use the current section map before moving patterns.'); return; }
    const tuning = selected?.id === presetId ? { brightness: brightness / 100, speed, hueShift } : { brightness: .7, speed: 1, hueShift: 0 };
    setSelected(pattern); if (!name.trim()) setName(`${pattern.label} look`);
    if (selected?.id !== presetId) { setBrightness(70); setSpeed(1); setHueShift(0); }
    setPlacements(previous => {
      const next = targetId === '*' ? {} : { ...previous };
      for (const id of target.sectionIds) next[id] = { presetId, tuning };
      setSelectedSections(Object.keys(next));
      return next;
    });
    setActiveTargetId(targetId); setTargetMode(targetId === '*' ? 'whole' : 'sections'); setDraftLayoutRevision(layoutRevision); setSavedReceipt(null); setError('');
    setNotice(`${pattern.label} placed on ${target.label}. Your lights have not changed.`);
  };
  const removePlacement = id => { setPlacements(previous => { const next = { ...previous }; delete next[id]; return next; }); setSelectedSections(previous => previous.filter(value => value !== id)); setSavedReceipt(null); };
  const tuneTarget = id => {
    const assignment = placements[id]; const pattern = REAL_PATTERNS.find(pattern => pattern.id === assignment?.presetId);
    if (!assignment || !pattern) return;
    setSelected(pattern); setActiveTargetId(id); setBrightness(assignment.tuning.brightness * 100); setSpeed(assignment.tuning.speed); setHueShift(assignment.tuning.hueShift);
    requestAnimationFrame(() => editor.current?.scrollIntoView({ block: 'start', behavior: 'smooth' }));
  };
  const updateTuning = (key, value) => {
    if (key === 'brightness') setBrightness(value * 100); else if (key === 'speed') setSpeed(value); else setHueShift(value);
    if (activeTargetId) setPlacements(previous => Object.fromEntries(Object.entries(previous).map(([id, assignment]) => [id,
      (activeTargetId === '*' || id === activeTargetId) && assignment.presetId === selected?.id ? { ...assignment, tuning: { ...assignment.tuning, [key]: value } } : assignment])));
    setSavedReceipt(null);
  };
  const installDraft = { presetId: assignments[0]?.presetId || selected?.id, label: name.trim(), targetIds,
    tuning: assignments[0]?.tuning || { brightness: brightness / 100, speed, hueShift }, assignments, layoutRevision };
  const addInstalled = async pattern => {
    if (saving || disabled || !onAddToPlaylist || !canAddToPlaylist || !validDuration) return;
    setSaving(true); setError(''); setNotice('');
    try {
      const added = await onAddToPlaylist(pattern.id, duration);
      if (added?.added !== true || added.patternId !== pattern.id) throw new Error('The pattern was not added to your playlist draft.');
      setNotice(`${pattern.label} was added to your playlist draft. Save the playlist to keep it on your lights.`);
    } catch (cause) { setError(cause.message); }
    finally { setSaving(false); }
  };
  const save = async event => {
    event.preventDefault();
    if (saving || disabled || !session || !onSaveLook || !onAddToPlaylist || !canAddToPlaylist || (!canInstall && !savedForDraft) || !selected || !name.trim() || !validDuration) return;
    const token = generation.current;
    setSaving(true); setError(''); setNotice('');
    let result = savedReceipt?.signature === signature ? savedReceipt.result : null;
    try {
      if (!result) {
        result = await onSaveLook(installDraft);
        if (generation.current !== token) return;
        if (result?.verified !== true || result.cardId !== session.identity.cardId || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(result.patternId) || result.layoutRevision !== layoutRevision || currentLayout.current !== layoutRevision) throw new Error('The saved look or its section map could not be verified. Nothing was added to your playlist.');
        setSavedReceipt({ signature, result });
        await onInstalled?.(result);
      }
      if (generation.current !== token || currentLayout.current !== layoutRevision) return;
      const added = await onAddToPlaylist(result.patternId, duration, { verifySaved: true, cardId: result.cardId, layoutRevision, draft: installDraft });
      if (added?.added !== true || added.patternId !== result.patternId) throw new Error('The look is saved on your lights, but was not added to your playlist draft. Try again to add it.');
      if (generation.current === token) setNotice(`${name.trim()} is saved on your lights and added to your playlist draft. Save the playlist to keep its timing.`);
    } catch (cause) {
      if (generation.current === token) {
        const candidate = cause.savedReceipt || (cause.savedPatternId ? { patternId: cause.savedPatternId, cardId: cause.savedCardId, layoutRevision: cause.layoutRevision } : null);
        if (candidate?.cardId === session.identity.cardId && candidate.layoutRevision === layoutRevision && /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(candidate.patternId)) {
          setSavedReceipt({ signature, result: candidate });
          setError('Your lights accepted the look, but confirmation is incomplete. Try again to check it and add it to the playlist; it will not be installed twice.');
        } else setError(cause.message || 'Your look could not be saved.');
      }
    }
    finally { if (generation.current === token) setSaving(false); }
  };
  const saveDraft = () => {
    if (!selected || !name.trim()) return;
    const next = [{ patternId: selected.id, name: name.trim(), brightness, speed, hueShift, cardId: session?.identity?.cardId || '', installationFingerprint: draftLayoutRevision, targetMode, sectionIds: selectedSections, assignments }, ...drafts.filter(draft => draft.name !== name.trim())].slice(0, 16);
    try { localStorage.setItem('lw_client_library_drafts_v1', JSON.stringify(next)); setDrafts(next); setNotice('Draft saved in this browser. It has not been sent to your lights.'); setError(''); }
    catch { setError('This browser could not save the draft.'); }
  };
  const openDraft = draft => {
    setCreating(true);
    const sameMap = mapReady && draft.cardId === session?.identity?.cardId && draft.installationFingerprint === layoutRevision;
    const sameSections = sameMap && Array.isArray(draft.sectionIds) && draft.sectionIds.every(id => roots.some(section => section.id === id));
    const restored = sameMap && Array.isArray(draft.assignments) ? draft.assignments.filter(assignment => roots.some(root => root.id === assignment.targetId) && REAL_PATTERNS.some(pattern => pattern.id === assignment.presetId) && assignment.tuning && Number.isFinite(assignment.tuning.brightness) && Number.isFinite(assignment.tuning.speed) && Number.isInteger(assignment.tuning.hueShift)) : [];
    setActiveTargetId('');
    setPlacements(Object.fromEntries(restored.map(({ targetId, ...assignment }) => [targetId, assignment])));
    setDraftLayoutRevision(sameMap ? layoutRevision : ''); setTargetMode(sameSections && draft.targetMode === 'sections' ? 'sections' : 'whole'); setSelectedSections(sameSections ? draft.sectionIds : []);
    setSelected(REAL_PATTERNS.find(pattern => pattern.id === draft.patternId)); setName(draft.name); setBrightness(draft.brightness); setSpeed(draft.speed); setHueShift(draft.hueShift); setSavedReceipt(null); setError(''); setNotice(sameMap ? '' : 'Choose the current section map before saving this draft to your lights.');
    requestAnimationFrame(() => editor.current?.scrollIntoView({ block: 'start', behavior: 'smooth' }));
  };
  return <section className="cl-library" aria-label="Pattern library">
    <div className="cl-library-intro"><div><h2>{creating ? 'Create a new pattern' : 'Add a pattern to your playlist'}</h2><p>{creating ? 'Choose a pattern for your whole piece. Adjust it or choose individual sections.' : 'These patterns are saved on your lights. Choose one to add it to the playlist.'}</p></div>{creating && <button type="button" className="cl-button" onClick={() => setCreating(false)}>Back to saved patterns</button>}</div>
    {!creating && session && data?.status?.capabilities?.clientLibrary?.version !== 1 && <p className="cl-library-availability">Saved patterns are ready to add. Your lights need an update only to save new patterns.</p>}
    <label className="cl-library-dwell">Time in playlist <input type="number" aria-label="Library playlist duration" min="1" max="3600" step="1" value={dwell} disabled={saving} onChange={event => setDwell(event.target.value)} /> seconds</label>
    {!validDuration && <p role="alert">Choose 1 to 3,600 whole seconds.</p>}
    {remainingPlaylistSlots === 0 && <p role="status">Your playlist is full. Remove an entry before adding another look.</p>}
    {!creating && <div className="cl-library-create-entry"><button className="cl-button" type="button" onClick={() => { setCreating(true); requestAnimationFrame(() => editor.current?.scrollIntoView({ block: 'start' })); }}>Create a new pattern</button><p>Make a new combination of patterns and sections.</p></div>}
    {!creating && installedPatterns.length > 0 && <div className="cl-library-installed"><h3>Saved on lights</h3><div className="cl-library-catalog">{installedPatterns.map(pattern => <article className="cl-library-catalog-card" key={pattern.id} data-installed-pattern-id={pattern.id}><div className="cl-library-gradient" style={{ background: clientPatternGradient(pattern) || '#263023' }} aria-hidden="true" /><div className="cl-library-catalog-copy"><h3>{pattern.label}</h3><button type="button" className="cl-button cl-primary cl-library-add" aria-label={`Add ${pattern.label} to playlist`} disabled={disabled || saving || !onAddToPlaylist || !canAddToPlaylist || !validDuration} onClick={() => addInstalled(pattern)}>+ Add to playlist</button></div></article>)}</div></div>}
    {!creating && !installedPatterns.length && <p>{session ? 'No saved patterns are available yet.' : 'Connect your lights to see and add their saved patterns. You can still create a browser draft.'}</p>}

    {creating && selected && <form className="cl-library-editor" ref={editor} onSubmit={save} aria-label="Create your pattern">
      <div className="cl-library-editor-heading"><div><h3>{selected.label}</h3><p>Draft in browser · {targetMode === 'whole' ? 'Whole piece' : `${targetIds.length} sections`}</p></div><button className="cl-text-button" type="button" disabled={saving} onClick={() => setCreating(false)}>Close</button></div>
      <div className="cl-library-editor-gradient" style={{ background: selected.grad, filter: `hue-rotate(${hueShift * 360 / 256}deg) brightness(${brightness / 100})` }} aria-label={`${selected.label} color preview`} />
      <label className="cl-library-field">Pattern name<input value={name} maxLength={48} onChange={event => setName(event.target.value)} disabled={saving} required /></label>
      <div className="cl-library-next-action">      {!session ? <p role="status">Connect your lights to save this pattern and choose their sections.</p> : data?.status?.capabilities?.clientLibrary?.version !== 1 ? <p role="status">Your lights need an update before new library patterns can be saved. Existing saved patterns can still be added from Back to saved patterns.</p> : !mapReady ? <p role="status">{data?.libraryError || libraryError || 'The installed section map has not been verified. Loading is paused.'}</p> : library?.canInstall !== true ? <p role="status">{library?.error || 'This saved pattern cannot be combined with new patterns yet.'} Choose another saved pattern in Patterns, then return here.</p> : library?.remaining < 1 ? <p role="status">Your lights have no room for another look. Already installed looks can still be added to the playlist.</p> : !supported && <p role="status">This pattern is not supported by your lights.</p>}
      <div className="cl-library-save-actions"><button className="cl-button" type="button" disabled={saving || !name.trim()} onClick={saveDraft}>Keep draft on this phone</button><button className="cl-button cl-primary" type="submit" disabled={disabled || saving || !session || !onSaveLook || !onAddToPlaylist || !canAddToPlaylist || (!canInstall && !savedForDraft) || !name.trim() || !validDuration}>{saving ? 'Saving…' : savedReceipt?.signature === signature ? 'Add to playlist' : 'Add to playlist'}</button></div>
<p className="cl-library-action-help">Adds this pattern to your lights and playlist. Save the playlist next to keep its timing.</p></div>
      <fieldset disabled={saving}><legend>Where it plays</legend><p className="cl-library-target-note">Whole piece applies to all sections following their saved map and direction.</p><div className="cl-library-target-mode"><label><input type="radio" name="library-target" checked={targetMode === 'whole'} onClick={() => selected && place(selected.id, '*')} onChange={() => {}} /> Whole piece</label><label><input type="radio" name="library-target" checked={targetMode === 'sections'} disabled={!roots.length} onChange={() => { setTargetMode('sections'); setPlacements({}); setSelectedSections([]); setActiveTargetId(''); }} /> Choose sections</label></div>
        {targetMode === 'sections' && <div className="cl-library-sections">{roots.map(section => <label key={section.id}><input type="checkbox" checked={Boolean(placements[section.id])} onChange={event => event.target.checked ? selected && place(selected.id, section.id) : removePlacement(section.id)} />{section.label}{section.mirroredIds.length > 0 && <small>Includes its mirrored sections</small>}</label>)}</div>}
        {data?.sectionsError && <p role="status">{data.sectionsError}</p>}
        {mapReady && draftLayoutRevision !== layoutRevision && <div className="cl-library-map-warning"><p>The section map changed or this draft was made elsewhere. Choose the current map before loading.</p><button type="button" className="cl-button" onClick={() => { setDraftLayoutRevision(layoutRevision); setTargetMode('sections'); setSelectedSections([]); setPlacements({}); setSavedReceipt(null); }}>Use current section map</button></div>}
      </fieldset>
      <p className="cl-library-tuning-target">{activeTargetId ? `Adjusting ${activeTargetId === '*' ? 'all placed sections' : roots.find(target => target.id === activeTargetId)?.label || 'selected section'}` : 'Adjust this pattern, then tap a section to place it.'}</p><div className="cl-library-tuning"><label>Brightness <output>{brightness}%</output><input type="range" aria-label="Library brightness" min="2" max="100" value={brightness} disabled={saving} onChange={event => updateTuning('brightness', Number(event.target.value) / 100)} /></label><label>Speed <output>{speed.toFixed(2)}×</output><input type="range" aria-label="Library speed" min="0.05" max="3" step="0.05" value={speed} disabled={saving} onChange={event => updateTuning('speed', Number(event.target.value))} /></label><label>Color shift <output>{hueShift}</output><input type="range" aria-label="Library color shift" min="-128" max="128" value={hueShift} disabled={saving} onChange={event => updateTuning('hueShift', Number(event.target.value))} /></label></div>
      <p className="cl-library-footnote">Changes stay in this browser until you save. Section patterns and mirrors follow the installed map.</p>
    </form>}
    {creating && targetMode === 'sections' && targets.length > 0 && <div ref={board} className="cl-section-board-anchor"><SectionBoard targets={targets} sections={sections} placements={placements} selected={selected} saving={saving} onPlace={place} onRemove={removePlacement} onTune={tuneTarget} palette={patterns} search={search} onSearch={setSearch} onChoose={choose} /></div>}
    {creating && targetMode === 'sections' && sections.length > 0 && <details className="cl-library-map-details"><summary>View installed section map</summary><SectionMap sections={sections} outputs={layout?.outputs || []} name={data?.status?.piece?.name} ready={mapReady} /></details>}
    {error && <p className="cl-library-save-error" role="alert">{error}</p>}{notice && <p role="status">{notice}</p>}
    {drafts.length > 0 && <div className="cl-library-drafts"><h3>Drafts in this browser</h3><div>{drafts.map(draft => <button className="cl-button" type="button" key={draft.name} disabled={saving} onClick={() => openDraft(draft)}>{draft.name}</button>)}</div></div>}
    {creating && targetMode !== 'sections' && <><div className="cl-library-browse-head"><div><h3>Ready-made patterns</h3><p>{library?.supportedPresetIds?.length ? `${library.supportedPresetIds.length} patterns supported on these lights. Other patterns are browser drafts only.` : 'Choose a starting pattern. Your whole piece is selected automatically.'}</p></div><label><span className="cl-library-search-label">Search patterns</span><input type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Search patterns" aria-label="Search library patterns" /></label></div>
    <div className="cl-library-catalog">{patterns.slice(0, visibleCount).map(pattern => <article className="cl-library-catalog-card" key={pattern.id} data-pattern-id={pattern.id} draggable={!saving} onDragStart={event => { event.dataTransfer.setData('application/x-lightweaver-pattern', pattern.id); event.dataTransfer.effectAllowed = 'copy'; }}><div className="cl-library-gradient" style={{ background: pattern.grad }} aria-hidden="true" /><div className="cl-library-catalog-copy"><h3>{pattern.label}</h3><p>{pattern.desc}</p>{library?.supportedPresetIds && <small>{library.supportedPresetIds.includes(pattern.id) ? 'Ready to save on these lights' : 'Browser draft only'}</small>}<button type="button" className="cl-library-use" disabled={saving} onClick={() => choose(pattern)} aria-label={`Use ${pattern.label}`}>Use pattern <span aria-hidden="true">+</span></button></div></article>)}</div>
    {patterns.length > visibleCount && <button className="cl-button cl-library-more" type="button" onClick={() => setVisibleCount(count => count + 12)}>Show more patterns</button>}
    {!patterns.length && <p className="cl-library-no-results">No patterns match “{search}”. Try another name or mood.</p>}</>}
  </section>;
}
