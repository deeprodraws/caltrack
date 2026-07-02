import { useState, useEffect, useRef, useCallback } from 'react';
import { getEntries, addEntry, updateEntry, deleteEntry, searchSavedFoods, createSavedFood } from '../api';
import PhotoScanner from '../components/PhotoScanner';
import BarcodeScanner from '../components/BarcodeScanner';
import SkeletonLoader from '../components/SkeletonLoader';
import { getCached, setCached, invalidateCache } from '../utils/cache';
import { scaleMacros, buildPortionOptions } from '../utils/portions';

function invalidateFoodlogAndDashboard(date) {
  invalidateCache('foodlog-' + date);
  invalidateCache('dashboard-' + date);
}

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

function round1(value) {
  return Math.round((Number(value) || 0) * 10) / 10;
}

const emptyForm = { food_name: '', calories: '', protein: '', carbs: '', fat: '', servings: '1', meal_type: 'breakfast' };

const MEAL_SECTIONS = [
  { value: 'breakfast', label: 'Breakfast', emoji: '🌅' },
  { value: 'lunch',     label: 'Lunch',     emoji: '☀️' },
  { value: 'dinner',    label: 'Dinner',    emoji: '🌙' },
  { value: 'snacks',    label: 'Snacks',    emoji: '🍎' },
];

const MEAL_TYPE_COLORS = {
  breakfast: '#fbbf24',
  lunch: '#34d399',
  dinner: '#6c63ff',
  snacks: '#fb923c',
};

function MealTypeSelector({ value, onChange }) {
  return (
    <div className="form-field">
      <label>Meal Type</label>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {MEAL_SECTIONS.map(mt => (
          <button
            key={mt.value}
            type="button"
            onClick={() => onChange(mt.value)}
            style={{
              padding: '7px 14px', borderRadius: 99, fontFamily: 'inherit',
              border: `1px solid ${value === mt.value ? MEAL_TYPE_COLORS[mt.value] : 'var(--border)'}`,
              background: value === mt.value ? MEAL_TYPE_COLORS[mt.value] : 'transparent',
              color: value === mt.value ? (mt.value === 'breakfast' || mt.value === 'snacks' ? '#000' : '#fff') : 'var(--text-muted)',
              fontSize: 13, fontWeight: 500, cursor: 'pointer', transition: 'all 0.15s',
            }}
          >{mt.emoji} {mt.label}</button>
        ))}
      </div>
    </div>
  );
}

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
                {round1(f.calories)} kcal · {round1(f.serving_size)}{f.serving_unit !== 'serving' ? f.serving_unit : ' serving'}
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
                  <input type="number" min="0" step="0.1" inputMode="decimal" value={form[k]} onChange={e => setForm(f => ({ ...f, [k]: e.target.value }))} />
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

