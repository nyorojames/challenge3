import { Router } from 'express';
import { z } from 'zod';
import { validateBody } from '../middleware/validate.js';
import { HttpError } from '../middleware/errors.js';
import {
  createTransaction,
  confirmTransaction,
  getTransaction,
  listTransactions,
  voidTransaction,
} from '../services/ledger.js';
import { dateSchema, shillingsSchema, uuidSchema } from './schemas.js';

const router = Router();

const TYPES = ['cash_sale', 'credit_sale', 'payment', 'expense', 'restock'];

const itemSchema = z.object({
  product_id: uuidSchema.nullable().default(null), // null = free-text item, no stock tracking
  description: z.string().trim().min(1).max(100),
  quantity: z.number().positive(),
  unit_price: shillingsSchema,
});

export const transactionSchema = z
  .object({
    id: uuidSchema, // generated on the device, so offline entries never collide
    type: z.enum(TYPES),
    customer_id: uuidSchema.nullable().default(null),
    amount: z.number().int('Use whole shillings').positive().optional(), // default: sum of items
    method: z.enum(['cash', 'mpesa', 'credit']).nullable().default(null),
    due_date: dateSchema.nullable().default(null),
    note: z.string().trim().max(500).nullable().default(null),
    raw_input: z.string().max(1000).nullable().default(null),
    // 'mpesa' is reserved for the M-Pesa callback; clients cannot claim it.
    source: z.enum(['manual', 'ai']).default('manual'),
    status: z.enum(['draft', 'confirmed']).default('confirmed'),
    items: z.array(itemSchema).max(50).default([]),
    // When it happened on the device (may be hours ago if it was offline).
    created_at: z.string().datetime({ offset: true }).default(() => new Date().toISOString()),
  })
  .superRefine((tx, ctx) => {
    const problem = (path, message) => ctx.addIssue({ code: z.ZodIssueCode.custom, path: [path], message });
    if (tx.amount === undefined && tx.items.length === 0) problem('amount', 'Give an amount or at least one item');
    if (['credit_sale', 'payment'].includes(tx.type) && !tx.customer_id) {
      problem('customer_id', 'A credit sale or payment needs a customer');
    }
    if (tx.type !== 'credit_sale' && tx.method === 'credit') problem('method', "Only a credit sale can use 'credit'");
    if (tx.type !== 'credit_sale' && tx.due_date) problem('due_date', 'Only a credit sale has a due date');
  })
  .transform((tx) => ({
    ...tx,
    // A credit sale is always method 'credit'; everything else defaults to cash.
    method: tx.type === 'credit_sale' ? 'credit' : (tx.method ?? 'cash'),
    // Rule: AI suggestions are ALWAYS saved as drafts. The shopkeeper confirms them.
    status: tx.source === 'ai' ? 'draft' : tx.status,
  }));

const listQuerySchema = z.object({
  customer_id: uuidSchema.optional(),
  type: z.enum(TYPES).optional(),
  status: z.enum(['draft', 'confirmed', 'void']).optional(),
  from: dateSchema.optional(),
  to: dateSchema.optional(),
  limit: z.coerce.number().int().min(1).max(500).default(50),
});

// GET /api/transactions?type=credit_sale&from=2026-10-01&to=2026-10-05&status=draft
router.get('/', async (req, res) => {
  const filters = listQuerySchema.parse(req.query);
  res.json(await listTransactions(req.user.shopId, filters));
});

router.get('/:id', async (req, res) => {
  const tx = await getTransaction(req.user.shopId, uuidSchema.parse(req.params.id));
  if (!tx) throw new HttpError(404, 'Transaction not found');
  res.json(tx);
});

// 201 = newly saved, 200 = this id was already saved (safe retry).
router.post('/', validateBody(transactionSchema), async (req, res) => {
  const { transaction, created } = await createTransaction(req.user.shopId, req.user.id, req.body);
  res.status(created ? 201 : 200).json(transaction);
});

router.post('/:id/confirm', async (req, res) => {
  res.json(await confirmTransaction(req.user.shopId, uuidSchema.parse(req.params.id)));
});

router.post('/:id/void', async (req, res) => {
  res.json(await voidTransaction(req.user.shopId, uuidSchema.parse(req.params.id)));
});

export default router;
