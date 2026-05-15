import { useMemo, useState, useRef, useEffect, forwardRef, useImperativeHandle } from 'react';
import type { Project, Task, Subtask, User, WorkingDaysConfig } from '@/types';
import { buildBurnoutData, type UserBurnoutRow, type WeekLoad } from '@/utils/burnout';
import { workingDaysInWeek, workingDaysBetween, toISO } from '@/utils/workingDays';
import { useStore } from '@/store';
import { useDragScroll } from '@/hooks/useDragScroll';
import styles from './BurnoutChart.module.css';

// ─── Constants ────────────────────────────────────────────────────────────────

const LABEL_W = 160;
const CELL_W = 96;
const CELL_H = 78;
const COL_GAP = 5;
const ROW_H = CELL_H + 10;
const HEAD_H = 48;
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

type DayLoad = {
  date: string;
  dayName: string;
  effortPts: number;
  isWorking: boolean;
  loadRatio: number;
};

function computeDayLoads(
  user: User,
  weekLoad: WeekLoad,
  subtasks: Subtask[],
  config: WorkingDaysConfig,
  dailyCapacity: number,
  prorated: boolean,
): DayLoad[] {
  const base = new Date(weekLoad.weekStart + 'T00:00:00');
  const wDays = new Set(workingDaysInWeek(weekLoad.weekStart, config));
  const dailyCap = dailyCapacity;

  return Array.from({ length: 5 }, (_, i) => {
    const d = new Date(base);
    d.setDate(d.getDate() + i);
    const date = toISO(d);
    const dayName = d.toLocaleString('en-US', { weekday: 'short' });
    const isWorking = wDays.has(date);

    let effortPts = 0;
    if (isWorking) {
      for (const sub of subtasks) {
        if (sub.assigneeId !== user.id) continue;
        if (date < sub.startDate || date > sub.endDate) continue;
        if (prorated) {
          const total = workingDaysBetween(sub.startDate, sub.endDate, config);
          effortPts += total > 0 ? sub.effortPoints / total : sub.effortPoints;
        } else {
          effortPts += sub.effortPoints;
        }
      }
    }

    return {
      date,
      dayName,
      effortPts,
      isWorking,
      loadRatio: dailyCap > 0 ? effortPts / dailyCap : 0,
    };
  });
}

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
  filterUserId: string;
  dailyCapacity: number;
  prorateEffort: boolean;
};

// ─── Component ────────────────────────────────────────────────────────────────

