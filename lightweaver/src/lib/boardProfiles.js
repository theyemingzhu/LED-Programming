import { CARD_HEADER_ROWS, formatGpio } from './cardPinout.js';

export const BOARD_CATALOG = 'https://docs.espressif.com/projects/esp-board-manager/en/latest/references/boards/index.html';
export const BOARD_VENDOR_TOOL = 'https://docs.espressif.com/projects/esp-adf/en/latest/tools/esp-board-manager-tool.html';
export const BOARD_PROFILE_STORAGE = 'lw-board-profiles-v1';
export const BOARD_LIBRARY_CHANGED = 'lw-board-library-changed';
export const BOARD_PROFILE_FILE_LIMIT = 256 * 1024;
export const PIN_ROLES = Object.freeze({
  unknown: 'Unresolved', gpio: 'General-purpose pin', power: 'Power', ground: 'Ground', reset: 'Reset',
  boot: 'Boot strap', memory: 'Memory', usb: 'USB', uart: 'UART', jtag: 'JTAG',
  led: 'Onboard LED', storage: 'Onboard storage', control: 'Onboard control', other: 'Other',
});
const DEVKIT_GUIDE = 'https://docs.espressif.com/projects/esp-dev-kits/en/latest/esp32s3/esp32-s3-devkitc-1';
const OTG_GUIDE = 'https://docs.espressif.com/projects/esp-dev-kits/en/latest/esp32s3/esp32-s3-usb-otg/user_guide.html';
const VENDOR_DATA = 'https://raw.githubusercontent.com/espressif/esp-board-manager/main/esp_boards';
const FORMAT = 'lightweaver-board-profile';
const MIB = 1024 ** 2;
export const BOARD_LIMITS = Object.freeze({ groups: 8, pins: 64, sources: 12 });

function pin(label, gpio, role, detail = '') {
  return { label, gpio, role, detail, installation: '' };
}

const s3Straps = { 0: 'BOOT / download', 3: 'JTAG selection strap', 45: 'Flash voltage strap', 46: 'Boot / ROM logging strap' };
const commonRoles = {
  19: ['usb', 'Native USB D−'], 20: ['usb', 'Native USB D+'],
  39: ['jtag', 'MTCK'], 40: ['jtag', 'MTDO'], 41: ['jtag', 'MTDI'], 42: ['jtag', 'MTMS'],
  43: ['uart', 'UART0 TX to USB bridge'], 44: ['uart', 'UART0 RX from USB bridge'],
};

function s3Pin(gpio, label = formatGpio(gpio), overrides = {}) {
  const role = overrides[gpio] || commonRoles[gpio] || (Object.hasOwn(s3Straps, gpio)
    ? ['boot', s3Straps[gpio]] : ['gpio']);
  return pin(label, gpio, ...role);
}

function devkit(revision, rgb, schematic) {
  const overrides = {
    35: ['memory', 'Octal PSRAM'], 36: ['memory', 'Octal PSRAM'], 37: ['memory', 'Octal PSRAM'],
    [rgb]: ['led', 'Onboard RGB (shared)'],
  };
  return {
    id: `espressif-devkitc-1-n16r8-v${revision}`, revision: 1, name: 'ESP32-S3-DevKitC-1 N16R8',
    manufacturer: 'Espressif', pcbRevision: `v${revision}`, chip: 'ESP32-S3',
    module: 'ESP32-S3-WROOM-1-N16R8', flashMb: 16, psramMb: 8, supplier: '',
    orientation: 'Component side, antenna at top. J1 left, J3 right. Count down from the antenna.',
    sources: [
      `${DEVKIT_GUIDE}/user_guide_v${revision}.html`, schematic,
      'https://documentation.espressif.com/esp32-s3-wroom-1_wroom-1u_datasheet_en.pdf',
      `${VENDOR_DATA}/esp32_s3_devkitc_1/board_devices.yaml`,
      `${VENDOR_DATA}/esp32_s3_devkitc_1/board_peripherals.yaml`,
    ],
    groups: [...CARD_HEADER_ROWS].reverse().map(row => ({
      name: row.id, kind: 'header', start: 1, step: 1,
      pins: row.pins.map(label => {
        if (Number.isInteger(label)) return s3Pin(label, undefined, overrides);
        if (label === 'TX' || label === 'RX') return s3Pin(label === 'TX' ? 43 : 44, label);
        if (label === 'G') return pin('G', null, 'ground');
        if (label === 'RST') return pin('RST', null, 'reset', 'EN');
        return pin(label, null, 'power');
      }),
    })),
  };
}

