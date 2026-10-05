import pg from 'pg';
import { config } from '../src/config.js';

// pg returns NUMERIC (e.g. stock_qty) as strings to avoid precision loss.
// Our quantities are small (NUMERIC(10,2)), so converting to JS numbers is safe.
pg.types.setTypeParser(pg.types.builtins.NUMERIC, (value) => Number(value));
// SUM() and COUNT() return BIGINT, which pg also gives back as a string.
// Shop totals in KES are far below Number.MAX_SAFE_INTEGER, so Number is safe.
pg.types.setTypeParser(pg.types.builtins.INT8, (value) => Number(value));
// By default pg turns a DATE into a JS Date at local midnight, which can shift it
// by a day depending on the laptop's timezone. Keep due dates as 'YYYY-MM-DD' text.
pg.types.setTypeParser(pg.types.builtins.DATE, (value) => value);

// Every connection uses Kenyan time, so CURRENT_DATE and "today" in SQL
// match what the shopkeeper sees, regardless of the laptop's timezone.
export const pool = new pg.Pool({
  connectionString: config.DATABASE_URL,
  options: `-c timezone=${config.TIMEZONE}`,
});

// Runs fn(client) inside BEGIN/COMMIT; any error rolls everything back.
// Use it when several writes must succeed or fail together.
export async function withTransaction(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
