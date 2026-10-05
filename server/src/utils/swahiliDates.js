// Turns "Ijumaa", "kesho", "wiki ijayo", "Friday", "tarehe 15" ... into a real date.
// Pure functions with no imports, so the browser can use them offline too.
// All dates are 'YYYY-MM-DD' strings; "today" is passed in (Kenyan date).

// JavaScript's getUTCDay(): 0 = Sunday ... 6 = Saturday.
// The Swahili week counts from Saturday (Jumamosi = "day one"), but the names map like this:
const WEEKDAYS = {
  jumapili: 0, sunday: 0, sun: 0,
  jumatatu: 1, monday: 1, mon: 1,
  jumanne: 2, tuesday: 2, tue: 2, tues: 2,
  jumatano: 3, wednesday: 3, wed: 3,
  alhamisi: 4, thursday: 4, thu: 4, thur: 4, thurs: 4,
  ijumaa: 5, friday: 5, fri: 5,
  jumamosi: 6, saturday: 6, sat: 6,
};

export const SWAHILI_DAY_NAMES = ['Jumapili', 'Jumatatu', 'Jumanne', 'Jumatano', 'Alhamisi', 'Ijumaa', 'Jumamosi'];
export const ENGLISH_DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const toDate = (iso) => new Date(`${iso}T00:00:00Z`);
const toIso = (date) => date.toISOString().slice(0, 10);

export function addDays(iso, days) {
  const date = toDate(iso);
  date.setUTCDate(date.getUTCDate() + days);
  return toIso(date);
}

export function weekdayOf(iso) {
  return toDate(iso).getUTCDay();
}

function lastDayOfMonth(year, monthIndex) {
  return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
}

// Day `day` of this month, or of next month if that day has already passed.
function nextDayOfMonth(today, day) {
  const now = toDate(today);
  let year = now.getUTCFullYear();
  let month = now.getUTCMonth();
  if (day <= now.getUTCDate()) month += 1;
  if (month === 12) { month = 0; year += 1; }
  const safeDay = Math.min(day, lastDayOfMonth(year, month)); // "tarehe 31" in a 30-day month
  return toIso(new Date(Date.UTC(year, month, safeDay)));
}

/**
 * Finds a due date in a phrase like "ijumaa", "kesho kutwa", "next friday",
 * "baada ya siku 3", "mwisho wa mwezi", "tarehe 15". Returns null if none found.
 *
 * A weekday always means the NEXT one: "atalipa Ijumaa" said on a Friday means
 * next Friday (a debt due today would not be recorded as credit).
 */
export function resolveDueDate(phrase, today) {
  const text = ` ${phrase.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ')} `;

  // Order matters: check "kesho kutwa" before "kesho".
  if (/ (keshokutwa|kesho kutwa|day after tomorrow) /.test(text)) return addDays(today, 2);
  if (/ (kesho|tomorrow) /.test(text)) return addDays(today, 1);
  if (/ (leo|today) /.test(text)) return today;
  if (/ (wiki ijayo|next week|wiki hii ijayo) /.test(text)) return addDays(today, 7);
  if (/ (mwisho wa mwezi|end of (the )?month|month end) /.test(text)) {
    const now = toDate(today);
    return toIso(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), lastDayOfMonth(now.getUTCFullYear(), now.getUTCMonth()))));
  }
  if (/ (mwezi ujao|next month) /.test(text)) {
    return nextDayOfMonth(today, toDate(today).getUTCDate());
  }

  // "baada ya siku 3", "siku 3", "in 3 days"
  const inDays = text.match(/ (?:siku|in) (\d{1,2})(?: days?)? /) || text.match(/ (\d{1,2}) days? /);
  if (inDays) return addDays(today, Number(inDays[1]));

  // "tarehe 15", "on the 15th", "15th"
  const dayOfMonth = text.match(/ tarehe (\d{1,2}) /) || text.match(/ (\d{1,2})(?:st|nd|rd|th) /);
  if (dayOfMonth && Number(dayOfMonth[1]) >= 1 && Number(dayOfMonth[1]) <= 31) {
    return nextDayOfMonth(today, Number(dayOfMonth[1]));
  }

  for (const word of text.trim().split(' ')) {
    if (word in WEEKDAYS) {
      const daysAhead = (WEEKDAYS[word] - weekdayOf(today) + 7) % 7 || 7;
      return addDays(today, daysAhead);
    }
  }
  return null;
}
