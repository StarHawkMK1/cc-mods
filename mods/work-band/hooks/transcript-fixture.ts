// Transcript rows as `$.session.messages()` returns them, for the replay tests.
let n = 0
export const user = (text: string) => ({ role: 'user', text, toolUses: [] })
export const said = (text: string) => ({ role: 'assistant', text, toolUses: [] })
export const used = (tool: string, input: Record<string, unknown>, extra: Record<string, unknown> = {}) => ({
  role: 'assistant',
  text: '',
  toolUses: [{ tool_use_id: `u${++n}`, tool, input, ...extra }],
})
export const back = () => ({ role: 'user', text: '', toolUses: [], toolResults: [{ tool_use_id: 'x', text: '' }] })

const PLAN = ['# Auth login Implementation Plan', ...Array.from({ length: 7 }, (_, i) => `### Task ${i + 1}: Step ${i + 1}`)].join('\n')
const todos = (done: number) =>
  Array.from({ length: 7 }, (_, i) => ({ content: `Task ${i + 1}`, status: i < done ? 'completed' : i === done ? 'in_progress' : 'pending', activeForm: `Doing task ${i + 1}` }))
// A superpowers flow up to Build 3/7 with a failing test run.
export const TRANSCRIPT = [
  user('<command-message>superpowers:brainstorming</command-message>\n<command-name>/superpowers:brainstorming</command-name>\n<command-args>Auth redesign</command-args>'),
  user('Base directory for this skill: C:\\skills\\brainstorming\n\n# Brainstorming'),
  said('What is it for?'),
  user('login for admins'),
  used('Write', { file_path: 'docs/superpowers/specs/2026-10-16-auth-design.md', content: '# Auth redesign 설계\n' }),
  back(),
  used('Skill', { skill: 'superpowers:writing-plans', args: 'docs/superpowers/specs/2026-10-16-auth-design.md' }),
  back(),
  used('Write', { file_path: 'docs/superpowers/plans/2026-10-16-auth.md', content: PLAN }),
  back(),
  said('Plan written.'),
  user('go'),
  used('Skill', { skill: 'superpowers:subagent-driven-development', args: 'docs/superpowers/plans/2026-10-16-auth.md' }),
  back(),
  used('TodoWrite', { todos: todos(3) }),
  back(),
  used('Bash', { command: 'npm test' }, { isError: true, text: 'Exit code 1' }),
  back(),
]
