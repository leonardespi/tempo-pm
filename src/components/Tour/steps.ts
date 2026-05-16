import { useStore } from '@/store';

export interface TourStep {
  id: string;
  route: string;
  routePattern?: string;
  routeFn?: () => string;
  target: string;
  title: string;
  body: string[];
  yOffset?: number;
  arrowAlign?: 'left' | 'right';
}

function firstProjectRoute(): string {
  const { projects } = useStore.getState();
  return projects.length > 0 ? `/projects/${projects[0].id}` : '/';
}

export const TOUR_STEPS: TourStep[] = [
  {
    id: 'create-project',
    route: '/',
    target: '[data-tour="create-project-btn"]',
    title: 'Create a New Project',
    body: [
      'Click here to initialize a fresh project container from scratch.',
      'Give it a name, assignee, start/end dates, and an optional description to get started.',
    ],
    yOffset: 12,
    arrowAlign: 'right',
  },
  {
    id: 'import-projects',
    route: '/',
    target: '[data-tour="import-projects-btn"]',
    title: 'Import Projects',
    body: [
      'Already have a portfolio? Import a previously exported JSON snapshot to load all your projects, tasks, and team data into the workspace at once.',
    ],
    yOffset: 12,
  },
  {
    id: 'project-stats',
    route: '/projects/',
    routePattern: '/projects/',
    routeFn: firstProjectRoute,
    target: '[data-tour="project-stats"]',
    title: 'Project Status at a Glance',
    body: [
      "The stats panel shows your project's live health in three metrics.",
      'Subtasks — completed vs. total (e.g. 4 / 12 done).',
      'Points — total effort accumulated across all subtasks.',
      '% Done — progress bar that updates in real-time as work is checked off.',
    ],
  },
  {
    id: 'project-conflicts',
    route: '/projects/',
    routePattern: '/projects/',
    routeFn: firstProjectRoute,
    target: '[data-tour="project-conflict-area"]',
    title: 'Automatic Conflict Detection',
    body: [
      'Tempo scans the project automatically and surfaces conflicts inline.',
      "Schedule conflict — a task's start date falls before one of its dependencies has ended.",
      'Dependency cycle — task A → B → C → A would loop forever; Tempo blocks this at entry.',
      'Affected tasks are flagged with a ⚠ Conflict badge directly on the task row.',
    ],
  },
  {
    id: 'add-task',
    route: '/projects/',
    routePattern: '/projects/',
    routeFn: firstProjectRoute,
    target: '[data-tour="add-task-btn"]',
    title: 'Adding a Task',
    body: [
      'Tasks are the top-level phases or milestones inside a project.',
      'Click "+ Add task" (or press N) to open the task form.',
      'Set a name, assignee, optional date range, and finish-to-start dependencies.',
      'Tempo warns you if the sequencing would be violated.',
    ],
  },
  {
    id: 'add-subtask',
    route: '/projects/',
    routePattern: '/projects/',
    routeFn: firstProjectRoute,
    target: '[data-tour="task-table"]',
    title: 'Adding a Subtask',
    body: [
      'Subtasks are the individual work items nested inside a task.',
      'Click ⋮ on any task row, then choose "Add subtask".',
      'Each subtask carries a name, assignee, date range, effort points, and status.',
      'Effort points feed directly into the Workload and Burnout Risk diagrams.',
      'Check the checkbox on a subtask row to mark it done — progress updates instantly.',
    ],
  },
  {
    id: 'gantt-chart',
    route: '/gantt',
    target: '[data-tour="gantt-chart"]',
    title: 'Gantt Diagram',
    body: [
      'Use the project filter in the toolbar to isolate a specific initiative.',
      'Use the view toggle to switch between Day and Month scales.',
      'Click and drag to pan horizontally or vertically across the timeline.',
      'Hover over bars to reveal real-time task details.',
      'Export the current view as PNG or PDF using the buttons in the top-right.',
    ],
  },
  {
    id: 'timeline-view',
    route: '/timeline',
    target: '[data-tour="timeline-view"]',
    title: 'Timeline Diagram',
    body: [
      'Filter the view by Project or Assignee using the dropdowns in the toolbar.',
      'Hit "Today" to snap focus to the current date instantly.',
      'Click any task element to drill down and navigate to its parent project.',
      'Export the current view as PNG or PDF using the buttons in the top-right.',
    ],
  },
  {
    id: 'workload-chart',
    route: '/workload',
    target: '[data-tour="workload-chart"]',
    title: 'Workload Diagram',
    body: [
      'Filter views dynamically by Project or Assignee using the toolbar dropdowns.',
      'Drag to pan smoothly through team capacity over time.',
      'Hover over allocation blocks for granular capacity metrics.',
      'Export the current view as PNG or PDF using the buttons in the top-right.',
    ],
  },
  {
    id: 'burnout-risk-matrix',
    route: '/burnout',
    target: '[data-tour="burnout-risk-matrix"]',
    title: 'Burnout Risk Diagram',
    body: [
      'Filter by Project or Assignee using the toolbar dropdowns.',
      'Click any risk cell to surface contextual details for that specific week.',
      'Inside the weekly view, click the week container to drill into individual day breakdowns.',
      'Export the current view as PNG or PDF using the buttons in the top-right.',
    ],
  },
  {
    id: 'team-management',
    route: '/users',
    target: '[data-tour="team-management-panel"]',
    title: 'Team Management',
    body: [
      'Add or remove team members from the workspace.',
      'Configure notification and profile email addresses per user.',
      'Set resource velocity — story points a member can handle per week.',
    ],
  },
  {
    id: 'theme-toggle',
    route: '/settings',
    target: '[data-tour="theme-toggle"]',
    title: 'System Theme Toggle',
    body: [
      'Customize workspace aesthetics by toggling between Light, Dark, or System preference modes.',
    ],
  },
];
