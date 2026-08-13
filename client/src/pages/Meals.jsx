import { useState, useEffect, useRef, useCallback } from 'react';
import {
  getMealTemplates, getMealTemplate, createMealTemplate, updateMealTemplate,
  deleteMealTemplate, logMealTemplate,
  getRecipes, getRecipe, createRecipe, updateRecipe, deleteRecipe, logRecipe,
  getIngredientMemory,
} from '../api';
import SkeletonLoader from '../components/SkeletonLoader';
import BottomSheet from '../components/BottomSheet';
import TabBar from '../components/TabBar';
import Toast, { useToast } from '../components/Toast';
import DeleteConfirm from '../components/DeleteConfirm';
import { getCached, setCached, invalidateCache } from '../utils/cache';

export const MEALS_CACHE_TTL = 300000; // 5 minutes

function invalidateMealsCache() {
  invalidateCache('meals-templates');
  invalidateCache('meals-recipes');
}

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

const MEAL_TYPES = [
  { value: 'breakfast', label: 'Breakfast' },
  { value: 'lunch',     label: 'Lunch' },
  { value: 'dinner',    label: 'Dinner' },
  { value: 'snacks',    label: 'Snacks' },
];

const MEAL_TYPE_COLORS = {
  breakfast: 'var(--yellow)',
  lunch: 'var(--green)',
  dinner: 'var(--accent)',
  snacks: 'var(--orange)',
};

function newIngredient() {
  return {
    _id: Date.now() + Math.random(),
    food_name: '',
    weight_grams: '',
    weight_unit: 'g',
    calories: '',
    protein: '',
    carbs: '',
    fat: '',
    _cal_g: null, _protein_g: null, _carbs_g: null, _fat_g: null,
  };
}

function fromTemplateIngredient(ing) {
  const w = +ing.weight_grams || 0;
  return {
    _id: ing.id,
    food_name: ing.food_name,
    weight_grams: String(w),
    weight_unit: ing.weight_unit || 'g',
    calories: ing.calories,
    protein:  ing.protein,
    carbs:    ing.carbs,
    fat:      ing.fat,
    _cal_g:     w > 0 ? ing.calories / w : null,
    _protein_g: w > 0 ? ing.protein  / w : null,
    _carbs_g:   w > 0 ? ing.carbs    / w : null,
    _fat_g:     w > 0 ? ing.fat      / w : null,
  };
}

function round1(value) {
  return Math.round((Number(value) || 0) * 10) / 10;
}

function calcTotals(ings) {
  return ings.reduce(
    (acc, i) => ({
      cal: acc.cal + (Number(i.calories) || 0),
      p:   acc.p   + (Number(i.protein)  || 0),
      c:   acc.c   + (Number(i.carbs)    || 0),
      f:   acc.f   + (Number(i.fat)      || 0),
    }),
    { cal: 0, p: 0, c: 0, f: 0 }
  );
}

// ── Shared UI pieces ──────────────────────────────────────────────────────────

function MealTypeSelector({ value, onChange }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 10 }}>Meal Type</div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {MEAL_TYPES.map(mt => (
          <button
            key={mt.value}
            type="button"
            onClick={() => onChange(mt.value)}
            style={{
              padding: '7px 16px', borderRadius: 99, fontFamily: 'inherit',
              border: `1px solid ${value === mt.value ? MEAL_TYPE_COLORS[mt.value] : 'var(--border)'}`,
              background: value === mt.value ? MEAL_TYPE_COLORS[mt.value] : 'transparent',
              color: value === mt.value ? (mt.value === 'breakfast' || mt.value === 'snacks' ? '#000' : '#fff') : 'var(--text-muted)',
              fontSize: 13, fontWeight: 500, cursor: 'pointer',
              transition: 'background-color 0.15s ease, border-color 0.15s ease, color 0.15s ease',
            }}
          >{mt.label}</button>
        ))}
      </div>
    </div>
  );
}

function MacroSummaryBar({ cal, p, c, f }) {
  return (
    <div style={{
      background: 'rgba(108,99,255,0.08)', border: '1px solid rgba(108,99,255,0.2)',
      borderRadius: 10, padding: '10px 16px', display: 'flex', gap: 14, flexWrap: 'wrap',
      fontSize: 13, marginBottom: 16,
    }}>
      <span style={{ color: 'var(--accent)', fontWeight: 700 }}>{round1(cal)} kcal</span>
      <span style={{ color: 'var(--blue)' }}>{round1(p)}g P</span>
      <span style={{ color: 'var(--yellow)' }}>{round1(c)}g C</span>
      <span style={{ color: 'var(--orange)' }}>{round1(f)}g F</span>
    </div>
  );
}

