import { useT } from '../i18n/index.jsx';
import { formatDateTime, formatKES } from '../lib/format.js';
import { discardFromOutbox, useOutbox } from '../sync/outbox.js';
import { useOnline } from '../sync/connectivity.js';

// Entries recorded on this device that the server has not received yet.
// They are NOT in balances or totals until they sync.
export default function PendingList() {
  const { t, lang } = useT();
  const items = useOutbox();
  const online = useOnline();
  if (items.length === 0) return null;

  return (
    <section className="rounded-xl border border-amber-300 bg-amber-50 p-3">
      <h3 className="text-sm font-semibold text-amber-900">⏳ {t('offline.waiting_title', { count: items.length })}</h3>
      <p className="mb-2 text-xs text-amber-900">{online ? t('offline.waiting_online') : t('offline.waiting_offline')}</p>
      <ul className="space-y-1.5">
        {items.map((item) => (
          <li key={item.id} className="rounded-lg bg-white p-2 text-sm shadow-sm">
            <div className="flex justify-between gap-2">
              <span className="font-medium">
                {t(`tx.${item.summary.type}`)}{item.summary.customer_name && ` · ${item.summary.customer_name}`}
                {item.transaction.source === 'ai' && <span className="ml-1 text-xs text-slate-500">· AI</span>}
              </span>
              <span className="font-semibold tabular-nums">{formatKES(item.summary.amount)}</span>
            </div>
            <p className="text-xs text-slate-500">{formatDateTime(item.transaction.created_at, lang)}</p>
            {item.error && (
              <p className="mt-1 text-xs text-red-700">
                {t('offline.rejected')}: {item.error}{' '}
                <button onClick={() => discardFromOutbox(item.id)} className="font-semibold underline">{t('ai.discard')}</button>
              </p>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
