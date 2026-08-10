import { useState, useEffect, useRef } from 'react';
import {
  getMealTemplates, getMealTemplate, deleteMealTemplate,
  getRecipes, getRecipe, deleteRecipe,
  getSavedFoods, deleteSavedFood, addEntry,
} from '../api';
import {
  TemplateCard, RecipeCard, TemplateEditorSheet, RecipeEditorSheet,
  LogMealSheet, LogRecipeSheet, DeleteConfirm, MEALS_CACHE_TTL,
} from '../pages/Meals';
import { FoodModal } from '../pages/MyFoods';
import SkeletonLoader from './SkeletonLoader';
import { scaleMacros, buildPortionOptions } from '../utils/portions';
import { getCached, setCached, invalidateCache } from '../utils/cache';

const SAVED_FOODS_CACHE_TTL = 300000; // 5 minutes
const SHEET_COLLAPSED_VH = 60;
const SHEET_EXPANDED_VH = 88;

const MEAL_TYPES = [
  { value: 'breakfast', label: 'Breakfast', emoji: '🌅' },
  { value: 'lunch',     label: 'Lunch',     emoji: '☀️' },
  { value: 'dinner',    label: 'Dinner',    emoji: '🌙' },
  { value: 'snacks',    label: 'Snacks',    emoji: '🍎' },
];
const MEAL_TYPE_COLORS = { breakfast: '#fbbf24', lunch: '#34d399', dinner: '#6c63ff', snacks: '#fb923c' };

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function round1(v) { return Math.round((Number(v) || 0) * 10) / 10; }

function invalidateMealsCache() {
  invalidateCache('meals-templates');
  invalidateCache('meals-recipes');
}

function MiniMealTypeSelector({ value, onChange }) {
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

// ── Saved-food card (the "food template" tab) ──────────────────────────────────
function SavedFoodCard({ food, onLog, onEdit, onDelete }) {
  return (
    <div
      style={{
        background: 'var(--surface)', border: '1px solid var(--border)',
        borderRadius: 12, padding: '16px 20px', cursor: 'pointer',
        transition: 'border-color 0.15s',
      }}
      onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--accent)'}
      onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}
      onClick={onLog}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <div>
          <div style={{ fontWeight: 600, fontSize: 15 }}>{food.name}</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
            per {round1(food.serving_size)} {food.serving_unit}
          </div>
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
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', fontSize: 13 }}>
        <span style={{ color: '#6c63ff', fontWeight: 600 }}>{round1(food.calories)} kcal</span>
        <span style={{ color: '#60a5fa' }}>{round1(food.protein)}g P</span>
        <span style={{ color: '#fbbf24' }}>{round1(food.carbs)}g C</span>
        <span style={{ color: '#fb923c' }}>{round1(food.fat)}g F</span>
      </div>
    </div>
  );
}

