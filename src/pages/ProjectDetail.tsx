import { useState, useCallback, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { v4 as uuidv4 } from 'uuid';
import { useStore } from '@/store';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { FormField } from '@/components/ui/FormField';
import { wouldCreateCycle, forbiddenDependencies, hasScheduleConflict } from '@/utils/cycles';
import { derivedTaskDates } from '@/utils/derive';
import { formatDate } from '@/utils/workingDays';
import type { Task, Subtask, SubtaskStatus } from '@/types';
import styles from './ProjectDetail.module.css';

const STATUS_LABELS: Record<SubtaskStatus, string> = {
  not_started: 'Not started',
  in_progress: 'In progress',
  blocked: 'Blocked',
  done: 'Done',
};

// ─── Task form ────────────────────────────────────────────────────────────────

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

// ─── Subtask form ─────────────────────────────────────────────────────────────

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

  // Task modal state
  const [taskModal, setTaskModal] = useState<{ open: boolean; editId: string | null }>({
    open: false,
    editId: null,
  });
  const [taskForm, setTaskForm] = useState<TaskForm>(EMPTY_TASK_FORM);
  const [taskErrors, setTaskErrors] = useState<Partial<TaskForm>>({});

  // Subtask modal state
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
  });

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

  const toggleCollapse = useCallback((id: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

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

  // Task validation
  const validateTask = (): boolean => {
    const errs: Partial<TaskForm> = {};
    if (!taskForm.name.trim()) errs.name = 'Name is required';
    if (taskForm.startDate && taskForm.endDate && taskForm.endDate < taskForm.startDate)
      errs.endDate = 'End must be ≥ start';
    // Check proposed deps for cycles
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

  // Subtask validation
  const validateSubtask = (): boolean => {
    const errs: Partial<SubtaskForm> = {};
    if (!subtaskForm.name.trim()) errs.name = 'Name is required';
    if (!subtaskForm.startDate) errs.startDate = 'Required';
    if (!subtaskForm.endDate) errs.endDate = 'Required';
    if (subtaskForm.startDate && subtaskForm.endDate && subtaskForm.endDate < subtaskForm.startDate)
      errs.endDate = 'End must be ≥ start';
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

  // Schedule conflicts
  const conflictIds = new Set(
    tasks.filter((t) => hasScheduleConflict(t, allTasks)).map((t) => t.id),
  );

  // Counts for progress bar
  const projectSubtasks = subtasks.filter((s) => tasks.some((t) => t.id === s.taskId));
  const totalSubs = projectSubtasks.length;
  const doneSubs = projectSubtasks.filter((s) => s.status === 'done').length;
  const progress = totalSubs > 0 ? Math.round((doneSubs / totalSubs) * 100) : 0;
  const totalEffort = projectSubtasks.reduce((a, s) => a + s.effortPoints, 0);

  return (
    <div className={styles.page}>
      {/* ── Header ── */}
      <div className={styles.topBar}>
        <button className={styles.back} onClick={() => navigate('/')}>
          ← Projects
        </button>
      </div>

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
            <div style={{ display: 'flex', gap: 8 }}>
              <Button
                variant="primary"
                size="sm"
                onClick={() => {
                  void updateProject(project.id, {
                    name: projForm.name.trim(),
                    description: projForm.description.trim() || undefined,
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
          <div className={styles.projectTitleRow}>
            <h1>{project.name}</h1>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setProjForm({ name: project.name, description: project.description ?? '' });
                setEditProject(true);
              }}
            >
              Edit
            </Button>
          </div>
        )}
        {project.description && !editProject && (
          <p className={styles.desc}>{project.description}</p>
        )}
        <div className={styles.projectMeta}>
          <span className={styles.mono}>
            {formatDate(project.startDate)} → {formatDate(project.endDate)}
          </span>
          <span className={styles.dot}>·</span>
          <span className={styles.mono}>
            {doneSubs}/{totalSubs} subtasks
          </span>
          <span className={styles.dot}>·</span>
          <span className={styles.mono}>{totalEffort} pts total</span>
          <span className={styles.dot}>·</span>
          <span className={styles.mono}>{progress}% done</span>
        </div>
        <div className={styles.progressBar}>
          <div className={styles.progressFill} style={{ width: `${progress}%` }} />
        </div>
      </div>

      {/* ── Schedule conflicts panel ── */}
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

      {/* ── Task list ── */}
      <div className={styles.taskListHeader}>
        <h3>Tasks</h3>
        <Button variant="primary" size="sm" onClick={openCreateTask}>
          + Add task <kbd className={styles.kbd}>N</kbd>
        </Button>
      </div>

      {tasks.length === 0 ? (
        <div className={styles.empty}>
          <p>No tasks yet. Add your first task to get started.</p>
          <Button variant="primary" size="sm" onClick={openCreateTask}>
            Add task
          </Button>
        </div>
      ) : (
        <div className={styles.taskList}>
          {tasks.map((task) => {
            const taskSubs = subtasks.filter((s) => s.taskId === task.id);
            const isCollapsed = collapsed.has(task.id);
            const derived = derivedTaskDates(task, subtasks);
            const assignee = users.find((u) => u.id === task.assigneeId);
            const isConflict = conflictIds.has(task.id);

            return (
              <div
                key={task.id}
                className={`${styles.taskRow} ${isConflict ? styles.conflict : ''}`}
              >
                {/* Task header */}
                <div className={styles.taskHeader}>
                  <button
                    className={styles.collapseBtn}
                    onClick={() => toggleCollapse(task.id)}
                    aria-label={isCollapsed ? 'Expand' : 'Collapse'}
                  >
                    {isCollapsed ? '▶' : '▼'}
                  </button>

                  <span className={styles.taskName}>{task.name}</span>

                  {isConflict && (
                    <span
                      className={styles.conflictBadge}
                      title="Start date before dependency end date"
                    >
                      ⚠ Schedule conflict
                    </span>
                  )}

                  {assignee && (
                    <span
                      className={styles.assigneeDot}
                      style={{ background: assignee.color }}
                      title={assignee.name}
                    />
                  )}

                  {derived.startDate && (
                    <span className={`${styles.mono} ${styles.taskDate}`}>
                      {formatDate(derived.startDate)}
                      {derived.endDate ? ` → ${formatDate(derived.endDate)}` : ''}
                    </span>
                  )}

                  {task.dependsOn.length > 0 && (
                    <span className={styles.depBadge}>depends on {task.dependsOn.length}</span>
                  )}

                  <div className={styles.taskActions}>
                    <Button variant="ghost" size="sm" onClick={() => openCreateSubtask(task.id)}>
                      + subtask
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => openEditTask(task)}>
                      Edit
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setDeleteTaskId(task.id)}>
                      ✕
                    </Button>
                  </div>
                </div>

                {/* Subtask list */}
                {!isCollapsed && (
                  <div className={styles.subtaskList}>
                    {taskSubs.length === 0 ? (
                      <p className={styles.noSubs}>
                        No subtasks.{' '}
                        <button
                          className={styles.addLink}
                          onClick={() => openCreateSubtask(task.id)}
                        >
                          Add one.
                        </button>
                      </p>
                    ) : (
                      taskSubs.map((sub) => {
                        const subAssignee = users.find((u) => u.id === sub.assigneeId);
                        return (
                          <div
                            key={sub.id}
                            className={`${styles.subtaskRow} ${styles[`status_${sub.status}`]}`}
                          >
                            <select
                              className={styles.statusSelect}
                              value={sub.status}
                              onChange={(e) =>
                                void updateSubtask(sub.id, {
                                  status: e.target.value as SubtaskStatus,
                                })
                              }
                              aria-label="Status"
                            >
                              {(Object.keys(STATUS_LABELS) as SubtaskStatus[]).map((s) => (
                                <option key={s} value={s}>
                                  {STATUS_LABELS[s]}
                                </option>
                              ))}
                            </select>

                            <span className={styles.subtaskName}>{sub.name}</span>

                            {subAssignee && (
                              <span
                                className={styles.assigneeDot}
                                style={{ background: subAssignee.color }}
                                title={subAssignee.name}
                              />
                            )}

                            <span className={`${styles.mono} ${styles.taskDate}`}>
                              {formatDate(sub.startDate)} → {formatDate(sub.endDate)}
                            </span>

                            <span className={`${styles.mono} ${styles.effortBadge}`}>
                              {sub.effortPoints} pts
                            </span>

                            <div className={styles.taskActions}>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => openEditSubtask(sub)}
                              >
                                Edit
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setDeleteSubtaskId(sub.id)}
                              >
                                ✕
                              </Button>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                )}
              </div>
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
      {subtaskModal?.open && (
        <SubtaskModal
          isEdit={!!subtaskModal.editId}
          form={subtaskForm}
          errors={subtaskErrors}
          users={users}
          onSave={handleSaveSubtask}
          onClose={() => setSubtaskModal(null)}
          onFormChange={setSubtaskForm}
        />
      )}

      {/* ── Delete confirms ── */}
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
          <p>This will also delete all subtasks within this task. This cannot be undone.</p>
        </Modal>
      )}

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

        <div className={styles.row}>
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
  onSave: () => void;
  onClose: () => void;
  onFormChange: (f: SubtaskForm) => void;
};

function SubtaskModal({
  isEdit,
  form,
  errors,
  users,
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
            {(Object.keys(STATUS_LABELS) as SubtaskStatus[]).map((s) => (
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

        <div className={styles.row}>
          <FormField label="Start date" htmlFor="s-start" error={errors.startDate} required>
            <input
              id="s-start"
              type="date"
              className="input"
              value={form.startDate}
              onChange={(e) => onFormChange({ ...form, startDate: e.target.value })}
            />
          </FormField>
          <FormField label="End date" htmlFor="s-end" error={errors.endDate} required>
            <input
              id="s-end"
              type="date"
              className="input"
              value={form.endDate}
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
