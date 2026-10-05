import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client.js';
import { useApi } from '../api/useApi.js';
import { useT } from '../i18n/index.jsx';
import { formatDateTime, formatKES } from '../lib/format.js';
import { ErrorBox, Loading } from '../components/Status.jsx';
import PhoneSimulator from '../components/PhoneSimulator.jsx';

const STATUS_STYLE = {
  success: 'bg-green-100 text-green-800',
  unmatched: 'bg-amber-100 text-amber-900',
  pending: 'bg-sky-100 text-sky-800',
  failed: 'bg-slate-200 text-slate-600',
};

// One unmatched payment: pick the customer it belongs to.
function AssignRow({ payment, customers, onAssigned }) {
  const { t } = useT();
  const [customerId, setCustomerId] = useState('');
  const [error, setError] = useState(null);
  const assign = async () => {
    try {
      await api(`/mpesa/payments/${payment.id}/assign`, { method: 'POST', body: { customer_id: customerId } });
      onAssigned();
    } catch (err) {
      setError(err.message);
    }
  };
  return (
    <div className="mt-2 flex gap-2">
      <select value={customerId} onChange={(e) => setCustomerId(e.target.value)} className="min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm">
        <option value="">{t('entry.choose_customer')}</option>
        {customers.map((c) => <option key={c.id} value={c.id}>{c.name}{c.balance > 0 ? ` (${formatKES(c.balance)})` : ''}</option>)}
      </select>
      <button disabled={!customerId} onClick={assign} className="rounded-lg bg-amber-500 px-3 text-sm font-semibold text-white disabled:opacity-50">
        {t('mpesa.assign')}
      </button>
      {error && <p className="text-xs text-red-700">{error}</p>}
    </div>
  );
}

export default function Mpesa() {
  const { t, lang } = useT();
  const payments = useApi('/mpesa/payments');
  const customers = useApi('/customers');
  const [walkInPhone, setWalkInPhone] = useState('');
  const [simulating, setSimulating] = useState(false);
  const [resendResult, setResendResult] = useState(null);

  if ((payments.loading && !payments.data) || (customers.loading && !customers.data)) return <Loading />;
  if (payments.error) return <ErrorBox error={payments.error} onRetry={payments.reload} />;

  const reload = () => { payments.reload(); customers.reload(); };
  const resendLast = async () => {
    try {
      setResendResult(await api('/mpesa/resend-last', { method: 'POST' }));
      reload();
    } catch (err) {
      setResendResult({ error: err.message });
    }
  };

  const unmatched = payments.data.filter((p) => p.status === 'unmatched');

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-bold">📲 {t('mpesa.title')}</h2>

      {unmatched.length > 0 && (
        <section className="space-y-2 rounded-xl border border-amber-300 bg-amber-50 p-3">
          <h3 className="font-semibold text-amber-900">{t('mpesa.unmatched_title', { count: unmatched.length })}</h3>
          <p className="text-sm text-amber-900">{t('mpesa.unmatched_hint')}</p>
          {unmatched.map((p) => (
            <div key={p.id} className="rounded-lg bg-white p-3 shadow-sm">
              <p className="font-semibold">{formatKES(p.amount)} · +{p.phone}</p>
              <p className="text-xs text-slate-500">{p.receipt_number} · {formatDateTime(p.created_at, lang)}</p>
              <AssignRow payment={p} customers={customers.data} onAssigned={reload} />
            </div>
          ))}
        </section>
      )}

      {/* Ask someone who is not (yet) a customer to pay, e.g. a walk-in. */}
      <form
        onSubmit={(e) => { e.preventDefault(); setSimulating(true); }}
        className="flex gap-2 rounded-xl border border-slate-200 bg-white p-3"
      >
        <input
          type="tel" required value={walkInPhone} onChange={(e) => setWalkInPhone(e.target.value)}
          placeholder={t('mpesa.walk_in_placeholder')} className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2"
        />
        <button className="rounded-lg bg-green-600 px-3 text-sm font-semibold text-white">{t('mpesa.request_short')}</button>
      </form>

      <section className="rounded-xl border border-slate-200 bg-white px-4 shadow-sm">
        <h3 className="pt-3 font-semibold text-slate-700">{t('mpesa.history')}</h3>
        <ul className="divide-y divide-slate-100">
          {payments.data.map((p) => (
            <li key={p.id} className="flex items-center justify-between gap-3 py-3">
              <div className="min-w-0">
                <p className="font-medium">
                  {p.customer_name ? <Link to={`/customers/${p.customer_id}`} className="text-emerald-700">{p.customer_name}</Link> : `+${p.phone}`}
                </p>
                <p className="text-xs text-slate-500">
                  {p.receipt_number ?? '—'} · {formatDateTime(p.created_at, lang)}
                </p>
              </div>
              <div className="text-right">
                <p className="font-semibold tabular-nums">{formatKES(p.amount)}</p>
                <span className={`rounded-full px-2 py-0.5 text-xs ${STATUS_STYLE[p.status]}`}>{t(`mpesa.status_${p.status}`)}</span>
              </div>
            </li>
          ))}
        </ul>
      </section>

      {/* Developer tool for the demo: replay the last callback to prove idempotency. */}
      <details className="rounded-xl border border-dashed border-slate-300 p-3 text-sm">
        <summary className="cursor-pointer font-semibold text-slate-600">🛠 {t('mpesa.dev_tools')}</summary>
        <p className="mt-2 text-slate-600">{t('mpesa.resend_hint')}</p>
        <button onClick={resendLast} className="mt-2 rounded-lg bg-slate-800 px-3 py-1.5 font-semibold text-white">
          {t('mpesa.resend')}
        </button>
        {resendResult && (
          <p className={`mt-2 rounded p-2 ${resendResult.duplicate ? 'bg-green-50 text-green-800' : 'bg-slate-100 text-slate-700'}`}>
            {resendResult.error ?? (resendResult.duplicate ? t('mpesa.resend_duplicate', { receipt: resendResult.payment?.receipt_number ?? '' }) : t(`mpesa.outcome_${resendResult.outcome}`))}
          </p>
        )}
      </details>

      {simulating && (
        <PhoneSimulator phone={walkInPhone} onClose={() => { setSimulating(false); reload(); }} />
      )}
    </div>
  );
}
