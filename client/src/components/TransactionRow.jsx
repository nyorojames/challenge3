import { Link } from 'react-router-dom';
import { useT } from '../i18n/index.jsx';
import { formatDateTime, formatKES, itemsSummary } from '../lib/format.js';

// Money coming in is green with "+", money going out (expenses, restock) is red with "−".
// A credit sale is shown neutral: it is a sale, but no money arrived yet.
const STYLE = {
  cash_sale: { sign: '+', color: 'text-emerald-700' },
  payment: { sign: '+', color: 'text-emerald-700' },
  credit_sale: { sign: '', color: 'text-amber-700' },
  expense: { sign: '−', color: 'text-red-700' },
  restock: { sign: '−', color: 'text-red-700' },
};

export default function TransactionRow({ tx, showCustomer = true, onVoid }) {
  const { t, lang } = useT();
  const style = STYLE[tx.type];
  const isVoid = tx.status === 'void';

  return (
    <li className={`flex items-start justify-between gap-3 py-3 ${isVoid ? 'opacity-50' : ''}`}>
      <div className="min-w-0">
        <p className={`font-medium ${isVoid ? 'line-through' : ''}`}>
          {t(`tx.${tx.type}`)}
          {showCustomer && tx.customer_name && (
            <>
              {' · '}
              <Link to={`/customers/${tx.customer_id}`} className="text-emerald-700 hover:underline">{tx.customer_name}</Link>
            </>
          )}
        </p>
        <p className="truncate text-sm text-slate-500">
          {tx.items.length > 0 ? itemsSummary(tx.items) : tx.note}
        </p>
        <p className="text-xs text-slate-400">
          {formatDateTime(tx.created_at, lang)}
          {tx.method && tx.type !== 'credit_sale' && ` · ${t(`method.${tx.method}`)}`}
          {tx.source === 'ai' && ' · AI'}
          {tx.status === 'draft' && <span className="ml-1 rounded bg-sky-100 px-1 text-sky-700">{t('customer.draft')}</span>}
          {isVoid && <span className="ml-1 rounded bg-slate-200 px-1 text-slate-600">{t('customer.voided')}</span>}
        </p>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        <span className={`font-semibold tabular-nums ${style.color} ${isVoid ? 'line-through' : ''}`}>
          {style.sign}{formatKES(tx.amount)}
        </span>
        {onVoid && !isVoid && (
          <button onClick={() => onVoid(tx)} className="text-xs text-slate-400 hover:text-red-600">
            {t('customer.void')}
          </button>
        )}
      </div>
    </li>
  );
}
