import { useState, useEffect } from 'react';
import { getSavedFoods, createSavedFood, updateSavedFood, deleteSavedFood } from '../api';
import BarcodeScanner from '../components/BarcodeScanner';
import SkeletonLoader from '../components/SkeletonLoader';
import { getCached, setCached, invalidateCache } from '../utils/cache';

const SAVED_FOODS_CACHE_TTL = 300000; // 5 minutes

const emptyForm = { name: '', calories: '', protein: '', carbs: '', fat: '', serving_size: '1', serving_unit: 'serving' };

function round1(value) {
  return Math.round((Number(value) || 0) * 10) / 10;
}

function newPortion() {
  return { _id: Date.now() + Math.random(), label: '', weight_grams: '' };
}

function PortionsEditor({ portions, onChange }) {
  function updateRow(i, patch) {
    onChange(portions.map((p, j) => j === i ? { ...p, ...patch } : p));
  }
  function removeRow(i) {
    onChange(portions.filter((_, j) => j !== i));
  }
  return (
    <div style={{ marginBottom: 20 }}>
      <label style={{ display: 'block', marginBottom: 8 }}>Portions</label>
      {portions.map((p, i) => (
        <div key={p._id} style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center' }}>
          <input
            value={p.label}
            onChange={e => updateRow(i, { label: e.target.value })}
            placeholder="e.g. 1 cup"
            style={{ flex: 1, background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, padding: '9px 12px', color: 'var(--text)', fontFamily: 'inherit', fontSize: 14 }}
          />
          <input
            type="number" min="0" step="0.1" inputMode="decimal"
            value={p.weight_grams}
            onChange={e => updateRow(i, { weight_grams: e.target.value })}
            placeholder="90"
            style={{ width: 70, background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, padding: '9px 8px', color: 'var(--text)', fontFamily: 'inherit', fontSize: 14, textAlign: 'center' }}
          />
          <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>g</span>
          <button type="button" onClick={() => removeRow(i)}
            style={{ width: 30, height: 30, background: 'rgba(248,113,113,0.1)', border: 'none', borderRadius: 8, color: '#f87171', fontSize: 16, cursor: 'pointer', flexShrink: 0 }}>×</button>
        </div>
      ))}
      <button type="button" onClick={() => onChange([...portions, newPortion()])}
        style={{ width: '100%', padding: '9px', borderRadius: 8, background: 'transparent', border: '1px dashed var(--border)', color: 'var(--text-muted)', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>
        + Add Portion
      </button>
    </div>
  );
}

function FoodModal({ food, onSave, onClose }) {
  const [form, setForm] = useState(
    food
      ? { name: food.name, calories: food.calories, protein: food.protein, carbs: food.carbs, fat: food.fat, serving_size: food.serving_size, serving_unit: food.serving_unit }
      : emptyForm
  );
  const [macrosPer100g, setMacrosPer100g] = useState(food ? !!food.macros_per_100g : true);
  const [portions, setPortions] = useState(
    (food?.portions || []).map(p => ({ ...p, _id: p.id }))
  );
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    const payload = {
      name: form.name.trim(),
      calories: Number(form.calories) || 0,
      protein: Number(form.protein) || 0,
      carbs: Number(form.carbs) || 0,
      fat: Number(form.fat) || 0,
      serving_size: Number(form.serving_size) || 1,
      serving_unit: form.serving_unit || 'serving',
      macros_per_100g: macrosPer100g,
      portions: macrosPer100g
        ? portions.filter(p => p.label.trim() && +p.weight_grams > 0)
            .map((p, i) => ({ label: p.label.trim(), weight_grams: +p.weight_grams, sort_order: i }))
        : [],
    };
    if (food) {
      const updated = await updateSavedFood(food.id, payload);
      onSave(updated, 'update');
    } else {
      const created = await createSavedFood(payload);
      onSave(created, 'create');
    }
    setSaving(false);
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3>{food ? 'Edit Food' : 'Add Food Template'}</h3>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          <form onSubmit={handleSubmit}>
            <div className="settings-field" style={{ marginBottom: 14 }}>
              <label>Food Name</label>
              <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required placeholder="e.g. Chicken breast" />
            </div>

            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8,
              padding: '10px 14px', marginBottom: 16,
            }}>
              <span style={{ fontSize: 13, fontWeight: 500 }}>Store macros per 100g (enables portion scaling)</span>
              <label style={{ position: 'relative', display: 'inline-block', width: 40, height: 22, flexShrink: 0, marginLeft: 10 }}>
                <input type="checkbox" checked={macrosPer100g} onChange={e => setMacrosPer100g(e.target.checked)}
                  style={{ opacity: 0, width: 0, height: 0 }} />
                <span style={{
                  position: 'absolute', inset: 0, borderRadius: 99, cursor: 'pointer', transition: 'background 0.15s',
                  background: macrosPer100g ? 'var(--accent)' : 'var(--border)',
                }} onClick={() => setMacrosPer100g(v => !v)} />
                <span style={{
                  position: 'absolute', top: 3, left: macrosPer100g ? 21 : 3, width: 16, height: 16,
                  borderRadius: '50%', background: '#fff', transition: 'left 0.15s', pointerEvents: 'none',
                }} />
              </label>
            </div>

            <div className="modal-macros">
              {[
                { key: 'calories', label: macrosPer100g ? 'Calories /100g' : 'Calories (kcal)' },
                { key: 'protein', label: macrosPer100g ? 'Protein /100g' : 'Protein (g)' },
                { key: 'carbs', label: macrosPer100g ? 'Carbs /100g' : 'Carbs (g)' },
                { key: 'fat', label: macrosPer100g ? 'Fat /100g' : 'Fat (g)' },
              ].map(({ key, label }) => (
                <div key={key} className="settings-field">
                  <label>{label}</label>
                  <input type="number" min="0" step="0.1" inputMode="decimal" value={form[key]} onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))} />
                </div>
              ))}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>
              <div className="settings-field">
                <label>Serving Size</label>
                <input type="number" min="0.1" step="0.1" inputMode="decimal" value={form.serving_size} onChange={e => setForm(f => ({ ...f, serving_size: e.target.value }))} />
              </div>
              <div className="settings-field">
                <label>Serving Unit</label>
                <input value={form.serving_unit} onChange={e => setForm(f => ({ ...f, serving_unit: e.target.value }))} placeholder="serving, g, ml…" />
              </div>
            </div>

            {macrosPer100g && <PortionsEditor portions={portions} onChange={setPortions} />}

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button type="button" onClick={onClose} style={{
                background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)',
                padding: '10px 18px', borderRadius: 8, fontSize: 14,
              }}>Cancel</button>
              <button className="btn-primary" type="submit" disabled={saving}>{saving ? 'Saving…' : food ? 'Save Changes' : 'Add Food'}</button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

