import { useState } from 'react';
import { api } from '../api/client.js';
import { useT } from '../i18n/index.jsx';
import { formatKES } from '../lib/format.js';

/**
 * Simulated M-Pesa STK Push. Three steps:
 *   1. amount  (shopkeeper's side): how much to request
 *   2. prompt  (customer's phone): "Pay KES X to <shop>? Enter M-Pesa PIN"
 *   3. result  (customer's phone): the confirmation or cancellation
 * Confirm/Cancel call /api/mpesa/simulate, which builds Daraja's real callback
 * JSON and runs it through the same handler Safaricom would call.
 *
 * Props: customerId or phone (who pays), defaultAmount, onClose(), onPaid(result)
 */
export default function PhoneSimulator({ customerId, phone, defaultAmount, onClose, onPaid }) {
  const { t } = useT();
  const [step, setStep] = useState('amount');
  const [amount, setAmount] = useState(defaultAmount > 0 ? String(defaultAmount) : '');
  const [request, setRequest] = useState(null); // response of /stk-push
  const [pin, setPin] = useState('');
  const [result, setResult] = useState(null); // response of /simulate
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const sendRequest = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const body = { amount: Number(amount), ...(customerId ? { customer_id: customerId } : { phone }) };
      setRequest(await api('/mpesa/stk-push', { method: 'POST', body }));
      setStep('prompt');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const answer = async (action) => {
    setBusy(true);
    try {
      const response = await api('/mpesa/simulate', {
        method: 'POST',
        body: { checkout_request_id: request.checkout_request_id, action },
      });
      setResult(response);
      setStep('result');
      if (response.outcome === 'success' || response.outcome === 'unmatched') onPaid?.(response);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true">
      {step === 'amount' ? (
        <form onSubmit={sendRequest} className="w-full max-w-sm space-y-3 rounded-2xl bg-white p-5 shadow-xl">
          <h2 className="text-lg font-bold">📲 {t('mpesa.request_title')}</h2>
          <p className="text-sm text-slate-600">{t('mpesa.request_hint')}</p>
          <label className="block">
            <span className="text-sm text-slate-600">{t('entry.amount')}</span>
            <input
              inputMode="numeric" required autoFocus value={amount} onChange={(e) => setAmount(e.target.value.replace(/\D/g, ''))}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-lg"
            />
          </label>
          {error && <p className="text-sm text-red-700">{error}</p>}
          <div className="flex gap-2">
            <button disabled={busy || !Number(amount)} className="flex-1 rounded-lg bg-green-600 py-2.5 font-semibold text-white disabled:opacity-50">
              {busy ? t('common.loading') : t('mpesa.send_request')}
            </button>
            <button type="button" onClick={onClose} className="rounded-lg px-4 text-slate-600">{t('common.cancel')}</button>
          </div>
        </form>
      ) : (
        // The customer's phone
        <div className="w-72 rounded-[2.5rem] border-[10px] border-slate-900 bg-slate-900 shadow-2xl">
          <div className="flex h-[32rem] flex-col overflow-hidden rounded-[1.8rem] bg-gradient-to-b from-sky-800 to-slate-900 text-white">
            <div className="flex justify-between px-5 pt-2 text-[11px] text-white/80">
              <span>Safaricom 4G</span>
              <span>{new Date().toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Nairobi' })}</span>
            </div>
            <p className="mt-1 text-center text-[11px] text-white/60">+{request.phone}</p>

            <div className="flex flex-1 items-center justify-center p-4">
              {step === 'prompt' && (
                <div className="w-full rounded-lg bg-slate-100 p-4 text-slate-900 shadow-lg">
                  <p className="text-sm leading-snug">
                    {t('phone.prompt', { amount: formatKES(request.amount), shop: request.shop_name.toUpperCase() })}
                  </p>
                  <input
                    type="password" inputMode="numeric" maxLength={4} autoFocus value={pin}
                    onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
                    aria-label={t('phone.pin')} placeholder="••••"
                    className="mt-3 w-full border-b-2 border-green-600 bg-transparent py-1 text-center text-xl tracking-[0.5em] outline-none"
                  />
                  <p className="mt-1 text-center text-[10px] text-slate-500">{t('phone.demo_pin')}</p>
                  {error && <p className="mt-1 text-xs text-red-700">{error}</p>}
                  <div className="mt-3 flex justify-between text-sm font-semibold">
                    <button disabled={busy} onClick={() => answer('cancel')} className="px-2 py-1 text-slate-600">{t('phone.cancel')}</button>
                    <button disabled={busy || pin.length !== 4} onClick={() => answer('confirm')} className="px-2 py-1 text-green-700 disabled:opacity-40">
                      {t('phone.confirm')}
                    </button>
                  </div>
                </div>
              )}

              {step === 'result' && (
                <div className="w-full rounded-lg bg-white p-4 text-slate-900 shadow-lg">
                  {result.outcome === 'failed' ? (
                    <p className="text-sm">{t('phone.cancelled')}</p>
                  ) : (
                    <>
                      <p className="mb-1 text-xs font-bold text-green-700">M-PESA</p>
                      <p className="text-sm leading-snug">
                        {t('phone.confirmed', {
                          receipt: result.payment.receipt_number,
                          amount: formatKES(result.payment.amount),
                          shop: request.shop_name.toUpperCase(),
                        })}
                      </p>
                    </>
                  )}
                  <button onClick={onClose} className="mt-3 w-full rounded bg-slate-900 py-1.5 text-sm font-semibold text-white">OK</button>
                </div>
              )}
            </div>

            {step === 'result' && (
              // What the SHOPKEEPER learns (outside the customer's SMS)
              <p className={`mx-3 mb-4 rounded-lg p-2 text-center text-xs font-semibold ${
                result.outcome === 'success' ? 'bg-green-500 text-white' : result.outcome === 'unmatched' ? 'bg-amber-400 text-slate-900' : 'bg-slate-600'
              }`}>
                {t(`mpesa.outcome_${result.outcome}`)}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
