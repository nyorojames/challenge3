import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../../db/pool.js';
import { validateBody } from '../middleware/validate.js';
import { HttpError } from '../middleware/errors.js';
import { getCustomerSummaries, listTransactions } from '../services/ledger.js';
import { updateShopRow } from '../utils/sql.js';
import { optionalPhoneSchema, shillingsSchema, uuidSchema } from './schemas.js';

const router = Router();

const customerSchema = z.object({
  name: z.string().trim().min(1).max(100),
  phone: optionalPhoneSchema,
  credit_limit: shillingsSchema.nullable().optional(),
  notes: z.string().trim().max(500).nullable().optional(),
});

// Customers with balance, due date and overdue flag.
// ?overdue=true lists only overdue customers (used for "Remind all overdue").
router.get('/', async (req, res) => {
  let customers = await getCustomerSummaries(req.user.shopId);
  if (req.query.overdue === 'true') customers = customers.filter((c) => c.overdue);
  res.json(customers);
});

router.post('/', validateBody(customerSchema), async (req, res) => {
  const { name, phone, credit_limit, notes } = req.body;
  const { rows } = await pool.query(
    `INSERT INTO customers (shop_id, name, phone, credit_limit, notes)
     VALUES ($1, $2, $3, $4, $5) RETURNING id`,
    [req.user.shopId, name, phone, credit_limit ?? null, notes ?? null]
  );
  const [customer] = await getCustomerSummaries(req.user.shopId, rows[0].id);
  res.status(201).json(customer);
});

// One customer: balance, due status and full history (including voided entries,
// which the UI shows crossed out).
router.get('/:id', async (req, res) => {
  const id = uuidSchema.parse(req.params.id);
  const [customer] = await getCustomerSummaries(req.user.shopId, id);
  if (!customer) throw new HttpError(404, 'Customer not found');
  const history = await listTransactions(req.user.shopId, { customer_id: id, limit: 500 });
  res.json({ ...customer, history });
});

router.patch('/:id', validateBody(customerSchema.partial()), async (req, res) => {
  const id = uuidSchema.parse(req.params.id);
  const found = await updateShopRow('customers', req.user.shopId, id, req.body);
  if (!found) throw new HttpError(404, 'Customer not found');
  const [customer] = await getCustomerSummaries(req.user.shopId, id);
  res.json(customer);
});

export default router;
