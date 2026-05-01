import { create } from 'zustand';
import type { AppData, Project, Task, Subtask, User, Theme } from '@/types';

const DEFAULT_DATA: AppData = {
  projects: [],
  tasks: [],
  subtasks: [],
  users: [],
  workingDays: { weekends: [0, 6], holidays: [] },
  settings: { theme: 'system', dailyCapacity: 5 },
};

type AppStore = AppData & {
  isLoading: boolean;
  hasLoaded: boolean;
  error: string | null;
  toast: { message: string; type: 'info' | 'error' | 'success' } | null;

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

  loadData: async () => {
    // Prevent double-loading (StrictMode, HMR, or accidental re-calls)
    if (get().hasLoaded || get().isLoading) return;
    set({ isLoading: true, error: null });
    try {
      const res = await fetch('/api/data');
      if (!res.ok) throw new Error(`Server error ${res.status}`);
      const raw = (await res.json()) as AppData & { _restoredFromBackup?: number | null };
      const { _restoredFromBackup, ...data } = raw;
      set({
        ...data,
        settings: { ...DEFAULT_DATA.settings, ...data.settings },
        isLoading: false,
        hasLoaded: true,
      });
      if (_restoredFromBackup !== null && _restoredFromBackup !== undefined) {
        get().showToast(
          `Data restored from backup ${_restoredFromBackup} (main file was corrupt).`,
          'error',
        );
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load data';
      set({ isLoading: false, error: message });
    }
  },

  saveData: async (updates) => {
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
      const res = await fetch('/api/data', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(next),
      });
      if (!res.ok) throw new Error(`Save failed ${res.status}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to save data';
      set({ error: message });
      get().showToast(message, 'error');
    }
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