const otg = {
  id: 'espressif-esp32-s3-usb-otg-v1.0', revision: 1, name: 'ESP32-S3-USB-OTG',
  manufacturer: 'Espressif', pcbRevision: 'v1.0', chip: 'ESP32-S3', module: 'ESP32-S3-MINI-1-N8',
  flashMb: 8, psramMb: 0, supplier: '',
  orientation: 'J5 is shown in two rows by schematic pin number. Locate pin 1 before wiring.',
  sources: [
    OTG_GUIDE, 'https://dl.espressif.com/dl/schematics/SCH_ESP32-S3_USB_OTG.pdf',
    `${VENDOR_DATA}/esp32_s3_usb_otg/board_peripherals.yaml`,
    `${VENDOR_DATA}/esp32_s3_usb_otg/board_devices.yaml`,
  ],
  groups: [
    { name: 'J5 odd', kind: 'header', start: 1, step: 2, pins: [
      pin('3V3', null, 'power'), ...[39, 41, 45, 48, 47].map(gpio => s3Pin(gpio)), pin('GND', null, 'ground'),
    ] },
    { name: 'J5 even', kind: 'header', start: 2, step: 2, pins: [
      pin('GND', null, 'ground'), ...[40, 42, 46, 26, 3].map(gpio => s3Pin(gpio)), pin('GND', null, 'ground'),
    ] },
    { name: 'microSD', kind: 'onboard', start: 1, step: 1, pins: [
      ...[[36, 'CLK'], [35, 'CMD'], [37, 'DAT0'], [38, 'DAT1'], [33, 'DAT2'], [34, 'DAT3']]
        .map(([gpio, label]) => pin(label, gpio, 'storage', 'SDIO')),
    ] },
    { name: 'Display, buttons and LEDs', kind: 'onboard', start: 1, step: 1, pins: [
      ...[[4, 'LCD D/C'], [5, 'LCD power'], [6, 'LCD SPI clock'], [7, 'LCD SPI MOSI'],
        [8, 'LCD reset'], [9, 'LCD backlight'], [10, 'Up'], [11, 'Down'], [14, 'Menu']]
        .map(([gpio, label]) => pin(label, gpio, 'control')),
      s3Pin(0, 'BOOT / OK'), pin('Reset', null, 'reset', 'EN'),
      pin('Green LED', 15, 'led'), pin('Yellow LED', 16, 'led'),
    ] },
    { name: 'USB and power', kind: 'onboard', start: 1, step: 1, pins: [
      ...[[1, 'USB voltage sense'], [2, 'Battery sense'], [12, 'Device VBUS enable'], [13, 'Boost enable'],
        [17, 'Current-limit enable'], [18, 'Host/device select'], [21, 'Overcurrent signal']]
        .map(([gpio, label]) => pin(label, gpio, 'control')),
      ...[19, 20, 43, 44].map(gpio => s3Pin(gpio)),
    ] },
  ],
};

function freezeReference(profile) {
  profile.sources = Object.freeze(profile.sources);
  profile.groups = Object.freeze(profile.groups.map(group =>
    Object.freeze({ ...group, pins: Object.freeze(group.pins.map(entry => Object.freeze(entry))) })));
  return Object.freeze(profile);
}

export const REFERENCE_BOARDS = Object.freeze([
  devkit('1.0', 48, 'https://dl.espressif.com/dl/SCH_ESP32-S3-DEVKITC-1_V1_20210312C.pdf'),
  devkit('1.1', 38, 'https://dl.espressif.com/dl/schematics/SCH_ESP32-S3-DevKitC-1_V1.1_20220413.pdf'),
  otg,
].map(freezeReference));

export const isReferenceBoard = id => REFERENCE_BOARDS.some(profile => profile.id === id);
export const boardTitle = profile => [profile.name, profile.pcbRevision, profile.supplier && `(${profile.supplier})`].filter(Boolean).join(' ');
export const newBoardGroup = () => ({ name: '', kind: 'header', start: 1, step: 1, pins: [] });
export const newBoardPin = () => pin('', null, 'unknown');

