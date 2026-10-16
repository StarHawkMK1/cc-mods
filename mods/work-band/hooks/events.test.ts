import { expect, test } from 'claude-code/testing'

import type { Flow, Work } from '../types'
import { confirmSlash, onAgentEnd, onAgentStart, onDismiss, onFile, onMainTurnEnd, onRequest, onSkill, onSlash, onTaskCreate, onTaskUpdate, onTodoWrite } from './events'
import { blankWork } from './flow'

const flow = (f: Partial<Flow> = {}): Flow => ({ stage: 'brainstorm', isFinished: false, ...f })
const withFlow = (f: Partial<Flow> = {}): Work => ({ ...blankWork(), flow: flow(f) })

test('onSkill moves the flow for a superpowers stage skill and leaves any other alone', () => {
  expect(onSkill(blankWork(), 'superpowers:brainstorming', 'Auth\nmore').flow).toEqual({ stage: 'brainstorm', isFinished: false, topic: 'Auth' })
  const w = blankWork()
  expect(onSkill(w, 'superpowers:systematic-debugging', '')).toBe(w)
})

test('onFile keeps the same object when the flow does not move', () => {
  const w = withFlow()
  expect(onFile(w, '.superpowers/brainstorm/a.html', '<p>')).toBe(w)
  expect(onFile(w, 'docs/superpowers/specs/a.md', '# A 설계\n').flow).toMatchObject({ stage: 'spec', specTitle: 'A' })
})

test('to-do signals change the main list or a subagent’s', () => {
  const w = onTodoWrite(blankWork(), undefined, [{ content: 'A', status: 'in_progress' }])
  expect(w.todos).toEqual([{ id: 'todo:1', title: 'A', status: 'in_progress' }])
  expect(onTodoWrite(blankWork(), 'ag-1', [{ content: 'B' }]).agentTodos['ag-1']?.[0]?.title).toBe('B')
  const created = onTaskCreate(blankWork(), undefined, '7', 'Run tests', undefined)
  expect(created.todos.map(t => t.id)).toEqual(['7'])
  expect(onTaskCreate(created, undefined, undefined, 'No id', undefined)).toBe(created)
  expect(onTaskUpdate(created, undefined, { taskId: '7', status: 'completed' }).todos[0]?.status).toBe('completed')
  expect(onTaskUpdate(created, undefined, { taskId: '99', status: 'completed' })).toBe(created)
})

test('onRequest is 0.1’s new request', () => {
  const done = onTodoWrite(blankWork(), undefined, [{ content: 'A', status: 'completed' }])
  const w = onRequest(done, 5)
  expect(w.todos).toEqual([])
  expect(w.since).toBe(5)
  expect(onRequest(withFlow({ stage: 'finish' }), 5).flow?.hasReply).toBe(true)
  expect(onRequest(withFlow({ isFinished: true }), 5).flow).toBeNull()
})

test('onMainTurnEnd ends a Finish flow only after the reply, and only on an answer', () => {
  expect(onMainTurnEnd(withFlow({ stage: 'finish' }), 0, true).flow?.isFinished).toBe(false)
  expect(onMainTurnEnd(withFlow({ stage: 'finish', hasReply: true }), 0, false).flow?.isFinished).toBe(false)
  expect(onMainTurnEnd(withFlow({ stage: 'finish', hasReply: true }), 0, true).flow?.isFinished).toBe(true)
})

test('✕ ends the flow or hides the harness band; a new subagent brings it back', () => {
  expect(onDismiss(withFlow(), true)).toMatchObject({ flow: null, isHidden: true })
  const hidden = onDismiss(blankWork(), false)
  expect(hidden.isHidden).toBe(true)
  expect(onAgentStart(hidden).isHidden).toBe(false)
})

test('onAgentEnd drops a finished run’s own list', () => {
  const w = onTodoWrite(blankWork(), 'ag-1', [{ content: 'B' }])
  expect(onAgentEnd(w, 'ag-1').agentTodos).toEqual({})
  expect(onAgentEnd(w, 'ag-2')).toBe(w)
})

test('onRequest starts the clock; onMainTurnEnd stops it once', () => {
  const w = onRequest(blankWork(), 1_000)
  expect(w.clock).toEqual({ from: 1_000 })
  const ended = onMainTurnEnd(w, 4_000, true)
  expect(ended.clock).toEqual({ from: 1_000, to: 4_000 })
  expect(onMainTurnEnd(ended, 9_000, true).clock).toEqual({ from: 1_000, to: 4_000 })
  expect(onMainTurnEnd(blankWork(), 9_000, true).clock).toBeUndefined()
})

test('a slash command waits for skill.prompt; an idle one is a new request', () => {
  const done = onTodoWrite(blankWork(), undefined, [{ content: 'A', status: 'completed' }])
  const waiting = onSlash(done, '/superpowers:brainstorming', 'Auth', true)
  expect(waiting.pendingSlash).toEqual({ name: 'superpowers:brainstorming', args: 'Auth', isIdle: true })
  // command.run after prompt.submit for the same command keeps the first.
  expect(onSlash(waiting, 'superpowers:brainstorming', 'other', false)).toBe(waiting)
  expect(confirmSlash(waiting, 'impeccable', undefined, 5).work).toBe(waiting)
  const { work: w, slash } = confirmSlash(waiting, 'brainstorming', 'superpowers', 5)
  expect(slash?.name).toBe('superpowers:brainstorming')
  expect(w.pendingSlash).toBeUndefined()
  expect(w.todos).toEqual([])
  expect(w.clock).toEqual({ from: 5 })
  expect(w.flow).toMatchObject({ stage: 'brainstorm', topic: 'Auth' })
})

test('a slash skill typed into a running turn is not a new request; an idle one in Finish is the reply', () => {
  const busy = confirmSlash(onSlash(onRequest(blankWork(), 1), 'superpowers:brainstorming', '', false), 'superpowers:brainstorming', undefined, 5).work
  expect(busy.clock).toEqual({ from: 1 })
  expect(busy.flow?.stage).toBe('brainstorm')
  const reply = confirmSlash(onSlash(withFlow({ stage: 'finish' }), 'superpowers:systematic-debugging', '', true), 'superpowers:systematic-debugging', undefined, 5).work
  expect(reply.flow?.hasReply).toBe(true)
})

test('a turn’s end drops an idle slash command never expanded; a queued one waits for its turn', () => {
  const idle = onSlash(blankWork(), 'model', '', true)
  expect(onMainTurnEnd(idle, 2, true).pendingSlash).toBeUndefined()
  expect(onRequest(idle, 2).pendingSlash).toBeUndefined()
  const queued = onSlash(blankWork(), 'superpowers:brainstorming', 'Auth', false)
  expect(onMainTurnEnd(queued, 2, true).pendingSlash?.name).toBe('superpowers:brainstorming')
  expect(onRequest(queued, 2).pendingSlash).toBeUndefined()
  expect(onSlash(blankWork(), '  ', '', true)).toEqual(blankWork())
})
