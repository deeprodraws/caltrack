'use strict';
const express = require('express');
const router = express.Router();
const pool = require('../db');
const cloudinary = require('../cloudinary');

function getWeekStart(dateStr) {
  const d = new Date(dateStr + 'T12:00:00');
  d.setDate(d.getDate() - d.getDay());
  return d.toISOString().slice(0, 10);
}

async function fetchWeeksWithStats(userId, extraWhere = '', extraParams = []) {
  const params = [userId, ...extraParams];
  const { rows: weeks } = await pool.query(`
    WITH food_agg AS (
      SELECT
        w.id AS week_id,
        ROUND(AVG(day.cal)::numeric, 1)  AS avg_calories,
        ROUND(AVG(day.prot)::numeric, 1) AS avg_protein,
        ROUND(AVG(day.carb)::numeric, 1) AS avg_carbs,
        ROUND(AVG(day.fat)::numeric, 1)  AS avg_fat
      FROM physique_weeks w
      JOIN (
        SELECT date,
          SUM(calories) AS cal, SUM(protein) AS prot,
          SUM(carbs)    AS carb, SUM(fat)    AS fat
        FROM food_entries
        WHERE user_id = $1
        GROUP BY date
      ) day ON day.date >= w.week_start
           AND day.date <= (w.week_start::date + '6 days'::interval)::text
      WHERE w.user_id = $1
      GROUP BY w.id
    ),
    workout_agg AS (
      SELECT w.id AS week_id, COUNT(ws.id) AS total_workouts
      FROM physique_weeks w
      LEFT JOIN workout_sessions ws
        ON ws.date >= w.week_start
       AND ws.date <= (w.week_start::date + '6 days'::interval)::text
       AND ws.finished_at IS NOT NULL
       AND ws.user_id = $1
      WHERE w.user_id = $1
      GROUP BY w.id
    )
    SELECT
      pw.id, pw.week_start, pw.weight, pw.body_fat, pw.notes, pw.created_at,
      COALESCE(fa.avg_calories, 0)    AS avg_calories,
      COALESCE(fa.avg_protein,  0)    AS avg_protein,
      COALESCE(fa.avg_carbs,    0)    AS avg_carbs,
      COALESCE(fa.avg_fat,      0)    AS avg_fat,
      COALESCE(wa.total_workouts, 0)  AS total_workouts
    FROM physique_weeks pw
    LEFT JOIN food_agg    fa ON fa.week_id = pw.id
    LEFT JOIN workout_agg wa ON wa.week_id = pw.id
    WHERE pw.user_id = $1
    ${extraWhere}
    ORDER BY pw.week_start DESC
  `, params);

  if (!weeks.length) return [];

  const weekIds = weeks.map(w => w.id);
  const { rows: photos } = await pool.query(
    `SELECT id, week_id, photo_type, cloudinary_url
     FROM physique_photos WHERE week_id = ANY($1)`,
    [weekIds]
  );

  const photosByWeek = {};
  for (const p of photos) {
    if (!photosByWeek[p.week_id]) photosByWeek[p.week_id] = [];
    photosByWeek[p.week_id].push(p);
  }

  return weeks.map(w => ({ ...w, photos: photosByWeek[w.id] || [] }));
}

