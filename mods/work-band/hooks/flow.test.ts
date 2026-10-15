import { expect, test } from 'claude-code/testing'

import type { AgentRun, Flow, Todo, Work } from '../types'
import {
  MAX_TODOS,
  advance,
  blankWork,
  cleanTodos,
  countTasks,
  createTodo,
  listOf,
  mdPathOf,
  onWrite,
  requestAgents,
  skillStage,
  startRequest,
  stepsOf,
  updateTodo,
  withList,
  withPlan,
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

const PLAN = ['# Auth login Implementation Plan', '', '### Task 1: Scaffold', 'x', '### Task 2: Parser', '### Task 3: CLI'].join('\n')

test('skillStage knows the superpowers skills and nothing else', () => {
  expect(skillStage('superpowers:brainstorming')).toBe('brainstorm')
  expect(skillStage('/superpowers:writing-plans')).toBe('plan')
  expect(skillStage('superpowers:subagent-driven-development')).toBe('build')
  expect(skillStage('superpowers:executing-plans')).toBe('build')
  expect(skillStage('superpowers:test-driven-development')).toBe('build')
  expect(skillStage('superpowers:requesting-code-review')).toBe('review')
  expect(skillStage('superpowers:finishing-a-development-branch')).toBe('finish')
  expect(skillStage('superpowers:systematic-debugging')).toBeNull()
  expect(skillStage('brainstorming')).toBeNull()
  expect(skillStage('other:brainstorming')).toBeNull()
  expect(skillStage('superpowers:__proto__')).toBeNull()
  expect(skillStage(undefined)).toBeNull()
})

test('advance: brainstorming starts afresh, the rest only move forward', () => {
  const b = advance(null, 'brainstorm', 'Auth redesign\nwith details')
  expect(b).toEqual({ stage: 'brainstorm', isFinished: false, topic: 'Auth redesign' })
  const build: Flow = { stage: 'build', isFinished: false, topic: 'Auth', planTasks: 7 }
  expect(advance(build, 'plan')).toBe(build)
  expect(advance(build, 'build')).toBe(build)
  expect(advance(build, 'review')).toEqual({ ...build, stage: 'review' })
  expect(advance(build, 'brainstorm', 'New idea')).toEqual({ stage: 'brainstorm', isFinished: false, topic: 'New idea' })
  expect(advance(null, 'build')).toEqual({ stage: 'build', isFinished: false })
})

test('advance: a finished flow is never resumed', () => {
  const done: Flow = { stage: 'finish', isFinished: true, planTitle: 'Old', planTasks: 4 }
  expect(advance(done, 'build')).toEqual({ stage: 'build', isFinished: false })
})

test('onWrite: the spec moves Brainstorm to Spec and names the flow', () => {
  const b: Flow = { stage: 'brainstorm', isFinished: false }
  expect(onWrite(b, 'docs/superpowers/specs/2026-10-15-auth-design.md', '# Auth redesign 설계\n')).toEqual({ stage: 'spec', isFinished: false, specTitle: 'Auth redesign' })
  expect(onWrite(b, 'C:\\repo\\docs\\superpowers\\specs\\a.md', '# A Design')).toEqual({ stage: 'spec', isFinished: false, specTitle: 'A' })
  const plan: Flow = { stage: 'plan', isFinished: false }
  expect(onWrite(plan, 'docs/superpowers/specs/a.md', '# Again')).toEqual({ ...plan, specTitle: 'Again' })
})

test('onWrite: the plan gives the title and the task count', () => {
  const plan: Flow = { stage: 'plan', isFinished: false }
  expect(onWrite(plan, '/repo/docs/superpowers/plans/2026-10-15-auth.md', PLAN)).toEqual({ ...plan, planTitle: 'Auth login', planTasks: 3 })
  expect(onWrite(plan, 'docs/superpowers/plans/a.md')).toBe(plan)
})

test('onWrite: other files mean the build began, except notes and settings', () => {
  const b: Flow = { stage: 'brainstorm', isFinished: false }
  expect(onWrite(b, 'src/app.ts')?.stage).toBe('build')
  expect(onWrite({ stage: 'spec', isFinished: false }, 'C:\\repo\\src\\app.ts')?.stage).toBe('build')
  expect(onWrite(b, '.superpowers/brainstorm/screen.html')).toBe(b)
  expect(onWrite(b, 'C:\\Users\\me\\.claude\\projects\\x\\memory\\note.md')).toBe(b)
  expect(onWrite(b, 'docs/superpowers/notes.md')).toBe(b)
  const review: Flow = { stage: 'review', isFinished: false }
  expect(onWrite(review, 'src/app.ts')).toBe(review)
  expect(onWrite(null, 'src/app.ts')).toBeNull()
  expect(onWrite(b, 42)).toBe(b)
})

test('plan helpers', () => {
  expect(countTasks(PLAN)).toBe(3)
  expect(withPlan({ stage: 'build', isFinished: false }, PLAN)).toEqual({ stage: 'build', isFinished: false, planTitle: 'Auth login', planTasks: 3 })
  expect(withPlan({ stage: 'build', isFinished: false, planTasks: 5 }, 'no headings')).toEqual({ stage: 'build', isFinished: false, planTasks: 5 })
  expect(mdPathOf('Execute docs/superpowers/plans/2026-10-15-auth.md please')).toBe('docs/superpowers/plans/2026-10-15-auth.md')
  expect(mdPathOf('no path')).toBeUndefined()
  expect(mdPathOf(undefined)).toBeUndefined()
})
