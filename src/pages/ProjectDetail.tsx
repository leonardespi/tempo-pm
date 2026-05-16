import { useState, useCallback, useEffect, useMemo, useRef, Fragment } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { v4 as uuidv4 } from 'uuid';
import { useStore } from '@/store';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { FormField } from '@/components/ui/FormField';
import { wouldCreateCycle, forbiddenDependencies, hasScheduleConflict } from '@/utils/cycles';
import { derivedTaskDates } from '@/utils/derive';
import { formatDate } from '@/utils/workingDays';
import type { Task, Subtask, SubtaskStatus, User } from '@/types';
import styles from './ProjectDetail.module.css';

// ─── Constants ────────────────────────────────────────────────────────────────

const STATUS_LABELS: Record<SubtaskStatus, string> = {
  not_started: 'Not started',
  in_progress: 'In progress',
  blocked: 'Blocked',
  done: 'Done',
};

const STATUS_COLORS: Record<SubtaskStatus, string> = {
  not_started: '#9B9B9B',
  in_progress: '#E8943A',
  blocked: '#C0392B',
  done: '#6B8C42',
};

const STATUS_ORDER: SubtaskStatus[] = ['not_started', 'in_progress', 'blocked', 'done'];

type GroupBy = 'phase' | 'status' | 'assignee' | 'date' | 'none';
const GROUP_BY_OPTIONS: { value: GroupBy; label: string }[] = [
  { value: 'phase', label: 'Phase' },
  { value: 'status', label: 'Status' },
  { value: 'assignee', label: 'Assignee' },
  { value: 'date', label: 'Date' },
  { value: 'none', label: 'None' },
];

const DATE_BUCKET_LABELS: Record<string, string> = {
  past_due: 'Past due',
  this_week: 'This week',
  next_week: 'Next week',
  later: 'Later',
};
const DATE_BUCKET_ORDER = ['past_due', 'this_week', 'next_week', 'later'];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function fmtPts(n: number): string {
  return n.toFixed(1);
}

function calendarDays(start: string, end: string): number {
  const a = new Date(start + 'T00:00:00');
  const b = new Date(end + 'T00:00:00');
  return Math.round((b.getTime() - a.getTime()) / 86400000) + 1;
}

function dateBucket(sub: Subtask, today: Date): string {
  const end = new Date(sub.endDate + 'T00:00:00').getTime();
  const start = new Date(sub.startDate + 'T00:00:00').getTime();
  const t = today.getTime();
  const day = 86400000;
  if (end < t) return 'past_due';
  if (start <= t + 7 * day) return 'this_week';
  if (start <= t + 14 * day) return 'next_week';
  return 'later';
}

// ─── Filter ───────────────────────────────────────────────────────────────────

type FilterState = {
  statuses: Set<SubtaskStatus>;
  assigneeIds: Set<string>; // 'unassigned' for null assignee, user.id for users
  startsAfter: string;
  endsBefore: string;
  pointsMin: string;
  pointsMax: string;
};

function makeDefaultFilter(users: User[]): FilterState {
  return {
    statuses: new Set(STATUS_ORDER),
    assigneeIds: new Set(['unassigned', ...users.map((u) => u.id)]),
    startsAfter: '',
    endsBefore: '',
    pointsMin: '',
    pointsMax: '',
  };
}

function applyFilters(subs: Subtask[], f: FilterState): Subtask[] {
  return subs.filter((s) => {
    if (!f.statuses.has(s.status)) return false;
    const aKey = s.assigneeId ?? 'unassigned';
    if (!f.assigneeIds.has(aKey)) return false;
    if (f.startsAfter && s.startDate < f.startsAfter) return false;
    if (f.endsBefore && s.endDate > f.endsBefore) return false;
    const pts = s.effortPoints;
    if (f.pointsMin !== '' && pts < Number(f.pointsMin)) return false;
    if (f.pointsMax !== '' && pts > Number(f.pointsMax)) return false;
    return true;
  });
}

function activeFilterGroupCount(f: FilterState, users: User[]): number {
  let count = 0;
  if (f.statuses.size < STATUS_ORDER.length) count++;
  if (f.assigneeIds.size < users.length + 1) count++;
  if (f.startsAfter || f.endsBefore) count++;
  if (f.pointsMin !== '' || f.pointsMax !== '') count++;
  return count;
}

// ─── Grouping ─────────────────────────────────────────────────────────────────

type GroupItem = {
  id: string;
  title: string;
  task?: Task; // present only in 'phase' mode
  subtasks: Subtask[];
  startDate?: string;
  endDate?: string;
  totalPts: number;
  doneCount: number;
  isConflict: boolean;
  warnings: { noSubs: boolean; noAssigned: boolean };
  assignee?: User;
  depTaskNames: string[];
};

function deriveGroupSummary(subs: Subtask[]): {
  startDate?: string;
  endDate?: string;
  totalPts: number;
  doneCount: number;
} {
  if (subs.length === 0) return { totalPts: 0, doneCount: 0 };
  const totalPts = subs.reduce((a, s) => a + s.effortPoints, 0);
  const doneCount = subs.filter((s) => s.status === 'done').length;
  const startDate = subs.reduce(
    (min, s) => (s.startDate < min ? s.startDate : min),
    subs[0].startDate,
  );
  const endDate = subs.reduce((max, s) => (s.endDate > max ? s.endDate : max), subs[0].endDate);
  return { startDate, endDate, totalPts, doneCount };
}

