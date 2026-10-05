import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { pool, withTransaction } from '../../db/pool.js';
import { HttpError } from '../middleware/errors.js';
import { normalizePhone } from '../utils/phone.js';
import { payments } from '../providers/payments/index.js';

// ---------------------------------------------------------------------------
// 1. Ask the customer's phone for money (STK Push)
// ---------------------------------------------------------------------------

/**
 * Sends an STK Push and records a 'pending' row. The row is how we recognise the
 * callback later: Daraja's callback carries the same CheckoutRequestID.
 */
export async function requestPayment(shopId, { customerId, phone, amount }) {
  let customer = null;
  if (customerId) {
    const { rows } = await pool.query('SELECT id, name, phone FROM customers WHERE id = $1 AND shop_id = $2', [customerId, shopId]);
    customer = rows[0];
    if (!customer) throw new HttpError(404, 'Customer not found');
  }
  const payingPhone = normalizePhone(phone ?? customer?.phone);
  if (!payingPhone) throw new HttpError(400, 'This customer has no valid phone number');

  const response = await payments.stkPush({ phone: payingPhone, amount });
  if (response.ResponseCode !== '0') throw new HttpError(502, `M-Pesa refused: ${response.ResponseDescription}`);

  const { rows } = await pool.query(
    `INSERT INTO mpesa_payments (shop_id, customer_id, checkout_request_id, phone, amount, status)
     VALUES ($1, $2, $3, $4, $5, 'pending') RETURNING *`,
    [shopId, customer?.id ?? null, response.CheckoutRequestID, payingPhone, amount]
  );
  return { payment: rows[0], merchantRequestId: response.MerchantRequestID, customerMessage: response.CustomerMessage };
}

// ---------------------------------------------------------------------------
// 2. Handle Daraja's callback (the real thing, used by the mock too)
// ---------------------------------------------------------------------------

const callbackSchema = z.object({
  Body: z.object({
    stkCallback: z.object({
      MerchantRequestID: z.string(),
      CheckoutRequestID: z.string(),
      ResultCode: z.coerce.number(),
      ResultDesc: z.string(),
      CallbackMetadata: z
        .object({ Item: z.array(z.object({ Name: z.string(), Value: z.union([z.string(), z.number()]).optional() })) })
        .optional(),
    }),
  }),
});

// CallbackMetadata.Item is a list of { Name, Value } pairs; turn it into an object.
function readMetadata(stkCallback) {
  const items = stkCallback.CallbackMetadata?.Item ?? [];
  return Object.fromEntries(items.map((item) => [item.Name, item.Value]));
}

/**
 * Processes an STK callback. Safe to call any number of times with the same body.
 *
 * Why it is idempotent (a repeated callback never creates a second payment):
 *   - The pending row is locked with SELECT ... FOR UPDATE, so two copies of the same
 *     callback arriving at the same moment are handled one after the other.
 *   - Only a row that is still 'pending' is processed. The second copy finds
 *     'success' / 'failed' / 'unmatched' and just returns what happened the first time.
 *   - receipt_number is UNIQUE in the database: a last line of defence.
 *
 * Returns { outcome, payment, duplicate } where outcome is
 * 'success' | 'unmatched' | 'failed' | 'unknown_request'.
 */
