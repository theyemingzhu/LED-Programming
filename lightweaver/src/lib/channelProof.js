// The two-question colour-order proof, as a pure state machine.
//
// StripDiscoveryPanel.jsx drives this during the probe phase and hands the
// resulting object to discoveryCommit.js when the walk is recorded. Both sides
// import THIS file, so the shape of a proof — and in particular where the
// measured channel map lives — is defined exactly once. Before this file
// existed the panel stored the map under `map` while discoveryCommit read
// `channelMap`, and no real discovery run could ever confirm a colour order.
import { channelMapFromProofAnswers } from './stripDiscovery.js';

export const CHANNEL_PROOF_STAGES = Object.freeze(['first', 'second', 'done', 'skipped']);

/** A proof that has not been asked yet. */
export function createChannelProof() {
  return { stage: 'first', firstSeen: '', map: null, retry: false };
}

/** The owner chose not to check colours; nothing is measured. */
export function skippedChannelProof() {
  return { stage: 'skipped', firstSeen: '', map: null, retry: false };
}

/**
 * Record what the owner saw for the current question. The same colour twice is
 * physically impossible — one answer was a slip — so the check starts over
 * (with `retry` set so the UI can say why) rather than recording a map that
 * lies. Answers after 'done' or 'skipped' are ignored.
 */
export function answerChannelProof(current, seen) {
  const proof = current && typeof current === 'object' ? current : createChannelProof();
  if (proof.stage === 'first') {
    return { stage: 'second', firstSeen: seen, map: null, retry: false };
  }
  if (proof.stage === 'second') {
    const map = channelMapFromProofAnswers(proof.firstSeen, seen);
    if (!map) return { stage: 'first', firstSeen: '', map: null, retry: true };
    return { stage: 'done', firstSeen: proof.firstSeen, map, retry: false };
  }
  return proof;
}

/** True once the probe phase may move on: both answers given, or skipped. */
export function channelProofSettled(proof) {
  return proof?.stage === 'done' || proof?.stage === 'skipped';
}

/**
 * The measured { red, green, blue } send-slot map, or null when the proof was
 * skipped, unfinished, or absent. This is the ONLY reader of the field name, so
 * every consumer (frame correction, colour-order commit) agrees with the writer.
 */
export function channelProofMap(proof) {
  return proof?.stage === 'done' && proof.map && typeof proof.map === 'object' ? proof.map : null;
}
