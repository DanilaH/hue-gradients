import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

export async function stagedFeed(directory, version, time = '00:00:00') {
  const read = async (path, hash) => {
    const bytes = await readFile(join(directory, path));
    if (hash) assert.equal(createHash('sha256').update(bytes).digest('hex'), hash);
    return JSON.parse(bytes);
  };
  const manifest = await read('catalog.json');
  const days = [];
  for (const [month, digest] of Object.entries(manifest.months)) {
    for (const { date, candidateId, sha256, feature } of await read(`months/${month}.json`, digest)) {
      const level = await read(`levels/${sha256}.json`, sha256);
      assert.equal(level.id, candidateId);
      days.push({ date, level, ...(feature ? { feature } : {}) });
    }
  }
  return { source: 'Staged authored bank (test UTC clock)', version, through: manifest.through,
    verifiedNowMs: Date.parse(`${manifest.through}T${time}Z`), days };
}
