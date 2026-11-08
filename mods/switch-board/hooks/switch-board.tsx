// switch-board: a side panel in the desktop app that turns the cc-mods mods on and off.
//
// A mod with an "Enabled" setting (its userConfig field `enabled`) switches at once:
// the panel sets it through $.config.set, as /config would, and the mod reloads.
// Any other mod installed from the cc-mods marketplace switches through
// `claude plugin enable/disable`, which applies from the next session.
// Claude Code's terminal draws nothing of it: these mods are for the apps.

import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { InstalledList } from '../types'
import { parseInstalled, rowsOf } from './rows'
import type { Row } from './rows'

const PANE = 'switch-board'

type Lang = 'en' | 'ko'
const STRINGS = {
  en: {
    pane: 'Mods',
    on: 'On',
    off: 'Off',
    wait: '…',
    locked: 'locked',
    pending: 'next session',
    empty: 'No mods to switch.',
    noCli: 'The claude CLI could not be run: mods without an Enabled setting are not listed.',
    opened: 'Mods panel opened.',
    closed: 'Mods panel closed.',
    terminal: 'switch-board draws in the desktop app alone. Open the session there to switch mods.',
    failed: (name: string, why: string) => `Could not switch ${name}: ${why}`,
    next: (name: string) => `${name} switches from the next session (or after /reload-plugins).`,
  },
  ko: {
    pane: '모드',
    on: '켜짐',
    off: '꺼짐',
    wait: '…',
    locked: '잠김',
    pending: '다음 세션부터',
    empty: '켜고 끌 모드가 없습니다.',
    noCli: 'claude CLI를 실행할 수 없어 Enabled 설정이 없는 모드는 보이지 않습니다.',
    opened: '모드 패널을 열었습니다.',
    closed: '모드 패널을 닫았습니다.',
    terminal: 'switch-board는 데스크톱 앱에서만 보입니다. 모드를 켜고 끄려면 그 세션을 데스크톱 앱에서 여세요.',
    failed: (name: string, why: string) => `${name}을(를) 바꾸지 못했습니다: ${why}`,
    next: (name: string) => `${name}은(는) 다음 세션부터 (또는 /reload-plugins 후) 적용됩니다.`,
  },
}
let lang: Lang = 'en'
const tr = () => STRINGS[lang]

const tick = atom({ plugin: 'switch-board', key: 'tick' } as const, 0)
const installed = atom({ plugin: 'switch-board', key: 'installed' } as const, { isAvailable: false, plugins: [] } as InstalledList, {
  shape: 'installed-1',
})
const changed = atom({ plugin: 'switch-board', key: 'changed' } as const, {} as Record<string, boolean>, { shape: 'changed-1' })
const busy = atom({ plugin: 'switch-board', key: 'busy' } as const, null as string | null)

const langOf = (s: unknown): Lang => (typeof s === 'string' && /^(ko|korean|한국어)/i.test(s.trim()) ? 'ko' : 'en')

async function detectLang($: EngineInterface, option: unknown): Promise<Lang> {
  if (option === 'en' || option === 'ko') return option
  try {
    const settings = (await $.settings.read()) as Record<string, unknown>
    if (typeof settings.language === 'string' && settings.language.trim()) return langOf(settings.language)
  } catch {
    // No settings: the locale decides.
  }
  try {
    return langOf((await $.env.get('LC_ALL')) || (await $.env.get('LC_MESSAGES')) || (await $.env.get('LANG')))
  } catch {
    return 'en'
  }
}

// Reads `claude plugin list --json` into state; marks the list unavailable when the CLI can't run.
async function refreshInstalled($: EngineInterface): Promise<void> {
  let list: InstalledList = { isAvailable: false, plugins: [] }
  try {
    const { exitCode, stdout } = await $.process.run(['claude', 'plugin', 'list', '--json'], { timeoutMs: 15_000 })
    if (exitCode === 0) list = { isAvailable: true, plugins: parseInstalled(stdout) }
  } catch {
    // No claude on the PATH: only the mods with an Enabled setting are listed.
  }
  await update($, installed, () => list)
}

const bump = ($: EngineInterface) => update($, tick, n => n + 1)

