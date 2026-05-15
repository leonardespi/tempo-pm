import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '@/store';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { FormField } from '@/components/ui/FormField';
import { ExportAllButton } from '@/components/ExportAllButton';
import { formatDate, workingDaysRemaining } from '@/utils/workingDays';
import { v4 as uuidv4 } from 'uuid';
import type { Project, AppData } from '@/types';
import styles from './Dashboard.module.css';

type CreateForm = {
  name: string;
  description: string;
  startDate: string;
  endDate: string;
  assigneeId: string;
};

const EMPTY_FORM: CreateForm = {
  name: '',
  description: '',
  startDate: '',
  endDate: '',
  assigneeId: '',
};

export default function Dashboard() {
  const projects = useStore((s) => s.projects);
  const hasLoaded = useStore((s) => s.hasLoaded);
  const tasks = useStore((s) => s.tasks);
  const subtasks = useStore((s) => s.subtasks);
  const users = useStore((s) => s.users);
  const workingDays = useStore((s) => s.workingDays);
  const addProject = useStore((s) => s.addProject);
  const deleteProject = useStore((s) => s.deleteProject);
  const saveData = useStore((s) => s.saveData);
  const settings = useStore((s) => s.settings);

  const [showCreate, setShowCreate] = useState(false);
  const [importState, setImportState] = useState<'idle' | 'ok' | 'error'>('idle');
  const importRef = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState<CreateForm>(EMPTY_FORM);
  const [errors, setErrors] = useState<Partial<CreateForm>>({});
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (
        e.key === 'n' &&
        !e.ctrlKey &&
        !e.metaKey &&
        !(e.target instanceof HTMLInputElement) &&
        !(e.target instanceof HTMLTextAreaElement)
      ) {
        setShowCreate(true);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const validate = () => {
    const errs: Partial<CreateForm> = {};
    if (!form.name.trim()) errs.name = 'Name is required';
    if (!form.startDate) errs.startDate = 'Start date is required';
    if (!form.endDate) errs.endDate = 'End date is required';
    if (form.startDate && form.endDate && form.endDate < form.startDate)
      errs.endDate = 'End must be ≥ start';
    return errs;
  };

  const handleCreate = () => {
    const errs = validate();
    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      return;
    }
    const project: Project = {
      id: uuidv4(),
      name: form.name.trim(),
      description: form.description.trim() || undefined,
      createdAt: new Date().toISOString(),
      startDate: form.startDate,
      endDate: form.endDate,
      assigneeId: form.assigneeId || undefined,
    };
    void addProject(project);
    setShowCreate(false);
    setForm(EMPTY_FORM);
    setErrors({});
  };

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        const raw = JSON.parse(ev.target?.result as string) as Partial<AppData>;
        if (!Array.isArray(raw.projects) || !Array.isArray(raw.tasks)) throw new Error('invalid');
        await saveData({
          projects: raw.projects,
          tasks: raw.tasks,
          subtasks: raw.subtasks ?? [],
          users: raw.users ?? [],
          ...(raw.workingDays ? { workingDays: raw.workingDays } : {}),
          ...(raw.settings ? { settings: { ...settings, ...raw.settings } } : {}),
        });
        setImportState('ok');
      } catch {
        setImportState('error');
      }
      e.target.value = '';
      setTimeout(() => setImportState('idle'), 3000);
    };
    reader.readAsText(file);
  };

  const projectStats = (p: Project) => {
    const projectTasks = tasks.filter((t) => t.projectId === p.id);
    const taskIds = new Set(projectTasks.map((t) => t.id));
    const projectSubtasks = subtasks.filter((s) => taskIds.has(s.taskId));
    const total = projectSubtasks.length;
    const done = projectSubtasks.filter((s) => s.status === 'done').length;
    const effort = projectSubtasks.reduce((acc, s) => acc + s.effortPoints, 0);
    const remaining = workingDaysRemaining(p.endDate, workingDays);
    return { total, done, effort, remaining };
  };

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1>Projects</h1>
        <div className={styles.headerActions}>
          <input
            ref={importRef}
            type="file"
            accept=".json,application/json"
            style={{ display: 'none' }}
            onChange={handleImport}
          />
          <Button variant="secondary" onClick={() => importRef.current?.click()}>
            {importState === 'ok'
              ? 'Imported ✓'
              : importState === 'error'
                ? 'Invalid file'
                : 'Import projects'}
          </Button>
          <Button variant="primary" onClick={() => setShowCreate(true)}>
            + New project <kbd className={styles.kbd}>N</kbd>
          </Button>
        </div>
      </div>

      {!hasLoaded ? (
        <div className={styles.grid} aria-busy="true" aria-label="Loading projects">
          {[1, 2, 3].map((i) => (
            <div key={i} className={styles.skeleton} aria-hidden="true" />
          ))}
        </div>
      ) : projects.length === 0 ? (
        <div className={styles.empty}>
          <p>No projects yet.</p>
          <p className={styles.emptyHint}>Create your first project to get started.</p>
          <Button variant="primary" onClick={() => setShowCreate(true)}>
            Create project
          </Button>
        </div>
      ) : (
        <div className={styles.grid}>
          {projects.map((p) => {
            const { total, done, effort, remaining } = projectStats(p);
            const progress = total > 0 ? Math.round((done / total) * 100) : 0;
            const assignee = users.find((u) => u.id === p.assigneeId);
            const accent = assignee?.color ?? 'var(--color-accent)';
            return (
              <div
                key={p.id}
                className={styles.card}
                onClick={() => navigate(`/projects/${p.id}`)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => e.key === 'Enter' && navigate(`/projects/${p.id}`)}
                style={{ borderLeft: `3px solid ${accent}` }}
              >
                <div className={styles.cardHeader}>
                  <h3 className={styles.cardTitle}>{p.name}</h3>
                  <button
                    className={styles.deleteBtn}
                    onClick={(e) => {
                      e.stopPropagation();
                      setDeleteConfirm(p.id);
                    }}
                    aria-label="Delete project"
                  >
                    ✕
                  </button>
                </div>
                {assignee ? (
                  <div className={styles.assigneeRow} title={assignee.name}>
                    <span className={styles.assigneeAvatar} style={{ background: assignee.color }}>
                      {assignee.name.trim().charAt(0).toUpperCase()}
                    </span>
                    <span className={styles.assigneeName}>{assignee.name}</span>
                  </div>
                ) : (
                  <div className={styles.assigneeRow}>
                    <span className={styles.assigneeAvatarEmpty} />
                    <span className={styles.assigneeUnassigned}>Unassigned</span>
                  </div>
                )}
                {p.description && <p className={styles.desc}>{p.description}</p>}

                <div className={styles.progressBar}>
                  <div className={styles.progressFill} style={{ width: `${progress}%` }} />
                </div>

                <div className={styles.stats}>
                  <span className={styles.mono}>
                    {done}/{total} tasks
                  </span>
                  <span className={styles.mono}>{effort} pts</span>
                  <span className={`${styles.mono} ${remaining < 5 ? styles.urgent : ''}`}>
                    {remaining}d left
                  </span>
                </div>

                <div className={styles.dates}>
                  <span>{formatDate(p.startDate)}</span>
                  <span>→</span>
                  <span>{formatDate(p.endDate)}</span>
                </div>

                <div
                  className={styles.cardExport}
                  onClick={(e) => e.stopPropagation()}
                  onKeyDown={(e) => e.stopPropagation()}
                  role="presentation"
                >
                  <ExportAllButton projectId={p.id} projectName={p.name} />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showCreate && (
        <Modal
          title="New Project"
          onClose={() => {
            setShowCreate(false);
            setForm(EMPTY_FORM);
            setErrors({});
          }}
          footer={
            <>
              <Button
                variant="secondary"
                onClick={() => {
                  setShowCreate(false);
                  setForm(EMPTY_FORM);
                  setErrors({});
                }}
              >
                Cancel
              </Button>
              <Button variant="primary" onClick={handleCreate}>
                Create
              </Button>
            </>
          }
        >
          <div className={styles.form}>
            <FormField label="Name" htmlFor="proj-name" error={errors.name} required>
              <input
                id="proj-name"
                className="input"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="e.g. Website Redesign"
                autoFocus
              />
            </FormField>
            <FormField label="Description" htmlFor="proj-desc">
              <textarea
                id="proj-desc"
                className="input"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="Optional"
                rows={2}
              />
            </FormField>
            <FormField label="Assignee" htmlFor="proj-assign">
              <select
                id="proj-assign"
                className="input"
                value={form.assigneeId}
                onChange={(e) => setForm({ ...form, assigneeId: e.target.value })}
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
              <FormField label="Start date" htmlFor="proj-start" error={errors.startDate} required>
                <input
                  id="proj-start"
                  type="date"
                  className="input"
                  value={form.startDate}
                  onChange={(e) => setForm({ ...form, startDate: e.target.value })}
                />
              </FormField>
              <FormField label="End date" htmlFor="proj-end" error={errors.endDate} required>
                <input
                  id="proj-end"
                  type="date"
                  className="input"
                  value={form.endDate}
                  onChange={(e) => setForm({ ...form, endDate: e.target.value })}
                />
              </FormField>
            </div>
          </div>
        </Modal>
      )}

      {deleteConfirm && (
        <Modal
          title="Delete project?"
          onClose={() => setDeleteConfirm(null)}
          footer={
            <>
              <Button variant="secondary" onClick={() => setDeleteConfirm(null)}>
                Cancel
              </Button>
              <Button
                variant="danger"
                onClick={() => {
                  void deleteProject(deleteConfirm);
                  setDeleteConfirm(null);
                }}
              >
                Delete
              </Button>
            </>
          }
        >
          <p>
            This will permanently delete the project and all its tasks and subtasks. This cannot be
            undone.
          </p>
        </Modal>
      )}
    </div>
  );
}
