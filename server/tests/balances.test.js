// API + database tests for balances, overdue status and ledger safety rules.
// Needs Postgres running with the schema loaded (npm run db:reset).
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';
import { pool } from '../db/pool.js';
import { createTestShop, kenyaDate, newId } from './helpers.js';

let shop;
const api = () => ({
  get: (url) => request(app).get(url).set('Authorization', shop.auth),
  post: (url, body) => request(app).post(url).set('Authorization', shop.auth).send(body),
});

async function newCustomer(name) {
  const res = await api().post('/api/customers', { name, phone: null });
  expect(res.status).toBe(201);
  return res.body.id;
}

async function record(tx) {
  const res = await api().post('/api/transactions', { id: newId(), ...tx });
  expect(res.status).toBe(201);
  return res.body;
}

const customer = async (id) => (await api().get(`/api/customers/${id}`)).body;

beforeAll(async () => {
  shop = await createTestShop();
});

afterAll(async () => {
  await shop.cleanup();
  await pool.end();
});

describe('customer balance', () => {
  it('= credit sales minus partial payments', async () => {
    const id = await newCustomer('Mama Wanjiku');
    await record({ type: 'credit_sale', customer_id: id, amount: 800 });
    await record({ type: 'credit_sale', customer_id: id, amount: 200 });
    await record({ type: 'payment', customer_id: id, amount: 300, method: 'mpesa' });
    await record({ type: 'payment', customer_id: id, amount: 100 });

    expect((await customer(id)).balance).toBe(600);
  });

  it('ignores voided entries', async () => {
    const id = await newCustomer('Mwalimu Njoroge');
    await record({ type: 'credit_sale', customer_id: id, amount: 285 });
    const typo = await record({ type: 'credit_sale', customer_id: id, amount: 2850 });
    expect((await customer(id)).balance).toBe(3135);

    const voided = await api().post(`/api/transactions/${typo.id}/void`);
    expect(voided.status).toBe(200);
    expect((await customer(id)).balance).toBe(285);
  });

  it('ignores AI drafts until they are confirmed', async () => {
    const id = await newCustomer('Kevo');
    const draft = await record({ type: 'credit_sale', customer_id: id, amount: 185, source: 'ai', status: 'confirmed' });
    expect(draft.status).toBe('draft'); // the server forces AI entries to draft
    expect((await customer(id)).balance).toBe(0);

    await api().post(`/api/transactions/${draft.id}/confirm`);
    expect((await customer(id)).balance).toBe(185);
  });
});

describe('overdue status (FIFO)', () => {
  it('genuinely overdue: unpaid debt past its due date', async () => {
    const id = await newCustomer('Overdue Owino');
    await record({ type: 'credit_sale', customer_id: id, amount: 800, due_date: kenyaDate(-13) });
    await record({ type: 'payment', customer_id: id, amount: 300 });

    const c = await customer(id);
    expect(c).toMatchObject({ balance: 500, overdue: true, due_date: kenyaDate(-13), days_overdue: 13 });
  });

  it('old debt paid in full, then new credit due in future -> NOT overdue', async () => {
    const id = await newCustomer('Baba Otieno');
    await record({
      type: 'credit_sale', customer_id: id, amount: 1160, due_date: kenyaDate(-25),
      created_at: new Date(Date.now() - 30 * 86_400_000).toISOString(),
    });
    await record({
      type: 'payment', customer_id: id, amount: 1160, method: 'mpesa',
      created_at: new Date(Date.now() - 22 * 86_400_000).toISOString(),
    });
    await record({ type: 'credit_sale', customer_id: id, amount: 368, due_date: kenyaDate(3) });

    const c = await customer(id);
    expect(c).toMatchObject({ balance: 368, overdue: false, due_date: kenyaDate(3) });

    // The view's naive earliest_due still points at the paid-off sale, which is
    // exactly why we do not use it for overdue status.
    const { rows } = await pool.query('SELECT earliest_due FROM customer_balances WHERE customer_id = $1', [id]);
    expect(rows[0].earliest_due).toBe(kenyaDate(-25));
  });

  it('only overdue customers appear in ?overdue=true', async () => {
    const res = await api().get('/api/customers?overdue=true');
    expect(res.body.map((c) => c.name)).toEqual(['Overdue Owino']);
  });
});

