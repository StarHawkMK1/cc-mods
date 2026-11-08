import { expect, mock } from 'claude-code/testing'

import { BAND, PLUGIN, SURFACES, band, endTurn, skill, slash, submit, todoWrite, world, write, test } from './test-world'

const PLAN = [
  '# Auth login Implementation Plan',
  ...Array.from({ length: 7 }, (_, i) => `### Task ${i + 1}: Step ${i + 1}\n- [ ] do it`),
].join('\n')

const buildTodos = (done: number) =>
  Array.from({ length: 7 }, (_, i) => ({
    content: `Task ${i + 1}`,
    status: i < done ? 'completed' : i === done ? 'in_progress' : 'pending',
    activeForm: `Doing task ${i + 1}`,
  }))

for (const surface of SURFACES) {
  test(`${surface}: a superpowers flow walks its stages`, async ($, on) => {
    world(on)
    await skill($, 'superpowers:brainstorming', 'Auth redesign\nwith details')
    let shown = await band($, surface)
    expect(shown).toContain('Auth redesign')
    expect(shown).toContain('Brainstorm')
    expect(shown).toContain('0%')

    await write($, 'docs/superpowers/specs/2026-10-15-auth-design.md', '# Auth redesign 설계\n')
    shown = await band($, surface)
    expect(shown).toContain('Spec')
    expect(shown).toContain('17%')

    await skill($, 'superpowers:writing-plans', 'docs/superpowers/specs/2026-10-15-auth-design.md')
    expect(await band($, surface)).toContain('33%')

    await write($, 'docs/superpowers/plans/2026-10-15-auth.md', PLAN)
    await skill($, 'superpowers:subagent-driven-development')
    shown = await band($, surface)
    expect(shown).toContain('Auth login')
    expect(shown).toContain('Build 0/7')
    expect(shown).toContain('50%')

    await todoWrite($, buildTodos(3))
    shown = await band($, surface)
    expect(shown).toContain('Build 3/7')
    expect(shown).toContain('57%')
  })
}

test('a plan handed to the executing skill is read for its task count', async ($, on) => {
  world(on, 1_000, { 'docs/superpowers/plans/2026-10-15-auth.md': PLAN })
  await skill($, 'superpowers:executing-plans', 'docs/superpowers/plans/2026-10-15-auth.md')
  expect(await band($, 'terminal')).toContain('Build 0/7')
})

test('an unreadable plan falls back to the to-do list', async ($, on) => {
  world(on)
  await skill($, 'superpowers:executing-plans', 'docs/superpowers/plans/missing.md')
  await todoWrite($, buildTodos(2).slice(0, 4))
  expect(await band($, 'terminal')).toContain('Build 2/4')
})

test('building without a plan: the first source file moves Brainstorm to Build', async ($, on) => {
  world(on)
  await skill($, 'superpowers:brainstorming', 'Small fix')
  await write($, '.superpowers/brainstorm/screen.html', '<p>')
  await write($, 'C:\\Users\\me\\.claude\\projects\\x\\memory\\note.md', 'n')
  expect(await band($, 'terminal')).toContain('Brainstorm')
  await write($, 'src/app.ts', 'x')
  expect(await band($, 'terminal')).toContain('Build')
})

test('a subagent’s skills and files never move the flow', async ($, on) => {
  world(on)
  await skill($, 'superpowers:brainstorming', 'Auth')
  await skill($, 'superpowers:finishing-a-development-branch', undefined, 'ag-1')
  await write($, 'src/app.ts', 'x', 'ag-1')
  expect(await band($, 'terminal')).toContain('Brainstorm')
})

test('stages only move forward; brainstorming starts afresh', async ($, on) => {
  world(on)
  await skill($, 'superpowers:subagent-driven-development')
  await skill($, 'superpowers:writing-plans')
  expect(await band($, 'terminal')).toContain('Build')
  await skill($, 'superpowers:brainstorming', 'Next idea')
  const shown = await band($, 'terminal')
  expect(shown).toContain('Next idea')
  expect(shown).toContain('Brainstorm')
})

test('a slash command starts the flow once the engine expands the skill', async ($, on) => {
  world(on)
  await submit($, '/superpowers:brainstorming Auth', { command: { name: 'superpowers:brainstorming', args: 'Auth' } })
  expect(await band($, 'terminal')).toBeNull()
  await ($.skill.prompt as (e: unknown) => Promise<unknown>)({ skill: 'superpowers:brainstorming', text: '' })
  const shown = await band($, 'terminal')
  expect(shown).toContain('Auth')
  expect(shown).toContain('Brainstorm')
})

