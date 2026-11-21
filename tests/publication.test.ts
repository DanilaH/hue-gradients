import { expect, test } from 'vitest';
import { PublicationClient, type PublicationPort } from '../src/app/publicationClient';
import { makeField, editorFingerprintPayload } from '../src/domain/editor';
import { type CreativeWork } from '../src/domain/creative';
import { usedPublications } from '../src/domain/publication';
import { RULES_VERSION } from '../src/domain/puzzle';
import { applyAction, decodeWorkspace, newWorkspace, type Action } from '../src/domain/workspace';
import { hashText } from '../src/local-store/command';

async function harness() {
  const field = makeField(), fingerprint = await hashText(editorFingerprintPayload(field));
  const work = (n: number, checked: boolean): CreativeWork => ({
    name: `Работа ${n}`, draftId: `draft-${n}`, workId: `work-${n}`, headNodeId: `node-${n}`,
    provenance: { kind: 'original' }, buffers: {},
    nodes: { [`node-${n}`]: { nodeId: `node-${n}`, field, fingerprint, rulesVersion: RULES_VERSION, seed: 0, parentNodeIds: [] } },
    completions: checked ? [{ nodeId: `node-${n}`, fingerprint, rulesVersion: RULES_VERSION, attemptId: `tested-${n}`,
      assisted: false, moves: 11 }] : [],
  });
  const state = newWorkspace('campaign');
  for (let i = 1; i <= 17; i++) state.creative!.works[`work-${i}`] = work(i, i !== 17);
  const store = { state, async act(action: Action): Promise<boolean> {
    const prior = this.state;
    this.state = applyAction(prior, action, new Map());
    return prior !== this.state;
  } };
  let day = '2026-11-20';
  let lose = false;
  let reportCalls = 0;
  const payloads: { operationId: string; file: File }[] = [];
  const accepted = new Map<string, { operationId: string; id: string; day: string; serverVersion: number }>();
  const port: PublicationPort = {
    async verifiedUtcDay() { return day; },
    async submit(operationId, file) {
      payloads.push({ operationId, file });
      const saved = accepted.get(operationId);
      if (saved) return saved;
      const receipt = { operationId, id: `pub-${accepted.size + 1}`, day, serverVersion: 1 };
      accepted.set(operationId, receipt);
      if (lose) { lose = false; throw new Error('Lost response after acceptance'); }
      return receipt;
    },
    async moderation(id) { return { id, status: 'public', serverVersion: 2 }; },
    async change({ operationId, publicationId: id, kind }) {
      if (kind === 'report') reportCalls++;
      return { operationId, id };
    },
    async feed() {
      return [{ id: 'pub-1', author: '<b>Имя</b>', puzzle: payloads[0]!.file, status: 'public' },
        { id: 'pub-2', author: 'Негодный файл', puzzle: new File(['!'], 'bad.json'), status: 'public' }];
    },
  };
  return { store, client: new PublicationClient(store, port), payloads,
    loseResponse: () => { lose = true; }, tomorrow: () => { day = '2026-11-21'; }, reportCalls: () => reportCalls };
}

test('a lost response retries the exact immutable revision and preserves withdrawals and reports', async () => {
  const h = await harness();
  h.loseResponse();
  await expect(h.client.submit('work-1', 'node-1')).rejects.toThrow('Lost response');
  expect(usedPublications(h.store.state.publication, '2026-11-20')).toBe(0);
  const work = h.store.state.creative!.works['work-1']!;
  work.name = 'Позднее имя';
  const nextField = makeField(5, 4);
  work.nodes.later = { ...work.nodes['node-1']!, nodeId: 'later', parentNodeIds: ['node-1'], field: nextField,
    fingerprint: await hashText(editorFingerprintPayload(nextField)) };
  work.headNodeId = 'later';
  await h.client.submit('work-1', 'node-1');
  expect(h.payloads[0]!.operationId).toBe(h.payloads[1]!.operationId);
  expect(await h.payloads[0]!.file.text()).toBe(await h.payloads[1]!.file.text());
  expect(usedPublications(h.store.state.publication, '2026-11-20')).toBe(1);
  expect(Object.values(h.store.state.publication!.submissions)[0]).toMatchObject({ nodeId: 'node-1', status: 'review' });
  await h.client.update('pub-1');
  expect(Object.values(h.store.state.publication!.submissions)[0]!.status).toBe('public');
  const feed = await h.client.feed();
  expect(feed).toHaveLength(1);
  expect(feed[0]!.author).toBe('<b>Имя</b>');
  await h.client.change('someone-else', 'report', 'Повреждена задача');
  await h.client.change('someone-else', 'report', 'Повреждена задача');
  expect(h.reportCalls()).toBe(1);
  await h.client.change('pub-1', 'withdraw');
  expect(Object.values(h.store.state.publication!.submissions)[0]!.status).toBe('withdrawn');
  expect(decodeWorkspace(JSON.stringify(h.store.state), new Map())).toEqual(h.store.state);
});

test('only verified work consumes the daily quota; the fifteenth counts and a new day opens it again', async () => {
  const h = await harness();
  await h.client.submit('work-17', 'node-17');
  expect(h.payloads).toHaveLength(0);
  for (let i = 1; i <= 16; i++) await h.client.submit(`work-${i}`, `node-${i}`);
  expect(h.payloads).toHaveLength(15);
  expect(usedPublications(h.store.state.publication, '2026-11-20')).toBe(15);
  h.tomorrow();
  await h.client.submit('work-16', 'node-16');
  expect(h.payloads).toHaveLength(16);
  expect(usedPublications(h.store.state.publication, '2026-11-21')).toBe(1);
});
