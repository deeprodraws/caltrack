const express = require('express');
const router = express.Router();
const db = require('../db');

router.get('/', (req, res) => {
  const goals = db.prepare('SELECT * FROM daily_goals WHERE id = 1').get();
  res.json(goals);
});

router.put('/', (req, res) => {
  const { calories, protein, carbs, fat } = req.body;
  db.prepare(
    `UPDATE daily_goals SET calories = ?, protein = ?, carbs = ?, fat = ? WHERE id = 1`
  ).run(calories, protein, carbs, fat);
  const goals = db.prepare('SELECT * FROM daily_goals WHERE id = 1').get();
  res.json(goals);
});

module.exports = router;
