import { useState, useEffect, useCallback } from 'react';
import { getTimeline } from '../api';

// ── Helpers ───────────────────────────────────────────────────────────────────

function localDateStr(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function offsetDate(dateStr, days) {
  const d = new Date(dateStr + 'T12:00:00');
  d.setDate(d.getDate() + days);
  return localDateStr(d);
}

function formatCardDate(dateStr) {
  const d = new Date(dateStr + 'T12:00:00');
  const wd = d.toLocaleDateString('en-US', { weekday: 'short' });
  const mo = d.toLocaleDateString('en-US', { month: 'short' });
  return `${wd} · ${mo} ${d.getDate()}`;
}

function formatMonthLabel(dateStr) {
  const d = new Date(dateStr + 'T12:00:00');
  return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

function computeStreak(days) {
  // days is newest-first; count consecutive days (from today back) with food logged
  let streak = 0;
  for (const day of days) {
    if (day.food) streak++;
    else break;
  }
  return streak;
}

function filterDays(days, activeTypes, todayStr) {
  return days.filter(day => {
    if (day.date === todayStr) return true;
    if (!day.has_any_data) return false;
    if (activeTypes.has('all')) return true;
    if (activeTypes.has('food')     && day.food)               return true;
    if (activeTypes.has('workouts') && day.workouts.length > 0) return true;
    if (activeTypes.has('weight')   && day.weight)             return true;
    if (activeTypes.has('physique') && day.physique)           return true;
    return false;
  });
}

// Build the interleaved list: DayCard items + MonthDivider items
function buildRenderList(days, activeTypes, todayStr) {
  const filtered = filterDays(days, activeTypes, todayStr);
  const list = [];
  let lastMonth = null;
  for (const day of filtered) {
    const month = day.date.slice(0, 7);
    if (lastMonth !== null && month !== lastMonth) {
      list.push({ type: 'divider', label: formatMonthLabel(day.date), key: 'div-' + month });
    }
    list.push({ type: 'day', day, key: day.date });
    lastMonth = month;
  }
  return list;
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function MacroPill({ label, hit }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 3,
      fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 99,
      background: hit ? 'rgba(52,211,153,0.15)' : 'var(--surface2)',
      color: hit ? 'var(--green)' : 'var(--text-muted)',
      border: `1px solid ${hit ? 'rgba(52,211,153,0.3)' : 'var(--border)'}`,
    }}>
      {hit ? '✓' : '○'} {label}
    </span>
  );
}

function MonthDivider({ label }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12,
      padding: '16px 0 8px', color: 'var(--text-muted)',
    }}>
      <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
      <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.8px', textTransform: 'uppercase', flexShrink: 0 }}>
        {label}
      </span>
      <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
    </div>
  );
}

