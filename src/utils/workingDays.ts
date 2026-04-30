import type { WorkingDaysConfig } from '@/types';

export function isWorkingDay(dateStr: string, config: WorkingDaysConfig): boolean {
  const d = new Date(dateStr + 'T00:00:00');
  if (config.weekends.includes(d.getDay())) return false;
  if (config.holidays.includes(dateStr)) return false;
  return true;
}

export function addWorkingDays(
  startDateStr: string,
  days: number,
  config: WorkingDaysConfig,
): string {
  const d = new Date(startDateStr + 'T00:00:00');
  let remaining = days;
  while (remaining > 0) {
    d.setDate(d.getDate() + 1);
    if (isWorkingDay(toISO(d), config)) remaining--;
  }
  return toISO(d);
}

export function workingDaysBetween(
  startDateStr: string,
  endDateStr: string,
  config: WorkingDaysConfig,
): number {
  const start = new Date(startDateStr + 'T00:00:00');
  const end = new Date(endDateStr + 'T00:00:00');
  if (start > end) return 0;
  let count = 0;
  const d = new Date(start);
  while (d <= end) {
    if (isWorkingDay(toISO(d), config)) count++;
    d.setDate(d.getDate() + 1);
  }
  return count;
}

export function workingDaysRemaining(endDateStr: string, config: WorkingDaysConfig): number {
  const today = toISO(new Date());
  if (today > endDateStr) return 0;
  return workingDaysBetween(today, endDateStr, config);
}

export function workingDaysInWeek(isoWeekStart: string, config: WorkingDaysConfig): string[] {
  const days: string[] = [];
  const d = new Date(isoWeekStart + 'T00:00:00');
  for (let i = 0; i < 7; i++) {
    const ds = toISO(d);
    if (isWorkingDay(ds, config)) days.push(ds);
    d.setDate(d.getDate() + 1);
  }
  return days;
}

export function getISOWeekStart(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  const day = d.getDay();
  // shift so Monday = 0
  const diff = (day + 6) % 7;
  d.setDate(d.getDate() - diff);
  return toISO(d);
}

export function toISO(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function enumerateWeeks(startDateStr: string, endDateStr: string): string[] {
  const weeks: string[] = [];
  const start = new Date(getISOWeekStart(startDateStr) + 'T00:00:00');
  const end = new Date(endDateStr + 'T00:00:00');
  const d = new Date(start);
  while (d <= end) {
    weeks.push(toISO(d));
    d.setDate(d.getDate() + 7);
  }
  return weeks;
}