export function draftBoard(source) {
  const id = `local-${Array.from(crypto.getRandomValues(new Uint8Array(16)), byte => byte.toString(16).padStart(2, '0')).join('')}`;
  if (source) return { ...source, id, revision: 0, name: `${source.name.slice(0, 95)} copy` };
  return {
    id, revision: 0, name: '', manufacturer: '', pcbRevision: '', chip: '', module: '',
    flashMb: null, psramMb: null, supplier: '', orientation: '', sources: [],
    groups: [{ ...newBoardGroup(), name: 'J1' }],
  };
}

function cleanText(value, field, max, optional = false) {
  if (typeof value !== 'string' || value.length > max || (!optional && !value.trim())) {
    throw new Error(`Enter ${field} (up to ${max} characters).`);
  }
  return value.trim();
}

function cleanNumber(value, field, min, max, optional = false) {
  if (optional && (value === null || value === '')) return null;
  const number = typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : value;
  if (!Number.isInteger(number) || number < min || number > max) {
    throw new Error(`${field} must be a whole number from ${min} to ${max}.`);
  }
  return number;
}

function cleanList(value, limit, field) {
  if (!Array.isArray(value) || value.length > limit) throw new Error(`Use up to ${limit} ${field}.`);
  return value;
}

export function validateBoardProfile(profile) {
  if (!profile || !/^(local-[0-9a-f]{32}|espressif-[a-z0-9.-]+)$/.test(profile.id || '') || profile.id.length > 90) {
    throw new Error('This board profile has an invalid ID.');
  }
  const chip = cleanText(profile.chip, 'a chip model', 80);
  const groupNames = new Set();
  const groups = cleanList(profile.groups, BOARD_LIMITS.groups, 'pin groups').map(group => {
    const name = cleanText(group?.name, 'a name for each pin group', 48);
    if (groupNames.has(name.toLowerCase())) throw new Error('Give each pin group a different name.');
    groupNames.add(name.toLowerCase());
    if (!['header', 'onboard'].includes(group.kind)) throw new Error(`Choose a pin group type for ${name}.`);
    const header = group.kind === 'header';
    const start = header ? cleanNumber(group.start, `${name} first position`, 1, 128) : 1;
    const step = header ? cleanNumber(group.step, `${name} numbering step`, 1, 8) : 1;
    const pins = cleanList(group.pins, BOARD_LIMITS.pins, 'pins per group').map((entry, index) => {
      const where = `${name} pin ${start + index * step}`;
      const gpio = cleanNumber(entry?.gpio, `${where} pin number`, 0, 255, true);
      if (chip.toUpperCase() === 'ESP32-S3' && gpio !== null && ((gpio >= 22 && gpio <= 25) || gpio > 48)) {
        throw new Error(`${where} uses ${formatGpio(gpio)}, which is absent on ESP32-S3.`);
      }
      if (!Object.hasOwn(PIN_ROLES, entry.role)) throw new Error(`Choose a valid role for ${where}.`);
      if (gpio !== null && ['power', 'ground', 'reset'].includes(entry.role)) {
        throw new Error(`Leave the pin number blank for the ${PIN_ROLES[entry.role].toLowerCase()} connection at ${where}.`);
      }
      return {
        ...pin(cleanText(entry.label, `a label for ${where}`, 48), gpio, entry.role,
          cleanText(entry.detail, 'a pin note', 160, true)),
        installation: cleanText(entry.installation, 'a Lightweaver assignment', 100, true),
      };
    });
    return { name, kind: group.kind, start, step, pins };
  });
  const sources = [...new Set(cleanList(profile.sources, BOARD_LIMITS.sources, 'source links').map(source => {
    const url = cleanText(source, 'a source URL', 500);
    let parsed;
    try { parsed = new URL(url); } catch { throw new Error('Enter full HTTP or HTTPS source links.'); }
    if (!['https:', 'http:'].includes(parsed.protocol) || parsed.username || parsed.password) {
      throw new Error('Enter full HTTP or HTTPS source links without credentials.');
    }
    return parsed.href;
  }))];
  return {
    id: profile.id, revision: cleanNumber(profile.revision, 'Profile revision', 1, Number.MAX_SAFE_INTEGER),
    name: cleanText(profile.name, 'a board name', 100),
    manufacturer: cleanText(profile.manufacturer, 'a manufacturer', 80, true),
    pcbRevision: cleanText(profile.pcbRevision, 'a PCB revision', 48, true),
    chip, module: cleanText(profile.module, 'a module marking', 80, true),
    flashMb: cleanNumber(profile.flashMb, 'Flash size', 1, 1024, true),
    psramMb: cleanNumber(profile.psramMb, 'PSRAM size', 0, 1024, true),
    supplier: cleanText(profile.supplier, 'a supplier or listing', 100, true),
    orientation: cleanText(profile.orientation, 'a map orientation', 180, true),
    sources, groups,
  };
}

