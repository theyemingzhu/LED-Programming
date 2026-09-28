export const ESP_CONNECT_RESET_SEQUENCE = ['default_reset', 'usb_reset', 'no_reset'];
const pendingPortCleanup = new WeakMap();
const UNRELEASED_PORT_MESSAGE = 'USB serial port was not released. Close and reopen the Studio tab, then select the exact card again.';

export function serialPortCleanupMessage(port) {
  return port ? pendingPortCleanup.get(port)?.message || '' : '';
}

export function serialPortCleanupState(port) {
  return port ? pendingPortCleanup.get(port)?.state || '' : '';
}

export function blockSerialPort(port, message = UNRELEASED_PORT_MESSAGE) {
  if (port) pendingPortCleanup.set(port, { message, state: 'failed' });
}

export function quarantineSerialPort(port, cleanup, pendingMessage, failedMessage = UNRELEASED_PORT_MESSAGE) {
  const lease = { message: pendingMessage, state: 'pending' };
  pendingPortCleanup.set(port, lease);
  void cleanup.then(
    () => { if (pendingPortCleanup.get(port) === lease) pendingPortCleanup.delete(port); },
    () => { lease.message = failedMessage; lease.state = 'failed'; },
  );
}

function settledWithin(promise, timeoutMs) {
  if (!(timeoutMs > 0)) return promise.then(value => ({ value }), error => ({ error }));
  return new Promise(resolve => {
    const timer = setTimeout(() => resolve({ timedOut: true }), timeoutMs);
    promise.then(
      value => { clearTimeout(timer); resolve({ value }); },
      error => { clearTimeout(timer); resolve({ error }); },
    );
  });
}

export async function releaseEspTransport(transport, { timeoutMs = 0 } = {}) {
  if (!transport) return true;
  // A timed-out reset/connection owns its own eventual disconnect. Starting
  // another one now would close the port underneath that still-running write.
  if (serialPortCleanupState(transport.device)) return false;
  const disconnecting = Promise.resolve().then(() => transport.disconnect());
  const released = await settledWithin(disconnecting, timeoutMs);
  const port = transport.device;
  if (released.timedOut) {
    if (port) quarantineSerialPort(port, disconnecting, 'USB serial port is still releasing a previous ROM connection. Retry after it clears.');
    return false;
  }
  if (Object.hasOwn(released, 'error')) {
    blockSerialPort(port);
    return false;
  }
  return true;
}

export function makeEspConnectTerminal(onLog) {
  let logLines = [];
  return {
    clean: () => { logLines = []; },
    writeLine: line => {
      logLines.push(line);
      onLog?.(line);
    },
    write: chunk => {
      if (logLines.length === 0) logLines.push('');
      logLines[logLines.length - 1] += chunk;
      onLog?.(chunk);
    },
    getLines: () => logLines.slice(),
  };
}

export async function connectEspWithResetSequence({
  port,
  createTransport,
  createLoader,
  resetModes = ESP_CONNECT_RESET_SEQUENCE,
  onAttempt,
  attemptTimeoutMs = 0,
  disconnectTimeoutMs = 0,
}) {
  const pending = serialPortCleanupMessage(port);
  if (pending) throw new Error(pending);
  let lastError = null;

  for (const mode of resetModes) {
    const attempt = { mode };
    onAttempt?.(attempt);
    const transport = createTransport(port, attempt);
    const loader = createLoader({ transport, attempt });

    const connecting = Promise.resolve().then(() => loader.main(mode));
    const result = await settledWithin(connecting, attemptTimeoutMs);
    if (result.timedOut) {
      // The loader can resume after a native open/write stalls. Keep this port
      // unavailable until it settles and is released; another reset must not
      // overlap that late operation.
      quarantineSerialPort(port, connecting.catch(() => {}).then(() => transport?.disconnect?.()),
        'USB serial port is still finishing a previous ROM connection. Retry after it clears.');
      throw new Error('USB ROM connection timed out; the selected port is still finishing. Retry after cleanup.');
    }
    if (!Object.hasOwn(result, 'error')) return { loader, transport, chip: result.value, resetMode: mode };
    lastError = result.error;
    const disconnecting = Promise.resolve().then(() => transport?.disconnect?.());
    const released = await settledWithin(disconnecting, disconnectTimeoutMs);
    if (released.timedOut) {
      quarantineSerialPort(port, disconnecting,
        'USB serial port is still releasing a previous ROM connection. Retry after it clears.');
      throw new Error('USB ROM release timed out; the selected port is still releasing. Retry after cleanup.');
    }
    if (Object.hasOwn(released, 'error')) {
      blockSerialPort(port);
      throw new Error(`USB ROM release failed: ${released.error?.message || 'serial port could not be closed'}`);
    }
  }

  const detail = lastError?.message ? `: ${lastError.message}` : '';
  throw new Error(`Failed to connect with the device${detail}`);
}
