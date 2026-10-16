import type { AgentRun, Flow, Stage, Todo, TodoStatus, Work } from '../types'
import type { Strings } from './i18n'

export const MAX_TODOS = 200
export const MAX_TEXT = 120

export const blankWork = (): Work => ({ flow: null, todos: [], agentTodos: {}, since: 0, isHidden: false })

export const clip = (s: string, max: number): string => (s.length > max ? s.slice(0, Math.max(1, max - 1)) + '…' : s)

export const cleanText = (v: unknown): string | undefined =>
  typeof v === 'string' && v.trim() ? clip(v.trim(), MAX_TEXT) : undefined

const STATUSES: readonly TodoStatus[] = ['pending', 'in_progress', 'completed']

export const statusOr = (v: unknown, fallback: TodoStatus): TodoStatus => STATUSES.find(s => s === v) ?? fallback

// ---------------------------------------------------------------------------
// To-do lists: TodoWrite replaces a list, TaskCreate/TaskUpdate keep it row by row.

type TodoInput = { content?: unknown; status?: unknown; activeForm?: unknown }

export const cleanTodos = (todos: unknown): Todo[] =>
  (Array.isArray(todos) ? (todos as TodoInput[]) : [])
    .filter(t => cleanText(t?.content))
    .slice(0, MAX_TODOS)
    .map((t, i) => ({
      // Never the engine's TaskCreate ids ('1', '2', …): a TaskUpdate must not hit a TodoWrite row.
      id: `todo:${i + 1}`,
      title: cleanText(t.content) ?? '',
      activeForm: cleanText(t.activeForm),
      status: statusOr(t.status, 'pending'),
    }))

// A new pending row; null when the call carried no id or no subject.
export const createTodo = (todos: Todo[], id: unknown, subject: unknown, activeForm: unknown): Todo[] | null => {
  const title = cleanText(subject)
  if (typeof id !== 'string' || !id || !title) return null
  const row: Todo = { id, title, activeForm: cleanText(activeForm), status: 'pending' }
  return [...todos.filter(t => t.id !== id), row].slice(-MAX_TODOS)
}

export type TaskUpdateInput = { taskId?: unknown; status?: unknown; subject?: unknown; activeForm?: unknown }

// The list with that row changed or removed; null for a row it never saw.
export const updateTodo = (todos: Todo[], input: TaskUpdateInput): Todo[] | null => {
  if (!todos.some(t => t.id === input.taskId)) return null
  if (input.status === 'deleted') return todos.filter(t => t.id !== input.taskId)
  return todos.map(t =>
    t.id !== input.taskId
      ? t
      : {
          ...t,
          status: statusOr(input.status, t.status),
          title: cleanText(input.subject) ?? t.title,
          activeForm: cleanText(input.activeForm) ?? t.activeForm,
        },
  )
}

// The list a to-do call changes: the main session's, or that subagent's.
export const listOf = (w: Work, agentId?: string): Todo[] =>
  agentId ? (Object.hasOwn(w.agentTodos, agentId) ? (w.agentTodos[agentId] ?? []) : []) : w.todos

// A change to the main list brings a dismissed band back.
export const withList = (w: Work, agentId: string | undefined, todos: Todo[]): Work =>
  agentId ? { ...w, agentTodos: { ...w.agentTodos, [agentId]: todos } } : { ...w, todos, isHidden: false }

export const doingOf = (todos: Todo[]): string | undefined => {
  const active = todos.find(t => t.status === 'in_progress')
  return active?.activeForm || active?.title
}

export type Steps = { done: number; total: number; note?: string }

export const stepsOf = (todos: Todo[]): Steps | null =>
  todos.length ? { done: todos.filter(t => t.status === 'completed').length, total: todos.length, note: doingOf(todos) } : null

// ---------------------------------------------------------------------------
// Requests: a prompt typed while idle.

// A finished flow and a finished list go; the subagents shown are counted from now.
// In Finish, the request is the reply to the finishing skill's question.
export const startRequest = (w: Work, at: number): Work => ({
  ...w,
  flow: w.flow?.isFinished ? null : w.flow?.stage === 'finish' ? { ...w.flow, hasReply: true } : w.flow,
  todos: w.todos.every(t => t.status === 'completed') ? [] : w.todos,
  since: at,
})

// This request's subagents: still running, or started since it began.
export const requestAgents = (list: AgentRun[], since: number): AgentRun[] =>
  list.filter(a => a.status === 'running' || a.startedAt >= since)

// ---------------------------------------------------------------------------
// The superpowers flow: skills set the stage, files written fill in the rest.

export const STAGES: readonly Stage[] = ['brainstorm', 'spec', 'plan', 'build', 'review', 'finish']

const SKILL_STAGE: Record<string, Stage> = {
  brainstorming: 'brainstorm',
  'writing-plans': 'plan',
  'subagent-driven-development': 'build',
  'executing-plans': 'build',
  'test-driven-development': 'build',
  'requesting-code-review': 'review',
  'finishing-a-development-branch': 'finish',
}