function buildGroups(
  filtered: Subtask[],
  groupBy: GroupBy,
  tasks: Task[],
  users: User[],
  allTasks: Task[],
  conflictIds: Set<string>,
  today: Date,
): GroupItem[] {
  if (groupBy === 'phase') {
    return tasks.map((task) => {
      const subs = filtered.filter((s) => s.taskId === task.id);
      const summary = deriveGroupSummary(subs);
      const derived = derivedTaskDates(task, subs);
      const assignee = users.find((u) => u.id === task.assigneeId);
      const depTaskNames = task.dependsOn
        .map((id) => allTasks.find((t) => t.id === id)?.name)
        .filter((n): n is string => Boolean(n));
      const noSubs = subs.length === 0;
      const noAssigned = !noSubs && subs.every((s) => !s.assigneeId);
      return {
        id: task.id,
        title: task.name,
        task,
        subtasks: subs,
        startDate: task.startDate ?? derived.startDate ?? summary.startDate,
        endDate: task.endDate ?? derived.endDate ?? summary.endDate,
        totalPts: summary.totalPts,
        doneCount: summary.doneCount,
        isConflict: conflictIds.has(task.id),
        warnings: { noSubs, noAssigned },
        assignee,
        depTaskNames,
      };
    });
  }

  if (groupBy === 'none') {
    if (filtered.length === 0) return [];
    const summary = deriveGroupSummary(filtered);
    return [
      {
        id: 'all',
        title: 'All tasks',
        subtasks: filtered,
        startDate: summary.startDate,
        endDate: summary.endDate,
        totalPts: summary.totalPts,
        doneCount: summary.doneCount,
        isConflict: false,
        warnings: { noSubs: false, noAssigned: false },
        depTaskNames: [],
      },
    ];
  }

  if (groupBy === 'status') {
    const result: GroupItem[] = [];
    for (const st of STATUS_ORDER) {
      const subs = filtered.filter((s) => s.status === st);
      if (subs.length === 0) continue;
      const summary = deriveGroupSummary(subs);
      result.push({
        id: `status-${st}`,
        title: STATUS_LABELS[st],
        subtasks: subs,
        startDate: summary.startDate,
        endDate: summary.endDate,
        totalPts: summary.totalPts,
        doneCount: summary.doneCount,
        isConflict: false,
        warnings: { noSubs: false, noAssigned: false },
        depTaskNames: [],
      });
    }
    return result;
  }

  if (groupBy === 'assignee') {
    const result: GroupItem[] = [];
    for (const u of users) {
      const subs = filtered.filter((s) => s.assigneeId === u.id);
      if (subs.length === 0) continue;
      const summary = deriveGroupSummary(subs);
      result.push({
        id: `assignee-${u.id}`,
        title: u.name,
        assignee: u,
        subtasks: subs,
        startDate: summary.startDate,
        endDate: summary.endDate,
        totalPts: summary.totalPts,
        doneCount: summary.doneCount,
        isConflict: false,
        warnings: { noSubs: false, noAssigned: false },
        depTaskNames: [],
      });
    }
    const unassigned = filtered.filter((s) => !s.assigneeId);
    if (unassigned.length > 0) {
      const summary = deriveGroupSummary(unassigned);
      result.push({
        id: 'assignee-unassigned',
        title: 'Unassigned',
        subtasks: unassigned,
        startDate: summary.startDate,
        endDate: summary.endDate,
        totalPts: summary.totalPts,
        doneCount: summary.doneCount,
        isConflict: false,
        warnings: { noSubs: false, noAssigned: false },
        depTaskNames: [],
      });
    }
    return result;
  }

  // groupBy === 'date'
  const buckets: Record<string, Subtask[]> = {
    past_due: [],
    this_week: [],
    next_week: [],
    later: [],
  };
  for (const s of filtered) {
    const b = dateBucket(s, today);
    buckets[b].push(s);
  }
  const result: GroupItem[] = [];
  for (const key of DATE_BUCKET_ORDER) {
    const subs = buckets[key];
    if (subs.length === 0) continue;
    const summary = deriveGroupSummary(subs);
    result.push({
      id: `date-${key}`,
      title: DATE_BUCKET_LABELS[key],
      subtasks: subs,
      startDate: summary.startDate,
      endDate: summary.endDate,
      totalPts: summary.totalPts,
      doneCount: summary.doneCount,
      isConflict: false,
      warnings: { noSubs: false, noAssigned: false },
      depTaskNames: [],
    });
  }
  return result;
}

// ─── Forms ────────────────────────────────────────────────────────────────────

type TaskForm = {
  name: string;
  assigneeId: string;
  startDate: string;
  endDate: string;
  dependsOn: string[];
};
const EMPTY_TASK_FORM: TaskForm = {
  name: '',
  assigneeId: '',
  startDate: '',
  endDate: '',
  dependsOn: [],
};

type SubtaskForm = {
  name: string;
  assigneeId: string;
  startDate: string;
  endDate: string;
  effortPoints: string;
  status: SubtaskStatus;
};
const EMPTY_SUBTASK_FORM: SubtaskForm = {
  name: '',
  assigneeId: '',
  startDate: '',
  endDate: '',
  effortPoints: '0',
  status: 'not_started',
};

// ─── Main component ───────────────────────────────────────────────────────────

