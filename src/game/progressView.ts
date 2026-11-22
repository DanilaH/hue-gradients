import { getTierProgress } from '@danilah/mini-games-kit/core';
import { getLevel, levels } from '../domain/levels';
import { campaignProgress, MASTERY_THRESHOLDS, PUBLISHED_BENCHMARKS } from '../domain/playerProgress';
import type { Workspace } from '../domain/workspace';

const plural = new Intl.PluralRules('ru');
function moves(count: number): string {
  const form = plural.select(count);
  return `${count} ${form === 'one' ? 'ход' : form === 'few' ? 'хода' : 'ходов'}`;
}

function text(parent: HTMLElement, tag: 'h3' | 'p' | 'li' | 'summary', value: string): HTMLElement {
  const node = document.createElement(tag);
  node.textContent = value;
  parent.append(node);
  return node;
}

export function renderProgress(parent: HTMLElement, state: Workspace, disabled: boolean, back: () => void): void {
  const progress = campaignProgress(state);
  const nav = document.createElement('nav');
  nav.className = 'menu-back';
  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'quiet';
  close.textContent = '‹ Назад';
  close.disabled = disabled;
  close.onclick = back;
  nav.append(close);
  parent.append(nav);

  const overview = document.createElement('section');
  overview.className = 'progress-overview';
  text(overview, 'h3', progress.complete ? 'Кампания собрана' : 'Кампания');
  text(overview, 'p', `Собрано ${progress.xp} из ${levels.length} · ${progress.xp} XP`);
  const bar = document.createElement('progress');
  bar.max = levels.length;
  bar.value = progress.xp;
  bar.setAttribute('aria-label', 'Уровней собрано');
  overview.append(bar);
  text(overview, 'p', `Идеально без помощи · ${progress.perfect}`);
  parent.append(overview);

  const sets = document.createElement('ul');
  sets.className = 'progress-list';
  sets.setAttribute('aria-label', 'Главы');
  for (const set of progress.sets) {
    const caption = set.complete ? 'Собрана' : !set.open ? 'Закрыта' : set.lastOrdinary ? 'Последний обычный уровень пройден' : '';
    const finale = set.finale ? 'Финал пройден' : set.complete ? 'Финал открыт' : '';
    text(sets, 'li', [`${set.title} · ${set.count}/${set.total}`, caption, finale].filter(Boolean).join(' · '));
  }
  parent.append(sets);

  const history = document.createElement('details');
  history.dataset.menuDisclosure = 'history';
  text(history, 'summary', `История побед · ${progress.victories.length}`);
  if (progress.victories.length === 0) text(history, 'p', 'Здесь появятся результаты собранных уровней.');
  else {
    const list = document.createElement('ol');
    list.className = 'progress-list';
    history.append(list);
    let shown = 0;
    const more = document.createElement('button');
    more.type = 'button';
    more.className = 'quiet';
    more.textContent = 'Ещё победы';
    more.disabled = disabled;
    const showBatch = () => {
      const end = Math.min(shown + 20, progress.victories.length);
      for (; shown < end; shown++) {
        const victory = progress.victories[progress.victories.length - 1 - shown]!;
        const row = text(list, 'li', `Уровень ${getLevel(victory.levelId).ordinal} · ${moves(victory.moves)} · ${victory.assisted ? 'С помощью' : 'Без помощи'}`);
        row.dataset.attemptId = victory.attemptId;
        if (victory.reference && state.preferences.statistics) {
          const ref = victory.reference;
          text(row, 'p', `Среднее — ${ref.mean} · ${ref.sampleSize} результатов · ${ref.source} · ${ref.version}`);
        }
      }
      more.hidden = shown >= progress.victories.length;
    };
    more.onclick = showBatch;
    showBatch();
    history.append(more);
  }
  parent.append(history);

  if (state.preferences.statistics) {
    const mastery = document.createElement('details');
    mastery.dataset.menuDisclosure = 'mastery';
    text(mastery, 'summary', 'Ступени мастерства');
    if (!progress.compared && !PUBLISHED_BENCHMARKS.length) {
      text(mastery, 'p', 'Сравнение появится после публикации результатов игроков.');
    } else {
      text(mastery, 'p', `Лучше среднего · ${progress.better} из ${progress.compared} сравнений`);
      const tier = getTierProgress(progress.better, MASTERY_THRESHOLDS);
      if (tier.complete && tier.nextTier) text(mastery, 'p', `До следующей ступени · ${tier.nextTier.remaining}`);
      else if (!tier.complete) text(mastery, 'p', `До следующей ступени · ${tier.target - tier.filled}`);
    }
    const steps = document.createElement('ol');
    steps.className = 'progress-list';
    for (const threshold of MASTERY_THRESHOLDS) {
      text(steps, 'li', `${threshold} результатов лучше среднего${progress.better >= threshold ? ' · Получено' : ''}`);
    }
    mastery.append(steps);
    parent.append(mastery);
  }
}
