const BASE = '/api';

export async function getEntries(date) {
  const res = await fetch(`${BASE}/entries?date=${date}`);
  return res.json();
}

export async function addEntry(entry) {
  const res = await fetch(`${BASE}/entries`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(entry),
  });
  return res.json();
}

export async function updateEntry(id, data) {
  const res = await fetch(`${BASE}/entries/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return res.json();
}

export async function deleteEntry(id) {
  const res = await fetch(`${BASE}/entries/${id}`, { method: 'DELETE' });
  return res.json();
}

export async function getGoals() {
  const res = await fetch(`${BASE}/goals`);
  return res.json();
}

export async function updateGoals(goals) {
  const res = await fetch(`${BASE}/goals`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(goals),
  });
  return res.json();
}

export async function searchSavedFoods(q = '') {
  const res = await fetch(`${BASE}/saved-foods?q=${encodeURIComponent(q)}`);
  return res.json();
}

export async function getSavedFoods() {
  const res = await fetch(`${BASE}/saved-foods`);
  return res.json();
}

export async function createSavedFood(food) {
  const res = await fetch(`${BASE}/saved-foods`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(food),
  });
  return res.json();
}

export async function updateSavedFood(id, food) {
  const res = await fetch(`${BASE}/saved-foods/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(food),
  });
  return res.json();
}

export async function deleteSavedFood(id) {
  const res = await fetch(`${BASE}/saved-foods/${id}`, { method: 'DELETE' });
  return res.json();
}

export async function getEntriesRange(start, end) {
  const res = await fetch(`${BASE}/entries?start=${start}&end=${end}`);
  return res.json();
}

export async function getWeightLogs() {
  const res = await fetch(`${BASE}/weight`);
  return res.json();
}

