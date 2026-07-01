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
// MUST be before /:id to avoid 'recent' being treated as an id
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
      WHERE ws.finished_at IS NOT NULL
      GROUP BY ws.id
      ORDER BY ws.finished_at DESC
      LIMIT $1
    `, [limit]);
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
      `SELECT id FROM workout_sessions WHERE date = $1 ORDER BY created_at`,
      [date]
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
      `INSERT INTO workout_sessions (date, name, started_at)
       VALUES ($1, $2, NOW()) RETURNING *`,
      [date, name]
    );
    if (template_id) {
      const { rows: templateExercises } = await client.query(
        `SELECT exercise_name, sort_order FROM workout_template_exercises
         WHERE template_id = $1 ORDER BY sort_order`,
        [template_id]
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

// PUT /api/workout-sessions/:id  (partial update)
router.put('/:id', async (req, res) => {
  const { name, notes, finished_at } = req.body;
  try {
    const { rows: [row] } = await pool.query(`
      UPDATE workout_sessions SET
        name        = CASE WHEN $2 IS NOT NULL THEN $2 ELSE name        END,
        notes       = CASE WHEN $3 IS NOT NULL THEN $3 ELSE notes       END,
        finished_at = CASE WHEN $4 IS NOT NULL THEN $4::TIMESTAMPTZ ELSE finished_at END
      WHERE id = $1 RETURNING *`,
      [req.params.id,
       name !== undefined ? name : null,
       notes !== undefined ? notes : null,
       finished_at !== undefined ? finished_at : null]
    );
    if (!row) return res.status(404).json({ error: 'Not found' });
    res.json(row);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/workout-sessions/:id
router.delete('/:id', async (req, res) => {
  try {
    await pool.query(`DELETE FROM workout_sessions WHERE id = $1`, [req.params.id]);
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
      `DELETE FROM session_exercises WHERE id = $1 AND session_id = $2`,
      [req.params.exercise_id, req.params.session_id]
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
