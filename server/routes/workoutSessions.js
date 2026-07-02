'use strict';
const express = require('express');
const router = express.Router();
const pool = require('../db');

async function buildSessionWithExercises(sessionId) {
  const { rows: [session] } = await pool.query(
    `SELECT * FROM workout_sessions WHERE id = $1`, [sessionId]
  );
  if (!session) return null;

  const { rows: exercises } = await pool.query(
    `SELECT * FROM session_exercises WHERE session_id = $1 ORDER BY sort_order`,
    [sessionId]
  );
  const result = [];
  for (const ex of exercises) {
    const { rows: sets } = await pool.query(
      `SELECT * FROM session_sets WHERE session_exercise_id = $1 ORDER BY set_number`,
      [ex.id]
    );
    result.push({ ...ex, sets });
  }
  return { ...session, exercises: result };
}

// GET /api/workout-sessions/recent?limit=5
router.get('/recent', async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 5, 20);
  try {
    const { rows: sessions } = await pool.query(`
      SELECT
        ws.id, ws.date, ws.name, ws.started_at, ws.finished_at,
        COUNT(ss.id) AS total_sets,
        COALESCE(SUM(ss.weight * ss.reps), 0) AS total_volume
      FROM workout_sessions ws
      LEFT JOIN session_exercises se ON se.session_id = ws.id
      LEFT JOIN session_sets ss ON ss.session_exercise_id = se.id
      WHERE ws.user_id = $1 AND ws.finished_at IS NOT NULL
      GROUP BY ws.id
      ORDER BY ws.finished_at DESC
      LIMIT $2
    `, [req.userId, limit]);
    res.json(sessions.map(s => ({
      ...s,
      total_sets: parseInt(s.total_sets),
      total_volume: parseFloat(s.total_volume),
    })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/workout-sessions?date=YYYY-MM-DD
router.get('/', async (req, res) => {
  const { date } = req.query;
  if (!date) return res.status(400).json({ error: 'date required' });
  try {
    const { rows: sessions } = await pool.query(
      `SELECT id FROM workout_sessions WHERE user_id = $1 AND date = $2 ORDER BY created_at`,
      [req.userId, date]
    );
    const result = [];
    for (const { id } of sessions) {
      result.push(await buildSessionWithExercises(id));
    }
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/workout-sessions
router.post('/', async (req, res) => {
  const { date, name = 'Workout', template_id } = req.body;
  if (!date) return res.status(400).json({ error: 'date required' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: [session] } = await client.query(
      `INSERT INTO workout_sessions (user_id, date, name, started_at)
       VALUES ($1, $2, $3, NOW()) RETURNING *`,
      [req.userId, date, name]
    );
    if (template_id) {
      // Verify template belongs to user
      const { rows: templateExercises } = await client.query(
        `SELECT wte.exercise_name, wte.sort_order
         FROM workout_template_exercises wte
         JOIN workout_templates wt ON wt.id = wte.template_id
         WHERE wte.template_id = $1 AND wt.user_id = $2
         ORDER BY wte.sort_order`,
        [template_id, req.userId]
      );
      for (const te of templateExercises) {
        await client.query(
          `INSERT INTO session_exercises (session_id, exercise_name, sort_order)
           VALUES ($1, $2, $3)`,
          [session.id, te.exercise_name, te.sort_order]
        );
      }
    }
    await client.query('COMMIT');
    const full = await buildSessionWithExercises(session.id);
    res.json(full);
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// PUT /api/workout-sessions/:id
router.put('/:id', async (req, res) => {
  const { name, notes, finished_at } = req.body;
  try {
    const { rows: [row] } = await pool.query(`
      UPDATE workout_sessions SET
        name        = COALESCE($2::TEXT, name),
        notes       = COALESCE($3::TEXT, notes),
        finished_at = COALESCE($4::TIMESTAMPTZ, finished_at)
      WHERE id = $1 AND user_id = $5 RETURNING *`,
      [req.params.id,
       name !== undefined ? name : null,
       notes !== undefined ? notes : null,
       finished_at !== undefined ? finished_at : null,
       req.userId]
    );
    if (!row) return res.status(404).json({ error: 'Not found' });
    res.json(row);
  } catch (err) {
    console.error('[PUT /workout-sessions/:id]', req.params.id, err.message);
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/workout-sessions/:id
router.delete('/:id', async (req, res) => {
  try {
    await pool.query(
      `DELETE FROM workout_sessions WHERE id = $1 AND user_id = $2`,
      [req.params.id, req.userId]
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/workout-sessions/:id/exercises
router.post('/:id/exercises', async (req, res) => {
  const { exercise_name } = req.body;
  if (!exercise_name) return res.status(400).json({ error: 'exercise_name required' });
  try {
    // Verify session belongs to user
    const { rows: own } = await pool.query(
      `SELECT id FROM workout_sessions WHERE id = $1 AND user_id = $2`,
      [req.params.id, req.userId]
    );
    if (!own.length) return res.status(403).json({ error: 'Not authorized' });

    const { rows: [{ max_order }] } = await pool.query(
      `SELECT COALESCE(MAX(sort_order), -1) AS max_order FROM session_exercises WHERE session_id = $1`,
      [req.params.id]
    );
    const { rows: [row] } = await pool.query(
      `INSERT INTO session_exercises (session_id, exercise_name, sort_order)
       VALUES ($1, $2, $3) RETURNING *`,
      [req.params.id, exercise_name, max_order + 1]
    );
    res.json({ ...row, sets: [] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/workout-sessions/:session_id/exercises/:exercise_id
router.delete('/:session_id/exercises/:exercise_id', async (req, res) => {
  try {
    await pool.query(
      `DELETE FROM session_exercises se
       USING workout_sessions ws
       WHERE se.id = $1 AND se.session_id = $2
         AND ws.id = se.session_id AND ws.user_id = $3`,
      [req.params.exercise_id, req.params.session_id, req.userId]
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
