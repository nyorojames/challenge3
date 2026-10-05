import { Link, useSearchParams } from 'react-router-dom';
import { useApi } from '../api/useApi.js';
import { useT } from '../i18n/index.jsx';
import { formatKES } from '../lib/format.js';
import { ErrorBox, Loading } from '../components/Status.jsx';

export default function Products() {
  const { t } = useT();
  const { data, error, loading, reload } = useApi('/products');
  const [params, setParams] = useSearchParams();
  const onlyLow = params.get('low') === '1';

  if (loading && !data) return <Loading />;
  if (error) return <ErrorBox error={error} onRetry={reload} />;

  // Low-stock products first, so the shopkeeper sees what to reorder.
  const visible = data
    .filter((p) => !onlyLow || p.low_stock)
    .sort((a, b) => Number(b.low_stock) - Number(a.low_stock) || a.name.localeCompare(b.name));

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold">{t('products.title')}</h2>
        <Link to="/new?type=restock" className="rounded-lg bg-emerald-700 px-3 py-1.5 text-sm font-semibold text-white">
          {t('products.restock')}
        </Link>
      </div>

      <label className="flex items-center gap-2 text-sm text-slate-600">
        <input type="checkbox" checked={onlyLow} onChange={(e) => setParams(e.target.checked ? { low: '1' } : {})} />
        {t('products.only_low')}
      </label>

      <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white shadow-sm">
        {visible.map((p) => (
          <li key={p.id} className="flex items-center justify-between gap-3 px-4 py-3">
            <div className="min-w-0">
              <p className="font-medium capitalize">
                {p.name}
                {p.low_stock && (
                  <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold normal-case text-amber-800">
                    ⚠ {t('products.low')}
                  </span>
                )}
              </p>
              <p className={`text-sm ${p.low_stock ? 'text-amber-800' : 'text-slate-500'}`}>
                {t('products.left', { qty: p.stock_qty, unit: p.unit })} · {t('products.reorder_at', { level: p.reorder_level })}
              </p>
            </div>
            <div className="text-right">
              <p className="font-semibold tabular-nums">{formatKES(p.price)}</p>
              <p className="text-xs text-slate-500">{t('products.per_unit', { unit: p.unit })}</p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
