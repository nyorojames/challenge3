import { Link } from 'react-router-dom';
import { useApi } from '../api/useApi.js';
import { useT } from '../i18n/index.jsx';
import { formatKES } from '../lib/format.js';
import { ErrorBox, Loading } from '../components/Status.jsx';
import TransactionRow from '../components/TransactionRow.jsx';

function Card({ title, value, sub, tone = 'slate', to }) {
  const tones = {
    slate: 'bg-white',
    red: 'bg-red-50 border-red-200',
    amber: 'bg-amber-50 border-amber-200',
    green: 'bg-emerald-50 border-emerald-200',
  };
  const body = (
    <div className={`h-full rounded-xl border border-slate-200 p-4 shadow-sm ${tones[tone]}`}>
      <p className="text-sm text-slate-600">{title}</p>
      <p className="mt-1 text-xl font-bold tabular-nums text-slate-900">{value}</p>
      {sub && <p className="mt-1 text-xs text-slate-500">{sub}</p>}
    </div>
  );
  return to ? <Link to={to}>{body}</Link> : body;
}

export default function Dashboard() {
  const { t } = useT();
  const summary = useApi('/reports/summary');
  const recent = useApi('/transactions?limit=8');

  if (summary.loading && !summary.data) return <Loading />;
  if (summary.error) return <ErrorBox error={summary.error} onRetry={summary.reload} />;
  const s = summary.data;

  return (
    <div className="space-y-4">
      {/* Today's sales, split the way a duka thinks about it */}
      <section className="rounded-xl bg-emerald-700 p-4 text-white shadow">
        <p className="text-sm text-emerald-100">{t('dashboard.sales_today')}</p>
        <p className="text-3xl font-bold tabular-nums">{formatKES(s.sales.total)}</p>
        <div className="mt-3 grid grid-cols-3 gap-2 text-sm">
          {['cash', 'mpesa', 'credit'].map((key) => (
            <div key={key} className="rounded-lg bg-white/10 p-2">
              <p className="text-emerald-100">{t(`method.${key}`)}</p>
              <p className="font-semibold tabular-nums">{formatKES(s.sales[key])}</p>
            </div>
          ))}
        </div>
      </section>

      {s.draft_count > 0 && (
        <Link to="/new" className="block rounded-lg bg-sky-50 p-3 text-sm text-sky-800 ring-1 ring-sky-200">
          {t('dashboard.drafts', { count: s.draft_count })} →
        </Link>
      )}

      {s.unmatched_mpesa_count > 0 && (
        <Link to="/mpesa" className="block rounded-lg bg-amber-50 p-3 text-sm text-amber-900 ring-1 ring-amber-200">
          {t('dashboard.unmatched_mpesa', { count: s.unmatched_mpesa_count })} →
        </Link>
      )}

      <div className="grid grid-cols-2 gap-3">
        <Card
          title={t('dashboard.owed')} value={formatKES(s.total_owed)}
          sub={t('dashboard.owed_sub', { count: s.customers_owing })} to="/customers?filter=owing"
        />
        <Card
          title={t('dashboard.overdue')} value={formatKES(s.overdue_amount)}
          sub={t('dashboard.overdue_sub', { count: s.overdue_count })}
          tone={s.overdue_count > 0 ? 'red' : 'slate'} to="/customers?filter=overdue"
        />
        <Card title={t('dashboard.expenses')} value={formatKES(s.expenses)} />
        <Card
          title={t('dashboard.profit')} value={formatKES(s.simple_profit)}
          sub={t('dashboard.profit_hint')} tone={s.simple_profit >= 0 ? 'green' : 'red'}
        />
        <Card title={t('dashboard.payments')} value={formatKES(s.payments_received)} />
        <Card
          title={t('dashboard.low_stock')} value={s.low_stock_count}
          sub={t('dashboard.low_stock_sub')} tone={s.low_stock_count > 0 ? 'amber' : 'slate'} to="/products?low=1"
        />
      </div>

      <Link to="/new" className="block rounded-xl bg-emerald-700 py-3 text-center font-semibold text-white shadow">
        {t('dashboard.new_entry')}
      </Link>

      <section className="rounded-xl border border-slate-200 bg-white px-4 shadow-sm">
        <h2 className="pt-3 font-semibold text-slate-700">{t('dashboard.recent')}</h2>
        {recent.data?.length === 0 && <p className="py-4 text-sm text-slate-500">{t('dashboard.empty')}</p>}
        <ul className="divide-y divide-slate-100">
          {recent.data?.map((tx) => <TransactionRow key={tx.id} tx={tx} />)}
        </ul>
      </section>
    </div>
  );
}
