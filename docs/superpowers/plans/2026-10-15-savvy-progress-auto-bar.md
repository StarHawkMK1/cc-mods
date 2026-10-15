# savvy-progress 자동 진행 막대 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** savvy-progress의 프롬프트 위 진행 막대가 `/savvy-flow` 없이도 Claude의 할 일 목록과 서브에이전트 진행을 자동으로 보여 주게 한다.

**Architecture:** `register.tsx`에 `auto` 상태(atom) 하나를 추가하고, 이미 일어나는 도구 호출(`TodoWrite`, `TaskCreate`, `TaskUpdate`)과 `prompt.submit`을 훅으로 엿봐 채운다. 막대를 그리는 훅은 "flow → 할 일 목록 → 서브에이전트" 순서로 보여 줄 것 하나(`Bar`)를 고르고, 기존 그리기 코드(`rowSvg`, 터미널 행)를 그대로 쓴다. 새 도구 등록과 프롬프트 수정이 없으므로 추가 토큰은 0이다.

**Tech Stack:** Claude Code mod 훅 API(`claude-code`), TSX 모듈, 테스트 키트 `claude-code/testing` (`claude plugin test`)

**Spec:** `docs/superpowers/specs/2026-10-15-savvy-progress-auto-bar-design.md`

## Global Constraints