export default function ProjectDetail() {
  const { id: projectId } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const hasLoaded = useStore((s) => s.hasLoaded);
  const projects = useStore((s) => s.projects);
  const users = useStore((s) => s.users);
  const allTasks = useStore((s) => s.tasks);
  const subtasks = useStore((s) => s.subtasks);

  const project = useMemo(() => projects.find((p) => p.id === projectId), [projects, projectId]);
  const tasks = useMemo(
    () => allTasks.filter((t) => t.projectId === projectId),
    [allTasks, projectId],
  );

  const addTask = useStore((s) => s.addTask);
  const updateTask = useStore((s) => s.updateTask);
  const deleteTask = useStore((s) => s.deleteTask);
  const addSubtask = useStore((s) => s.addSubtask);
  const updateSubtask = useStore((s) => s.updateSubtask);
  const deleteSubtask = useStore((s) => s.deleteSubtask);
  const updateProject = useStore((s) => s.updateProject);

  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  // Task modal
  const [taskModal, setTaskModal] = useState<{ open: boolean; editId: string | null }>({
    open: false,
    editId: null,
  });
  const [taskForm, setTaskForm] = useState<TaskForm>(EMPTY_TASK_FORM);
  const [taskErrors, setTaskErrors] = useState<Partial<TaskForm>>({});

  // Subtask modal
  const [subtaskModal, setSubtaskModal] = useState<{
    open: boolean;
    taskId: string;
    editId: string | null;
  } | null>(null);
  const [subtaskForm, setSubtaskForm] = useState<SubtaskForm>(EMPTY_SUBTASK_FORM);
  const [subtaskErrors, setSubtaskErrors] = useState<Partial<SubtaskForm>>({});

  // Delete confirms
  const [deleteTaskId, setDeleteTaskId] = useState<string | null>(null);
  const [deleteSubtaskId, setDeleteSubtaskId] = useState<string | null>(null);

  // Project edit
  const [editProject, setEditProject] = useState(false);
  const [projForm, setProjForm] = useState({
    name: project?.name ?? '',
    description: project?.description ?? '',
    startDate: project?.startDate ?? '',
    endDate: project?.endDate ?? '',
    assigneeId: project?.assigneeId ?? '',
  });

  // Open ⋮ menu on subtask rows
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);

  // Filter / Group state
  const [filter, setFilter] = useState<FilterState>(() => makeDefaultFilter(users));
  const [groupBy, setGroupBy] = useState<GroupBy>('phase');
  const [filterOpen, setFilterOpen] = useState(false);
  const [groupByOpen, setGroupByOpen] = useState(false);
  const filterBtnRef = useRef<HTMLDivElement | null>(null);
  const groupByBtnRef = useRef<HTMLDivElement | null>(null);

  // Reset filter defaults when user list changes (so new users appear pre-checked)
  useEffect(() => {
    setFilter((f) => {
      const userIds = new Set(['unassigned', ...users.map((u) => u.id)]);
      // If nothing has been customized for assignees, reset to all
      const allIds = new Set([...userIds]);
      const nothingCustom =
        f.assigneeIds.size === 0 ||
        [...f.assigneeIds].every((id) => allIds.has(id)) ||
        f.assigneeIds.size >= users.length;
      if (nothingCustom) return { ...f, assigneeIds: allIds };
      return f;
    });
  }, [users.length]); // eslint-disable-line react-hooks/exhaustive-deps

  // N key → new task
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (
        e.key === 'n' &&
        !e.ctrlKey &&
        !e.metaKey &&
        !(e.target instanceof HTMLInputElement) &&
        !(e.target instanceof HTMLTextAreaElement) &&
        !(e.target instanceof HTMLSelectElement)
      ) {
        openCreateTask();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // Close ⋮ row menu on outside click
  useEffect(() => {
    if (!openMenuId) return;
    const close = () => setOpenMenuId(null);
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, [openMenuId]);

  // Close Filter popover on outside click
  useEffect(() => {
    if (!filterOpen) return;
    const handler = (e: MouseEvent) => {
      if (filterBtnRef.current && !filterBtnRef.current.contains(e.target as Node)) {
        setFilterOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [filterOpen]);

  // Close GroupBy dropdown on outside click
  useEffect(() => {
    if (!groupByOpen) return;
    const handler = (e: MouseEvent) => {
      if (groupByBtnRef.current && !groupByBtnRef.current.contains(e.target as Node)) {
        setGroupByOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [groupByOpen]);

  const toggleCollapse = useCallback((id: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  // Reset collapsed state when grouping changes (default: all expanded)
  useEffect(() => {
    setCollapsed(new Set());
  }, [groupBy]);

  // ── Project-level data (hooks must run unconditionally before any early return)
  const conflictIds = useMemo(
    () => new Set(tasks.filter((t) => hasScheduleConflict(t, allTasks)).map((t) => t.id)),
    [tasks, allTasks],
  );

  const projectSubtasks = useMemo(
    () => subtasks.filter((s) => tasks.some((t) => t.id === s.taskId)),
    [subtasks, tasks],
  );

  const filteredSubtasks = useMemo(
    () => applyFilters(projectSubtasks, filter),
    [projectSubtasks, filter],
  );

  const today = useMemo(() => new Date(), []);

  const groups = useMemo(
    () => buildGroups(filteredSubtasks, groupBy, tasks, users, allTasks, conflictIds, today),
    [filteredSubtasks, groupBy, tasks, users, allTasks, conflictIds, today],
  );

  if (!hasLoaded) {
    return (
      <div className={styles.page}>
        <p style={{ color: 'var(--color-text-muted)' }}>Loading…</p>
      </div>
    );
  }

  if (!project) {
    return (
      <div className={styles.page}>
        <p>Project not found.</p>
        <Button onClick={() => navigate('/')}>Back to projects</Button>
      </div>
    );
  }

  // ── Task validation
  const validateTask = (): boolean => {
    const errs: Partial<TaskForm> = {};
    if (!taskForm.name.trim()) errs.name = 'Name is required';
    if (taskForm.startDate && taskForm.endDate && taskForm.endDate < taskForm.startDate)
      errs.endDate = 'End must be ≥ start';
    for (const depId of taskForm.dependsOn) {
      if (taskModal.editId && wouldCreateCycle(allTasks, taskModal.editId, depId)) {
        errs.dependsOn = [`Adding "${depId}" would create a dependency cycle`];
      }
    }
    setTaskErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const openCreateTask = () => {
    setTaskForm(EMPTY_TASK_FORM);
    setTaskErrors({});
    setTaskModal({ open: true, editId: null });
  };

  const openEditTask = (task: Task) => {
    setTaskForm({
      name: task.name,
      assigneeId: task.assigneeId ?? '',
      startDate: task.startDate ?? '',
      endDate: task.endDate ?? '',
      dependsOn: [...task.dependsOn],
    });
    setTaskErrors({});
    setTaskModal({ open: true, editId: task.id });
  };

  const handleSaveTask = () => {
    if (!validateTask()) return;
    const payload: Omit<Task, 'id' | 'projectId'> = {
      name: taskForm.name.trim(),
      assigneeId: taskForm.assigneeId || undefined,
      startDate: taskForm.startDate || undefined,
      endDate: taskForm.endDate || undefined,
      dependsOn: taskForm.dependsOn,
    };
    if (taskModal.editId) {
      void updateTask(taskModal.editId, payload);
    } else {
      void addTask({ id: uuidv4(), projectId: project.id, ...payload });
    }
    setTaskModal({ open: false, editId: null });
  };

  const handleToggleDep = (depId: string) => {
    const editingId = taskModal.editId ?? '__new__';
    if (wouldCreateCycle(allTasks, editingId, depId)) return;
    setTaskForm((f) => ({
      ...f,
      dependsOn: f.dependsOn.includes(depId)
        ? f.dependsOn.filter((d) => d !== depId)
        : [...f.dependsOn, depId],
    }));
  };

  // ── Subtask validation
  const validateSubtask = (): boolean => {
    const errs: Partial<SubtaskForm> = {};
    if (!subtaskForm.name.trim()) errs.name = 'Name is required';
    if (!subtaskForm.startDate) errs.startDate = 'Required';
    if (!subtaskForm.endDate) errs.endDate = 'Required';
    if (subtaskForm.startDate && subtaskForm.endDate && subtaskForm.endDate < subtaskForm.startDate)
      errs.endDate = 'End must be ≥ start';

    const parentTask = subtaskModal ? tasks.find((t) => t.id === subtaskModal.taskId) : null;
    if (
      parentTask?.startDate &&
      subtaskForm.startDate &&
      subtaskForm.startDate < parentTask.startDate
    )
      errs.startDate = `Must be ≥ task start (${formatDate(parentTask.startDate)})`;
    if (parentTask?.endDate && subtaskForm.endDate && subtaskForm.endDate > parentTask.endDate)
      errs.endDate = `Must be ≤ task end (${formatDate(parentTask.endDate)})`;
    if (parentTask?.startDate && subtaskForm.endDate && subtaskForm.endDate < parentTask.startDate)
      errs.endDate = `Must be ≥ task start (${formatDate(parentTask.startDate)})`;
    if (parentTask?.endDate && subtaskForm.startDate && subtaskForm.startDate > parentTask.endDate)
      errs.startDate = `Must be ≤ task end (${formatDate(parentTask.endDate)})`;

    const pts = Number(subtaskForm.effortPoints);
    if (isNaN(pts) || pts < 0) errs.effortPoints = 'Must be ≥ 0';
    setSubtaskErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const openCreateSubtask = (taskId: string) => {
    setSubtaskForm(EMPTY_SUBTASK_FORM);
    setSubtaskErrors({});
    setSubtaskModal({ open: true, taskId, editId: null });
  };

  const openEditSubtask = (s: Subtask) => {
    setSubtaskForm({
      name: s.name,
      assigneeId: s.assigneeId ?? '',
      startDate: s.startDate,
      endDate: s.endDate,
      effortPoints: String(s.effortPoints),
      status: s.status,
    });
    setSubtaskErrors({});
    setSubtaskModal({ open: true, taskId: s.taskId, editId: s.id });
  };

  const handleSaveSubtask = () => {
    if (!subtaskModal || !validateSubtask()) return;
    const payload: Omit<Subtask, 'id' | 'taskId'> = {
      name: subtaskForm.name.trim(),
      assigneeId: subtaskForm.assigneeId || undefined,
      startDate: subtaskForm.startDate,
      endDate: subtaskForm.endDate,
      effortPoints: Number(subtaskForm.effortPoints),
      status: subtaskForm.status,
    };
    if (subtaskModal.editId) {
      void updateSubtask(subtaskModal.editId, payload);
    } else {
      void addSubtask({ id: uuidv4(), taskId: subtaskModal.taskId, ...payload });
    }
    setSubtaskModal(null);
  };

  // ── Project header stats
  const totalSubs = projectSubtasks.length;
  const doneSubs = projectSubtasks.filter((s) => s.status === 'done').length;
  const progress = totalSubs > 0 ? Math.round((doneSubs / totalSubs) * 100) : 0;
  const totalEffort = projectSubtasks.reduce((a, s) => a + s.effortPoints, 0);

  const filterCount = activeFilterGroupCount(filter, users);
  const groupByLabel =
    GROUP_BY_OPTIONS.find((o) => o.value === groupBy)?.label.toLowerCase() ?? 'phase';

  const visibleGroupCount = groups.filter((g) => g.subtasks.length > 0).length;
  const hasAnyResult = visibleGroupCount > 0 || (groupBy === 'phase' && tasks.length > 0);

  return (
    <div className={styles.page}>
      {/* ── Breadcrumb ── */}
      <div className={styles.topBar}>
        <button className={styles.back} onClick={() => navigate('/')}>
          ← Projects
        </button>
      </div>

      {/* ── Project header ── */}
      <div className={styles.projectHeader}>
        {editProject ? (
          <div className={styles.projectEditRow}>
            <input
              className="input"
              value={projForm.name}
              onChange={(e) => setProjForm({ ...projForm, name: e.target.value })}
              style={{ fontSize: '1.2rem', fontFamily: 'var(--font-display)' }}
            />
            <textarea
              className="input"
              value={projForm.description}
              onChange={(e) => setProjForm({ ...projForm, description: e.target.value })}
              placeholder="Description…"
              rows={2}
            />
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <label style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>Start</label>
              <input
                type="date"
                className="input"
                value={projForm.startDate}
                onChange={(e) => setProjForm({ ...projForm, startDate: e.target.value })}
              />
              <label style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>End</label>
              <input
                type="date"
                className="input"
                value={projForm.endDate}
                onChange={(e) => setProjForm({ ...projForm, endDate: e.target.value })}
              />
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <label style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>
                Assignee
              </label>
              <select
                className="input"
                value={projForm.assigneeId}
                onChange={(e) => setProjForm({ ...projForm, assigneeId: e.target.value })}
              >
                <option value="">Unassigned</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </select>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <Button
                variant="primary"
                size="sm"
                onClick={() => {
                  void updateProject(project.id, {
                    name: projForm.name.trim(),
                    description: projForm.description.trim() || undefined,
                    startDate: projForm.startDate,
                    endDate: projForm.endDate,
                    assigneeId: projForm.assigneeId || undefined,
                  });
                  setEditProject(false);
                }}
              >
                Save
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setEditProject(false)}>
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <div className={styles.projectHeaderRow}>
            <div className={styles.projectHeaderLeft}>
              <div className={styles.projectTitleRow}>
                <h1>{project.name}</h1>
                <button
                  className={styles.editLink}
                  onClick={() => {
                    setProjForm({
                      name: project.name,
                      description: project.description ?? '',
                      startDate: project.startDate,
                      endDate: project.endDate,
                      assigneeId: project.assigneeId ?? '',
                    });
                    setEditProject(true);
                  }}
                >
                  Edit
                </button>
              </div>
              {project.description && <p className={styles.desc}>{project.description}</p>}
              <div className={styles.projectMeta}>
                <ProjectAssigneeChip user={users.find((u) => u.id === project.assigneeId)} />
                <span className={styles.metaDot}>·</span>
                <span className={styles.mono}>
                  {fmt(project.startDate)} → {fmt(project.endDate)}
                </span>
                <span className={styles.metaDot}>·</span>
                <span className={styles.mono}>
                  {calendarDays(project.startDate, project.endDate)} days
                </span>
                <span className={styles.metaDot}>·</span>
                <span className={styles.mono}>
                  {tasks.length} {tasks.length === 1 ? 'group' : 'groups'}
                </span>
              </div>
            </div>

            <div className={styles.statsPanel} data-tour="project-stats">
              <div className={styles.statCell}>
                <div className={styles.statNum}>
                  {doneSubs}
                  <span className={styles.statNumMuted}>/{totalSubs}</span>
                </div>
                <div className={styles.statLabel}>SUBTASKS</div>
              </div>
              <div className={styles.statSep} />
              <div className={styles.statCell}>
                <div className={styles.statNum}>{fmtPts(totalEffort)}</div>
                <div className={styles.statLabel}>POINTS</div>
              </div>
              <div className={styles.statSep} />
              <div className={styles.statCell}>
                <div className={styles.statNum}>{progress}%</div>
                <div className={styles.statLabel}>DONE</div>
                <div className={styles.statMiniBar}>
                  <div className={styles.statMiniFill} style={{ width: `${progress}%` }} />
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Schedule conflicts + task controls (tour target wraps both) ── */}
      <div data-tour="project-conflict-area">
        {conflictIds.size > 0 && (
          <div className={styles.conflictPanel}>
            <strong>Schedule conflicts</strong>
            <ul>
              {tasks
                .filter((t) => conflictIds.has(t.id))
                .map((t) => (
                  <li key={t.id}>
                    <strong>{t.name}</strong> starts before its dependencies end
                  </li>
                ))}
            </ul>
          </div>
        )}

        {/* ── Task list controls ── */}
        <div className={styles.taskListHeader}>
          <h3>Tasks</h3>
          <div className={styles.taskListControls}>
            <div className={styles.popoverAnchor} ref={filterBtnRef}>
              <button
                className={`${styles.controlBtn} ${filterOpen ? styles.controlBtnActive : ''}`}
                onClick={() => setFilterOpen((v) => !v)}
                aria-haspopup="dialog"
                aria-expanded={filterOpen}
              >
                <span className={styles.filterIcon} aria-hidden="true">
                  ⌗
                </span>
                Filter
                {filterCount > 0 && <span className={styles.filterBadge}>{filterCount}</span>}
              </button>
              {filterOpen && (
                <FilterPopover
                  filter={filter}
                  users={users}
                  onApply={(next) => {
                    setFilter(next);
                    setFilterOpen(false);
                  }}
                  onReset={() => setFilter(makeDefaultFilter(users))}
                />
              )}
            </div>

            <div className={styles.popoverAnchor} ref={groupByBtnRef}>
              <button
                className={`${styles.controlBtn} ${groupByOpen ? styles.controlBtnActive : ''}`}
                onClick={() => setGroupByOpen((v) => !v)}
                aria-haspopup="menu"
                aria-expanded={groupByOpen}
              >
                <span className={styles.groupIcon} aria-hidden="true">
                  ☰
                </span>
                Group: {groupByLabel}
              </button>
              {groupByOpen && (
                <div className={styles.dropdownMenu} role="menu">
                  {GROUP_BY_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      className={`${styles.dropdownItem} ${
                        groupBy === opt.value ? styles.dropdownItemActive : ''
                      }`}
                      onClick={() => {
                        setGroupBy(opt.value);
                        setGroupByOpen(false);
                      }}
                      role="menuitemradio"
                      aria-checked={groupBy === opt.value}
                    >
                      <span>{opt.label}</span>
                      {groupBy === opt.value && <span className={styles.checkMark}>✓</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className={styles.addTaskWrap}>
              <Button variant="primary" size="sm" onClick={openCreateTask} data-tour="add-task-btn">
                + Add task <kbd className={styles.kbd}>N</kbd>
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* ── Unified task table ── */}
      {tasks.length === 0 ? (
        <div className={styles.empty}>
          <p>No tasks yet. Add your first task to get started.</p>
          <Button variant="primary" size="sm" onClick={openCreateTask}>
            Add task
          </Button>
        </div>
      ) : !hasAnyResult ? (
        <div className={styles.taskTable}>
          <ColumnRibbon />
          <div className={styles.emptyMatches}>No tasks match your filters in this grouping.</div>
        </div>
      ) : (
        <div className={styles.taskTable} data-tour="task-table">
          <ColumnRibbon />

          {groups.map((group, groupIdx) => {
            const isCollapsed = collapsed.has(group.id);
            const pct =
              group.subtasks.length > 0
                ? Math.round((group.doneCount / group.subtasks.length) * 100)
                : 0;
            const groupTask = groupBy === 'phase' ? group.task : undefined;

            return (
              <Fragment key={group.id}>
                <div
                  className={`${styles.row} ${styles.groupHeader} ${
                    !isCollapsed ? styles.groupHeaderExpanded : ''
                  } ${group.isConflict ? styles.groupHeaderConflict : ''} ${
                    groupTask && openMenuId === groupTask.id ? styles.rowMenuOpen : ''
                  }`}
                  style={{ animationDelay: `${Math.min(groupIdx, 7) * 0.05}s` }}
                >
                  <div className={styles.cellLeader}>
                    <button
                      className={`${styles.collapseChevron} ${
                        !isCollapsed ? styles.chevronOpen : ''
                      }`}
                      onClick={() => toggleCollapse(group.id)}
                      aria-label={isCollapsed ? 'Expand group' : 'Collapse group'}
                    >
                      ›
                    </button>
                  </div>

                  <div className={styles.cellGroupTitle}>
                    <span className={styles.groupTitle}>{group.title}</span>
                    {groupBy === 'phase' && group.depTaskNames.length > 0 && (
                      <span
                        className={styles.depIcon}
                        data-dep={`Depends on ${group.depTaskNames.join(', ')}`}
                      >
                        ⛓
                      </span>
                    )}
                    {group.isConflict && (
                      <span
                        className={styles.conflictBadge}
                        title="Start date before dependency end date"
                      >
                        ⚠ Conflict
                      </span>
                    )}
                    {groupBy === 'phase' && group.warnings.noSubs && (
                      <span
                        className={styles.burnoutWarnBadge}
                        title="No subtasks — invisible to burnout chart"
                      >
                        ⚠ No subtasks
                      </span>
                    )}
                    {groupBy === 'phase' && group.warnings.noAssigned && (
                      <span
                        className={styles.burnoutWarnBadge}
                        title="All subtasks unassigned — invisible to burnout chart"
                      >
                        ⚠ Unassigned
                      </span>
                    )}
                  </div>

                  <div className={styles.cellAssignee}>
                    <div className={styles.miniProgress}>
                      <span className={styles.miniProgressCount}>
                        {group.doneCount}/{group.subtasks.length}
                      </span>
                      <div className={styles.miniBar}>
                        <div className={styles.miniBarFill} style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  </div>

                  <div className={styles.cellDates}>
                    {group.startDate && (
                      <span className={styles.mono}>
                        {group.endDate && group.endDate !== group.startDate ? (
                          <>
                            {fmt(group.startDate)} <span className={styles.dateArrow}>→</span>{' '}
                            {fmt(group.endDate)}
                          </>
                        ) : (
                          fmt(group.startDate)
                        )}
                      </span>
                    )}
                  </div>

                  <div className={styles.cellPoints}>
                    {group.subtasks.length > 0 && (
                      <span className={styles.mono}>{fmtPts(group.totalPts)} pts</span>
                    )}
                  </div>

                  <div className={styles.cellActions}>
                    {groupTask && (
                      <>
                        <button
                          className={styles.menuBtn}
                          onClick={(e) => {
                            e.stopPropagation();
                            setOpenMenuId(openMenuId === groupTask.id ? null : groupTask.id);
                          }}
                          aria-label="Task actions"
                        >
                          ⋮
                        </button>
                        {openMenuId === groupTask.id && (
                          <div
                            className={styles.actionMenu}
                            onClick={(e) => e.stopPropagation()}
                            role="menu"
                          >
                            <button
                              onClick={() => {
                                openCreateSubtask(groupTask.id);
                                setOpenMenuId(null);
                              }}
                            >
                              Add subtask
                            </button>
                            <button
                              onClick={() => {
                                openEditTask(groupTask);
                                setOpenMenuId(null);
                              }}
                            >
                              Edit task
                            </button>
                            <button
                              className={styles.actionMenuDanger}
                              onClick={() => {
                                setDeleteTaskId(groupTask.id);
                                setOpenMenuId(null);
                              }}
                            >
                              Delete task
                            </button>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </div>

                {!isCollapsed && group.subtasks.length === 0 && (
                  <div className={`${styles.row} ${styles.emptySubsRow}`}>
                    <div className={styles.cellLeader} />
                    <div className={styles.cellGroupTitle}>
                      {filterCount > 0 ? (
                        <span className={styles.emptyText}>0 tasks match filters</span>
                      ) : groupBy === 'phase' && groupTask ? (
                        <span className={styles.emptyText}>
                          No subtasks.{' '}
                          <button
                            className={styles.addLink}
                            onClick={() => openCreateSubtask(groupTask.id)}
                          >
                            Add one.
                          </button>
                        </span>
                      ) : (
                        <span className={styles.emptyText}>No tasks</span>
                      )}
                    </div>
                  </div>
                )}

                {!isCollapsed &&
                  group.subtasks.map((sub) => {
                    const subAssignee = users.find((u) => u.id === sub.assigneeId);
                    const dotColor = STATUS_COLORS[sub.status];
                    const isZero = sub.effortPoints === 0;
                    return (
                      <div
                        key={sub.id}
                        className={`${styles.row} ${styles.subRow} ${
                          styles[`status_${sub.status}`]
                        } ${openMenuId === sub.id ? styles.rowMenuOpen : ''}`}
                      >
                        <div className={styles.cellLeader}>
                          <label className={styles.rowCheck}>
                            <input
                              type="checkbox"
                              checked={sub.status === 'done'}
                              onChange={(e) =>
                                void updateSubtask(sub.id, {
                                  status: e.target.checked ? 'done' : 'not_started',
                                })
                              }
                            />
                            <span className={styles.checkmark} />
                          </label>
                        </div>

                        <div className={styles.cellStatus}>
                          <div
                            className={styles.statusPill}
                            style={{
                              background: `${dotColor}18`,
                              border: `1px solid ${dotColor}40`,
                            }}
                          >
                            <span className={styles.pillLeft}>
                              <span className={styles.pillDot} style={{ background: dotColor }} />
                              <span className={styles.pillLabel} style={{ color: dotColor }}>
                                {STATUS_LABELS[sub.status]}
                              </span>
                            </span>
                            <span className={styles.pillChevron} style={{ color: dotColor }}>
                              ›
                            </span>
                            <select
                              className={styles.pillSelect}
                              value={sub.status}
                              onChange={(e) =>
                                void updateSubtask(sub.id, {
                                  status: e.target.value as SubtaskStatus,
                                })
                              }
                              aria-label="Status"
                            >
                              {STATUS_ORDER.map((s) => (
                                <option key={s} value={s}>
                                  {STATUS_LABELS[s]}
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>

                        <div className={styles.cellName}>
                          <span className={styles.subName}>{sub.name}</span>
                        </div>

                        <div className={styles.cellAssignee}>
                          <AssigneeChip user={subAssignee} />
                        </div>

                        <div className={styles.cellDates}>
                          <span className={styles.mono}>
                            {sub.startDate === sub.endDate ? (
                              fmt(sub.startDate)
                            ) : (
                              <>
                                {fmt(sub.startDate)} <span className={styles.dateArrow}>→</span>{' '}
                                {fmt(sub.endDate)}
                              </>
                            )}
                          </span>
                        </div>

                        <div className={`${styles.cellPoints} ${isZero ? styles.zeroPts : ''}`}>
                          <span className={styles.mono}>{fmtPts(sub.effortPoints)}</span>
                        </div>

                        <div className={styles.cellActions}>
                          <button
                            className={styles.menuBtn}
                            onClick={(e) => {
                              e.stopPropagation();
                              setOpenMenuId(openMenuId === sub.id ? null : sub.id);
                            }}
                            aria-label="Row actions"
                          >
                            ⋮
                          </button>
                          {openMenuId === sub.id && (
                            <div
                              className={styles.actionMenu}
                              onClick={(e) => e.stopPropagation()}
                              role="menu"
                            >
                              <button
                                onClick={() => {
                                  openEditSubtask(sub);
                                  setOpenMenuId(null);
                                }}
                              >
                                Edit
                              </button>
                              <button
                                className={styles.actionMenuDanger}
                                onClick={() => {
                                  setDeleteSubtaskId(sub.id);
                                  setOpenMenuId(null);
                                }}
                              >
                                Delete
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
              </Fragment>
            );
          })}
        </div>
      )}

      {/* ── Task modal ── */}
      {taskModal.open && (
        <TaskModal
          isEdit={!!taskModal.editId}
          form={taskForm}
          errors={taskErrors}
          users={users}
          projectTasks={tasks}
          editingTaskId={taskModal.editId}
          allTasks={allTasks}
          onSave={handleSaveTask}
          onClose={() => setTaskModal({ open: false, editId: null })}
          onFormChange={setTaskForm}
          onToggleDep={handleToggleDep}
        />
      )}

      {/* ── Subtask modal ── */}
      {subtaskModal?.open &&
        (() => {
          const parentTask = tasks.find((t) => t.id === subtaskModal.taskId);
          return (
            <SubtaskModal
              isEdit={!!subtaskModal.editId}
              form={subtaskForm}
              errors={subtaskErrors}
              users={users}
              minDate={parentTask?.startDate}
              maxDate={parentTask?.endDate}
              onSave={handleSaveSubtask}
              onClose={() => setSubtaskModal(null)}
              onFormChange={setSubtaskForm}
            />
          );
        })()}

      {/* ── Delete task confirm ── */}
      {deleteTaskId && (
        <Modal
          title="Delete task?"
          onClose={() => setDeleteTaskId(null)}
          footer={
            <>
              <Button variant="secondary" onClick={() => setDeleteTaskId(null)}>
                Cancel
              </Button>
              <Button
                variant="danger"
                onClick={() => {
                  void deleteTask(deleteTaskId);
                  setDeleteTaskId(null);
                }}
              >
                Delete
              </Button>
            </>
          }
        >
          <p>This cannot be undone.</p>
        </Modal>
      )}

      {/* ── Delete subtask confirm ── */}
      {deleteSubtaskId && (
        <Modal
          title="Delete subtask?"
          onClose={() => setDeleteSubtaskId(null)}
          footer={
            <>
              <Button variant="secondary" onClick={() => setDeleteSubtaskId(null)}>
                Cancel
              </Button>
              <Button
                variant="danger"
                onClick={() => {
                  void deleteSubtask(deleteSubtaskId);
                  setDeleteSubtaskId(null);
                }}
              >
                Delete
              </Button>
            </>
          }
        >
          <p>This cannot be undone.</p>
        </Modal>
      )}
    </div>
  );
}

// ─── Column ribbon ────────────────────────────────────────────────────────────

function ColumnRibbon() {
  return (
    <div className={`${styles.row} ${styles.columnRibbon}`}>
      <div className={styles.cellLeader} />
      <div className={styles.cellStatus}>STATUS</div>
      <div className={styles.cellName}>TASK</div>
      <div className={styles.cellAssignee}>ASSIGNEE</div>
      <div className={styles.cellDates}>DATES</div>
      <div className={styles.cellPoints}>POINTS</div>
      <div className={styles.cellActions} />
    </div>
  );
}

// ─── Assignee chip ────────────────────────────────────────────────────────────

function AssigneeChip({ user }: { user?: User }) {
  if (!user) {
    return (
      <div className={styles.assigneeChipUnassigned}>
        <span className={styles.avatarUnassigned} />
        <span className={styles.assigneeNameUnassigned}>Unassigned</span>
      </div>
    );
  }
  const initial = user.name.trim().charAt(0).toUpperCase();
  return (
    <div className={styles.assigneeChip} title={user.name}>
      <span className={styles.avatar} style={{ background: user.color }}>
        {initial}
      </span>
      <span className={styles.assigneeName}>{user.name}</span>
    </div>
  );
}

function ProjectAssigneeChip({ user }: { user?: User }) {
  if (!user) {
    return (
      <span className={styles.projectAssigneeUnassigned}>
        <span className={styles.projectAssigneeDot} />
        Unassigned
      </span>
    );
  }
  const initial = user.name.trim().charAt(0).toUpperCase();
  return (
    <span className={styles.projectAssigneeChip} title={`Owner: ${user.name}`}>
      <span className={styles.projectAssigneeAvatar} style={{ background: user.color }}>
        {initial}
      </span>
      <span>{user.name}</span>
    </span>
  );
}

// ─── Filter popover ───────────────────────────────────────────────────────────

type FilterPopoverProps = {
  filter: FilterState;
  users: User[];
  onApply: (next: FilterState) => void;
  onReset: () => void;
};

function FilterPopover({ filter, users, onApply, onReset }: FilterPopoverProps) {
  const [draft, setDraft] = useState<FilterState>({
    statuses: new Set(filter.statuses),
    assigneeIds: new Set(filter.assigneeIds),
    startsAfter: filter.startsAfter,
    endsBefore: filter.endsBefore,
    pointsMin: filter.pointsMin,
    pointsMax: filter.pointsMax,
  });
  const [open, setOpen] = useState({ status: true, assignee: true, date: true, points: true });

  const toggleStatus = (s: SubtaskStatus) => {
    setDraft((d) => {
      const next = new Set(d.statuses);
      if (next.has(s)) next.delete(s);
      else next.add(s);
      return { ...d, statuses: next };
    });
  };
  const toggleAssignee = (id: string) => {
    setDraft((d) => {
      const next = new Set(d.assigneeIds);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return { ...d, assigneeIds: next };
    });
  };

  return (
    <div className={styles.filterPopover} role="dialog" aria-label="Filter tasks">
      <FilterSection
        title="Status"
        open={open.status}
        onToggle={() => setOpen((o) => ({ ...o, status: !o.status }))}
      >
        {STATUS_ORDER.map((s) => (
          <label key={s} className={styles.filterCheckRow}>
            <input
              type="checkbox"
              checked={draft.statuses.has(s)}
              onChange={() => toggleStatus(s)}
            />
            <span className={styles.filterStatusDot} style={{ background: STATUS_COLORS[s] }} />
            <span>{STATUS_LABELS[s]}</span>
          </label>
        ))}
      </FilterSection>

      <FilterSection
        title="Assignee"
        open={open.assignee}
        onToggle={() => setOpen((o) => ({ ...o, assignee: !o.assignee }))}
      >
        {users.map((u) => {
          const initial = u.name.charAt(0).toUpperCase();
          return (
            <label key={u.id} className={styles.filterCheckRow}>
              <input
                type="checkbox"
                checked={draft.assigneeIds.has(u.id)}
                onChange={() => toggleAssignee(u.id)}
              />
              <span className={styles.filterAvatar} style={{ background: u.color }}>
                {initial}
              </span>
              <span>{u.name}</span>
            </label>
          );
        })}
        <label className={styles.filterCheckRow}>
          <input
            type="checkbox"
            checked={draft.assigneeIds.has('unassigned')}
            onChange={() => toggleAssignee('unassigned')}
          />
          <span className={styles.filterAvatarEmpty} />
          <span style={{ fontStyle: 'italic', color: 'var(--color-text-muted)' }}>Unassigned</span>
        </label>
      </FilterSection>

      <FilterSection
        title="Date range"
        open={open.date}
        onToggle={() => setOpen((o) => ({ ...o, date: !o.date }))}
      >
        <div className={styles.filterDateRow}>
          <label className={styles.filterDateLabel}>Starts after</label>
          <input
            type="date"
            className={`input ${styles.filterDateInput}`}
            value={draft.startsAfter}
            onChange={(e) => setDraft({ ...draft, startsAfter: e.target.value })}
          />
        </div>
        <div className={styles.filterDateRow}>
          <label className={styles.filterDateLabel}>Ends before</label>
          <input
            type="date"
            className={`input ${styles.filterDateInput}`}
            value={draft.endsBefore}
            onChange={(e) => setDraft({ ...draft, endsBefore: e.target.value })}
          />
        </div>
      </FilterSection>

      <FilterSection
        title="Points"
        open={open.points}
        onToggle={() => setOpen((o) => ({ ...o, points: !o.points }))}
      >
        <div className={styles.filterPointsRow}>
          <input
            type="number"
            min="0"
            step="0.5"
            className={`input ${styles.filterPointsInput}`}
            placeholder="Min"
            value={draft.pointsMin}
            onChange={(e) => setDraft({ ...draft, pointsMin: e.target.value })}
          />
          <span className={styles.filterPointsSep}>–</span>
          <input
            type="number"
            min="0"
            step="0.5"
            className={`input ${styles.filterPointsInput}`}
            placeholder="Max"
            value={draft.pointsMax}
            onChange={(e) => setDraft({ ...draft, pointsMax: e.target.value })}
          />
        </div>
      </FilterSection>

      <div className={styles.filterFooter}>
        <button
          className={styles.filterResetLink}
          onClick={() => {
            onReset();
            const fresh: FilterState = {
              statuses: new Set(STATUS_ORDER),
              assigneeIds: new Set(['unassigned', ...users.map((u) => u.id)]),
              startsAfter: '',
              endsBefore: '',
              pointsMin: '',
              pointsMax: '',
            };
            setDraft(fresh);
          }}
        >
          Reset
        </button>
        <Button variant="primary" size="sm" onClick={() => onApply(draft)}>
          Apply
        </Button>
      </div>
    </div>
  );
}

function FilterSection({
  title,
  open,
  onToggle,
  children,
}: {
  title: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className={styles.filterSection}>
      <button className={styles.filterSectionHeader} onClick={onToggle} type="button">
        <span>{title}</span>
        <span className={`${styles.filterSectionChevron} ${open ? styles.chevronOpen : ''}`}>
          ›
        </span>
      </button>
      {open && <div className={styles.filterSectionBody}>{children}</div>}
    </div>
  );
}

// ─── Task sub-modal ───────────────────────────────────────────────────────────

type TaskModalProps = {
  isEdit: boolean;
  form: TaskForm;
  errors: Partial<TaskForm>;
  users: ReturnType<typeof useStore.getState>['users'];
  projectTasks: Task[];
  editingTaskId: string | null;
  allTasks: Task[];
  onSave: () => void;
  onClose: () => void;
  onFormChange: (f: TaskForm) => void;
  onToggleDep: (depId: string) => void;
};

function TaskModal({
  isEdit,
  form,
  errors,
  users,
  projectTasks,
  editingTaskId,
  allTasks,
  onSave,
  onClose,
  onFormChange,
  onToggleDep,
}: TaskModalProps) {
  const editId = editingTaskId ?? '__new__';
  const forbidden = forbiddenDependencies(allTasks, editId);
  const otherTasks = projectTasks.filter((t) => t.id !== editingTaskId);

  return (
    <Modal
      title={isEdit ? 'Edit task' : 'New task'}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={onSave}>
            {isEdit ? 'Save' : 'Create'}
          </Button>
        </>
      }
    >
      <div className={styles.form}>
        <FormField label="Name" htmlFor="t-name" error={errors.name} required>
          <input
            id="t-name"
            className="input"
            value={form.name}
            autoFocus
            onChange={(e) => onFormChange({ ...form, name: e.target.value })}
          />
        </FormField>

        <FormField label="Assignee" htmlFor="t-assign">
          <select
            id="t-assign"
            className="input"
            value={form.assigneeId}
            onChange={(e) => onFormChange({ ...form, assigneeId: e.target.value })}
          >
            <option value="">Unassigned</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
        </FormField>

        <div className={styles.formRow}>
          <FormField label="Start date" htmlFor="t-start" error={errors.startDate}>
            <input
              id="t-start"
              type="date"
              className="input"
              value={form.startDate}
              onChange={(e) => onFormChange({ ...form, startDate: e.target.value })}
            />
          </FormField>
          <FormField label="End date" htmlFor="t-end" error={errors.endDate}>
            <input
              id="t-end"
              type="date"
              className="input"
              value={form.endDate}
              onChange={(e) => onFormChange({ ...form, endDate: e.target.value })}
            />
          </FormField>
        </div>

        {otherTasks.length > 0 && (
          <FormField
            label="Depends on (finish-to-start)"
            error={Array.isArray(errors.dependsOn) ? errors.dependsOn[0] : errors.dependsOn}
          >
            <div className={styles.depList}>
              {otherTasks.map((t) => {
                const blocked = forbidden.has(t.id);
                const checked = form.dependsOn.includes(t.id);
                return (
                  <label
                    key={t.id}
                    className={`${styles.depItem} ${blocked ? styles.depBlocked : ''}`}
                    title={blocked ? 'Would create a cycle' : undefined}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={blocked && !checked}
                      onChange={() => onToggleDep(t.id)}
                    />
                    <span>{t.name}</span>
                    {blocked && <span className={styles.cycleWarn}>↺ cycle</span>}
                  </label>
                );
              })}
            </div>
          </FormField>
        )}
      </div>
    </Modal>
  );
}

// ─── Subtask sub-modal ────────────────────────────────────────────────────────

type SubtaskModalProps = {
  isEdit: boolean;
  form: SubtaskForm;
  errors: Partial<SubtaskForm>;
  users: ReturnType<typeof useStore.getState>['users'];
  minDate?: string;
  maxDate?: string;
  onSave: () => void;
  onClose: () => void;
  onFormChange: (f: SubtaskForm) => void;
};

function SubtaskModal({
  isEdit,
  form,
  errors,
  users,
  minDate,
  maxDate,
  onSave,
  onClose,
  onFormChange,
}: SubtaskModalProps) {
  return (
    <Modal
      title={isEdit ? 'Edit subtask' : 'New subtask'}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={onSave}>
            {isEdit ? 'Save' : 'Create'}
          </Button>
        </>
      }
    >
      <div className={styles.form}>
        <FormField label="Name" htmlFor="s-name" error={errors.name} required>
          <input
            id="s-name"
            className="input"
            value={form.name}
            autoFocus
            onChange={(e) => onFormChange({ ...form, name: e.target.value })}
          />
        </FormField>

        <FormField label="Status" htmlFor="s-status">
          <select
            id="s-status"
            className="input"
            value={form.status}
            onChange={(e) => onFormChange({ ...form, status: e.target.value as SubtaskStatus })}
          >
            {STATUS_ORDER.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABELS[s]}
              </option>
            ))}
          </select>
        </FormField>

        <FormField label="Assignee" htmlFor="s-assign">
          <select
            id="s-assign"
            className="input"
            value={form.assigneeId}
            onChange={(e) => onFormChange({ ...form, assigneeId: e.target.value })}
          >
            <option value="">Unassigned</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
        </FormField>

        <div className={styles.formRow}>
          <FormField label="Start date" htmlFor="s-start" error={errors.startDate} required>
            <input
              id="s-start"
              type="date"
              className="input"
              value={form.startDate}
              min={minDate}
              max={maxDate}
              onChange={(e) => onFormChange({ ...form, startDate: e.target.value })}
            />
          </FormField>
          <FormField label="End date" htmlFor="s-end" error={errors.endDate} required>
            <input
              id="s-end"
              type="date"
              className="input"
              value={form.endDate}
              min={minDate}
              max={maxDate}
              onChange={(e) => onFormChange({ ...form, endDate: e.target.value })}
            />
          </FormField>
        </div>

        <FormField label="Effort points" htmlFor="s-effort" error={errors.effortPoints} required>
          <input
            id="s-effort"
            type="number"
            min="0"
            step="0.5"
            className="input"
            value={form.effortPoints}
            onChange={(e) => onFormChange({ ...form, effortPoints: e.target.value })}
          />
        </FormField>
      </div>
    </Modal>
  );
}
