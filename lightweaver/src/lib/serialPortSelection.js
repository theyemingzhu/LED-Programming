function isConnectedUsbPort(port) {
  if (!port || port.connected === false || typeof port.getInfo !== 'function') return false;
  try {
    const info = port.getInfo();
    return Number.isInteger(info?.usbVendorId) && info.usbVendorId > 0
      && Number.isInteger(info?.usbProductId) && info.usbProductId > 0;
  } catch {
    return false;
  }
}

export async function selectEspSerialPort({ suppliedPort = null, serial = navigator.serial } = {}) {
  if (suppliedPort) return suppliedPort;
  if (typeof serial?.getPorts === 'function') {
    try {
      // Keep the click's transient user activation available for the ordinary
      // chooser if enumeration stalls or does not identify one USB port.
      let timer;
      const authorized = await Promise.race([
        serial.getPorts(),
        new Promise(resolve => { timer = setTimeout(() => resolve([]), 500); }),
      ]).finally(() => clearTimeout(timer));
      const eligible = Array.isArray(authorized) ? authorized.filter(isConnectedUsbPort) : [];
      if (eligible.length === 1) return eligible[0];
    } catch { /* The normal chooser still owns permission requests. */ }
  }
  return serial.requestPort();
}
