import { useApi } from '../api/useApi.js';
import { useT } from '../i18n/index.jsx';
import { formatDateTime } from '../lib/format.js';
import { ErrorBox, Loading } from '../components/Status.jsx';

// Every SMS the shop has "sent" through the mock gateway, shown like a phone's
// messages app: newest at the bottom, sent messages as green bubbles on the right.
export default function SmsOutbox() {
  const { t, lang } = useT();
  const { data, error, loading, reload } = useApi('/sms/messages');

  if (loading && !data) return <Loading />;
  if (error) return <ErrorBox error={error} onRetry={reload} />;

  const oldestFirst = [...data].reverse();

  return (
    <div className="space-y-3">
      <h2 className="text-lg font-bold">✉️ {t('sms.title')}</h2>
      <p className="text-sm text-slate-500">{t('sms.subtitle')}</p>

      <div className="mx-auto max-w-sm rounded-[2rem] border-8 border-slate-900 bg-slate-900 shadow-xl">
        <div className="rounded-[1.4rem] bg-slate-100">
          <div className="rounded-t-[1.4rem] bg-white px-4 py-3 text-center shadow-sm">
            <p className="text-sm font-semibold">{t('sms.messages')}</p>
            <p className="text-xs text-slate-500">{t('sms.count', { count: data.length })}</p>
          </div>
          <ul className="max-h-[60vh] space-y-3 overflow-y-auto p-3">
            {oldestFirst.length === 0 && <li className="py-6 text-center text-sm text-slate-500">{t('sms.empty')}</li>}
            {oldestFirst.map((m) => (
              <li key={m.id} className="flex flex-col items-end">
                <span className="mb-0.5 text-[11px] text-slate-500">
                  {t('sms.to')} {m.customer_name ?? ''} +{m.phone}
                </span>
                <p className="max-w-[85%] rounded-2xl rounded-br-sm bg-green-500 px-3 py-2 text-sm text-white shadow">{m.body}</p>
                <span className="mt-0.5 text-[10px] text-slate-400">
                  {formatDateTime(m.created_at, lang)} · {m.status === 'sent' ? '✓✓' : m.status} · {m.provider}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
