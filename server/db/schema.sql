-- Duka Ledger: AI bookkeeper for Kenyan informal shops
-- PostgreSQL schema (v1)

CREATE EXTENSION IF NOT EXISTS "pgcrypto";  -- for gen_random_uuid()

-- 1. Shops and the people who use the app
CREATE TABLE shops (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name          TEXT NOT NULL,
    phone         TEXT,
    location      TEXT,
    language      TEXT NOT NULL DEFAULT 'sw',      -- 'sw' or 'en'
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE users (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    shop_id       UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
    name          TEXT NOT NULL,
    phone         TEXT NOT NULL UNIQUE,            -- login by phone number
    password_hash TEXT NOT NULL,
    role          TEXT NOT NULL DEFAULT 'owner' CHECK (role IN ('owner', 'assistant')),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Customers (the people who buy on credit)
CREATE TABLE customers (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    shop_id       UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
    name          TEXT NOT NULL,                   -- "Mama Wanjiku"
    phone         TEXT,                            -- used to match M-Pesa payments + SMS
    credit_limit  INTEGER,                         -- in KES, NULL = no limit
    notes         TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (shop_id, phone)
);

-- 3. Stock and suppliers
CREATE TABLE suppliers (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    shop_id       UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
    name          TEXT NOT NULL,
    phone         TEXT
);

CREATE TABLE products (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    shop_id       UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
    supplier_id   UUID REFERENCES suppliers(id) ON DELETE SET NULL,
    name          TEXT NOT NULL,                   -- "sukari"
    unit          TEXT NOT NULL DEFAULT 'pcs',     -- 'kg', 'pcs', 'litre'
    price         INTEGER NOT NULL,                -- selling price per unit, KES
    stock_qty     NUMERIC(10,2) NOT NULL DEFAULT 0,
    reorder_level NUMERIC(10,2) NOT NULL DEFAULT 0,
    UNIQUE (shop_id, name)
);

-- 4. The ledger: every money event is one row
CREATE TABLE transactions (
    id             UUID PRIMARY KEY,               -- generated on the device (offline-safe)
    shop_id        UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
    customer_id    UUID REFERENCES customers(id) ON DELETE SET NULL,
    type           TEXT NOT NULL CHECK (type IN
                     ('cash_sale', 'credit_sale', 'payment', 'expense', 'restock')),
    amount         INTEGER NOT NULL CHECK (amount > 0),   -- KES, always positive
    method         TEXT CHECK (method IN ('cash', 'mpesa', 'credit')),
    due_date       DATE,                           -- for credit sales ("atalipa Ijumaa")
    note           TEXT,
    raw_input      TEXT,                           -- the original sentence typed/spoken
    source         TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'ai', 'mpesa')),
    status         TEXT NOT NULL DEFAULT 'confirmed' CHECK (status IN ('draft', 'confirmed', 'void')),
    created_by     UUID REFERENCES users(id),
    created_at     TIMESTAMPTZ NOT NULL,           -- when it happened (device time)
    synced_at      TIMESTAMPTZ NOT NULL DEFAULT now()  -- when the server received it
);

CREATE TABLE transaction_items (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    transaction_id UUID NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
    product_id     UUID REFERENCES products(id) ON DELETE SET NULL,
    description    TEXT NOT NULL,                  -- kept even if product is deleted
    quantity       NUMERIC(10,2) NOT NULL,
    unit_price     INTEGER NOT NULL,
    line_total     INTEGER NOT NULL
);

-- 5. M-Pesa: raw payment events from Daraja, matched to the ledger
CREATE TABLE mpesa_payments (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    shop_id             UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
    customer_id         UUID REFERENCES customers(id) ON DELETE SET NULL,
    transaction_id      UUID REFERENCES transactions(id),   -- set once matched
    checkout_request_id TEXT UNIQUE,               -- from STK Push response
    phone               TEXT NOT NULL,
    amount              INTEGER NOT NULL,
    receipt_number      TEXT UNIQUE,               -- e.g. "QKA1B2C3D4"
    status              TEXT NOT NULL DEFAULT 'pending'
                          CHECK (status IN ('pending', 'success', 'failed', 'unmatched')),
    raw_callback        JSONB,                     -- full Daraja callback, for debugging
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 6. SMS: every message the shop sends (mock provider writes here)
CREATE TABLE sms_messages (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    shop_id      UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
    customer_id  UUID REFERENCES customers(id) ON DELETE SET NULL,
    phone        TEXT NOT NULL,
    body         TEXT NOT NULL,
    purpose      TEXT NOT NULL DEFAULT 'reminder',
    status       TEXT NOT NULL DEFAULT 'sent',
    provider     TEXT NOT NULL DEFAULT 'mock',
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 7. Customer balances are calculated, never stored
CREATE VIEW customer_balances AS
SELECT
    c.id   AS customer_id,
    c.shop_id,
    c.name,
    c.phone,
    COALESCE(SUM(CASE WHEN t.type = 'credit_sale' THEN t.amount END), 0)
  - COALESCE(SUM(CASE WHEN t.type = 'payment'     THEN t.amount END), 0) AS balance,
    MIN(t.due_date) FILTER (WHERE t.type = 'credit_sale') AS earliest_due
FROM customers c
LEFT JOIN transactions t
       ON t.customer_id = c.id AND t.status = 'confirmed'
GROUP BY c.id;

-- Helpful indexes
CREATE INDEX idx_tx_shop_date     ON transactions (shop_id, created_at DESC);
CREATE INDEX idx_tx_customer      ON transactions (customer_id);
CREATE INDEX idx_mpesa_phone      ON mpesa_payments (phone);
