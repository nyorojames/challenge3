// Wipes the database and reloads schema.sql + seed.sql.
// Usage: npm run db:reset   (uses DATABASE_URL from .env, no psql needed)
import { readFile } from 'node:fs/promises';
import { pool } from './pool.js';
import { config } from '../src/config.js';

if (config.NODE_ENV === 'production') {
  console.error('Refusing to reset a production database.');
  process.exit(1);
}

const schema = await readFile(new URL('./schema.sql', import.meta.url), 'utf8');
const seed = await readFile(new URL('./seed.sql', import.meta.url), 'utf8');

try {
  await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  await pool.query(schema);
  await pool.query(seed);
  const { rows } = await pool.query(
    'SELECT (SELECT count(*) FROM customers) AS customers, (SELECT count(*) FROM products) AS products'
  );
  console.log(`Database reset: ${rows[0].customers} customers, ${rows[0].products} products.`);
} catch (err) {
  console.error('Reset failed:', err.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