describe('ledger safety', () => {
  it('sending the same transaction id twice saves it once and moves stock once', async () => {
    const product = await api().post('/api/products', { name: 'sukari', unit: 'kg', price: 160, stock_qty: 10 });
    const tx = {
      id: newId(), type: 'cash_sale',
      items: [{ product_id: product.body.id, description: 'sukari', quantity: 2, unit_price: 160 }],
    };

    const first = await api().post('/api/transactions', tx);
    const retry = await api().post('/api/transactions', tx);
    expect(first.status).toBe(201);
    expect(retry.status).toBe(200);
    expect(first.body.amount).toBe(320); // amount = sum of items when not given

    const { rows } = await pool.query('SELECT stock_qty FROM products WHERE id = $1', [product.body.id]);
    expect(rows[0].stock_qty).toBe(8);

    await api().post(`/api/transactions/${tx.id}/void`);
    const after = await pool.query('SELECT stock_qty FROM products WHERE id = $1', [product.body.id]);
    expect(after.rows[0].stock_qty).toBe(10); // voiding a sale puts the stock back
  });

  it("another shop cannot see or use this shop's customers", async () => {
    const id = await newCustomer('Private Customer');
    const other = await createTestShop();
    try {
      const look = await request(app).get(`/api/customers/${id}`).set('Authorization', other.auth);
      expect(look.status).toBe(404);

      const sneak = await request(app).post('/api/transactions').set('Authorization', other.auth)
        .send({ id: newId(), type: 'payment', customer_id: id, amount: 100 });
      expect(sneak.status).toBe(400);
    } finally {
      await other.cleanup();
    }
  });
});

describe('AI drafts', () => {
  it('parse -> draft (not in balance) -> edit -> confirm -> no more edits', async () => {
    const id = await newCustomer('Mama Zawadi');
    // (the shop already has sukari at 160/kg from the stock test above)

    // 1. Parse: only a suggestion, nothing is written.
    const parsed = await api().post('/api/ai/parse', { text: 'Mama Zawadi amechukua sukari 2kg, atalipa Ijumaa' });
    expect(parsed.status).toBe(200);
    expect(parsed.body).toMatchObject({ basic_mode: true, raw_input: 'Mama Zawadi amechukua sukari 2kg, atalipa Ijumaa' });
    const { entry } = parsed.body;
    expect(entry).toMatchObject({ type: 'credit_sale', amount: 320 });
    expect(entry.customer_id).toBeTruthy();

    // 2. Save as a draft (what the review screen does).
    const draft = await record({
      type: entry.type, customer_id: entry.customer_id, due_date: entry.due_date, source: 'ai', raw_input: parsed.body.raw_input,
      items: entry.items.map((i) => ({ product_id: i.product_id, description: i.name, quantity: i.quantity, unit_price: i.unit_price })),
    });
    expect(draft.status).toBe('draft');
    expect((await customer(id)).balance).toBe(0);

    // 3. The shopkeeper corrects the quantity to 3 kg.
    const edited = await request(app).put(`/api/transactions/${draft.id}`).set('Authorization', shop.auth).send({
      type: 'credit_sale', customer_id: id, due_date: entry.due_date,
      items: [{ product_id: entry.items[0].product_id, description: 'sukari', quantity: 3, unit_price: 160 }],
    });
    expect(edited.status).toBe(200);
    expect(edited.body).toMatchObject({ amount: 480, status: 'draft', source: 'ai', raw_input: parsed.body.raw_input });

    // 4. Confirm: now it counts.
    await api().post(`/api/transactions/${draft.id}/confirm`);
    expect((await customer(id)).balance).toBe(480);

    // 5. A confirmed entry can only be voided, never edited.
    const late = await request(app).put(`/api/transactions/${draft.id}`).set('Authorization', shop.auth)
      .send({ type: 'credit_sale', customer_id: id, amount: 1 });
    expect(late.status).toBe(409);
  });
});
