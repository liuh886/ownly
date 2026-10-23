/** Legacy Ownly records without a currency were denominated in CNY. */
export function recordCurrency(record: { currency?: string; object_type?: string; billing_currency?: string }): string {
  return ((record.object_type === 'recurring_cost' ? record.billing_currency?.trim() : undefined) || record.currency?.trim() || 'CNY').toUpperCase();
}

export function matchesCurrency(record: { currency?: string; object_type?: string; billing_currency?: string }, currency: string): boolean {
  return recordCurrency(record) === currency.trim().toUpperCase();
}
