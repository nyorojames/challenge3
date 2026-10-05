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
