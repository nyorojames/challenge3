import { api } from '../api/client.js';
import { useT } from '../i18n/index.jsx';
import { formatKES, itemsSummary } from '../lib/format.js';

// Drafts saved earlier but not confirmed yet (e.g. the shopkeeper got busy).
// Each can be confirmed or discarded right here.
export default function DraftsList({ drafts, onChanged }) {
  const { t } = useT();
  if (!drafts?.length) return null;

  const act = async (id, action) => {
    try {
      await api(`/transactions/${id}/${action}`, { method: 'POST' });
    } catch (err) {
      window.alert(err.message);
    }
    onChanged();
  };

  return (
    <section className="rounded-xl border border-sky-200 bg-sky-50 p-3">
      <h3 className="mb-2 text-sm font-semibold text-sky-900">{t('ai.drafts', { count: drafts.length })}</h3>
      <ul className="space-y-2">
        {drafts.map((d) => (
          <li key={d.id} className="rounded-lg bg-white p-2 text-sm shadow-sm">
            <p className="font-medium">
              {t(`tx.${d.type}`)}{d.customer_name && ` · ${d.customer_name}`} · {formatKES(d.amount)}
            </p>
            {d.raw_input && <p className="text-xs italic text-slate-500">“{d.raw_input}”</p>}
            {d.items.length > 0 && <p className="text-xs text-slate-500">{itemsSummary(d.items)}</p>}
            <div className="mt-1 flex gap-3">
              <button onClick={() => act(d.id, 'confirm')} className="font-semibold text-emerald-700">{t('ai.confirm')}</button>
              <button onClick={() => act(d.id, 'void')} className="text-slate-500">{t('ai.discard')}</button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
