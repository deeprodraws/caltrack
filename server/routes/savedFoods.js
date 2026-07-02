'use strict';
const express = require('express');
const router = express.Router();
const pool = require('../db');

const PORTIONS_JOIN = `
  SELECT sf.*,
    COALESCE(
      json_agg(
        json_build_object(
          'id', fp.id,
          'label', fp.label,
          'weight_grams', fp.weight_grams,
          'sort_order', fp.sort_order
        ) ORDER BY fp.sort_order
      ) FILTER (WHERE fp.id IS NOT NULL),
      '[]'
    ) as portions
  FROM saved_foods sf
  LEFT JOIN food_portions fp ON fp.saved_food_id = sf.id
`;

async function insertPortions(client, savedFoodId, portions) {
  for (let i = 0; i < portions.length; i++) {
    const p = portions[i];
    if (!p.label?.trim() || !(+p.weight_grams > 0)) continue;
    await client.query(
      `INSERT INTO food_portions (saved_food_id, label, weight_grams, sort_order)
       VALUES ($1, $2, $3, $4)`,
      [savedFoodId, p.label.trim(), +p.weight_grams, p.sort_order ?? i]
    );
  }
}

router.get('/', async (req, res) => {
  try {
    const { q } = req.query;
    let result;
    if (q && q.trim()) {
      result = await pool.query(
        `${PORTIONS_JOIN} WHERE sf.user_id = $1 AND sf.name ILIKE $2
         GROUP BY sf.id ORDER BY sf.name ASC LIMIT 20`,
        [req.userId, `%${q.trim()}%`]
      );
    } else {
      result = await pool.query(
        `${PORTIONS_JOIN} WHERE sf.user_id = $1 GROUP BY sf.id ORDER BY sf.name ASC`,
        [req.userId]
      );
    }
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', async (req, res) => {
  const {
    name, calories, protein, carbs, fat, serving_size, serving_unit, tags,
    macros_per_100g, portions = [],
  } = req.body;
  if (!name) return res.status(400).json({ error: 'name is required' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: [food] } = await client.query(
      `INSERT INTO saved_foods (user_id, name, calories, protein, carbs, fat, serving_size, serving_unit, tags, macros_per_100g)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
      [req.userId, name, calories ?? 0, protein ?? 0, carbs ?? 0, fat ?? 0,
       serving_size ?? 1, serving_unit ?? 'serving', tags ?? '', !!macros_per_100g]
    );
    if (portions.length > 0) await insertPortions(client, food.id, portions);
    await client.query('COMMIT');
    const { rows: savedPortions } = await pool.query(
      'SELECT id, label, weight_grams, sort_order FROM food_portions WHERE saved_food_id = $1 ORDER BY sort_order',
      [food.id]
    );
    res.status(201).json({ ...food, portions: savedPortions });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

router.put('/:id', async (req, res) => {
  const {
    name, calories, protein, carbs, fat, serving_size, serving_unit, tags,
    macros_per_100g, portions,
  } = req.body;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows, rowCount } = await client.query(
      `UPDATE saved_foods SET name=$1, calories=$2, protein=$3, carbs=$4, fat=$5,
       serving_size=$6, serving_unit=$7, tags=$8, macros_per_100g=$9 WHERE id=$10 AND user_id=$11 RETURNING *`,
      [name, calories, protein, carbs, fat, serving_size, serving_unit, tags ?? '',
       !!macros_per_100g, req.params.id, req.userId]
    );
    if (rowCount === 0) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Not found' }); }

    if (Array.isArray(portions)) {
      await client.query('DELETE FROM food_portions WHERE saved_food_id = $1', [req.params.id]);
      if (portions.length > 0) await insertPortions(client, req.params.id, portions);
    }
    await client.query('COMMIT');
    const { rows: savedPortions } = await pool.query(
      'SELECT id, label, weight_grams, sort_order FROM food_portions WHERE saved_food_id = $1 ORDER BY sort_order',
      [req.params.id]
    );
    res.json({ ...rows[0], portions: savedPortions });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const { rowCount } = await pool.query(
      'DELETE FROM saved_foods WHERE id = $1 AND user_id = $2',
      [req.params.id, req.userId]
    );
    if (rowCount === 0) return res.status(404).json({ error: 'Not found' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Insert one portion for a saved food owned by the current user.
router.post('/:id/portions', async (req, res) => {
  try {
    const { label, weight_grams, sort_order } = req.body;
    if (!label?.trim() || !(+weight_grams > 0)) {
      return res.status(400).json({ error: 'label and weight_grams are required' });
    }
    const { rows: [food] } = await pool.query(
      'SELECT id FROM saved_foods WHERE id = $1 AND user_id = $2',
      [req.params.id, req.userId]
    );
    if (!food) return res.status(404).json({ error: 'Not found' });

    const { rows: [portion] } = await pool.query(
      `INSERT INTO food_portions (saved_food_id, label, weight_grams, sort_order)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [req.params.id, label.trim(), +weight_grams, sort_order ?? 0]
    );
    res.status(201).json(portion);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete one portion row (ownership verified via a join back to saved_foods).
router.delete('/portions/:portionId', async (req, res) => {
  try {
    const { rowCount } = await pool.query(
      `DELETE FROM food_portions fp
       USING saved_foods sf
       WHERE fp.id = $1 AND fp.saved_food_id = sf.id AND sf.user_id = $2`,
      [req.params.portionId, req.userId]
    );
    if (rowCount === 0) return res.status(404).json({ error: 'Not found' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
