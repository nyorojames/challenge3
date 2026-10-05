import { Router } from 'express';
import { z } from 'zod';
import { validateBody } from '../middleware/validate.js';
import { syncBatch } from '../services/sync.js';

const router = Router();

// Each transaction is checked one by one inside syncBatch, so a single bad
// entry is reported back instead of failing the whole batch.
const syncSchema = z.object({
  items: z
    .array(z.object({ transaction: z.record(z.unknown()), confirm: z.boolean().default(false) }))
    .max(200),
});

// POST /api/sync { items: [{ transaction, confirm }] } -> { results: [{ id, result, error? }] }
router.post('/', validateBody(syncSchema), async (req, res) => {
  const results = await syncBatch(req.user.shopId, req.user.id, req.body.items);
  res.json({ results, synced_at: new Date().toISOString() });
});

export default router;
