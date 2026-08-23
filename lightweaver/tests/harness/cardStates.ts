// The card states the matrix puts the hardware in.
//
// Each entry is a DESCRIPTION of a card, not a canned HTTP response. The
// simulator (./cardSimulator) renders these into every endpoint Studio calls,
// and mutates them on writes. Keeping the description separate from the wire
// format is what stops a fixture drifting into a card that could not exist.
//
// Every state here is one Adrian has actually met, or one that a real card
// passes through on the way to being set up.

export const MATRIX_CARD_ID = 'lw-matrix-card';
export const MATRIX_HOST = 'lightweaver.local';
export const MATRIX_PROJECT_ID = 'lwproj-matrix-piece';
export const OTHER_PROJECT_ID = 'lwproj-someone-elses';
export const BENCH_PROJECT_ID = 'lw-bench-discovery';

/** The build the simulated card is running, and the one Studio was flashed against. */
export const MATRIX_BUILD_ID = 'b'.repeat(40);
export const MATRIX_BUILD_NUMBER = 1432;
export const MATRIX_FIRMWARE_VERSION = '1.1.29';

export type PatternEntry = { id: string; label: string };

// Real ids from src/lib/cardPatternBank.js. Invented ids look fine in a
// fixture and then have no tile on the Patterns screen, which reads as a
// Studio failure when it is a fixture failure.
export const MATRIX_PATTERNS: PatternEntry[] = [
  { id: 'aurora', label: 'Aurora' },
  { id: 'plasma', label: 'Plasma' },
  { id: 'fire', label: 'Fire' },
];

export type CardStateSpec = {
  /** Matrix cell id, used in the test title so a failure names the state. */
  id: string;
  /** One line, in Adrian's language, for the test title. */
  describe: string;

  /** Project the card holds. Empty string means none. */
  projectId: string;
  projectName: string;
  /** 0 + empty fingerprint models a card flashed before fingerprint reporting. */
  projectRevision: number;
  projectFingerprint: string;
  /** The card is holding temporary find-my-strips scaffolding, not an install. */
  provisionalSetup: boolean;

  /** Strip wiring the card reports. */
  pin: number;
  pixels: number;

  /** Patterns the card can play, and what it is playing now. */
  patterns: PatternEntry[];
  /** -1 with currentId 'blackout' is a card sitting dark — a normal card. */
  currentIndex: number;
  currentId: string;

  /** A staged wiring change the card is holding un-confirmed. */
  wiringTransactionOpen: boolean;

  /** Firmware the card reports. */
  buildId: string;
  buildNumber: number;
  firmwareVersion: string;

  /** Drop this many requests before answering, to model the discovery race. */
  dropFirstRequests: number;
};

function base(overrides: Partial<CardStateSpec> & Pick<CardStateSpec, 'id' | 'describe'>): CardStateSpec {
  return {
    projectId: MATRIX_PROJECT_ID,
    projectName: 'Matrix piece',
    projectRevision: 4,
    projectFingerprint: 'f'.repeat(32),
    provisionalSetup: false,
    pin: 18,
    pixels: 41,
    patterns: MATRIX_PATTERNS,
    currentIndex: 0,
    currentId: MATRIX_PATTERNS[0].id,
    wiringTransactionOpen: false,
    buildId: MATRIX_BUILD_ID,
    buildNumber: MATRIX_BUILD_NUMBER,
    firmwareVersion: MATRIX_FIRMWARE_VERSION,
    dropFirstRequests: 0,
    ...overrides,
  };
}

export const CARD_STATES: CardStateSpec[] = [
  base({
    id: 'factory-blank',
    describe: 'flashed and on Wi-Fi, holding no project',
    projectId: '', projectName: '', projectRevision: 0, projectFingerprint: '',
    pixels: 0, patterns: [], currentIndex: -1, currentId: 'blackout',
  }),
  base({
    id: 'provisional',
    describe: 'holding the temporary find-my-strips scaffolding',
    projectId: BENCH_PROJECT_ID, projectName: 'Lightweaver Bench Discovery',
    provisionalSetup: true, projectRevision: 1, projectFingerprint: '',
    currentIndex: -1, currentId: 'blackout',
  }),
  base({
    id: 'installed-match',
    describe: 'holding the same project Studio has open',
  }),
  base({
    id: 'installed-different',
    describe: 'holding a project Studio has never seen',
    projectId: OTHER_PROJECT_ID, projectName: 'Someone else’s piece',
    projectFingerprint: 'a'.repeat(32),
  }),
  base({
    id: 'installed-legacy-fp',
    describe: 'holding a real project but reporting revision 0 and no fingerprint',
    projectRevision: 0, projectFingerprint: '',
  }),
  base({
    id: 'blackout',
    describe: 'installed, with its lights off',
    currentIndex: -1, currentId: 'blackout',
  }),
  base({
    id: 'playing',
    describe: 'installed and mid-pattern',
    currentIndex: 2, currentId: MATRIX_PATTERNS[2].id,
  }),
  base({
    id: 'wiring-open',
    describe: 'holding an unconfirmed staged wiring change',
    wiringTransactionOpen: true,
  }),
  base({
    id: 'stale-firmware',
    describe: 'on a different build from the one Studio remembers',
    buildId: 'c'.repeat(40), buildNumber: MATRIX_BUILD_NUMBER - 40,
    firmwareVersion: '1.1.24',
  }),
  base({
    id: 'slow-to-answer',
    describe: 'dropping the first requests before it answers',
    dropFirstRequests: 3,
  }),
];

export function cardState(id: string): CardStateSpec {
  const found = CARD_STATES.find(state => state.id === id);
  if (!found) throw new Error(`unknown card state: ${id}`);
  return found;
}
