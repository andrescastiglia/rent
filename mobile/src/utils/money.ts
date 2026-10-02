/** Accept plain positive amounts with at most two decimal places. */
export function parseMoneyInput(value: string): number | null {
  const normalized = value.trim().replace(',', '.');
  if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) return null;
  const amount = Number(normalized);
  if (
    !Number.isFinite(amount) ||
    amount <= 0 ||
    !Number.isSafeInteger(Math.round(amount * 100))
  )
    return null;
  return amount;
}
