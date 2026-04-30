import { useMemo, useState, useRef, forwardRef, useImperativeHandle } from 'react';
import type { Project, Task, Subtask, User, WorkingDaysConfig } from '@/types';
import { buildBurnoutData, type UserBurnoutRow, type WeekLoad } from '@/utils/burnout';
import styles from './BurnoutChart.module.css';

// ─── Constants ────────────────────────────────────────────────────────────────

const LABEL_W = 160;
const CELL_W = 96;
const CELL_H = 68;
const COL_GAP = 5;
const ROW_H = CELL_H + 10;
const HEAD_H = 64;
const RADIUS = 6;

// Color bands — documented in docs/burnout-heuristic.md
const SAFE_COLOR = '#4CAF7D';
const WARN_COLOR = '#E09830';
const DANGER_COLOR = '#C0392B';

function loadFill(ratio: number): string {
  if (ratio <= 0) return 'transparent';
  if (ratio < 0.7) return SAFE_COLOR;
  if (ratio <= 1.0) return WARN_COLOR;
  return DANGER_COLOR;
}

function weekLabel(weekStart: string): string {
  const d = new Date(weekStart + 'T00:00:00');
  return d.toLocaleString('en-US', { month: 'short', day: 'numeric' });
}

// ─── Types ────────────────────────────────────────────────────────────────────

type DrillDown = {
  user: User;
  weekLoad: WeekLoad;
};

export interface BurnoutChartHandle {
  getSVGElement(): SVGSVGElement | null;
}

type Props = {
  projects: Project[];
  tasks: Task[];
  subtasks: Subtask[];
  users: User[];
  workingDays: WorkingDaysConfig;
  filterProjectId: string;
};

// ─── Component ────────────────────────────────────────────────────────────────

