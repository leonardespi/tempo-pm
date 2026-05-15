import { create } from 'zustand';
import type { AppData, Project, Task, Subtask, User, Theme } from '@/types';

const STORAGE_KEY = 'tempo-pm-data';

const DEFAULT_DATA: AppData = {
  projects: [],
  tasks: [],
  subtasks: [],
  users: [],
  workingDays: { weekends: [0, 6], holidays: [] },
  settings: { theme: 'system', dailyCapacity: 5, prorateEffort: false },
};

// ─── Chart view state (in-memory; persists across page navigation) ────────────
export type GanttZoom = 'day' | 'week' | 'month';
export type WorkloadViewMode = 'week' | 'day';

export type GanttView = {
  filterProjectId: string;
  zoom: GanttZoom;
  collapsed: string[]; // ids of collapsed projects/tasks
};

export type BurnoutView = {
  filterProjectId: string;
  filterUserId: string;
  drilldown: { userId: string; weekStart: string } | null;
  selectedDay: string | null;
  sheetHeight: number | null;
};

export type TimelineView = {
  filterProjectId: string;
  filterAssigneeId: string;
};

export type WorkloadView = {
  filterProjectId: string;
  filterUserId: string;
  viewMode: WorkloadViewMode;
};

export type ChartViews = {
  gantt: GanttView;
  burnout: BurnoutView;
  timeline: TimelineView;
  workload: WorkloadView;
};

const DEFAULT_CHART_VIEWS: ChartViews = {
  gantt: { filterProjectId: '', zoom: 'week', collapsed: [] },
  burnout: {
    filterProjectId: '',
    filterUserId: '',
    drilldown: null,
    selectedDay: null,
    sheetHeight: null,
  },
  timeline: { filterProjectId: '', filterAssigneeId: '' },
  workload: { filterProjectId: '', filterUserId: '', viewMode: 'week' },
};

type AppStore = AppData & {
  isLoading: boolean;
  hasLoaded: boolean;
  error: string | null;
  toast: { message: string; type: 'info' | 'error' | 'success' } | null;
  chartViews: ChartViews;
  setGanttView: (updates: Partial<GanttView>) => void;
  setBurnoutView: (updates: Partial<BurnoutView>) => void;
  setTimelineView: (updates: Partial<TimelineView>) => void;
  setWorkloadView: (updates: Partial<WorkloadView>) => void;

  loadData: () => Promise<void>;
  saveData: (data: Partial<AppData>) => Promise<void>;

  addProject: (project: Project) => Promise<void>;
  updateProject: (id: string, updates: Partial<Project>) => Promise<void>;
  deleteProject: (id: string) => Promise<void>;

  addTask: (task: Task) => Promise<void>;
  updateTask: (id: string, updates: Partial<Task>) => Promise<void>;
  deleteTask: (id: string) => Promise<void>;

  addSubtask: (subtask: Subtask) => Promise<void>;
  updateSubtask: (id: string, updates: Partial<Subtask>) => Promise<void>;
  deleteSubtask: (id: string) => Promise<void>;

  addUser: (user: User) => Promise<void>;
  updateUser: (id: string, updates: Partial<User>) => Promise<void>;
  deleteUser: (id: string) => Promise<void>;

  setTheme: (theme: Theme) => Promise<void>;
  showToast: (message: string, type?: 'info' | 'error' | 'success') => void;
  clearToast: () => void;
  clearError: () => void;
};

