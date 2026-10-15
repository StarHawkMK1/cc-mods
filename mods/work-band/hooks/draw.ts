// Drawings borrowed from savvy-progress (johnnyvizz/claude-kit, MIT; see
// THIRD_PARTY_NOTICES.md): the dithered band, the pixel crab, the panel rows.
import type { AgentRun } from '../types'
import { ctxOf, elapsed, fmtCost, fmtTime, fmtTokens, runModel } from './agents'
import type { Bar, Steps } from './flow'
import type { Strings } from './i18n'

export const H = 22
const BAR_H = 16
const CRAB_W = 26
const CELL = 3
const CRAB_SCALE = 1.1
const FONT = "-apple-system,BlinkMacSystemFont,'SF Pro Text','Segoe UI','Malgun Gothic',sans-serif"
export const ACCENT = '#8f8cf4'
export const DONE = '#5fbf8f'
export const CLAY = '#D97757'
const INK = '#1F1E1D'

export const xml = (s: string): string =>
  s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] ?? c)

// CJK, Hangul, fullwidth forms and emoji advance about 1em.
const WIDE =
  /[ᄀ-ᅟ⺀-〾ぁ-㏿㐀-䶿一-鿿ꥠ-꥿가-힣豈-﫿︰-﹏！-｠￠-￦\u{1F300}-\u{1FAFF}\u{20000}-\u{3FFFD}]/u

