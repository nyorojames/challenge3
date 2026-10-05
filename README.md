# Duka Ledger

An AI bookkeeper for Kenyan dukas: type *"Mama Wanjiku amechukua sukari 2kg na mafuta,
atalipa Ijumaa"* and it becomes a ledger entry. Tracks customer credit, M-Pesa payments
(simulated), SMS reminders (simulated), and stock, in Swahili and English, and keeps
working offline.

A localized clone of **Rational** (YC Summer 2026), "an
accounting firm run entirely by AI employees".

> 🚧 Work in progress. Phases 0–4 (setup, backend API, frontend core, AI entry, M-Pesa + SMS) are done. The demo script and full docs come in Phase 5.

## Demo login

| Phone        | Password   | Shop               |
|--------------|------------|--------------------|
| `0712345678` | `duka1234` | Duka la Mama Njeri |

## Requirements

- Node.js 20+ (tested on 22)
- PostgreSQL 16, **either** via Docker **or** installed locally

## 1. Start the database

### Option A: Docker (easiest)

```bash
docker compose up -d
```

On the **first** start this creates the tables (`server/db/schema.sql`) and loads the
demo data (`server/db/seed.sql`). To start again from scratch: `docker compose down -v`,
then `docker compose up -d`.

### Option B: PostgreSQL installed locally (no Docker)

1. Install PostgreSQL 16 ([Windows/macOS installer](https://www.postgresql.org/download/),
   or `sudo apt install postgresql` on Ubuntu).
2. Create the same user and database that Docker would create. Open `psql` as the
   `postgres` superuser (on Ubuntu: `sudo -u postgres psql`) and run:

   ```sql
   CREATE ROLE duka LOGIN PASSWORD 'duka';
   CREATE DATABASE duka_ledger OWNER duka;
   ```

3. Load the schema and seed after step 2 below, using `npm run db:reset`.

## 2. Set up the server

```bash
cd server
cp .env.example .env      # then set JWT_SECRET to a long random string
npm install
npm run db:reset          # wipes the DB and reloads schema + demo data (both options)
```

`npm run db:reset` is safe to run any time you want fresh demo data. It refuses to
run when `NODE_ENV=production`.

## 3. Set up the client

```bash
cd client
npm install
npm run dev       # http://localhost:5173  (the API must be running on :4000)
```

Vite forwards every `/api/...` request to the Express server, so start both:
one terminal with `cd server && npm run dev`, another with `cd client && npm run dev`.
Open the app on your phone over Wi-Fi with `npm run dev -- --host` and the laptop's IP.

## 4. Run the API and tests

```bash
cd server
npm run dev       # http://localhost:4000/api/health
npm test          # needs the database running; tests use a throwaway shop
```

### API overview

All routes except `/api/auth/*` and `/api/health` need `Authorization: Bearer <token>`.

| Method | Path | What it does |
|---|---|---|
| POST | `/api/auth/login` | `{ phone, password }` → `{ token, user, shop }` |
| POST | `/api/auth/register` | create a shop and its owner |
| GET | `/api/auth/me` | current user and shop |
| GET/POST | `/api/customers` | list with `balance`, `due_date`, `overdue` (`?overdue=true`) / create |
| GET/PATCH | `/api/customers/:id` | detail with full `history` / edit |
| GET/POST/PATCH | `/api/products` | `low_stock` flag (`?low_stock=true`) |
| GET/POST/PATCH | `/api/suppliers` | |
| GET/POST | `/api/transactions` | filters: `customer_id, type, status, from, to, limit`. POST takes a client UUID |
| POST | `/api/transactions/:id/confirm` | draft → confirmed (moves stock) |
| POST | `/api/transactions/:id/void` | → void (reverses stock) |
| GET | `/api/reports/summary?date=` | dashboard numbers for a Kenyan day |

Try it:

```bash
curl -s -X POST localhost:4000/api/auth/login -H 'content-type: application/json' \
  -d '{"phone":"0712345678","password":"duka1234"}'
```

## 5. AI entry: choose a provider (all free)

Set `AI_PROVIDER` in `server/.env`:

| Provider | Needs | Notes |
|---|---|---|
| `rules` (default) | nothing | Rule-based Swahili/English/Sheng parser. Works offline, never fails. |
| `gemini` | free key from [Google AI Studio](https://aistudio.google.com/apikey) in `GEMINI_API_KEY` | Model from `LLM_MODEL` (default `gemini-flash-lite-latest`, ~1 s). Busy (503) or over quota (429) falls back to rules. |
| `ollama` | [Ollama](https://ollama.com) running locally, then `ollama pull llama3.2:3b` | Model from `OLLAMA_MODEL`. Fully offline once downloaded. |

If the chosen provider errors, takes longer than `AI_TIMEOUT_MS` (5 s), or returns
invalid JSON, the server uses the rules parser and the UI shows a **Basic mode** badge.
The LLM prompt is in `server/src/providers/ai/prompt.txt`; edit it freely.

Flow: type a sentence → the server suggests an entry → it is saved as a **draft** →
you check/edit it → **Confirm** puts it in the ledger (or **Discard** voids it).

| Method | Path | What it does |
|---|---|---|
| POST | `/api/ai/parse` | `{ text }` → `{ entry, provider, basic_mode, fallback_reason, raw_input }` (writes nothing) |
| PUT | `/api/transactions/:id` | edit a draft (409 once confirmed) |

## 6. M-Pesa and SMS (simulated, no sign-up)

**M-Pesa (STK Push):** on an owing customer's page tap **📲 Request M-Pesa**. A phone appears
and asks "Pay KES X to DUKA LA MAMA NJERI? Enter M-PESA PIN" (any 4 digits). **Confirm**
sends Daraja's real success callback (ResultCode 0); **Cancel** sends ResultCode 1032.
On success the payment is matched to the customer by phone and the debt drops at once.
A payment from an unknown number is **unmatched** and waits on the M-Pesa page for you to
assign it. **Developer tools → Resend last callback** replays the last callback to show
that a repeated callback never creates a second payment.

**SMS:** **✉️ Remind** on a customer page, or **Remind all overdue** on the Customers page.
Messages are short, polite, in the shop's language, and appear in the **SMS** tab.

| Method | Path | What it does |
|---|---|---|
| POST | `/api/mpesa/stk-push` | `{ customer_id \| phone, amount }` → pending payment + `checkout_request_id` |
| POST | `/api/mpesa/simulate` | `{ checkout_request_id, action: confirm \| cancel }` (mock only) |
| POST | `/api/mpesa/callback` | **no login**: Daraja's STK callback; idempotent; always `{ResultCode:0}` |
| GET | `/api/mpesa/payments?status=` | payments (pending, success, failed, unmatched) |
| POST | `/api/mpesa/payments/:id/assign` | `{ customer_id }` for an unmatched payment |
| POST | `/api/mpesa/resend-last` | dev only: replay the last callback |
| POST | `/api/sms/remind/:customerId` | send one reminder |
| POST | `/api/sms/remind-overdue` | remind all overdue (skips no phone / reminded in last 20 h) |
| GET | `/api/sms/messages` | the outbox |

## Project layout

```
server/   Express API, PostgreSQL (plain SQL via pg), AI/M-Pesa/SMS providers
client/   React + Vite + Tailwind PWA with an IndexedDB (Dexie) offline outbox
CLAUDE.md     project context and rules
DECISIONS.md  why things are the way they are
```
