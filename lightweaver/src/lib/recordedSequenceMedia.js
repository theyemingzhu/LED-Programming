// Binary recordings live outside project JSON. The project keeps an immutable
// SHA-256 reference; every write is read back before it can be referenced.
const DB_NAME = 'lightweaver-recorded-media-v1';
const STORE = 'media';
const HASH = /^[a-f0-9]{64}$/;
const memoryForNode = new Map();
let databasePromise;

function requestResult(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Recording storage request failed.'));
  });
}

function transactionDone(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error || new Error('Recording storage transaction failed.'));
    transaction.onabort = () => reject(transaction.error || new Error('Recording storage transaction was canceled.'));
  });
}

function database() {
  if (!globalThis.indexedDB?.open) {
    if (typeof window === 'undefined') return Promise.resolve(null);
    throw new Error('This browser cannot store recordings. Export a standalone package instead.');
  }
  if (!databasePromise) databasePromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE, { keyPath: 'sha256' });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Could not open recording storage.'));
  });
  return databasePromise;
}

export async function sha256RecordingBytes(bytes) {
  if (!globalThis.crypto?.subtle) throw new Error('Secure SHA-256 hashing is unavailable.');
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  return [...digest].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

export async function readRecordedMedia(sha256) {
  if (!HASH.test(sha256)) throw new Error('Recording hash is invalid.');
  const db = await database();
  const record = db
    ? await (() => {
        const tx = db.transaction(STORE, 'readonly');
        return requestResult(tx.objectStore(STORE).get(sha256));
      })()
    : memoryForNode.get(sha256);
  if (!record?.bytes) throw new Error('Recorded media is missing from this browser. Import the original project backup or record it again.');
  const bytes = new Uint8Array(record.bytes);
  if (await sha256RecordingBytes(bytes) !== sha256) throw new Error('Recorded media failed SHA-256 readback.');
  return bytes;
}

export async function storeRecordedMedia(bytes, expectedSha256) {
  if (!(bytes instanceof Uint8Array) || !HASH.test(expectedSha256)
    || await sha256RecordingBytes(bytes) !== expectedSha256) throw new Error('Recording bytes do not match the declared SHA-256.');
  const db = await database();
  const copy = bytes.slice();
  if (db) {
    const transaction = db.transaction(STORE, 'readwrite');
    transaction.objectStore(STORE).put({ sha256: expectedSha256, bytes: copy });
    await transactionDone(transaction);
  } else memoryForNode.set(expectedSha256, { sha256: expectedSha256, bytes: copy });
  const confirmed = await readRecordedMedia(expectedSha256);
  if (confirmed.byteLength !== bytes.byteLength) throw new Error('Recorded media storage readback had the wrong byte count.');
  return { kind: 'indexeddb-sha256', sha256: expectedSha256, byteLength: bytes.byteLength };
}

export async function deleteRecordedMedia(sha256) {
  if (!HASH.test(sha256)) return;
  const db = await database();
  if (db) {
    const transaction = db.transaction(STORE, 'readwrite');
    transaction.objectStore(STORE).delete(sha256);
    await transactionDone(transaction);
  } else memoryForNode.delete(sha256);
}
