import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../../db/pool.js';
import { validateBody } from '../middleware/validate.js';
import { HttpError } from '../middleware/errors.js';
import { updateShopRow } from '../utils/sql.js';
import { optionalPhoneSchema, uuidSchema } from './schemas.js';

const router = Router();

const supplierSchema = z.object({
  name: z.string().trim().min(1).max(100),
  phone: optionalPhoneSchema,
});

router.get('/', async (req, res) => {
  const { rows } = await pool.query(
    `SELECT s.*, COUNT(p.id) AS product_count
       FROM suppliers s
       LEFT JOIN products p ON p.supplier_id = s.id
      WHERE s.shop_id = $1
      GROUP BY s.id
      ORDER BY s.name`,
    [req.user.shopId]
  );
  res.json(rows);
});

router.post('/', validateBody(supplierSchema), async (req, res) => {
  const { rows } = await pool.query(
    'INSERT INTO suppliers (shop_id, name, phone) VALUES ($1, $2, $3) RETURNING *',
    [req.user.shopId, req.body.name, req.body.phone]
  );
  res.status(201).json(rows[0]);
});

router.patch('/:id', validateBody(supplierSchema.partial()), async (req, res) => {
  const id = uuidSchema.parse(req.params.id);
  const found = await updateShopRow('suppliers', req.user.shopId, id, req.body);
  if (!found) throw new HttpError(404, 'Supplier not found');
  const { rows } = await pool.query('SELECT * FROM suppliers WHERE id = $1', [id]);
  res.json(rows[0]);
});

export default router;
