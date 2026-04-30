import type { Task, Subtask, Project } from '@/types';

export function derivedTaskDates(
  task: Task,
  subtasks: Subtask[],
): { startDate: string | undefined; endDate: string | undefined } {
  const mine = subtasks.filter((s) => s.taskId === task.id);
  if (mine.length === 0) return { startDate: task.startDate, endDate: task.endDate };

  const starts = mine.map((s) => s.startDate);
  const ends = mine.map((s) => s.endDate);
  return {
    startDate: task.startDate ?? starts.reduce((a, b) => (a < b ? a : b)),
    endDate: task.endDate ?? ends.reduce((a, b) => (a > b ? a : b)),
  };
}

export type ProjectStats = {
  totalSubtasks: number;
  doneSubtasks: number;
  progressPct: number;
  totalEffort: number;
};

export function projectStats(project: Project, tasks: Task[], subtasks: Subtask[]): ProjectStats {
  const projectTaskIds = new Set(tasks.filter((t) => t.projectId === project.id).map((t) => t.id));
  const mine = subtasks.filter((s) => projectTaskIds.has(s.taskId));
  const total = mine.length;
  const done = mine.filter((s) => s.status === 'done').length;
  return {
    totalSubtasks: total,
    doneSubtasks: done,
    progressPct: total > 0 ? Math.round((done / total) * 100) : 0,
    totalEffort: mine.reduce((acc, s) => acc + s.effortPoints, 0),
  };
}
