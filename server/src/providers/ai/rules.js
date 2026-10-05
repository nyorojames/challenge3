// Rule-based parser: no internet, no AI, always answers.
// It only EXTRACTS what the sentence says (who, what, how many, how much, when).
// Matching names to real customers/products happens afterwards in match.js#groundEntry.
// Pure module (no config/Node imports) so the browser can run it offline.
import { resolveDueDate } from '../../utils/swahiliDates.js';

// Verbs that tell us the transaction type. For each sentence we pick the verb that
// appears first (and the longest one when two start at the same place, so
// "i paid" beats "paid").
const VERBS = [
  { type: 'credit_sale', words: ['amechukua', 'amechukuwa', 'alichukua', 'amekopa', 'amekopeshwa', 'took', 'has taken', 'borrowed', 'took on credit'] },
  { type: 'payment', words: ['amelipa', 'alilipa', 'amelipia', 'ametuma', 'amerudisha', 'paid', 'has paid', 'sent'] },
  { type: 'cash_sale', words: ['nimeuza', 'niliuza', 'tumeuza', 'sold', 'i sold', 'i have sold'] },
  { type: 'expense', words: ['nimelipa', 'nililipa', 'nimelipia', 'nimetumia', 'i paid', 'i spent', 'spent', 'paid for'] },
  { type: 'restock', words: ['nimenunua', 'nilinunua', 'nimeleta', 'bought', 'i bought', 'restocked'] },
];

// Words that start the "when will they pay" part: "atalipa Ijumaa", "will pay Friday".
const DUE_MARKERS = /\b(atalipa|atanipa|atarudisha|atalipia|alipe|will pay|to pay|pays|payable|due)\b/;

const NUMBER_WORDS = {
  moja: 1, mbili: 2, tatu: 3, nne: 4, tano: 5, sita: 6, saba: 7, nane: 8, tisa: 9, kumi: 10,
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  nusu: 0.5, half: 0.5, robo: 0.25, quarter: 0.25,
};

// Sheng money words: "soo tatu" = 300, "thao" = 1000, "mbao" = 20, "chuani" = 50.
const SHENG_MONEY = { mbao: 20, chuani: 50, soo: 100, thao: 1000, ngiri: 1000 };

const UNIT_WORDS = {
  kg: 'kg', kgs: 'kg', kilo: 'kg', kilos: 'kg', g: 'g', gram: 'g', grams: 'g', gm: 'g',
  l: 'litre', lt: 'litre', ltr: 'litre', lita: 'litre', litre: 'litre', litres: 'litre', liter: 'litre', liters: 'litre', ml: 'ml',
  pakiti: 'pcs', packet: 'pcs', packets: 'pcs', pkt: 'pcs', pc: 'pcs', pcs: 'pcs', piece: 'pcs', pieces: 'pcs', kipande: 'pcs', vipande: 'pcs',
};

const SKIP_WORDS = new Set(['za', 'ya', 'wa', 'la', 'cha', 'vya', 'of', 'the', 'a', 'an', 'some', 'kwa', 'for', 'via', 'by', 'with', 'na', 'and', 'on', 'kama']);
const CREDIT_WORDS = new Set(['mkopo', 'deni', 'credit']);
const CURRENCY = /^(ksh|kes|kshs|sh|shs|bob)$/;

const MPESA_WORDS = /\b(m ?pesa|mpesa|kwa simu|till|paybill)\b/;
const CASH_WORDS = /\b(cash|taslimu|keshi|kash|pesa mkononi)\b/;

function findVerb(text) {
  let found = null;
  for (const { type, words } of VERBS) {
    for (const word of words) {
      const match = new RegExp(`\\b${word}\\b`).exec(text);
      if (!match) continue;
      const better = !found || match.index < found.index || (match.index === found.index && word.length > found.word.length);
      if (better) found = { type, word, index: match.index };
    }
  }
  return found;
}

