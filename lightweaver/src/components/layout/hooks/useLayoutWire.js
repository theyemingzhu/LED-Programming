import { useState, useCallback, useMemo } from 'react';
import { svgPt } from '../../../lib/layoutGeometry.js';
import { svgLayerWireGeometry } from '../../../lib/svgLayerWiring.js';
import { prepareWiringForPhysicalEdit } from '../../../lib/wiringModel.js';
import { useProject } from '../../../state/ProjectContext.jsx';

function uniqueRunId(runs, base) {
  const ids = new Set(runs.map(run => run.id));
  if (!ids.has(base)) return base;
  let suffix = 2;
  while (ids.has(`${base}-${suffix}`)) suffix += 1;
  return `${base}-${suffix}`;
}

export function useLayoutWire(ctx) {
  const { strips, hidden, selectStrip, svgRef } = ctx;
  const { wiring, compiledWiring, updateWiring } = useProject();
  const [wireOverlayMode, setWireOverlayMode] = useState('idle');
  const [selectedWireCut, setSelectedWireCut] = useState(null);
  const [svgWireSource, setSvgWireSource] = useState(null);
  const [svgWireMessage, setSvgWireMessage] = useState('');
  const svgWireGeometry = useMemo(() => svgLayerWireGeometry(compiledWiring, strips, hidden),
    [compiledWiring, strips, hidden]);

  const cancelSvgWire = useCallback(() => {
    setSvgWireSource(null);
    setSvgWireMessage('');
    return Boolean(svgWireSource);
  }, [svgWireSource]);

  const activateSvgWirePort = (stripId, port) => {
    const target = svgWireGeometry.ports.get(stripId);
    if (!target) return;
    if (port === 'out') {
      if (svgWireSource === stripId) {
        cancelSvgWire();
        return;
      }
      selectStrip(stripId);
      setSvgWireSource(stripId);
      setSvgWireMessage(`Choose an IN on the same layer as ${target.name}.`);
      return;
    }
    const source = svgWireGeometry.ports.get(svgWireSource);
    if (!source) {
      selectStrip(stripId);
      setSvgWireMessage('Choose an OUT first.');
      return;
    }
    if (source.stripId === stripId || source.layerId !== target.layerId || source.outputId !== target.outputId) {
      setSvgWireMessage('Choose another strip on the same SVG layer and GPIO.');
      return;
    }
    const output = wiring.outputs.find(item => item.id === source.outputId);
    if (!output) return;
    if (output.runIds[output.runIds.indexOf(source.runId) + 1] === target.runId) {
      setSvgWireSource(null);
      setSvgWireMessage(`${source.name} already connects to ${target.name}.`);
      return;
    }
    const result = updateWiring(draft => {
      const output = draft.outputs.find(item => item.id === source.outputId);
      if (!output?.runIds.includes(source.runId) || !output.runIds.includes(target.runId)) {
        throw new Error('Both strips must be on the same GPIO.');
      }
      output.runIds = output.runIds.filter(id => id !== target.runId);
      output.runIds.splice(output.runIds.indexOf(source.runId) + 1, 0, target.runId);
      if (draft.locked) Object.assign(draft, prepareWiringForPhysicalEdit(draft, { kind: 'route' }).wiring);
    }, { changeKind: 'route' });
    if (!result.ok) {
      setSvgWireMessage(result.errors?.[0]?.message || 'The connection could not be changed.');
      return;
    }
    selectStrip(stripId);
    setSvgWireSource(null);
    setSvgWireMessage(`Connected ${source.name} to ${target.name}.`);
  };

  const nearestLedIndex = useCallback((event, strip) => {
    if (!svgRef.current || !strip?.pixels?.length) return null;
    const point = svgPt(svgRef.current, event.clientX, event.clientY);
    let nearestIndex = 0;
    let distance = Infinity;
    strip.pixels.forEach((pixel, index) => {
      const next = Math.hypot(point.x - pixel.x, point.y - pixel.y);
      if (next < distance) { distance = next; nearestIndex = index; }
    });
    return Math.max(0, Math.min(strip.pixels.length - 2, nearestIndex));
  }, [svgRef]);

  const chopStripAtEvent = useCallback((event, strip) => {
    if (!strip || wiring.locked) return;
    const cutLed = nearestLedIndex(event, strip);
    if (cutLed == null) return;
    const result = updateWiring(draft => {
      const run = draft.runs.find(item => item.type === 'strip' && item.source.stripId === strip.id && cutLed >= item.source.from && cutLed < item.source.to);
      if (!run) throw new Error('Choose a point inside a physical run.');
      const leftId = uniqueRunId(draft.runs, `${run.id}-a-${cutLed}`);
      const rightId = uniqueRunId([...draft.runs, { id: leftId }], `${run.id}-b-${cutLed + 1}`);
      const left = { ...run, id: leftId, source: { ...run.source, to: cutLed }, verified: false };
      const right = { ...run, id: rightId, source: { ...run.source, from: cutLed + 1 }, verified: false };
      draft.runs.splice(draft.runs.indexOf(run), 1, left, right);
      draft.outputs.forEach(output => {
        const index = output.runIds.indexOf(run.id);
        if (index >= 0) output.runIds.splice(index, 1, left.id, right.id);
      });
    }, { changeKind: 'seam' });
    if (!result.ok) return;
    selectStrip(strip.id);
    setSelectedWireCut({ stripId: strip.id, cutLed });
  }, [nearestLedIndex, selectStrip, updateWiring, wiring.locked]);

  const deleteSelectedWireCut = useCallback((requestedCut = null) => {
    const activeCut = requestedCut || selectedWireCut;
    if (!activeCut || wiring.locked) return;
    const { stripId, cutLed } = activeCut;
    updateWiring(draft => {
      const left = draft.runs.find(run => run.type === 'strip' && run.source.stripId === stripId && run.source.to === cutLed);
      const right = draft.runs.find(run => run.type === 'strip' && run.source.stripId === stripId && run.source.from === cutLed + 1);
      if (!left || !right) throw new Error('The selected split no longer exists.');
      const mergedId = uniqueRunId(draft.runs.filter(run => run.id !== left.id && run.id !== right.id), `run-${stripId}-${left.source.from}-${right.source.to}`);
      const merged = { ...left, id: mergedId, source: { ...left.source, to: right.source.to }, verified: false };
      draft.runs = draft.runs.filter(run => run.id !== left.id && run.id !== right.id);
      draft.runs.push(merged);
      draft.outputs.forEach(output => {
        const index = output.runIds.indexOf(left.id);
        output.runIds = output.runIds.filter(id => id !== left.id && id !== right.id);
        if (index >= 0) output.runIds.splice(index, 0, merged.id);
      });
    }, { changeKind: 'seam' });
    setSelectedWireCut(null);
  }, [selectedWireCut, updateWiring, wiring.locked]);

  const nudgeSelectedWireCut = useCallback((delta, requestedCut = null) => {
    const activeCut = requestedCut || selectedWireCut;
    if (!activeCut || wiring.locked) return;
    const next = activeCut.cutLed + Math.sign(delta);
    const result = updateWiring(draft => {
      const left = draft.runs.find(run => run.type === 'strip' && run.source.stripId === activeCut.stripId && run.source.to === activeCut.cutLed);
      const right = draft.runs.find(run => run.type === 'strip' && run.source.stripId === activeCut.stripId && run.source.from === activeCut.cutLed + 1);
      if (!left || !right || next < left.source.from || next >= right.source.to) throw new Error('Split cannot move beyond its neighboring run.');
      left.source.to = next;
      right.source.from = next + 1;
    }, { changeKind: 'seam' });
    if (result.ok) setSelectedWireCut({ ...activeCut, cutLed: next });
  }, [selectedWireCut, updateWiring, wiring.locked]);

  return {
    wireOverlayMode, setWireOverlayMode,
    selectedWireCut, setSelectedWireCut,
    nearestLedIndex, chopStripAtEvent,
    nudgeSelectedWireCut, deleteSelectedWireCut,
    svgWireGeometry, svgWireSource, svgWireMessage, cancelSvgWire, activateSvgWirePort,
  };
}
