const express = require('express');
const router = express.Router();
const db = require('../db');

router.get('/', (req, res) => {
  const { date } = req.query;
  if (!date) return res.status(400).json({ error: 'date query param required' });
  const rows = db.prepare(
    'SELECT * FROM food_entries WHERE date = ? ORDER BY created_at ASC'
  ).all(date);
  res.json(rows);
});

router.post('/', (req, res) => {
  const { date, food_name, calories, protein, carbs, fat } = req.body;
  if (!date || !food_name) {
    return res.status(400).json({ error: 'date and food_name are required' });
  }
  const info = db.prepare(
    `INSERT INTO food_entries (date, food_name, calories, protein, carbs, fat)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(date, food_name, calories ?? 0, protein ?? 0, carbs ?? 0, fat ?? 0);

  const entry = db.prepare('SELECT * FROM food_entries WHERE id = ?').get(info.lastInsertRowid);
  res.status(201).json(entry);
});

router.put('/:id', (req, res) => {
  const { food_name, calories, protein, carbs, fat } = req.body;
  const info = db.prepare(
    `UPDATE food_entries SET food_name=?, calories=?, protein=?, carbs=?, fat=? WHERE id=?`
  ).run(food_name, calories ?? 0, protein ?? 0, carbs ?? 0, fat ?? 0, req.params.id);
  if (info.changes === 0) return res.status(404).json({ error: 'Entry not found' });
  res.json(db.prepare('SELECT * FROM food_entries WHERE id = ?').get(req.params.id));
});

router.delete('/:id', (req, res) => {
  const { id } = req.params;
  const info = db.prepare('DELETE FROM food_entries WHERE id = ?').run(id);
  if (info.changes === 0) return res.status(404).json({ error: 'Entry not found' });
  res.json({ success: true });
});

module.exports = router;
