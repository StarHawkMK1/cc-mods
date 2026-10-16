import type { On } from 'claude-code'
import { mock } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'

export const PLUGIN = 'work-band'
export const PANE = 'work-band-agents'
export const SURFACES = ['terminal', 'desktop'] as const
export type Surface = (typeof SURFACES)[number]
export const BAND = { hasSurvey: false, isWorking: false, maxRows: 4, bodyColumns: 100, scroll: { offset: 0, bodyRows: 4 }, view: {} }
export const PANE_PROPS = { title: '', isFocused: false, bodyColumns: 60, placement: 'dock', scroll: { offset: 0, bodyRows: 30 }, view: {} } as const

// The world beneath the mod: a clock, nothing else drawing the band, panes that
// open and close, files from `files`, and tools, prompts and subagents that succeed.
export function world(on: On, now = 1_000, files: Record<string, string> = {}) {
  const clock = mock.clock(on, { now })
  on('ui.render', () => ({ type: 'engine' }) as never)
  let panes: { id: string; title: string }[] = []
  on('ui.panes', () => ({ value: panes }) as never)
  on('ui.open', (_$, e) => {
    const { id, title } = e as { id: string; title?: string }
    panes = [...panes.filter(p => p.id !== id), { id, title: title ?? '' }]
    return { value: { isPlaced: true } } as never
  })
  on('ui.close', (_$, e) => {
    panes = panes.filter(p => p.id !== (e as { id: string }).id)
    return { value: undefined } as never
  })
  on('fs.read', (_$, e) => {
    const path = (e as { path: string }).path.replace(/\\/g, '/')
    const hit = Object.keys(files).find(k => path.endsWith(k))
    if (hit === undefined) throw new Error(`ENOENT: ${path}`)
    return { value: files[hit] } as never
  })
  on('tool.call', { tool: 'TodoWrite' }, () => ({ result: { oldTodos: [], newTodos: [] } }) as never)
  let lastId = 0
  on('tool.call', { tool: 'TaskCreate' }, () => ({ result: { task: { id: String(++lastId), subject: '' } } }) as never)
  on('tool.call', { tool: 'TaskUpdate' }, (_$, e) => ({ result: { success: true, taskId: (e as { taskId: string }).taskId, updatedFields: [] } }) as never)
  on('tool.call', { tool: 'Skill' }, (_$, e) => ({ result: { success: true, commandName: (e as { skill: string }).skill } }) as never)
  on('tool.call', { tool: 'Write' }, () => ({ result: {} }) as never)
  on('tool.call', { tool: 'Edit' }, () => ({ result: {} }) as never)
  let bashAnswers: Record<string, unknown> = {}
  on('tool.call', { tool: 'Bash' }, (_$, e) => (bashAnswers[(e as { command: string }).command] ?? { result: { stdout: '', stderr: '', interrupted: false } }) as never)
  on('prompt.submit', (_$, e) => ({ text: e.text }) as never)
  on('command.run', () => ({ text: '' }) as never)
  on('skill.prompt', (_$, e) => ({ text: (e as { text?: string }).text ?? '' }) as never)
  on('agent.spawn', (_$, e) => ({ model: 'claude-opus-5-5', agentId: `ag-${e.tool_use_id}` }) as never)
  on('turn.complete', () => ({ text: '' }) as never)
  return {
    clock,
    panes: () => panes,
    // What the Bash tool answers for that command from now on.
    answerBash: (command: string, answer: unknown) => {
      bashAnswers = { ...bashAnswers, [command]: answer }
    },
  }
}

// The band above the prompt as text: the terminal's Text runs joined, or the
// desktop row's SVG source; null when the mod draws nothing there.
export async function band($: Engine, surface: Surface): Promise<string | null> {
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

const by = (agentId?: string) => (agentId ? { agentId } : {})

export const todoWrite = ($: Engine, todos: unknown[], agentId?: string) =>
  $.tool.call({ tool: 'TodoWrite', todos, ...by(agentId) } as never)
export const taskCreate = ($: Engine, subject: string, activeForm?: string, agentId?: string) =>
  $.tool.call({ tool: 'TaskCreate', subject, description: subject, ...(activeForm ? { activeForm } : {}), ...by(agentId) } as never)
export const taskUpdate = ($: Engine, taskId: string, fields: Record<string, unknown>) =>
  $.tool.call({ tool: 'TaskUpdate', taskId, ...fields } as never)
export const skill = ($: Engine, name: string, args?: string, agentId?: string) =>
  $.tool.call({ tool: 'Skill', skill: name, ...(args ? { args } : {}), ...by(agentId) } as never)
export const write = ($: Engine, file_path: string, content = '', agentId?: string) =>
  $.tool.call({ tool: 'Write', file_path, content, ...by(agentId) } as never)
export const bash = ($: Engine, command: string, agentId?: string, extra: Record<string, unknown> = {}) =>
  $.tool.call({ tool: 'Bash', command, ...extra, ...by(agentId) } as never)
export const spawn = ($: Engine, id: string, description = `Job ${id}`) =>
  $.agent.spawn({
    tool_use_id: id,
    prompt: 'p',
    description,
    subagentType: 'general-purpose',
    provider: 'engine',
    parentModel: 'claude-opus-5-5',
    background: false,
    fork: false,
  } as never)
export const finish = ($: Engine, id: string) =>
  ($.turn.complete as (e: unknown) => Promise<unknown>)({ agentId: `ag-${id}`, reason: 'answer', answer: 'ok', usage: null })
export const endTurn = ($: Engine, reason = 'answer') =>
  ($.turn.complete as (e: unknown) => Promise<unknown>)({ reason, answer: 'ok', usage: null })
export const submit = ($: Engine, text: string, extra: Record<string, unknown> = {}) =>
  ($.prompt.submit as (e: unknown) => Promise<unknown>)({ text, wait: false, origin: { kind: 'composer' }, ...extra })

// A slash command the user typed: prompt.submit, then, for a skill, the engine
// expanding it (skill.prompt). `promptName`/`pluginName` spell the skill the way skill.prompt may.
export const slash = async (
  $: Engine,
  name: string,
  args = '',
  o: { isSkill?: boolean; promptName?: string; pluginName?: string; extra?: Record<string, unknown> } = {},
) => {
  await submit($, `/${name}${args ? ` ${args}` : ''}`, { command: { name, args }, ...o.extra })
  if (o.isSkill === false) return
  await ($.skill.prompt as (e: unknown) => Promise<unknown>)({ skill: o.promptName ?? name, text: '', ...(o.pluginName ? { pluginName: o.pluginName } : {}) })
}
