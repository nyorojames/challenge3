import Dexie from 'dexie';

// IndexedDB (the browser's own database), through Dexie. Two tables:
//   outbox  entries made while offline, waiting to be sent to POST /api/sync
//           { id (= the transaction's UUID), transaction, confirm, summary, createdAt, error }
//   cache   the last copy of every GET response, so pages still show data offline
//           { path, data, savedAt }
export const db = new Dexie('duka-ledger');

db.version(1).stores({
  outbox: 'id, createdAt', // listed fields are indexed; the rest are stored as-is
  cache: 'path',
});
