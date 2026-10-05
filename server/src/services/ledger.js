import { pool, withTransaction } from '../../db/pool.js';
import { HttpError } from '../middleware/errors.js';
import { todayInKenya, daysBetween } from '../utils/dates.js';
import { lineTotal, sumLineTotals } from '../utils/money.js';

// ---------------------------------------------------------------------------
// Overdue status (FIFO)
// ---------------------------------------------------------------------------

/**
 * Works out when a customer's debt is due, using FIFO: every shilling paid
 * goes to the OLDEST credit sale first.
 *
 * Example: sale A 1160 (due last month), sale B 368 (due next week), paid 1160.
 *   A is fully covered, B is not, so the customer's due date is B's -> not overdue.
 *   (The view's earliest_due would say "last month" -> wrongly overdue.)
 *
 * @param creditSales confirmed credit sales, OLDEST FIRST: [{ amount, due_date }]
 * @param totalPaid   sum of the customer's confirmed payments
 * @param today       'YYYY-MM-DD' in Kenya
 * @returns { due_date, overdue, days_overdue }
 */
export function computeDueStatus(creditSales, totalPaid, today) {
  let paymentsLeft = totalPaid;
  const uncoveredDueDates = [];

  for (const sale of creditSales) {
    if (paymentsLeft >= sale.amount) {
      paymentsLeft -= sale.amount; // this sale is fully paid; move to the next one
      continue;
    }
    paymentsLeft = 0; // this sale is partly or not paid; nothing left for later sales
    if (sale.due_date) uncoveredDueDates.push(sale.due_date);
  }

  const totalCredit = creditSales.reduce((sum, sale) => sum + sale.amount, 0);
  const balance = totalCredit - totalPaid;

  // Normally this is just the oldest uncovered sale's due date. Taking the earliest
  // also handles a sale with no due date ("atalipa baadaye") sitting before a dated
  // one. 'YYYY-MM-DD' strings sort in date order.
  const dueDate = uncoveredDueDates.sort()[0] ?? null;
  const overdue = balance > 0 && dueDate !== null && dueDate < today;

  return {
    due_date: dueDate,
    overdue,
    days_overdue: overdue ? daysBetween(dueDate, today) : 0,
  };
}

/**
 * Customers with balance (from the customer_balances view) and FIFO due status.
 * Pass customerId to get just one customer.
 */
export async function getCustomerSummaries(shopId, customerId = null) {
  const { rows: customers } = await pool.query(
    `SELECT c.id, c.name, c.phone, c.credit_limit, c.notes, c.created_at, b.balance
       FROM customers c
       JOIN customer_balances b ON b.customer_id = c.id
      WHERE c.shop_id = $1 AND ($2::uuid IS NULL OR c.id = $2)
      ORDER BY c.name`,
    [shopId, customerId]
  );

  const { rows: sales } = await pool.query(
    `SELECT customer_id, amount, due_date
       FROM transactions
      WHERE shop_id = $1 AND ($2::uuid IS NULL OR customer_id = $2)
        AND type = 'credit_sale' AND status = 'confirmed'
      ORDER BY created_at, id`,
    [shopId, customerId]
  );

  const { rows: payments } = await pool.query(
    `SELECT customer_id, SUM(amount) AS total_paid
       FROM transactions
      WHERE shop_id = $1 AND ($2::uuid IS NULL OR customer_id = $2)
        AND type = 'payment' AND status = 'confirmed'
      GROUP BY customer_id`,
    [shopId, customerId]
  );

  const salesByCustomer = {};
  for (const sale of sales) {
    (salesByCustomer[sale.customer_id] ??= []).push(sale);
  }
  const paidByCustomer = Object.fromEntries(payments.map((p) => [p.customer_id, p.total_paid]));

  const today = todayInKenya();
  return customers.map((customer) => ({
    ...customer,
    ...computeDueStatus(salesByCustomer[customer.id] ?? [], paidByCustomer[customer.id] ?? 0, today),
  }));
}

// ---------------------------------------------------------------------------
// Reading transactions
// ---------------------------------------------------------------------------

// Each transaction comes back with its line items as a JSON array.
const TRANSACTION_SELECT = `
  SELECT t.*, c.name AS customer_name,
         COALESCE(
           json_agg(json_build_object(
             'id', i.id, 'product_id', i.product_id, 'description', i.description,
             'quantity', i.quantity, 'unit_price', i.unit_price, 'line_total', i.line_total
           ) ORDER BY i.description) FILTER (WHERE i.id IS NOT NULL),
           '[]'
         ) AS items
    FROM transactions t
    LEFT JOIN customers c ON c.id = t.customer_id
    LEFT JOIN transaction_items i ON i.transaction_id = t.id`;

