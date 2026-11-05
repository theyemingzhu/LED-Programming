import { useEffect, useRef, useState } from 'react';
import { createPatternFrameService } from '../../src/lib/patternFrameIsolation.js';
import { legacyPatternSourceKey, renderLegacyPixelFrame } from './isolatedFrameEngine.js';
import { CUSTOM_PATTERNS_EVENT } from './customPatterns.js';

export function useLegacyPatternSourceKey(options) {
  const [, refresh] = useState(0);
  useEffect(() => {
    const changed = () => refresh(value => value + 1);
    window.addEventListener(CUSTOM_PATTERNS_EVENT, changed);
    window.addEventListener('storage', changed);
    return () => { window.removeEventListener(CUSTOM_PATTERNS_EVENT, changed); window.removeEventListener('storage', changed); };
  }, []);
  return legacyPatternSourceKey(options);
}

export function legacyPatternError(error) {
  return error?.message?.includes('deadline')
    ? 'Pattern preview stopped: isolated rendering took too long or is unavailable in this browser.'
    : `Pattern preview stopped: ${String(error?.message || 'rendering failed').slice(0,160)}`;
}

export function useIsolatedPatternFrame(options) {
  const sourceKey = useLegacyPatternSourceKey(options);
  const failedSource = useRef(null);
  const [state, setState] = useState({ frame:null, error:null, status:'preparing' });
  useEffect(() => {
    if (failedSource.current === sourceKey) return;
    failedSource.current = null;
    let active = true;
    const service = createPatternFrameService({ dialect:'legacy-v3' });
    setState({ frame:null, error:null, status:'preparing', owner:options, sourceKey });
    renderLegacyPixelFrame(options, service).then(frame => {
      if (active) setState({ frame, error:null, status:'ready', owner:options, sourceKey });
    }).catch(error => {
      if (!active) return;
      failedSource.current = sourceKey;
      setState({ frame:null, error:legacyPatternError(error), status:'stopped', failure:error?.message, owner:options, sourceKey });
    });
    return () => { active = false; service.dispose(); };
  }, [options, sourceKey]);
  // A newly imported source/geometry must not briefly expose the previous
  // request's ready frame before its effect cleanup runs.
  if (state.owner !== options || state.sourceKey !== sourceKey) {
    return failedSource.current === sourceKey && state.sourceKey === sourceKey
      ? { frame:null, error:state.error, status:'stopped', failure:state.failure }
      : { frame:null, error:null, status:'preparing' };
  }
  return state;
}
