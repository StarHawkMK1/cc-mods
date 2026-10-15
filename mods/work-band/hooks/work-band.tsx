import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { AgentRun } from '../types'
import { costOf, usageTokens, windowOf, type Usage } from './agents'
import { ACCENT, CLAY, DONE, H, barText, rowSvg } from './draw'
import { blankWork, cleanTodos, createTodo, listOf, pickBar, startRequest, updateTodo, withList, type TaskUpdateInput } from './flow'
import { STRINGS, langOf, type Lang } from './i18n'

const PANE = 'work-band-agents'

// The engine lists a module's state from these literals: plugin and key stay spelled out.
const work = atom({ plugin: 'work-band', key: 'work' } as const, blankWork())
const agents = atom({ plugin: 'work-band', key: 'agents' } as const, [])
const panel = atom({ plugin: 'work-band', key: 'panel' } as const, { isCompact: false, isDoneCollapsed: false })
const now = atom({ plugin: 'work-band', key: 'now' } as const, 0)

// Module scope is fine: session.start sets it on every (re)load.
let lang: Lang = 'en'
const tr = () => STRINGS[lang]

async function detectLang($: EngineInterface, option: unknown): Promise<Lang> {
  if (option === 'en' || option === 'ko') return option
  try {
    const settings = (await $.settings.read()) as Record<string, unknown>
    if (typeof settings.language === 'string' && settings.language.trim()) return langOf(settings.language)
  } catch {
    // No settings: the locale decides.
  }
  const locale = (await $.env.get('LC_ALL')) || (await $.env.get('LC_MESSAGES')) || (await $.env.get('LANG'))
  return langOf(locale)
}

// True when the tool ran and answered: not refused by a hook, not an error, not a failure it reported.
const isAnswered = (r: { deny?: string; isError?: boolean; result?: unknown }): boolean =>
  r.deny === undefined && !r.isError && (r.result as { success?: unknown } | undefined)?.success !== false

// Opens the agents pane, or closes it when it is up; true when it ends up open.
async function togglePane($: EngineInterface): Promise<boolean> {
  const isOpen = (await $.ui.panes()).some(p => p.id === PANE)
  if (isOpen) {
    await $.ui.close({ id: PANE })
    return false
  }
  const at = await $.clock.now()
  await update($, now, () => at)
  await $.ui.open({ id: PANE, title: tr().pane })
  return true
}

