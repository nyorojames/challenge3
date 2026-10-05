import { Router } from 'express';
import { pool } from '../../db/pool.js';
import { remindAllOverdue, remindCustomer } from '../services/reminders.js';
import { uuidSchema } from './schemas.js';

const router = Router();

// POST /api/sms/remind/:customerId  -> the message that was sent
router.post('/remind/:customerId', async (req, res) => {
  const message = await remindCustomer(req.user.shopId, uuidSchema.parse(req.params.customerId));
  res.status(201).json(message);
});

// POST /api/sms/remind-overdue  -> { sent: [...], skipped: [{ name, reason }] }
router.post('/remind-overdue', async (req, res) => {
  res.json(await remindAllOverdue(req.user.shopId));
});

// GET /api/sms/messages  -> the outbox, newest first
router.get('/messages', async (req, res) => {
  const { rows } = await pool.query(
    `SELECT m.*, c.name AS customer_name
       FROM sms_messages m
       LEFT JOIN customers c ON c.id = m.customer_id
      WHERE m.shop_id = $1
      ORDER BY m.created_at DESC
      LIMIT 200`,
    [req.user.shopId]
  );
  res.json(rows);
});

export default router;
