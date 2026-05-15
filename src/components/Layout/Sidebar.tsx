import { NavLink, useNavigate } from 'react-router-dom';
import { useStore } from '@/store';
import { useTheme } from '@/hooks/useTheme';
import styles from './Sidebar.module.css';

const isMac = typeof navigator !== 'undefined' && /Mac/i.test(navigator.userAgent);
const SHORTCUT = isMac ? '⌘K' : 'Ctrl+K';

const NAV_ITEMS = [
  { to: '/', label: 'Projects', icon: '◈' },
  { to: '/gantt', label: 'Gantt', icon: '▤' },
  { to: '/timeline', label: 'Timeline', icon: '◷' },
  { to: '/workload', label: 'Workload', icon: '▦' },
  { to: '/burnout', label: 'Burnout Risk', icon: '◉' },
  { to: '/users', label: 'Team', icon: '◎' },
];

type Props = {
  isOpen: boolean;
  onToggle: () => void;
  onOpenSearch: () => void;
};

export function Sidebar({ isOpen, onToggle, onOpenSearch }: Props) {
  const projects = useStore((s) => s.projects);
  const { theme, setTheme } = useTheme();
  const navigate = useNavigate();

  const cycleTheme = () => {
    const next = theme === 'light' ? 'dark' : theme === 'dark' ? 'system' : 'light';
    void setTheme(next);
  };

  const themeIcon = theme === 'light' ? '☀' : theme === 'dark' ? '☾' : '◑';
  const themeLabel = `Theme: ${theme}`;

  return (
    <aside className={`${styles.sidebar} ${isOpen ? '' : styles.collapsed}`} aria-hidden={!isOpen}>
      <div className={styles.brand}>
        <h2>Tempo</h2>
        <button
          className={styles.collapseBtn}
          onClick={onToggle}
          aria-label="Collapse sidebar"
          title="Collapse sidebar"
        >
          ‹
        </button>
      </div>

      <button
        className={styles.searchBtn}
        onClick={onOpenSearch}
        aria-label={`Open command palette (${SHORTCUT})`}
        tabIndex={isOpen ? undefined : -1}
      >
        <span className={styles.searchIcon} aria-hidden="true">
          ⌕
        </span>
        <span className={styles.searchLabel}>Quick open</span>
        <kbd className={styles.searchKbd}>{SHORTCUT}</kbd>
      </button>

      <nav className={styles.nav} aria-label="Main navigation">
        {NAV_ITEMS.map(({ to, label, icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            tabIndex={isOpen ? undefined : -1}
            className={({ isActive }) => `${styles.navItem} ${isActive ? styles.active : ''}`}
          >
            <span className={styles.icon} aria-hidden="true">
              {icon}
            </span>
            {label}
          </NavLink>
        ))}
      </nav>

      {projects.length > 0 && (
        <div className={styles.projectList}>
          <span className={styles.sectionLabel}>Recent</span>
          {projects.slice(0, 5).map((p) => (
            <button
              key={p.id}
              className={styles.projectItem}
              tabIndex={isOpen ? undefined : -1}
              onClick={() => navigate(`/projects/${p.id}`)}
            >
              <span className={styles.projectDot} />
              <span className={styles.projectName}>{p.name}</span>
            </button>
          ))}
        </div>
      )}

      <div className={styles.footer}>
        <button
          className={styles.themeBtn}
          onClick={cycleTheme}
          tabIndex={isOpen ? undefined : -1}
          aria-label={themeLabel}
          title={themeLabel}
        >
          <span>{themeIcon}</span>
          <span>{theme.charAt(0).toUpperCase() + theme.slice(1)}</span>
        </button>
        <NavLink
          to="/settings"
          tabIndex={isOpen ? undefined : -1}
          className={({ isActive }) => `${styles.settingsBtn} ${isActive ? styles.active : ''}`}
        >
          Settings
        </NavLink>
      </div>
    </aside>
  );
}
