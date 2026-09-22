// Prototype fixtures use the same Layout-shaped inputs as the accepted
// scene-expression targeting adapter: strips, sectionFamilies, layerGroups,
// and wiring. Artwork coordinates remain owned by Layout.

const ribbonStrips = [
  makeStrip('ribbon-1', 'Left section', 0.08, 0.36, -0.06),
  makeStrip('ribbon-2', 'Center section', 0.36, 0.64, 0.05),
  makeStrip('ribbon-3', 'Right section', 0.64, 0.92, -0.035),
];

const mandalaStrips = [
  makeCircle('center', 'Center', 0.5, 0.5, 0.07, 26, 0),
  makeCircle('inner-ring', 'Inner ring', 0.5, 0.5, 0.19, 52, 0.35),
  makeCircle('outer-ring', 'Outer ring', 0.5, 0.5, 0.32, 72, -0.2),
  makePetals('petals-ns', 'North · south petals', [0, Math.PI], 0.5, 0.5),
  makePetals('petals-ew', 'East · west petals', [Math.PI / 2, Math.PI * 1.5], 0.5, 0.5),
];

export const FIXTURES = {
  strip: makeFixture({
    id: 'fixture-three-section-strip',
    name: 'Gallery ribbon',
    kind: 'strip',
    description: 'One physical strip divided in Layout',
    strips: ribbonStrips,
    sectionFamilies: [{
      id: 'gallery-ribbon',
      parentId: 'ribbon-1',
      parentName: 'All sections',
      memberIds: ribbonStrips.map(strip => strip.id),
    }],
    layerGroups: [],
  }),
  mandala: makeFixture({
    id: 'fixture-five-area-mandala',
    name: 'Atrium mandala',
    kind: 'mandala',
    description: 'Five named areas from Layout',
    strips: mandalaStrips,
    sectionFamilies: [],
    layerGroups: [
      { groupId: 'rings', name: 'Rings', type: 'strip', members: [{ stripId: 'inner-ring' }, { stripId: 'outer-ring' }] },
      { groupId: 'petals', name: 'Petals', type: 'strip', members: [{ stripId: 'petals-ns' }, { stripId: 'petals-ew' }] },
    ],
  }),
};

function makeFixture({ id, name, kind, description, strips, sectionFamilies, layerGroups }) {
  return {
    id, name, kind, description,
    layout: {
      strips,
      sectionFamilies,
      layerGroups,
      wiring: makeWiring(strips),
    },
  };
}

function makeWiring(strips) {
  return {
    version: 1,
    locked: false,
    verified: false,
    outputs: [{ id: 'out-1', pin: 16, runIds: strips.map(strip => `run-${strip.id}`) }],
    runs: strips.map(strip => ({
      id: `run-${strip.id}`,
      type: 'strip',
      source: { stripId: strip.id, from: 0, to: strip.pixelCount - 1 },
      physicalDirection: 'source-forward',
    })),
  };
}

function withPixels(id, name, points) {
  return {
    id,
    name,
    pixelCount: points.length,
    pixels: points.map(point => ({ x: point.x, y: point.y })),
    pts: points,
  };
}

function makeStrip(id, name, start, end, waveOffset) {
  const count = 44;
  return withPixels(id, name, Array.from({ length: count }, (_, index) => {
    const p = index / (count - 1);
    const x = start + (end - start) * p;
    return { x, y: 0.5 + Math.sin(x * Math.PI * 4) * 0.09 + waveOffset, p };
  }));
}

function makeCircle(id, name, cx, cy, radius, count, phase) {
  return withPixels(id, name, Array.from({ length: count }, (_, index) => {
    const p = index / count;
    const angle = p * Math.PI * 2 + phase;
    return { x: cx + Math.cos(angle) * radius, y: cy + Math.sin(angle) * radius, p };
  }));
}

function makePetals(id, name, angles, cx, cy) {
  const points = [];
  angles.forEach((angle, petalIndex) => {
    const count = 38;
    for (let index = 0; index < count; index += 1) {
      const p = index / (count - 1);
      const curve = Math.sin(p * Math.PI);
      const radius = 0.22 + p * 0.22;
      const side = (petalIndex % 2 ? -1 : 1) * curve * 0.075;
      points.push({
        x: cx + Math.cos(angle) * radius + Math.cos(angle + Math.PI / 2) * side,
        y: cy + Math.sin(angle) * radius + Math.sin(angle + Math.PI / 2) * side,
        p: points.length / (angles.length * count - 1),
      });
    }
  });
  return withPixels(id, name, points);
}

export function fixtureStrips(fixture) {
  return fixture.layout.strips.map(strip => ({
    id: strip.id,
    name: strip.name,
    brightness: 1,
    speed: 1,
    pts: strip.pts.map(point => ({ ...point, stripProgress: point.p })),
  }));
}
