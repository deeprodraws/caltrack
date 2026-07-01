const express = require('express');
const router = express.Router();
const pool = require('../db');

// GET /api/workout-templates
router.get('/', async (req, res) => {
  try {
    const { rows: templates } = await pool.query(
      `SELECT * FROM workout_templates ORDER BY created_at DESC`
    );
    const result = [];
    for (const t of templates) {
      const { rows: exercises } = await pool.query(
        `SELECT exercise_name, target_sets, target_reps, sort_order
         FROM workout_template_exercises WHERE template_id = $1 ORDER BY sort_order`,
        [t.id]
      );
      result.push({ ...t, exercises });
    }
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/workout-templates
router.post('/', async (req, res) => {
  const { name, notes = '', exercises = [] } = req.body;
  if (!name) return res.status(400).json({ error: 'name required' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: [t] } = await client.query(
      `INSERT INTO workout_templates (name, notes) VALUES ($1, $2) RETURNING *`,
      [name, notes]
    );
    for (let i = 0; i < exercises.length; i++) {
      const { exercise_name, target_sets = 3, target_reps = 8 } = exercises[i];
      await client.query(
        `INSERT INTO workout_template_exercises
         (template_id, exercise_name, target_sets, target_reps, sort_order)
         VALUES ($1, $2, $3, $4, $5)`,
        [t.id, exercise_name, target_sets, target_reps, i]
      );
    }
    await client.query('COMMIT');
    res.json({ ...t, exercises });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// PUT /api/workout-templates/:id
router.put('/:id', async (req, res) => {
  const { name, notes = '', exercises = [] } = req.body;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: [t] } = await client.query(
      `UPDATE workout_templates SET name = $1, notes = $2 WHERE id = $3 RETURNING *`,
      [name, notes, req.params.id]
    );
    if (!t) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Not found' }); }
    await client.query(`DELETE FROM workout_template_exercises WHERE template_id = $1`, [t.id]);
    for (let i = 0; i < exercises.length; i++) {
      const { exercise_name, target_sets = 3, target_reps = 8 } = exercises[i];
      await client.query(
        `INSERT INTO workout_template_exercises
         (template_id, exercise_name, target_sets, target_reps, sort_order)
         VALUES ($1, $2, $3, $4, $5)`,
        [t.id, exercise_name, target_sets, target_reps, i]
      );
    }
    await client.query('COMMIT');
    res.json({ ...t, exercises });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// DELETE /api/workout-templates/:id
router.delete('/:id', async (req, res) => {
  try {
    await pool.query(`DELETE FROM workout_templates WHERE id = $1`, [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
