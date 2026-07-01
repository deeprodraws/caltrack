const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false,
});

pool.query(`
  CREATE TABLE IF NOT EXISTS food_entries (
    id        SERIAL PRIMARY KEY,
    date      TEXT NOT NULL,
    food_name TEXT NOT NULL,
    calories  REAL NOT NULL DEFAULT 0,
    protein   REAL NOT NULL DEFAULT 0,
    carbs     REAL NOT NULL DEFAULT 0,
    fat       REAL NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS daily_goals (
    id       INTEGER PRIMARY KEY,
    calories REAL NOT NULL DEFAULT 2000,
    protein  REAL NOT NULL DEFAULT 150,
    carbs    REAL NOT NULL DEFAULT 250,
    fat      REAL NOT NULL DEFAULT 65
  );

  INSERT INTO daily_goals (id, calories, protein, carbs, fat)
  VALUES (1, 2000, 150, 250, 65)
  ON CONFLICT (id) DO NOTHING;

  CREATE TABLE IF NOT EXISTS saved_foods (
    id           SERIAL PRIMARY KEY,
    name         TEXT NOT NULL,
    calories     REAL NOT NULL DEFAULT 0,
    protein      REAL NOT NULL DEFAULT 0,
    carbs        REAL NOT NULL DEFAULT 0,
    fat          REAL NOT NULL DEFAULT 0,
    serving_size REAL NOT NULL DEFAULT 1,
    serving_unit TEXT NOT NULL DEFAULT 'serving',
    tags         TEXT NOT NULL DEFAULT '',
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS weight_logs (
    id         SERIAL PRIMARY KEY,
    date       TEXT NOT NULL,
    weight     REAL NOT NULL,
    unit       TEXT NOT NULL DEFAULT 'kg',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  ALTER TABLE daily_goals ADD COLUMN IF NOT EXISTS weight_unit TEXT NOT NULL DEFAULT 'kg';

  CREATE TABLE IF NOT EXISTS meal_templates (
    id         SERIAL PRIMARY KEY,
    name       TEXT NOT NULL,
    meal_type  TEXT NOT NULL DEFAULT 'breakfast',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS meal_template_ingredients (
    id           SERIAL PRIMARY KEY,
    template_id  INTEGER NOT NULL REFERENCES meal_templates(id) ON DELETE CASCADE,
    food_name    TEXT NOT NULL,
    weight_grams REAL NOT NULL DEFAULT 0,
    calories     REAL NOT NULL DEFAULT 0,
    protein      REAL NOT NULL DEFAULT 0,
    carbs        REAL NOT NULL DEFAULT 0,
    fat          REAL NOT NULL DEFAULT 0,
    sort_order   INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS ingredient_memory (
    id                  SERIAL PRIMARY KEY,
    food_name           TEXT NOT NULL UNIQUE,
    typical_weight_grams REAL NOT NULL DEFAULT 0,
    use_count           INTEGER NOT NULL DEFAULT 1,
    last_used_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS recipes (
    id             SERIAL PRIMARY KEY,
    name           TEXT NOT NULL,
    total_servings REAL NOT NULL DEFAULT 1,
    notes          TEXT NOT NULL DEFAULT '',
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS recipe_ingredients (
    id           SERIAL PRIMARY KEY,
    recipe_id    INTEGER NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
    food_name    TEXT NOT NULL,
    weight_grams REAL NOT NULL DEFAULT 0,
    calories     REAL NOT NULL DEFAULT 0,
    protein      REAL NOT NULL DEFAULT 0,
    carbs        REAL NOT NULL DEFAULT 0,
    fat          REAL NOT NULL DEFAULT 0,
    sort_order   INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS daily_metrics (
    id          SERIAL PRIMARY KEY,
    date        TEXT NOT NULL UNIQUE,
    steps       INTEGER NOT NULL DEFAULT 0,
    water_ml    INTEGER NOT NULL DEFAULT 0,
    sleep_hours REAL NOT NULL DEFAULT 0,
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
`).then(() => console.log('Database ready'))
  .catch(err => { console.error('Database init failed:', err.message || err.code || JSON.stringify(err), '| DATABASE_URL set:', !!process.env.DATABASE_URL); process.exit(1); });

module.exports = pool;
