const express = require('express');
const router = express.Router();
const pool = require('../db');

// GET /api/exercises?q=
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

// POST /api/exercises
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

// GET /api/exercises/:name/history
router.get('/:name/history', async (req, res) => {
  const name = decodeURIComponent(req.params.name);
  try {
    const { rows: sessions } = await pool.query(`
      SELECT ws.id AS session_id, ws.date, ws.name AS session_name, se.id AS se_id
      FROM session_exercises se
      JOIN workout_sessions ws ON ws.id = se.session_id
      WHERE LOWER(se.exercise_name) = LOWER($1) AND ws.finished_at IS NOT NULL
      ORDER BY ws.date DESC, ws.id DESC
      LIMIT 10
    `, [name]);

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

// GET /api/exercises/:name/last-session
router.get('/:name/last-session', async (req, res) => {
  const name = decodeURIComponent(req.params.name);
  try {
    const { rows } = await pool.query(`
      SELECT ws.date, se.id AS se_id
      FROM session_exercises se
      JOIN workout_sessions ws ON ws.id = se.session_id
      WHERE LOWER(se.exercise_name) = LOWER($1) AND ws.finished_at IS NOT NULL
      ORDER BY ws.date DESC, ws.id DESC
      LIMIT 1
    `, [name]);

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
