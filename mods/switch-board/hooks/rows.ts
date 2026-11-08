import type { Installed, InstalledList } from '../types'

/** The marketplace whose mods the panel lists. */
export const MARKETPLACE = 'cc-mods'
/** The mod itself: never listed, so the panel can't switch itself off. */
export const SELF = 'switch-board'
/** The userConfig field a mod switches on and off through. */
export const FIELD = 'enabled'

/** One row of the panel. */
export type Row = {
  name: string
  /** `config`: its Enabled setting, applies at once. `cli`: `claude plugin enable/disable`, applies next session. */
  via: 'config' | 'cli'
  /** The settings key (`config`) or the installed id (`cli`). */
  key: string
  isOn: boolean
  isLocked: boolean
  /** A `cli` row switched this session away from how the session loaded it: applies next session. */
  pending?: true
}

/** What `$.config.list()` returns, as far as the panel reads it. */
export type ConfigRowLike = { key: string; value: unknown; isLocked: boolean }

/** Parses `claude plugin list --json`; an empty list when it is not that. */
export function parseInstalled(stdout: string): Installed[] {
  try {
    const list: unknown = JSON.parse(stdout)
    if (!Array.isArray(list)) return []
    return list.flatMap(p =>
      p && typeof p.id === 'string'
        ? [{ id: p.id, isEnabled: p.enabled === true, ...(typeof p.version === 'string' ? { version: p.version } : {}) }]
        : [],
    )
  } catch {
    return []
  }
}

/**
 * The panel's rows: every mod with an Enabled setting switches through it; every other
 * mod installed from the marketplace switches through the CLI. Sorted by name.
 */
export function rowsOf(config: readonly ConfigRowLike[], installed: InstalledList, changed: Record<string, boolean>): Row[] {
  const rows = new Map<string, Row>()
  for (const r of config) {
    if (!r.key.endsWith(`.${FIELD}`)) continue
    const name = r.key.slice(0, -FIELD.length - 1)
    if (name === SELF || name.includes('.')) continue
    rows.set(name, { name, via: 'config', key: r.key, isOn: r.value !== 'off' && r.value !== false, isLocked: r.isLocked })
  }
  for (const p of installed.plugins) {
    const [name = '', market] = p.id.split('@')
    if (market !== MARKETPLACE || name === SELF || rows.has(name)) continue
    // Switched this session to other than it loaded as: the session runs it as it was until the next one.
    const pending = changed[p.id] !== undefined && changed[p.id] !== p.isEnabled
    rows.set(name, { name, via: 'cli', key: p.id, isOn: p.isEnabled, isLocked: false, ...(pending ? { pending: true as const } : {}) })
  }
  return [...rows.values()].sort((a, b) => a.name.localeCompare(b.name))
}
