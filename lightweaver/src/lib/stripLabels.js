// Generated strip identities never borrow the artwork/project title. Custom
// names are left alone; callers use the existing split suffix policy for them.
export function nextStripNames(strips, count = 1, excludeId = null) {
  const used = new Set(strips.filter(s => s.id !== excludeId).map(s => s.name));
  const sourceName = strips.find(s => s.id === excludeId)?.name;
  const names = /^Strip \d+$/.test(sourceName || '') && !used.has(sourceName) ? [sourceName] : [];
  if (names.length) used.add(sourceName);
  for (let n = 1; names.length < count; n += 1) {
    const name = `Strip ${n}`;
    if (!used.has(name)) { names.push(name); used.add(name); }
  }
  return names;
}

export function isGeneratedStripName(name, projectName) {
  return !name || name === 'Untitled Project' || name === projectName
    || /^(?:Strip \d+|Line(?: \d+)?|Circle(?: \d+)?|Rectangle(?: \d+)?)$/.test(name);
}

// Place small screen-sized cards near their own midpoints. Try the closest
// lanes first and omit an annotation when a crowded viewport has no room.
export function placeStripLabels(strips, scale, bounds, selectedId = null) {
  const placed = [];
  const width = 148 * scale;
  const height = 32 * scale;
  const gap = 4 * scale;
  for (const strip of strips) {
    const mid = strip.pixels[Math.floor(strip.pixels.length / 2)];
    let box;
    for (const lane of [-1, 1, -2, 2, -3, 3, -4, 4, -5, 5, -6, 6]) {
      const x = Math.max(bounds.x + gap, Math.min(mid.x - width / 2, bounds.x + bounds.w - width - gap));
      let y = mid.y + (lane < 0 ? lane * (height + gap) - 8 * scale : (lane - 1) * (height + gap) + 8 * scale);
      if (strip.id === selectedId) y = Math.max(bounds.y + gap, Math.min(y, bounds.y + bounds.h - height - gap));
      const candidate = { x, y, width, height };
      if (y < bounds.y + gap || y + height > bounds.y + bounds.h - gap) continue;
      if (placed.some(p => x < p.x + width + gap && x + width + gap > p.x && y < p.y + height + gap && y + height + gap > p.y)) continue;
      box = candidate; break;
    }
    if (box) placed.push({ ...box, strip });
  }
  return placed;
}

// Palette colors may arrive from the card with shorter decimal spellings.
export function stripColorKey(color) {
  const value = String(color || '').trim().toLowerCase();
  return value.startsWith('oklch(')
    ? value.replace(/-?(?:\d*\.)?\d+/g, number => String(Number(number))).replace(/\s+/g, ' ')
    : value;
}
