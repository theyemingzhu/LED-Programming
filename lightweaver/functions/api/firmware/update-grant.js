import {
  createFirmwareUpdateGrantIssuer,
  FirmwareUpdateGrantUnavailableError,
  FirmwareUpdateGrantValidationError,
} from '../library/_shared/firmwareUpdateGrant.js';

const MAX_BODY_BYTES = 4096;
const HEADERS = {
  'cache-control': 'no-store',
  'content-type': 'application/json; charset=utf-8',
  'x-content-type-options': 'nosniff',
};

function json(value, status = 200) {
  return new Response(JSON.stringify(value), { status, headers: HEADERS });
}

function error(status, code, message) {
  return json({ error: { code, message } }, status);
}

class RequestError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

async function readBody(request) {
  if ((request.headers.get('content-type') || '').split(';', 1)[0].trim().toLowerCase() !== 'application/json') {
    throw new RequestError(415, 'invalid_request', 'A JSON request body is required.');
  }
  const tooLarge = () => new RequestError(413, 'payload_too_large', 'The firmware update request is too large.');
  if (Number(request.headers.get('content-length')) > MAX_BODY_BYTES) throw tooLarge();
  const reader = request.body?.getReader();
  const chunks = [];
  let length = 0;
  if (reader) {
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        length += value.byteLength;
        if (length > MAX_BODY_BYTES) {
          await reader.cancel();
          throw tooLarge();
        }
        chunks.push(value);
      }
    } finally {
      reader.releaseLock();
    }
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    const body = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    if (!body || typeof body !== 'object' || Array.isArray(body)
      || Object.keys(body).length !== 1 || typeof body.grantPayload !== 'string') throw new Error();
    return body;
  } catch {
    throw new RequestError(400, 'invalid_request', 'An exact firmware update grant payload is required.');
  }
}

// This endpoint deliberately has no account, cookie, library store, or Access
// dependency. The existing card protocol still requires a signed grant bound to
// its live challenge, card identity, project head, and signed release ticket.
export async function handleFirmwareUpdateGrantPagesRequest(context, issuerOptions) {
  const { request } = context;
  const { method } = request;
  if (method !== 'GET' && method !== 'POST') {
    return error(405, 'method_not_allowed', 'This firmware update route accepts GET or POST.');
  }
  const studioOrigin = new URL(request.url).origin;
  const requestOrigin = request.headers.get('origin');
  if ((method === 'POST' || requestOrigin !== null) && requestOrigin !== studioOrigin) {
    return error(403, 'invalid_origin', 'The firmware update request origin is not allowed.');
  }
  try {
    const issuer = createFirmwareUpdateGrantIssuer(context.env, issuerOptions);
    if (method === 'GET') {
      await issuer.ready();
      return json({ service: 'firmware-update-grant', ready: true });
    }
    const { grantPayload } = await readBody(request);
    return json(await issuer(grantPayload, { studioOrigin }));
  } catch (failure) {
    if (failure instanceof RequestError || failure instanceof FirmwareUpdateGrantValidationError) {
      return error(failure.status, failure.code, failure.message);
    }
    // Never leak signing configuration or turn a service failure into an account
    // challenge. The public caller can retry or use automatic USB recovery.
    const unavailable = new FirmwareUpdateGrantUnavailableError();
    return error(unavailable.status, unavailable.code, 'The automatic firmware update service is unavailable.');
  }
}

export function onRequest(context) {
  return handleFirmwareUpdateGrantPagesRequest(context);
}