function IngredientEditorRow({ ing, onChange, onDelete, memoryHint, isReadonlyMacros }) {
  function handleWeightChange(val) {
    const w = parseFloat(val) || 0;
    if (ing._cal_g != null) {
      onChange({
        ...ing,
        weight_grams: val,
        calories: w > 0 ? +(ing._cal_g     * w).toFixed(1) : 0,
        protein:  w > 0 ? +(ing._protein_g * w).toFixed(1) : 0,
        carbs:    w > 0 ? +(ing._carbs_g   * w).toFixed(1) : 0,
        fat:      w > 0 ? +(ing._fat_g     * w).toFixed(1) : 0,
      });
    } else {
      onChange({ ...ing, weight_grams: val });
    }
  }

  return (
    <div className="ingredient-row-in" style={{
      background: 'var(--surface2)', border: '1px solid var(--border)',
      borderRadius: 10, padding: '12px 14px', marginBottom: 10,
    }}>
      {/* Name row */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
        <input
          value={ing.food_name}
          onChange={e => onChange({ ...ing, food_name: e.target.value })}
          placeholder="Ingredient name"
          style={{
            flex: 1, background: 'var(--surface)', border: '1px solid var(--border)',
            borderRadius: 8, padding: '8px 12px', color: 'var(--text)',
            fontFamily: 'inherit', fontSize: 14, fontWeight: 500,
          }}
        />
        <button
          type="button"
          onClick={onDelete}
          style={{
            width: 34, height: 34, background: 'rgba(248,113,113,0.1)',
            border: 'none', borderRadius: 8, color: 'var(--red)',
            fontSize: 18, lineHeight: 1, cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}
        >×</button>
      </div>

      {/* Weight + macros */}
      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
        {/* Amount + Unit */}
        <div style={{ flexShrink: 0 }}>
          <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 4 }}>
            {(ing.weight_unit || 'g') === 'ml' ? 'Amount (ml)' : 'Weight (g)'}
          </div>
          <div style={{ display: 'flex', gap: 4 }}>
            <input
              type="number" min="0" step="0.1" inputMode="decimal"
              value={ing.weight_grams}
              onChange={e => handleWeightChange(e.target.value)}
              placeholder={(ing.weight_unit || 'g') !== 'ml' && memoryHint ? String(memoryHint) : '0'}
              style={{
                width: 58, background: 'var(--surface)', border: '1px solid var(--border)',
                borderRadius: 8, padding: '7px 8px', color: 'var(--text)',
                fontFamily: 'inherit', fontSize: 14,
              }}
            />
            <select
              value={ing.weight_unit || 'g'}
              onChange={e => onChange({ ...ing, weight_unit: e.target.value })}
              style={{
                width: 46, background: 'var(--surface)', border: '1px solid var(--border)',
                borderRadius: 8, padding: '7px 4px', color: 'var(--text)',
                fontFamily: 'inherit', fontSize: 13, cursor: 'pointer',
              }}
            >
              <option value="g">g</option>
              <option value="ml">ml</option>
            </select>
          </div>
          {memoryHint && (ing.weight_unit || 'g') !== 'ml' && (
            <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4, fontStyle: 'italic' }}>
              Usually {memoryHint}g
            </div>
          )}
        </div>

        {/* Macros */}
        {isReadonlyMacros ? (
          <div style={{ flex: 1, display: 'flex', gap: 10, flexWrap: 'wrap', paddingTop: 20 }}>
            {[
              { label: 'kcal', val: ing.calories, color: 'var(--accent)' },
              { label: 'P', val: ing.protein, color: 'var(--blue)' },
              { label: 'C', val: ing.carbs, color: 'var(--yellow)' },
              { label: 'F', val: ing.fat, color: 'var(--orange)' },
            ].map(m => (
              <div key={m.label} style={{ textAlign: 'center', minWidth: 38 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: m.color, lineHeight: 1 }}>
                  {m.label === 'kcal' ? round1(m.val) : `${round1(m.val)}g`}
                </div>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>{m.label}</div>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {[
              { key: 'calories', label: 'kcal', color: 'var(--accent)' },
              { key: 'protein',  label: 'P (g)', color: 'var(--blue)' },
              { key: 'carbs',    label: 'C (g)', color: 'var(--yellow)' },
              { key: 'fat',      label: 'F (g)', color: 'var(--orange)' },
            ].map(m => (
              <div key={m.key}>
                <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 4 }}>{m.label}</div>
                <input
                  type="number" min="0" step="0.1" inputMode="decimal"
                  value={ing[m.key]}
                  onChange={e => onChange({ ...ing, [m.key]: e.target.value })}
                  style={{
                    width: '100%', background: 'var(--surface)', border: '1px solid var(--border)',
                    borderRadius: 8, padding: '6px 8px', color: m.color,
                    fontFamily: 'inherit', fontSize: 13, fontWeight: 600,
                  }}
                />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// IngredientEditor manages the list + memory hints + add/remove
function IngredientEditor({ ingredients, onChange, mode = 'edit' }) {
  const [memoryHints, setMemoryHints] = useState({});
  const debounceRefs = useRef({});
  const ingredientsRef = useRef(ingredients);
  useEffect(() => { ingredientsRef.current = ingredients; }, [ingredients]);

  const fetchMemory = useCallback((id, name) => {
    clearTimeout(debounceRefs.current[id]);
    if (!name || name.trim().length < 2) return;
    debounceRefs.current[id] = setTimeout(async () => {
      const hint = await getIngredientMemory(name.trim());
      if (hint?.typical_weight_grams) {
        setMemoryHints(prev => ({ ...prev, [id]: hint.typical_weight_grams }));
      }
    }, 350);
  }, []);

  function handleChange(index, newIng) {
    const prev = ingredients[index];
    const updated = ingredients.map((ing, i) => i === index ? newIng : ing);
    onChange(updated);
    if (newIng.food_name !== prev.food_name) {
      fetchMemory(newIng._id, newIng.food_name);
    }
  }

  function addIngredient() {
    onChange([...ingredients, newIngredient()]);
  }

  function removeIngredient(index) {
    onChange(ingredients.filter((_, i) => i !== index));
  }

  return (
    <div>
      {ingredients.length === 0 && (
        <div style={{ textAlign: 'center', padding: '20px 0', color: 'var(--text-muted)', fontSize: 13 }}>
          No ingredients yet — add one below
        </div>
      )}
      {ingredients.map((ing, i) => (
        <IngredientEditorRow
          key={ing._id}
          ing={ing}
          onChange={newIng => handleChange(i, newIng)}
          onDelete={() => removeIngredient(i)}
          memoryHint={memoryHints[ing._id]}
          isReadonlyMacros={mode === 'log' && ing._cal_g != null}
        />
      ))}
      <button
        type="button"
        onClick={addIngredient}
        className="hover-dashed"
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          width: '100%', padding: '11px', background: 'transparent',
          border: '1px dashed var(--border)', borderRadius: 10,
          color: 'var(--accent-light)', fontSize: 14, fontWeight: 500,
          cursor: 'pointer', fontFamily: 'inherit',
        }}
      >
        + Add Ingredient
      </button>
    </div>
  );
}

// ── Template Editor Sheet ─────────────────────────────────────────────────────

export function TemplateEditorSheet({ template, onSave, onClose }) {
  const isEdit = !!template;
  const [name, setName] = useState(template?.name ?? '');
  const [mealType, setMealType] = useState(template?.meal_type ?? 'breakfast');
  const [ingredients, setIngredients] = useState(
    template?.ingredients?.map(ing => ({ ...ing, _id: ing.id, _cal_g: null, _protein_g: null, _carbs_g: null, _fat_g: null })) ?? []
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function handleSave(e) {
    e.preventDefault();
    if (!name.trim()) return setError('Template name is required');
    setSaving(true);
    setError('');
    try {
      const payload = {
        name: name.trim(),
        meal_type: mealType,
        ingredients: ingredients.map(ing => ({
          food_name:    ing.food_name,
          weight_grams: +ing.weight_grams || 0,
          weight_unit:  ing.weight_unit || 'g',
          calories:     +ing.calories     || 0,
          protein:      +ing.protein      || 0,
          carbs:        +ing.carbs        || 0,
          fat:          +ing.fat          || 0,
        })),
      };
      const saved = isEdit
        ? await updateMealTemplate(template.id, payload)
        : await createMealTemplate(payload);
      onSave(saved);
    } catch (err) {
      setError(err.message || 'Save failed');
      setSaving(false);
    }
  }

  const totals = calcTotals(ingredients);

  return (
    <BottomSheet onClose={onClose} title={isEdit ? 'Edit Template' : 'New Meal Template'}>
      <form onSubmit={handleSave}>
        <div className="settings-field" style={{ marginBottom: 16 }}>
          <label>Template Name</label>
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="e.g. Morning Oats"
            required
          />
        </div>

        <MealTypeSelector value={mealType} onChange={setMealType} />

        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 12, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
          Ingredients
        </div>

        <IngredientEditor ingredients={ingredients} onChange={setIngredients} mode="edit" />

        {ingredients.length > 0 && (
          <div style={{ marginTop: 16 }}>
            <MacroSummaryBar cal={totals.cal} p={totals.p} c={totals.c} f={totals.f} />
          </div>
        )}

        {error && <div style={{ color: 'var(--red)', fontSize: 13, marginBottom: 12 }}>{error}</div>}

        <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
          <button type="button" onClick={onClose} style={{ background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)', padding: '11px 18px', borderRadius: 8, fontSize: 14, fontFamily: 'inherit' }}>Cancel</button>
          <button className="btn-primary" type="submit" disabled={saving} style={{ flex: 1 }}>
            {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Create Template'}
          </button>
        </div>
      </form>
    </BottomSheet>
  );
}

// ── Log Meal Sheet ────────────────────────────────────────────────────────────

export function LogMealSheet({ template, onClose, onLogged }) {
  const [mealType, setMealType] = useState(template.meal_type ?? 'breakfast');
  const [ingredients, setIngredients] = useState(
    template.ingredients?.map(fromTemplateIngredient) ?? []
  );
  const [logging, setLogging] = useState(false);
  const [error, setError] = useState('');

  async function handleLog() {
    if (!ingredients.length) return setError('Add at least one ingredient');
    setLogging(true);
    setError('');
    try {
      const { entry } = await logMealTemplate(template.id, {
        date: todayStr(),
        meal_type: mealType,
        ingredients: ingredients.map(ing => ({
          food_name:    ing.food_name,
          weight_grams: +ing.weight_grams || 0,
          weight_unit:  ing.weight_unit || 'g',
          calories:     +ing.calories     || 0,
          protein:      +ing.protein      || 0,
          carbs:        +ing.carbs        || 0,
          fat:          +ing.fat          || 0,
        })),
      });
      onLogged(entry);
    } catch (err) {
      setError(err.message || 'Log failed');
      setLogging(false);
    }
  }

  const totals = calcTotals(ingredients);

  return (
    <BottomSheet
      onClose={onClose}
      title={<><h3>Log — {template.name}</h3><p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '2px 0 0' }}>Adjust weights before logging to today</p></>}
    >
      <MealTypeSelector value={mealType} onChange={setMealType} />

      <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 12 }}>
        Ingredients
      </div>

      <IngredientEditor ingredients={ingredients} onChange={setIngredients} mode="log" />

      {ingredients.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <MacroSummaryBar cal={totals.cal} p={totals.p} c={totals.c} f={totals.f} />
        </div>
      )}

      {error && <div style={{ color: 'var(--red)', fontSize: 13, marginBottom: 12 }}>{error}</div>}

      <p style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'center', marginBottom: 8 }}>
        This will log as a single entry in your food log
      </p>

      <button
        onClick={handleLog}
        disabled={logging || !ingredients.length}
        style={{
          width: '100%', background: 'var(--accent)', color: '#fff', border: 'none',
          padding: '13px', borderRadius: 8, fontFamily: 'inherit', fontSize: 15,
          fontWeight: 600, cursor: 'pointer', marginTop: 4,
          opacity: logging || !ingredients.length ? 0.5 : 1,
        }}
      >
        {logging ? 'Logging…' : `Log ${ingredients.length} Item${ingredients.length !== 1 ? 's' : ''} to Today`}
      </button>
    </BottomSheet>
  );
}

