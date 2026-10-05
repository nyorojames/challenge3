// Picks the AI provider (AI_PROVIDER = gemini | ollama | rules) and guarantees an answer.
//
//   sentence ─► provider (Gemini/Ollama) ─► zod check ─► groundEntry ─► entry
//                    │ error / >5 s / bad JSON
//                    └────────────► rules parser ──────► groundEntry ─► entry (basic_mode)
//
// The rules parser cannot fail, so the demo never breaks because of the AI or the internet.
import { readFileSync } from 'node:fs';
import { z } from 'zod';
import { config } from '../../config.js';
import { ENGLISH_DAY_NAMES, weekdayOf } from '../../utils/swahiliDates.js';
import { askGemini } from './gemini.js';
import { askOllama } from './ollama.js';
import { groundEntry } from './match.js';
import { parseWithRules } from './rules.js';

const PROVIDERS = { gemini: askGemini, ollama: askOllama };
const PROMPT_TEMPLATE = readFileSync(new URL('./prompt.txt', import.meta.url), 'utf8');

// What we accept from an LLM. Lenient on format ("300" -> 300, "" -> null), strict on meaning.
const emptyToNull = (value) => (value === '' || value === undefined ? null : value);
const optionalNumber = z.preprocess((v) => (emptyToNull(v) === null ? null : Number(v)), z.number().finite().nullable());
const optionalText = z.preprocess(emptyToNull, z.string().nullable());

export const llmEntrySchema = z.object({
  type: z.enum(['cash_sale', 'credit_sale', 'payment', 'expense', 'restock']),
  customer_name: optionalText,
  customer_id: optionalText,
  items: z
    .array(
      z.object({
        name: z.string().min(1),
        product_id: optionalText,
        quantity: optionalNumber,
        unit: optionalText,
        unit_price: optionalNumber,
      })
    )
    .default([]),
  amount: optionalNumber,
  method: z.preprocess(emptyToNull, z.enum(['cash', 'mpesa', 'credit']).nullable()),
  due_date: z.preprocess(emptyToNull, z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable()),
  confidence: optionalNumber.transform((v) => v ?? 0.5),
  notes: optionalText,
});

export function buildPrompt(context) {
  const fill = {
    shop_name: context.shopName ?? 'the shop',
    today: context.today,
    weekday: ENGLISH_DAY_NAMES[weekdayOf(context.today)],
    timezone: 'Africa/Nairobi',
    language_name: context.language === 'en' ? 'English' : 'Swahili',
    customers: context.customers.map((c) => `${c.id} | ${c.name}`).join('\n') || '(none yet)',
    products: context.products.map((p) => `${p.id} | ${p.name} | ${p.unit} | ${p.price}`).join('\n') || '(none yet)',
  };
  return PROMPT_TEMPLATE.replace(/\{\{(\w+)\}\}/g, (_, key) => fill[key] ?? '');
}

function withRules(text, context, reason) {
  return {
    entry: groundEntry(parseWithRules(text, context.today), context),
    provider: 'rules',
    basic_mode: true,
    fallback_reason: reason,
  };
}

/**
 * @param text    the shopkeeper's sentence
 * @param context { today, shopName, language, customers: [{id,name}], products: [{id,name,unit,price}] }
 * @param options { provider, timeoutMs } (defaults from .env; tests override them)
 * @returns { entry, provider, basic_mode, fallback_reason }
 */
export async function parseEntry(text, context, options = {}) {
  const provider = options.provider ?? config.AI_PROVIDER;
  const timeoutMs = options.timeoutMs ?? config.AI_TIMEOUT_MS;

  if (provider === 'rules') return withRules(text, context, null);

  try {
    // AbortSignal.timeout cancels the HTTP request if the model is too slow.
    const raw = await PROVIDERS[provider](buildPrompt(context), text, AbortSignal.timeout(timeoutMs));
    const checked = llmEntrySchema.parse(raw); // throws if the shape is wrong
    return { entry: groundEntry(checked, context), provider, basic_mode: false, fallback_reason: null };
  } catch (err) {
    const reason =
      err.name === 'TimeoutError' ? `no answer within ${timeoutMs / 1000}s`
      : err instanceof z.ZodError ? 'answer was not a valid entry'
      : err instanceof SyntaxError ? 'answer was not JSON'
      : err.message === 'fetch failed' ? 'could not connect' // not running, or no internet
      : err.message;
    console.warn(`[ai] ${provider} failed (${reason}); using rules parser`);
    return withRules(text, context, `${provider}: ${reason}`);
  }
}
