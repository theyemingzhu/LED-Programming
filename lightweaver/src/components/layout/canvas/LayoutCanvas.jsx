import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { canvasStripLabel } from '../../../lib/stripLabels.js';
import { stripDotAt, stripOuterEnd } from '../../../lib/stripDots.js';
import {
  rgbCss,
  pointsAttr,
  parsedVb,
  svgPt,
} from '../../../lib/layoutGeometry.js';
import { deriveReflectionPointIndices } from '../../../lib/kaleidoscope.js';
import {
  activeLedCoreAlpha,
  ledCssColor,
  restingLedAlpha,
} from '../../../lib/previewVisuals.js';
import { LightCone, OmniHalo } from '../shared/InspectorPrimitives.jsx';
import { WiringCordOverlay } from '../wire/WiringCordOverlay.jsx';
import { useProject } from '../../../state/ProjectContext.jsx';
import { setSymmetryFold } from '../../../lib/pieceSymmetry.js';
import { suggestSymmetry, symmetryAxisLine, symmetryStripPlaces, worthOffering } from '../../../lib/symmetrySuggest.js';
import { connectedFamilyForStrip } from '../../../lib/connectedSections.js';
import { sideTint } from '../shared/sideTints.js';
import { stripsBoundsCentre } from '../../../lib/mirrorPartners.js';
import { symmetryEchoes } from '../../../lib/symmetryTurns.js';
import { requestSymmetryReveal, setSymmetryFocus, useMirrorEchoFocus, usePlacedLookPreview, useSymmetryFocus } from './mirrorEcho.js';
import { placedLookFrame } from '../../../lib/placedLook.js';
import { PlacedLookFrame, PlacedLookPicture, usePlacedLookClock } from './PlacedLookOverlay.jsx';
import { LookDesignerTouch, useLookDesignerClock } from './LookDesignerTouch.jsx';
import { useLookDesigner } from './lookDesignerStore.js';
import { frameByStrip } from '../../../lib/lookEngine/index.js';
import './symmetry-offer.css';
import '../symmetry-by-eye.css';

// Under a placed look, an LED outside the frame (or between bands) is dark:
// a plain grey dot, not the strip's own warm colour, which would read as lit.
const PLACED_DARK_LED = 'oklch(46% 0.008 75)';

// "Left side" -> "the left side"; "Side 1" -> "side 1".
const sideNoun = label => `${/^side\b/i.test(label) ? '' : 'the '}${label.charAt(0).toLowerCase()}${label.slice(1)}`;

function ownSentence(names) {
  if (!names.length) return '';
  if (names.length === 1) return ` ${names[0]} keeps its own pattern.`;
  if (names.length === 2) return ` ${names[0]} and ${names[1]} keep their own patterns.`;
  return ` The other ${names.length} strips keep their own patterns.`;
}

// Board C: when the piece looks symmetrical and has no sides yet, one card on
// the artwork offers them. One filled primary; dismissal is remembered with
// the project.
function SymmetryOffer({ suggestion, strips, onMirror, onChoose, onKeep }) {
  const byId = new Map(strips.map(strip => [strip.id, strip]));
  const [first, second] = suggestion.sides;
  const own = suggestion.onOwn.map(id => byId.get(id)?.name).filter(Boolean);
  return (
    <section className="la-symmetry-offer" data-testid="symmetry-offer" aria-labelledby="symmetry-offer-title">
      <h2 id="symmetry-offer-title">This piece has two matching sides.</h2>
      <p>
        Mirror them and {sideNoun(second.label)} plays whatever {sideNoun(first.label)} plays.{ownSentence(own)}
      </p>
      <div className="la-symmetry-offer-actions">
        <button type="button" className="btn" data-testid="symmetry-offer-mirror" onClick={onMirror}>Mirror the two sides</button>
        <button type="button" className="btn" data-testid="symmetry-offer-choose" onClick={onChoose}>Choose sides myself</button>
        <button type="button" className="btn la-symmetry-offer-keep" data-testid="symmetry-offer-keep" onClick={onKeep}>Keep as drawn</button>
      </div>
    </section>
  );
}

// While the owner is choosing a number of sides: one card on the artwork that
// says whether the amber copies line up, in words, with Done as its primary.
function SymmetryFocusCard({ fold, fits, dealt = false, moved, onDone, onPulse, onRecentre }) {
  return (
    <section className="la-symmetry-offer la-symmetry-focus" data-testid="symmetry-focus" aria-labelledby="symmetry-focus-title">
      <h2 id="symmetry-focus-title" data-testid="symmetry-focus-verdict" data-fits={fits ? 'true' : 'false'} data-dealt={dealt ? 'true' : undefined}>
        <span className={`la-symmetry-focus-dot${fits ? ' is-fit' : ''}`} aria-hidden="true"/>
        {fits ? `${fold} sides line up.` : dealt
          ? `${fold} sides set, one after another along the strips.`
          : `Doubled lines: this piece does not have ${fold} matching sides.`}
      </h2>
      <p>
        {dealt && !fits
          ? 'The shape has no matching sides to find, so each side got its strips in order. Move a strip to another side in the list if you want it elsewhere.'
          : `The amber lines are side 1 copied onto the other sides.${fits ? ' They sit on your strips.' : ' Try another number, or drag the centre mark if the piece is off-centre.'}`}
      </p>
      <div className="la-symmetry-offer-actions">
        <button type="button" className="btn" data-testid="symmetry-focus-done" onClick={onDone}>Done</button>
        <button type="button" className="btn" data-testid="symmetry-focus-pulse" onClick={onPulse}>Run a pulse around</button>
        {moved && <button type="button" className="btn la-symmetry-offer-keep" data-testid="symmetry-focus-recentre" onClick={onRecentre}>Put the centre back</button>}
      </div>
    </section>
  );
}

// ── LayoutCanvas ────────────────────────────────────────────────────────────
// Verbatim lift of the LayoutScreen <svg> stage subtree (defs, artwork, heat,
// layer glow, hit paths, path-select highlight, light cones/halos, strip rails,
// wire canvas segments/route jumps/cut notches, LED dots, arrows, selection
// frame, connectors, draw ghost, empty state) plus its .lw-viewport / .stage
// wrappers, drop overlay, rubber-band, and the canvas-coupled .la-overlay corner
// readouts. Pure JSX + prop plumbing — no logic. All memos/handlers stay in the
// layout hooks and arrive as props. Refs (svgRef/artworkRef/vpRef/spaceRef/
// stripDragSuppressClickRef) cross the boundary as props and keep working.

