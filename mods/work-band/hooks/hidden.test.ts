import { expect, test } from 'claude-code/testing'

import { PANE, PANE_PROPS, PLUGIN, band, spawn, todoWrite, world } from './test-world'

// "Show in terminal" left at its default, off: the band and the panel draw in the apps alone.

test('off: the band stays off the terminal and draws on the desktop', async ($, on) => {
  world(on)
  await todoWrite($, [
    { content: 'A', status: 'completed' },
    { content: 'B', status: 'pending' },
  ])
  expect(await band($, 'terminal')).toBeNull()
  expect(await band($, 'desktop')).toContain('1/2')
})

test('off: the panel draws nothing on the terminal', async ($, on) => {
  world(on)
  await spawn($, 't1', 'Implement Task 3')
  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'Pane', requestId: PANE, props: PANE_PROPS }).catch(() => null)
  const texts = ui ? (await ui.findAll({ type: 'Text' })).map(t => t.text).join(' | ') : ''
  await ui?.unmount()
  expect(texts).not.toContain('Implement Task 3')
  const desk = await $.ui.mount({ plugin: PLUGIN, surface: 'desktop', component: 'Pane', requestId: PANE, props: PANE_PROPS })
  const svgs = (await desk.findAll({ type: 'Svg' })).map(el => String(el.props.source)).join('')
  await desk.unmount()
  expect(svgs).toContain('Implement Task 3')
})

test('off: /work-band in a terminal alone says how to turn it on', async ($, on) => {
  const { panes, drawOn } = world(on)
  const run = $.command.run as (e: unknown) => Promise<{ text?: string }>
  expect((await run({ command: 'work-band', args: '' })).text).toContain('Show in terminal')
  expect(panes()).toEqual([])
  // The desktop app attached: the panel opens there.
  drawOn(['terminal', 'desktop'])
  expect((await run({ command: 'work-band', args: '' })).text).toBe('Agents panel opened.')
  expect(panes().map(p => p.id)).toEqual([PANE])
})

test('on: the band draws on the terminal too', { options: { terminal: 'on' } }, async ($, on) => {
  world(on)
  await todoWrite($, [
    { content: 'A', status: 'completed' },
    { content: 'B', status: 'pending' },
  ])
  expect(await band($, 'terminal')).toContain('1/2')
})

// "Enabled" off (the switch-board panel flips it): nothing on any surface, no command.
test('enabled off: no band and no panel on any surface', { options: { enabled: 'off', terminal: 'on' } }, async ($, on) => {
  world(on)
  await todoWrite($, [
    { content: 'A', status: 'completed' },
    { content: 'B', status: 'pending' },
  ])
  expect(await band($, 'terminal')).toBeNull()
  expect(await band($, 'desktop')).toBeNull()
})
