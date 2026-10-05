import { ZodError } from 'zod';
import { transactionSchema } from '../routes/schemas.js';
import { confirmTransaction, createTransaction, getTransaction } from './ledger.js';

/**
 * Saves a batch of entries that were recorded while the device was offline.
 *
 * Each item is { transaction, confirm }:
 *   transaction  the same body as POST /api/transactions (id made on the device)
 *   confirm      true if the shopkeeper already pressed Confirm on an AI entry
 *                while offline. The server still saves it as a draft first (AI
 *                rule), then replays that confirmation.
 *
 * Safe to send twice: ids are the device's UUIDs and createTransaction uses
 * ON CONFLICT DO NOTHING, so a retry after a dropped connection is a 'duplicate',
 * never a second sale.
 *
 * Items are handled one by one, in the order they were made, and independently:
 * one bad item ('rejected') does not stop the others.
 * Returns [{ id, result: 'saved' | 'duplicate' | 'rejected', error? }]
 */
export async function syncBatch(shopId, userId, items) {
  const results = [];
  for (const item of items) {
    const id = item.transaction?.id ?? null;
    try {
      const input = transactionSchema.parse(item.transaction);
      const { created } = await createTransaction(shopId, userId, input);
      if (item.confirm) {
        const current = await getTransaction(shopId, input.id);
        if (current.status === 'draft') await confirmTransaction(shopId, input.id);
      }
      results.push({ id, result: created ? 'saved' : 'duplicate' });
    } catch (err) {
      // Bad data will never succeed on a retry, so tell the device to stop sending it.
      // Anything else (database down, ...) is thrown, so the whole sync is retried later.
      const message = err instanceof ZodError ? err.issues.map((i) => i.message).join(', ') : err.message;
      if (err instanceof ZodError || (err.status >= 400 && err.status < 500)) {
        results.push({ id, result: 'rejected', error: message });
      } else {
        throw err;
      }
    }
  }
  return results;
}
