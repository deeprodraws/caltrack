'use strict';
const express = require('express');
const router = express.Router();
const pool = require('../db');

router.get('/', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM daily_goals WHERE user_id = $1', [req.userId]
    );
    res.json(rows[0] || { calories: 2000, protein: 150, carbs: 250, fat: 65, weight_unit: 'lbs' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/', async (req, res) => {
  try {
    const { calories, protein, carbs, fat, weight_unit } = req.body;
    const { rows } = await pool.query(
      `INSERT INTO daily_goals (user_id, calories, protein, carbs, fat, weight_unit)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (user_id) DO UPDATE SET
         calories = $2, protein = $3, carbs = $4, fat = $5, weight_unit = $6
       RETURNING *`,
      [req.userId, calories, protein, carbs, fat, weight_unit || 'lbs']
    );
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
