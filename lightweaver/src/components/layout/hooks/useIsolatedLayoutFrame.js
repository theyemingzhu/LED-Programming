import { useCallback, useEffect, useRef, useState } from 'react';
import { createPatternFrameService } from '../../../lib/patternFrameIsolation.js';
import { renderIsolatedPixelFrame } from '../../../lib/isolatedFrameEngine.js';
import { CUSTOM_PATTERNS_EVENT, WORKSPACE_ASSETS_EVENT } from '../../../lib/customPatterns.js';
import { createLayoutFrameOwner } from './layoutFrameOwner.js';
import { mapLayoutPatternFrame } from './layoutFrameMapping.js';

export async function renderIsolatedLayoutFrame({ inputs, t, previewTime }, service) {
  // Freeze the physical LED mapping alongside the engine's own input snapshot.
  const mapping = structuredClone({ ...inputs.mapping, previewTime });
  const frame = await renderIsolatedPixelFrame({ ...inputs.options, t }, service);
  return mapLayoutPatternFrame(frame, mapping);
}

export function useIsolatedLayoutFrame(inputs, t, previewTime) {
  const [frame, setFrame] = useState(() => new Map());
  const [error, setError] = useState(null);
  const [sourceRevision, setSourceRevision] = useState(0);
  const ownerRef = useRef(null);
  const identityRef = useRef(null);
  useEffect(() => {
    const changed = () => setSourceRevision(revision => revision + 1);
    window.addEventListener(CUSTOM_PATTERNS_EVENT, changed);
    window.addEventListener(WORKSPACE_ASSETS_EVENT, changed);
    return () => {
      window.removeEventListener(CUSTOM_PATTERNS_EVENT, changed);
      window.removeEventListener(WORKSPACE_ASSETS_EVENT, changed);
    };
  }, []);
  useEffect(() => {
    const owner = createLayoutFrameOwner({
      createService: createPatternFrameService, renderFrame: renderIsolatedLayoutFrame,
      onFrame: setFrame, onError: setError,
    });
    ownerRef.current = owner;
    return () => { owner.dispose(); ownerRef.current = null; };
  }, []);
  useEffect(() => {
    if (identityRef.current?.inputs !== inputs || identityRef.current?.sourceRevision !== sourceRevision) {
      identityRef.current = { inputs, sourceRevision };
    }
    ownerRef.current?.request({ inputs, t, previewTime }, identityRef.current);
  }, [inputs, t, previewTime, sourceRevision]);
  const retry = useCallback(() => ownerRef.current?.retry(), []);
  return { frame, error, retry };
}
