# Burnout-Risk Heuristic

The burnout-risk chart visualises how close each team member is to their weekly capacity limit, expressed as a heat-map where every cell is one ISO week (Monday–Sunday) for one user.

---

## Calculation

```
load_ratio = weekly_effort_load / user.weeklyCapacity
```

Where `weekly_effort_load` for a given user in a given week is:

```
Σ effortPoints(subtask) × (workingDaysInWeek ∩ subtask / totalWorkingDaysOfSubtask)
```

- **workingDaysInWeek ∩ subtask** — the count of working days in that ISO week that also fall within `[subtask.startDate, subtask.endDate]`.
- **totalWorkingDaysOfSubtask** — `workingDaysBetween(subtask.startDate, subtask.endDate)`.
- Both computations respect the app's `WorkingDaysConfig` (configurable weekends + holiday list).

A subtask with no assigned user contributes zero load to any week.

---

## Color Bands

| Threshold                  | Color | Hex                    | Meaning                               |
| -------------------------- | ----- | ---------------------- | ------------------------------------- |
| `load_ratio = 0`           | Empty | `transparent` + border | No work assigned this week            |
| `0 < load_ratio < 0.70`    | Green | `#4CAF7D`              | Healthy — capacity headroom available |
| `0.70 ≤ load_ratio ≤ 1.00` | Amber | `#E09830`              | Full — little headroom, watch closely |
| `load_ratio > 1.00`        | Red   | `#C0392B`              | Overloaded — effort exceeds capacity  |

### Derivation rationale

`#C0392B` is the same red used for the today-line and schedule-conflict dependency arrows in the Gantt chart — deliberately reusing an existing "warning" signal from the palette so the semantic meaning is consistent across views.

`#E09830` is a warm amber in the same hue family as the app's accent (`--color-accent: #C17D52`), shifted toward yellow to read clearly as "caution" without conflicting with the accent.

`#4CAF7D` is a mid-range forest green with enough saturation to read against both the light parchment background (`--color-bg: #F5F0EA`) and the dark background (`--color-bg: #2A2724`). It was tested for WCAG AA contrast against the `#fff` cell label text at opacity 0.88.

All three colors use `fillOpacity: 0.88` on the SVG `<rect>` so a thin ring of the background shows around each cell in the scrollable heatmap, providing visual separation without a drawn border.

---

## Hand-Computed Validation Scenarios

These three scenarios are encoded as unit tests in `src/utils/burnout.test.ts`.

### Scenario 1 — Single subtask, full working week

```
User weeklyCapacity = 10 pts
Subtask: Mon 2026-04-06 → Fri 2026-04-10, effortPoints = 10
Config: weekends = [0,6], holidays = []

Week 2026-04-06:
  workingDaysInWeek ∩ subtask = [Mon, Tue, Wed, Thu, Fri] = 5
  totalWorkingDays             = 5
  prorated effort              = 10 × (5/5) = 10.0 pts
  load_ratio                   = 10.0 / 10 = 1.00  → Amber (Full)
```

### Scenario 2 — Two subtasks overlapping across a week boundary

```
User weeklyCapacity = 10 pts
Sub A: Mon 2026-04-06 → Fri 2026-04-10, effortPoints = 5
Sub B: Wed 2026-04-08 → Tue 2026-04-14, effortPoints = 10
Config: weekends = [0,6], holidays = []

totalWorkingDays(B) = [Wed, Thu, Fri, Mon, Tue] = 5

Week 2026-04-06:
  A: 5 × (5/5) = 5.0
  B: 10 × (3/5) = 6.0   ← 3 days = Wed/Thu/Fri of this week
  weekly_effort_load = 11.0
  load_ratio = 11.0 / 10 = 1.10  → Red (Overloaded)

Week 2026-04-13:
  A: 0  (ends Apr 10, before this week)
  B: 10 × (2/5) = 4.0   ← 2 days = Mon/Tue
  weekly_effort_load = 4.0
  load_ratio = 4.0 / 10 = 0.40  → Green (Safe)
```

### Scenario 3 — Subtask spanning a holiday

```
User weeklyCapacity = 10 pts
Subtask: Fri 2026-05-22 → Fri 2026-05-29, effortPoints = 10
Config: weekends = [0,6], holidays = ["2026-05-25"]  (Memorial Day, a Monday)

totalWorkingDays = [May 22(Fri), May 26(Tue), May 27(Wed), May 28(Thu), May 29(Fri)]
                = 5  (May 25 Mon excluded — holiday)

Week 2026-05-18 (Mon May 18 – Sun May 24):
  workingDaysInWeek = [May 18, 19, 20, 21, 22]
  ∩ subtask [May 22, May 29]  = [May 22] = 1 day
  prorated = 10 × (1/5) = 2.0 pts
  load_ratio = 2.0 / 10 = 0.20  → Green (Safe)

Week 2026-05-25 (Mon May 25 – Sun May 31):
  workingDaysInWeek = [May 26, 27, 28, 29]   ← May 25 excluded (holiday)
  ∩ subtask [May 22, May 29]  = all 4 = 4 days
  prorated = 10 × (4/5) = 8.0 pts            ← denominator stays 5, not 4
  load_ratio = 8.0 / 10 = 0.80  → Amber (Full)

Note: the holiday shifts effort from the week it falls in without inflating the ratio —
both numerator and denominator exclude the holiday consistently.
```

---

## Interaction

Clicking any non-empty cell opens a drill-down panel listing every subtask that contributes load to that user × week, including its prorated effort, the parent task/project breadcrumb, and its current status. Clicking the same cell again or the × button closes the panel.
