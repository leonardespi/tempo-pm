import { useRef, useState } from 'react';
import { useStore } from '@/store';
import { TimelineChart, type TimelineChartHandle } from '@/components/charts/TimelineChart';
import { exportAsPng, exportAsPdf, slugify, todayISO } from '@/utils/exportChart';
import styles from './TimelinePage.module.css';

export default function TimelinePage() {
  const projects = useStore((s) => s.projects);
  const tasks = useStore((s) => s.tasks);
  const subtasks = useStore((s) => s.subtasks);
  const users = useStore((s) => s.users);

  const [filterProjectId, setFilterProjectId] = useState('');
  const [filterAssigneeId, setFilterAssigneeId] = useState('');
  const [exporting, setExporting] = useState(false);
  const chartRef = useRef<TimelineChartHandle>(null);

  const projectName = filterProjectId
    ? (projects.find((p) => p.id === filterProjectId)?.name ?? 'all')
    : 'all';

  function filename(ext: string) {
    return `timeline-${slugify(projectName)}-${todayISO()}.${ext}`;
  }

  async function handlePng() {
    const svg = chartRef.current?.buildExportSVG();
    if (!svg) return;
    setExporting(true);
    try {
      await exportAsPng(svg, filename('png'));
    } finally {
      setExporting(false);
    }
  }

  async function handlePdf() {
    const svg = chartRef.current?.buildExportSVG();
    if (!svg) return;
    setExporting(true);
    try {
      await exportAsPdf(svg, filename('pdf'));
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1>Timeline</h1>

        <div className={styles.filters}>
          <select
            className="input"
            value={filterProjectId}
            onChange={(e) => setFilterProjectId(e.target.value)}
            aria-label="Filter by project"
          >
            <option value="">All projects</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>

          <select
            className="input"
            value={filterAssigneeId}
            onChange={(e) => setFilterAssigneeId(e.target.value)}
            aria-label="Filter by assignee"
          >
            <option value="">All assignees</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>

          <button
            className={styles.todayBtn}
            onClick={() => chartRef.current?.scrollToToday()}
            aria-label="Scroll to today"
          >
            Today
          </button>
        </div>

        <div className={styles.exportBtns}>
          <button className={styles.exportBtn} onClick={handlePng} disabled={exporting}>
            Export PNG
          </button>
          <button className={styles.exportBtn} onClick={handlePdf} disabled={exporting}>
            Export PDF
          </button>
        </div>
      </div>

      <div className={styles.chartWrap}>
        <TimelineChart
          ref={chartRef}
          projects={projects}
          tasks={tasks}
          subtasks={subtasks}
          users={users}
          filterProjectId={filterProjectId}
          filterAssigneeId={filterAssigneeId}
        />
      </div>
    </div>
  );
}