function DeleteConfirm({ food, onConfirm, onCancel }) {
  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal-box" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Delete food template?</h3>
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
            Remove <strong style={{ color: 'var(--text)' }}>{food.name}</strong> from your saved foods?<br />
            <span style={{ fontSize: 12 }}>This won't affect existing log entries.</span>
          </p>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
            <button onClick={onCancel} style={{
              background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)',
              padding: '10px 20px', borderRadius: 8, fontSize: 14,
            }}>Cancel</button>
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

export default function MyFoods({ embedded = false }) {
  const [foods, setFoods] = useState([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [modal, setModal] = useState(null); // null | { mode: 'add' | 'edit', food?: {} }
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [showBarcode, setShowBarcode] = useState(false);

  useEffect(() => {
    const cached = getCached('saved-foods', SAVED_FOODS_CACHE_TTL);
    if (cached) {
      setFoods(cached);
      setLoading(false);
      return;
    }
    getSavedFoods().then(f => {
      setFoods(f);
      setLoading(false);
      setCached('saved-foods', f);
    });
  }, []);

  const filtered = query.trim()
    ? foods.filter(f => f.name.toLowerCase().includes(query.toLowerCase()))
    : foods;

  function handleSave(food, mode) {
    if (mode === 'create') setFoods(prev => [...prev, food].sort((a, b) => a.name.localeCompare(b.name)));
    else setFoods(prev => prev.map(f => f.id === food.id ? food : f));
    invalidateCache('saved-foods');
    setModal(null);
  }

  async function handleBarcodeSave(entry) {
    // Save as template (no date field)
    const food = await createSavedFood({
      name: entry.food_name,
      calories: entry.calories,
      protein: entry.protein,
      carbs: entry.carbs,
      fat: entry.fat,
      serving_size: 1,
      serving_unit: 'serving',
    });
    setFoods(prev => [...prev, food].sort((a, b) => a.name.localeCompare(b.name)));
    invalidateCache('saved-foods');
    setShowBarcode(false);
  }

  async function handleDeleteConfirmed() {
    await deleteSavedFood(deleteTarget.id);
    setFoods(prev => prev.filter(f => f.id !== deleteTarget.id));
    invalidateCache('saved-foods');
    setDeleteTarget(null);
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: embedded ? 'flex-end' : 'space-between', marginBottom: 20 }}>
        {!embedded && <div className="page-title" style={{ margin: 0 }}>My Foods</div>}
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn-primary" onClick={() => setModal({ mode: 'add' })}>+ Add Food</button>
          <button
            onClick={() => setShowBarcode(true)}
            style={{
              display: 'flex', alignItems: 'center', gap: 7, background: 'var(--accent)',
              color: '#fff', border: 'none', padding: '9px 16px',
              borderRadius: 8, fontFamily: 'inherit', fontSize: 13, fontWeight: 600, cursor: 'pointer',
              transition: 'opacity 0.15s',
            }}
            onMouseEnter={e => e.currentTarget.style.opacity = '0.88'}
            onMouseLeave={e => e.currentTarget.style.opacity = '1'}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 5v14M7 5v14M11 5v14M15 5v14M19 5v14M21 5v3M21 16v3"/></svg> Scan
          </button>
        </div>
      </div>

      <div style={{ marginBottom: 20 }}>
        <input
          className="settings-field"
          style={{
            background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8,
            padding: '10px 14px', color: 'var(--text)', fontSize: 14, width: '100%', maxWidth: 320,
            fontFamily: 'inherit',
          }}
          placeholder="Search saved foods…"
          value={query}
          onChange={e => setQuery(e.target.value)}
        />
      </div>

      {loading ? (
        <SkeletonLoader count={4} height={64} />
      ) : filtered.length === 0 ? (
        <div className="empty-state">
          {query ? `No foods matching "${query}"` : 'No saved foods yet. Add one above or check "Save as template" when logging food.'}
        </div>
      ) : (
        <div className="entry-list">
          {filtered.map(f => (
            <div key={f.id} className="entry-row">
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 500, fontSize: 14 }}>{f.name}</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                  per {round1(f.serving_size)} {f.serving_unit}
                </div>
              </div>
              <div className="entry-macros">
                <div className="entry-macro">
                  <div className="val" style={{ color: '#6c63ff' }}>{round1(f.calories)}</div>
                  <div className="lbl">kcal</div>
                </div>
                <div className="entry-macro">
                  <div className="val" style={{ color: '#60a5fa' }}>{round1(f.protein)}g</div>
                  <div className="lbl">protein</div>
                </div>
                <div className="entry-macro">
                  <div className="val" style={{ color: '#fbbf24' }}>{round1(f.carbs)}g</div>
                  <div className="lbl">carbs</div>
                </div>
                <div className="entry-macro">
                  <div className="val" style={{ color: '#fb923c' }}>{round1(f.fat)}g</div>
                  <div className="lbl">fat</div>
                </div>
              </div>
              <button className="btn-icon" title="Edit" onClick={() => setModal({ mode: 'edit', food: f })}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                </svg>
              </button>
              <button className="btn-delete" title="Delete" onClick={() => setDeleteTarget(f)}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>
          ))}
        </div>
      )}

      {modal && (
        <FoodModal
          food={modal.mode === 'edit' ? modal.food : null}
          onSave={handleSave}
          onClose={() => setModal(null)}
        />
      )}
      {deleteTarget && (
        <DeleteConfirm food={deleteTarget} onConfirm={handleDeleteConfirmed} onCancel={() => setDeleteTarget(null)} />
      )}
      {showBarcode && (
        <BarcodeScanner date="2000-01-01" onSave={handleBarcodeSave} onClose={() => setShowBarcode(false)} />
      )}
    </div>
  );
}
