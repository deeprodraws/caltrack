export default function InstallBanner({ onInstall, onDismiss }) {
  return (
    <div className="install-banner" style={{
      position: 'fixed',
      left: 0, right: 0,
      zIndex: 500,
      display: 'flex', justifyContent: 'center',
      pointerEvents: 'none',
    }}>
      <div style={{
        pointerEvents: 'auto',
        width: '100%', maxWidth: 480,
        background: 'var(--accent)',
        color: '#fff',
        borderRadius: '12px 12px 0 0',
        padding: '12px 16px',
        boxShadow: '0 -6px 24px rgba(0,0,0,0.35)',
        display: 'flex', alignItems: 'center', gap: 12,
      }}>
        <div style={{ flex: 1, minWidth: 0, fontSize: 13, lineHeight: 1.4, display: 'flex', alignItems: 'center', gap: 8 }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
            <rect x="7" y="2" width="10" height="20" rx="2"/><line x1="7" y1="18" x2="17" y2="18"/><path d="M12 12v3M10.5 13.5L12 15l1.5-1.5"/>
          </svg>
          Add CalTrack to your home screen for the full app experience.
        </div>
        <button
          onClick={onInstall}
          style={{
            flexShrink: 0,
            background: '#fff', color: 'var(--accent)',
            border: 'none', borderRadius: 8,
            padding: '10px 16px', fontSize: 13, fontWeight: 700,
            fontFamily: 'inherit', cursor: 'pointer', whiteSpace: 'nowrap',
          }}
        >
          Install
        </button>
        <button
          onClick={onDismiss}
          aria-label="Dismiss"
          style={{
            flexShrink: 0,
            width: 44, height: 44,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'transparent', border: 'none', color: '#fff',
            fontSize: 20, cursor: 'pointer', fontFamily: 'inherit',
          }}
        >
          ×
        </button>
      </div>
    </div>
  );
}
