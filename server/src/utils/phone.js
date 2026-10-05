// Converts any common Kenyan phone format to 254XXXXXXXXX (what M-Pesa uses).
//   "0722 111 001", "+254722111001", "254722111001", "722111001" -> "254722111001"
// Safaricom/Airtel numbers start with 7 or 1 after the country code.
// Returns null if the input is not a valid Kenyan mobile number.
export function normalizePhone(input) {
  if (input === null || input === undefined) return null;
  const digits = String(input).replace(/[\s\-()+]/g, '');

  let match = digits.match(/^0([17]\d{8})$/);       // 07XXXXXXXX / 01XXXXXXXX
  if (match) return `254${match[1]}`;
  match = digits.match(/^([17]\d{8})$/);            // 7XXXXXXXX
  if (match) return `254${match[1]}`;
  if (/^254[17]\d{8}$/.test(digits)) return digits; // already 254...

  return null;
}