async function hasAppSurface($: EngineInterface): Promise<boolean> {
  return (await $.session.surfaces()).some(s => s !== 'terminal')
}

async function openPane($: EngineInterface): Promise<void> {
  await $.ui.open({ id: PANE, title: tr().pane })
}

// Flips one row; a refusal or a failed CLI run is said in a toast and changes nothing.
async function flip($: EngineInterface, row: Row): Promise<void> {
  if (row.isLocked || (await read($, busy))) return
  await update($, busy, () => row.key)
  try {
    if (row.via === 'config') {
      const { deny } = await $.config.set({ key: row.key, value: row.isOn ? 'off' : 'on' })
      if (deny) $.ui.toast(tr().failed(row.name, deny))
    } else {
      const { exitCode, stderr, stdout } = await $.process.run(['claude', 'plugin', row.isOn ? 'disable' : 'enable', row.key], {
        timeoutMs: 30_000,
      })
      if (exitCode !== 0) {
        $.ui.toast(tr().failed(row.name, (stderr || stdout).trim().split('\n')[0] || `exit ${exitCode}`))
      } else {
        // Keep how the session loaded it, the first time it is switched.
        await update($, changed, prev => (row.key in prev ? prev : { ...prev, [row.key]: row.isOn }))
        $.ui.toast(tr().next(row.name))
      }
      await refreshInstalled($)
    }
  } catch (err) {
    $.ui.toast(tr().failed(row.name, String(err instanceof Error ? err.message : err)))
  } finally {
    await update($, busy, () => null)
    await bump($)
  }
}

export const register: Register = (on, options) => {
  on('session.start', async ($, e, next) => {
    const started = await next(e)
    lang = await detectLang($, options.language)
    await $.command.register({ name: 'switch-board', description: 'Show or hide the panel that turns the cc-mods mods on and off' })
    await refreshInstalled($)
    if (await hasAppSurface($)) await openPane($)
    return started
  })

  // The desktop app attached after the start: the panel opens there.
  on('session.attach', async ($, e, next) => {
    const attached = await next(e)
    if (e.surface !== 'terminal' && !(await $.ui.panes()).some(p => p.id === PANE)) await openPane($)
    return attached
  })

  // A setting changed from /config: read the rows again.
  on('config.set', async ($, e, next) => {
    const set = await next(e)
    if (e.key.endsWith('.enabled')) await bump($)
    return set
  }).catch(($, e, next) => next(e)) // It only watches: a failure here never stops the change.

  on('command.run', { command: 'switch-board' }, async $ => {
    if (!(await hasAppSurface($))) return { text: tr().terminal }
    if ((await $.ui.panes()).some(p => p.id === PANE)) {
      await $.ui.close({ id: PANE })
      return { text: tr().closed }
    }
    await refreshInstalled($)
    await openPane($)
    return { text: tr().opened }
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e, next) => {
    if (e.surface === 'terminal') return next(e)
    const s = tr()
    const { Box, Text, Button } = $.ui.resolve(e)
    await read($, tick)
    const list = await read($, installed)
    const rows = rowsOf(await $.config.list(), list, await read($, changed))
    const working = await read($, busy)

    return (
      <Box flexDirection="column" gap={1}>
        {rows.length === 0 && <Text dimColor>{s.empty}</Text>}
        {rows.map(row => (
          <Box key={`row-${row.name}`} flexDirection="row" justifyContent="space-between" gap={1}>
            <Box flexDirection="column">
              <Text bold>{row.name}</Text>
              {row.pending && <Text dimColor>{s.pending}</Text>}
              {row.isLocked && <Text dimColor>{s.locked}</Text>}
            </Box>
            {row.isLocked ? (
              <Text dimColor>{row.isOn ? s.on : s.off}</Text>
            ) : (
              <Button
                key={`flip-${row.name}`}
                label={working === row.key ? s.wait : row.isOn ? s.on : s.off}
                variant={row.isOn ? 'primary' : 'secondary'}
                onPress={() => void flip($, row)}
              />
            )}
          </Box>
        ))}
        {!list.isAvailable && <Text dimColor>{s.noCli}</Text>}
      </Box>
    )
  })
}