// The stage a superpowers skill starts, or null for any other skill.
export const skillStage = (name: unknown): Stage | null => {
  if (typeof name !== 'string') return null
  const key = /^\/?superpowers:([\w-]+)$/.exec(name.trim())?.[1]
  return key && Object.hasOwn(SKILL_STAGE, key) ? (SKILL_STAGE[key] ?? null) : null
}

export const firstLine = (s: unknown): string | undefined =>
  typeof s === 'string' ? cleanText(s.split(/\r?\n/).find(l => l.trim())) : undefined

// Brainstorming always starts a new flow; any other skill starts one when there
// is none or it finished, and otherwise only moves it forward.
export const advance = (flow: Flow | null, stage: Stage, args?: unknown): Flow => {
  if (stage === 'brainstorm') {
    const topic = firstLine(args)
    return topic ? { stage, isFinished: false, topic } : { stage, isFinished: false }
  }
  if (!flow || flow.isFinished) return { stage, isFinished: false }
  return STAGES.indexOf(stage) > STAGES.indexOf(flow.stage) ? { ...flow, stage } : flow
}

const slash = (p: string): string => p.replace(/\\/g, '/')

const isUnder = (path: string, dir: string): boolean => {
  const p = slash(path)
  return p.startsWith(dir) || p.includes(`/${dir}`)
}

const SPECS = 'docs/superpowers/specs/'
const PLANS = 'docs/superpowers/plans/'
// Writing here does not mean the build began: the flow's own docs, the visual
// companion's folder, Claude's own settings and memory.
const NOT_BUILD = ['docs/superpowers/', '.superpowers/', '.claude/']

