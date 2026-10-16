import type { Stage } from '../types'

export type Lang = 'en' | 'ko'

const en = {
  stage: { brainstorm: 'Brainstorm', spec: 'Spec', plan: 'Plan', build: 'Build', review: 'Review', finish: 'Finish' } as Record<Stage, string>,
  done: 'Done',
  tasks: 'Tasks',
  agents: 'Agents',
  tests: 'tests',
  subagents: 'Subagents',
  superpowers: 'superpowers',
  pane: 'Agents',
  cost: 'Cost',
  tokens: 'Tokens',
  time: 'Time',
  collapse: 'Collapse',
  expand: 'Expand',
  running: 'Running',
  finished: 'Finished',
  empty: 'No subagents yet.',
  failed: 'error',
  tokensWord: 'tokens',
  ctx: 'ctx',
  isRunning: 'running',
  isFinished: 'finished',
  opened: 'Agents panel opened.',
  closed: 'Agents panel closed.',
}

export type Strings = typeof en

const ko: Strings = {
  stage: { brainstorm: '브레인스토밍', spec: '스펙', plan: '계획', build: '구현', review: '리뷰', finish: '마무리' },
  done: '완료',
  tasks: '작업',
  agents: '에이전트',
  tests: '테스트',
  subagents: '서브에이전트',
  superpowers: 'superpowers',
  pane: '에이전트',
  cost: '비용',
  tokens: '토큰',
  time: '시간',
  collapse: '접기',
  expand: '펼치기',
  running: '실행 중',
  finished: '끝남',
  empty: '아직 서브에이전트가 없습니다.',
  failed: '오류',
  tokensWord: '토큰',
  ctx: 'ctx',
  isRunning: '실행 중',
  isFinished: '끝남',
  opened: '에이전트 패널을 열었습니다.',
  closed: '에이전트 패널을 닫았습니다.',
}

export const STRINGS: Record<Lang, Strings> = { en, ko }

export const langOf = (v: unknown): Lang => (typeof v === 'string' && /^(ko|korean|한국)/i.test(v.trim()) ? 'ko' : 'en')
