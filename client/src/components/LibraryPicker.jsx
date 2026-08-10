import { useState, useEffect } from 'react';
import {
  getMealTemplates, getMealTemplate, deleteMealTemplate,
  getRecipes, getRecipe, deleteRecipe,
} from '../api';
import {
  TemplateCard, RecipeCard, TemplateEditorSheet, RecipeEditorSheet,
  LogMealSheet, LogRecipeSheet, DeleteConfirm, MEALS_CACHE_TTL,
} from '../pages/Meals';
import SkeletonLoader from './SkeletonLoader';
import { getCached, setCached, invalidateCache } from '../utils/cache';

function invalidateMealsCache() {
  invalidateCache('meals-templates');
  invalidateCache('meals-recipes');
}

// Opened from the Add Food card — browse saved meal templates and recipes,
// then log one straight into today's food log without leaving the page.
export default function LibraryPicker({ onClose, onLogged }) {
  const [tab, setTab] = useState('templates');
  const [templates, setTemplates] = useState([]);
  const [recipes, setRecipes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null);

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

  function handleLogged(entry) {
    setModal(null);
    onLogged(entry);
  }

  return (
    <div className="modal-overlay" onClick={() => { if (!modal) onClose(); }}>
      <div className="modal-box" onClick={e => e.stopPropagation()} style={{ maxWidth: 520 }}>
        <div className="modal-header">
          <h3>Add from Library</h3>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, gap: 10 }}>
            <div style={{ display: 'flex', borderBottom: '1px solid var(--border)' }}>
              {[{ key: 'templates', label: 'Meals' }, { key: 'recipes', label: 'Recipes' }].map(t => (
                <button
                  key={t.key}
                  onClick={() => setTab(t.key)}
                  style={{
                    padding: '8px 16px', background: 'transparent', border: 'none',
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
              onClick={() => setModal(tab === 'templates' ? { type: 'createTemplate' } : { type: 'createRecipe' })}
              style={{ flexShrink: 0 }}
            >
              + {tab === 'templates' ? 'Meal' : 'Recipe'}
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
    </div>
  );
}
