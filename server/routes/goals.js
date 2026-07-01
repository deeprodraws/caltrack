const express = require('express');
const router = express.Router();
const pool = require('../db');

router.get('/', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM daily_goals WHERE id = 1');
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/', async (req, res) => {
  try {
    const { calories, protein, carbs, fat, weight_unit } = req.body;
    const { rows } = await pool.query(
      `UPDATE daily_goals SET calories=$1, protein=$2, carbs=$3, fat=$4, weight_unit=$5
       WHERE id=1 RETURNING *`,
      [calories, protein, carbs, fat, weight_unit || 'kg']
    );
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
