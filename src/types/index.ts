export type ID = string;

export type User = {
  id: ID;
  name: string;
  email?: string;
  color: string;
  weeklyCapacity: number;
};

export type SubtaskStatus = 'not_started' | 'in_progress' | 'blocked' | 'done';

export type Subtask = {
  id: ID;
  taskId: ID;
  name: string;
  assigneeId?: ID;
  startDate: string;
  endDate: string;
  effortPoints: number;
  status: SubtaskStatus;
};

export type Task = {
  id: ID;
  projectId: ID;
  name: string;
  assigneeId?: ID;
  startDate?: string;
  endDate?: string;
  dependsOn: ID[];
};

export type Project = {
  id: ID;
  name: string;
  description?: string;
  createdAt: string;
  startDate: string;
  endDate: string;
};

export type WorkingDaysConfig = {
  weekends: number[];
  holidays: string[];
};

export type AppData = {
  projects: Project[];
  tasks: Task[];
  subtasks: Subtask[];
  users: User[];
  workingDays: WorkingDaysConfig;
  settings: { theme: 'light' | 'dark' | 'system' };
};

export type Theme = 'light' | 'dark' | 'system';