// ── Recipe Editor Sheet ───────────────────────────────────────────────────────

export function RecipeEditorSheet({ recipe, onSave, onClose }) {
  const isEdit = !!recipe;
  const [name, setName] = useState(recipe?.name ?? '');
  const [servings, setServings] = useState(String(recipe?.total_servings ?? 1));
  const [notes, setNotes] = useState(recipe?.notes ?? '');
  const [ingredients, setIngredients] = useState(
    recipe?.ingredients?.map(ing => ({ ...ing, _id: ing.id, _cal_g: null, _protein_g: null, _carbs_g: null, _fat_g: null })) ?? []
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function handleSave(e) {
    e.preventDefault();
    if (!name.trim()) return setError('Recipe name is required');
    setSaving(true);
    setError('');
    try {
      const payload = {
        name: name.trim(),
        total_servings: +servings || 1,
        notes,
        ingredients: ingredients.map(ing => ({
          food_name:    ing.food_name,
          weight_grams: +ing.weight_grams || 0,
          weight_unit:  ing.weight_unit || 'g',
          calories:     +ing.calories     || 0,
          protein:      +ing.protein      || 0,
          carbs:        +ing.carbs        || 0,
          fat:          +ing.fat          || 0,
        })),
      };
      const saved = isEdit
        ? await updateRecipe(recipe.id, payload)
        : await createRecipe(payload);
      onSave(saved);
    } catch (err) {
      setError(err.message || 'Save failed');
      setSaving(false);
    }
  }

  const totals = calcTotals(ingredients);
  const srv = +servings || 1;
  const perSrv = {
    cal: srv > 0 ? totals.cal / srv : 0,
    p:   srv > 0 ? totals.p   / srv : 0,
    c:   srv > 0 ? totals.c   / srv : 0,
    f:   srv > 0 ? totals.f   / srv : 0,
  };

  return (
    <BottomSheet onClose={onClose} title={isEdit ? 'Edit Recipe' : 'New Recipe'}>
      <form onSubmit={handleSave}>
        <div className="settings-field" style={{ marginBottom: 12 }}>
          <label>Recipe Name</label>
          <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Chicken Curry" required />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
          <div className="settings-field">
            <label>Total Servings</label>
            <input type="number" min="0.1" step="0.1" inputMode="decimal" value={servings} onChange={e => setServings(e.target.value)} />
          </div>
          <div className="settings-field" style={{ opacity: 0.7 }}>
            <label>Per Serving</label>
            <div style={{ padding: '10px 0', fontSize: 13, color: 'var(--accent-light)', fontWeight: 600 }}>
              {round1(perSrv.cal)} kcal
            </div>
          </div>
        </div>

        <div className="settings-field" style={{ marginBottom: 16 }}>
          <label>Notes (optional)</label>
          <input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Cooking instructions, tips…" />
        </div>

        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 12 }}>
          Ingredients
        </div>

        <IngredientEditor ingredients={ingredients} onChange={setIngredients} mode="edit" />

        {ingredients.length > 0 && (
          <div style={{ marginTop: 16 }}>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6 }}>Total (all servings)</div>
            <MacroSummaryBar cal={totals.cal} p={totals.p} c={totals.c} f={totals.f} />
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6 }}>Per serving</div>
            <MacroSummaryBar cal={perSrv.cal} p={perSrv.p} c={perSrv.c} f={perSrv.f} />
          </div>
        )}

        {error && <div style={{ color: 'var(--red)', fontSize: 13, marginBottom: 12 }}>{error}</div>}

        <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
          <button type="button" onClick={onClose} style={{ background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)', padding: '11px 18px', borderRadius: 8, fontSize: 14, fontFamily: 'inherit' }}>Cancel</button>
          <button className="btn-primary" type="submit" disabled={saving} style={{ flex: 1 }}>
            {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Create Recipe'}
          </button>
        </div>
      </form>
    </BottomSheet>
  );
}

