'use strict';
const express = require('express');
const router = express.Router();
const pool = require('../db');

function perServing(total, servings) {
  if (!servings || servings <= 0) return 0;
  return +(total / servings).toFixed(1);
}

router.get('/', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT r.*,
        COALESCE(SUM(ri.calories), 0) AS total_calories,
        COALESCE(SUM(ri.protein),  0) AS total_protein,
        COALESCE(SUM(ri.carbs),    0) AS total_carbs,
        COALESCE(SUM(ri.fat),      0) AS total_fat
      FROM recipes r
      LEFT JOIN recipe_ingredients ri ON ri.recipe_id = r.id
      WHERE r.user_id = $1
      GROUP BY r.id
      ORDER BY r.created_at DESC
    `, [req.userId]);
    res.json(rows.map(r => ({
      ...r,
      cal_per_serving:     perServing(r.total_calories, r.total_servings),
      protein_per_serving: perServing(r.total_protein,  r.total_servings),
      carbs_per_serving:   perServing(r.total_carbs,    r.total_servings),
      fat_per_serving:     perServing(r.total_fat,      r.total_servings),
    })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const [rRes, iRes] = await Promise.all([
      pool.query('SELECT * FROM recipes WHERE id=$1 AND user_id=$2', [req.params.id, req.userId]),
      pool.query(
        'SELECT * FROM recipe_ingredients WHERE recipe_id=$1 ORDER BY sort_order, id',
        [req.params.id]
      ),
    ]);
    if (!rRes.rows[0]) return res.status(404).json({ error: 'Not found' });
    const r = rRes.rows[0];
    const ingredients = iRes.rows;
    const totals = ingredients.reduce(
      (acc, i) => ({ cal: acc.cal + i.calories, p: acc.p + i.protein, c: acc.c + i.carbs, f: acc.f + i.fat }),
      { cal: 0, p: 0, c: 0, f: 0 }
    );
    res.json({
      ...r,
      ingredients,
      total_calories: totals.cal,
      total_protein:  totals.p,
      total_carbs:    totals.c,
      total_fat:      totals.f,
      cal_per_serving:     perServing(totals.cal, r.total_servings),
      protein_per_serving: perServing(totals.p,   r.total_servings),
      carbs_per_serving:   perServing(totals.c,   r.total_servings),
      fat_per_serving:     perServing(totals.f,   r.total_servings),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', async (req, res) => {
  const { name, total_servings = 1, notes = '', ingredients = [] } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'name required' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: [recipe] } = await client.query(
      'INSERT INTO recipes (user_id, name, total_servings, notes) VALUES ($1,$2,$3,$4) RETURNING *',
      [req.userId, name.trim(), +total_servings || 1, notes]
    );
    for (let i = 0; i < ingredients.length; i++) {
      const g = ingredients[i];
      await client.query(
        `INSERT INTO recipe_ingredients
         (recipe_id, food_name, weight_grams, weight_unit, calories, protein, carbs, fat, sort_order)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [recipe.id, g.food_name, +g.weight_grams || 0, g.weight_unit || 'g',
         +g.calories || 0, +g.protein || 0, +g.carbs || 0, +g.fat || 0, i]
      );
    }
    await client.query('COMMIT');
    const { rows: savedIngs } = await pool.query(
      'SELECT * FROM recipe_ingredients WHERE recipe_id=$1 ORDER BY sort_order, id',
      [recipe.id]
    );
    res.status(201).json({ ...recipe, ingredients: savedIngs });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

router.put('/:id', async (req, res) => {
  const { name, total_servings, notes = '', ingredients = [] } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'name required' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: [recipe] } = await client.query(
      'UPDATE recipes SET name=$1, total_servings=$2, notes=$3 WHERE id=$4 AND user_id=$5 RETURNING *',
      [name.trim(), +total_servings || 1, notes, req.params.id, req.userId]
    );
    if (!recipe) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Not found' }); }

    await client.query('DELETE FROM recipe_ingredients WHERE recipe_id=$1', [req.params.id]);
    for (let i = 0; i < ingredients.length; i++) {
      const g = ingredients[i];
      await client.query(
        `INSERT INTO recipe_ingredients
         (recipe_id, food_name, weight_grams, weight_unit, calories, protein, carbs, fat, sort_order)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [req.params.id, g.food_name, +g.weight_grams || 0, g.weight_unit || 'g',
         +g.calories || 0, +g.protein || 0, +g.carbs || 0, +g.fat || 0, i]
      );
    }
    await client.query('COMMIT');
    const { rows: savedIngs } = await pool.query(
      'SELECT * FROM recipe_ingredients WHERE recipe_id=$1 ORDER BY sort_order, id',
      [req.params.id]
    );
    res.json({ ...recipe, ingredients: savedIngs });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'DELETE FROM recipes WHERE id=$1 AND user_id=$2 RETURNING id',
      [req.params.id, req.userId]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Not found' });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const VALID_MEAL_TYPES = ['breakfast', 'lunch', 'dinner', 'snacks'];

router.post('/:id/log', async (req, res) => {
  const { date, servings, meal_type } = req.body;
  if (!date || !servings) return res.status(400).json({ error: 'date and servings required' });
  const mealType = VALID_MEAL_TYPES.includes(meal_type) ? meal_type : 'snacks';

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const [rRes, iRes] = await Promise.all([
      client.query('SELECT * FROM recipes WHERE id=$1 AND user_id=$2', [req.params.id, req.userId]),
      client.query('SELECT * FROM recipe_ingredients WHERE recipe_id=$1 ORDER BY sort_order, id', [req.params.id]),
    ]);
    if (!rRes.rows[0]) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Not found' }); }

    const recipe = rRes.rows[0];
    const ings = iRes.rows;
    const totals = ings.reduce(
      (acc, i) => ({ cal: acc.cal + i.calories, p: acc.p + i.protein, c: acc.c + i.carbs, f: acc.f + i.fat }),
      { cal: 0, p: 0, c: 0, f: 0 }
    );
    const ratio = (+servings) / (recipe.total_servings || 1);
    const logged = {
      calories: +(totals.cal * ratio).toFixed(1),
      protein:  +(totals.p   * ratio).toFixed(1),
      carbs:    +(totals.c   * ratio).toFixed(1),
      fat:      +(totals.f   * ratio).toFixed(1),
    };
    const srvLabel = +servings === 1 ? '' : ` ×${+servings}`;
    const sourceName = `${recipe.name}${srvLabel}`;

    const { rows: [entry] } = await client.query(
      `INSERT INTO food_entries
         (user_id, date, food_name, calories, protein, carbs, fat, entry_type, source_name, source_id, meal_type)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'recipe', $3, $8, $9)
       RETURNING *`,
      [req.userId, date, sourceName, logged.calories, logged.protein, logged.carbs, logged.fat, req.params.id, mealType]
    );

    const savedIngredients = [];
    for (let i = 0; i < ings.length; i++) {
      const g = ings[i];
      const { rows: [ing] } = await client.query(
        `INSERT INTO food_entry_ingredients
           (entry_id, food_name, weight_grams, weight_unit, calories, protein, carbs, fat, sort_order)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
         RETURNING *`,
        [entry.id, g.food_name, (g.weight_grams || 0) * ratio, g.weight_unit || 'g', g.calories * ratio, g.protein * ratio, g.carbs * ratio, g.fat * ratio, i]
      );
      savedIngredients.push(ing);
    }

    await client.query('COMMIT');
    res.json({ entry: { ...entry, ingredients: savedIngredients } });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

module.exports = router;
