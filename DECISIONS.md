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

## Phase 1 — Backend core

- **Business rules live in `services/ledger.js`; routes stay thin.** A route validates
  input, calls SQL or the service, and returns JSON. FIFO, stock and the write paths can
  be read and tested in one place.
- **FIFO overdue is a pure function, `computeDueStatus(sales, totalPaid, today)`.** It
  takes plain data and returns plain data, so it is unit-tested without a database.
  Balance still comes from the `customer_balances` view, as required.
- **Refinement to the agreed rule: among the credit sales not yet covered, take the
  earliest due date.** This is the same as "the oldest uncovered sale's due date"
  except in one case: an older sale with no due date would otherwise hide a newer one
  that is past due. There is a test for this case.
- **"Today" is computed in Kenya time (`Intl` with `Africa/Nairobi`).** "Due today" is
  not overdue; it becomes overdue tomorrow.
- **pg type parsers:** DATE is kept as a `'YYYY-MM-DD'` string (the default JS Date
  can move a due date by a day), and BIGINT from SUM/COUNT becomes a Number.
- **`amount` is optional when items are sent (it becomes the sum of the line totals),
  but a given amount wins.** This allows a discounted price ("nimeuza kwa 300").
  Line totals are rounded once to whole shillings in `utils/money.js`.
- **Idempotent create: `INSERT … ON CONFLICT (id) DO NOTHING`, and stock moves only
  when the row was really inserted.** A retry returns 200 with the existing row; a new
  row returns 201. If the id belongs to another shop, the server returns 409 and leaks nothing.
- **The server forces `source: 'ai'` entries to `status: 'draft'`.** The rule "AI never
  writes to the ledger" holds even if a client sends the wrong status. Clients cannot
  claim `source: 'mpesa'`; only the M-Pesa callback can use it.
- **Stock moves only for confirmed transactions.** Sales subtract, restocks add, and voiding a
  confirmed entry reverses it. Drafts don't move stock until they are confirmed. Stock
  is allowed to go negative: a real sale must never be blocked because a restock wasn't recorded.
- **Mistakes are voided, never deleted.** History stays honest, and the customer page
  shows voided rows crossed out.
- **Customer and product IDs in a transaction are checked against the shop.** Without
  this, a user could put another shop's customer in their own ledger.
- **Simple profit = sales (cash + M-Pesa + credit) − expenses.** Payments are not
  counted (that would double count credit sales). Restock is shown separately as
  "stock bought" because it swaps cash for goods. Real margin needs cost prices (future work).
- **Draft editing is deferred to Phase 3**, where the confirm screen decides its exact shape.
- **Tests use the dev database inside a throwaway shop** that is deleted afterwards
  (`ON DELETE CASCADE`). No second database to set up before the deadline.
- **Zod stays on v3.** Zod 4's `.uuid()` only accepts RFC-versioned UUIDs and would
  reject our readable seed IDs such as `a0000000-…-0001`.

## Phase 2 — Frontend core

- **Vite proxies `/api` to Express** (dev and preview), so the client only calls
  relative URLs. There is no CORS to configure, and the same build works when served
  from the API's own origin.
- **No i18n library.** `sw.json` + `en.json` and a ~30-line `useT()` hook with `{name}`
  placeholders. A missing word falls back to English, then to the key, so it is easy to spot.
- **Language: Swahili by default; on the first login on a device it follows the shop's
  `language`.** After that, the user's last SW | EN choice is remembered, so switching
  to English for the presentation sticks across reloads.
- **SW | EN switch sits in the header on every page and on the login screen.**
- **No state library (Redux, React Query).** A tiny `useApi(path)` hook loads data and
  `reload()` refreshes it after a change. The server recalculates balances, so the
  client never does money math except to preview a form total.
- **Token and user/shop cached in `localStorage`.** A refresh, and later offline use,
  keeps you logged in. Trade-off: a script injected into the page (XSS) could read the
  token. Acceptable for a demo; an httpOnly cookie is the production answer.
- **A 401 from the API fires a `duka:session-expired` event and the app returns to login.**
- **Transaction IDs come from `lib/ids.js#newId()`.** `crypto.randomUUID()` only exists on
  https/localhost. If the app is opened on a phone via the laptop's Wi-Fi IP, it falls back
  to building a v4 UUID from `crypto.getRandomValues`.
- **One NewEntry form for all 5 types**; it shows only the fields a type needs (mirrors
  the server zod rules). Item price defaults to the selling price; for a restock it is
  left empty for the supplier cost. A "different total" field allows discounts.
- **After saving a credit sale or payment, the app opens that customer's page**, so the
  new balance is the first thing you see (good for the demo).
- **Mobile-first layout:** max width ~670px, bottom tab bar, big tap targets.
  Verified at 390×844 (a phone) with a Playwright script.
