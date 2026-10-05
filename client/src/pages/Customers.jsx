import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../api/client.js';
import { useApi } from '../api/useApi.js';
import { useT } from '../i18n/index.jsx';
import { formatKES } from '../lib/format.js';
import { ErrorBox, Loading } from '../components/Status.jsx';
import DueBadge from '../components/DueBadge.jsx';

const FILTERS = {
  all: () => true,
  owing: (c) => c.balance > 0,
  overdue: (c) => c.overdue,
};

function AddCustomerForm({ onSaved, onCancel }) {
  const { t } = useT();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [error, setError] = useState(null);

  const submit = async (event) => {
    event.preventDefault();
    try {
      const customer = await api('/customers', { method: 'POST', body: { name, phone } });
      onSaved(customer);
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
      <input
        required autoFocus value={name} onChange={(e) => setName(e.target.value)}
        placeholder={t('customers.name')} className="w-full rounded-lg border border-slate-300 px-3 py-2"
      />
      <input
        type="tel" value={phone} onChange={(e) => setPhone(e.target.value)}
        placeholder={`${t('customers.phone')} (${t('common.optional')}) 07XX…`}
        className="w-full rounded-lg border border-slate-300 px-3 py-2"
      />
      {error && <p className="text-sm text-red-700">{error}</p>}
      <div className="flex gap-2">
        <button className="flex-1 rounded-lg bg-emerald-700 py-2 font-semibold text-white">{t('common.save')}</button>
        <button type="button" onClick={onCancel} className="rounded-lg px-4 py-2 text-slate-600">{t('common.cancel')}</button>
      </div>
    </form>
  );
}

export default function Customers() {
  const { t } = useT();
  const { data, error, loading, reload } = useApi('/customers');
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState('');
  const [adding, setAdding] = useState(false);
  const [reminderResult, setReminderResult] = useState(null);
  const filter = FILTERS[params.get('filter')] ? params.get('filter') : 'all';

  if (loading && !data) return <Loading />;
  if (error) return <ErrorBox error={error} onRetry={reload} />;

  const remindAllOverdue = async () => {
    try {
      const { sent, skipped } = await api('/sms/remind-overdue', { method: 'POST' });
      setReminderResult({ ok: true, text: t('sms.bulk_result', { sent: sent.length, skipped: skipped.length }) });
    } catch (err) {
      setReminderResult({ ok: false, text: err.message });
    }
  };
  const overdueCount = data.filter(FILTERS.overdue).length;

  const needle = search.trim().toLowerCase();
  const visible = data
    .filter(FILTERS[filter])
    .filter((c) => !needle || c.name.toLowerCase().includes(needle) || c.phone?.includes(needle))
    // Most urgent first: overdue (longest first), then biggest debts.
    .sort((a, b) => b.days_overdue - a.days_overdue || b.balance - a.balance);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold">{t('customers.title')}</h2>
        {!adding && (
          <button onClick={() => setAdding(true)} className="rounded-lg bg-emerald-700 px-3 py-1.5 text-sm font-semibold text-white">
            {t('customers.add')}
          </button>
        )}
      </div>

      {adding && (
        <AddCustomerForm
          onCancel={() => setAdding(false)}
          onSaved={() => { setAdding(false); reload(); }}
        />
      )}

      {overdueCount > 0 && (
        <button onClick={remindAllOverdue} className="w-full rounded-lg bg-red-50 py-2 text-sm font-semibold text-red-800 ring-1 ring-red-200">
          {t('sms.remind_all', { count: overdueCount })}
        </button>
      )}
      {reminderResult && (
        <p className={`rounded-lg p-2 text-sm ${reminderResult.ok ? 'bg-green-50 text-green-900' : 'bg-red-50 text-red-700'}`}>
          {reminderResult.text} {reminderResult.ok && <Link to="/sms" className="font-semibold underline">{t('sms.open_outbox')}</Link>}
        </p>
      )}

      <input
        type="search" value={search} onChange={(e) => setSearch(e.target.value)}
        placeholder={t('common.search')} className="w-full rounded-lg border border-slate-300 px-3 py-2"
      />

      <div className="flex gap-2">
        {Object.keys(FILTERS).map((key) => (
          <button
            key={key}
            onClick={() => setParams(key === 'all' ? {} : { filter: key })}
            className={`rounded-full px-3 py-1 text-sm ${filter === key ? 'bg-emerald-700 text-white' : 'bg-white text-slate-600 ring-1 ring-slate-200'}`}
          >
            {t(`customers.${key}`)} ({data.filter(FILTERS[key]).length})
          </button>
        ))}
      </div>

      {visible.length === 0 && <p className="py-6 text-center text-slate-500">{t('customers.empty')}</p>}

      <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white shadow-sm">
        {visible.map((c) => (
          <li key={c.id}>
            <Link to={`/customers/${c.id}`} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-slate-50">
              <div className="min-w-0">
                <p className="truncate font-medium">{c.name}</p>
                <DueBadge customer={c} />
              </div>
              <span className={`font-semibold tabular-nums ${c.overdue ? 'text-red-700' : c.balance > 0 ? 'text-slate-900' : 'text-slate-400'}`}>
                {formatKES(c.balance)}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
