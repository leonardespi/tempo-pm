import { useRef, useState } from 'react';
import { useStore } from '@/store';
import { WorkloadChart, type WorkloadChartHandle } from '@/components/charts/WorkloadChart';
import { exportAsPng, exportAsPdf, slugify, todayISO } from '@/utils/exportChart';
import styles from './WorkloadPage.module.css';

export default function WorkloadPage() {
  const projects = useStore((s) => s.projects);
  const tasks = useStore((s) => s.tasks);
  const subtasks = useStore((s) => s.subtasks);
  const users = useStore((s) => s.users);
  const workingDays = useStore((s) => s.workingDays);
  const view = useStore((s) => s.chartViews.workload);
  const setWorkloadView = useStore((s) => s.setWorkloadView);
  const filterProjectId = view.filterProjectId;
  const filterUserId = view.filterUserId;
  const viewMode = view.viewMode;
  const setFilterProjectId = (id: string) => setWorkloadView({ filterProjectId: id });
  const setFilterUserId = (id: string) => setWorkloadView({ filterUserId: id });
  const setViewMode = (m: 'week' | 'day') => setWorkloadView({ viewMode: m });

  const [exporting, setExporting] = useState(false);
  const chartRef = useRef<WorkloadChartHandle>(null);

  const projectName = filterProjectId
    ? (projects.find((p) => p.id === filterProjectId)?.name ?? 'all')
    : 'all';

  function filename(ext: string) {
    return `workload-${slugify(projectName)}-${todayISO()}.${ext}`;
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
    <div className={styles.page} data-tour="workload-chart">
      <div className={styles.header}>
        <h1>Workload</h1>

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
            value={filterUserId}
            onChange={(e) => setFilterUserId(e.target.value)}
            aria-label="Filter by team member"
          >
            <option value="">All members</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>

          <div className={styles.viewToggle} role="group" aria-label="View mode">
            <button
              className={`${styles.viewBtn} ${viewMode === 'week' ? styles.viewBtnActive : ''}`}
              onClick={() => setViewMode('week')}
            >
              Week
            </button>
            <button
              className={`${styles.viewBtn} ${viewMode === 'day' ? styles.viewBtnActive : ''}`}
              onClick={() => setViewMode('day')}
            >
              Day
            </button>
          </div>
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
        <WorkloadChart
          ref={chartRef}
          projects={projects}
          tasks={tasks}
          subtasks={subtasks}
          users={users}
          workingDays={workingDays}
          filterProjectId={filterProjectId}
          filterUserId={filterUserId}
          viewMode={viewMode}
        />
      </div>
    </div>
  );
}