export async function addWeightLog(data) {
  const res = await fetch(`${BASE}/weight`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return res.json();
}

export async function updateWeightLog(id, data) {
  const res = await fetch(`${BASE}/weight/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return res.json();
}

export async function deleteWeightLog(id) {
  const res = await fetch(`${BASE}/weight/${id}`, { method: 'DELETE' });
  return res.json();
}

// ── Meal Templates ────────────────────────────────────────────────────────────
export async function getMealTemplates() {
  const res = await fetch(`${BASE}/meal-templates`);
  return res.json();
}

export async function getMealTemplate(id) {
  const res = await fetch(`${BASE}/meal-templates/${id}`);
  return res.json();
}

export async function createMealTemplate(data) {
  const res = await fetch(`${BASE}/meal-templates`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return res.json();
}

export async function updateMealTemplate(id, data) {
  const res = await fetch(`${BASE}/meal-templates/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return res.json();
}

export async function deleteMealTemplate(id) {
  const res = await fetch(`${BASE}/meal-templates/${id}`, { method: 'DELETE' });
  return res.json();
}

export async function logMealTemplate(id, data) {
  const res = await fetch(`${BASE}/meal-templates/${id}/log`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || 'Log failed');
  return json;
}

// ── Recipes ───────────────────────────────────────────────────────────────────
export async function getRecipes() {
  const res = await fetch(`${BASE}/recipes`);
  return res.json();
}

export async function getRecipe(id) {
  const res = await fetch(`${BASE}/recipes/${id}`);
  return res.json();
}

export async function createRecipe(data) {
  const res = await fetch(`${BASE}/recipes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return res.json();
}

export async function updateRecipe(id, data) {
  const res = await fetch(`${BASE}/recipes/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return res.json();
}

export async function deleteRecipe(id) {
  const res = await fetch(`${BASE}/recipes/${id}`, { method: 'DELETE' });
  return res.json();
}

export async function logRecipe(id, data) {
  const res = await fetch(`${BASE}/recipes/${id}/log`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || 'Log failed');
  return json;
}

// ── Ingredient Memory ─────────────────────────────────────────────────────────
export async function getIngredientMemory(name) {
  const res = await fetch(`${BASE}/ingredient-memory/${encodeURIComponent(name)}`);
  if (!res.ok) return null;
  return res.json();
}

// ── Daily Metrics ─────────────────────────────────────────────────────────────
export async function getMetrics(date) {
  const res = await fetch(`${BASE}/metrics?date=${date}`);
  return res.json();
}

export async function updateMetrics(data) {
  const res = await fetch(`${BASE}/metrics`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || 'Update failed');
  return json;
}

// ── Workout: Exercises ────────────────────────────────────────────────────────
export async function searchExercises(q = '') {
  const res = await fetch(`${BASE}/exercises${q ? `?q=${encodeURIComponent(q)}` : ''}`);
  return res.json();
}

export async function createExercise(data) {
  const res = await fetch(`${BASE}/exercises`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || 'Create failed');
  return json;
}

export async function getExerciseHistory(name) {
  const res = await fetch(`${BASE}/exercises/${encodeURIComponent(name)}/history`);
  return res.json();
}

export async function getExerciseLastSession(name) {
  const res = await fetch(`${BASE}/exercises/${encodeURIComponent(name)}/last-session`);
  if (!res.ok) return null;
  return res.json();
}

// ── Workout: Templates ────────────────────────────────────────────────────────
export async function getWorkoutTemplates() {
  const res = await fetch(`${BASE}/workout-templates`);
  return res.json();
}

export async function createWorkoutTemplate(data) {
  const res = await fetch(`${BASE}/workout-templates`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return res.json();
}

export async function updateWorkoutTemplate(id, data) {
  const res = await fetch(`${BASE}/workout-templates/${id}`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return res.json();
}

export async function deleteWorkoutTemplate(id) {
  const res = await fetch(`${BASE}/workout-templates/${id}`, { method: 'DELETE' });
  return res.json();
}

// ── Workout: Sessions ─────────────────────────────────────────────────────────
export async function getWorkoutSessions(date) {
  const res = await fetch(`${BASE}/workout-sessions?date=${date}`);
  return res.json();
}

export async function getRecentWorkoutSessions(limit = 5) {
  const res = await fetch(`${BASE}/workout-sessions/recent?limit=${limit}`);
  return res.json();
}

export async function createWorkoutSession(data) {
  const res = await fetch(`${BASE}/workout-sessions`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || 'Create failed');
  return json;
}

export async function updateWorkoutSession(id, data) {
  const res = await fetch(`${BASE}/workout-sessions/${id}`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || 'Update failed');
  return json;
}

export async function deleteWorkoutSession(id) {
  const res = await fetch(`${BASE}/workout-sessions/${id}`, { method: 'DELETE' });
  return res.json();
}

export async function addExerciseToSession(sessionId, data) {
  const res = await fetch(`${BASE}/workout-sessions/${sessionId}/exercises`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || 'Add failed');
  return json;
}

export async function removeExerciseFromSession(sessionId, exerciseId) {
  const res = await fetch(`${BASE}/workout-sessions/${sessionId}/exercises/${exerciseId}`, {
    method: 'DELETE',
  });
  return res.json();
}

// ── Workout: Sets ─────────────────────────────────────────────────────────────
export async function addSet(exerciseId, data) {
  const res = await fetch(`${BASE}/session-exercises/${exerciseId}/sets`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || 'Add failed');
  return json;
}

export async function updateSet(id, data) {
  const res = await fetch(`${BASE}/sets/${id}`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return res.json();
}

export async function deleteSet(id) {
  const res = await fetch(`${BASE}/sets/${id}`, { method: 'DELETE' });
  return res.json();
}

// ── Photo Scan ────────────────────────────────────────────────────────────────
export async function scanFood(imageBase64, mediaType) {
  const res = await fetch(`${BASE}/scan-food`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ image: imageBase64, mediaType }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Scan failed');
  return data;
}
