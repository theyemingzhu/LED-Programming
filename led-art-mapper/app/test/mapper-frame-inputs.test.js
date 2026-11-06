import test from 'node:test';
import assert from 'node:assert/strict';
import { mapperFrameInputs } from '../src/mapper-frame-inputs.js';

test('chained pixels use root clock and pattern but preserve leaf ID/progress and physical fallback',()=>{
  const root=()=>{},leaf=()=>{},params={speed:2},palette=[{r:1,g:0,b:0}];
  const contexts=new Map([['root',{fn:root,st:{t:9,time:.3},params}],['leaf',{fn:leaf,st:{t:1,time:.1},params:{}}]]);
  const points=[{index:8,nx:.2,ny:.8,stripId:'leaf',stripIndex:2,stripTotal:5,chainRootId:'root',chainIndex:6,chainTotal:12},
    {index:20,nx:1,ny:0,stripId:'leaf',stripIndex:0,stripTotal:1}];
  const rows=mapperFrameInputs(points,contexts,palette,.25,.75);
  assert.equal(rows[0].fn,root);
  assert.deepEqual(rows[0].args,[6,.2,.8,9,.3,12,palette,.25,.75,params,'leaf',.5]);
  assert.equal(rows[1].fn,leaf);
  assert.deepEqual(rows[1].args,[20,1,0,1,.1,2,palette,.25,.75,{},'leaf',0]);
});
