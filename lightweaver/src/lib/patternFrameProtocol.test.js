import { test } from 'node:test';
import assert from 'node:assert/strict';
import { packPatternFrameJob, unpackPatternSample } from './patternFrameProtocol.js';
import { compile, evalPixel } from './patterns.js';

const source = 'return {r: index, g: stripProgress * 255, b: reflectionProgress * 255};';
const sample = args => ({ source: 0, args });

test('packed fields reproduce native pixel argument defaults and exact RGB', () => {
  const inputs = [[], [3], [3, .2, .4, 2, .7, 12, [], .3, .5, {}, 'strip-a', .8, .1, .2, .3,
    { reflectionProgress: .4, kaleidoscopeProgress: .6, reflectionDistance: .8, reflectionSegment: 2, reflectionPoint: { x: .1, y: .9 }, isReflectionPoint: true }],
    [3, NaN, Infinity, null, undefined, 12, [], 0, 0, {}, '', null, undefined, null, 0, { reflectionPoint: false }]];
  const packed = packPatternFrameJob({ sources: [source], samples: inputs.map(sample) });
  const compiled = compile(source).fn;
  inputs.forEach((args, index) => {
    const decoded = unpackPatternSample(packed, index);
    let native;
    evalPixel((...values) => { native = values; return 0; }, ...args);
    assert.deepEqual(decoded, native);
    assert.deepEqual(evalPixel(() => compiled(...decoded)), evalPixel(compiled, ...args));
  });
});

test('shared palettes and params appear once per payload, preserving identity and mutation order', () => {
  const palette = [{ r: .1, g: .2, b: .3 }], params = { amount: .5 };
  const make = i => sample([i, .1, .2, 1, .5, 8000, palette, .3, .4, params, 'strip', i / 8000]);
  const packed = packPatternFrameJob({ sources: [source], samples: Array.from({ length: 8000 }, (_, i) => make(i)) });
  assert.equal(packed.values.length, 3, 'palette, params and strip ID are the only table values');
  const first = unpackPatternSample(packed, 0), last = unpackPatternSample(packed, 7999);
  assert.equal(first[6], last[6]); assert.equal(first[9], last[9]);
  first[9].amount = .8; assert.equal(last[9].amount, .8);
  assert.ok(packed.transportBytes < 2_000_000, String(packed.transportBytes));
});

test('validates source/sample/index budgets before packing and bounds value-table transport', () => {
  assert.throws(() => packPatternFrameJob({ sources: [source], samples: Array(32001).fill(sample([])) }), /budget/);
  assert.throws(() => packPatternFrameJob({ sources: [source], samples: [{ source: 1, args: [] }] }), /budget/);
  assert.throws(() => packPatternFrameJob({ sources: ['a'.repeat(65537)], samples: [] }), /budget/);
  assert.throws(() => packPatternFrameJob({ sources: [source], samples: [sample([0, 0, 0, 0, 0, 0, [], 0, 0, { tooLarge: 'a'.repeat(8_000_000) }])] }), /budget/);
});

test('wire buffers transfer ownership and round-trip without object-per-pixel payloads', () => {
  const packed = packPatternFrameJob({ sources: [source], samples: [sample([1, .2, .3])] });
  const received = structuredClone(packed, { transfer: [packed.numbers.buffer, packed.tags.buffer, packed.sourceIndices.buffer] });
  assert.equal(packed.numbers.byteLength, 0); assert.equal(packed.tags.byteLength, 0);
  assert.deepEqual(unpackPatternSample(received, 0).slice(0, 3), [1, .2, .3]);
  assert.equal(received.samples, undefined);
});

test('explicit null reflection retains the existing dim-red runtime error without invoking source', () => {
  const args = [1, 0, 0, 0, 0, 1, [], 0, 0, {}, 0, 0, 0, 0, 0, null];
  assert.deepEqual(evalPixel(compile('return [0, 1, 0];').fn, ...args), { r: 35, g: 0, b: 0 });
  const packed = packPatternFrameJob({ sources: ['return [0, 1, 0];'], samples: [sample(args)] });
  assert.equal(packed.sourceIndices[0], 255);
});

test('full 32000-sample boundary remains supported by the packed allocation budget', () => {
  const packed = packPatternFrameJob({ sources: [source], samples: Array.from({ length: 32000 }, (_, i) => sample([i])) });
  assert.equal(packed.sampleCount, 32000);
  assert.ok(packed.transportBytes < 8_000_000);
  assert.equal(unpackPatternSample(packed, 31999)[0], 31999);
});

test('fixed legacy dialect ignores modern reflection fields and keeps its 15-argument contract', () => {
  const args = [1, 0, 0, 0, 0, 1, [], 0, 0, {}, 0, 0, 0, 0, 0, null];
  const packed = packPatternFrameJob({ sources: ['return 0;'], samples: [sample(args)] }, { argumentCount: 15 });
  assert.equal(packed.sourceIndices[0], 0, 'legacy never reads the six modern reflection arguments');
  assert.deepEqual(unpackPatternSample(packed, 0).slice(0,15), args.slice(0,15));
  assert.throws(() => packPatternFrameJob({ sources:[source],samples:[] }, {argumentCount:16}), /dialect/);
});

test('fixed mapper dialect keeps 12 actual arguments and supports its bounded 256 section sources',()=>{
  const sources=Array.from({length:256},(_,i)=>`return {r:${i},g:0,b:0};`);
  const args=[1,0,0,0,0,1,[],0,0,{},0,0,'private-query',2];
  const packed=packPatternFrameJob({sources,samples:[{source:255,args}]},{argumentCount:12});
  assert.equal(packed.sourceIndices[0],255);
  assert.deepEqual(unpackPatternSample(packed,0).slice(0,12),args.slice(0,12));
  assert.throws(()=>packPatternFrameJob({sources,samples:[]}),/budget/);
});
