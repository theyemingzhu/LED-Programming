import React, { useRef, useState } from 'react';
import { useProject } from '../state/ProjectContext.jsx';
import { validateMapperProject, preflightMapperProjectGeometry, MAPPER_MAX_PROJECT_JSON_BYTES } from '../../../led-art-mapper/app/src/project-format.js';
import { assignIndices } from '../lib/mapper.js';
import { sampleStripPixels } from '../lib/layoutGeometry.js';
import './MapperScreen.css';
export default function MapperScreen() {
  const project = useProject();
  const frameRef = useRef(null);
  const [pending, setPending] = useState(null);
  const [error, setError] = useState('');
  React.useEffect(() => {
    const review = event => {
      if (event.source !== frameRef.current?.contentWindow || event.origin !== location.origin || event.data?.type !== 'lw-mapper-review') return;
      setError('');
      try {
        if (new TextEncoder().encode(JSON.stringify(event.data.project)).length > MAPPER_MAX_PROJECT_JSON_BYTES) throw new Error('Mapper project exceeds the import limit.');
        const valid = validateMapperProject(event.data.project);
        if (!valid.ok) throw new Error(valid.reason);
        const geometry = preflightMapperProjectGeometry(valid.project);
        if (!geometry.ok) throw new Error(geometry.reason);
        if (!geometry.project.strips.length) throw new Error('Draw or import at least one mapped path first.');
        setPending(geometry.project);
      } catch (error) { setError(error.message); }
    };
    window.addEventListener('message', review);
    return () => window.removeEventListener('message', review);
  }, []);
  const artworkConflict = pending?.svgSource && project.svgText && !project.starterPending && pending.svgSource !== project.svgText;
  function addPaths() {
    if (!pending || artworkConflict) return;
    try {
      const existing = project.starterPending ? [] : project.strips;
      const ids = new Set(existing.map(strip => strip.id));
      const added = pending.strips.map(strip => {
        let id = strip.id;
        while (ids.has(id)) id = `mapper-${id}`;
        ids.add(id);
        return { id, name: strip.name || strip.id, pathData: strip.pathData, pixelCount: strip.pixelCount,
          color: strip.color, reversed: strip.reversed === true, x: strip.offsetX || 0, y: strip.offsetY || 0,
          pixels: sampleStripPixels(strip.pathData, strip.pixelCount, strip.reversed, strip.offsetX || 0, strip.offsetY || 0) };
      });
      const strips = [...existing.map(strip => structuredClone(strip)), ...added];
      assignIndices(strips);
      if (strips.reduce((total, strip) => total + strip.pixels.length, 0) > 16384) throw new Error('Combined layout exceeds 16,384 LEDs.');
      project.pushLayoutHistory();
      project.replaceLayoutGeometry(strips);
      if (pending.svgSource && (!project.svgText || project.starterPending)) {
        project.setSvgText(pending.svgSource);
        const svg = new DOMParser().parseFromString(pending.svgSource, 'image/svg+xml').documentElement;
        project.setViewBox(svg.getAttribute('viewBox') || '0 0 640 400');
      }
      location.hash = '#screen=layout';
    } catch (error) { setError(error.message); }
  }
  return <section className="mapper-workspace" data-testid="mapper-workspace">
    <div className="mapper-heading"><a className="btn" href="#screen=layout">Back to Layout</a><p>Map paths and preview effects. Mapper saves keep their original format; add reviewed geometry to Studio.</p></div>
    {pending && <div className="mapper-handoff" data-testid="mapper-handoff-review">
      <span>{pending.strips.length} path{pending.strips.length === 1 ? '' : 's'} · {pending.strips.reduce((sum, strip) => sum + strip.pixelCount, 0)} LEDs. Effects stay in the saved Mapper project.</span>
      {artworkConflict && <span role="alert">This layout has different artwork. Start a new Studio project to keep both originals.</span>}
      <button className="btn" onClick={addPaths} disabled={Boolean(artworkConflict)}>Add to Layout</button><button className="btn" onClick={() => setPending(null)}>Cancel</button>
    </div>}
    {error && <p role="alert">{error}</p>}
    <iframe ref={frameRef} title="LED Mapper" src="/mapper.html" allow="serial 'none'; usb 'none'" />
  </section>;
}
