import { describe, expect, test } from 'vitest';
import { geometryTemplates, pilotLevel, pilotLevels } from '../src/domain/geometryPilot';
import { colourAt, geometryColors, quarterTurnBetween } from '../src/domain/geometryRecipe';
import { canSwap, createAttempt, minimumSwaps, proposeSwap, validateAttempt } from '../src/domain/puzzle';
import { applyAction, fingerprintPayload, newWorkspace, decodeWorkspace } from '../src/domain/workspace';
import { geometryLevels } from '../src/domain/shapeLevels';
import { wallpaperField } from '../src/domain/export';
import { boardGeometry, dropCandidate, hitTest } from '../src/game/geometry';

test('eight reusable authored templates have two independent palettes and the same preview start', () => {
  expect(geometryTemplates).toHaveLength(8);
  expect(pilotLevels).toHaveLength(16);
  for (let i = 0; i < pilotLevels.length; i += 2) {
    const a = pilotLevels[i]!, b = pilotLevels[i + 1]!;
    expect(a.geometry!.paletteTier).toBe('Lo');
    expect(b.geometry!.paletteTier).toBe('Hi');
    expect(a.positions).toBe(b.positions);
    expect(a.pinnedPositions).toEqual(b.pinnedPositions);
    expect(a.startTileAtPosition).toEqual(b.startTileAtPosition);
    expect(a.solvedTileColors).not.toEqual(b.solvedTileColors);
    expect(fingerprintPayload(a)).not.toEqual(fingerprintPayload(b));
  }
});

describe.each(pilotLevels.map(level => [level.id, level] as const))('%s', (_, level) => {
  test('100 attempt seeds use exactly one cycle per movable family', () => {
    const groups = new Map<string, number[]>();
    for (const [index, { family }] of level.positions!.entries()) {
      if (level.pinnedPositions.includes(index)) continue;
      if (!groups.has(family!)) groups.set(family!, []);
      groups.get(family!)!.push(index);
    }
    const boards = new Set<string>();
    for (let n = 0; n < 100; n++) {
      const attempt = createAttempt(level, `seed:${n}`);
      validateAttempt(level, attempt);
      boards.add(attempt.board.join(','));
      for (const pin of level.pinnedPositions) expect(attempt.board[pin]).toBe(pin);
      for (const group of groups.values()) {
        const first = group[0]!;
        let index = attempt.board[first]!, count = 1;
        while (index !== first && count <= group.length) {
          expect(group).toContain(index);
          index = attempt.board[index]!;
          count++;
        }
        expect(count).toBe(group.length);
        expect(index).toBe(first);
      }
      expect(minimumSwaps(attempt.board, level.pinnedPositions)).toBe([...groups.values()].reduce((sum, group) => sum + group.length - 1, 0));
    }
    expect(boards.size).toBeGreaterThan(1);
  });
});

test('compatibility ignores angle only for versioned figures', () => {
  const old = geometryLevels.find(level => level.id === 'geometry-v1-triangles')!;
  const level = pilotLevel('pilot-v1-fold-lo')!;
  expect(canSwap(level, 1, 2)).toBe(true);
  expect(canSwap(level, 0, 2)).toBe(false);
  expect(quarterTurnBetween(level.positions![1], level.positions![2])).toBe(-1);
  const a = old.positions!.findIndex((p, i) => p.shape === 'triangle-nw' && !old.pinnedPositions.includes(i));
  const b = old.positions!.findIndex((p, i) => p.shape === 'triangle-se' && !old.pinnedPositions.includes(i));
  expect(canSwap(old, a, b)).toBe(false);
});

test('closest site owns a seam and three candidate samples stop at the first eligible target', () => {
  const level = pilotLevel('pilot-v1-rift-lo')!;
  const board = boardGeometry(300, 208, level.width, level.height, level.positions, true);
  for (const [i, tile] of level.positions!.entries()) expect(hitTest(board, tile.center![0] * 300, 4 + tile.center![1] * 200)).toBe(i);
  // The blank corner outside the visible polygons still belongs to a site.
  const hex = pilotLevel('pilot-v1-pebbles-lo')!;
  expect(hitTest(boardGeometry(300, 208, hex.width, hex.height, hex.positions, true), 2, 6)).toBe(0);
  expect(hitTest(boardGeometry(300, 208, hex.width, hex.height, hex.positions), 2, 6)).toBeNull();
  expect(hitTest(board, -1, 6)).toBeNull();
  const find = (eligible: readonly number[]) => dropCandidate({ x: 2, y: 0 }, { x: 6, y: 0 }, x => x, x => eligible.includes(x));
  expect(find([2, 4, 6])).toBe(4);
  expect(find([2, 6])).toBe(2);
  expect(find([6])).toBe(6);
  expect(find([])).toBeNull();
});

