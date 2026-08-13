import { useState, useEffect, useRef } from 'react';
import {
  ResponsiveContainer, LineChart, Line, BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, ReferenceLine,
} from 'recharts';
import {
  getWorkoutSessions, getRecentWorkoutSessions, getWorkoutTemplates,
  getActiveWorkoutSession,
  createWorkoutSession, updateWorkoutSession, deleteWorkoutSession,
  addExerciseToSession, removeExerciseFromSession,
  addSet, updateSet, deleteSet,
  searchExercises, createExercise,
  getExerciseHistory, getExerciseLastSession,
  createWorkoutTemplate, updateWorkoutTemplate, deleteWorkoutTemplate,
  getGoals,
} from '../api';
import SkeletonLoader from '../components/SkeletonLoader';
import BottomSheet from '../components/BottomSheet';
import { getCached, setCached, invalidateCache } from '../utils/cache';
import { getToken } from '../utils/auth';

// GET /api/prs and /api/exercises/:name/volume-history have no wrapper in api.js yet,
// so fetch them directly using the same bearer-token pattern apiFetch uses internally.
async function fetchJson(path) {
  const token = getToken();
  const res = await fetch(path, { headers: token ? { Authorization: 'Bearer ' + token } : {} });
  if (!res.ok) throw new Error('Request failed');
  return res.json();
}

// ── Small inline icons (stand-ins for the ⚙ ✓ ✕ ✎ symbols used throughout) ────

function IconGear({ size = 12 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      <circle cx="12" cy="12" r="3"/>
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
    </svg>
  );
}
function IconCheck({ size = 14 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      <polyline points="20,6 9,17 4,12"/>
    </svg>
  );
}
function IconXSmall({ size = 14 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" style={{ flexShrink: 0 }}>
      <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
    </svg>
  );
}

