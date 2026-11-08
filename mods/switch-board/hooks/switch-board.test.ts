import { expect, test } from 'claude-code/testing'
import type { On } from 'claude-code'
import type { Engine } from 'claude-code/testing'

import { parseInstalled, rowsOf } from './rows'

const PLUGIN = 'switch-board'
const PANE = 'switch-board'
const PANE_PROPS = { title: '', isFocused: false, bodyColumns: 60, placement: 'dock', scroll: { offset: 0, bodyRows: 30 }, view: {} } as const

type Config = { key: string; value: string; isLocked?: boolean }

// The world beneath the mod: settings rows, the claude CLI, panes, surfaces and toasts.
function world(on: On, opts: { config?: Config[]; installed?: object[] | null; surfaces?: string[]; cliExit?: number } = {}) {
  let config: Config[] = opts.config ?? [
    { key: 'work-band.enabled', value: 'on' },
    { key: 'work-band.terminal', value: 'off' },
    { key: 'token-weather.enabled', value: 'off' },
  ]
  let installed = opts.installed === undefined
    ? [
        { id: 'work-band@cc-mods', enabled: true },
        { id: 'token-weather@cc-mods', enabled: true },
        { id: 'filetree@cc-mods', enabled: true },
        { id: 'switch-board@cc-mods', enabled: true },
        { id: 'superpowers@other', enabled: true },
      ]
    : opts.installed
  const runs: string[][] = []
  const sets: { key: string; value: unknown }[] = []
  const toasts: string[] = []
  let panes: { id: string }[] = []
  on('session.start', () => ({ cwd: '/repo' }) as never)
  on('command.register', () => ({ value: undefined }) as never)
  on('settings.read', () => ({ value: {} }) as never)
  on('env.get', () => ({ value: undefined }) as never)
  on('ui.render', () => ({ type: 'engine', ref: 0 }) as never)
  on('session.surfaces', () => ({ value: opts.surfaces ?? ['terminal', 'desktop'] }) as never)
  on('ui.panes', () => ({ value: panes }) as never)
  on('ui.open', (_$, e) => {
    panes = [...panes.filter(p => p.id !== (e as { id: string }).id), { id: (e as { id: string }).id }]
    return { value: { isPlaced: true } } as never
  })
  on('ui.close', (_$, e) => {
    panes = panes.filter(p => p.id !== (e as { id: string }).id)
    return { value: undefined } as never
  })
  on('ui.toast', (_$, e) => {
    toasts.push(String((e as { text?: string }).text ?? e))
    return { value: undefined } as never
  })
  on('command.run', () => ({ text: '' }) as never)
  on('config.list', () => ({ value: config.map(c => ({ ...c, label: c.key, kind: 'choice', provider: { kind: 'plugin', name: c.key.split('.')[0] }, isLocked: c.isLocked ?? false })) }) as never)
  on('config.set', (_$, e) => {
    const { key, value } = e as { key: string; value: string }
    sets.push({ key, value })
    config = config.map(c => (c.key === key ? { ...c, value } : c))
    return { value } as never
  })
  on('process.run', (_$, e) => {
    const argv = [...(e as { argv: readonly string[] }).argv]
    runs.push(argv)
    if (installed === null) throw new Error('spawn claude ENOENT')
    if (argv[2] === 'list') return { value: { exitCode: 0, stdout: JSON.stringify(installed), stderr: '' } } as never
    const exitCode = opts.cliExit ?? 0
    if (exitCode === 0) installed = installed.map(p => ((p as { id: string }).id === argv[3] ? { ...p, enabled: argv[2] === 'enable' } : p))
    return { value: { exitCode, stdout: '', stderr: exitCode ? 'Plugin not found' : '' } } as never
  })
  return { runs, sets, toasts, panes: () => panes }
}

const start = ($: Engine) => $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true } as never)

async function pane($: Engine, surface: 'terminal' | 'desktop' = 'desktop') {
  return $.ui.mount({ plugin: PLUGIN, surface, component: 'Pane', requestId: PANE, props: PANE_PROPS as never })
}

async function texts($: Engine, surface: 'terminal' | 'desktop' = 'desktop'): Promise<string> {
  const ui = await pane($, surface).catch(() => null)
  if (!ui) return ''
  const all = (await ui.findAll({ type: 'Text' })).map(t => t.text)
  const buttons = (await ui.findAll({ type: 'Button' })).map(b => `[${String(b.props.label)}]`)
  await ui.unmount()
  return [...all, ...buttons].join(' | ')
}

