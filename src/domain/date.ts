const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function parseLocalDate(date: string): Date | null {
  const parsed = new Date(`${date}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
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
