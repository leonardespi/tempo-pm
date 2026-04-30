# Tempo

Single-user, local-first project lifecycle and deadline manager. Organises work as **Projects → Tasks → Subtasks** with Gantt charts, timelines, workload graphs, and burnout-risk graphs.

---

## Setup (first time)

Run the setup script once. It checks for Node.js ≥ 20 and pnpm, installs them if missing, installs project dependencies, initialises the data file, builds the app, and registers the `tempo-pm` CLI command in `~/.local/bin`.

```sh
bash scripts/setup.sh
```

That's it. You'll see a summary when it's done:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Tempo is ready!
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  tempo-pm             launch (rebuilds if dist/ missing)
  tempo-pm --build     force rebuild, then launch
  tempo-pm --dev       dev mode with hot reload
  tempo-pm --help      show options
```

---

## Running Tempo

After setup, use the `tempo-pm` command from any terminal:

```sh
tempo-pm
```

This starts the Fastify API server and the Vite preview server, then opens `http://localhost:4173` in your browser automatically. Press `Ctrl+C` to stop both servers.

### All options

| Command            | What it does                                              |
| ------------------ | --------------------------------------------------------- |
| `tempo-pm`         | Launch production build; rebuilds automatically if needed |
| `tempo-pm --build` | Force a full rebuild before launching                     |
| `tempo-pm --dev`   | Start in dev mode with hot reload (no build required)     |
| `tempo-pm --help`  | Show usage                                                |

---

## Tutorial

### 1. Create a project

Open Tempo (`tempo-pm`) and click **New Project** on the dashboard. Fill in a name, start date, and end date.

### 2. Add tasks

Open the project, then click **Add task**. Each task has a name, assignee, effort points, start and end dates, and optional dependencies on other tasks.

### 3. Add subtasks

Expand any task and click **Add subtask**. Subtasks carry their own start/end dates and status (`not_started`, `in_progress`, `blocked`, `done`).

### 4. Explore the views

Use the sidebar to switch between views:

- **Projects** — dashboard of all active projects
- **Gantt** — horizontal bar chart with dependency arrows; zoom between day / week / month
- **Timeline** — chronological list of subtask start and end events
- **Workload** — effort points per assignee per week
- **Burnout Risk** — heatmap highlighting overloaded team members
- **Team** — manage users and their colour tags

### 5. Export

Each chart view has an **Export** button. You can download individual charts as PDF or PNG, or export all views as a single multi-page PDF.

### 6. Settings

- Toggle **light / dark / system** theme
- Configure which days are non-working weekends
- Download a full JSON snapshot of your data as a backup

---

## Development

```sh
tempo-pm --dev       # hot-reload dev server at http://localhost:5173
pnpm test            # Vitest
pnpm lint            # ESLint
pnpm typecheck       # tsc --noEmit
```

---

## Data

Your data lives in `<app-dir>/data/data.json`. Tempo keeps rolling backups (`data.json.bak.1` … `.bak.5`) rotated on every write. If the main file is corrupted, restart the server and it will fall back to the most recent good backup automatically.

---

## Decisions

| Decision | Choice                                     | Rationale                                                                |
| -------- | ------------------------------------------ | ------------------------------------------------------------------------ |
| Runtime  | Node + Fastify (localhost)                 | Avoids Tauri/Electron toolchain; single-user app doesn't need packaging  |
| State    | Zustand                                    | Minimal boilerplate, excellent TypeScript inference                      |
| Charts   | D3.js                                      | Full SVG control needed for dependency arrows and custom burnout heatmap |
| Tests    | Vitest + React Testing Library + happy-dom | Fast, Vite-native                                                        |
| Exports  | svg2pdf.js + jsPDF                         | Keeps PDFs vector-crisp at any zoom                                      |
| Lint     | typescript-eslint strict + ESLint 10       | Catches `any` and type-unsafe patterns                                   |
