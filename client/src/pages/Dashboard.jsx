import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  getEntries, getGoals, getWeightLogs,
  addWeightLog, updateWeightLog, deleteWeightLog,
  getMetrics, updateMetrics,
} from '../api';
import { getCached, setCached, invalidateCache } from '../utils/cache';
import SkeletonLoader from '../components/SkeletonLoader';
import { useAuth } from '../context/AuthContext';

function invalidateDashboardAndFoodlog(date) {
  invalidateCache('dashboard-' + date);
  invalidateCache('foodlog-' + date);
}

// ── Utilities ─────────────────────────────────────────────────────────────────

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function localDateStr(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function sum(entries, key) {
  return entries.reduce((acc, e) => acc + (Number(e[key]) || 0), 0);
}

function round1(value) {
  return Math.round((Number(value) || 0) * 10) / 10;
}

function shortDate(str) {
  const today = todayStr();
  const yd = new Date(); yd.setDate(yd.getDate() - 1);
  const yesterday = localDateStr(yd);
  if (str === today) return 'Today';
  if (str === yesterday) return 'Yesterday';
  return new Date(str + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function getGreeting(name) {
  const h = new Date().getHours();
  const base = h >= 5 && h < 12 ? 'Good Morning'
    : h >= 12 && h < 17 ? 'Good Afternoon'
    : h >= 17 && h < 21 ? 'Good Evening'
    : 'Good Night';
  return name?.trim() ? `${base}, ${name.trim()}.` : `${base}.`;
}

function todayLongDate() {
  const d = new Date();
  const weekday = d.toLocaleDateString('en-US', { weekday: 'long' });
  const month   = d.toLocaleDateString('en-US', { month: 'long' });
  return `${weekday}, ${month} ${d.getDate()}`;
}

// ── Existing components (logic + markup unchanged) ────────────────────────────

function CalorieRing({ eaten, goal }) {
  const pct = goal > 0 ? Math.min(eaten / goal, 1) : 0;
  const r = 68;
  const circumference = 2 * Math.PI * r;
  const dash = pct * circumference;
  const color = pct > 1 ? '#f87171' : pct > 0.85 ? '#fbbf24' : '#6c63ff';

  return (
    <div className="calorie-ring-wrap" style={{ width: 160, height: 160 }}>
      <svg width="160" height="160" viewBox="0 0 160 160">
        <circle cx="80" cy="80" r={r} fill="none" stroke="#22263a" strokeWidth="14" />
        <circle
          cx="80" cy="80" r={r}
          fill="none" stroke={color} strokeWidth="14" strokeLinecap="round"
          strokeDasharray={`${dash} ${circumference}`} strokeDashoffset="0"
          transform="rotate(-90 80 80)"
          style={{ transition: 'stroke-dasharray 0.5s ease' }}
        />
      </svg>
      <div className="calorie-center">
        <span className="cal-num" style={{ color }}>{round1(eaten)}</span>
        <span className="cal-label">/ {round1(goal)} kcal</span>
      </div>
    </div>
  );
}

function MacroBar({ label, current, goal, color }) {
  const pct = goal > 0 ? Math.min((current / goal) * 100, 100) : 0;
  return (
    <div className="macro-card">
      <div className="macro-label">{label}</div>
      <div className="macro-values">
        <span className="macro-current" style={{ color }}>{round1(current)}</span>
        <span className="macro-goal">/ {round1(goal)}g</span>
      </div>
      <div className="progress-wrap">
        <div className="progress-bar" style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  );
}

function WeightModal({ log, unit, onSave, onClose }) {
  const [value, setValue] = useState(log ? String(log.weight) : '');
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    const num = parseFloat(value);
    if (!value || isNaN(num) || num <= 0) return;
    setSaving(true);
    await onSave(num);
    setSaving(false);
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3>{log ? 'Edit Weight' : 'Log Weight'}</h3>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          <div className="settings-field" style={{ marginBottom: 24 }}>
            <label>Weight</label>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <input
                type="number" min="0" step="0.1" inputMode="decimal"
                value={value}
                onChange={e => setValue(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSave()}
                placeholder="e.g. 75.0"
                autoFocus
                style={{ flex: 1 }}
              />
              <span style={{ color: 'var(--text-muted)', fontSize: 15, fontWeight: 600, flexShrink: 0, minWidth: 28 }}>{unit}</span>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <button onClick={onClose} style={{
              background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)',
              padding: '10px 18px', borderRadius: 8, fontSize: 14, fontFamily: 'inherit',
            }}>Cancel</button>
            <button onClick={handleSave} className="btn-primary" disabled={saving || !value}>
              {saving ? 'Saving…' : log ? 'Update' : 'Save Weight'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function WeightDeleteConfirm({ log, unit, onConfirm, onCancel }) {
  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal-box" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Delete weight entry?</h3>
          <button className="modal-close" onClick={onCancel}>✕</button>
        </div>
        <div className="modal-body" style={{ textAlign: 'center' }}>
          <div style={{ marginBottom: 12, display: 'flex', justifyContent: 'center' }}>
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="var(--red)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="3,6 5,6 21,6"/><path d="M19 6l-1 14H6L5 6"/>
              <path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/>
            </svg>
          </div>
          <p style={{ color: 'var(--text-muted)', fontSize: 14, marginBottom: 24 }}>
            Remove <strong style={{ color: 'var(--text)' }}>{round1(log.weight)} {unit}</strong> logged on{' '}
            <strong style={{ color: 'var(--text)' }}>{shortDate(log.date)}</strong>?
          </p>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
            <button onClick={onCancel} style={{
              background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)',
              padding: '10px 20px', borderRadius: 8, fontSize: 14, fontFamily: 'inherit',
            }}>Keep it</button>
            <button onClick={onConfirm} style={{
              background: '#f87171', color: '#fff', border: 'none',
              padding: '10px 20px', borderRadius: 8, fontSize: 14, fontWeight: 600, fontFamily: 'inherit',
            }}>Delete</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Quick-log bottom sheets ───────────────────────────────────────────────────

function WaterSheet({ metrics, onSave, onClose }) {
  const [ml, setMl] = useState(metrics.water_ml || 0);
  const [saving, setSaving] = useState(false);
  const glasses = Math.floor(ml / 250);

  async function handleSave() {
    setSaving(true);
    try { await onSave({ water_ml: Math.max(0, ml) }); }
    catch { setSaving(false); }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3 style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#60a5fa" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2C6.5 9 5 13 5 16a7 7 0 0 0 14 0c0-3-1.5-7-7-14z"/></svg>
            Water Intake
          </h3>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          {/* Glass count + mini tracker */}
          <div style={{ textAlign: 'center', marginBottom: 20 }}>
            <div style={{ fontSize: 52, fontWeight: 800, color: '#60a5fa', lineHeight: 1 }}>{glasses}</div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4 }}>
              {glasses === 1 ? 'glass' : 'glasses'} · {ml} ml
            </div>
            <div style={{ display: 'flex', gap: 5, justifyContent: 'center', marginTop: 14 }}>
              {Array.from({ length: 8 }, (_, i) => (
                <div key={i} style={{
                  width: 22, height: 9, borderRadius: 5,
                  background: i < glasses ? '#60a5fa' : 'var(--surface2)',
                  border: '1px solid var(--border)',
                  transition: 'background 0.2s',
                }} />
              ))}
            </div>
          </div>

          {/* +/- glass buttons */}
          <div style={{ display: 'flex', gap: 16, justifyContent: 'center', alignItems: 'center', marginBottom: 20 }}>
            <button
              onClick={() => setMl(prev => Math.max(0, prev - 250))}
              disabled={ml === 0}
              style={{
                width: 56, height: 56, borderRadius: '50%', fontSize: 26, fontWeight: 700,
                background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)',
                cursor: ml === 0 ? 'not-allowed' : 'pointer',
                opacity: ml === 0 ? 0.35 : 1, fontFamily: 'inherit',
              }}
            >−</button>
            <span style={{ fontSize: 13, color: 'var(--text-muted)', minWidth: 64, textAlign: 'center' }}>
              1 glass = 250 ml
            </span>
            <button
              onClick={() => setMl(prev => prev + 250)}
              style={{
                width: 56, height: 56, borderRadius: '50%', fontSize: 26, fontWeight: 700,
                background: 'var(--accent)', border: 'none', color: '#fff',
                cursor: 'pointer', fontFamily: 'inherit',
              }}
            >+</button>
          </div>

          {/* Manual ml */}
          <div className="settings-field" style={{ marginBottom: 20 }}>
            <label>Or enter exact ml</label>
            <input
              type="number" min="0" step="50"
              value={ml}
              onChange={e => setMl(Math.max(0, parseInt(e.target.value) || 0))}
            />
          </div>

          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={onClose} style={{
              background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)',
              padding: '11px 18px', borderRadius: 8, fontSize: 14, fontFamily: 'inherit',
            }}>Cancel</button>
            <button onClick={handleSave} disabled={saving} className="btn-primary" style={{ flex: 1 }}>
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function StepsSheet({ metrics, onSave, onClose }) {
  const [steps, setSteps] = useState(metrics.steps > 0 ? String(metrics.steps) : '');
  const [saving, setSaving] = useState(false);
  const parsed = parseInt(steps) || 0;

  async function handleSave() {
    setSaving(true);
    try { await onSave({ steps: parsed }); }
    catch { setSaving(false); }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3 style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#34d399" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12h4l3-6 4 12 3-6h4"/></svg>
            Steps
          </h3>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          <div className="settings-field" style={{ marginBottom: 16 }}>
            <label>Step count</label>
            <input
              type="number" min="0" step="100"
              value={steps}
              onChange={e => setSteps(e.target.value)}
              placeholder="e.g. 8000"
              autoFocus
              style={{ fontSize: 20, textAlign: 'center', fontWeight: 700 }}
            />
          </div>

          {/* Progress toward 10k */}
          {parsed > 0 && (
            <div style={{ marginBottom: 20 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>
                <span>{parsed.toLocaleString()} steps</span>
                <span>Goal: 10,000</span>
              </div>
              <div className="progress-wrap">
                <div className="progress-bar" style={{ width: `${Math.min(parsed / 10000 * 100, 100)}%`, background: '#34d399' }} />
              </div>
              {parsed >= 10000 && (
                <div style={{ fontSize: 12, color: '#34d399', fontWeight: 600, marginTop: 6, textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="#34d399" stroke="#34d399" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round"><polygon points="12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,8.26"/></svg>
                  Goal reached!
                </div>
              )}
            </div>
          )}

          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={onClose} style={{
              background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)',
              padding: '11px 18px', borderRadius: 8, fontSize: 14, fontFamily: 'inherit',
            }}>Cancel</button>
            <button onClick={handleSave} disabled={saving} className="btn-primary" style={{ flex: 1 }}>
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function SleepSheet({ metrics, onSave, onClose }) {
  const [hours, setHours] = useState(metrics.sleep_hours > 0 ? String(metrics.sleep_hours) : '');
  const [saving, setSaving] = useState(false);
  const PRESETS = ['5', '6', '7', '7.5', '8', '9'];

  async function handleSave() {
    setSaving(true);
    try { await onSave({ sleep_hours: parseFloat(hours) || 0 }); }
    catch { setSaving(false); }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3 style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#a78bfa" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
            Sleep
          </h3>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 10 }}>
            Quick Select
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 20 }}>
            {PRESETS.map(h => (
              <button
                key={h}
                onClick={() => setHours(h)}
                style={{
                  padding: '8px 16px', borderRadius: 8, fontFamily: 'inherit', fontSize: 14, fontWeight: 600,
                  cursor: 'pointer', transition: 'all 0.15s',
                  background: hours === h ? 'var(--accent)' : 'var(--surface2)',
                  border: `1px solid ${hours === h ? 'var(--accent)' : 'var(--border)'}`,
                  color: hours === h ? '#fff' : 'var(--text)',
                }}
              >{h}h</button>
            ))}
          </div>

          <div className="settings-field" style={{ marginBottom: 20 }}>
            <label>Hours slept</label>
            <input
              type="number" min="0" max="24" step="0.1" inputMode="decimal"
              value={hours}
              onChange={e => setHours(e.target.value)}
              placeholder="e.g. 7.5"
              style={{ fontSize: 20, textAlign: 'center', fontWeight: 700 }}
            />
          </div>

          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={onClose} style={{
              background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)',
              padding: '11px 18px', borderRadius: 8, fontSize: 14, fontFamily: 'inherit',
            }}>Cancel</button>
            <button onClick={handleSave} disabled={saving || !hours} className="btn-primary" style={{ flex: 1 }}>
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main Dashboard ────────────────────────────────────────────────────────────

export default function Dashboard() {
  const { user } = useAuth();
  const [entries, setEntries]       = useState([]);
  const [goals, setGoals]           = useState({ calories: 2000, protein: 150, carbs: 250, fat: 65, weight_unit: 'kg' });
  const [weightLogs, setWeightLogs] = useState([]);
  const [metrics, setMetrics]       = useState({ steps: 0, water_ml: 0, sleep_hours: 0, yesterday: null });
  const [loading, setLoading]       = useState(true);
  const [editWeight, setEditWeight]       = useState(null);
  const [showWeightModal, setShowWeightModal] = useState(false);
  const [deleteWeight, setDeleteWeight]   = useState(null);
  const [metricModal, setMetricModal]     = useState(null); // 'water' | 'steps' | 'sleep'

  useEffect(() => {
    const cacheKey = 'dashboard-' + todayStr();
    const cached = getCached(cacheKey);
    if (cached) {
      setEntries(cached.entries);
      setGoals(cached.goals);
      setWeightLogs(cached.weightLogs);
      setMetrics(cached.metrics);
      setLoading(false);
      return;
    }
    Promise.all([
      getEntries(todayStr()),
      getGoals(),
      getWeightLogs(),
      getMetrics(todayStr()),
    ]).then(([e, g, w, m]) => {
      setEntries(e);
      setGoals(g);
      setWeightLogs(w);
      setMetrics(m);
      setLoading(false);
      setCached(cacheKey, { entries: e, goals: g, weightLogs: w, metrics: m });
    });
  }, []);

  // ── Computed ──────────────────────────────────────────────────────────────
  const cals      = sum(entries, 'calories');
  const protein   = sum(entries, 'protein');
  const carbs     = sum(entries, 'carbs');
  const fat       = sum(entries, 'fat');
  const remaining = Math.max(goals.calories - cals, 0);
  const unit      = goals.weight_unit || 'kg';
  const today     = todayStr();
  const todayWeight = weightLogs.find(w => w.date === today);
  const pastLogs    = weightLogs.filter(w => w.date !== today).slice(0, 4);

  // Quick-log card values
  const waterGlasses  = Math.floor((metrics.water_ml || 0) / 250);
  const waterFillPct  = Math.min((metrics.water_ml || 0) / 2000, 1);
  const stepsFillPct  = Math.min((metrics.steps || 0) / 10000, 1);

  // ── Weight handlers (unchanged logic) ────────────────────────────────────
  async function handleWeightSave(value) {
    if (editWeight) {
      const updated = await updateWeightLog(editWeight.id, { weight: value, unit });
      setWeightLogs(prev => prev.map(w => w.id === updated.id ? updated : w));
    } else {
      const created = await addWeightLog({ date: today, weight: value, unit });
      setWeightLogs(prev => [created, ...prev].sort((a, b) => b.date.localeCompare(a.date)));
    }
    invalidateDashboardAndFoodlog(today);
    setShowWeightModal(false);
    setEditWeight(null);
  }

  async function handleWeightDelete() {
    await deleteWeightLog(deleteWeight.id);
    setWeightLogs(prev => prev.filter(w => w.id !== deleteWeight.id));
    invalidateDashboardAndFoodlog(today);
    setDeleteWeight(null);
  }

  function openWeightLog(log = null) {
    setEditWeight(log);
    setShowWeightModal(true);
  }

  // ── Metric save handler ───────────────────────────────────────────────────
  async function handleMetricSave(data) {
    const updated = await updateMetrics({ date: today, ...data });
    // `updated` is the DB row (no `yesterday`), so spreading preserves prev.yesterday
    setMetrics(prev => ({ ...prev, ...updated }));
    invalidateDashboardAndFoodlog(today);
    setMetricModal(null);
  }

  if (loading) return <SkeletonLoader count={5} height={70} />;

  // ── Shared card style ─────────────────────────────────────────────────────
  const metricCardBase = {
    position: 'relative', overflow: 'hidden',
    background: 'var(--surface)', border: '1px solid var(--border)',
    borderRadius: 12, padding: '16px 10px',
    cursor: 'pointer', transition: 'border-color 0.15s',
    display: 'flex', flexDirection: 'column', alignItems: 'center',
    justifyContent: 'center', gap: 5, textAlign: 'center', minHeight: 104,
  };

  return (
    <div>
      {/* ── Section 1: Greeting ──────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <div style={{ fontSize: 28, fontWeight: 800, letterSpacing: '-0.5px', lineHeight: 1.15, marginBottom: 5 }}>
            {getGreeting(user?.display_name)}
          </div>
          <div style={{ fontSize: 14, color: 'var(--text-muted)' }}>
            {todayLongDate()}
          </div>
        </div>
        <Link to="/settings" style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          width: 36, height: 36, borderRadius: 10, flexShrink: 0,
          background: 'var(--surface2)', border: '1px solid var(--border)',
          color: 'var(--text-muted)', textDecoration: 'none',
        }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3"/>
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
          </svg>
        </Link>
      </div>

      {/* ── Section 3: Calorie Ring + Macros ─────────────────────────────── */}
      <div className="calorie-hero">
        <CalorieRing eaten={cals} goal={goals.calories} />
        <div className="calorie-info">
          <h2>Today's Calories</h2>
          <div className="calorie-stats">
            <div className="cal-stat">
              <div className="val" style={{ color: '#6c63ff' }}>{round1(cals)}</div>
              <div className="lbl">Eaten</div>
            </div>
            <div className="cal-stat">
              <div className="val" style={{ color: '#34d399' }}>{round1(remaining)}</div>
              <div className="lbl">Remaining</div>
            </div>
            <div className="cal-stat">
              <div className="val">{round1(goals.calories)}</div>
              <div className="lbl">Goal</div>
            </div>
          </div>
        </div>
      </div>

      <div className="macro-grid" style={{ marginBottom: 24 }}>
        <MacroBar label="Protein"  current={protein} goal={goals.protein} color="#60a5fa" />
        <MacroBar label="Carbs"    current={carbs}   goal={goals.carbs}   color="#fbbf24" />
        <MacroBar label="Fat"      current={fat}      goal={goals.fat}     color="#fb923c" />
        <MacroBar label="Calories" current={cals}     goal={goals.calories} color="#6c63ff" />
      </div>

      {/* ── Section 4: Quick-Log Cards ────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 24 }}>

        {/* Water */}
        <div
          style={metricCardBase}
          onClick={() => setMetricModal('water')}
          onMouseEnter={e => e.currentTarget.style.borderColor = '#60a5fa'}
          onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}
        >
          <div style={{
            position: 'absolute', bottom: 0, left: 0, right: 0,
            height: `${waterFillPct * 100}%`,
            background: 'rgba(96,165,250,0.1)',
            transition: 'height 0.5s ease',
            pointerEvents: 'none',
          }} />
          <div style={{ position: 'relative' }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#60a5fa" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2C6.5 9 5 13 5 16a7 7 0 0 0 14 0c0-3-1.5-7-7-14z"/></svg>
          </div>
          <div style={{ position: 'relative', fontSize: 22, fontWeight: 800, color: '#60a5fa', lineHeight: 1 }}>
            {waterGlasses}
          </div>
          <div style={{ position: 'relative', fontSize: 11, color: 'var(--text-muted)', fontWeight: 500 }}>
            glasses
          </div>
        </div>

        {/* Steps */}
        <div
          style={metricCardBase}
          onClick={() => setMetricModal('steps')}
          onMouseEnter={e => e.currentTarget.style.borderColor = '#34d399'}
          onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}
        >
          <div style={{
            position: 'absolute', bottom: 0, left: 0, right: 0,
            height: `${stepsFillPct * 100}%`,
            background: 'rgba(52,211,153,0.1)',
            transition: 'height 0.5s ease',
            pointerEvents: 'none',
          }} />
          <div style={{ position: 'relative' }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#34d399" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12h4l3-6 4 12 3-6h4"/></svg>
          </div>
          <div style={{ position: 'relative', fontSize: 14, fontWeight: 800, color: '#34d399', lineHeight: 1 }}>
            {(metrics.steps || 0).toLocaleString()}
          </div>
          <div style={{ position: 'relative', fontSize: 11, color: 'var(--text-muted)', fontWeight: 500 }}>
            steps
          </div>
        </div>

        {/* Sleep */}
        <div
          style={metricCardBase}
          onClick={() => setMetricModal('sleep')}
          onMouseEnter={e => e.currentTarget.style.borderColor = '#a78bfa'}
          onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}
        >
          <div style={{ position: 'relative' }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#a78bfa" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
          </div>
          <div style={{ position: 'relative', fontSize: (metrics.sleep_hours || 0) > 0 ? 18 : 24, fontWeight: 800, color: '#a78bfa', lineHeight: 1 }}>
            {(metrics.sleep_hours || 0) > 0 ? `${round1(metrics.sleep_hours)}h` : '—'}
          </div>
          <div style={{ position: 'relative', fontSize: 11, color: 'var(--text-muted)', fontWeight: 500 }}>
            sleep
          </div>
        </div>
      </div>

      {/* ── Section 5: Weight ────────────────────────────────────────────── */}
      <div className="card" style={{ marginBottom: 24 }}>
        <div className="section-header" style={{ marginBottom: 12 }}>
          <span className="section-title">Weight</span>
          <button
            onClick={() => openWeightLog(null)}
            style={{
              background: 'var(--accent)', color: '#fff', border: 'none',
              padding: '7px 14px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer',
            }}
          >+ Log Weight</button>
        </div>

        {todayWeight ? (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 12,
            background: 'rgba(108,99,255,0.08)', border: '1px solid rgba(108,99,255,0.2)',
            borderRadius: 10, padding: '12px 16px',
            marginBottom: pastLogs.length ? 10 : 0,
          }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 2 }}>Today</div>
              <div style={{ fontSize: 22, fontWeight: 700 }}>
                {round1(todayWeight.weight)} <span style={{ fontSize: 14, color: 'var(--text-muted)', fontWeight: 400 }}>{unit}</span>
              </div>
            </div>
            <button className="btn-icon" onClick={() => openWeightLog(todayWeight)} title="Edit">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
              </svg>
            </button>
            <button className="btn-delete" onClick={() => setDeleteWeight(todayWeight)} title="Delete">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          </div>
        ) : (
          <p style={{ color: 'var(--text-muted)', fontSize: 14, marginBottom: pastLogs.length ? 10 : 0 }}>
            No weight logged today.
          </p>
        )}

        {pastLogs.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {pastLogs.map(w => (
              <div key={w.id} style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '9px 12px', borderRadius: 8, background: 'var(--surface2)',
              }}>
                <span style={{ fontSize: 13, color: 'var(--text-muted)', minWidth: 70 }}>{shortDate(w.date)}</span>
                <span style={{ flex: 1, fontSize: 14, fontWeight: 600 }}>
                  {round1(w.weight)} <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}>{unit}</span>
                </span>
                <button className="btn-icon" onClick={() => openWeightLog(w)} title="Edit" style={{ width: 30, height: 30 }}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                  </svg>
                </button>
                <button className="btn-delete" onClick={() => setDeleteWeight(w)} title="Delete" style={{ width: 30, height: 30 }}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                  </svg>
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Section 6: Today's Food Preview ──────────────────────────────── */}
      <div className="section-header">
        <span className="section-title">Today's Entries</span>
        <Link to="/log" style={{ fontSize: 13, color: 'var(--accent-light)' }}>View all →</Link>
      </div>

      {entries.length === 0 ? (
        <div className="empty-state">
          No food logged today.{' '}
          <Link to="/log" style={{ color: 'var(--accent-light)' }}>Add your first entry →</Link>
        </div>
      ) : (
        <div className="entry-list">
          {entries.slice(0, 5).map(e => (
            <div key={e.id} className="entry-row">
              <span className="entry-name">
                {e.entry_type && e.entry_type !== 'single' && <span aria-hidden="true">🍽️ </span>}
                {e.entry_type && e.entry_type !== 'single' ? (e.source_name || e.food_name) : e.food_name}
              </span>
              <div className="entry-macros">
                <div className="entry-macro">
                  <div className="val" style={{ color: '#6c63ff' }}>{round1(e.calories)}</div>
                  <div className="lbl">kcal</div>
                </div>
                <div className="entry-macro">
                  <div className="val" style={{ color: '#60a5fa' }}>{round1(e.protein)}g</div>
                  <div className="lbl">protein</div>
                </div>
                <div className="entry-macro">
                  <div className="val" style={{ color: '#fbbf24' }}>{round1(e.carbs)}g</div>
                  <div className="lbl">carbs</div>
                </div>
                <div className="entry-macro">
                  <div className="val" style={{ color: '#fb923c' }}>{round1(e.fat)}g</div>
                  <div className="lbl">fat</div>
                </div>
              </div>
            </div>
          ))}
          {entries.length > 5 && (
            <div style={{ textAlign: 'center', padding: '10px 0', fontSize: 13, color: 'var(--text-muted)' }}>
              +{entries.length - 5} more —{' '}
              <Link to="/log" style={{ color: 'var(--accent-light)' }}>view all</Link>
            </div>
          )}
        </div>
      )}

      {/* ── Modals ───────────────────────────────────────────────────────── */}
      {showWeightModal && (
        <WeightModal
          log={editWeight} unit={unit}
          onSave={handleWeightSave}
          onClose={() => { setShowWeightModal(false); setEditWeight(null); }}
        />
      )}
      {deleteWeight && (
        <WeightDeleteConfirm
          log={deleteWeight} unit={unit}
          onConfirm={handleWeightDelete}
          onCancel={() => setDeleteWeight(null)}
        />
      )}
      {metricModal === 'water' && (
        <WaterSheet metrics={metrics} onSave={handleMetricSave} onClose={() => setMetricModal(null)} />
      )}
      {metricModal === 'steps' && (
        <StepsSheet metrics={metrics} onSave={handleMetricSave} onClose={() => setMetricModal(null)} />
      )}
      {metricModal === 'sleep' && (
        <SleepSheet metrics={metrics} onSave={handleMetricSave} onClose={() => setMetricModal(null)} />
      )}
    </div>
  );
}
