import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'
import type { Engine } from 'claude-code/testing'

import { BAND, PLUGIN, SURFACES, band, todoWrite, world } from './test-world'
import { TRANSCRIPT } from './transcript-fixture'

const sessionStart = (source: string) => ($: Engine) =>
  ($.classic.SessionStart as (e: unknown) => Promise<unknown>)({ hook_event_name: 'SessionStart', source, session_id: 's', transcript_path: 't', cwd: '/repo' })
const resume = sessionStart('resume')
const start = ($: Engine) => $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true } as never)
// session.start registers /work-band before it restores: without this stub it stops there.
const commands = (on: On) => on('command.register', () => ({ value: undefined }) as never)

for (const surface of SURFACES) {
  test(`${surface}: a resumed session gets its flow back, without a clock`, async ($, on) => {
    world(on)
    on('session.messages', () => ({ value: TRANSCRIPT }) as never)
    await resume($)
    const shown = await band($, surface)
    expect(shown).toContain('Auth login')
    expect(shown).toContain('Build 3/7')
    expect(shown).toContain('✗ tests')
    expect(shown).not.toContain('0:00')
  })
}

test('a session started with --resume restores in session.start', async ($, on) => {
  world(on)
  mock.env(on, { LANG: 'en_US.UTF-8' })
  on('session.start', async () => ({ cwd: '/repo' }) as never)
  commands(on)
  on('session.messages', () => ({ value: TRANSCRIPT }) as never)
  await start($)
  expect(await band($, 'terminal')).toContain('Build 3/7')
})

test('it restores once: a reload after ✕ does not bring the flow back', async ($, on) => {
  world(on)
  mock.env(on, { LANG: 'en_US.UTF-8' })
  on('session.start', async () => ({ cwd: '/repo' }) as never)
  commands(on)
  on('session.messages', () => ({ value: TRANSCRIPT }) as never)
  await resume($)
  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'AbovePrompt', props: BAND })
  await ui.press({ key: 'work-band-dismiss' })
  await ui.unmount()
  await start($)
  expect(await band($, 'terminal')).toBeNull()
})

test('a startup or clear SessionStart does not replay', async ($, on) => {
  world(on)
  on('session.messages', () => ({ value: TRANSCRIPT }) as never)
  await sessionStart('startup')($)
  await sessionStart('clear')($)
  expect(await band($, 'terminal')).toBeNull()
})

test('state that moved while the transcript was read wins', async ($, on) => {
  world(on)
  on('session.messages', async () => {
    await todoWrite($, [{ content: 'Live work', status: 'in_progress', activeForm: 'Doing live work' }])
    return { value: TRANSCRIPT } as never
  })
  await resume($)
  const shown = await band($, 'terminal')
  expect(shown).toContain('Doing live work')
  expect(shown).not.toContain('Build')
})
// If the kit runs one dispatch at a time and this test hangs, move the state
// another way inside the mock: `await $.state.set({ plugin: 'work-band', key: 'work' }, …)`
// with a list holding 'Doing live work', then keep the same two expectations.

test('a plan named in the Build skill is read after the replay', async ($, on) => {
  const PLAN = ['# Old plan Implementation Plan', ...Array.from({ length: 4 }, (_, i) => `### Task ${i + 1}: Step`)].join('\n')
  world(on, 1_000, { 'docs/superpowers/plans/old.md': PLAN })
  on('session.messages', () =>
    ({
      value: [
        { role: 'user', text: 'go', toolUses: [] },
        { role: 'assistant', text: '', toolUses: [{ tool_use_id: 'u1', tool: 'Skill', input: { skill: 'superpowers:executing-plans', args: 'docs/superpowers/plans/old.md' } }] },
      ],
    }) as never,
  )
  await resume($)
  const shown = await band($, 'terminal')
  expect(shown).toContain('Old plan')
  expect(shown).toContain('Build 0/4')
})

test('a transcript that cannot be read draws nothing', async ($, on) => {
  world(on)
  on('session.messages', () => {
    throw new Error('no transcript')
  })
  await resume($)
  expect(await band($, 'terminal')).toBeNull()
})
