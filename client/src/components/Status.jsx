import { useT } from '../i18n/index.jsx';

export function Loading() {
  const { t } = useT();
  return <p className="py-8 text-center text-slate-500">{t('common.loading')}</p>;
}

export function ErrorBox({ error, onRetry }) {
  const { t } = useT();
  return (
    <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
      <p className="font-semibold">{t('common.error')}</p>
      <p>{error?.message}</p>
      {onRetry && (
        <button onClick={onRetry} className="mt-2 font-semibold underline">
          {t('common.retry')}
        </button>
      )}
    </div>
  );
}
