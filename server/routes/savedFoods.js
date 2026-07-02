'use strict';
const express = require('express');
const router = express.Router();
const pool = require('../db');

router.get('/', async (req, res) => {
  try {
    const { q } = req.query;
    let result;
    if (q && q.trim()) {
      result = await pool.query(
        'SELECT * FROM saved_foods WHERE user_id = $1 AND name ILIKE $2 ORDER BY name ASC LIMIT 20',
        [req.userId, `%${q.trim()}%`]
      );
    } else {
      result = await pool.query(
        'SELECT * FROM saved_foods WHERE user_id = $1 ORDER BY name ASC',
        [req.userId]
      );
    }
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const { name, calories, protein, carbs, fat, serving_size, serving_unit, tags } = req.body;
    if (!name) return res.status(400).json({ error: 'name is required' });
    const { rows } = await pool.query(
      `INSERT INTO saved_foods (user_id, name, calories, protein, carbs, fat, serving_size, serving_unit, tags)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
      [req.userId, name, calories ?? 0, protein ?? 0, carbs ?? 0, fat ?? 0,
       serving_size ?? 1, serving_unit ?? 'serving', tags ?? '']
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const { name, calories, protein, carbs, fat, serving_size, serving_unit, tags } = req.body;
    const { rows, rowCount } = await pool.query(
      `UPDATE saved_foods SET name=$1, calories=$2, protein=$3, carbs=$4, fat=$5,
       serving_size=$6, serving_unit=$7, tags=$8 WHERE id=$9 AND user_id=$10 RETURNING *`,
      [name, calories, protein, carbs, fat, serving_size, serving_unit, tags ?? '', req.params.id, req.userId]
    );
    if (rowCount === 0) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
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

module.exports = router;
