import test from 'node:test';
import assert from 'node:assert/strict';

import { mapSceneExpressionPreviewFrame } from './sceneExpressionFrame.js';
import { compileWiring } from './wiringCompiler.js';

const dividedStrips = [
  { id: 'ribbon-1', pixelCount: 2, pixels: [{ x: 1, y: 0 }, { x: 2, y: 0 }] },
  { id: 'ribbon-2', pixelCount: 2, pixels: [{ x: 3, y: 0 }, { x: 4, y: 0 }] },
  { id: 'ribbon-3', pixelCount: 2, pixels: [{ x: 5, y: 0 }, { x: 6, y: 0 }] },
];

const dividedWiring = compileWiring({
  strips: dividedStrips,
  wiring: {
    version: 1,
    outputs: [{ id: 'out', pin: 16, runIds: ['run-ribbon-3', 'run-ribbon-1', 'gap', 'run-ribbon-2'] }],
    runs: [
      { id: 'run-ribbon-1', type: 'strip', source: { stripId: 'ribbon-1', from: 0, to: 1 }, physicalDirection: 'source-forward' },
      { id: 'run-ribbon-2', type: 'strip', source: { stripId: 'ribbon-2', from: 0, to: 1 }, physicalDirection: 'source-forward' },
      { id: 'run-ribbon-3', type: 'strip', source: { stripId: 'ribbon-3', from: 0, to: 1 }, physicalDirection: 'source-forward' },
      { id: 'gap', type: 'inactive', count: 1 },
    ],
  },
});
assert.equal(dividedWiring.ok, true);

const dividedSegments = dividedStrips.map(strip => ({
  id: `strip:${strip.id}`,
  pixels: strip.pixels.map((pixel, sourceLed) => ({ ...pixel, stripId: strip.id, sourceLed })),
}));

test('maps PatternPreview frame colors through reordered divided-strip wiring and writes only inactive slots black', () => {
  const result = mapSceneExpressionPreviewFrame({
    framePixels: [
      { r: 1, g: 2, b: 3 }, { r: 4, g: 5, b: 6 },
      { r: 7, g: 8, b: 9 }, { r: 10, g: 11, b: 12 },
      { r: 13, g: 14, b: 15 }, { r: 16, g: 17, b: 18 },
    ],
    segments: dividedSegments,
    compiledWiring: dividedWiring,
  });
  assert.equal(result.ok, true);
  assert.deepEqual(result.pixels, [
    '0D0E0F', '101112', '010203', '040506', '000000', '070809', '0A0B0C',
  ]);
});

test('honors a mandala group with a reversed, seam-rotated physical run without using artwork coordinates', () => {
  const strips = [
    { id: 'petal-a', pixelCount: 2, pixels: [{ x: 30, y: 4 }, { x: 31, y: 5 }] },
    { id: 'petal-b', pixelCount: 2, pixels: [{ x: -30, y: 4 }, { x: -31, y: 5 }] },
  ];
  const compiledWiring = compileWiring({
    strips,
    wiring: {
      version: 1,
      outputs: [{ id: 'out', pin: 16, runIds: ['b', 'a'] }],
      runs: [
        { id: 'a', type: 'strip', source: { stripId: 'petal-a', from: 0, to: 1 }, physicalDirection: 'source-reverse', seamLed: 1 },
        { id: 'b', type: 'strip', source: { stripId: 'petal-b', from: 0, to: 1 }, physicalDirection: 'source-forward' },
      ],
    },
  });
  assert.equal(compiledWiring.ok, true);
  const result = mapSceneExpressionPreviewFrame({
    framePixels: [{ r: 1, g: 0, b: 0 }, { r: 2, g: 0, b: 0 }, { r: 3, g: 0, b: 0 }, { r: 4, g: 0, b: 0 }],
    segments: [
      { id: 'petal-a', pixels: [{ stripId: 'petal-a', sourceLed: 0 }, { stripId: 'petal-a', sourceLed: 1 }] },
      { id: 'petal-b', pixels: [{ stripId: 'petal-b', sourceLed: 0 }, { stripId: 'petal-b', sourceLed: 1 }] },
    ],
    compiledWiring,
  });
  assert.equal(result.ok, true);
  assert.deepEqual(result.pixels, ['030000', '040000', '020000', '010000']);
});

test('rejects incomplete or duplicate source maps and malformed preview RGB rather than padding or truncating', () => {
  const missing = mapSceneExpressionPreviewFrame({
    framePixels: [{ r: 1, g: 2, b: 3 }],
    segments: [{ pixels: [{ stripId: 'a', sourceLed: 0 }] }],
    compiledWiring: { ok: true, pixels: [{ stripId: 'a', sourceLed: 0 }, { stripId: 'a', sourceLed: 1 }] },
  });
  assert.equal(missing.ok, false);
  assert.ok(missing.errors.some(error => error.code === 'rendered-source-missing'));

  const duplicate = mapSceneExpressionPreviewFrame({
    framePixels: [{ r: 1, g: 2, b: 3 }, { r: 4, g: 5, b: 6 }],
    segments: [{ pixels: [{ stripId: 'a', sourceLed: 0 }, { stripId: 'a', sourceLed: 0 }] }],
    compiledWiring: { ok: true, pixels: [{ stripId: 'a', sourceLed: 0 }] },
  });
  assert.equal(duplicate.ok, false);
  assert.ok(duplicate.errors.some(error => error.code === 'rendered-source-duplicate'));

  const malformed = mapSceneExpressionPreviewFrame({
    framePixels: [{ r: 256, g: 0, b: 0 }],
    segments: [{ pixels: [{ stripId: 'a', sourceLed: 0 }] }],
    compiledWiring: { ok: true, pixels: [{ stripId: 'a', sourceLed: 0 }] },
  });
  assert.equal(malformed.ok, false);
  assert.ok(malformed.errors.some(error => error.code === 'frame-rgb-invalid'));
});

test('maps a 4,096-pixel frame exactly once without changing caller-owned frame data', () => {
  const count = 4096;
  const framePixels = Array.from({ length: count }, (_, index) => ({ r: index & 255, g: (index * 3) & 255, b: (index * 7) & 255 }));
  const result = mapSceneExpressionPreviewFrame({
    framePixels,
    segments: [{ id: 'large', pixels: Array.from({ length: count }, (_, sourceLed) => ({ stripId: 'large', sourceLed })) }],
    compiledWiring: { ok: true, pixels: Array.from({ length: count }, (_, sourceLed) => ({ stripId: 'large', sourceLed })) },
  });
  assert.equal(result.ok, true);
  assert.equal(result.pixels.length, count);
  assert.equal(result.pixels[0], '000000');
  assert.equal(result.pixels.at(-1), 'FFFD F9'.replace(' ', ''));
  assert.deepEqual(framePixels[1], { r: 1, g: 3, b: 7 });
});
