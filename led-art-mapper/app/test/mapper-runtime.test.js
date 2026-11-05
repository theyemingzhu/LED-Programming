import test from 'node:test';
import assert from 'node:assert/strict';
import { mapperFlagPixel, encodeMapperDiagnostics,decodeMapperDiagnostics } from '../src/mapper-runtime.js';

test('NaN flags retain every mapper channel without changing the RGB wire type',()=>{
  const raw=Float64Array.from([NaN,0,0, 0,NaN,0, NaN,NaN,NaN]);
  assert.deepEqual(mapperFlagPixel(raw,0),{r:1,g:2,b:7});
});
test('bounded diagnostic text/count round-trip and malformed packets are ignored',()=>{
  const encoded=encodeMapperDiagnostics({count:16384,message:'synthetic runtime error'});
  assert.deepEqual(decodeMapperDiagnostics(encoded),{count:16384,message:'synthetic runtime error'});
  assert.equal(encodeMapperDiagnostics({count:1,message:'x'.repeat(100000)}).length,312);
  assert.equal(decodeMapperDiagnostics(new Uint8Array(312)),null);
});
