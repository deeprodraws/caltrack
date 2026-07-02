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

// GET /api/timeline?start=YYYY-MM-DD&end=YYYY-MM-DD
router.get('/', async (req, res) => {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const end = req.query.end || today;

    let start = req.query.start;
    if (!start) start = offsetDate(end, -29);

    // Cap at 90 days
    const diffDays = Math.round(
      (new Date(end + 'T12:00:00') - new Date(start + 'T12:00:00')) / 86400000
    );
    if (diffDays > 90) start = offsetDate(end, -89);

    const [
      foodRes,
      weightRes,
      metricsRes,
      workoutRes,
      physiqueRes,
      goalsRes,
    ] = await Promise.all([
      // 1. Food entries grouped by date
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
            'calories', calories,
            'protein', protein,
            'carbs', carbs,
            'fat', fat
          ) ORDER BY created_at)         AS entries
        FROM food_entries
        WHERE date BETWEEN $1 AND $2
        GROUP BY date
      `, [start, end]),

      // 2. Weight logs (last entry per date wins)
      pool.query(`
        SELECT DISTINCT ON (date)
          date, weight, unit
        FROM weight_logs
        WHERE date BETWEEN $1 AND $2
        ORDER BY date, id DESC
      `, [start, end]),

      // 3. Daily metrics
      pool.query(`
        SELECT date, steps, water_ml, sleep_hours
        FROM daily_metrics
        WHERE date BETWEEN $1 AND $2
      `, [start, end]),

      // 4. Finished workout sessions with aggregate stats
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
        WHERE ws.date BETWEEN $1 AND $2
          AND ws.finished_at IS NOT NULL
        GROUP BY ws.date, ws.id, ws.name, ws.started_at, ws.finished_at, ws.notes
        ORDER BY ws.date, ws.started_at
      `, [start, end]),

      // 5. Physique weeks with photos
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
        WHERE pw.week_start BETWEEN $1 AND $2
        GROUP BY pw.id, pw.week_start, pw.weight, pw.body_fat, pw.notes
      `, [start, end]),

      // 6. Goals (single row)
      pool.query(`SELECT calories, protein, carbs, fat, weight_unit FROM daily_goals WHERE id = 1`),
    ]);

    const goals = goalsRes.rows[0] || { calories: 2000, protein: 150, carbs: 250, fat: 65, weight_unit: 'lbs' };

    // Build lookup maps
    const foodByDate = {};
    for (const r of foodRes.rows) foodByDate[r.date] = r;

    const weightByDate = {};
    for (const r of weightRes.rows) weightByDate[r.date] = { weight: r.weight, unit: r.unit };

    const metricsByDate = {};
    for (const r of metricsRes.rows) {
      metricsByDate[r.date] = { steps: r.steps || 0, water_ml: r.water_ml || 0, sleep_hours: r.sleep_hours || 0 };
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
      });
    }

    // Physique attaches to the Sunday (week_start) date only
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

    // Generate all dates newest-first
    const dates = generateDates(start, end).reverse();

    const days = dates.map(date => {
      const rawFood = foodByDate[date] || null;
      const weight  = weightByDate[date] || null;
      const metrics = metricsByDate[date] || null;
      const workouts = workoutsByDate[date] || [];
      const physique = physiqueByDate[date] || null;

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

      const has_any_data = !!(food || weight || workouts.length > 0 || metrics);

      // Format day label
      const d = new Date(date + 'T12:00:00');
      const day_label = d.toLocaleDateString('en-US', {
        weekday: 'long', month: 'long', day: 'numeric',
      });

      return { date, day_label, food, weight, metrics, workouts, physique, has_any_data };
    });

    res.json({ goals, days });
  } catch (err) {
    console.error('Timeline error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
