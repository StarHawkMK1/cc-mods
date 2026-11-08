import type { Work } from '../types'
import { onFile, onMainTurnEnd, onRequest, onSkill, onTaskCreate, onTaskUpdate, onTest, onTodoWrite } from './events'
import { blankWork, keepsList, mdPathOf, skillStage, type TaskUpdateInput } from './flow'
import { testVerdict } from './tests'

// A resumed or branched session starts with empty state: its transcript, read
// back through the same rules the live hooks use, rebuilds what outlives a request.

type Use = { tool?: unknown; input?: unknown; result?: unknown; text?: unknown; isError?: unknown }
type Message = { role?: unknown; text?: unknown; toolUses?: unknown; toolResults?: unknown }

export type Signal =
  | { kind: 'request' }
  | { kind: 'slash'; name: string; args: string }
  | { kind: 'tool'; tool: string; input: Record<string, unknown>; result?: unknown; text?: string; isError: boolean }
  | { kind: 'answer' }

// User rows that are not a prompt the user wrote.
const NOT_PROMPT = ['<task-notification', '<system-reminder', '<local-command', 'Caveat:', 'Base directory for this skill:', '[Request interrupted']
const COMMAND = /<command-name>\/?([^<\s]+)\s*<\/command-name>/
const COMMAND_ARGS = /<command-args>([\s\S]*?)<\/command-args>/

export const signalsOf = (messages: unknown): Signal[] => {
  const out: Signal[] = []
  for (const m of Array.isArray(messages) ? (messages as unknown[]) : []) {
    if (!m || typeof m !== 'object') continue
    const { role, text: rawText, toolUses, toolResults } = m as Message
    const text = typeof rawText === 'string' ? rawText.trim() : ''
    if (role === 'user') {
      if (Array.isArray(toolResults) && toolResults.length) continue
      const command = COMMAND.exec(text)?.[1]
      if (command) {
        // Only a superpowers stage skill is known to be a skill here: any other
        // slash command may be a built-in (/model), and other skills are not restored.
        if (skillStage(command)) out.push({ kind: 'request' }, { kind: 'slash', name: command, args: COMMAND_ARGS.exec(text)?.[1]?.trim() ?? '' })
        continue
      }
      if (text && !NOT_PROMPT.some(p => text.startsWith(p))) out.push({ kind: 'request' })
    } else if (role === 'assistant') {
      const uses = Array.isArray(toolUses) ? (toolUses as Use[]) : []
      for (const u of uses) {
        if (!u || typeof u.tool !== 'string') continue
        out.push({
          kind: 'tool',
          tool: u.tool,
          input: u.input && typeof u.input === 'object' ? (u.input as Record<string, unknown>) : {},
          result: u.result,
          ...(typeof u.text === 'string' ? { text: u.text } : {}),
          isError: u.isError === true,
        })
      }
      // A reply with no tool calls ends the turn with an answer.
      if (!uses.length && text) out.push({ kind: 'answer' })
    }
  }
  return out
}

export type ReplayOptions = { root?: string; skills: readonly string[]; tests: readonly string[]; at: number }

export const replay = (messages: unknown, o: ReplayOptions): { work: Work; planPath?: string } => {
  let w = blankWork()
  let planPath: string | undefined
  const skillSignal = (name: unknown, args: unknown) => {
    w = onSkill(w, name, args, o.skills)
    if (skillStage(name) === 'build') planPath = mdPathOf(args) ?? planPath
  }
  for (const s of signalsOf(messages)) {
    // A new prompt means the main turn before it ended, answer or not: in Finish
    // that closes the flow once the user has replied (spec §9.2).
    if (s.kind === 'request') w = onRequest(onMainTurnEnd(w, 0, true), 0)
    else if (s.kind === 'slash') skillSignal(s.name, s.args)
    else if (s.kind === 'answer') w = onMainTurnEnd(w, 0, true)
    else if (s.tool === 'Bash') {
      const verdict = testVerdict(s.input, { isError: s.isError, result: s.result, ...(s.text !== undefined ? { text: s.text } : {}) }, o.tests)
      if (verdict) w = onTest(w, verdict === 'pass', 0)
    } else if (s.isError || (s.result as { success?: unknown } | undefined)?.success === false) continue
    else if (s.tool === 'Skill') skillSignal(s.input.skill, s.input.args)
    else if (s.tool === 'Write') w = onFile(w, s.input.file_path, s.input.content, o.root)
    else if (s.tool === 'Edit') w = onFile(w, s.input.file_path, undefined, o.root)
    else if (s.tool === 'NotebookEdit') w = onFile(w, s.input.notebook_path, undefined, o.root)
    else if (s.tool === 'TodoWrite') w = onTodoWrite(w, undefined, s.input.todos)
    else if (s.tool === 'TaskCreate') w = onTaskCreate(w, undefined, (s.result as { task?: { id?: unknown } } | undefined)?.task?.id, s.input.subject, s.input.activeForm)
    else if (s.tool === 'TaskUpdate') w = onTaskUpdate(w, undefined, s.input as TaskUpdateInput)
  }
  // Only what outlives a request: the flow, a list it still counts or an unfinished one, and the test result while the flow is under way.
  const flow = w.flow
  const isLive = !!flow && !flow.isFinished
  const work: Work = {
    ...blankWork(),
    flow,
    todos: keepsList(flow, w.todos) ? w.todos : [],
    since: o.at,
    isReplayed: true,
    ...(isLive && w.test ? { test: w.test } : {}),
  }
  return isLive && flow?.stage === 'build' && !flow.planTasks && planPath ? { work, planPath } : { work }
}
