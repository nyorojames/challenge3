-- Duka Ledger demo data
-- Run AFTER schema.sql. All dates are relative to "today" so the demo
-- looks the same whichever day you run it (overdue stays overdue).
--
-- Demo login: phone 0712345678, password duka1234 (stored only as a bcrypt hash)
--
-- UUID prefixes make rows easy to recognise:
--   a... shop/user   b... suppliers   c... products   d... customers   e... transactions

-- "Today" means today in Kenya, not in UTC.
SET TIME ZONE 'Africa/Nairobi';

BEGIN;

-- 1. Shop + owner -----------------------------------------------------------
INSERT INTO shops (id, name, phone, location, language) VALUES
  ('a0000000-0000-0000-0000-000000000001', 'Duka la Mama Njeri', '254712345678', 'Kahawa West, Nairobi', 'sw');

-- Phones are stored normalized as 254XXXXXXXXX; login accepts 07..., +254..., 254...
INSERT INTO users (id, shop_id, name, phone, password_hash, role) VALUES
  ('a1000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001',
   'Njeri Kamande', '254712345678',
   '$2b$10$Um.57oF753/XEyHp7DE1fewHfQ84XkemO.xjcQXWfj4AtDjMdMk8i', 'owner');

-- 2. Suppliers ---------------------------------------------------------------
INSERT INTO suppliers (id, shop_id, name, phone) VALUES
  ('b0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'Mwangi Wholesalers',   '254720400100'),
  ('b0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', 'Bidco Distributors',   '254733500200'),
  ('b0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000001', 'Brookside Milk Depot', '254711600300'),
  ('b0000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-000000000001', 'Kariuki Bakery',       '254798700400');

-- 3. Products (price = selling price per unit, KES) --------------------------
-- maziwa and mkate start BELOW reorder_level so the low-stock badge shows.
INSERT INTO products (id, shop_id, supplier_id, name, unit, price, stock_qty, reorder_level) VALUES
  ('c0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'sukari',     'kg',    160, 25, 10),
  ('c0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'unga',       'pcs',   150, 18,  6),  -- 2kg packet
  ('c0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000002', 'mafuta',     'litre', 330, 12,  5),  -- cooking oil
  ('c0000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000003', 'maziwa',     'pcs',    65,  4, 10),  -- 500ml packet, LOW
  ('c0000000-0000-0000-0000-000000000005', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000002', 'sabuni',     'pcs',   120, 15,  5),  -- bar soap
  ('c0000000-0000-0000-0000-000000000006', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'chai',       'pcs',    60, 20,  5),  -- tea leaves packet
  ('c0000000-0000-0000-0000-000000000007', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'mchele',     'kg',    180, 30, 10),  -- rice
  ('c0000000-0000-0000-0000-000000000008', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000004', 'mkate',      'pcs',    65,  3,  5),  -- bread, LOW
  ('c0000000-0000-0000-0000-000000000009', 'a0000000-0000-0000-0000-000000000001', NULL,                                   'mayai',      'pcs',    18, 60, 30),  -- eggs
  ('c0000000-0000-0000-0000-000000000010', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'ngano',      'pcs',   190, 10,  4),  -- wheat flour 2kg
  ('c0000000-0000-0000-0000-000000000011', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'chumvi',     'pcs',    30, 25,  8),  -- salt
  ('c0000000-0000-0000-0000-000000000012', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'kiberiti',   'pcs',     5, 80, 20),  -- matchbox
  ('c0000000-0000-0000-0000-000000000013', 'a0000000-0000-0000-0000-000000000001', NULL,                                   'soda',       'pcs',    60, 24, 12),
  ('c0000000-0000-0000-0000-000000000014', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'royco',      'pcs',    15, 40, 10),
  ('c0000000-0000-0000-0000-000000000015', 'a0000000-0000-0000-0000-000000000001', NULL,                                   'mafuta taa', 'litre', 170,  8,  5);  -- paraffin

-- 4. Customers ---------------------------------------------------------------
INSERT INTO customers (id, shop_id, name, phone, credit_limit, notes) VALUES
  ('d0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'Mama Wanjiku',    '254722111001', 2000, 'Jirani, nyumba ya bluu'),
  ('d0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', 'Baba Otieno',     '254722111002', 3000, NULL),
  ('d0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000001', 'Mzee Kamau',      '254722111003', 5000, 'Analipa mwisho wa mwezi'),
  ('d0000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-000000000001', 'Akinyi Odhiambo', '254722111004', 1500, NULL),
  ('d0000000-0000-0000-0000-000000000005', 'a0000000-0000-0000-0000-000000000001', 'Mwalimu Njoroge', '254722111005', 3000, 'Teacher at Kahawa Primary'),
  ('d0000000-0000-0000-0000-000000000006', 'a0000000-0000-0000-0000-000000000001', 'Fatuma Hassan',   '254722111006', NULL, NULL),
  ('d0000000-0000-0000-0000-000000000007', 'a0000000-0000-0000-0000-000000000001', 'Kevo',            '254711222007', 500,  'Boda boda stage'),
  ('d0000000-0000-0000-0000-000000000008', 'a0000000-0000-0000-0000-000000000001', 'Chebet',          '254722111008', 1500, NULL);

-- 5. Transactions ------------------------------------------------------------
-- The demo scenarios (balance = confirmed credit_sale - confirmed payment):
--   Mama Wanjiku    800 credit (due 13 days ago) - 300 paid  = 500  -> OVERDUE
--   Baba Otieno     1160 old credit fully paid, then 368 new credit due in 3 days
--                   = 368 -> NOT overdue (tests the FIFO due-date rule)
--   Mzee Kamau      1520 credit (due in 4 days) - 500 M-Pesa = 1020 -> not overdue
--   Akinyi          490 credit (due 3 days ago) - 490 paid   = 0    -> cleared, not overdue
--   Mwalimu Njoroge 285 credit + a VOIDED 2850 typo entry    = 285  (void ignored)
--   Fatuma Hassan   no history                               = 0
--   Kevo            185 credit today, AI-parsed, no due date = 185
--   Chebet          365 credit due TODAY                     = 365  -> not overdue yet
INSERT INTO transactions
  (id, shop_id, customer_id, type, amount, method, due_date, note, raw_input, source, status, created_by, created_at)
VALUES
  -- Mama Wanjiku: genuinely overdue
  ('e0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000001',
   'credit_sale', 800, 'credit', CURRENT_DATE - 13, NULL,
   'Mama Wanjiku amechukua sukari 2kg, mafuta na unga, atalipa Ijumaa', 'ai', 'confirmed',
   'a1000000-0000-0000-0000-000000000001', CURRENT_DATE - 20 + time '17:40'),
  ('e0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000001',
   'payment', 300, 'cash', NULL, 'Amelipa kidogo', NULL, 'manual', 'confirmed',
   'a1000000-0000-0000-0000-000000000001', CURRENT_DATE - 10 + time '09:15'),

  -- Baba Otieno: old debt cleared via M-Pesa, new debt not yet due
  ('e0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000002',
   'credit_sale', 1160, 'credit', CURRENT_DATE - 25, NULL, NULL, 'manual', 'confirmed',
   'a1000000-0000-0000-0000-000000000001', CURRENT_DATE - 30 + time '18:05'),
  ('e0000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000002',
   'payment', 1160, 'mpesa', NULL, NULL, NULL, 'mpesa', 'confirmed',
   'a1000000-0000-0000-0000-000000000001', CURRENT_DATE - 22 + time '12:30'),
  ('e0000000-0000-0000-0000-000000000005', 'a0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000002',
   'credit_sale', 368, 'credit', CURRENT_DATE + 3, NULL, NULL, 'manual', 'confirmed',
   'a1000000-0000-0000-0000-000000000001', CURRENT_DATE - 2 + time '07:50'),

  -- Mzee Kamau: partial M-Pesa payment, not yet due
  ('e0000000-0000-0000-0000-000000000006', 'a0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000003',
   'credit_sale', 1520, 'credit', CURRENT_DATE + 4, NULL, NULL, 'manual', 'confirmed',
   'a1000000-0000-0000-0000-000000000001', CURRENT_DATE - 5 + time '19:10'),
  ('e0000000-0000-0000-0000-000000000007', 'a0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000003',
   'payment', 500, 'mpesa', NULL, NULL, NULL, 'mpesa', 'confirmed',
   'a1000000-0000-0000-0000-000000000001', CURRENT_DATE - 1 + time '13:20'),

  -- Akinyi: due date passed, but paid in full -> not overdue
  ('e0000000-0000-0000-0000-000000000008', 'a0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000004',
   'credit_sale', 490, 'credit', CURRENT_DATE - 3, NULL, NULL, 'manual', 'confirmed',
   'a1000000-0000-0000-0000-000000000001', CURRENT_DATE - 10 + time '16:00'),
  ('e0000000-0000-0000-0000-000000000009', 'a0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000004',
   'payment', 490, 'cash', NULL, NULL, NULL, 'manual', 'confirmed',
   'a1000000-0000-0000-0000-000000000001', CURRENT_DATE - 4 + time '10:45'),

  -- Mwalimu Njoroge: one real entry, one voided typo (must NOT count)
  ('e0000000-0000-0000-0000-000000000010', 'a0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000005',
   'credit_sale', 285, 'credit', CURRENT_DATE + 6, NULL, NULL, 'manual', 'confirmed',
   'a1000000-0000-0000-0000-000000000001', CURRENT_DATE - 4 + time '18:30'),
  ('e0000000-0000-0000-0000-000000000011', 'a0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000005',
   'credit_sale', 2850, 'credit', CURRENT_DATE + 6, 'Typo: quantities x10. Voided.', NULL, 'manual', 'void',
   'a1000000-0000-0000-0000-000000000001', CURRENT_DATE - 4 + time '18:29'),

  -- Kevo: AI-parsed Sheng entry today, no due date
  ('e0000000-0000-0000-0000-000000000012', 'a0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000007',
   'credit_sale', 185, 'credit', NULL, NULL,
   'Kevo amechukua soda mbili na mkate, atanipa kesho', 'ai', 'confirmed',
   'a1000000-0000-0000-0000-000000000001', CURRENT_DATE + time '10:20'),

  -- Chebet: due today (overdue only from tomorrow)
  ('e0000000-0000-0000-0000-000000000013', 'a0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000008',
   'credit_sale', 365, 'credit', CURRENT_DATE, NULL, NULL, 'manual', 'confirmed',
   'a1000000-0000-0000-0000-000000000001', CURRENT_DATE - 1 + time '08:40'),

  -- Today's walk-in cash/M-Pesa sales (no customer) and an expense
  ('e0000000-0000-0000-0000-000000000014', 'a0000000-0000-0000-0000-000000000001', NULL,
   'cash_sale', 260, 'cash', NULL, NULL, NULL, 'manual', 'confirmed',
   'a1000000-0000-0000-0000-000000000001', CURRENT_DATE + time '07:30'),
  ('e0000000-0000-0000-0000-000000000015', 'a0000000-0000-0000-0000-000000000001', NULL,
   'expense', 200, 'cash', NULL, 'Nauli kwenda wholesale', NULL, 'manual', 'confirmed',
   'a1000000-0000-0000-0000-000000000001', CURRENT_DATE + time '08:00'),
  ('e0000000-0000-0000-0000-000000000016', 'a0000000-0000-0000-0000-000000000001', NULL,
   'cash_sale', 220, 'mpesa', NULL, NULL, NULL, 'manual', 'confirmed',
   'a1000000-0000-0000-0000-000000000001', CURRENT_DATE + time '09:10'),
  ('e0000000-0000-0000-0000-000000000017', 'a0000000-0000-0000-0000-000000000001', NULL,
   'cash_sale', 630, 'cash', NULL, NULL, NULL, 'manual', 'confirmed',
   'a1000000-0000-0000-0000-000000000001', CURRENT_DATE + time '11:45'),

  -- Yesterday: a sale, an expense and a restock (buying stock from a supplier)
  ('e0000000-0000-0000-0000-000000000018', 'a0000000-0000-0000-0000-000000000001', NULL,
   'cash_sale', 560, 'cash', NULL, NULL, NULL, 'manual', 'confirmed',
   'a1000000-0000-0000-0000-000000000001', CURRENT_DATE - 1 + time '17:15'),
  ('e0000000-0000-0000-0000-000000000019', 'a0000000-0000-0000-0000-000000000001', NULL,
   'expense', 500, 'mpesa', NULL, 'Stima (KPLC tokens)', NULL, 'manual', 'confirmed',
   'a1000000-0000-0000-0000-000000000001', CURRENT_DATE - 1 + time '19:00'),
  ('e0000000-0000-0000-0000-000000000020', 'a0000000-0000-0000-0000-000000000001', NULL,
   'restock', 2800, 'mpesa', NULL, 'Sukari 20kg kutoka Mwangi Wholesalers', NULL, 'manual', 'confirmed',
   'a1000000-0000-0000-0000-000000000001', CURRENT_DATE - 1 + time '11:00');

-- 6. Line items --------------------------------------------------------------
-- Written as (transaction, product name, quantity); price comes from products,
-- so line totals always add up to the transaction amount.
INSERT INTO transaction_items (transaction_id, product_id, description, quantity, unit_price, line_total)
SELECT i.tx::uuid, p.id, p.name, i.qty, p.price, (i.qty * p.price)::integer
FROM (VALUES
  ('e0000000-0000-0000-0000-000000000001', 'sukari', 2), ('e0000000-0000-0000-0000-000000000001', 'mafuta', 1),
  ('e0000000-0000-0000-0000-000000000001', 'unga',   1),                                                        -- 800
  ('e0000000-0000-0000-0000-000000000003', 'unga',   4), ('e0000000-0000-0000-0000-000000000003', 'sukari', 2),
  ('e0000000-0000-0000-0000-000000000003', 'mchele', 1), ('e0000000-0000-0000-0000-000000000003', 'chai',   1),  -- 1160
  ('e0000000-0000-0000-0000-000000000005', 'maziwa', 2), ('e0000000-0000-0000-0000-000000000005', 'mkate',  2),
  ('e0000000-0000-0000-0000-000000000005', 'mayai',  6),                                                        -- 368
  ('e0000000-0000-0000-0000-000000000006', 'mafuta', 2), ('e0000000-0000-0000-0000-000000000006', 'mchele', 3),
  ('e0000000-0000-0000-0000-000000000006', 'sukari', 2),                                                        -- 1520
  ('e0000000-0000-0000-0000-000000000008', 'sabuni', 2), ('e0000000-0000-0000-0000-000000000008', 'chumvi', 2),
  ('e0000000-0000-0000-0000-000000000008', 'ngano',  1),                                                        -- 490
  ('e0000000-0000-0000-0000-000000000010', 'mkate',  1), ('e0000000-0000-0000-0000-000000000010', 'maziwa', 2),
  ('e0000000-0000-0000-0000-000000000010', 'mayai',  5),                                                        -- 285
  ('e0000000-0000-0000-0000-000000000011', 'mkate', 10), ('e0000000-0000-0000-0000-000000000011', 'maziwa', 20),
  ('e0000000-0000-0000-0000-000000000011', 'mayai', 50),                                                        -- 2850 (void)
  ('e0000000-0000-0000-0000-000000000012', 'soda',   2), ('e0000000-0000-0000-0000-000000000012', 'mkate',  1),  -- 185
  ('e0000000-0000-0000-0000-000000000013', 'unga',   2), ('e0000000-0000-0000-0000-000000000013', 'maziwa', 1),  -- 365
  ('e0000000-0000-0000-0000-000000000014', 'mkate',  2), ('e0000000-0000-0000-0000-000000000014', 'maziwa', 2),  -- 260
  ('e0000000-0000-0000-0000-000000000016', 'sukari', 1), ('e0000000-0000-0000-0000-000000000016', 'chai',   1),  -- 220
  ('e0000000-0000-0000-0000-000000000017', 'unga',   2), ('e0000000-0000-0000-0000-000000000017', 'mafuta', 1),  -- 630
  ('e0000000-0000-0000-0000-000000000018', 'mchele', 2), ('e0000000-0000-0000-0000-000000000018', 'sukari', 1),
  ('e0000000-0000-0000-0000-000000000018', 'chumvi', 1), ('e0000000-0000-0000-0000-000000000018', 'kiberiti', 2) -- 560
) AS i(tx, product, qty)
JOIN products p ON p.shop_id = 'a0000000-0000-0000-0000-000000000001' AND p.name = i.product;

-- Restock is priced at the supplier's cost (140/kg), not our selling price.
INSERT INTO transaction_items (transaction_id, product_id, description, quantity, unit_price, line_total) VALUES
  ('e0000000-0000-0000-0000-000000000020', 'c0000000-0000-0000-0000-000000000001', 'sukari', 20, 140, 2800);

-- 7. M-Pesa history ----------------------------------------------------------
-- raw_callback holds the body Daraja would POST to our callback URL.
INSERT INTO mpesa_payments
  (shop_id, customer_id, transaction_id, checkout_request_id, phone, amount, receipt_number, status, raw_callback, created_at)
VALUES
  ('a0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000002', 'e0000000-0000-0000-0000-000000000004',
   'ws_CO_SEED000000000001', '254722111002', 1160, 'SJK4H7QW2E', 'success',
   '{"Body":{"stkCallback":{"MerchantRequestID":"seed-1","CheckoutRequestID":"ws_CO_SEED000000000001","ResultCode":0,"ResultDesc":"The service request is processed successfully.","CallbackMetadata":{"Item":[{"Name":"Amount","Value":1160},{"Name":"MpesaReceiptNumber","Value":"SJK4H7QW2E"},{"Name":"TransactionDate","Value":20260913123000},{"Name":"PhoneNumber","Value":254722111002}]}}}}',
   CURRENT_DATE - 22 + time '12:30'),
  ('a0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000003', 'e0000000-0000-0000-0000-000000000007',
   'ws_CO_SEED000000000002', '254722111003', 500, 'SJR8M2XP5T', 'success',
   '{"Body":{"stkCallback":{"MerchantRequestID":"seed-2","CheckoutRequestID":"ws_CO_SEED000000000002","ResultCode":0,"ResultDesc":"The service request is processed successfully.","CallbackMetadata":{"Item":[{"Name":"Amount","Value":500},{"Name":"MpesaReceiptNumber","Value":"SJR8M2XP5T"},{"Name":"TransactionDate","Value":20261004132000},{"Name":"PhoneNumber","Value":254722111003}]}}}}',
   CURRENT_DATE - 1 + time '13:20'),
  -- A payment from a number that matches no customer: shows the "unmatched" UI
  ('a0000000-0000-0000-0000-000000000001', NULL, NULL,
   'ws_CO_SEED000000000003', '254700999888', 200, 'SJT3B9KD1Q', 'unmatched',
   '{"Body":{"stkCallback":{"MerchantRequestID":"seed-3","CheckoutRequestID":"ws_CO_SEED000000000003","ResultCode":0,"ResultDesc":"The service request is processed successfully.","CallbackMetadata":{"Item":[{"Name":"Amount","Value":200},{"Name":"MpesaReceiptNumber","Value":"SJT3B9KD1Q"},{"Name":"TransactionDate","Value":20261004160500},{"Name":"PhoneNumber","Value":254700999888}]}}}}',
   CURRENT_DATE - 1 + time '16:05');

-- 8. One earlier SMS reminder so the Outbox is not empty ---------------------
INSERT INTO sms_messages (shop_id, customer_id, phone, body, purpose, status, provider, created_at) VALUES
  ('a0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000001', '254722111001',
   'Habari Mama Wanjiku, hii ni kumbukumbu kutoka Duka la Mama Njeri. Deni lako ni KES 500. Tafadhali lipa kupitia M-Pesa. Asante!',
   'reminder', 'sent', 'mock', CURRENT_DATE - 5 + time '10:00');

COMMIT;
