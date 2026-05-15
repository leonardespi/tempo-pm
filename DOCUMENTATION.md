# Tempo PM — User Documentation

## Table of Contents

1. [What is Tempo PM?](#1-what-is-tempo-pm)
2. [Why Tempo PM?](#2-why-tempo-pm)
3. [Installation & Setup](#3-installation--setup)
4. [Core Concepts](#4-core-concepts)
5. [Navigation & Interface](#5-navigation--interface)
6. [Managing Projects](#6-managing-projects)
7. [Managing Tasks & Subtasks](#7-managing-tasks--subtasks)
8. [Team Members](#8-team-members)
9. [Chart Views](#9-chart-views)
   - [Gantt Chart](#gantt-chart)
   - [Timeline](#timeline)
   - [Workload](#workload)
   - [Burnout Risk](#burnout-risk)
10. [Exporting Reports](#10-exporting-reports)
11. [Settings & Configuration](#11-settings--configuration)
12. [Keyboard Shortcuts & Tips](#12-keyboard-shortcuts--tips)
13. [Benefits for Testing Teams](#13-benefits-for-testing-teams)
14. [Data & Backups](#14-data--backups)

---

## 1. What is Tempo PM?

**Tempo PM** is a local-first, single-installation project management tool built specifically for teams that need visibility into deadlines, workloads, and scheduling risks — without relying on cloud services or third-party subscriptions.

It organizes work in a simple three-level hierarchy:

```
Project
  └── Task
        └── Subtask
```

On top of that structure, Tempo PM provides four chart views — **Gantt, Timeline, Workload, and Burnout Risk** — so you can spot scheduling conflicts, dependency bottlenecks, and overloaded team members at a glance.

> **Screenshot placeholder:** Full-screen Dashboard showing multiple project cards with progress bars and effort summaries. Highlight the progress bar and the "days remaining" badge on each card to show at-a-glance project health.

---

## 2. Why Tempo PM?

### Local-first, zero cloud dependency

All data lives in a single JSON file on your machine (`data/data.json`). There are no accounts to create, no subscriptions to manage, no data sent to external servers.

### Purpose-built for workload visibility

Most project management tools track tasks well but give little insight into _who_ is overwhelmed and _when_. Tempo PM's Burnout Risk view surfaces exactly that: weeks where a team member's assigned effort exceeds their capacity.

### Lightweight and fast

No database engine, no containers. One local server process and a browser. Setup takes under five minutes.

### Ideal for testing teams

QA and testing work is highly time-sensitive: test windows open and close around release dates, effort is hard to estimate, and dependencies on development tasks create scheduling pressure. Tempo PM was designed with this kind of deadline-driven, dependency-heavy work in mind. See [Section 13](#13-benefits-for-testing-teams) for a detailed breakdown.

---

## 3. Installation & Setup

### Requirements

- **macOS** (the setup script targets macOS; Node.js ≥ 20 and pnpm are required)
- **Node.js ≥ 20** — the setup script will install it via Homebrew or nvm if missing
- **pnpm** — installed automatically if not found

### One-command install

```bash
bash scripts/setup.sh
```

This script will:

1. Check and install Node.js ≥ 20 if needed
2. Check and install pnpm if needed
3. Install project dependencies (`pnpm install`)
4. Create `data/data.json` with an empty state if it does not exist
5. Build the production bundle (`pnpm run build`)
6. Write a `tempo-pm` launcher to `~/.local/bin/tempo-pm`

After setup completes, make sure `~/.local/bin` is in your `$PATH`, then run:

```bash
tempo-pm
```

The app opens automatically at `http://127.0.0.1:5173`.

### Launcher flags

| Flag               | Effect                                   |
| ------------------ | ---------------------------------------- |
| `tempo-pm`         | Start production build                   |
| `tempo-pm --dev`   | Start development server with hot reload |
| `tempo-pm --build` | Force rebuild before launching           |
| `tempo-pm --help`  | Show usage                               |

> **Screenshot placeholder:** Terminal window after running `bash scripts/setup.sh`, showing the completion message and the `tempo-pm` command being executed. Highlight the final line that prints the local URL where the app is accessible.

---

## 4. Core Concepts

### Projects

A project is the top-level container. It has a name, optional description, and a mandatory start and end date. The end date drives the "days remaining" counter visible on the Dashboard.

### Tasks

Tasks belong to a project. They represent a body of work (e.g., "Regression Testing", "Smoke Tests"). Tasks can be assigned an owner and can declare **dependencies** on other tasks in the same project (finish-to-start). Tempo PM detects circular dependencies and schedule conflicts automatically.

### Subtasks

Subtasks are the atomic unit of work. They belong to a task and must have start/end dates and an **effort score** (0–100+ points). Subtasks also have a **status**:

| Status        | Meaning                               |
| ------------- | ------------------------------------- |
| `not_started` | Work has not begun                    |
| `in_progress` | Actively being worked on              |
| `blocked`     | Cannot proceed — waiting on something |
| `done`        | Complete                              |

The effort score feeds directly into the Workload and Burnout Risk charts.

### Users (Team Members)

Users are the people doing the work. Each user has a name, an optional email, a color tag (used in charts), and a **weekly capacity** (hours per week). The capacity value is what Tempo PM measures actual effort against to detect overload.

### Working Days

In Settings, you can configure which days of the week are working days and mark specific holiday dates. All date calculations (working days remaining, effort distribution) respect this calendar.

---

## 5. Navigation & Interface

### Sidebar

The left sidebar contains all navigation items. The top section links to global views (Dashboard, Gantt, Timeline, Workload, Burnout Risk, Team Members, Settings). Below that, the five most recently created projects appear as quick links.

The sidebar can be collapsed by clicking the toggle arrow to give more horizontal space to charts.

> **Screenshot placeholder:** App with the sidebar expanded and collapsed side by side, or an animated GIF. Highlight the collapse toggle button and the "Recent Projects" section in the sidebar to show quick access.

### Command Palette

Press **Cmd+K** (macOS) or **Ctrl+K** (Windows/Linux) from anywhere in the app to open the Command Palette. Start typing to fuzzy-search across:

- Navigation pages
- Project names
- Task names
- Subtask names

Pressing Enter or clicking a result navigates directly to it.

> **Screenshot placeholder:** Command palette open with a search query typed in, showing results across projects and tasks. Highlight the search input field and the matched results beneath it with their type labels (Project, Task, Subtask).

### Themes

The interface supports **Light**, **Dark**, and **System** themes. Switch between them via the sun/moon icon in the sidebar or via Settings.

> **Screenshot placeholder:** Side-by-side of the Dashboard in Light and Dark mode. Highlight the theme toggle in the sidebar.

---

## 6. Managing Projects

### Creating a Project

From the Dashboard, click **New Project** (or press **N**). Fill in:

- **Name** — Required
- **Description** — Optional, displayed on the Dashboard card
- **Start Date** and **End Date** — Required; drive the schedule display in charts

> **Screenshot placeholder:** The "New Project" modal with all fields filled in. Highlight the Start Date and End Date fields, explaining these feed the Gantt chart and the "days remaining" counter.

### Dashboard Overview

Each project card on the Dashboard shows:

- Project name and description
- **Progress bar** — percentage of subtasks marked `done`
- Subtask completion count (e.g., "4 / 12 done")
- Total effort points across all subtasks
- **Days remaining** to the project end date (turns red when under 7 days)

> **Screenshot placeholder:** A single project card on the Dashboard with annotations. Draw arrows to: (1) the progress bar, (2) the subtask count, (3) the effort total, (4) the days-remaining badge when it is red.

### Deleting a Project

Click the trash icon on the project card. Deleting a project removes all its tasks and subtasks.

---

## 7. Managing Tasks & Subtasks

### Opening a Project

Click the project name or card on the Dashboard to open the **Project Detail** view.

> **Screenshot placeholder:** The Project Detail page with a list of tasks, each task expanded to show subtasks. Highlight the expand/collapse toggle on a task row and the "Add Task" button.

### Adding a Task

Click **Add Task** at the bottom of the task list. Enter the task name. The task appears collapsed by default; click it to expand and add subtasks.

### Task Dependencies

Within a task's settings, you can select one or more other tasks as dependencies (finish-to-start). Tempo PM will:

- **Prevent circular dependencies** — if adding a dependency would create a cycle, it is blocked
- **Warn about schedule conflicts** — if the task's start date is before a dependency's end date, a warning badge appears

> **Screenshot placeholder:** A task with a dependency configured, showing the dependency arrow in the Gantt chart. Highlight the warning badge that appears when there is a schedule conflict, and annotate the dependency arrow in the Gantt.

### Adding Subtasks

With a task expanded, click **Add Subtask**. Fill in:

| Field         | Required | Notes                                       |
| ------------- | -------- | ------------------------------------------- |
| Name          | Yes      |                                             |
| Start Date    | Yes      |                                             |
| End Date      | Yes      |                                             |
| Assignee      | No       | Pick from team members                      |
| Effort Points | Yes      | 0–100+ scale; feeds workload/burnout charts |
| Status        | Yes      | Defaults to `not_started`                   |

> **Screenshot placeholder:** The "Add Subtask" modal with all fields filled in. Highlight the Effort Points field and add a tooltip-style annotation explaining it is the key input for the Workload and Burnout charts.

### Editing and Deleting

Click any field on a task or subtask row to edit it inline. Click the trash icon to delete. Deleting a task removes its subtasks. Removing a task that other tasks depend on also cleans up those dependency references.

---

## 8. Team Members

Go to **Team Members** in the sidebar to manage your team.

### Adding a Team Member

Click **Add Member** and fill in:

| Field           | Required | Notes                                                           |
| --------------- | -------- | --------------------------------------------------------------- |
| Name            | Yes      |                                                                 |
| Email           | No       | For display only                                                |
| Color           | Yes      | Hex color used in charts; duplicates are blocked                |
| Weekly Capacity | Yes      | Hours per week; used to calculate overload in the Burnout chart |

> **Screenshot placeholder:** The Team Members page showing a list of members, each with their color swatch, name, and weekly capacity. Highlight the color swatch column and the weekly capacity column.

### Why Weekly Capacity Matters

The Burnout Risk chart divides a team member's assigned effort for a given week by their weekly capacity to produce a **load ratio**. A ratio above 1.0 means the person is overloaded that week. Setting accurate capacity values is therefore important for meaningful burnout risk analysis.

---

## 9. Chart Views

All chart views (except Timeline) are accessible from the sidebar and can be filtered by project and/or team member. Each chart has export buttons for PNG and PDF.

### Gantt Chart

**Navigate to:** Sidebar → Gantt

The Gantt chart shows all projects and their tasks/subtasks as horizontal bars on a time axis. It is the primary view for understanding your schedule at a glance.

**What you can see:**

- **Bar length** — duration from start to end date
- **Bar color** — matches the assigned team member's color tag
- **Dependency arrows** — lines connecting bars where one task must finish before another starts
- **Conflict highlights** — bars turn red when a task starts before its dependency ends
- **Zoom levels** — switch between Day, Week, and Month resolution

> **Screenshot placeholder:** The Gantt chart showing a project with multiple tasks, dependency arrows, and at least one red conflict bar. Highlight: (1) a dependency arrow between two bars, (2) a red conflict bar, (3) the zoom level controls, (4) a legend entry showing the team member color.

**Filtering**

Use the project dropdown at the top to show only one project's tasks, or show all projects at once.

### Timeline

**Navigate to:** Sidebar → Timeline

The Timeline view lists all subtask start and end events in chronological order. It is useful for answering "what is starting or ending this week?"

- Each event row shows the subtask name, its project and task context, the date, and the assignee
- Filter by project and/or team member
- Events are color-coded by assignee

> **Screenshot placeholder:** The Timeline page showing a list of events across several days, with color-coded assignee labels. Highlight the filter dropdowns at the top and show that selecting a team member filters down to their events only.

### Workload

**Navigate to:** Sidebar → Workload

The Workload chart shows a stacked bar chart of effort points per week, broken down by team member. It answers "how much work is assigned each week, and who owns it?"

**Options:**

- **Day / Week toggle** — switch between daily and weekly granularity
- **Prorate Effort** — when enabled, distributes a subtask's effort evenly across the working days it spans, rather than loading it all into the start week
- **Filter by project / member**

> **Screenshot placeholder:** The Workload chart with stacked bars in multiple colors (one per team member). Highlight the "Prorate Effort" toggle and show how turning it on smooths the bars from spiky peaks to even distributions across weeks.

### Burnout Risk

**Navigate to:** Sidebar → Burnout Risk

The Burnout chart is a heatmap with **team members as rows** and **weeks as columns**. Each cell's color represents the load ratio for that person in that week:

| Color           | Load Ratio | Meaning              |
| --------------- | ---------- | -------------------- |
| Light / no fill | < 50%      | Well within capacity |
| Yellow-orange   | 50–100%    | Approaching capacity |
| Red             | > 100%     | Overloaded           |

Hovering over a cell shows a tooltip with the list of subtasks contributing to that week's load.

> **Screenshot placeholder:** The Burnout chart heatmap with at least one red cell visible. Highlight: (1) the red cell, (2) the open tooltip showing the contributing subtasks, (3) the row labels (team member names) on the left, (4) the week columns at the top. Add an annotation explaining that a red cell means this person is over capacity that week.

**Why this matters for testing teams**

Testing sprints are often compressed at the end of a release cycle. The Burnout view makes it immediately visible when a QA engineer has more effort assigned than their capacity allows, so the team can redistribute work _before_ the sprint begins rather than discovering the overload mid-sprint.

---

## 10. Exporting Reports

Each chart view has per-chart export buttons:

| Format | Output                                                                      |
| ------ | --------------------------------------------------------------------------- |
| PNG    | Raster image at 2× resolution, suitable for embedding in documents or Slack |
| PDF    | Vector PDF, suitable for printing or archiving                              |

The **Export All** button (available on the Project Detail page and Dashboard) generates a **multi-page PDF** containing all chart views for a selected project in a single file. This is useful for weekly status reports or sprint retrospectives.

> **Screenshot placeholder:** The Export All button on the Project Detail page, and an example of the multi-page PDF opened in a PDF viewer showing the Gantt, Timeline, Workload, and Burnout pages side by side. Highlight the Export All button and annotate that clicking it generates one PDF with all views.

---

## 11. Settings & Configuration

**Navigate to:** Sidebar → Settings

### Theme

Choose between **Light**, **Dark**, and **System** (follows your OS dark-mode setting).

### Non-Working Days

Configure the working calendar that Tempo PM uses for all date math:

- **Weekends** — check/uncheck individual days of the week
- **Holidays** — add specific dates (YYYY-MM-DD format) that should be treated as non-working

All "days remaining" counts, working-day calculations in the Workload chart, and effort prorating respect this calendar.

> **Screenshot placeholder:** The Settings page with the Holidays section showing a few dates added. Highlight the holiday input and the weekday checkboxes, with an annotation explaining these dates are excluded from working-day calculations.

### Daily Capacity

The number of working hours per day used as a baseline when prorating effort. Default is 8.

### Data Management

- **Download Backup** — saves the current `data.json` to your Downloads folder
- **Import from Backup** — upload a previously exported JSON file to restore a saved state

---

## 12. Keyboard Shortcuts & Tips

| Shortcut           | Action                                                            |
| ------------------ | ----------------------------------------------------------------- |
| `N`                | Create new project (on Dashboard) or new task (on Project Detail) |
| `Cmd+K` / `Ctrl+K` | Open Command Palette                                              |
| `Esc`              | Close modal or Command Palette                                    |

**Tips:**

- Use the Command Palette to jump directly to any project or task without navigating through the Dashboard first.
- Collapse tasks you are not actively working on in the Project Detail view to reduce visual noise.
- Add effort points to every subtask, even rough estimates. The Workload and Burnout charts are only as accurate as the effort data you provide.
- Set team member weekly capacity values carefully — they are the denominator in every burnout calculation.
- Export All PDFs at the start of each sprint as a baseline, and again at the end to compare planned vs. actual state.

---

## 13. Benefits for Testing Teams

Testing teams face a specific set of project management challenges that Tempo PM addresses directly:

### 1. Test windows are time-boxed and sequential

Testing can only start after development hands off a build. Tempo PM's **task dependencies** let you model this explicitly: a "Regression Testing" task can declare a dependency on a "Development Complete" task, and the Gantt chart will warn you immediately if the testing task is scheduled to start before the development task is done.

> **Screenshot placeholder:** Gantt chart showing a "Development" task and a "Regression Testing" task connected by a dependency arrow. Highlight the conflict warning badge if the testing start date overlaps with the development end date. Annotate the arrow to show it represents "finish-to-start."

### 2. QA capacity is finite and often shared across projects

When the same QA engineers work across multiple concurrent projects, it is easy to accidentally over-assign them. The **Burnout Risk heatmap** makes this visible in one view: any week where an engineer appears red means they have been assigned more effort points than their weekly capacity allows.

> **Screenshot placeholder:** Burnout heatmap with one QA engineer row showing red cells in weeks overlapping two projects. Highlight the red cells and the row label showing the engineer's name. Annotate that this view reveals the double-booking at a glance.

### 3. Effort estimation drives sprint planning

Testing effort is often underestimated. By assigning **effort points** to every test case or test suite (as a subtask), the **Workload chart** shows the cumulative effort demand per week. The team can compare this against total team capacity visually and adjust scope or timelines accordingly.

> **Screenshot placeholder:** Workload chart showing a week with a very tall stacked bar approaching the visible capacity threshold. Highlight the week and annotate that the height of the bar represents total effort demand for that week.

### 4. Status tracking prevents stale test plans

Subtask statuses (`not_started`, `in_progress`, `blocked`, `done`) surface in the Project Detail view and in the Gantt chart. A subtask in `blocked` status is visually distinct, prompting the team to address the blocker. The Dashboard progress bar reflects `done` subtasks, giving stakeholders a real-time completion percentage without requiring manual status reports.

> **Screenshot placeholder:** Project Detail view with a subtask showing "blocked" status badge in red/orange. Highlight the status dropdown and the blocked badge. Add an annotation: "Status changes here are reflected immediately in the Dashboard progress bar."

### 5. Export for stakeholder communication

At the end of a sprint or before a release, testing teams need to communicate progress to stakeholders quickly. The **Export All** feature generates a single multi-page PDF with Gantt, Timeline, Workload, and Burnout views — ready to attach to a report or share in a meeting without any manual copy-pasting.

> **Screenshot placeholder:** The multi-page PDF export open in a PDF viewer, showing the Gantt page and the Burnout page side by side. Highlight the page navigator on the left panel of the PDF viewer to show all four pages are present.

### 6. Dependency-aware schedule conflict detection

When a development task slips and its end date is pushed out, any testing task that depends on it may now have a conflict. Tempo PM shows a **conflict warning** on the dependent task so the QA lead sees the impact immediately and can replan before the sprint begins.

> **Screenshot placeholder:** Project Detail page showing a task row with a yellow schedule-conflict warning icon next to the task name. Highlight the warning icon and add an annotation: "This warning appears automatically when this task's start date is earlier than its dependency's end date."

---

## 14. Data & Backups

### Storage Location

All application data is stored in:

```
<project-directory>/data/data.json
```

### Automatic Rolling Backups

Every time data is saved, Tempo PM keeps the five most recent versions:

```
data/data.json       ← current
data/data.json.bak.1 ← previous save
data/data.json.bak.2
data/data.json.bak.3
data/data.json.bak.4
data/data.json.bak.5
```

If `data.json` becomes corrupted on startup, Tempo PM automatically restores from the most recent good backup and displays a notification.

### Manual Export & Import

In **Settings → Data Management**:

- **Download Backup** — downloads the current state as a JSON file
- **Import from Backup** — replaces current data with the contents of a JSON backup file

> **Note:** Importing from backup replaces all current data. Download a current backup first if you want to preserve your existing state.

---

_Tempo PM is open source and licensed under MIT. For issues and contributions, see the project repository._