export function exportBoardProfile(profile) {
  return JSON.stringify({ format: FORMAT, version: 1, profile: validateBoardProfile(profile) }, null, 2);
}

export function importBoardProfile(text) {
  let file;
  try { file = JSON.parse(text); } catch { throw new Error('Choose an exported Lightweaver board profile JSON file.'); }
  if (file?.format !== FORMAT || file?.version !== 1) throw new Error('This is an unsupported Lightweaver board profile format.');
  const profile = validateBoardProfile(file.profile);
  if (!profile.id.startsWith('local-')) {
    const reference = REFERENCE_BOARDS.find(board => board.id === profile.id);
    if (!reference || exportBoardProfile(reference) !== exportBoardProfile(profile)) {
      throw new Error('Built-in profiles are read-only. Duplicate the reference in Studio before editing.');
    }
    return reference;
  }
  return profile;
}

export function readBoardLibrary(storage) {
  const stored = storage.getItem(BOARD_PROFILE_STORAGE);
  if (stored === null) return { profiles: [], confirmations: {} };
  const state = JSON.parse(stored);
  if (!Array.isArray(state?.profiles) || !state.confirmations || typeof state.confirmations !== 'object') {
    throw new Error('The saved board library could not be read.');
  }
  return {
    profiles: state.profiles.map(profile => importBoardProfile(JSON.stringify({ format: FORMAT, version: 1, profile })))
      .filter(profile => !isReferenceBoard(profile.id)),
    confirmations: state.confirmations,
  };
}

export function updateBoardLibrary(storage, update) {
  const state = update(readBoardLibrary(storage));
  storage.setItem(BOARD_PROFILE_STORAGE, JSON.stringify(state));
  globalThis.window?.dispatchEvent(new Event(BOARD_LIBRARY_CHANGED));
  return state;
}

export function storeBoardProfile(state, profile, previousRevision) {
  if (isReferenceBoard(profile.id)) return state;
  const prior = state.profiles.find(existing => existing.id === profile.id);
  if (previousRevision === undefined) {
    if (prior && exportBoardProfile(prior) === exportBoardProfile(profile)) return state;
    if (prior) throw new Error('This profile ID already exists with different content. Export or duplicate the local profile to preserve both versions.');
  } else if ((prior?.revision ?? 0) !== previousRevision) {
    throw new Error('This profile was updated in another tab. Reopen it before saving.');
  }
  return { ...state, profiles: [...state.profiles.filter(existing => existing.id !== profile.id), profile] };
}

export function rememberedBoard(state, cardId) {
  if (!/^lw-[a-f\d]{12}$/.test(cardId || '')) return null;
  const choice = state.confirmations[cardId];
  if (!choice) return null;
  const profile = [...REFERENCE_BOARDS, ...state.profiles].find(board => board.id === choice.id);
  return profile ? { cardId, profile, revision: choice.revision, current: profile.revision === choice.revision } : null;
}

export function rememberBoard(state, cardId, profile) {
  if (!/^lw-[a-f\d]{12}$/.test(cardId || '')) throw new Error('Read an exact Lightweaver card ID first.');
  const saved = [...REFERENCE_BOARDS, ...state.profiles].find(board => board.id === profile.id);
  if (saved?.revision !== profile.revision) throw new Error('Reopen the saved profile before confirming it.');
  return { ...state, confirmations: { ...state.confirmations, [cardId]: { id: profile.id, revision: profile.revision } } };
}

