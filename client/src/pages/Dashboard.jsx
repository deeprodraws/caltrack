import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { getEntries, getGoals, getWeightLogs, addWeightLog, updateWeightLog, deleteWeightLog } from '../api';

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function sum(entries, key) {
  return entries.reduce((acc, e) => acc + (Number(e[key]) || 0), 0);
}

function clamp(v) {
  return Math.min(v, 100);
}

function shortDate(str) {
  const today = todayStr();
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  if (str === today) return 'Today';
  if (str === yesterday) return 'Yesterday';
  return new Date(str + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

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
          fill="none"
          stroke={color}
          strokeWidth="14"
          strokeLinecap="round"
          strokeDasharray={`${dash} ${circumference}`}
          strokeDashoffset="0"
          transform="rotate(-90 80 80)"
          style={{ transition: 'stroke-dasharray 0.5s ease' }}
        />
      </svg>
      <div className="calorie-center">
        <span className="cal-num" style={{ color }}>{Math.round(eaten)}</span>
        <span className="cal-label">/ {Math.round(goal)} kcal</span>
      </div>
    </div>
  );
}

function MacroBar({ label, current, goal, color }) {
  const pct = goal > 0 ? clamp((current / goal) * 100) : 0;
  return (
    <div className="macro-card">
      <div className="macro-label">{label}</div>
      <div className="macro-values">
        <span className="macro-current" style={{ color }}>{Math.round(current)}</span>
        <span className="macro-goal">/ {goal}g</span>
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
                type="number"
                min="0"
                step="0.1"
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
              padding: '10px 18px', borderRadius: 8, fontSize: 14,
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
          <div style={{ fontSize: 36, marginBottom: 12 }}>🗑️</div>
          <p style={{ color: 'var(--text-muted)', fontSize: 14, marginBottom: 24 }}>
            Remove <strong style={{ color: 'var(--text)' }}>{log.weight} {unit}</strong> logged on <strong style={{ color: 'var(--text)' }}>{shortDate(log.date)}</strong>?
          </p>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
            <button onClick={onCancel} style={{
              background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)',
              padding: '10px 20px', borderRadius: 8, fontSize: 14,
            }}>Keep it</button>
            <button onClick={onConfirm} style={{
              background: '#f87171', color: '#fff', border: 'none',
              padding: '10px 20px', borderRadius: 8, fontSize: 14, fontWeight: 600,
            }}>Delete</button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const [entries, setEntries] = useState([]);
  const [goals, setGoals] = useState({ calories: 2000, protein: 150, carbs: 250, fat: 65, weight_unit: 'kg' });
  const [weightLogs, setWeightLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editWeight, setEditWeight] = useState(null);
  const [showWeightModal, setShowWeightModal] = useState(false);
  const [deleteWeight, setDeleteWeight] = useState(null);

  useEffect(() => {
    Promise.all([getEntries(todayStr()), getGoals(), getWeightLogs()]).then(([e, g, w]) => {
      setEntries(e);
      setGoals(g);
      setWeightLogs(w);
      setLoading(false);
    });
  }, []);

  const cals = sum(entries, 'calories');
  const protein = sum(entries, 'protein');
  const carbs = sum(entries, 'carbs');
  const fat = sum(entries, 'fat');
  const remaining = Math.max(goals.calories - cals, 0);
  const unit = goals.weight_unit || 'kg';

  const today = todayStr();
  const todayWeight = weightLogs.find(w => w.date === today);
  const pastLogs = weightLogs.filter(w => w.date !== today).slice(0, 4);

  async function handleWeightSave(value) {
    if (editWeight) {
      const updated = await updateWeightLog(editWeight.id, { weight: value, unit });
      setWeightLogs(prev => prev.map(w => w.id === updated.id ? updated : w));
    } else {
      const created = await addWeightLog({ date: today, weight: value, unit });
      setWeightLogs(prev => [created, ...prev].sort((a, b) => b.date.localeCompare(a.date)));
    }
    setShowWeightModal(false);
    setEditWeight(null);
  }

  async function handleWeightDelete() {
    await deleteWeightLog(deleteWeight.id);
    setWeightLogs(prev => prev.filter(w => w.id !== deleteWeight.id));
    setDeleteWeight(null);
  }

  function openLog(log = null) {
    setEditWeight(log);
    setShowWeightModal(true);
  }

  if (loading) return <div className="empty-state">Loading...</div>;

  const todayLabel = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

  return (
    <div>
      <div className="page-title">Dashboard</div>

      <div className="calorie-hero">
        <CalorieRing eaten={cals} goal={goals.calories} />
        <div className="calorie-info">
          <h2>Today's Progress</h2>
          <p style={{ marginBottom: 0 }}>{todayLabel}</p>
          <div className="calorie-stats">
            <div className="cal-stat">
              <div className="val" style={{ color: '#6c63ff' }}>{Math.round(cals)}</div>
              <div className="lbl">Eaten</div>
            </div>
            <div className="cal-stat">
              <div className="val" style={{ color: '#34d399' }}>{Math.round(remaining)}</div>
              <div className="lbl">Remaining</div>
            </div>
            <div className="cal-stat">
              <div className="val">{goals.calories}</div>
              <div className="lbl">Goal</div>
            </div>
          </div>
        </div>
      </div>

      <div className="macro-grid">
        <MacroBar label="Protein" current={protein} goal={goals.protein} color="#60a5fa" />
        <MacroBar label="Carbs" current={carbs} goal={goals.carbs} color="#fbbf24" />
        <MacroBar label="Fat" current={fat} goal={goals.fat} color="#fb923c" />
        <MacroBar label="Calories" current={cals} goal={goals.calories} color="#6c63ff" />
      </div>

      {/* Weight card */}
      <div className="card" style={{ marginBottom: 24 }}>
        <div className="section-header" style={{ marginBottom: 12 }}>
          <span className="section-title">Weight</span>
          <button
            onClick={() => openLog(null)}
            style={{
              background: 'var(--accent)', color: '#fff', border: 'none',
              padding: '7px 14px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer',
            }}
          >
            + Log Weight
          </button>
        </div>

        {todayWeight ? (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 12,
            background: 'rgba(108,99,255,0.08)', border: '1px solid rgba(108,99,255,0.2)',
            borderRadius: 10, padding: '12px 16px', marginBottom: pastLogs.length ? 10 : 0,
          }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 2 }}>Today</div>
              <div style={{ fontSize: 22, fontWeight: 700 }}>
                {todayWeight.weight} <span style={{ fontSize: 14, color: 'var(--text-muted)', fontWeight: 400 }}>{unit}</span>
              </div>
            </div>
            <button className="btn-icon" onClick={() => openLog(todayWeight)} title="Edit">
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
                <span style={{ flex: 1, fontSize: 14, fontWeight: 600 }}>{w.weight} <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}>{unit}</span></span>
                <button className="btn-icon" onClick={() => openLog(w)} title="Edit" style={{ width: 30, height: 30 }}>
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

      <div className="section-header">
        <span className="section-title">Today's Entries</span>
        <Link to="/log" style={{ fontSize: 13, color: 'var(--accent-light)' }}>View all →</Link>
      </div>

      {entries.length === 0 ? (
        <div className="empty-state">
          No food logged today. <Link to="/log" style={{ color: 'var(--accent-light)' }}>Add your first entry →</Link>
        </div>
      ) : (
        <div className="entry-list">
          {entries.slice(0, 5).map(e => (
            <div key={e.id} className="entry-row">
              <span className="entry-name">{e.food_name}</span>
              <div className="entry-macros">
                <div className="entry-macro">
                  <div className="val" style={{ color: '#6c63ff' }}>{Math.round(e.calories)}</div>
                  <div className="lbl">kcal</div>
                </div>
                <div className="entry-macro">
                  <div className="val" style={{ color: '#60a5fa' }}>{Math.round(e.protein)}g</div>
                  <div className="lbl">protein</div>
                </div>
                <div className="entry-macro">
                  <div className="val" style={{ color: '#fbbf24' }}>{Math.round(e.carbs)}g</div>
                  <div className="lbl">carbs</div>
                </div>
                <div className="entry-macro">
                  <div className="val" style={{ color: '#fb923c' }}>{Math.round(e.fat)}g</div>
                  <div className="lbl">fat</div>
                </div>
              </div>
            </div>
          ))}
          {entries.length > 5 && (
            <div style={{ textAlign: 'center', padding: '10px 0', fontSize: 13, color: 'var(--text-muted)' }}>
              +{entries.length - 5} more — <Link to="/log" style={{ color: 'var(--accent-light)' }}>view all</Link>
            </div>
          )}
        </div>
      )}

      {showWeightModal && (
        <WeightModal
          log={editWeight}
          unit={unit}
          onSave={handleWeightSave}
          onClose={() => { setShowWeightModal(false); setEditWeight(null); }}
        />
      )}
      {deleteWeight && (
        <WeightDeleteConfirm
          log={deleteWeight}
          unit={unit}
          onConfirm={handleWeightDelete}
          onCancel={() => setDeleteWeight(null)}
        />
      )}
    </div>
  );
}
