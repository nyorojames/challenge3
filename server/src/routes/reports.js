import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../../db/pool.js';
import { getCustomerSummaries } from '../services/ledger.js';
import { todayInKenya } from '../utils/dates.js';
import { dateSchema } from './schemas.js';

const router = Router();

/**
 * GET /api/reports/summary?date=YYYY-MM-DD   (default: today in Kenya)
 * Everything the dashboard needs in one request.
 *
 * Definitions (confirmed transactions only):
 *   sales          = cash sales (paid by cash or M-Pesa) + credit sales
 *   simple profit  = sales - expenses
 * Not counted in profit:
 *   payments  - money collected for a credit sale that was already counted as a sale
 *               (counting it again would double count)
 *   restock   - buying stock swaps cash for goods on the shelf; it is shown separately
 *               as "stock bought". We don't store cost prices, so real gross margin is future work.
 */
router.get('/summary', async (req, res) => {
  const { date } = z.object({ date: dateSchema.default(todayInKenya) }).parse(req.query);
  const shopId = req.user.shopId;

  // created_at is a timestamp; the pool's Nairobi timezone makes $2::date
  // mean "midnight in Kenya", so this is exactly one Kenyan day.
  const { rows } = await pool.query(
    `SELECT
       COALESCE(SUM(amount) FILTER (WHERE type = 'cash_sale' AND method = 'cash'),  0) AS cash_sales_cash,
       COALESCE(SUM(amount) FILTER (WHERE type = 'cash_sale' AND method = 'mpesa'), 0) AS cash_sales_mpesa,
       COALESCE(SUM(amount) FILTER (WHERE type = 'credit_sale'),                   0) AS credit_sales,
       COALESCE(SUM(amount) FILTER (WHERE type = 'payment'),                       0) AS payments_received,
       COALESCE(SUM(amount) FILTER (WHERE type = 'expense'),                       0) AS expenses,
       COALESCE(SUM(amount) FILTER (WHERE type = 'restock'),                       0) AS stock_bought,
       COUNT(*) AS transaction_count
     FROM transactions
     WHERE shop_id = $1 AND status = 'confirmed'
       AND created_at >= $2::date AND created_at < $2::date + 1`,
    [shopId, date]
  );
  const day = rows[0];

  const { rows: draftRows } = await pool.query(
    "SELECT COUNT(*) AS drafts FROM transactions WHERE shop_id = $1 AND status = 'draft'",
    [shopId]
  );
  const { rows: stockRows } = await pool.query(
    'SELECT COUNT(*) AS low_stock_count FROM products WHERE shop_id = $1 AND stock_qty < reorder_level',
    [shopId]
  );

  const customers = await getCustomerSummaries(shopId);
  const owing = customers.filter((c) => c.balance > 0);
  const overdue = customers.filter((c) => c.overdue);

  const cashSales = day.cash_sales_cash + day.cash_sales_mpesa;
  const totalSales = cashSales + day.credit_sales;

  res.json({
    date,
    sales: {
      cash: day.cash_sales_cash,
      mpesa: day.cash_sales_mpesa,
      credit: day.credit_sales,
      paid_now: cashSales, // cash + M-Pesa: money that came in with the sale
      total: totalSales,
    },
    payments_received: day.payments_received,
    expenses: day.expenses,
    stock_bought: day.stock_bought,
    simple_profit: totalSales - day.expenses,
    transaction_count: day.transaction_count,
    // These are "right now" figures, not limited to `date`.
    total_owed: owing.reduce((sum, c) => sum + c.balance, 0),
    customers_owing: owing.length,
    overdue_count: overdue.length,
    overdue_amount: overdue.reduce((sum, c) => sum + c.balance, 0),
    low_stock_count: stockRows[0].low_stock_count,
    draft_count: draftRows[0].drafts,
  });
});

export default router;
