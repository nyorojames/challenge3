import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../../db/pool.js';
import { config } from '../config.js';
import { validateBody } from '../middleware/validate.js';
import { HttpError } from '../middleware/errors.js';
import { buildStkCallback } from '../providers/payments/mock.js';
import { isMockPayments } from '../providers/payments/index.js';
import { assignUnmatched, handleStkCallback, requestPayment } from '../services/mpesa.js';
import { phoneSchema, uuidSchema } from './schemas.js';

const router = Router();

/**
 * POST /api/mpesa/callback  (NO login: Safaricom's servers call this URL)
 * Always answers "Accepted" so Daraja does not keep retrying; problems are logged.
 * In production this URL would also be protected, e.g. a secret token in the path
 * and Safaricom's IP allow-list.
 */
export async function mpesaCallback(req, res) {
  try {
    const result = await handleStkCallback(req.body);
    console.log(`[mpesa] callback ${req.body?.Body?.stkCallback?.CheckoutRequestID}: ${result.outcome}${result.duplicate ? ' (duplicate ignored)' : ''}`);
  } catch (err) {
    console.error('[mpesa] bad callback:', err.message);
  }
  res.json({ ResultCode: 0, ResultDesc: 'Accepted' });
}

const stkPushSchema = z
  .object({
    customer_id: uuidSchema.optional(),
    phone: phoneSchema.optional(), // to ask a walk-in (not a customer) to pay
    amount: z.number().int('Use whole shillings').min(1).max(250000), // M-Pesa's single-payment limit
  })
  .refine((body) => body.customer_id || body.phone, { message: 'Give a customer or a phone number' });

// POST /api/mpesa/stk-push { customer_id | phone, amount }
router.post('/stk-push', validateBody(stkPushSchema), async (req, res) => {
  const { payment, customerMessage } = await requestPayment(req.user.shopId, {
    customerId: req.body.customer_id,
    phone: req.body.phone,
    amount: req.body.amount,
  });
  const shop = await pool.query('SELECT name FROM shops WHERE id = $1', [req.user.shopId]);
  res.status(201).json({
    checkout_request_id: payment.checkout_request_id,
    phone: payment.phone,
    amount: payment.amount,
    shop_name: shop.rows[0].name,
    customer_message: customerMessage,
  });
});

const simulateSchema = z.object({
  checkout_request_id: z.string().min(1),
  action: z.enum(['confirm', 'cancel']),
});

/**
 * POST /api/mpesa/simulate { checkout_request_id, action }
 * The PhoneSimulator's Confirm/Cancel. Builds the exact callback Daraja would send
 * and passes it to the SAME handler as /api/mpesa/callback.
 */
router.post('/simulate', validateBody(simulateSchema), async (req, res) => {
  if (!isMockPayments) throw new HttpError(404, 'Simulation is only available with the mock provider');
  const { rows } = await pool.query(
    'SELECT * FROM mpesa_payments WHERE checkout_request_id = $1 AND shop_id = $2',
    [req.body.checkout_request_id, req.user.shopId]
  );
  const pending = rows[0];
  if (!pending) throw new HttpError(404, 'Payment request not found');

  const callback = buildStkCallback({
    merchantRequestId: `sim-${pending.id.slice(0, 8)}`,
    checkoutRequestId: pending.checkout_request_id,
    confirmed: req.body.action === 'confirm',
    amount: pending.amount,
    phone: pending.phone,
  });
  const result = await handleStkCallback(callback);
  res.json({ ...result, callback });
});

// GET /api/mpesa/payments?status=unmatched
router.get('/payments', async (req, res) => {
  const status = z.enum(['pending', 'success', 'failed', 'unmatched']).optional().parse(req.query.status);
  const { rows } = await pool.query(
    `SELECT m.id, m.customer_id, c.name AS customer_name, m.transaction_id, m.checkout_request_id,
            m.phone, m.amount, m.receipt_number, m.status, m.created_at
       FROM mpesa_payments m
       LEFT JOIN customers c ON c.id = m.customer_id
      WHERE m.shop_id = $1 AND ($2::text IS NULL OR m.status = $2)
      ORDER BY m.created_at DESC
      LIMIT 100`,
    [req.user.shopId, status ?? null]
  );
  res.json(rows);
});

// POST /api/mpesa/payments/:id/assign { customer_id }: give an unmatched payment to a customer.
router.post('/payments/:id/assign', validateBody(z.object({ customer_id: uuidSchema })), async (req, res) => {
  res.json(await assignUnmatched(req.user.shopId, uuidSchema.parse(req.params.id), req.body.customer_id));
});

/**
 * POST /api/mpesa/resend-last  (development only)
 * Sends this shop's most recent processed callback through the handler AGAIN,
 * exactly like Daraja retrying. Demonstrates that no second payment is created.
 */
router.post('/resend-last', async (req, res) => {
  if (config.NODE_ENV === 'production') throw new HttpError(404, 'Not available in production');
  const { rows } = await pool.query(
    `SELECT raw_callback FROM mpesa_payments
      WHERE shop_id = $1 AND raw_callback IS NOT NULL
      ORDER BY created_at DESC LIMIT 1`,
    [req.user.shopId]
  );
  if (!rows[0]) throw new HttpError(404, 'No callback has been received yet');
  const result = await handleStkCallback(rows[0].raw_callback);
  res.json(result);
});

export default router;
