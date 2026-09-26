const MS_PER_DAY = 24 * 60 * 60 * 1000;
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function isValidISODate(value: unknown): value is string {
  if (typeof value !== 'string' || !ISO_DATE_PATTERN.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
}

export function parseLocalDate(date: string): Date | null {
  const datePart = date.slice(0, 10);
  if (!isValidISODate(datePart)) return null;
  const [year, month, day] = datePart.split('-').map(Number);
  return new Date(year, month - 1, day);
}

export function todayLocalDate(): Date {
  const today = new Date();
  return new Date(today.getFullYear(), today.getMonth(), today.getDate());
}

export function todayLocalISO(now: Date = new Date()): string {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function calendarDayNumber(date: Date): number {
  return Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / MS_PER_DAY;
}

export function calendarDaysBetween(fromISO: string, toISO: string): number | null {
  const from = parseLocalDate(fromISO);
  const to = parseLocalDate(toISO);
  if (!from || !to) return null;
  return calendarDayNumber(to) - calendarDayNumber(from);
}

export function calendarDaysSince(iso: string, now: Date = new Date()): number | null {
  const from = parseLocalDate(iso);
  if (!from) return null;
  return calendarDayNumber(now) - calendarDayNumber(from);
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

  const diff = calendarDayNumber(end) - calendarDayNumber(start) + 1;
  return diff > 0 ? diff : null;
}
