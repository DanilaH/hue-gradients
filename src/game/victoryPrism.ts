import type { LevelDefinition } from '../domain/puzzle';

export const victoryPrism = `<div id="victory-prism" aria-hidden="true" hidden><svg viewBox="0 0 200 200">
  <defs><linearGradient id="prism-sheen" x2=".65" y2="1"><stop stop-color="#fff6e8" stop-opacity=".32"/>
    <stop offset=".46" stop-color="#fff6e8" stop-opacity=".07"/><stop offset="1" stop-color="#1c122d" stop-opacity=".16"/></linearGradient></defs>
  <path d="M100 12 100 100 20 100Z" fill="var(--facet-0)"/>
  <path d="M100 12 180 100 100 100Z" fill="var(--facet-1)"/>
  <path d="M20 100 100 100 100 188Z" fill="var(--facet-2)"/>
  <path d="M100 100 180 100 100 188Z" fill="var(--facet-3)"/>
  <path d="M100 12 180 100 100 188 20 100Z" fill="url(#prism-sheen)" stroke="#fff6e4" stroke-width="1.6"/>
  <path d="M100 12V188M20 100H180" fill="none" stroke="#fff5f1" stroke-width="1.2" stroke-opacity=".77"/>
</svg></div>`;

export function colourPrism(prism: HTMLElement, level: LevelDefinition): void {
  if (level.geometry) {
    level.geometry.corners.forEach((colour, i) => prism.style.setProperty(`--facet-${i}`, colour));
    return;
  }
  const { width, height, solvedTileColors: colors } = level;
  const last = colors.length - 1;
  const positions = width === 1 || height === 1
    ? [0, Math.round(last / 3), Math.round(last * 2 / 3), last]
    : [0, width - 1, width * (height - 1), last];
  positions.forEach((pos, i) => prism.style.setProperty(`--facet-${i}`, colors[pos]!));
}
