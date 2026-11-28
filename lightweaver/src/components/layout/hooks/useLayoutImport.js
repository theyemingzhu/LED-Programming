import { useState, useRef } from 'react';
import {
  getPxPerMm,
  measureLayers,
} from '../../../lib/layoutGeometry.js';
import { prepareSvgDocumentForImport } from '../../../lib/svgImportGeometry.js';

// SVG artwork import from the file picker or canvas drop.
// `ctx` is the shared layout bundle; view-state resets flow in via `deps`.
export function useLayoutImport(ctx, deps) {
  const {
    strips, layers, svgText, starterLayoutActive,
    colorIdxRef, nextColor,
  } = ctx;

  const { resetView, setDrawMode, setWaypoints, mapImportedArtwork } = deps;

  const [error, setError]       = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef(null);
  const importRequestRef = useRef(0);

  // ── File processing (shared by button + drag-drop) ─────────────────────────
  const processFile = async (file) => {
    const request = ++importRequestRef.current;
    setError(null);
    if (!file.name.toLowerCase().endsWith('.svg')) {
      setError('Only .svg files are supported. In Illustrator: File → Export As → SVG.');
      return;
    }
    let text;
    try {
      text = await file.text();
    } catch {
      if (request === importRequestRef.current) setError('Could not read the SVG file.');
      return;
    }
    if (request !== importRequestRef.current) return;
    if (!text.includes('<svg') && !text.includes('<SVG')) {
      setError('This does not appear to be a valid SVG file.');
      return;
    }
    const doc = new DOMParser().parseFromString(text, 'image/svg+xml');
    const srcSvg = doc.querySelector('svg');
    if (!srcSvg) { setError('Could not parse SVG.'); return; }
    const parseErr = doc.querySelector('parsererror');
    if (parseErr) { setError('SVG parse error: ' + parseErr.textContent.slice(0, 120)); return; }

    const vb = srcSvg.getAttribute('viewBox') || '0 0 640 400';
    const scale = getPxPerMm(srcSvg);
    const newPxPerMm = Number.isFinite(scale) && scale > 0 ? scale : 3.7795;
    // Bake `<g transform>` and expand `<use>` instancing into plain absolute
    // path geometry BEFORE measuring. `measureLayers`/`shapeToD` read raw
    // geometry attributes and match no `<use>`, so without this a mandala
    // drawn as one wedge plus rotated copies — the normal way a vector editor
    // builds one — imports as a fraction of itself, and any transformed group
    // lands at the wrong coordinates. Mutates `doc` in place; a failure here
    // is non-fatal and simply measures the document exactly as before.
    const prepared = prepareSvgDocumentForImport(doc);
    if (!prepared.ok && prepared.reason) {
      console.warn('[layout import] falling back to unflattened SVG geometry:', prepared.reason);
    }
    if (prepared.warnings?.length) {
      console.warn('[layout import] SVG notes:', prepared.warnings.join(' '));
    }
    // `vb`/`newPxPerMm` were read off the root above and are unaffected by
    // flattening (it never touches viewBox/width/height).
    const parsed = measureLayers(doc);
    if (!parsed.length) {
      setError('No layers found. In Illustrator use File → Export As → SVG (not Save As).');
      return;
    }
    if ((svgText || layers.length || (!starterLayoutActive && strips.length)) && !window.confirm(
      'Replace the current artwork and LED strips? This clears the existing layout and its strip connections. Review affected looks before installing again. Choose Cancel to keep this layout.',
    )) return;
    const previousColorIndex = colorIdxRef.current;
    colorIdxRef.current = 0;
    const newLayers = parsed.map(l => ({ ...l, _color: nextColor(), _emit: 'dir', _angle: 0 }));
    const newLayerOrder = parsed.map(l => ({ type: 'layer', id: l.layerId }));
    const { error } = mapImportedArtwork({
      viewBox: vb,
      pxPerMm: newPxPerMm,
      svgText: text,
      layers: newLayers,
      layerOrder: newLayerOrder,
    });
    if (error) {
      colorIdxRef.current = previousColorIndex;
      setError(error);
      return;
    }
    setDrawMode(false);
    setWaypoints([]);
    resetView();
  };

  const handleFile = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    e.target.value = '';
    await processFile(file);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    setDragOver(true);
  };
  const handleDragLeave = (e) => {
    if (!e.currentTarget.contains(e.relatedTarget)) setDragOver(false);
  };
  const handleDrop = async (e) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) await processFile(file);
  };

  return {
    error, setError,
    dragOver,
    fileRef,
    processFile,
    handleFile,
    handleDragOver,
    handleDragLeave,
    handleDrop,
  };
}
