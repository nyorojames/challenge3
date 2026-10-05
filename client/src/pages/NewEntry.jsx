import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../api/client.js';
import { useApi } from '../api/useApi.js';
import { useT } from '../i18n/index.jsx';
import { newId } from '../lib/ids.js';
import { ErrorBox, Loading } from '../components/Status.jsx';
import AiEntry from '../components/AiEntry.jsx';
import DraftsList from '../components/DraftsList.jsx';
import EntryForm from '../components/EntryForm.jsx';

export default function NewEntry() {
  const { t } = useT();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const customers = useApi('/customers');
  const products = useApi('/products');
  const drafts = useApi('/transactions?status=draft');
  // Links like /new?type=payment&customer=<id> (from a customer page) open the form directly.
  const [mode, setMode] = useState(params.get('type') ? 'manual' : 'ai');
  const [activeDraftId, setActiveDraftId] = useState(null); // the draft shown in the review card

  if (customers.loading || products.loading) return <Loading />;
  if (customers.error || products.error) return <ErrorBox error={customers.error || products.error} />;

  const saveManual = async ({ new_customer_name, ...fields }) => {
    const body = { id: newId(), ...fields, created_at: new Date().toISOString() };
    await api('/transactions', { method: 'POST', body });
    navigate(body.customer_id ? `/customers/${body.customer_id}` : '/');
  };

  const tab = (key, label) => (
    <button
      type="button" onClick={() => setMode(key)}
      className={`flex-1 rounded-lg py-2 text-sm font-semibold ${mode === key ? 'bg-white text-emerald-800 shadow' : 'text-slate-600'}`}
    >
      {label}
    </button>
  );

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-bold">{t('entry.title')}</h2>
      <div className="flex gap-1 rounded-xl bg-slate-200 p-1">
        {tab('ai', t('entry.tab_ai'))}
        {tab('manual', t('entry.tab_manual'))}
      </div>

      {mode === 'ai' ? (
        <>
          <AiEntry
            customers={customers.data} products={products.data}
            onDraftsChanged={(id) => { setActiveDraftId(id); drafts.reload(); }}
          />
          <DraftsList drafts={drafts.data?.filter((d) => d.id !== activeDraftId)} onChanged={drafts.reload} />
        </>
      ) : (
        <EntryForm
          customers={customers.data}
          products={products.data}
          initial={{ type: params.get('type'), customer_id: params.get('customer') }}
          submitLabel={t('entry.save')}
          onSubmit={saveManual}
        />
      )}
    </div>
  );
}