// ── Template/recipe entry (collapsible) ──────────────────────────────────────
function TemplateEntryRow({ entry, expanded, onToggle, onDelete }) {
  const ingredients = entry.ingredients || [];
  return (
    <div style={{
      background: 'var(--surface)', border: '1px solid var(--border)',
      borderLeft: '3px solid var(--accent)', borderRadius: 'var(--radius-sm)', overflow: 'hidden',
    }}>
      <div onClick={onToggle} style={{ padding: '12px 16px', cursor: 'pointer' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
          <span style={{
            fontWeight: 500, fontSize: 14, display: 'flex', alignItems: 'center', gap: 6,
            minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            <span aria-hidden="true">🍽️</span>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {entry.source_name || entry.food_name}
            </span>
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
            <span style={{ fontWeight: 600, fontSize: 14 }}>{round1(entry.calories)} cal</span>
            <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>{expanded ? '▲' : '▼'}</span>
          </div>
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
          {round1(entry.protein)}p · {round1(entry.carbs)}c · {round1(entry.fat)}f
        </div>
        {!expanded && (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 }}>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              {ingredients.length} ingredient{ingredients.length !== 1 ? 's' : ''}
            </span>
            <button className="btn-delete" title="Delete" onClick={e => { e.stopPropagation(); onDelete(); }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          </div>
        )}
      </div>

      {expanded && (
        <>
          <div style={{ borderTop: '1px solid var(--border)', padding: '4px 16px' }}>
            {ingredients.map(ing => (
              <div key={ing.id} style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                fontSize: 13, padding: '7px 0', borderBottom: '1px solid var(--border)',
              }}>
                <span style={{
                  color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap', marginRight: 10, minWidth: 0,
                }}>
                  {ing.food_name} ({round1(ing.weight_grams)}{ing.weight_unit || 'g'})
                </span>
                <span style={{ flexShrink: 0 }}>{round1(ing.calories)} cal</span>
              </div>
            ))}
          </div>
          <div style={{
            padding: '10px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          }}>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              Logged from {entry.entry_type === 'recipe' ? 'recipe' : 'template'}
            </span>
            <button className="btn-delete" title="Delete" onClick={e => { e.stopPropagation(); onDelete(); }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          </div>
        </>
      )}
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
  const [portionGrams, setPortionGrams] = useState(100);
  const [customGrams, setCustomGrams] = useState('');
  const [adding, setAdding] = useState(false);
  const [loading, setLoading] = useState(true);
  const [editEntry, setEditEntry] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [showScanner, setShowScanner] = useState(false);
  const [showBarcode, setShowBarcode] = useState(false);
  const [expandedEntryId, setExpandedEntryId] = useState(null);

  useEffect(() => {
    const cacheKey = 'foodlog-' + date;
    const cached = getCached(cacheKey);
    setExpandedEntryId(null);
    if (cached) {
      setEntries(cached);
      setLoading(false);
      return;
    }
    setLoading(true);
    getEntries(date).then(e => {
      setEntries(e);
      setLoading(false);
      setCached(cacheKey, e);
    });
  }, [date]);

  function shiftDate(days) {
    const d = new Date(date + 'T12:00:00');
    d.setDate(d.getDate() + days);
    setDate(localDateStr(d));
  }

  // When a saved food is selected from autocomplete, pre-fill form
  function handleSelectSavedFood(food) {
    setSelectedFood(food);
    setCustomGrams('');
    if (food.macros_per_100g) {
      const macros = scaleMacros(food, 100);
      setPortionGrams(100);
      setForm({
        food_name: food.name,
        calories: String(macros.calories),
        protein: String(macros.protein),
        carbs: String(macros.carbs),
        fat: String(macros.fat),
        servings: '1',
      });
    } else {
      setForm({
        food_name: food.name,
        calories: String(food.calories),
        protein: String(food.protein),
        carbs: String(food.carbs),
        fat: String(food.fat),
        servings: '1',
      });
    }
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

  function handlePortionChange(val) {
    if (val === 'custom') {
      setPortionGrams('custom');
      return;
    }
    const weightGrams = Number(val);
    setPortionGrams(weightGrams);
    const macros = scaleMacros(selectedFood, weightGrams);
    setForm(f => ({
      ...f,
      calories: String(macros.calories),
      protein: String(macros.protein),
      carbs: String(macros.carbs),
      fat: String(macros.fat),
    }));
  }

  function handleCustomGramsChange(val) {
    setCustomGrams(val);
    const weightGrams = parseFloat(val) || 0;
    if (weightGrams <= 0) return;
    const macros = scaleMacros(selectedFood, weightGrams);
    setForm(f => ({
      ...f,
      calories: String(macros.calories),
      protein: String(macros.protein),
      carbs: String(macros.carbs),
      fat: String(macros.fat),
    }));
  }

  function handleNameChange(val) {
    setForm(f => ({ ...f, food_name: val }));
    if (selectedFood && val !== selectedFood.name) setSelectedFood(null);
  }

  function handleClearSelection() {
    setSelectedFood(null);
    setPortionGrams(100);
    setCustomGrams('');
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
      meal_type: form.meal_type,
    };

    const entry = await addEntry(payload);
    setEntries(prev => [...prev, entry]);
    invalidateFoodlogAndDashboard(date);

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
    invalidateFoodlogAndDashboard(date);
    setShowScanner(false);
  }

  async function handleBarcodeSave(entry) {
    const saved = await addEntry(entry);
    setEntries(prev => [...prev, saved]);
    invalidateFoodlogAndDashboard(date);
    setShowBarcode(false);
  }

  async function handleDeleteConfirmed() {
    await deleteEntry(deleteTarget.id);
    setEntries(prev => prev.filter(e => e.id !== deleteTarget.id));
    invalidateFoodlogAndDashboard(date);
    setDeleteTarget(null);
  }

  function handleEditSaved(updated) {
    setEntries(prev => prev.map(e => e.id === updated.id ? updated : e));
    invalidateFoodlogAndDashboard(date);
    setEditEntry(null);
  }

  const totalCals = sum(entries, 'calories');
  const totalProtein = sum(entries, 'protein');
  const totalCarbs = sum(entries, 'carbs');
  const totalFat = sum(entries, 'fat');

  const mealGroups = MEAL_SECTIONS
    .map(section => ({
      ...section,
      items: entries.filter(e => (e.meal_type || 'snacks') === section.value),
    }))
    .filter(g => g.items.length > 0);

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

          {selectedFood && !selectedFood.macros_per_100g && (
            <div className="form-field">
              <label>Servings</label>
              <input
                type="number" min="0.1" step="0.1" inputMode="decimal" placeholder="1"
                value={form.servings}
                onChange={e => handleServingsChange(e.target.value)}
              />
            </div>
          )}

          {selectedFood && selectedFood.macros_per_100g && (
            <div className="form-field">
              <label>Portion</label>
              <select value={portionGrams} onChange={e => handlePortionChange(e.target.value)}>
                {buildPortionOptions(selectedFood).map(opt => (
                  <option key={opt.label} value={opt.weight_grams}>{opt.label}</option>
                ))}
                <option value="custom">Custom (g)</option>
              </select>
              {portionGrams === 'custom' && (
                <input
                  type="number" min="0" step="0.1" inputMode="decimal" placeholder="grams"
                  value={customGrams}
                  onChange={e => handleCustomGramsChange(e.target.value)}
                  style={{ marginTop: 6 }}
                />
              )}
            </div>
          )}

          <div className="form-field">
            <label>Calories</label>
            <input type="number" min="0" step="0.1" inputMode="decimal" placeholder="0"
              value={form.calories}
              onChange={e => setForm(f => ({ ...f, calories: e.target.value }))}
              readOnly={!!selectedFood}
            />
          </div>
          <div className="form-field">
            <label>Protein (g)</label>
            <input type="number" min="0" step="0.1" inputMode="decimal" placeholder="0"
              value={form.protein}
              onChange={e => setForm(f => ({ ...f, protein: e.target.value }))}
              readOnly={!!selectedFood}
            />
          </div>
          <div className="form-field">
            <label>Carbs (g)</label>
            <input type="number" min="0" step="0.1" inputMode="decimal" placeholder="0"
              value={form.carbs}
              onChange={e => setForm(f => ({ ...f, carbs: e.target.value }))}
              readOnly={!!selectedFood}
            />
          </div>
          <div className="form-field">
            <label>Fat (g)</label>
            <input type="number" min="0" step="0.1" inputMode="decimal" placeholder="0"
              value={form.fat}
              onChange={e => setForm(f => ({ ...f, fat: e.target.value }))}
              readOnly={!!selectedFood}
            />
          </div>
        </div>

        <div style={{ marginTop: 14 }}>
          <MealTypeSelector value={form.meal_type} onChange={mt => setForm(f => ({ ...f, meal_type: mt }))} />
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
        <SkeletonLoader count={4} height={64} />
      ) : entries.length === 0 ? (
        <div className="empty-state">No entries for {formatDate(date)}. Add one above.</div>
      ) : (
        <>
          <div className="section-header">
            <span className="section-title">{entries.length} {entries.length === 1 ? 'entry' : 'entries'}</span>
            <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
              {round1(totalCals)} kcal · {round1(totalProtein)}g P · {round1(totalCarbs)}g C · {round1(totalFat)}g F
            </span>
          </div>

          {mealGroups.map(group => (
            <div key={group.value} style={{ marginBottom: 18 }}>
              <div className="section-header" style={{ marginBottom: 8 }}>
                <span className="section-title">{group.emoji} {group.label}</span>
                <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                  {round1(sum(group.items, 'calories'))} cal
                </span>
              </div>
              <div className="entry-list">
                {group.items.map(e => (
                  e.entry_type && e.entry_type !== 'single' ? (
                    <TemplateEntryRow
                      key={e.id}
                      entry={e}
                      expanded={expandedEntryId === e.id}
                      onToggle={() => setExpandedEntryId(prev => prev === e.id ? null : e.id)}
                      onDelete={() => setDeleteTarget(e)}
                    />
                  ) : (
                    <div key={e.id} className="entry-row">
                      <span className="entry-name">{e.food_name}</span>
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
                  )
                ))}
              </div>
            </div>
          ))}

          <div className="card" style={{ marginTop: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontWeight: 600, fontSize: 14 }}>Daily Total</span>
              <div className="daily-totals">
                {[
                  { label: 'Calories', val: round1(totalCals), unit: 'kcal', color: '#6c63ff' },
                  { label: 'Protein', val: round1(totalProtein), unit: 'g', color: '#60a5fa' },
                  { label: 'Carbs', val: round1(totalCarbs), unit: 'g', color: '#fbbf24' },
                  { label: 'Fat', val: round1(totalFat), unit: 'g', color: '#fb923c' },
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
