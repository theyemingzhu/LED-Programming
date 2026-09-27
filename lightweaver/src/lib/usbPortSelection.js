// Chrome throws this when the owner dismisses the USB picker without choosing
// a port. That is a cancel, not a card failure — never dump the raw
// `requestPort` exception into a notice.
export function isUsbPortSelectionCancelled(error) {
  const name = String(error?.name || '');
  const message = String(error?.message || error || '');
  return name === 'NotFoundError' || /no port selected/i.test(message);
}
