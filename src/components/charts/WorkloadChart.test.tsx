import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { WorkloadChart } from './WorkloadChart';
import type { Project, Task, Subtask, User, WorkingDaysConfig } from '@/types';

const workingDays: WorkingDaysConfig = { weekends: [0, 6], holidays: [] };

const projects: Project[] = [
  {
    id: 'p1',
    name: 'Alpha',
    createdAt: '2025-01-01T00:00:00Z',
    startDate: '2025-01-06',
    endDate: '2025-03-28',
  },
  {
    id: 'p2',
    name: 'Beta',
    createdAt: '2025-01-01T00:00:00Z',
    startDate: '2025-02-01',
    endDate: '2025-04-30',
  },
];

const users: User[] = [
  { id: 'u1', name: 'Alice', color: '#C17D52', weeklyCapacity: 10 },
  { id: 'u2', name: 'Bob', color: '#4A7FA5', weeklyCapacity: 8 },
];

const tasks: Task[] = [
  { id: 't1', projectId: 'p1', name: 'Design', dependsOn: [] },
  { id: 't2', projectId: 'p2', name: 'Research', dependsOn: [] },
];

const subtasks: Subtask[] = [
  {
    id: 's1',
    taskId: 't1',
    name: 'Wireframes',
    startDate: '2025-01-06',
    endDate: '2025-01-10',
    effortPoints: 5,
    status: 'done',
    assigneeId: 'u1',
  },
  {
    id: 's2',
    taskId: 't1',
    name: 'Mockups',
    startDate: '2025-01-13',
    endDate: '2025-01-17',
    effortPoints: 8,
    status: 'in_progress',
    assigneeId: 'u1',
  },
  {
    id: 's3',
    taskId: 't2',
    name: 'Interviews',
    startDate: '2025-01-13',
    endDate: '2025-01-24',
    effortPoints: 6,
    status: 'not_started',
    assigneeId: 'u2',
  },
];

const base = { projects, tasks, subtasks, users, workingDays, filterProjectId: '' };

describe('WorkloadChart', () => {
  it('shows empty state when there are no users', () => {
    render(<WorkloadChart {...base} users={[]} />);
    expect(screen.getByTestId('workload-empty')).toBeTruthy();
    expect(screen.getByText('No team members yet.')).toBeTruthy();
  });

  it('shows empty state when no subtasks are assigned', () => {
    const unassigned: Subtask[] = [
      {
        id: 'sx',
        taskId: 't1',
        name: 'Unassigned',
        startDate: '2025-01-06',
        endDate: '2025-01-10',
        effortPoints: 3,
        status: 'not_started',
      },
    ];
    render(<WorkloadChart {...base} subtasks={unassigned} />);
    expect(screen.getByTestId('workload-empty')).toBeTruthy();
    expect(screen.getByText('No assigned subtasks to display.')).toBeTruthy();
  });

  it('shows empty state when filter excludes all subtasks', () => {
    render(<WorkloadChart {...base} filterProjectId="p999" />);
    expect(screen.getByTestId('workload-empty')).toBeTruthy();
  });

  it('renders the SVG chart with data', () => {
    render(<WorkloadChart {...base} />);
    expect(screen.getByTestId('workload-chart')).toBeTruthy();
    expect(screen.getByTestId('workload-svg')).toBeTruthy();
  });

  it('renders legend with user names', () => {
    render(<WorkloadChart {...base} />);
    expect(screen.getByText('Alice')).toBeTruthy();
    expect(screen.getByText('Bob')).toBeTruthy();
  });

  it('filters by project — only p1 subtasks shown', () => {
    render(<WorkloadChart {...base} filterProjectId="p1" />);
    // Chart should still render (p1 has 2 assigned subtasks)
    expect(screen.getByTestId('workload-chart')).toBeTruthy();
  });

  it('shows empty state when filtered project has no assigned subtasks', () => {
    const p3tasks: Task[] = [{ id: 't3', projectId: 'p3', name: 'Empty', dependsOn: [] }];
    render(
      <WorkloadChart
        {...base}
        projects={[
          ...projects,
          {
            id: 'p3',
            name: 'Empty',
            createdAt: '2025-01-01T00:00:00Z',
            startDate: '2025-01-06',
            endDate: '2025-03-28',
          },
        ]}
        tasks={[...tasks, ...p3tasks]}
        filterProjectId="p3"
      />,
    );
    expect(screen.getByTestId('workload-empty')).toBeTruthy();
  });

  it('renders without crashing when subtasks list is empty', () => {
    render(<WorkloadChart {...base} subtasks={[]} />);
    expect(screen.getByTestId('workload-empty')).toBeTruthy();
  });
});
