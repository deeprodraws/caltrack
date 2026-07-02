'use strict';
const express = require('express');
const router = express.Router();
const pool = require('../db');

router.get('/', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM weight_logs WHERE user_id = $1 ORDER BY date DESC, created_at DESC',
      [req.userId]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const { date, weight, unit } = req.body;
    const { rows } = await pool.query(
      `INSERT INTO weight_logs (user_id, date, weight, unit) VALUES ($1, $2, $3, $4) RETURNING *`,
      [req.userId, date, weight, unit || 'lbs']
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const { weight, unit } = req.body;
    const { rows } = await pool.query(
      `UPDATE weight_logs SET weight=$1, unit=$2 WHERE id=$3 AND user_id=$4 RETURNING *`,
      [weight, unit, req.params.id, req.userId]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const { rowCount } = await pool.query(
      'DELETE FROM weight_logs WHERE id=$1 AND user_id=$2',
      [req.params.id, req.userId]
    );
    if (rowCount === 0) return res.status(404).json({ error: 'Not found' });
    res.json({ deleted: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