// ── Log a saved food straight into today ────────────────────────────────────────
function LogFoodSheet({ food, onClose, onLogged }) {
  const isPortioned = !!food.macros_per_100g;
  const portionOptions = isPortioned ? buildPortionOptions(food) : [];
  const [mealType, setMealType] = useState('breakfast');
  const [portionGrams, setPortionGrams] = useState(isPortioned ? (portionOptions[0]?.weight_grams ?? 100) : null);
  const [customGrams, setCustomGrams] = useState('');
  const [servings, setServings] = useState('1');
  const [logging, setLogging] = useState(false);
  const [error, setError] = useState('');

  const srv = parseFloat(servings) || 0;
  const macros = isPortioned
    ? scaleMacros(food, portionGrams === 'custom' ? (parseFloat(customGrams) || 0) : portionGrams)
    : {
        calories: +(food.calories * srv).toFixed(1),
        protein:  +(food.protein  * srv).toFixed(1),
        carbs:    +(food.carbs    * srv).toFixed(1),
        fat:      +(food.fat      * srv).toFixed(1),
      };

  async function handleLog() {
    setLogging(true);
    setError('');
    try {
      const entry = await addEntry({
        date: todayStr(),
        food_name: food.name,
        calories: macros.calories,
        protein: macros.protein,
        carbs: macros.carbs,
        fat: macros.fat,
        meal_type: mealType,
      });
      onLogged(entry);
    } catch (err) {
      setError(err.message || 'Log failed');
      setLogging(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Log — {food.name}</h3>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          <MiniMealTypeSelector value={mealType} onChange={setMealType} />

          {isPortioned ? (
            <div className="settings-field" style={{ marginBottom: 20 }}>
              <label>Portion</label>
              <select
                value={portionGrams}
                onChange={e => setPortionGrams(e.target.value === 'custom' ? 'custom' : Number(e.target.value))}
              >
                {portionOptions.map(opt => (
                  <option key={opt.label} value={opt.weight_grams}>{opt.label}</option>
                ))}
                <option value="custom">Custom (g)</option>
              </select>
              {portionGrams === 'custom' && (
                <input
                  type="number" min="0" step="0.1" inputMode="decimal" placeholder="grams"
                  value={customGrams} onChange={e => setCustomGrams(e.target.value)}
                  style={{ marginTop: 6 }}
                />
              )}
            </div>
          ) : (
            <div className="settings-field" style={{ marginBottom: 20 }}>
              <label>Servings</label>
              <input
                type="number" min="0.1" step="0.1" inputMode="decimal"
                value={servings} onChange={e => setServings(e.target.value)}
                style={{ fontSize: 18, fontWeight: 600, textAlign: 'center' }}
              />
            </div>
          )}

          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 8, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Totals</div>
            <div style={{ background: 'rgba(108,99,255,0.08)', border: '1px solid rgba(108,99,255,0.2)', borderRadius: 10, padding: '10px 16px', display: 'flex', gap: 14, flexWrap: 'wrap', fontSize: 13 }}>
              <span style={{ color: '#6c63ff', fontWeight: 700 }}>{round1(macros.calories)} kcal</span>
              <span style={{ color: '#60a5fa' }}>{round1(macros.protein)}g P</span>
              <span style={{ color: '#fbbf24' }}>{round1(macros.carbs)}g C</span>
              <span style={{ color: '#fb923c' }}>{round1(macros.fat)}g F</span>
            </div>
          </div>

          {error && <div style={{ color: '#f87171', fontSize: 13, marginBottom: 12 }}>{error}</div>}

          <button
            onClick={handleLog}
            disabled={logging}
            style={{
              width: '100%', background: 'var(--accent)', color: '#fff', border: 'none',
              padding: '13px', borderRadius: 8, fontFamily: 'inherit', fontSize: 15,
              fontWeight: 600, cursor: 'pointer', opacity: logging ? 0.5 : 1,
            }}
          >
            {logging ? 'Logging…' : 'Log to Today'}
          </button>
        </div>
      </div>
    </div>
  );
}

const TABS = [
  { key: 'templates', label: 'Meals' },
  { key: 'recipes',   label: 'Recipes' },
  { key: 'foods',     label: 'Foods' },
];

// Opened from the Add Food card — browse saved meals, recipes and foods,
// then log one straight into today's food log without leaving the page.
export default function LibraryPicker({ onClose, onLogged }) {
  const [tab, setTab] = useState('templates');
  const [templates, setTemplates] = useState([]);
  const [recipes, setRecipes] = useState([]);
  const [foods, setFoods] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null);

  const [sheetVh, setSheetVh] = useState(SHEET_COLLAPSED_VH);
  const [dragging, setDragging] = useState(false);
  const dragRef = useRef(null);

  useEffect(() => {
    const cachedT = getCached('meals-templates', MEALS_CACHE_TTL);
    const cachedR = getCached('meals-recipes', MEALS_CACHE_TTL);
    const cachedF = getCached('saved-foods', SAVED_FOODS_CACHE_TTL);
    if (cachedT && cachedR && cachedF) {
      setTemplates(cachedT);
      setRecipes(cachedR);
      setFoods(cachedF);
      setLoading(false);
      return;
    }
    Promise.all([
      cachedT ? Promise.resolve(cachedT) : getMealTemplates(),
      cachedR ? Promise.resolve(cachedR) : getRecipes(),
      cachedF ? Promise.resolve(cachedF) : getSavedFoods(),
    ]).then(([t, r, f]) => {
      setTemplates(t);
      setRecipes(r);
      setFoods(f);
      setLoading(false);
      if (!cachedT) setCached('meals-templates', t);
      if (!cachedR) setCached('meals-recipes', r);
      if (!cachedF) setCached('saved-foods', f);
    });
  }, []);

  // ── Drag handle: live-follow while dragging, snap to a preset on release ──────
  function handleHandleTouchStart(e) {
    const t = e.touches[0];
    dragRef.current = { startY: t.clientY, moved: false };
  }
  function handleHandleTouchMove(e) {
    const d = dragRef.current;
    if (!d) return;
    const t = e.touches[0];
    const dy = t.clientY - d.startY;
    if (Math.abs(dy) > 6) d.moved = true;
    const dyVh = (dy / window.innerHeight) * 100;
    setDragging(true);
    setSheetVh(prev => Math.max(SHEET_COLLAPSED_VH - 15, Math.min(SHEET_EXPANDED_VH + 4, prev - dyVh)));
    d.startY = t.clientY; // incremental, so repeated moves keep tracking the finger 1:1
  }
  function handleHandleTouchEnd() {
    const d = dragRef.current;
    dragRef.current = null;
    setDragging(false);
    if (!d) return;
    const mid = (SHEET_COLLAPSED_VH + SHEET_EXPANDED_VH) / 2;
    if (!d.moved) {
      setSheetVh(prev => (prev >= mid ? SHEET_COLLAPSED_VH : SHEET_EXPANDED_VH));
    } else {
      setSheetVh(prev => (prev >= mid ? SHEET_EXPANDED_VH : SHEET_COLLAPSED_VH));
    }
  }

  async function openLogMeal(tmpl) {
    const full = await getMealTemplate(tmpl.id);
    setModal({ type: 'logMeal', template: full });
  }
  async function openLogRecipe(r) {
    const full = await getRecipe(r.id);
    setModal({ type: 'logRecipe', recipe: full });
  }

  function handleTemplateSaved(saved) {
    setTemplates(prev => {
      const exists = prev.some(t => t.id === saved.id);
      return exists ? prev.map(t => t.id === saved.id ? saved : t) : [saved, ...prev];
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

  function handleRecipeSaved(saved) {
    setRecipes(prev => {
      const exists = prev.some(r => r.id === saved.id);
      return exists ? prev.map(r => r.id === saved.id ? saved : r) : [saved, ...prev];
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

  function handleFoodSaved(food, mode) {
    if (mode === 'create') setFoods(prev => [...prev, food].sort((a, b) => a.name.localeCompare(b.name)));
    else setFoods(prev => prev.map(f => f.id === food.id ? food : f));
    invalidateCache('saved-foods');
    setModal(null);
  }
  async function handleDeleteFood(id) {
    await deleteSavedFood(id);
    setFoods(prev => prev.filter(f => f.id !== id));
    invalidateCache('saved-foods');
    setModal(null);
  }

  function handleLogged(entry) {
    setModal(null);
    onLogged(entry);
  }

  return (
    <div className="modal-overlay" onClick={() => { if (!modal) onClose(); }}>
      <div style={{ position: 'relative', width: '100%', maxWidth: 520 }}>
        <button
          onClick={onClose}
          aria-label="Close"
          style={{
            position: 'absolute', top: -22, right: 16, zIndex: 5,
            width: 44, height: 44, borderRadius: '50%',
            background: 'var(--surface2)', border: '1px solid var(--border)',
            color: 'var(--text)', display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 4px 16px rgba(0,0,0,0.4)', cursor: 'pointer',
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>

        <div
          className="modal-box"
          onClick={e => e.stopPropagation()}
          style={{
            height: `${sheetVh}vh`,
            transition: dragging ? 'none' : 'height 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
          }}
        >
          <div style={{ position: 'sticky', top: 0, background: 'var(--surface)', zIndex: 2, borderBottom: '1px solid var(--border)' }}>
            <div
              onTouchStart={handleHandleTouchStart}
              onTouchMove={handleHandleTouchMove}
              onTouchEnd={handleHandleTouchEnd}
              style={{ display: 'flex', justifyContent: 'center', padding: '10px 0 8px', touchAction: 'none', cursor: 'grab' }}
            >
              <div style={{ width: 40, height: 5, borderRadius: 99, background: 'var(--border)' }} />
            </div>
            <h3 style={{ fontSize: 16, fontWeight: 600, margin: '0 0 14px', padding: '0 20px' }}>Add from Library</h3>
          </div>

          <div className="modal-body">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, gap: 10, flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', borderBottom: '1px solid var(--border)' }}>
                {TABS.map(t => (
                  <button
                    key={t.key}
                    onClick={() => setTab(t.key)}
                    style={{
                      padding: '8px 14px', background: 'transparent', border: 'none',
                      borderBottom: `2px solid ${tab === t.key ? 'var(--accent)' : 'transparent'}`,
                      color: tab === t.key ? 'var(--accent-light)' : 'var(--text-muted)',
                      fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                      marginBottom: -1, transition: 'all 0.15s',
                    }}
                  >{t.label}</button>
                ))}
              </div>
              <button
                className="btn-primary"
                type="button"
                onClick={() => setModal(
                  tab === 'templates' ? { type: 'createTemplate' } :
                  tab === 'recipes'   ? { type: 'createRecipe' } :
                                        { type: 'createFood' }
                )}
                style={{ flexShrink: 0 }}
              >
                + {tab === 'templates' ? 'Meal' : tab === 'recipes' ? 'Recipe' : 'Food'}
              </button>
            </div>

            {loading ? (
              <SkeletonLoader count={3} height={70} />
            ) : tab === 'templates' ? (
              templates.length === 0 ? (
                <div className="empty-state">
                  No saved meals yet.<br />
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
            ) : tab === 'recipes' ? (
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
            ) : (
              foods.length === 0 ? (
                <div className="empty-state">
                  No saved foods yet.<br />
                  Add one to reuse it any time you log.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {foods.map(f => (
                    <SavedFoodCard
                      key={f.id}
                      food={f}
                      onLog={() => setModal({ type: 'logFood', food: f })}
                      onEdit={() => setModal({ type: 'editFood', food: f })}
                      onDelete={() => setModal({ type: 'deleteFood', id: f.id, name: f.name })}
                    />
                  ))}
                </div>
              )
            )}
          </div>
        </div>
      </div>

      {(modal?.type === 'createTemplate' || modal?.type === 'editTemplate') && (
        <TemplateEditorSheet
          template={modal.type === 'editTemplate' ? modal.template : null}
          onSave={handleTemplateSaved}
          onClose={() => setModal(null)}
        />
      )}
      {modal?.type === 'logMeal' && (
        <LogMealSheet template={modal.template} onClose={() => setModal(null)} onLogged={handleLogged} />
      )}
      {(modal?.type === 'createRecipe' || modal?.type === 'editRecipe') && (
        <RecipeEditorSheet
          recipe={modal.type === 'editRecipe' ? modal.recipe : null}
          onSave={handleRecipeSaved}
          onClose={() => setModal(null)}
        />
      )}
      {modal?.type === 'logRecipe' && (
        <LogRecipeSheet recipe={modal.recipe} onClose={() => setModal(null)} onLogged={handleLogged} />
      )}
      {(modal?.type === 'createFood' || modal?.type === 'editFood') && (
        <FoodModal
          food={modal.type === 'editFood' ? modal.food : null}
          onSave={handleFoodSaved}
          onClose={() => setModal(null)}
        />
      )}
      {modal?.type === 'logFood' && (
        <LogFoodSheet food={modal.food} onClose={() => setModal(null)} onLogged={handleLogged} />
      )}
      {modal?.type === 'deleteTemplate' && (
        <DeleteConfirm
          title="Delete meal?"
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
      {modal?.type === 'deleteFood' && (
        <DeleteConfirm
          title="Delete food?"
          text={`"${modal.name}" will be removed. Logged food entries won't be affected.`}
          onConfirm={() => handleDeleteFood(modal.id)}
          onCancel={() => setModal(null)}
        />
      )}
    </div>
  );
}
