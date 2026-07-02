import { useState, useEffect, useRef, useCallback } from 'react';
import { getEntries, addEntry, updateEntry, deleteEntry, searchSavedFoods, createSavedFood } from '../api';
import PhotoScanner from '../components/PhotoScanner';
import BarcodeScanner from '../components/BarcodeScanner';

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function localDateStr(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function formatDate(str) {
  const today = todayStr();
  const yd = new Date(); yd.setDate(yd.getDate() - 1);
  const yesterday = localDateStr(yd);
  if (str === today) return 'Today';
  if (str === yesterday) return 'Yesterday';
  return new Date(str + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
}

function sum(entries, key) {
  return entries.reduce((acc, e) => acc + (Number(e[key]) || 0), 0);
}

const emptyForm = { food_name: '', calories: '', protein: '', carbs: '', fat: '', servings: '1' };

// ── Autocomplete search component ──────────────────────────────────────────────
function FoodSearch({ value, onChange, onSelect, onClear }) {
  const [results, setResults] = useState([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const debounce = useRef(null);
  const wrapRef = useRef(null);

  useEffect(() => {
    clearTimeout(debounce.current);
    if (!value.trim()) { setResults([]); setOpen(false); return; }
    debounce.current = setTimeout(async () => {
      setLoading(true);
      const res = await searchSavedFoods(value);
      setResults(res);
      setOpen(res.length > 0);
      setLoading(false);
    }, 200);
  }, [value]);

  // close on outside click
  useEffect(() => {
    function handler(e) { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false); }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      <div style={{ position: 'relative' }}>
        <input
          placeholder="e.g. Chicken breast"
          value={value}
          onChange={e => { onChange(e.target.value); if (!e.target.value) onClear(); }}
          onFocus={() => results.length > 0 && setOpen(true)}
          required
          style={{ paddingRight: loading ? 32 : 12 }}
        />
        {loading && (
          <span style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', fontSize: 12 }}>…</span>
        )}
      </div>
      {open && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 100,
          background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8,
          marginTop: 4, maxHeight: 200, overflowY: 'auto', boxShadow: '0 8px 24px rgba(0,0,0,0.4)'
        }}>
          {results.map(f => (
            <button
              key={f.id}
              type="button"
              onClick={() => { onSelect(f); setOpen(false); }}
              style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                width: '100%', padding: '9px 14px', background: 'none', border: 'none',
                color: 'var(--text)', textAlign: 'left', cursor: 'pointer', fontSize: 14,
                borderBottom: '1px solid var(--border)',
              }}
              onMouseEnter={e => e.currentTarget.style.background = 'rgba(108,99,255,0.12)'}
              onMouseLeave={e => e.currentTarget.style.background = 'none'}
            >
              <span style={{ fontWeight: 500 }}>{f.name}</span>
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                {f.calories} kcal · {f.serving_size}{f.serving_unit !== 'serving' ? f.serving_unit : ' serving'}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Edit modal ─────────────────────────────────────────────────────────────────
function EditModal({ entry, onSave, onClose }) {
  const [form, setForm] = useState({
    food_name: entry.food_name,
    calories: entry.calories,
    protein: entry.protein,
    carbs: entry.carbs,
    fat: entry.fat,
  });
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    const updated = await updateEntry(entry.id, {
      food_name: form.food_name,
      calories: Number(form.calories),
      protein: Number(form.protein),
      carbs: Number(form.carbs),
      fat: Number(form.fat),
    });
    onSave(updated);
    setSaving(false);
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Edit Entry</h3>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          <form onSubmit={handleSubmit}>
            <div className="settings-field" style={{ marginBottom: 14 }}>
              <label>Food Name</label>
              <input value={form.food_name} onChange={e => setForm(f => ({ ...f, food_name: e.target.value }))} required />
            </div>
            <div className="modal-macros">
              {['calories', 'protein', 'carbs', 'fat'].map(k => (
                <div key={k} className="settings-field">
                  <label>{k.charAt(0).toUpperCase() + k.slice(1)}{k !== 'calories' ? ' (g)' : ' (kcal)'}</label>
                  <input type="number" min="0" value={form[k]} onChange={e => setForm(f => ({ ...f, [k]: e.target.value }))} />
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', paddingTop: 4 }}>
              <button type="button" onClick={onClose} style={{
                background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)',
                padding: '10px 18px', borderRadius: 8, fontSize: 14,
              }}>Cancel</button>
              <button className="btn-primary" type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save Changes'}</button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

// ── Delete confirmation ────────────────────────────────────────────────────────
function DeleteConfirm({ entry, onConfirm, onCancel }) {
  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal-box" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Delete entry?</h3>
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
            Remove <strong style={{ color: 'var(--text)' }}>{entry.food_name}</strong> from your log?
          </p>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
            <button onClick={onCancel} style={{
              background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)',
              padding: '10px 20px', borderRadius: 8, fontSize: 14,
            }}>Keep it</button>
            <button onClick={onConfirm} style={{
              background: '#f87171', color: '#fff', border: 'none', padding: '10px 20px',
              borderRadius: 8, fontSize: 14, fontWeight: 600,
            }}>Delete</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main FoodLog page ──────────────────────────────────────────────────────────
export default function FoodLog() {
  const [date, setDate] = useState(todayStr());
  const [entries, setEntries] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [saveAsTemplate, setSaveAsTemplate] = useState(false);
  const [selectedFood, setSelectedFood] = useState(null); // saved food template being used
  const [adding, setAdding] = useState(false);
  const [loading, setLoading] = useState(true);
  const [editEntry, setEditEntry] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [showScanner, setShowScanner] = useState(false);
  const [showBarcode, setShowBarcode] = useState(false);

  useEffect(() => {
    setLoading(true);
    getEntries(date).then(e => { setEntries(e); setLoading(false); });
  }, [date]);

  function shiftDate(days) {
    const d = new Date(date + 'T12:00:00');
    d.setDate(d.getDate() + days);
    setDate(localDateStr(d));
  }

  // When a saved food is selected from autocomplete, pre-fill form
  function handleSelectSavedFood(food) {
    const servings = 1;
    setSelectedFood(food);
    setForm({
      food_name: food.name,
      calories: String(food.calories * servings),
      protein: String(food.protein * servings),
      carbs: String(food.carbs * servings),
      fat: String(food.fat * servings),
      servings: '1',
    });
    setSaveAsTemplate(false);
  }

  function handleServingsChange(val) {
    const s = parseFloat(val) || 1;
    if (selectedFood) {
      setForm(f => ({
        ...f,
        servings: val,
        calories: String(+(selectedFood.calories * s).toFixed(1)),
        protein: String(+(selectedFood.protein * s).toFixed(1)),
        carbs: String(+(selectedFood.carbs * s).toFixed(1)),
        fat: String(+(selectedFood.fat * s).toFixed(1)),
      }));
    } else {
      setForm(f => ({ ...f, servings: val }));
    }
  }

  function handleNameChange(val) {
    setForm(f => ({ ...f, food_name: val }));
    if (selectedFood && val !== selectedFood.name) setSelectedFood(null);
  }

  function handleClearSelection() {
    setSelectedFood(null);
    setForm(emptyForm);
  }

  async function handleAdd(e) {
    e.preventDefault();
    if (!form.food_name.trim()) return;
    setAdding(true);

    const payload = {
      date,
      food_name: form.food_name.trim(),
      calories: Number(form.calories) || 0,
      protein: Number(form.protein) || 0,
      carbs: Number(form.carbs) || 0,
      fat: Number(form.fat) || 0,
    };

    const entry = await addEntry(payload);
    setEntries(prev => [...prev, entry]);

    if (saveAsTemplate && !selectedFood) {
      await createSavedFood({
        name: payload.food_name,
        calories: payload.calories,
        protein: payload.protein,
        carbs: payload.carbs,
        fat: payload.fat,
        serving_size: 1,
        serving_unit: 'serving',
      });
    }

    setForm(emptyForm);
    setSelectedFood(null);
    setSaveAsTemplate(false);
    setAdding(false);
  }

  async function handleScanSave(scannedItems) {
    const saved = await Promise.all(scannedItems.map(item => addEntry(item)));
    setEntries(prev => [...prev, ...saved]);
    setShowScanner(false);
  }

  async function handleBarcodeSave(entry) {
    const saved = await addEntry(entry);
    setEntries(prev => [...prev, saved]);
    setShowBarcode(false);
  }

  async function handleDeleteConfirmed() {
    await deleteEntry(deleteTarget.id);
    setEntries(prev => prev.filter(e => e.id !== deleteTarget.id));
    setDeleteTarget(null);
  }

  function handleEditSaved(updated) {
    setEntries(prev => prev.map(e => e.id === updated.id ? updated : e));
    setEditEntry(null);
  }

  const totalCals = sum(entries, 'calories');
  const totalProtein = sum(entries, 'protein');
  const totalCarbs = sum(entries, 'carbs');
  const totalFat = sum(entries, 'fat');

  return (
    <div>
      <div className="page-title">Food Log</div>

      <div className="log-date-row">
        <div className="date-nav" style={{ margin: 0 }}>
          <button onClick={() => shiftDate(-1)}>‹</button>
          <span className="date-label">{formatDate(date)}</span>
          <button onClick={() => shiftDate(1)} disabled={date >= todayStr()}>›</button>
        </div>
        <div className="scan-btns" style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={() => setShowScanner(true)}
            style={{
              display: 'flex', alignItems: 'center', gap: 7, background: 'var(--surface)',
              border: '1px solid var(--border)', color: 'var(--text)', padding: '8px 16px',
              borderRadius: 8, fontFamily: 'inherit', fontSize: 13, fontWeight: 500, cursor: 'pointer',
              transition: 'border-color 0.15s',
            }}
            onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--accent)'}
            onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg> Photo
          </button>
          <button
            onClick={() => setShowBarcode(true)}
            style={{
              display: 'flex', alignItems: 'center', gap: 7, background: 'var(--surface)',
              border: '1px solid var(--border)', color: 'var(--text)', padding: '8px 16px',
              borderRadius: 8, fontFamily: 'inherit', fontSize: 13, fontWeight: 500, cursor: 'pointer',
              transition: 'border-color 0.15s',
            }}
            onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--accent)'}
            onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 5v14M7 5v14M11 5v14M15 5v14M19 5v14M21 5v3M21 16v3"/></svg> Barcode
          </button>
        </div>
      </div>

      {/* ── Add food form ── */}
      <form className="add-form" onSubmit={handleAdd}>
        <h3>Add Food</h3>
        <div className={`form-row${selectedFood ? ' with-servings' : ''}`}>
          <div className="form-field">
            <label>Food Name</label>
            <FoodSearch
              value={form.food_name}
              onChange={handleNameChange}
              onSelect={handleSelectSavedFood}
              onClear={handleClearSelection}
            />
          </div>

          {selectedFood && (
            <div className="form-field">
              <label>Servings</label>
              <input
                type="number" min="0.1" step="0.1" placeholder="1"
                value={form.servings}
                onChange={e => handleServingsChange(e.target.value)}
              />
            </div>
          )}

          <div className="form-field">
            <label>Calories</label>
            <input type="number" min="0" placeholder="0"
              value={form.calories}
              onChange={e => setForm(f => ({ ...f, calories: e.target.value }))}
              readOnly={!!selectedFood}
            />
          </div>
          <div className="form-field">
            <label>Protein (g)</label>
            <input type="number" min="0" placeholder="0"
              value={form.protein}
              onChange={e => setForm(f => ({ ...f, protein: e.target.value }))}
              readOnly={!!selectedFood}
            />
          </div>
          <div className="form-field">
            <label>Carbs (g)</label>
            <input type="number" min="0" placeholder="0"
              value={form.carbs}
              onChange={e => setForm(f => ({ ...f, carbs: e.target.value }))}
              readOnly={!!selectedFood}
            />
          </div>
          <div className="form-field">
            <label>Fat (g)</label>
            <input type="number" min="0" placeholder="0"
              value={form.fat}
              onChange={e => setForm(f => ({ ...f, fat: e.target.value }))}
              readOnly={!!selectedFood}
            />
          </div>
        </div>

        <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
          <button className="btn-primary" type="submit" disabled={adding || !form.food_name.trim()}>
            {adding ? 'Adding…' : 'Add Entry'}
          </button>

          {!selectedFood && (
            <label style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 13, color: 'var(--text-muted)', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={saveAsTemplate}
                onChange={e => setSaveAsTemplate(e.target.checked)}
                style={{ width: 15, height: 15, accentColor: 'var(--accent)', cursor: 'pointer' }}
              />
              Save as template
            </label>
          )}

          {selectedFood && (
            <span style={{ fontSize: 13, color: 'var(--accent-light)', display: 'flex', alignItems: 'center', gap: 5 }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="20,6 9,17 4,12"/></svg>
              From saved foods
            </span>
          )}
        </div>
      </form>

      {/* ── Entry list ── */}
      {loading ? (
        <div className="empty-state">Loading…</div>
      ) : entries.length === 0 ? (
        <div className="empty-state">No entries for {formatDate(date)}. Add one above.</div>
      ) : (
        <>
          <div className="section-header">
            <span className="section-title">{entries.length} {entries.length === 1 ? 'entry' : 'entries'}</span>
            <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
              {Math.round(totalCals)} kcal · {Math.round(totalProtein)}g P · {Math.round(totalCarbs)}g C · {Math.round(totalFat)}g F
            </span>
          </div>

          <div className="entry-list">
            {entries.map(e => (
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
                <button className="btn-icon" title="Edit" onClick={() => setEditEntry(e)}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                  </svg>
                </button>
                <button className="btn-delete" title="Delete" onClick={() => setDeleteTarget(e)}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                  </svg>
                </button>
              </div>
            ))}
          </div>

          <div className="card" style={{ marginTop: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontWeight: 600, fontSize: 14 }}>Daily Total</span>
              <div className="daily-totals">
                {[
                  { label: 'Calories', val: Math.round(totalCals), unit: 'kcal', color: '#6c63ff' },
                  { label: 'Protein', val: Math.round(totalProtein), unit: 'g', color: '#60a5fa' },
                  { label: 'Carbs', val: Math.round(totalCarbs), unit: 'g', color: '#fbbf24' },
                  { label: 'Fat', val: Math.round(totalFat), unit: 'g', color: '#fb923c' },
                ].map(m => (
                  <div key={m.label} style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 18, fontWeight: 700, color: m.color }}>{m.val}<span style={{ fontSize: 12, color: 'var(--text-muted)', marginLeft: 1 }}>{m.unit}</span></div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{m.label}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </>
      )}

      {editEntry && <EditModal entry={editEntry} onSave={handleEditSaved} onClose={() => setEditEntry(null)} />}
      {deleteTarget && <DeleteConfirm entry={deleteTarget} onConfirm={handleDeleteConfirmed} onCancel={() => setDeleteTarget(null)} />}
      {showScanner && <PhotoScanner date={date} onSave={handleScanSave} onClose={() => setShowScanner(false)} />}
      {showBarcode && <BarcodeScanner date={date} onSave={handleBarcodeSave} onClose={() => setShowBarcode(false)} />}
    </div>
  );
}
