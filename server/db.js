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

  CREATE TABLE IF NOT EXISTS exercises (
    id           SERIAL PRIMARY KEY,
    name         TEXT NOT NULL UNIQUE,
    muscle_group TEXT NOT NULL DEFAULT '',
    equipment    TEXT NOT NULL DEFAULT '',
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS workout_templates (
    id         SERIAL PRIMARY KEY,
    name       TEXT NOT NULL,
    notes      TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS workout_template_exercises (
    id            SERIAL PRIMARY KEY,
    template_id   INTEGER NOT NULL REFERENCES workout_templates(id) ON DELETE CASCADE,
    exercise_name TEXT NOT NULL,
    target_sets   INTEGER NOT NULL DEFAULT 3,
    target_reps   INTEGER NOT NULL DEFAULT 8,
    sort_order    INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS workout_sessions (
    id          SERIAL PRIMARY KEY,
    date        TEXT NOT NULL,
    name        TEXT NOT NULL DEFAULT 'Workout',
    started_at  TIMESTAMPTZ,
    finished_at TIMESTAMPTZ,
    notes       TEXT NOT NULL DEFAULT '',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS session_exercises (
    id            SERIAL PRIMARY KEY,
    session_id    INTEGER NOT NULL REFERENCES workout_sessions(id) ON DELETE CASCADE,
    exercise_name TEXT NOT NULL,
    sort_order    INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS session_sets (
    id                  SERIAL PRIMARY KEY,
    session_exercise_id INTEGER NOT NULL REFERENCES session_exercises(id) ON DELETE CASCADE,
    set_number          INTEGER NOT NULL DEFAULT 1,
    weight              REAL NOT NULL DEFAULT 0,
    reps                INTEGER NOT NULL DEFAULT 0,
    rpe                 REAL,
    completed_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS physique_weeks (
    id         SERIAL PRIMARY KEY,
    week_start TEXT NOT NULL UNIQUE,
    weight     REAL,
    body_fat   REAL,
    notes      TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS physique_photos (
    id             SERIAL PRIMARY KEY,
    week_id        INTEGER NOT NULL REFERENCES physique_weeks(id) ON DELETE CASCADE,
    photo_type     TEXT NOT NULL CHECK (photo_type IN ('front','side','back')),
    cloudinary_url TEXT NOT NULL,
    cloudinary_id  TEXT NOT NULL,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (week_id, photo_type)
  );

  INSERT INTO exercises (name, muscle_group, equipment)
  SELECT v.name, v.muscle_group, v.equipment
  FROM (VALUES
    ('Bench Press',       'chest',     'barbell'),
    ('Incline Bench Press','chest',    'barbell'),
    ('Push Ups',          'chest',     'bodyweight'),
    ('Pull Ups',          'back',      'bodyweight'),
    ('Lat Pulldown',      'back',      'cable'),
    ('Cable Row',         'back',      'cable'),
    ('Deadlift',          'back',      'barbell'),
    ('Overhead Press',    'shoulders', 'barbell'),
    ('Lateral Raise',     'shoulders', 'dumbbell'),
    ('Shoulder Press',    'shoulders', 'dumbbell'),
    ('Hammer Curl',       'biceps',    'dumbbell'),
    ('Bicep Curl',        'biceps',    'dumbbell'),
    ('Tricep Pushdown',   'triceps',   'cable'),
    ('Skull Crusher',     'triceps',   'barbell'),
    ('Squat',             'legs',      'barbell'),
    ('Romanian Deadlift', 'legs',      'barbell'),
    ('Leg Press',         'legs',      'machine'),
    ('Leg Curl',          'legs',      'machine'),
    ('Leg Extension',     'legs',      'machine'),
    ('Calf Raise',        'legs',      'machine'),
    ('Plank',             'core',      'bodyweight'),
    ('Running',           'cardio',    'bodyweight'),
    ('Cycling',           'cardio',    'machine')
  ) AS v(name, muscle_group, equipment)
  WHERE NOT EXISTS (SELECT 1 FROM exercises LIMIT 1)
  ON CONFLICT (name) DO NOTHING;

  ALTER TABLE meal_template_ingredients ADD COLUMN IF NOT EXISTS weight_unit TEXT NOT NULL DEFAULT 'g';
  ALTER TABLE recipe_ingredients ADD COLUMN IF NOT EXISTS weight_unit TEXT NOT NULL DEFAULT 'g';

  INSERT INTO exercises (name, muscle_group, equipment) VALUES
    ('Barbell Bench Press',              'chest',    'barbell'),
    ('Incline Barbell Bench Press',      'chest',    'barbell'),
    ('Decline Barbell Bench Press',      'chest',    'barbell'),
    ('Dumbbell Bench Press',             'chest',    'dumbbell'),
    ('Incline Dumbbell Bench Press',     'chest',    'dumbbell'),
    ('Decline Dumbbell Bench Press',     'chest',    'dumbbell'),
    ('Dumbbell Flyes',                   'chest',    'dumbbell'),
    ('Incline Dumbbell Flyes',           'chest',    'dumbbell'),
    ('Cable Flyes',                      'chest',    'cable'),
    ('Low-to-High Cable Flyes',          'chest',    'cable'),
    ('High-to-Low Cable Flyes',          'chest',    'cable'),
    ('Push Ups',                         'chest',    'bodyweight'),
    ('Wide Push Ups',                    'chest',    'bodyweight'),
    ('Diamond Push Ups',                 'chest',    'bodyweight'),
    ('Decline Push Ups',                 'chest',    'bodyweight'),
    ('Incline Push Ups',                 'chest',    'bodyweight'),
    ('Chest Dips',                       'chest',    'bodyweight'),
    ('Machine Chest Press',              'chest',    'machine'),
    ('Pec Deck',                         'chest',    'machine'),
    ('Smith Machine Bench Press',        'chest',    'machine'),
    ('Landmine Press',                   'chest',    'barbell'),
    ('Pull Ups',                         'back',     'bodyweight'),
    ('Chin Ups',                         'back',     'bodyweight'),
    ('Wide Grip Pull Ups',               'back',     'bodyweight'),
    ('Neutral Grip Pull Ups',            'back',     'bodyweight'),
    ('Barbell Deadlift',                 'back',     'barbell'),
    ('Romanian Deadlift',                'back',     'barbell'),
    ('Sumo Deadlift',                    'back',     'barbell'),
    ('Trap Bar Deadlift',                'back',     'barbell'),
    ('Barbell Row',                      'back',     'barbell'),
    ('Pendlay Row',                      'back',     'barbell'),
    ('Dumbbell Row',                     'back',     'dumbbell'),
    ('Single Arm Dumbbell Row',          'back',     'dumbbell'),
    ('T-Bar Row',                        'back',     'machine'),
    ('Seated Cable Row',                 'back',     'cable'),
    ('Wide Grip Cable Row',              'back',     'cable'),
    ('Lat Pulldown',                     'back',     'cable'),
    ('Wide Grip Lat Pulldown',           'back',     'cable'),
    ('Close Grip Lat Pulldown',          'back',     'cable'),
    ('Straight Arm Pulldown',            'back',     'cable'),
    ('Face Pull',                        'back',     'cable'),
    ('Barbell Shrug',                    'back',     'barbell'),
    ('Dumbbell Shrug',                   'back',     'dumbbell'),
    ('Good Morning',                     'back',     'barbell'),
    ('Back Extension',                   'back',     'bodyweight'),
    ('Rack Pull',                        'back',     'barbell'),
    ('Inverted Row',                     'back',     'bodyweight'),
    ('Meadows Row',                      'back',     'barbell'),
    ('Chest Supported Row',              'back',     'dumbbell'),
    ('Overhead Barbell Press',           'shoulders','barbell'),
    ('Seated Dumbbell Shoulder Press',   'shoulders','dumbbell'),
    ('Standing Dumbbell Shoulder Press', 'shoulders','dumbbell'),
    ('Arnold Press',                     'shoulders','dumbbell'),
    ('Lateral Raise',                    'shoulders','dumbbell'),
    ('Cable Lateral Raise',              'shoulders','cable'),
    ('Dumbbell Front Raise',             'shoulders','dumbbell'),
    ('Cable Front Raise',                'shoulders','cable'),
    ('Rear Delt Flyes',                  'shoulders','dumbbell'),
    ('Reverse Pec Deck',                 'shoulders','machine'),
    ('Upright Row',                      'shoulders','barbell'),
    ('Machine Shoulder Press',           'shoulders','machine'),
    ('Smith Machine Shoulder Press',     'shoulders','machine'),
    ('Landmine Lateral Raise',           'shoulders','barbell'),
    ('Barbell Curl',                     'biceps',   'barbell'),
    ('EZ Bar Curl',                      'biceps',   'barbell'),
    ('Dumbbell Curl',                    'biceps',   'dumbbell'),
    ('Alternating Dumbbell Curl',        'biceps',   'dumbbell'),
    ('Hammer Curl',                      'biceps',   'dumbbell'),
    ('Incline Dumbbell Curl',            'biceps',   'dumbbell'),
    ('Concentration Curl',               'biceps',   'dumbbell'),
    ('Preacher Curl',                    'biceps',   'barbell'),
    ('Cable Curl',                       'biceps',   'cable'),
    ('Rope Hammer Curl',                 'biceps',   'cable'),
    ('Reverse Curl',                     'biceps',   'barbell'),
    ('Zottman Curl',                     'biceps',   'dumbbell'),
    ('Spider Curl',                      'biceps',   'dumbbell'),
    ('21s',                              'biceps',   'barbell'),
    ('Close Grip Bench Press',           'triceps',  'barbell'),
    ('EZ Bar Skull Crusher',             'triceps',  'barbell'),
    ('Dumbbell Skull Crusher',           'triceps',  'dumbbell'),
    ('Tricep Pushdown (Bar)',            'triceps',  'cable'),
    ('Tricep Pushdown (Rope)',           'triceps',  'cable'),
    ('Overhead Tricep Extension (Dumbbell)', 'triceps', 'dumbbell'),
    ('Overhead Tricep Extension (Cable)',    'triceps', 'cable'),
    ('Overhead Tricep Extension (EZ Bar)',   'triceps', 'barbell'),
    ('Tricep Dips',                      'triceps',  'bodyweight'),
    ('Bench Dips',                       'triceps',  'bodyweight'),
    ('Tricep Kickback',                  'triceps',  'dumbbell'),
    ('JM Press',                         'triceps',  'barbell'),
    ('Barbell Back Squat',               'legs',     'barbell'),
    ('Barbell Front Squat',              'legs',     'barbell'),
    ('Goblet Squat',                     'legs',     'dumbbell'),
    ('Sumo Squat',                       'legs',     'barbell'),
    ('Bulgarian Split Squat',            'legs',     'dumbbell'),
    ('Stiff Leg Deadlift',               'legs',     'barbell'),
    ('Leg Press',                        'legs',     'machine'),
    ('Hack Squat',                       'legs',     'machine'),
    ('Leg Extension',                    'legs',     'machine'),
    ('Lying Leg Curl',                   'legs',     'machine'),
    ('Seated Leg Curl',                  'legs',     'machine'),
    ('Standing Leg Curl',                'legs',     'machine'),
    ('Standing Calf Raise',              'legs',     'bodyweight'),
    ('Seated Calf Raise',                'legs',     'machine'),
    ('Leg Press Calf Raise',             'legs',     'machine'),
    ('Walking Lunges',                   'legs',     'bodyweight'),
    ('Reverse Lunges',                   'legs',     'bodyweight'),
    ('Lateral Lunges',                   'legs',     'bodyweight'),
    ('Step Ups',                         'legs',     'bodyweight'),
    ('Hip Thrust',                       'legs',     'barbell'),
    ('Glute Bridge',                     'legs',     'bodyweight'),
    ('Cable Pull Through',               'legs',     'cable'),
    ('Hip Abduction Machine',            'legs',     'machine'),
    ('Hip Adduction Machine',            'legs',     'machine'),
    ('Nordic Curl',                      'legs',     'bodyweight'),
    ('Sissy Squat',                      'legs',     'bodyweight'),
    ('Smith Machine Squat',              'legs',     'machine'),
    ('Pistol Squat',                     'legs',     'bodyweight'),
    ('Box Squat',                        'legs',     'barbell'),
    ('Jump Squat',                       'legs',     'bodyweight'),
    ('Plank',                            'core',     'bodyweight'),
    ('Side Plank',                       'core',     'bodyweight'),
    ('Crunch',                           'core',     'bodyweight'),
    ('Bicycle Crunch',                   'core',     'bodyweight'),
    ('Reverse Crunch',                   'core',     'bodyweight'),
    ('Leg Raise',                        'core',     'bodyweight'),
    ('Hanging Leg Raise',                'core',     'bodyweight'),
    ('Hanging Knee Raise',               'core',     'bodyweight'),
    ('Ab Wheel Rollout',                 'core',     'other'),
    ('Cable Crunch',                     'core',     'cable'),
    ('Russian Twist',                    'core',     'bodyweight'),
    ('Dead Bug',                         'core',     'bodyweight'),
    ('Hollow Body Hold',                 'core',     'bodyweight'),
    ('Mountain Climber',                 'core',     'bodyweight'),
    ('Dragon Flag',                      'core',     'bodyweight'),
    ('V-Up',                             'core',     'bodyweight'),
    ('Oblique Crunch',                   'core',     'bodyweight'),
    ('Pallof Press',                     'core',     'cable'),
    ('Cable Woodchop',                   'core',     'cable'),
    ('Running (Treadmill)',              'cardio',   'machine'),
    ('Running (Outdoor)',                'cardio',   'bodyweight'),
    ('Cycling (Stationary)',             'cardio',   'machine'),
    ('Cycling (Outdoor)',                'cardio',   'bodyweight'),
    ('Rowing Machine',                   'cardio',   'machine'),
    ('Elliptical',                       'cardio',   'machine'),
    ('Stair Climber',                    'cardio',   'machine'),
    ('Jump Rope',                        'cardio',   'bodyweight'),
    ('Swimming',                         'cardio',   'bodyweight'),
    ('Battle Ropes',                     'cardio',   'other'),
    ('Burpees',                          'cardio',   'bodyweight'),
    ('High Knees',                       'cardio',   'bodyweight'),
    ('Jumping Jacks',                    'cardio',   'bodyweight'),
    ('Sprints',                          'cardio',   'bodyweight'),
    ('Box Jumps',                        'cardio',   'bodyweight'),
    ('Power Clean',                      'compound', 'barbell'),
    ('Hang Clean',                       'compound', 'barbell'),
    ('Clean and Press',                  'compound', 'barbell'),
    ('Thruster',                         'compound', 'barbell'),
    ('Kettlebell Swing',                 'compound', 'kettlebell'),
    ('Kettlebell Clean and Press',       'compound', 'kettlebell'),
    ('Turkish Get Up',                   'compound', 'kettlebell'),
    ('Farmer''s Walk',                   'compound', 'dumbbell'),
    ('Sled Push',                        'compound', 'other'),
    ('Sled Pull',                        'compound', 'other'),
    ('Medicine Ball Slam',               'compound', 'other'),
    ('Tire Flip',                        'compound', 'other')
  ON CONFLICT (name) DO NOTHING;
`).then(() => console.log('Database ready'))
  .catch(err => { console.error('Database init failed:', err.message || err.code || JSON.stringify(err), '| DATABASE_URL set:', !!process.env.DATABASE_URL); process.exit(1); });

module.exports = pool;
