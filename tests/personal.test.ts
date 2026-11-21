import { expect, test } from 'vitest';
import { activePersonal, personalDuration, personalLevel, personalTaskName, taskKey, validatePersonal } from '../src/domain/personal';
import { chapters, levels } from '../src/domain/levels';
import { chapterIsOpen } from '../src/domain/progression';
import { applyAction, newWorkspace, type Workspace } from '../src/domain/workspace';

const fingerprints = new Map(levels.map(level => [level.id, level.id.padEnd(64, 'f')]));
const issue = (state: Workspace, day: string) => applyAction(state, { kind: 'personal-issue', day }, fingerprints);
const day = '2026-11-25';

function clear(ids: readonly string[]): Workspace {
  let state = newWorkspace('campaign');
  for (const id of ids) {
    state = applyAction(state, { kind: 'open', levelId: id, attemptId: 'clear:' + id }, fingerprints);
    const order = [...state.attempts[id]!.board];
    for (const [to, tile] of order.entries()) {
      if (tile === to) continue;
      const from = order.indexOf(to);
      state = applyAction(state, { kind: 'swap', from, to, attemptId: state.attempts[id]!.attemptId }, fingerprints);
      [order[from], order[to]] = [order[to]!, order[from]!];
    }
  }
  return state;
}

test('four consecutive days rotate both starter goals while previously issued boards remain fixed', () => {
  const dates = ['2026-11-21', '2026-11-22', '2026-11-23', '2026-11-24'];
  const state = dates.reduce(issue, newWorkspace('starter'));
  const tasks = state.personalProgress!.tasks;
  expect(Object.keys(tasks)).toHaveLength(8);
  for (const kind of ['present', 'future'] as const) {
    expect(new Set(dates.map(date => tasks[taskKey(date, kind)]!.levelId)).size).toBe(4);
  }
  expect(issue(state, dates[0]!).personalProgress?.tasks).toEqual(tasks);
  expect(state.completed).toEqual([]);
});

test('30 ideal victories offer a repeat and an unsolved goal after every chapter has opened', () => {
  const campaign = clear(chapters.slice(0, 3).flatMap(chapter => chapter.levelIds.slice(0, 10)));
  expect(campaign.completed).toHaveLength(30);
  expect(chapters.every((_, index) => chapterIsOpen(campaign, index))).toBe(true);
  expect(campaign.completed.every(id => campaign.bests[id]?.clean === personalLevel(id).minimumSwaps)).toBe(true);
  const plan = issue(campaign, day);
  const { tasks } = plan.personalProgress!;
  const past = tasks[taskKey(day, 'past')]!;
  expect(personalTaskName(past)).toBe('Повторить рекорд');
  expect(past.limit).toBe(personalLevel(past.levelId).minimumSwaps);
  expect(campaign.completed).not.toContain(tasks[taskKey(day, 'future')]?.levelId);
  expect(new Set(Object.values(tasks).map(task => task.levelId)).size).toBe(3);
  const completed = clear(levels.map(level => level.id));
  expect(Object.values(issue(completed, day).personalProgress!.tasks).map(task => task.kind)).toEqual(['past', 'present']);
});

test('a corrected civil date returns to its issued contracts and does not award the same task twice', () => {
  let state = issue(clear(['gradient-001']), day);
  const key = taskKey(day, 'past');
  const issued = state.personalProgress!.tasks[key]!;
  for (const attemptId of ['record', 'replay']) {
    state = applyAction(state, { kind: 'personal-open', key, restart: true, now: 0, attemptId }, fingerprints);
    state = applyAction(state, { kind: 'personal-swap', from: 1, to: 2, attemptId, now: 0 }, fingerprints);
    expect(activePersonal(state.personalProgress)?.status).toBe('won');
    state = applyAction(state, { kind: 'personal-leave', now: 0 }, fingerprints);
  }
  const future = issue(state, '2026-12-01');
  const restored = issue(future, day);
  expect(restored.personalProgress?.day).toBe(day);
  expect(restored.personalProgress?.tasks).toEqual(future.personalProgress?.tasks);
  expect(restored.personalProgress?.tasks[key]).toMatchObject(issued);
  expect(restored.personalProgress?.earned).toEqual([key]);
  validatePersonal(JSON.parse(JSON.stringify(restored.personalProgress)));
});

test('available finale takes the timed slot once, with a different allowance from its normal board', () => {
  const campaign = clear(chapters[0]!.levelIds);
  const task = issue(campaign, day).personalProgress!.tasks[taskKey(day, 'present')]!;
  expect(task.levelId).toBe('finale-v1-1');
  expect(task.durationMs).toBe(personalDuration(personalLevel(task.levelId)));
  expect(task.durationMs).toBeGreaterThan(personalDuration(personalLevel('gradient-015')));
  expect(personalDuration(personalLevel('gradient-015'))).toBeGreaterThan(personalDuration(personalLevel('gradient-001')));
});

test('legacy task contracts survive policy change without losing the old active day', () => {
  const modern = issue(newWorkspace('legacy'), day);
  const present = taskKey(day, 'present');
  const original = { ...modern.personalProgress!.tasks[present]!, durationMs: 45_000 };
  const old = { ...modern, personalProgress: { ...modern.personalProgress!, policy: 'personal-v1' as const,
    tasks: { ...modern.personalProgress!.tasks, [present]: original } } };
  validatePersonal(old.personalProgress);
  const advanced = issue(old, '2026-12-01');
  expect(advanced.personalProgress?.policy).toBe('personal-v2');
  expect(issue(advanced, day).personalProgress?.tasks[present]).toEqual(original);
});
