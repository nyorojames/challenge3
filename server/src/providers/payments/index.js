// Chooses the payment provider from PAYMENT_PROVIDER. Only 'mock' exists today.
//
// Where a real Daraja adapter would plug in (providers/payments/daraja.js):
//   1. GET  /oauth/v1/generate?grant_type=client_credentials  (consumer key + secret)
//      -> access token, valid ~1 hour
//   2. POST /mpesa/stkpush/v1/processrequest with BusinessShortCode, Password =
//      base64(shortcode + passkey + timestamp), Timestamp, TransactionType
//      'CustomerPayBillOnline', Amount, PartyA/PhoneNumber, CallBackURL (our public
//      https URL ending in /api/mpesa/callback), AccountReference, TransactionDesc.
//   3. Export the same stkPush({ phone, amount, accountReference }) function as mock.js.
// Nothing else changes: the callback handler (services/mpesa.js) already expects
// Daraja's exact callback JSON.
import { config } from '../../config.js';
import * as mock from './mock.js';

const providers = { mock };

export const payments = providers[config.PAYMENT_PROVIDER];
export const isMockPayments = config.PAYMENT_PROVIDER === 'mock';
