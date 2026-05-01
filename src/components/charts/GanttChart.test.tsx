import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { GanttChart } from './GanttChart';
import type { Project, Task, Subtask, User, WorkingDaysConfig } from '@/types';

const wdays: WorkingDaysConfig = { weekends: [0, 6], holidays: [] };

const users: User[] = [{ id: 'u1', name: 'Alice', color: '#C17D52', weeklyCapacity: 10 }];

const projects: Project[] = [
  {
    id: 'p1',
    name: 'Alpha',
    createdAt: '2025-01-01T00:00:00Z',
    startDate: '2025-01-06',
    endDate: '2025-03-28',
  },
];

const tasks: Task[] = [
  {
    id: 't1',
    projectId: 'p1',
    name: 'Design',
    assigneeId: 'u1',
    startDate: '2025-01-06',
    endDate: '2025-01-17',
    dependsOn: [],
  },
  {
    id: 't2',
    projectId: 'p1',
    name: 'Build',
    startDate: '2025-01-20',
    endDate: '2025-02-28',
    dependsOn: ['t1'],
  },
];

const subtasks: Subtask[] = [
  {
    id: 's1',
    taskId: 't1',
    name: 'Wireframes',
    startDate: '2025-01-06',
    endDate: '2025-01-10',
    effortPoints: 3,
    status: 'done',
    assigneeId: 'u1',
  },
  {
    id: 's2',
    taskId: 't2',
    name: 'Backend',
    startDate: '2025-01-20',
    endDate: '2025-02-14',
    effortPoints: 8,
    status: 'in_progress',
  },
];

describe('GanttChart', () => {
  it('renders without crashing', () => {
    render(
      <GanttChart
        projects={projects}
        tasks={tasks}
        subtasks={subtasks}
        users={users}
        workingDays={wdays}
      />,
    );
    expect(screen.getByTestId('gantt-chart')).toBeTruthy();
  });

  it('shows empty state when no projects', () => {
    render(<GanttChart projects={[]} tasks={[]} subtasks={[]} users={[]} workingDays={wdays} />);
    expect(screen.getByText(/no projects yet/i)).toBeTruthy();
  });

  it('renders an SVG chart body', () => {
    render(
      <GanttChart
        projects={projects}
        tasks={tasks}
        subtasks={subtasks}
        users={users}
        workingDays={wdays}
      />,
    );
    expect(screen.getByTestId('gantt-svg')).toBeTruthy();
  });

  it('shows project and task labels in the label panel', () => {
    render(
      <GanttChart
        projects={projects}
        tasks={tasks}
        subtasks={subtasks}
        users={users}
        workingDays={wdays}
      />,
    );
    expect(screen.getAllByText('Alpha').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Design').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Build').length).toBeGreaterThan(0);
  });

  it('shows zoom buttons', () => {
    render(
      <GanttChart
        projects={projects}
        tasks={tasks}
        subtasks={subtasks}
        users={users}
        workingDays={wdays}
      />,
    );
    expect(screen.getByText('Day')).toBeTruthy();
    expect(screen.getByText('Week')).toBeTruthy();
    expect(screen.getByText('Month')).toBeTruthy();
  });
});
