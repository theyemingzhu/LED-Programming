export function activateStackCardControl(event, controlSelector) {
  if (event.defaultPrevented || event.target.closest?.('a, button, input, label, select, textarea, summary, [contenteditable], [role="button"], [role="link"]')) return;
  const control = event.currentTarget.querySelector(controlSelector);
  if (!control || control.disabled) return;
  control.focus({ preventScroll: true });
  control.click();
}