// "300", "1500", "1.5k", "300/=" -> number; "soo" + "tatu" -> 300. Returns { value, used } or null.
function readMoney(tokens, start) {
  let i = start;
  if (CURRENCY.test(tokens[i] ?? '')) i += 1; // "ksh 300"
  const token = tokens[i] ?? '';
  const numeric = token.match(/^(?:ksh|kes|sh)?(\d+(?:\.\d+)?)(k)?(?:\/=|\/-)?$/);
  if (numeric) {
    const value = Number(numeric[1]) * (numeric[2] ? 1000 : 1);
    return { value: Math.round(value), used: i - start + 1 };
  }
  if (token in SHENG_MONEY) {
    const times = NUMBER_WORDS[tokens[i + 1]];
    return times ? { value: SHENG_MONEY[token] * times, used: i - start + 2 } : { value: SHENG_MONEY[token], used: i - start + 1 };
  }
  return null;
}

// One item phrase: "sukari 2kg", "2 kg sukari", "kilo mbili za sukari", "soda mbili", "nusu kilo unga".
function readItem(tokens) {
  let quantity = null;
  let unit = null;
  const nameWords = [];
  for (const token of tokens) {
    const withUnit = token.match(/^(\d+(?:\.\d+)?)([a-z]+)$/); // "2kg", "500g", "1l"
    if (/^\d+(\.\d+)?$/.test(token)) quantity = Number(token);
    else if (withUnit && UNIT_WORDS[withUnit[2]]) { quantity = Number(withUnit[1]); unit = UNIT_WORDS[withUnit[2]]; }
    else if (token in NUMBER_WORDS) quantity = (quantity ?? 1) * NUMBER_WORDS[token]; // "nusu kilo" = 0.5
    else if (token in UNIT_WORDS) unit = UNIT_WORDS[token];
    else if (!SKIP_WORDS.has(token)) nameWords.push(token);
  }
  if (nameWords.length === 0) return null;
  // 500g of sukari (sold per kg) = 0.5 kg
  if (unit === 'g' || unit === 'ml') { quantity = (quantity ?? 1) / 1000; unit = unit === 'g' ? 'kg' : 'litre'; }
  return { name: nameWords.join(' '), quantity: quantity ?? 1, unit, unit_price: null };
}

/**
 * Parses one sentence into a raw entry (same shape the LLMs return):
 * { type, customer_name, customer_id, items, amount, method, due_date, confidence, notes }
 * @param text  e.g. "Mama Wanjiku amechukua sukari 2kg na mafuta, atalipa Ijumaa"
 * @param today 'YYYY-MM-DD' (Kenya), needed to turn "Ijumaa" into a date
 */