test('asymmetric solved centres are normalized with anchors and use encoded sRGB', () => {
  const points = [[.1,.2], [.3,.35], [.9,.8]] as const;
  const corners = ['#000000','#FF0000','#00FF00','#FFFF00'];
  const positions = points.map(center => ({ center, vertices: [], shape: 'rect' as const }));
  expect(geometryColors(positions, corners)).toEqual(['#000000','#404000','#FFFF00']);
  expect(colourAt(corners, .5, .5)).toBe('#808000');
});

test('content fingerprint excludes new starts and separates identical colours with different geometry', () => {
  const level = pilotLevel('pilot-v1-fold-lo')!;
  expect(fingerprintPayload({ ...level, startTileAtPosition: [0, 2, 3, 1] })).toBe(fingerprintPayload(level));
  const positions = level.positions!.map((position, i) => i === 1
    ? { ...position, center: [.22, .67] as const } : position);
  const altered = { ...level, positions };
  expect(fingerprintPayload(altered)).not.toBe(fingerprintPayload(level));
  expect(() => validateAttempt(altered, createAttempt(level, 'sealed-work'))).toThrow('Invalid saved geometry start');
  const legacy = geometryLevels[1]!;
  expect(fingerprintPayload(legacy)).not.toContain('positions');
});

test('legacy challenge, rights and campaign board persist through pilot play, resume, replay and wallpapers', () => {
  const id = 'pilot-v1-fold-lo';
  const key = 'pilot:' + id;
  const level = pilotLevel(id)!;
  let state = newWorkspace('base');
  const fingerprints = new Map<string,string>();
  const dispatch = (action: Parameters<typeof applyAction>[1]) => { state = applyAction(state, action, fingerprints); };
  dispatch({ kind: 'challenge-open', id: 'geometry-v1-triangles', attemptId: 'legacy' });
  dispatch({ kind: 'challenge-leave' });
  const old = JSON.parse(JSON.stringify(state));
  expect(() => wallpaperField(state, key)).toThrow();
  dispatch({ kind: 'challenge-open', id, attemptId: 'pilot-a' });
  const baseline = state.challengeProgress!.attempts[id]!;
  const pair = (attempt: typeof baseline) => {
    const to = attempt.board.findIndex((tile, index) => tile !== index);
    return { from: attempt.board.indexOf(to), to };
  };
  dispatch({ kind: 'challenge-swap', ...pair(baseline), attemptId: baseline.attemptId });
  dispatch({ kind: 'challenge-leave' });
  state = decodeWorkspace(JSON.stringify(state), fingerprints);
  dispatch({ kind: 'challenge-open', id, attemptId: 'ignored-resume' });
  const resumed = state.challengeProgress!.attempts[id]!;
  expect(resumed.moves).toBe(1);
  expect(resumed.generatedStart).toEqual(baseline.generatedStart);
  dispatch({ kind: 'challenge-swap', ...pair(resumed), attemptId: baseline.attemptId });
  expect(state.challengeProgress!.best[id]).toBe(level.minimumSwaps);
  expect(wallpaperField(state, key).geometry?.corners).toEqual(level.geometry!.corners);
  dispatch({ kind: 'challenge-restart', id, attemptId: 'fresh-id' });
  expect(state.challengeProgress!.attempts[id]!.generatedStart!.seed).not.toEqual(baseline.generatedStart!.seed);
  expect(state.challengeProgress!.best[id]).toBe(level.minimumSwaps);
  expect(state.attempts).toEqual(old.attempts);
  expect(state.rights).toEqual(old.rights);
  expect(state.challengeProgress!.attempts['geometry-v1-triangles']).toEqual(old.challengeProgress.attempts['geometry-v1-triangles']);
  expect(() => decodeWorkspace(JSON.stringify(state), fingerprints)).not.toThrow();
  expect(proposeSwap(level, baseline, 0, 1)).toBe(baseline);
});
