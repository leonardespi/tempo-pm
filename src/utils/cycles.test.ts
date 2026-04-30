import { describe, it, expect } from 'vitest';
import { wouldCreateCycle, forbiddenDependencies, hasScheduleConflict } from './cycles';
import type { Task } from '@/types';

function t(id: string, dependsOn: string[] = []): Task {
  return { id, projectId: 'proj', name: id, dependsOn };
}

describe('wouldCreateCycle', () => {
  it('detects self-reference', () => {
    const tasks = [t('A')];
    expect(wouldCreateCycle(tasks, 'A', 'A')).toBe(true);
  });

  it('detects direct cycle: A→B, B wants to depend on A', () => {
    const tasks = [t('A', ['B']), t('B')];
    // B wants to dependOn A; A already dependsOn B → cycle
    expect(wouldCreateCycle(tasks, 'B', 'A')).toBe(true);
  });

  it('detects transitive cycle: A→B→C, C wants to depend on A', () => {
    const tasks = [t('A', ['B']), t('B', ['C']), t('C')];
    expect(wouldCreateCycle(tasks, 'C', 'A')).toBe(true);
  });

  it('allows non-cyclic dependency', () => {
    const tasks = [t('A'), t('B'), t('C', ['A'])];
    // B wants to depend on A — no cycle
    expect(wouldCreateCycle(tasks, 'B', 'A')).toBe(false);
  });

  it('allows diamond non-cycle: A→{B,C}, D depends on B', () => {
    const tasks = [t('A', ['B', 'C']), t('B'), t('C'), t('D')];
    // D wants to depend on B — no cycle since B has no path back to D
    expect(wouldCreateCycle(tasks, 'D', 'B')).toBe(false);
  });

  it('handles missing task id gracefully', () => {
    const tasks = [t('A')];
    expect(wouldCreateCycle(tasks, 'A', 'Z')).toBe(false);
  });
});

describe('forbiddenDependencies', () => {
  it('includes self', () => {
    const tasks = [t('A'), t('B')];
    expect(forbiddenDependencies(tasks, 'A')).toContain('A');
  });

  it('includes tasks that would cycle', () => {
    // A→B; B depends on A, so A is forbidden for B
    const tasks = [t('A', ['B']), t('B')];
    expect(forbiddenDependencies(tasks, 'B')).toContain('A');
    expect(forbiddenDependencies(tasks, 'B')).not.toContain('C');
  });
});

describe('hasScheduleConflict', () => {
  it('detects when task starts before dependency ends', () => {
    const depTask = t('A');
    depTask.endDate = '2025-02-10';
    const task = { ...t('B', ['A']), startDate: '2025-02-01', endDate: '2025-02-15' };
    expect(hasScheduleConflict(task, [depTask, task])).toBe(true);
  });

  it('no conflict when task starts after dependency ends', () => {
    const depTask = t('A');
    depTask.endDate = '2025-02-01';
    const task = { ...t('B', ['A']), startDate: '2025-02-03', endDate: '2025-02-10' };
    expect(hasScheduleConflict(task, [depTask, task])).toBe(false);
  });

  it('no conflict when task has no dependencies', () => {
    const task = { ...t('A'), startDate: '2025-02-01', endDate: '2025-02-10' };
    expect(hasScheduleConflict(task, [task])).toBe(false);
  });
});
