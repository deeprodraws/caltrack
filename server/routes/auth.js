'use strict';
const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const pool = require('../db');
const requireAuth = require('../middleware/auth');

function makeToken(user) {
  return jwt.sign(
    { userId: user.id, email: user.email },
    process.env.JWT_SECRET,
    { expiresIn: '30d' }
  );
}

// POST /api/auth/signup
router.post('/signup', async (req, res) => {
  const { email, password, display_name = '' } = req.body;
  if (!email?.trim() || !password || password.length < 6) {
    return res.status(400).json({ error: 'Email and password (min 6 chars) required' });
  }
  try {
    const { rows: existing } = await pool.query(
      'SELECT id FROM users WHERE email = $1', [email.trim().toLowerCase()]
    );
    if (existing.length) {
      return res.status(400).json({ error: 'Email already registered' });
    }
    const hash = await bcrypt.hash(password, 10);
    const { rows: [user] } = await pool.query(
      `INSERT INTO users (email, password_hash, display_name)
       VALUES ($1, $2, $3) RETURNING id, email, display_name, created_at`,
      [email.trim().toLowerCase(), hash, display_name.trim()]
    );
    // Create default goals row for new user
    await pool.query(
      `INSERT INTO daily_goals (user_id, calories, protein, carbs, fat, weight_unit)
       VALUES ($1, 2000, 150, 250, 65, 'lbs')
       ON CONFLICT (user_id) DO NOTHING`,
      [user.id]
    );
    res.json({ token: makeToken(user), user });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password required' });
  }
  try {
    const { rows: [user] } = await pool.query(
      'SELECT * FROM users WHERE email = $1', [email.trim().toLowerCase()]
    );
    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }
    if (user.password_hash === 'MIGRATED_NO_LOGIN') {
      return res.status(401).json({ error: 'Sign up with your email to claim this account\'s data.' });
    }
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }
    res.json({
      token: makeToken(user),
      user: { id: user.id, email: user.email, display_name: user.display_name, created_at: user.created_at },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/auth/me  (protected)
router.get('/me', requireAuth, async (req, res) => {
  try {
    const { rows: [user] } = await pool.query(
      'SELECT id, email, display_name, created_at FROM users WHERE id = $1', [req.userId]
    );
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/auth/me  (protected)
router.put('/me', requireAuth, async (req, res) => {
  const { display_name, current_password, new_password } = req.body;
  try {
    const { rows: [user] } = await pool.query('SELECT * FROM users WHERE id = $1', [req.userId]);
    if (!user) return res.status(404).json({ error: 'User not found' });

    let updates = {};

    if (display_name !== undefined) {
      updates.display_name = display_name.trim();
    }

    if (new_password) {
      if (!current_password) {
        return res.status(400).json({ error: 'Current password required to set new password' });
      }
      const valid = await bcrypt.compare(current_password, user.password_hash);
      if (!valid) {
        return res.status(400).json({ error: 'Current password is incorrect' });
      }
      if (new_password.length < 6) {
        return res.status(400).json({ error: 'New password must be at least 6 characters' });
      }
      updates.password_hash = await bcrypt.hash(new_password, 10);
    }

    if (!Object.keys(updates).length) {
      return res.json({ id: user.id, email: user.email, display_name: user.display_name, created_at: user.created_at });
    }

    const sets = Object.keys(updates).map((k, i) => `${k} = $${i + 2}`).join(', ');
    const vals = [req.userId, ...Object.values(updates)];
    const { rows: [updated] } = await pool.query(
      `UPDATE users SET ${sets} WHERE id = $1 RETURNING id, email, display_name, created_at`,
      vals
    );
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/auth/migrate-legacy-data  (protected)
// Copies all rows owned by the default migration user to the calling user
router.post('/migrate-legacy-data', requireAuth, async (req, res) => {
  try {
    const { rows: [defaultUser] } = await pool.query(
      "SELECT id FROM users WHERE email = 'default@caltrack.app'"
    );
    if (!defaultUser) {
      return res.status(400).json({ error: 'No legacy data found to migrate' });
    }

    // Check if calling user already has any data
    const { rows: [existing] } = await pool.query(
      'SELECT COUNT(*) AS cnt FROM food_entries WHERE user_id = $1', [req.userId]
    );
    if (parseInt(existing.cnt) > 0) {
      return res.status(400).json({ error: 'You already have data — migration not needed' });
    }

    const defaultId = defaultUser.id;
    const myId = req.userId;

    const tables = [
      'food_entries', 'saved_foods', 'weight_logs', 'meal_templates',
      'recipes', 'daily_metrics', 'workout_templates', 'workout_sessions',
      'physique_weeks', 'ingredient_memory',
    ];

    const counts = {};
    for (const t of tables) {
      const { rowCount } = await pool.query(
        `UPDATE "${t}" SET user_id = $1 WHERE user_id = $2`,
        [myId, defaultId]
      );
      counts[t] = rowCount;
    }

    // Migrate daily_goals (upsert — user may already have default goals)
    const { rowCount: goalsMigrated } = await pool.query(
      `UPDATE daily_goals SET user_id = $1 WHERE user_id = $2`,
      [myId, defaultId]
    );
    counts.daily_goals = goalsMigrated;

    res.json({ migrated: counts });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
