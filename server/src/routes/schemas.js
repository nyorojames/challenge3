// Small zod building blocks shared by several routes.
import { z } from 'zod';
import { normalizePhone } from '../utils/phone.js';

// Accepts "0722 111 001", "+254722111001", ... and outputs "254722111001".
export const phoneSchema = z
  .string()
  .transform((value, ctx) => {
    const normalized = normalizePhone(value);
    if (!normalized) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Not a valid Kenyan mobile number' });
      return z.NEVER;
    }
    return normalized;
  });

// Customers may have no phone; "" from an empty form field also means none.
export const optionalPhoneSchema = z
  .union([z.literal(''), z.null(), phoneSchema])
  .optional()
  .transform((value) => value || null);

export const uuidSchema = z.string().uuid();
export const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');
export const shillingsSchema = z.number().int('Use whole shillings').min(0);

// A ledger entry as the client sends it (POST /api/transactions and POST /api/sync).
export const TRANSACTION_TYPES = ['cash_sale', 'credit_sale', 'payment', 'expense', 'restock'];

const itemSchema = z.object({
  product_id: uuidSchema.nullable().default(null), // null = free-text item, no stock tracking
  description: z.string().trim().min(1).max(100),
  quantity: z.number().positive(),
  unit_price: shillingsSchema,
});

export const transactionSchema = z
  .object({
    id: uuidSchema, // generated on the device, so offline entries never collide
    type: z.enum(TRANSACTION_TYPES),
    customer_id: uuidSchema.nullable().default(null),
    amount: z.number().int('Use whole shillings').positive().optional(), // default: sum of items
    method: z.enum(['cash', 'mpesa', 'credit']).nullable().default(null),
    due_date: dateSchema.nullable().default(null),
    note: z.string().trim().max(500).nullable().default(null),
    raw_input: z.string().max(1000).nullable().default(null),
    // 'mpesa' is reserved for the M-Pesa callback; clients cannot claim it.
    source: z.enum(['manual', 'ai']).default('manual'),
    status: z.enum(['draft', 'confirmed']).default('confirmed'),
    items: z.array(itemSchema).max(50).default([]),
    // When it happened on the device (may be hours ago if it was offline).
    created_at: z.string().datetime({ offset: true }).default(() => new Date().toISOString()),
  })
  .superRefine((tx, ctx) => {
    const problem = (path, message) => ctx.addIssue({ code: z.ZodIssueCode.custom, path: [path], message });
    if (tx.amount === undefined && tx.items.length === 0) problem('amount', 'Give an amount or at least one item');
    if (['credit_sale', 'payment'].includes(tx.type) && !tx.customer_id) {
      problem('customer_id', 'A credit sale or payment needs a customer');
    }
    if (tx.type !== 'credit_sale' && tx.method === 'credit') problem('method', "Only a credit sale can use 'credit'");
    if (tx.type !== 'credit_sale' && tx.due_date) problem('due_date', 'Only a credit sale has a due date');
  })
  .transform((tx) => ({
    ...tx,
    // A credit sale is always method 'credit'; everything else defaults to cash.
    method: tx.type === 'credit_sale' ? 'credit' : (tx.method ?? 'cash'),
    // Rule: AI suggestions are ALWAYS saved as drafts. The shopkeeper confirms them.
    status: tx.source === 'ai' ? 'draft' : tx.status,
  }));
