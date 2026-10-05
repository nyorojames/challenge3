// Proves the AI fallback: a fake local server plays Gemini/Ollama and misbehaves
// on purpose. Whatever it does, parseEntry must still return a usable entry.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import http from 'node:http';

let mode = 'ok'; // what the fake AI server does next
const goodAnswer = {
  type: 'credit_sale',
  customer_name: 'Mama Wanjiku',
  customer_id: 'made-up-id', // an LLM inventing an id: grounding must fix it
  items: [{ name: 'sugar', product_id: null, quantity: '2', unit: 'kg', unit_price: 999 }],
  amount: null,
  method: 'credit',
  due_date: '2026-10-09',
  confidence: 0.9,
  notes: '',
};

const server = http.createServer((req, res) => {
  const reply = (text) => {
    res.setHeader('Content-Type', 'application/json');
    // Answer in the format of whichever API was called.
    const body = req.url.startsWith('/api/chat')
      ? { message: { role: 'assistant', content: text }, done: true }
      : { candidates: [{ content: { parts: [{ text }] } }] };
    res.end(JSON.stringify(body));
  };
  if (mode === 'ok') return reply(JSON.stringify(goodAnswer));
  if (mode === 'fenced') return reply('```json\n' + JSON.stringify(goodAnswer) + '\n```');
  if (mode === 'garbage') return reply('Sure! Mama Wanjiku took sugar.');
  if (mode === 'wrong-shape') return reply(JSON.stringify({ type: 'gift', amount: 'lots' }));
  if (mode === 'slow') return setTimeout(() => reply(JSON.stringify(goodAnswer)), 1000);
  if (mode === 'error') { res.statusCode = 429; return res.end('{"error":"quota"}'); }
  if (mode === 'hang-up') return req.socket.destroy(); // like Wi-Fi dropping mid-request
});

let parseEntry;
const context = {
  today: '2026-10-05',
  customers: [{ id: 'd1', name: 'Mama Wanjiku' }],
  products: [{ id: 'p-sukari', name: 'sukari', unit: 'kg', price: 160 }],
};
const SENTENCE = 'Mama Wanjiku amechukua sukari 2kg, atalipa Ijumaa';

beforeAll(async () => {
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${server.address().port}`;
  // config.js reads env vars when first imported, so set them before importing.
  process.env.OLLAMA_URL = url;
  process.env.GEMINI_URL = url;
  process.env.GEMINI_API_KEY = 'test-key';
  ({ parseEntry } = await import('../src/providers/ai/index.js'));
});

afterAll(() => server.close());

describe.each(['ollama', 'gemini'])('%s provider', (provider) => {
  const run = () => parseEntry(SENTENCE, context, { provider, timeoutMs: 300 });

  it('good answer: used as-is, but ids and prices come from the shop, not the AI', async () => {
    mode = 'ok';
    const result = await run();
    expect(result).toMatchObject({ provider, basic_mode: false });
    expect(result.entry).toMatchObject({ customer_id: 'd1', amount: 320, due_date: '2026-10-09' });
    expect(result.entry.items[0]).toMatchObject({ product_id: 'p-sukari', quantity: 2, unit_price: 160 });
  });

  it('JSON wrapped in ``` fences is still accepted', async () => {
    mode = 'fenced';
    expect((await run()).basic_mode).toBe(false);
  });

  it.each(['garbage', 'wrong-shape', 'slow', 'error', 'hang-up'])('%s -> falls back to rules (basic mode)', async (failure) => {
    mode = failure;
    const result = await run();
    expect(result).toMatchObject({ provider: 'rules', basic_mode: true });
    expect(result.fallback_reason).toContain(provider);
    // The rules parser still understood the sentence.
    expect(result.entry).toMatchObject({ type: 'credit_sale', customer_id: 'd1', amount: 320, due_date: '2026-10-09' });
  });
});
