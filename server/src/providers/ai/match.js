// Fuzzy matching of names to the shop's real customers and products, and the
// "grounding" step that every AI provider's output goes through.
// Pure functions with no imports from config/Node, so the browser can reuse them offline.

const HONORIFICS = new Set(['mama', 'baba', 'mzee', 'mwalimu', 'bi', 'bw', 'dada', 'kaka', 'shosh', 'cucu', 'mr', 'mrs', 'ms', 'teacher']);
const CONNECTORS = new Set(['ya', 'wa', 'za', 'la', 'cha', 'of', 'the', 'a']);

// English and common alternative words -> the product name used in the shop.
const PRODUCT_SYNONYMS = {
  sugar: 'sukari',
  flour: 'unga', 'maize flour': 'unga', 'unga ugali': 'unga', ugali: 'unga',
  oil: 'mafuta', 'cooking oil': 'mafuta',
  milk: 'maziwa',
  soap: 'sabuni',
  tea: 'chai', 'tea leaves': 'chai', majani: 'chai', 'majani chai': 'chai',
  rice: 'mchele',
  bread: 'mkate',
  egg: 'mayai', eggs: 'mayai', yai: 'mayai',
  'wheat flour': 'ngano', 'unga ngano': 'ngano',
  salt: 'chumvi',
  matches: 'kiberiti', matchbox: 'kiberiti', 'match box': 'kiberiti',
  paraffin: 'mafuta taa', kerosene: 'mafuta taa',
};

export function normalizeText(value) {
  return String(value ?? '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '') // drop accents
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Number of single-letter edits to turn a into b (classic Levenshtein distance).
function editDistance(a, b) {
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      current[j] = Math.min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + cost);
    }
    previous = current;
  }
  return previous[b.length];
}

// 1 = identical, 0 = nothing in common. "wanjku" vs "wanjiku" = 0.86, "mikate" vs "mkate" = 0.83.
export function similarity(a, b) {
  if (!a || !b) return 0;
  return 1 - editDistance(a, b) / Math.max(a.length, b.length);
}

/**
 * Finds the customer a name refers to: "Wanjiku" -> "Mama Wanjiku", "Kamau" -> "Mzee Kamau",
 * "Wanjku" (typo) -> "Mama Wanjiku". Titles like "Mama" are ignored unless they are
 * the only word ("Mwalimu" -> "Mwalimu Njoroge").
 * Returns { customer, ambiguous }; customer is null when unsure.
 */
export function matchCustomer(name, customers) {
  const query = normalizeText(name);
  if (!query) return { customer: null, ambiguous: false };

  const exact = customers.filter((c) => normalizeText(c.name) === query);
  if (exact.length === 1) return { customer: exact[0], ambiguous: false };

  const allTokens = query.split(' ');
  const keyTokens = allTokens.filter((t) => !HONORIFICS.has(t));
  const queryTokens = keyTokens.length > 0 ? keyTokens : allTokens;

  // Score = how well each important word of the query matches some word of the customer's name.
  const scored = customers
    .map((customer) => {
      const nameTokens = normalizeText(customer.name).split(' ');
      const total = queryTokens.reduce((sum, qt) => sum + Math.max(...nameTokens.map((nt) => similarity(qt, nt))), 0);
      return { customer, score: total / queryTokens.length };
    })
    .sort((a, b) => b.score - a.score);

  const [best, second] = scored;
  if (!best || best.score < 0.8) return { customer: null, ambiguous: false };
  // Two customers fit equally well (two "Wanjiku"s): don't guess, let the shopkeeper pick.
  if (second && best.score - second.score < 0.05) return { customer: null, ambiguous: true };
  return { customer: best.customer, ambiguous: false };
}

/**
 * Finds the product a phrase refers to: "sukari", "sugar", "mikate" (plural of mkate),
 * "unga wa ugali", "mafuta ya taa". Returns the product or null.
 */
