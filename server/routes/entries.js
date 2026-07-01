const express = require('express');
const router = express.Router();
const pool = require('../db');

router.get('/', async (req, res) => {
  try {
    const { date } = req.query;
    if (!date) return res.status(400).json({ error: 'date query param required' });
    const { rows } = await pool.query(
      'SELECT * FROM food_entries WHERE date = $1 ORDER BY created_at ASC',
      [date]
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
      `INSERT INTO food_entries (date, food_name, calories, protein, carbs, fat)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [date, food_name, calories ?? 0, protein ?? 0, carbs ?? 0, fat ?? 0]
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
       WHERE id=$6 RETURNING *`,
      [food_name, calories ?? 0, protein ?? 0, carbs ?? 0, fat ?? 0, req.params.id]
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
      'DELETE FROM food_entries WHERE id = $1',
      [req.params.id]
    );
    if (rowCount === 0) return res.status(404).json({ error: 'Entry not found' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
