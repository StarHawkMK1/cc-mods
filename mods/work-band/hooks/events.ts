import type { Work } from '../types'
import { advance, cleanTodos, createTodo, listOf, onWrite, skillStage, startRequest, updateTodo, withList, type TaskUpdateInput } from './flow'

// How the work changes with each signal. The live hooks and the replay of a
// resumed session's transcript fold the same functions, so each rule lives once.

// A superpowers stage skill moves the flow; any other skill changes nothing.
export const onSkill = (w: Work, name: unknown, args: unknown): Work => {
  const stage = skillStage(name)
  return stage ? { ...w, flow: advance(w.flow, stage, args) } : w
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

// A prompt the user sent while idle.
export const onRequest = (w: Work, at: number): Work => startRequest(w, at)

// The main turn ended. The finishing skill ends its turn asking merge / PR / keep;
// the turn that answered the user's reply ends the flow.
export const onMainTurnEnd = (w: Work, isAnswer: boolean): Work =>
  isAnswer && w.flow?.stage === 'finish' && w.flow.hasReply && !w.flow.isFinished ? { ...w, flow: { ...w.flow, isFinished: true } } : w

// ✕: the flow's band ends the flow; the harness band hides until new data.
export const onDismiss = (w: Work, isFlow: boolean): Work => (isFlow ? { ...w, flow: null, isHidden: true } : { ...w, isHidden: true })

// A new subagent brings a dismissed band back.
export const onAgentStart = (w: Work): Work => (w.isHidden ? { ...w, isHidden: false } : w)

// A finished run's own list is done with: the panel shows it full.
export const onAgentEnd = (w: Work, agentId: string): Work => {
  if (!Object.hasOwn(w.agentTodos, agentId)) return w
  const { [agentId]: _gone, ...rest } = w.agentTodos
  return { ...w, agentTodos: rest }
}