router.get('/', async (req, res) => {
  try {
    res.json(await fetchWeeksWithStats(req.userId));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/current-week', async (req, res) => {
  const weekStart = getWeekStart(new Date().toISOString().slice(0, 10));
  try {
    const rows = await fetchWeeksWithStats(req.userId, 'AND pw.week_start = $2', [weekStart]);
    res.json(rows[0] || null);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/weeks', async (req, res) => {
  const { week_start, weight, body_fat, notes = '' } = req.body;
  if (!week_start) return res.status(400).json({ error: 'week_start required' });
  try {
    const { rows: [row] } = await pool.query(
      `INSERT INTO physique_weeks (user_id, week_start, weight, body_fat, notes)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (user_id, week_start) DO UPDATE
         SET weight   = COALESCE($3, physique_weeks.weight),
             body_fat = COALESCE($4, physique_weeks.body_fat),
             notes    = COALESCE(NULLIF($5,''), physique_weeks.notes)
       RETURNING *`,
      [req.userId, week_start, weight ?? null, body_fat ?? null, notes]
    );
    res.json(row);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/weeks/:id', async (req, res) => {
  const { weight, body_fat, notes } = req.body;
  try {
    const { rows: [row] } = await pool.query(`
      UPDATE physique_weeks SET
        weight   = CASE WHEN $2::text IS NOT NULL THEN $2::real ELSE weight   END,
        body_fat = CASE WHEN $3::text IS NOT NULL THEN $3::real ELSE body_fat END,
        notes    = CASE WHEN $4 IS NOT NULL        THEN $4       ELSE notes    END
      WHERE id = $1 AND user_id = $5 RETURNING *`,
      [req.params.id,
       weight   !== undefined ? weight   : null,
       body_fat !== undefined ? body_fat : null,
       notes    !== undefined ? notes    : null,
       req.userId]
    );
    if (!row) return res.status(404).json({ error: 'Not found' });
    res.json(row);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/weeks/:id', async (req, res) => {
  try {
    const { rows: photos } = await pool.query(
      `SELECT pp.cloudinary_id FROM physique_photos pp
       JOIN physique_weeks pw ON pw.id = pp.week_id
       WHERE pp.week_id = $1 AND pw.user_id = $2`,
      [req.params.id, req.userId]
    );
    await Promise.all(photos.map(p => cloudinary.uploader.destroy(p.cloudinary_id)));
    await pool.query(
      'DELETE FROM physique_weeks WHERE id = $1 AND user_id = $2',
      [req.params.id, req.userId]
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/photos', async (req, res) => {
  const { week_id, photo_type, image_base64, media_type } = req.body;
  if (!week_id || !photo_type || !image_base64)
    return res.status(400).json({ error: 'week_id, photo_type, image_base64 required' });

  try {
    // Verify week belongs to user
    const { rows: own } = await pool.query(
      'SELECT id FROM physique_weeks WHERE id = $1 AND user_id = $2',
      [week_id, req.userId]
    );
    if (!own.length) return res.status(403).json({ error: 'Not authorized' });

    const { rows: existing } = await pool.query(
      'SELECT id, cloudinary_id FROM physique_photos WHERE week_id = $1 AND photo_type = $2',
      [week_id, photo_type]
    );
    if (existing.length) {
      await cloudinary.uploader.destroy(existing[0].cloudinary_id).catch(() => {});
    }

    const uploadResult = await cloudinary.uploader.upload(
      `data:${media_type || 'image/jpeg'};base64,${image_base64}`,
      {
        folder: 'caltrack/physique',
        transformation: [{ width: 1080, crop: 'limit', quality: 'auto' }],
      }
    );

    const { rows: [photo] } = await pool.query(`
      INSERT INTO physique_photos (week_id, photo_type, cloudinary_url, cloudinary_id)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (week_id, photo_type) DO UPDATE SET
        cloudinary_url = $3, cloudinary_id = $4
      RETURNING id, week_id, photo_type, cloudinary_url`,
      [week_id, photo_type, uploadResult.secure_url, uploadResult.public_id]
    );
    res.json(photo);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/photos/:id', async (req, res) => {
  try {
    const { rows: [photo] } = await pool.query(
      `SELECT pp.cloudinary_id FROM physique_photos pp
       JOIN physique_weeks pw ON pw.id = pp.week_id
       WHERE pp.id = $1 AND pw.user_id = $2`,
      [req.params.id, req.userId]
    );
    if (!photo) return res.status(404).json({ error: 'Not found' });
    await cloudinary.uploader.destroy(photo.cloudinary_id).catch(() => {});
    await pool.query('DELETE FROM physique_photos WHERE id = $1', [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
