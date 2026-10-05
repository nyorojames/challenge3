import { useState } from 'react';
import { useT } from '../i18n/index.jsx';
import { formatKES } from '../lib/format.js';
import { newId } from '../lib/ids.js';

const TYPES = ['cash_sale', 'credit_sale', 'payment', 'expense', 'restock'];

// Which parts of the form each type needs (mirrors the server's zod rules).
const USES_ITEMS = ['cash_sale', 'credit_sale', 'restock'];
const NEEDS_CUSTOMER = ['credit_sale', 'payment'];
const NEW_CUSTOMER = '__new__';

const toItemState = (item = {}) => ({
  key: newId(),
  product_id: item.product_id ?? '',
  description: item.description ?? '', // kept for items not in the product list ("mandazi")
  quantity: String(item.quantity ?? 1),
  unit_price: item.unit_price == null ? '' : String(item.unit_price),
});

/**
 * The entry form, used twice:
 *   - manual entry (empty form)
 *   - reviewing an AI draft (pre-filled from what the AI understood)
 *
 * Props:
 *   customers, products  lists from the API
 *   initial              { type, customer_id, items, amount, method, due_date, note }
 *   newCustomerName      e.g. "Mama Akoth": adds "+ New customer: Mama Akoth" to the customer list
 *   submitLabel          text on the main button
 *   onSubmit(body)       receives the transaction fields; body.new_customer_name is set if
 *                        the shopkeeper chose to create the new customer
 *   secondaryAction      optional extra button (e.g. "Discard")
 */
