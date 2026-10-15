import type { EngineInterface, Register } from 'claude-code'

import { STRINGS, langOf, type Lang } from './i18n'

// Module scope is fine: session.start sets it on every (re)load.
let lang: Lang = 'en'
export const tr = () => STRINGS[lang]

async function detectLang($: EngineInterface, option: unknown): Promise<Lang> {
  if (option === 'en' || option === 'ko') return option
  try {
    const settings = (await $.settings.read()) as Record<string, unknown>
    if (typeof settings.language === 'string' && settings.language.trim()) return langOf(settings.language)
  } catch {
    // No settings: the locale decides.
  }
  const locale = (await $.env.get('LC_ALL')) || (await $.env.get('LC_MESSAGES')) || (await $.env.get('LANG'))
  return langOf(locale)
}

export const register: Register = (on, options) => {
  on('session.start', async ($, e, next) => {
    const started = await next(e)
    lang = await detectLang($, options.language)
    return started
  })
}