test('rows: Enabled settings switch at once, other cc-mods mods through the CLI, never itself', () => {
  const rows = rowsOf(
    [
      { key: 'work-band.enabled', value: 'on', isLocked: false },
      { key: 'work-band.terminal', value: 'off', isLocked: false },
      { key: 'token-weather.enabled', value: 'off', isLocked: true },
      { key: 'switch-board.enabled', value: 'on', isLocked: false },
    ],
    {
      isAvailable: true,
      plugins: parseInstalled(
        JSON.stringify([
          { id: 'work-band@cc-mods', enabled: true },
          { id: 'filetree@cc-mods', enabled: false },
          { id: 'switch-board@cc-mods', enabled: true },
          { id: 'superpowers@other', enabled: true },
        ]),
      ),
    },
    { 'filetree@cc-mods': true },
  )
  expect(rows).toEqual([
    { name: 'filetree', via: 'cli', key: 'filetree@cc-mods', isOn: false, isLocked: false, pending: true },
    { name: 'token-weather', via: 'config', key: 'token-weather.enabled', isOn: false, isLocked: true },
    { name: 'work-band', via: 'config', key: 'work-band.enabled', isOn: true, isLocked: false },
  ])
})

test('parseInstalled: anything but the JSON list is an empty list', () => {
  expect(parseInstalled('not json')).toEqual([])
  expect(parseInstalled('{"id":"x"}')).toEqual([])
})

test('the panel opens with the desktop app and lists each mod with its state', async ($, on) => {
  const w = world(on)
  await start($)
  expect(w.panes().map(p => p.id)).toEqual([PANE])
  const text = await texts($)
  expect(text).toContain('filetree')
  expect(text).toContain('token-weather')
  expect(text).toContain('work-band')
  expect(text).not.toContain('switch-board')
  expect(text).not.toContain('superpowers')
})

test('the terminal alone: no panel opens, and the command says where it is', async ($, on) => {
  const w = world(on, { surfaces: ['terminal'] })
  await start($)
  expect(w.panes()).toEqual([])
  const run = $.command.run as (e: unknown) => Promise<{ text?: string }>
  expect((await run({ command: 'switch-board', args: '' })).text).toContain('desktop')
  expect(w.panes()).toEqual([])
})

test('the terminal draws nothing of the panel', async ($, on) => {
  world(on)
  await start($)
  expect(await texts($, 'terminal')).not.toContain('work-band')
})

test('pressing a mod with an Enabled setting sets it, and the row follows', async ($, on) => {
  const w = world(on)
  await start($)
  const ui = await pane($)
  await ui.press({ key: 'flip-work-band' })
  expect(w.sets).toEqual([{ key: 'work-band.enabled', value: 'off' }])
  await ui.unmount()
  const again = await pane($)
  await again.press({ key: 'flip-token-weather' })
  await again.unmount()
  expect(w.sets).toEqual([
    { key: 'work-band.enabled', value: 'off' },
    { key: 'token-weather.enabled', value: 'on' },
  ])
})

test('pressing a mod without one runs the CLI and marks it for the next session', async ($, on) => {
  const w = world(on)
  await start($)
  const ui = await pane($)
  await ui.press({ key: 'flip-filetree' })
  await ui.unmount()
  expect(w.runs).toContainEqual(['claude', 'plugin', 'disable', 'filetree@cc-mods'])
  expect(w.toasts.join(' ')).toContain('next session')
  expect(await texts($)).toContain('next session')
})

test('a failed CLI run says why in a toast and changes nothing', async ($, on) => {
  const w = world(on, { cliExit: 1 })
  await start($)
  const ui = await pane($)
  await ui.press({ key: 'flip-filetree' })
  await ui.unmount()
  expect(w.toasts.join(' ')).toContain('Plugin not found')
  expect(await texts($)).not.toContain('next session')
})

test('no claude CLI: only the Enabled settings are listed, with a note', async ($, on) => {
  world(on, { installed: null })
  await start($)
  const text = await texts($)
  expect(text).toContain('work-band')
  expect(text).not.toContain('filetree')
  expect(text).toContain('could not be run')
})

test('a locked setting shows its state with no button', async ($, on) => {
  world(on, { config: [{ key: 'work-band.enabled', value: 'on', isLocked: true }], installed: [] })
  await start($)
  const ui = await pane($)
  expect(await ui.findAll({ type: 'Button' })).toEqual([])
  await ui.unmount()
  expect(await texts($)).toContain('locked')
})

test('Korean strings when the language option is ko', { options: { language: 'ko' } }, async ($, on) => {
  world(on)
  await start($)
  expect(await texts($)).toContain('켜짐')
})
