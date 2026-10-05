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

## Phase 3 — AI entry (the "Rational clone")

- **Every provider goes extract → validate (zod) → ground.** The LLM or rules parser
  only says what the sentence means. `groundEntry` (match.js) then maps names to real
  customer/product IDs, applies OUR price list and computes the amount. An LLM cannot
  invent an ID, a price or a customer; there is a test with an invented ID.
- **Fallback is one try/catch in `providers/ai/index.js`.** Error, HTTP 429/404,
  >5 s (`AbortSignal.timeout`), non-JSON, wrong shape or a dropped connection all
  lead to the rules parser plus `basic_mode: true`. Tested against a fake local Gemini/Ollama
  server that misbehaves on purpose (no internet needed for the tests).
- **The rules parser and `match.js` are pure (no config, no Node APIs)**, so the
  browser can run them offline in Phase 5.
- **Rules parser design:** find the first verb (amechukua/took → credit, amelipa/paid →
  payment, nimeuza/sold → cash sale, nimelipa/spent → expense, nimenunua/bought →
  restock). Text before the verb = the customer. "paid" with nobody before it = the shop
  paying = expense. After the verb: due-date clause ("atalipa …"), method words, total
  ("kwa 300"), then items split on na/and/commas, plus run-on items ("sukari 2kg mafuta 1").
- **Localization in the parser:** Swahili number words (mbili, nusu), Sheng money (soo
  tatu = 300, thao = 1000), Swahili weekdays, kesho/keshokutwa/wiki ijayo/mwisho wa
  mwezi/tarehe 15, plurals (mikate → mkate), English synonyms (sugar → sukari),
  "mafuta ya taa" = paraffin (longest product name wins over "mafuta").
- **Fuzzy customer matching ignores titles** (Mama/Baba/Mzee) unless the title is the only
  word, and uses edit distance for typos ("Wanjku"). **Two equally good matches = no
  guess**: the shopkeeper picks. Below 0.8 similarity = a new customer.
- **A weekday means the NEXT one** ("atalipa Ijumaa" said on a Friday = next Friday).
- **Grounding caps confidence:** unknown item ≤ 0.5, missing customer ≤ 0.6,
  no amount ≤ 0.4. The rules parser reports 0.7 at best (it is honest about being basic).
- **Draft flow:** `/api/ai/parse` never writes. If the result is complete, the client saves
  it right away as a draft (`source: 'ai'`, `raw_input` kept). Otherwise (new customer,
  unpriced item) it is saved when the shopkeeper confirms. Confirm = PUT the edits →
  POST confirm. Discard = void. Unfinished drafts are listed and linked from the dashboard.
- **`PUT /api/transactions/:id` edits drafts only** (409 once confirmed). Same zod rules
  as create; items are replaced; no stock change (drafts never moved stock).
- **The review screen IS the manual form** (`EntryForm`, pre-filled), so manual and AI
  entries go through exactly the same fields and checks.
- **Gemini key goes in the `x-goog-api-key` header, not `?key=`**, so it never appears in logged URLs.
- **The prompt asks for `unit_price: null` on sales**: prices always come from the database.
- **`basic_mode` is shown whenever the rules parser answered**, both when chosen in .env and as a fallback.
  The badge's tooltip gives the reason ("ollama: could not connect").
- **Default Gemini model is `gemini-flash-lite-latest`** (tested live with a real key in Phase 4).
  `gemini-2.5-flash` is retired for new keys (404). On the free tier the bigger Flash models
  answered 503 "high demand" or 429 "quota". Flash-Lite answered in ~1 s and parsed every
  test sentence correctly. A "-latest" alias doesn't get retired.

## Phase 4 — Mock M-Pesa + mock SMS

- **The callback handler (`services/mpesa.js#handleStkCallback`) is real; only the sender is
  mocked.** `/api/mpesa/simulate` builds Daraja's exact STK callback JSON
  (ResultCode 0 + CallbackMetadata, or 1032) and calls the same function as
  `POST /api/mpesa/callback`. Swapping in real Daraja only means a new `stkPush` adapter.
