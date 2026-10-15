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