export function LayoutCanvas({
  refs,
  strips, layers, hidden, sectionFamilies = [],
  starterGhost = null,
  viewBox, computedViewBox, vbScale, svgText, artworkHTML, totalLeds,
  selection,
  lightPreview,
  wire,
  draw,
  interaction,
  interactionHandlers,
}) {
  const { svgRef, artworkRef, vpRef, spaceRef, stripDragSuppressClickRef } = refs;
  const { selStripId, selLayer, pathSel, selectedPathDecorations = [], existingStrip } = selection;
  // Symmetry: each side's strips wear its tint as a band and carry their flow
  // number; two sides also show the line they mirror across. The strip a
  // sidebar row points at is lit, so sides can be arranged by eye.
  const {
    layoutSymmetry, setLayoutSymmetry, pushLayoutHistory,
    layoutSymmetryOfferDismissed, setLayoutSymmetryOfferDismissed,
  } = useProject();
  const symmetry = layoutSymmetry || null;
  const mirrorFocusId = useMirrorEchoFocus();
  const sidePlaces = useMemo(() => symmetryStripPlaces(symmetry), [symmetry]);
  const axisLine = useMemo(() => symmetryAxisLine(symmetry, strips.filter(strip => !hidden[strip.id])), [symmetry, strips, hidden]);
  const {
    effectiveShowLight: lightShown, effectiveGlowMode, glowStdDev, directedGlow,
    showHeat, showLeds: ledsShown, layoutPatternFrame: patternFrame, layoutPreviewError, retryLayoutPreview, stripSamples, stripArrows,
  } = lightPreview;
  // A placed look being tried on the artwork takes over the LED colours: each
  // dot shows the colour under it in the frame (lib/placedLook.js).
  const placedLook = usePlacedLookPreview();
  const placedActive = Boolean(placedLook) && draw.mode === 'draw' && !draw.drawMode;
  const placedTime = usePlacedLookClock(placedActive);
  const placedFrame = useMemo(
    () => (placedActive ? placedLookFrame(placedLook, strips.filter(strip => !hidden[strip.id]), placedTime, { symmetry }).byStrip : null),
    [placedActive, placedLook, strips, hidden, placedTime, symmetry],
  );
  // The look designer colours the dots the same way (lib/lookEngine).
  const designer = useLookDesigner();
  const designerActive = Boolean(designer.look && designer.model) && draw.mode === 'draw' && !draw.drawMode;
  const designerTime = useLookDesignerClock(designerActive);
  const designerFrame = useMemo(
    () => (designerActive ? frameByStrip(designer.look, designer.model, designerTime) : null),
    [designerActive, designer.look, designer.model, designerTime],
  );
  const litActive = placedActive || designerActive;
  const effectiveShowLight = litActive || lightShown;
  const showLeds = litActive || ledsShown;
  const layoutPatternFrame = placedFrame || designerFrame || patternFrame;
  const {
    wireOverlayMode, visibleWirePathCanvasSegments, wireRouteJumps, wireCutMarkers,
    wiring, compiledWiring, selectedWiringRunId, onSeamMove,
    firstLedPicker, onFirstLedPick,
    kaleidoscopeEditor, onKaleidoscopeLedPick, onKaleidoscopeSelectPoint,
  } = wire;
  const selectedPhysicalRun = wiring?.runs?.find(run => run.id === selectedWiringRunId);
  const selectedPhysicalStrip = strips.find(strip => strip.id === selectedPhysicalRun?.source?.stripId);
  const selectedClosedStrip = strips.find(strip => strip.id === selStripId && (strip.closed || strip.isClosed) && !hidden[strip.id]);
  const selectedSeamLed = selectedPhysicalRun?.seamLed
    ?? (selectedPhysicalRun?.physicalDirection === 'source-reverse'
      ? selectedPhysicalRun?.source?.to
      : selectedPhysicalRun?.source?.from);
  const selectedSeamPoint = selectedPhysicalStrip?.pixels?.[selectedSeamLed];
  const { mode, drawMode, waypoints, ghostPt, ghostD } = draw;
  const canDragStrip = mode === 'draw' && !drawMode && !firstLedPicker && !kaleidoscopeEditor && wireOverlayMode !== 'chop';
  // The offer is worked out only while it could be shown.
  const offerPossible = mode === 'draw' && !drawMode && !symmetry && !layoutSymmetryOfferDismissed
    && typeof setLayoutSymmetry === 'function' && strips.length >= 2;
  const offer = useMemo(() => {
    if (!offerPossible) return null;
    const box = svgText ? parsedVb(viewBox) : null;
    const eligible = strips.filter(strip => strip.kaleidoscope?.enabled !== true);
    const suggestion = suggestSymmetry(eligible, 2, box ? { centre: { x: box.x + box.w / 2, y: box.y + box.h / 2 } } : null);
    return worthOffering(suggestion, id => connectedFamilyForStrip(sectionFamilies, id)?.id || null) ? suggestion : null;
  }, [offerPossible, strips, svgText, viewBox, sectionFamilies]);
  const applyOffer = () => {
    if (!offer) return;
    pushLayoutHistory?.();
    setLayoutSymmetry({ ...setSymmetryFold(null, 2, strips, offer), orientation: offer.orientation });
  };
  const baseBounds = parsedVb(viewBox);
  const renderedBounds = parsedVb(computedViewBox);
  // The base viewBox scale keeps overlay dimensions tied to artwork units;
  // compensate for the current camera bounds so selection affordances retain
  // their intended screen weight when zooming out.
  const selectionVbScale = vbScale * Math.max(
    renderedBounds.w / baseBounds.w,
    renderedBounds.h / baseBounds.h,
  );
  const {
    isEditingGesture, isPanning, rubberBand, movingStripIds,
    dragOver, cursorSvgPt, zoom, hoveredSubPathId,
  } = interaction;
  const {
    handleSvgClick, handleSvgDblClick, handleSvgMouseMove, handleSvgMouseDown,
    handleSvgMouseUp, handleSvgMouseLeave, handleContextMenu, handleWheel,
    handleDragOver, handleDragLeave, handleDrop,
    startStripMove, chopStripAtEvent, toggleStripSel, selectStrip,
    togglePathSelection, setHoveredLayerId, setHoveredSubPathId,
    onFitBoard,
  } = interactionHandlers;
  const [viewportSize, setViewportSize] = useState({ width: 640, height: 480 });
  useLayoutEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const measure = () => setViewportSize({ width: svg.clientWidth || 640, height: svg.clientHeight || 480 });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(svg);
    return () => observer.disconnect();
  }, [svgRef]);
  const annotationScale = Math.max(renderedBounds.w / viewportSize.width, renderedBounds.h / viewportSize.height);
  // The path is the drag/select target behind the LED dots. Keep its corridor
  // usable in screen pixels when the camera is zoomed far out; artwork geometry
  // and the LED positions themselves remain unchanged.
  const stripHitStrokeWidth = !drawMode && !firstLedPicker && !kaleidoscopeEditor && wireOverlayMode !== 'chop'
    ? Math.max(18, annotationScale * 22)
    : 18;
  const labelBounds = {
    x: renderedBounds.x - (viewportSize.width * annotationScale - renderedBounds.w) / 2,
    y: renderedBounds.y - (viewportSize.height * annotationScale - renderedBounds.h) / 2,
    w: viewportSize.width * annotationScale,
    h: viewportSize.height * annotationScale,
  };
  // Names are not drawn on every strip any more: each strip has a small numbered
  // dot at its first light, and a name chip shows for the selected and the hovered strip.
  const [hoverStripId, setHoverStripId] = useState(null);
  // The middle of everything that is showing: name chips sit away from it.
  const pieceCentre = useMemo(() => {
    let minX = Infinity; let minY = Infinity; let maxX = -Infinity; let maxY = -Infinity;
    for (const strip of strips) {
      if (hidden[strip.id]) continue;
      for (const p of strip.pixels || []) {
        if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x; if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y;
      }
    }
    return Number.isFinite(minX) ? { x: (minX + maxX) / 2, y: (minY + maxY) / 2 } : null;
  }, [strips, hidden]);
  // The look designer hides the name callouts and flow numbers: they would cover the piece.
  const labelsShown = (!isEditingGesture || movingStripIds.length > 0) && showLeds && !designerActive;

  // ── Symmetry by eye ────────────────────────────────────────────────────────
  // After a number of sides is chosen, side 1's strips are drawn again on
  // every other side in amber. The right number and centre put each copy on a
  // real strip; a wrong one leaves doubled lines. The centre mark drags, and
  // letting go places the strips into sides again about the new centre.
  const symmetryFocus = useSymmetryFocus();
  const focusActive = Boolean(symmetryFocus && symmetry && mode === 'draw' && !drawMode && typeof setLayoutSymmetry === 'function');
  useEffect(() => { if (!symmetry && symmetryFocus) setSymmetryFocus(null); }, [symmetry, symmetryFocus]);
  const focusFold = focusActive ? symmetry.fold : 0;
  const focusStrips = useMemo(
    () => (focusActive ? strips.filter(strip => !hidden[strip.id] && strip.kaleidoscope?.enabled !== true) : []),
    [focusActive, strips, hidden],
  );
  const focusHome = useMemo(() => {
    if (!focusActive) return null;
    const box = svgText && viewBox ? parsedVb(viewBox) : null;
    const suggestion = suggestSymmetry(focusStrips, focusFold, box ? { centre: { x: box.x + box.w / 2, y: box.y + box.h / 2 } } : null);
    return { suggestion, centre: suggestion?.centre || stripsBoundsCentre(focusStrips) };
  }, [focusActive, focusStrips, focusFold, svgText, viewBox]);
  const focusCentre = focusActive ? (symmetryFocus.centre || focusHome?.centre || null) : null;
  const focusSuggestion = useMemo(() => {
    if (!focusActive || !focusCentre) return null;
    return symmetryFocus.centre
      ? suggestSymmetry(focusStrips, focusFold, { centre: focusCentre, pinned: true })
      : focusHome?.suggestion || null;
  }, [focusActive, focusCentre, symmetryFocus, focusStrips, focusFold, focusHome]);
  const focusFits = focusSuggestion?.confidence === 'high' && focusSuggestion.matched.length > 0;
  const focusCopies = useMemo(
    () => (focusActive && focusCentre ? symmetryEchoes(focusStrips, symmetry, focusCentre).copies : []),
    [focusActive, focusCentre, focusStrips, symmetry],
  );
  const placeSidesAbout = centre => {
    const suggestion = centre
      ? suggestSymmetry(focusStrips, focusFold, { centre, pinned: true })
      : focusHome?.suggestion;
    if (!suggestion) return;
    const next = { ...setSymmetryFold(symmetry, focusFold, strips, suggestion), orientation: suggestion.orientation };
    if (JSON.stringify(next) === JSON.stringify(symmetry)) return;
    pushLayoutHistory?.();
    setLayoutSymmetry(next);
  };
  const centreDragRef = useRef(false);
  const centreFromEvent = event => {
    const matrix = svgRef.current?.getScreenCTM()?.inverse();
    if (!matrix) return null;
    const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix);
    const home = focusHome?.centre;
    // Close to where Studio put it is where Studio put it.
    if (home && Math.hypot(point.x - home.x, point.y - home.y) < annotationScale * 8) return null;
    return { x: point.x, y: point.y };
  };
  const centreHandlers = {
    onPointerDown: event => {
      event.stopPropagation();
      event.preventDefault();
      event.currentTarget.setPointerCapture?.(event.pointerId);
      centreDragRef.current = true;
    },
    onPointerMove: event => {
      if (!centreDragRef.current) return;
      setSymmetryFocus({ centre: centreFromEvent(event) });
    },
    onPointerUp: event => {
      if (!centreDragRef.current) return;
      centreDragRef.current = false;
      const centre = centreFromEvent(event);
      setSymmetryFocus({ centre });
      placeSidesAbout(centre);
    },
    onPointerCancel: () => { centreDragRef.current = false; },
    onClick: event => event.stopPropagation(),
    onKeyDown: event => {
      const step = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[event.key];
      if (!step || !focusCentre) return;
      event.preventDefault();
      const nudge = annotationScale * (event.shiftKey ? 10 : 2);
      const centre = { x: focusCentre.x + step[0] * nudge, y: focusCentre.y + step[1] * nudge };
      setSymmetryFocus({ centre });
      placeSidesAbout(centre);
    },
  };
  // The pulse: each side lit in turn, once around. Uneven steps (a side with
  // more or fewer strips than the last) show a wrong fit without reading.
  const [pulseSide, setPulseSide] = useState(null);
  const pulseTimersRef = useRef([]);
  const stopPulse = () => { pulseTimersRef.current.forEach(clearTimeout); pulseTimersRef.current = []; };
  useEffect(() => stopPulse, []);
  const runPulse = () => {
    stopPulse();
    const count = symmetry?.sides?.length || 0;
    for (let index = 0; index <= count; index += 1) {
      pulseTimersRef.current.push(setTimeout(() => setPulseSide(index < count ? index : null), index * 330));
    }
  };
  const pulseStripIds = focusActive && pulseSide !== null ? new Set(symmetry.sides[pulseSide]?.stripIds || []) : null;
  const polyline = points => points.map(point => `${point.x},${point.y}`).join(' ');
  const handleCanvasPointerDown = event => {
    if (!firstLedPicker) {
      handleSvgMouseDown(event);
      return;
    }
    const svg = svgRef.current;
    const strip = strips.find(item => item.id === firstLedPicker.stripId);
    const matrix = svg?.getScreenCTM()?.inverse();
    if (!strip?.pixels?.length || !matrix) return;
    const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix);
    let nearest = null;
    strip.pixels.forEach((pixel, index) => {
      const distance = Math.hypot(point.x - pixel.x, point.y - pixel.y);
      if (distance <= vbScale * 20 && (!nearest || distance < nearest.distance)) {
        nearest = { index, distance };
      }
    });
    if (!nearest) return;
    event.preventDefault();
    event.stopPropagation();
    onFirstLedPick(strip.id, nearest.index);
  };
  return (
        <main className="body">
        <div className="dotgrid"/>
        <div className="stage">
        {layoutPreviewError && (
          <div role="status" data-testid="layout-preview-error" title={layoutPreviewError.message} style={{
            position: 'absolute', top: 70, left: 10, maxWidth: 'calc(100% - 20px)', zIndex: 12,
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
            padding: '6px 10px', background: 'var(--bg-panel)', border: '1px solid var(--border)', borderRadius: 6,
          }}>
            <span>Light preview stopped.</span>
            <button type="button" className="btn" onClick={retryLayoutPreview}>Retry</button>
          </div>
        )}
        {/* Viewport */}
        <div
          ref={vpRef}
          className={`lw-viewport${dragOver ? ' lw-viewport--drop' : ''}`}
          style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', cursor: isPanning ? 'grabbing' : 'default' }}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          {dragOver && (
            <div style={{
              position: 'absolute', inset: 12, border: '2px dashed var(--accent)',
              borderRadius: 8, pointerEvents: 'none', zIndex: 10,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'var(--accent-soft)',
            }}>
              <span style={{ color: 'var(--accent)', fontSize: 'var(--fs-md)', fontWeight: 500 }}>Drop SVG here</span>
            </div>
          )}
          <svg
            ref={svgRef}
            viewBox={computedViewBox}
            overflow="visible"
            preserveAspectRatio="xMidYMid meet"
            style={{
              width: '100%', height: '100%',
              maxWidth: '100%', maxHeight: '100%',
              aspectRatio: `${parsedVb(viewBox).w} / ${parsedVb(viewBox).h}`,
              objectFit: 'contain',
              cursor: firstLedPicker ? 'crosshair' : drawMode ? 'crosshair' : rubberBand ? 'crosshair' : isPanning ? 'grabbing' : spaceRef.current ? 'grab' : 'default',
            }}
            onClick={handleSvgClick}
            onDoubleClick={handleSvgDblClick}
            onPointerMove={handleSvgMouseMove}
            onPointerDown={firstLedPicker ? undefined : handleCanvasPointerDown}
            onPointerDownCapture={firstLedPicker ? handleCanvasPointerDown : undefined}
            onPointerUp={handleSvgMouseUp}
            onPointerLeave={handleSvgMouseLeave}
            onContextMenu={handleContextMenu}
            onWheel={handleWheel}
          >
            <defs>
              {effectiveGlowMode !== 'dots' && (
                <filter id="lw-led-bloom" x="-60%" y="-60%" width="220%" height="220%">
                  <feGaussianBlur stdDeviation={glowStdDev}/>
                </filter>
              )}
              {/* Single filter for all ambient light — one blur op on the whole group, not per-element */}
              <filter id="lw-light-glow" x="-150%" y="-150%" width="400%" height="400%">
                <feGaussianBlur stdDeviation={vbScale * 4}/>
              </filter>
              <radialGradient id="heat-grad" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="oklch(80% 0.2 30)" stopOpacity="1"/>
                <stop offset="100%" stopColor="oklch(80% 0.2 30)" stopOpacity="0"/>
              </radialGradient>
            </defs>

            {mode === 'wire' && compiledWiring && (
              <WiringCordOverlay compiled={compiledWiring} selectedRunId={selectedWiringRunId}/>
            )}

            {/* ── Artwork background ── */}
            {artworkHTML && (
              <g ref={artworkRef}
                 style={{ pointerEvents: 'none', filter: 'saturate(3) brightness(1.4)', mixBlendMode: 'screen',
                          opacity: effectiveShowLight ? 0.18 : 1, transition: isEditingGesture ? 'none' : 'opacity 0.2s' }}
                 dangerouslySetInnerHTML={{ __html: artworkHTML }}/>
            )}

            {/* ── Coverage heat map ── */}
            {showHeat && (
              <g style={{ pointerEvents: 'none' }}>
                {strips.filter(s => !hidden[s.id]).flatMap(s =>
                  s.pixels.map((px, i) => (
                    <circle key={`${s.id}-heat-${i}`} cx={px.x} cy={px.y}
                            r={vbScale * 18}
                            fill="url(#heat-grad)" opacity={0.09}
                            style={{ mixBlendMode: 'screen' }}/>
                  ))
                )}
              </g>
            )}

            {/* ── Selected layer glow (only when selected from panel, not canvas path-click) ── */}
            {selLayer && !selStripId && pathSel.length === 0 && (() => {
              const glowPaths = selLayer.subPaths?.length > 0
                ? selLayer.subPaths.map(sp => ({ id: sp.pathId, d: sp.pathData }))
                : [{ id: selLayer.layerId, d: selLayer.pathData }];
              return glowPaths.filter(p => p.d).map(p => (
                <g key={p.id} style={{ pointerEvents: 'none' }}>
                  <path d={p.d} stroke={selLayer._color} strokeWidth="2" strokeOpacity={0.5} fill="none" strokeLinecap="round"/>
                  <path d={p.d} stroke="oklch(0.553 0.109 56)" strokeWidth="7" strokeOpacity={0.14} fill="none" strokeLinecap="round"/>
                  <path d={p.d} stroke="oklch(0.615 0.112 57)" strokeWidth="3" strokeOpacity={0.6} fill="none" strokeLinecap="round"/>
                  <path d={p.d} stroke="white"   strokeWidth="1"  strokeOpacity={0.85} fill="none" strokeLinecap="round"/>
                </g>
              ));
            })()}

            {/* ── Hit paths — individual path selection (Draw mode only; Size/Wire
                   ignore artwork paths per the canvas behavior matrix) ── */}
            {mode === 'draw' && !drawMode && layers.map(l => {
              if (hidden[l.layerId] || !l.pathData) return null;
              const hasSubPaths = l.subPaths?.length > 0;
              const targets = hasSubPaths
                ? l.subPaths.map(sp => ({ pathId: sp.pathId, pathData: sp.pathData, name: sp.name, svgLength: sp.svgLength }))
                : [{ pathId: l.layerId, pathData: l.pathData, name: l.name, svgLength: l.svgLength }];
              return targets.map(t => {
                const entry = {
                  layerId: l.layerId, pathId: t.pathId, pathData: t.pathData,
                  name: hasSubPaths ? `${l.name} · ${t.name}` : l.name,
                  svgLength: t.svgLength,
                };
                return (
                  <path key={t.pathId} d={t.pathData}
                        data-vector-layer-id={l.layerId}
                        data-vector-path-id={t.pathId}
                        tabIndex="0"
                        role="button"
                        aria-label={`Select artwork vector ${entry.name}`}
                        fill="none" stroke="#fff" strokeOpacity="0.001"
                        strokeWidth="16" strokeLinecap="round" pointerEvents="stroke"
                        style={{ cursor: 'pointer' }}
                        onPointerDown={e => e.stopPropagation()}
                        onMouseEnter={() => { setHoveredLayerId(l.layerId); setHoveredSubPathId(t.pathId); }}
                        onMouseLeave={() => { setHoveredLayerId(null); setHoveredSubPathId(null); }}
                        onKeyDown={e => {
                          if (e.key !== 'Enter' && e.key !== ' ') return;
                          e.preventDefault();
                          e.stopPropagation();
                          togglePathSelection(entry, e.shiftKey || e.metaKey || e.ctrlKey);
                        }}
                        onClick={e => {
                          e.stopPropagation();
                          // Shift-click toggles this path in/out of the selection;
                          // plain click selects only it. Path selection clears
                          // strip/layer selection in the reducer.
                          togglePathSelection(entry, e.shiftKey);
                        }}/>
                );
              });
            })}

            {/* ── Hovered sub-path outline ── */}
            {hoveredSubPathId && (() => {
              for (const l of layers) {
                if (hidden[l.layerId]) continue;
                const t = l.subPaths?.find(s => s.pathId === hoveredSubPathId)
                       ?? (l.layerId === hoveredSubPathId ? { pathData: l.pathData } : null);
                if (t?.pathData) return (
                  <path key="hover-sp" d={t.pathData} fill="none"
                        stroke="oklch(0.615 0.112 57)" strokeWidth="3" strokeOpacity={0.55}
                        strokeLinecap="round" pointerEvents="none"/>
                );
              }
              return null;
            })()}


            {/* ── Path selection highlight (marching ants = canvas path-pick for strip assignment) ── */}
            {selectedPathDecorations.map(p => {
              const midPt = p.midpoint;
              return (
                <g key={'sel-' + p.pathId} style={{ pointerEvents: 'none' }}>
                  <path d={p.pathData} stroke="oklch(0.615 0.112 57)" strokeWidth="8" fill="none" opacity={0.16} strokeLinecap="round"/>
                  <path className="lw-selected-path-march" d={p.pathData} stroke="oklch(0.615 0.112 57)" strokeWidth="2.5" fill="none" opacity={0.95}
                        strokeDasharray="10 5" strokeLinecap="round"
                        style={{ animation: 'lw-march 0.5s linear infinite' }}/>
                  <circle cx={midPt.x} cy={midPt.y} r={vbScale * 9} fill="oklch(0.615 0.112 57)" opacity={0.95}/>
                  <text x={midPt.x} y={midPt.y + vbScale * 4} textAnchor="middle" fill="oklch(0.190 0.018 52)" fontSize={vbScale * 9}
                        fontWeight="bold" style={{ userSelect: 'none' }}>{p.order}</text>
                </g>
              );
            })}

            {/* ── Placed look: the picture the lights are looking at, faint ── */}
            {placedActive && <PlacedLookPicture look={placedLook} time={placedTime}/>}

            {/* ── Light visualization ── */}
            {effectiveShowLight && !litActive && (
              <g filter={directedGlow ? undefined : 'url(#lw-light-glow)'} style={{ mixBlendMode: 'screen', pointerEvents: 'none' }}>
                {strips.map(s => !hidden[s.id] && (stripSamples[s.id] || []).map((pt, i) => {
                  const stripFrame = layoutPatternFrame.get(s.id);
                  const lightColor = rgbCss(stripFrame?.leds?.[i] || stripFrame, s.color);
                  const reach = vbScale * (effectiveGlowMode === 'inward' ? 24 : effectiveGlowMode === 'outward' ? 50 : 38);
                  const intensity = s.id === selStripId ? 0.42 : 0.28;
                  if (directedGlow) {
                    const isOmni = s.emit === 'omni';
                    const tangentAngle = Math.atan2(pt.ty || 0, pt.tx || 1) * 180 / Math.PI + 90;
                    const angle = Number.isFinite(Number(s.angle)) ? Number(s.angle) : tangentAngle;
                    return isOmni
                      ? <OmniHalo key={`${s.id}-${i}`} uid={`${s.id}-${i}`} cx={pt.x} cy={pt.y} color={lightColor} reach={reach * 0.72} intensity={intensity}/>
                      : <LightCone key={`${s.id}-${i}`} uid={`${s.id}-${i}`} cx={pt.x} cy={pt.y} angle={angle} color={lightColor} reach={reach} intensity={intensity}/>;
                  }
                  return (
                    <circle key={`${s.id}-${i}`}
                            cx={pt.x} cy={pt.y}
                            r={vbScale * 22}
                            fill={lightColor}
                            opacity={0.28}/>
                  );
                }))}
              </g>
            )}

            {/* ── Strip paths ── */}
            {/* A selected closed shape can be grabbed from its empty center.
                Keep this fill behind every strip stroke so an overlapping
                strip remains the topmost hit target. */}
            {selectedClosedStrip && canDragStrip && (
              <path
                d={selectedClosedStrip.pathData}
                transform={`translate(${selectedClosedStrip.x || 0} ${selectedClosedStrip.y || 0})`}
                fill="transparent"
                stroke="none"
                pointerEvents="fill"
                aria-hidden="true"
                data-strip-interior={selectedClosedStrip.id}
                onPointerDown={event => startStripMove(event, selectedClosedStrip)}
                onClick={event => {
                  event.stopPropagation();
                  if (!stripDragSuppressClickRef.current) selectStrip(selectedClosedStrip.id);
                }}/>
            )}
            {/* Give the selected strip the topmost path target when nearby
                screen-sized hit corridors overlap. Its visual rail also stays
                above neighbouring strips while it is being dragged. */}
            {[...strips].sort((a, b) => Number(a.id === selStripId) - Number(b.id === selStripId)).map(s => {
              const isSel = s.id === selStripId;
              const isHid = !!hidden[s.id];
              const isMoving = movingStripIds.includes(s.id);
              const stripFrame = layoutPatternFrame.get(s.id);
              // Schematic at rest = warm identity color; only let the (possibly
              // cool) pattern frame tint the strand when light preview is on.
              const stripColor = effectiveShowLight ? rgbCss(stripFrame, s.color) : (s.color || 'var(--accent)');
              // Identity colors keep adjacent physical sections distinguishable
              // even when their LED dots are too small to resolve.
              // With sides, a strip at rest wears its side's colour (the same one the
              // list's Side groups use); strips on their own keep their own colour.
              const sideOfStrip = !isHid && !effectiveShowLight && symmetry && mode === 'draw' ? sidePlaces.get(s.id) : null;
              const railColor = isHid
                ? 'oklch(40% 0.01 75)'
                : sideOfStrip ? sideTint(sideOfStrip.sideIndex) : stripColor;
              return (
                <g key={s.id} transform={`translate(${s.x || 0} ${s.y || 0})`}>
                  <path d={s.pathData}
                        data-strip-path={s.id}
                        onPointerEnter={() => setHoverStripId(s.id)}
                        onPointerLeave={() => setHoverStripId(current => (current === s.id ? null : current))}
                        tabIndex="0"
                        role="button"
                        aria-label={`Select ${s.name} strip`}
                        onKeyDown={event => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault();
                            selectStrip(s.id);
                          }
                        }}
                        fill="none"
                        stroke="white"
                        strokeOpacity="0.001"
                        strokeWidth={stripHitStrokeWidth}
                        strokeLinecap="round"
                        pointerEvents="visibleStroke"
                        style={{ cursor: isMoving ? 'grabbing' : isSel && mode === 'draw' ? 'grab' : 'pointer' }}
                        onPointerDown={e => {
                          if (wireOverlayMode === 'chop') {
                            e.preventDefault();
                            e.stopPropagation();
                            return;
                          }
                          startStripMove(e, s);
                        }}
                        onClick={e => {
                          e.stopPropagation();
                          if (stripDragSuppressClickRef.current) return;
                          if (wireOverlayMode === 'chop') {
                            chopStripAtEvent(e, s);
                            return;
                          }
                          if (e.shiftKey || e.metaKey || e.ctrlKey) toggleStripSel(s.id);
                          else selectStrip(s.id);
                        }}/>
                  <path d={s.pathData}
                        stroke={railColor}
                        strokeWidth={isSel ? 5 : 3} fill="none"
                        strokeOpacity={isHid ? 0 : isSel ? 0.16 : 0.09}
                        strokeLinecap="round"
                        pointerEvents="none"/>
                  <path d={s.pathData}
                        data-strip-identity={s.id}
                        stroke={railColor}
                        strokeWidth={annotationScale * (isSel ? 3 : 2.5)} fill="none"
                        pointerEvents="none"
                        opacity={isHid ? 0.25 : isMoving ? 0.95 : isSel ? 0.95 : 0.85}
                        style={{ filter: isSel && !isEditingGesture ? `drop-shadow(0 0 3px ${stripColor})` : 'none' }}/>
                  {!isHid && mode === 'draw' && sidePlaces.has(s.id) && (
                    <path
                      data-testid={`side-band-${s.id}`}
                      data-side-id={sidePlaces.get(s.id).sideId}
                      d={s.pathData}
                      fill="none"
                      stroke={sideTint(sidePlaces.get(s.id).sideIndex)}
                      strokeWidth={annotationScale * 21}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      pointerEvents="none"
                      opacity={0.62}
                    />
                  )}
                  {!isSel && mirrorFocusId === s.id && (
                    <path
                      data-testid={`mirror-echo-${s.id}`}
                      data-focused="true"
                      d={s.pathData}
                      fill="none"
                      stroke="oklch(64% 0.025 235)"
                      strokeWidth={annotationScale * 18}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      pointerEvents="none"
                      opacity={0.42}
                    />
                  )}
                  {isSel && !isHid && (
                    <>
                      {/* Thin translucent ribbon, not a thick tube — keeps LED dots readable */}
                      <path
                        data-testid="selected-strip-halo"
                        d={s.pathData}
                        fill="none"
                        stroke="oklch(64% 0.025 235)"
                        strokeWidth={annotationScale * 4.5}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        pointerEvents="none"
                        opacity={0.55}
                      />
                      {/* Faint core spine, not a solid line — same readability goal */}
                      <path
                        data-testid="selected-strip-core"
                        d={s.pathData}
                        fill="none"
                        stroke="white"
                        strokeWidth={annotationScale * 2.25}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        pointerEvents="none"
                        opacity={0.35}
                      />
                    </>
                  )}
                </g>
              );
            })}

            {mode === 'wire' && !isEditingGesture && visibleWirePathCanvasSegments.length > 0 && (
              <g className="lw-wire-canvas-segments" style={{ pointerEvents: 'none' }}>
                {visibleWirePathCanvasSegments.map(segment => (
                  <g key={segment.id}>
                    <polyline
                      points={pointsAttr(segment.points)}
                      className="lw-wire-canvas-segment"
                      style={{ '--wire-color': segment.color }}
                    />
                    {segment.linked && Number.isFinite(segment.order) && (
                      <g className="lw-route-badge">
                        <circle cx={segment.mid.x} cy={segment.mid.y} r={vbScale * 9}/>
                        <text x={segment.mid.x} y={segment.mid.y + vbScale * 3.5} fontSize={vbScale * 8}>
                          {segment.order + 1}
                        </text>
                      </g>
                    )}
                  </g>
                ))}
              </g>
            )}

            {mode === 'wire' && !isEditingGesture && wireRouteJumps.length > 0 && (
              <g className="lw-wire-route-jumps" style={{ pointerEvents: 'none' }}>
                {wireRouteJumps.map(jump => (
                  <line
                    key={jump.id}
                    className="lw-wire-route-jump"
                    x1={jump.from.x}
                    y1={jump.from.y}
                    x2={jump.to.x}
                    y2={jump.to.y}
                  />
                ))}
              </g>
            )}

            {mode === 'wire' && !isEditingGesture && wireCutMarkers.length > 0 && (
              <g className="lw-wire-cut-markers" style={{ pointerEvents: 'none' }}>
                {wireCutMarkers.map(marker => {
                  const notchSize = vbScale * (marker.selected ? 10 : 8);
                  const wing = notchSize * 0.48;
                  return (
                    <g
                      key={marker.id}
                      className={`lw-wire-cut-marker ${marker.selected ? 'selected' : ''}`}
                      transform={`translate(${marker.x} ${marker.y}) rotate(${marker.angle})`}
                      style={{ '--wire-color': marker.color }}
                    >
                      <path
                        className="lw-wire-cut-marker-notch"
                        d={`M 0 ${-notchSize} L 0 ${notchSize} M ${-wing} ${-notchSize * 0.62} L 0 0 L ${-wing} ${notchSize * 0.62}`}
                      />
                    </g>
                  );
                })}
              </g>
            )}

            {selectedSeamPoint && (selectedPhysicalStrip?.closed || selectedPhysicalStrip?.isClosed || selectedPhysicalRun?.seamLed != null) && (
              <g
                data-testid="connector-seam-handle"
                role="slider"
                aria-label="Connector seam handle"
                aria-valuenow={selectedSeamLed}
                aria-disabled={wiring.locked || selectedPhysicalRun.verified || selectedPhysicalRun.directionPolicy === 'fixed'}
                tabIndex={0}
                className="lw-seam-handle"
                pointerEvents="all"
                transform={`translate(${selectedSeamPoint.x} ${selectedSeamPoint.y})`}
                onPointerDown={event => {
                  if (wiring.locked || selectedPhysicalRun.verified || selectedPhysicalRun.directionPolicy === 'fixed') return;
                  event.stopPropagation();
                  event.currentTarget.setPointerCapture?.(event.pointerId);
                }}
                onPointerUp={event => {
                  if (!event.currentTarget.hasPointerCapture?.(event.pointerId)) return;
                  event.currentTarget.releasePointerCapture?.(event.pointerId);
                  onSeamMove(selectedPhysicalRun.id, event);
                }}
              >
                <circle r={vbScale * 9}/>
                <circle r={vbScale * 3}/>
              </g>
            )}

            {/* ── LED dots — dim hardware at rest, bright only when pattern is lit ── */}
            {(showLeds || firstLedPicker || kaleidoscopeEditor) && !isEditingGesture && strips.filter(s => !hidden[s.id]).map(s => (
              effectiveGlowMode === 'dots' ? (
                <g key={s.id + '-dots'} style={{ pointerEvents: firstLedPicker?.stripId === s.id || kaleidoscopeEditor?.stripId === s.id ? 'all' : 'none' }}>
                  {s.pixels.map((px, i) => {
                    const ledFrame = layoutPatternFrame.get(s.id)?.leds?.[i];
                    const selected = s.id === selStripId;
                    // Warm identity color at rest; pattern-driven tint only when lit.
                    const ledColor = effectiveShowLight ? ledCssColor(ledFrame, litActive ? PLACED_DARK_LED : (s.color || 'oklch(58% 0.04 70)')) : (s.color || 'oklch(58% 0.04 70)');
                    // Keep unlit LEDs clearly visible so the strip's pixels are countable at rest.
                    const shellOpacity = Math.max(selected ? 0.95 : 0.62, restingLedAlpha(ledFrame, { selected }));
                    const coreOpacity = activeLedCoreAlpha(ledFrame, { selected });
                    return (
                    <g key={i} data-testid={`strip-led-${s.id}-${i}`}
                       style={{ cursor: firstLedPicker?.stripId === s.id || kaleidoscopeEditor?.mode === 'pick' ? 'crosshair' : undefined }}
                       onPointerDown={event => {
                         if (firstLedPicker?.stripId !== s.id && !(kaleidoscopeEditor?.stripId === s.id && kaleidoscopeEditor.mode === 'pick')) return;
                         event.preventDefault();
                         event.stopPropagation();
                         if (firstLedPicker?.stripId === s.id) onFirstLedPick(s.id, i);
                         else onKaleidoscopeLedPick(s.id, i);
                       }}>
                      <circle cx={px.x} cy={px.y}
                              r={annotationScale * (selected ? 5.8 : 5)}
                              fill={ledColor} opacity={shellOpacity}
                              stroke="oklch(22% 0.03 235 / 0.9)"
                              strokeWidth={annotationScale * (selected ? 1.3 : 1)}/>
                      {coreOpacity > 0 && (
                        <circle cx={px.x} cy={px.y}
                                r={annotationScale * (selected ? 3.2 : 2.7)}
                                fill={ledColor} opacity={coreOpacity}/>
                      )}
                      {(firstLedPicker?.stripId === s.id || (kaleidoscopeEditor?.stripId === s.id && kaleidoscopeEditor.mode === 'pick')) && <circle cx={px.x} cy={px.y} r={vbScale * 20}
                                                                  fill="transparent" pointerEvents="all"/>}
                    </g>
                    );
                  })}
                </g>
              ) : (
                <g key={s.id + '-dots'} filter="url(#lw-led-bloom)" style={{ pointerEvents: firstLedPicker?.stripId === s.id || kaleidoscopeEditor?.stripId === s.id ? 'all' : 'none' }}>
                  {s.pixels.map((px, i) => {
                    const ledFrame = layoutPatternFrame.get(s.id)?.leds?.[i];
                    const selected = s.id === selStripId;
                    // Warm identity color at rest; pattern-driven tint only when lit.
                    const ledColor = effectiveShowLight ? ledCssColor(ledFrame, litActive ? PLACED_DARK_LED : (s.color || 'oklch(58% 0.04 70)')) : (s.color || 'oklch(58% 0.04 70)');
                    const coreOpacity = activeLedCoreAlpha(ledFrame, { selected });
                    const restOpacity = Math.max(selected ? 0.8 : 0.5, restingLedAlpha(ledFrame, { selected }));
                    return (
                    <g key={i} data-testid={`strip-led-${s.id}-${i}`}
                       style={{ cursor: firstLedPicker?.stripId === s.id || kaleidoscopeEditor?.mode === 'pick' ? 'crosshair' : undefined }}
                       onPointerDown={event => {
                         if (firstLedPicker?.stripId !== s.id && !(kaleidoscopeEditor?.stripId === s.id && kaleidoscopeEditor.mode === 'pick')) return;
                         event.preventDefault();
                         event.stopPropagation();
                         if (firstLedPicker?.stripId === s.id) onFirstLedPick(s.id, i);
                         else onKaleidoscopeLedPick(s.id, i);
                       }}>
                      <circle cx={px.x} cy={px.y}
                              r={Math.max(selected ? vbScale * 3.1 : vbScale * 2.2,
                                annotationScale * (selected ? 4.5 : 4))}
                              fill={ledColor}
                              opacity={Math.max(coreOpacity * (effectiveGlowMode === 'outward' ? 0.58 : 0.74), restOpacity)}/>
                      {(firstLedPicker?.stripId === s.id || (kaleidoscopeEditor?.stripId === s.id && kaleidoscopeEditor.mode === 'pick')) && <circle cx={px.x} cy={px.y} r={vbScale * 20}
                                                                  fill="transparent" pointerEvents="all"/>}
                    </g>
                    );
                  })}
                </g>
              )
            ))}

            {kaleidoscopeEditor && !isEditingGesture && (() => {
              const strip = strips.find(item => item.id === kaleidoscopeEditor.stripId);
              if (!strip?.kaleidoscope || hidden[strip.id]) return null;
              const pointIndices = deriveReflectionPointIndices(strip.kaleidoscope, strip.pixelCount);
              return (
                <g className="lw-kaleidoscope-markers">
                  {pointIndices.map((ledIndex, pointIndex) => {
                    const point = strip.pixels?.[ledIndex];
                    if (!point) return null;
                    const selected = pointIndex === kaleidoscopeEditor.selectedPointIndex;
                    return (
                      <g key={pointIndex}
                         data-testid="kaleidoscope-marker"
                         data-point-index={pointIndex}
                         role="slider"
                         tabIndex={0}
                         aria-label={`Reflection point ${pointIndex + 1}, LED ${ledIndex + 1}`}
                         aria-valuenow={ledIndex + 1}
                         transform={`translate(${point.x} ${point.y})`}
                         className={selected ? 'selected' : ''}
                         style={{ cursor: 'grab', pointerEvents: 'all' }}
                         onClick={event => {
                           event.stopPropagation();
                           onKaleidoscopeSelectPoint(pointIndex);
                         }}
                         onKeyDown={event => {
                           if (event.key === 'Enter' || event.key === ' ') {
                             event.preventDefault();
                             onKaleidoscopeSelectPoint(pointIndex);
                           }
                         }}
                         onPointerDown={event => {
                           event.preventDefault();
                           event.stopPropagation();
                           onKaleidoscopeSelectPoint(pointIndex);
                           event.currentTarget.dataset.historyPushed = 'false';
                           event.currentTarget.setPointerCapture?.(event.pointerId);
                         }}
                         onPointerMove={event => {
                           if (!event.currentTarget.hasPointerCapture?.(event.pointerId) || !svgRef.current) return;
                           const cursor = svgPt(svgRef.current, event.clientX, event.clientY);
                           let nearest = 0;
                           strip.pixels.forEach((pixel, index) => {
                             if (Math.hypot(cursor.x - pixel.x, cursor.y - pixel.y)
                               < Math.hypot(cursor.x - strip.pixels[nearest].x, cursor.y - strip.pixels[nearest].y)) nearest = index;
                           });
                           const recordHistory = event.currentTarget.dataset.historyPushed !== 'true';
                           const accepted = onKaleidoscopeLedPick(strip.id, nearest, pointIndex, { recordHistory });
                           if (accepted) event.currentTarget.dataset.historyPushed = 'true';
                         }}
                         onPointerUp={event => event.currentTarget.releasePointerCapture?.(event.pointerId)}>
                        <circle r={vbScale * (selected ? 9 : 7)} />
                        <text textAnchor="middle" dominantBaseline="central" fontSize={vbScale * 8}>{pointIndex + 1}</text>
                      </g>
                    );
                  })}
                </g>
              );
            })()}

            {mode === 'draw' && selectedSeamPoint && (
              <g data-testid="first-led-marker" transform={`translate(${selectedSeamPoint.x} ${selectedSeamPoint.y})`} style={{ pointerEvents: 'none' }}>
                <circle r={vbScale * 10} fill="var(--bg-canvas)" stroke="var(--accent)" strokeWidth={vbScale * 2}/>
                <text textAnchor="middle" dominantBaseline="central" fill="var(--accent)" fontSize={vbScale * 11} fontWeight="700">1</text>
              </g>
            )}

            {/* ── Symmetry: the mirror line with its two sides named, and each
                   side strip's flow number (in its label, or just before its
                   first LED). A number is a strip handle: tapping selects. ── */}
            {symmetry && mode === 'draw' && !isEditingGesture && (
              <g className="lw-symmetry-marks">
                {axisLine && (() => {
                  const vertical = Math.abs(axisLine.y2 - axisLine.y1) >= Math.abs(axisLine.x2 - axisLine.x1);
                  const start = vertical
                    ? (axisLine.y1 <= axisLine.y2 ? { x: axisLine.x1, y: axisLine.y1 } : { x: axisLine.x2, y: axisLine.y2 })
                    : (axisLine.x1 <= axisLine.x2 ? { x: axisLine.x1, y: axisLine.y1 } : { x: axisLine.x2, y: axisLine.y2 });
                  const mid = { x: (axisLine.x1 + axisLine.x2) / 2, y: (axisLine.y1 + axisLine.y2) / 2 };
                  return <>
                    <line data-testid="symmetry-axis" x1={axisLine.x1} y1={axisLine.y1} x2={axisLine.x2} y2={axisLine.y2}
                          stroke="oklch(72% 0.012 75)" strokeWidth={annotationScale * 1.2}
                          strokeDasharray={`${annotationScale * 4} ${annotationScale * 5}`}
                          opacity={0.55} pointerEvents="none"/>
                    {symmetry.sides.map((side, index) => {
                      const toward = axisLine.middles[index];
                      const dx = toward.x - mid.x; const dy = toward.y - mid.y;
                      const length = Math.hypot(dx, dy) || 1;
                      const gap = annotationScale * 10;
                      const x = start.x + dx / length * gap;
                      const y = start.y + dy / length * gap + (vertical ? annotationScale * 4 : 0);
                      return (
                        <text key={side.id} data-testid={`symmetry-side-label-${side.id}`}
                              x={x} y={y} fontSize={annotationScale * 11} fontWeight="600"
                              fontFamily="var(--font-ui, sans-serif)"
                              textAnchor={vertical ? (dx < 0 ? 'end' : 'start') : 'start'}
                              dominantBaseline={vertical ? 'auto' : (dy < 0 ? 'auto' : 'hanging')}
                              fill={sideTint(index)} pointerEvents="none" style={{ userSelect: 'none' }}>
                          {side.label}
                        </text>
                      );
                    })}
                  </>;
                })()}
              </g>
            )}

            {/* ── Placed look: its frame and corner handles. Under the
                   symmetry centre mark, so the mark still drags. ── */}
            {placedActive && !isEditingGesture && (
              <PlacedLookFrame look={placedLook} svgRef={svgRef} scale={annotationScale} spaceRef={spaceRef}/>
            )}

            {/* ── Look designer: tap a shape to step its pattern, drag across
                   shapes to set their order. Mounted only while it is on. ── */}
            {designerActive && !isEditingGesture && (
              <LookDesignerTouch svgRef={svgRef} scale={annotationScale} spaceRef={spaceRef}
                                 model={designer.model} look={designer.look} selected={designer.selected}/>
            )}

            {/* ── Symmetry by eye: side 1 copied onto the other sides, the
                   side the pulse is on, and the centre mark. Shown only while
                   the owner is choosing; none of it takes a click from a strip. ── */}
            {focusActive && focusCentre && !isEditingGesture && (
              <g className="lw-symmetry-focus" data-testid="symmetry-copies" data-count={focusCopies.length} data-fits={focusFits ? 'true' : 'false'}>
                {focusCopies.map((copy, index) => (
                  <polyline key={`${copy.sourceId}-${index}`} points={polyline(copy.points)} fill="none"
                            stroke="var(--layer-1)" strokeWidth={annotationScale * (focusFits ? 3.2 : 1.8)}
                            strokeLinecap="round" strokeLinejoin="round"
                            opacity={focusFits ? 0.9 : 0.62} pointerEvents="none"/>
                ))}
                {pulseStripIds && strips.filter(s => pulseStripIds.has(s.id) && !hidden[s.id] && s.pixels?.length > 1).map(s => (
                  <polyline key={`${s.id}-pulse`} data-testid={`symmetry-pulse-${s.id}`} points={polyline(s.pixels)} fill="none"
                            stroke="var(--text-hi)" strokeWidth={annotationScale * 4.5}
                            strokeLinecap="round" strokeLinejoin="round" pointerEvents="none"/>
                ))}
                <g className="lw-symmetry-centre" data-testid="symmetry-centre" tabIndex={0} role="slider"
                   aria-label="Centre of the piece. Drag it, or use the arrow keys."
                   aria-valuetext={symmetryFocus.centre ? 'Moved' : 'Where Studio put it'}
                   transform={`translate(${focusCentre.x} ${focusCentre.y})`}
                   style={{ cursor: 'grab', touchAction: 'none' }} {...centreHandlers}>
                  <circle r={annotationScale * 26} fill="transparent"/>
                  <circle r={annotationScale * 12} fill="var(--bg-canvas)" stroke="var(--accent-hi)" strokeWidth={annotationScale * 2.5}/>
                  <circle r={annotationScale * 2.5} fill="var(--accent-hi)" pointerEvents="none"/>
                  {[[-1, 0], [1, 0], [0, -1], [0, 1]].map(([dx, dy]) => (
                    <line key={`${dx}:${dy}`} x1={dx * annotationScale * 12} y1={dy * annotationScale * 12}
                          x2={dx * annotationScale * 24} y2={dy * annotationScale * 24}
                          stroke="var(--accent-hi)" strokeWidth={annotationScale * 1.5} pointerEvents="none"/>
                  ))}
                </g>
              </g>
            )}

            {/* One small numbered dot per strip at its first light; the name is a
                chip for the selected and the hovered strip only. */}
            {labelsShown && strips.filter(s => !hidden[s.id] && s.pixels?.length > 0).map(s => {
              const partName = canvasStripLabel(s, sectionFamilies);
              const place = symmetry && mode === 'draw' ? sidePlaces.get(s.id) : null;
              const number = place ? place.position : strips.findIndex(item => item.id === s.id) + 1;
              const tint = place ? sideTint(place.sideIndex) : s.color;
              const label = place
                ? `${partName} · ${place.label}, ${place.position} of ${place.count} · ${s.pixelCount} LEDs`
                : `${partName} · ${s.pixelCount} LEDs`;
              const dot = stripDotAt(s, annotationScale);
              const showChip = s.id === selStripId || s.id === hoverStripId;
              const chipText = place ? `${partName} · ${place.label}` : partName;
              const chipName = chipText.length > 24 ? `${chipText.slice(0, 23).trimEnd()}…` : chipText;
              const chipWidth = Math.min(150, 14 + chipName.length * 6.4);
              // Anchored just past the strip's outer end (the end farthest from the
              // piece centre), on the side away from the strip, kept inside the canvas.
              const anchor = stripOuterEnd(s, pieceCentre, annotationScale);
              let toRight = anchor.dx >= 0;
              if (toRight && anchor.x + (chipWidth + 6) * annotationScale > labelBounds.x + labelBounds.w) toRight = false;
              if (!toRight && anchor.x - (chipWidth + 6) * annotationScale < labelBounds.x) toRight = true;
              const ax = (anchor.x - dot.x) / annotationScale;
              const ay = (anchor.y - dot.y) / annotationScale;
              const chipX = toRight ? ax + 4 : ax - 4 - chipWidth;
              const topLimit = (labelBounds.y - dot.y) / annotationScale + 4;
              const bottomLimit = (labelBounds.y + labelBounds.h - dot.y) / annotationScale - 24;
              const chipY = Math.max(topLimit, Math.min(bottomLimit, ay - 10));
              return (
                <g key={s.id + '-callout'} className="lw-strip-callout"
                   data-testid={`strip-callout-${s.id}`}
                   data-selected={s.id === selStripId || undefined}
                   aria-label={label}
                   transform={`translate(${dot.x} ${dot.y}) scale(${annotationScale})`}
                   style={{ pointerEvents: canDragStrip ? 'all' : 'none', cursor: movingStripIds.includes(s.id) ? 'grabbing' : 'grab', userSelect: 'none' }}
                   onPointerDown={event => startStripMove(event, s)}
                   onPointerEnter={() => setHoverStripId(s.id)}
                   onPointerLeave={() => setHoverStripId(current => (current === s.id ? null : current))}
                   onClick={event => {
                     event.stopPropagation();
                     if (stripDragSuppressClickRef.current) return;
                     if (event.shiftKey || event.metaKey || event.ctrlKey) toggleStripSel(s.id);
                     else selectStrip(s.id);
                   }}>
                  <title>{label}</title>
                  {showChip && (
                    <g className="lw-strip-chip" data-testid={`strip-chip-${s.id}`}>
                      <rect x={chipX} y={chipY} width={chipWidth} height="20" rx="4"
                            fill="oklch(0.18 0.02 220 / 0.92)" stroke={tint} strokeWidth={s.id === selStripId ? 1.5 : 0.7}/>
                      <text className="lw-strip-label-name" x={chipX + 7} y={chipY + 14} fontFamily="var(--font-ui, sans-serif)" fontSize="11"
                            fontWeight={s.id === selStripId ? 600 : 400} fill={tint}>{chipName}</text>
                    </g>
                  )}
                  <g className="lw-strip-dot" data-testid={place ? `flow-mark-${s.id}` : `strip-dot-${s.id}`}
                     data-flow-position={place ? place.position : undefined}>
                    <circle r="7.5" fill="oklch(0.18 0.02 220 / 0.88)" stroke={tint} strokeWidth={s.id === selStripId ? 1.6 : 1}/>
                    <text textAnchor="middle" dominantBaseline="central" fontSize="9.5" fontFamily="var(--font-mono, monospace)"
                          fill={tint} style={{ userSelect: 'none' }}>{number}</text>
                  </g>
                </g>
              );
            })}

            {/* ── Direction arrows (all visible strips) ── */}
            {mode === 'wire' && !isEditingGesture && strips.filter(s => !hidden[s.id]).map(s => {
              const arrow = stripArrows[s.id];
              if (!arrow) return null;
              const isSel = s.id === selStripId;
              return (
                <g key={s.id + '-arrow'} style={{ pointerEvents: 'none' }} opacity={isSel ? 1 : 0.55}>
                  <polygon
                    points={`${arrow.tip.x},${arrow.tip.y} ${arrow.left.x},${arrow.left.y} ${arrow.right.x},${arrow.right.y}`}
                    fill={s.color} opacity={0.9}/>
                  <circle cx={arrow.start.x} cy={arrow.start.y} r={vbScale * 4} fill="oklch(0.745 0.095 150)" opacity={0.9}/>
                </g>
              );
            })}

            {/* ── Selection frame — mockup clay corner-tick frame (not a blue/green box) ── */}
            {selStripId && !isEditingGesture && (() => {
              const s = strips.find(st => st.id === selStripId);
              if (!s || !s.pixels?.length) return null;
              const xs = s.pixels.map(p => p.x);
              const ys = s.pixels.map(p => p.y);
              const pad = vbScale * 14;
              const x = Math.min(...xs) - pad, y = Math.min(...ys) - pad;
              const w = (Math.max(...xs) - Math.min(...xs)) + pad * 2;
              const h = (Math.max(...ys) - Math.min(...ys)) + pad * 2;
              const t = Math.min(w, h) * 0.18 || vbScale * 13;
              const corners = [
                [x, y, x + t, y, x, y + t],
                [x + w, y, x + w - t, y, x + w, y + t],
                [x, y + h, x + t, y + h, x, y + h - t],
                [x + w, y + h, x + w - t, y + h, x + w, y + h - t],
              ];
              return (
                <g key="sel-frame" style={{ pointerEvents: 'none' }}>
                  <rect x={x} y={y} width={w} height={h} rx={vbScale * 6} fill="none"
                        stroke="var(--accent-line)" strokeWidth={vbScale} strokeDasharray={`${vbScale * 2} ${vbScale * 5}`}/>
                  {corners.map((c, i) => (
                    <path key={i} d={`M${c[2]} ${c[3]} L${c[0]} ${c[1]} L${c[4]} ${c[5]}`} fill="none"
                          stroke="var(--accent)" strokeWidth={vbScale * 2} strokeLinecap="round"/>
                  ))}
                </g>
              );
            })()}

            {/* ── Starter primitive ghost — live preview of the shape the
                   starter panel will create (dimmed rail + LED dots, no glow) ── */}
            {starterGhost && (
              <g className="lw-starter-ghost" data-testid="starter-ghost" aria-hidden="true">
                <path d={starterGhost.pathData} fill="none"
                      stroke="oklch(62% 0.012 75)" strokeWidth="1.5"
                      strokeDasharray="5 3" strokeLinecap="round"/>
                {starterGhost.pixels.map((px, i) => (
                  <circle key={i} cx={px.x} cy={px.y} r={vbScale * 3.2}
                          fill="oklch(58% 0.04 70)"/>
                ))}
              </g>
            )}

            {/* ── Draw mode ghost ── */}
            {drawMode && ghostD && (
              <path d={ghostD} stroke="oklch(0.615 0.112 57)" strokeWidth="1.5" fill="none"
                    strokeDasharray="5 3" strokeLinecap="round" pointerEvents="none"/>
            )}
            {drawMode && waypoints.map((pt, i) => (
              <circle key={i} cx={pt.x} cy={pt.y} r={vbScale * 4} fill="oklch(0.615 0.112 57)"
                      opacity={0.9} pointerEvents="none"/>
            ))}
            {/* Draw cursor dot before first waypoint */}
            {drawMode && ghostPt && waypoints.length === 0 && (
              <circle cx={ghostPt.x} cy={ghostPt.y} r={vbScale * 3}
                      fill="oklch(0.615 0.112 57)" opacity={0.5} pointerEvents="none"/>
            )}

            {/* ── Empty state (hidden while the starter ghost previews a shape) ── */}
            {!svgText && strips.length === 0 && !starterGhost && (
              <>
                <rect x="1" y="1" width="638" height="398" rx="4" fill="none"
                      stroke="oklch(30% 0.01 75)" strokeDasharray="6 4"/>
                <text x="320" y="185" textAnchor="middle" fill="oklch(55% 0.04 70)"
                      fontSize="14" fontFamily="var(--font-ui, sans-serif)">
                  Drop an SVG or click Import SVG
                </text>
                <text x="320" y="205" textAnchor="middle" fill="oklch(48% 0.03 70)"
                      fontSize="11" fontFamily="var(--font-ui, sans-serif)">
                  Illustrator: File → Export As → SVG (layers preserved)
                </text>
                <text x="320" y="222" textAnchor="middle" fill="oklch(42% 0.025 70)"
                      fontSize="10" fontFamily="var(--font-ui, sans-serif)">
                  Drag and drop supported
                </text>
              </>
            )}
          </svg>

          {/* ── Rubber-band lasso overlay (absolute inside viewport — position:fixed breaks with backdrop-filter ancestors) ── */}
          {rubberBand && (
            <div style={{
              position: 'absolute',
              left:   Math.min(rubberBand.x1, rubberBand.x2),
              top:    Math.min(rubberBand.y1, rubberBand.y2),
              width:  Math.abs(rubberBand.x2 - rubberBand.x1),
              height: Math.abs(rubberBand.y2 - rubberBand.y1),
              border: '1px dashed var(--accent)',
              background: 'var(--accent-soft)',
              pointerEvents: 'none',
              zIndex: 9999,
              userSelect: 'none',
            }}/>
          )}
        </div>
        </div>{/* .stage */}

        {offer && (
          <SymmetryOffer suggestion={offer} strips={strips}
                         onMirror={applyOffer}
                         onChoose={() => {
                           applyOffer();
                           // Bring the inspector up (it may be folded away on a
                           // phone) and its sides into view.
                           const handle = document.querySelector('[data-testid="layout-sheet-handle"][aria-expanded="false"]');
                           handle?.click();
                           requestSymmetryReveal();
                         }}
                         onKeep={() => setLayoutSymmetryOfferDismissed?.(true)}/>
        )}

        {focusActive && focusCentre && !offer && (
          <SymmetryFocusCard fold={focusFold} fits={focusFits} dealt={Boolean(focusSuggestion?.dealt)} moved={Boolean(symmetryFocus.centre)}
                             onDone={() => { stopPulse(); setPulseSide(null); setSymmetryFocus(null); }}
                             onPulse={runPulse}
                             onRecentre={() => { setSymmetryFocus({ centre: null }); placeSidesAbout(null); }}/>
        )}

        {/* ── Canvas corner readouts (mockup .la-overlay) ── */}
        <div className="la-overlay tl">
          <div><span className="k">artwork</span><span className="v">{parsedVb(viewBox).w} × {parsedVb(viewBox).h}</span></div>
          <div><span className="k">layers</span><span className="v">{layers.length} · {strips.length} strips</span></div>
          <div><span className="k">leds</span><span className="v">{totalLeds.toLocaleString()}</span></div>
        </div>
        <div className="la-overlay br">
          <div><span className="k">emit</span><span className="v">{existingStrip ? (existingStrip.emit === 'omni' ? 'omni' : `dir ${existingStrip.angle || 0}°`) : '—'}</span></div>
          {cursorSvgPt && (
            <div className="la-canvas-cursor"><span className="k">cursor</span><span className="v">{cursorSvgPt.x.toFixed(0)} · {cursorSvgPt.y.toFixed(0)}</span></div>
          )}
          <div><span className="k">zoom</span><span className="v">{Math.round(zoom * 100)}%</span></div>
          <div className="la-canvas-view-actions">
            <button
              type="button"
              className="la-fit-board"
              aria-label="Fit board"
              title="Fit board (F, Cmd/Ctrl+0)"
              onClick={onFitBoard}>
              <svg viewBox="0 0 20 20" aria-hidden="true">
                <path d="M7 3H3v4M13 3h4v4M17 13v4h-4M7 17H3v-4"/>
              </svg>
            </button>
          </div>
        </div>
      </main>
  );
}
