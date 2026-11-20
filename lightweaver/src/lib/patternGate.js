// Whether a Patterns "not sent" refusal may step down by itself.
//
// Only a 'recovery' refusal raised while the card was NOT ready clears, and
// only once access reads 'ready' again (the card came back after a drop). A
// refusal raised while access already read 'ready' was about something else
// (stale authority, a bridge that is not fresh) and stays until the owner acts.
export function shouldClearRecoveryGate({ access, gate, raisedWhileUnready }) {
  return access === 'ready' && gate === 'recovery' && raisedWhileUnready === true;
}
