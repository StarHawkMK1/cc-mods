import { expect, test } from 'claude-code/testing'

import type { AgentRun } from '../types'
import { agentSvg, barText, fitText, rowSvg } from './draw'
import type { Bar } from './flow'
import { STRINGS } from './i18n'

const bar = (over: Partial<Bar> = {}): Bar => ({
  title: 'Auth login', pill: 'Build 3/7', ratio: 0.57, runRatio: 0.6, ticks: [1 / 6, 2 / 6, 3 / 6, 4 / 6, 5 / 6], isFinished: false, isFlow: true, doing: '', ...over,
})

test('rowSvg draws title, pill and percent', () => {
  const svg = rowSvg(bar(), 800, true)
  expect(svg.startsWith('<svg')).toBe(true)
  expect(svg).toContain('>Auth login</text>')
  expect(svg).toContain('>Build 3/7</text>')
  expect(svg).toContain('>57%</text>')
  expect(svg).toContain('class="crab run"')
  expect(svg).toContain('#8f8cf4')
})

test('rowSvg draws ticks only ahead of the fill', () => {
  const tick = /height="8" rx="0.75"/g
  expect(rowSvg(bar({ ratio: 0, runRatio: 0 }), 800, false).match(tick)).toHaveLength(5)
  expect(rowSvg(bar({ ratio: 1, runRatio: 1 }), 800, false).match(tick)).toBeNull()
})

test('rowSvg: a finished band is green and its crab rests', () => {
  const svg = rowSvg(bar({ isFinished: true, pill: 'Done', ratio: 1, runRatio: 1 }), 800, false)
  expect(svg).toContain('#5fbf8f')
  expect(svg).not.toContain('crab run')
})

test('rowSvg escapes and clips odd titles', () => {
  const svg = rowSvg(bar({ title: `<b>&"${'긴제목'.repeat(80)}`, pill: 'A<B' }), 600, false)
  expect(svg).not.toContain('<b>')
  expect(svg).toContain('&lt;b&gt;&amp;&quot;')
  expect(svg).toContain('A&lt;B')
  expect(svg).toContain('…')
  expect(fitText('긴제목'.repeat(80), 13, 100).length).toBeLessThan(20)
})

test('barText fills by the ratio', () => {
  expect(barText(0.5, 10)).toBe('█████░░░░░')
  expect(barText(1, 4)).toBe('████')
})

test('agentSvg shows the subagent’s own steps, else its context', () => {
  const a: AgentRun = {
    id: 'a', agentId: 'ag-a', type: 'general-purpose', description: 'Implement Task 3', model: 'claude-opus-5-5', effort: 'medium',
    status: 'running', startedAt: 1_000, contextTokens: 180_000, contextMax: 1_000_000, tokens: 0, costUsd: 0.42, steps: 1,
  }
  const withSteps = agentSvg(400, a, 92_000, { done: 2, total: 5, note: 'Running tests' }, STRINGS.en)
  expect(withSteps).toContain('Implement Task 3')
  expect(withSteps).toContain('general-purpose  ·  Opus 5.5 · medium')
  expect(withSteps).toContain('2/5 · Running tests')
  expect(withSteps).toContain('ctx 18%')
  expect(withSteps).toContain('1:31')
  expect(agentSvg(400, a, 92_000, null, STRINGS.en)).not.toContain('2/5')
})
