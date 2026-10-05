import { pool } from '../../db/pool.js';
import { HttpError } from '../middleware/errors.js';
import { sms } from '../providers/sms/index.js';
import { getCustomerSummaries } from './ledger.js';

const MONTHS_SW = ['Jan', 'Feb', 'Mac', 'Apr', 'Mei', 'Jun', 'Jul', 'Ago', 'Sep', 'Okt', 'Nov', 'Des'];
const MONTHS_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// '2026-09-22' -> "22 Sep" (short, so the SMS stays in one 160-character part)
function shortDate(iso, language) {
  const [, month, day] = iso.split('-').map(Number);
  return `${day} ${(language === 'en' ? MONTHS_EN : MONTHS_SW)[month - 1]}`;
}

/**
 * Short, polite reminder in the shop's language, with the balance and shop name.
 * Kept under 160 characters where possible (one SMS = cheapest with a real gateway).
 */
export function reminderText({ customerName, balance, dueDate, shopName, language }) {
  const amount = `KES ${balance.toLocaleString('en-KE')}`;
  if (language === 'en') {
    const due = dueDate ? ` (due ${shortDate(dueDate, 'en')})` : '';
    return `Hello ${customerName}, a kind reminder from ${shopName}: your balance is ${amount}${due}. You can pay by M-Pesa. Thank you!`;
  }
  const due = dueDate ? ` (tarehe ${shortDate(dueDate, 'sw')})` : '';
  return `Habari ${customerName}, kumbukumbu kutoka ${shopName}: deni lako ni ${amount}${due}. Unaweza kulipa kwa M-Pesa. Asante!`;
}

async function loadShop(shopId) {
  const { rows } = await pool.query('SELECT name, language FROM shops WHERE id = $1', [shopId]);
  return rows[0];
}

async function remind(shop, shopId, customer) {
  const body = reminderText({
    customerName: customer.name,
    balance: customer.balance,
    dueDate: customer.due_date,
    shopName: shop.name,
    language: shop.language,
  });
  return sms.sendSms({ shopId, customerId: customer.id, phone: customer.phone, body, purpose: 'reminder' });
}

/** The "Remind" button on a customer page. */
export async function remindCustomer(shopId, customerId) {
  const [customer] = await getCustomerSummaries(shopId, customerId);
  if (!customer) throw new HttpError(404, 'Customer not found');
  if (!customer.phone) throw new HttpError(400, 'This customer has no phone number');
  if (customer.balance <= 0) throw new HttpError(400, 'This customer has no debt');
  return remind(await loadShop(shopId), shopId, customer);
}

/**
 * "Remind all overdue". Skips customers without a phone, and anyone already
 * reminded in the last 20 hours, so pressing the button twice doesn't spam people.
 */
export async function remindAllOverdue(shopId) {
  const shop = await loadShop(shopId);
  const overdue = (await getCustomerSummaries(shopId)).filter((c) => c.overdue);
  const { rows: recent } = await pool.query(
    `SELECT DISTINCT customer_id FROM sms_messages
      WHERE shop_id = $1 AND purpose = 'reminder' AND created_at > now() - interval '20 hours'`,
    [shopId]
  );
  const remindedRecently = new Set(recent.map((r) => r.customer_id));

  const sent = [];
  const skipped = [];
  for (const customer of overdue) {
    if (!customer.phone) skipped.push({ name: customer.name, reason: 'no_phone' });
    else if (remindedRecently.has(customer.id)) skipped.push({ name: customer.name, reason: 'reminded_recently' });
    else sent.push(await remind(shop, shopId, customer));
  }
  return { sent, skipped };
}
