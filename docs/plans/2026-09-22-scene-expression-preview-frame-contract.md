# Scene-expression preview frame contract

`mapSceneExpressionPreviewFrame` in
`lightweaver/src/lib/sceneExpressionFrame.js` is the pure final mapping step
between the scene editor's rendered preview and a card frame stream.

```js
const mapped = mapSceneExpressionPreviewFrame({
  framePixels,       // PatternPreview onFrame(pixels)
  segments,          // the same preview strips passed to PatternPreview
  compiledWiring,    // current successful compileWiring result
});

if (mapped.ok) stream.push(mapped.pixels);
```

`PatternPreview` calls `onFrame(pixels)` with a flat ordered array of RGB byte
objects. The matching `buildPatternPreviewSegments` result has the same order
and supplies `{ stripId, sourceLed }` on each `segment.pixels` entry. The
mapper uses those stable source identities, then walks `compiledWiring.pixels`
in its existing physical order. It returns uppercase `RRGGBB` strings, the
array shape consumed by `createCardFrameStream().push()`.

The mapping is exact: every rendered source LED must occur once in active
compiled output, and every active physical source must occur once in the
rendered metadata. It rejects malformed RGB, source metadata, duplicate source
coverage, missing source coverage, and a frame/metadata count mismatch. No
coordinates are consulted and no black padding or truncation is performed.

The compiler's explicit `inactive: true` pixels are address-space slots, not
source LEDs. They become `000000` in the returned frame; all other output
positions require a valid source mapping. Inputs are read-only.
