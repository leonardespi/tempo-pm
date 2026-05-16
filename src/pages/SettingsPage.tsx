import { useRef, useState } from 'react';
import { useStore } from '@/store';
import { useTheme } from '@/hooks/useTheme';
import type { AppData } from '@/types';
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

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importState, setImportState] = useState<'idle' | 'ok' | 'error'>('idle');

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

  const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  return (
    <div className={styles.page}>
      <h1 className={styles.heading}>Settings</h1>

      {/* ── Appearance ── */}
      <section className={styles.section}>
        <p className={styles.sectionTitle}>Appearance</p>

        <div className={styles.optionRow}>
          <div className={styles.optionLabel}>
            <span className={styles.optionTitle}>Theme</span>
            <span className={styles.optionHint}>Choose how Tempo looks on your device.</span>
          </div>
          <div className={styles.optionControl}>
            <div className={styles.themeRow} data-tour="theme-toggle">
              {(['light', 'dark', 'system'] as const).map((t) => (
                <button
                  key={t}
                  className={`${styles.themeOption} ${theme === t ? styles.themeOptionActive : ''}`}
                  onClick={() => void setTheme(t)}
                >
                  {t.charAt(0).toUpperCase() + t.slice(1)}
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── Schedule ── */}
      <section className={styles.section}>
        <p className={styles.sectionTitle}>Schedule</p>

        <div className={styles.optionRow}>
          <div className={styles.optionLabel}>
            <span className={styles.optionTitle}>Non-working days</span>
            <span className={styles.optionHint}>
              Days excluded from effort calculations and the burnout chart.
            </span>
          </div>
          <div className={styles.optionControl}>
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
          </div>
        </div>
      </section>

      {/* ── Burnout Chart ── */}
      <section className={styles.section}>
        <p className={styles.sectionTitle}>Burnout Chart</p>

        <div className={styles.optionRow}>
          <div className={styles.optionLabel}>
            <span className={styles.optionTitle}>Daily capacity</span>
            <span className={styles.optionHint}>
              Maximum effort points per person per day — this sets the 100% mark on the burnout
              chart.
            </span>
          </div>
          <div className={styles.optionControl}>
            <input
              type="number"
              className="input"
              min={0.5}
              step={0.5}
              value={settings.dailyCapacity}
              onChange={(e) => {
                const val = parseFloat(e.target.value);
                if (val > 0) void saveData({ settings: { ...settings, dailyCapacity: val } });
              }}
              style={{ width: 88 }}
            />
          </div>
        </div>

        <div className={styles.optionRow}>
          <div className={styles.optionLabel}>
            <span className={styles.optionTitle}>Effort distribution</span>
            <span className={styles.optionHint}>
              Controls how effort points are spread across a task's active days.
            </span>
          </div>
          <div className={styles.optionControl}>
            <div className={styles.toggleRow}>
              <label className={styles.toggleSwitch}>
                <input
                  type="checkbox"
                  checked={settings.prorateEffort}
                  onChange={(e) =>
                    void saveData({ settings: { ...settings, prorateEffort: e.target.checked } })
                  }
                />
                <span className={styles.toggleTrack} />
              </label>
              <span className={styles.toggleLabel}>
                {settings.prorateEffort ? 'Spread across duration' : 'Full weight per day'}
              </span>
              <span className={styles.tooltipWrap}>
                <span className={styles.tooltipIcon}>i</span>
                <span className={styles.tooltipBubble}>
                  <strong>OFF — Full weight per day</strong>
                  <br />
                  Each day a task is active contributes its full effort points. A 2-pt task active
                  on 3 days adds 2 pts of load every day (6 pts toward the weekly total).
                  <br />
                  <br />
                  <strong>ON — Spread across duration</strong>
                  <br />
                  Effort is divided evenly across all working days of the task. That same 2-pt task
                  over 3 days adds 0.67 pts per day (2 pts total for the week).
                </span>
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* ── Data ── */}
      <section className={styles.section}>
        <p className={styles.sectionTitle}>Data</p>

        <div className={styles.optionRow}>
          <div className={styles.optionLabel}>
            <span className={styles.optionTitle}>Data file</span>
            <span className={styles.optionHint}>
              Stored in your OS data directory under <code>tempo/data.json</code>. Backups are kept
              as <code>data.json.bak.*</code> (last 5 snapshots).
            </span>
          </div>
          <div className={styles.optionControl}>
            <button className={`${styles.themeOption} ${styles.dataBtn}`} onClick={handleDownload}>
              Download snapshot
            </button>
          </div>
        </div>

        <div className={styles.optionRow}>
          <div className={styles.optionLabel}>
            <span className={styles.optionTitle}>Import snapshot</span>
            <span className={styles.optionHint}>
              Restore data from a previously downloaded backup. This overwrites all current data.
            </span>
          </div>
          <div className={styles.optionControl}>
            <input
              ref={fileInputRef}
              type="file"
              accept=".json,application/json"
              style={{ display: 'none' }}
              onChange={handleImport}
            />
            <button
              className={`${styles.themeOption} ${styles.dataBtn} ${importState === 'ok' ? styles.importOk : importState === 'error' ? styles.importError : ''}`}
              onClick={() => fileInputRef.current?.click()}
            >
              {importState === 'ok'
                ? 'Imported ✓'
                : importState === 'error'
                  ? 'Invalid file'
                  : 'Import snapshot'}
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
