import { isCalendarDay } from '@danilah/mini-games-kit/core';
import { validateDailyFeed, type DailyFeed } from '../domain/daily';
import { DAILY_CONTENT_VERSION, RULES_VERSION, type LevelDefinition } from '../domain/puzzle';
import { fingerprintPayload } from '../domain/workspace';
import { hashBytes, hashText } from '../local-store/command';

/** These values must come from the host's verified publication, outside the catalog files. */
interface DailyPublication {
  readonly source: string;
  readonly catalogSha256: string;
  readonly verifiedNowMs: number;
}

type ReadCatalogFile = (path: string) => Promise<ArrayBuffer>;
type DailyEntry = DailyFeed['days'][number];
type Slot = Pick<DailyEntry, 'date' | 'feature'> & {
  candidateId: string;
  fingerprint: string;
  sha256: string;
};

const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const named = (value: unknown): value is string => typeof value === 'string' && !!value.trim();
const sha256 = (value: unknown): value is string =>
  typeof value === 'string' && value.length === 64 && /^[a-f0-9]{64}$/.test(value);

function readSlot(value: unknown, month: string, through: string): Slot {
  if (!record(value) || !isCalendarDay(value.date) || !value.date.startsWith(month + '-') || value.date > through ||
      !named(value.candidateId) || !sha256(value.fingerprint) || !sha256(value.sha256)) {
    throw new Error('Invalid published daily slot');
  }
  const { date, candidateId, fingerprint, sha256: digest, feature } = value;
  const slot = { date, candidateId, fingerprint, sha256: digest };
  if (feature === undefined) return slot;
  if (!record(feature) || !named(feature.id) || !named(feature.title)) throw new Error('Invalid published daily event');
  return { ...slot, feature: { id: feature.id, title: feature.title } };
}

function readLevel(value: unknown, candidateId: string): LevelDefinition {
  if (!record(value) || value.id !== candidateId || value.contentVersion !== DAILY_CONTENT_VERSION ||
      typeof value.ordinal !== 'number' || !Number.isSafeInteger(value.ordinal) || value.ordinal < 1 ||
      !named(value.title) || typeof value.width !== 'number' || typeof value.height !== 'number' ||
      typeof value.minimumSwaps !== 'number' || !Array.isArray(value.solvedTileColors) ||
      !value.solvedTileColors.every(color => typeof color === 'string') || !Array.isArray(value.pinnedPositions) ||
      !Array.isArray(value.startTileAtPosition) || 'positions' in value || 'startRecipe' in value) {
    throw new Error('Invalid published daily level');
  }
  const { ordinal, title, width, height, minimumSwaps, solvedTileColors, pinnedPositions, startTileAtPosition } = value;
  return { id: candidateId, contentVersion: DAILY_CONTENT_VERSION, ordinal, title, width, height, minimumSwaps,
    solvedTileColors, pinnedPositions, startTileAtPosition };
}

/** Verify the entire snapshot before returning anything the game can cache. */
export async function readPublishedDailyCatalog(publication: DailyPublication, readFile: ReadCatalogFile): Promise<DailyFeed> {
  const { source, catalogSha256, verifiedNowMs } = publication;
  if (!sha256(catalogSha256)) throw new Error('Invalid published daily catalog identity');
  const feed = { source, version: catalogSha256, verifiedNowMs };
  const cutoff = validateDailyFeed({ ...feed, days: [] });
  const read = async (path: string, expected: string): Promise<unknown> => {
    const bytes = await readFile(path);
    if (await hashBytes(bytes) !== expected) throw new Error(`Daily catalog hash mismatch: ${path}`);
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  };
  const catalog = await read('catalog.json', catalogSha256);
  if (!record(catalog) || catalog.schema !== 1 || catalog.rulesVersion !== RULES_VERSION ||
      !isCalendarDay(catalog.through) || catalog.through > cutoff || !record(catalog.months)) {
    throw new Error('Invalid published daily catalog');
  }
  const { through, months: publishedMonths } = catalog;

  const dates = new Set<string>(), candidates = new Set<string>();
  const months: Slot[][] = [];
  for (const [month, digest] of Object.entries(publishedMonths)) {
    if (!isCalendarDay(month + '-01') || month > through.slice(0, 7) || !sha256(digest)) {
      throw new Error('Invalid published daily month');
    }
    const entries = await read(`months/${month}.json`, digest);
    if (!Array.isArray(entries) || !entries.length) throw new Error('Invalid published daily month');
    const slots = entries.map(entry => {
      const slot = readSlot(entry, month, through);
      if (dates.has(slot.date) || candidates.has(slot.candidateId)) throw new Error('Duplicate published daily slot');
      dates.add(slot.date);
      candidates.add(slot.candidateId);
      return slot;
    });
    months.push(slots);
  }
  const days: DailyEntry[] = [];
  for (const month of months) {
    const loaded = await Promise.all(month.map(async ({ date, candidateId, fingerprint, sha256: digest, feature }) => {
      const level = readLevel(await read(`levels/${digest}.json`, digest), candidateId);
      if (await hashText(fingerprintPayload(level)) !== fingerprint) throw new Error('Daily level fingerprint mismatch');
      return { date, level, ...(feature ? { feature } : {}) };
    }));
    days.push(...loaded);
  }
  const verified = { ...feed, days };
  validateDailyFeed(verified);
  return verified;
}

/** The deployer configures one trusted publication endpoint independently of the snapshots. */
export function configuredDailySource(address: string | undefined): (() => Promise<DailyFeed>) | undefined {
  if (!address) return undefined;
  return async () => {
    const endpoint = new URL(address);
    const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(endpoint.hostname);
    if ((endpoint.protocol !== 'https:' && !(loopback && endpoint.protocol === 'http:')) ||
        endpoint.username || endpoint.password) throw new Error('Invalid daily publication endpoint');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    try {
      const get = async (url: URL, cache: RequestCache) => {
        const response = await fetch(url, { cache, credentials: 'omit', redirect: 'error', signal: controller.signal });
        if (!response.ok) throw new Error('Daily publication unavailable');
        return response;
      };
      const info: unknown = await (await get(endpoint, 'no-store')).json();
      if (!record(info) || !named(info.source) || !sha256(info.catalogSha256) || typeof info.verifiedNowMs !== 'number') {
        throw new Error('Invalid daily publication');
      }
      const snapshot = new URL(`snapshots/${info.catalogSha256}/`, endpoint);
      return await readPublishedDailyCatalog({
        source: info.source, catalogSha256: info.catalogSha256, verifiedNowMs: info.verifiedNowMs,
      }, async path => (await get(new URL(path, snapshot), 'default')).arrayBuffer());
    } finally { clearTimeout(timeout); }
  };
}
