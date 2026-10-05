// Mock M-Pesa that behaves like Safaricom's Daraja STK Push API, without any sign-up.
// The shapes below are copied from the Daraja docs:
// https://developer.safaricom.co.ke/APIs/MpesaExpressSimulate
import { randomInt } from 'node:crypto';

const pad = (n, width = 2) => String(n).padStart(width, '0');
const RECEIPT_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ0123456789';

// Daraja timestamps are YYYYMMDDHHmmss in Kenyan time.
function darajaTimestamp(date = new Date()) {
  const kenya = new Date(date.getTime() + 3 * 3600 * 1000); // EAT = UTC+3, no daylight saving
  return `${kenya.getUTCFullYear()}${pad(kenya.getUTCMonth() + 1)}${pad(kenya.getUTCDate())}` +
    `${pad(kenya.getUTCHours())}${pad(kenya.getUTCMinutes())}${pad(kenya.getUTCSeconds())}`;
}

// Looks like a real receipt: "SJK4H7QW2E" (10 characters, starts with a letter).
function receiptNumber() {
  let receipt = 'S';
  for (let i = 0; i < 9; i++) receipt += RECEIPT_CHARS[randomInt(RECEIPT_CHARS.length)];
  return receipt;
}

/**
 * Same response as Daraja's POST /mpesa/stkpush/v1/processrequest.
 * In real life this makes the customer's phone show "Enter M-Pesa PIN";
 * here the PhoneSimulator in the browser plays the phone.
 */
export async function stkPush({ phone, amount }) {
  const id = `${Date.now()}${randomInt(1000, 9999)}`;
  return {
    MerchantRequestID: `${randomInt(10000, 99999)}-${randomInt(10000000, 99999999)}-1`,
    CheckoutRequestID: `ws_CO_${darajaTimestamp()}${id.slice(-8)}`,
    ResponseCode: '0',
    ResponseDescription: 'Success. Request accepted for processing',
    CustomerMessage: `Success. Request accepted for processing (KES ${amount} from ${phone})`,
  };
}

/**
 * Builds the callback body Daraja would POST to our CallbackURL once the customer
 * answers the prompt. Only the mock needs this: with real Daraja, Safaricom sends it.
 *   confirm -> ResultCode 0 with CallbackMetadata (Amount, MpesaReceiptNumber, ...)
 *   cancel  -> ResultCode 1032 "Request cancelled by user"
 */
export function buildStkCallback({ merchantRequestId, checkoutRequestId, confirmed, amount, phone }) {
  const stkCallback = {
    MerchantRequestID: merchantRequestId,
    CheckoutRequestID: checkoutRequestId,
    ResultCode: confirmed ? 0 : 1032,
    ResultDesc: confirmed ? 'The service request is processed successfully.' : 'Request cancelled by user',
  };
  if (confirmed) {
    stkCallback.CallbackMetadata = {
      Item: [
        { Name: 'Amount', Value: amount },
        { Name: 'MpesaReceiptNumber', Value: receiptNumber() },
        { Name: 'TransactionDate', Value: Number(darajaTimestamp()) },
        { Name: 'PhoneNumber', Value: Number(phone) }, // Daraja sends the phone as a NUMBER
      ],
    };
  }
  return { Body: { stkCallback } };
}
