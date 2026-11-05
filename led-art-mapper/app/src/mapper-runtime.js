// Private data queries share the existing bounded RGB frame channel. None of
// these fields are passed to the authored mapper function (12 arguments only).
export const MAPPER_FLAG_QUERY = 'mapper-nan-flags-v1';
export const MAPPER_DIAGNOSTIC_QUERY = 'mapper-diagnostics-v1';
export const MAPPER_DIAGNOSTIC_SAMPLES = 104;

export function mapperFlagPixel(raw, index) {
  const mask = pixel => {
    const offset = pixel * 3;
    return (Number.isNaN(raw[offset]) ? 1 : 0)
      | (Number.isNaN(raw[offset + 1]) ? 2 : 0) | (Number.isNaN(raw[offset + 2]) ? 4 : 0);
  };
  return { r:mask(index*3), g:mask(index*3+1), b:mask(index*3+2) };
}

export function encodeMapperDiagnostics(state) {
  const bytes = new Uint8Array(312);
  const text = new TextEncoder().encode(String(state.message || '').slice(0,240)).slice(0,300);
  const view = new DataView(bytes.buffer);
  view.setUint32(0,state.count >>> 0,true); view.setUint16(4,text.length,true);
  bytes[6]=109; bytes[7]=1; bytes.set(text,8);
  return bytes;
}

export function mapperDiagnosticPixel(bytes,index) {
  return { r:bytes[index*3] || 0, g:bytes[index*3+1] || 0, b:bytes[index*3+2] || 0 };
}

export function decodeMapperDiagnostics(bytes) {
  if(bytes.length !== 312 || bytes[6] !== 109 || bytes[7] !== 1) return null;
  const view = new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
  const length = Math.min(300,view.getUint16(4,true));
  return { count:view.getUint32(0,true),message:new TextDecoder().decode(bytes.subarray(8,8+length)) };
}