export const heading = (md: string): string | undefined => firstLine(/^#[ \t]+(.+)$/m.exec(md)?.[1])

export const countTasks = (md: string): number => (md.match(/^###[ \t]+Task\b/gm) ?? []).length

const planTitleOf = (md: string): string | undefined => heading(md)?.replace(/\s+Implementation Plan$/i, '') || undefined
const specTitleOf = (md: string): string | undefined => heading(md)?.replace(/\s+(설계|Design)$/i, '') || undefined

// The plan's title and task count, where the text has them.
export const withPlan = (flow: Flow, md: string): Flow => {
  const title = planTitleOf(md)
  const tasks = countTasks(md)
  return { ...flow, ...(title ? { planTitle: title } : {}), ...(tasks ? { planTasks: tasks } : {}) }
}

// An absolute path outside the project root (scratchpad, /tmp, another repo).
// Relative paths, and any path when the root is unknown, count as inside.
export const isOutside = (path: string, root?: string): boolean => {
  if (!root) return false
  const p = slash(path).toLowerCase()
  if (!/^([a-z]:)?\//.test(p)) return false
  const r = slash(root).toLowerCase().replace(/\/+$/, '')
  return p !== r && !p.startsWith(`${r}/`)
}

// A file the main session wrote or edited (`content` is Write's): the spec
// moves Brainstorm to Spec, the plan gives title and task count, and any other
// file of the project in Brainstorm or Spec means the build began without a plan.
export const onWrite = (flow: Flow | null, path: unknown, content?: unknown, root?: string): Flow | null => {
  if (!flow || flow.isFinished || typeof path !== 'string') return flow
  const text = typeof content === 'string' ? content : undefined
  const isMd = slash(path).toLowerCase().endsWith('.md')
  if (isMd && isUnder(path, SPECS)) {
    const next: Flow = flow.stage === 'brainstorm' ? { ...flow, stage: 'spec' } : flow
    const title = text ? specTitleOf(text) : undefined
    return title ? { ...next, specTitle: title } : next
  }
  if (isMd && isUnder(path, PLANS)) return text ? withPlan(flow, text) : flow
  if (NOT_BUILD.some(dir => isUnder(path, dir)) || isOutside(path, root)) return flow
  return flow.stage === 'brainstorm' || flow.stage === 'spec' ? { ...flow, stage: 'build' } : flow
}

// A `.md` path in a skill's arguments: the plan an executing skill was handed.
export const mdPathOf = (args: unknown): string | undefined =>
  typeof args === 'string' ? /[^\s"'`]+\.md\b/i.exec(args)?.[0] : undefined

// ---------------------------------------------------------------------------
// What the band draws.

// The request's clock runs from its start until its main turn ends.
export const isClockLive = (w: Work): boolean => !!w.clock && w.clock.to === undefined

// Milliseconds on the request's clock, or null when no request is timed.
export const clockMs = (w: Work, now: number): number | null =>
  w.clock ? (w.clock.to ?? Math.max(now, w.clock.from)) - w.clock.from : null

export type Bar = {
  title: string
  /** The label riding the head of the fill. */
  pill: string
  /** Filled share, 0..1. */
  ratio: number
  /** Filled plus in-progress share, 0..1: the faint second layer. */
  runRatio: number
  /** Where ticks go, as shares of the bar. */
  ticks: number[]
  isFinished: boolean
  /** The superpowers flow's band (✕ ends it) or the harness's (✕ hides it). */
  isFlow: boolean
  /** What is in progress now, for the alt text. */
  doing: string
  /** The skill's argument, for the alt text. */
  note?: string
}

const doneCount = (todos: Todo[]): number => todos.filter(t => t.status === 'completed').length
const busyCount = (todos: Todo[]): number => todos.filter(t => t.status === 'in_progress').length

const evenTicks = (n: number): number[] => (n > 1 && n <= 50 ? Array.from({ length: n - 1 }, (_, i) => (i + 1) / n) : [])

// Six equal stages; inside Build the share of tasks done fills its own stage.
export const flowBar = (flow: Flow, todos: Todo[], s: Strings): Bar => {
  const n = STAGES.length
  const at = STAGES.indexOf(flow.stage)
  const isBuild = flow.stage === 'build'
  const total = flow.planTasks || todos.length
  const done = Math.min(total, doneCount(todos))
  const inner = isBuild && total ? done / total : 0
  // The stage being worked shows faintly: in Build the tasks in progress, elsewhere the whole stage.
  const ahead = isBuild && total ? Math.min(total - done, busyCount(todos)) / total : 1
  return {
    title: flow.planTitle ?? flow.specTitle ?? flow.topic ?? doingOf(todos) ?? s.superpowers,
    pill: flow.isFinished ? s.done : isBuild && total ? `${s.stage.build} ${done}/${total}` : s.stage[flow.stage],
    ratio: flow.isFinished ? 1 : (at + inner) / n,
    runRatio: flow.isFinished ? 1 : Math.min(1, (at + inner + ahead) / n),
    ticks: evenTicks(n),
    isFinished: flow.isFinished,
    isFlow: true,
    doing: doingOf(todos) ?? '',
  }
}

export const todoBar = (todos: Todo[], s: Strings): Bar | null => {
  if (!todos.length) return null
  const done = doneCount(todos)
  const isFinished = done === todos.length
  const pending = todos.find(t => t.status !== 'completed')
  return {
    title: doingOf(todos) || pending?.title || todos.at(-1)?.title || s.tasks,
    pill: isFinished ? s.done : `${s.tasks} ${done}/${todos.length}`,
    ratio: done / todos.length,
    runRatio: (done + busyCount(todos)) / todos.length,
    ticks: evenTicks(todos.length),
    isFinished,
    isFlow: false,
    doing: doingOf(todos) ?? '',
  }
}

// Ended counts failures too: a failed run is no longer working.
export const agentsBar = (runs: AgentRun[], s: Strings): Bar | null => {
  if (!runs.length) return null
  const running = runs.filter(a => a.status === 'running').length
  const ended = runs.length - running
  return {
    title: s.subagents,
    pill: running ? `${s.agents} ${ended}/${runs.length}` : s.done,
    ratio: ended / runs.length,
    runRatio: 1,
    ticks: evenTicks(runs.length),
    isFinished: running === 0,
    isFlow: false,
    doing: '',
  }
}

// `x:x` (a plugin named after its one skill) reads `x`.
export const skillLabel = (name: string): string => {
  const parts = name.split(':')
  return parts.length === 2 && parts[0] === parts[1] ? (parts[0] ?? name) : name
}

// The skills setting: empty shows all; `plugin:` matches a prefix; anything else the whole name. Case is ignored.
export const isShownSkill = (name: string, skills: readonly string[]): boolean => {
  const n = name.toLowerCase()
  return !skills.length || skills.some(raw => {
    const k = raw.toLowerCase()
    return k.endsWith(':') ? n.startsWith(k) : n === k
  })
}

// A skill's band: its name over the to-do list's progress, else the subagents',
// else Running until the main turn ends.
export const skillBar = (w: Work, runs: AgentRun[], s: Strings): Bar | null => {
  if (!w.skill) return null
  const title = skillLabel(w.skill.name)
  const note = w.skill.args ? { note: w.skill.args } : {}
  const base = todoBar(w.todos, s) ?? agentsBar(requestAgents(runs, w.since), s)
  if (base) return { ...base, title, ...note }
  const isFinished = w.clock?.to !== undefined
  const ratio = isFinished ? 1 : 0
  return { title, pill: isFinished ? s.done : s.running, ratio, runRatio: ratio, ticks: [], isFinished, isFlow: false, doing: '', ...note }
}

// The flow when there is one; else, unless dismissed, this request's skill, the main list, this request's subagents.
export const pickBar = (w: Work, runs: AgentRun[], s: Strings): Bar | null => {
  if (w.flow) return flowBar(w.flow, w.todos, s)
  if (w.isHidden) return null
  return skillBar(w, runs, s) ?? todoBar(w.todos, s) ?? agentsBar(requestAgents(runs, w.since), s)
}