- 추가 토큰 0: 새 `$.tool.register` 금지, 프롬프트·컨텍스트(`context`, `prompt`) 수정 금지. 훅은 항상 `next(e)`의 결과를 바꾸지 않고 그대로 돌려준다.
- 메인 세션의 호출(`e.agentId`가 없음)만 할 일 목록으로 받는다.
- 우선순위: savvy-flow `flow` → 할 일 목록 → 서브에이전트.
- 목록 최대 `MAX_TASKS`(200)개, 제목은 `MAX_TITLE`(120자)로 자른다 (`clip`).
- 새 문자열은 en/ru/he 세 언어 모두에 넣는다.
- 설정 `autoBar`: `on`(기본) / `off`. `off`면 1.2.1과 같은 동작.
- 버전 1.2.1 → 1.3.0. upstream README(`mods/savvy-progress/README.md`)는 수정하지 않는다.
- 기존 테스트 24개는 계속 통과해야 한다: `claude plugin test ./mods/savvy-progress`.
- 커밋 메시지 끝에 `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. 이상한 `TodoWrite` 입력(빈 `content`, 모르는 `status`, 200개 초과, 아주 긴 제목): 막대가 깨지지 않고, 빈 항목은 빠지고, 200개로 잘리고, 제목은 줄임표로 잘린다. → Task 2
2. 다른 훅이 거부했거나 오류가 난 도구 호출: 할 일 목록을 바꾸지 않는다. → Task 2
3. 이전 세션이나 모르는 id에 대한 `TaskUpdate`: 무시하고 막대를 만들지 않는다. → Task 3
4. 할 일 목록을 비우는 `TodoWrite`(`todos: []`): 막대가 사라지거나 서브에이전트 막대로 넘어간다. → Task 2
5. 실행 중인 턴에 끼어든 프롬프트(`e.turnId` 있음)와 슬래시 커맨드(`e.command` 있음): 새 요청으로 치지 않고 막대를 지우지 않는다. → Task 5

---

## File Structure

| 파일 | 역할 | 변경 |
|---|---|---|
| `mods/savvy-progress/hooks/register.tsx` | mod 본체 | 수정: `auto` atom, `Bar` 보기, 출처별 수집 훅, 막대 고르기 |
| `mods/savvy-progress/types/index.d.ts` | `$.state` 계약 | 수정: `AutoTodo`, `AutoBar`, `PluginState.auto` |
| `mods/savvy-progress/hooks/auto.test.ts` | 자동 막대 테스트 | 생성 |
| `mods/savvy-progress/.claude-plugin/plugin.json` | 매니페스트 | 수정: `userConfig.autoBar`, `version` |
| `THIRD_PARTY_NOTICES.md`, `README.md`, `mods/README.md` | 저장소 문서 | 수정 |

`register.tsx`는 이미 1,272줄짜리 단일 모듈이고 upstream도 한 파일로 유지한다. upstream과 다시 합치기 쉽도록 파일을 나누지 않고, 새 코드는 기존 구획(문자열, 막대, 훅) 안에 넣는다.

---

### Task 1: vendoring 기준선 커밋

지금 작업 트리에 있는 savvy-progress·savvy-flow vendoring(수정 없음)을 먼저 커밋한다. 이후 변경이 upstream 원본 대비 diff로 남는다.

**Files:**
- Commit: `.claude-plugin/marketplace.json`, `README.md`, `THIRD_PARTY_NOTICES.md`, `mods/README.md`, `licenses/MIT-johnnyvizz-claude-kit.txt`, `mods/savvy-flow/`, `mods/savvy-progress/`

- [ ] **Step 1: 원본과 바이트 단위로 같은지 확인**

upstream 클론이 없으면 먼저 받는다.

```bash
SRC=/tmp/claude-kit; [ -d "$SRC" ] || git clone -q https://github.com/johnnyvizz/claude-kit.git "$SRC"; git -C "$SRC" checkout -q c871c153ead54ad9547cc717d0f3e5a676c73986
for p in savvy-progress savvy-flow; do git -C "$SRC" ls-tree -r HEAD plugins/$p | while read mode type hash path; do rel=${path#plugins/$p/}; [ "$(git hash-object mods/$p/$rel)" = "$hash" ] || echo "MISMATCH $p/$rel"; done; done; echo checked
```

Expected: `checked`만 출력 (MISMATCH 없음)

- [ ] **Step 2: 검증과 기준 테스트**

```bash
claude plugin validate ./mods/savvy-progress && claude plugin validate ./mods/savvy-flow && claude plugin validate . && claude plugin test ./mods/savvy-progress
```

Expected: 세 validate 모두 `✔ Validation passed`, 테스트 `24 pass 0 fail`

- [ ] **Step 3: 커밋**

```bash
git add .claude-plugin/marketplace.json README.md THIRD_PARTY_NOTICES.md mods/README.md licenses/MIT-johnnyvizz-claude-kit.txt mods/savvy-flow mods/savvy-progress
git commit -m "feat: vendor savvy-progress and savvy-flow from johnnyvizz/claude-kit

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: 할 일 목록(TodoWrite) 막대와 `autoBar` 설정

**Files:**
- Modify: `mods/savvy-progress/types/index.d.ts`
- Modify: `mods/savvy-progress/hooks/register.tsx` (상단 atom·상수 1-41행, `STRINGS` 49-143행, `label` 219-226행, `rowSvg`/`barText` 274-353행, `register` 793행 이후, AbovePrompt 훅 1205-1270행)
- Modify: `mods/savvy-progress/.claude-plugin/plugin.json`
- Create: `mods/savvy-progress/hooks/auto.test.ts`

**Interfaces:**
- Produces (types): `AutoTodo = { id: string; title: string; activeForm?: string; status: 'pending' | 'in_progress' | 'completed' }`, `AutoBar = { todos: AutoTodo[]; since: number; isHidden: boolean }`
- Produces (register.tsx): `auto` atom; `type Bar = Flow & { isAuto?: boolean; word?: 'agents' }`; `statusOr(v: unknown, fallback: AutoTodo['status']): AutoTodo['status']`; `todoBar(todos: AutoTodo[]): Bar | null`; `barOf($: EngineInterface, isAutoOn: boolean): Promise<Bar | null>`; `isAnswered(result): boolean`
- Produces (test file): `world(on, now?)`, `band($, surface)`, `TODOS`, `PLUGIN`, `SURFACES`

- [ ] **Step 1: 실패하는 테스트 작성**

`mods/savvy-progress/hooks/auto.test.ts`를 만든다.

```ts
import type { On } from 'claude-code'
import { expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'

const PLUGIN = 'savvy-progress'
const PROGRESS = 'mcp__savvy-progress__progress'
const SURFACES = ['terminal', 'desktop'] as const
const BAND = { hasSurvey: false, isWorking: false, maxRows: 4, bodyColumns: 100, scroll: { offset: 0, bodyRows: 4 }, view: {} }

const TODOS = [
  { content: 'Write the parser', status: 'completed', activeForm: 'Writing the parser' },
  { content: 'Run the tests', status: 'in_progress', activeForm: 'Running the tests' },
  { content: 'Update the docs', status: 'pending', activeForm: 'Updating the docs' },
]

// The world beneath the mod: a clock, nothing else drawing the band, and tools,
// prompts and subagents that simply succeed.
function world(on: On, now = 1_000) {
  const clock = mock.clock(on, { now })
  on('ui.render', () => ({ type: 'engine' }) as never)
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('tool.call', { tool: 'TodoWrite' }, () => ({ result: { oldTodos: [], newTodos: [] } }) as never)
  let lastId = 0
  on('tool.call', { tool: 'TaskCreate' }, () => ({ result: { task: { id: String(++lastId), subject: '' } } }) as never)
  on('tool.call', { tool: 'TaskUpdate' }, (_$, e) => ({ result: { success: true, taskId: (e as { taskId: string }).taskId, updatedFields: [] } }) as never)
  on('prompt.submit', (_$, e) => ({ text: e.text }) as never)
  on('agent.spawn', (_$, e) => ({ model: 'claude-opus-5-5', agentId: `ag-${e.tool_use_id}` }) as never)
  on('turn.complete', () => ({ text: '' }) as never)
  return clock
}

// The band above the prompt as text: the terminal's Text runs joined, or the
// desktop row's SVG source; null when the mod draws nothing there.
async function band($: Engine, surface: (typeof SURFACES)[number]): Promise<string | null> {
  try {
    const ui = await $.ui.mount({ plugin: PLUGIN, surface, component: 'AbovePrompt', props: BAND })
    const svg = await ui.find({ type: 'Svg' })
    const texts = await ui.findAll({ type: 'Text' })
    await ui.unmount()
    return surface === 'desktop' ? String(svg?.props.source) : texts.map(t => t.text).join(' | ')
  } catch (err) {
    if (/drew nothing/.test(String(err))) return null
    throw err
  }
}

const todoWrite = ($: Engine, todos: unknown[], agentId?: string) =>
  $.tool.call({ tool: 'TodoWrite', todos, ...(agentId ? { agentId } : {}) } as never)

for (const surface of SURFACES) {
  test(`${surface}: the to-do list draws the band without a flow`, async ($, on) => {
    world(on)
    expect(await band($, surface)).toBeNull()

    await todoWrite($, TODOS)
    const shown = await band($, surface)
    expect(shown).toContain('Running the tests')
    expect(shown).toContain('Tasks 1/3')
  })

  test(`${surface}: a finished to-do list shows Done`, async ($, on) => {
    world(on)
    await todoWrite($, TODOS.map(t => ({ ...t, status: 'completed' })))
    const shown = await band($, surface)
    expect(shown).toContain('Update the docs')
    expect(shown).toContain('Done')
  })

  test(`${surface}: a flow wins over the to-do list`, async ($, on) => {
    world(on)
    await todoWrite($, TODOS)
    await $.tool.call({ tool: PROGRESS, title: 'Ship it', total: 4, done: 1, phase: 'delegate' } as never)
    const shown = await band($, surface)
    expect(shown).toContain('Ship it')
    expect(shown).not.toContain('Running the tests')
  })
}

test('a subagent’s to-do list does not draw the band', async ($, on) => {
  world(on)
  await todoWrite($, TODOS, 'a1')
  expect(await band($, 'terminal')).toBeNull()
})

test('an empty to-do list takes the band away', async ($, on) => {
  world(on)
  await todoWrite($, TODOS)
  await todoWrite($, [])
  expect(await band($, 'terminal')).toBeNull()
})

test('odd to-do input cannot break the band', async ($, on) => {
  world(on)
  const todos = [
    { content: '', status: 'pending', activeForm: '' },
    { status: 'in_progress' },
    { content: 'L'.repeat(500), status: 'bogus', activeForm: '' },
    ...Array.from({ length: 300 }, (_, i) => ({ content: `Task ${i}`, status: 'pending', activeForm: `Doing ${i}` })),
  ]
  await todoWrite($, todos)
  const shown = await band($, 'terminal')
  expect(shown).toContain('Tasks 0/200')
  expect(shown).toContain('…')
})

test('a refused to-do call leaves the band alone', async ($, on) => {
  mock.clock(on)
  on('ui.render', () => ({ type: 'engine' }) as never)
  on('tool.call', { tool: 'TodoWrite' }, () => ({ deny: 'not now' }) as never)
  await todoWrite($, TODOS)
  expect(await band($, 'terminal')).toBeNull()
})

test('autoBar off: the to-do list draws nothing, the flow still does', { options: { autoBar: 'off' } }, async ($, on) => {
  world(on)
  await todoWrite($, TODOS)
  expect(await band($, 'terminal')).toBeNull()
  await $.tool.call({ tool: PROGRESS, title: 'Ship it', total: 2, phase: 'delegate' } as never)
  expect(await band($, 'terminal')).toContain('Ship it')
})
```

- [ ] **Step 2: 실패 확인**

Run: `claude plugin test ./mods/savvy-progress`
Expected: 기존 24개는 pass. 새 테스트 중 막대가 보여야 하는 것들(`the to-do list draws the band…`, `finished … Done`, `flow wins`, `odd to-do input`)은 FAIL. 이유는 `band()`가 null을 돌려주기 때문(`expect(received).toContain` on null). null을 기대하는 테스트는 이미 pass할 수 있다.

- [ ] **Step 3: 상태 타입 추가**

`mods/savvy-progress/types/index.d.ts`에서 `export type Panel = {` 블록 바로 아래에 추가한다.

```ts
/** One row of Claude's own to-do list (TodoWrite, or TaskCreate/TaskUpdate), main session only. */
export type AutoTodo = {
  id: string
  title: string
  activeForm?: string
  status: 'pending' | 'in_progress' | 'completed'
}

/** What the automatic band draws from when no flow reports. */
export type AutoBar = {
  todos: AutoTodo[]
  /** When the current request began; subagents started since then are this request's. */
  since: number
  /** Dismissed with ✕ until new data arrives. */
  isHidden: boolean
}
```

같은 파일 `PluginState`의 `'savvy-progress'` 블록에 `auto: AutoBar`를 추가한다.

```ts
    'savvy-progress': {
      flow: Flow | null
      agents: AgentRun[]
      panel: Panel
      now: number
      auto: AutoBar
    }
```

- [ ] **Step 4: atom, 문자열, 보기 타입 추가**

`register.tsx` 4행의 import를 바꾼다.

```ts
import type { AgentRun, AutoTodo, Flow, Panel, Phase, PlannedTask } from '../types'
```

13행(`const now = atom(...)`) 아래에 추가한다.

```ts
// The automatic band: Claude's own to-do list and this request's subagents.
const auto = atom({ plugin: 'savvy-progress', key: 'auto' } as const, { todos: [], since: 0, isHidden: false })
```

`STRINGS`의 세 언어에 두 키를 추가한다. 각 언어의 `ctx:` 줄 바로 아래에 넣는다.

```ts
    // en
    subagents: 'Subagents',
    agentsWord: 'Agents',
```

```ts
    // ru
    subagents: 'Субагенты',
    agentsWord: 'Агенты',
```

```ts
    // he
    subagents: 'סוכני משנה',
    agentsWord: 'סוכנים',
```

(주석 `// en` 등은 넣지 않는다. 위치 표시용이다.)

`label` 정의(219-226행)를 아래로 바꾼다.

```ts
// What the band draws: the flow itself, or one built from the to-do list or
// the subagents (`isAuto`), whose count is of agents when `word` says so.
type Bar = Flow & { isAuto?: boolean; word?: 'agents' }

const label = (f: Bar): string => {
  const s = tr()
  if (f.isFinished) return s.done
  if (f.phase === 'plan') return s.plan
  if (f.phase === 'design') return s.design
  const count = f.total ? `${f.done}/${f.total}` : `${f.running} ${s.busy}`
  return `${f.phase === 'review' ? s.review : f.word === 'agents' ? s.agentsWord : s.tasks} ${count}`
}
```

`const ratio = (f: Flow)`를 `const ratio = (f: Bar)`로, `const rowSvg = (f: Flow, W: number, isWorking: boolean)`를 `const rowSvg = (f: Bar, W: number, isWorking: boolean)`로, `const barText = (f: Flow, width: number)`를 `const barText = (f: Bar, width: number)`로 바꾼다.

- [ ] **Step 5: 할 일 목록 정리와 막대 고르기 함수 추가**

`barText` 정의 바로 아래(355행 `// ----` 구획 주석 위)에 추가한다.

```ts
// ---------------------------------------------------------------------------
// Automatic band: Claude's own to-do list, else this request's subagents.

const TODO_STATUSES: readonly AutoTodo['status'][] = ['pending', 'in_progress', 'completed']

const statusOr = (v: unknown, fallback: AutoTodo['status']): AutoTodo['status'] =>
  TODO_STATUSES.find(s => s === v) ?? fallback

const cleanText = (v: unknown): string | undefined =>
  typeof v === 'string' && v.trim() ? clip(v.trim(), MAX_TITLE) : undefined

type TodoInput = { content?: unknown; status?: unknown; activeForm?: unknown }

const cleanTodos = (todos: unknown): AutoTodo[] =>
  (Array.isArray(todos) ? (todos as TodoInput[]) : [])
    .filter(t => cleanText(t?.content))
    .slice(0, MAX_TASKS)
    .map((t, i) => ({
      id: String(i + 1),
      title: cleanText(t.content) ?? '',
      activeForm: cleanText(t.activeForm),
      status: statusOr(t.status, 'pending'),
    }))

// True when the tool ran and answered: not refused by a hook, not an error.
const isAnswered = (result: { deny?: string; isError?: boolean }): boolean => result.deny === undefined && !result.isError

const todoBar = (todos: AutoTodo[]): Bar | null => {
  if (!todos.length) return null
  const done = todos.filter(t => t.status === 'completed').length
  const active = todos.find(t => t.status === 'in_progress')
  const pending = todos.find(t => t.status !== 'completed')
  const title = active?.activeForm || active?.title || pending?.title || todos.at(-1)?.title || ''
  return {
    ...blank(),
    title,
    total: todos.length,
    done,
    running: todos.filter(t => t.status === 'in_progress').length,
    phase: 'delegate',
    isFinished: done === todos.length,
    isAuto: true,
  }
}

// The flow when there is one; else, unless switched off or dismissed, the to-do list.
async function barOf($: EngineInterface, isAutoOn: boolean): Promise<Bar | null> {
  const f = await read($, flow)
  if (f) return f
  if (!isAutoOn) return null
  const a = await read($, auto)
  if (a.isHidden) return null
  return todoBar(a.todos)
}
```

- [ ] **Step 6: TodoWrite 훅 추가**

`register` 안, `export const register: Register = (on, options) => {` 바로 다음 줄에 추가한다.

```ts
  const isAutoOn = options.autoBar !== 'off'
```

`on('agent.spawn', ...)` 블록(925행) 바로 위에 추가한다.

```ts
  // Claude's own to-do list, read as it is written: the main session's only.
  on('tool.call', { tool: 'TodoWrite' }, async ($, e, next) => {
    const result = await next(e)
    if (!isAutoOn || e.agentId || !isAnswered(result)) return result
    const todos = cleanTodos((e as unknown as { todos?: unknown }).todos)
    await update($, auto, prev => ({ ...prev, todos, isHidden: false }))
    return result
  })
```

- [ ] **Step 7: 막대 훅이 `barOf`를 쓰게 바꾸기**

AbovePrompt 훅(1205행~)을 다음과 같이 바꾼다. 바뀌는 곳은 첫 두 줄, `isWorking`, `dismiss`의 `onPress`다.

```ts
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const f = await barOf($, isAutoOn)
    if (f === null || e.props.hasSurvey) return next(e)
```

```ts
    const isWorking = list.some(a => a.status === 'running') || (f.isAuto === true && f.running > 0)
```

```ts
    const dismiss = (
      <Button
        key="savvy-dismiss"
        label="✕"
        plain
        role="dismiss"
        onPress={() =>
          f.isAuto ? update($, auto, prev => ({ ...prev, isHidden: true })) : update($, flow, () => null)
        }
      />
    )
```

훅의 나머지(`crew`, `percent`, 데스크톱·터미널 분기)는 그대로 둔다. `f`가 `Bar`라서 `rowSvg(f, …)`, `barText(f, …)`, `label(f)`가 그대로 받는다.

- [ ] **Step 8: `autoBar` 설정 추가**

`mods/savvy-progress/.claude-plugin/plugin.json`의 `userConfig`에서 `autoOpen` 항목 뒤에 추가한다.

```json
    "autoBar": {
      "type": "string",
      "title": "Automatic progress band",
      "description": "on: without a flow, the band above the prompt follows Claude's own to-do list, else this request's subagents; off: only /savvy-flow draws it",
      "default": "on",
      "options": [
        "on",
        "off"
      ]
    }
```

(`autoOpen` 블록의 닫는 `}` 뒤에 `,`를 붙인다.)

- [ ] **Step 9: 통과 확인**

Run: `claude plugin test ./mods/savvy-progress`
Expected: 기존 24개 + Task 2 테스트 모두 pass, 0 fail

- [ ] **Step 10: 커밋**

```bash
git add mods/savvy-progress/types/index.d.ts mods/savvy-progress/hooks/register.tsx mods/savvy-progress/hooks/auto.test.ts mods/savvy-progress/.claude-plugin/plugin.json
git commit -m "feat(savvy-progress): draw the band from Claude's to-do list

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: TaskCreate/TaskUpdate 할 일 목록

**Files:**
- Modify: `mods/savvy-progress/hooks/register.tsx` (Task 2에서 넣은 TodoWrite 훅 바로 아래)
- Test: `mods/savvy-progress/hooks/auto.test.ts`

**Interfaces:**
- Consumes: `auto` atom, `cleanText`, `statusOr`, `isAnswered`, `MAX_TASKS`, `AutoTodo` (Task 2); 테스트의 `world`, `band`, `SURFACES` (Task 2). `world`의 `TaskCreate` mock은 호출마다 id `'1'`, `'2'`, `'3'`…을 돌려준다.

- [ ] **Step 1: 실패하는 테스트 추가**

`auto.test.ts` 끝에 추가한다.

```ts
const taskCreate = ($: Engine, subject: string, activeForm?: string) =>
  $.tool.call({ tool: 'TaskCreate', subject, description: subject, ...(activeForm ? { activeForm } : {}) } as never)
const taskUpdate = ($: Engine, taskId: string, fields: Record<string, unknown>) =>
  $.tool.call({ tool: 'TaskUpdate', taskId, ...fields } as never)

for (const surface of SURFACES) {
  test(`${surface}: TaskCreate and TaskUpdate draw the band`, async ($, on) => {
    world(on)
    await taskCreate($, 'Write the parser')
    await taskCreate($, 'Run the tests', 'Running the tests')
    await taskCreate($, 'Update the docs')
    await taskUpdate($, '1', { status: 'completed' })
    await taskUpdate($, '2', { status: 'in_progress' })
    let shown = await band($, surface)
    expect(shown).toContain('Running the tests')
    expect(shown).toContain('Tasks 1/3')

    await taskUpdate($, '2', { status: 'deleted' })
    shown = await band($, surface)
    expect(shown).toContain('Update the docs')
    expect(shown).toContain('Tasks 1/2')
  })
}

test('a TaskUpdate for a task the band never saw changes nothing', async ($, on) => {
  world(on)
  await taskUpdate($, '99', { status: 'in_progress', subject: 'Ghost' })
  expect(await band($, 'terminal')).toBeNull()
})

test('a subagent’s TaskCreate does not draw the band', async ($, on) => {
  world(on)
  await $.tool.call({ tool: 'TaskCreate', agentId: 'a1', subject: 'Theirs', description: 'x' } as never)
  expect(await band($, 'terminal')).toBeNull()
})
```

- [ ] **Step 2: 실패 확인**

Run: `claude plugin test ./mods/savvy-progress`
Expected: `TaskCreate and TaskUpdate draw the band` 두 개 FAIL (`band()`가 null). 나머지는 pass.

- [ ] **Step 3: 훅 구현**

TodoWrite 훅 바로 아래에 추가한다.

```ts
  // The same list kept task by task: TaskCreate answers the new task's id.
  on('tool.call', { tool: 'TaskCreate' }, async ($, e, next) => {
    const result = await next(e)
    if (!isAutoOn || e.agentId || !isAnswered(result)) return result
    const input = e as unknown as { subject?: unknown; activeForm?: unknown }
    const id = (result.result as { task?: { id?: unknown } } | undefined)?.task?.id
    const title = cleanText(input.subject)
    if (typeof id !== 'string' || !title) return result
    const todo: AutoTodo = { id, title, activeForm: cleanText(input.activeForm), status: 'pending' }
    await update($, auto, prev => ({ ...prev, isHidden: false, todos: [...prev.todos.filter(t => t.id !== id), todo].slice(-MAX_TASKS) }))
    return result
  })

  // A task the band never saw (an earlier session's) is left alone.
  on('tool.call', { tool: 'TaskUpdate' }, async ($, e, next) => {
    const result = await next(e)
    if (!isAutoOn || e.agentId || !isAnswered(result)) return result
    if ((result.result as { success?: boolean } | undefined)?.success === false) return result
    const input = e as unknown as { taskId?: unknown; status?: unknown; subject?: unknown; activeForm?: unknown }
    await update($, auto, prev => {
      if (!prev.todos.some(t => t.id === input.taskId)) return prev
      const todos =
        input.status === 'deleted'
          ? prev.todos.filter(t => t.id !== input.taskId)
          : prev.todos.map(t =>
              t.id !== input.taskId
                ? t
                : {
                    ...t,
                    status: statusOr(input.status, t.status),
                    title: cleanText(input.subject) ?? t.title,
                    activeForm: cleanText(input.activeForm) ?? t.activeForm,
                  },
            )
      return { ...prev, isHidden: false, todos }
    })
    return result
  })
```

- [ ] **Step 4: 통과 확인**

Run: `claude plugin test ./mods/savvy-progress`
Expected: 모두 pass, 0 fail

- [ ] **Step 5: 커밋**

```bash
git add mods/savvy-progress/hooks/register.tsx mods/savvy-progress/hooks/auto.test.ts
git commit -m "feat(savvy-progress): follow TaskCreate/TaskUpdate in the band

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: 서브에이전트 막대와 ✕ 숨김

**Files:**
- Modify: `mods/savvy-progress/hooks/register.tsx` (`barOf`, `agent.spawn` 훅)
- Test: `mods/savvy-progress/hooks/auto.test.ts`

**Interfaces:**
- Consumes: `Bar`, `todoBar`, `barOf`, `auto` atom (Task 2); 기존 `agents` atom, `AgentRun`; 테스트의 `world`(agent.spawn mock은 `agentId: 'ag-<tool_use_id>'`, model `claude-opus-5-5`), `band`, `todoWrite`, `TODOS`
- Produces: `requestAgents(list: AgentRun[], since: number): AgentRun[]`, `agentsBar(runs: AgentRun[]): Bar | null`; 테스트 헬퍼 `spawn($, id)`, `finish($, id)`

- [ ] **Step 1: 실패하는 테스트 추가**

`auto.test.ts` 끝에 추가한다.

```ts
const spawn = ($: Engine, id: string) =>
  $.agent.spawn({
    tool_use_id: id,
    prompt: 'p',
    description: `Job ${id}`,
    subagentType: 'general-purpose',
    provider: 'engine',
    parentModel: 'claude-opus-5-5',
    background: false,
    fork: false,
  } as never)
const finish = ($: Engine, id: string) =>
  ($.turn.complete as (e: unknown) => Promise<unknown>)({ agentId: `ag-${id}`, reason: 'answer', answer: 'ok', usage: null })

for (const surface of SURFACES) {
  test(`${surface}: subagents draw the band when there is no to-do list`, async ($, on) => {
    world(on)
    await spawn($, 't1')
    await spawn($, 't2')
    await finish($, 't1')
    let shown = await band($, surface)
    expect(shown).toContain('Subagents')
    expect(shown).toContain('Agents 1/2')

    await finish($, 't2')
    expect(await band($, surface)).toContain('Done')
  })
}

test('the to-do list wins over the subagents', async ($, on) => {
  world(on)
  await spawn($, 't1')
  await todoWrite($, TODOS)
  const shown = await band($, 'terminal')
  expect(shown).toContain('Running the tests')
  expect(shown).not.toContain('Subagents')
})

test('✕ hides the automatic band until new data arrives', async ($, on) => {
  world(on)
  await todoWrite($, TODOS)
  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'AbovePrompt', props: BAND })
  await ui.press({ key: 'savvy-dismiss' })
  await ui.unmount()
  expect(await band($, 'terminal')).toBeNull()

  await todoWrite($, TODOS.map(t => ({ ...t, status: 'completed' })))
  expect(await band($, 'terminal')).toContain('Done')

  const again = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'AbovePrompt', props: BAND })
  await again.press({ key: 'savvy-dismiss' })
  await again.unmount()
  await spawn($, 't1')
  expect(await band($, 'terminal')).toContain('Done')
})

test('✕ on a flow drops the flow and shows the to-do list beneath it', async ($, on) => {
  world(on)
  await todoWrite($, TODOS)
  await $.tool.call({ tool: PROGRESS, title: 'Ship it', total: 2, phase: 'delegate' } as never)
  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'AbovePrompt', props: BAND })
  await ui.press({ key: 'savvy-dismiss' })
  await ui.unmount()
  expect(await band($, 'terminal')).toContain('Running the tests')
})
```

마지막 `✕ hides…` 테스트의 끝부분은 이렇게 동작해야 한다. 할 일 목록이 다 끝난 상태에서 숨긴 뒤 새 서브에이전트가 시작되면, 숨김이 풀리면서 우선순위상 할 일 목록 막대(`Done`)가 다시 보인다.

- [ ] **Step 2: 실패 확인**

Run: `claude plugin test ./mods/savvy-progress`
Expected: `subagents draw the band…` 두 개, `✕ hides…` FAIL. `the to-do list wins…`와 `✕ on a flow…`는 Task 2 코드로도 pass할 수 있다.

- [ ] **Step 3: 서브에이전트 보기 구현**

Task 2에서 넣은 `todoBar` 바로 아래에 추가한다.

```ts
// This request's subagents: still running, or started since the request began.
const requestAgents = (list: AgentRun[], since: number): AgentRun[] =>
  list.filter(a => a.status === 'running' || a.startedAt >= since)

const agentsBar = (runs: AgentRun[]): Bar | null => {
  if (!runs.length) return null
  const running = runs.filter(a => a.status === 'running').length
  return {
    ...blank(),
    title: tr().subagents,
    total: runs.length,
    done: runs.length - running,
    running,
    phase: 'delegate',
    isFinished: running === 0,
    isAuto: true,
    word: 'agents',
  }
}
```

`barOf`의 마지막 줄을 바꾼다.

```ts
  return todoBar(a.todos) ?? agentsBar(requestAgents(await read($, agents), a.since))
```

- [ ] **Step 4: 새 서브에이전트가 숨김을 풀게 하기**

`on('agent.spawn', ...)` 훅에서 `await update($, now, () => at)` 줄(950행) 바로 아래에 추가한다.

```ts
    await update($, auto, prev => (prev.isHidden ? { ...prev, isHidden: false } : prev))
```

- [ ] **Step 5: 통과 확인**

Run: `claude plugin test ./mods/savvy-progress`
Expected: 모두 pass, 0 fail

- [ ] **Step 6: 커밋**

```bash
git add mods/savvy-progress/hooks/register.tsx mods/savvy-progress/hooks/auto.test.ts
git commit -m "feat(savvy-progress): show this request's subagents in the band

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: 새 요청이 끝난 막대를 지우기

**Files:**
- Modify: `mods/savvy-progress/hooks/register.tsx` (Task 3의 TaskUpdate 훅 아래)
- Test: `mods/savvy-progress/hooks/auto.test.ts`

**Interfaces:**
- Consumes: `auto` atom (Task 2), `requestAgents` (Task 4); 테스트의 `world`(clock을 돌려줌), `band`, `todoWrite`, `TODOS`, `spawn`, `finish`
- Produces: 테스트 헬퍼 `submit($, text, extra?)`

- [ ] **Step 1: 실패하는 테스트 추가**

`auto.test.ts` 끝에 추가한다.

```ts
const submit = ($: Engine, text: string, extra: Record<string, unknown> = {}) =>
  ($.prompt.submit as (e: unknown) => Promise<unknown>)({ text, wait: false, origin: { kind: 'composer' }, ...extra })

test('a new request clears a finished to-do list', async ($, on) => {
  world(on)
  await todoWrite($, TODOS.map(t => ({ ...t, status: 'completed' })))
  await submit($, 'next thing')
  expect(await band($, 'terminal')).toBeNull()
})

test('a new request keeps an unfinished to-do list', async ($, on) => {
  world(on)
  await todoWrite($, TODOS)
  await submit($, 'next thing')
  expect(await band($, 'terminal')).toContain('Tasks 1/3')
})

test('a new request drops finished subagents and keeps running ones', async ($, on) => {
  const clock = world(on)
  await spawn($, 't1')
  await spawn($, 't2')
  await finish($, 't1')
  await clock.advance(5_000)
  await submit($, 'next thing')
  expect(await band($, 'terminal')).toContain('Agents 0/1')

  await finish($, 't2')
  await clock.advance(5_000)
  await submit($, 'and another')
  expect(await band($, 'terminal')).toBeNull()
})

test('a slash command or a prompt typed mid-turn is not a new request', async ($, on) => {
  world(on)
  await todoWrite($, TODOS.map(t => ({ ...t, status: 'completed' })))
  await submit($, '/agents-info', { command: { name: 'agents-info', args: '' } })
  await submit($, 'also this', { turnId: 'turn-1' })
  expect(await band($, 'terminal')).toContain('Done')
})
```

- [ ] **Step 2: 실패 확인**

Run: `claude plugin test ./mods/savvy-progress`
Expected: `clears a finished to-do list`, `drops finished subagents…` FAIL. 나머지 둘은 pass할 수 있다.

- [ ] **Step 3: 훅 구현**

TaskUpdate 훅 아래에 추가한다.

```ts
  // A new request typed while idle: a finished list goes, and the subagents
  // shown become this request's. A slash command or a prompt typed into a
  // running turn is not a new request.
  on('prompt.submit', async ($, e, next) => {
    if (isAutoOn && !e.command && e.turnId === undefined) {
      const at = await $.clock.now()
      await update($, auto, prev => ({
        ...prev,
        todos: prev.todos.every(t => t.status === 'completed') ? [] : prev.todos,
        since: at,
      }))
    }
    return next(e)
  })
```

- [ ] **Step 4: 통과 확인**

Run: `claude plugin test ./mods/savvy-progress`
Expected: 모두 pass, 0 fail

- [ ] **Step 5: 커밋**

```bash
git add mods/savvy-progress/hooks/register.tsx mods/savvy-progress/hooks/auto.test.ts
git commit -m "feat(savvy-progress): clear a finished band when a new request starts

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: 버전·문서·검증과 실제 세션 확인

**Files:**
- Modify: `mods/savvy-progress/.claude-plugin/plugin.json` (`version`)
- Modify: `THIRD_PARTY_NOTICES.md`, `README.md`, `mods/README.md`

- [ ] **Step 1: 버전 올리기**

`mods/savvy-progress/.claude-plugin/plugin.json`의 `"version": "1.2.1"`을 `"version": "1.3.0"`으로 바꾼다.

- [ ] **Step 2: THIRD_PARTY_NOTICES 갱신**

`THIRD_PARTY_NOTICES.md`의 savvy-progress 행을 바꾼다.

```markdown
| `mods/savvy-progress/` | `plugins/savvy-progress/` | `c871c153ead54ad9547cc717d0f3e5a676c73986` | 수정함 (1.3.0): `/savvy-flow` 없이도 Claude의 할 일 목록과 서브에이전트로 진행 막대를 자동 표시, 설정 `autoBar` 추가. README는 원본 그대로 |
```

- [ ] **Step 3: README의 mod 목록 갱신**

`README.md` mod 목록의 savvy-progress 행 설명 칸을 바꾼다.

```markdown
| [`savvy-progress`](mods/savvy-progress/) | 프롬프트 위 진행 막대: Claude의 할 일 목록이나 서브에이전트 진행을 자동으로 보여 주고, `/savvy-flow` 실행 중에는 그 계획을 보여 줍니다. `/agents-info`로 서브에이전트 패널(모델, 진행률, 컨텍스트, 예상 비용, 시간)을 엽니다. | johnnyvizz/claude-kit (MIT), 수정함 |
```

같은 파일의 johnnyvizz/claude-kit 설명 문단에서 첫 문장 "수정 없이 복사한 MIT 라이선스 플러그인입니다."를 "복사한 MIT 라이선스 플러그인입니다. `savvy-progress`는 자동 진행 막대를 추가해 수정했습니다([mods/README.md](mods/README.md#savvy-progress-수정-사항))."로 바꾼다.

- [ ] **Step 4: mods/README.md에 수정 사항 섹션 추가**

`mods/README.md`의 목록 표에서 savvy-progress 행의 출처 칸을 `johnnyvizz/claude-kit (MIT), 수정함`으로 바꾸고, 파일 끝에 섹션을 추가한다.

```markdown
## savvy-progress 수정 사항

이 저장소의 savvy-progress(1.3.0)는 upstream 1.2.1에 자동 진행 막대를 더한 것입니다. upstream README에는 이 내용이 없습니다.

- `/savvy-flow`가 진행을 보고하지 않을 때도 프롬프트 위에 막대가 뜹니다. 출처는 우선순위 순으로 Claude의 할 일 목록(`TodoWrite`, `TaskCreate`/`TaskUpdate`), 그다음 이번 요청의 서브에이전트입니다. 간단한 요청처럼 둘 다 없으면 막대가 뜨지 않습니다.
- 이미 일어나는 도구 호출을 읽기만 하므로 토큰을 더 쓰지 않습니다.
- 전부 끝나면 `Done`으로 남고, 다음 요청을 보낼 때 사라집니다. ✕로 숨기면 새 할 일이나 서브에이전트가 생길 때 다시 보입니다.
- 끄려면 설정 `autoBar`를 `off`로 둡니다. `/config`에서 바꾸거나, 폴더에서 바로 불러온 mod라면 `~/.claude/settings.json`에 씁니다.

  ```json
  { "pluginConfigs": { "savvy-progress": { "options": { "autoBar": "off" } } } }
  ```
```

- [ ] **Step 5: 전체 검증**

```bash
claude plugin test ./mods/savvy-progress && claude plugin validate ./mods/savvy-progress && claude plugin validate .
```

Expected: 테스트 0 fail. validate의 `hooks:` 줄에 `tool.call{tool=TodoWrite}`, `tool.call{tool=TaskCreate}`, `tool.call{tool=TaskUpdate}`, `prompt.submit`이 추가되고, `calls:` 줄에 새 `$.tool.register`나 `$.process.run`/`$.fs.write`/`$.http.fetch`가 없다. `✔ Validation passed` 두 번.

- [ ] **Step 6: 실제 세션 확인 (사용자)**

테스트용 프로젝트 폴더에서 실행한다.

```bash
claude --plugin-dir C:/dev2/workspace/cc-mods/mods/savvy-progress --plugin-dir C:/dev2/workspace/cc-mods/mods/savvy-flow
```

1. 여러 단계 작업을 시킨다(예: "README에 설치 섹션과 사용 섹션을 추가하고 오타를 점검해줘"). Claude가 할 일 목록을 만들면 프롬프트 위에 `Tasks n/m` 막대가 뜨고, 항목이 끝날 때마다 갱신되는지 본다.
2. 끝나면 `Done`으로 남고, 다음 프롬프트를 보내면 사라지는지 본다.
3. "Explore 에이전트 두 개로 X와 Y를 찾아줘"처럼 서브에이전트를 쓰게 해서 `Subagents · Agents n/m`이 뜨는지 본다.

- [ ] **Step 7: 커밋**

```bash
git add mods/savvy-progress/.claude-plugin/plugin.json THIRD_PARTY_NOTICES.md README.md mods/README.md
git commit -m "docs: document the savvy-progress auto band and bump it to 1.3.0

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