// Rough advance of system UI text, in em; good enough to size a slot.
const charEm = (ch: string): number =>
  WIDE.test(ch) ? 1 : /[\s.,:;'|!il1()[\]]/.test(ch) ? 0.3 : /[A-Zmw@%]/.test(ch) ? 0.72 : 0.56

export const textWidth = (s: string, size: number): number => [...s].reduce((w, ch) => w + charEm(ch) * size, 0)

// Cuts `s` to fit `maxW` pixels, with an ellipsis when it had to cut.
export const fitText = (s: string, size: number, maxW: number): string => {
  if (textWidth(s, size) <= maxW) return s
  let out = ''
  for (const ch of s) {
    if (textWidth(out + ch + '…', size) > maxW) break
    out += ch
  }
  return out + '…'
}

const clamp01 = (n: number): number => Math.max(0, Math.min(1, Number.isFinite(n) ? n : 0))

// Deterministic noise so the dither does not shimmer between redraws.
const noise = (x: number, y: number): number => {
  const v = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453
  return v - Math.floor(v)
}

// Pure CSS, run by the compositor. Legs step and the body bobs while walking.
const CRAB_CSS = `<style>
.run .la{animation:st .5s steps(1) infinite}.run .lb{animation:st .5s steps(1) infinite -.25s}
.run .bd{animation:bob .5s steps(1) infinite -.125s}
.run g{transform-box:fill-box}
@keyframes st{50%{transform:translateY(-1px)}}@keyframes bob{50%{transform:translateY(1px)}}
@media (prefers-reduced-motion: reduce){.run,.run g{animation:none!important}}
</style>`

// Pixel Clawd: a 24×18 crab on a 30×28 grid.
export const crab = (x: number, y: number, isWalking: boolean, scale = CRAB_SCALE, dim = false): string => {
  const groups: Record<'bd' | 'la' | 'lb', string[]> = { bd: [], la: [], lb: [] }
  const f = (cx: number, cy: number, w: number, h: number, c: string, cls: 'bd' | 'la' | 'lb' = 'bd') =>
    groups[cls].push(`<rect x="${cx}" y="${cy}" width="${w}" height="${h}" fill="${c}"/>`)
  f(7, 10, 16, 12, CLAY)
  f(3, 14, 4, 4, CLAY)
  f(23, 14, 4, 4, CLAY)
  f(9, 12, 2, 2, INK)
  f(19, 12, 2, 2, INK)
  f(7, 22, 2, 4, CLAY, 'la')
  f(17, 22, 2, 4, CLAY, 'la')
  f(11, 22, 2, 4, CLAY, 'lb')
  f(21, 22, 2, 4, CLAY, 'lb')
  const g = (cls: 'bd' | 'la' | 'lb') => `<g class="${cls}">${groups[cls].join('')}</g>`
  return `<g transform="translate(${x},${y}) scale(${scale})" opacity="${dim ? 0.45 : 1}" shape-rendering="crispEdges"><g class="crab${isWalking ? ' run' : ''}">${g('bd')}${g('la')}${g('lb')}</g></g>`
}

// The whole row is one SVG (the desktop wraps sibling elements): title, bar,
// pill, percent and crab; the count and the dismiss are Buttons beside it.
export const rowSvg = (b: Bar, W: number, isWorking: boolean): string => {
  const title = fitText(b.title, 13, Math.max(60, W * 0.4))
  const BAR_X = Math.round(16 + textWidth(title, 13) + 12)
  const BAR_W = Math.max(60, W - BAR_X - 46 - CRAB_W)
  const color = b.isFinished ? DONE : ACCENT
  const y0 = (H - BAR_H) / 2
  const fillW = Math.round(BAR_W * clamp01(b.ratio))
  const runW = Math.round(BAR_W * clamp01(Math.max(b.ratio, b.runRatio)))
  const cols = Math.floor(fillW / CELL)
  const rows = Math.floor(BAR_H / CELL)

  // Dithered fill: sparse at the start, dense toward the head.
  const dots: string[] = []
  for (let c = 0; c < cols; c++) {
    const density = 0.35 + 0.6 * Math.pow(c / Math.max(1, cols), 1.2)
    for (let r = 0; r < rows; r++) {
      if (noise(c, r) < density) dots.push(`<rect class="t${Math.floor(noise(r, c) * 4)}" x="${c * CELL + 1}" y="${r * CELL + 1}" width="2" height="2"/>`)
    }
  }
  // Under way, not yet done: a faint second layer.
  const faint: string[] = []
  for (let c = cols; c < Math.floor(runW / CELL); c++) {
    for (let r = 0; r < rows; r++) {
      if (noise(c + 7, r + 3) < 0.2) faint.push(`<rect class="t${Math.floor(noise(r + 5, c) * 4)}" x="${c * CELL + 1}" y="${r * CELL + 1}" width="1.7" height="1.7"/>`)
    }
  }
  const ticks = b.ticks
    .map(t => Math.round(BAR_W * t))
    .filter(x => x > fillW + 4)
    .map(x => `<rect x="${x}" y="${BAR_H / 2 - 4}" width="1.5" height="8" rx="0.75"/>`)

  const pillW = Math.round(18 + textWidth(b.pill, 11))
  const pillX = Math.max(0, Math.min(BAR_W - pillW, fillW - pillW))
  const percent = `${Math.round(clamp01(b.ratio) * 100)}%`

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
<style>
.t{fill:#1f1f1f}.m{fill:#8a8a8a}.k{fill:#e4e4e2}.tk{fill:#b4b4b0}
@media (prefers-color-scheme: dark){.t{fill:#ececec}.m{fill:#9a9a9a}.k{fill:#2c2c2c}.tk{fill:#5a5a5a}}
.t0,.t1,.t2,.t3{animation:tw ${b.isFinished ? 3.2 : 2.2}s ease-in-out infinite}
.t1{animation-duration:${b.isFinished ? 3.8 : 2.8}s;animation-delay:-.7s}.t2{animation-duration:${b.isFinished ? 4.4 : 1.9}s;animation-delay:-1.3s}.t3{animation-duration:${b.isFinished ? 3.5 : 3.3}s;animation-delay:-.4s}
@keyframes tw{0%,100%{opacity:1}50%{opacity:${b.isFinished ? 0.8 : 0.3}}}
@media (prefers-reduced-motion: reduce){.t0,.t1,.t2,.t3{animation:none}}
</style>
<defs><clipPath id="c"><rect x="0" y="0" width="${BAR_W}" height="${BAR_H}" rx="${BAR_H / 2}"/></clipPath></defs>
<circle cx="5" cy="${H / 2}" r="4" fill="${color}"/>
<text class="t" x="16" y="${H / 2 + 4.5}" font-family="${FONT}" font-size="13" font-weight="500">${xml(title)}</text>
<g transform="translate(${BAR_X},${y0})">
<rect class="k" width="${BAR_W}" height="${BAR_H}" rx="${BAR_H / 2}"/>
<g clip-path="url(#c)">
<g fill="${color}">${dots.join('')}</g>
<g fill="${color}" opacity="0.45">${faint.join('')}</g>
<g class="tk">${ticks.join('')}</g>
</g>
<rect x="${pillX}" width="${pillW}" height="${BAR_H}" rx="${BAR_H / 2}" fill="${color}"/>
<text x="${pillX + pillW / 2}" y="${BAR_H / 2 + 4}" text-anchor="middle" font-family="${FONT}" font-size="11" font-weight="600" fill="#ffffff">${xml(b.pill)}</text>
</g>
<text class="m" x="${W - CRAB_W - 6}" y="${H / 2 + 4.5}" text-anchor="end" font-family="${FONT}" font-size="12.5" font-variant-numeric="tabular-nums">${percent}</text>
${CRAB_CSS}${crab(W - CRAB_W + 1, 0, isWorking, 0.8)}
</svg>`
}

export const barText = (ratio: number, width: number): string => {
  const filled = Math.round(width * clamp01(ratio))
  return '█'.repeat(filled) + '░'.repeat(Math.max(0, width - filled))
}

export const ctxBar = (pct: number, width: number): string => barText(pct / 100, width)

export const STATUS_GLYPH: Record<string, string> = { running: '●', done: '✓', failed: '✗' }

// ---------------------------------------------------------------------------
// Panel: each row is one SVG over a dotted grid.

const GRID_STEP = 16
// A Text or Button row on the desktop is about 20px; the grid errs taller.
export const LINE_H = 24
export const HEADER_H = 44
export const ROW_H = 66
// The engine refuses an Svg taller than 4096px: a long grid is stacked from tiles.
const GRID_TILE = 4096

export const gridTiles = (h: number): number[] =>
  Array.from({ length: Math.ceil(h / GRID_TILE) }, (_, i) => Math.min(GRID_TILE, h - i * GRID_TILE))

export const gridSvg = (W: number, h: number): string => `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${h}" viewBox="0 0 ${W} ${h}">
<style>.d{fill:#d9d8d4}@media (prefers-color-scheme: dark){.d{fill:#3a3a38}}</style>
<defs><pattern id="g" width="${GRID_STEP}" height="${GRID_STEP}" patternUnits="userSpaceOnUse"><circle class="d" cx="${GRID_STEP / 2}" cy="${GRID_STEP / 2}" r="1"/></pattern></defs>
<rect width="${W}" height="${h}" fill="url(#g)"/>
</svg>`

const PANE_CSS = `<style>
.t{fill:#1f1f1f}.s{fill:#6b6b68}.m{fill:#9a9a96}.k{fill:#ecebe8}.ln{stroke:#e4e4e1}.tile{fill:#f4f3f0}
@media (prefers-color-scheme: dark){.t{fill:#ececec}.s{fill:#a8a8a4}.m{fill:#7d7d79}.k{fill:#2c2c2b}.ln{stroke:#333331}.tile{fill:#262625}}
.live{animation:p 1.6s ease-in-out infinite}@keyframes p{50%{opacity:.3}}
@media (prefers-reduced-motion: reduce){.live{animation:none}}
</style>`

const svg = (W: number, h: number, body: string): string =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${h}" viewBox="0 0 ${W} ${h}">${PANE_CSS}${CRAB_CSS}${body}</svg>`

const statusMark = (x: number, y: number, status: string): string => {
  if (status === 'running') return `<circle class="live" cx="${x}" cy="${y}" r="3.5" fill="${ACCENT}"/>`
  if (status === 'done') return `<path d="M${x - 5} ${y}l3.5 3.5 6.5-7" fill="none" stroke="#3B9C5F" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>`
  return `<path d="M${x - 4} ${y - 4}l8 8M${x + 4} ${y - 4}l-8 8" stroke="#D0453F" stroke-width="1.8" stroke-linecap="round"/>`
}

type Totals = { cost: number; tokens: number; time: number }

export const headerSvg = (W: number, t: Totals, s: Strings): string => {
  const gap = 6
  const tw = (W - gap * 2) / 3
  const tile = (i: number, k: string, v: string) =>
    `<rect class="tile" x="${i * (tw + gap)}" y="0" width="${tw}" height="40" rx="8"/>
<text class="s" x="${i * (tw + gap) + 9}" y="16" font-family="${FONT}" font-size="11">${xml(k)}</text>
<text class="t" x="${i * (tw + gap) + 9}" y="33" font-family="${FONT}" font-size="15" font-weight="600" font-variant-numeric="tabular-nums">${v}</text>`
  return svg(W, HEADER_H, `${tile(0, s.cost, '≈' + fmtCost(t.cost))}${tile(1, s.tokens, fmtTokens(t.tokens))}${tile(2, s.time, fmtTime(t.time))}`)
}

// A run's row: its own steps when its to-do list says, else its context, grey.
export const agentSvg = (W: number, a: AgentRun, at: number, steps: Steps | null, s: Strings): string => {
  const ctx = ctxOf(a)
  const textW = W - 42 - 22
  const meta = [a.type, runModel(a)]
  if (a.status === 'failed') meta.push(s.failed)
  const progress = a.status === 'done' ? 1 : steps ? Math.min(1, steps.done / steps.total) : null
  const stats = `${s.ctx} ${ctx}% · ${fmtTokens(a.contextTokens)}  ≈${fmtCost(a.costUsd)}  ${fmtTime(elapsed(a, at))}`
  const stepText = steps ? `${steps.done}/${steps.total}${steps.note ? ' · ' + steps.note : ''}` : ''
  const stepsW = Math.max(0, textW - textWidth(stats, 11) - 12)
  const fillW = Math.round(textW * (progress ?? ctx / 100))
  return svg(
    W,
    ROW_H,
    `${crab(0, 14, a.status === 'running')}
<text class="t" x="42" y="18" font-family="${FONT}" font-size="13" font-weight="600">${xml(fitText(a.description || a.type, 13, textW))}</text>
<text class="s" x="42" y="34" font-family="${FONT}" font-size="11">${xml(fitText(meta.join('  ·  '), 11, textW))}</text>
${stepText && stepsW > 30 ? `<text class="t" x="42" y="49" font-family="${FONT}" font-size="11" font-variant-numeric="tabular-nums">${xml(fitText(stepText, 11, stepsW))}</text>` : ''}
<text class="s" x="${42 + textW}" y="49" text-anchor="end" font-family="${FONT}" font-size="11" font-variant-numeric="tabular-nums">${xml(stats)}</text>
<rect class="k" x="42" y="55" width="${textW}" height="4" rx="2"/><rect${progress === null ? ' class="m"' : ''} x="42" y="55" width="${fillW}" height="4" rx="2"${progress === null ? '' : ` fill="${ACCENT}"`}/>
${statusMark(W - 8, 16, a.status)}
<line class="ln" x1="0" y1="65.5" x2="${W}" y2="65.5"/>`,
  )
}

export const compactSvg = (W: number, list: AgentRun[], t: Totals): string => {
  const ordered = [...list.filter(a => a.status === 'running'), ...list.filter(a => a.status !== 'running')]
  const fit = Math.max(1, Math.floor((W - 150) / 36))
  const shown = ordered.slice(0, fit)
  const more = ordered.length - shown.length
  const body = shown
    .map((a, i) => crab(i * 36, 0, a.status === 'running') + (a.status === 'running' ? `<circle class="live" cx="${i * 36 + 32}" cy="4" r="3" fill="${ACCENT}"/>` : ''))
    .join('')
  const x = shown.length * 36 + (more ? 4 : 0)
  return svg(
    W,
    32,
    `${body}${more ? `<text class="s" x="${x}" y="21" font-family="${FONT}" font-size="12">+${more}</text>` : ''}
<text class="s" x="${W}" y="21" text-anchor="end" font-family="${FONT}" font-size="12" font-variant-numeric="tabular-nums">≈${fmtCost(t.cost)} · ${fmtTokens(t.tokens)} · ${fmtTime(t.time)}</text>`,
  )
}
