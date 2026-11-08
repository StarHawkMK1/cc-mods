/** One installed plugin, as `claude plugin list --json` names it. */
export type Installed = { id: string; isEnabled: boolean; version?: string }

/** The CLI's list of installed plugins; `isAvailable` false when the CLI could not be run. */
export type InstalledList = { isAvailable: boolean; plugins: Installed[] }

declare module 'claude-code' {
  interface PluginState {
    'switch-board': {
      /** Bumped after every change, so the panel reads the settings again. */
      tick: number
      /** The CLI's list, read at the start and after each change. */
      installed: Shaped<InstalledList>
      /** Plugin ids switched through the CLI this session, with whether each was on when first switched. */
      changed: Shaped<Record<string, boolean>>
      /** The row being switched now, so its button waits. */
      busy: string | null
    }
  }
}
