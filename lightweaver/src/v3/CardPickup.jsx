// The card is where browsers meet, on every screen. Card Home runs its own
// pick-up (lw-setup.jsx); this covers a fresh browser that opens straight onto
// any other screen, such as a #screen=pattern link. Same guard, same
// adoption machine, once per card boot. It renders nothing.
import { useEffect, useRef } from 'react';
import { useProject } from '../state/ProjectContext.jsx';
import { useCardActions } from './CardActionsProvider.jsx';
import { cardPickupKey, projectFromCardParts } from '../lib/cardPickup.js';
import { cardProjectFingerprint } from '../lib/cardProjectResolver.js';

export function CardPickup({ cardLink, active }) {
  const { serializeProject, projectLifecycle, replaceProject, markProjectInstalled } = useProject();
  const cardActions = useCardActions();
  const doneRef = useRef('');
  const connected = ['connected-direct', 'connected-bridge'].includes(cardLink?.state);
  const readiness = cardLink?.readiness || {};
  const key = active ? cardPickupKey({
    project: serializeProject(), projectLifecycle, connected, readiness, cardId: cardLink?.card?.id,
  }) : '';

  useEffect(() => {
    if (!key || doneRef.current === key || !cardActions?.adoptCardProject) return;
    doneRef.current = key;
    const applyCardParts = async (parts, status = null) => {
      if (!Array.isArray(parts?.strips) || !parts.strips.length) return { ok: false, reason: 'no-strips' };
      const current = serializeProject();
      const replacement = await replaceProject(projectFromCardParts(current, parts, status), { confirmDiscard: () => true });
      if (!replacement?.ok) return { ok: false, reason: replacement?.reason || 'replace-failed' };
      const marker = replacement.marker || {};
      markProjectInstalled?.({
        generation: marker.generation,
        revision: marker.revision,
        cardId: status?.cardId || cardLink?.card?.id || readiness.cardId || '',
        projectRevision: Number(status?.projectRevision ?? readiness.projectRevision),
        projectFingerprint: status?.projectFingerprint || readiness.projectFingerprint || '',
        studioFingerprint: cardProjectFingerprint(replacement.project),
        verified: true,
      });
      return { ok: true };
    };
    // Quiet by design: the owner did nothing, so a failure raises no alert;
    // Card Home still offers "Open installed project".
    cardActions.adoptCardProject({ strategy: 'reconstruct', applyCardParts, openPatterns: () => {} })
      .catch(error => console.warn('Lightweaver card pick-up did not complete', error));
  }, [key]);
  return null;
}
