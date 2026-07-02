const express = require('express');
const router = express.Router();
const pool = require('../db');

// GET /api/meal-templates
router.get('/', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM meal_templates ORDER BY created_at DESC'
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/meal-templates/:id  (with ingredients)
router.get('/:id', async (req, res) => {
  try {
    const [tmpl, ings] = await Promise.all([
      pool.query('SELECT * FROM meal_templates WHERE id = $1', [req.params.id]),
      pool.query(
        'SELECT * FROM meal_template_ingredients WHERE template_id = $1 ORDER BY sort_order, id',
        [req.params.id]
      ),
    ]);
    if (!tmpl.rows[0]) return res.status(404).json({ error: 'Not found' });
    res.json({ ...tmpl.rows[0], ingredients: ings.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/meal-templates
router.post('/', async (req, res) => {
  const { name, meal_type = 'breakfast', ingredients = [] } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'name required' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: [tmpl] } = await client.query(
      'INSERT INTO meal_templates (name, meal_type) VALUES ($1, $2) RETURNING *',
      [name.trim(), meal_type]
    );
    for (let i = 0; i < ingredients.length; i++) {
      const g = ingredients[i];
      await client.query(
        `INSERT INTO meal_template_ingredients
         (template_id, food_name, weight_grams, weight_unit, calories, protein, carbs, fat, sort_order)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [tmpl.id, g.food_name, +g.weight_grams || 0, g.weight_unit || 'g',
         +g.calories || 0, +g.protein || 0, +g.carbs || 0, +g.fat || 0, i]
      );
    }
    await client.query('COMMIT');
    const { rows: savedIngs } = await pool.query(
      'SELECT * FROM meal_template_ingredients WHERE template_id = $1 ORDER BY sort_order, id',
      [tmpl.id]
    );
    res.status(201).json({ ...tmpl, ingredients: savedIngs });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// PUT /api/meal-templates/:id
router.put('/:id', async (req, res) => {
  const { name, meal_type, ingredients = [] } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'name required' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: [tmpl] } = await client.query(
      'UPDATE meal_templates SET name=$1, meal_type=$2 WHERE id=$3 RETURNING *',
      [name.trim(), meal_type, req.params.id]
    );
    if (!tmpl) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Not found' }); }

    await client.query('DELETE FROM meal_template_ingredients WHERE template_id=$1', [req.params.id]);
    for (let i = 0; i < ingredients.length; i++) {
      const g = ingredients[i];
      await client.query(
        `INSERT INTO meal_template_ingredients
         (template_id, food_name, weight_grams, weight_unit, calories, protein, carbs, fat, sort_order)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [req.params.id, g.food_name, +g.weight_grams || 0, g.weight_unit || 'g',
         +g.calories || 0, +g.protein || 0, +g.carbs || 0, +g.fat || 0, i]
      );
    }
    await client.query('COMMIT');
    const { rows: savedIngs } = await pool.query(
      'SELECT * FROM meal_template_ingredients WHERE template_id=$1 ORDER BY sort_order, id',
      [req.params.id]
    );
    res.json({ ...tmpl, ingredients: savedIngs });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// DELETE /api/meal-templates/:id
router.delete('/:id', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'DELETE FROM meal_templates WHERE id=$1 RETURNING id', [req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Not found' });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/meal-templates/:id/log  — log edited ingredients to food_entries
router.post('/:id/log', async (req, res) => {
  const { date, ingredients } = req.body;
  if (!date || !ingredients?.length) {
    return res.status(400).json({ error: 'date and ingredients required' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const entries = [];
    for (const g of ingredients) {
      const { rows: [entry] } = await client.query(
        `INSERT INTO food_entries (date, food_name, calories, protein, carbs, fat)
         VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
        [date, g.food_name, +g.calories || 0, +g.protein || 0, +g.carbs || 0, +g.fat || 0]
      );
      entries.push(entry);
    }
    await client.query('COMMIT');

    // Upsert ingredient memory passively — don't block response
    Promise.all(
      ingredients
        .filter(g => g.food_name?.trim() && (+g.weight_grams || 0) > 0)
        .map(g =>
          pool.query(
            `INSERT INTO ingredient_memory (food_name, typical_weight_grams, use_count, last_used_at)
             VALUES ($1,$2,1,NOW())
             ON CONFLICT (food_name) DO UPDATE SET
               typical_weight_grams = $2,
               use_count = ingredient_memory.use_count + 1,
               last_used_at = NOW()`,
            [g.food_name.trim(), +g.weight_grams]
          )
        )
    ).catch(err => console.error('ingredient_memory upsert:', err.message));

    res.json({ entries });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

module.exports = router;
