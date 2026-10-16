import type { SlashCandidate, Work } from '../types'
import { advance, cleanTodos, createTodo, listOf, onWrite, skillStage, startRequest, updateTodo, withList, type TaskUpdateInput } from './flow'

// How the work changes with each signal. The live hooks and the replay of a
// resumed session's transcript fold the same functions, so each rule lives once.

// A superpowers stage skill moves the flow; any other skill changes nothing.
// A new flow starts without the last one's test result.
export const onSkill = (w: Work, name: unknown, args: unknown): Work => {
  const stage = skillStage(name)
  if (!stage) return w
  const flow = advance(w.flow, stage, args)
  if (stage !== 'brainstorm' && w.flow && !w.flow.isFinished) return { ...w, flow }
  const { test: _old, ...rest } = w
  return { ...rest, flow }
}

// A file the main session wrote or edited (`content` is Write's).
export const onFile = (w: Work, path: unknown, content: unknown, root?: string): Work => {
  const flow = onWrite(w.flow, path, content, root)
  return flow === w.flow ? w : { ...w, flow }
}

export const onTodoWrite = (w: Work, agentId: string | undefined, todos: unknown): Work => withList(w, agentId, cleanTodos(todos))

export const onTaskCreate = (w: Work, agentId: string | undefined, id: unknown, subject: unknown, activeForm: unknown): Work => {
  const todos = createTodo(listOf(w, agentId), id, subject, activeForm)
  return todos ? withList(w, agentId, todos) : w
}

export const onTaskUpdate = (w: Work, agentId: string | undefined, input: TaskUpdateInput): Work => {
  const todos = updateTodo(listOf(w, agentId), input)
  return todos ? withList(w, agentId, todos) : w
}

// A prompt the user sent while idle: 0.1's rules, the request's clock starts,
// and a slash command still waiting is stale. The last test result stays with
// a flow still under way, across its requests.
export const onRequest = (w: Work, at: number): Work => {
  const { pendingSlash: _stale, test, ...rest } = startRequest(w, at)
  const keepsTest = !!rest.flow && !rest.flow.isFinished
  return { ...rest, clock: { from: at }, ...(keepsTest && test ? { test } : {}) }
}

// The main turn ended at `at`: the request's clock stops there if it still ran.
// A slash command sent while idle that was never expanded is stale; one typed
// into the turn waits in the queue and expands after it, so it stays. The
// finishing skill ends its turn asking merge / PR / keep; the turn that
// answered the user's reply ends the flow.
export const onMainTurnEnd = (w: Work, at: number, isAnswer: boolean): Work => {
  const { pendingSlash, ...rest } = w
  const clock = rest.clock && rest.clock.to === undefined ? { ...rest.clock, to: at } : rest.clock
  const flow = isAnswer && rest.flow?.stage === 'finish' && rest.flow.hasReply && !rest.flow.isFinished ? { ...rest.flow, isFinished: true } : rest.flow
  return { ...rest, flow, ...(clock ? { clock } : {}), ...(pendingSlash && !pendingSlash.isIdle ? { pendingSlash } : {}) }
}

// ✕: the flow's band ends the flow; the harness band hides until new data. The test result goes either way.
export const onDismiss = (w: Work, isFlow: boolean): Work => {
  const { test: _gone, ...rest } = w
  return isFlow ? { ...rest, flow: null, isHidden: true } : { ...rest, isHidden: true }
}

// A test run finished: the chip shows it.
export const onTest = (w: Work, isPass: boolean, at: number): Work => ({ ...w, test: { isPass, at } })

// A new subagent brings a dismissed band back.
export const onAgentStart = (w: Work): Work => (w.isHidden ? { ...w, isHidden: false } : w)

// A finished run's own list is done with: the panel shows it full.
export const onAgentEnd = (w: Work, agentId: string): Work => {
  if (!Object.hasOwn(w.agentTodos, agentId)) return w
  const { [agentId]: _gone, ...rest } = w.agentTodos
  return { ...w, agentTodos: rest }
}

// ---------------------------------------------------------------------------
// Slash commands: a skill only once `skill.prompt` expands it.

const slashName = (v: unknown): string => (typeof v === 'string' ? v.trim().replace(/^\//, '') : '')
const keyOf = (v: unknown): string => slashName(v).toLowerCase()

// A slash command the user sent; `isIdle` when no turn was running. The same
// command again (command.run after prompt.submit) keeps the first.
export const onSlash = (w: Work, name: unknown, args: unknown, isIdle: boolean): Work => {
  const key = keyOf(name)
  if (!key || keyOf(w.pendingSlash?.name) === key) return w
  return { ...w, pendingSlash: { name: slashName(name), args: typeof args === 'string' ? args : '', isIdle } }
}

// The names a `skill.prompt` may go by: as given, and with its plugin in front.
const promptedKeys = (skill: unknown, pluginName: unknown): string[] => {
  const s = keyOf(skill)
  const p = keyOf(pluginName)
  return p && s && !s.includes(':') ? [s, `${p}:${s}`] : [s]
}

// `skill.prompt` for the waiting slash command: it was a skill. An idle one is a
// new request first, then the skill applies. Any other `skill.prompt` (the
// model's Skill call, a subagent's) changes nothing here.
export const confirmSlash = (w: Work, skill: unknown, pluginName: unknown, at: number): { work: Work; slash?: SlashCandidate } => {
  const c = w.pendingSlash
  if (!c || !promptedKeys(skill, pluginName).includes(keyOf(c.name))) return { work: w }
  const { pendingSlash: _done, ...rest } = w
  const base = c.isIdle ? onRequest(rest, at) : rest
  return { work: onSkill(base, c.name, c.args), slash: c }
}
