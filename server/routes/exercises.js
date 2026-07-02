'use strict';
const express = require('express');
const router = express.Router();
const pool = require('../db');

// Exercises are global (shared library), no user_id filtering on the list/create
router.get('/', async (req, res) => {
  const { q } = req.query;
  try {
    const { rows } = q
      ? await pool.query(
          `SELECT * FROM exercises WHERE name ILIKE $1 ORDER BY name LIMIT 10`,
          [`%${q}%`]
        )
      : await pool.query(`SELECT * FROM exercises ORDER BY name`);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', async (req, res) => {
  const { name, muscle_group = '', equipment = '' } = req.body;
  if (!name) return res.status(400).json({ error: 'name required' });
  try {
    const { rows: [row] } = await pool.query(
      `INSERT INTO exercises (name, muscle_group, equipment) VALUES ($1, $2, $3) RETURNING *`,
      [name.trim(), muscle_group, equipment]
    );
    res.json(row);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// History is scoped to the current user's sessions
router.get('/:name/history', async (req, res) => {
  const name = decodeURIComponent(req.params.name);
  try {
    const { rows: sessions } = await pool.query(`
      SELECT ws.id AS session_id, ws.date, ws.name AS session_name, se.id AS se_id
      FROM session_exercises se
      JOIN workout_sessions ws ON ws.id = se.session_id
      WHERE LOWER(se.exercise_name) = LOWER($1)
        AND ws.finished_at IS NOT NULL
        AND ws.user_id = $2
      ORDER BY ws.date DESC, ws.id DESC
      LIMIT 10
    `, [name, req.userId]);

    const history = [];
    for (const row of sessions) {
      const { rows: sets } = await pool.query(
        `SELECT weight, reps, rpe FROM session_sets WHERE session_exercise_id = $1 ORDER BY set_number`,
        [row.se_id]
      );
      const best = sets.reduce((b, s) =>
        !b || s.weight > b.weight || (s.weight === b.weight && s.reps > b.reps) ? s : b, null
      );
      history.push({
        session_id: row.session_id,
        date: row.date,
        session_name: row.session_name,
        sets,
        best_set: best,
        estimated_1rm: best ? +(best.weight * (1 + best.reps / 30)).toFixed(1) : 0,
      });
    }
    res.json(history);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:name/volume-history', async (req, res) => {
  const name = decodeURIComponent(req.params.name);
  try {
    const { rows } = await pool.query(`
      SELECT
        ws.date,
        SUM(ss.weight * ss.reps) as volume,
        MAX(ss.weight) as max_weight,
        SUM(ss.reps) as total_reps,
        COUNT(ss.id) as total_sets
      FROM session_sets ss
      JOIN session_exercises se ON se.id = ss.session_exercise_id
      JOIN workout_sessions ws ON ws.id = se.session_id
      WHERE ws.user_id = $1
        AND ws.finished_at IS NOT NULL
        AND se.exercise_name ILIKE $2
        AND ws.date >= TO_CHAR(NOW() - INTERVAL '16 weeks', 'YYYY-MM-DD')
      GROUP BY ws.date, ws.id
      ORDER BY ws.date ASC
    `, [req.userId, name]);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:name/last-session', async (req, res) => {
  const name = decodeURIComponent(req.params.name);
  try {
    const { rows } = await pool.query(`
      SELECT ws.date, se.id AS se_id
      FROM session_exercises se
      JOIN workout_sessions ws ON ws.id = se.session_id
      WHERE LOWER(se.exercise_name) = LOWER($1)
        AND ws.finished_at IS NOT NULL
        AND ws.user_id = $2
      ORDER BY ws.date DESC, ws.id DESC
      LIMIT 1
    `, [name, req.userId]);

    if (!rows.length) return res.json(null);

    const { rows: sets } = await pool.query(
      `SELECT weight, reps, rpe FROM session_sets WHERE session_exercise_id = $1 ORDER BY set_number`,
      [rows[0].se_id]
    );
    res.json({ date: rows[0].date, sets });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
