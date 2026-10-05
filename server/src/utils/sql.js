import { pool } from '../../db/pool.js';

/**
 * UPDATE <table> SET <only the given fields> WHERE id = .. AND shop_id = ..
 * Used by PATCH routes, where the client sends only the fields it changed.
 *
 * Safe from SQL injection: `table` is a constant in our code and the column names
 * are the keys of a zod-validated body (zod strips unknown keys). All values go
 * in as $n parameters.
 *
 * Returns true if a row was updated (false = not found in this shop).
 */
export async function updateShopRow(table, shopId, id, fields) {
  const entries = Object.entries(fields).filter(([, value]) => value !== undefined);
  if (entries.length === 0) {
    const { rowCount } = await pool.query(`SELECT 1 FROM ${table} WHERE id = $1 AND shop_id = $2`, [id, shopId]);
    return rowCount > 0;
  }
  const setClause = entries.map(([column], i) => `${column} = $${i + 3}`).join(', ');
  const { rowCount } = await pool.query(
    `UPDATE ${table} SET ${setClause} WHERE id = $1 AND shop_id = $2`,
    [id, shopId, ...entries.map(([, value]) => value)]
  );
  return rowCount > 0;
}