function LightboxOverlay({ photos, startIndex, onClose }) {
  const [idx, setIdx] = useState(startIndex);
  const n = photos.length;

  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape')     onClose();
      if (e.key === 'ArrowLeft')  setIdx(i => (i - 1 + n) % n);
      if (e.key === 'ArrowRight') setIdx(i => (i + 1) % n);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [n, onClose]);

  const navBtn = (dir) => ({
    position: 'absolute', top: '50%', transform: 'translateY(-50%)',
    [dir === -1 ? 'left' : 'right']: dir === -1 ? 16 : 72,
    background: 'rgba(255,255,255,0.15)', border: 'none', color: '#fff',
    width: 44, height: 44, borderRadius: '50%', fontSize: 22, cursor: 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  });

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.96)',
        zIndex: 3000, display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      <img
        src={photos[idx].cloudinary_url}
        alt={photos[idx].photo_type}
        onClick={e => e.stopPropagation()}
        style={{ maxWidth: '100%', maxHeight: '100vh', objectFit: 'contain' }}
      />

      {/* Close */}
      <button
        onClick={onClose}
        style={{
          position: 'absolute', top: 16, right: 16,
          background: 'rgba(255,255,255,0.15)', border: 'none', color: '#fff',
          width: 44, height: 44, borderRadius: '50%', fontSize: 20, cursor: 'pointer',
        }}
      >✕</button>

      {/* Prev / Next */}
      {n > 1 && (
        <>
          <button
            onClick={e => { e.stopPropagation(); setIdx(i => (i - 1 + n) % n); }}
            style={navBtn(-1)}
          >‹</button>
          <button
            onClick={e => { e.stopPropagation(); setIdx(i => (i + 1) % n); }}
            style={navBtn(1)}
          >›</button>
        </>
      )}

      {/* Dot indicators */}
      {n > 1 && (
        <div style={{ position: 'absolute', bottom: 24, left: '50%', transform: 'translateX(-50%)', display: 'flex', gap: 8 }}>
          {photos.map((_, i) => (
            <div key={i} style={{
              width: 8, height: 8, borderRadius: '50%',
              background: i === idx ? '#fff' : 'rgba(255,255,255,0.3)',
              transition: 'background 0.2s',
            }} />
          ))}
        </div>
      )}

      {/* Photo type label */}
      <div style={{
        position: 'absolute', bottom: n > 1 ? 52 : 24, left: '50%',
        transform: 'translateX(-50%)',
        color: 'rgba(255,255,255,0.5)', fontSize: 12, fontWeight: 600,
        textTransform: 'capitalize', letterSpacing: '0.5px',
      }}>
        {photos[idx].photo_type}
      </div>
    </div>
  );
}

