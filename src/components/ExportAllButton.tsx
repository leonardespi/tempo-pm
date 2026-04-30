import { useRef, useState } from 'react';
import { createPortal, flushSync } from 'react-dom';
import { useStore } from '@/store';
import { GanttChart, type GanttChartHandle } from '@/components/charts/GanttChart';
import { TimelineChart, type TimelineChartHandle } from '@/components/charts/TimelineChart';
import { WorkloadChart, type WorkloadChartHandle } from '@/components/charts/WorkloadChart';
import { BurnoutChart, type BurnoutChartHandle } from '@/components/charts/BurnoutChart';
import { exportAllAsPdf, slugify, todayISO } from '@/utils/exportChart';
import styles from './ExportAllButton.module.css';

type Props = {
  projectId: string;
  projectName: string;
};

export function ExportAllButton({ projectId, projectName }: Props) {
  const [exporting, setExporting] = useState(false);
  const [renderHidden, setRenderHidden] = useState(false);

  const allTasks = useStore((s) => s.tasks);
  const allSubtasks = useStore((s) => s.subtasks);
  const allProjects = useStore((s) => s.projects);
  const users = useStore((s) => s.users);
  const workingDays = useStore((s) => s.workingDays);

  const ganttRef = useRef<GanttChartHandle>(null);
  const timelineRef = useRef<TimelineChartHandle>(null);
  const workloadRef = useRef<WorkloadChartHandle>(null);
  const burnoutRef = useRef<BurnoutChartHandle>(null);

  // Data scoped to this project
  const project = allProjects.filter((p) => p.id === projectId);
  const tasks = allTasks.filter((t) => t.projectId === projectId);
  const subtasks = allSubtasks.filter((s) => tasks.some((t) => t.id === s.taskId));

  async function handleExport() {
    setExporting(true);

    // Render hidden charts synchronously so refs are populated
    flushSync(() => setRenderHidden(true));

    // One animation frame for layout
    await new Promise<void>((r) => requestAnimationFrame(() => r()));

    try {
      const pages: Array<{ title: string; svgEl: SVGSVGElement }> = [];

      const ganttSvg = ganttRef.current?.buildExportSVG();
      if (ganttSvg) pages.push({ title: 'Gantt Chart', svgEl: ganttSvg });

      const timelineSvg = timelineRef.current?.buildExportSVG();
      if (timelineSvg) pages.push({ title: 'Timeline', svgEl: timelineSvg });

      const workloadSvg = workloadRef.current?.getSVGElement();
      if (workloadSvg) pages.push({ title: 'Workload', svgEl: workloadSvg });

      const burnoutSvg = burnoutRef.current?.getSVGElement();
      if (burnoutSvg) pages.push({ title: 'Burnout Risk', svgEl: burnoutSvg });

      if (pages.length > 0) {
        await exportAllAsPdf(pages, `${slugify(projectName)}-${todayISO()}.pdf`);
      }
    } finally {
      flushSync(() => setRenderHidden(false));
      setExporting(false);
    }
  }

  return (
    <>
      <button className={styles.btn} onClick={handleExport} disabled={exporting}>
        {exporting ? 'Exporting…' : 'Export all PDF'}
      </button>

      {renderHidden &&
        createPortal(
          <div
            aria-hidden="true"
            style={{
              position: 'fixed',
              top: -9999,
              left: -9999,
              width: 1200,
              pointerEvents: 'none',
            }}
          >
            <GanttChart
              ref={ganttRef}
              projects={project}
              tasks={tasks}
              subtasks={subtasks}
              users={users}
              workingDays={workingDays}
            />
            <TimelineChart
              ref={timelineRef}
              projects={project}
              tasks={tasks}
              subtasks={subtasks}
              users={users}
              filterProjectId={projectId}
              filterAssigneeId=""
            />
            <WorkloadChart
              ref={workloadRef}
              projects={project}
              tasks={tasks}
              subtasks={subtasks}
              users={users}
              workingDays={workingDays}
              filterProjectId={projectId}
            />
            <BurnoutChart
              ref={burnoutRef}
              projects={project}
              tasks={tasks}
              subtasks={subtasks}
              users={users}
              workingDays={workingDays}
              filterProjectId={projectId}
            />
          </div>,
          document.body,
        )}
    </>
  );
}
