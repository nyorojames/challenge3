import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client.js';
import { useT } from '../i18n/index.jsx';
import { newId } from '../lib/ids.js';
import { parseOffline } from '../lib/offlineParse.js';
import { isOnline } from '../sync/connectivity.js';
import { saveOrQueue } from '../sync/outbox.js';
import EntryForm from './EntryForm.jsx';

// Tap-to-try sentences for the demo (they are data, so not translated).
const EXAMPLES = [
  'Mama Wanjiku amechukua sukari 2kg na mafuta, atalipa Ijumaa',
  'Kevo amechukua soda mbili na mikate 2, atanipa kesho',
  'Mzee Kamau amelipa 500 kwa mpesa',
  'sold 2 bread and 6 eggs',
  'nimelipa nauli 200',
];

const NEEDS_CUSTOMER = ['credit_sale', 'payment'];
const sumItems = (items) => items.reduce((sum, i) => sum + Math.round(i.quantity * i.unit_price), 0);

// Turn the AI's entry into the fields POST/PUT /api/transactions expects.
function entryToTransaction(entry) {
  return {
    type: entry.type,
    customer_id: entry.customer_id,
    amount: entry.amount ?? undefined,
    method: entry.method,
    due_date: entry.due_date,
    note: entry.type === 'expense' ? entry.notes : null,
    items: entry.items.map((i) => ({
      product_id: i.product_id,
      description: i.name,
      quantity: i.quantity,
      unit_price: i.unit_price, // null for an item not in the price list: the shopkeeper sets it
    })),
  };
}

/**
 * The "Rational" part: the shopkeeper types a sentence, the server's AI reads it,
 * and the result is saved as a DRAFT. Nothing reaches the ledger until the
 * shopkeeper presses Confirm.
 */