function DayCard({ day, todayStr, onPhotoClick }) {
  const isToday     = day.date === todayStr;
  const isYesterday = day.date === offsetDate(todayStr, -1);
  const isPerfect   = !!(day.food?.calories_hit && day.food?.protein_hit && day.workouts.length > 0);

  const hasMetrics = day.metrics &&
    (day.metrics.steps > 0 || day.metrics.water_ml > 0 || day.metrics.sleep_hours > 0);

  return (
    <div style={{
      background: 'var(--surface)',
      border: `1px solid ${isToday ? 'rgba(108,99,255,0.45)' : 'var(--border)'}`,
      borderLeft: isPerfect ? '4px solid var(--yellow)' : undefined,
      borderRadius: 14,
      overflow: 'hidden',
    }}>
      {/* ── Date header ── */}
      <div style={{
        padding: '12px 16px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        background: isToday ? 'rgba(108,99,255,0.06)' : 'transparent',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
          <span style={{ fontWeight: isToday ? 800 : 700, fontSize: 14 }}>
            {formatCardDate(day.date)}
          </span>
          {isToday && (
            <span style={{
              background: 'var(--accent)', color: '#fff',
              fontSize: 9, fontWeight: 700, padding: '2px 7px', borderRadius: 99,
              textTransform: 'uppercase', letterSpacing: '0.4px',
            }}>Today</span>
          )}
          {isYesterday && (
            <span style={{
              background: 'var(--surface2)', color: 'var(--text-muted)',
              fontSize: 9, fontWeight: 700, padding: '2px 7px', borderRadius: 99,
              textTransform: 'uppercase', letterSpacing: '0.4px',
            }}>Yesterday</span>
          )}
          {day.physique && <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--accent-light)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>}
        </div>
        {day.weight && (
          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--accent-light)', flexShrink: 0 }}>
            {day.weight.weight} {day.weight.unit}
          </span>
        )}
      </div>

      {/* ── Physique section (Sundays with data) ── */}
      {day.physique && (
        <div style={{
          background: 'rgba(108,99,255,0.08)',
          borderTop: '1px solid rgba(108,99,255,0.2)',
          padding: '12px 16px',
        }}>
          {day.physique.photos?.length > 0 && (
            <div style={{ display: 'flex', gap: 8, marginBottom: day.physique.body_fat ? 10 : 0 }}>
              {day.physique.photos.map((photo, i) => (
                <div
                  key={photo.photo_type}
                  onClick={() => onPhotoClick(day.physique.photos, i)}
                  style={{
                    width: 80, height: 107, borderRadius: 8,
                    overflow: 'hidden', cursor: 'pointer', flexShrink: 0,
                    border: '1px solid rgba(108,99,255,0.3)',
                  }}
                >
                  <img
                    src={photo.cloudinary_url}
                    alt={photo.photo_type}
                    loading="lazy"
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  />
                </div>
              ))}
            </div>
          )}
          {day.physique.body_fat && (
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--accent-light)' }}>
              Body Fat: {day.physique.body_fat}%
            </div>
          )}
        </div>
      )}

      {/* ── Food section ── */}
      {day.food && (
        <div style={{ padding: '10px 16px', borderTop: '1px solid var(--border)' }}>
          {/* Macro pills */}
          <div style={{ display: 'flex', gap: 6, marginBottom: 9 }}>
            <MacroPill label="Calories" hit={day.food.calories_hit} />
            <MacroPill label="Protein"  hit={day.food.protein_hit} />
          </div>
          {/* Entries list (max 3 shown) */}
          {day.food.entries.slice(0, 3).map((e, i) => (
            <div key={i} style={{
              display: 'flex', justifyContent: 'space-between',
              fontSize: 12, color: 'var(--text-muted)', marginBottom: 3,
            }}>
              <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>
                {e.food_name}
              </span>
              <span style={{ flexShrink: 0, marginLeft: 8 }}>{Math.round(e.calories)} cal</span>
            </div>
          ))}
          {day.food.entry_count > 4 && (
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>
              … and {day.food.entry_count - 3} more
            </div>
          )}
          {/* Totals */}
          <div style={{
            fontSize: 12, color: 'var(--text-muted)',
            marginTop: 7, paddingTop: 7, borderTop: '1px solid var(--border)',
          }}>
            {day.food.total_calories} cal · {day.food.total_protein}g protein · {day.food.total_carbs}g carbs · {day.food.total_fat}g fat
          </div>
        </div>
      )}

      {/* ── Workouts ── */}
      {day.workouts.length > 0 && (
        <div style={{ padding: '10px 16px', borderTop: '1px solid var(--border)' }}>
          {day.workouts.map(w => (
            <div key={w.id} style={{ marginBottom: day.workouts.length > 1 ? 10 : 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 2, display: 'flex', alignItems: 'center', gap: 5 }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="10" width="2.5" height="4" rx="0.5"/><rect x="19.5" y="10" width="2.5" height="4" rx="0.5"/><rect x="4.5" y="7.5" width="3" height="9" rx="0.5"/><rect x="16.5" y="7.5" width="3" height="9" rx="0.5"/><line x1="7.5" y1="12" x2="16.5" y2="12"/></svg>
                {w.name}
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                {w.exercise_count} exercises · {w.total_sets} sets
                {' · '}{Math.round(w.total_volume).toLocaleString()} lbs
                {w.duration_minutes != null ? ` · ${w.duration_minutes} min` : ''}
              </div>
              {w.notes && (
                <div style={{ fontSize: 12, color: 'var(--text-muted)', fontStyle: 'italic', marginTop: 3 }}>
                  {w.notes}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ── Metrics row ── */}
      {hasMetrics && (
        <div style={{
          padding: '8px 16px', borderTop: '1px solid var(--border)',
          display: 'flex', gap: 14, flexWrap: 'wrap',
        }}>
          {day.metrics.steps > 0 && (
            <span style={{ fontSize: 12, color: 'var(--text-muted)', display: 'inline-flex', alignItems: 'center', gap: 3 }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12h4l3-6 4 12 3-6h4"/></svg>
              {day.metrics.steps.toLocaleString()} steps
            </span>
          )}
          {day.metrics.water_ml > 0 && (
            <span style={{ fontSize: 12, color: 'var(--text-muted)', display: 'inline-flex', alignItems: 'center', gap: 3 }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2C6.5 9 5 13 5 16a7 7 0 0 0 14 0c0-3-1.5-7-7-14z"/></svg>
              {Math.round(day.metrics.water_ml / 250)} glasses
            </span>
          )}
          {day.metrics.sleep_hours > 0 && (
            <span style={{ fontSize: 12, color: 'var(--text-muted)', display: 'inline-flex', alignItems: 'center', gap: 3 }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
              {day.metrics.sleep_hours}h sleep
            </span>
          )}
        </div>
      )}

      {/* ── Empty today ── */}
      {isToday && !day.has_any_data && (
        <div style={{ padding: '12px 16px', borderTop: '1px solid var(--border)', textAlign: 'center' }}>
          <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>Nothing logged yet today</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
            Head to the dashboard to log your first meal or workout
          </div>
        </div>
      )}
    </div>
  );
}

function FilterSheet({ activeTypes, onApply, onClose }) {
  const [types, setTypes] = useState(new Set(activeTypes));

  function toggleType(t) {
    setTypes(prev => {
      const next = new Set(prev);
      if (t === 'all') { next.clear(); next.add('all'); return next; }
      next.delete('all');
      if (next.has(t)) { next.delete(t); if (next.size === 0) next.add('all'); }
      else next.add(t);
      return next;
    });
  }

  const TYPE_LABELS = [
    { key: 'all',      label: 'All' },
    { key: 'food',     label: 'Food' },
    { key: 'workouts', label: 'Workouts' },
    { key: 'weight',   label: 'Weight' },
    { key: 'physique', label: 'Physique' },
  ];

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Filter Timeline</h3>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.7px', marginBottom: 12 }}>
            Show Only
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 24 }}>
            {TYPE_LABELS.map(({ key, label }) => {
              const active = types.has(key);
              return (
                <button
                  key={key}
                  onClick={() => toggleType(key)}
                  style={{
                    padding: '8px 16px', borderRadius: 99, fontSize: 13, fontWeight: 600,
                    border: '1px solid', cursor: 'pointer', transition: 'all 0.15s',
                    background:   active ? 'var(--accent)'   : 'var(--surface2)',
                    borderColor:  active ? 'var(--accent)'   : 'var(--border)',
                    color:        active ? '#fff'            : 'var(--text-muted)',
                  }}
                >{label}</button>
              );
            })}
          </div>

          <button
            className="btn-primary"
            onClick={() => { onApply(types); onClose(); }}
            style={{ width: '100%', padding: '12px', fontSize: 15, borderRadius: 10 }}
          >
            Apply Filters
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Icon ──────────────────────────────────────────────────────────────────────

function FilterIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="4" y1="6" x2="20" y2="6"/>
      <line x1="8" y1="12" x2="16" y2="12"/>
      <line x1="11" y1="18" x2="13" y2="18"/>
    </svg>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function Timeline() {
  const todayStr = localDateStr(new Date());

  const [allDays, setAllDays]         = useState([]);
  const [goals, setGoals]             = useState(null);
  const [oldestStart, setOldestStart] = useState(null);
  const [loading, setLoading]         = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore]         = useState(true);
  const [error, setError]             = useState(null);
  const [filterOpen, setFilterOpen]   = useState(false);
  const [activeTypes, setActiveTypes] = useState(new Set(['all']));
  const [lightbox, setLightbox]       = useState(null); // { photos, index }

  // Initial load
  useEffect(() => {
    const end   = todayStr;
    const start = offsetDate(end, -29);
    setLoading(true);
    getTimeline(start, end)
      .then(data => {
        setAllDays(data.days);
        setGoals(data.goals);
        setOldestStart(start);
        setHasMore(true);
      })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  const handleLoadMore = useCallback(async () => {
    if (loadingMore || !hasMore || !oldestStart) return;
    setLoadingMore(true);
    const newEnd   = offsetDate(oldestStart, -1);
    const newStart = offsetDate(newEnd, -29);
    try {
      const data = await getTimeline(newStart, newEnd);
      setAllDays(prev => [...prev, ...data.days]);
      setOldestStart(newStart);
      // If no data at all in the older range, stop offering Load More
      if (!data.days.some(d => d.has_any_data)) setHasMore(false);
    } catch {
      // silently ignore load-more errors
    } finally {
      setLoadingMore(false);
    }
  }, [loadingMore, hasMore, oldestStart]);

  const handlePhotoClick = useCallback((photos, index) => {
    setLightbox({ photos, index });
  }, []);

  const closeLightbox = useCallback(() => setLightbox(null), []);

  // Computed values
  const streak = allDays.length ? computeStreak(allDays) : 0;
  const renderList = buildRenderList(allDays, activeTypes, todayStr);
  const isFiltered = !activeTypes.has('all');

  // ── Render ───────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div style={{ padding: '32px 0', textAlign: 'center', color: 'var(--text-muted)' }}>
        <div style={{ fontSize: 24, marginBottom: 10 }}>⏳</div>
        Loading your timeline…
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: '32px 0', textAlign: 'center', color: 'var(--red)' }}>
        Failed to load timeline: {error}
      </div>
    );
  }

  return (
    <div>
      {/* ── Page header ── */}
      <div style={{
        display: 'flex', alignItems: 'flex-start',
        justifyContent: 'space-between', marginBottom: 8,
      }}>
        <div>
          <h1 className="page-title" style={{ marginBottom: 2 }}>Life Timeline</h1>
          <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>
            Your fitness journey, day by day
          </p>
        </div>
        <button
          onClick={() => setFilterOpen(true)}
          style={{
            background: isFiltered ? 'var(--accent)' : 'var(--surface2)',
            border: `1px solid ${isFiltered ? 'var(--accent)' : 'var(--border)'}`,
            color: isFiltered ? '#fff' : 'var(--text-muted)',
            borderRadius: 10, width: 40, height: 40,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0, marginTop: 2, cursor: 'pointer',
            transition: 'all 0.15s',
          }}
          aria-label="Filter"
        >
          <FilterIcon />
        </button>
      </div>

      {/* ── Streak counter ── */}
      {streak >= 1 && (
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          background: 'rgba(251,191,36,0.1)',
          border: '1px solid rgba(251,191,36,0.3)',
          borderRadius: 99, padding: '6px 14px',
          fontSize: 13, fontWeight: 700, color: 'var(--yellow)',
          marginBottom: 20,
        }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--yellow)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/></svg>
          {streak} day{streak !== 1 ? '' : ''} streak
        </div>
      )}

      {/* ── No data empty state ── */}
      {renderList.length === 0 && (
        <div className="empty-state" style={{ marginTop: 40 }}>
          <div style={{ marginBottom: 12, display: 'flex', justifyContent: 'center' }}>
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
          </div>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>No data yet</div>
          <div>Start logging your meals, workouts, and weight to build your timeline.</div>
        </div>
      )}

      {/* ── Day cards + month dividers ── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {renderList.map(item =>
          item.type === 'divider'
            ? <MonthDivider key={item.key} label={item.label} />
            : <DayCard
                key={item.key}
                day={item.day}
                todayStr={todayStr}
                onPhotoClick={handlePhotoClick}
              />
        )}
      </div>

      {/* ── Load More ── */}
      {hasMore && renderList.length > 0 && (
        <div style={{ textAlign: 'center', marginTop: 24, marginBottom: 8 }}>
          {loadingMore ? (
            <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>Loading older days…</div>
          ) : (
            <button
              onClick={handleLoadMore}
              style={{
                background: 'var(--surface2)', border: '1px solid var(--border)',
                color: 'var(--text-muted)', borderRadius: 10, padding: '11px 28px',
                fontSize: 14, fontWeight: 600, cursor: 'pointer', transition: 'border-color 0.15s',
              }}
            >
              Load More
            </button>
          )}
        </div>
      )}

      {/* ── Sheets / overlays ── */}
      {filterOpen && (
        <FilterSheet
          activeTypes={activeTypes}
          onApply={setActiveTypes}
          onClose={() => setFilterOpen(false)}
        />
      )}

      {lightbox && (
        <LightboxOverlay
          photos={lightbox.photos}
          startIndex={lightbox.index}
          onClose={closeLightbox}
        />
      )}
    </div>
  );
}
