import { useState, useEffect, useCallback, useRef } from 'react';
import { getTimeline, saveReflection, searchTimeline, getOnThisDay } from '../api';
import SkeletonLoader from '../components/SkeletonLoader';
import { getCached, setCached } from '../utils/cache';

const TIMELINE_CACHE_TTL = 120000; // 2 minutes
const ON_THIS_DAY_TTL = 86400000; // 24 hours
const SEARCH_TTL = 120000; // 2 minutes

const CHIP = {
  gold:   { bg: 'rgba(251,191,36,0.18)',  color: '#fbbf24' },
  green:  { bg: 'rgba(52,211,153,0.18)',  color: '#34d399' },
  purple: { bg: 'rgba(108,99,255,0.18)',  color: '#9b94ff' },
  teal:   { bg: 'rgba(45,212,191,0.18)',  color: '#2dd4bf' },
};

const MEAL_EMOJI = { breakfast: '🌅', lunch: '☀️', dinner: '🌙', snacks: '🍎' };
const MEAL_LABEL = { breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner', snacks: 'Snacks' };
const MEAL_ORDER = ['breakfast', 'lunch', 'dinner', 'snacks'];

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
  const wd = d.toLocaleDateString('en-US', { weekday: 'long' });
  const mo = d.toLocaleDateString('en-US', { month: 'short' });
  return `${wd} · ${mo} ${d.getDate()}`;
}

