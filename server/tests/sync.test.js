// Offline sync: a batch made on the device is saved once, in order, and a
// retry of the same batch changes nothing.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';
import { pool } from '../db/pool.js';
import { createTestShop, newId } from './helpers.js';

let shop;
const as = (method, url, body) => request(app)[method](url).set('Authorization', shop.auth).send(body);

beforeAll(async () => {
  shop = await createTestShop();
});
afterAll(async () => {
  await shop.cleanup();
  await pool.end();
});

describe('POST /api/sync', () => {
  it('saves offline entries once, keeps device time, and survives a retry', async () => {
    const customer = (await as('post', '/api/customers', { name: 'Mama Wanjiku' })).body;
    const product = (await as('post', '/api/products', { name: 'sukari', unit: 'kg', price: 160, stock_qty: 10 })).body;
    const madeOffline = '2026-10-05T07:15:00.000Z'; // 10:15 in Nairobi, hours before syncing

    const items = [
      // Manual credit sale typed while offline
      { transaction: { id: newId(), type: 'credit_sale', customer_id: customer.id, created_at: madeOffline,
        items: [{ product_id: product.id, description: 'sukari', quantity: 2, unit_price: 160 }] } },
      // AI entry (rules parser in the browser) that the shopkeeper confirmed offline
      { transaction: { id: newId(), type: 'payment', customer_id: customer.id, amount: 100, source: 'ai', raw_input: 'Mama Wanjiku amelipa 100' }, confirm: true },
      // AI entry NOT confirmed yet: stays a draft
      { transaction: { id: newId(), type: 'payment', customer_id: customer.id, amount: 50, source: 'ai' } },
      // Broken entry (no customer): rejected, but does not block the others
      { transaction: { id: newId(), type: 'credit_sale', amount: 999 } },
    ];

    const first = await as('post', '/api/sync', { items });
    expect(first.status).toBe(200);
    expect(first.body.results.map((r) => r.result)).toEqual(['saved', 'saved', 'saved', 'rejected']);
    expect(first.body.results[3].error).toMatch(/customer/i);

    const after = (await as('get', `/api/customers/${customer.id}`)).body;
    expect(after.balance).toBe(320 - 100); // the confirmed AI payment counts, the draft does not
    const sale = after.history.find((h) => h.type === 'credit_sale');
    expect(new Date(sale.created_at).toISOString()).toBe(madeOffline); // when it happened
    expect(new Date(sale.synced_at) > new Date(sale.created_at)).toBe(true); // when the server got it
    expect(after.history.find((h) => h.amount === 50).status).toBe('draft');

    // The connection dropped before the phone saw the answer, so it sends everything again.
    const retry = await as('post', '/api/sync', { items });
    expect(retry.body.results.map((r) => r.result)).toEqual(['duplicate', 'duplicate', 'duplicate', 'rejected']);
    expect((await as('get', `/api/customers/${customer.id}`)).body.balance).toBe(220);
    const stock = await pool.query('SELECT stock_qty FROM products WHERE id = $1', [product.id]);
    expect(stock.rows[0].stock_qty).toBe(8); // moved once, not twice
  });

  it('rejects a malformed request as a whole', async () => {
    expect((await as('post', '/api/sync', { items: 'nope' })).status).toBe(400);
  });
});
