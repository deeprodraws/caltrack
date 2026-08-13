import BottomSheet from './BottomSheet';

// Shared destructive-confirm sheet. `text` can be a string or JSX (some
// callers bold a value or add a second line).
export default function DeleteConfirm({ title = 'Delete this?', text, onConfirm, onCancel, confirmLabel = 'Delete' }) {
  return (
    <BottomSheet onClose={onCancel} title={title}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ marginBottom: 12, display: 'flex', justifyContent: 'center' }}>
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="var(--red)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="3,6 5,6 21,6" /><path d="M19 6l-1 14H6L5 6" />
            <path d="M10 11v6M14 11v6" /><path d="M9 6V4h6v2" />
          </svg>
        </div>
        <p style={{ color: 'var(--text-muted)', fontSize: 14, marginBottom: 24 }}>{text}</p>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
          <button onClick={onCancel} style={{
            background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)',
            padding: '10px 20px', borderRadius: 8, fontSize: 14, fontFamily: 'inherit',
          }}>Keep it</button>
          <button onClick={onConfirm} style={{
            background: 'var(--red)', color: '#fff', border: 'none', padding: '10px 20px',
            borderRadius: 8, fontSize: 14, fontWeight: 600, fontFamily: 'inherit',
          }}>{confirmLabel}</button>
        </div>
      </div>
    </BottomSheet>
  );
}
