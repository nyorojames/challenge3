# Duka Ledger

An AI bookkeeper for Kenyan dukas: type *"Mama Wanjiku amechukua sukari 2kg na mafuta,
atalipa Ijumaa"* and it becomes a ledger entry. Tracks customer credit, M-Pesa payments
(simulated), SMS reminders (simulated), and stock, in Swahili and English, and keeps
working offline.

A localized clone of **Rational** (YC Summer 2026), "an
accounting firm run entirely by AI employees".

> 🚧 Work in progress. Phase 0 (setup) is done. The demo script and full docs come in Phase 5.

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
```

(The API server and the React app are built in Phases 1 and 2.)

## Project layout

```
server/   Express API, PostgreSQL (plain SQL via pg), AI/M-Pesa/SMS providers
client/   React + Vite + Tailwind PWA with an IndexedDB (Dexie) offline outbox
CLAUDE.md     project context and rules
DECISIONS.md  why things are the way they are
```