// ── Log Recipe Sheet ──────────────────────────────────────────────────────────

export function LogRecipeSheet({ recipe, onClose, onLogged }) {
  const [servings, setServings] = useState('1');
  const [mealType, setMealType] = useState('breakfast');
  const [logging, setLogging] = useState(false);
  const [error, setError] = useState('');

  const srv = parseFloat(servings) || 0;
  const total = {
    cal: +(recipe.cal_per_serving * srv).toFixed(1),
    p:   +(recipe.protein_per_serving * srv).toFixed(1),
    c:   +(recipe.carbs_per_serving * srv).toFixed(1),
    f:   +(recipe.fat_per_serving * srv).toFixed(1),
  };

  async function handleLog() {
    if (!srv || srv <= 0) return setError('Enter a valid serving amount');
    setLogging(true);
    setError('');
    try {
      const { entry } = await logRecipe(recipe.id, { date: todayStr(), servings: srv, meal_type: mealType });
      onLogged(entry);
    } catch (err) {
      setError(err.message || 'Log failed');
      setLogging(false);
    }
  }

  return (
    <BottomSheet
      onClose={onClose}
      title={<><h3>Log — {recipe.name}</h3><p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '2px 0 0' }}>{round1(recipe.total_servings)} servings total</p></>}
    >
      <MealTypeSelector value={mealType} onChange={setMealType} />

      {/* Per-serving summary */}
      <div style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 10, padding: '12px 16px', marginBottom: 20 }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 8 }}>Per serving</div>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          {[
            { label: 'kcal', val: round1(recipe.cal_per_serving), color: 'var(--accent)' },
            { label: 'protein', val: `${round1(recipe.protein_per_serving)}g`, color: 'var(--blue)' },
            { label: 'carbs', val: `${round1(recipe.carbs_per_serving)}g`, color: 'var(--yellow)' },
            { label: 'fat', val: `${round1(recipe.fat_per_serving)}g`, color: 'var(--orange)' },
          ].map(m => (
            <div key={m.label} style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 18, fontWeight: 700, color: m.color }}>{m.val}</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{m.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Serving input */}
      <div className="settings-field" style={{ marginBottom: 20 }}>
        <label>How many servings?</label>
        <input
          type="number" min="0.1" step="0.1" inputMode="decimal"
          value={servings}
          onChange={e => setServings(e.target.value)}
          style={{ fontSize: 20, fontWeight: 600, textAlign: 'center' }}
        />
      </div>

      {/* Live total */}
      {srv > 0 && (
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 8, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            Total for {srv} serving{srv !== 1 ? 's' : ''}
          </div>
          <MacroSummaryBar cal={total.cal} p={total.p} c={total.c} f={total.f} />
        </div>
      )}

      {error && <div style={{ color: 'var(--red)', fontSize: 13, marginBottom: 12 }}>{error}</div>}

      <p style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'center', marginBottom: 8 }}>
        This will log as a single entry in your food log
      </p>

      <button
        onClick={handleLog}
        disabled={logging || !srv}
        style={{
          width: '100%', background: 'var(--accent)', color: '#fff', border: 'none',
          padding: '13px', borderRadius: 8, fontFamily: 'inherit', fontSize: 15,
          fontWeight: 600, cursor: 'pointer', opacity: logging || !srv ? 0.5 : 1,
        }}
      >
        {logging ? 'Logging…' : 'Log to Today'}
      </button>
    </BottomSheet>
  );
}

