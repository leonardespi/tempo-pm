import { useRef, useState } from 'react';
import { useStore } from '@/store';
import { GanttChart, type GanttChartHandle } from '@/components/charts/GanttChart';
import { exportAsPng, exportAsPdf, slugify, todayISO } from '@/utils/exportChart';
import styles from './GanttPage.module.css';

export default function GanttPage() {
  const projects = useStore((s) => s.projects);
  const tasks = useStore((s) => s.tasks);
  const subtasks = useStore((s) => s.subtasks);
  const users = useStore((s) => s.users);
  const workingDays = useStore((s) => s.workingDays);
  const view = useStore((s) => s.chartViews.gantt);
  const setGanttView = useStore((s) => s.setGanttView);
  const filterProjectId = view.filterProjectId;
  const setFilterProjectId = (id: string) => setGanttView({ filterProjectId: id });

  const [exporting, setExporting] = useState(false);
  const chartRef = useRef<GanttChartHandle>(null);

  const visibleProjects = filterProjectId
    ? projects.filter((p) => p.id === filterProjectId)
    : projects;

  const visibleTasks = filterProjectId
    ? tasks.filter((t) => t.projectId === filterProjectId)
    : tasks;

  const visibleSubtasks = filterProjectId
    ? subtasks.filter((s) => visibleTasks.some((t) => t.id === s.taskId))
    : subtasks;

  const projectName = filterProjectId
    ? (projects.find((p) => p.id === filterProjectId)?.name ?? 'all')
    : 'all';

  function filename(ext: string) {
    return `gantt-${slugify(projectName)}-${todayISO()}.${ext}`;
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
    <div className={styles.page} data-tour="gantt-chart">
      <div className={styles.header}>
        <h1>Gantt</h1>
        {projects.length > 0 && (
          <select
            className="input"
            value={filterProjectId}
            onChange={(e) => setFilterProjectId(e.target.value)}
            style={{ width: 220 }}
          >
            <option value="">All projects</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        )}

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
        <GanttChart
          ref={chartRef}
          projects={visibleProjects}
          tasks={visibleTasks}
          subtasks={visibleSubtasks}
          users={users}
          workingDays={workingDays}
          zoom={view.zoom}
          onZoomChange={(z) => setGanttView({ zoom: z })}
          collapsedIds={view.collapsed}
          onCollapsedChange={(ids) => setGanttView({ collapsed: ids })}
        />
      </div>
    </div>
  );
}
