import { useT } from '../i18n/index.jsx';
import { formatDate, todayInKenya } from '../lib/format.js';

// Shows where a customer stands: overdue (red), due today (amber), due later, or no debt.
// `customer` comes from the API with balance, due_date, overdue, days_overdue.
export default function DueBadge({ customer }) {
  const { t, lang } = useT();
  const base = 'inline-block rounded-full px-2 py-0.5 text-xs font-medium';

  if (customer.balance <= 0) return <span className={`${base} bg-slate-100 text-slate-500`}>{t('customers.no_debt')}</span>;
  if (customer.overdue) {
    return <span className={`${base} bg-red-100 text-red-700`}>{t('customers.days_overdue', { days: customer.days_overdue })}</span>;
  }
  if (customer.due_date === todayInKenya()) {
    return <span className={`${base} bg-amber-100 text-amber-800`}>{t('customers.due_today')}</span>;
  }
  if (customer.due_date) {
    return <span className={`${base} bg-emerald-50 text-emerald-700`}>{t('customers.due_on', { date: formatDate(customer.due_date, lang) })}</span>;
  }
  return <span className={`${base} bg-slate-100 text-slate-600`}>{t('customers.no_due_date')}</span>;
}
