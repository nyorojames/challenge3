import { Router } from 'express';
import { z } from 'zod';
import { validateBody } from '../middleware/validate.js';
import { HttpError } from '../middleware/errors.js';
import {
  createTransaction,
  confirmTransaction,
  getTransaction,
  listTransactions,
  updateDraft,
  voidTransaction,
} from '../services/ledger.js';
import { TRANSACTION_TYPES, dateSchema, transactionSchema, uuidSchema } from './schemas.js';

const router = Router();

const listQuerySchema = z.object({
  customer_id: uuidSchema.optional(),
  type: z.enum(TRANSACTION_TYPES).optional(),
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

// Edit a draft (e.g. the shopkeeper corrects what the AI understood).
// Same rules as creating one; the id comes from the URL.
router.put('/:id', async (req, res) => {
  const id = uuidSchema.parse(req.params.id);
  const input = transactionSchema.parse({ ...req.body, id });
  res.json(await updateDraft(req.user.shopId, id, input));
});

router.post('/:id/confirm', async (req, res) => {
  res.json(await confirmTransaction(req.user.shopId, uuidSchema.parse(req.params.id)));
});

router.post('/:id/void', async (req, res) => {
  res.json(await voidTransaction(req.user.shopId, uuidSchema.parse(req.params.id)));
});

export default router;
