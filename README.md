# Duka Ledger

**An AI bookkeeper for Kenyan dukas.** The shopkeeper types the way they talk:

> *"Mama Wanjiku amechukua sukari 2kg na mafuta, atalipa Ijumaa"*

and it becomes a ledger entry: a credit sale of KES 650 to Mama Wanjiku, due on Friday.
The app tracks who owes what, takes M-Pesa payments, sends polite SMS reminders, counts
stock, speaks Swahili and English, and keeps working when the internet drops.

A localized clone of **Rational** (YC Summer 2026), "an accounting firm run entirely by
AI employees", rebuilt for a shop that runs on customer credit and M-Pesa.

| Rational (clone tier) | Duka Ledger (localization tier) |
|---|---|
| Plain-language input becomes structured books | Swahili, English and Sheng ("Kevo ametuma soo tatu" = KES 300 payment) |
| AI suggests, a human approves | AI entries are always **drafts** until the shopkeeper confirms |
| Dashboard: sales, owed, expenses, profit | Credit ledger with partial payments, due dates and overdue status |
| | M-Pesa STK Push (simulated, Daraja format) that clears debts automatically |
| | SMS reminders (simulated) for overdue customers |
| | Works offline: entries queue on the phone and sync later |
| | Stock that drops with sales and low-stock warnings |

All free: no paid APIs, no sign-ups, runs on a laptop.

---

## Quick start

