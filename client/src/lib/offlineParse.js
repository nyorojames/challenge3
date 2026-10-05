// Offline "basic mode": the same rules parser and grounding the server uses,
// running in the browser with the customer/product lists saved in IndexedDB.
// Returns the same shape as POST /api/ai/parse, so the review screen does not care.
import { parseWithRules } from '@server-ai/rules.js';
import { groundEntry } from '@server-ai/match.js';
import { todayInKenya } from './format.js';

export function parseOffline(text, { customers, products }) {
  return {
    entry: groundEntry(parseWithRules(text, todayInKenya()), { customers, products }),
    provider: 'rules',
    basic_mode: true,
    fallback_reason: 'offline',
    raw_input: text,
  };
}
