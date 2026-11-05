import { createPatternFrameService } from '../../../lightweaver/src/lib/patternFrameIsolation.js';
import { getCompiledPatternSource } from './patterns.js';
import { MAPPER_FLAG_QUERY, MAPPER_DIAGNOSTIC_QUERY, MAPPER_DIAGNOSTIC_SAMPLES, decodeMapperDiagnostics } from './mapper-runtime.js';

/** One bounded frame at a time. Frozen previews consume returned data only. */
export function createMapperPatternRunner() {
  let service=null,pending=null,generation=0,disposed=false;
  function invalidate() {
    generation++; pending=null; service?.dispose(); service=null;
  }
  return {
    get busy(){return pending!==null;},
    invalidate,
    dispose(){invalidate();disposed=true;},
    async render(rows) {
      if(disposed)throw new Error('Mapper frame owner disposed.');
      if(pending)throw new Error('Mapper frame already pending.');
      if(rows.length>16384)throw new Error('Mapper frame exceeds the 16384 LED budget.');
      const sources=[],byFunction=new Map(),samples=[],rowIndices=[];
      const colors=rows.map(()=>({r:0,g:0,b:0}));
      for(let index=0;index<rows.length;index++) {
        const {fn,args}=rows[index];if(!fn)continue;
        if(!byFunction.has(fn)) {
          const code=getCompiledPatternSource(fn);
          if(code==null)throw new Error('Mapper callback has no isolated source.');
          byFunction.set(fn,sources.length);sources.push(code);
        }
        samples.push({source:byFunction.get(fn),args});rowIndices.push(index);
      }
      if(!samples.length)return {colors,diagnostics:null,generation};
      const count=samples.length,flagSamples=Math.ceil(count/3);
      const query=(kind,index)=>({source:0,args:[...Array(12),kind,index]});
      for(let index=0;index<flagSamples;index++)samples.push(query(MAPPER_FLAG_QUERY,index));
      for(let index=0;index<MAPPER_DIAGNOSTIC_SAMPLES;index++)samples.push(query(MAPPER_DIAGNOSTIC_QUERY,index));
      // 16384 real + 5462 flags + 104 diagnostics remains below the shared
      // 32000-sample limit, including the full supported project geometry.
      const token={};pending=token;const currentGeneration=generation;
      if(!service)service=createPatternFrameService({dialect:'mapper'});
      try {
        const bytes=await service.render({sources,samples});
        if(pending!==token||generation!==currentGeneration)throw new Error('Mapper frame cancelled.');
        const flags=bytes.subarray(count*3,(count+flagSamples)*3);
        for(let index=0;index<count;index++) {
          const offset=index*3,mask=flags[index];
          colors[rowIndices[index]]={r:mask&1?NaN:bytes[offset],g:mask&2?NaN:bytes[offset+1],b:mask&4?NaN:bytes[offset+2]};
        }
        return {colors,diagnostics:decodeMapperDiagnostics(bytes.subarray((count+flagSamples)*3)),generation};
      } finally {if(pending===token)pending=null;}
    },
  };
}
