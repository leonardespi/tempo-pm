import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { TimelineChart } from './TimelineChart';
import type { Project, Task, Subtask, User } from '@/types';

const renderWithRouter = (ui: ReactElement) => render(<MemoryRouter>{ui}</MemoryRouter>);

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
    effortPoints: 3,
    status: 'done',
    assigneeId: 'u1',
  },
  {
    id: 's2',
    taskId: 't1',
    name: 'Mockups',
    startDate: '2025-01-13',
    endDate: '2025-01-17',
    effortPoints: 5,
    status: 'in_progress',
    assigneeId: 'u1',
  },
  {
    id: 's3',
    taskId: 't2',
    name: 'Interviews',
    startDate: '2025-02-03',
    endDate: '2025-02-14',
    effortPoints: 4,
    status: 'not_started',
    assigneeId: 'u2',
  },
];

const base = { projects, tasks, subtasks, users, filterProjectId: '', filterAssigneeId: '' };

describe('TimelineChart', () => {
  it('renders without crashing', () => {
    renderWithRouter(<TimelineChart {...base} />);
    expect(screen.getByTestId('timeline-chart')).toBeTruthy();
  });

  it('shows empty state when no subtasks', () => {
    renderWithRouter(<TimelineChart {...base} subtasks={[]} />);
    expect(screen.getByTestId('timeline-empty')).toBeTruthy();
  });

  it('shows only today with lonely message when filters exclude all events', () => {
    renderWithRouter(<TimelineChart {...base} filterAssigneeId="u999" />);
    // No events match, but today's section is always present
    expect(screen.getByTestId('timeline-chart')).toBeTruthy();
    expect(screen.getByText(/seems a little bit lonely/i)).toBeTruthy();
    expect(screen.queryAllByTestId('timeline-event').length).toBe(0);
  });

  it('renders event rows for each subtask (start + end per subtask)', () => {
    renderWithRouter(<TimelineChart {...base} />);
    // s1, s2, s3 each have start + end events (all have distinct start/end dates)
    const eventRows = screen.getAllByTestId('timeline-event');
    expect(eventRows.length).toBe(6); // 3 subtasks × 2 events each
  });

  it('shows subtask names in event rows', () => {
    renderWithRouter(<TimelineChart {...base} />);
    // Each subtask name appears twice (start + end)
    expect(screen.getAllByText('Wireframes').length).toBe(2);
    expect(screen.getAllByText('Mockups').length).toBe(2);
  });

  it('filters by project', () => {
    renderWithRouter(<TimelineChart {...base} filterProjectId="p1" />);
    // Only p1 subtasks (s1, s2) → 4 events
    expect(screen.getAllByTestId('timeline-event').length).toBe(4);
    expect(screen.queryByText('Interviews')).toBeNull();
  });

  it('filters by assignee', () => {
    renderWithRouter(<TimelineChart {...base} filterAssigneeId="u2" />);
    // Only u2 subtasks (s3) → 2 events (start + end)
    expect(screen.getAllByTestId('timeline-event').length).toBe(2);
    expect(screen.getAllByText('Interviews').length).toBe(2);
    expect(screen.queryByText('Wireframes')).toBeNull();
  });

  it('shows assignee names', () => {
    renderWithRouter(<TimelineChart {...base} />);
    expect(screen.getAllByText('Alice').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Bob').length).toBeGreaterThan(0);
  });

  it('shows effort points', () => {
    renderWithRouter(<TimelineChart {...base} filterProjectId="p1" filterAssigneeId="u1" />);
    expect(screen.getAllByText('3 pts').length).toBeGreaterThan(0);
    expect(screen.getAllByText('5 pts').length).toBeGreaterThan(0);
  });

  it('shows status labels', () => {
    renderWithRouter(<TimelineChart {...base} />);
    expect(screen.getAllByText('Done').length).toBeGreaterThan(0);
    expect(screen.getAllByText('In progress').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Not started').length).toBeGreaterThan(0);
  });

  it('shows date groups', () => {
    renderWithRouter(<TimelineChart {...base} />);
    const groups = screen.getAllByTestId('timeline-date-group');
    // Unique dates from subtasks: Jan 6, Jan 10, Jan 13, Jan 17, Feb 3, Feb 14 = 6
    // Today is always injected (+1 unless today already appears in the data)
    expect(groups.length).toBeGreaterThanOrEqual(6);
  });

  it('collapses same-day start+end into one date group', () => {
    const sameDaySubs: Subtask[] = [
      {
        id: 'sx',
        taskId: 't1',
        name: 'Quick task',
        startDate: '2025-01-06',
        endDate: '2025-01-06',
        effortPoints: 1,
        status: 'done',
      },
    ];
    renderWithRouter(<TimelineChart {...base} subtasks={sameDaySubs} />);
    // startDate === endDate → only 1 event (start) → 1 event group + today group
    expect(screen.getAllByTestId('timeline-event').length).toBe(1);
  });

  it('shows the summary event count', () => {
    renderWithRouter(<TimelineChart {...base} />);
    // Summary reads "6 events across 3 subtasks"
    expect(screen.getByText(/events across/)).toBeTruthy();
  });
});
