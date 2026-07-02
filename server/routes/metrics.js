'use strict';
const express = require('express');
const router = express.Router();
const pool = require('../db');

// GET /api/metrics?date=YYYY-MM-DD
router.get('/', async (req, res) => {
  const { date } = req.query;
  if (!date) return res.status(400).json({ error: 'date query param required' });

  try {
    const [mRes, yRes] = await Promise.all([
      pool.query(
        'SELECT * FROM daily_metrics WHERE user_id = $1 AND date = $2',
        [req.userId, date]
      ),
      (() => {
        const d = new Date(date + 'T12:00:00');
        d.setDate(d.getDate() - 1);
        const yesterday = d.toISOString().slice(0, 10);
        return pool.query(
          `SELECT
             COALESCE(SUM(calories), 0) AS calories_total,
             COALESCE(SUM(protein),  0) AS protein_total,
             COALESCE(SUM(carbs),    0) AS carbs_total,
             COALESCE(SUM(fat),      0) AS fat_total
           FROM food_entries WHERE user_id = $1 AND date = $2`,
          [req.userId, yesterday]
        );
      })(),
    ]);

    const metrics = mRes.rows[0] || { date, steps: 0, water_ml: 0, sleep_hours: 0, updated_at: null };
    const yesterday = yRes.rows[0] || { calories_total: 0, protein_total: 0, carbs_total: 0, fat_total: 0 };

    res.json({ ...metrics, yesterday });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/metrics
router.put('/', async (req, res) => {
  const { date, steps, water_ml, sleep_hours } = req.body;
  if (!date) return res.status(400).json({ error: 'date required' });

  const s  = steps       !== undefined ? +steps       : null;
  const w  = water_ml    !== undefined ? +water_ml    : null;
  const sl = sleep_hours !== undefined ? +sleep_hours : null;

  try {
    const { rows: [row] } = await pool.query(
      `INSERT INTO daily_metrics (user_id, date, steps, water_ml, sleep_hours, updated_at)
       VALUES ($1, $2, COALESCE($3, 0), COALESCE($4, 0), COALESCE($5, 0), NOW())
       ON CONFLICT (user_id, date) DO UPDATE SET
         steps       = CASE WHEN $3 IS NOT NULL THEN $3 ELSE daily_metrics.steps       END,
         water_ml    = CASE WHEN $4 IS NOT NULL THEN $4 ELSE daily_metrics.water_ml    END,
         sleep_hours = CASE WHEN $5 IS NOT NULL THEN $5 ELSE daily_metrics.sleep_hours END,
         updated_at  = NOW()
       RETURNING *`,
      [req.userId, date, s, w, sl]
    );
    res.json(row);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
