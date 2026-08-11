import { useState, useRef } from 'react';

const CLOSE_DRAG_PX = 120;        // non-expandable: how far down before it counts as "let go to close"
const CLOSE_VH_BELOW_COLLAPSED = 18; // expandable: how far below the collapsed height before it closes instead of snapping back

// Shared bottom-sheet shell used across the app: a drag handle at the top of
// the sheet, a floating close button above it, and drag-to-dismiss (both move
// and fade together as the sheet is dragged away). Sheets with more content
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

  // 0 = fully open, 1 = about to close — drives the fade as it's dragged away.
  const closeProgress = expandable
    ? Math.min(Math.max(collapsedVh - heightVh, 0) / CLOSE_VH_BELOW_COLLAPSED, 1)
    : Math.min(translateY / CLOSE_DRAG_PX, 1);
  const dismissTransform = !expandable && translateY !== 0 ? `translateY(${translateY}px)` : undefined;
  const dismissOpacity = closeProgress > 0 ? 1 - closeProgress : undefined;
  const dismissTransition = dragging
    ? 'none'
    : 'transform 0.25s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.25s ease, height 0.25s cubic-bezier(0.16, 1, 0.3, 1)';

  return (
    <div className="modal-overlay" onClick={onBackdropClick || onClose}>
      <div style={{ position: 'relative', width: '100%', maxWidth }} onClick={e => e.stopPropagation()}>
        {/* Floating close button — moves and fades together with the sheet while it's being dismissed */}
        <button
          onClick={onClose}
          aria-label="Close"
          style={{
            position: 'absolute', top: -55, right: 16, zIndex: 5,
            width: 45, height: 45, borderRadius: '50%',
            background: 'var(--surface2)', border: '1px solid var(--border)',
            color: 'var(--text)', display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 4px 16px rgba(0,0,0,0.4)', cursor: 'pointer',
            transform: dismissTransform,
            opacity: dismissOpacity,
            transition: dismissTransition,
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
            transform: dismissTransform,
            opacity: dismissOpacity,
            transition: dismissTransition,
          }}
        >
          {/* Drag handle lives inside the sheet, sticky so it's always reachable even when scrolled */}
          <div style={{ position: 'sticky', top: 0, background: 'var(--surface)', zIndex: 2, borderBottom: '1px solid var(--border)' }}>
            <div
              {...handleDrag}
              style={{ display: 'flex', justifyContent: 'center', padding: '10px 0 8px', touchAction: 'none', cursor: 'grab' }}
            >
              <div style={{ width: 40, height: 5, borderRadius: 99, background: 'var(--border)' }} />
            </div>
            {title && (
              <div style={{ padding: '0 20px 14px' }}>
                {typeof title === 'string' ? <h3 style={{ margin: 0 }}>{title}</h3> : title}
              </div>
            )}
          </div>
          <div className="modal-body">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
