import { expect, test } from 'claude-code/testing'

import type { AgentRun } from '../types'
import { costOf, ctxOf, fmtCost, fmtTime, fmtTokens, modelName, runModel, totals, windowOf } from './agents'

// 1M input, 1M output, 2M cache read and 1M cache write: input + output + 2 × read + write.
const TURN = { input_tokens: 1e6, output_tokens: 1e6, cache_read_input_tokens: 2e6, cache_creation_input_tokens: 1e6 }
const PRICED: readonly (readonly [model: string, shown: string])[] = [
  ['claude-fable-5-1', '$80.5'],
  ['claude-fable-5', '$82.0'],
  ['claude-opus-5-5', '$32.4'],
  ['claude-opus-5', '$41.0'],
  ['claude-opus-4-8', '$41.0'],
  ['claude-sonnet-5-5', '$16.2'],
  ['claude-sonnet-5', '$16.4'],
  ['claude-sonnet-4-6', '$24.6'],
  ['claude-haiku-5-5', '$0.82'],
  ['claude-haiku-4-5', '$8.20'],
]

for (const [model, shown] of PRICED) {
  test(`cost: a turn on ${model} is ≈${shown}`, () => {
    expect(fmtCost(costOf(model, TURN, false))).toBe(shown)
  })
}

test('cost: a Haiku 5.5 request over 100K prompt tokens pays the long-prompt prices', () => {
  const long = { input_tokens: 20_000, output_tokens: 10_000, cache_read_input_tokens: 50_000, cache_creation_input_tokens: 50_000 }
  expect(Math.round(costOf('claude-haiku-5-5', long, true) * 1e6)).toBe(87_500)
  expect(Math.round(costOf('claude-haiku-5-5', long, false) * 1e6)).toBe(17_500)
})

test('names, windows and formats', () => {
  expect(modelName('claude-opus-5-5')).toBe('Opus 5.5')
  expect(modelName('claude-sonnet-4-6-20260101')).toBe('Sonnet 4.6')
  expect(windowOf('claude-haiku-4-5')).toBe(200_000)
  expect(windowOf('claude-opus-5-5')).toBe(1_000_000)
  expect(fmtTokens(1_500_000)).toBe('1.5M')
  expect(fmtTokens(312_400)).toBe('312k')
  expect(fmtTime(250_000)).toBe('4:10')
  expect(fmtTime(3_725_000)).toBe('1:02:05')
  const a: AgentRun = {
    id: 'a', type: 'general-purpose', description: 'd', model: 'claude-opus-5-5', effort: 'medium', status: 'done',
    startedAt: 1_000, endedAt: 61_000, contextTokens: 180_000, contextMax: 1_000_000, tokens: 400_000, costUsd: 0.42, steps: 3,
  }
  expect(runModel(a)).toBe('Opus 5.5 · medium')
  expect(ctxOf(a)).toBe(18)
  expect(totals([a], 99_000)).toEqual({ cost: 0.42, tokens: 400_000, time: 60_000 })
  expect(totals([], 99_000).time).toBe(0)
})