export default function AiEntry({ customers, products, onDraftsChanged }) {
  const { t } = useT();
  const navigate = useNavigate();
  const [text, setText] = useState('');
  const [parsing, setParsing] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null); // { entry, provider, basic_mode, raw_input, ... }
  const [draftId, setDraftId] = useState(null); // set once the draft is saved on the server
  const [happenedAt, setHappenedAt] = useState(null);

  const parse = async (sentence) => {
    setParsing(true);
    setError(null);
    setResult(null);
    setDraftId(null);
    try {
      // Online: the server's AI (with its own fallback). Offline, or the request
      // fails for lack of network: the same rules parser, here in the browser.
      let parsed = null;
      if (isOnline()) {
        try {
          parsed = await api('/ai/parse', { method: 'POST', body: { text: sentence } });
        } catch (err) {
          if (err.status !== 0) throw err;
        }
      }
      parsed ??= parseOffline(sentence, { customers, products });
      const now = new Date().toISOString();
      setHappenedAt(now);
      setResult(parsed);

      // Save it as a draft right away when it is complete enough. If the customer
      // is new/unknown or an item has no price, the shopkeeper completes it first
      // (the draft is then saved on Confirm).
      const { entry } = parsed;
      const complete =
        entry.amount > 0 &&
        (!NEEDS_CUSTOMER.includes(entry.type) || entry.customer_id) &&
        entry.items.every((i) => i.unit_price != null);
      if (complete && isOnline()) {
        const id = newId();
        await api('/transactions', {
          method: 'POST',
          body: { id, ...entryToTransaction(entry), source: 'ai', raw_input: parsed.raw_input, created_at: now },
        });
        setDraftId(id);
        onDraftsChanged?.(id);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setParsing(false);
    }
  };

  const confirm = async ({ new_customer_name, ...fields }) => {
    if (!isOnline()) {
      // Offline: queue it. "confirm: true" tells the server the shopkeeper already
      // confirmed this AI entry on the device; it is saved as a draft, then confirmed.
      if (new_customer_name) throw new Error(t('offline.need_online_customer'));
      if (draftId) throw new Error(t('offline.need_online_draft'));
      const customerName = customers.find((c) => c.id === fields.customer_id)?.name ?? null;
      await saveOrQueue(
        { id: newId(), ...fields, source: 'ai', raw_input: result.raw_input, created_at: happenedAt },
        { confirm: true, summary: { type: fields.type, customer_name: customerName, amount: fields.amount ?? sumItems(fields.items) } }
      );
      navigate('/');
      return;
    }
    if (new_customer_name) {
      const customer = await api('/customers', { method: 'POST', body: { name: new_customer_name } });
      fields.customer_id = customer.id;
    }
    let id = draftId;
    if (id) {
      await api(`/transactions/${id}`, { method: 'PUT', body: fields }); // save the shopkeeper's edits
    } else {
      id = newId();
      await api('/transactions', {
        method: 'POST',
        body: { id, ...fields, source: 'ai', raw_input: result.raw_input, created_at: happenedAt },
      });
    }
    await api(`/transactions/${id}/confirm`, { method: 'POST' });
    navigate(fields.customer_id ? `/customers/${fields.customer_id}` : '/');
  };

  const discard = async () => {
    if (draftId) await api(`/transactions/${draftId}/void`, { method: 'POST' });
    setResult(null);
    setDraftId(null);
    onDraftsChanged?.(null);
  };

  const entry = result?.entry;
  const unknownItems = entry?.items.filter((i) => !i.product_id).map((i) => i.name) ?? [];

  return (
    <div className="space-y-4">
      <form
        onSubmit={(e) => { e.preventDefault(); parse(text); }}
        className="space-y-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3"
      >
        <label htmlFor="ai-text" className="text-sm font-semibold text-emerald-900">{t('ai.title')}</label>
        <textarea
          id="ai-text" rows={3} value={text} onChange={(e) => setText(e.target.value)}
          placeholder={t('ai.placeholder')}
          className="w-full rounded-lg border border-emerald-300 bg-white px-3 py-2"
        />
        <button disabled={parsing || text.trim().length < 2} className="w-full rounded-lg bg-emerald-700 py-2.5 font-semibold text-white disabled:opacity-50">
          {parsing ? t('ai.parsing') : t('ai.parse')}
        </button>
        <div className="flex flex-wrap gap-1.5 pt-1">
          <span className="text-xs text-emerald-900">{t('ai.try')}</span>
          {EXAMPLES.map((example) => (
            <button
              type="button" key={example} onClick={() => { setText(example); parse(example); }}
              className="rounded-full bg-white px-2 py-0.5 text-left text-xs text-emerald-800 ring-1 ring-emerald-200 hover:bg-emerald-100"
            >
              {example}
            </button>
          ))}
        </div>
      </form>

      {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}

      {entry && (
        <section className="space-y-3 rounded-xl border-2 border-dashed border-sky-300 bg-white p-3">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="rounded bg-sky-100 px-2 py-0.5 font-semibold text-sky-800">{t('customer.draft')}</span>
            {result.basic_mode ? (
              <span title={result.fallback_reason ?? ''} className="rounded bg-amber-100 px-2 py-0.5 font-semibold text-amber-800">
                ⚙ {t('ai.basic_mode')}
              </span>
            ) : (
              <span className="rounded bg-violet-100 px-2 py-0.5 font-semibold text-violet-800">✨ AI · {result.provider}</span>
            )}
            <span className={`rounded px-2 py-0.5 ${entry.confidence < 0.6 ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-600'}`}>
              {t('ai.confidence', { pct: Math.round(entry.confidence * 100) })}
            </span>
            <span className="text-slate-500">{draftId ? `✓ ${t('ai.saved_draft')}` : t('ai.not_saved')}</span>
          </div>

          <p className="text-sm italic text-slate-600">“{result.raw_input}”</p>
          {result.basic_mode && (
            <p className="text-xs text-amber-800">
              {result.fallback_reason === 'offline' ? t('offline.parsed_offline') : t('ai.basic_mode_hint')}
            </p>
          )}

          {entry.confidence < 0.6 && <p className="rounded bg-red-50 p-2 text-sm text-red-700">{t('ai.low_confidence')}</p>}
          {entry.new_customer && (
            <p className="rounded bg-amber-50 p-2 text-sm text-amber-900">{t('ai.new_customer', { name: entry.customer_name })}</p>
          )}
          {unknownItems.length > 0 && (
            <p className="rounded bg-amber-50 p-2 text-sm text-amber-900">{t('ai.unknown_items', { names: unknownItems.join(', ') })}</p>
          )}
          {entry.notes && entry.type !== 'expense' && <p className="text-sm text-slate-600">{t('ai.notes', { notes: entry.notes })}</p>}

          <EntryForm
            key={result.raw_input + happenedAt} // fresh form for each new sentence
            customers={customers}
            products={products}
            initial={{ ...entryToTransaction(entry), customer_id: entry.customer_id }}
            newCustomerName={entry.new_customer ? entry.customer_name : null}
            submitLabel={t('ai.confirm')}
            onSubmit={confirm}
            secondaryAction={
              <button type="button" onClick={discard} className="rounded-xl px-4 py-3 font-semibold text-slate-600 ring-1 ring-slate-300">
                {t('ai.discard')}
              </button>
            }
          />
        </section>
      )}
    </div>
  );
}
