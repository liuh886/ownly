const MS_PER_DAY = 24 * 60 * 60 * 1000;
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function parseLocalDate(date: string): Date | null {
  const parsed = new Date(`${date}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function isValidISODate(value: unknown): value is string {
  if (typeof value !== 'string' || !ISO_DATE_PATTERN.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
}

export function todayLocalDate(): Date {
  const today = new Date();
  return new Date(today.getFullYear(), today.getMonth(), today.getDate());
}

export function calculateInclusiveDays(
  startDate?: string,
  endDate?: string | null,
  today: Date = todayLocalDate(),
): number | null {
  if (!startDate) return null;

  const start = parseLocalDate(startDate);
  const end = endDate ? parseLocalDate(endDate) : today;
  if (!start || !end) return null;

  const diff = Math.floor((end.getTime() - start.getTime()) / MS_PER_DAY) + 1;
  return Number.isFinite(diff) && diff > 0 ? diff : null;
}
