const express = require('express');
const router = express.Router();
const db = require('../db');

router.get('/', (req, res) => {
  const { q } = req.query;
  let rows;
  if (q && q.trim()) {
    rows = db.prepare(
      `SELECT * FROM saved_foods WHERE name LIKE ? ORDER BY name ASC LIMIT 20`
    ).all(`%${q.trim()}%`);
  } else {
    rows = db.prepare(`SELECT * FROM saved_foods ORDER BY name ASC`).all();
  }
  res.json(rows);
});

router.post('/', (req, res) => {
  const { name, calories, protein, carbs, fat, serving_size, serving_unit, tags } = req.body;
  if (!name) return res.status(400).json({ error: 'name is required' });
  const info = db.prepare(
    `INSERT INTO saved_foods (name, calories, protein, carbs, fat, serving_size, serving_unit, tags)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    name, calories ?? 0, protein ?? 0, carbs ?? 0, fat ?? 0,
    serving_size ?? 1, serving_unit ?? 'serving', tags ?? ''
  );
  const row = db.prepare('SELECT * FROM saved_foods WHERE id = ?').get(info.lastInsertRowid);
  res.status(201).json(row);
});

router.put('/:id', (req, res) => {
  const { name, calories, protein, carbs, fat, serving_size, serving_unit, tags } = req.body;
  const info = db.prepare(
    `UPDATE saved_foods SET name=?, calories=?, protein=?, carbs=?, fat=?,
     serving_size=?, serving_unit=?, tags=? WHERE id=?`
  ).run(name, calories, protein, carbs, fat, serving_size, serving_unit, tags ?? '', req.params.id);
  if (info.changes === 0) return res.status(404).json({ error: 'Not found' });
  res.json(db.prepare('SELECT * FROM saved_foods WHERE id = ?').get(req.params.id));
});

router.delete('/:id', (req, res) => {
  const info = db.prepare('DELETE FROM saved_foods WHERE id = ?').run(req.params.id);
  if (info.changes === 0) return res.status(404).json({ error: 'Not found' });
  res.json({ success: true });
});

module.exports = router;
