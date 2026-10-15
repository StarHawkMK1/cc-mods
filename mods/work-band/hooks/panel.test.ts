import { expect, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'

import { PANE, PANE_PROPS, PLUGIN, finish, spawn, todoWrite, world } from './test-world'

const pane = async ($: Engine, surface: 'terminal' | 'desktop') => {
  const ui = await $.ui.mount({ plugin: PLUGIN, surface, component: 'Pane', requestId: PANE, props: PANE_PROPS })
  const texts = (await ui.findAll({ type: 'Text' })).map(t => t.text).join(' | ')
  const svgs = (await ui.findAll({ type: 'Svg' })).map(el => String(el.props.source)).join('')
  return { ui, texts, svgs }
}

test('terminal: running and finished subagents, with a running one’s own steps', async ($, on) => {
  world(on)
  await spawn($, 't1', 'Implement Task 3')
  await spawn($, 't2', 'Review Task 2')
  await finish($, 't2')
  await todoWrite($, [
    { content: 'Write test', status: 'completed', activeForm: 'Writing test' },
    { content: 'Run tests', status: 'in_progress', activeForm: 'Running tests' },
  ], 'ag-t1')
  const { ui, texts } = await pane($, 'terminal')
  expect(texts).toContain('Running · 1')
  expect(texts).toContain('Implement Task 3')
  expect(texts).toContain('1/2 Running tests')
  expect(texts).toContain('Opus 5.5')
  expect((await ui.find({ key: 'done' }))?.props.label).toBe('▾ Finished · 1')
  expect(texts).toContain('Review Task 2')
  await ui.press({ key: 'done' })
  const after = (await ui.findAll({ type: 'Text' })).map(t => t.text).join(' | ')
  expect(after).not.toContain('Review Task 2')
  await ui.unmount()
})

test('desktop: a row SVG per subagent over the grid', async ($, on) => {
  world(on)
  await spawn($, 't1', 'Implement Task 3')
  const { ui, svgs } = await pane($, 'desktop')
  expect(svgs).toContain('Implement Task 3')
  expect(svgs).toContain('url(#g)')
  await ui.press({ key: 'compact' })
  const compact = (await ui.findAll({ type: 'Svg' })).map(el => String(el.props.source)).join('')
  expect(compact).not.toContain('Implement Task 3')
  expect(compact).toContain('crab run')
  await ui.unmount()
})

test('an empty panel says so', async ($, on) => {
  world(on)
  const { ui, texts } = await pane($, 'terminal')
  expect(texts).toContain('No subagents yet.')
  await ui.unmount()
})

test('the main to-do list never shows as a subagent’s steps', async ($, on) => {
  world(on)
  await spawn($, 't1', 'Implement Task 3')
  await todoWrite($, [{ content: 'Main thing', status: 'in_progress', activeForm: 'Doing main thing' }])
  const { ui, texts } = await pane($, 'terminal')
  expect(texts).not.toContain('Doing main thing')
  await ui.unmount()
})

// Each model request of a subagent feeds the panel's numbers through `turn.step`.
test('a subagent’s model requests fill in its context, cost and model', async ($, on) => {
  world(on)
  const usage = { model: 'claude-sonnet-5-5', input_tokens: 20_000, output_tokens: 5_000, cache_read_input_tokens: 150_000, cache_creation_input_tokens: 5_000 }
  on('turn.step', async function* () {
    return { turnId: 'turn', index: 0, answer: '', toolUses: [], stopReason: 'end_turn', usage } as never
  })
  await spawn($, 't1', 'Implement Task 3')
  const stream = ($.turn.step as (e: unknown) => AsyncIterable<unknown>)({ turnId: 'turn', index: 0, model: 'claude-sonnet-5-5', effort: 'high', messageCount: 1, agentId: 'ag-t1' })
  for await (const _ of stream) void _
  const { ui, texts } = await pane($, 'terminal')
  // 180K of 1M is 18%; (20K × 2 + 5K × 10 + 150K × 0.1 + 5K × 4) / 1M = $0.125.
  expect(texts).toContain('Sonnet 5.5 · high')
  expect(texts).toContain('ctx 18%')
  expect(texts).toContain('≈$0.13')
  await ui.unmount()
})
