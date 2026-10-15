import type { AgentRun, Todo, TodoStatus, Work } from '../types'

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
