import { useStore } from '@/store';
import { useTheme } from '@/hooks/useTheme';
import { Button } from '@/components/ui/Button';
import { FormField } from '@/components/ui/FormField';
import styles from './SettingsPage.module.css';

export default function SettingsPage() {
  const { theme, setTheme } = useTheme();
  const workingDays = useStore((s) => s.workingDays);
  const saveData = useStore((s) => s.saveData);
  const projects = useStore((s) => s.projects);
  const tasks = useStore((s) => s.tasks);
  const subtasks = useStore((s) => s.subtasks);
  const users = useStore((s) => s.users);
  const settings = useStore((s) => s.settings);

  const handleDownload = () => {
    const snapshot = { projects, tasks, subtasks, users, workingDays, settings };
    const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const ts = new Date().toISOString().replace(/:/g, '-').replace(/\..+/, '');
    const a = document.createElement('a');
    a.href = url;
    a.download = `tempo-backup-${ts}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const toggleWeekend = (day: number) => {
    const weekends = workingDays.weekends.includes(day)
      ? workingDays.weekends.filter((d) => d !== day)
      : [...workingDays.weekends, day].sort();
    void saveData({ workingDays: { ...workingDays, weekends } });
  };

  const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  return (
    <div className={styles.page}>
      <h1>Settings</h1>

      <section className={styles.section}>
        <h3>Theme</h3>
        <div className={styles.themeRow}>
          {(['light', 'dark', 'system'] as const).map((t) => (
            <Button
              key={t}
              variant={theme === t ? 'primary' : 'secondary'}
              onClick={() => void setTheme(t)}
            >
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </Button>
          ))}
        </div>
      </section>

      <section className={styles.section}>
        <h3>Working Days</h3>
        <FormField label="Weekend days (non-working)">
          <div className={styles.dayRow}>
            {DAY_LABELS.map((label, i) => (
              <button
                key={i}
                className={`${styles.dayBtn} ${workingDays.weekends.includes(i) ? styles.weekend : ''}`}
                onClick={() => toggleWeekend(i)}
              >
                {label}
              </button>
            ))}
          </div>
        </FormField>
      </section>

      <section className={styles.section}>
        <h3>Data File</h3>
        <p className={styles.dataPath}>
          Stored in your OS data directory under <code>tempo/data.json</code>. Backups are kept as{' '}
          <code>data.json.bak.*</code> (last 5).
        </p>
        <Button variant="secondary" onClick={handleDownload} style={{ marginTop: 12 }}>
          Download snapshot
        </Button>
      </section>
    </div>
  );
}