// ── Utilities ─────────────────────────────────────────────────────────────────

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function shortDate(str) {
  return new Date(str + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function fmtDuration(startedAt, finishedAt) {
  const ms = new Date(finishedAt) - new Date(startedAt);
  const m = Math.floor(ms / 60000);
  const h = Math.floor(m / 60);
  return h > 0 ? `${h}h ${m % 60}m` : `${m}m`;
}

function fmtElapsed(startedAt) {
  const ms = Date.now() - new Date(startedAt).getTime();
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  if (h > 0) return `${h}:${String(m % 60).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  return `${String(m).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

function getRestDuration() { return parseInt(localStorage.getItem('workout_rest_duration') || '90'); }
function saveRestDuration(d) { localStorage.setItem('workout_rest_duration', String(d)); }

function round1(value) {
  return Math.round((Number(value) || 0) * 10) / 10;
}

// ── EditableTitle ─────────────────────────────────────────────────────────────

function EditableTitle({ value, onSave }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  if (editing) {
    return (
      <input autoFocus value={draft}
        onChange={e => setDraft(e.target.value)}
        onBlur={() => { onSave(draft); setEditing(false); }}
        onKeyDown={e => {
          if (e.key === 'Enter') { onSave(draft); setEditing(false); }
          if (e.key === 'Escape') setEditing(false);
        }}
        style={{ fontSize: 20, fontWeight: 800, background: 'transparent', border: 'none',
          borderBottom: '2px solid var(--accent)', color: 'var(--text)', fontFamily: 'inherit',
          padding: '0 0 2px', width: '100%', outline: 'none' }}
      />
    );
  }
  return (
    <div onClick={() => { setDraft(value); setEditing(true); }}
      style={{ fontSize: 20, fontWeight: 800, cursor: 'text' }}>
      {value}
    </div>
  );
}

// ── Rest Timer Banner ─────────────────────────────────────────────────────────

function RestTimerBanner({ timer, restDuration, onSkip, onChangeDuration }) {
  const [showPicker, setShowPicker] = useState(false);
  const pct = timer.total > 0 ? timer.secsLeft / timer.total : 0;
  const m = Math.floor(timer.secsLeft / 60);
  const s = timer.secsLeft % 60;
  const circumference = 2 * Math.PI * 24;

  return (
    <div className="fade-in-fast" style={{
      position: 'fixed',
      bottom: 'calc(var(--bottom-nav-h, 64px) + 8px)',
      left: 12, right: 12, zIndex: 900,
      background: 'rgba(20,22,40,0.97)', backdropFilter: 'blur(12px)',
      border: '1px solid var(--border)', borderRadius: 16,
      padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 14,
      boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
    }}>
      <svg width="56" height="56" style={{ flexShrink: 0 }}>
        <circle cx="28" cy="28" r="24" fill="none" stroke="var(--surface2)" strokeWidth="4"/>
        <circle cx="28" cy="28" r="24" fill="none"
          stroke={timer.secsLeft <= 10 ? 'var(--red)' : 'var(--accent)'}
          strokeWidth="4" strokeLinecap="round"
          strokeDasharray={`${pct * circumference} ${circumference}`}
          transform="rotate(-90 28 28)"
          style={{ transition: 'stroke-dasharray 0.9s linear' }}
        />
        <text x="28" y="33" textAnchor="middle" fill="white"
          fontSize="13" fontWeight="700" fontFamily="monospace">
          {`${m}:${String(s).padStart(2, '0')}`}
        </text>
      </svg>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 2 }}>Rest</div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
          {restDuration}s default
          {' · '}
          <span onClick={() => setShowPicker(p => !p)}
            style={{ cursor: 'pointer', color: 'var(--accent-light)', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            change <IconGear />
          </span>
        </div>
        {showPicker && (
          <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
            {[60, 90, 120, 180].map(d => (
              <button key={d} onClick={() => { onChangeDuration(d); setShowPicker(false); }}
                style={{
                  padding: '4px 10px', borderRadius: 99, fontSize: 11, fontWeight: 600,
                  border: '1px solid var(--border)', cursor: 'pointer',
                  background: restDuration === d ? 'var(--accent)' : 'var(--surface2)',
                  color: restDuration === d ? '#fff' : 'var(--text-muted)',
                }}>
                {d < 60 ? `${d}s` : `${d / 60}m`}
              </button>
            ))}
          </div>
        )}
      </div>
      <button onClick={onSkip}
        style={{ background: 'var(--surface2)', border: '1px solid var(--border)',
          color: 'var(--text)', padding: '8px 14px', borderRadius: 8,
          fontSize: 13, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}>
        Skip
      </button>
    </div>
  );
}

// ── Exercise Search Sheet ─────────────────────────────────────────────────────

function ExerciseSearchSheet({ onAdd, onClose }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newMuscle, setNewMuscle] = useState('');
  const [newEquip, setNewEquip] = useState('');
  const [creating, setCreating] = useState(false);

  useEffect(() => { searchExercises('').then(setResults); }, []);

  useEffect(() => {
    const t = setTimeout(() => searchExercises(query).then(setResults), 200);
    return () => clearTimeout(t);
  }, [query]);

  async function handleCreate(e) {
    e.preventDefault();
    if (!newName.trim()) return;
    setCreating(true);
    try {
      const ex = await createExercise({ name: newName.trim(), muscle_group: newMuscle, equipment: newEquip });
      onAdd(ex.name);
    } catch {}
    setCreating(false);
  }

  return (
    <BottomSheet onClose={onClose} title="Add Exercise" expandable>
      <input autoFocus value={query} onChange={e => setQuery(e.target.value)}
        placeholder="Search exercises…"
        style={{ width: '100%', padding: '10px 14px', borderRadius: 8, marginBottom: 10,
          background: 'var(--surface2)', border: '1px solid var(--border)',
          color: 'var(--text)', fontSize: 14, fontFamily: 'inherit' }}
      />
      <div style={{ marginBottom: 8 }}>
        {results.map(ex => (
          <div key={ex.id} onClick={() => onAdd(ex.name)}
            className="hover-bg"
            style={{ padding: '10px 12px', borderRadius: 8, cursor: 'pointer',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontWeight: 600, fontSize: 14 }}>{ex.name}</div>
              {(ex.muscle_group || ex.equipment) && (
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                  {[ex.muscle_group, ex.equipment].filter(Boolean).join(' · ')}
                </div>
              )}
            </div>
            <span style={{ color: 'var(--accent-light)', fontSize: 20, lineHeight: 1 }}>+</span>
          </div>
        ))}
      </div>
      {!showCreate ? (
        <button onClick={() => setShowCreate(true)}
          style={{ width: '100%', padding: '10px', borderRadius: 8, background: 'transparent',
            border: '1px dashed var(--border)', color: 'var(--text-muted)', fontSize: 13,
            cursor: 'pointer', fontFamily: 'inherit' }}>
          + Create new exercise
        </button>
      ) : (
        <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 4 }}>
          <input value={newName} onChange={e => setNewName(e.target.value)}
            placeholder="Exercise name" required autoFocus
            style={{ padding: '9px 12px', borderRadius: 8, background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)', fontSize: 14, fontFamily: 'inherit' }}
          />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <input value={newMuscle} onChange={e => setNewMuscle(e.target.value)}
              placeholder="Muscle group"
              style={{ padding: '9px 12px', borderRadius: 8, background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)', fontSize: 13, fontFamily: 'inherit' }}
            />
            <input value={newEquip} onChange={e => setNewEquip(e.target.value)}
              placeholder="Equipment"
              style={{ padding: '9px 12px', borderRadius: 8, background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)', fontSize: 13, fontFamily: 'inherit' }}
            />
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" onClick={() => setShowCreate(false)}
              style={{ flex: 1, padding: '9px', borderRadius: 8, background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>
              Cancel
            </button>
            <button type="submit" disabled={creating}
              style={{ flex: 2, padding: '9px', borderRadius: 8, background: 'var(--accent)', color: '#fff', border: 'none', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
              {creating ? 'Creating…' : 'Create & Add'}
            </button>
          </div>
        </form>
      )}
    </BottomSheet>
  );
}

// ── Exercise Progress Sheet ───────────────────────────────────────────────────

function ExerciseProgressSheet({ exerciseName, weightUnit, onClose }) {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getExerciseHistory(exerciseName).then(h => { setHistory(h); setLoading(false); });
  }, [exerciseName]);

  const chartData = history.slice().reverse().map(h => ({
    date: shortDate(h.date),
    rm1: h.estimated_1rm,
    best: h.best_set?.weight || 0,
  }));

  const bestEver = history.reduce((b, h) => {
    if (!h.best_set) return b;
    return !b || h.best_set.weight > b.weight ? { ...h.best_set, date: h.date } : b;
  }, null);

  const best1RM = history.reduce((max, h) =>
    h.estimated_1rm != null && h.estimated_1rm > max ? h.estimated_1rm : max, 0);

  const ttStyle = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 };

  return (
    <BottomSheet onClose={onClose} title={exerciseName}>
      {loading ? (
            <div className="empty-state">Loading…</div>
          ) : history.length < 2 ? (
            <div className="empty-state" style={{ position: 'relative', marginBottom: 16, overflow: 'hidden', borderRadius: 10 }}>
              <svg viewBox="0 0 300 90" preserveAspectRatio="none" style={{
                position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0.12, pointerEvents: 'none',
              }}>
                <polyline points="0,70 40,55 80,60 120,35 160,42 200,20 240,28 300,8"
                  fill="none" stroke="var(--accent-light)" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              <div style={{ position: 'relative' }}>
                {history.length === 0 ? 'No history yet.' : 'Log at least 2 sessions to see charts.'}
              </div>
            </div>
          ) : (
            <>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 8 }}>
                Estimated 1RM
              </div>
              <ResponsiveContainer width="100%" height={170}>
                <LineChart data={chartData} margin={{ top: 4, right: 8, bottom: 0, left: -20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--surface2)"/>
                  <XAxis dataKey="date" tick={{ fill: 'var(--text-muted)', fontSize: 10 }} tickLine={false}/>
                  <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 10 }} tickLine={false} axisLine={false}/>
                  <Tooltip contentStyle={ttStyle} labelStyle={{ color: 'var(--text)' }} itemStyle={{ color: 'var(--accent)' }}/>
                  <Line type="monotone" dataKey="rm1" stroke="var(--accent)" strokeWidth={2} dot={{ fill: 'var(--accent)', r: 3 }} name="Est. 1RM"/>
                </LineChart>
              </ResponsiveContainer>

              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 8, marginTop: 20 }}>
                Best Working Weight
              </div>
              <ResponsiveContainer width="100%" height={170}>
                <LineChart data={chartData} margin={{ top: 4, right: 8, bottom: 0, left: -20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--surface2)"/>
                  <XAxis dataKey="date" tick={{ fill: 'var(--text-muted)', fontSize: 10 }} tickLine={false}/>
                  <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 10 }} tickLine={false} axisLine={false}/>
                  <Tooltip contentStyle={ttStyle} labelStyle={{ color: 'var(--text)' }} itemStyle={{ color: 'var(--blue)' }}/>
                  <Line type="monotone" dataKey="best" stroke="var(--blue)" strokeWidth={2} dot={{ fill: 'var(--blue)', r: 3 }} name="Best weight"/>
                </LineChart>
              </ResponsiveContainer>
            </>
          )}

          {bestEver && (
            <div style={{ background: 'rgba(108,99,255,0.08)', border: '1px solid rgba(108,99,255,0.2)', borderRadius: 10, padding: '12px 16px', marginTop: 20 }}>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>Best</div>
              <div style={{ fontSize: 20, fontWeight: 700 }}>{round1(bestEver.weight)} × {bestEver.reps}</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{shortDate(bestEver.date)}</div>
              {best1RM > 0 && (
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 6 }}>
                  Est. 1RM: {round1(best1RM)} {weightUnit}
                </div>
              )}
            </div>
          )}

          {history.length > 0 && (
            <div style={{ marginTop: 20 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 8 }}>
                History ({history.length} session{history.length !== 1 ? 's' : ''})
              </div>
              {history.slice(0, 5).map((h, i) => (
                <div key={i} style={{ padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>{shortDate(h.date)}</div>
                    {h.best_set && (
                      <div style={{ fontSize: 12, color: 'var(--accent-light)', fontWeight: 600 }}>
                        Best: {round1(h.best_set.weight)} × {h.best_set.reps}
                      </div>
                    )}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                    {h.sets.map(s => `${round1(s.weight)}×${s.reps}`).join(', ') || '—'}
                  </div>
                </div>
              ))}
            </div>
          )}
    </BottomSheet>
  );
}

// ── Workout Summary Sheet ─────────────────────────────────────────────────────

function EditIcon({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
    </svg>
  );
}