export const register: Register = (on, options) => {
  on('session.start', async ($, e, next) => {
    const started = await next(e)
    lang = await detectLang($, options.language)
    // Ticks the running agents' clocks; quiet when nothing runs.
    $.clock.every(1000, () => {
      void (async () => {
        const list = await read($, agents)
        if (!list.some(a => a.status === 'running')) return
        const at = await $.clock.now()
        await update($, now, () => at)
      })()
    })
    return started
  })

  // To-do lists, the main session's and each subagent's, read as they are written.
  on('tool.call', { tool: 'TodoWrite' }, async ($, e, next) => {
    const result = await next(e)
    if (!isAnswered(result)) return result
    const todos = cleanTodos((e as unknown as { todos?: unknown }).todos)
    await update($, work, w => withList(w, e.agentId, todos))
    return result
  })

  on('tool.call', { tool: 'TaskCreate' }, async ($, e, next) => {
    const result = await next(e)
    if (!isAnswered(result)) return result
    const input = e as unknown as { subject?: unknown; activeForm?: unknown }
    const id = (result.result as { task?: { id?: unknown } } | undefined)?.task?.id
    await update($, work, w => {
      const todos = createTodo(listOf(w, e.agentId), id, input.subject, input.activeForm)
      return todos ? withList(w, e.agentId, todos) : w
    })
    return result
  })

  on('tool.call', { tool: 'TaskUpdate' }, async ($, e, next) => {
    const result = await next(e)
    if (!isAnswered(result)) return result
    const input = e as unknown as TaskUpdateInput
    await update($, work, w => {
      const todos = updateTodo(listOf(w, e.agentId), input)
      return todos ? withList(w, e.agentId, todos) : w
    })
    return result
  })

  // A prompt typed while idle starts a new request; a slash command or a prompt
  // typed into a running turn does not.
  on('prompt.submit', async ($, e, next) => {
    if (!e.command && e.turnId === undefined) {
      const at = await $.clock.now()
      await update($, work, w => startRequest(w, at))
    }
    return next(e)
  })

  on('agent.spawn', async ($, e, next) => {
    const started = await next(e)
    if (started.deny !== undefined) return started
    const at = await $.clock.now()
    await update($, agents, list => {
      const run: AgentRun = {
        id: started.agentId ?? e.tool_use_id,
        agentId: started.agentId,
        type: e.subagentType,
        description: e.description,
        model: started.model,
        status: 'running',
        startedAt: at,
        contextTokens: 0,
        contextMax: windowOf(started.model),
        tokens: 0,
        costUsd: 0,
        steps: 0,
      }
      return [...list.filter(a => a.id !== run.id), run].slice(-200)
    })
    await update($, now, () => at)
    await update($, work, w => (w.isHidden ? { ...w, isHidden: false } : w))
    return started
  })

  // Each model request of a subagent: live context, tokens and cost.
  on('turn.step', async function* ($, e, next) {
    const result = yield* next(e)
    const agentId = e.agentId
    const usage = result.usage
    if (!agentId || !usage) return result
    const model = usage.model || e.model
    await update($, agents, list =>
      list.map((a): AgentRun =>
        a.agentId !== agentId
          ? a
          : {
              ...a,
              model,
              effort: typeof e.effort === 'string' ? e.effort : a.effort,
              status: 'running',
              endedAt: undefined,
              contextTokens: usageTokens(usage),
              contextMax: windowOf(model),
              tokens: a.tokens + usageTokens(usage),
              costUsd: a.costUsd + costOf(model, usage, true),
              steps: a.steps + 1,
            },
      ),
    )
    return result
  })

  on('turn.complete', async ($, e, next) => {
    const agentId = e.agentId
    if (agentId) {
      const at = await $.clock.now()
      await update($, agents, list =>
        list.map((a): AgentRun => {
          if (a.agentId !== agentId) return a
          // A run whose steps went unseen still gets the turn's own sum.
          const usage = a.steps === 0 ? (e.usage as (Usage & { model?: string }) | null | undefined) : undefined
          return {
            ...a,
            status: e.reason === 'answer' ? 'done' : 'failed',
            endedAt: at,
            ...(usage ? { model: usage.model || a.model, tokens: usageTokens(usage), costUsd: costOf(usage.model || a.model, usage, false) } : {}),
          }
        }),
      )
      await update($, now, () => at)
      // A finished run's own list is done with: the panel shows it full.
      await update($, work, w => {
        if (!Object.hasOwn(w.agentTodos, agentId)) return w
        const { [agentId]: _gone, ...rest } = w.agentTodos
        return { ...w, agentTodos: rest }
      })
    }
    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e)
    const s = tr()
    const w = await read($, work)
    const list = await read($, agents)
    const bar = pickBar(w, list, s)
    if (!bar) return next(e)
    // Draw this row with the other mods' bands beneath it. Claude Code's own
    // placeholder ({ type: 'engine' }) is never nested: the desktop drops a band that nests it.
    const drawn = await Promise.resolve(next(e)).catch(() => null)
    const below = drawn && typeof drawn === 'object' && (drawn as { type?: string }).type !== 'engine' ? drawn : null

    const ui = $.ui.resolve(e)
    const { Box, Text, Button } = ui
    const running = list.filter(a => a.status === 'running').length
    const percent = `${Math.round(bar.ratio * 100)}%`
    const crew = running ? <Button key="work-band-agents" label={`×${running}`} plain onPress={() => void togglePane($)} /> : null
    const dismiss = (
      <Button
        key="work-band-dismiss"
        label="✕"
        plain
        role="dismiss"
        onPress={() => update($, work, prev => (bar.isFlow ? { ...prev, flow: null, isHidden: true } : { ...prev, isHidden: true }))}
      />
    )

    // The terminal's element table is completed with an `Svg` that draws nothing: test the surface too.
    if (e.surface !== 'terminal' && 'Svg' in ui) {
      const { Svg } = ui
      // About 8 CSS px per reported column; the rest is the count, the dismiss and their gaps.
      const width = Math.max(180, Math.min(1600, (e.props.bodyColumns || 100) * 8 - 96))
      const alt = [bar.title, bar.pill, percent, bar.doing].filter(Boolean).join(' · ')
      return (
        <Box flexDirection="column">
          <Box flexDirection="row" alignItems="center" gap={1}>
            <Svg source={rowSvg(bar, width, running > 0)} alt={alt} width={width} height={H} />
            {crew}
            {dismiss}
          </Box>
          {below}
        </Box>
      )
    }

    const cols = e.props.bodyColumns
    const titleW = Math.max(8, Math.min(30, bar.title.length + 2, Math.floor(cols / 3)))
    const width = Math.max(6, Math.min(40, cols - titleW - 32))
    const color = bar.isFinished ? DONE : ACCENT
    return (
      <Box flexDirection="column">
        <Box flexDirection="row" gap={2}>
          <Box width={titleW} flexShrink={0}>
            <Text color={color}>● </Text>
            <Text wrap="truncate-end">{bar.title}</Text>
          </Box>
          <Text color={color}>{barText(bar.ratio, width)}</Text>
          <Text bold>{bar.pill}</Text>
          <Text dimColor>{percent}</Text>
          <Text color={CLAY}>▣</Text>
          {crew}
          {dismiss}
        </Box>
        {below}
      </Box>
    )
  })
}
