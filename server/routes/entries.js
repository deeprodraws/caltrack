'use strict';
const express = require('express');
const router = express.Router();
const pool = require('../db');

router.get('/', async (req, res) => {
  try {
    const { date, start, end } = req.query;
    if (start && end) {
      const { rows } = await pool.query(
        `SELECT * FROM food_entries
         WHERE user_id = $1 AND date >= $2 AND date <= $3
         ORDER BY date ASC, created_at ASC`,
        [req.userId, start, end]
      );
      return res.json(rows);
    }
    if (!date) return res.status(400).json({ error: 'date query param required' });
    const { rows } = await pool.query(
      'SELECT * FROM food_entries WHERE user_id = $1 AND date = $2 ORDER BY created_at ASC',
      [req.userId, date]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const { date, food_name, calories, protein, carbs, fat } = req.body;
    if (!date || !food_name) {
      return res.status(400).json({ error: 'date and food_name are required' });
    }
    const { rows } = await pool.query(
      `INSERT INTO food_entries (user_id, date, food_name, calories, protein, carbs, fat)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [req.userId, date, food_name, calories ?? 0, protein ?? 0, carbs ?? 0, fat ?? 0]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const { food_name, calories, protein, carbs, fat } = req.body;
    const { rows, rowCount } = await pool.query(
      `UPDATE food_entries SET food_name=$1, calories=$2, protein=$3, carbs=$4, fat=$5
       WHERE id=$6 AND user_id=$7 RETURNING *`,
      [food_name, calories ?? 0, protein ?? 0, carbs ?? 0, fat ?? 0, req.params.id, req.userId]
    );
    if (rowCount === 0) return res.status(404).json({ error: 'Entry not found' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const { rowCount } = await pool.query(
      'DELETE FROM food_entries WHERE id = $1 AND user_id = $2',
      [req.params.id, req.userId]
    );
    if (rowCount === 0) return res.status(404).json({ error: 'Entry not found' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
