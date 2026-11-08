import { expect, mock } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'

import { BAND, PANE, PANE_PROPS, PLUGIN, finish, spawn, todoWrite, world, test } from './test-world'

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

test('a long subagent description is clipped when it starts', async ($, on) => {
  world(on)
  await spawn($, 't1', `Implement ${'x'.repeat(500)}`)
  const { ui } = await pane($, 'terminal')
  const title = (await ui.findAll({ type: 'Text' })).map(t => t.text ?? '').find(t => t.startsWith('Implement '))
  expect(title?.length).toBe(120)
  expect(title?.endsWith('…')).toBe(true)
  await ui.unmount()
})

test('a numeric effort still shows beside the model', async ($, on) => {
  world(on)
  on('turn.step', async function* () {
    return { turnId: 'turn', index: 0, answer: '', toolUses: [], stopReason: 'end_turn', usage: { model: 'claude-opus-5-5', input_tokens: 1, output_tokens: 1, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 } } as never
  })
  await spawn($, 't1', 'Implement Task 3')
  const stream = ($.turn.step as (e: unknown) => AsyncIterable<unknown>)({ turnId: 'turn', index: 0, model: 'claude-opus-5-5', effort: 3, messageCount: 1, agentId: 'ag-t1' })
  for await (const _ of stream) void _
  const { ui, texts } = await pane($, 'terminal')
  expect(texts).toContain('Opus 5.5 · 3')
  await ui.unmount()
})

test('/work-band opens and closes the panel', async ($, on) => {
  const { panes } = world(on)
  const run = $.command.run as (e: unknown) => Promise<{ text?: string }>
  expect((await run({ command: 'work-band', args: '' })).text).toBe('Agents panel opened.')
  expect(panes().map(p => p.id)).toEqual([PANE])
  expect((await run({ command: 'work-band', args: '' })).text).toBe('Agents panel closed.')
  expect(panes()).toEqual([])
})

test('Korean from Claude Code’s language setting', async ($, on) => {
  world(on)
  mock.env(on, { LANG: 'en_US.UTF-8' })
  on('settings.read', async () => ({ value: { language: '한국어' } }) as never)
  on('session.start', async () => ({ cwd: '/repo' }) as never)
  await $.session.start({ source: 'startup', cwd: '/repo', surface: 'terminal', isInteractive: true } as never)
  await todoWrite($, [{ content: 'A', status: 'completed' }, { content: 'B', status: 'pending' }])
  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'AbovePrompt', props: BAND })
  expect(await ui.find({ type: 'Text', text: /^작업 1\/2$/ })).toBeDefined()
  await ui.unmount()
})

test('the locale decides when the setting is empty', async ($, on) => {
  world(on)
  mock.env(on, { LANG: 'ko_KR.UTF-8' })
  on('settings.read', async () => ({ value: {} }) as never)
  on('session.start', async () => ({ cwd: '/repo' }) as never)
  await $.session.start({ source: 'startup', cwd: '/repo', surface: 'terminal', isInteractive: true } as never)
  const { ui, texts } = await pane($, 'terminal')
  expect(texts).toContain('아직 서브에이전트가 없습니다.')
  await ui.unmount()
})
