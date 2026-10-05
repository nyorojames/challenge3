import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../../db/pool.js';
import { validateBody } from '../middleware/validate.js';
import { HttpError } from '../middleware/errors.js';
import { updateShopRow } from '../utils/sql.js';
import { uuidSchema } from './schemas.js';

const router = Router();

const productSchema = z.object({
  name: z.string().trim().toLowerCase().min(1).max(100),
  unit: z.string().trim().min(1).max(20).default('pcs'),
  price: z.number().int('Use whole shillings').positive(),
  stock_qty: z.number().min(0).default(0),
  reorder_level: z.number().min(0).default(0),
  supplier_id: uuidSchema.nullable().optional(),
});
// For PATCH, drop the defaults so a missing field means "leave unchanged".
const productPatchSchema = productSchema
  .extend({ unit: z.string().trim().min(1).max(20), stock_qty: z.number().min(0), reorder_level: z.number().min(0) })
  .partial();

// low_stock is calculated, like balances: it is true when stock is BELOW the reorder level.
const PRODUCT_SELECT = `
  SELECT p.*, s.name AS supplier_name, (p.stock_qty < p.reorder_level) AS low_stock
    FROM products p
    LEFT JOIN suppliers s ON s.id = p.supplier_id`;

async function getProduct(shopId, id) {
  const { rows } = await pool.query(`${PRODUCT_SELECT} WHERE p.shop_id = $1 AND p.id = $2`, [shopId, id]);
  return rows[0];
}

async function assertSupplierInShop(shopId, supplierId) {
  if (!supplierId) return;
  const { rowCount } = await pool.query('SELECT 1 FROM suppliers WHERE id = $1 AND shop_id = $2', [supplierId, shopId]);
  if (rowCount === 0) throw new HttpError(400, 'Supplier not found in this shop');
}

// ?low_stock=true returns only products that need reordering.
router.get('/', async (req, res) => {
  const onlyLow = req.query.low_stock === 'true';
  const { rows } = await pool.query(
    `${PRODUCT_SELECT}
      WHERE p.shop_id = $1 AND (NOT $2 OR p.stock_qty < p.reorder_level)
      ORDER BY p.name`,
    [req.user.shopId, onlyLow]
  );
  res.json(rows);
});

router.post('/', validateBody(productSchema), async (req, res) => {
  const { name, unit, price, stock_qty, reorder_level, supplier_id } = req.body;
  await assertSupplierInShop(req.user.shopId, supplier_id);
  const { rows } = await pool.query(
    `INSERT INTO products (shop_id, supplier_id, name, unit, price, stock_qty, reorder_level)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
    [req.user.shopId, supplier_id ?? null, name, unit, price, stock_qty, reorder_level]
  );
  res.status(201).json(await getProduct(req.user.shopId, rows[0].id));
});

// Also used for manual stock corrections (e.g. after counting the shelf).
router.patch('/:id', validateBody(productPatchSchema), async (req, res) => {
  const id = uuidSchema.parse(req.params.id);
  await assertSupplierInShop(req.user.shopId, req.body.supplier_id);
  const found = await updateShopRow('products', req.user.shopId, id, req.body);
  if (!found) throw new HttpError(404, 'Product not found');
  res.json(await getProduct(req.user.shopId, id));
});

export default router;
