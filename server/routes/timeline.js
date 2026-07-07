'use strict';
const express = require('express');
const router = express.Router();
const pool = require('../db');

function offsetDate(dateStr, days) {
  const d = new Date(dateStr + 'T12:00:00');
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function generateDates(start, end) {
  const dates = [];
  const cur = new Date(start + 'T12:00:00');
  const fin = new Date(end + 'T12:00:00');
  while (cur <= fin) {
    dates.push(cur.toISOString().slice(0, 10));
    cur.setDate(cur.getDate() + 1);
  }
  return dates;
}

function round1(v) {
  return Math.round(v * 10) / 10;
}

router.get('/', async (req, res) => {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const end = req.query.end || today;

    let start = req.query.start;
    if (!start) start = offsetDate(end, -29);

    const diffDays = Math.round(
      (new Date(end + 'T12:00:00') - new Date(start + 'T12:00:00')) / 86400000
    );
    if (diffDays > 90) start = offsetDate(end, -89);

    const uid = req.userId;

    const [
      foodRes,
      weightRes,
      metricsRes,
      workoutRes,
      exercisesRes,
      physiqueRes,
      goalsRes,
      reflectionsRes,
      allSetsRes,
    ] = await Promise.all([
      pool.query(`
        SELECT date,
          SUM(calories)::real            AS total_calories,
          SUM(protein)::real             AS total_protein,
          SUM(carbs)::real               AS total_carbs,
          SUM(fat)::real                 AS total_fat,
          COUNT(*)::int                  AS entry_count,
          json_agg(json_build_object(
            'id', id,
            'food_name', food_name,
            'meal_type', meal_type,
            'calories', calories,
            'protein', protein,
            'carbs', carbs,
            'fat', fat,
            'entry_type', entry_type,
            'source_name', source_name,
            'created_at', created_at
          ) ORDER BY created_at)         AS entries
        FROM food_entries
        WHERE user_id = $1 AND date BETWEEN $2 AND $3
        GROUP BY date
      `, [uid, start, end]),

      pool.query(`
        SELECT DISTINCT ON (date)
          date, weight, unit
        FROM weight_logs
        WHERE user_id = $1 AND date BETWEEN $2 AND $3
        ORDER BY date, id DESC
      `, [uid, start, end]),

      pool.query(`
        SELECT date, steps, water_ml, sleep_hours
        FROM daily_metrics
        WHERE user_id = $1 AND date BETWEEN $2 AND $3
      `, [uid, start, end]),

      pool.query(`
        SELECT
          ws.date,
          ws.id,
          ws.name,
          ws.started_at,
          ws.finished_at,
          ws.notes,
          COUNT(DISTINCT se.id)::int               AS exercise_count,
          COUNT(ss.id)::int                        AS total_sets,
          COALESCE(SUM(ss.weight * ss.reps), 0)::real AS total_volume
        FROM workout_sessions ws
        LEFT JOIN session_exercises se ON se.session_id = ws.id
        LEFT JOIN session_sets ss ON ss.session_exercise_id = se.id
        WHERE ws.user_id = $1 AND ws.date BETWEEN $2 AND $3
          AND ws.finished_at IS NOT NULL
        GROUP BY ws.date, ws.id, ws.name, ws.started_at, ws.finished_at, ws.notes
        ORDER BY ws.date, ws.started_at
      `, [uid, start, end]),

      // Best set per exercise per session — one query via LATERAL join (no N+1)
      pool.query(`
        SELECT
          se.session_id,
          se.exercise_name,
          se.sort_order,
          bs.weight AS best_weight,
          bs.reps   AS best_reps
        FROM session_exercises se
        JOIN workout_sessions ws ON ws.id = se.session_id
        LEFT JOIN LATERAL (
          SELECT weight, reps FROM session_sets
          WHERE session_exercise_id = se.id
          ORDER BY weight DESC, reps DESC
          LIMIT 1
        ) bs ON true
        WHERE ws.user_id = $1 AND ws.date BETWEEN $2 AND $3
          AND ws.finished_at IS NOT NULL
        ORDER BY se.session_id, se.sort_order
      `, [uid, start, end]),

      pool.query(`
        SELECT
          pw.week_start,
          pw.weight    AS physique_weight,
          pw.body_fat,
          pw.notes     AS physique_notes,
          json_agg(json_build_object(
            'photo_type',     pp.photo_type,
            'cloudinary_url', pp.cloudinary_url
          )) FILTER (WHERE pp.id IS NOT NULL) AS photos
        FROM physique_weeks pw
        LEFT JOIN physique_photos pp ON pp.week_id = pw.id
        WHERE pw.user_id = $1 AND pw.week_start BETWEEN $2 AND $3
        GROUP BY pw.id, pw.week_start, pw.weight, pw.body_fat, pw.notes
      `, [uid, start, end]),

      pool.query(
        `SELECT calories, protein, carbs, fat, weight_unit FROM daily_goals WHERE user_id = $1`,
        [uid]
      ),

      pool.query(
        `SELECT date, note FROM daily_reflections WHERE user_id = $1 AND date BETWEEN $2 AND $3`,
        [uid, start, end]
      ),

      // Full history up to `end` (not bounded by `start`) so PR detection compares
      // against the true all-time best, not just the best within the visible range.
      pool.query(`
        SELECT ws.date, se.exercise_name, ss.weight, ss.reps
        FROM session_sets ss
        JOIN session_exercises se ON se.id = ss.session_exercise_id
        JOIN workout_sessions ws ON ws.id = se.session_id
        WHERE ws.user_id = $1 AND ws.date <= $2 AND ws.finished_at IS NOT NULL
        ORDER BY ws.date ASC, ws.id ASC, ss.set_number ASC
      `, [uid, end]),
    ]);

    const goals = goalsRes.rows[0] || { calories: 2000, protein: 150, carbs: 250, fat: 65, weight_unit: 'lbs' };

    const foodByDate = {};
    for (const r of foodRes.rows) foodByDate[r.date] = r;

    const weightByDate = {};
    for (const r of weightRes.rows) weightByDate[r.date] = { weight: r.weight, unit: r.unit };

    const metricsByDate = {};
    for (const r of metricsRes.rows) {
      metricsByDate[r.date] = { steps: r.steps || 0, water_ml: r.water_ml || 0, sleep_hours: r.sleep_hours || 0 };
    }

    const exercisesBySession = {};
    for (const r of exercisesRes.rows) {
      if (!exercisesBySession[r.session_id]) exercisesBySession[r.session_id] = [];
      exercisesBySession[r.session_id].push({
        exercise_name: r.exercise_name,
        best_weight: r.best_weight != null ? Number(r.best_weight) : 0,
        best_reps: r.best_reps != null ? Number(r.best_reps) : 0,
      });
    }

    const workoutsByDate = {};
    for (const r of workoutRes.rows) {
      if (!workoutsByDate[r.date]) workoutsByDate[r.date] = [];
      const duration_minutes =
        r.started_at && r.finished_at
          ? Math.round((new Date(r.finished_at) - new Date(r.started_at)) / 60000)
          : null;
      workoutsByDate[r.date].push({
        id: r.id, name: r.name,
        started_at: r.started_at, finished_at: r.finished_at, notes: r.notes,
        exercise_count: r.exercise_count,
        total_sets: r.total_sets,
        total_volume: r.total_volume,
        duration_minutes,
        exercises: exercisesBySession[r.id] || [],
      });
    }

    const physiqueByDate = {};
    for (const r of physiqueRes.rows) {
      physiqueByDate[r.week_start] = {
        week_start: r.week_start,
        physique_weight: r.physique_weight,
        body_fat: r.body_fat,
        physique_notes: r.physique_notes,
        photos: r.photos || [],
      };
    }

    const reflectionByDate = {};
    for (const r of reflectionsRes.rows) reflectionByDate[r.date] = r.note;

    // Running per-exercise 1RM max, walked chronologically, to detect all-time PRs.
    const bestPerExercise = {};
    const prsByDateExercise = {};
    for (const row of allSetsRes.rows) {
      const weight = Number(row.weight);
      const reps = Number(row.reps);
      if (weight <= 0) continue;
      const est1rm = weight * (1 + reps / 30);
      const prevBest = bestPerExercise[row.exercise_name] || 0;
      if (est1rm > prevBest) {
        if (row.date >= start) {
          if (!prsByDateExercise[row.date]) prsByDateExercise[row.date] = {};
          prsByDateExercise[row.date][row.exercise_name] = {
            exercise_name: row.exercise_name,
            weight, reps,
            estimated_1rm: round1(est1rm),
          };
        }
        bestPerExercise[row.exercise_name] = est1rm;
      }
    }

    const dates = generateDates(start, end).reverse();

    const days = dates.map(date => {
      const rawFood = foodByDate[date] || null;
      const weight  = weightByDate[date] || null;
      const metrics = metricsByDate[date] || null;
      const workouts = workoutsByDate[date] || [];
      const physique = physiqueByDate[date] || null;
      const reflection = reflectionByDate[date] || null;
      const prs_achieved = prsByDateExercise[date] ? Object.values(prsByDateExercise[date]) : [];

      let food = null;
      if (rawFood) {
        const cal  = Math.round(rawFood.total_calories);
        const prot = Math.round(rawFood.total_protein);
        food = {
          total_calories: cal,
          total_protein:  prot,
          total_carbs:    Math.round(rawFood.total_carbs),
          total_fat:      Math.round(rawFood.total_fat),
          entry_count:    rawFood.entry_count,
          entries:        rawFood.entries || [],
          calories_hit: cal >= goals.calories * 0.9 && cal <= goals.calories * 1.1,
          protein_hit:  prot >= goals.protein,
        };
      }

      const has_any_data = !!(food || weight || workouts.length > 0 || metrics || physique);

      const d = new Date(date + 'T12:00:00');
      const day_label = d.toLocaleDateString('en-US', {
        weekday: 'long', month: 'long', day: 'numeric',
      });

      return { date, day_label, food, weight, metrics, workouts, physique, has_any_data, reflection, prs_achieved };
    });

    res.json({ goals, days });
  } catch (err) {
    console.error('Timeline error:', err);
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/timeline/reflection — upsert a daily journal note
router.put('/reflection', async (req, res) => {
  const { date, note } = req.body;
  if (!date) return res.status(400).json({ error: 'date required' });
  try {
    const { rows: [row] } = await pool.query(`
      INSERT INTO daily_reflections (date, user_id, note, updated_at)
      VALUES ($1, $2, $3, NOW())
      ON CONFLICT (user_id, date)
      DO UPDATE SET note = $3, updated_at = NOW()
      RETURNING date, note
    `, [date, req.userId, note || '']);
    res.json(row);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/timeline/search?q=term — search food/reflections/exercises/workout names
router.get('/search', async (req, res) => {
  const q = (req.query.q || '').trim();
  if (q.length < 1) return res.json({ query: q, matching_dates: [], total: 0 });
  const like = `%${q}%`;
  const uid = req.userId;
  try {
    const [foodRes, reflectionRes, exerciseRes, workoutNameRes] = await Promise.all([
      pool.query(`SELECT DISTINCT date FROM food_entries WHERE user_id = $1 AND food_name ILIKE $2`, [uid, like]),
      pool.query(`SELECT DISTINCT date FROM daily_reflections WHERE user_id = $1 AND note ILIKE $2`, [uid, like]),
      pool.query(`
        SELECT DISTINCT ws.date FROM workout_sessions ws
        JOIN session_exercises se ON se.session_id = ws.id
        WHERE ws.user_id = $1 AND se.exercise_name ILIKE $2
      `, [uid, like]),
      pool.query(`SELECT DISTINCT date FROM workout_sessions WHERE user_id = $1 AND name ILIKE $2`, [uid, like]),
    ]);

    const dateSet = new Set();
    for (const r of foodRes.rows) dateSet.add(r.date);
    for (const r of reflectionRes.rows) dateSet.add(r.date);
    for (const r of exerciseRes.rows) dateSet.add(r.date);
    for (const r of workoutNameRes.rows) dateSet.add(r.date);

    const matching_dates = [...dateSet].sort().reverse();
    res.json({ query: q, matching_dates, total: matching_dates.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/timeline/on-this-day — data from exactly one year ago
router.get('/on-this-day', async (req, res) => {
  const uid = req.userId;
  try {
    const today = new Date().toISOString().slice(0, 10);
    const oneYearAgo = offsetDate(today, -365);

    const { rows: [userRow] } = await pool.query(
      `SELECT EXTRACT(days FROM NOW() - created_at)::int AS account_age_days FROM users WHERE id = $1`,
      [uid]
    );
    const account_age_days = userRow ? userRow.account_age_days : 0;

    const [foodRes, weightRes, workoutRes, physiqueRes, reflectionRes] = await Promise.all([
      pool.query(
        `SELECT SUM(calories)::real AS calories, SUM(protein)::real AS protein
         FROM food_entries WHERE user_id = $1 AND date = $2`,
        [uid, oneYearAgo]
      ),
      pool.query(
        `SELECT weight, unit FROM weight_logs WHERE user_id = $1 AND date = $2 ORDER BY id DESC LIMIT 1`,
        [uid, oneYearAgo]
      ),
      pool.query(`
        SELECT ws.id, ws.name,
          json_agg(se.exercise_name ORDER BY se.sort_order) FILTER (WHERE se.id IS NOT NULL) AS exercises
        FROM workout_sessions ws
        LEFT JOIN session_exercises se ON se.session_id = ws.id
        WHERE ws.user_id = $1 AND ws.date = $2 AND ws.finished_at IS NOT NULL
        GROUP BY ws.id, ws.name
      `, [uid, oneYearAgo]),
      pool.query(`
        SELECT pw.id, json_agg(pp.id) FILTER (WHERE pp.id IS NOT NULL) AS photo_ids,
          (array_agg(pp.cloudinary_url))[1] AS photo_url
        FROM physique_weeks pw
        LEFT JOIN physique_photos pp ON pp.week_id = pw.id
        WHERE pw.user_id = $1 AND pw.week_start = $2
        GROUP BY pw.id
      `, [uid, oneYearAgo]),
      pool.query(`SELECT note FROM daily_reflections WHERE user_id = $1 AND date = $2`, [uid, oneYearAgo]),
    ]);

    const calories = foodRes.rows[0]?.calories != null ? Math.round(foodRes.rows[0].calories) : null;
    const protein  = foodRes.rows[0]?.protein  != null ? Math.round(foodRes.rows[0].protein)  : null;
    const weight   = weightRes.rows[0] ? { weight: weightRes.rows[0].weight, unit: weightRes.rows[0].unit } : null;
    const workouts = workoutRes.rows.map(r => ({ name: r.name, exercises: r.exercises || [] }));
    const physiqueRow = physiqueRes.rows[0];
    const has_photo = !!(physiqueRow && physiqueRow.photo_ids && physiqueRow.photo_ids.length > 0);
    const photo_url = has_photo ? physiqueRow.photo_url : null;
    const reflection = reflectionRes.rows[0]?.note || null;

    const found = !!(calories != null || protein != null || weight || workouts.length > 0 || has_photo);

    if (!found) {
      return res.json({ found: false, account_age_days });
    }

    res.json({
      date: oneYearAgo,
      found: true,
      account_age_days,
      calories, protein, weight, workouts,
      has_photo, photo_url, reflection,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