export function matchProduct(phrase, products) {
  const words = normalizeText(phrase).split(' ').filter((w) => w && !CONNECTORS.has(w));
  if (words.length === 0) return null;
  const joined = words.join(' ');
  const byName = (name) => products.find((p) => normalizeText(p.name) === name) ?? null;

  // 1. Exact name, or a known synonym ("sugar" -> "sukari").
  const exact = byName(joined) ?? byName(PRODUCT_SYNONYMS[joined]);
  if (exact) return exact;

  // 2. The phrase contains a product name: "unga wa ugali" -> "unga".
  //    Longest name first, so "mafuta taa" wins over "mafuta".
  const contained = [...products]
    .sort((a, b) => b.name.length - a.name.length)
    .find((p) => ` ${joined} `.includes(` ${normalizeText(p.name)} `));
  if (contained) return contained;
  for (const word of words) {
    const synonym = byName(PRODUCT_SYNONYMS[word]);
    if (synonym) return synonym;
  }

  // 3. Close spelling: "mikate" -> "mkate", "sukary" -> "sukari".
  let best = null;
  let bestScore = 0;
  for (const product of products) {
    const name = normalizeText(product.name);
    const score = Math.max(similarity(joined, name), ...words.map((w) => similarity(w, name)));
    if (score > bestScore) { best = product; bestScore = score; }
  }
  return bestScore >= 0.75 ? best : null;
}

const NEEDS_CUSTOMER = ['credit_sale', 'payment'];
const SALE_TYPES = ['cash_sale', 'credit_sale'];

/**
 * "Grounding": turns what a parser THINKS the sentence says into an entry that
 * only uses real data from this shop.
 *   - customer_id / product_id must exist in the shop's lists (an AI cannot invent one)
 *   - sale prices come from the product catalog, not from the AI
 *   - amount = sum of the items unless the sentence gave a total ("kwa 300")
 *   - a customer name that matches nobody is flagged as a new customer
 * Every provider (Gemini, Ollama, rules) goes through this same function.
 */
export function groundEntry(raw, { customers, products }) {
  const notes = raw.notes ? [raw.notes] : [];
  const type = raw.type;

  // --- customer ---
  let customer = null;
  let newCustomer = false;
  if (NEEDS_CUSTOMER.includes(type)) {
    customer = customers.find((c) => c.id === raw.customer_id) ?? null;
    if (!customer && raw.customer_name) {
      const match = matchCustomer(raw.customer_name, customers);
      customer = match.customer;
      if (match.ambiguous) notes.push(`More than one customer matches "${raw.customer_name}"`);
      newCustomer = !customer && !match.ambiguous;
    }
  }

  // --- items ---
  let unknownItems = 0;
  const items = (raw.items ?? []).map((item) => {
    const product = products.find((p) => p.id === item.product_id) ?? matchProduct(item.name, products);
    if (!product) unknownItems += 1;
    const quantity = item.quantity > 0 ? item.quantity : 1;
    // Sales use OUR price list. For a restock the price is what the supplier charged.
    let unitPrice = SALE_TYPES.includes(type) && product ? product.price : item.unit_price ?? null;
    if (type === 'restock' && unitPrice == null && raw.amount && raw.items.length === 1) {
      unitPrice = Math.round(raw.amount / quantity);
    }
    return {
      name: product ? product.name : String(item.name ?? '').trim(),
      product_id: product?.id ?? null,
      quantity,
      unit: product?.unit ?? item.unit ?? null,
      unit_price: unitPrice == null ? null : Math.round(unitPrice),
    };
  });

  const itemsTotal = items.reduce((sum, i) => sum + Math.round(i.quantity * (i.unit_price ?? 0)), 0);
  const amount = raw.amount > 0 ? Math.round(raw.amount) : itemsTotal > 0 ? itemsTotal : null;

  // --- confidence: never trust an entry with unknown pieces too much ---
  let confidence = Math.min(Math.max(Number(raw.confidence) || 0, 0), 1);
  if (unknownItems > 0) confidence = Math.min(confidence, 0.5);
  if (NEEDS_CUSTOMER.includes(type) && !customer) confidence = Math.min(confidence, 0.6);
  if (!amount) confidence = Math.min(confidence, 0.4);

  return {
    type,
    customer_id: customer?.id ?? null,
    customer_name: customer?.name ?? (NEEDS_CUSTOMER.includes(type) ? raw.customer_name ?? null : null),
    new_customer: newCustomer,
    items,
    amount,
    method: type === 'credit_sale' ? 'credit' : ['cash', 'mpesa'].includes(raw.method) ? raw.method : null,
    due_date: type === 'credit_sale' && /^\d{4}-\d{2}-\d{2}$/.test(raw.due_date ?? '') ? raw.due_date : null,
    confidence: Math.round(confidence * 100) / 100,
    notes: notes.join('. ') || null,
  };
}
