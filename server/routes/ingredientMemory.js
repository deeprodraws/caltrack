const express = require('express');
const router = express.Router();
const pool = require('../db');

// GET /api/ingredient-memory/:name  — case-insensitive exact lookup
router.get('/:name', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM ingredient_memory WHERE LOWER(food_name) = LOWER($1) LIMIT 1',
      [req.params.name]
    );
    if (!rows[0]) return res.status(404).json({ error: 'No memory for this ingredient' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/ingredient-memory  — upsert
router.post('/', async (req, res) => {
  const { food_name, typical_weight_grams } = req.body;
  if (!food_name?.trim()) return res.status(400).json({ error: 'food_name required' });
  try {
    const { rows: [row] } = await pool.query(
      `INSERT INTO ingredient_memory (food_name, typical_weight_grams, use_count, last_used_at)
       VALUES ($1,$2,1,NOW())
       ON CONFLICT (food_name) DO UPDATE SET
         typical_weight_grams = $2,
         use_count = ingredient_memory.use_count + 1,
         last_used_at = NOW()
       RETURNING *`,
      [food_name.trim(), +typical_weight_grams || 0]
    );
    res.json(row);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