test('Finish waits for the reply to its question, then ends with the turn that carries it out', async ($, on) => {
  world(on)
  await skill($, 'superpowers:brainstorming', 'Auth')
  await skill($, 'superpowers:finishing-a-development-branch')
  expect(await band($, 'terminal')).toContain('Finish')
  // The finishing skill ends its turn asking merge / PR / keep: not done yet.
  await endTurn($)
  expect(await band($, 'terminal')).not.toContain('Done')
  // The reply is a new request, and it keeps the flow.
  await submit($, '1')
  expect(await band($, 'terminal')).toContain('Finish')
  // The turn that carries out the reply ends the flow.
  await endTurn($)
  const shown = await band($, 'desktop')
  expect(shown).toContain('Done')
  expect(shown).toContain('100%')
  await submit($, 'thanks')
  expect(await band($, 'terminal')).toBeNull()
})

test('✕ ends the flow', async ($, on) => {
  world(on)
  await skill($, 'superpowers:brainstorming', 'Auth')
  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'AbovePrompt', props: BAND })
  await ui.press({ key: 'work-band-dismiss' })
  await ui.unmount()
  expect(await band($, 'terminal')).toBeNull()
})

test('other skills change nothing', async ($, on) => {
  world(on)
  await skill($, 'superpowers:systematic-debugging')
  expect(await band($, 'terminal')).toBeNull()
})

// Not `world`: a second mock of the same tool would race the first.
test('a failed skill call changes nothing', async ($, on) => {
  mock.clock(on)
  on('ui.render', () => ({ type: 'engine', ref: 0 }) as never)
  on('tool.call', { tool: 'Skill' }, () => ({ result: { success: false, commandName: 'x' } }) as never)
  await skill($, 'superpowers:brainstorming', 'Auth')
  expect(await band($, 'terminal')).toBeNull()
})

test('a typed slash command reaches the flow through command.run too', async ($, on) => {
  world(on)
  await ($.command.run as (e: unknown) => Promise<unknown>)({ command: 'superpowers:brainstorming', args: 'Typed topic', origin: { kind: 'composer' } })
  await ($.skill.prompt as (e: unknown) => Promise<unknown>)({ skill: 'superpowers:brainstorming', text: '' })
  const shown = await band($, 'terminal')
  expect(shown).toContain('Typed topic')
  expect(shown).toContain('Brainstorm')
})

test('a write outside the project root does not start the build', async ($, on) => {
  world(on)
  on('session.root', () => ({ value: 'C:\\repo' }) as never)
  await skill($, 'superpowers:brainstorming', 'Auth')
  await write($, 'C:\\Users\\me\\AppData\\Local\\Temp\\claude\\scratchpad\\notes.md', 'n')
  await write($, '/tmp/other.ts', 'x')
  expect(await band($, 'terminal')).toContain('Brainstorm')
  await write($, 'C:\\repo\\src\\app.ts', 'x')
  expect(await band($, 'terminal')).toContain('Build')
})

test('a Finish turn that did not answer does not end the flow', async ($, on) => {
  world(on)
  await skill($, 'superpowers:finishing-a-development-branch')
  await endTurn($, 'api-error')
  const shown = await band($, 'terminal')
  expect(shown).toContain('Finish')
  expect(shown).not.toContain('Done')
})

test('skill.prompt may name the skill apart from its plugin', async ($, on) => {
  world(on)
  await slash($, 'superpowers:brainstorming', 'Auth', { promptName: 'brainstorming', pluginName: 'superpowers' })
  expect(await band($, 'terminal')).toContain('Brainstorm')
})

test('a slash skill typed without its plugin moves the flow and reads its plan', async ($, on) => {
  world(on, 1_000, { 'docs/superpowers/plans/2026-10-15-auth.md': PLAN })
  await slash($, 'brainstorming', 'Auth', { pluginName: 'superpowers' })
  expect(await band($, 'terminal')).toContain('Brainstorm')
  await slash($, 'executing-plans', 'docs/superpowers/plans/2026-10-15-auth.md', { promptName: 'superpowers:executing-plans' })
  expect(await band($, 'terminal')).toContain('Build 0/7')
})

test('a skill.prompt with no slash command waiting changes nothing', async ($, on) => {
  world(on)
  await ($.skill.prompt as (e: unknown) => Promise<unknown>)({ skill: 'superpowers:brainstorming', text: '' })
  expect(await band($, 'terminal')).toBeNull()
})

test('a slash command never expanded goes stale when the turn ends', async ($, on) => {
  world(on)
  await submit($, '/superpowers:brainstorming Auth', { command: { name: 'superpowers:brainstorming', args: 'Auth' } })
  await endTurn($)
  await ($.skill.prompt as (e: unknown) => Promise<unknown>)({ skill: 'superpowers:brainstorming', text: '' })
  expect(await band($, 'terminal')).toBeNull()
})
