const express = require('express');
const router = express.Router();
const pool = require('../db');

// POST /api/session-exercises/:exercise_id/sets
router.post('/:exercise_id/sets', async (req, res) => {
  const { weight, reps, rpe } = req.body;
  try {
    const { rows: [{ max_num }] } = await pool.query(
      `SELECT COALESCE(MAX(set_number), 0) AS max_num FROM session_sets WHERE session_exercise_id = $1`,
      [req.params.exercise_id]
    );
    const { rows: [row] } = await pool.query(
      `INSERT INTO session_sets (session_exercise_id, set_number, weight, reps, rpe)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [req.params.exercise_id, max_num + 1, +weight || 0, +reps || 0, rpe != null ? +rpe : null]
    );
    res.json(row);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

// Mounted separately for PUT /api/sets/:id and DELETE /api/sets/:id
const setsRouter = express.Router();

setsRouter.put('/:id', async (req, res) => {
  const { weight, reps, rpe } = req.body;
  try {
    const { rows: [row] } = await pool.query(`
      UPDATE session_sets SET
        weight = CASE WHEN $2 IS NOT NULL THEN $2 ELSE weight END,
        reps   = CASE WHEN $3 IS NOT NULL THEN $3 ELSE reps   END,
        rpe    = CASE WHEN $4 IS NOT NULL THEN $4 ELSE rpe    END
      WHERE id = $1 RETURNING *`,
      [req.params.id,
       weight !== undefined ? +weight : null,
       reps   !== undefined ? +reps   : null,
       rpe    !== undefined ? (rpe !== null ? +rpe : null) : null]
    );
    if (!row) return res.status(404).json({ error: 'Not found' });
    res.json(row);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

setsRouter.delete('/:id', async (req, res) => {
  try {
    await pool.query(`DELETE FROM session_sets WHERE id = $1`, [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports.setsRouter = setsRouter;
