export type Stage = 'brainstorm' | 'spec' | 'plan' | 'build' | 'review' | 'finish'

export type TodoStatus = 'pending' | 'in_progress' | 'completed'

/** One row of a to-do list: TodoWrite's, or TaskCreate/TaskUpdate's. */
export type Todo = {
  id: string
  title: string
  activeForm?: string
  status: TodoStatus
}

/** The main session's superpowers flow. */
export type Flow = {
  stage: Stage
  isFinished: boolean
  /** The first line of brainstorming's argument. */
  topic?: string
  /** The first `# ` heading of the spec written in this flow. */
  specTitle?: string
  /** The first `# ` heading of the plan written in this flow. */
  planTitle?: string
  /** The plan's `### Task` headings. */
  planTasks?: number
  /** In Finish, the user has replied to the finishing skill's question: the next main turn ends the flow. */
  hasReply?: boolean
}

/** The current request's clock: from its start until its main turn first ends. */
export type Clock = { from: number; to?: number }

/** A slash command the user sent, waiting for `skill.prompt` to say it is a skill. */
export type SlashCandidate = { name: string; args: string; isIdle: boolean }

/** The last test run that finished in the foreground, the main session's or a subagent's. */
export type TestResult = { isPass: boolean; at: number }

/** A skill other than superpowers' that this request ran. */
export type SkillRun = { name: string; args?: string }

export type Work = {
  flow: Flow | null
  /** The main session's to-do list. */
  todos: Todo[]
  /** Each subagent's own to-do list, by agentId: the panel's step bars. */
  agentTodos: Record<string, Todo[]>
  /** When the current request began; subagents started since are its. */
  since: number
  /** The harness band was dismissed with ✕ and waits for new data. */
  isHidden: boolean
  /** Set by a new request; absent after a replay until the next one. */
  clock?: Clock
  pendingSlash?: SlashCandidate
  test?: TestResult
  skill?: SkillRun
  /** This state was rebuilt from the transcript, or tried to be: never twice. */
  isReplayed?: boolean
}

export type AgentStatus = 'running' | 'done' | 'failed'

export type AgentRun = {
  id: string
  agentId?: string
  type: string
  description: string
  model: string
  effort?: string
  status: AgentStatus
  startedAt: number
  endedAt?: number
  contextTokens: number
  contextMax: number
  tokens: number
  costUsd: number
  steps: number
}

export type Panel = {
  isCompact: boolean
  isDoneCollapsed: boolean
}

declare module 'claude-code' {
  interface PluginState {
    'work-band': {
      work: Work
      agents: AgentRun[]
      panel: Panel
      now: number
    }
  }
}
