import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api/client.js';
import { useApi } from '../api/useApi.js';
import { useT } from '../i18n/index.jsx';
import { formatKES } from '../lib/format.js';
import { ErrorBox, Loading } from '../components/Status.jsx';
import DueBadge from '../components/DueBadge.jsx';
import TransactionRow from '../components/TransactionRow.jsx';
import PhoneSimulator from '../components/PhoneSimulator.jsx';
import { useOnline } from '../sync/connectivity.js';

export default function CustomerDetail() {
  const { id } = useParams();
  const { t } = useT();
  const detail = useApi(`/customers/${id}`);
  // Offline and this page was never opened online: fall back to the saved
  // customer list (balance and due status), without the history.
  const list = useApi(detail.error?.status === 0 ? '/customers' : null);
  const fromList = list.data?.find((c) => c.id === id);
  const customer = detail.data ?? (fromList && { ...fromList, history: [], historyMissing: true });
  const { reload } = detail;
  const loading = detail.loading || list.loading;
  const error = customer ? null : detail.error;
  const online = useOnline(); // M-Pesa, SMS and void need the server
  const [payingByMpesa, setPayingByMpesa] = useState(false);
  const [smsNotice, setSmsNotice] = useState(null);

  const remind = async () => {
    try {
      const message = await api(`/sms/remind/${id}`, { method: 'POST' });
      setSmsNotice({ ok: true, text: message.body });
    } catch (err) {
      setSmsNotice({ ok: false, text: err.message });
    }
  };

  const voidEntry = async (tx) => {
    if (!window.confirm(t('customer.void_confirm'))) return;
    try {
      await api(`/transactions/${tx.id}/void`, { method: 'POST' });
      reload(); // balance and due status are recalculated by the server
    } catch (err) {
      window.alert(err.message);
    }
  };

  if (loading && !customer) return <Loading />;
  if (error) return <ErrorBox error={error.status === 404 ? { message: t('customer.not_found') } : error} onRetry={reload} />;

  return (
    <div className="space-y-4">
      <Link to="/customers" className="text-sm text-emerald-700">{t('customer.back')}</Link>

      <section className={`rounded-xl p-4 shadow ${customer.overdue ? 'bg-red-700' : 'bg-emerald-700'} text-white`}>
        <h2 className="text-xl font-bold">{customer.name}</h2>
        {customer.phone && <p className="text-sm text-white/80">+{customer.phone}</p>}
        <p className="mt-3 text-sm text-white/80">{t('customer.balance')}</p>
        <p className="text-3xl font-bold tabular-nums">{formatKES(customer.balance)}</p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <DueBadge customer={customer} />
          {customer.credit_limit && (
            <span className="text-xs text-white/80">
              {t('customer.credit_limit')}: {formatKES(customer.credit_limit)}
            </span>
          )}
        </div>
      </section>

      {customer.phone && customer.balance > 0 && (
        <div className="grid grid-cols-2 gap-2">
          <button disabled={!online} onClick={() => setPayingByMpesa(true)} className="rounded-lg bg-green-600 py-2.5 font-semibold text-white disabled:opacity-40">
            {t('customer.request_mpesa')}
          </button>
          <button disabled={!online} onClick={remind} className="rounded-lg bg-white py-2.5 font-semibold text-slate-700 ring-1 ring-slate-300 disabled:opacity-40">
            {t('customer.remind')}
          </button>
        </div>
      )}
      {!online && customer.balance > 0 && <p className="text-xs text-slate-500">{t('offline.needs_connection')}</p>}
      {smsNotice && (
        <p className={`rounded-lg p-3 text-sm ${smsNotice.ok ? 'bg-green-50 text-green-900' : 'bg-red-50 text-red-700'}`}>
          {smsNotice.ok && <strong>{t('customer.reminded')} </strong>}
          {smsNotice.text}
          {smsNotice.ok && <Link to="/sms" className="ml-1 font-semibold underline">{t('sms.open_outbox')}</Link>}
        </p>
      )}

      <div className="grid grid-cols-2 gap-2">
        <Link
          to={`/new?type=payment&customer=${customer.id}`}
          className="rounded-lg bg-emerald-700 py-2.5 text-center font-semibold text-white"
        >
          {t('customer.record_payment')}
        </Link>
        <Link
          to={`/new?type=credit_sale&customer=${customer.id}`}
          className="rounded-lg bg-white py-2.5 text-center font-semibold text-emerald-700 ring-1 ring-emerald-700"
        >
          {t('customer.new_credit')}
        </Link>
      </div>

      {payingByMpesa && (
        <PhoneSimulator
          customerId={customer.id}
          defaultAmount={customer.balance}
          onPaid={reload} // the server already lowered the balance; just refresh
          onClose={() => { setPayingByMpesa(false); reload(); }}
        />
      )}

      <section className="rounded-xl border border-slate-200 bg-white px-4 shadow-sm">
        <h3 className="pt-3 font-semibold text-slate-700">{t('customer.history')}</h3>
        {customer.historyMissing && <p className="py-4 text-sm text-slate-500">{t('offline.history_online')}</p>}
        {!customer.historyMissing && customer.history.length === 0 && <p className="py-4 text-sm text-slate-500">{t('customer.history_empty')}</p>}
        <ul className="divide-y divide-slate-100">
          {customer.history.map((tx) => (
            <TransactionRow key={tx.id} tx={tx} showCustomer={false} onVoid={online ? voidEntry : undefined} />
          ))}
        </ul>
      </section>
    </div>
  );
}
