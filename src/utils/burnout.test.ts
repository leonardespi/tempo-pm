import { describe, it, expect } from 'vitest';
import { prorateEffort, buildBurnoutData } from './burnout';
import type { Project, Task, Subtask, User, WorkingDaysConfig } from '@/types';

const STD_CONFIG: WorkingDaysConfig = { weekends: [0, 6], holidays: [] };
const HOLIDAY_CONFIG: WorkingDaysConfig = { weekends: [0, 6], holidays: ['2026-05-25'] };

// ─── prorateEffort ────────────────────────────────────────────────────────────

describe('prorateEffort', () => {
  // Scenario 1: subtask fills exactly one working week → full effort in that week.
  // Hand-computed: 10 pts × (5 working days / 5 total) = 10.0
  it('scenario 1 — single subtask covering full working week', () => {
    const sub: Subtask = {
      id: 's1',
      taskId: 't1',
      name: 'Full week',
      startDate: '2026-04-06', // Mon
      endDate: '2026-04-10', // Fri
      effortPoints: 10,
      status: 'not_started',
      assigneeId: 'u1',
    };
    const effort = prorateEffort(sub, '2026-04-06', STD_CONFIG);
    expect(effort).toBeCloseTo(10.0, 5);
  });

  it('scenario 1 — returns 0 for a week before the subtask', () => {
    const sub: Subtask = {
      id: 's1',
      taskId: 't1',
      name: 'Later',
      startDate: '2026-04-13',
      endDate: '2026-04-17',
      effortPoints: 10,
      status: 'not_started',
      assigneeId: 'u1',
    };
    expect(prorateEffort(sub, '2026-04-06', STD_CONFIG)).toBe(0);
  });

  // Scenario 2: subtask crosses a week boundary.
  // Sub B: Wed Apr 8 – Tue Apr 14, 10 pts, totalWorkingDays = 5
  //   Week Apr 6: 3 days in week (Wed/Thu/Fri) → 10 × (3/5) = 6.0
  //   Week Apr 13: 2 days in week (Mon/Tue)   → 10 × (2/5) = 4.0
  it('scenario 2 — subtask spanning week boundary: first week portion', () => {
    const sub: Subtask = {
      id: 'sb',
      taskId: 't1',
      name: 'Crossing',
      startDate: '2026-04-08', // Wed
      endDate: '2026-04-14', // Tue
      effortPoints: 10,
      status: 'in_progress',
      assigneeId: 'u1',
    };
    expect(prorateEffort(sub, '2026-04-06', STD_CONFIG)).toBeCloseTo(6.0, 5);
  });

  it('scenario 2 — subtask spanning week boundary: second week portion', () => {
    const sub: Subtask = {
      id: 'sb',
      taskId: 't1',
      name: 'Crossing',
      startDate: '2026-04-08',
      endDate: '2026-04-14',
      effortPoints: 10,
      status: 'in_progress',
      assigneeId: 'u1',
    };
    expect(prorateEffort(sub, '2026-04-13', STD_CONFIG)).toBeCloseTo(4.0, 5);
  });

  // Scenario 3: holiday excluded from working-day count.
  // Sub: Fri May 22 – Fri May 29, 10 pts, May 25 (Mon) is a holiday.
  // totalWorkingDays = 5 (May 22,26,27,28,29 — May 25 excluded)
  //   Week May 18: only May 22 in [May 22,May 29] ∩ week → 10 × (1/5) = 2.0
  //   Week May 25: workingDaysInWeek = [May 26,27,28,29] → 4 days → 10 × (4/5) = 8.0
  it('scenario 3 — holiday reduces working days: week before holiday', () => {
    const sub: Subtask = {
      id: 'sh',
      taskId: 't1',
      name: 'Holiday span',
      startDate: '2026-05-22', // Fri
      endDate: '2026-05-29', // Fri
      effortPoints: 10,
      status: 'not_started',
      assigneeId: 'u1',
    };
    expect(prorateEffort(sub, '2026-05-18', HOLIDAY_CONFIG)).toBeCloseTo(2.0, 5);
  });

  it('scenario 3 — holiday reduces working days: week containing holiday', () => {
    const sub: Subtask = {
      id: 'sh',
      taskId: 't1',
      name: 'Holiday span',
      startDate: '2026-05-22',
      endDate: '2026-05-29',
      effortPoints: 10,
      status: 'not_started',
      assigneeId: 'u1',
    };
    // Without holiday this week has 5 working days; with it, only 4 are working.
    // But the subtask already skips May 25 in its totalWorkingDays too (=5 not 6),
    // so the ratio reflects that May 25 is a non-day for both numerator and denominator.
    // daysInWeek ∩ subtask = [May 26,27,28,29] = 4; total = 5 → 10×(4/5) = 8.0
    expect(prorateEffort(sub, '2026-05-25', HOLIDAY_CONFIG)).toBeCloseTo(8.0, 5);
  });
});

// ─── buildBurnoutData ─────────────────────────────────────────────────────────