- **Idempotency in three layers:** `SELECT … FOR UPDATE` on the pending row (two copies arriving
  at once are handled one after the other), only `pending` rows are processed (a repeat returns
  `duplicate: true`), and `receipt_number UNIQUE` in the schema as a last line of defence.
  Tested with 1 retry, 3 simultaneous copies and the "resend last" button.
- **The customer is matched by the PAYING phone in the callback** (normalized `2547…`),
  as the spec says, not by whom we asked. No match → `unmatched`, money parked, with
  no ledger entry until the shopkeeper assigns it (assign is also locked and only works once).
- **The callback route has no login** (Safaricom calls it) and always answers
  `{ResultCode: 0, ResultDesc: 'Accepted'}` so Daraja stops retrying. Unknown
  CheckoutRequestIDs are acknowledged and ignored. Production would add a secret URL token
  and Safaricom's IP allow-list (noted in the code).
- **An M-Pesa payment becomes a `confirmed` ledger entry with `source: 'mpesa'`** and a
  server-made UUID (no device involved), so the balance drops immediately.
- **STK push can target a customer or a plain phone number.** Asking a walk-in to pay is
  the realistic way to get an `unmatched` payment in the demo.
- **The PhoneSimulator plays the customer's phone:** amount → STK prompt with PIN
  (any 4 digits) → Safaricom-style confirmation SMS. The shopkeeper's result (paid /
  unmatched / cancelled) is shown in a strip under it.
- **"Resend last callback" is in a collapsed "Developer tools" box on the M-Pesa page**,
  always visible in the UI; the server refuses it when `NODE_ENV=production`.
- **SMS text is in the shop's language** (`shops.language`), not the UI language: the
  customer reads it, not the shopkeeper. ≤160 characters (one SMS part, tested).
- **"Remind all overdue" skips anyone reminded in the last 20 hours** and anyone without a
  phone, and reports what it skipped. The single "Remind" button always sends (the shopkeeper chose to).
- **The SMS mock delivers by writing to `sms_messages`**, which the Outbox page shows like a
  phone's message list. A real Africa's Talking adapter would call the API and log the same row.
- **6 tabs in the bottom nav** (Today, Customers, New, Products, M-Pesa, SMS), so every demo
  page is one tap away.

## Phase 5 — Offline + demo polish

- **"Offline" = no network (`navigator.onLine` false) OR our API didn't answer.** A fetch
  that throws, or a 5xx with no JSON (the Vite proxy when Express is down), marks the API
  unreachable; any good answer, or a health check every 10 s, clears it. One hook, `useOnline()`.
- **Offline writes go to an IndexedDB outbox (Dexie)**, keyed by the transaction's own
  device-made UUID. Synced with one `POST /api/sync` per batch, oldest first: on start,
  when the connection returns, and every 20 s.
- **`/api/sync` handles each entry independently:** `saved` / `duplicate` (already there:
  a resent batch changes nothing, stock moves once) / `rejected` (bad data, e.g. no
  customer). Rejected entries stay on the device with the error and a Discard button;
  they are not retried forever. A server error (5xx) fails the whole batch so it is retried.
- **AI entries confirmed offline sync as "create (draft) + confirm"** (`confirm: true`).
  The server still applies the AI-is-draft rule, then replays the shopkeeper's confirmation.
- **Offline AI = the server's own `rules.js` + `match.js`, bundled into the client** through
  a Vite alias (`@server-ai`). One parser, not two copies that drift apart.
- **Reads offline come from a cache of every GET response** (IndexedDB `cache` table). Pages
  show a "saved data" note. A customer page never opened online falls back to the cached
  customer list (balance, status) without history.
- **Offline-only limits (kept simple on purpose):** M-Pesa, SMS, void, editing server drafts
  and creating new customers need a connection (buttons disabled / clear message). No
  pulling of server changes and no conflict handling: listed as future work.
- **Entries waiting to sync are shown but not counted.** Balances and totals are server
  numbers; the dashboard lists pending entries separately so nothing is double-counted.
- **The demo script recommends DevTools → Network → Offline** over turning Wi-Fi off: with
  Docker/VPN adapters Chrome can still report "online" without Wi-Fi.
- Verified end to end in Chromium (Playwright): offline reload served by the service worker,
  AI sentence parsed in the browser, 2 entries queued, auto-sync on reconnect, balances
  and totals updated once.