export const BurnoutChart = forwardRef<BurnoutChartHandle, Props>(function BurnoutChart(
  { projects, tasks, subtasks, users, workingDays, filterProjectId },
  ref,
) {
  const [selected, setSelected] = useState<DrillDown | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  useImperativeHandle(ref, () => ({
    getSVGElement: () => svgRef.current,
  }));

  const { rows, allWeeks } = useMemo(
    () => buildBurnoutData(projects, tasks, subtasks, users, workingDays, filterProjectId),
    [projects, tasks, subtasks, users, workingDays, filterProjectId],
  );

  if (users.length === 0) {
    return (
      <div className={styles.empty} data-testid="burnout-empty">
        <p>No team members yet.</p>
        <p className={styles.emptyHint}>
          Add team members and assign subtasks to see burnout risk.
        </p>
      </div>
    );
  }

  if (allWeeks.length === 0) {
    return (
      <div className={styles.empty} data-testid="burnout-empty">
        <p>No assigned subtasks to display.</p>
        <p className={styles.emptyHint}>
          Assign subtasks to team members to see their weekly risk profile.
        </p>
      </div>
    );
  }

  const svgW = LABEL_W + allWeeks.length * (CELL_W + COL_GAP);
  const svgH = HEAD_H + rows.length * ROW_H;

  function handleCellClick(row: UserBurnoutRow, wl: WeekLoad) {
    if (wl.loadRatio <= 0) return;
    setSelected((prev) =>
      prev?.user.id === row.user.id && prev.weekLoad.weekStart === wl.weekStart
        ? null
        : { user: row.user, weekLoad: wl },
    );
  }

  return (
    <div className={styles.wrap} data-testid="burnout-chart">
      {/* Legend */}
      <div className={styles.legend}>
        <span className={styles.legendItem}>
          <span className={styles.legendSwatch} style={{ background: SAFE_COLOR }} />
          {'< 70% — Safe'}
        </span>
        <span className={styles.legendItem}>
          <span className={styles.legendSwatch} style={{ background: WARN_COLOR }} />
          70–100% — Full
        </span>
        <span className={styles.legendItem}>
          <span className={styles.legendSwatch} style={{ background: DANGER_COLOR }} />
          {'> 100% — Overloaded'}
        </span>
        <span className={styles.legendHint}>Click a cell to drill down</span>
      </div>

      {/* Heatmap */}
      <div className={styles.chartScroll}>
        <svg
          ref={svgRef}
          width={svgW}
          height={svgH}
          style={{ display: 'block', overflow: 'visible' }}
          aria-label="Burnout risk heatmap"
          data-testid="burnout-svg"
        >
          {/* Week header labels */}
          {allWeeks.map((week, wi) => (
            <text
              key={week}
              x={LABEL_W + wi * (CELL_W + COL_GAP) + CELL_W / 2}
              y={HEAD_H - 10}
              className={styles.headLabel}
              textAnchor="middle"
            >
              {weekLabel(week)}
            </text>
          ))}

          {/* User rows */}
          {rows.map((row, ri) => {
            const rowY = HEAD_H + ri * ROW_H;
            return (
              <g key={row.user.id}>
                {/* User color bar */}
                <rect
                  x={LABEL_W - 7}
                  y={rowY + 5}
                  width={3}
                  height={CELL_H - 10}
                  fill={row.user.color}
                  rx={1.5}
                />
                {/* User name */}
                <text
                  x={LABEL_W - 14}
                  y={rowY + CELL_H / 2 + 4}
                  className={styles.rowLabel}
                  textAnchor="end"
                >
                  {row.user.name}
                </text>

                {/* Week cells */}
                {row.weeks.map((wl, wi) => {
                  const cellX = LABEL_W + wi * (CELL_W + COL_GAP);
                  const hasLoad = wl.loadRatio > 0;
                  const fill = loadFill(wl.loadRatio);
                  const isSelected =
                    selected?.user.id === row.user.id &&
                    selected.weekLoad.weekStart === wl.weekStart;
                  const pct = Math.round(wl.loadRatio * 100);

                  return (
                    <g key={wl.weekStart}>
                      <rect
                        x={cellX}
                        y={rowY}
                        width={CELL_W}
                        height={CELL_H}
                        fill={fill}
                        fillOpacity={hasLoad ? 0.88 : 0}
                        stroke={isSelected ? '#fff' : 'var(--color-border)'}
                        strokeWidth={isSelected ? 2.5 : 1}
                        rx={RADIUS}
                        className={hasLoad ? styles.cell : styles.cellEmpty}
                        onClick={() => handleCellClick(row, wl)}
                        aria-label={
                          hasLoad
                            ? `${row.user.name}, week of ${wl.label}: ${pct}% capacity`
                            : undefined
                        }
                        data-testid={`burnout-cell-${row.user.id}-${wl.weekStart}`}
                      />
                      {hasLoad && (
                        <text
                          x={cellX + CELL_W / 2}
                          y={rowY + CELL_H / 2 + 4}
                          className={styles.cellLabel}
                          textAnchor="middle"
                          pointerEvents="none"
                        >
                          {pct}%
                        </text>
                      )}
                    </g>
                  );
                })}
              </g>
            );
          })}
        </svg>
      </div>

      {/* Drill-down panel */}
      {selected && (
        <div className={styles.drillDown} data-testid="burnout-drilldown">
          <div className={styles.drillHeader}>
            <span className={styles.drillDot} style={{ background: selected.user.color }} />
            <strong className={styles.drillName}>{selected.user.name}</strong>
            <span className={styles.drillWeek}>{selected.weekLoad.label}</span>
            <span
              className={styles.drillBadge}
              style={{ background: loadFill(selected.weekLoad.loadRatio) }}
            >
              {Math.round(selected.weekLoad.loadRatio * 100)}%
            </span>
            <span className={styles.drillCapacity}>
              {selected.weekLoad.effortPts.toFixed(1)} / {selected.user.weeklyCapacity} pts
            </span>
            <button
              className={styles.drillClose}
              onClick={() => setSelected(null)}
              aria-label="Close drill-down"
            >
              ×
            </button>
          </div>

          <table className={styles.drillTable}>
            <thead>
              <tr>
                <th>Subtask</th>
                <th>Project › Task</th>
                <th>Effort</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {selected.weekLoad.segments.map((seg) => (
                <tr key={seg.subtaskId}>
                  <td>{seg.subtaskName}</td>
                  <td className={styles.drillCrumb}>
                    {seg.projectName} <span>›</span> {seg.taskName}
                  </td>
                  <td className={styles.drillEff}>{seg.effort.toFixed(1)} pts</td>
                  <td>
                    <span className={styles.statusBadge} data-status={seg.status}>
                      {seg.status === 'not_started'
                        ? 'Not started'
                        : seg.status === 'in_progress'
                          ? 'In progress'
                          : seg.status === 'blocked'
                            ? 'Blocked'
                            : 'Done'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
});
