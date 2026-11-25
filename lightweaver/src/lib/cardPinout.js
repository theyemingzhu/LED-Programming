// Where each pin sits on the card. The card is an ESP32-S3-DevKitC-1, which
// breaks its pins out on two rows of 22. The order below is the board's own,
// counted from the antenna end (Espressif's DevKitC-1 v1.1 user guide, "Header
// Block"), and every label is what the board prints beside the pin, so an
// owner can find a pin by reading the board rather than a datasheet.
//
// Numbers are GPIOs; strings are pins that are not (power, ground, reset, and
// the serial pair, which the board prints as TX and RX).
export const CARD_HEADER_ROWS = Object.freeze([
  Object.freeze({
    id: 'J3',
    firstLabel: 'G',
    pins: Object.freeze(['G', 'TX', 'RX', 1, 2, 42, 41, 40, 39, 38, 37, 36, 35, 0, 45, 48, 47, 21, 20, 19, 'G', 'G']),
  }),
  Object.freeze({
    id: 'J1',
    firstLabel: '3V3',
    pins: Object.freeze(['3V3', '3V3', 'RST', 4, 5, 6, 7, 15, 16, 17, 18, 8, 3, 46, 9, 10, 11, 12, 13, 14, '5V', 'G']),
  }),
]);

// GPIO 38 drives the board's own RGB light on v1.1 boards and GPIO 48 does on
// the first release. Both are legal LED outputs; a strip on either one simply
// makes that small light glow too, which is worth saying before it surprises.
export const BOARD_LIGHT_PINS = Object.freeze([38, 48]);

export function locateCardPin(pin) {
  const gpio = Number(pin);
  if (!Number.isInteger(gpio)) return null;
  for (const row of CARD_HEADER_ROWS) {
    const index = row.pins.indexOf(gpio);
    if (index >= 0) return { row: row.id, firstLabel: row.firstLabel, position: index + 1 };
  }
  return null;
}

function ordinal(n) {
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) return `${n}th`;
  return `${n}${({ 1: 'st', 2: 'nd', 3: 'rd' })[n % 10] || 'th'}`;
}

// One sentence an owner can follow with the board in hand.
export function formatGpio(pin) {
  return `GPIO ${pin}`;
}

export function describeCardPinPlace(pin) {
  const place = locateCardPin(pin);
  if (!place) return `${formatGpio(pin)}: not on the card's pin rows.`;
  return `${formatGpio(pin)}: ${ordinal(place.position)} pin from the antenna end, on the ${place.firstLabel} row.`;
}

export function cardPinNotes(pins = []) {
  const chosen = new Set(pins.map(Number));
  const notes = [];
  if (BOARD_LIGHT_PINS.some(pin => chosen.has(pin))) {
    notes.push('38 and 48 also light the board’s own small LED.');
  }
  return notes;
}

const HEADER_FUNCTIONS = new Map([
  ['G', 'Ground'], ['3V3', '3.3 V power'], ['5V', '5 V power'], ['RST', 'Reset'],
  ['TX', `UART0 TX · ${formatGpio(43)}`], ['RX', `UART0 RX · ${formatGpio(44)}`],
  [0, 'BOOT strap'], [2, 'Boot status LED'], [3, 'Boot strap'], [45, 'Boot strap'], [46, 'Boot strap'],
  [10, 'microSD CS'], [11, 'microSD MOSI'], [12, 'microSD SCK'], [13, 'microSD MISO'],
  [19, 'USB D−'], [20, 'USB D+'],
  [35, 'PSRAM'], [36, 'PSRAM'], [37, 'PSRAM'],
]);

const EXTRA_PIN_FUNCTIONS = new Map([
  [38, 'RGB v1.1'], [48, 'RGB v1.0'],
  [39, 'JTAG'], [40, 'JTAG'], [41, 'JTAG'], [42, 'JTAG'],
]);

// The header wiring takes precedence over project assignments. Sharing the
// onboard LED or external JTAG signals does not prevent a supported LED pin
// from being shown with its current assignment.
export function describeCardPinRole(pin, {
  controls = new Map(), outputs = new Map(), supportedPins = [], availablePins = null,
  profile = null, profilePin = null,
} = {}) {
  const reportedRole = profilePin?.detail || (profilePin?.role === 'gpio' ? '' : profilePin?.role);
  const hardRole = profilePin && !['gpio', 'led', 'jtag'].includes(profilePin.role) ? reportedRole : '';
  const reserved = [...new Set([HEADER_FUNCTIONS.get(pin), hardRole].filter(Boolean))].join(' · ');
  const control = controls.get(pin);
  const currentControl = pin === 2 && control === 'Status LED' ? null : control;
  if (reserved || control) return {
    kind: 'reserved',
    label: [reserved, currentControl, profilePin?.installation].filter(Boolean).join(' · '),
  };

  const auxiliary = profilePin ? (['led', 'jtag'].includes(profilePin.role) ? reportedRole : '')
    : EXTRA_PIN_FUNCTIONS.get(pin);
  const annotation = profilePin?.installation;
  const availableForProfile = !profile || profile.id.startsWith('espressif-devkitc-1-') || Boolean(availablePins);
  if (outputs.has(pin)) return { kind: 'output', label: ['LED output', auxiliary, annotation].filter(Boolean).join(' · ') };
  if (supportedPins.includes(pin)) {
    const available = availableForProfile && (!availablePins || availablePins.includes(pin));
    return {
      kind: available ? 'available' : 'reserved',
      label: [available ? 'LED available' : 'LED unavailable', auxiliary, annotation].filter(Boolean).join(' · '),
    };
  }
  return { kind: 'unsupported', label: [reportedRole || 'LED unsupported', annotation].filter(Boolean).join(' · ') };
}
