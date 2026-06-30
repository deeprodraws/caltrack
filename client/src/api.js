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
