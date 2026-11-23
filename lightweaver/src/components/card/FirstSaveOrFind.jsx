import { useSyncExternalStore } from 'react';
import { getCardLinkState, subscribeCardLink } from '../../lib/cardLink.js';
import { classifyCardReadiness } from '../../lib/cardReadiness.js';
import { needsStripDiscovery } from '../../lib/cardAction.js';
import { getFirstInstallState, subscribeFirstInstallState } from '../../lib/firstInstallState.js';
import { isUncountedHeadroomCount } from '../../lib/discoveryCommit.js';
import { useProject } from '../../state/ProjectContext.jsx';

// The one rule for which way into Find my strips a card takes (combined flow,
// todo/plans/find-strips-redesign.md §7). On the real card a blank card that
// is set up for finding first can no longer take a full project (its staged
// copy does not fit beside the temporary setup), but a blank card takes its
// first whole project directly. So:
//   way in 1: blank card + the open project's wiring is known → save first,
//             then check the lights;
//   way in 2: no known wiring → find the strips first.
// A first save already under way (or its check) keeps way in 1 until it ends.
export function useFirstSaveApplies() {
  const { wiring, compiledWiring, patchBoard, strips, starterPending } = useProject();
  const cardLink = useSyncExternalStore(subscribeCardLink, getCardLinkState, getCardLinkState);
  const firstInstall = useSyncExternalStore(subscribeFirstInstallState, getFirstInstallState, getFirstInstallState).phase;
  if (['running', 'checking', 'failed'].includes(firstInstall)) return true;
  const readinessState = cardLink.readiness
    ? classifyCardReadiness(cardLink.readiness, { expectedCard: cardLink.expectedCard }).state
    : (cardLink.cardBlank === true ? 'blank' : '');
  if (!needsStripDiscovery({ readinessState })) return false;
  const stripIds = new Set(strips.map(strip => strip.id));
  const mapped = new Set(wiring.runs.filter(run => run.type === 'strip' && stripIds.has(run.source.stripId)).map(run => run.source.stripId));
  const mappingReady = compiledWiring.ok && mapped.size === stripIds.size
    && !wiring.runs.some(run => run.type === 'strip' && !stripIds.has(run.source.stripId));
  return Boolean(mappingReady && !starterPending && !patchBoard?.dataWireCountNeedsReview && strips.length > 0
    && compiledWiring.outputs.length > 0
    && compiledWiring.outputs.every(output => Number(output.count) > 0 && !isUncountedHeadroomCount(output.count)));
}

// `elsewhere`: another mount already owns the one project write on this page
// (Card Home's install slot under next=patterns). One Save button per page,
// because one press must be one write.
export function FirstSaveOrFind({ firstSave, find, elsewhere = false }) {
  const applies = useFirstSaveApplies();
  return applies && !elsewhere ? firstSave : find;
}

export default FirstSaveOrFind;
