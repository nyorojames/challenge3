// Money is always whole Kenyan shillings (INTEGER). Quantities can be fractional
// (1.5 kg), so a line total is rounded to the nearest shilling, once, here.
export function lineTotal(quantity, unitPrice) {
  return Math.round(quantity * unitPrice);
}

export function sumLineTotals(items) {
  return items.reduce((sum, item) => sum + item.line_total, 0);
}
