import pg from 'pg';
import { config } from '../src/config.js';

// Every connection uses Kenyan time, so CURRENT_DATE and "today" in SQL
// match what the shopkeeper sees, regardless of the laptop's timezone.
export const pool = new pg.Pool({
  connectionString: config.DATABASE_URL,
  options: `-c timezone=${config.TIMEZONE}`,
});

// pg returns NUMERIC (e.g. stock_qty) as strings to avoid precision loss.
// Our quantities are small (NUMERIC(10,2)), so converting to JS numbers is safe.
// Money columns are INTEGER and already come back as numbers.
pg.types.setTypeParser(pg.types.builtins.NUMERIC, (value) => Number(value));
