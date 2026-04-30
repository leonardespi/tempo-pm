import { useRef, useState } from 'react';
import { useStore } from '@/store';
import { BurnoutChart, type BurnoutChartHandle } from '@/components/charts/BurnoutChart';
import { exportAsPng, exportAsPdf, slugify, todayISO } from '@/utils/exportChart';
import styles from './BurnoutPage.module.css';

export default function BurnoutPage() {
  const projects = useStore((s) => s.projects);
  const tasks = useStore((s) => s.tasks);
  const subtasks = useStore((s) => s.subtasks);
  const users = useStore((s) => s.users);
  const workingDays = useStore((s) => s.workingDays);

  const [filterProjectId, setFilterProjectId] = useState('');
  const [exporting, setExporting] = useState(false);
  const chartRef = useRef<BurnoutChartHandle>(null);

  const projectName = filterProjectId
    ? (projects.find((p) => p.id === filterProjectId)?.name ?? 'all')
    : 'all';

  function filename(ext: string) {
    return `burnout-${slugify(projectName)}-${todayISO()}.${ext}`;
  }

  async function handlePng() {
    const svg = chartRef.current?.getSVGElement();
    if (!svg) return;
    setExporting(true);
    try {
      await exportAsPng(svg, filename('png'));
    } finally {
      setExporting(false);
    }
  }

  async function handlePdf() {
    const svg = chartRef.current?.getSVGElement();
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
        <h1>Burnout Risk</h1>

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
        <BurnoutChart
          ref={chartRef}
          projects={projects}
          tasks={tasks}
          subtasks={subtasks}
          users={users}
          workingDays={workingDays}
          filterProjectId={filterProjectId}
        />
      </div>
    </div>
  );
}