// USB inspection is tied to the card MAC. The chip and its memories narrow
// the choice; neither USB nor a firmware build target identifies a PCB revision.
export function boardEvidence(info = {}, usb = null) {
  const size = value => Number.isSafeInteger(value) && value >= 0 ? value / MIB : null;
  const profile = info?.boardProfile;
  const cardId = typeof info?.cardId === 'string' && /^lw-[a-f\d]{12}$/.test(info.cardId) ? info.cardId : '';
  const firmwareChip = [info?.chipName, info?.chip]
    .find(value => typeof value === 'string' && value.trim())?.trim().toUpperCase() || '';
  const firmwareFlash = size(info?.flashBytes) || null;
  const matchingUsb = cardId && usb?.cardId === cardId ? usb : null;
  const usbChip = typeof matchingUsb?.chipName === 'string' ? matchingUsb.chipName.trim().toUpperCase() : '';
  const usbFlash = size(matchingUsb?.flashBytes) || null;
  return {
    cardId,
    chip: firmwareChip || usbChip,
    flashMb: firmwareFlash ?? usbFlash,
    usbHints: [!firmwareChip && usbChip && 'chip', firmwareFlash === null && usbFlash !== null && 'flash size'].filter(Boolean),
    psramMb: size(info?.psramBytes),
    readingsConflict: Boolean(firmwareChip && usbChip && firmwareChip !== usbChip
      || firmwareFlash !== null && usbFlash !== null && firmwareFlash !== usbFlash),
    reported: cardId && typeof profile?.id === 'string' && profile.id.length > 0 && profile.id.length <= 90
      && Number.isSafeInteger(profile.revision) && profile.revision > 0
      ? { id: profile.id, revision: profile.revision } : null,
  };
}

export function boardEvidenceConflicts(evidence, profile) {
  return Boolean(evidence.readingsConflict
    || evidence.chip && profile.chip.toUpperCase() !== evidence.chip
    || evidence.flashMb !== null && profile.flashMb !== null && evidence.flashMb !== profile.flashMb
    || evidence.psramMb !== null && profile.psramMb !== null && evidence.psramMb !== profile.psramMb);
}

export function shortlistBoards(profiles, evidence, remembered) {
  return profiles.filter(profile => !boardEvidenceConflicts(evidence, profile)).map(profile => {
    const reported = Boolean(evidence.reported?.id === profile.id && evidence.reported.revision === profile.revision);
    const confirmed = Boolean(remembered?.cardId === evidence.cardId && remembered?.current && remembered.profile.id === profile.id
      && remembered.revision === profile.revision);
    const hints = [
      evidence.chip && evidence.chip === profile.chip.toUpperCase() && 'Chip',
      evidence.flashMb !== null && evidence.flashMb === profile.flashMb && 'Flash',
      evidence.psramMb !== null && evidence.psramMb === profile.psramMb && 'PSRAM',
    ].filter(Boolean);
    return { profile, reported, confirmed, hints, score: (reported ? 10 : 0) + (confirmed ? 5 : 0) + hints.length };
  }).sort((a, b) => b.score - a.score);
}

export function resolveBoardMatch(profiles, evidence, remembered) {
  if (!evidence?.cardId) return { status: 'unavailable', profile: null, candidates: [] };
  const candidates = shortlistBoards(profiles, evidence, remembered);
  if (evidence.readingsConflict) {
    return { status: 'review', reason: 'hardware-readings-conflict', profile: null, candidates };
  }
  const confirmed = candidates.find(candidate => candidate.confirmed);
  const reported = candidates.find(candidate => candidate.reported);
  // The owner can identify a different compatible PCB running the same
  // reference firmware. Keep that choice scoped to this exact physical card.
  if (confirmed && (reported || confirmed.profile.id.startsWith('local-'))) {
    return { status: 'remembered', profile: confirmed.profile, candidates };
  }
  if (reported) return { status: 'reported', profile: reported.profile, candidates };
  if (evidence.reported) {
    return { status: 'review', reason: 'reported-profile-unavailable', profile: null, candidates };
  }
  if (confirmed) return { status: 'remembered', profile: confirmed.profile, candidates };
  if (!candidates.length) return { status: 'no-match', profile: null, candidates };
  if (!evidence.chip && evidence.flashMb === null && evidence.psramMb === null) {
    return { status: 'unavailable', profile: null, candidates };
  }
  return { status: 'review', reason: 'check-pcb-revision', profile: null, candidates };
}