export async function getTransaction(shopId, id, db = pool) {
  const { rows } = await db.query(
    `${TRANSACTION_SELECT} WHERE t.shop_id = $1 AND t.id = $2 GROUP BY t.id, c.name`,
    [shopId, id]
  );
  return rows[0] ?? null;
}

export async function listTransactions(shopId, filters) {
  const { customer_id = null, type = null, status = null, from = null, to = null, limit } = filters;
  // `from`/`to` are Kenyan dates; the pool's timezone makes '2026-10-05'::date
  // mean midnight in Nairobi. `to` is inclusive, hence the + 1 day.
  const { rows } = await pool.query(
    `${TRANSACTION_SELECT}
      WHERE t.shop_id = $1
        AND ($2::uuid IS NULL OR t.customer_id = $2)
        AND ($3::text IS NULL OR t.type = $3)
        AND ($4::text IS NULL OR t.status = $4)
        AND ($5::date IS NULL OR t.created_at >= $5::date)
        AND ($6::date IS NULL OR t.created_at < $6::date + 1)
      GROUP BY t.id, c.name
      ORDER BY t.created_at DESC
      LIMIT $7`,
    [shopId, customer_id, type, status, from, to, limit]
  );
  return rows;
}

// ---------------------------------------------------------------------------
// Writing transactions
// ---------------------------------------------------------------------------

// Sales take goods out of the shop, restocks bring them in. Payments and
// expenses do not touch stock.
const STOCK_DIRECTION = { cash_sale: -1, credit_sale: -1, restock: +1, payment: 0, expense: 0 };

// direction = +1 to apply a transaction's stock effect, -1 to undo it (on void).
async function applyStockChange(client, shopId, type, items, direction) {
  const sign = STOCK_DIRECTION[type] * direction;
  if (sign === 0) return;
  for (const item of items) {
    if (!item.product_id) continue; // free-text items ("mandazi") have no stock
    await client.query(
      'UPDATE products SET stock_qty = stock_qty + $1 WHERE id = $2 AND shop_id = $3',
      [sign * item.quantity, item.product_id, shopId]
    );
  }
}

// The customer and products must belong to this shop, or a user could attach
// another shop's IDs to their own ledger.
async function assertBelongsToShop(client, shopId, customerId, items) {
  if (customerId) {
    const { rowCount } = await client.query(
      'SELECT 1 FROM customers WHERE id = $1 AND shop_id = $2',
      [customerId, shopId]
    );
    if (rowCount === 0) throw new HttpError(400, 'Customer not found in this shop');
  }
  const productIds = [...new Set(items.map((i) => i.product_id).filter(Boolean))];
  if (productIds.length > 0) {
    const { rowCount } = await client.query(
      'SELECT 1 FROM products WHERE id = ANY($1::uuid[]) AND shop_id = $2',
      [productIds, shopId]
    );
    if (rowCount !== productIds.length) throw new HttpError(400, 'Product not found in this shop');
  }
}

/**
 * Saves a transaction whose id was generated on the device.
 * Idempotent: sending the same id twice (e.g. an offline retry) inserts it once,
 * applies stock once, and returns the existing row with created = false.
 */
