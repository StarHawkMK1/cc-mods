import { expect, test } from 'claude-code/testing'
import type { Engine, On } from 'claude-code/testing'

const PLUGIN = 'token-weather'
const SURFACES = ['terminal', 'desktop'] as const
type Surface = (typeof SURFACES)[number]
// "Show in terminal" on, so these run the same on every surface; the default, off, is tested last.
const ON = { options: { terminal: 'on' } }
const BAND = { hasSurvey: false, isWorking: false, maxRows: 8, bodyColumns: 100, scroll: { offset: 0, bodyRows: 8 }, view: {} }

// Beneath the mod: a context reading, and either another mod's band or Claude Code's placeholder.
function world(on: On, other: string | null) {
  on('session.start', async () => ({ cwd: '/repo' }) as never)
  on('session.usage', () => ({ value: { startedAt: 0, context: { tokens: 68_200, window: 1_000_000, percent: 7 }, rateLimits: [] } }) as never)
  on('ui.render', { component: 'AbovePrompt' }, ($, e, next) => {
    if (other === null) return next(e)
    const { Text } = $.ui.resolve(e)
    return Text({ children: other }) as never
  })
}

const start = ($: Engine) => $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true } as never)

// The band's Text runs joined; null when the mod draws nothing there.
async function band($: Engine, surface: Surface, props: object = BAND): Promise<string | null> {
  try {
    const ui = await $.ui.mount({ plugin: PLUGIN, surface, component: 'AbovePrompt', props: props as never })
    const texts = await ui.findAll({ type: 'Text' })
    await ui.unmount()
    return texts.map(t => t.text).join(' | ')
  } catch (err) {
    if (/drew nothing/.test(String(err))) return null
    throw err
  }
}

for (const surface of SURFACES) {
  test(`${surface}: another mod's band draws beneath the forecast`, ON, async ($, on) => {
    world(on, 'OTHER BAND')
    await start($)
    const text = await band($, surface)
    expect(text).toContain('Clear')
    expect(text).toContain('OTHER BAND')
    expect(text!.indexOf('Clear')).toBeLessThan(text!.indexOf('OTHER BAND'))
  })

  test(`${surface}: alone, the forecast draws without the placeholder`, ON, async ($, on) => {
    world(on, null)
    await start($)
    expect(await band($, surface)).toContain('7% of context')
  })
}

test('a survey holds the band: the forecast steps aside', ON, async ($, on) => {
  world(on, 'OTHER BAND')
  await start($)
  const text = await band($, 'terminal', { ...BAND, hasSurvey: true })
  expect(text).not.toContain('Clear')
  expect(text).toContain('OTHER BAND')
})

test('a narrow band drops the chart', ON, async ($, on) => {
  world(on, null)
  await start($)
  expect(await band($, 'terminal', { ...BAND, bodyColumns: 50 })).not.toContain('last turns')
  expect(await band($, 'terminal')).toContain('last turns')
})

test('off (the default): the forecast stays off the terminal and draws on the desktop', async ($, on) => {
  world(on, 'OTHER BAND')
  await start($)
  const terminal = await band($, 'terminal')
  expect(terminal).not.toContain('Clear')
  expect(terminal).toContain('OTHER BAND')
  expect(await band($, 'desktop')).toContain('Clear')
})

test('enabled off: no forecast on any surface, other bands still draw', { options: { enabled: 'off', terminal: 'on' } }, async ($, on) => {
  world(on, 'OTHER BAND')
  await start($)
  for (const surface of SURFACES) {
    const text = await band($, surface)
    expect(text).not.toContain('Clear')
    expect(text).toContain('OTHER BAND')
  }
})
