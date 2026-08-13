import { useState, useEffect, useRef } from 'react';

// Underlined tab bar with a sliding indicator (same measurement pattern as
// the mobile floating nav's pill indicator) instead of an instant
// border-bottom color swap.
export default function TabBar({ tabs, active, onChange, style }) {
  const [indicator, setIndicator] = useState({ left: 0, width: 0, opacity: 0 });
  const wrapRef = useRef(null);
  const itemRefs = useRef({});

  useEffect(() => {
    function measure() {
      const el = itemRefs.current[active];
      if (!el || !wrapRef.current) return;
      const wrapRect = wrapRef.current.getBoundingClientRect();
      const elRect = el.getBoundingClientRect();
      setIndicator({ left: elRect.left - wrapRect.left, width: elRect.width, opacity: 1 });
    }
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [active, tabs]);

  return (
    <div ref={wrapRef} style={{ position: 'relative', display: 'flex', borderBottom: '1px solid var(--border)', marginBottom: 20, minWidth: 0, overflowX: 'auto', ...style }}>
      <div style={{
        position: 'absolute', bottom: -1, height: 2, background: 'var(--accent)',
        transform: `translateX(${indicator.left}px)`, width: indicator.width, opacity: indicator.opacity,
        transition: 'transform 0.25s var(--ease-out), width 0.25s var(--ease-out), opacity 0.15s ease',
      }} />
      {tabs.map(t => (
        <button
          key={t.key}
          ref={el => { itemRefs.current[t.key] = el; }}
          onClick={() => onChange(t.key)}
          style={{
            padding: '10px 18px', background: 'transparent', border: 'none',
            color: active === t.key ? 'var(--accent-light)' : 'var(--text-muted)',
            fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
            marginBottom: -1, transition: 'color 0.2s ease', whiteSpace: 'nowrap', flexShrink: 0,
          }}
        >{t.label}</button>
      ))}
    </div>
  );
}
