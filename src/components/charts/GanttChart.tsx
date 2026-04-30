import {
  useRef,
  useState,
  useMemo,
  useCallback,
  forwardRef,
  useImperativeHandle,
  type MouseEvent as RMouseEvent,
} from 'react';
import type { Project, Task, Subtask, User, WorkingDaysConfig } from '@/types';
import { toISO, isWorkingDay } from '@/utils/workingDays';
import { derivedTaskDates } from '@/utils/derive';
import { hasScheduleConflict } from '@/utils/cycles';
import { buildCSSVarMap, prepareExportSVG, makeSVGEl } from '@/utils/exportChart';
import styles from './GanttChart.module.css';

export interface GanttChartHandle {
  buildExportSVG(): SVGSVGElement | null;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const ROW_H = 36;
const PROJECT_H = 44;
const AXIS_H = 54; // two-row time header
const BAR_VPAD = 7;
const BAR_R = 3;

const ZOOM_PX = { day: 40, week: 14, month: 5 } as const;
type Zoom = keyof typeof ZOOM_PX;

// ─── Types ────────────────────────────────────────────────────────────────────

type GanttBar = { x: number; w: number; color: string };

type RowData = {
  id: string;
  kind: 'project' | 'task' | 'subtask';
  label: string;
  y: number;
  h: number;
  bar: GanttBar | null;
  startDate?: string;
  endDate?: string;
  assigneeName?: string;
  effortPoints?: number;
  status?: string;
  taskId?: string; // for subtask rows
};

type ArrowData = {
  d: string;
  isConflict: boolean;
};

type TooltipState = {
  name: string;
  assigneeName?: string;
  startDate?: string;
  endDate?: string;
  effortPoints?: number;
  status?: string;
  x: number;
  y: number;
};

// ─── Pure helpers ─────────────────────────────────────────────────────────────

function addCalDays(dateStr: string, n: number): string {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return toISO(d);
}

function calDaysBetween(a: string, b: string): number {
  return (new Date(b + 'T00:00:00').getTime() - new Date(a + 'T00:00:00').getTime()) / 86_400_000;
}

function iterateDays(start: string, end: string): string[] {
  const days: string[] = [];
  let cur = start;
  while (cur <= end) {
    days.push(cur);
    cur = addCalDays(cur, 1);
  }
  return days;
}

function makeTimeAxis(
  chartStart: string,
  chartEnd: string,
  zoom: Zoom,
  pixelsPerDay: number,
  weekends: number[],
): {
  major: { x: number; label: string }[];
  minor: { x: number; label: string; isWeekend: boolean }[];
} {
  const major: { x: number; label: string }[] = [];
  const minor: { x: number; label: string; isWeekend: boolean }[] = [];

  const days = iterateDays(chartStart, chartEnd);
  let prevMonth = '';
  let prevYear = '';

  for (const day of days) {
    const d = new Date(day + 'T00:00:00');
    const month = d.toLocaleString('en-US', { month: 'short' });
    const year = String(d.getFullYear());
    const dayNum = d.getDate();
    const dow = d.getDay();
    const isWeekend = weekends.includes(dow);
    const x = calDaysBetween(chartStart, day) * pixelsPerDay;

    const monthKey = `${month}${year}`;

    if (zoom === 'day') {
      if (monthKey !== `${prevMonth}${prevYear}`) {
        major.push({ x, label: `${month} ${year}` });
        prevMonth = month;
        prevYear = year;
      }
      minor.push({ x, label: String(dayNum), isWeekend });
    } else if (zoom === 'week') {
      if (monthKey !== `${prevMonth}${prevYear}`) {
        major.push({ x, label: `${month} ${year}` });
        prevMonth = month;
        prevYear = year;
      }
      if (dow === 1) {
        // Monday
        minor.push({ x, label: `${month} ${dayNum}`, isWeekend: false });
      }
    } else {
      // month zoom
      if (year !== prevYear) {
        major.push({ x, label: year });
        prevYear = year;
      }
      if (dayNum === 1) {
        minor.push({ x, label: month, isWeekend: false });
      }
    }
  }

  return { major, minor };
}

function formatDateShort(s?: string): string {
  if (!s) return '—';
  const d = new Date(s + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// ─── Component ────────────────────────────────────────────────────────────────

type Props = {
  projects: Project[];
  tasks: Task[];
  subtasks: Subtask[];
  users: User[];
  workingDays: WorkingDaysConfig;
};

export const GanttChart = forwardRef<GanttChartHandle, Props>(function GanttChart(
  { projects, tasks, subtasks, users, workingDays },
  ref,
) {
  const [zoom, setZoom] = useState<Zoom>('week');
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);

  const chartRef = useRef<HTMLDivElement>(null);
  const labelsRef = useRef<HTMLDivElement>(null);
  const axisSvgRef = useRef<SVGSVGElement>(null);
  const barsSvgRef = useRef<SVGSVGElement>(null);
  const isPanning = useRef(false);
  const panAnchorX = useRef(0);
  const panScrollOrigin = useRef(0);

  const pixelsPerDay = ZOOM_PX[zoom];
  const userMap = useMemo(() => new Map(users.map((u) => [u.id, u])), [users]);

  // ── Date range ──────────────────────────────────────────────────────────────
  const { chartStart, chartEnd } = useMemo(() => {
    const all: string[] = [];
    for (const p of projects) all.push(p.startDate, p.endDate);
    for (const t of tasks) {
      if (t.startDate) all.push(t.startDate);
      if (t.endDate) all.push(t.endDate);
    }
    for (const s of subtasks) all.push(s.startDate, s.endDate);

    if (all.length === 0) {
      const today = toISO(new Date());
      return { chartStart: addCalDays(today, -28), chartEnd: addCalDays(today, 90) };
    }
    const min = all.reduce((a, b) => (a < b ? a : b));
    const max = all.reduce((a, b) => (a > b ? a : b));
    return { chartStart: addCalDays(min, -14), chartEnd: addCalDays(max, 28) };
  }, [projects, tasks, subtasks]);

  const totalDays = Math.ceil(calDaysBetween(chartStart, chartEnd)) + 1;
  const totalWidth = totalDays * pixelsPerDay;

  const dateToX = useCallback(
    (dateStr: string) => calDaysBetween(chartStart, dateStr) * pixelsPerDay,
    [chartStart, pixelsPerDay],
  );

  function makeBar(
    startDate: string | undefined,
    endDate: string | undefined,
    color: string,
  ): GanttBar | null {
    if (!startDate || !endDate) return null;
    const x = dateToX(startDate);
    const endX = dateToX(endDate) + pixelsPerDay; // bars are end-inclusive
    return { x, w: Math.max(endX - x, 4), color };
  }

  // ── Rows ────────────────────────────────────────────────────────────────────
  const rows = useMemo<RowData[]>(() => {
    const result: RowData[] = [];
    let y = 0;

    for (const project of projects) {
      const projBar = makeBar(project.startDate, project.endDate, 'var(--color-accent)');
      result.push({
        id: project.id,
        kind: 'project',
        label: project.name,
        y,
        h: PROJECT_H,
        bar: projBar,
        startDate: project.startDate,
        endDate: project.endDate,
      });
      y += PROJECT_H;

      if (collapsed.has(project.id)) continue;

      const projTasks = tasks.filter((t) => t.projectId === project.id);
      for (const task of projTasks) {
        const derived = derivedTaskDates(task, subtasks);
        const assignee = task.assigneeId ? userMap.get(task.assigneeId) : undefined;
        const taskBar = makeBar(
          derived.startDate,
          derived.endDate,
          assignee?.color ?? 'var(--color-accent)',
        );

        result.push({
          id: task.id,
          kind: 'task',
          label: task.name,
          y,
          h: ROW_H,
          bar: taskBar,
          startDate: derived.startDate,
          endDate: derived.endDate,
          assigneeName: assignee?.name,
          taskId: task.id,
        });
        y += ROW_H;

        if (collapsed.has(task.id)) continue;

        const taskSubs = subtasks.filter((s) => s.taskId === task.id);
        for (const sub of taskSubs) {
          const subAssignee = sub.assigneeId ? userMap.get(sub.assigneeId) : undefined;
          const subBar = makeBar(
            sub.startDate,
            sub.endDate,
            subAssignee?.color ?? 'var(--color-accent)',
          );
          if (!subBar) continue;

          result.push({
            id: sub.id,
            kind: 'subtask',
            label: sub.name,
            y,
            h: ROW_H,
            bar: subBar,
            startDate: sub.startDate,
            endDate: sub.endDate,
            assigneeName: subAssignee?.name,
            effortPoints: sub.effortPoints,
            status: sub.status,
            taskId: task.id,
          });
          y += ROW_H;
        }
      }
    }

    return result;
    // dateToX intentionally omitted: it's a stable function based on chartStart+pixelsPerDay
    // which ARE in the dependency array via collapsed/tasks/subtasks/projects depending on them
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projects, tasks, subtasks, collapsed, userMap, chartStart, pixelsPerDay]);

  const totalHeight = rows.reduce((acc, r) => acc + r.h, 0);

  // ── Task bar map (for arrows) ────────────────────────────────────────────────
  const taskBarMap = useMemo(() => {
    const m = new Map<string, { rightX: number; leftX: number; midY: number }>();
    for (const row of rows) {
      if (row.kind === 'task' && row.bar && row.taskId) {
        m.set(row.taskId, {
          leftX: row.bar.x,
          rightX: row.bar.x + row.bar.w,
          midY: row.y + ROW_H / 2,
        });
      }
    }
    return m;
  }, [rows]);

  // ── Dependency arrows ────────────────────────────────────────────────────────
  const arrows = useMemo<ArrowData[]>(() => {
    const result: ArrowData[] = [];
    for (const task of tasks) {
      if (!task.dependsOn.length) continue;
      const target = taskBarMap.get(task.id);
      if (!target) continue;

      const isConflict = hasScheduleConflict(task, tasks);

      for (const depId of task.dependsOn) {
        const source = taskBarMap.get(depId);
        if (!source) continue;

        const sx = source.rightX;
        const sy = source.midY;
        const tx = target.leftX;
        const ty = target.midY;

        // S-curve cubic bezier
        const hDist = Math.max(Math.abs(tx - sx), 80);
        const cp1x = sx + hDist * 0.45;
        const cp2x = tx - hDist * 0.45;
        const d = `M ${sx} ${sy} C ${cp1x} ${sy} ${cp2x} ${ty} ${tx} ${ty}`;

        result.push({ d, isConflict });
      }
    }
    return result;
  }, [tasks, taskBarMap]);

  // ── Shaded non-working days ──────────────────────────────────────────────────
  const shadedDays = useMemo<{ day: string; isHoliday: boolean }[]>(() => {
    return iterateDays(chartStart, chartEnd)
      .filter((d) => !isWorkingDay(d, workingDays))
      .map((d) => ({ day: d, isHoliday: workingDays.holidays.includes(d) }));
  }, [chartStart, chartEnd, workingDays]);

  // ── Time axis ticks ──────────────────────────────────────────────────────────
  const { major: majorTicks, minor: minorTicks } = useMemo(
    () => makeTimeAxis(chartStart, chartEnd, zoom, pixelsPerDay, workingDays.weekends),
    [chartStart, chartEnd, zoom, pixelsPerDay, workingDays.weekends],
  );

  // ── Today ────────────────────────────────────────────────────────────────────
  const todayX = dateToX(toISO(new Date()));

  // ── Export ───────────────────────────────────────────────────────────────────
  useImperativeHandle(
    ref,
    () => ({
      buildExportSVG() {
        if (!axisSvgRef.current || !barsSvgRef.current) return null;

        const LABEL_W = 240;
        const vars = buildCSSVarMap();
        const c = {
          bg: vars['--color-bg'] || '#F5F0EA',
          bgCard: vars['--color-bg-card'] || '#EDE8E1',
          text: vars['--color-text'] || '#3D3530',
          textMuted: vars['--color-text-muted'] || '#8C7B70',
          border: vars['--color-border'] || '#D5CFC8',
        };

        const exportW = LABEL_W + totalWidth;
        const exportH = AXIS_H + Math.max(totalHeight, 1);

        const svg = makeSVGEl('svg', {
          xmlns: 'http://www.w3.org/2000/svg',
          width: exportW,
          height: exportH,
        }) as SVGSVGElement;

        // Label column background
        svg.appendChild(
          makeSVGEl('rect', { x: 0, y: 0, width: LABEL_W, height: exportH, fill: c.bgCard }),
        );

        // Header cell
        svg.appendChild(
          makeSVGEl('rect', { x: 0, y: 0, width: LABEL_W, height: AXIS_H, fill: c.bgCard }),
        );
        svg.appendChild(
          makeSVGEl('line', {
            x1: 0,
            y1: AXIS_H - 0.5,
            x2: LABEL_W,
            y2: AXIS_H - 0.5,
            stroke: c.border,
            'stroke-width': 1,
          }),
        );
        const hdrText = makeSVGEl('text', {
          x: 14,
          y: AXIS_H / 2 + 5,
          fill: c.textMuted,
          'font-size': 11,
          'font-family': 'Helvetica, Arial, sans-serif',
          'font-weight': 700,
        });
        hdrText.textContent = 'Tasks';
        svg.appendChild(hdrText);

        // Column border
        svg.appendChild(
          makeSVGEl('line', {
            x1: LABEL_W,
            y1: 0,
            x2: LABEL_W,
            y2: exportH,
            stroke: c.border,
            'stroke-width': 1,
          }),
        );

        // Row labels
        for (const row of rows) {
          const indent = row.kind === 'subtask' ? 36 : row.kind === 'task' ? 22 : 10;
          const fontSize = row.kind === 'project' ? 13 : 12;
          const fontWeight = row.kind === 'project' ? 700 : row.kind === 'task' ? 600 : 400;
          const maxChars = row.kind === 'subtask' ? 24 : 26;
          const label =
            row.label.length > maxChars ? row.label.slice(0, maxChars) + '…' : row.label;

          const t = makeSVGEl('text', {
            x: indent,
            y: AXIS_H + row.y + row.h / 2 + 4,
            fill: c.text,
            'font-size': fontSize,
            'font-family': 'Helvetica, Arial, sans-serif',
            'font-weight': fontWeight,
          });
          t.textContent = label;
          svg.appendChild(t);

          svg.appendChild(
            makeSVGEl('line', {
              x1: 0,
              y1: AXIS_H + row.y + row.h - 0.5,
              x2: LABEL_W,
              y2: AXIS_H + row.y + row.h - 0.5,
              stroke: c.border,
              'stroke-width': 0.5,
            }),
          );
        }

        // Axis SVG → translated group at (LABEL_W, 0)
        const axisGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        axisGroup.setAttribute('transform', `translate(${LABEL_W}, 0)`);
        const prepAxis = prepareExportSVG(axisSvgRef.current);
        for (const child of Array.from(prepAxis.childNodes)) {
          axisGroup.appendChild(child.cloneNode(true));
        }
        svg.appendChild(axisGroup);

        // Bars SVG → translated group at (LABEL_W, AXIS_H)
        const barsGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        barsGroup.setAttribute('transform', `translate(${LABEL_W}, ${AXIS_H})`);
        const prepBars = prepareExportSVG(barsSvgRef.current);
        for (const child of Array.from(prepBars.childNodes)) {
          barsGroup.appendChild(child.cloneNode(true));
        }
        svg.appendChild(barsGroup);

        return svg;
      },
    }),
    [rows, totalWidth, totalHeight],
  );

  // ── Scroll sync ──────────────────────────────────────────────────────────────
  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    if (labelsRef.current) labelsRef.current.scrollTop = e.currentTarget.scrollTop;
  }, []);

  // ── Pan drag ─────────────────────────────────────────────────────────────────
  const handleMouseDown = useCallback((e: RMouseEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    isPanning.current = true;
    panAnchorX.current = e.clientX;
    panScrollOrigin.current = chartRef.current?.scrollLeft ?? 0;
  }, []);

  const handleMouseMove = useCallback((e: RMouseEvent<HTMLDivElement>) => {
    if (!isPanning.current || !chartRef.current) return;
    chartRef.current.scrollLeft = panScrollOrigin.current - (e.clientX - panAnchorX.current);
  }, []);

  const handlePanEnd = useCallback(() => {
    isPanning.current = false;
  }, []);

  // ── Collapse toggle ──────────────────────────────────────────────────────────
  const toggleCollapse = useCallback((id: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  // ── Tooltip from bar hover ────────────────────────────────────────────────────
  const handleBarEnter = useCallback((row: RowData, e: RMouseEvent<SVGRectElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const containerRect = chartRef.current?.getBoundingClientRect();
    if (!containerRect) return;
    setTooltip({
      name: row.label,
      assigneeName: row.assigneeName,
      startDate: row.startDate,
      endDate: row.endDate,
      effortPoints: row.kind === 'subtask' ? row.effortPoints : undefined,
      status: row.kind === 'subtask' ? row.status : undefined,
      x: rect.left - containerRect.left + rect.width / 2,
      y: rect.top - containerRect.top - 8,
    });
  }, []);

  // ── Empty state ──────────────────────────────────────────────────────────────
  if (projects.length === 0) {
    return (
      <div className={styles.emptyState}>
        <p>No projects yet.</p>
        <p className={styles.emptyHint}>Create a project and add tasks to see the Gantt chart.</p>
      </div>
    );
  }

  const hasTasks = tasks.length > 0;

  return (
    <div className={styles.ganttWrap} data-testid="gantt-chart">
      {/* ── Toolbar ── */}
      <div className={styles.toolbar}>
        <div className={styles.zoomGroup}>
          {(['day', 'week', 'month'] as Zoom[]).map((z) => (
            <button
              key={z}
              className={`${styles.zoomBtn} ${zoom === z ? styles.zoomActive : ''}`}
              onClick={() => setZoom(z)}
            >
              {z.charAt(0).toUpperCase() + z.slice(1)}
            </button>
          ))}
        </div>
        <span className={styles.hint}>Drag to pan · Hover bars for details</span>
      </div>

      <div className={styles.ganttBody}>
        {/* ── Row label panel (left, fixed width, syncs vertical scroll) ── */}
        <div className={styles.labelPanel} ref={labelsRef}>
          {/* Spacer matching AXIS_H */}
          <div
            style={{
              height: AXIS_H,
              minHeight: AXIS_H,
              background: 'var(--color-bg-card)',
              borderBottom: '1px solid var(--color-border)',
            }}
          >
            <div className={styles.labelCorner}>Tasks</div>
          </div>

          {rows.map((row) => {
            const isCollapsible = row.kind === 'project' || row.kind === 'task';
            const isCollapsed = collapsed.has(row.id);
            return (
              <div
                key={row.id}
                className={`${styles.labelRow} ${styles[`lkind_${row.kind}`]}`}
                style={{ height: row.h, minHeight: row.h }}
                onClick={isCollapsible ? () => toggleCollapse(row.id) : undefined}
                role={isCollapsible ? 'button' : undefined}
                tabIndex={isCollapsible ? 0 : undefined}
                onKeyDown={
                  isCollapsible ? (e) => e.key === 'Enter' && toggleCollapse(row.id) : undefined
                }
              >
                {isCollapsible && (
                  <span className={styles.chevron} aria-hidden="true">
                    {isCollapsed ? '▶' : '▼'}
                  </span>
                )}
                <span className={styles.labelText} title={row.label}>
                  {row.label}
                </span>
              </div>
            );
          })}

          {!hasTasks && (
            <div className={styles.noTasksHint}>Add tasks to projects to see them here.</div>
          )}
        </div>

        {/* ── Chart area (horizontally + vertically scrollable) ── */}
        <div
          className={styles.chartArea}
          ref={chartRef}
          onScroll={handleScroll}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handlePanEnd}
          onMouseLeave={handlePanEnd}
          style={{ cursor: isPanning.current ? 'grabbing' : 'grab' }}
        >
          {/* Time axis — sticky at the top */}
          <svg
            ref={axisSvgRef}
            width={totalWidth}
            height={AXIS_H}
            className={styles.timeAxis}
            aria-hidden="true"
          >
            <rect width={totalWidth} height={AXIS_H} fill="var(--color-bg-card)" />
            <line
              x1={0}
              y1={AXIS_H - 0.5}
              x2={totalWidth}
              y2={AXIS_H - 0.5}
              stroke="var(--color-border)"
            />

            {/* Major labels (month/year) */}
            {majorTicks.map((tick, i) => (
              <g key={i}>
                <line
                  x1={tick.x}
                  y1={0}
                  x2={tick.x}
                  y2={AXIS_H * 0.45}
                  stroke="var(--color-border)"
                  strokeWidth={1}
                />
                <text x={tick.x + 4} y={15} className={styles.axisLabelMaj}>
                  {tick.label}
                </text>
              </g>
            ))}

            {/* Minor labels (day/week/month) */}
            {minorTicks.map((tick, i) => (
              <g key={i}>
                <line
                  x1={tick.x}
                  y1={AXIS_H * 0.45}
                  x2={tick.x}
                  y2={AXIS_H}
                  stroke="var(--color-border)"
                  strokeWidth={1}
                />
                <text
                  x={tick.x + 3}
                  y={AXIS_H - 6}
                  className={`${styles.axisLabelMin} ${tick.isWeekend ? styles.axisWeekend : ''}`}
                >
                  {tick.label}
                </text>
              </g>
            ))}

            {/* Today marker in axis */}
            {todayX >= 0 && todayX <= totalWidth && (
              <rect x={todayX - 1} y={0} width={2} height={AXIS_H} fill="#c0392b" opacity={0.7} />
            )}
          </svg>

          {/* Chart body SVG */}
          <div style={{ position: 'relative' }}>
            <svg
              ref={barsSvgRef}
              width={totalWidth}
              height={Math.max(totalHeight, 1)}
              style={{ display: 'block' }}
              onMouseLeave={() => setTooltip(null)}
              aria-label="Gantt chart"
              data-testid="gantt-svg"
            >
              <defs>
                <marker
                  id="gantt-arrow-ok"
                  markerWidth="7"
                  markerHeight="7"
                  refX="6"
                  refY="3.5"
                  orient="auto"
                >
                  <path d="M0,1 L6,3.5 L0,6 Z" fill="var(--color-accent)" opacity="0.7" />
                </marker>
                <marker
                  id="gantt-arrow-bad"
                  markerWidth="7"
                  markerHeight="7"
                  refX="6"
                  refY="3.5"
                  orient="auto"
                >
                  <path d="M0,1 L6,3.5 L0,6 Z" fill="#c0392b" />
                </marker>
              </defs>

              {/* Alternating row backgrounds */}
              {rows.map((row, i) => (
                <rect
                  key={`bg-${row.id}`}
                  x={0}
                  y={row.y}
                  width={totalWidth}
                  height={row.h}
                  fill={i % 2 === 0 ? 'var(--color-bg)' : 'var(--color-bg-card)'}
                />
              ))}

              {/* Weekend + holiday shading */}
              {shadedDays.map(({ day, isHoliday }) => (
                <rect
                  key={day}
                  x={calDaysBetween(chartStart, day) * pixelsPerDay}
                  y={0}
                  width={pixelsPerDay}
                  height={totalHeight}
                  fill={isHoliday ? 'rgba(193,125,82,0.10)' : 'rgba(0,0,0,0.035)'}
                />
              ))}

              {/* Row dividers */}
              {rows.map((row) => (
                <line
                  key={`div-${row.id}`}
                  x1={0}
                  y1={row.y + row.h - 0.5}
                  x2={totalWidth}
                  y2={row.y + row.h - 0.5}
                  stroke="var(--color-border)"
                  strokeWidth={0.5}
                />
              ))}

              {/* Dependency arrows (behind bars) */}
              {arrows.map((arrow, i) => (
                <path
                  key={i}
                  d={arrow.d}
                  fill="none"
                  stroke={arrow.isConflict ? '#c0392b' : 'var(--color-accent)'}
                  strokeWidth={1.5}
                  strokeOpacity={arrow.isConflict ? 0.9 : 0.55}
                  markerEnd={arrow.isConflict ? 'url(#gantt-arrow-bad)' : 'url(#gantt-arrow-ok)'}
                />
              ))}

              {/* Bars */}
              {rows.map((row) => {
                if (!row.bar) return null;
                const barY = row.y + BAR_VPAD;
                const barH = row.h - BAR_VPAD * 2;
                const opacity = row.kind === 'project' ? 0.3 : 0.85;

                return (
                  <rect
                    key={`bar-${row.id}`}
                    x={row.bar.x}
                    y={barY}
                    width={row.bar.w}
                    height={barH}
                    rx={BAR_R}
                    ry={BAR_R}
                    fill={row.bar.color}
                    opacity={opacity}
                    className={styles.bar}
                    onMouseEnter={(e) => handleBarEnter(row, e)}
                    onMouseLeave={() => setTooltip(null)}
                  />
                );
              })}

              {/* Today line */}
              {todayX >= 0 && todayX <= totalWidth && (
                <>
                  <line
                    x1={todayX}
                    y1={0}
                    x2={todayX}
                    y2={totalHeight}
                    stroke="#c0392b"
                    strokeWidth={1.5}
                    strokeDasharray="4 3"
                  />
                  <text x={todayX + 3} y={11} className={styles.todayLabel}>
                    Today
                  </text>
                </>
              )}
            </svg>

            {/* Tooltip */}
            {tooltip && (
              <div
                className={styles.tooltip}
                style={{ left: tooltip.x, top: tooltip.y, transform: 'translate(-50%, -100%)' }}
                role="tooltip"
              >
                <div className={styles.tooltipName}>{tooltip.name}</div>
                {tooltip.assigneeName && (
                  <div className={styles.tooltipRow}>
                    <span className={styles.tooltipLabel}>Assignee</span>
                    <span>{tooltip.assigneeName}</span>
                  </div>
                )}
                {tooltip.startDate && (
                  <div className={styles.tooltipRow}>
                    <span className={styles.tooltipLabel}>Dates</span>
                    <span>
                      {formatDateShort(tooltip.startDate)} → {formatDateShort(tooltip.endDate)}
                    </span>
                  </div>
                )}
                {tooltip.effortPoints !== undefined && (
                  <div className={styles.tooltipRow}>
                    <span className={styles.tooltipLabel}>Effort</span>
                    <span className={styles.mono}>{tooltip.effortPoints} pts</span>
                  </div>
                )}
                {tooltip.status && (
                  <div className={styles.tooltipRow}>
                    <span className={styles.tooltipLabel}>Status</span>
                    <span>{tooltip.status.replace(/_/g, ' ')}</span>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
});
