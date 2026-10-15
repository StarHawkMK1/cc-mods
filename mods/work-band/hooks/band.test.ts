import { expect, mock, test } from 'claude-code/testing'

import { BAND, PANE, PLUGIN, SURFACES, band, finish, spawn, submit, taskCreate, taskUpdate, todoWrite, world } from './test-world'

for (const surface of SURFACES) {
  test(`${surface}: with nothing to show the band stays empty`, async ($, on) => {
    world(on)
    expect(await band($, surface)).toBeNull()
  })
}

const TODOS = [
  { content: 'Write the parser', status: 'completed', activeForm: 'Writing the parser' },
  { content: 'Run the tests', status: 'in_progress', activeForm: 'Running the tests' },
  { content: 'Update the docs', status: 'pending', activeForm: 'Updating the docs' },
]
const allDone = TODOS.map(t => ({ ...t, status: 'completed' }))

for (const surface of SURFACES) {
  test(`${surface}: the main to-do list draws the band`, async ($, on) => {
    world(on)
    await todoWrite($, TODOS)
    const shown = await band($, surface)
    expect(shown).toContain('Running the tests')
    expect(shown).toContain('Tasks 1/3')
    expect(shown).toContain('33%')
  })

  test(`${surface}: TaskCreate and TaskUpdate draw the band`, async ($, on) => {
    world(on)
    await taskCreate($, 'Write the parser')
    await taskCreate($, 'Run the tests', 'Running the tests')
    await taskCreate($, 'Update the docs')
    await taskUpdate($, '1', { status: 'completed' })
    await taskUpdate($, '2', { status: 'in_progress' })
    expect(await band($, surface)).toContain('Tasks 1/3')
    await taskUpdate($, '2', { status: 'deleted' })
    expect(await band($, surface)).toContain('Tasks 1/2')
  })

  test(`${surface}: subagents draw the band without a list`, async ($, on) => {
    world(on)
    await spawn($, 't1')
    await spawn($, 't2')
    await finish($, 't1')
    const shown = await band($, surface)
    expect(shown).toContain('Subagents')
    expect(shown).toContain('Agents 1/2')
    await finish($, 't2')
    expect(await band($, surface)).toContain('Done')
  })
}

test('a subagent’s to-do list never draws the band', async ($, on) => {
  world(on)
  await todoWrite($, TODOS, 'ag-x')
  await taskCreate($, 'Theirs', undefined, 'ag-x')
  expect(await band($, 'terminal')).toBeNull()
})

test('a TaskUpdate for an unknown task changes nothing', async ($, on) => {
  world(on)
  await taskUpdate($, '99', { status: 'in_progress', subject: 'Ghost' })
  expect(await band($, 'terminal')).toBeNull()
})

// Not `world`: a second mock of the same tool would race the first.
test('a refused to-do call leaves the band alone', async ($, on) => {
  mock.clock(on)
  on('ui.render', () => ({ type: 'engine' }) as never)
  on('tool.call', { tool: 'TodoWrite' }, () => ({ deny: 'not now' }) as never)
  await todoWrite($, TODOS)
  expect(await band($, 'terminal')).toBeNull()
})

test('a new request clears what finished and keeps what did not', async ($, on) => {
  const { clock } = world(on)
  await todoWrite($, allDone)
  await submit($, 'next thing')
  expect(await band($, 'terminal')).toBeNull()

  await todoWrite($, TODOS)
  await submit($, 'and another')
  expect(await band($, 'terminal')).toContain('Tasks 1/3')

  await todoWrite($, [])
  await spawn($, 't1')
  await spawn($, 't2')
  await finish($, 't1')
  await clock.advance(5_000)
  await submit($, 'third')
  expect(await band($, 'terminal')).toContain('Agents 0/1')
})

test('a slash command or a prompt typed mid-turn is not a new request', async ($, on) => {
  world(on)
  await todoWrite($, allDone)
  await submit($, '/work-band', { command: { name: 'work-band', args: '' } })
  await submit($, 'also this', { turnId: 'turn-1' })
  expect(await band($, 'terminal')).toContain('Done')
})

test('✕ hides the harness band until new data arrives', async ($, on) => {
  world(on)
  await todoWrite($, TODOS)
  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'AbovePrompt', props: BAND })
  await ui.press({ key: 'work-band-dismiss' })
  await ui.unmount()
  expect(await band($, 'terminal')).toBeNull()
  await spawn($, 't1')
  expect(await band($, 'terminal')).toContain('Tasks 1/3')
})

test('×N counts running subagents and opens the panel', async ($, on) => {
  const { panes } = world(on)
  await todoWrite($, TODOS)
  let ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'AbovePrompt', props: BAND })
  expect(await ui.find({ key: 'work-band-agents' })).toBeUndefined()
  await ui.unmount()

  await spawn($, 't1')
  await spawn($, 't2')
  await finish($, 't1')
  ui = await $.ui.mount({ plugin: PLUGIN, surface: 'desktop', component: 'AbovePrompt', props: BAND })
  expect((await ui.find({ key: 'work-band-agents' }))?.props.label).toBe('×1')
  await ui.press({ key: 'work-band-agents' })
  await ui.unmount()
  expect(panes().map(p => p.id)).toEqual([PANE])
})

test('a prompt the user did not send is not a new request', async ($, on) => {
  world(on)
  await todoWrite($, allDone)
  await submit($, 'agent finished', { origin: { kind: 'task-notification' } })
  await submit($, 'from a peer', { origin: { kind: 'peer' } })
  expect(await band($, 'terminal')).toContain('Done')
  await submit($, 'from my phone', { origin: { kind: 'bridge' } })
  expect(await band($, 'terminal')).toBeNull()
})