function WorkoutSummarySheet({ session, mode, onSave, onDelete, onClose, onExercisesChanged }) {
  const [notes, setNotes] = useState(session.notes || '');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [prs, setPrs] = useState({});
  const [loadingPrs, setLoadingPrs] = useState(mode === 'finish');
  const [editing, setEditing] = useState(false);
  const [exercises, setExercises] = useState(session.exercises);

  function handleSetField(exId, setId, field, value) {
    setExercises(prev => prev.map(ex => ex.id !== exId ? ex : {
      ...ex, sets: ex.sets.map(s => s.id === setId ? { ...s, [field]: value } : s),
    }));
  }

  async function handleSetBlur(exId, setId) {
    const ex = exercises.find(e => e.id === exId);
    const s = ex?.sets.find(s => s.id === setId);
    if (!s) return;
    try {
      await updateSet(setId, { weight: +s.weight || 0, reps: +s.reps || 0 });
      onExercisesChanged?.(exercises);
    } catch (err) {
      alert(err.message || 'Could not save that change — please try again.');
    }
  }

  async function handleDeleteSetRow(exId, setId) {
    await deleteSet(setId);
    setExercises(prev => {
      const next = prev.map(ex => ex.id !== exId ? ex : { ...ex, sets: ex.sets.filter(s => s.id !== setId) });
      onExercisesChanged?.(next);
      return next;
    });
  }

  const totalSets = session.exercises.reduce((n, ex) => n + ex.sets.length, 0);
  const totalVol  = session.exercises.reduce((n, ex) =>
    n + ex.sets.reduce((s, set) => s + set.weight * set.reps, 0), 0);
  const duration = fmtDuration(session.started_at,
    session.finished_at || new Date().toISOString());

  useEffect(() => {
    if (mode !== 'finish') return;
    (async () => {
      const result = {};
      for (const ex of session.exercises) {
        if (!ex.sets.length) continue;
        const bestNow = ex.sets.reduce((b, s) => !b || s.weight > b.weight ? s : b, null);
        if (!bestNow || bestNow.weight === 0) continue;
        try {
          const hist = await getExerciseHistory(ex.exercise_name);
          const prevBest = hist.reduce((b, h) => {
            const w = h.best_set?.weight || 0; return w > b ? w : b;
          }, 0);
          if (bestNow.weight > prevBest) result[ex.exercise_name] = bestNow;
        } catch {}
      }
      setPrs(result);
      setLoadingPrs(false);
    })();
  }, []);

  return (
    <BottomSheet
      onClose={onClose}
      onBackdropClick={mode === 'view' ? onClose : () => {}}
      title={
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
          <h3 style={{ display: 'flex', alignItems: 'center', gap: 7, margin: 0 }}>
            {mode === 'finish' && <svg width="16" height="16" viewBox="0 0 24 24" fill="var(--yellow)" stroke="var(--yellow)" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round"><polygon points="12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,8.26"/></svg>}
            {mode === 'finish' ? 'Workout Complete' : session.name}
          </h3>
          {mode === 'view' && (
            <button onClick={() => setEditing(e => !e)}
              aria-label="Edit workout"
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                width: 36, height: 36, borderRadius: '50%',
                background: editing ? 'var(--accent)' : 'var(--surface2)',
                border: 'none', color: editing ? '#fff' : 'var(--text-muted)', cursor: 'pointer',
              }}>
              <EditIcon size={15} />
            </button>
          )}
        </div>
      }
    >
          <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
            {[{ label: 'Duration', val: duration }, { label: 'Sets', val: totalSets }, { label: 'Volume', val: `${Math.round(totalVol).toLocaleString()} lbs` }].map(({ label, val }) => (
              <div key={label} style={{ flex: 1, textAlign: 'center', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 6px' }}>
                <div style={{ fontSize: 17, fontWeight: 800 }}>{val}</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{label}</div>
              </div>
            ))}
          </div>

          {mode === 'finish' && !loadingPrs && Object.keys(prs).length > 0 && (
            <div className="pr-celebrate" style={{ background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.3)', borderRadius: 10, padding: '12px 16px', marginBottom: 20 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--yellow)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 5 }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--yellow)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2z"/></svg>
                Personal Records
              </div>
              {Object.entries(prs).map(([name, set], i) => (
                <div key={name} className="pr-celebrate-row" style={{ '--d': `${120 + i * 60}ms`, fontSize: 13, color: 'var(--yellow)', fontWeight: 600, marginBottom: 2 }}>
                  {name} — {round1(set.weight)} × {set.reps}
                </div>
              ))}
            </div>
          )}

          {mode === 'view' && exercises.map(ex => {
            const cols = editing ? '2rem 1fr 1fr 1.6rem' : '2rem 1fr 1fr';
            const inputStyle = {
              width: '100%', padding: '5px 6px', borderRadius: 6, textAlign: 'center',
              background: 'var(--surface)', border: '1px solid var(--border)',
              color: 'var(--text)', fontSize: 13, fontWeight: 600, fontFamily: 'inherit',
            };
            return (
              <div key={ex.id} style={{
                background: 'var(--surface2)', border: '1px solid var(--border)',
                borderRadius: 12, padding: '12px 14px', marginBottom: 12,
              }}>
                <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 8 }}>{ex.exercise_name}</div>
                {ex.sets.length === 0 ? (
                  <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>No sets logged</div>
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: cols, gap: '6px 10px', fontSize: 12, alignItems: 'center' }}>
                    <span style={{ color: 'var(--text-muted)' }}>#</span>
                    <span style={{ color: 'var(--text-muted)' }}>Weight</span>
                    <span style={{ color: 'var(--text-muted)' }}>Reps</span>
                    {editing && <span />}
                    {ex.sets.map(s => (
                      <>
                        <span key={`n${s.id}`} style={{ color: 'var(--text-muted)' }}>{s.set_number}</span>
                        {editing ? (
                          <input key={`w${s.id}`} type="number" inputMode="decimal" value={s.weight}
                            onChange={e => handleSetField(ex.id, s.id, 'weight', e.target.value)}
                            onBlur={() => handleSetBlur(ex.id, s.id)}
                            style={inputStyle} />
                        ) : (
                          <span key={`w${s.id}`} style={{ fontWeight: 600 }}>{s.weight === 0 ? 'BW' : round1(s.weight)}</span>
                        )}
                        {editing ? (
                          <input key={`r${s.id}`} type="number" inputMode="numeric" value={s.reps}
                            onChange={e => handleSetField(ex.id, s.id, 'reps', e.target.value)}
                            onBlur={() => handleSetBlur(ex.id, s.id)}
                            style={inputStyle} />
                        ) : (
                          <span key={`r${s.id}`} style={{ fontWeight: 600 }}>{s.reps}</span>
                        )}
                        {editing && (
                          <button key={`d${s.id}`} onClick={() => handleDeleteSetRow(ex.id, s.id)}
                            style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
                            <IconXSmall />
                          </button>
                        )}
                      </>
                    ))}
                  </div>
                )}
              </div>
            );
          })}

          {mode === 'finish' ? (
            <>
              <textarea value={notes} onChange={e => setNotes(e.target.value)}
                placeholder="How did it go? (optional)"
                rows={3}
                style={{ width: '100%', padding: '10px 12px', borderRadius: 8, resize: 'vertical',
                  background: 'var(--surface2)', border: '1px solid var(--border)',
                  color: 'var(--text)', fontSize: 14, fontFamily: 'inherit', marginBottom: 16 }}
              />
              {saveError && (
                <div style={{ color: 'var(--red)', fontSize: 13, marginBottom: 8, textAlign: 'center' }}>{saveError}</div>
              )}
              <button onClick={async () => { setSaving(true); setSaveError(null); try { await onSave(notes); } catch (err) { setSaveError(err.message || 'Save failed — please try again.'); setSaving(false); } }}
                disabled={saving}
                style={{ width: '100%', background: 'var(--green)', color: '#000', border: 'none',
                  padding: '13px', borderRadius: 8, fontFamily: 'inherit', fontSize: 15,
                  fontWeight: 700, cursor: 'pointer', opacity: saving ? 0.6 : 1 }}>
                {saving ? 'Saving…' : 'Save & Finish'}
              </button>
            </>
          ) : (
            <>
              {session.notes ? (
                <div style={{ fontSize: 13, color: 'var(--text-muted)', padding: '10px 14px', background: 'var(--surface2)', borderRadius: 8, marginBottom: 16 }}>
                  {session.notes}
                </div>
              ) : null}
              {confirmDelete ? (
                <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                  <button onClick={() => setConfirmDelete(false)}
                    style={{ flex: 1, padding: '10px', borderRadius: 8, background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>
                    Cancel
                  </button>
                  <button onClick={async () => { setDeleting(true); await onDelete(); }}
                    disabled={deleting}
                    style={{ flex: 1, padding: '10px', borderRadius: 8, background: 'var(--red)', color: '#fff', border: 'none', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                    {deleting ? 'Deleting…' : 'Confirm Delete'}
                  </button>
                </div>
              ) : (
                <button onClick={() => setConfirmDelete(true)}
                  style={{ marginTop: 8, width: '100%', padding: '10px', borderRadius: 8, background: 'transparent', border: '1px solid var(--red)', color: 'var(--red)', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                  Delete Workout
                </button>
              )}
            </>
          )}
    </BottomSheet>
  );
}

// ── Template Editor Sheet ─────────────────────────────────────────────────────

function TemplateEditorSheet({ template, onSave, onClose }) {
  const [name, setName] = useState(template?.name || '');
  const nextKey = useRef(0);
  const [rows, setRows] = useState(() =>
    (template?.exercises || []).map(e => ({ _k: nextKey.current++, exercise_name: e.exercise_name, target_sets: e.target_sets, target_reps: e.target_reps }))
  );
  const [exQuery, setExQuery] = useState('');
  const [exResults, setExResults] = useState([]);
  const [showSearch, setShowSearch] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!showSearch) return;
    searchExercises('').then(setExResults);
  }, [showSearch]);

  useEffect(() => {
    if (!showSearch) return;
    const t = setTimeout(() => searchExercises(exQuery).then(setExResults), 200);
    return () => clearTimeout(t);
  }, [exQuery]);

  async function handleSave(e) {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    const payload = { name: name.trim(), notes: '', exercises: rows.map(r => ({ exercise_name: r.exercise_name, target_sets: +r.target_sets || 3, target_reps: +r.target_reps || 8 })) };
    try {
      const saved = template ? await updateWorkoutTemplate(template.id, payload) : await createWorkoutTemplate(payload);
      onSave(saved);
    } catch {}
    setSaving(false);
  }

  return (
    <BottomSheet onClose={onClose} title={template ? 'Edit Template' : 'New Template'}>
          <form onSubmit={handleSave}>
            <div className="settings-field" style={{ marginBottom: 16 }}>
              <label>Template Name</label>
              <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Upper Body" required/>
            </div>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: rows.length ? 6 : 0 }}>
              Exercises
            </div>
            {rows.length > 0 && (
              <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 6 }}>
                name · sets · reps
              </div>
            )}
            {rows.map((row, i) => (
              <div key={row._k} style={{ display: 'grid', gridTemplateColumns: '1fr 3.2rem 3.2rem 2rem', gap: 6, marginBottom: 6, alignItems: 'center' }}>
                <div style={{ fontSize: 13, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.exercise_name}</div>
                <input type="number" min="1" value={row.target_sets}
                  onChange={e => setRows(rs => rs.map((r, j) => j === i ? { ...r, target_sets: e.target.value } : r))}
                  style={{ padding: '6px 4px', textAlign: 'center', borderRadius: 6, background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)', fontSize: 13, fontFamily: 'inherit' }}
                />
                <input type="number" min="1" value={row.target_reps}
                  onChange={e => setRows(rs => rs.map((r, j) => j === i ? { ...r, target_reps: e.target.value } : r))}
                  style={{ padding: '6px 4px', textAlign: 'center', borderRadius: 6, background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)', fontSize: 13, fontFamily: 'inherit' }}
                />
                <button type="button" onClick={() => setRows(rs => rs.filter((_, j) => j !== i))}
                  style={{ background: 'none', border: 'none', color: 'var(--red)', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><IconXSmall size={15} /></button>
              </div>
            ))}
            {showSearch ? (
              <div style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 10, padding: 12, marginBottom: 12, marginTop: 8 }}>
                <input autoFocus value={exQuery} onChange={e => setExQuery(e.target.value)}
                  placeholder="Search exercises…"
                  style={{ width: '100%', padding: '8px 10px', borderRadius: 6, background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)', fontSize: 13, fontFamily: 'inherit', marginBottom: 8 }}
                />
                <div style={{ maxHeight: 180, overflowY: 'auto' }}>
                  {exResults.map(ex => (
                    <div key={ex.id}
                      onClick={() => { setRows(rs => [...rs, { _k: nextKey.current++, exercise_name: ex.name, target_sets: 3, target_reps: 8 }]); setShowSearch(false); setExQuery(''); }}
                      className="hover-bg-surface"
                      style={{ padding: '8px 10px', borderRadius: 6, cursor: 'pointer', fontSize: 13 }}>
                      {ex.name}
                    </div>
                  ))}
                </div>
                <button type="button" onClick={() => setShowSearch(false)}
                  style={{ marginTop: 4, background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: 12, cursor: 'pointer' }}>
                  Cancel
                </button>
              </div>
            ) : (
              <button type="button" onClick={() => setShowSearch(true)}
                style={{ width: '100%', padding: '9px', borderRadius: 8, background: 'transparent', border: '1px dashed var(--border)', color: 'var(--text-muted)', fontSize: 13, cursor: 'pointer', marginBottom: 16, marginTop: 8, fontFamily: 'inherit' }}>
                + Add Exercise
              </button>
            )}
            <button type="submit" disabled={saving} className="btn-primary" style={{ width: '100%' }}>
              {saving ? 'Saving…' : template ? 'Save Changes' : 'Create Template'}
            </button>
          </form>
    </BottomSheet>
  );
}

// ── Exercise Card (active session) ────────────────────────────────────────────

function ExerciseCard({ exercise, lastSession, onSetsChanged, onRemove, onViewProgress, onSetLogged }) {
  const prefilled = useRef(false);
  const [pw, setPw] = useState('');
  const [pr, setPr] = useState('');
  const [prpe, setPrpe] = useState('');
  const [bwMode, setBwMode] = useState(false);
  const [logging, setLogging] = useState(false);

  // Pre-fill once when lastSession resolves (undefined = loading, null = never logged)
  useEffect(() => {
    if (prefilled.current) return;
    if (lastSession === undefined) return;
    if (exercise.sets.length > 0) {
      const last = exercise.sets[exercise.sets.length - 1];
      if (last.weight === 0) { setBwMode(true); } else { setPw(String(last.weight)); }
      setPr(String(last.reps));
    } else if (lastSession?.sets?.length > 0) {
      const last = lastSession.sets[lastSession.sets.length - 1];
      if (last.weight === 0) { setBwMode(true); } else { setPw(String(last.weight)); }
      setPr(String(last.reps));
    }
    prefilled.current = true;
  }, [lastSession]);

  const bestLast = lastSession?.sets?.reduce((b, s) => !b || s.weight > b.weight ? s : b, null);

  async function handleLog() {
    if ((!bwMode && !pw) || !pr) return;
    setLogging(true);
    try {
      const weight = bwMode ? 0 : +pw;
      const newSet = await addSet(exercise.id, { weight, reps: +pr, rpe: prpe ? +prpe : null });
      onSetsChanged({ ...exercise, sets: [...exercise.sets, newSet] });
      if (!bwMode) setPw(String(newSet.weight));
      setPr(String(newSet.reps)); setPrpe('');
      onSetLogged();
    } finally { setLogging(false); }
  }

  async function handleDeleteSet(setId) {
    await deleteSet(setId);
    onSetsChanged({ ...exercise, sets: exercise.sets.filter(s => s.id !== setId) });
  }

  const canLog = (bwMode || pw !== '') && pr !== '' && !logging;

  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: '14px 14px 12px', marginBottom: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
        <div onClick={() => onViewProgress(exercise.exercise_name)}
          style={{ fontWeight: 700, fontSize: 15, cursor: 'pointer', color: 'var(--accent-light)' }}>
          {exercise.exercise_name}
        </div>
        <button onClick={() => onRemove(exercise.id)}
          style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '2px 4px', display: 'flex', alignItems: 'center' }}><IconXSmall /></button>
      </div>

      {lastSession === undefined ? null : lastSession === null ? (
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 4 }}>
          First time!
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>
        </div>
      ) : (
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 10 }}>
          Last: {shortDate(lastSession.date)}
          {bestLast ? <span style={{ color: 'var(--text)' }}> — {bestLast.weight === 0 ? 'BW' : `${round1(bestLast.weight)} lbs`} × {bestLast.reps}</span> : ''}
        </div>
      )}

      {exercise.sets.length > 0 && (
        <div style={{ marginBottom: 10 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '2rem minmax(0,1fr) minmax(0,1fr) 2.5rem 1.5rem', gap: '3px 8px', fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.3px', marginBottom: 4, paddingBottom: 4, borderBottom: '1px solid var(--border)' }}>
            <span>#</span><span>Weight</span><span>Reps</span><span>RPE</span><span></span>
          </div>
          {exercise.sets.map(s => (
            <div key={s.id} className="fade-in-fast" style={{ display: 'grid', gridTemplateColumns: '2rem minmax(0,1fr) minmax(0,1fr) 2.5rem 1.5rem', gap: '3px 8px', alignItems: 'center', padding: '5px 0' }}>
              <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>{s.set_number}</span>
              <span style={{ fontSize: 15, fontWeight: 700 }}>{s.weight === 0 ? 'BW' : round1(s.weight)}</span>
              <span style={{ fontSize: 15, fontWeight: 700 }}>{s.reps}</span>
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{s.rpe != null ? round1(s.rpe) : '—'}</span>
              <button onClick={() => handleDeleteSet(s.id)}
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><IconXSmall size={13} /></button>
            </div>
          ))}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr) 3rem 3rem', gap: 8 }}>
        {bwMode ? (
          <button onClick={() => { setBwMode(false); setPw(''); }}
            style={{ width: '100%', minWidth: 0, padding: '11px 6px', borderRadius: 8,
              background: 'var(--accent)', border: 'none', color: '#fff',
              fontSize: 14, fontWeight: 800, cursor: 'pointer' }}>
            BW
          </button>
        ) : (
          <input type="number" inputMode="decimal" step="0.1" value={pw} onChange={e => setPw(e.target.value)}
            placeholder="lbs" onKeyDown={e => e.key === 'Enter' && handleLog()}
            style={{ width: '100%', minWidth: 0, padding: '11px 6px', borderRadius: 8, background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)', fontSize: 17, fontWeight: 700, textAlign: 'center', fontFamily: 'inherit' }}
          />
        )}
        <input type="number" inputMode="numeric" value={pr} onChange={e => setPr(e.target.value)}
          placeholder="Reps" onKeyDown={e => e.key === 'Enter' && handleLog()}
          style={{ width: '100%', minWidth: 0, padding: '11px 6px', borderRadius: 8, background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)', fontSize: 17, fontWeight: 700, textAlign: 'center', fontFamily: 'inherit' }}
        />
        <input type="number" inputMode="decimal" step="0.1" value={prpe} onChange={e => setPrpe(e.target.value)}
          placeholder="RPE"
          style={{ width: '100%', minWidth: 0, padding: '11px 4px', borderRadius: 8, background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)', fontSize: 13, textAlign: 'center', fontFamily: 'inherit' }}
        />
        <button onClick={handleLog} disabled={!canLog}
          style={{ borderRadius: 8, border: 'none', cursor: canLog ? 'pointer' : 'default',
            background: canLog ? 'var(--green)' : 'var(--surface2)', color: canLog ? '#000' : 'var(--text-muted)',
            transition: 'background-color 0.15s ease, color 0.15s ease',
            display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <IconCheck size={18} />
        </button>
      </div>
      {!bwMode && (
        <button onClick={() => { setBwMode(true); setPw(''); }}
          style={{ marginTop: 6, background: 'none', border: 'none', color: 'var(--text-muted)',
            fontSize: 11, fontWeight: 600, cursor: 'pointer', padding: 0, letterSpacing: '0.5px' }}>
          BODYWEIGHT
        </button>
      )}
    </div>
  );
}

// ── PR Tracker Tab ────────────────────────────────────────────────────────────

function TrophyIcon({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2z"/>
    </svg>
  );
}

function PlusIcon({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
    </svg>
  );
}

function SearchIcon({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
    </svg>
  );
}

function PRCard({ pr, weightUnit, onViewProgress }) {
  const isBodyweight = pr.weight === 0;
  return (
    <div style={{
      position: 'relative', background: 'var(--surface)', border: '1px solid var(--border)',
      borderRadius: 12, padding: '22px 18px', marginBottom: 14,
      display: 'flex', flexDirection: 'column', minHeight: 128,
    }}>
      <div style={{ fontWeight: 700, fontSize: 20, paddingRight: 56 }}>{pr.exercise_name}</div>

      <div style={{ flex: 1, display: 'flex', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <span style={{ display: 'inline-flex', color: 'var(--accent-light)' }}>
            <TrophyIcon size={14} />
          </span>
          <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-muted)', marginRight: -4 }}>
            {isBodyweight ? 'BW' : `${pr.reps}x`}
          </span>
          <span style={{ fontSize: 21, fontWeight: 800 }}>
            {isBodyweight ? pr.reps : `${round1(pr.weight)} ${weightUnit}`}
          </span>
        </div>
      </div>

      <div style={{ position: 'absolute', top: 18, right: 18, fontSize: 12, fontWeight: 600, color: 'var(--text-muted)' }}>
        {shortDate(pr.date)}
      </div>

      <button onClick={() => onViewProgress(pr.exercise_name)}
        style={{
          position: 'absolute', bottom: 14, right: 14,
          background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8,
          width: 34, height: 34, display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: 'var(--accent-light)', cursor: 'pointer',
        }}>
        <PlusIcon size={18} />
      </button>
    </div>
  );
}

function VolumeCharts({ exerciseName, weightUnit, prWeight }) {
  const [history, setHistory] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const cacheKey = 'volume-' + exerciseName;
    const cached = getCached(cacheKey, 300000);
    if (cached) { setHistory(cached); setLoading(false); return; }
    fetchJson(`/api/exercises/${encodeURIComponent(exerciseName)}/volume-history`)
      .then(data => { setHistory(data); setCached(cacheKey, data); setLoading(false); })
      .catch(() => { setHistory([]); setLoading(false); });
  }, [exerciseName]);

  if (loading) return <SkeletonLoader count={3} height={80} />;
  if (!history || history.length === 0) {
    return <div className="empty-state" style={{ marginTop: 12 }}>No sessions logged for {exerciseName} yet.</div>;
  }

  const chartData = history.map(h => ({
    date: shortDate(h.date),
    volume: +h.volume,
    max_weight: +h.max_weight,
    total_reps: +h.total_reps,
    total_sets: +h.total_sets,
  }));

  const bestVolume = Math.max(...chartData.map(d => d.volume));
  const bestSet = chartData.reduce((b, d) => !b || d.max_weight > b.max_weight ? d : b, null);
  const ttStyle = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 };

  return (
    <div style={{ marginTop: 16 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 8 }}>
        Volume Per Session
      </div>
      <ResponsiveContainer width="100%" height={200}>
        <BarChart data={chartData} margin={{ top: 4, right: 8, bottom: 0, left: -20 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--surface2)"/>
          <XAxis dataKey="date" tick={{ fill: 'var(--text-muted)', fontSize: 10 }} tickLine={false}/>
          <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 10 }} tickLine={false} axisLine={false}/>
          <Tooltip contentStyle={ttStyle} labelStyle={{ color: 'var(--text)' }}
            formatter={(v) => [`${v} ${weightUnit}`, 'Volume']}/>
          <Bar dataKey="volume" fill="var(--accent)" radius={[4, 4, 0, 0]}/>
        </BarChart>
      </ResponsiveContainer>

      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 8, marginTop: 20 }}>
        Max Weight Per Session
      </div>
      <ResponsiveContainer width="100%" height={180}>
        <LineChart data={chartData} margin={{ top: 4, right: 8, bottom: 0, left: -20 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--surface2)"/>
          <XAxis dataKey="date" tick={{ fill: 'var(--text-muted)', fontSize: 10 }} tickLine={false}/>
          <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 10 }} tickLine={false} axisLine={false}/>
          <Tooltip contentStyle={ttStyle} labelStyle={{ color: 'var(--text)' }}
            formatter={(v) => [`${v} ${weightUnit}`, 'Max weight']}/>
          {prWeight > 0 && (
            <ReferenceLine y={prWeight} stroke="var(--yellow)" strokeDasharray="4 4"
              label={{ value: 'PR', fill: 'var(--yellow)', fontSize: 10, position: 'right' }}/>
          )}
          <Line type="monotone" dataKey="max_weight" stroke="var(--blue)" strokeWidth={2} dot={{ fill: 'var(--blue)', r: 3 }}/>
        </LineChart>
      </ResponsiveContainer>

      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 8, marginTop: 20 }}>
        Total Reps Per Session
      </div>
      <ResponsiveContainer width="100%" height={160}>
        <BarChart data={chartData} margin={{ top: 4, right: 8, bottom: 0, left: -20 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--surface2)"/>
          <XAxis dataKey="date" tick={{ fill: 'var(--text-muted)', fontSize: 10 }} tickLine={false}/>
          <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 10 }} tickLine={false} axisLine={false}/>
          <Tooltip contentStyle={ttStyle} labelStyle={{ color: 'var(--text)' }}
            formatter={(v, n, p) => [`${v} reps across ${p.payload.total_sets} sets`, 'Reps']}/>
          <Bar dataKey="total_reps" fill="var(--green)" radius={[4, 4, 0, 0]}/>
        </BarChart>
      </ResponsiveContainer>

      <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
        {[
          { label: 'Sessions', val: chartData.length },
          { label: 'Best Volume', val: `${Math.round(bestVolume).toLocaleString()} ${weightUnit}` },
          { label: 'Best Set', val: bestSet ? `${round1(bestSet.max_weight)} ${weightUnit}` : '—' },
        ].map(({ label, val }) => (
          <div key={label} style={{ flex: 1, textAlign: 'center', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 6px' }}>
            <div style={{ fontSize: 14, fontWeight: 800 }}>{val}</div>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>{label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function PRsTab({ weightUnit, onViewProgress }) {
  const [prs, setPrs] = useState(null);
  const [search, setSearch] = useState('');
  const [selectedExercise, setSelectedExercise] = useState(null);

  useEffect(() => {
    const cached = getCached('prs-all', 300000);
    if (cached) { setPrs(cached); return; }
    fetchJson('/api/prs').then(data => { setPrs(data); setCached('prs-all', data); }).catch(() => setPrs([]));
  }, []);

  if (prs === null) return <SkeletonLoader count={4} height={90} />;

  if (prs.length === 0) {
    return (
      <div className="empty-state" style={{ marginTop: 20 }}>
        No PRs yet. Log your first workout to start tracking your records.
      </div>
    );
  }

  const filtered = search.trim()
    ? prs.filter(p => p.exercise_name.toLowerCase().includes(search.toLowerCase()))
    : prs;

  const pillExercises = prs.slice(0, 8);
  const selectedPr = prs.find(p => p.exercise_name === selectedExercise);

  return (
    <div>
      <div style={{ position: 'relative', marginBottom: 14 }}>
        <span style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', display: 'flex', pointerEvents: 'none' }}>
          <SearchIcon size={16} />
        </span>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{
            width: '100%', padding: '10px 14px 10px 38px', borderRadius: 8,
            background: 'var(--surface2)', border: '1px solid var(--border)',
            color: 'var(--text)', fontSize: 14, fontFamily: 'inherit',
          }}
        />
      </div>

      {filtered.map(pr => (
        <PRCard key={pr.exercise_name} pr={pr} weightUnit={weightUnit} onViewProgress={onViewProgress} />
      ))}

      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.8px', color: 'var(--text-muted)', textTransform: 'uppercase', margin: '24px 0 10px' }}>
        Select an exercise to view progression
      </div>
      <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4, marginBottom: 4, touchAction: 'pan-x' }}>
        {pillExercises.map(p => (
          <button key={p.exercise_name} onClick={() => setSelectedExercise(p.exercise_name)}
            style={{
              flexShrink: 0, padding: '8px 16px', borderRadius: 99, fontSize: 13, fontWeight: 600,
              border: '1px solid', cursor: 'pointer', whiteSpace: 'nowrap',
              background: selectedExercise === p.exercise_name ? 'var(--accent)' : 'var(--surface2)',
              borderColor: selectedExercise === p.exercise_name ? 'var(--accent)' : 'var(--border)',
              color: selectedExercise === p.exercise_name ? '#fff' : 'var(--text-muted)',
            }}>
            {p.exercise_name}
          </button>
        ))}
      </div>

      {selectedExercise && (
        <VolumeCharts exerciseName={selectedExercise} weightUnit={weightUnit} prWeight={selectedPr?.weight || 0} />
      )}
    </div>
  );
}

// ── Main Workout Page ─────────────────────────────────────────────────────────

export default function Workout() {
  const [pageState, setPageState] = useState('loading');
  const [session, setSession] = useState(null);
  const [templates, setTemplates] = useState([]);
  const [todaySessions, setTodaySessions] = useState([]);
  const [recentSessions, setRecentSessions] = useState([]);
  const [lastSessions, setLastSessions] = useState({});

  const [showExSearch, setShowExSearch] = useState(false);
  const [summaryTarget, setSummaryTarget] = useState(null);
  const [progressExercise, setProgressExercise] = useState(null);
  const [templateEditor, setTemplateEditor] = useState(null);
  const [showStartEmpty, setShowStartEmpty] = useState(false);
  const [startName, setStartName] = useState('');

  const [restTimer, setRestTimer] = useState(null);
  const [restDuration, setRestDurationState] = useState(getRestDuration);
  const [, setTick] = useState(0);

  const [activeTab, setActiveTab] = useState('workouts');
  const [weightUnit, setWeightUnit] = useState('lbs');

  useEffect(() => {
    getGoals().then(g => { if (g?.weight_unit) setWeightUnit(g.weight_unit); }).catch(() => {});
  }, []);

  // Elapsed ticker
  useEffect(() => {
    if (pageState !== 'active') return;
    const id = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(id);
  }, [pageState]);

  // Rest timer countdown
  useEffect(() => {
    if (!restTimer) return;
    if (restTimer.secsLeft <= 0) {
      if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
      setRestTimer(null);
      return;
    }
    const id = setTimeout(() => setRestTimer(p => p ? { ...p, secsLeft: p.secsLeft - 1 } : null), 1000);
    return () => clearTimeout(id);
  }, [restTimer]);

  // Initial load
  useEffect(() => {
    (async () => {
      const today = todayStr();
      const cacheKey = 'workout-' + today;
      const cached = getCached(cacheKey);

      // Resolved fresh, never from cache and never scoped to "today" — this is what
      // lets an in-progress workout survive a backgrounded-tab reload or a workout
      // that crosses midnight, instead of silently reverting to the idle screen.
      const activePromise = getActiveWorkoutSession().catch(() => null);

      let sessions, tmpl, recent;
      if (cached) {
        ({ sessions, tmpl, recent } = cached);
      } else {
        [sessions, tmpl, recent] = await Promise.all([
          getWorkoutSessions(today),
          getWorkoutTemplates(),
          getRecentWorkoutSessions(5),
        ]);
        setCached(cacheKey, { sessions, tmpl, recent });
      }

      setTemplates(tmpl);
      setRecentSessions(recent);
      setTodaySessions(sessions.filter(s => s.finished_at));
      const inProgress = await activePromise;
      if (inProgress) {
        setSession(inProgress);
        setPageState('active');
        fetchLastFor(inProgress.exercises.map(e => e.exercise_name));
      } else {
        setPageState('idle');
      }
    })();
  }, []);

  async function fetchLastFor(names) {
    const unique = [...new Set(names)];
    const pairs = await Promise.all(
      unique.map(n => getExerciseLastSession(n).then(d => [n, d]).catch(() => [n, null]))
    );
    setLastSessions(prev => {
      const next = { ...prev };
      for (const [n, d] of pairs) next[n] = d;
      return next;
    });
  }

  async function startFromTemplate(tmpl) {
    const s = await createWorkoutSession({ date: todayStr(), name: tmpl.name, template_id: tmpl.id });
    invalidateCache('workout-' + todayStr());
    setSession(s);
    setPageState('active');
    fetchLastFor(s.exercises.map(e => e.exercise_name));
  }

  async function startEmpty() {
    const s = await createWorkoutSession({ date: todayStr(), name: startName.trim() || 'Workout' });
    invalidateCache('workout-' + todayStr());
    setSession(s);
    setPageState('active');
    setShowStartEmpty(false);
    setStartName('');
  }

  async function handleAddExercise(exerciseName) {
    if (session.exercises.some(e => e.exercise_name === exerciseName)) {
      setShowExSearch(false); return;
    }
    const newEx = await addExerciseToSession(session.id, { exercise_name: exerciseName });
    setSession(prev => ({ ...prev, exercises: [...prev.exercises, newEx] }));
    if (!(exerciseName in lastSessions)) fetchLastFor([exerciseName]);
    setShowExSearch(false);
  }

  async function handleRemoveExercise(exerciseId) {
    await removeExerciseFromSession(session.id, exerciseId);
    setSession(prev => ({ ...prev, exercises: prev.exercises.filter(e => e.id !== exerciseId) }));
  }

  function handleExSetsChanged(updatedEx) {
    setSession(prev => ({ ...prev, exercises: prev.exercises.map(e => e.id === updatedEx.id ? updatedEx : e) }));
  }

  async function handleRename(newName) {
    if (!newName.trim() || newName === session.name) return;
    await updateWorkoutSession(session.id, { name: newName.trim() });
    setSession(prev => ({ ...prev, name: newName.trim() }));
  }

  async function handleFinishSave(notes) {
    if (!session?.id) throw new Error('Session missing — please restart the workout');
    const finished_at = new Date().toISOString();
    await updateWorkoutSession(session.id, { finished_at, notes });
    const completed = { ...session, finished_at, notes };
    setTodaySessions(prev => [...prev, completed]);
    const totalSets = session.exercises.reduce((n, e) => n + e.sets.length, 0);
    const totalVol  = session.exercises.reduce((n, e) => n + e.sets.reduce((s, set) => s + set.weight * set.reps, 0), 0);
    setRecentSessions(prev => [{ id: session.id, date: session.date, name: session.name, started_at: session.started_at, finished_at, total_sets: totalSets, total_volume: totalVol }, ...prev].slice(0, 5));
    invalidateCache('workout-' + session.date);
    setSummaryTarget(null);
    setSession(null);
    setPageState('idle');
  }

  function patchSessionExercises(sessionId, sessionDate, updatedExercises) {
    setTodaySessions(prev => prev.map(s => s.id === sessionId ? { ...s, exercises: updatedExercises } : s));
    const totalSets = updatedExercises.reduce((n, e) => n + e.sets.length, 0);
    const totalVol  = updatedExercises.reduce((n, e) => n + e.sets.reduce((s, set) => s + set.weight * set.reps, 0), 0);
    setRecentSessions(prev => prev.map(s => s.id === sessionId ? { ...s, total_sets: totalSets, total_volume: totalVol } : s));
    invalidateCache('workout-' + sessionDate);
  }

  async function handleDeleteSession(sessionId) {
    await deleteWorkoutSession(sessionId);
    setTodaySessions(prev => prev.filter(s => s.id !== sessionId));
    setRecentSessions(prev => prev.filter(s => s.id !== sessionId));
    invalidateCache('workout-' + todayStr());
    setSummaryTarget(null);
  }

  function handleTemplateSaved(saved) {
    setTemplates(prev => {
      const exists = prev.some(t => t.id === saved.id);
      return exists ? prev.map(t => t.id === saved.id ? saved : t) : [saved, ...prev];
    });
    setTemplateEditor(null);
  }

  async function handleDeleteTemplate(id) {
    await deleteWorkoutTemplate(id);
    setTemplates(prev => prev.filter(t => t.id !== id));
  }

  function handleSetLogged() {
    setRestTimer({ secsLeft: restDuration, total: restDuration });
  }

  function handleChangeDuration(d) {
    saveRestDuration(d);
    setRestDurationState(d);
    setRestTimer(prev => prev ? { secsLeft: d, total: d } : null);
  }

  // ── Loading ────────────────────────────────────────────────────────────────
  if (pageState === 'loading') return <SkeletonLoader count={4} height={70} />;

  // ── STATE B: Active session ────────────────────────────────────────────────
  if (pageState === 'active' && session) {
    return (
      <div style={{ paddingBottom: 'calc(var(--bottom-nav-h, 64px) + 76px)' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20 }}>
          <div style={{ flex: 1, minWidth: 0, marginRight: 12 }}>
            <EditableTitle value={session.name} onSave={handleRename}/>
            <div style={{ fontFamily: 'monospace', fontSize: 13, color: 'var(--text-muted)', marginTop: 4 }}>
              {fmtElapsed(session.started_at)}
            </div>
          </div>
          <button onClick={() => setSummaryTarget({ session: { ...session }, mode: 'finish' })}
            style={{ background: 'transparent', color: '#fff', border: '1.5px solid rgba(255,255,255,0.5)', padding: '10px 18px', borderRadius: 8, fontFamily: 'inherit', fontSize: 14, fontWeight: 700, cursor: 'pointer', flexShrink: 0 }}>
            Finish
          </button>
        </div>

        {session.exercises.length === 0 && (
          <div className="empty-state" style={{ marginBottom: 20 }}>
            No exercises yet — tap "+ Add Exercise" below.
          </div>
        )}

        {session.exercises.map(ex => (
          <ExerciseCard key={ex.id} exercise={ex}
            lastSession={lastSessions[ex.exercise_name]}
            onSetsChanged={handleExSetsChanged}
            onRemove={handleRemoveExercise}
            onViewProgress={setProgressExercise}
            onSetLogged={handleSetLogged}
          />
        ))}

        {/* Sticky add-exercise bar (hidden when rest timer visible) */}
        {!restTimer && (
          <div style={{ position: 'fixed', bottom: 'calc(var(--bottom-nav-h, 64px) + 8px)', left: 12, right: 12, zIndex: 800 }}>
            <button onClick={() => setShowExSearch(true)}
              style={{ width: '100%', background: 'var(--surface)', border: '1px solid var(--accent)', color: 'var(--accent-light)', padding: '13px', borderRadius: 10, fontFamily: 'inherit', fontSize: 15, fontWeight: 600, cursor: 'pointer', boxShadow: '0 4px 20px rgba(0,0,0,0.4)' }}>
              + Add Exercise
            </button>
          </div>
        )}

        {restTimer && (
          <RestTimerBanner timer={restTimer} restDuration={restDuration}
            onSkip={() => setRestTimer(null)} onChangeDuration={handleChangeDuration}/>
        )}

        {showExSearch && <ExerciseSearchSheet onAdd={handleAddExercise} onClose={() => setShowExSearch(false)}/>}
        {summaryTarget && (
          <WorkoutSummarySheet session={summaryTarget.session} mode={summaryTarget.mode}
            onSave={handleFinishSave} onDelete={() => handleDeleteSession(summaryTarget.session.id)} onClose={() => setSummaryTarget(null)} onExercisesChanged={(updated) => patchSessionExercises(summaryTarget.session.id, summaryTarget.session.date, updated)}/>
        )}
        {progressExercise && <ExerciseProgressSheet exerciseName={progressExercise} weightUnit={weightUnit} onClose={() => setProgressExercise(null)}/>}
      </div>
    );
  }

  // ── STATE A: Idle ──────────────────────────────────────────────────────────
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <div className="page-title" style={{ margin: 0 }}>Today's Workout</div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 2 }}>
            {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
          </div>
        </div>
        <button onClick={() => setTemplateEditor('new')}
          style={{ background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text-muted)', padding: '7px 12px', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer', flexShrink: 0 }}>
          + Template
        </button>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        {[{ key: 'workouts', label: 'Workouts' }, { key: 'prs', label: 'PRs' }].map(t => (
          <button key={t.key} onClick={() => setActiveTab(t.key)}
            style={{
              flex: 1, padding: '10px', borderRadius: 8, fontSize: 13, fontWeight: 600,
              border: '1px solid', cursor: 'pointer',
              background: activeTab === t.key ? 'var(--accent)' : 'var(--surface2)',
              borderColor: activeTab === t.key ? 'var(--accent)' : 'var(--border)',
              color: activeTab === t.key ? '#fff' : 'var(--text-muted)',
            }}>
            {t.label}
          </button>
        ))}
      </div>

      {activeTab === 'prs' ? (
        <PRsTab weightUnit={weightUnit} onViewProgress={setProgressExercise} />
      ) : (
      <>
      {todaySessions.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.8px', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 10 }}>Done Today</div>
          {todaySessions.map(s => {
            const vol = s.exercises?.reduce((n, e) => n + e.sets.reduce((a, set) => a + set.weight * set.reps, 0), 0) || 0;
            const sets = s.exercises?.reduce((n, e) => n + e.sets.length, 0) || 0;
            return (
              <div key={s.id} onClick={() => setSummaryTarget({ session: s, mode: 'view' })}
                style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '14px 16px', marginBottom: 10, cursor: 'pointer' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ fontWeight: 700, fontSize: 15 }}>{s.name}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{fmtDuration(s.started_at, s.finished_at)}</div>
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>{sets} sets · {Math.round(vol).toLocaleString()} lbs</div>
              </div>
            );
          })}
        </div>
      )}

      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.8px', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 12 }}>Start Workout</div>

        {templates.map(tmpl => (
          <div key={tmpl.id}
            onClick={() => startFromTemplate(tmpl)}
            className="hover-border"
            style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '14px 16px', marginBottom: 10, cursor: 'pointer' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ fontWeight: 700, fontSize: 15 }}>{tmpl.name}</div>
              <div style={{ display: 'flex', gap: 4 }} onClick={e => e.stopPropagation()}>
                <button onClick={() => setTemplateEditor(tmpl)}
                  style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '2px 6px', display: 'flex', alignItems: 'center' }}><EditIcon size={14} /></button>
                <button onClick={() => handleDeleteTemplate(tmpl.id)}
                  style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '2px 6px', display: 'flex', alignItems: 'center' }}><IconXSmall /></button>
              </div>
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
              {tmpl.exercises.length} exercise{tmpl.exercises.length !== 1 ? 's' : ''}
              {tmpl.exercises.length > 0 && ` · ${tmpl.exercises.slice(0, 3).map(e => e.exercise_name).join(', ')}${tmpl.exercises.length > 3 ? ` +${tmpl.exercises.length - 3}` : ''}`}
            </div>
          </div>
        ))}

        {!showStartEmpty ? (
          <button onClick={() => setShowStartEmpty(true)}
            className="hover-border"
            style={{ width: '100%', padding: '12px', borderRadius: 10, background: 'transparent', border: '2px dashed var(--border)', color: 'var(--text-muted)', fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
            + Start Empty Workout
          </button>
        ) : (
          <div style={{ display: 'flex', gap: 8 }}>
            <input autoFocus value={startName} onChange={e => setStartName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') startEmpty(); if (e.key === 'Escape') { setShowStartEmpty(false); setStartName(''); } }}
              placeholder="Workout name…"
              style={{ flex: 1, padding: '11px 14px', borderRadius: 8, background: 'var(--surface2)', border: '1px solid var(--accent)', color: 'var(--text)', fontSize: 14, fontFamily: 'inherit' }}
            />
            <button onClick={startEmpty}
              style={{ background: 'var(--accent)', color: '#fff', border: 'none', padding: '11px 18px', borderRadius: 8, fontFamily: 'inherit', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
              Start
            </button>
          </div>
        )}
      </div>

      {recentSessions.length > 0 && (
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.8px', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 12 }}>Recent Workouts</div>
          {recentSessions.map(s => (
            <div key={s.id}
              onClick={async () => {
                const all = await getWorkoutSessions(s.date);
                const found = all.find(f => f.id === s.id);
                if (found) setSummaryTarget({ session: found, mode: 'view' });
              }}
              className="hover-border"
              style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '14px 16px', marginBottom: 10, cursor: 'pointer' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ fontWeight: 700, fontSize: 14 }}>{s.name}</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{shortDate(s.date)}</div>
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
                {s.total_sets} sets · {Math.round(s.total_volume).toLocaleString()} lbs
              </div>
            </div>
          ))}
        </div>
      )}
      </>
      )}

      {summaryTarget && (
        <WorkoutSummarySheet session={summaryTarget.session} mode={summaryTarget.mode}
          onSave={handleFinishSave} onDelete={() => handleDeleteSession(summaryTarget.session.id)} onClose={() => setSummaryTarget(null)} onExercisesChanged={(updated) => patchSessionExercises(summaryTarget.session.id, summaryTarget.session.date, updated)}/>
      )}
      {templateEditor !== null && (
        <TemplateEditorSheet
          template={templateEditor === 'new' ? null : templateEditor}
          onSave={handleTemplateSaved} onClose={() => setTemplateEditor(null)}/>
      )}
      {progressExercise && <ExerciseProgressSheet exerciseName={progressExercise} weightUnit={weightUnit} onClose={() => setProgressExercise(null)}/>}
    </div>
  );
}