// ── Item cards for list ───────────────────────────────────────────────────────

export function TemplateCard({ tmpl, onLog, onEdit, onDelete }) {
  const color = MEAL_TYPE_COLORS[tmpl.meal_type] || 'var(--accent)';
  return (
    <div
      className="hover-border"
      style={{
        background: 'var(--surface)', border: '1px solid var(--border)',
        borderRadius: 12, padding: '16px 20px', cursor: 'pointer',
      }}
      onClick={onLog}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{
            background: color + '22', color: color,
            fontSize: 11, fontWeight: 700, letterSpacing: '0.4px',
            padding: '3px 8px', borderRadius: 6, textTransform: 'uppercase',
          }}>{tmpl.meal_type}</span>
          <div style={{ fontWeight: 600, fontSize: 15 }}>{tmpl.name}</div>
        </div>
        <div style={{ display: 'flex', gap: 6 }} onClick={e => e.stopPropagation()}>
          <button className="btn-check" title="Add to log" onClick={onLog}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20,6 9,17 4,12"/>
            </svg>
          </button>
          <button className="btn-icon" title="Edit" onClick={onEdit}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
            </svg>
          </button>
          <button className="btn-delete" title="Delete" onClick={onDelete}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
      </div>
      <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Tap to log · edit weights before confirming</div>
    </div>
  );
}

