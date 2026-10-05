# Decisions log

Short notes on the important choices and why. Newest phase at the bottom.

## Phase 0 — Setup

- **Repo root is the project** (no `duka-ledger/` subfolder). The repo exists only for this app.
- **`schema.sql` moved to `server/db/` with `git mv`** so its history is kept. The only
  change is the agreed `sms_messages` table.
- **Seed dates are relative to today** (`CURRENT_DATE - 13`, etc.), so the overdue
  customer is overdue whatever day we demo. The seed starts with
  `SET TIME ZONE 'Africa/Nairobi'` so "today" means today in Kenya, not UTC.
- **Fixed, readable UUIDs in the seed** (`a…` shop, `d…` customers, `e…` transactions).
  This makes rows easy to recognise and lets tests refer to known IDs.
- **Seed line items are written as (transaction, product name, qty)** and priced with a
  join to `products`, so line totals always add up. Checked with a query: 0 mismatches.
- **Demo login 0712345678 / duka1234.** Only the bcrypt hash is in `seed.sql`.
- **Phones stored as `254XXXXXXXXX`** (12 digits). M-Pesa callbacks use this format,
  so matching a payment to a customer is a plain string comparison.
- **The DB pool sets `timezone=Africa/Nairobi` on every connection.** Otherwise "today's
  sales" would depend on the laptop's or Docker's timezone.
- **pg returns NUMERIC as strings; we parse it to Number** in `pool.js`. This is safe
  because only quantities are NUMERIC. Money is INTEGER and never touches floats.
- **`db:reset` is a Node script, not `psql`**, so it works on Windows without `psql`
  on the PATH and reads `DATABASE_URL` from `.env`.
- **Express 5 instead of 4.** It forwards errors from `async` route handlers to the error
  middleware by itself, so we don't need a try/catch or a wrapper in every route.
- **`config.js` validates env vars with zod at startup.** A missing `JWT_SECRET` stops
  the server immediately with a clear message, not later with a confusing one.
- **Agreed for Phase 1: overdue uses FIFO in service code, not the view.** The view's
  `earliest_due` includes credit sales that were already paid off (seed customer Baba
  Otieno would wrongly show as overdue). Payments cover the oldest credit sales first.
  Overdue = the due date of the oldest sale not yet fully covered is in the past AND
  balance > 0.