export async function createTransaction(shopId, userId, input) {
  const items = input.items.map((item) => ({
    ...item,
    line_total: lineTotal(item.quantity, item.unit_price),
  }));
  // If the amount is not given, it is the sum of the items. If it IS given it
  // wins (e.g. "nimeuza sukari kwa 300" after a discount).
  const amount = input.amount ?? sumLineTotals(items);
  if (!amount || amount <= 0) throw new HttpError(400, 'Amount must be more than 0');

  return withTransaction(async (client) => {
    await assertBelongsToShop(client, shopId, input.customer_id, items);

    const inserted = await client.query(
      `INSERT INTO transactions
         (id, shop_id, customer_id, type, amount, method, due_date, note, raw_input,
          source, status, created_by, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
       ON CONFLICT (id) DO NOTHING`,
      [
        input.id, shopId, input.customer_id, input.type, amount, input.method, input.due_date,
        input.note, input.raw_input, input.source, input.status, userId, input.created_at,
      ]
    );

    if (inserted.rowCount === 0) {
      // Already saved earlier. Return it, but only if it belongs to this shop.
      const existing = await getTransaction(shopId, input.id, client);
      if (!existing) throw new HttpError(409, 'Transaction id already used');
      return { transaction: existing, created: false };
    }

    for (const item of items) {
      await client.query(
        `INSERT INTO transaction_items
           (transaction_id, product_id, description, quantity, unit_price, line_total)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [input.id, item.product_id, item.description, item.quantity, item.unit_price, item.line_total]
      );
    }

    // Drafts (AI suggestions not yet confirmed) do not move stock.
    if (input.status === 'confirmed') {
      await applyStockChange(client, shopId, input.type, items, +1);
    }

    return { transaction: await getTransaction(shopId, input.id, client), created: true };
  });
}

/**
 * Replaces a DRAFT's contents with the shopkeeper's corrections (type, customer,
 * items, amount, ...). Confirmed entries cannot be edited, only voided, so the
 * ledger history stays honest. Drafts never moved stock, so no stock changes here.
 */
export async function updateDraft(shopId, id, input) {
  const items = input.items.map((item) => ({ ...item, line_total: lineTotal(item.quantity, item.unit_price) }));
  const amount = input.amount ?? sumLineTotals(items);
  if (!amount || amount <= 0) throw new HttpError(400, 'Amount must be more than 0');

  return withTransaction(async (client) => {
    const { rows } = await client.query(
      'SELECT status FROM transactions WHERE id = $1 AND shop_id = $2 FOR UPDATE',
      [id, shopId]
    );
    if (rows.length === 0) throw new HttpError(404, 'Transaction not found');
    if (rows[0].status !== 'draft') throw new HttpError(409, `Only a draft can be edited; this one is ${rows[0].status}`);

    await assertBelongsToShop(client, shopId, input.customer_id, items);
    await client.query(
      `UPDATE transactions
          SET type = $3, customer_id = $4, amount = $5, method = $6, due_date = $7, note = $8
        WHERE id = $1 AND shop_id = $2`,
      [id, shopId, input.type, input.customer_id, amount, input.method, input.due_date, input.note]
    );
    await client.query('DELETE FROM transaction_items WHERE transaction_id = $1', [id]);
    for (const item of items) {
      await client.query(
        `INSERT INTO transaction_items
           (transaction_id, product_id, description, quantity, unit_price, line_total)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [id, item.product_id, item.description, item.quantity, item.unit_price, item.line_total]
      );
    }
    return getTransaction(shopId, id, client);
  });
}

/** draft -> confirmed. This is the moment an AI suggestion enters the ledger. */
export async function confirmTransaction(shopId, id) {
  return withTransaction(async (client) => {
    const { rows } = await client.query(
      `UPDATE transactions SET status = 'confirmed'
        WHERE id = $1 AND shop_id = $2 AND status = 'draft'
        RETURNING type`,
      [id, shopId]
    );
    if (rows.length === 0) throw await explainStatusConflict(client, shopId, id, 'confirmed');

    const tx = await getTransaction(shopId, id, client);
    await applyStockChange(client, shopId, rows[0].type, tx.items, +1);
    return tx;
  });
}

/** draft or confirmed -> void. Mistakes are voided, never deleted, so history stays honest. */
export async function voidTransaction(shopId, id) {
  return withTransaction(async (client) => {
    // FOR UPDATE locks the row so two simultaneous voids cannot both undo the stock.
    const { rows } = await client.query(
      'SELECT status, type FROM transactions WHERE id = $1 AND shop_id = $2 FOR UPDATE',
      [id, shopId]
    );
    if (rows.length === 0) throw new HttpError(404, 'Transaction not found');
    const { status, type } = rows[0];
    if (status === 'void') throw new HttpError(409, 'Transaction is already void');

    await client.query("UPDATE transactions SET status = 'void' WHERE id = $1", [id]);
    const tx = await getTransaction(shopId, id, client);
    // Only a confirmed transaction moved stock, so only that needs undoing.
    if (status === 'confirmed') await applyStockChange(client, shopId, type, tx.items, -1);
    return tx;
  });
}

async function explainStatusConflict(client, shopId, id, target) {
  const { rows } = await client.query(
    'SELECT status FROM transactions WHERE id = $1 AND shop_id = $2',
    [id, shopId]
  );
  if (rows.length === 0) return new HttpError(404, 'Transaction not found');
  return new HttpError(409, `Only a draft can be ${target}; this one is ${rows[0].status}`);
}