export const BurnoutChart = forwardRef<BurnoutChartHandle, Props>(function BurnoutChart(
  {
    projects,
    tasks,
    subtasks,
    users,
    workingDays,
    filterProjectId,
    filterUserId,
    dailyCapacity,
    prorateEffort,
  },
  ref,
) {
  const drilldownPersist = useStore((s) => s.chartViews.burnout.drilldown);
  const selectedDay = useStore((s) => s.chartViews.burnout.selectedDay);
  const sheetHeightPersist = useStore((s) => s.chartViews.burnout.sheetHeight);
  const setBurnoutView = useStore((s) => s.setBurnoutView);

  const [containerWidth, setContainerWidth] = useState(0);
  const svgRef = useRef<SVGSVGElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const dragStartY = useRef<number | null>(null);

  useDragScroll(scrollRef);
  const dragStartH = useRef<number>(0);

  const sheetHeight = sheetHeightPersist ?? 360;
  const setSheetHeight = (h: number) => setBurnoutView({ sheetHeight: h });
  const setSelectedDay = (d: string | null) => setBurnoutView({ selectedDay: d });

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      setContainerWidth(entries[0].contentRect.width);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  function onHandlePointerDown(e: React.PointerEvent<HTMLDivElement>) {
    e.currentTarget.setPointerCapture(e.pointerId);
    dragStartY.current = e.clientY;
    dragStartH.current = sheetHeight;
  }

  function onHandlePointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (dragStartY.current === null) return;
    const delta = dragStartY.current - e.clientY;
    const maxH = wrapRef.current ? wrapRef.current.offsetHeight * 0.9 : 800;
    const next = Math.max(80, Math.min(maxH, dragStartH.current + delta));
    setSheetHeight(next);
  }

  function onHandlePointerUp(e: React.PointerEvent<HTMLDivElement>) {
    dragStartY.current = null;
    e.currentTarget.releasePointerCapture(e.pointerId);
  }

  useImperativeHandle(ref, () => ({
    getSVGElement: () => svgRef.current,
  }));

  const { rows, allWeeks } = useMemo(() => {
    const data = buildBurnoutData(
      projects,
      tasks,
      subtasks,
      users,
      workingDays,
      filterProjectId,
      dailyCapacity,
      prorateEffort,
    );
    return filterUserId
      ? { ...data, rows: data.rows.filter((r) => r.user.id === filterUserId) }
      : data;
  }, [
    projects,
    tasks,
    subtasks,
    users,
    workingDays,
    filterProjectId,
    filterUserId,
    dailyCapacity,
    prorateEffort,
  ]);

  // Reconstruct the DrillDown from the persisted (userId, weekStart) ids using the current rows.
  // If the underlying user/week is no longer present (data changed, filters changed), the
  // drill-down silently hides until the user picks a new cell.
  const selected = useMemo<DrillDown | null>(() => {
    if (!drilldownPersist) return null;
    const row = rows.find((r) => r.user.id === drilldownPersist.userId);
    if (!row) return null;
    const weekLoad = row.weeks.find((w) => w.weekStart === drilldownPersist.weekStart);
    if (!weekLoad) return null;
    return { user: row.user, weekLoad };
  }, [drilldownPersist, rows]);

  const dayLoads = useMemo(
    () =>
      selected
        ? computeDayLoads(
            selected.user,
            selected.weekLoad,
            subtasks,
            workingDays,
            dailyCapacity,
            prorateEffort,
          )
        : [],
    [selected, subtasks, workingDays, dailyCapacity, prorateEffort],
  );

  const filteredSegments = useMemo(() => {
    if (!selected) return [];
    if (!selectedDay) return selected.weekLoad.segments;
    return selected.weekLoad.segments.filter((seg) => {
      const sub = subtasks.find((s) => s.id === seg.subtaskId);
      return sub && selectedDay >= sub.startDate && selectedDay <= sub.endDate;
    });
  }, [selected, selectedDay, subtasks]);

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

  const effectiveCellW =
    containerWidth > 0 && allWeeks.length > 0
      ? Math.max(CELL_W, (containerWidth - LABEL_W) / allWeeks.length - COL_GAP)
      : CELL_W;
  const svgW = LABEL_W + allWeeks.length * (effectiveCellW + COL_GAP);
  const svgH = HEAD_H + rows.length * ROW_H;

  function handleCellClick(row: UserBurnoutRow, wl: WeekLoad) {
    if (wl.loadRatio <= 0) return;
    const isSame =
      drilldownPersist?.userId === row.user.id && drilldownPersist.weekStart === wl.weekStart;
    if (isSame) {
      setBurnoutView({ drilldown: null, selectedDay: null });
      return;
    }
    // Opening or switching: reset sheet height to ~50% of the container so the user
    // gets a sensible default. Persisted height is only kept while the sheet stays open.
    const resetHeight = wrapRef.current ? Math.floor(wrapRef.current.offsetHeight / 2) : 360;
    setBurnoutView({
      drilldown: { userId: row.user.id, weekStart: wl.weekStart },
      selectedDay: null,
      sheetHeight: resetHeight,
    });
  }

  function handleDayClick(date: string) {
    setSelectedDay(selectedDay === date ? null : date);
  }

  return (
    <div className={styles.wrap} ref={wrapRef} data-testid="burnout-chart">
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
      <div className={styles.chartScroll} ref={scrollRef}>
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
              x={LABEL_W + wi * (effectiveCellW + COL_GAP) + effectiveCellW / 2}
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
                  const cellX = LABEL_W + wi * (effectiveCellW + COL_GAP);
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
                        width={effectiveCellW}
                        height={CELL_H}
                        fill={fill}
                        fillOpacity={hasLoad ? 0.88 : undefined}
                        style={!hasLoad ? { fill: 'var(--color-bg-muted)' } : undefined}
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
                          x={cellX + effectiveCellW / 2}
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

      {/* Bottom-sheet drill-down */}
      {selected && (
        <div className={styles.bottomSheet} style={{ height: sheetHeight }}>
          <div
            className={styles.sheetHandle}
            onPointerDown={onHandlePointerDown}
            onPointerMove={onHandlePointerMove}
            onPointerUp={onHandlePointerUp}
            onPointerCancel={onHandlePointerUp}
            aria-label="Drag to resize panel"
          >
            <div className={styles.sheetHandleBar} />
          </div>

          <div className={styles.sheetContent}>
            <div className={styles.drillDown} data-testid="burnout-drilldown">
              {/* Header */}
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
                  {selected.weekLoad.effortPts.toFixed(1)} / {dailyCapacity * 5} pts
                </span>
                <button
                  className={styles.drillClose}
                  onClick={() => setBurnoutView({ drilldown: null, selectedDay: null })}
                  aria-label="Close drill-down"
                >
                  ×
                </button>
              </div>

              {/* Day-by-day breakdown */}
              <div className={styles.dayCards}>
                {dayLoads.map((day) => (
                  <div
                    key={day.date}
                    className={`${styles.dayCard} ${!day.isWorking ? styles.dayOff : ''} ${day.isWorking && selectedDay === day.date ? styles.dayCardSelected : ''}`}
                    onClick={() => day.isWorking && handleDayClick(day.date)}
                  >
                    <span className={styles.dayCardName}>
                      {day.dayName} - {day.date.slice(8, 10)}
                    </span>
                    <div className={styles.dayBarTrack}>
                      <div
                        className={styles.dayBarFill}
                        style={{
                          height: `${Math.min(day.loadRatio * 100, 100)}%`,
                          background: day.effortPts > 0 ? loadFill(day.loadRatio) : undefined,
                        }}
                      />
                    </div>
                    {day.isWorking ? (
                      <span
                        className={styles.dayCardBadge}
                        style={
                          day.effortPts > 0
                            ? { background: loadFill(day.loadRatio), color: '#fff' }
                            : {
                                background: 'var(--color-bg-muted)',
                                color: 'var(--color-text-muted)',
                              }
                        }
                      >
                        {Math.round(day.loadRatio * 100)}%
                      </span>
                    ) : (
                      <span className={styles.dayCardPts}>–</span>
                    )}
                    <span className={styles.dayCardPts}>
                      {day.isWorking ? `${day.effortPts.toFixed(1)} pts` : ''}
                    </span>
                  </div>
                ))}
              </div>

              {/* Subtask table */}
              <div className={styles.drillTableHeader}>
                {selectedDay ? (
                  <>
                    <span>
                      Tasks on{' '}
                      <strong>
                        {new Date(selectedDay + 'T00:00:00').toLocaleString('en-US', {
                          weekday: 'short',
                          month: 'short',
                          day: 'numeric',
                        })}
                      </strong>
                    </span>
                    <button className={styles.drillClearDay} onClick={() => setSelectedDay(null)}>
                      Show all
                    </button>
                  </>
                ) : (
                  <span>All tasks this week</span>
                )}
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
                  {filteredSegments.length === 0 ? (
                    <tr>
                      <td colSpan={4} className={styles.drillEmpty}>
                        No tasks on this day.
                      </td>
                    </tr>
                  ) : (
                    filteredSegments.map((seg) => (
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
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
});
