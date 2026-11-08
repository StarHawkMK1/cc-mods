import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { AgentRun, Panel, SlashCandidate } from '../types'
import { costOf, ctxOf, elapsed, fmtCost, fmtTime, fmtTokens, modelName, runModel, totals, usageTokens, windowOf, type Usage } from './agents'
import {
  ACCENT,
  CLAY,
  DONE,
  H,
  HEADER_H,
  LINE_H,
  ROW_H,
  STATUS_GLYPH,
  agentSvg,
  barText,
  compactSvg,
  ctxBar,
  gridSvg,
  gridTiles,
  headerSvg,
  rowSvg,
} from './draw'
import { MAX_TEXT, blankWork, clip, clockMs, isClockLive, listOf, mdPathOf, pickBar, skillStage, stepsOf, withPlan, type TaskUpdateInput } from './flow'
import { confirmSlash, onAgentEnd, onAgentStart, onDismiss, onFile, onMainTurnEnd, onRequest, onSkill, onSlash, onTaskCreate, onTaskUpdate, onTest, onTodoWrite } from './events'
import { STRINGS, langOf, type Lang } from './i18n'
import { replay } from './replay'
import { parseList, testVerdict, type BashAnswer, type BashCall } from './tests'

const PANE = 'work-band-agents'
// Where a prompt the user sent comes from: the prompt box, Remote Control, an SDK host such as the desktop app.
const USER_ORIGINS: ReadonlySet<unknown> = new Set(['composer', 'bridge', 'sdk'])

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

// A plan's text; undefined when there is none to read.
async function planText($: EngineInterface, path: string | undefined): Promise<string | undefined> {
  if (!path) return undefined
  try {
    const md = await $.fs.read(path)
    return typeof md === 'string' ? md : undefined
  } catch {
    // An unreadable plan: the to-do list counts the tasks.
    return undefined
  }
}

// Reads the plan an executing skill was handed, for its title and task count.
async function readPlan($: EngineInterface, path: string | undefined): Promise<void> {
  const md = await planText($, path)
  if (md !== undefined) await update($, work, prev => (prev.flow ? { ...prev, flow: withPlan(prev.flow, md) } : prev))
}

// A skill, called by the model or typed as a slash command: superpowers' move
// the flow, another becomes the request's skill; an executing skill handed a
// plan path reads the plan's task count.
async function applySkill($: EngineInterface, name: unknown, args: unknown, skills: readonly string[]): Promise<void> {
  const w = await update($, work, prev => onSkill(prev, name, args, skills))
  if (skillStage(name) === 'build' && w.flow && !w.flow.planTasks) await readPlan($, mdPathOf(args))
}

// A file the main session wrote or edited; one outside the project root never starts the build.
async function applyFile($: EngineInterface, path: unknown, content?: unknown): Promise<void> {
  const root = await $.session.root().catch(() => undefined)
  await update($, work, w => onFile(w, path, content, root))
}

// A resumed or branched session starts with empty state: rebuild what outlives
// a request from the transcript, once. Live work already there stands, and so
// does anything written while the transcript was read. The plan is read before
// the one write of the rebuilt work: a `get` after a write in the same dispatch
// would not see it.
async function restore($: EngineInterface, skills: readonly string[], tests: readonly string[]): Promise<void> {
  const held = await $.state.get({ plugin: 'work-band', key: 'work' })
  const w0 = held.value ?? blankWork()
  if (w0.isReplayed) return
  const marked = await $.state.set({ plugin: 'work-band', key: 'work' }, { ...w0, isReplayed: true }, { ifVersion: held.version })
  if (!marked.isSet || w0.flow || w0.todos.length) return
  try {
    const messages = await $.session.messages()
    const root = await $.session.root().catch(() => undefined)
    const at = await $.clock.now()
    const { work: restored, planPath } = replay(messages, { root, skills, tests, at })
    if (!restored.flow && !restored.todos.length) return
    const md = await planText($, planPath)
    const flow = restored.flow && md !== undefined ? withPlan(restored.flow, md) : restored.flow
    await $.state.set({ plugin: 'work-band', key: 'work' }, { ...restored, flow }, { ifVersion: marked.version })
  } catch {
    // No transcript to read: the band waits for live events.
  }
}

