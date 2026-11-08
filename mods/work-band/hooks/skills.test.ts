import { expect } from 'claude-code/testing'

import { BAND, PLUGIN, SURFACES, band, bash, endTurn, skill, slash, spawn, submit, todoWrite, world, test } from './test-world'

const TODOS = [
  { content: 'Write the parser', status: 'completed', activeForm: 'Writing the parser' },
  { content: 'Run the tests', status: 'in_progress', activeForm: 'Running the tests' },
  { content: 'Update the docs', status: 'pending', activeForm: 'Updating the docs' },
]

for (const surface of SURFACES) {
  test(`${surface}: a skill the model calls draws its band until the request is over`, async ($, on) => {
    world(on)
    await submit($, 'make the hero nicer')
    await skill($, 'impeccable', 'polish the hero')
    let shown = await band($, surface)
    expect(shown).toContain('impeccable')
    expect(shown).toContain('Running')
    await endTurn($)
    shown = await band($, surface)
    expect(shown).toContain('Done')
    await submit($, 'thanks')
    expect(await band($, surface)).toBeNull()
  })
}

test('a slash skill takes its progress from the to-do list', async ($, on) => {
  world(on)
  await slash($, 'taste-skill:minimalist-ui', 'landing page')
  expect(await band($, 'terminal')).toContain('taste-skill:minimalist-ui')
  await todoWrite($, TODOS)
  const shown = await band($, 'terminal')
  expect(shown).toContain('taste-skill:minimalist-ui')
  expect(shown).toContain('Tasks 1/3')
})

test('without a list, the subagents fill the skill band', async ($, on) => {
  world(on)
  await slash($, 'docs-system:wrapup', '', { promptName: 'wrapup', pluginName: 'docs-system' })
  await spawn($, 't1')
  const shown = await band($, 'terminal')
  expect(shown).toContain('docs-system:wrapup')
  expect(shown).toContain('Agents 0/1')
})

test('a plugin named after its one skill shows the name once', async ($, on) => {
  world(on)
  await skill($, 'frontend-design:frontend-design')
  const shown = await band($, 'terminal')
  expect(shown).toContain('frontend-design')
  expect(shown).not.toContain('frontend-design:frontend-design')
})

test('a built-in command and a subagent’s skill draw nothing', async ($, on) => {
  world(on)
  await slash($, 'model', 'opus', { isSkill: false })
  await skill($, 'impeccable', 'x', 'ag-1')
  expect(await band($, 'terminal')).toBeNull()
})

test('a superpowers flow wins over the skill band', async ($, on) => {
  world(on)
  await skill($, 'superpowers:brainstorming', 'Auth')
  await skill($, 'impeccable')
  const shown = await band($, 'terminal')
  expect(shown).toContain('Brainstorm')
  expect(shown).not.toContain('impeccable')
})

test('the skills setting narrows what shows', { options: { skills: 'taste-skill:, Impeccable' } }, async ($, on) => {
  world(on)
  await skill($, 'taste-skill:minimalist-ui')
  expect(await band($, 'terminal')).toContain('taste-skill:minimalist-ui')
  await submit($, 'next')
  await skill($, 'impeccable')
  expect(await band($, 'terminal')).toContain('impeccable')
  await submit($, 'next')
  await skill($, 'vault:vault-note')
  expect(await band($, 'terminal')).toBeNull()
})

test('a skill brings a dismissed band back', async ($, on) => {
  world(on)
  await todoWrite($, TODOS)
  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'AbovePrompt', props: BAND })
  await ui.press({ key: 'work-band-dismiss' })
  await ui.unmount()
  expect(await band($, 'terminal')).toBeNull()
  await skill($, 'impeccable')
  expect(await band($, 'terminal')).toContain('impeccable')
})

test('desktop: the alt text carries the skill’s argument', async ($, on) => {
  world(on)
  await skill($, 'impeccable', 'polish the hero')
  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'desktop', component: 'AbovePrompt', props: BAND })
  expect(String((await ui.find({ type: 'Svg' }))?.props.alt)).toContain('polish the hero')
  await ui.unmount()
})

test('Korean: the skill band and the chip', { options: { language: 'ko' } }, async ($, on) => {
  const { answerBash } = world(on)
  on('session.start', async () => ({ cwd: '/repo' }) as never)
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true } as never)
  await submit($, '다듬어 줘')
  await skill($, 'impeccable')
  answerBash('npm test', { isError: true, result: 'Exit code 1' })
  await bash($, 'npm test')
  const shown = await band($, 'terminal')
  expect(shown).toContain('실행 중')
  expect(shown).toContain('✗ 테스트')
})
