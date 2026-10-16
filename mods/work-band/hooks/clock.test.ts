import { expect, test } from 'claude-code/testing'

import { BAND, PLUGIN, SURFACES, band, endTurn, slash, submit, todoWrite, world } from './test-world'

const TODOS = [
  { content: 'Write the parser', status: 'completed', activeForm: 'Writing the parser' },
  { content: 'Run the tests', status: 'in_progress', activeForm: 'Running the tests' },
]

for (const surface of SURFACES) {
  test(`${surface}: the clock runs from a new request and stops when its turn ends`, async ($, on) => {
    const { clock } = world(on)
    await todoWrite($, TODOS)
    expect(await band($, surface)).not.toContain('0:00')
    await submit($, 'go on')
    expect(await band($, surface)).toContain('0:00')
    await clock.advance(13_000)
    expect(await band($, surface)).toContain('0:13')
    await endTurn($)
    await clock.advance(60_000)
    expect(await band($, surface)).toContain('0:13')
  })
}

test('a finished background task’s turn does not run the clock again', async ($, on) => {
  const { clock } = world(on)
  await todoWrite($, TODOS)
  await submit($, 'go on')
  await clock.advance(5_000)
  await endTurn($)
  await submit($, 'agent finished', { origin: { kind: 'task-notification' } })
  await clock.advance(30_000)
  await endTurn($)
  expect(await band($, 'terminal')).toContain('0:05')
})

test('the next request starts the clock over; a slash skill is a request, a built-in command is not', async ($, on) => {
  const { clock } = world(on)
  await todoWrite($, TODOS)
  await submit($, 'first')
  await clock.advance(9_000)
  await endTurn($)
  await slash($, 'model', 'opus', { isSkill: false })
  expect(await band($, 'terminal')).toContain('0:09')
  await slash($, 'superpowers:brainstorming', 'Auth')
  const shown = await band($, 'terminal')
  expect(shown).toContain('Brainstorm')
  expect(shown).toContain('0:00')
})

// The engine queues a command typed into a running turn and expands it after that turn ends.
test('a slash skill typed into a running turn moves the flow once it expands, and keeps the clock', async ($, on) => {
  const { clock } = world(on)
  await submit($, 'first')
  await clock.advance(4_000)
  await slash($, 'superpowers:brainstorming', 'Auth', { isSkill: false, extra: { turnId: 'turn-1' } })
  await endTurn($)
  await clock.advance(2_000)
  await ($.skill.prompt as (e: unknown) => Promise<unknown>)({ skill: 'superpowers:brainstorming', text: '' })
  const shown = await band($, 'terminal')
  expect(shown).toContain('Brainstorm')
  expect(shown).toContain('0:04')
})

test('a narrow terminal drops the time', async ($, on) => {
  world(on)
  await todoWrite($, TODOS)
  await submit($, 'go on')
  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'AbovePrompt', props: { ...BAND, bodyColumns: 50 } })
  expect(await ui.find({ type: 'Text', text: /^0:00$/ })).toBeUndefined()
  await ui.unmount()
})
