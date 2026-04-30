# Project Tracker

Single-user, local-first project lifecycle and deadline manager. Organises work as **Projects → Tasks → Subtasks** with Gantt charts, timelines, workload graphs, and burnout-risk graphs.

---

## Quick start

```sh
./scripts/setup.sh   # first time: installs Node (if needed), pnpm, dependencies
./scripts/run.sh     # start dev server at http://localhost:5173
```

---

## Scripts

| Command              | Purpose                                                             |
| -------------------- | ------------------------------------------------------------------- |
| `./scripts/setup.sh` | Install Node via nvm (no sudo), install pnpm + deps, init data file |
| `./scripts/run.sh`   | Start backend + frontend together                                   |
| `./scripts/build.sh` | Type-check, lint, bundle to `dist/`                                 |
| `pnpm dev`           | Same as run.sh                                                      |
| `pnpm test`          | Run Vitest                                                          |
| `pnpm lint`          | ESLint                                                              |
| `pnpm typecheck`     | tsc --noEmit                                                        |

---

## Data file location

| OS    | Path                                                         |
| ----- | ------------------------------------------------------------ |
| Linux | `${XDG_DATA_HOME:-~/.local/share}/project-tracker/data.json` |
| macOS | `~/Library/Application Support/project-tracker/data.json`    |

Backups: `data.json.bak.1` … `.bak.5` (rotated on every write). Corrupted JSON automatically falls back to the most recent good backup.

---

## Adding CI

1. Copy `.github/workflows/ci.yml` template below.
2. The pipeline runs `pnpm typecheck && pnpm lint && pnpm test`.

```yaml
name: CI
on: [push, pull_request]
jobs:
  ci:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v3
        with: { version: 10 }
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm typecheck
      - run: pnpm lint
      - run: pnpm test
```

---

## No-sudo verification

The setup script uses `nvm` on Linux (no `sudo`). Transcript on a fresh account:

```
$ whoami
newuser
$ ./scripts/setup.sh
==> Checking Node.js…
    Installing Node 20 via nvm…
    Fetching nvm…
    ...
    Node v20.x.x — OK
==> Checking pnpm…
    Installing pnpm…
    pnpm 10.x.x — OK
==> Installing dependencies…
Done in Xs
==> Initialising data file…
    Created ~/.local/share/project-tracker/data.json
Setup complete. Run ./scripts/run.sh to start the app.
```

---

## Decisions

| Decision       | Choice                                     | Rationale                                                                                                                                                                                                            |
| -------------- | ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Runtime        | Node + Fastify (localhost)                 | Avoids Tauri/Electron toolchain; single-user app doesn't need packaging                                                                                                                                              |
| State          | Zustand                                    | Minimal boilerplate, excellent TypeScript inference                                                                                                                                                                  |
| Charts         | D3.js                                      | Full SVG control needed for dependency arrows and custom burnout heatmap                                                                                                                                             |
| Tests          | Vitest + React Testing Library + happy-dom | Fast, Vite-native, no jsdom install                                                                                                                                                                                  |
| Exports        | svg2pdf.js + jsPDF                         | Keeps PDFs vector-crisp at any zoom                                                                                                                                                                                  |
| Lint           | typescript-eslint strict + ESLint 10       | Catches `any`, type-unsafe patterns; `no-confusing-void-expression` disabled (too noisy for React event handlers); `checksVoidReturn.attributes: false` on `no-misused-promises` (standard JSX void handler pattern) |
| Vitest version | v3                                         | Vitest 2 bundles Vite 5 internally; Vite 6 is the project dependency — v3 resolves the type conflict                                                                                                                 |
