# Duka Ledger — project context for Claude

AI bookkeeper for Kenyan dukas (small informal shops). Localized clone of **Rational**
(YC S26, "an accounting firm run by AI employees"). University SE course project; the
student must understand and defend every line, so **readable over clever, no needless
abstractions, explain decisions**.

## Hard constraints
- Deadline-driven: a working demo beats completeness. Flag anything that risks it.
- **$0**: no paid APIs/hosting. **Never add the Anthropic SDK** or any paid provider.
- M-Pesa and SMS are **mock providers** shaped like the real APIs (Daraja, Africa's Talking).
- **The demo must never break** because of AI or internet: always a fallback
  (AI → `rules` parser; offline → IndexedDB outbox).

## Working agreement
- Work in **phases**; stop after each, summarize (built / files / how to run / what to
  understand), wait for approval. Update `DECISIONS.md` (1–3 lines per decision).
- Comment only non-obvious logic (M-Pesa callback, sync, balances, rules parser).
- Ask when ambiguous. Never commit secrets (`.env` is gitignored; keep `.env.example` current).

## Phases
0 Setup ✅ · 1 Backend core (built, awaiting approval) · 2 Frontend core · 3 AI entry · 4 Mock M-Pesa + SMS ·
5 Offline + demo polish. (Update the ✅ as phases are approved.)

## Stack
- `server/`: Node 22, Express 5, ES modules, `pg` with **plain SQL (no ORM)**, zod,
  bcrypt + JWT (phone + password), Vitest + Supertest.
- `client/`: React 19, Vite, Tailwind v4 (`@tailwindcss/vite`), vite-plugin-pwa,
  Dexie (IndexedDB) outbox.
- Postgres 16 via `docker-compose.yml` (or a local install).

## Database rules (do not change without asking the user)
- `server/db/schema.sql` is the source of truth. Only addition so far: `sms_messages`.
  Any other schema change → propose and wait.
- **Balances are never stored**: `customer_balances` view = confirmed credit_sale −
  confirmed payment. Void/draft rows never count.
- **Overdue rule (FIFO, done in service code, not schema):** payments cover the
  oldest credit sales first; the customer's due date is that of the oldest credit sale
  not yet fully covered. Overdue = that date < today (Nairobi) AND balance > 0.
  Don't use the view's `earliest_due` for overdue — it ignores paid-off sales.
- **Transaction IDs are client-generated UUIDs**; server inserts with
  `ON CONFLICT (id) DO NOTHING` (offline-safe, idempotent sync).
- **Money = INTEGER KES.** Never floats. Quantities are NUMERIC (pool parses to Number).
- `created_at` = when it happened on the device; `synced_at` = when the server got it.
- **Every query is scoped by `shop_id`** from the JWT.
- AI-parsed entries are saved as `status='draft'` and only become `confirmed` after
  the shopkeeper confirms. The AI never silently writes to the ledger.
- Phones are stored normalized as `254XXXXXXXXX` (accept `07…`, `01…`, `+254…`).
- Timezone is **Africa/Nairobi** everywhere (pool sets it per connection).

## Commands
- `docker compose up -d` — Postgres; first start auto-runs schema + seed.
- `cd server && npm run db:reset` — wipe and reload schema + seed (reads `.env`).
- `cd server && npm run dev` / `npm test`.
- `cd client && npm run dev`.
- Demo login: **0712345678 / duka1234** (shop "Duka la Mama Njeri", language `sw`).

## Seed data cheat-sheet (dates relative to today)
UUID prefixes: `a…` shop/user, `b…` suppliers, `c…` products, `d…` customers, `e…` transactions.
- Mama Wanjiku — 500 owed, due 13 days ago → **overdue** (SMS/M-Pesa demo target)
- Baba Otieno — old debt paid in full, new 368 due in 3 days → **not overdue** (FIFO case)
- Mzee Kamau 1020 (partial M-Pesa), Akinyi 0 (paid), Mwalimu Njoroge 285 (+ a void
  2850 typo), Kevo 185 (AI entry, no due date), Chebet 365 (due today), Fatuma 0.
- Low stock: maziwa, mkate. One `unmatched` M-Pesa payment from 254700999888.

## Code map (server)
- `services/ledger.js` — FIFO `computeDueStatus`, `getCustomerSummaries`, create/confirm/void
  transactions (stock effects, idempotency). Business rules go here, not in routes.
- `routes/*.js` — thin: zod-validate, call SQL/service, return JSON. Shared zod pieces in
  `routes/schemas.js`. PATCH routes use `utils/sql.js#updateShopRow`.
- Errors: `throw new HttpError(status, msg)`; Express 5 forwards async errors to
  `middleware/errors.js` (also maps ZodError → 400, pg 23505 → 409).
- Tests: `tests/helpers.js#createTestShop()` makes an isolated shop + token; clean up after.
