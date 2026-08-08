'use strict';
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { Pool } = require('pg');
const fs   = require('fs');
const path = require('path');

// Parents must come before their children so FK constraints aren't violated
const RESTORE_ORDER = [
  'users',
  'exercises',
  'daily_goals',
  'saved_foods',
  'food_portions',
  'weight_logs',
  'food_entries',
  'food_entry_ingredients',
  'ingredient_memory',
  'daily_metrics',
  'meal_templates',
  'recipes',
  'physique_weeks',
  'workout_templates',
  'meal_template_ingredients',
  'recipe_ingredients',
  'physique_photos',
  'workout_sessions',
  'workout_template_exercises',
  'session_exercises',
  'session_sets',
  'daily_reflections',
];

function pickBackupFile(arg) {
  if (arg) return path.resolve(arg);
  const dir = path.join(__dirname, 'backups');
  if (!fs.existsSync(dir)) {
    console.error('No backups/ directory found. Run "npm run backup" first.');
    process.exit(1);
  }
  const files = fs.readdirSync(dir)
    .filter(f => f.startsWith('backup-') && f.endsWith('.json'))
    .sort();
  if (!files.length) {
    console.error('No backup files found in', dir);
    process.exit(1);
  }
  return path.join(dir, files[files.length - 1]); // most recent
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL not set — add it to server/.env or export it first.');
    process.exit(1);
  }

  const backupFile = pickBackupFile(process.argv[2]);
  const stat = fs.statSync(backupFile);
  console.log(`Backup file : ${backupFile}`);
  console.log(`File size   : ${Math.round(stat.size / 1024)} KB`);
  console.log('\n⚠  This will WIPE all existing data and replace it with the backup.');
  console.log('   Press Ctrl+C within 5 seconds to cancel...\n');
  await new Promise(r => setTimeout(r, 5000));

  const data = JSON.parse(fs.readFileSync(backupFile, 'utf8'));

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Truncate everything in one shot — CASCADE handles FK order automatically
    const allTables = RESTORE_ORDER.map(t => `"${t}"`).join(', ');
    await client.query(`TRUNCATE ${allTables} RESTART IDENTITY CASCADE`);
    console.log('Cleared all tables.\n');

    let totalRows = 0;

    for (const table of RESTORE_ORDER) {
      const rows = data[table] || [];
      if (rows.length === 0) {
        console.log(`  ${table.padEnd(34)} 0 rows`);
        continue;
      }

      const cols = Object.keys(rows[0]);
      const colList     = cols.map(c => `"${c}"`).join(', ');
      const placeholders = cols.map((_, i) => `$${i + 1}`).join(', ');
      const sql = `INSERT INTO "${table}" (${colList}) VALUES (${placeholders})`;

      for (const row of rows) {
        await client.query(sql, cols.map(c => row[c]));
      }

      // Reset the sequence so future auto-inserts get the right next id
      await client.query(`
        DO $$ BEGIN
          IF pg_get_serial_sequence('${table}', 'id') IS NOT NULL THEN
            PERFORM setval(
              pg_get_serial_sequence('${table}', 'id'),
              COALESCE((SELECT MAX(id) FROM "${table}"), 1)
            );
          END IF;
        END $$
      `);

      totalRows += rows.length;
      console.log(`  ${table.padEnd(34)} ${rows.length} rows`);
    }

    await client.query('COMMIT');

    console.log(`\n${'─'.repeat(46)}`);
    console.log(`Total rows restored : ${totalRows}`);
    console.log('Restore complete.');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(err => { console.error('\nRestore failed:', err.message); process.exit(1); });