Needs **Node.js 20+** and **PostgreSQL 16** (Docker, or a normal install: see [Setup](#setup)).

```bash
docker compose up -d                      # 1. database (first start loads demo data)

cd server
cp .env.example .env                      # 2. set JWT_SECRET to any long random string
npm install
npm run db:reset                          #    fresh demo data
npm run dev                               #    API on http://localhost:4000

cd ../client                              # 3. in a second terminal
npm install
npm run dev                               #    app on http://localhost:5173
```

**Demo login:** phone `0712345678`, password `duka1234` (shop "Duka la Mama Njeri").

---

## 2-minute demo script

**Before you start (2 minutes beforehand):**
1. `cd server && npm run db:reset` for fresh data (dates are relative to today, so Mama Wanjiku is always overdue).
2. Log in, then open **Customers** and **New entry** once, so the
   app has a copy of the customer and product lists for the offline part.
3. Optional: set `AI_PROVIDER=gemini` and your key in `server/.env` for the real LLM.
   Without it, everything still works in **basic mode**.

| Time | Do this | Point out |
|---|---|---|
| 0:00 | Log in. The app opens in **English** on the dashboard (*Today*). | Today's sales split into cash / M-Pesa / credit; KES 2,723 owed; 1 customer overdue. |
| 0:15 | **New entry** → type *Mama Wanjiku amechukua sukari 2kg na mafuta, atalipa Ijumaa* → **✨ Read it**. | The AI understood a **Swahili** sentence: the customer, the products, the prices and **Friday's date**. It's saved as a **draft**: nothing is in the books yet. |
| 0:35 | **Confirm**. | Her page: balance 500 → **1,150**. Still red: her *old* debt is 13 days late (FIFO rule). |
| 0:45 | Switch **EN → SW** in the header to show the Swahili interface, then back to **EN**. Tap **✉️ Remind**. Open the **SMS** tab. | The whole app is bilingual. The reminder is in the *shop's* language (Swahili), with her balance and the shop name, shown like a phone's inbox. |
| 1:00 | Back on her page: **📲 Request M-Pesa** → **Send request**. On the phone: PIN `1234` → **Confirm**. | Daraja-style STK prompt and receipt. Her debt drops to **KES 0** automatically. |
| 1:15 | *(optional)* **M-Pesa** tab → Developer tools → **Resend last callback**. | "Already processed": a repeated callback never pays twice (idempotency). |
| 1:25 | Go offline: **DevTools (F12) → Network → Offline** (or turn Wi-Fi off). | Header turns red: **Offline**. |
| 1:30 | **New entry** → *Kevo amechukua soda mbili na mikate 2* → **Read it** → **Confirm**. | Parsed **on the phone** in basic mode, no server. Dashboard: "Not sent yet: 1". |
| 1:45 | Go back online. | Header: **✓ 1 synced**. Kevo's balance updates; the entry keeps the time it was made offline. |

> **Wi-Fi vs DevTools:** with Docker Desktop or a VPN installed, Chrome may still say
> "online" when Wi-Fi is off (virtual network adapters). DevTools → Network → **Offline**
> always works. If the API itself goes down, the app also switches to offline mode.

---

## How it works

### AI entry: suggest, never write

```
sentence ─► Gemini / Ollama ─► zod check ─┐
              │ error, >5 s, bad JSON     ├─► groundEntry ─► DRAFT ─► shopkeeper confirms ─► ledger
              └──► rules parser ──────────┘   (real ids, OUR prices, total)
offline ───────► rules parser in the browser ─┘
```

- The AI only reads the sentence. `groundEntry` (`server/src/providers/ai/match.js`) maps
  names to real customers and products and applies **our** price list, so an AI cannot
  invent a customer, a product or a price.
- If the AI fails in any way, the **rules parser** answers (badge: *Basic mode*). It knows
  Swahili numbers, Sheng money, weekdays (*Ijumaa* → next Friday), *kesho*, *mwisho wa
  mwezi*, plurals (*mikate*), English product names (*sugar*) and typos (*Wanjku*).
- Entries from the AI are saved with `status = 'draft'` and only count after **Confirm**.

### Balances and overdue

- Balances are **never stored**: the `customer_balances` view adds up confirmed credit
  sales minus payments. Voided and draft entries never count.
- **Overdue uses FIFO:** payments pay off the oldest credit first. A customer is overdue
  only if the oldest debt *not yet paid* is past its due date. (Paying an old debt and
  taking new credit due next week is not overdue.)

### M-Pesa (simulated Daraja STK Push)

`Request M-Pesa` → `POST /api/mpesa/stk-push` saves a *pending* payment → the PhoneSimulator
plays the customer's phone → `POST /api/mpesa/simulate` builds **Daraja's exact callback JSON**
and passes it to the same handler as the real `POST /api/mpesa/callback`:
- stores the raw callback, matches the paying phone (`2547…`) to a customer, and records a
  confirmed payment, so the debt drops;
- **idempotent**: the row is locked and only a *pending* row is processed, so repeated
  callbacks never pay twice;
- an unknown phone → **unmatched**, waiting on the M-Pesa page for you to assign it.

### Offline

- Every page keeps its last data in **IndexedDB** (Dexie); offline, pages show that copy.
- New entries made offline go to an **outbox** in IndexedDB with an id made on the device.
- When the connection returns, the outbox is sent to `POST /api/sync`. The server saves each
  entry once (`ON CONFLICT DO NOTHING`): resending is safe, and a bad entry is reported
  back without blocking the others.
- `created_at` = when it happened on the phone; `synced_at` = when the server got it.
- The service worker (PWA) keeps the app itself available offline (production build).

---

## Setup

### Database: option A, Docker

```bash
docker compose up -d       # first start runs schema.sql + seed.sql
docker compose down -v     # wipe everything (next "up" re-seeds)
```

### Database: option B, PostgreSQL installed locally (no Docker)

1. Install PostgreSQL 16 ([installer](https://www.postgresql.org/download/), or
   `sudo apt install postgresql` on Ubuntu).
2. As the `postgres` superuser (`sudo -u postgres psql` on Ubuntu, or pgAdmin / SQL Shell on Windows):
   ```sql
   CREATE ROLE duka LOGIN PASSWORD 'duka';
   CREATE DATABASE duka_ledger OWNER duka;
   ```
3. `cd server && npm run db:reset` creates the tables and loads the demo data.

### Server

```bash
cd server
cp .env.example .env    # set JWT_SECRET; everything else has working defaults
npm install
npm run db:reset        # any time you want fresh demo data (refused when NODE_ENV=production)
npm run dev             # http://localhost:4000/api/health
npm test                # 70 tests; needs the database; uses a throwaway shop
```

### Client

```bash
cd client
npm install
npm run dev             # http://localhost:5173 (forwards /api to :4000)
npm run build && npm run preview   # production build with the service worker, http://localhost:4173
```

To use your phone: `npm run dev -- --host`, then open `http://<laptop-ip>:5173` on the
same Wi-Fi.

### AI provider (all free)

Set `AI_PROVIDER` in `server/.env`:

| Provider | Needs | Notes |
|---|---|---|
| `rules` (default) | nothing | Works offline and never fails. |
| `gemini` | free key from [Google AI Studio](https://aistudio.google.com/apikey) in `GEMINI_API_KEY` | `LLM_MODEL` defaults to `gemini-flash-lite-latest` (~1 s). Busy (503) or over quota (429) falls back to rules. |
| `ollama` | [Ollama](https://ollama.com) running, then `ollama pull llama3.2:3b` | `OLLAMA_MODEL`. Fully local once downloaded. |

The LLM's instructions are in `server/src/providers/ai/prompt.txt`: plain text, edit freely.

---

## API reference

All routes need `Authorization: Bearer <token>` except `/api/auth/*`, `/api/health` and
`/api/mpesa/callback` (Safaricom calls that one).

| Method | Path | What it does |
|---|---|---|
| POST | `/api/auth/login` | `{ phone, password }` → `{ token, user, shop }` |
| POST | `/api/auth/register` | new shop + owner |
| GET | `/api/auth/me` | current user and shop |
| GET/POST | `/api/customers` | list with `balance`, `due_date`, `overdue` (`?overdue=true`) / create |
| GET/PATCH | `/api/customers/:id` | detail with `history` / edit |
| GET/POST/PATCH | `/api/products` | `low_stock` flag (`?low_stock=true`) |
| GET/POST/PATCH | `/api/suppliers` | |
| GET/POST | `/api/transactions` | filters `customer_id, type, status, from, to, limit`; POST takes a device UUID |
| PUT | `/api/transactions/:id` | edit a **draft** (409 once confirmed) |
| POST | `/api/transactions/:id/confirm` | draft → confirmed (moves stock) |
| POST | `/api/transactions/:id/void` | → void (reverses stock) |
| GET | `/api/reports/summary?date=` | dashboard numbers for a Kenyan day |
| POST | `/api/ai/parse` | `{ text }` → suggested entry (writes nothing) |
| POST | `/api/mpesa/stk-push` | `{ customer_id \| phone, amount }` → pending payment |
| POST | `/api/mpesa/simulate` | `{ checkout_request_id, action: confirm \| cancel }` (mock only) |
| POST | `/api/mpesa/callback` | Daraja STK callback (no login, idempotent) |
| GET | `/api/mpesa/payments?status=` | M-Pesa payments |
| POST | `/api/mpesa/payments/:id/assign` | give an unmatched payment to a customer |
| POST | `/api/mpesa/resend-last` | dev only: replay the last callback |
| POST | `/api/sms/remind/:customerId` | send one reminder |
| POST | `/api/sms/remind-overdue` | remind all overdue (skips: no phone, reminded in last 20 h) |
| GET | `/api/sms/messages` | SMS outbox |
| POST | `/api/sync` | `{ items: [{ transaction, confirm }] }` → `saved` / `duplicate` / `rejected` per entry |

---

## Project layout

```
server/
  db/            schema.sql (source of truth), seed.sql, pool.js, reset.js
  src/
    routes/      thin HTTP layer: validate with zod, call a service, return JSON
    services/    ledger (balances, FIFO, stock), mpesa (callback), reminders, sync
    providers/   ai/ (gemini, ollama, rules, match, prompt.txt), payments/mock, sms/mock
    utils/       phone numbers, Swahili dates, money
  tests/         Vitest + Supertest (70 tests)
client/src/
  pages/         Dashboard, Customers, CustomerDetail, Products, NewEntry, Mpesa, SmsOutbox
  components/    EntryForm, AiEntry, PhoneSimulator, ConnectionBadge, PendingList, ...
  api/ db/ sync/ fetch wrapper, IndexedDB (Dexie), outbox + connectivity
  i18n/          sw.json, en.json
CLAUDE.md        project rules and context
DECISIONS.md     every important decision and why
```

---

## Future work

- **Real M-Pesa:** a Daraja adapter (OAuth token, STK password, public HTTPS callback URL with
  a secret path and Safaricom IP allow-list). Only `providers/payments/` changes; the callback
  handler already speaks Daraja's format. Also C2B (Paybill/Till) payments, which are the
  usual source of unmatched payments.
- **Real SMS:** an Africa's Talking adapter in `providers/sms/`, delivery reports, and
  scheduled automatic reminders (e.g. every morning at 9).
- **Full two-way sync:** today the phone only *sends*. Next: pull other devices' changes,
  handle conflicts (e.g. two assistants editing the same customer), and create customers offline
  (client-made UUIDs, like transactions).
- **Voice input:** speak the sentence (Web Speech API, or a local Whisper model) instead of typing.
- **Real profit:** store cost prices so profit = sales − cost of goods − expenses.
- **Production hardening:** httpOnly cookie instead of a token in localStorage, rate limiting,
  roles for shop assistants, HTTPS deployment, backups.

---

## Troubleshooting

| Problem | Fix |
|---|---|
| `Invalid environment configuration` on start | Copy `server/.env.example` to `server/.env` and set `JWT_SECRET` (16+ characters). |
| `ECONNREFUSED 127.0.0.1:5432` | Postgres is not running: `docker compose up -d`, or start your local PostgreSQL service. |
| Always "Basic mode" with Gemini | Check `GEMINI_API_KEY`; the badge's tooltip shows the reason (e.g. `HTTP 503` = Google busy, try again). |
| Offline mode doesn't trigger with Wi-Fi off | Use DevTools → Network → Offline (see the demo-script note). |
| Offline page shows "no saved copy" | Open that page once while online first, so its data is saved. |
