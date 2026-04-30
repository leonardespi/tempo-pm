import { describe, it, expect } from 'vitest';
import {
  isWorkingDay,
  workingDaysBetween,
  addWorkingDays,
  getISOWeekStart,
  workingDaysRemaining,
} from './workingDays';
import type { WorkingDaysConfig } from '@/types';

const config: WorkingDaysConfig = {
  weekends: [0, 6], // Sun, Sat
  holidays: ['2025-01-01', '2025-12-25'],
};

describe('isWorkingDay', () => {
  it('returns false for Saturday', () => {
    expect(isWorkingDay('2025-01-04', config)).toBe(false); // Saturday
  });
  it('returns false for Sunday', () => {
    expect(isWorkingDay('2025-01-05', config)).toBe(false); // Sunday
  });
  it('returns false for holiday', () => {
    expect(isWorkingDay('2025-01-01', config)).toBe(false);
  });
  it('returns true for normal weekday', () => {
    expect(isWorkingDay('2025-01-06', config)).toBe(true); // Monday
  });
  it('returns true for Christmas if not in holidays', () => {
    expect(isWorkingDay('2025-12-26', config)).toBe(true);
  });
});

describe('workingDaysBetween', () => {
  it('counts Mon–Fri of a single week', () => {
    // 2025-01-06 Mon to 2025-01-10 Fri = 5
    expect(workingDaysBetween('2025-01-06', '2025-01-10', config)).toBe(5);
  });
  it('excludes weekends across two weeks', () => {
    // Mon 2025-01-06 to Mon 2025-01-13 = 6 working days (Mon-Fri + Mon)
    expect(workingDaysBetween('2025-01-06', '2025-01-13', config)).toBe(6);
  });
  it('excludes holiday', () => {
    // 2024-12-30 Mon to 2025-01-03 Fri  = 5 days but 2025-01-01 is holiday
    expect(workingDaysBetween('2024-12-30', '2025-01-03', config)).toBe(4);
  });
  it('returns 0 when start > end', () => {
    expect(workingDaysBetween('2025-01-10', '2025-01-06', config)).toBe(0);
  });
  it('year boundary: Dec 29 2024 to Jan 3 2025', () => {
    // Dec 30 Mon, Dec 31 Tue, Jan 1 holiday, Jan 2 Thu, Jan 3 Fri = 4 working days
    expect(workingDaysBetween('2024-12-29', '2025-01-03', config)).toBe(4);
  });
});

describe('addWorkingDays', () => {
  it('adds 5 working days skipping a weekend', () => {
    // Mon Jan 6 + 5 = Mon Jan 13
    expect(addWorkingDays('2025-01-06', 5, config)).toBe('2025-01-13');
  });
  it('skips holiday', () => {
    // Dec 26 Thu + 5 (skip Dec 27 Sat, Dec 28 Sun, Jan 1 holiday) = Jan 3
    // Dec 27=Sat, Dec 28=Sun skip, Dec 29=Sun... wait let me recompute
    // 2024-12-26 Thu: +1=Fri Dec 27, +2=Mon Dec 30, +3=Tue Dec 31, +4=Thu Jan 2 (skip Jan 1 holiday), +5=Fri Jan 3
    expect(addWorkingDays('2024-12-26', 5, config)).toBe('2025-01-03');
  });
});

describe('getISOWeekStart', () => {
  it('Monday returns itself', () => {
    expect(getISOWeekStart('2025-01-06')).toBe('2025-01-06');
  });
  it('Wednesday returns Monday of same week', () => {
    expect(getISOWeekStart('2025-01-08')).toBe('2025-01-06');
  });
  it('Sunday returns previous Monday', () => {
    expect(getISOWeekStart('2025-01-05')).toBe('2024-12-30');
  });
});

describe('workingDaysRemaining', () => {
  it('returns 0 for past date', () => {
    expect(workingDaysRemaining('2020-01-01', config)).toBe(0);
  });
});