export async function handleStkCallback(body) {
  const { stkCallback } = callbackSchema.parse(body).Body;

  return withTransaction(async (client) => {
    const { rows } = await client.query(
      'SELECT * FROM mpesa_payments WHERE checkout_request_id = $1 FOR UPDATE',
      [stkCallback.CheckoutRequestID]
    );
    const pending = rows[0];
    // A callback for a request we never made: nothing to update (we can't even
    // tell which shop it belongs to). Acknowledge it so Daraja stops retrying.
    if (!pending) return { outcome: 'unknown_request', payment: null, duplicate: false };
    if (pending.status !== 'pending') return { outcome: pending.status, payment: pending, duplicate: true };

    // Not paid: 1032 = cancelled by user, 1037 = phone unreachable, 2001 = wrong PIN, ...
    if (stkCallback.ResultCode !== 0) {
      const { rows: failed } = await client.query(
        `UPDATE mpesa_payments SET status = 'failed', raw_callback = $2 WHERE id = $1 RETURNING *`,
        [pending.id, body]
      );
      return { outcome: 'failed', payment: failed[0], duplicate: false };
    }

    const meta = readMetadata(stkCallback);
    const amount = Math.round(Number(meta.Amount));
    const receipt = String(meta.MpesaReceiptNumber);
    const phone = normalizePhone(meta.PhoneNumber) ?? pending.phone; // arrives as a number: 254722111001

    // Who paid? Match the paying phone to a customer of this shop.
    const { rows: matches } = await client.query(
      'SELECT id FROM customers WHERE shop_id = $1 AND phone = $2',
      [pending.shop_id, phone]
    );
    const customerId = matches[0]?.id ?? null;

    if (!customerId) {
      // Money arrived but we don't know whose debt it pays: park it for the shopkeeper.
      const { rows: parked } = await client.query(
        `UPDATE mpesa_payments
            SET status = 'unmatched', amount = $2, receipt_number = $3, phone = $4, raw_callback = $5
          WHERE id = $1 RETURNING *`,
        [pending.id, amount, receipt, phone, body]
      );
      return { outcome: 'unmatched', payment: parked[0], duplicate: false };
    }

    const transactionId = await insertMpesaPayment(client, pending.shop_id, customerId, amount, receipt);
    const { rows: done } = await client.query(
      `UPDATE mpesa_payments
          SET status = 'success', customer_id = $2, transaction_id = $3, amount = $4,
              receipt_number = $5, phone = $6, raw_callback = $7
        WHERE id = $1 RETURNING *`,
      [pending.id, customerId, transactionId, amount, receipt, phone, body]
    );
    return { outcome: 'success', payment: done[0], duplicate: false };
  });
}

// A confirmed 'payment' in the ledger, so the customer's balance drops at once.
// The server makes this id (there is no device involved), so randomUUID() here.
async function insertMpesaPayment(client, shopId, customerId, amount, receipt) {
  const id = randomUUID();
  await client.query(
    `INSERT INTO transactions (id, shop_id, customer_id, type, amount, method, note, source, status, created_at)
     VALUES ($1, $2, $3, 'payment', $4, 'mpesa', $5, 'mpesa', 'confirmed', now())`,
    [id, shopId, customerId, amount, `M-Pesa ${receipt}`]
  );
  return id;
}

// ---------------------------------------------------------------------------
// 3. The shopkeeper assigns an unmatched payment to a customer
// ---------------------------------------------------------------------------

export async function assignUnmatched(shopId, paymentId, customerId) {
  return withTransaction(async (client) => {
    const { rows } = await client.query(
      'SELECT * FROM mpesa_payments WHERE id = $1 AND shop_id = $2 FOR UPDATE',
      [paymentId, shopId]
    );
    const payment = rows[0];
    if (!payment) throw new HttpError(404, 'Payment not found');
    if (payment.status !== 'unmatched') throw new HttpError(409, `Payment is ${payment.status}, not unmatched`);

    const customer = await client.query('SELECT 1 FROM customers WHERE id = $1 AND shop_id = $2', [customerId, shopId]);
    if (customer.rowCount === 0) throw new HttpError(400, 'Customer not found in this shop');

    const transactionId = await insertMpesaPayment(client, shopId, customerId, payment.amount, payment.receipt_number);
    const { rows: done } = await client.query(
      `UPDATE mpesa_payments SET status = 'success', customer_id = $2, transaction_id = $3
        WHERE id = $1 RETURNING *`,
      [paymentId, customerId, transactionId]
    );
    return done[0];
  });
}
