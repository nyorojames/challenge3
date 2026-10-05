import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../../db/pool.js';
import { validateBody } from '../middleware/validate.js';
import { parseEntry } from '../providers/ai/index.js';
import { todayInKenya } from '../utils/dates.js';

const router = Router();

const parseSchema = z.object({
  text: z.string().trim().min(2, 'Type a sentence').max(500),
});

/**
 * POST /api/ai/parse { text }
 * Reads the sentence and SUGGESTS an entry. It never writes to the ledger:
 * the client saves the suggestion as a draft, and the shopkeeper confirms it.
 */
router.post('/parse', validateBody(parseSchema), async (req, res) => {
  const shopId = req.user.shopId;
  const [shop, customers, products] = await Promise.all([
    pool.query('SELECT name, language FROM shops WHERE id = $1', [shopId]),
    pool.query('SELECT id, name FROM customers WHERE shop_id = $1 ORDER BY name', [shopId]),
    pool.query('SELECT id, name, unit, price FROM products WHERE shop_id = $1 ORDER BY name', [shopId]),
  ]);

  const result = await parseEntry(req.body.text, {
    today: todayInKenya(),
    shopName: shop.rows[0]?.name,
    language: shop.rows[0]?.language,
    customers: customers.rows,
    products: products.rows,
  });

  res.json({ ...result, raw_input: req.body.text });
});

export default router;
