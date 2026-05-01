import React, { useMemo, useRef, forwardRef, useImperativeHandle } from 'react';
import type { Project, Task, Subtask, User, SubtaskStatus } from '@/types';
import { toISO } from '@/utils/workingDays';
import { buildCSSVarMap, makeSVGEl, todayISO } from '@/utils/exportChart';
import styles from './TimelineChart.module.css';

export interface TimelineChartHandle {
  buildExportSVG(): SVGSVGElement;
  scrollToToday(): void;
}

// ─── Types ────────────────────────────────────────────────────────────────────

type TLEvent = {
  id: string;
  date: string;
  kind: 'start' | 'end';
  subtaskId: string;
  subtaskName: string;
  taskName: string;
  projectName: string;
  projectId: string;
  assigneeId?: string;
  assigneeName?: string;
  assigneeColor?: string;
  effortPoints: number;
  status: SubtaskStatus;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const STATUS_LABELS: Record<SubtaskStatus, string> = {
  not_started: 'Not started',
  in_progress: 'In progress',
  blocked: 'Blocked',
  done: 'Done',
};

function formatDateLong(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

function buildEvents(
  projects: Project[],
  tasks: Task[],
  subtasks: Subtask[],
  users: User[],
  filterProjectId: string,
  filterAssigneeId: string,
): TLEvent[] {
  const projectMap = new Map(projects.map((p) => [p.id, p]));
  const taskMap = new Map(tasks.map((t) => [t.id, t]));
  const userMap = new Map(users.map((u) => [u.id, u]));
  const result: TLEvent[] = [];

  for (const sub of subtasks) {
    const task = taskMap.get(sub.taskId);
    if (!task) continue;
    const project = projectMap.get(task.projectId);
    if (!project) continue;

    if (filterProjectId && project.id !== filterProjectId) continue;
    if (filterAssigneeId && sub.assigneeId !== filterAssigneeId) continue;

    const assignee = sub.assigneeId ? userMap.get(sub.assigneeId) : undefined;

    const shared = {
      subtaskId: sub.id,
      subtaskName: sub.name,
      taskName: task.name,
      projectName: project.name,
      projectId: project.id,
      assigneeId: sub.assigneeId,
      assigneeName: assignee?.name,
      assigneeColor: assignee?.color,
      effortPoints: sub.effortPoints,
      status: sub.status,
    };

    result.push({ id: `${sub.id}-start`, date: sub.startDate, kind: 'start', ...shared });
    // Only add end event if distinct from start
    if (sub.endDate !== sub.startDate) {
      result.push({ id: `${sub.id}-end`, date: sub.endDate, kind: 'end', ...shared });
    }
  }

  // Sort: date asc, then start before end within the same date
  return result.sort((a, b) => {
    const dc = a.date.localeCompare(b.date);
    if (dc !== 0) return dc;
    return a.kind === 'start' ? -1 : 1;
  });
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function EventRow({ event }: { event: TLEvent }) {
  return (
    <div className={styles.eventRow} data-testid="timeline-event">
      <div
        className={`${styles.dot} ${event.kind === 'start' ? styles.dotStart : styles.dotEnd}`}
      />

      <span
        className={`${styles.kindBadge} ${event.kind === 'start' ? styles.kindStart : styles.kindEnd}`}
      >
        {event.kind === 'start' ? 'Start' : 'End'}
      </span>

      <div className={styles.eventMain}>
        <span className={styles.subtaskName}>{event.subtaskName}</span>
        <span className={styles.breadcrumb}>
          {event.taskName}
          <span className={styles.sep}>›</span>
          {event.projectName}
        </span>
      </div>

      {event.assigneeName && (
        <span className={styles.assignee}>
          <span
            className={styles.assigneeDot}
            style={{ background: event.assigneeColor }}
            aria-hidden="true"
          />
          {event.assigneeName}
        </span>
      )}

      <span
        className={styles.statusBadge}
        data-status={event.status}
        aria-label={`Status: ${STATUS_LABELS[event.status]}`}
      >
        {STATUS_LABELS[event.status]}
      </span>

      <span className={styles.effort}>{event.effortPoints} pts</span>
    </div>
  );
}

function DateSection({
  date,
  events,
  isToday,
  isPast,
  sectionRef,
}: {
  date: string;
  events: TLEvent[];
  isToday: boolean;
  isPast: boolean;
  sectionRef?: React.RefObject<HTMLDivElement>;
}) {
  return (
    <div className={styles.dateGroup} data-testid="timeline-date-group" ref={sectionRef}>
      <div
        className={`${styles.dateSeparator} ${isToday ? styles.separatorToday : isPast ? styles.separatorPast : ''}`}
      >
        <span className={styles.dateLine} aria-hidden="true" />
        <span className={styles.dateLabel}>
          {isToday && <span className={styles.todayPill}>Today</span>}
          {formatDateLong(date)}
        </span>
        <span className={styles.dateLine} aria-hidden="true" />
      </div>

      {events.length > 0 ? (
        <div className={styles.eventList}>
          {events.map((ev) => (
            <EventRow key={ev.id} event={ev} />
          ))}
        </div>
      ) : isToday ? (
        <p className={styles.lonelyMsg}>seems a little bit lonely around here</p>
      ) : null}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

type Props = {
  projects: Project[];
  tasks: Task[];
  subtasks: Subtask[];
  users: User[];
  filterProjectId: string;
  filterAssigneeId: string;
};

export const TimelineChart = forwardRef<TimelineChartHandle, Props>(function TimelineChart(
  { projects, tasks, subtasks, users, filterProjectId, filterAssigneeId },
  ref,
) {
  const today = toISO(new Date());
  const todayGroupRef = useRef<HTMLDivElement>(null);

  const events = useMemo(
    () => buildEvents(projects, tasks, subtasks, users, filterProjectId, filterAssigneeId),
    [projects, tasks, subtasks, users, filterProjectId, filterAssigneeId],
  );

  // Group by date — today is always injected so it's always visible
  const grouped = useMemo(() => {
    const map = new Map<string, TLEvent[]>();
    map.set(today, []); // ensure today exists even with no events
    for (const ev of events) {
      const bucket = map.get(ev.date) ?? [];
      bucket.push(ev);
      map.set(ev.date, bucket);
    }
    return [...map.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, evts]) => ({ date, events: evts }));
  }, [events, today]);

  useImperativeHandle(
    ref,
    () => ({
      scrollToToday() {
        todayGroupRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      },
      buildExportSVG() {
        const vars = buildCSSVarMap();
        const c = {
          bg: vars['--color-bg'] || '#F5F0EA',
          text: vars['--color-text'] || '#3D3530',
          textMuted: vars['--color-text-muted'] || '#8C7B70',
          border: vars['--color-border'] || '#D5CFC8',
          accent: vars['--color-accent'] || '#C17D52',
        };

        const SVG_W = 960;
        const PAD_X = 24;
        const PAD_Y = 20;
        const SECTION_H = 36;
        const EVENT_H = 30;
        const SECTION_GAP = 8;

        let totalH = PAD_Y;
        for (const { events: evts } of grouped) {
          if (evts.length === 0) continue; // skip empty today in export
          totalH += SECTION_H + evts.length * EVENT_H + SECTION_GAP;
        }
        totalH += PAD_Y;

        const svg = makeSVGEl('svg', {
          xmlns: 'http://www.w3.org/2000/svg',
          width: SVG_W,
          height: Math.max(totalH, 80),
        }) as SVGSVGElement;
        svg.appendChild(
          makeSVGEl('rect', { x: 0, y: 0, width: SVG_W, height: Math.max(totalH, 80), fill: c.bg }),
        );

        const today2 = todayISO();
        let y = PAD_Y;

        for (const { date, events: dayEvents } of grouped) {
          if (dayEvents.length === 0) continue; // skip empty today in export
          const isToday = date === today2;
          const separatorY = y + SECTION_H / 2;

          // Separator lines
          svg.appendChild(
            makeSVGEl('line', {
              x1: PAD_X,
              y1: separatorY,
              x2: SVG_W / 2 - 80,
              y2: separatorY,
              stroke: isToday ? c.accent : c.border,
              'stroke-width': 1,
            }),
          );
          svg.appendChild(
            makeSVGEl('line', {
              x1: SVG_W / 2 + 80,
              y1: separatorY,
              x2: SVG_W - PAD_X,
              y2: separatorY,
              stroke: isToday ? c.accent : c.border,
              'stroke-width': 1,
            }),
          );

          const dateLabelEl = makeSVGEl('text', {
            x: SVG_W / 2,
            y: separatorY + 4,
            fill: isToday ? c.accent : c.textMuted,
            'font-size': 11,
            'font-family': 'Helvetica, Arial, sans-serif',
            'font-weight': isToday ? 700 : 500,
            'text-anchor': 'middle',
          });
          dateLabelEl.textContent = isToday
            ? `▶ Today — ${formatDateLong(date)}`
            : formatDateLong(date);
          svg.appendChild(dateLabelEl);

          y += SECTION_H;

          for (const ev of dayEvents) {
            const dotColor = ev.kind === 'start' ? '#22c55e' : '#3b82f6';
            const midY = y + EVENT_H / 2;

            // Dot
            svg.appendChild(makeSVGEl('circle', { cx: PAD_X + 6, cy: midY, r: 4, fill: dotColor }));

            // Kind label
            const kindEl = makeSVGEl('text', {
              x: PAD_X + 20,
              y: midY + 4,
              fill: dotColor,
              'font-size': 10,
              'font-family': 'Helvetica, Arial, sans-serif',
              'font-weight': 700,
            });
            kindEl.textContent = ev.kind === 'start' ? 'Start' : 'End';
            svg.appendChild(kindEl);

            // Subtask name (truncated)
            const name =
              ev.subtaskName.length > 28 ? ev.subtaskName.slice(0, 28) + '…' : ev.subtaskName;
            const nameEl = makeSVGEl('text', {
              x: PAD_X + 62,
              y: midY + 4,
              fill: c.text,
              'font-size': 12,
              'font-family': 'Helvetica, Arial, sans-serif',
            });
            nameEl.textContent = name;
            svg.appendChild(nameEl);

            // Breadcrumb (task › project)
            const crumb = `${ev.taskName} › ${ev.projectName}`.slice(0, 32);
            const crumbEl = makeSVGEl('text', {
              x: 320,
              y: midY + 4,
              fill: c.textMuted,
              'font-size': 11,
              'font-family': 'Helvetica, Arial, sans-serif',
            });
            crumbEl.textContent = crumb;
            svg.appendChild(crumbEl);

            // Assignee
            if (ev.assigneeName) {
              const aEl = makeSVGEl('text', {
                x: 600,
                y: midY + 4,
                fill: ev.assigneeColor || c.textMuted,
                'font-size': 11,
                'font-family': 'Helvetica, Arial, sans-serif',
              });
              aEl.textContent = ev.assigneeName;
              svg.appendChild(aEl);
            }

            // Status
            const statusEl = makeSVGEl('text', {
              x: 720,
              y: midY + 4,
              fill: c.textMuted,
              'font-size': 10,
              'font-family': 'Helvetica, Arial, sans-serif',
            });
            statusEl.textContent = STATUS_LABELS[ev.status];
            svg.appendChild(statusEl);

            // Effort pts
            const effortEl = makeSVGEl('text', {
              x: SVG_W - PAD_X,
              y: midY + 4,
              fill: c.textMuted,
              'font-size': 11,
              'font-family': 'Courier New, monospace',
              'text-anchor': 'end',
            });
            effortEl.textContent = `${ev.effortPoints} pts`;
            svg.appendChild(effortEl);

            y += EVENT_H;
          }

          y += SECTION_GAP;
        }

        return svg;
      },
    }),
    [grouped],
  );

  if (subtasks.length === 0) {
    return (
      <div className={styles.empty} data-testid="timeline-empty">
        <p>No subtasks yet.</p>
        <p className={styles.emptyHint}>
          Add subtasks to your tasks to see them appear here as start and end events.
        </p>
      </div>
    );
  }

  const totalSubtasks = new Set(events.map((e) => e.subtaskId)).size;

  return (
    <div className={styles.wrap} data-testid="timeline-chart">
      {events.length > 0 && (
        <div className={styles.summary}>
          <span className={styles.mono}>{events.length}</span> events across{' '}
          <span className={styles.mono}>{totalSubtasks}</span> subtasks
        </div>
      )}

      <div className={styles.list}>
        {grouped.map(({ date, events: dayEvents }) => (
          <DateSection
            key={date}
            date={date}
            events={dayEvents}
            isToday={date === today}
            isPast={date < today}
            sectionRef={date === today ? todayGroupRef : undefined}
          />
        ))}
      </div>
    </div>
  );
});