export default function EntryForm({ customers, products, initial = {}, newCustomerName = null, submitLabel, onSubmit, secondaryAction }) {
  const { t } = useT();
  const initialItems = initial.items?.length ? initial.items.map(toItemState) : [toItemState()];
  const initialItemsTotal = initialItems.reduce((sum, i) => sum + Math.round(Number(i.quantity) * Number(i.unit_price || 0)), 0);

  const [type, setType] = useState(TYPES.includes(initial.type) ? initial.type : 'cash_sale');
  const [customerId, setCustomerId] = useState(initial.customer_id ?? (newCustomerName ? NEW_CUSTOMER : ''));
  const [items, setItems] = useState(initialItems);
  // An AI total that differs from the items (e.g. "kwa 300") starts in the "different total" box.
  const [totalOverride, setTotalOverride] = useState(
    USES_ITEMS.includes(initial.type) && initial.amount && initial.amount !== initialItemsTotal ? String(initial.amount) : ''
  );
  const [amount, setAmount] = useState(!USES_ITEMS.includes(initial.type) && initial.amount ? String(initial.amount) : '');
  const [method, setMethod] = useState(initial.method === 'mpesa' ? 'mpesa' : 'cash');
  const [dueDate, setDueDate] = useState(initial.due_date ?? '');
  const [note, setNote] = useState(initial.note ?? '');
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  const productById = Object.fromEntries(products.map((p) => [p.id, p]));
  const usesItems = USES_ITEMS.includes(type);
  const chosenItems = items.filter((item) => (item.product_id || item.description) && Number(item.quantity) > 0);
  // Same rounding rule as the server: whole shillings per line.
  const itemsTotal = chosenItems.reduce((sum, i) => sum + Math.round(Number(i.quantity) * Number(i.unit_price || 0)), 0);
  const finalAmount = usesItems ? Number(totalOverride) || itemsTotal : Number(amount) || 0;

  const updateItem = (key, changes) => setItems((list) => list.map((i) => (i.key === key ? { ...i, ...changes } : i)));

  const chooseProduct = (key, productId) => {
    const product = productById[productId];
    // Sales default to the selling price. For a restock the shopkeeper types
    // what they paid the supplier, so the price starts empty.
    updateItem(key, { product_id: productId, description: '', unit_price: type === 'restock' ? '' : String(product?.price ?? '') });
  };

  const submit = async (event) => {
    event.preventDefault();
    setError(null);
    if (NEEDS_CUSTOMER.includes(type) && !customerId) return setError(t('entry.need_customer'));
    if (finalAmount <= 0) return setError(t('entry.need_amount'));

    const creatingCustomer = customerId === NEW_CUSTOMER;
    const body = {
      type,
      customer_id: NEEDS_CUSTOMER.includes(type) && !creatingCustomer ? customerId : null,
      new_customer_name: NEEDS_CUSTOMER.includes(type) && creatingCustomer ? newCustomerName : null,
      method: type === 'credit_sale' ? 'credit' : method,
      due_date: type === 'credit_sale' && dueDate ? dueDate : null,
      note: note.trim() || null,
      items: usesItems
        ? chosenItems.map((i) => ({
            product_id: i.product_id || null,
            description: productById[i.product_id]?.name ?? i.description,
            quantity: Number(i.quantity),
            unit_price: Math.round(Number(i.unit_price || 0)),
          }))
        : [],
      // Leave amount out for item-based entries so the server sums the items,
      // unless the shopkeeper typed a different total (discount).
      amount: usesItems ? Number(totalOverride) || undefined : finalAmount,
    };

    setSaving(true);
    try {
      await onSubmit(body);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const input = 'w-full rounded-lg border border-slate-300 px-3 py-2';

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        {TYPES.map((key) => (
          <button
            type="button" key={key} onClick={() => setType(key)}
            className={`rounded-lg px-2 py-2 text-sm font-medium ${type === key ? 'bg-emerald-700 text-white' : 'bg-white text-slate-700 ring-1 ring-slate-200'}`}
          >
            {t(`tx.${key}`)}
          </button>
        ))}
      </div>

      {NEEDS_CUSTOMER.includes(type) && (
        <label className="block">
          <span className="text-sm text-slate-600">{t('entry.customer')}</span>
          <select value={customerId} onChange={(e) => setCustomerId(e.target.value)} className={`${input} mt-1 bg-white`}>
            <option value="">{t('entry.choose_customer')}</option>
            {newCustomerName && <option value={NEW_CUSTOMER}>{t('ai.create_customer', { name: newCustomerName })}</option>}
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}{c.balance > 0 ? ` (${formatKES(c.balance)})` : ''}
              </option>
            ))}
          </select>
        </label>
      )}

      {usesItems && (
        <fieldset className="space-y-2 rounded-xl border border-slate-200 bg-white p-3">
          <legend className="px-1 text-sm text-slate-600">{t('entry.items')}</legend>
          {items.map((item) => {
            const product = productById[item.product_id];
            return (
              <div key={item.key} className="grid grid-cols-12 items-end gap-2">
                <select
                  value={item.product_id} onChange={(e) => chooseProduct(item.key, e.target.value)}
                  className={`${input} col-span-12 bg-white sm:col-span-5 ${!item.product_id && item.description ? 'border-amber-400 bg-amber-50' : ''}`}
                >
                  {/* An item the AI found but the shop doesn't stock is kept as free text. */}
                  <option value="">{item.description ? t('ai.unknown_item', { name: item.description }) : t('entry.choose_product')}</option>
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>{p.name} — {formatKES(p.price)}/{p.unit}</option>
                  ))}
                </select>
                <label className="col-span-4 sm:col-span-2">
                  <span className="text-xs text-slate-500">{t('entry.qty')}{product ? ` (${product.unit})` : ''}</span>
                  <input
                    inputMode="decimal" value={item.quantity}
                    onChange={(e) => updateItem(item.key, { quantity: e.target.value })} className={input}
                  />
                </label>
                <label className="col-span-5 sm:col-span-3">
                  <span className="text-xs text-slate-500">{type === 'restock' ? t('entry.cost') : t('entry.price')}</span>
                  <input
                    inputMode="numeric" value={item.unit_price}
                    onChange={(e) => updateItem(item.key, { unit_price: e.target.value })} className={input}
                  />
                </label>
                <button
                  type="button" onClick={() => setItems((list) => (list.length > 1 ? list.filter((i) => i.key !== item.key) : [toItemState()]))}
                  className="col-span-3 py-2 text-sm text-slate-400 hover:text-red-600 sm:col-span-2"
                >
                  {t('common.remove')}
                </button>
              </div>
            );
          })}
          <button type="button" onClick={() => setItems((list) => [...list, toItemState()])} className="text-sm font-semibold text-emerald-700">
            {t('entry.add_item')}
          </button>
          <div className="flex items-center justify-between border-t border-slate-100 pt-2 text-sm">
            <span className="text-slate-600">{t('entry.items_total')}</span>
            <span className="font-semibold tabular-nums">{formatKES(itemsTotal)}</span>
          </div>
          {type !== 'restock' && (
            <label className="block">
              <span className="text-xs text-slate-500">{t('entry.total_override')}</span>
              <input inputMode="numeric" value={totalOverride} onChange={(e) => setTotalOverride(e.target.value)} className={input} />
            </label>
          )}
        </fieldset>
      )}

      {!usesItems && (
        <label className="block">
          <span className="text-sm text-slate-600">{t('entry.amount')}</span>
          <input
            inputMode="numeric" required value={amount} onChange={(e) => setAmount(e.target.value)}
            className={`${input} mt-1 text-lg`}
          />
        </label>
      )}

      {type === 'credit_sale' ? (
        <label className="block">
          <span className="text-sm text-slate-600">{t('entry.due_date')} ({t('common.optional')})</span>
          <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className={`${input} mt-1 bg-white`} />
        </label>
      ) : (
        <div>
          <span className="text-sm text-slate-600">{t('entry.method')}</span>
          <div className="mt-1 grid grid-cols-2 gap-2">
            {['cash', 'mpesa'].map((key) => (
              <button
                type="button" key={key} onClick={() => setMethod(key)}
                className={`rounded-lg py-2 text-sm font-medium ${method === key ? 'bg-emerald-700 text-white' : 'bg-white text-slate-700 ring-1 ring-slate-200'}`}
              >
                {t(`method.${key}`)}
              </button>
            ))}
          </div>
        </div>
      )}

      <label className="block">
        <span className="text-sm text-slate-600">{t('entry.note')} {type !== 'expense' && `(${t('common.optional')})`}</span>
        <input
          value={note} onChange={(e) => setNote(e.target.value)} required={type === 'expense'}
          placeholder={type === 'expense' ? t('entry.note_expense') : ''} className={`${input} mt-1`}
        />
      </label>

      {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}

      <div className="flex gap-2">
        <button disabled={saving} className="flex-1 rounded-xl bg-emerald-700 py-3 font-semibold text-white shadow disabled:opacity-60">
          {saving ? t('common.saving') : `${submitLabel} · ${formatKES(finalAmount)}`}
        </button>
        {secondaryAction}
      </div>
    </form>
  );
}
