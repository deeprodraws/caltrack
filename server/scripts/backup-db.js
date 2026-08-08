'use strict';
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { Pool } = require('pg');
const fs   = require('fs');
const path = require('path');

const TABLES = [
  'users',
  'food_entries',
  'food_entry_ingredients',
  'daily_goals',
  'saved_foods',
  'food_portions',
  'weight_logs',
  'meal_templates',
  'meal_template_ingredients',
  'ingredient_memory',
  'recipes',
  'recipe_ingredients',
  'daily_metrics',
  'exercises',
  'workout_templates',
  'workout_template_exercises',
  'workout_sessions',
  'session_exercises',
  'session_sets',
  'physique_weeks',
  'physique_photos',
  'daily_reflections',
];

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL not set — add it to server/.env or export it first.');
    process.exit(1);
  }

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });

  console.log('Connected. Exporting tables...\n');

  const data = {};
  let totalRows = 0;

  for (const table of TABLES) {
    const { rows } = await pool.query(`SELECT * FROM "${table}" ORDER BY id`);
    data[table] = rows;
    totalRows += rows.length;
    console.log(`  ${table.padEnd(34)} ${rows.length} rows`);
  }

  await pool.end();

  const d = new Date();
  const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const backupsDir = path.join(__dirname, 'backups');
  fs.mkdirSync(backupsDir, { recursive: true });
  const outFile = path.join(backupsDir, `backup-${dateStr}.json`);
  fs.writeFileSync(outFile, JSON.stringify(data, null, 2), 'utf8');

  const sizeKB = Math.round(fs.statSync(outFile).size / 1024);
  console.log(`\n${'─'.repeat(46)}`);
  console.log(`Total rows : ${totalRows}`);
  console.log(`File size  : ${sizeKB} KB`);
  console.log(`Saved to   : ${outFile}`);
}

main().catch(err => { console.error('\nBackup failed:', err.message); process.exit(1); });
