import { useEffect, useRef, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { useStore } from '@/store';
import styles from './CommandPalette.module.css';

const NAV_ITEMS = [
  { to: '/', label: 'Projects', icon: '◈' },
  { to: '/gantt', label: 'Gantt', icon: '▤' },
  { to: '/timeline', label: 'Timeline', icon: '◷' },
  { to: '/workload', label: 'Workload', icon: '▦' },
  { to: '/burnout', label: 'Burnout Risk', icon: '◉' },
  { to: '/users', label: 'Team', icon: '◎' },
  { to: '/settings', label: 'Settings', icon: '⚙' },
];

type Item = {
  id: string;
  label: string;
  icon: string;
  to: string;
  group: 'Navigate' | 'Projects' | 'Tasks' | 'Subtasks';
  sub?: string;
};

type Props = { onClose: () => void };

export function CommandPalette({ onClose }: Props) {
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const projects = useStore((s) => s.projects);
  const tasks = useStore((s) => s.tasks);
  const subtasks = useStore((s) => s.subtasks);

  const projectMap = new Map(projects.map((p) => [p.id, p]));
  const taskMap = new Map(tasks.map((t) => [t.id, t]));

  const baseItems: Item[] = [
    ...NAV_ITEMS.map((n) => ({
      id: `nav-${n.to}`,
      label: n.label,
      icon: n.icon,
      to: n.to,
      group: 'Navigate' as const,
    })),
    ...projects.map((p) => ({
      id: `proj-${p.id}`,
      label: p.name,
      icon: '◈',
      to: `/projects/${p.id}`,
      group: 'Projects' as const,
    })),
  ];

  const taskItems: Item[] = tasks.map((t) => {
    const project = projectMap.get(t.projectId);
    return {
      id: `task-${t.id}`,
      label: t.name,
      icon: '▤',
      to: `/projects/${t.projectId}`,
      group: 'Tasks' as const,
      sub: project?.name,
    };
  });

  const subtaskItems: Item[] = subtasks.map((s) => {
    const task = taskMap.get(s.taskId);
    const project = task ? projectMap.get(task.projectId) : undefined;
    return {
      id: `sub-${s.id}`,
      label: s.name,
      icon: '▫',
      to: project ? `/projects/${project.id}` : '/',
      group: 'Subtasks' as const,
      sub: project && task ? `${project.name} › ${task.name}` : undefined,
    };
  });

  const q = query.trim().toLowerCase();

  const filtered: Item[] = q
    ? [...baseItems, ...taskItems, ...subtaskItems].filter((item) =>
        item.label.toLowerCase().includes(q),
      )
    : baseItems;

  const select = useCallback(
    (item: Item) => {
      void navigate(item.to);
      onClose();
    },
    [navigate, onClose],
  );

  useEffect(() => {
    requestAnimationFrame(() => inputRef.current?.focus());
  }, []);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveIndex((prev) => Math.min(prev + 1, filtered.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveIndex((prev) => Math.max(prev - 1, 0));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const item = filtered.at(activeIndex);
        if (item) select(item);
      } else if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [filtered, activeIndex, select, onClose]);

  const navFiltered = filtered.filter((i) => i.group === 'Navigate');
  const projFiltered = filtered.filter((i) => i.group === 'Projects');
  const taskFiltered = filtered.filter((i) => i.group === 'Tasks');
  const subtaskFiltered = filtered.filter((i) => i.group === 'Subtasks');

  let flatIndex = 0;

  const renderGroup = (groupLabel: string, items: Item[]) => {
    if (!items.length) return null;
    return (
      <div key={groupLabel} role="group" aria-label={groupLabel}>
        <div className={styles.groupLabel}>{groupLabel}</div>
        {items.map((item) => {
          const idx = flatIndex++;
          const isActive = idx === activeIndex;
          return (
            <button
              key={item.id}
              className={`${styles.item} ${isActive ? styles.active : ''}`}
              onClick={() => select(item)}
              role="option"
              aria-selected={isActive}
              onMouseEnter={() => setActiveIndex(idx)}
            >
              <span className={styles.itemIcon} aria-hidden="true">
                {item.icon}
              </span>
              <span className={styles.itemBody}>
                <span>{item.label}</span>
                {item.sub && <span className={styles.itemSub}>{item.sub}</span>}
              </span>
            </button>
          );
        })}
      </div>
    );
  };

  return createPortal(
    <div
      className={styles.overlay}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Command palette"
    >
      <div className={styles.panel} onClick={(e) => e.stopPropagation()}>
        <div className={styles.inputRow}>
          <span className={styles.searchIcon} aria-hidden="true">
            ⌕
          </span>
          <input
            ref={inputRef}
            className={styles.input}
            placeholder="Search projects, tasks and pages…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search"
            aria-autocomplete="list"
          />
          <kbd className={styles.esc}>Esc</kbd>
        </div>
        <div className={styles.list} role="listbox" aria-label="Results">
          {filtered.length === 0 && (
            <p className={styles.empty}>No results for &ldquo;{query}&rdquo;</p>
          )}
          {renderGroup('Navigate', navFiltered)}
          {renderGroup('Projects', projFiltered)}
          {renderGroup('Tasks', taskFiltered)}
          {renderGroup('Subtasks', subtaskFiltered)}
        </div>
      </div>
    </div>,
    document.body,
  );
}
