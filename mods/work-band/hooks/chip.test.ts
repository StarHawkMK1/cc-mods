import { expect } from 'claude-code/testing'

import { BAND, PLUGIN, SURFACES, band, bash, skill, submit, todoWrite, world, test } from './test-world'

const TODOS = [{ content: 'Fix the parser', status: 'in_progress', activeForm: 'Fixing the parser' }]
const FAILED = { isError: true, result: 'Exit code 1\n3 failed' }
const PASSED = { result: { stdout: '5 passed', stderr: '', interrupted: false } }

for (const surface of SURFACES) {
  test(`${surface}: the last test run turns the chip red, then green`, async ($, on) => {
    const { answerBash } = world(on)
    await todoWrite($, TODOS)
    expect(await band($, surface)).not.toContain('tests')
    answerBash('npm test', FAILED)
    await bash($, 'npm test')
    let shown = await band($, surface)
    expect(shown).toContain('✗ tests')
    if (surface === 'desktop') expect(shown).toContain('#D0453F')
    answerBash('npm test', PASSED)
    await bash($, 'npm test')
    shown = await band($, surface)
    expect(shown).toContain('✓ tests')
    expect(shown).not.toContain('✗ tests')
  })
}

test('terminal: the chip is red text', async ($, on) => {
  const { answerBash } = world(on)
  await todoWrite($, TODOS)
  answerBash('pytest -q', FAILED)
  await bash($, 'pytest -q')
  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'AbovePrompt', props: BAND })
  expect((await ui.find({ type: 'Text', text: /^✗ tests$/ }))?.props.color).toBe('red')
  await ui.unmount()
})

test('a subagent’s test run counts', async ($, on) => {
  const { answerBash } = world(on)
  await todoWrite($, TODOS)
  answerBash('go test ./...', FAILED)
  await bash($, 'go test ./...', 'ag-1')
  expect(await band($, 'terminal')).toContain('✗ tests')
})

test('background runs, cut-off runs and other commands leave the chip alone', async ($, on) => {
  const { answerBash } = world(on)
  await todoWrite($, TODOS)
  answerBash('npm test', FAILED)
  await bash($, 'npm test', undefined, { run_in_background: true })
  answerBash('cargo test', { result: { stdout: '', stderr: '', interrupted: true } })
  await bash($, 'cargo test')
  answerBash('npm install', FAILED)
  await bash($, 'npm install')
  expect(await band($, 'terminal')).not.toContain('tests')
})

test('a new request clears the chip unless a flow is under way; a new flow and ✕ clear it', async ($, on) => {
  const { answerBash } = world(on)
  answerBash('npm test', FAILED)
  await todoWrite($, TODOS)
  await bash($, 'npm test')
  await submit($, 'next')
  expect(await band($, 'terminal')).not.toContain('tests')

  await skill($, 'superpowers:executing-plans')
  await bash($, 'npm test')
  await submit($, 'keep going')
  expect(await band($, 'terminal')).toContain('✗ tests')
  await skill($, 'superpowers:brainstorming', 'Next idea')
  expect(await band($, 'terminal')).not.toContain('tests')

  await bash($, 'npm test')
  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'AbovePrompt', props: BAND })
  await ui.press({ key: 'work-band-dismiss' })
  await ui.unmount()
  await todoWrite($, TODOS)
  expect(await band($, 'terminal')).not.toContain('tests')
})

test('testCommands adds what counts as a test run', { options: { testCommands: 'just test, ./run-tests.sh' } }, async ($, on) => {
  const { answerBash } = world(on)
  await todoWrite($, TODOS)
  answerBash('just test --all', FAILED)
  await bash($, 'just test --all')
  expect(await band($, 'terminal')).toContain('✗ tests')
})
