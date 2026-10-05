// Display helpers. Money arrives from the API as whole shillings (integers).

export function formatKES(amount) {
  return `KES ${Number(amount ?? 0).toLocaleString('en-KE')}`;
}

const LOCALES = { sw: 'sw-KE', en: 'en-KE' };

// '2026-10-05' (a due date) or an ISO timestamp -> "5 Okt 2026" / "5 Oct 2026"
export function formatDate(value, lang) {
  if (!value) return '';
  // A bare date has no time; read it as noon so no timezone can move it a day.
  const date = value.length === 10 ? new Date(`${value}T12:00:00`) : new Date(value);
  return date.toLocaleDateString(LOCALES[lang], { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Africa/Nairobi' });
}

export function formatDateTime(value, lang) {
  return new Date(value).toLocaleString(LOCALES[lang], {
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Nairobi',
  });
}

// Today in Kenya as 'YYYY-MM-DD' (used for "due today" and date inputs).
export function todayInKenya() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Nairobi' }).format(new Date());
}

// "sukari ×2, mafuta ×1"
export function itemsSummary(items) {
  return items.map((i) => `${i.description} ×${Number(i.quantity)}`).join(', ');
}