function formatFullDate(dateStr) {
  const d = new Date(dateStr + 'T12:00:00');
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

function formatMonthLabel(dateStr) {
  const d = new Date(dateStr + 'T12:00:00');
  return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

function formatTime(iso) {
  if (!iso) return null;
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

function fmtMinutes(mins) {
  if (mins == null) return null;
  const h = Math.floor(mins / 60), m = mins % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function round1(v) {
  return Math.round((Number(v) || 0) * 10) / 10;
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

// Streak-as-of-each-day, computed in one forward pass over a contiguous newest-first array.
function computeStreaksByDate(days) {
  const map = {};
  let running = 0;
  for (let i = days.length - 1; i >= 0; i--) {
    running = days[i].food ? running + 1 : 0;
    map[days[i].date] = running;
  }
  return map;
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

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function highlight(text, query) {
  if (!query || query.length < 2 || text == null) return text;
  const str = String(text);
  const escaped = escapeRegex(query);
  const parts = str.split(new RegExp(`(${escaped})`, 'gi'));
  if (parts.length === 1) return text;
  const testRe = new RegExp(`^${escaped}$`, 'i');
  return parts.map((part, i) => testRe.test(part)
    ? <mark key={i} style={{ background: '#fbbf24', color: '#1a1d27', borderRadius: 2, padding: '0 1px' }}>{part}</mark>
    : <span key={i}>{part}</span>);
}

function groupEntriesByMealType(entries) {
  const groups = {};
  for (const e of entries) {
    const t = MEAL_ORDER.includes(e.meal_type) ? e.meal_type : 'snacks';
    if (!groups[t]) groups[t] = [];
    groups[t].push(e);
  }
  return MEAL_ORDER.filter(t => groups[t]?.length).map(t => [t, groups[t]]);
}

function entryDisplayName(e) {
  return e.entry_type && e.entry_type !== 'single' ? (e.source_name || e.food_name) : e.food_name;
}

function buildChips(day, streak) {
  const chips = [];
  if (day.prs_achieved?.length > 0) {
    chips.push(day.prs_achieved.length > 1
      ? { emoji: '🏆', label: `${day.prs_achieved.length} PRs`, c: CHIP.gold }
      : { emoji: '🏆', label: `${day.prs_achieved[0].exercise_name} PR`, c: CHIP.gold });
  }
  if (streak >= 3) chips.push({ emoji: '🔥', label: `${streak}-Day Streak`, c: CHIP.gold });
  if (day.food?.protein_hit) chips.push({ emoji: '🥩', label: 'Protein Goal', c: CHIP.green });
  if (day.food?.calories_hit) chips.push({ emoji: '✅', label: 'Calories', c: CHIP.green });
  if (day.metrics?.sleep_hours >= 7) chips.push({ emoji: '🌙', label: `${round1(day.metrics.sleep_hours)}h`, c: CHIP.purple });
  if (day.metrics?.steps >= 10000) chips.push({ emoji: '👟', label: '10K Steps', c: CHIP.teal });
  return chips;
}

// ── Small building blocks ────────────────────────────────────────────────────

function Chip({ emoji, label, c }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      height: 24, padding: '0 9px', borderRadius: 6,
      fontSize: 11, fontWeight: 700,
      background: c.bg, color: c.color, whiteSpace: 'nowrap',
    }}>
      {emoji} {label}
    </span>
  );
}

function ProgressBar({ pct, overRed }) {
  let color = '#34d399';
  if (overRed && pct > 110) color = '#f87171';
  else if (pct < 50) color = '#f87171';
  else if (pct < 90) color = '#fbbf24';
  return (
    <div style={{ height: 4, borderRadius: 2, background: 'var(--surface2)', overflow: 'hidden', marginTop: 4 }}>
      <div style={{ height: '100%', width: `${Math.min(100, pct)}%`, background: color, borderRadius: 2 }} />
    </div>
  );
}

function SectionLabel({ children }) {
  return (
    <div style={{
      fontSize: 10, fontWeight: 700, letterSpacing: '0.7px', textTransform: 'uppercase',
      color: 'var(--text-muted)', marginBottom: 8,
    }}>
      {children}
    </div>
  );
}

function MonthDivider({ label }) {
  return (
    <div className="month-divider" style={{
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

function PhotoStrip({ physique, onPhotoClick }) {
  if (!physique?.photos?.length) return null;
  return (
    <div style={{ display: 'flex', gap: 8, marginBottom: physique.body_fat ? 10 : 0 }}>
      {physique.photos.map((photo, i) => (
        <div
          key={photo.photo_type}
          onClick={() => onPhotoClick(physique.photos, i)}
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
            width="80"
            height="107"
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
          />
        </div>
      ))}
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
      <button
        onClick={onClose}
        style={{
          position: 'absolute', top: 16, right: 16,
          background: 'rgba(255,255,255,0.15)', border: 'none', color: '#fff',
          width: 44, height: 44, borderRadius: '50%', fontSize: 20, cursor: 'pointer',
        }}
      >✕</button>
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

// ── Reflection editor (inline, no sheet) ─────────────────────────────────────

function ReflectionSection({ day, onSave }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(day.reflection || '');
  const [saving, setSaving] = useState(false);

  if (editing) {
    return (
      <div>
        <SectionLabel>Reflection</SectionLabel>
        <textarea
          autoFocus
          value={draft}
          onChange={e => setDraft(e.target.value)}
          placeholder="How did today feel?"
          rows={3}
          style={{
            width: '100%', padding: '10px 12px', borderRadius: 8, resize: 'vertical',
            background: 'var(--surface2)', border: '1px solid var(--border)',
            color: 'var(--text)', fontSize: 14, fontFamily: 'inherit', marginBottom: 8,
          }}
        />
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={() => { setDraft(day.reflection || ''); setEditing(false); }}
            style={{ flex: 1, padding: '9px', borderRadius: 8, background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}
          >Cancel</button>
          <button
            disabled={saving}
            onClick={async () => {
              setSaving(true);
              try { await onSave(day.date, draft); setEditing(false); }
              finally { setSaving(false); }
            }}
            style={{ flex: 2, padding: '9px', borderRadius: 8, background: 'var(--accent)', color: '#fff', border: 'none', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', opacity: saving ? 0.6 : 1 }}
          >{saving ? 'Saving…' : 'Save'}</button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <SectionLabel>Reflection</SectionLabel>
        {day.reflection && (
          <button onClick={() => setEditing(true)}
            style={{ background: 'none', border: 'none', color: 'var(--accent-light)', fontSize: 12, cursor: 'pointer', padding: 0 }}>
            ✎ Edit
          </button>
        )}
      </div>
      {day.reflection ? (
        <div style={{ fontSize: 14, fontStyle: 'italic', color: 'var(--text)', lineHeight: 1.5 }}>
          "{day.reflection}"
        </div>
      ) : (
        <div onClick={() => setEditing(true)}
          style={{ fontSize: 14, fontStyle: 'italic', color: 'var(--text-muted)', cursor: 'text' }}>
          + Add a note about today…
        </div>
      )}
    </div>
  );
}

// ── Expanded content ──────────────────────────────────────────────────────────

function ExpandedContent({ day, goals, onPhotoClick, onSaveReflection, highlightQuery }) {
  const glasses = day.metrics ? Math.round(day.metrics.water_ml / 250) : 0;
  const sleepH = day.metrics ? Math.floor(day.metrics.sleep_hours) : 0;
  const sleepM = day.metrics ? Math.round((day.metrics.sleep_hours - sleepH) * 60) : 0;

  const mealGroups = day.food ? groupEntriesByMealType(day.food.entries) : [];

  return (
    <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 18 }}>
      {/* MACROS */}
      {(day.food || day.metrics) && (
        <div>
          <SectionLabel>Macros</SectionLabel>
          {day.food && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: day.metrics ? 12 : 0 }}>
              {[
                { label: 'Calories', val: day.food.total_calories, goal: goals.calories, unit: '', overRed: true },
                { label: 'Protein',  val: day.food.total_protein,  goal: goals.protein,  unit: 'g' },
                { label: 'Carbs',    val: day.food.total_carbs,    goal: goals.carbs,    unit: 'g' },
                { label: 'Fat',      val: day.food.total_fat,      goal: goals.fat,      unit: 'g' },
              ].map(row => (
                <div key={row.label}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                    <span style={{ color: 'var(--text-muted)' }}>{row.label}</span>
                    <span style={{ fontWeight: 600 }}>{row.val}{row.unit} / {row.goal}{row.unit}</span>
                  </div>
                  <ProgressBar pct={row.goal > 0 ? (row.val / row.goal) * 100 : 0} overRed={row.overRed} />
                </div>
              ))}
            </div>
          )}
          {day.metrics && (
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 13, color: 'var(--text-muted)' }}>
              {day.metrics.water_ml > 0 && <span>💧 {glasses} glasses ({day.metrics.water_ml}ml)</span>}
              {day.metrics.sleep_hours > 0 && <span>🌙 {sleepH}h {sleepM}m</span>}
              {day.metrics.steps > 0 && <span>👟 {day.metrics.steps.toLocaleString()}</span>}
            </div>
          )}
        </div>
      )}

      {/* MEALS */}
      {mealGroups.length > 0 && (
        <div>
          <SectionLabel>Meals</SectionLabel>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {mealGroups.map(([type, entries]) => (
              <div key={type}>
                <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 5 }}>
                  {MEAL_EMOJI[type]} {MEAL_LABEL[type]}
                </div>
                {entries.map(e => (
                  <div key={e.id} style={{ display: 'flex', alignItems: 'baseline', gap: 8, fontSize: 13, marginBottom: 3 }}>
                    <span style={{ color: 'var(--text-muted)', fontSize: 11, width: 62, flexShrink: 0 }}>
                      {formatTime(e.created_at) || ''}
                    </span>
                    <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {e.entry_type && e.entry_type !== 'single' ? '🍽️ ' : ''}{highlight(entryDisplayName(e), highlightQuery)}
                    </span>
                    <span style={{ color: 'var(--text-muted)', flexShrink: 0 }}>{Math.round(e.calories)} cal</span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* WORKOUT */}
      {day.workouts.length > 0 && (
        <div>
          <SectionLabel>Workout</SectionLabel>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {day.workouts.map(w => (
              <div key={w.id}>
                <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>
                  {w.name}{w.duration_minutes != null ? ` — ${fmtMinutes(w.duration_minutes)}` : ''}
                </div>
                {(w.exercises || []).map((ex, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 3 }}>
                    <span>{highlight(ex.exercise_name, highlightQuery)}</span>
                    <span style={{ fontWeight: 600, color: 'var(--text-muted)' }}>
                      {ex.best_weight === 0 ? 'BW' : round1(ex.best_weight)} × {ex.best_reps}
                    </span>
                  </div>
                ))}
                {w.notes && (
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', fontStyle: 'italic', marginTop: 4 }}>
                    {w.notes}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* PHOTOS */}
      {day.physique && (
        <div>
          <SectionLabel>Photos</SectionLabel>
          <PhotoStrip physique={day.physique} onPhotoClick={onPhotoClick} />
          {day.physique.body_fat && (
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--accent-light)' }}>
              Body Fat: {day.physique.body_fat}%
            </div>
          )}
        </div>
      )}

      {/* PRs */}
      {day.prs_achieved?.length > 0 && (
        <div>
          <SectionLabel>Personal Records 🏆</SectionLabel>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {day.prs_achieved.map((pr, i) => (
              <div key={i} style={{ fontSize: 13 }}>
                🏆 <strong>{pr.exercise_name}</strong> — {round1(pr.weight)} lb × {pr.reps}
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginLeft: 20 }}>
                  est. 1RM: {round1(pr.estimated_1rm)} lb
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* REFLECTION */}
      <ReflectionSection day={day} onSave={onSaveReflection} />
    </div>
  );
}

// ── Day card ──────────────────────────────────────────────────────────────────

function DayCard({ day, todayStr, streak, highlightQuery, goals, expanded, onToggle, onPhotoClick, onSaveReflection, cardRef }) {
  const isToday     = day.date === todayStr;
  const isYesterday = day.date === offsetDate(todayStr, -1);
  const isPerfect   = !!(day.food?.calories_hit && day.food?.protein_hit && day.workouts.length > 0);

  const chips = buildChips(day, streak);
  const meals = day.food?.entries || [];
  const previewMeals = meals.slice(0, 3);
  const extraMealCount = meals.length - previewMeals.length;

  return (
    <div ref={cardRef} style={{
      background: 'var(--surface)',
      border: `1px solid ${isToday ? 'rgba(108,99,255,0.45)' : 'var(--border)'}`,
      borderLeft: isPerfect ? '4px solid var(--yellow)' : undefined,
      borderRadius: 12,
      boxShadow: '0 2px 10px rgba(0,0,0,0.15)',
      overflow: 'hidden',
      padding: '14px 16px',
    }}>
      {/* Header (tap to expand) */}
      <div onClick={onToggle} style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap', minWidth: 0 }}>
          <span style={{ fontWeight: 700, fontSize: 15 }}>{formatCardDate(day.date)}</span>
          {isToday && (
            <span style={{ background: 'var(--accent)', color: '#fff', fontSize: 9, fontWeight: 700, padding: '2px 7px', borderRadius: 99, textTransform: 'uppercase', letterSpacing: '0.4px' }}>Today</span>
          )}
          {isYesterday && (
            <span style={{ background: 'var(--surface2)', color: 'var(--text-muted)', fontSize: 9, fontWeight: 700, padding: '2px 7px', borderRadius: 99, textTransform: 'uppercase', letterSpacing: '0.4px' }}>Yesterday</span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          {day.weight && (
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--accent-light)' }}>
              {day.weight.weight} {day.weight.unit}
            </span>
          )}
          <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>{expanded ? '↑' : '↓'}</span>
        </div>
      </div>

      {/* Physique photo strip (Sundays with photos) */}
      {day.physique?.photos?.length > 0 && (
        <div style={{ marginTop: 10 }}>
          <PhotoStrip physique={day.physique} onPhotoClick={onPhotoClick} />
        </div>
      )}

      {/* Achievement chips */}
      {chips.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
          {chips.map((c, i) => <Chip key={i} emoji={c.emoji} label={c.label} c={c.c} />)}
        </div>
      )}

      {/* Meals preview */}
      {previewMeals.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 10px', fontSize: 13, color: 'var(--text)', marginTop: 10 }}>
          {previewMeals.map((e, i) => (
            <span key={e.id ?? i} style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 160 }}>
              {MEAL_EMOJI[MEAL_ORDER.includes(e.meal_type) ? e.meal_type : 'snacks']} {highlight(entryDisplayName(e), highlightQuery)}
            </span>
          ))}
          {extraMealCount > 0 && <span style={{ color: 'var(--text-muted)' }}>+ {extraMealCount} more</span>}
        </div>
      )}

      {/* Workout preview */}
      {day.workouts.length > 0 && (
        <div style={{ fontSize: 13, marginTop: 8, display: 'flex', alignItems: 'center', gap: 5 }}>
          🏋️ {highlight(day.workouts.map(w => w.name).join(', '), highlightQuery)}
        </div>
      )}

      {/* Reflection preview */}
      {day.reflection && !expanded && (
        <div style={{ fontSize: 13, fontStyle: 'italic', color: 'var(--text-muted)', marginTop: 8 }}>
          "{highlight(day.reflection.length > 60 ? day.reflection.slice(0, 60) + '…' : day.reflection, highlightQuery)}"
        </div>
      )}

      {!expanded && (
        <div onClick={onToggle} style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 10, cursor: 'pointer', textAlign: 'right' }}>
          tap to expand
        </div>
      )}

      {expanded && (
        <ExpandedContent day={day} goals={goals} onPhotoClick={onPhotoClick} onSaveReflection={onSaveReflection} highlightQuery={highlightQuery} />
      )}
    </div>
  );
}

// ── On This Day card ──────────────────────────────────────────────────────────

function OnThisDayCard({ data, onView }) {
  return (
    <div style={{
      background: 'rgba(108,99,255,0.08)',
      border: '1px solid rgba(108,99,255,0.25)',
      borderRadius: 12, padding: '14px 16px', marginBottom: 16,
    }}>
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.7px', textTransform: 'uppercase', color: 'var(--accent-light)', marginBottom: 4 }}>
        📅 One Year Ago Today
      </div>
      <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 10 }}>
        {formatFullDate(data.date)}
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 14px', fontSize: 13, marginBottom: data.workouts.length || data.has_photo ? 6 : 0 }}>
        {data.weight && <span>⚖️ {data.weight.weight} {data.weight.unit}</span>}
        {data.protein != null && <span>🔥 {data.protein}g protein</span>}
      </div>

      {data.workouts.length > 0 && (
        <div style={{ fontSize: 13, marginBottom: 6 }}>
          🏋️ {data.workouts.map(w => w.name).join(', ')}
          {data.workouts[0].exercises?.length > 0 && ` · ${data.workouts[0].exercises.slice(0, 3).join(', ')}`}
        </div>
      )}

      {data.has_photo && (
        <div style={{ fontSize: 13, marginBottom: 6 }}>📸 Progress photo available</div>
      )}

      {data.reflection && (
        <div style={{ fontSize: 13, fontStyle: 'italic', color: 'var(--text-muted)', marginBottom: 6 }}>
          "{data.reflection}"
        </div>
      )}

      <div style={{ textAlign: 'right' }}>
        <button onClick={() => onView(data.date)}
          style={{ background: 'none', border: 'none', color: 'var(--accent-light)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
          View that day →
        </button>
      </div>
    </div>
  );
}

// ── Search bar ────────────────────────────────────────────────────────────────

function SearchBar({ value, onChange, searching }) {
  return (
    <div style={{
      position: 'relative', marginBottom: 16,
    }}>
      <span style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', fontSize: 14 }}>
        🔍
      </span>
      <input
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder="Search your journey…"
        style={{
          width: '100%', padding: '11px 40px', borderRadius: 12,
          background: 'var(--surface2)', border: '1px solid var(--border)',
          color: 'var(--text)', fontSize: 14, fontFamily: 'inherit',
        }}
      />
      {searching && (
        <span style={{ position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)', fontSize: 12, color: 'var(--text-muted)' }}>
          ⏳
        </span>
      )}
      {!searching && value && (
        <button onClick={() => onChange('')}
          style={{
            position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
            background: 'var(--border)', border: 'none', color: 'var(--text)',
            width: 24, height: 24, borderRadius: '50%', cursor: 'pointer', fontSize: 13,
          }}>×</button>
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
  const [expandedDate, setExpandedDate] = useState(null);

  const [onThisDay, setOnThisDay] = useState(null);
  const [extraDays, setExtraDays] = useState({});
  const [pinnedDate, setPinnedDate] = useState(null);

  const [search, setSearch] = useState('');
  const [searchDebounced, setSearchDebounced] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchResult, setSearchResult] = useState(null);

  const cardRefs = useRef({});

  // Initial load
  useEffect(() => {
    const end   = todayStr;
    const start = offsetDate(end, -29);
    const cacheKey = `timeline-${start}-${end}`;
    const cached = getCached(cacheKey, TIMELINE_CACHE_TTL);
    if (cached) {
      setAllDays(cached.days);
      setGoals(cached.goals);
      setOldestStart(start);
      setHasMore(true);
      setLoading(false);
      return;
    }
    setLoading(true);
    getTimeline(start, end)
      .then(data => {
        setAllDays(data.days);
        setGoals(data.goals);
        setOldestStart(start);
        setHasMore(true);
        setCached(cacheKey, data);
      })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  // On This Day
  useEffect(() => {
    const cacheKey = 'on-this-day-' + todayStr;
    const cached = getCached(cacheKey, ON_THIS_DAY_TTL);
    if (cached) { setOnThisDay(cached); return; }
    getOnThisDay()
      .then(data => { setOnThisDay(data); setCached(cacheKey, data); })
      .catch(() => setOnThisDay({ found: false }));
  }, []);

  // Search — debounce
  useEffect(() => {
    const t = setTimeout(() => setSearchDebounced(search.trim()), 400);
    return () => clearTimeout(t);
  }, [search]);

  // Search — run
  useEffect(() => {
    if (searchDebounced.length < 2) { setSearchResult(null); setSearching(false); return; }
    let cancelled = false;
    setSearching(true);
    (async () => {
      try {
        const cacheKey = 'search-' + searchDebounced;
        const cached = getCached(cacheKey, SEARCH_TTL);
        const data = cached || await searchTimeline(searchDebounced);
        if (!cached) setCached(cacheKey, data);
        if (cancelled) return;
        setSearchResult(data);

        const known = new Set(allDays.map(d => d.date));
        const missing = data.matching_dates.filter(d => !known.has(d) && !extraDays[d]);
        if (missing.length) {
          const fetched = await Promise.all(missing.map(d => getTimeline(d, d).catch(() => null)));
          if (cancelled) return;
          const patch = {};
          fetched.forEach((res, i) => {
            const day = res?.days?.[0];
            if (day) patch[missing[i]] = day;
          });
          setExtraDays(prev => ({ ...prev, ...patch }));
        }
      } finally {
        if (!cancelled) setSearching(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchDebounced]);

  const handleLoadMore = useCallback(async () => {
    if (loadingMore || !hasMore || !oldestStart) return;
    setLoadingMore(true);
    const newEnd   = offsetDate(oldestStart, -1);
    const newStart = offsetDate(newEnd, -29);
    const cacheKey = `timeline-${newStart}-${newEnd}`;
    try {
      const cached = getCached(cacheKey, TIMELINE_CACHE_TTL);
      const data = cached || await getTimeline(newStart, newEnd);
      if (!cached) setCached(cacheKey, data);
      setAllDays(prev => [...prev, ...data.days]);
      setOldestStart(newStart);
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

  const handleToggleExpand = useCallback((date) => {
    setExpandedDate(prev => prev === date ? null : date);
  }, []);

  const handleSaveReflection = useCallback(async (date, note) => {
    const saved = await saveReflection(date, note);
    setAllDays(prev => prev.map(d => d.date === date ? { ...d, reflection: saved.note } : d));
    setExtraDays(prev => prev[date] ? { ...prev, [date]: { ...prev[date], reflection: saved.note } } : prev);
  }, []);

  const handleViewThatDay = useCallback(async (date) => {
    let day = allDays.find(d => d.date === date) || extraDays[date];
    if (!day) {
      try {
        const data = await getTimeline(date, date);
        day = data.days?.[0];
        if (day) setExtraDays(prev => ({ ...prev, [date]: day }));
      } catch { return; }
    }
    if (!day) return;
    setPinnedDate(date);
    setExpandedDate(date);
    requestAnimationFrame(() => {
      cardRefs.current[date]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  }, [allDays, extraDays]);

  // Computed values
  const streak = allDays.length ? computeStreak(allDays) : 0;
  const isSearchMode = searchDebounced.length >= 2;

  let renderList;
  if (isSearchMode) {
    const matchDays = (searchResult?.matching_dates || [])
      .map(date => allDays.find(d => d.date === date) || extraDays[date])
      .filter(Boolean);
    renderList = matchDays.map(day => ({ type: 'day', day, key: day.date }));
  } else {
    renderList = buildRenderList(allDays, activeTypes, todayStr);
    if (pinnedDate && !renderList.some(item => item.type === 'day' && item.day.date === pinnedDate)) {
      const pinnedDay = allDays.find(d => d.date === pinnedDate) || extraDays[pinnedDate];
      if (pinnedDay) renderList = [{ type: 'day', day: pinnedDay, key: 'pinned-' + pinnedDate }, ...renderList];
    }
  }

  const streaksByDate = computeStreaksByDate(allDays);
  const isFiltered = !activeTypes.has('all');
  const showOnThisDay = onThisDay?.found === true && (onThisDay.account_age_days || 0) >= 365;

  // ── Render ───────────────────────────────────────────────────────────────────

  if (loading) {
    return <SkeletonLoader count={4} height={140} />;
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
          {streak} day{streak !== 1 ? 's' : ''} streak
        </div>
      )}

      {/* ── On This Day ── */}
      {showOnThisDay && (
        <OnThisDayCard data={onThisDay} onView={handleViewThatDay} />
      )}

      {/* ── Search ── */}
      <SearchBar value={search} onChange={setSearch} searching={searching} />

      {isSearchMode && searchResult && (
        <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 12 }}>
          {searchResult.total > 0
            ? `${searchResult.total} day${searchResult.total !== 1 ? 's' : ''} match '${searchDebounced}'`
            : null}
        </div>
      )}

      {/* ── No data empty state ── */}
      {!isSearchMode && renderList.length === 0 && (
        <div className="empty-state" style={{ marginTop: 40 }}>
          <div style={{ marginBottom: 12, display: 'flex', justifyContent: 'center' }}>
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
          </div>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>No data yet</div>
          <div>Start logging your meals, workouts, and weight to build your timeline.</div>
        </div>
      )}

      {isSearchMode && searchResult && searchResult.total === 0 && !searching && (
        <div className="empty-state" style={{ marginTop: 20 }}>
          <div>No days found for '{searchDebounced}'.</div>
          <div>Try searching a food, exercise, or note.</div>
        </div>
      )}

      {/* ── Day cards + month dividers ── */}
      <div className="timeline-list" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {renderList.map(item =>
          item.type === 'divider'
            ? <MonthDivider key={item.key} label={item.label} />
            : <DayCard
                key={item.key}
                day={item.day}
                todayStr={todayStr}
                streak={streaksByDate[item.day.date] || 0}
                highlightQuery={isSearchMode ? searchDebounced : ''}
                goals={goals}
                expanded={expandedDate === item.day.date}
                onToggle={() => handleToggleExpand(item.day.date)}
                onPhotoClick={handlePhotoClick}
                onSaveReflection={handleSaveReflection}
                cardRef={el => { cardRefs.current[item.day.date] = el; }}
              />
        )}
      </div>

      {/* ── Load More ── */}
      {!isSearchMode && hasMore && renderList.length > 0 && (
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
