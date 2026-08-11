import { useState, useRef } from 'react';

const CLOSE_DRAG_PX = 120;        // non-expandable: how far down before it counts as "let go to close"
const CLOSE_VH_BELOW_COLLAPSED = 18; // expandable: how far below the collapsed height before it closes instead of snapping back

// Shared bottom-sheet shell used across the app: floating X button, a floating
// drag handle above the sheet, and drag-to-dismiss. Sheets with more content
// than fits (expandable) can also be dragged up to reveal more; sheets sized
// to their content (the default) only drag down to close.
export default function BottomSheet({
  onClose,
  onBackdropClick,
  title,
  children,
  expandable = false,
  collapsedVh = 60,
  expandedVh = 88,
  maxWidth = 520,
}) {
  const [heightVh, setHeightVh] = useState(collapsedVh);
  const [translateY, setTranslateY] = useState(0);
  const [dragging, setDragging] = useState(false);
  const dragRef = useRef(null);

  function handleStart(e) {
    const t = e.touches[0];
    dragRef.current = { startY: t.clientY, moved: false };
  }

  function handleMove(e) {
    const d = dragRef.current;
    if (!d) return;
    const t = e.touches[0];
    const dy = t.clientY - d.startY;
    if (Math.abs(dy) > 6) d.moved = true;
    setDragging(true);

    if (expandable) {
      const dyVh = (dy / window.innerHeight) * 100;
      setHeightVh(prev => {
        const next = prev - dyVh;
        return Math.max(collapsedVh - CLOSE_VH_BELOW_COLLAPSED - 5, Math.min(expandedVh + 4, next));
      });
    } else {
      setTranslateY(prev => Math.max(0, prev + dy));
    }
    d.startY = t.clientY;
  }

  function handleEnd() {
    const d = dragRef.current;
    dragRef.current = null;
    setDragging(false);
    if (!d) return;

    if (expandable) {
      const mid = (collapsedVh + expandedVh) / 2;
      if (!d.moved) {
        setHeightVh(prev => (prev >= mid ? collapsedVh : expandedVh));
        return;
      }
      setHeightVh(prev => {
        if (prev < collapsedVh - CLOSE_VH_BELOW_COLLAPSED) {
          onClose();
          return prev;
        }
        return prev >= mid ? expandedVh : collapsedVh;
      });
    } else {
      setTranslateY(prev => {
        if (prev > CLOSE_DRAG_PX) {
          onClose();
        }
        return 0;
      });
    }
  }

  const handleDrag = { onTouchStart: handleStart, onTouchMove: handleMove, onTouchEnd: handleEnd };

  return (
    <div className="modal-overlay" onClick={onBackdropClick || onClose}>
      <div style={{ position: 'relative', width: '100%', maxWidth }} onClick={e => e.stopPropagation()}>
        {/* Floating drag handle — centered above the sheet, not inside it */}
        <div
          {...handleDrag}
          style={{
            position: 'absolute', top: -40, left: '50%', transform: 'translateX(-50%)', zIndex: 5,
            width: 56, height: 30, borderRadius: 99,
            background: 'var(--surface2)', border: '1px solid var(--border)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 4px 16px rgba(0,0,0,0.4)', cursor: 'grab', touchAction: 'none',
          }}
        >
          <div style={{ width: 32, height: 4, borderRadius: 99, background: 'var(--text-muted)' }} />
        </div>

        {/* Floating close button */}
        <button
          onClick={onClose}
          aria-label="Close"
          style={{
            position: 'absolute', top: -55, right: 16, zIndex: 5,
            width: 45, height: 45, borderRadius: '50%',
            background: 'var(--surface2)', border: '1px solid var(--border)',
            color: 'var(--text)', display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 4px 16px rgba(0,0,0,0.4)', cursor: 'pointer',
          }}
        >
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>

        <div
          className="modal-box"
          style={{
            height: expandable ? `${heightVh}vh` : undefined,
            transform: !expandable && translateY !== 0 ? `translateY(${translateY}px)` : undefined,
            transition: dragging ? 'none' : (expandable ? 'height 0.25s cubic-bezier(0.16, 1, 0.3, 1)' : 'transform 0.25s cubic-bezier(0.16, 1, 0.3, 1)'),
          }}
        >
          {title && (
            <div className="modal-header" style={{ justifyContent: 'flex-start' }}>
              {typeof title === 'string' ? <h3>{title}</h3> : title}
            </div>
          )}
          <div className="modal-body">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
