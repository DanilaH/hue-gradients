import { expect, test } from 'vitest';
import { activePersonal, taskKey, validatePersonal } from '../src/domain/personal';
import { levels } from '../src/domain/levels';
import { applyAction, newWorkspace, type Workspace } from '../src/domain/workspace';

const day = '2026-11-20';
const first = levels[0]!.id;
const fingerprints = new Map(levels.map(level => [level.id, 'a'.repeat(64)]));
const apply = (state: Workspace, action: Parameters<typeof applyAction>[1]) => applyAction(state, action, fingerprints);
const issue = (state: Workspace, day: string) => apply(state, { kind: 'personal-issue', day });

test('a local plan depends on progress and avoids repeats when candidates remain', () => {
  const initial = newWorkspace('initial');
  const starter = issue(initial, day);
  expect(Object.values(starter.personalProgress!.tasks).map(task => task.kind)).toEqual(['present', 'future']);
  expect(starter.personalProgress!.tasks[taskKey(day, 'future')]!.levelId).toBe('gradient-016');
  expect(issue(starter, day)).toBe(starter);
  const progressed = apply(initial, { kind: 'help', attemptId: 'initial', assistance: { kind: 'auto' } });
  const plan = issue(progressed, day);
  const task = plan.personalProgress!.tasks[taskKey(day, 'past')]!;
  expect(task).toMatchObject({ levelId: first, limit: 2 });
  expect(new Set(Object.values(plan.personalProgress!.tasks).map(task => task.levelId)).size).toBe(3);
  const tomorrow = issue(plan, '2026-11-21');
  expect(tomorrow.personalProgress!.tasks[taskKey(day, 'future')]).toEqual(plan.personalProgress!.tasks[taskKey(day, 'future')]);
  expect(tomorrow.personalProgress!.tasks[taskKey('2026-11-21', 'future')]!.levelId)
    .not.toBe(plan.personalProgress!.tasks[taskKey(day, 'future')]!.levelId);
});

test('personal victory gets one local receipt across repeats and leaves all campaign results alone', () => {
  const campaign = apply(newWorkspace('official'), { kind: 'help', attemptId: 'official', assistance: { kind: 'auto' } });
  let state = issue(campaign, day);
  const key = taskKey(day, 'past');
  for (const attemptId of ['win', 'replay']) {
    state = apply(state, { kind: 'personal-open', key, attemptId, restart: true, now: 0 });
    state = apply(state, { kind: 'personal-swap', from: 1, to: 2, attemptId, now: 5 });
    expect(activePersonal(state.personalProgress)?.status).toBe('won');
    state = apply(state, { kind: 'personal-leave', now: 8 });
  }
  expect(state.personalProgress!.earned).toEqual([key]);
  expect(state.bests).toEqual(campaign.bests);
  expect(state.rights).toEqual(campaign.rights);
  expect(state.attempts).toEqual(campaign.attempts);
  validatePersonal(JSON.parse(JSON.stringify(state.personalProgress)));
});
