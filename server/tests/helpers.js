// Each test file gets its own throwaway shop, so tests never touch the demo data
// and can run against the same database you develop with.
import { randomUUID } from 'node:crypto';
import { pool } from '../db/pool.js';
import { signToken } from '../src/middleware/auth.js';

export async function createTestShop() {
  const shop = await pool.query(
    "INSERT INTO shops (name, language) VALUES ('Test Duka', 'en') RETURNING id"
  );
  const shopId = shop.rows[0].id;
  // users.phone is unique across all shops, so use a random number.
  const phone = `2547${String(Math.floor(Math.random() * 1e8)).padStart(8, '0')}`;
  const user = await pool.query(
    `INSERT INTO users (shop_id, name, phone, password_hash)
     VALUES ($1, 'Test Owner', $2, 'not-a-real-hash') RETURNING id, shop_id, role`,
    [shopId, phone]
  );
  return {
    shopId,
    auth: `Bearer ${signToken(user.rows[0])}`,
    // ON DELETE CASCADE removes the shop's users, customers, transactions, ...
    cleanup: () => pool.query('DELETE FROM shops WHERE id = $1', [shopId]),
  };
}

export const newId = () => randomUUID();

// 'YYYY-MM-DD' n days from today in Kenya (negative = in the past).
export function kenyaDate(offsetDays) {
  const date = new Date(Date.now() + offsetDays * 86_400_000);
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Nairobi' }).format(date);
}