export function RecipeCard({ recipe, onLog, onEdit, onDelete }) {
  return (
    <div
      className="hover-border"
      style={{
        background: 'var(--surface)', border: '1px solid var(--border)',
        borderRadius: 12, padding: '16px 20px', cursor: 'pointer',
      }}
      onClick={onLog}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <div style={{ fontWeight: 600, fontSize: 15 }}>{recipe.name}</div>
        <div style={{ display: 'flex', gap: 6 }} onClick={e => e.stopPropagation()}>
          <button className="btn-check" title="Add to log" onClick={onLog}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20,6 9,17 4,12"/>
            </svg>
          </button>
          <button className="btn-icon" title="Edit" onClick={onEdit}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
            </svg>
          </button>
          <button className="btn-delete" title="Delete" onClick={onDelete}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', fontSize: 13 }}>
        <span style={{ color: 'var(--accent)', fontWeight: 600 }}>{round1(recipe.cal_per_serving)} kcal / srv</span>
        <span style={{ color: 'var(--blue)' }}>{round1(recipe.protein_per_serving)}g P</span>
        <span style={{ color: 'var(--yellow)' }}>{round1(recipe.carbs_per_serving)}g C</span>
        <span style={{ color: 'var(--orange)' }}>{round1(recipe.fat_per_serving)}g F</span>
        <span style={{ color: 'var(--text-muted)' }}>· {round1(recipe.total_servings)} srv total</span>
      </div>
    </div>
  );
}

