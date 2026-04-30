import fs from 'node:fs/promises';
import path from 'node:path';

export type AppData = {
  projects: unknown[];
  tasks: unknown[];
  subtasks: unknown[];
  users: unknown[];
  workingDays: { weekends: number[]; holidays: string[] };
  settings: { theme: string };
};

export const DEFAULT_DATA: AppData = {
  projects: [],
  tasks: [],
  subtasks: [],
  users: [],
  workingDays: { weekends: [0, 6], holidays: [] },
  settings: { theme: 'system' },
};

export const MAX_BACKUPS = 5;

export function getDataDir(override?: string): string {
  if (override) return override;
  return path.join(process.cwd(), 'data');
}

export function getDataPath(dirOverride?: string): string {
  return path.join(getDataDir(dirOverride), 'data.json');
}

export async function ensureDataDir(dirOverride?: string): Promise<void> {
  await fs.mkdir(getDataDir(dirOverride), { recursive: true });
}

export async function readData(
  dirOverride?: string,
): Promise<{ data: AppData; usedBackup: number | null }> {
  const dataPath = getDataPath(dirOverride);
  try {
    const raw = await fs.readFile(dataPath, 'utf-8');
    return { data: JSON.parse(raw) as AppData, usedBackup: null };
  } catch {
    for (let i = 1; i <= MAX_BACKUPS; i++) {
      try {
        const backupPath = `${dataPath}.bak.${i}`;
        const raw = await fs.readFile(backupPath, 'utf-8');
        return { data: JSON.parse(raw) as AppData, usedBackup: i };
      } catch {
        // try next
      }
    }
    return { data: { ...DEFAULT_DATA }, usedBackup: null };
  }
}

export async function writeData(data: AppData, dirOverride?: string): Promise<void> {
  await ensureDataDir(dirOverride);
  const dataPath = getDataPath(dirOverride);
  const tmpPath = `${dataPath}.tmp`;

  // Write to a temp file first so data.json is never absent during the swap
  await fs.writeFile(tmpPath, JSON.stringify(data, null, 2), 'utf-8');

  // Rotate backups: bak.(N-1)→bak.N, …, bak.1→bak.2
  for (let i = MAX_BACKUPS - 1; i >= 1; i--) {
    const src = `${dataPath}.bak.${i}`;
    const dst = `${dataPath}.bak.${i + 1}`;
    try {
      await fs.rename(src, dst);
    } catch {
      /* missing — skip */
    }
  }
  // Promote current data.json to bak.1 (copy, keep original readable)
  try {
    await fs.copyFile(dataPath, `${dataPath}.bak.1`);
  } catch {
    /* first write — skip */
  }

  // Atomic swap: tmp → data.json (POSIX rename is atomic)
  await fs.rename(tmpPath, dataPath);
}
