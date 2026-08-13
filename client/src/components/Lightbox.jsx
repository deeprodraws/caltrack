import { useState, useEffect, useCallback } from 'react';

function CloseIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
      <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

// Full-screen photo viewer shared by Timeline (multi-photo, no delete) and
// Physique (single photo, deletable). `photos` is always an array; pass a
// single-item array for the one-photo case.
export default function Lightbox({ photos, startIndex = 0, onClose, getTitle, onDelete }) {
  const [idx, setIdx] = useState(startIndex);
  const [closing, setClosing] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const n = photos.length;

  const requestClose = useCallback(() => setClosing(true), []);

  // Mount already-open (BottomSheet's pattern doesn't apply here — there's no
  // drag surface, so we just flip a class after the first paint).
  const [entered, setEntered] = useState(false);
  useEffect(() => {
    const raf = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') requestClose();
      if (e.key === 'ArrowLeft' && n > 1) setIdx(i => (i - 1 + n) % n);
      if (e.key === 'ArrowRight' && n > 1) setIdx(i => (i + 1) % n);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [n, requestClose]);

  const navBtn = (dir) => ({
    position: 'absolute', top: '50%', transform: 'translateY(-50%)',
    [dir === -1 ? 'left' : 'right']: dir === -1 ? 16 : 72,
    background: 'rgba(255,255,255,0.15)', border: 'none', color: '#fff',
    width: 44, height: 44, borderRadius: '50%', fontSize: 22, cursor: 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  });

  const photo = photos[idx];
  const title = getTitle ? getTitle(photo, idx) : photo.photo_type;

  return (
    <div
      onClick={requestClose}
      onTransitionEnd={e => { if (e.propertyName === 'opacity' && closing) onClose(); }}
      className={`lightbox-overlay${entered && !closing ? ' in' : ''}`}
    >
      {/* Top bar */}
      <div onClick={e => e.stopPropagation()} style={{
        position: 'absolute', top: 0, left: 0, right: 0,
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '16px 20px', color: '#fff',
      }}>
        <div style={{ fontWeight: 700, fontSize: 15, textTransform: 'capitalize' }}>{title}</div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          {onDelete && (
            !confirmingDelete ? (
              <button onClick={() => setConfirmingDelete(true)} style={{
                background: 'rgba(248,113,113,0.2)', border: '1px solid rgba(248,113,113,0.5)',
                color: 'var(--red)', borderRadius: 8, padding: '6px 12px',
                cursor: 'pointer', fontWeight: 600, fontSize: 13,
              }}>Delete</button>
            ) : (
              <>
                <button onClick={() => onDelete(photo)} style={{
                  background: 'var(--red)', border: 'none', color: '#fff',
                  borderRadius: 8, padding: '6px 12px', cursor: 'pointer', fontWeight: 600, fontSize: 13,
                }}>Confirm</button>
                <button onClick={() => setConfirmingDelete(false)} style={{
                  background: 'rgba(255,255,255,0.1)', border: 'none', color: '#fff',
                  borderRadius: 8, padding: '6px 12px', cursor: 'pointer', fontWeight: 600, fontSize: 13,
                }}>Cancel</button>
              </>
            )
          )}
          <button onClick={requestClose} style={{
            background: 'rgba(255,255,255,0.1)', border: 'none', color: '#fff',
            borderRadius: 8, padding: '6px 10px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}><CloseIcon /></button>
        </div>
      </div>

      {/* Image */}
      <img
        src={photo.cloudinary_url}
        alt={photo.photo_type}
        onClick={e => e.stopPropagation()}
        className="lightbox-img"
      />

      {n > 1 && (
        <>
          <button onClick={e => { e.stopPropagation(); setIdx(i => (i - 1 + n) % n); }} style={navBtn(-1)}>‹</button>
          <button onClick={e => { e.stopPropagation(); setIdx(i => (i + 1) % n); }} style={navBtn(1)}>›</button>
          <div style={{ position: 'absolute', bottom: 24, left: '50%', transform: 'translateX(-50%)', display: 'flex', gap: 8 }}>
            {photos.map((_, i) => (
              <div key={i} style={{
                width: 8, height: 8, borderRadius: '50%',
                background: i === idx ? '#fff' : 'rgba(255,255,255,0.3)',
                transition: 'background 0.2s ease',
              }} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
