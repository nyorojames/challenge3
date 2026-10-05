// M-Pesa: phone matching and callback idempotency, plus SMS reminders.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';
import { pool } from '../db/pool.js';
import { normalizePhone } from '../src/utils/phone.js';
import { buildStkCallback } from '../src/providers/payments/mock.js';
import { reminderText } from '../src/services/reminders.js';
import { createTestShop, kenyaDate, newId } from './helpers.js';

let shop;
const as = (method, url, body) => request(app)[method](url).set('Authorization', shop.auth).send(body);
const balanceOf = async (id) => (await as('get', `/api/customers/${id}`)).body.balance;
const countPayments = async (customerId) =>
  (await pool.query("SELECT COUNT(*) AS n FROM transactions WHERE customer_id = $1 AND type = 'payment'", [customerId])).rows[0].n;

// A random phone per test run: customers.phone is unique per shop and mpesa
// phones are matched by exact value.
const randomPhone = () => `07${String(Math.floor(Math.random() * 1e8)).padStart(8, '0')}`;

async function customerOwing(name, amount, phone = randomPhone()) {
  const created = await as('post', '/api/customers', { name, phone });
  expect(created.status).toBe(201);
  await as('post', '/api/transactions', {
    id: newId(), type: 'credit_sale', customer_id: created.body.id, amount, due_date: kenyaDate(-5),
  });
  return created.body;
}

beforeAll(async () => {
  shop = await createTestShop();
});
afterAll(async () => {
  await shop.cleanup();
  await pool.end();
});

describe('phone normalization', () => {
  it.each([
    ['0722 111 001', '254722111001'],
    ['+254722111001', '254722111001'],
    ['254722111001', '254722111001'],
    ['722111001', '254722111001'],
    ['0110-123-456', '254110123456'],
    [254722111001, '254722111001'], // Daraja sends the phone as a number
    ['0622111001', null],
    ['12345', null],
  ])('%s -> %s', (input, expected) => {
    expect(normalizePhone(input)).toBe(expected);
  });
});

describe('M-Pesa STK push + callback', () => {
  it('success: matches the customer by phone and reduces the debt', async () => {
    const c = await customerOwing('Mama Wanjiku', 500);
    expect(c.phone).toMatch(/^2547\d{8}$/); // stored normalized although typed as 07...

    const push = await as('post', '/api/mpesa/stk-push', { customer_id: c.id, amount: 300 });
    expect(push.status).toBe(201);
    expect(push.body.checkout_request_id).toMatch(/^ws_CO_/);

    const sim = await as('post', '/api/mpesa/simulate', { checkout_request_id: push.body.checkout_request_id, action: 'confirm' });
    expect(sim.body).toMatchObject({ outcome: 'success', duplicate: false });
    expect(sim.body.payment.transaction_id).toBeTruthy();
    expect(await balanceOf(c.id)).toBe(200);

    // The raw Daraja body is stored for debugging.
    const { rows } = await pool.query('SELECT raw_callback FROM mpesa_payments WHERE id = $1', [sim.body.payment.id]);
    expect(rows[0].raw_callback.Body.stkCallback.ResultCode).toBe(0);
  });

  it('idempotent: the same callback twice creates ONE payment', async () => {
    const c = await customerOwing('Baba Otieno', 1000);
    const push = await as('post', '/api/mpesa/stk-push', { customer_id: c.id, amount: 400 });
    const callback = buildStkCallback({
      merchantRequestId: 'm-1', checkoutRequestId: push.body.checkout_request_id, confirmed: true, amount: 400, phone: c.phone,
    });

    // Daraja calls the public URL (no login) and may retry.
    const first = await request(app).post('/api/mpesa/callback').send(callback);
    const again = await request(app).post('/api/mpesa/callback').send(callback);
    expect(first.body).toEqual({ ResultCode: 0, ResultDesc: 'Accepted' });
    expect(again.body).toEqual({ ResultCode: 0, ResultDesc: 'Accepted' });

    expect(await countPayments(c.id)).toBe(1);
    expect(await balanceOf(c.id)).toBe(600);
  });

  it('idempotent even when two copies arrive at the same moment', async () => {
    const c = await customerOwing('Mzee Kamau', 1000);
    const push = await as('post', '/api/mpesa/stk-push', { customer_id: c.id, amount: 250 });
    const callback = buildStkCallback({
      merchantRequestId: 'm-2', checkoutRequestId: push.body.checkout_request_id, confirmed: true, amount: 250, phone: c.phone,
    });
    await Promise.all([1, 2, 3].map(() => request(app).post('/api/mpesa/callback').send(callback)));
    expect(await countPayments(c.id)).toBe(1);
    expect(await balanceOf(c.id)).toBe(750);
  });

  it('"resend last callback" reports a duplicate and changes nothing', async () => {
    const c = await customerOwing('Chebet', 365);
    const push = await as('post', '/api/mpesa/stk-push', { customer_id: c.id, amount: 365 });
    await as('post', '/api/mpesa/simulate', { checkout_request_id: push.body.checkout_request_id, action: 'confirm' });

    const resend = await as('post', '/api/mpesa/resend-last');
    expect(resend.body).toMatchObject({ outcome: 'success', duplicate: true });
    expect(await countPayments(c.id)).toBe(1);
    expect(await balanceOf(c.id)).toBe(0);
  });

  it('cancel (ResultCode 1032): marked failed, debt unchanged', async () => {
    const c = await customerOwing('Kevo', 185);
    const push = await as('post', '/api/mpesa/stk-push', { customer_id: c.id, amount: 185 });
    const sim = await as('post', '/api/mpesa/simulate', { checkout_request_id: push.body.checkout_request_id, action: 'cancel' });
    expect(sim.body.outcome).toBe('failed');
    expect(sim.body.callback.Body.stkCallback.ResultCode).toBe(1032);
    expect(await balanceOf(c.id)).toBe(185);
  });

  it('unknown phone -> unmatched; the shopkeeper assigns it; balance drops', async () => {
    const c = await customerOwing('Akinyi', 600);
    const push = await as('post', '/api/mpesa/stk-push', { phone: '0799 000 111', amount: 200 }); // a walk-in number
    const sim = await as('post', '/api/mpesa/simulate', { checkout_request_id: push.body.checkout_request_id, action: 'confirm' });
    expect(sim.body).toMatchObject({ outcome: 'unmatched' });
    expect(sim.body.payment.transaction_id).toBeNull();

    const unmatched = await as('get', '/api/mpesa/payments?status=unmatched');
    expect(unmatched.body.map((p) => p.id)).toContain(sim.body.payment.id);

    const assigned = await as('post', `/api/mpesa/payments/${sim.body.payment.id}/assign`, { customer_id: c.id });
    expect(assigned.body).toMatchObject({ status: 'success', customer_id: c.id });
    expect(await balanceOf(c.id)).toBe(400);

    // Assigning twice is refused (no double payment).
    const twice = await as('post', `/api/mpesa/payments/${sim.body.payment.id}/assign`, { customer_id: c.id });
    expect(twice.status).toBe(409);
  });

  it('a callback for a request we never made is acknowledged and ignored', async () => {
    const callback = buildStkCallback({ merchantRequestId: 'x', checkoutRequestId: 'ws_CO_NOPE', confirmed: true, amount: 1, phone: '254700000000' });
    const res = await request(app).post('/api/mpesa/callback').send(callback);
    expect(res.body.ResultCode).toBe(0);
  });
});

