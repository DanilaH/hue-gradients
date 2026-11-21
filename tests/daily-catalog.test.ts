import { expect, test } from 'vitest';
import { readPublishedDailyCatalog } from '../src/app/dailyCatalog';
import { applyDaily } from '../src/domain/daily';
import { getLevel } from '../src/domain/levels';
import { DAILY_CONTENT_VERSION, RULES_VERSION, type LevelDefinition } from '../src/domain/puzzle';
import { fingerprintPayload } from '../src/domain/workspace';
import { hashBytes, hashText } from '../src/local-store/command';

const day = '2026-01-31';
const month = 'months/2026-01.json';
const verifiedNowMs = Date.UTC(2026, 0, 31, 23, 59, 59);
const { ordinal, title, width, height, solvedTileColors, pinnedPositions, startTileAtPosition, minimumSwaps } = getLevel('gradient-001');
const level: LevelDefinition = { id: 'published-level', contentVersion: DAILY_CONTENT_VERSION, ordinal, title,
  width, height, solvedTileColors, pinnedPositions, startTileAtPosition, minimumSwaps };
const encode = (value: unknown) => new TextEncoder().encode(JSON.stringify(value)).buffer;

async function fixture(changes: {
  through?: string;
  date?: string;
  candidateId?: string;
  fingerprint?: string;
  duplicate?: boolean;
  payload?: object;
} = {}) {
  const bytes = encode(changes.payload ?? level);
  const digest = await hashBytes(bytes);
  const slot = { date: changes.date ?? day, candidateId: changes.candidateId ?? level.id,
    fingerprint: changes.fingerprint ?? await hashText(fingerprintPayload(level)), sha256: digest,
    feature: { id: 'warm-day', title: 'Мягкий свет' } };
  const manifest = encode(changes.duplicate ? [slot, slot] : [slot]);
  const catalog = encode({ schema: 1, rulesVersion: RULES_VERSION, through: changes.through ?? day,
    months: { '2026-01': await hashBytes(manifest) } });
  const levelPath = `levels/${digest}.json`;
  const files = new Map([['catalog.json', catalog], [month, manifest], [levelPath, bytes]]);
  const published = { source: 'Local verification', catalogSha256: await hashBytes(catalog), verifiedNowMs };
  const reads: string[] = [];
  const read = async (path: string) => {
    reads.push(path);
    const file = files.get(path);
    if (!file) throw new Error('Unavailable catalog file');
    return file;
  };
  return { published, read, reads, files, levelPath };
}

test('uses the confirmed UTC day independently from the last catalog date', async () => {
  const f = await fixture();
  const verified = await readPublishedDailyCatalog({ ...f.published, verifiedNowMs: Date.UTC(2026, 1, 1) }, f.read);
  expect(verified.days).toEqual([{ date: day, level, feature: { id: 'warm-day', title: 'Мягкий свет' } }]);
  expect(verified.version).toBe(f.published.catalogSha256);
  const progress = applyDaily(undefined, { kind: 'daily-cache', feed: verified })!;
  expect(progress.through).toBe('2026-02-01');
  expect(Object.keys(progress.slots)).toEqual([day]);
});

test.each(['catalog', 'month', 'level'])('rejects modified %s bytes', async part => {
  const f = await fixture();
  const path = part === 'catalog' ? 'catalog.json' : part === 'month' ? month : f.levelPath;
  f.files.set(path, encode({ tampered: true }));
  await expect(readPublishedDailyCatalog(f.published, f.read)).rejects.toThrow('Daily catalog hash mismatch');
});

test('checks the trusted UTC boundary and all dates before fetching level bytes', async () => {
  const ahead = await fixture({ through: '2026-02-01' });
  await expect(readPublishedDailyCatalog(ahead.published, ahead.read)).rejects.toThrow('Invalid published daily catalog');
  expect(ahead.reads).toEqual(['catalog.json']);
  const misplaced = await fixture({ date: '2026-02-01' });
  await expect(readPublishedDailyCatalog(misplaced.published, misplaced.read)).rejects.toThrow('Invalid published daily slot');
  expect(misplaced.reads).toEqual(['catalog.json', month]);
});

test('rejects duplicates, incorrect candidate identity, and a mismatched gameplay fingerprint', async () => {
  const repeated = await fixture({ duplicate: true });
  await expect(readPublishedDailyCatalog(repeated.published, repeated.read)).rejects.toThrow('Duplicate published daily slot');
  const wrongLevel = await fixture({ candidateId: 'other-candidate' });
  await expect(readPublishedDailyCatalog(wrongLevel.published, wrongLevel.read)).rejects.toThrow('Invalid published daily level');
  const wrongFingerprint = await fixture({ fingerprint: '1'.repeat(64) });
  await expect(readPublishedDailyCatalog(wrongFingerprint.published, wrongFingerprint.read)).rejects.toThrow('Daily level fingerprint mismatch');
});

test('rejects a hash-matched level outside the published rules', async () => {
  const f = await fixture({ payload: { ...level, minimumSwaps: level.minimumSwaps + 1 } });
  await expect(readPublishedDailyCatalog(f.published, f.read)).rejects.toThrow('Invalid start minimum');
});
