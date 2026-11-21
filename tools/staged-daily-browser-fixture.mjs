import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

export async function stagedFeed(directory, time = '00:00:00') {
  const files = {};
  const levelPaths = {};
  const read = async (path, hash) => {
    const bytes = await readFile(join(directory, path));
    if (hash) assert.equal(createHash('sha256').update(bytes).digest('hex'), hash);
    files[path] = [...bytes];
    return JSON.parse(bytes);
  };
  const manifest = await read('catalog.json');
  const days = [];
  for (const [month, digest] of Object.entries(manifest.months)) {
    for (const { date, candidateId, sha256, feature } of await read(`months/${month}.json`, digest)) {
      const path = levelPaths[date] = `levels/${sha256}.json`;
      const level = await read(path, sha256);
      assert.equal(level.id, candidateId);
      days.push({ date, level, ...(feature ? { feature } : {}) });
    }
  }
  return { publication: { source: 'Staged authored bank (test UTC clock)',
    catalogSha256: createHash('sha256').update(Buffer.from(files['catalog.json'])).digest('hex'),
    verifiedNowMs: Date.parse(`${manifest.through}T${time}Z`) }, through: manifest.through, days, files, levelPaths };
}
