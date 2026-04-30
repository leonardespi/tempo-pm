import type { Task, ID } from '@/types';

/**
 * Returns true if adding the edge (newTaskId dependsOn newDepId) would create a cycle.
 * Uses DFS from newDepId; if we can reach newTaskId through existing dependencies, it's a cycle.
 */
export function wouldCreateCycle(tasks: Task[], newTaskId: ID, newDepId: ID): boolean {
  if (newTaskId === newDepId) return true;

  const taskMap = new Map(tasks.map((t) => [t.id, t]));
  const visited = new Set<ID>();

  function dfs(nodeId: ID): boolean {
    if (nodeId === newTaskId) return true;
    if (visited.has(nodeId)) return false;
    visited.add(nodeId);
    const task = taskMap.get(nodeId);
    if (!task) return false;
    for (const depId of task.dependsOn) {
      if (dfs(depId)) return true;
    }
    return false;
  }

  return dfs(newDepId);
}

/**
 * Returns all task IDs that would form a cycle if added as a dependency of newTaskId.
 * Useful for disabling options in the dependency picker.
 */
export function forbiddenDependencies(tasks: Task[], newTaskId: ID): Set<ID> {
  const forbidden = new Set<ID>([newTaskId]);
  for (const task of tasks) {
    if (wouldCreateCycle(tasks, newTaskId, task.id)) {
      forbidden.add(task.id);
    }
  }
  return forbidden;
}

/**
 * Returns true if task startDate is before the max endDate of all its dependencies.
 */
export function hasScheduleConflict(task: Task, tasks: Task[]): boolean {
  if (!task.startDate || task.dependsOn.length === 0) return false;
  const taskMap = new Map(tasks.map((t) => [t.id, t]));
  for (const depId of task.dependsOn) {
    const dep = taskMap.get(depId);
    if (dep?.endDate && task.startDate < dep.endDate) return true;
  }
  return false;
}