export const register: Register = (on, options) => {
  // More command prefixes that count as a test run, from the plugin's settings.
  const testCommands = parseList(options.testCommands)
  // Which other skills the band shows, from the plugin's settings; empty shows all.
  const skills = parseList(options.skills)
  // Off (the default) keeps the band and the panel off the terminal: they draw in the apps alone.
  const isHiddenOn = (surface: string) => surface === 'terminal' && options.terminal !== 'on'

  on('session.start', async ($, e, next) => {
    const started = await next(e)
    lang = await detectLang($, options.language)
    await $.command.register({
      name: 'work-band',
      description: 'Show or hide the agents panel: running and finished subagents with model, context, cost and time',
    })
    // Ticks the running agents' clocks and the request's; quiet when nothing runs.
    $.clock.every(1000, () => {
      void (async () => {
        const list = await read($, agents)
        const w = await read($, work)
        if (!list.some(a => a.status === 'running') && !isClockLive(w)) return
        const at = await $.clock.now()
        await update($, now, () => at)
      })()
    })
    // `claude --resume` or `--continue`: the transcript is already there.
    try {
      await restore($, skills, testCommands)
    } catch {
      // Nothing restored: the band waits for live events.
    }
    return started
  })

  // /resume and /branch inside a session clear the state and do not run session.start again.
  on('classic.SessionStart', async ($, e, next) => {
    const result = await next(e)
    try {
      if (e.source === 'resume' || e.source === 'fork') await restore($, skills, testCommands)
    } catch {
      // Nothing restored: the band waits for live events.
    }
    return result
  })

  // To-do lists, the main session's and each subagent's, read as they are written.
  on('tool.call', { tool: 'TodoWrite' }, async ($, e, next) => {
    const result = await next(e)
    if (!isAnswered(result)) return result
    await update($, work, w => onTodoWrite(w, e.agentId, (e as unknown as { todos?: unknown }).todos))
    return result
  })

  on('tool.call', { tool: 'TaskCreate' }, async ($, e, next) => {
    const result = await next(e)
    if (!isAnswered(result)) return result
    const input = e as unknown as { subject?: unknown; activeForm?: unknown }
    const id = (result.result as { task?: { id?: unknown } } | undefined)?.task?.id
    await update($, work, w => onTaskCreate(w, e.agentId, id, input.subject, input.activeForm))
    return result
  })

  on('tool.call', { tool: 'TaskUpdate' }, async ($, e, next) => {
    const result = await next(e)
    if (!isAnswered(result)) return result
    await update($, work, w => onTaskUpdate(w, e.agentId, e as unknown as TaskUpdateInput))
    return result
  })

  // The main session's skills and files move the superpowers flow; a subagent's never do.
  on('tool.call', { tool: 'Skill' }, async ($, e, next) => {
    const result = await next(e)
    if (e.agentId || !isAnswered(result)) return result
    const input = e as unknown as { skill?: unknown; args?: unknown }
    await applySkill($, input.skill, input.args, skills)
    return result
  })

  on('tool.call', { tool: 'Write' }, async ($, e, next) => {
    const result = await next(e)
    if (e.agentId || !isAnswered(result)) return result
    const input = e as unknown as { file_path?: unknown; content?: unknown }
    await applyFile($, input.file_path, input.content)
    return result
  })

  on('tool.call', { tool: 'Edit' }, async ($, e, next) => {
    const result = await next(e)
    if (e.agentId || !isAnswered(result)) return result
    await applyFile($, (e as unknown as { file_path?: unknown }).file_path)
    return result
  })

  on('tool.call', { tool: 'NotebookEdit' }, async ($, e, next) => {
    const result = await next(e)
    if (e.agentId || !isAnswered(result)) return result
    await applyFile($, (e as unknown as { notebook_path?: unknown }).notebook_path)
    return result
  })

  // A test run, the main session's or a subagent's: the chip shows how the last one went.
  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    const result = await next(e)
    try {
      const verdict = testVerdict(e as unknown as BashCall, result as BashAnswer, testCommands)
      if (verdict) {
        const at = await $.clock.now()
        await update($, work, w => onTest(w, verdict === 'pass', at))
      }
    } catch {
      // The chip stays as it was; the tool call's answer goes back untouched.
    }
    return result
  })

  // A slash command the user sent waits for skill.prompt to say it is a skill.
  // Builds without prompt.submit's `command` report it only here; with it, the second is a no-op.
  on('command.run', async ($, e, next) => {
    const kind = e.origin?.kind
    if (kind === undefined || USER_ORIGINS.has(kind)) await update($, work, w => onSlash(w, e.command, e.args, true))
    return next(e)
  })

  // The engine expands a skill: the waiting slash command was one. Typed while
  // idle it is a new request; a superpowers skill moves the flow.
  on('skill.prompt', async ($, e, next) => {
    const at = await $.clock.now()
    // An object, not a `let`: TypeScript does not see a write made inside the update callback.
    const box: { slash?: SlashCandidate } = {}
    const w = await update($, work, prev => {
      const r = confirmSlash(prev, e.skill, e.pluginName, at, skills)
      box.slash = r.slash
      return r.work
    })
    const slash = box.slash
    if (slash && skillStage(slash.name) === 'build' && w.flow && !w.flow.planTasks) await readPlan($, mdPathOf(slash.args))
    return next(e)
  })

  // A prompt the user sent while idle starts a new request; a slash command
  // waits for skill.prompt; a prompt typed into a running turn, or one the user
  // did not send (a finished background task, a peer), does neither.
  on('prompt.submit', async ($, e, next) => {
    const isUser = USER_ORIGINS.has(e.origin?.kind)
    if (e.command) {
      if (isUser) await update($, work, w => onSlash(w, e.command?.name, e.command?.args, e.turnId === undefined))
    } else if (e.turnId === undefined && isUser) {
      const at = await $.clock.now()
      await update($, work, w => onRequest(w, at))
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
        description: clip(e.description ?? '', MAX_TEXT),
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
    await update($, work, onAgentStart)
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
              effort: typeof e.effort === 'string' || typeof e.effort === 'number' ? String(e.effort) : a.effort,
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
    const at = await $.clock.now()
    if (agentId) {
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
      await update($, work, w => onAgentEnd(w, agentId))
    } else {
      // The request's clock stops; in Finish, the main turn that carries out the
      // user's reply closes the flow, if it answered.
      await update($, work, w => onMainTurnEnd(w, at, e.reason === 'answer'))
    }
    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey || isHiddenOn(e.surface)) return next(e)
    const s = tr()
    const w = await read($, work)
    const list = await read($, agents)
    const bar = pickBar(w, list, s)
    if (!bar) return next(e)
    // Reading `now` redraws the band on each tick; the clock reads the time itself.
    await read($, now)
    const ms = clockMs(w, await $.clock.now())
    const isLive = isClockLive(w)
    const chip = w.test ? { isPass: w.test.isPass, text: `${w.test.isPass ? '✓' : '✗'} ${s.tests}` } : null
    // Draw this row with the other mods' bands beneath it. Claude Code's own
    // placeholder ({ type: 'engine' }) is never nested: the desktop drops a band that nests it.
    const drawn = await Promise.resolve(next(e)).catch(() => null)
    const below = drawn && typeof drawn === 'object' && (drawn as { type?: string }).type !== 'engine' ? drawn : null

    const ui = $.ui.resolve(e)
    const { Box, Text, Button } = ui
    const running = list.filter(a => a.status === 'running').length
    const percent = `${Math.round(bar.ratio * 100)}%`
    const crew = running ? <Button key="work-band-agents" label={`×${running}`} plain onPress={() => void togglePane($)} /> : null
    const dismiss = <Button key="work-band-dismiss" label="✕" plain role="dismiss" onPress={() => update($, work, prev => onDismiss(prev, bar.isFlow))} />

    // The terminal's element table is completed with an `Svg` that draws nothing: test the surface too.
    if (e.surface !== 'terminal' && 'Svg' in ui) {
      const { Svg } = ui
      // About 8 CSS px per reported column; the rest is the count, the dismiss and their gaps.
      const width = Math.max(180, Math.min(1600, (e.props.bodyColumns || 100) * 8 - 96))
      // Too narrow for everything: the time goes first.
      const time = ms !== null && width >= 360 ? fmtTime(ms) : undefined
      const alt = [bar.title, bar.pill, percent, chip?.text, time, bar.note, bar.doing].filter(Boolean).join(' · ')
      return (
        <Box flexDirection="column">
          <Box flexDirection="row" alignItems="center" gap={1}>
            <Svg source={rowSvg(bar, width, running > 0, { time, isLive, ...(chip ? { test: { isPass: chip.isPass, word: s.tests } } : {}) })} alt={alt} width={width} height={H} />
            {crew}
            {dismiss}
          </Box>
          {below}
        </Box>
      )
    }

    const cols = e.props.bodyColumns
    // Too narrow for everything: the time goes first.
    const time = ms !== null && cols >= 60 ? fmtTime(ms) : null
    const titleW = Math.max(8, Math.min(30, bar.title.length + 2, Math.floor(cols / 3)))
    const width = Math.max(6, Math.min(40, cols - titleW - 32 - (time ? time.length + 2 : 0) - (chip ? chip.text.length + 2 : 0)))
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
          {chip && <Text color={chip.isPass ? 'green' : 'red'}>{chip.text}</Text>}
          {time && <Text dimColor={isLive}>{time}</Text>}
          <Text color={CLAY}>▣</Text>
          {crew}
          {dismiss}
        </Box>
        {below}
      </Box>
    )
  })

  on('command.run', { command: 'work-band' }, async $ => {
    // A terminal alone has nowhere to show the panel.
    const surfaces = await $.session.surfaces()
    if (surfaces.length > 0 && surfaces.every(isHiddenOn)) return { text: tr().hiddenInTerminal }
    const isOpen = await togglePane($)
    return { text: isOpen ? tr().opened : tr().closed }
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e, next) => {
    if (isHiddenOn(e.surface)) return next(e)
    const s = tr()
    const ui = $.ui.resolve(e)
    const { Box, Text, Button } = ui
    const list = await read($, agents)
    const w = await read($, work)
    const p: Panel = await read($, panel)
    const at = Math.max(await read($, now), ...list.map(a => a.startedAt), 0)
    const running = list.filter(a => a.status === 'running').reverse()
    const finished = list.filter(a => a.status !== 'running').reverse()
    const t = totals(list, at)
    // A running subagent's own to-do list; never the main session's.
    const stepsFor = (a: AgentRun) => (a.status === 'running' && a.agentId ? stepsOf(listOf(w, a.agentId)) : null)
    const summary = `≈${fmtCost(t.cost)}, ${fmtTokens(t.tokens)} ${s.tokensWord}, ${fmtTime(t.time)}`

    const toggleCompact = (
      <Button key="compact" label={p.isCompact ? s.expand : s.collapse} plain onPress={() => update($, panel, prev => ({ ...prev, isCompact: !prev.isCompact }))} />
    )
    const toggleDone = (
      <Button
        key="done"
        label={`${p.isDoneCollapsed ? '▸' : '▾'} ${s.finished} · ${finished.length}`}
        plain
        onPress={() => update($, panel, prev => ({ ...prev, isDoneCollapsed: !prev.isDoneCollapsed }))}
      />
    )

    if (e.surface === 'desktop' && 'Svg' in ui) {
      const { Svg } = ui
      const W = Math.max(240, Math.min(900, (e.props.bodyColumns || 40) * 8 - 8))
      if (p.isCompact) {
        return (
          <Box flexDirection="column" gap={1}>
            <Svg source={compactSvg(W, list, t)} alt={`${list.length} ${s.pane}, ${summary}`} width={W} height={32} />
            {toggleCompact}
          </Box>
        )
      }
      const shownDone = p.isDoneCollapsed ? 0 : finished.length
      const lines = 1 + (list.length === 0 ? 1 : 0) + (running.length > 0 ? 1 : 0) + (finished.length > 0 ? 1 : 0)
      const gridH = HEADER_H + lines * LINE_H + (running.length + shownDone) * ROW_H
      return (
        <Box flexDirection="column">
          {/* The grid sizes the pane; the content is placed over it. */}
          {gridTiles(gridH).map((tileH, i) => (
            <Svg key={`grid-${i}`} source={gridSvg(W, tileH)} alt="dotted grid" width={W} height={tileH} />
          ))}
          <Box flexDirection="column" position="absolute" top={0} left={0} right={0}>
            <Svg source={headerSvg(W, t, s)} alt={summary} width={W} height={HEADER_H} />
            {toggleCompact}
            {list.length === 0 && <Text dimColor>{s.empty}</Text>}
            {running.length > 0 && <Text dimColor>{`${s.running} · ${running.length}`}</Text>}
            {running.map(a => (
              <Svg key={a.id} source={agentSvg(W, a, at, stepsFor(a), s)} alt={`${a.description}: ${modelName(a.model)}, ${s.isRunning}`} width={W} height={ROW_H} />
            ))}
            {finished.length > 0 && toggleDone}
            {!p.isDoneCollapsed &&
              finished.map(a => (
                <Svg key={a.id} source={agentSvg(W, a, at, null, s)} alt={`${a.description}: ${modelName(a.model)}, ${s.isFinished}`} width={W} height={ROW_H} />
              ))}
          </Box>
        </Box>
      )
    }

    // Terminal: the same content in text rows.
    const cols = Math.max(24, e.props.bodyColumns || 40)
    const barW = Math.max(6, Math.min(20, cols - 34))
    const row = (a: AgentRun) => {
      const ctx = ctxOf(a)
      const steps = stepsFor(a)
      const progress = a.status === 'done' ? 1 : steps ? steps.done / steps.total : null
      const stepText = steps ? `${steps.done}/${steps.total}${steps.note ? ' ' + steps.note : ''} · ` : ''
      return (
        <Box key={a.id} flexDirection="column" marginBottom={1}>
          <Box flexDirection="row" gap={1}>
            <Text color={CLAY}>▣</Text>
            <Text bold wrap="truncate-end">
              {a.description || a.type}
            </Text>
            <Text color={a.status === 'failed' ? 'red' : a.status === 'done' ? 'green' : ACCENT}>{STATUS_GLYPH[a.status]}</Text>
          </Box>
          <Text dimColor wrap="truncate-end">
            {'  '}
            {a.type} · {runModel(a)}
          </Text>
          <Text wrap="truncate-end">
            {'  '}
            {progress === null ? <Text dimColor>{ctxBar(ctx, barW)}</Text> : <Text color={ACCENT}>{ctxBar(progress * 100, barW)}</Text>}
            <Text dimColor>
              {' '}
              {stepText}
              {s.ctx} {ctx}% · {fmtTokens(a.contextTokens)} ≈{fmtCost(a.costUsd)} {fmtTime(elapsed(a, at))}
            </Text>
          </Text>
        </Box>
      )
    }

    return (
      <Box flexDirection="column">
        <Box flexDirection="row" justifyContent="space-between">
          <Text dimColor>
            ≈{fmtCost(t.cost)} · {fmtTokens(t.tokens)} {s.tokensWord} · {fmtTime(t.time)}
          </Text>
          {toggleCompact}
        </Box>
        {p.isCompact ? (
          <Text wrap="truncate-end">
            {[...running, ...finished].map(a => (
              <Text key={a.id} color={a.status === 'failed' ? 'red' : a.status === 'done' ? 'green' : ACCENT}>
                {STATUS_GLYPH[a.status]}{' '}
              </Text>
            ))}
          </Text>
        ) : (
          <Box flexDirection="column" marginTop={1}>
            {list.length === 0 && <Text dimColor>{s.empty}</Text>}
            {running.length > 0 && <Text dimColor>{`${s.running} · ${running.length}`}</Text>}
            {running.map(row)}
            {finished.length > 0 && toggleDone}
            {!p.isDoneCollapsed && finished.map(row)}
          </Box>
        )}
      </Box>
    )
  })
}
