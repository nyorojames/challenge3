// Chooses the SMS provider from SMS_PROVIDER. Only 'mock' exists today.
//
// A real Africa's Talking adapter (providers/sms/africastalking.js) would:
//   POST https://api.africastalking.com/version1/messaging
//   headers: apiKey, Accept: application/json; form body: username, to (+2547...), message
// then record the message in sms_messages with provider 'africastalking' and the
// status it returns, and export the same sendSms({ shopId, customerId, phone, body, purpose }).
import { config } from '../../config.js';
import * as mock from './mock.js';

const providers = { mock };

export const sms = providers[config.SMS_PROVIDER];
