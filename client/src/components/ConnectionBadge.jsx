import { useEffect, useState } from 'react';
import { useT } from '../i18n/index.jsx';
import { useOnline } from '../sync/connectivity.js';
import { syncOutbox, useOutbox } from '../sync/outbox.js';

// Header indicator: online/offline dot, how many entries wait to sync
// (tap to sync now), and a short "✓ synced" message after a sync.
export default function ConnectionBadge() {
  const { t } = useT();
  const online = useOnline();
  const waiting = useOutbox().filter((item) => !item.error).length;
  const [justSynced, setJustSynced] = useState(null);

  useEffect(() => {
    let timer;
    const onSynced = (event) => {
      setJustSynced(event.detail.sent);
      clearTimeout(timer);
      timer = setTimeout(() => setJustSynced(null), 4000);
    };
    window.addEventListener('duka:synced', onSynced);
    return () => { window.removeEventListener('duka:synced', onSynced); clearTimeout(timer); };
  }, []);

  return (
    <div className="flex items-center gap-1.5 text-[11px]">
      <span
        className={`flex items-center gap-1 rounded-full px-2 py-0.5 font-semibold ${online ? 'bg-white/15 text-white' : 'bg-red-500 text-white'}`}
        role="status"
      >
        <span className={`h-2 w-2 rounded-full ${online ? 'bg-green-300' : 'bg-white'}`} aria-hidden />
        {online ? t('offline.online') : t('offline.offline')}
      </span>
      {waiting > 0 && (
        <button onClick={syncOutbox} className="rounded-full bg-amber-400 px-2 py-0.5 font-semibold text-slate-900">
          ⟳ {t('offline.pending', { count: waiting })}
        </button>
      )}
      {justSynced > 0 && waiting === 0 && (
        <span className="rounded-full bg-green-400 px-2 py-0.5 font-semibold text-slate-900">✓ {t('offline.synced', { count: justSynced })}</span>
      )}
    </div>
  );
}
