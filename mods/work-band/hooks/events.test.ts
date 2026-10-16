import { expect, test } from 'claude-code/testing'

import type { Flow, Work } from '../types'
import { onAgentEnd, onAgentStart, onDismiss, onFile, onMainTurnEnd, onRequest, onSkill, onTaskCreate, onTaskUpdate, onTodoWrite } from './events'
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
  expect(onMainTurnEnd(withFlow({ stage: 'finish' }), true).flow?.isFinished).toBe(false)
  expect(onMainTurnEnd(withFlow({ stage: 'finish', hasReply: true }), false).flow?.isFinished).toBe(false)
  expect(onMainTurnEnd(withFlow({ stage: 'finish', hasReply: true }), true).flow?.isFinished).toBe(true)
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
