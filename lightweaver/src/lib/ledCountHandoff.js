// Card Home -> Layout hand-off for a new LED count on an installed card
// (todo/plans/simpler-journeys.md, C3).
//
// The count of a drawn project is spread across its strips by Layout's own
// setter (useLayoutSize.setTotalLedCount: by path length, with the physical
// scale re-solved). Card Home must not re-implement that, so its Lights row
// leaves the requested total here and opens Layout, which applies it with the
// one setter and continues to Save to card. One-shot, and stale after 15 s so
// a forgotten note never changes a project later.
const KEY = 'lw_pending_led_total_v1';
const FRESH_MS = 15_000;

function store() {
  try { return globalThis.sessionStorage || null; } catch { return null; }
}

export function requestLedTotal(total, { now = Date.now(), storage = store() } = {}) {
  const value = Math.trunc(Number(total));
  if (!storage || !Number.isSafeInteger(value) || value < 1) return false;
  try { storage.setItem(KEY, JSON.stringify({ total: value, at: now })); return true; } catch { return false; }
}

export function takeLedTotal({ now = Date.now(), storage = store() } = {}) {
  if (!storage) return null;
  let raw = null;
  try { raw = storage.getItem(KEY); storage.removeItem(KEY); } catch { return null; }
  try {
    const parsed = JSON.parse(raw || 'null');
    const total = Math.trunc(Number(parsed?.total));
    if (!Number.isSafeInteger(total) || total < 1) return null;
    if (!(now - Number(parsed.at) >= 0 && now - Number(parsed.at) <= FRESH_MS)) return null;
    return total;
  } catch { return null; }
}
