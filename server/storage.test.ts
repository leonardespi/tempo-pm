import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { readData, writeData, getDataPath, DEFAULT_DATA, MAX_BACKUPS } from './storage.js';
import type { AppData } from './storage.js';

const SAMPLE: AppData = {
  projects: [{ id: 'p1', name: 'Test Project' }],
  tasks: [],
  subtasks: [],
  users: [],
  workingDays: { weekends: [0, 6], holidays: [] },
  settings: { theme: 'dark' },
};

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'tracker-test-'));
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe('readData', () => {
  it('returns default data when no file exists', async () => {
    const { data, usedBackup } = await readData(tmpDir);
    expect(data).toEqual(DEFAULT_DATA);
    expect(usedBackup).toBeNull();
  });

  it('reads and parses a valid data file', async () => {
    await fs.writeFile(getDataPath(tmpDir), JSON.stringify(SAMPLE), 'utf-8');
    const { data, usedBackup } = await readData(tmpDir);
    expect(data.settings.theme).toBe('dark');
    expect(usedBackup).toBeNull();
  });

  it('falls back to backup 1 when main file is corrupt JSON', async () => {
    await fs.writeFile(getDataPath(tmpDir), '{broken json', 'utf-8');
    await fs.writeFile(`${getDataPath(tmpDir)}.bak.1`, JSON.stringify(SAMPLE), 'utf-8');
    const { data, usedBackup } = await readData(tmpDir);
    expect(data.settings.theme).toBe('dark');
    expect(usedBackup).toBe(1);
  });

  it('skips corrupt backups and uses the next good one', async () => {
    await fs.writeFile(getDataPath(tmpDir), '{bad', 'utf-8');
    await fs.writeFile(`${getDataPath(tmpDir)}.bak.1`, 'also bad', 'utf-8');
    await fs.writeFile(`${getDataPath(tmpDir)}.bak.2`, 'still bad', 'utf-8');
    const good: AppData = { ...SAMPLE, settings: { theme: 'light' } };
    await fs.writeFile(`${getDataPath(tmpDir)}.bak.3`, JSON.stringify(good), 'utf-8');
    const { data, usedBackup } = await readData(tmpDir);
    expect(data.settings.theme).toBe('light');
    expect(usedBackup).toBe(3);
  });

  it('returns default when all backups are missing or corrupt', async () => {
    await fs.writeFile(getDataPath(tmpDir), 'not json', 'utf-8');
    const { data, usedBackup } = await readData(tmpDir);
    expect(data).toEqual(DEFAULT_DATA);
    expect(usedBackup).toBeNull();
  });
});

describe('writeData', () => {
  it('creates data.json on first write', async () => {
    await writeData(SAMPLE, tmpDir);
    const raw = await fs.readFile(getDataPath(tmpDir), 'utf-8');
    expect(JSON.parse(raw)).toMatchObject({ settings: { theme: 'dark' } });
  });

  it('creates bak.1 on second write (rotation)', async () => {
    const v1: AppData = { ...SAMPLE, settings: { theme: 'light' } };
    await writeData(v1, tmpDir);
    await writeData(SAMPLE, tmpDir);
    const bak = await fs.readFile(`${getDataPath(tmpDir)}.bak.1`, 'utf-8');
    expect(JSON.parse(bak)).toMatchObject({ settings: { theme: 'light' } });
  });

  it(`keeps at most ${MAX_BACKUPS} backups`, async () => {
    // Write MAX_BACKUPS+2 times so the rotation fills up
    for (let i = 0; i < MAX_BACKUPS + 2; i++) {
      await writeData({ ...SAMPLE, settings: { theme: `v${i}` } }, tmpDir);
    }
    // bak.MAX_BACKUPS should exist; bak.MAX_BACKUPS+1 should not
    await expect(fs.access(`${getDataPath(tmpDir)}.bak.${MAX_BACKUPS}`)).resolves.toBeUndefined();
    await expect(fs.access(`${getDataPath(tmpDir)}.bak.${MAX_BACKUPS + 1}`)).rejects.toThrow();
  });

  it('round-trips data faithfully', async () => {
    await writeData(SAMPLE, tmpDir);
    const { data } = await readData(tmpDir);
    expect(data).toEqual(SAMPLE);
  });
});
