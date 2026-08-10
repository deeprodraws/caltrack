import { useEffect, useRef, useState } from 'react';

// Animates height between 0 and the content's natural height. Stays mounted
// while collapsing so the closing transition can actually play, then unmounts.
export default function Collapse({ open, children }) {
  const innerRef = useRef(null);
  const [mounted, setMounted] = useState(open);
  const [height, setHeight] = useState(open ? 'auto' : 0);

  useEffect(() => {
    if (open) setMounted(true);
  }, [open]);

  useEffect(() => {
    if (!mounted) return;
    const el = innerRef.current;
    if (!el) return;

    if (open) {
      const target = el.scrollHeight;
      setHeight(target);
      const t = setTimeout(() => setHeight('auto'), 300);
      return () => clearTimeout(t);
    }

    const current = el.scrollHeight;
    setHeight(current);
    const raf = requestAnimationFrame(() => setHeight(0));
    return () => cancelAnimationFrame(raf);
  }, [open, mounted]);

  if (!mounted) return null;

  return (
    <div
      style={{ height, overflow: 'hidden', transition: 'height 0.3s cubic-bezier(0.16, 1, 0.3, 1)' }}
      onTransitionEnd={() => { if (!open) setMounted(false); }}
    >
      <div ref={innerRef}>{children}</div>
    </div>
  );
}
