import { expect, test } from 'claude-code/testing'

import type { AgentRun, Todo, Work } from '../types'
import {
  MAX_TODOS,
  blankWork,
  cleanTodos,
  createTodo,
  listOf,
  requestAgents,
  startRequest,
  stepsOf,
  updateTodo,
  withList,
} from './flow'

const todo = (id: string, status: Todo['status'], title = `T${id}`): Todo => ({ id, title, status })

test('cleanTodos keeps real rows, numbers them and bounds them', () => {
  const rows = cleanTodos([
    { content: '  Write the parser ', status: 'completed', activeForm: 'Writing the parser' },
    { content: '', status: 'pending' },
    { status: 'in_progress' },
    { content: 'L'.repeat(500), status: 'bogus', activeForm: '' },
    ...Array.from({ length: 300 }, (_, i) => ({ content: `Task ${i}`, status: 'pending' })),
  ])
  expect(rows).toHaveLength(MAX_TODOS)
  expect(rows[0]).toEqual({ id: '1', title: 'Write the parser', activeForm: 'Writing the parser', status: 'completed' })
  expect(rows[1]?.status).toBe('pending')
  expect(rows[1]?.title.length).toBe(120)
  expect(rows[1]?.title.endsWith('…')).toBe(true)
  expect(cleanTodos('nope')).toEqual([])
})

test('createTodo adds a pending row, or refuses without an id or subject', () => {
  expect(createTodo([], '7', 'Run tests', 'Running tests')).toEqual([{ id: '7', title: 'Run tests', activeForm: 'Running tests', status: 'pending' }])
  expect(createTodo([], undefined, 'Run tests', undefined)).toBeNull()
  expect(createTodo([], '7', '  ', undefined)).toBeNull()
})

test('updateTodo changes or removes a known row and ignores an unknown one', () => {
  const list = [todo('1', 'pending'), todo('2', 'pending')]
  expect(updateTodo(list, { taskId: '1', status: 'completed', subject: 'Renamed' })?.[0]).toMatchObject({ id: '1', title: 'Renamed', status: 'completed' })
  expect(updateTodo(list, { taskId: '1', status: 'weird' })?.[0]?.status).toBe('pending')
  expect(updateTodo(list, { taskId: '2', status: 'deleted' })).toEqual([todo('1', 'pending')])
  expect(updateTodo(list, { taskId: '99', status: 'completed' })).toBeNull()
})

test('the main list and each subagent list are kept apart', () => {
  let w: Work = { ...blankWork(), isHidden: true }
  w = withList(w, 'a1', [todo('1', 'pending')])
  expect(w.todos).toEqual([])
  expect(w.isHidden).toBe(true)
  expect(listOf(w, 'a1')).toHaveLength(1)
  expect(listOf(w, '__proto__')).toEqual([])
  w = withList(w, undefined, [todo('1', 'pending')])
  expect(w.todos).toHaveLength(1)
  expect(w.isHidden).toBe(false)
})

test('a new request drops a finished list and a finished flow, keeps the rest', () => {
  const done: Work = { ...blankWork(), todos: [todo('1', 'completed')], flow: { stage: 'finish', isFinished: true } }
  expect(startRequest(done, 5_000)).toMatchObject({ todos: [], flow: null, since: 5_000 })
  const open: Work = { ...blankWork(), todos: [todo('1', 'pending')], flow: { stage: 'build', isFinished: false } }
  expect(startRequest(open, 5_000)).toMatchObject({ todos: open.todos, flow: open.flow, since: 5_000 })
})

test('a request’s subagents are the running ones and those started since', () => {
  const run = (id: string, status: AgentRun['status'], startedAt: number): AgentRun => ({
    id, type: 't', description: id, model: 'm', status, startedAt, contextTokens: 0, contextMax: 1, tokens: 0, costUsd: 0, steps: 0,
  })
  const list = [run('old-done', 'done', 100), run('old-running', 'running', 100), run('new-done', 'done', 900)]
  expect(requestAgents(list, 500).map(a => a.id)).toEqual(['old-running', 'new-done'])
})

test('stepsOf counts a subagent list for the panel', () => {
  expect(stepsOf([])).toBeNull()
  expect(stepsOf([todo('1', 'completed'), { id: '2', title: 'Run', activeForm: 'Running', status: 'in_progress' }])).toEqual({ done: 1, total: 2, note: 'Running' })
})
