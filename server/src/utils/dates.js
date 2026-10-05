import { config } from '../config.js';

// Today's date in Kenya as 'YYYY-MM-DD' (the 'en-CA' locale formats dates that way).
// Using the laptop's local date would be wrong if it is set to another timezone.
export function todayInKenya(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: config.TIMEZONE }).format(now);
}

// Whole days from `fromDate` to `toDate`, both 'YYYY-MM-DD'.
// Both parse as UTC midnight, so there is no daylight-saving or timezone drift.
export function daysBetween(fromDate, toDate) {
  return Math.round((Date.parse(toDate) - Date.parse(fromDate)) / 86_400_000);
}
