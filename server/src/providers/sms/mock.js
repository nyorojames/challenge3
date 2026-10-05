// Mock SMS gateway. A real one (Africa's Talking) would POST to its API here.
// The mock "delivers" by writing the message into sms_messages, which the
// SMS Outbox page shows like a phone's message list.
import { pool } from '../../../db/pool.js';

export async function sendSms({ shopId, customerId, phone, body, purpose }) {
  const { rows } = await pool.query(
    `INSERT INTO sms_messages (shop_id, customer_id, phone, body, purpose, status, provider)
     VALUES ($1, $2, $3, $4, $5, 'sent', 'mock') RETURNING *`,
    [shopId, customerId, phone, body, purpose]
  );
  return rows[0];
}
