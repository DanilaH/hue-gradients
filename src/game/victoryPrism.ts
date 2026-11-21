import type { LevelDefinition } from '../domain/puzzle';
import { WIN_GLINT_DELAY_MS } from './feedback';

export const victoryPrism = `<div id="victory-prism" aria-hidden="true" hidden><svg viewBox="0 0 200 200">
  <defs><linearGradient id="prism-sheen" x2=".65" y2="1"><stop stop-color="#fff6e8" stop-opacity=".32"/>
    <stop offset=".46" stop-color="#fff6e8" stop-opacity=".07"/><stop offset="1" stop-color="#1c122d" stop-opacity=".16"/></linearGradient></defs>
  <path d="M100 12 100 100 20 100Z" fill="var(--facet-0)"/>
  <path d="M100 12 180 100 100 100Z" fill="var(--facet-1)"/>
  <path d="M20 100 100 100 100 188Z" fill="var(--facet-2)"/>
  <path d="M100 100 180 100 100 188Z" fill="var(--facet-3)"/>
  <path d="M100 12 180 100 100 188 20 100Z" fill="url(#prism-sheen)" stroke="#fff6e4" stroke-width="1.6"/>
  <path d="M100 12V188M20 100H180" fill="none" stroke="#fff5f1" stroke-width="1.2" stroke-opacity=".77"/>
  <path id="prism-glint" d="M100 188 20 100 100 12 180 100 100 188" pathLength="1" fill="none"
    stroke="#fffdf2" stroke-width="3.4" stroke-linecap="round" stroke-dasharray=".11 .89" opacity="0"/>
</svg></div>`;

export function colourPrism(prism: HTMLElement, level: LevelDefinition): void {
  const { width, height, solvedTileColors: colors } = level;
  const last = colors.length - 1;
  const positions = width === 1 || height === 1
    ? [0, Math.round(last / 3), Math.round(last * 2 / 3), last]
    : [0, width - 1, width * (height - 1), last];
  positions.forEach((pos, i) => prism.style.setProperty(`--facet-${i}`, colors[pos]!));
}

export function flashPrismEdge(prism: HTMLElement): Animation {
  return prism.querySelector('#prism-glint')!.animate([
    { strokeDashoffset: 0, opacity: 0 }, { opacity: .95, offset: .18 },
    { opacity: .85, offset: .72 }, { strokeDashoffset: -1, opacity: 0 },
  ], { delay: WIN_GLINT_DELAY_MS, duration: 355 });
}