export function parseWithRules(text, today) {
  // Lower-case copy for matching. Punctuation becomes spaces (same length), so
  // positions in `lower` still point at the same characters in `original`.
  // Commas are kept: they separate items ("sukari, mafuta").
  const original = String(text).replace(/(\d),(\d{3})\b/g, '$1$2'); // "1,000" -> "1000"
  const lower = original.toLowerCase().replace(/[.;:!?()"]/g, ' ');

  const verb = findVerb(lower);
  let type = verb?.type ?? null;
  let subject = verb ? original.slice(0, verb.index).replace(/[.,;:!?()"]/g, ' ').replace(/\s+/g, ' ').trim() : '';
  let rest = (verb ? lower.slice(verb.index + verb.word.length) : lower).replace(/,/g, ' , ');

  // "paid 200 for transport" with nobody before the verb = the shop paid = expense.
  if (type === 'payment' && ['', 'i', 'mimi', 'we', 'sisi'].includes(subject.toLowerCase())) {
    type = 'expense';
    subject = '';
  }

  // 1. The "when" part: "atalipa Ijumaa" -> due date. Cut it off the rest.
  let dueDate = null;
  const due = DUE_MARKERS.exec(rest);
  if (due) {
    dueDate = resolveDueDate(rest.slice(due.index + due[0].length), today);
    rest = rest.slice(0, due.index);
  }

  // 2. How it was paid.
  let method = null;
  if (MPESA_WORDS.test(rest) || (verb?.word === 'ametuma')) method = 'mpesa'; // "ametuma" = sent (by phone)
  else if (CASH_WORDS.test(rest)) method = 'cash';
  rest = rest.replace(MPESA_WORDS, ' ').replace(CASH_WORDS, ' ');

  const tokens = rest.split(/\s+/).filter(Boolean);
  if (tokens.some((t) => CREDIT_WORDS.has(t)) && type === 'cash_sale') type = 'credit_sale'; // "nimeuza ... kwa mkopo"
  const remaining = tokens.filter((t) => !CREDIT_WORDS.has(t));

  // 3. Amount and items.
  let amount = null;
  let items = [];
  let note = null;

  if (type === 'payment' || type === 'expense') {
    // The first money expression anywhere: "amelipa 300", "nimelipa stima 500", "ametuma soo tatu".
    const leftover = [];
    for (let i = 0; i < remaining.length; i++) {
      const money = amount === null ? readMoney(remaining, i) : null;
      if (money) { amount = money.value; i += money.used - 1; continue; }
      if (!SKIP_WORDS.has(remaining[i]) && !CURRENCY.test(remaining[i]) && remaining[i] !== ',') leftover.push(remaining[i]);
    }
    if (type === 'expense') note = leftover.join(' ') || null; // "nauli", "electricity"
  } else {
    // A total after "kwa/for/at/@": "nimeuza sukari 2 kwa 300". Everything else is items.
    const itemTokens = [];
    for (let i = 0; i < remaining.length; i++) {
      const money = ['kwa', 'for', 'at', '@'].includes(remaining[i]) ? readMoney(remaining, i + 1) : null;
      if (money) { amount = money.value; i += money.used; continue; }
      itemTokens.push(remaining[i]);
    }
    // Items are separated by "na", "and", "&" or a comma.
    const chunks = [[]];
    for (const token of itemTokens) {
      if (['na', 'and', '&', ',', 'pamoja', 'plus'].includes(token)) chunks.push([]);
      else chunks[chunks.length - 1].push(token);
    }
    items = chunks.flatMap(splitRunOnItems).map(readItem).filter(Boolean);
  }

  // Rules are honest about their limits: lower confidence than a working LLM.
  const understood = type && (amount || items.length > 0);
  return {
    type: type ?? 'cash_sale',
    customer_name: ['credit_sale', 'payment'].includes(type) && subject ? subject : null,
    customer_id: null,
    items,
    amount,
    method,
    due_date: type === 'credit_sale' ? dueDate : null,
    confidence: understood ? 0.7 : 0.2,
    notes: note ?? (type ? null : 'Could not tell what kind of entry this is'),
  };
}

// Splits items that have no "na"/comma between them:
//   "sukari 2kg mafuta 1" -> [sukari 2kg] [mafuta 1]   (a name after "name + quantity")
//   "2 sukari 3 mafuta"   -> [2 sukari] [3 mafuta]     (a quantity after "quantity + name")
//   "1 cooking oil"       -> [1 cooking oil]           (stays one item)
function splitRunOnItems(tokens) {
  const isQuantity = (t) => /^\d/.test(t) || t in NUMBER_WORDS;
  const groups = [[]];
  let hasName = false;
  let hasQty = false;
  let qtyAfterName = false;
  const startNewGroup = () => {
    groups.push([]);
    hasName = false;
    hasQty = false;
    qtyAfterName = false;
  };
  for (const token of tokens) {
    const quantity = isQuantity(token);
    const isName = !quantity && !(token in UNIT_WORDS) && !SKIP_WORDS.has(token);
    if ((quantity && hasName && hasQty) || (isName && qtyAfterName)) startNewGroup();
    groups[groups.length - 1].push(token);
    if (quantity && hasName) qtyAfterName = true;
    if (isName) hasName = true;
    if (quantity) hasQty = true;
  }
  return groups;
}
