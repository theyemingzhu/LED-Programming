import React, { useEffect, useState, useSyncExternalStore } from 'react';
import {
  MAX_VISIBLE_NOTICES,
  dismissNotice,
  noticeIsDismissible,
  readNotices,
  subscribeToNotices,
} from '../lib/noticeLayer.js';

// The floating stack. Mounted once, in app.jsx, as a sibling of the screen —
// so it is outside every screen's document flow and no notice can move a
// pixel of interface.
//
// It docks bottom-left, and the reason is the button rows: every Studio
// screen clusters its actions top-right (`.pm-actions`), so a notice docked
// bottom-left can never cover the control that produced it. It rises out of
// the status bar, which already reads as the machine reporting on itself.
//
// The newest notice renders LAST so it sits nearest the status bar, with
// older ones riding up above it and the overflow count at the top. New
// information therefore always arrives at the same spot on screen.

function NoticeCard({ notice }) {
  const dismissible = noticeIsDismissible(notice);
  return (
    <div
      className={`lw-notice is-${notice.tone}`}
      data-testid={notice.testId || undefined}
      data-notice-tone={notice.tone}
      data-notice-source={notice.source || undefined}
      role={notice.tone === 'error' || notice.tone === 'warning' ? 'alert' : 'status'}
      aria-live={notice.tone === 'error' ? 'assertive' : 'polite'}
    >
      {notice.tone === 'progress' && <span className="lw-notice-spinner" aria-hidden="true" />}
      {/* Copy and actions share one wrapping row. With one short action the
          button sits beside the text; with two or three it wraps onto its own
          line rather than forcing the card wider than the layer — which is
          what happened the first time this was built, and put a notice past
          the right edge of its own stack. */}
      <div className="lw-notice-main">
        <div className="lw-notice-copy">
          {notice.title && <strong>{notice.title}</strong>}
          {notice.body && <span>{notice.body}</span>}
        </div>
        {notice.actions.length > 0 && (
          <div className="lw-notice-actions">
            {notice.actions.map((action, index) => (
              <button
                key={action.testId || action.label}
                type="button"
                // The first action is the recommended one. The rest stay quiet,
                // so a two-way question reads as a question and not as two
                // equally urgent demands.
                className={index === 0 ? 'lw-notice-act is-primary' : 'lw-notice-act'}
                data-testid={action.testId || undefined}
                disabled={action.disabled}
                onClick={() => {
                  // An action decides its own fate: most resolve the condition
                  // that raised the notice, and the publisher retracts by key.
                  action.onSelect();
                }}
              >
                {action.label}
              </button>
            ))}
          </div>
        )}
      </div>
      {dismissible && (
        <button
          type="button"
          className="lw-notice-close"
          // "Dismiss notice" verbatim: it is the accessible name every
          // workspace-notice spec drives the close button by, and the button
          // sits inside the notice's own live region, so a screen reader
          // already has the message for context.
          aria-label="Dismiss notice"
          onClick={() => dismissNotice(notice.id, { notify: true })}
        >
          ×
        </button>
      )}
    </div>
  );
}

// The status bar is 32px tall by its stylesheet and 91px on a phone, because
// its contents wrap. Docking the stack against the CSS number put a notice
// 51px inside the bar on a 375px viewport — measured, not guessed. So the bar
// is measured live instead: this is the one number the layer cannot assume.
function useStatusBarHeight() {
  const [height, setHeight] = useState(32);
  useEffect(() => {
    const bar = document.querySelector('.status-bar');
    if (!bar) return undefined;
    const read = () => setHeight(Math.round(bar.getBoundingClientRect().height) || 32);
    read();
    if (typeof ResizeObserver !== 'function') {
      window.addEventListener('resize', read);
      return () => window.removeEventListener('resize', read);
    }
    const observer = new ResizeObserver(read);
    observer.observe(bar);
    return () => observer.disconnect();
  }, []);
  return height;
}

export function NoticeLayer() {
  const notices = useSyncExternalStore(subscribeToNotices, readNotices, readNotices);
  const statusBarHeight = useStatusBarHeight();
  if (!notices.length) return null;
  // Newest wins the visible slots, and being last in DOM order it paints
  // closest to the status bar — so "newest" and "nearest" agree.
  const visible = notices.slice(-MAX_VISIBLE_NOTICES);
  const hidden = notices.length - visible.length;
  return (
    <div
      className="lw-notice-layer"
      data-testid="notice-layer"
      style={{ '--lw-statusbar-h': `${statusBarHeight}px` }}
    >
      {hidden > 0 && (
        <p className="lw-notice-overflow" data-testid="notice-layer-overflow">
          {hidden} earlier {hidden === 1 ? 'message' : 'messages'}
        </p>
      )}
      {visible.map(notice => <NoticeCard key={notice.id} notice={notice} />)}
    </div>
  );
}

export default NoticeLayer;