const users: User[] = [
  { id: 'u1', name: 'Alice', color: '#C17D52', weeklyCapacity: 10 },
  { id: 'u2', name: 'Bob', color: '#4A7FA5', weeklyCapacity: 8 },
];
const projects: Project[] = [
  {
    id: 'p1',
    name: 'Alpha',
    createdAt: '2026-01-01T00:00:00Z',
    startDate: '2026-04-06',
    endDate: '2026-04-17',
  },
];
const tasks: Task[] = [{ id: 't1', projectId: 'p1', name: 'Design', dependsOn: [] }];

describe('buildBurnoutData', () => {
  it('returns empty when no users', () => {
    const sub: Subtask = {
      id: 's1',
      taskId: 't1',
      name: 'x',
      startDate: '2026-04-06',
      endDate: '2026-04-10',
      effortPoints: 5,
      status: 'done',
      assigneeId: 'u1',
    };
    const result = buildBurnoutData(projects, tasks, [sub], [], STD_CONFIG, '');
    expect(result.rows).toHaveLength(0);
    expect(result.allWeeks).toHaveLength(0);
  });

  it('returns empty when no assigned subtasks', () => {
    const sub: Subtask = {
      id: 's1',
      taskId: 't1',
      name: 'x',
      startDate: '2026-04-06',
      endDate: '2026-04-10',
      effortPoints: 5,
      status: 'done',
      // no assigneeId
    };
    const result = buildBurnoutData(projects, tasks, [sub], users, STD_CONFIG, '');
    expect(result.rows).toHaveLength(0);
  });

  // Scenario 2 via buildBurnoutData: overlapping subtasks across week boundary.
  it('scenario 2 — overlapping subtasks: load ratio computed correctly per week', () => {
    const subs: Subtask[] = [
      {
        id: 'sa',
        taskId: 't1',
        name: 'Sub A',
        startDate: '2026-04-06',
        endDate: '2026-04-10',
        effortPoints: 5,
        status: 'done',
        assigneeId: 'u1',
      },
      {
        id: 'sb',
        taskId: 't1',
        name: 'Sub B',
        startDate: '2026-04-08',
        endDate: '2026-04-14',
        effortPoints: 10,
        status: 'in_progress',
        assigneeId: 'u1',
      },
    ];
    const { rows, allWeeks } = buildBurnoutData(projects, tasks, subs, [users[0]], STD_CONFIG, '');

    expect(allWeeks).toContain('2026-04-06');
    expect(allWeeks).toContain('2026-04-13');

    const alice = rows[0];
    expect(alice).toBeDefined();

    const week1 = alice.weeks.find((w) => w.weekStart === '2026-04-06');
    const week2 = alice.weeks.find((w) => w.weekStart === '2026-04-13');

    // Week Apr 6: 5×(5/5) + 10×(3/5) = 5 + 6 = 11 → ratio 1.1
    expect(week1?.effortPts).toBeCloseTo(11.0, 4);
    expect(week1?.loadRatio).toBeCloseTo(1.1, 4);

    // Week Apr 13: 10×(2/5) = 4 → ratio 0.4
    expect(week2?.effortPts).toBeCloseTo(4.0, 4);
    expect(week2?.loadRatio).toBeCloseTo(0.4, 4);
  });

  it('filters by project correctly', () => {
    const p2: Project = {
      id: 'p2',
      name: 'Beta',
      createdAt: '2026-01-01T00:00:00Z',
      startDate: '2026-04-06',
      endDate: '2026-04-10',
    };
    const t2: Task = { id: 't2', projectId: 'p2', name: 'T2', dependsOn: [] };
    const subs: Subtask[] = [
      {
        id: 's1',
        taskId: 't1',
        name: 'P1 sub',
        startDate: '2026-04-06',
        endDate: '2026-04-10',
        effortPoints: 5,
        status: 'done',
        assigneeId: 'u1',
      },
      {
        id: 's2',
        taskId: 't2',
        name: 'P2 sub',
        startDate: '2026-04-06',
        endDate: '2026-04-10',
        effortPoints: 8,
        status: 'done',
        assigneeId: 'u1',
      },
    ];
    const { rows } = buildBurnoutData(
      [...projects, p2],
      [...tasks, t2],
      subs,
      [users[0]],
      STD_CONFIG,
      'p1',
    );
    const week = rows[0]?.weeks.find((w) => w.weekStart === '2026-04-06');
    // Only p1 sub (5 pts) should count
    expect(week?.effortPts).toBeCloseTo(5.0, 4);
  });

  it('drill-down segments list the contributing subtasks', () => {
    const subs: Subtask[] = [
      {
        id: 'sa',
        taskId: 't1',
        name: 'Sub A',
        startDate: '2026-04-06',
        endDate: '2026-04-10',
        effortPoints: 5,
        status: 'done',
        assigneeId: 'u1',
      },
      {
        id: 'sb',
        taskId: 't1',
        name: 'Sub B',
        startDate: '2026-04-06',
        endDate: '2026-04-10',
        effortPoints: 3,
        status: 'in_progress',
        assigneeId: 'u1',
      },
    ];
    const { rows } = buildBurnoutData(projects, tasks, subs, [users[0]], STD_CONFIG, '');
    const week = rows[0]?.weeks.find((w) => w.weekStart === '2026-04-06');
    expect(week?.segments).toHaveLength(2);
    const names = week?.segments.map((s) => s.subtaskName);
    expect(names).toContain('Sub A');
    expect(names).toContain('Sub B');
  });
});
