// The rules parser + grounding, on the kind of sentences a shopkeeper types.
// No database or network: customers and products are given directly.
import { describe, expect, it } from 'vitest';
import { parseWithRules } from '../src/providers/ai/rules.js';
import { groundEntry } from '../src/providers/ai/match.js';
import { resolveDueDate } from '../src/utils/swahiliDates.js';

const TODAY = '2026-10-05'; // a Monday

const customers = [
  { id: 'd1', name: 'Mama Wanjiku' },
  { id: 'd2', name: 'Baba Otieno' },
  { id: 'd3', name: 'Mzee Kamau' },
  { id: 'd7', name: 'Kevo' },
  { id: 'd8', name: 'Chebet' },
];
const products = [
  { id: 'p-sukari', name: 'sukari', unit: 'kg', price: 160 },
  { id: 'p-unga', name: 'unga', unit: 'pcs', price: 150 },
  { id: 'p-mafuta', name: 'mafuta', unit: 'litre', price: 330 },
  { id: 'p-mkate', name: 'mkate', unit: 'pcs', price: 65 },
  { id: 'p-mayai', name: 'mayai', unit: 'pcs', price: 18 },
  { id: 'p-soda', name: 'soda', unit: 'pcs', price: 60 },
  { id: 'p-taa', name: 'mafuta taa', unit: 'litre', price: 170 },
];

const parse = (text) => groundEntry(parseWithRules(text, TODAY), { customers, products });
const itemsOf = (entry) => entry.items.map((i) => [i.product_id, i.quantity]);

describe('rules parser', () => {
  it('Swahili credit sale with items and a weekday due date', () => {
    const e = parse('Mama Wanjiku amechukua sukari 2kg na mafuta, atalipa Ijumaa');
    expect(e).toMatchObject({ type: 'credit_sale', customer_id: 'd1', amount: 650, method: 'credit', due_date: '2026-10-09' });
    expect(itemsOf(e)).toEqual([['p-sukari', 2], ['p-mafuta', 1]]);
  });

  it('Swahili number words, plurals and "kesho"', () => {
    const e = parse('Kevo amechukua soda mbili na mikate 2, atanipa kesho');
    expect(itemsOf(e)).toEqual([['p-soda', 2], ['p-mkate', 2]]);
    expect(e).toMatchObject({ customer_id: 'd7', amount: 250, due_date: '2026-10-06' });
  });

  it('English sentence with a synonym ("cooking oil") and "next week"', () => {
    const e = parse('Baba Otieno took 3 unga and 1 cooking oil, will pay next week');
    expect(itemsOf(e)).toEqual([['p-unga', 3], ['p-mafuta', 1]]);
    expect(e).toMatchObject({ customer_id: 'd2', amount: 780, due_date: '2026-10-12' });
  });

  it('payment: typo in the name still matches, Sheng money, M-Pesa', () => {
    expect(parse('Wanjku amelipa 300')).toMatchObject({ type: 'payment', customer_id: 'd1', amount: 300 });
    expect(parse('Mzee Kamau paid 500 via mpesa')).toMatchObject({ type: 'payment', customer_id: 'd3', amount: 500, method: 'mpesa' });
    expect(parse('Chebet ametuma soo tatu')).toMatchObject({ type: 'payment', customer_id: 'd8', amount: 300, method: 'mpesa' });
  });

  it('cash sale: total from items, or the stated total wins', () => {
    expect(parse('sold 2 bread and 6 eggs')).toMatchObject({ type: 'cash_sale', amount: 238 });
    expect(parse('nimeuza sukari 2 kwa 300')).toMatchObject({ type: 'cash_sale', amount: 300 });
  });

  it('expense: "paid" with nobody before it is the shop paying', () => {
    expect(parse('nimelipa nauli 200')).toMatchObject({ type: 'expense', amount: 200, notes: 'nauli' });
    expect(parse('paid 500 for electricity')).toMatchObject({ type: 'expense', amount: 500, notes: 'electricity' });
  });

  it('restock: cost per unit comes from the total paid', () => {
    const e = parse('nimenunua sukari 20kg kwa 2,800');
    expect(e).toMatchObject({ type: 'restock', amount: 2800 });
    expect(e.items[0]).toMatchObject({ product_id: 'p-sukari', quantity: 20, unit_price: 140 });
  });

  it('flags a new customer and an unknown item, and lowers confidence', () => {
    const e = parse('Mama Akoth amechukua nusu kilo sukari na mandazi 3');
    expect(e).toMatchObject({ customer_id: null, customer_name: 'Mama Akoth', new_customer: true });
    expect(itemsOf(e)).toEqual([['p-sukari', 0.5], [null, 3]]);
    expect(e.confidence).toBeLessThanOrEqual(0.5);
  });

  it('"mafuta ya taa" is paraffin, not cooking oil', () => {
    expect(itemsOf(parse('nimeuza mafuta ya taa lita 2'))).toEqual([['p-taa', 2]]);
  });

  it('nonsense gives a low-confidence answer instead of crashing', () => {
    expect(parse('habari yako').confidence).toBeLessThan(0.5);
  });
});

describe('Swahili due dates', () => {
  it.each([
    ['Ijumaa', '2026-10-09'],
    ['Jumatatu', '2026-10-12'], // today is Monday -> NEXT Monday
    ['jumapili', '2026-10-11'],
    ['kesho kutwa', '2026-10-07'],
    ['mwisho wa mwezi', '2026-10-31'],
    ['tarehe 3', '2026-11-03'], // the 3rd has passed -> next month
    ['baada ya siku 10', '2026-10-15'],
    ['sijui', null],
  ])('%s -> %s', (phrase, expected) => {
    expect(resolveDueDate(phrase, TODAY)).toBe(expected);
  });
});
