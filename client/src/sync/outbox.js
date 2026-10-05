import { useLiveQuery } from 'dexie-react-hooks';
import { api } from '../api/client.js';
import { db } from '../db/index.js';
import { isOnline, onConnectivityChange } from './connectivity.js';

/**
 * Saves a transaction to the server, or to the outbox when offline.
 *   transaction  the body for POST /api/transactions (its id was made on this device)
 *   confirm      for AI entries: the shopkeeper already pressed Confirm
 *   summary      { type, customer_name, amount } to show in the "waiting to sync" list
 * Returns { queued: true } when it went to the outbox.
 */
export async function saveOrQueue(transaction, { confirm = false, summary = {} } = {}) {
  if (isOnline()) {
    try {
      await api('/transactions', { method: 'POST', body: transaction });
      if (confirm) await api(`/transactions/${transaction.id}/confirm`, { method: 'POST' });
      return { queued: false };
    } catch (err) {
      if (err.status !== 0) throw err; // a real error (bad data): show it, don't hide it in the outbox
      // status 0 = the network dropped mid-request: fall through and queue it
    }
  }
  await db.outbox.put({ id: transaction.id, transaction, confirm, summary, createdAt: new Date().toISOString(), error: null });
  return { queued: true };
}

let syncing = false;

/**
 * Sends every waiting entry to POST /api/sync, oldest first.
 * The server answers per entry:
 *   saved / duplicate -> remove from the outbox (duplicate = it already arrived on an
 *                        earlier try whose answer we never got; nothing is double-counted)
 *   rejected          -> keep it with the error, and stop retrying it
 * If the request itself fails (still offline), everything stays for the next try.
 */
export async function syncOutbox() {
  if (syncing || !isOnline()) return;
  const waiting = (await db.outbox.orderBy('createdAt').toArray()).filter((item) => !item.error);
  if (waiting.length === 0) return;

  syncing = true;
  try {
    const { results } = await api('/sync', {
      method: 'POST',
      body: { items: waiting.map(({ transaction, confirm }) => ({ transaction, confirm })) },
    });
    for (const { id, result, error } of results) {
      if (result === 'rejected') await db.outbox.update(id, { error });
      else await db.outbox.delete(id);
    }
    const sent = results.filter((r) => r.result !== 'rejected').length;
    // Pages listen for this and reload, so synced entries appear in balances at once.
    window.dispatchEvent(new CustomEvent('duka:synced', { detail: { sent, rejected: results.length - sent } }));
  } catch {
    // Offline again or server down: try later.
  } finally {
    syncing = false;
  }
}

/** Starts automatic syncing: now, whenever we come back online, and every 20 s. */
export function startAutoSync() {
  syncOutbox();
  onConnectivityChange(() => isOnline() && syncOutbox());
  setInterval(syncOutbox, 20_000);
}

/** React hook: the outbox entries, live (re-renders when the outbox changes). */
export function useOutbox() {
  return useLiveQuery(() => db.outbox.orderBy('createdAt').toArray(), [], []);
}

export const discardFromOutbox = (id) => db.outbox.delete(id);
