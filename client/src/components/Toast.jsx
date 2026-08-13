import { useState, useEffect, useRef, useCallback } from 'react';

// Pairs with <Toast toast={toast} />. Wraps each message in an incrementing
// id so calling showToast() with the same text twice in a row (e.g. logging
// the same food again) still re-triggers the animation instead of being a
// no-op because the string didn't change.
export function useToast() {
  const [toast, setToast] = useState(null); // { text, id } | null
  const nextId = useRef(0);
  const showToast = useCallback((text) => {
    nextId.current += 1;
    setToast({ text, id: nextId.current });
  }, []);
  return [toast, showToast];
}

// Shared floating snackbar. Pass `toast` from useToast() (or null to render
// nothing). Handles its own show timer and animates back out before
// unmounting — callers don't need to manage visibility themselves.
export default function Toast({ toast, duration = 2500 }) {
  const [rendered, setRendered] = useState(false);
  const [visible, setVisible] = useState(false);
  const hideTimer = useRef(null);
  const lastText = useRef('');

  useEffect(() => {
    if (!toast) return;
    lastText.current = toast.text;
    setRendered(true);
    clearTimeout(hideTimer.current);
    // Double rAF so the initial (hidden) styles paint before the transition
    // to visible starts — otherwise the browser coalesces both states into
    // one frame and it never appears to animate in.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => setVisible(true));
    });
    hideTimer.current = setTimeout(() => setVisible(false), duration);
    return () => clearTimeout(hideTimer.current);
  }, [toast, duration]);

  if (!rendered) return null;

  return (
    <div
      className={`toast-shell${visible ? ' in' : ''}`}
      role="status"
      onTransitionEnd={e => {
        if (e.propertyName === 'opacity' && !visible) setRendered(false);
      }}
    >
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="20,6 9,17 4,12" />
      </svg>
      {lastText.current}
    </div>
  );
}
