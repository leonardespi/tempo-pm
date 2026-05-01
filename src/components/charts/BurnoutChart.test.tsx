import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { BurnoutChart } from './BurnoutChart';
import type { Project, Task, Subtask, User, WorkingDaysConfig } from '@/types';

const workingDays: WorkingDaysConfig = { weekends: [0, 6], holidays: [] };

const projects: Project[] = [
  {
    id: 'p1',
    name: 'Alpha',
    createdAt: '2026-01-01T00:00:00Z',
    startDate: '2026-04-06',
    endDate: '2026-04-17',
  },
];
const users: User[] = [
  { id: 'u1', name: 'Alice', color: '#C17D52', weeklyCapacity: 10 },
  { id: 'u2', name: 'Bob', color: '#4A7FA5', weeklyCapacity: 8 },
];
const tasks: Task[] = [{ id: 't1', projectId: 'p1', name: 'Design', dependsOn: [] }];
const subtasks: Subtask[] = [
  {
    id: 's1',
    taskId: 't1',
    name: 'Wireframes',
    startDate: '2026-04-06',
    endDate: '2026-04-10',
    effortPoints: 8,
    status: 'done',
    assigneeId: 'u1',
  },
  {
    id: 's2',
    taskId: 't1',
    name: 'Research',
    startDate: '2026-04-06',
    endDate: '2026-04-14',
    effortPoints: 6,
    status: 'in_progress',
    assigneeId: 'u2',
  },
];

const base = {
  projects,
  tasks,
  subtasks,
  users,
  workingDays,
  filterProjectId: '',
  filterUserId: '',
  dailyCapacity: 5,
};

describe('BurnoutChart', () => {
  it('shows empty state when there are no users', () => {
    render(<BurnoutChart {...base} users={[]} />);
    expect(screen.getByTestId('burnout-empty')).toBeTruthy();
    expect(screen.getByText('No team members yet.')).toBeTruthy();
  });

  it('shows empty state when no subtasks are assigned', () => {
    const unassigned: Subtask[] = [
      {
        id: 'sx',
        taskId: 't1',
        name: 'Unassigned',
        startDate: '2026-04-06',
        endDate: '2026-04-10',
        effortPoints: 3,
        status: 'not_started',
        // no assigneeId
      },
    ];
    render(<BurnoutChart {...base} subtasks={unassigned} />);
    expect(screen.getByTestId('burnout-empty')).toBeTruthy();
  });

  it('renders the SVG heatmap with data', () => {
    render(<BurnoutChart {...base} />);
    expect(screen.getByTestId('burnout-chart')).toBeTruthy();
    expect(screen.getByTestId('burnout-svg')).toBeTruthy();
  });

  it('renders user names in row labels', () => {
    render(<BurnoutChart {...base} />);
    expect(screen.getByText('Alice')).toBeTruthy();
    expect(screen.getByText('Bob')).toBeTruthy();
  });

  it('renders all three legend items', () => {
    render(<BurnoutChart {...base} />);
    expect(screen.getByText(/< 70%/)).toBeTruthy();
    expect(screen.getByText(/70–100%/)).toBeTruthy();
    expect(screen.getByText(/> 100%/)).toBeTruthy();
  });

  it('renders a cell for each user × week', () => {
    render(<BurnoutChart {...base} />);
    // Alice has load week of Apr 6 only (s1 ends Apr 10)
    expect(screen.getByTestId('burnout-cell-u1-2026-04-06')).toBeTruthy();
    // Bob has load weeks Apr 6 and Apr 13 (s2 Apr 6–14 crosses)
    expect(screen.getByTestId('burnout-cell-u2-2026-04-06')).toBeTruthy();
    expect(screen.getByTestId('burnout-cell-u2-2026-04-13')).toBeTruthy();
  });

  it('opens drill-down panel when a loaded cell is clicked', () => {
    render(<BurnoutChart {...base} />);
    const cell = screen.getByTestId('burnout-cell-u1-2026-04-06');
    fireEvent.click(cell);
    expect(screen.getByTestId('burnout-drilldown')).toBeTruthy();
    // Alice's subtask name should appear in the panel
    expect(screen.getByText('Wireframes')).toBeTruthy();
  });

  it('closes drill-down when close button is clicked', () => {
    render(<BurnoutChart {...base} />);
    fireEvent.click(screen.getByTestId('burnout-cell-u1-2026-04-06'));
    expect(screen.getByTestId('burnout-drilldown')).toBeTruthy();
    fireEvent.click(screen.getByLabelText('Close drill-down'));
    expect(screen.queryByTestId('burnout-drilldown')).toBeNull();
  });

  it('toggles drill-down closed when the same cell is clicked again', () => {
    render(<BurnoutChart {...base} />);
    const cell = screen.getByTestId('burnout-cell-u1-2026-04-06');
    fireEvent.click(cell);
    expect(screen.getByTestId('burnout-drilldown')).toBeTruthy();
    fireEvent.click(cell);
    expect(screen.queryByTestId('burnout-drilldown')).toBeNull();
  });

  it('shows empty state when filter excludes all subtasks', () => {
    render(<BurnoutChart {...base} filterProjectId="p999" />);
    expect(screen.getByTestId('burnout-empty')).toBeTruthy();
  });
});