describe('SMS reminders', () => {
  it('reminder text has the name, balance and shop, and fits one SMS', () => {
    const sw = reminderText({ customerName: 'Mama Wanjiku', balance: 1150, dueDate: '2026-09-22', shopName: 'Duka la Mama Njeri', language: 'sw' });
    expect(sw).toContain('Mama Wanjiku');
    expect(sw).toContain('KES 1,150');
    expect(sw).toContain('Duka la Mama Njeri');
    expect(sw).toContain('22 Sep');
    expect(sw.length).toBeLessThanOrEqual(160);
    const en = reminderText({ customerName: 'Mama Wanjiku', balance: 1150, dueDate: null, shopName: 'Duka la Mama Njeri', language: 'en' });
    expect(en).toMatch(/^Hello Mama Wanjiku/);
  });

  it('remind one customer -> saved in the outbox; no debt -> refused', async () => {
    const c = await customerOwing('Mwalimu Njoroge', 285);
    const sent = await as('post', `/api/sms/remind/${c.id}`);
    expect(sent.status).toBe(201);
    expect(sent.body).toMatchObject({ phone: c.phone, status: 'sent', provider: 'mock' });
    expect(sent.body.body).toContain('285');

    const paidUp = (await as('post', '/api/customers', { name: 'Fatuma', phone: randomPhone() })).body;
    expect((await as('post', `/api/sms/remind/${paidUp.id}`)).status).toBe(400);

    const outbox = await as('get', '/api/sms/messages');
    expect(outbox.body[0]).toMatchObject({ customer_name: 'Mwalimu Njoroge' });
  });

  it('remind all overdue: only overdue customers, and not twice in a row', async () => {
    const first = await as('post', '/api/sms/remind-overdue');
    const names = first.body.sent.map((m) => m.body);
    expect(names.some((body) => body.includes('Mwalimu Njoroge'))).toBe(false); // reminded a moment ago
    expect(first.body.skipped).toContainEqual({ name: 'Mwalimu Njoroge', reason: 'reminded_recently' });
    expect(first.body.sent.length).toBeGreaterThan(0);

    const second = await as('post', '/api/sms/remind-overdue');
    expect(second.body.sent).toHaveLength(0);
  });
});
