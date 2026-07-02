'use strict';
const express = require('express');
const router = express.Router();
const pool = require('../db');

router.get('/', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT DISTINCT ON (se.exercise_name)
        se.exercise_name,
        ex.muscle_group,
        ss.weight,
        ss.reps,
        ss.rpe,
        ss.completed_at,
        ws.date,
        ws.name as session_name,
        ROUND(CAST(
          ss.weight * (1 + ss.reps::float / 30)
        AS numeric), 1) as estimated_1rm
      FROM session_sets ss
      JOIN session_exercises se ON se.id = ss.session_exercise_id
      JOIN workout_sessions ws ON ws.id = se.session_id
      LEFT JOIN exercises ex ON LOWER(ex.name) = LOWER(se.exercise_name)
      WHERE ws.user_id = $1
        AND ws.finished_at IS NOT NULL
      ORDER BY se.exercise_name,
               (ss.weight * (1 + ss.reps::float / 30)) DESC
    `, [req.userId]);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
