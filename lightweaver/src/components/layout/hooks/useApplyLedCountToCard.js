import { useEffect, useRef } from 'react';
import { useProject } from '../../../state/ProjectContext.jsx';
import { applyTypedLedCountToCard } from '../../../lib/applyLedCountToCard.js';

const APPLY_DEBOUNCE_MS = 800;

function totalStripLeds(strips = []) {
  return strips.reduce((sum, strip) => sum + (strip.pixelCount || strip.pixels?.length || 0), 0);
}

export function useApplyLedCountToCard({ connected, cardHost } = {}) {
  const project = useProject();
  const projectRef = useRef(project);
  projectRef.current = project;
  const totalLeds = totalStripLeds(project.strips);

  useEffect(() => {
    if (!connected || !cardHost || totalLeds <= 0) return undefined;
    const timer = setTimeout(() => {
      const current = projectRef.current;
      void applyTypedLedCountToCard({
        host: cardHost,
        project: {
          projectId: current.projectId,
          projectName: current.projectName,
          projectRevision: current.projectRevision,
          strips: current.strips,
          patchBoard: current.patchBoard,
          wiring: current.wiring,
          compiledWiring: current.compiledWiring,
          standaloneController: current.standaloneController,
        },
      }).catch(() => {});
    }, APPLY_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [connected, cardHost, totalLeds]);
}
