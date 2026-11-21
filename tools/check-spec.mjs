import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';

const root = new URL('../docs/spec/', import.meta.url);
const manifest = JSON.parse(await readFile(new URL('manifest.json', root), 'utf8'));
for (const entry of manifest.files) {
  const bytes = await readFile(new URL(entry.path, root));
  assert.equal(bytes.length, entry.bytes, `${entry.path}: size`);
  assert.equal(createHash('sha256').update(bytes).digest('hex'), entry.sha256, `${entry.path}: hash`);
}
assert.equal(manifest.requirementCount, 71);
console.info(`Specification integrity: ${manifest.files.length} exact files, ${manifest.requirementCount} requirements. Runtime acceptance is separate.`);