export const useStore = create<AppStore>((set, get) => ({
  ...DEFAULT_DATA,
  isLoading: false,
  hasLoaded: false,
  error: null,
  toast: null,
  chartViews: DEFAULT_CHART_VIEWS,

  setGanttView: (updates) =>
    set((s) => ({ chartViews: { ...s.chartViews, gantt: { ...s.chartViews.gantt, ...updates } } })),
  setBurnoutView: (updates) =>
    set((s) => ({
      chartViews: { ...s.chartViews, burnout: { ...s.chartViews.burnout, ...updates } },
    })),
  setTimelineView: (updates) =>
    set((s) => ({
      chartViews: { ...s.chartViews, timeline: { ...s.chartViews.timeline, ...updates } },
    })),
  setWorkloadView: (updates) =>
    set((s) => ({
      chartViews: { ...s.chartViews, workload: { ...s.chartViews.workload, ...updates } },
    })),

  loadData: async (): Promise<void> => {
    if (get().hasLoaded || get().isLoading) return;
    set({ isLoading: true, error: null });
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      let data: AppData;
      if (raw) {
        data = JSON.parse(raw) as AppData;
      } else {
        // First visit — seed with mock data so the app isn't empty
        try {
          const res = await fetch(`${import.meta.env.BASE_URL}mock-data.json`);
          data = res.ok ? ((await res.json()) as AppData) : { ...DEFAULT_DATA };
        } catch {
          data = { ...DEFAULT_DATA };
        }
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      }
      set({
        ...data,
        settings: { ...DEFAULT_DATA.settings, ...data.settings },
        isLoading: false,
        hasLoaded: true,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load data';
      set({ isLoading: false, error: message });
    }
  },

  saveData: (updates): Promise<void> => {
    const current = get();
    const next: AppData = {
      projects: current.projects,
      tasks: current.tasks,
      subtasks: current.subtasks,
      users: current.users,
      workingDays: current.workingDays,
      settings: current.settings,
      ...updates,
    };
    set(next);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to save data';
      set({ error: message });
      get().showToast(message, 'error');
    }
    return Promise.resolve();
  },

  addProject: async (project) => {
    const projects = [...get().projects, project];
    await get().saveData({ projects });
  },
  updateProject: async (id, updates) => {
    const projects = get().projects.map((p) => (p.id === id ? { ...p, ...updates } : p));
    await get().saveData({ projects });
  },
  deleteProject: async (id) => {
    const projects = get().projects.filter((p) => p.id !== id);
    const tasks = get().tasks.filter((t) => t.projectId !== id);
    const taskIds = new Set(
      get()
        .tasks.filter((t) => t.projectId === id)
        .map((t) => t.id),
    );
    const subtasks = get().subtasks.filter((s) => !taskIds.has(s.taskId));
    await get().saveData({ projects, tasks, subtasks });
  },

  addTask: async (task) => {
    const tasks = [...get().tasks, task];
    await get().saveData({ tasks });
  },
  updateTask: async (id, updates) => {
    const tasks = get().tasks.map((t) => (t.id === id ? { ...t, ...updates } : t));
    await get().saveData({ tasks });
  },
  deleteTask: async (id) => {
    const tasks = get().tasks.filter((t) => t.id !== id);
    // Remove dependency references to this task
    const cleanedTasks = tasks.map((t) => ({
      ...t,
      dependsOn: t.dependsOn.filter((dep) => dep !== id),
    }));
    const subtasks = get().subtasks.filter((s) => s.taskId !== id);
    await get().saveData({ tasks: cleanedTasks, subtasks });
  },

  addSubtask: async (subtask) => {
    const subtasks = [...get().subtasks, subtask];
    await get().saveData({ subtasks });
  },
  updateSubtask: async (id, updates) => {
    const subtasks = get().subtasks.map((s) => (s.id === id ? { ...s, ...updates } : s));
    await get().saveData({ subtasks });
  },
  deleteSubtask: async (id) => {
    const subtasks = get().subtasks.filter((s) => s.id !== id);
    await get().saveData({ subtasks });
  },

  addUser: async (user) => {
    const users = [...get().users, user];
    await get().saveData({ users });
  },
  updateUser: async (id, updates) => {
    const users = get().users.map((u) => (u.id === id ? { ...u, ...updates } : u));
    await get().saveData({ users });
  },
  deleteUser: async (id) => {
    const users = get().users.filter((u) => u.id !== id);
    await get().saveData({ users });
  },

  setTheme: async (theme) => {
    const settings = { ...get().settings, theme };
    await get().saveData({ settings });
    applyTheme(theme);
  },

  showToast: (message, type = 'info') => {
    set({ toast: { message, type } });
  },
  clearToast: () => set({ toast: null }),
  clearError: () => set({ error: null }),
}));

export function applyTheme(theme: Theme) {
  const root = document.documentElement;
  if (theme === 'system') {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    root.setAttribute('data-theme', prefersDark ? 'dark' : 'light');
  } else {
    root.setAttribute('data-theme', theme);
  }
}
