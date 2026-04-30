import {
  useMemo,
  useState,
  useRef,
  useCallback,
  forwardRef,
  useImperativeHandle,
  type MouseEvent,
} from 'react';
import type { Project, Task, Subtask, User, WorkingDaysConfig } from '@/types';
import { getISOWeekStart, enumerateWeeks } from '@/utils/workingDays';
import { prorateEffort } from '@/utils/burnout';
import styles from './WorkloadChart.module.css';

export interface WorkloadChartHandle {
  getSVGElement(): SVGSVGElement | null;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const BAR_W = 32; // width of a single user-week bar
const BAR_GAP = 6; // gap between bars in the same week
const WEEK_GAP = 20; // gap between week groups
const CHART_H = 320; // fixed SVG height for bars
const AXIS_B = 36; // bottom axis height
const AXIS_L = 48; // left axis width
const SVG_H = CHART_H + AXIS_B;
const TOP_PAD = 16;

// ─── Types ────────────────────────────────────────────────────────────────────

type WeekSegment = {
  userId: string;
  subtaskId: string;
  subtaskName: string;
  taskName: string;
  projectName: string;
  effort: number; // prorated effort for this week
};

type WeekColumn = {
  weekStart: string; // ISO date (Monday)
  label: string; // display label e.g. "Jan 6"
  userBars: {
    userId: string;
    segments: WeekSegment[];
    totalEffort: number;
  }[];
};

type TooltipState = {
  weekLabel: string;
  userName: string;
  userColor: string;
  totalEffort: number;
  segments: WeekSegment[];
  x: number;
  y: number;
};

// ─── Build chart data ─────────────────────────────────────────────────────────

function buildWorkloadData(
  projects: Project[],
  tasks: Task[],
  subtasks: Subtask[],
  users: User[],
  workingDays: WorkingDaysConfig,
  filterProjectId: string,
): { columns: WeekColumn[]; maxEffort: number } {
  if (users.length === 0 || subtasks.length === 0) {
    return { columns: [], maxEffort: 0 };
  }

  const projectMap = new Map(projects.map((p) => [p.id, p]));
  const taskMap = new Map(tasks.map((t) => [t.id, t]));

  // Filter subtasks
  const filtered = subtasks.filter((s) => {
    const task = taskMap.get(s.taskId);
    if (!task) return false;
    if (filterProjectId && task.projectId !== filterProjectId) return false;
    return !!s.assigneeId; // workload only makes sense for assigned subtasks
  });

  if (filtered.length === 0) return { columns: [], maxEffort: 0 };

  // Date range
  const allDates = filtered.flatMap((s) => [s.startDate, s.endDate]);
  const rangeStart = getISOWeekStart(allDates.reduce((a, b) => (a < b ? a : b)));
  const rangeEnd = allDates.reduce((a, b) => (a > b ? a : b));
  const weeks = enumerateWeeks(rangeStart, rangeEnd);

  let maxEffort = 0;

  const columns: WeekColumn[] = weeks.map((weekStart) => {
    const d = new Date(weekStart + 'T00:00:00');
    const month = d.toLocaleString('en-US', { month: 'short' });
    const day = d.getDate();
    const label = `${month} ${day}`;

    const userBars = users.map((user) => {
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

    return { weekStart, label, userBars };
  });

  return { columns, maxEffort };
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
};

export const WorkloadChart = forwardRef<WorkloadChartHandle, Props>(function WorkloadChart(
  { projects, tasks, subtasks, users, workingDays, filterProjectId },
  ref,
) {
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  useImperativeHandle(ref, () => ({
    getSVGElement: () => svgRef.current,
  }));

  const userMap = useMemo(() => new Map(users.map((u) => [u.id, u])), [users]);

  const { columns, maxEffort } = useMemo(
    () => buildWorkloadData(projects, tasks, subtasks, users, workingDays, filterProjectId),
    [projects, tasks, subtasks, users, workingDays, filterProjectId],
  );

  const yMax = niceMax(maxEffort);
  const ticks = yTicks(yMax);

  // SVG width: AXIS_L + (BAR_W * users + BAR_GAP * (users-1) + WEEK_GAP) * weeks
  const usersCount = users.length;
  const weekGroupW = usersCount * BAR_W + Math.max(0, usersCount - 1) * BAR_GAP + WEEK_GAP;
  const svgWidth = AXIS_L + columns.length * weekGroupW;

  function effortToY(effort: number): number {
    return TOP_PAD + ((yMax - effort) / yMax) * CHART_H;
  }

  function effortToH(effort: number): number {
    return (effort / yMax) * CHART_H;
  }

  const handleBarHover = useCallback(
    (e: MouseEvent<SVGRectElement>, col: WeekColumn, bar: WeekColumn['userBars'][0]) => {
      const user = userMap.get(bar.userId);
      if (!user || bar.totalEffort === 0) return;
      const svgRect = e.currentTarget.ownerSVGElement?.getBoundingClientRect();
      const containerRect = containerRef.current?.getBoundingClientRect();
      if (!svgRect || !containerRect) return;
      const x = e.clientX - containerRect.left;
      const y = e.clientY - containerRect.top;
      setTooltip({
        weekLabel: col.label,
        userName: user.name,
        userColor: user.color,
        totalEffort: bar.totalEffort,
        segments: bar.segments,
        x,
        y,
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
          Assign subtasks to team members to see their weekly workload here.
        </p>
      </div>
    );
  }

  return (
    <div className={styles.wrap} data-testid="workload-chart">
      {/* Legend */}
      <div className={styles.legend}>
        {users.map((u) => (
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
          height={SVG_H + TOP_PAD}
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
            y={TOP_PAD + CHART_H / 2}
            className={styles.axisTitle}
            textAnchor="middle"
            transform={`rotate(-90, 10, ${TOP_PAD + CHART_H / 2})`}
          >
            Effort pts
          </text>

          {/* Week columns */}
          {columns.map((col, ci) => {
            const weekX = AXIS_L + ci * weekGroupW;

            return (
              <g key={col.weekStart}>
                {/* Week label (bottom axis) */}
                <text
                  x={weekX + (usersCount * BAR_W + Math.max(0, usersCount - 1) * BAR_GAP) / 2}
                  y={SVG_H + TOP_PAD - 4}
                  className={styles.xLabel}
                  textAnchor="middle"
                >
                  {col.label}
                </text>

                {/* User bars within this week */}
                {col.userBars.map((bar, ui) => {
                  const user = userMap.get(bar.userId);
                  if (!user || bar.totalEffort === 0) return null;
                  const barX = weekX + ui * (BAR_W + BAR_GAP);
                  const barH = effortToH(bar.totalEffort);
                  const barY = effortToY(bar.totalEffort);

                  // Stack segments within the bar (top to bottom)
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
                          width={BAR_W}
                          height={Math.max(seg.h, 1)}
                          fill={user.color}
                          opacity={seg.opacity}
                          rx={si === 0 ? 3 : 0}
                          ry={si === 0 ? 3 : 0}
                        />
                      ))}
                      {/* Invisible hover target covering full bar */}
                      <rect
                        x={barX}
                        y={barY}
                        width={BAR_W}
                        height={barH}
                        fill="transparent"
                        className={styles.hoverTarget}
                        onMouseEnter={(e) => handleBarHover(e, col, bar)}
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

        {/* Tooltip */}
        {tooltip && (
          <div
            className={styles.tooltip}
            style={{ left: tooltip.x + 12, top: tooltip.y - 8 }}
            role="tooltip"
          >
            <div className={styles.tooltipHeader}>
              <span className={styles.tooltipDot} style={{ background: tooltip.userColor }} />
              <strong>{tooltip.userName}</strong>
              <span className={styles.tooltipWeek}>{tooltip.weekLabel}</span>
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