// ── Main Meals page ───────────────────────────────────────────────────────────

export default function Meals({ embedded = false, activeTab: controlledTab = null }) {
  const [tab, setTab] = useState('templates');
  const effectiveTab = embedded ? controlledTab : tab;
  const [templates, setTemplates] = useState([]);
  const [recipes, setRecipes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null);
  const [toast, showToast] = useToast();

  useEffect(() => {
    const cachedT = getCached('meals-templates', MEALS_CACHE_TTL);
    const cachedR = getCached('meals-recipes', MEALS_CACHE_TTL);
    if (cachedT && cachedR) {
      setTemplates(cachedT);
      setRecipes(cachedR);
      setLoading(false);
      return;
    }
    Promise.all([
      cachedT ? Promise.resolve(cachedT) : getMealTemplates(),
      cachedR ? Promise.resolve(cachedR) : getRecipes(),
    ]).then(([t, r]) => {
      setTemplates(t);
      setRecipes(r);
      setLoading(false);
      if (!cachedT) setCached('meals-templates', t);
      if (!cachedR) setCached('meals-recipes', r);
    });
  }, []);

  // ── Template handlers ──────────────────────────────────────────────────────
  async function openLogMeal(tmpl) {
    // Fetch full template (with ingredients) then open sheet
    const full = await getMealTemplate(tmpl.id);
    setModal({ type: 'logMeal', template: full });
  }

  function handleTemplateSaved(saved) {
    setTemplates(prev => {
      const exists = prev.some(t => t.id === saved.id);
      return exists
        ? prev.map(t => t.id === saved.id ? saved : t)
        : [saved, ...prev];
    });
    invalidateMealsCache();
    setModal(null);
  }

  async function handleDeleteTemplate(id) {
    await deleteMealTemplate(id);
    setTemplates(prev => prev.filter(t => t.id !== id));
    invalidateMealsCache();
    setModal(null);
  }

  // ── Recipe handlers ────────────────────────────────────────────────────────
  async function openLogRecipe(r) {
    const full = await getRecipe(r.id);
    setModal({ type: 'logRecipe', recipe: full });
  }

  function handleRecipeSaved(saved) {
    setRecipes(prev => {
      const exists = prev.some(r => r.id === saved.id);
      const updated = exists
        ? prev.map(r => r.id === saved.id ? saved : r)
        : [saved, ...prev];
      // Re-compute per-serving on the client so the list refreshes without a reload
      return updated.map(r => {
        const totalCal = (r.ingredients || []).reduce((s, i) => s + (+i.calories || 0), 0);
        const totalP   = (r.ingredients || []).reduce((s, i) => s + (+i.protein  || 0), 0);
        const totalC   = (r.ingredients || []).reduce((s, i) => s + (+i.carbs    || 0), 0);
        const totalF   = (r.ingredients || []).reduce((s, i) => s + (+i.fat      || 0), 0);
        const srv = r.total_servings || 1;
        return {
          ...r,
          total_calories: totalCal,
          total_protein:  totalP,
          total_carbs:    totalC,
          total_fat:      totalF,
          cal_per_serving:     +(totalCal / srv).toFixed(1),
          protein_per_serving: +(totalP   / srv).toFixed(1),
          carbs_per_serving:   +(totalC   / srv).toFixed(1),
          fat_per_serving:     +(totalF   / srv).toFixed(1),
        };
      });
    });
    invalidateMealsCache();
    setModal(null);
  }

  async function handleDeleteRecipe(id) {
    await deleteRecipe(id);
    setRecipes(prev => prev.filter(r => r.id !== id));
    invalidateMealsCache();
    setModal(null);
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: embedded ? 'flex-end' : 'space-between', marginBottom: 20 }}>
        {!embedded && <div className="page-title" style={{ margin: 0 }}>Meals & Recipes</div>}
        <button
          className="btn-primary"
          onClick={() => setModal(effectiveTab === 'templates' ? { type: 'createTemplate' } : { type: 'createRecipe' })}
        >
          + {effectiveTab === 'templates' ? 'Template' : 'Recipe'}
        </button>
      </div>

      {/* Tab bar — standalone mode only; Library provides its own tabs */}
      {!embedded && (
        <TabBar
          tabs={[
            { key: 'templates', label: 'Meal Templates' },
            { key: 'recipes',   label: 'Recipes' },
          ]}
          active={effectiveTab}
          onChange={setTab}
        />
      )}

      {loading ? (
        <SkeletonLoader count={4} height={70} />
      ) : effectiveTab === 'templates' ? (
        templates.length === 0 ? (
          <div className="empty-state">
            No templates yet.<br />
            Create one to save a group of ingredients you eat regularly.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {templates.map(t => (
              <TemplateCard
                key={t.id}
                tmpl={t}
                onLog={() => openLogMeal(t)}
                onEdit={() => getMealTemplate(t.id).then(full => setModal({ type: 'editTemplate', template: full }))}
                onDelete={() => setModal({ type: 'deleteTemplate', id: t.id, name: t.name })}
              />
            ))}
          </div>
        )
      ) : (
        recipes.length === 0 ? (
          <div className="empty-state">
            No recipes yet.<br />
            Create one to track meals with a yield and log by serving count.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {recipes.map(r => (
              <RecipeCard
                key={r.id}
                recipe={r}
                onLog={() => openLogRecipe(r)}
                onEdit={() => getRecipe(r.id).then(full => setModal({ type: 'editRecipe', recipe: full }))}
                onDelete={() => setModal({ type: 'deleteRecipe', id: r.id, name: r.name })}
              />
            ))}
          </div>
        )
      )}

      <Toast toast={toast} />

      {/* ── Modals ── */}
      {(modal?.type === 'createTemplate' || modal?.type === 'editTemplate') && (
        <TemplateEditorSheet
          template={modal.type === 'editTemplate' ? modal.template : null}
          onSave={handleTemplateSaved}
          onClose={() => setModal(null)}
        />
      )}
      {modal?.type === 'logMeal' && (
        <LogMealSheet
          template={modal.template}
          onClose={() => setModal(null)}
          onLogged={() => { setModal(null); showToast('Logged to today!'); }}
        />
      )}
      {(modal?.type === 'createRecipe' || modal?.type === 'editRecipe') && (
        <RecipeEditorSheet
          recipe={modal.type === 'editRecipe' ? modal.recipe : null}
          onSave={handleRecipeSaved}
          onClose={() => setModal(null)}
        />
      )}
      {modal?.type === 'logRecipe' && (
        <LogRecipeSheet
          recipe={modal.recipe}
          onClose={() => setModal(null)}
          onLogged={() => { setModal(null); showToast('Logged to today!'); }}
        />
      )}
      {modal?.type === 'deleteTemplate' && (
        <DeleteConfirm
          title="Delete template?"
          text={`"${modal.name}" will be removed. Logged food entries won't be affected.`}
          onConfirm={() => handleDeleteTemplate(modal.id)}
          onCancel={() => setModal(null)}
        />
      )}
      {modal?.type === 'deleteRecipe' && (
        <DeleteConfirm
          title="Delete recipe?"
          text={`"${modal.name}" will be removed. Logged food entries won't be affected.`}
          onConfirm={() => handleDeleteRecipe(modal.id)}
          onCancel={() => setModal(null)}
        />
      )}
    </div>
  );
}
