import type { AgentRun, Flow, Stage, Todo, TodoStatus, Work } from '../types'

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
      id: String(i + 1),
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
export const startRequest = (w: Work, at: number): Work => ({
  ...w,
  flow: w.flow?.isFinished ? null : w.flow,
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

const firstLine = (s: unknown): string | undefined =>
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

// A file the main session wrote or edited (`content` is Write's): the spec
// moves Brainstorm to Spec, the plan gives title and task count, and any other
// file in Brainstorm or Spec means the build began without a plan.
export const onWrite = (flow: Flow | null, path: unknown, content?: unknown): Flow | null => {
  if (!flow || flow.isFinished || typeof path !== 'string') return flow
  const text = typeof content === 'string' ? content : undefined
  const isMd = slash(path).toLowerCase().endsWith('.md')
  if (isMd && isUnder(path, SPECS)) {
    const next: Flow = flow.stage === 'brainstorm' ? { ...flow, stage: 'spec' } : flow
    const title = text ? specTitleOf(text) : undefined
    return title ? { ...next, specTitle: title } : next
  }
  if (isMd && isUnder(path, PLANS)) return text ? withPlan(flow, text) : flow
  if (NOT_BUILD.some(dir => isUnder(path, dir))) return flow
  return flow.stage === 'brainstorm' || flow.stage === 'spec' ? { ...flow, stage: 'build' } : flow
}

// A `.md` path in a skill's arguments: the plan an executing skill was handed.
export const mdPathOf = (args: unknown): string | undefined =>
  typeof args === 'string' ? /[^\s"'`]+\.md\b/i.exec(args)?.[0] : undefined
