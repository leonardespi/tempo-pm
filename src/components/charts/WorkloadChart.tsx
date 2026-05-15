import {
  useMemo,
  useState,
  useRef,
  useEffect,
  useCallback,
  forwardRef,
  useImperativeHandle,
  type MouseEvent,
} from 'react';
import { useDragScroll } from '@/hooks/useDragScroll';
import type { Project, Task, Subtask, User, WorkingDaysConfig } from '@/types';
import {
  getISOWeekStart,
  enumerateWeeks,
  toISO,
  isWorkingDay,
  workingDaysBetween,
} from '@/utils/workingDays';
import { prorateEffort } from '@/utils/burnout';
import styles from './WorkloadChart.module.css';

export interface WorkloadChartHandle {
  getSVGElement(): SVGSVGElement | null;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const BAR_W = 32; // multi-user weekly bar width
const BAR_W_DAY = 28; // multi-user daily bar width
const BAR_W_FOCUSED = 80; // single-user focused bar width (any mode)
const BAR_GAP = 6; // gap between bars in the same group (multi-user)
const BAR_GAP_DAY = 4; // smaller gap for day-mode multi-user
const WEEK_GAP = 20; // gap between week groups
const DAY_GAP = 8; // gap between day groups
const CHART_H = 320;
const AXIS_B = 36;
const AXIS_L = 48;
const TOP_PAD = 16;

// ─── Types ────────────────────────────────────────────────────────────────────

type WeekSegment = {
  userId: string;
  subtaskId: string;
  subtaskName: string;
  taskName: string;
  projectName: string;
  effort: number;
};

type Column = {
  bucketKey: string;
  label: string;
  userBars: {
    userId: string;
    segments: WeekSegment[];
    totalEffort: number;
  }[];
};

type TooltipState = {
  bucketLabel: string;
  userName: string;
  userColor: string;
  totalEffort: number;
  segments: WeekSegment[];
  barLeft: number; // viewport left edge of the hovered bar
  barRight: number; // viewport right edge of the hovered bar
  y: number;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function enumerateDays(startDateStr: string, endDateStr: string): string[] {
  const days: string[] = [];
  const d = new Date(startDateStr + 'T00:00:00');
  const end = new Date(endDateStr + 'T00:00:00');
  while (d <= end) {
    days.push(toISO(d));
    d.setDate(d.getDate() + 1);
  }
  return days;
}

// ─── Build chart data ─────────────────────────────────────────────────────────

function buildWorkloadData(
  projects: Project[],
  tasks: Task[],
  subtasks: Subtask[],
  users: User[],
  workingDays: WorkingDaysConfig,
  filterProjectId: string,
  filterUserId: string,
  viewMode: 'week' | 'day',
): { columns: Column[]; maxEffort: number } {
  const displayedUsers = filterUserId ? users.filter((u) => u.id === filterUserId) : users;

  if (displayedUsers.length === 0 || subtasks.length === 0) {
    return { columns: [], maxEffort: 0 };
  }

  const projectMap = new Map(projects.map((p) => [p.id, p]));
  const taskMap = new Map(tasks.map((t) => [t.id, t]));

  const filtered = subtasks.filter((s) => {
    const task = taskMap.get(s.taskId);
    if (!task) return false;
    if (filterProjectId && task.projectId !== filterProjectId) return false;
    if (filterUserId && s.assigneeId !== filterUserId) return false;
    return !!s.assigneeId;
  });

  if (filtered.length === 0) return { columns: [], maxEffort: 0 };

  const allDates = filtered.flatMap((s) => [s.startDate, s.endDate]);
  const rangeStart = allDates.reduce((a, b) => (a < b ? a : b));
  const rangeEnd = allDates.reduce((a, b) => (a > b ? a : b));

  let maxEffort = 0;

  if (viewMode === 'week') {
    const weeks = enumerateWeeks(getISOWeekStart(rangeStart), rangeEnd);

    const columns: Column[] = weeks.map((weekStart) => {
      const d = new Date(weekStart + 'T00:00:00');
      const month = d.toLocaleString('en-US', { month: 'short' });
      const label = `${month} ${d.getDate()}`;

      const userBars = displayedUsers.map((user) => {
        const segments: WeekSegment[] = [];
        for (const sub of filtered) {
          if (sub.assigneeId !== user.id) continue;
          const effort = prorateEffort(sub, weekStart, workingDays);
          if (effort <= 0) continue;
          const task = taskMap.get(sub.taskId);
          const project = task ? projectMap.get(task.projectId) : undefined;
          segments.push({
            userId: user.id,
            subtaskId: sub.id,
            subtaskName: sub.name,
            taskName: task?.name ?? '—',
            projectName: project?.name ?? '—',
            effort,
          });
        }
        const totalEffort = segments.reduce((acc, s) => acc + s.effort, 0);
        if (totalEffort > maxEffort) maxEffort = totalEffort;
        return { userId: user.id, segments, totalEffort };
      });

      return { bucketKey: weekStart, label, userBars };
    });

    return { columns, maxEffort };
  } else {
    // Day mode — only working days
    const days = enumerateDays(rangeStart, rangeEnd).filter((d) => isWorkingDay(d, workingDays));

    const columns: Column[] = days.map((date) => {
      const d = new Date(date + 'T00:00:00');
      const dayName = d.toLocaleString('en-US', { weekday: 'short' });
      const label = `${dayName} ${String(d.getDate()).padStart(2, '0')}`;

      const userBars = displayedUsers.map((user) => {
        const segments: WeekSegment[] = [];
        for (const sub of filtered) {
          if (sub.assigneeId !== user.id) continue;
          if (date < sub.startDate || date > sub.endDate) continue;
          const totalDays = workingDaysBetween(sub.startDate, sub.endDate, workingDays);
          const effort = totalDays > 0 ? sub.effortPoints / totalDays : sub.effortPoints;
          if (effort <= 0) continue;
          const task = taskMap.get(sub.taskId);
          const project = task ? projectMap.get(task.projectId) : undefined;
          segments.push({
            userId: user.id,
            subtaskId: sub.id,
            subtaskName: sub.name,
            taskName: task?.name ?? '—',
            projectName: project?.name ?? '—',
            effort,
          });
        }
        const totalEffort = segments.reduce((acc, s) => acc + s.effort, 0);
        if (totalEffort > maxEffort) maxEffort = totalEffort;
        return { userId: user.id, segments, totalEffort };
      });

      return { bucketKey: date, label, userBars };
    });

    return { columns, maxEffort };
  }
}

// ─── Y-axis helpers ───────────────────────────────────────────────────────────

function niceMax(rawMax: number): number {
  if (rawMax <= 0) return 10;
  const magnitude = Math.pow(10, Math.floor(Math.log10(rawMax)));
  return Math.ceil(rawMax / magnitude) * magnitude;
}

function yTicks(max: number): number[] {
  const step = max <= 5 ? 1 : max <= 20 ? 5 : 10;
  const ticks: number[] = [];
  for (let v = 0; v <= max; v += step) ticks.push(v);
  return ticks;
}

// ─── Component ────────────────────────────────────────────────────────────────

type Props = {
  projects: Project[];
  tasks: Task[];
  subtasks: Subtask[];
  users: User[];
  workingDays: WorkingDaysConfig;
  filterProjectId: string;
  filterUserId?: string;
  viewMode?: 'week' | 'day';
};

export const WorkloadChart = forwardRef<WorkloadChartHandle, Props>(function WorkloadChart(
  {
    projects,
    tasks,
    subtasks,
    users,
    workingDays,
    filterProjectId,
    filterUserId = '',
    viewMode = 'week',
  },
  ref,
) {
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  useDragScroll(containerRef);

  useImperativeHandle(ref, () => ({
    getSVGElement: () => svgRef.current,
  }));

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      setContainerSize({ width, height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const userMap = useMemo(() => new Map(users.map((u) => [u.id, u])), [users]);

  const displayedUsers = useMemo(
    () => (filterUserId ? users.filter((u) => u.id === filterUserId) : users),
    [users, filterUserId],
  );

  const { columns, maxEffort } = useMemo(
    () =>
      buildWorkloadData(
        projects,
        tasks,
        subtasks,
        users,
        workingDays,
        filterProjectId,
        filterUserId,
        viewMode,
      ),
    [projects, tasks, subtasks, users, workingDays, filterProjectId, filterUserId, viewMode],
  );

  const yMax = niceMax(maxEffort);
  const ticks = yTicks(yMax);

  const isFocused = filterUserId !== '';
  const isDay = viewMode === 'day';
  const barW = isFocused ? BAR_W_FOCUSED : isDay ? BAR_W_DAY : BAR_W;
  const barGap = isDay && !isFocused ? BAR_GAP_DAY : BAR_GAP;
  const colGap = isDay ? DAY_GAP : WEEK_GAP;
  const displayedCount = displayedUsers.length;

  // Expand chart height to fill the container
  const effectiveChartH =
    containerSize.height > 0 ? Math.max(200, containerSize.height - AXIS_B - TOP_PAD) : CHART_H;

  // Expand bar width so columns fill the container width
  const effectiveBarW =
    containerSize.width > 0 && columns.length > 0
      ? Math.max(
          barW,
          ((containerSize.width - AXIS_L) / columns.length -
            Math.max(0, displayedCount - 1) * barGap -
            colGap) /
            displayedCount,
        )
      : barW;

  const weekGroupW =
    displayedCount * effectiveBarW + Math.max(0, displayedCount - 1) * barGap + colGap;
  const svgWidth = AXIS_L + columns.length * weekGroupW;

  function effortToY(effort: number): number {
    return TOP_PAD + ((yMax - effort) / yMax) * effectiveChartH;
  }

  function effortToH(effort: number): number {
    return (effort / yMax) * effectiveChartH;
  }

  const handleBarHover = useCallback(
    (
      e: MouseEvent<SVGRectElement>,
      col: Column,
      bar: Column['userBars'][0],
      svgBarX: number,
      svgBarW: number,
    ) => {
      const user = userMap.get(bar.userId);
      if (!user || bar.totalEffort === 0) return;
      // Derive viewport position from the SVG element's rect + the bar's SVG x-coordinate.
      // Using the SVG element (not the child rect) is reliable under container scroll because
      // getBoundingClientRect() on the SVG correctly subtracts scrollLeft of its overflow parent.
      const svgRect = svgRef.current?.getBoundingClientRect();
      if (!svgRect) return;
      const barLeft = svgRect.left + svgBarX;
      const barRight = barLeft + svgBarW;
      setTooltip({
        bucketLabel: col.label,
        userName: user.name,
        userColor: user.color,
        totalEffort: bar.totalEffort,
        segments: bar.segments,
        barLeft,
        barRight,
        y: e.clientY,
      });
    },
    [userMap],
  );

  // ── Empty states ──────────────────────────────────────────────────────────────
  if (users.length === 0) {
    return (
      <div className={styles.empty} data-testid="workload-empty">
        <p>No team members yet.</p>
        <p className={styles.emptyHint}>Add team members and assign subtasks to see workload.</p>
      </div>
    );
  }

  if (columns.length === 0) {
    return (
      <div className={styles.empty} data-testid="workload-empty">
        <p>No assigned subtasks to display.</p>
        <p className={styles.emptyHint}>
          Assign subtasks to team members to see their {isDay ? 'daily' : 'weekly'} workload here.
        </p>
      </div>
    );
  }

  const barsContentW = displayedCount * effectiveBarW + Math.max(0, displayedCount - 1) * barGap;

  return (
    <div className={styles.wrap} data-testid="workload-chart">
      {/* Legend */}
      <div className={styles.legend}>
        {displayedUsers.map((u) => (
          <span key={u.id} className={styles.legendItem}>
            <span className={styles.legendDot} style={{ background: u.color }} />
            {u.name}
          </span>
        ))}
      </div>

      {/* Scrollable chart */}
      <div className={styles.chartScroll} ref={containerRef}>
        <svg
          ref={svgRef}
          width={svgWidth}
          height={effectiveChartH + AXIS_B + TOP_PAD}
          style={{ display: 'block', overflow: 'visible' }}
          onMouseLeave={() => setTooltip(null)}
          aria-label="Workload chart"
          data-testid="workload-svg"
        >
          {/* Y-axis grid lines + labels */}
          {ticks.map((tick) => {
            const y = effortToY(tick);
            return (
              <g key={tick}>
                <line
                  x1={AXIS_L}
                  y1={y}
                  x2={svgWidth}
                  y2={y}
                  stroke="var(--color-border)"
                  strokeWidth={tick === 0 ? 1 : 0.5}
                  strokeDasharray={tick === 0 ? 'none' : '3 4'}
                />
                <text x={AXIS_L - 6} y={y + 4} className={styles.yLabel} textAnchor="end">
                  {tick}
                </text>
              </g>
            );
          })}

          {/* Y-axis label */}
          <text
            x={10}
            y={TOP_PAD + effectiveChartH / 2}
            className={styles.axisTitle}
            textAnchor="middle"
            transform={`rotate(-90, 10, ${TOP_PAD + effectiveChartH / 2})`}
          >
            Effort pts
          </text>

          {/* Columns */}
          {columns.map((col, ci) => {
            const colX = AXIS_L + ci * weekGroupW;

            return (
              <g key={col.bucketKey}>
                {/* Bucket label (bottom axis) */}
                <text
                  x={colX + barsContentW / 2}
                  y={effectiveChartH + AXIS_B + TOP_PAD - 4}
                  className={styles.xLabel}
                  textAnchor="middle"
                >
                  {col.label}
                </text>

                {/* User bars within this column */}
                {col.userBars.map((bar, ui) => {
                  const user = userMap.get(bar.userId);
                  if (!user || bar.totalEffort === 0) return null;
                  const barX = colX + ui * (effectiveBarW + barGap);
                  const barH = effortToH(bar.totalEffort);
                  const barY = effortToY(bar.totalEffort);

                  let segY = barY;
                  const segRects: { y: number; h: number; opacity: number }[] = [];
                  const sortedSegs = [...bar.segments].sort((a, b) => b.effort - a.effort);
                  for (let i = 0; i < sortedSegs.length; i++) {
                    const segH = effortToH(sortedSegs[i].effort);
                    segRects.push({ y: segY, h: segH, opacity: 1 - i * 0.15 });
                    segY += segH;
                  }

                  return (
                    <g key={bar.userId}>
                      {segRects.map((seg, si) => (
                        <rect
                          key={si}
                          x={barX}
                          y={seg.y}
                          width={effectiveBarW}
                          height={Math.max(seg.h, 1)}
                          fill={user.color}
                          opacity={seg.opacity}
                          rx={si === 0 ? 3 : 0}
                          ry={si === 0 ? 3 : 0}
                        />
                      ))}
                      {/* Invisible hover target */}
                      <rect
                        x={barX}
                        y={barY}
                        width={effectiveBarW}
                        height={barH}
                        fill="transparent"
                        className={styles.hoverTarget}
                        onMouseEnter={(e) => handleBarHover(e, col, bar, barX, effectiveBarW)}
                        onMouseLeave={() => setTooltip(null)}
                        aria-label={`${user.name}: ${bar.totalEffort.toFixed(1)} pts`}
                      />
                    </g>
                  );
                })}
              </g>
            );
          })}
        </svg>

        {/* Tooltip — fixed to viewport, anchored to the bar edge with the most space */}
        {tooltip && (
          <div
            className={styles.tooltip}
            style={
              window.innerWidth - tooltip.barRight >= 260
                ? { left: tooltip.barRight + 8, top: tooltip.y - 8 }
                : { right: window.innerWidth - tooltip.barLeft + 8, top: tooltip.y - 8 }
            }
            role="tooltip"
          >
            <div className={styles.tooltipHeader}>
              <span className={styles.tooltipDot} style={{ background: tooltip.userColor }} />
              <strong>{tooltip.userName}</strong>
              <span className={styles.tooltipWeek}>{tooltip.bucketLabel}</span>
            </div>
            <div className={styles.tooltipTotal}>
              <span className={styles.mono}>{tooltip.totalEffort.toFixed(1)}</span> pts total
            </div>
            <div className={styles.tooltipSegs}>
              {tooltip.segments.map((seg) => (
                <div key={seg.subtaskId} className={styles.tooltipSeg}>
                  <span className={styles.tooltipSegName}>{seg.subtaskName}</span>
                  <span className={`${styles.mono} ${styles.tooltipSegEff}`}>
                    {seg.effort.toFixed(1)} pts
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
});
