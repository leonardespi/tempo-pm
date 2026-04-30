import type { Project, Task, Subtask, User, SubtaskStatus, WorkingDaysConfig } from '@/types';
import {
  toISO,
  workingDaysBetween,
  workingDaysInWeek,
  getISOWeekStart,
  enumerateWeeks,
} from './workingDays';

// Effort points from `subtask` that fall within the ISO week starting at `weekStart`.
// Prorates by: effortPoints × (workingDaysInWeek ∩ subtask / totalWorkingDaysOfSubtask).
export function prorateEffort(
  subtask: Subtask,
  weekStart: string,
  config: WorkingDaysConfig,
): number {
  const weekEnd = toISO(new Date(new Date(weekStart + 'T00:00:00').getTime() + 6 * 86_400_000));

  const overlapStart = subtask.startDate > weekStart ? subtask.startDate : weekStart;
  const overlapEnd = subtask.endDate < weekEnd ? subtask.endDate : weekEnd;
  if (overlapStart > overlapEnd) return 0;

  const daysInWeek = workingDaysInWeek(weekStart, config).filter(
    (d) => d >= subtask.startDate && d <= subtask.endDate,
  ).length;
  if (daysInWeek === 0) return 0;

  const totalWorkingDays = workingDaysBetween(subtask.startDate, subtask.endDate, config);
  if (totalWorkingDays === 0) return subtask.effortPoints; // single non-working-day edge case

  return subtask.effortPoints * (daysInWeek / totalWorkingDays);
}

// ─── Types ────────────────────────────────────────────────────────────────────

export type BurnoutSegment = {
  subtaskId: string;
  subtaskName: string;
  taskName: string;
  projectName: string;
  status: SubtaskStatus;
  effort: number; // prorated pts for this week
};

export type WeekLoad = {
  weekStart: string;
  label: string; // "Apr 6"
  loadRatio: number; // effortPts / weeklyCapacity
  effortPts: number;
  segments: BurnoutSegment[];
};

export type UserBurnoutRow = {
  user: User;
  weeks: WeekLoad[];
};

// ─── Build heatmap data ───────────────────────────────────────────────────────

export function buildBurnoutData(
  projects: Project[],
  tasks: Task[],
  subtasks: Subtask[],
  users: User[],
  workingDays: WorkingDaysConfig,
  filterProjectId: string,
): { rows: UserBurnoutRow[]; allWeeks: string[] } {
  if (users.length === 0 || subtasks.length === 0) {
    return { rows: [], allWeeks: [] };
  }

  const taskMap = new Map(tasks.map((t) => [t.id, t]));
  const projectMap = new Map(projects.map((p) => [p.id, p]));

  const filtered = subtasks.filter((s) => {
    const task = taskMap.get(s.taskId);
    if (!task) return false;
    if (filterProjectId && task.projectId !== filterProjectId) return false;
    return !!s.assigneeId;
  });

  if (filtered.length === 0) return { rows: [], allWeeks: [] };

  const allDates = filtered.flatMap((s) => [s.startDate, s.endDate]);
  const rangeStart = getISOWeekStart(allDates.reduce((a, b) => (a < b ? a : b)));
  const rangeEnd = allDates.reduce((a, b) => (a > b ? a : b));
  const allWeeks = enumerateWeeks(rangeStart, rangeEnd);

  const rows: UserBurnoutRow[] = users.map((user) => {
    const weeks: WeekLoad[] = allWeeks.map((weekStart) => {
      const d = new Date(weekStart + 'T00:00:00');
      const label = d.toLocaleString('en-US', { month: 'short', day: 'numeric' });

      const segments: BurnoutSegment[] = [];
      let effortPts = 0;

      for (const sub of filtered) {
        if (sub.assigneeId !== user.id) continue;
        const effort = prorateEffort(sub, weekStart, workingDays);
        if (effort <= 0) continue;
        const task = taskMap.get(sub.taskId);
        const project = task ? projectMap.get(task.projectId) : undefined;
        segments.push({
          subtaskId: sub.id,
          subtaskName: sub.name,
          taskName: task?.name ?? '—',
          projectName: project?.name ?? '—',
          status: sub.status,
          effort,
        });
        effortPts += effort;
      }

      const loadRatio = user.weeklyCapacity > 0 ? effortPts / user.weeklyCapacity : 0;
      return { weekStart, label, loadRatio, effortPts, segments };
    });

    return { user, weeks };
  });

  return { rows, allWeeks };
}
