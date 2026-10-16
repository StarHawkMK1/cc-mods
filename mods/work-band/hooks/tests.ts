// Is a Bash command a test run, and did it pass? From the exit code where it is
// the test's own, else from the summary the runner printed.

export type Verdict = 'pass' | 'fail'

export const TEST_COMMANDS: readonly string[] = [
  'npm test', 'npm run test', 'npm t', 'pnpm test', 'pnpm run test', 'yarn test', 'bun test', 'bun run test',
  'vitest', 'jest', 'mocha', 'playwright test', 'deno test',
  'pytest', 'python -m pytest', 'python3 -m pytest', 'py.test', 'tox',
  'cargo test', 'cargo nextest', 'go test', 'dotnet test', 'swift test', 'ctest', 'make test',
  'mvn test', 'gradle test', './gradlew test', 'rspec', 'rake test', 'phpunit', 'mix test',
  'claude plugin test',
]

// A comma-separated setting: its trimmed, non-empty entries.
export const parseList = (v: unknown): string[] =>
  typeof v === 'string' ? v.split(',').map(s => s.trim()).filter(Boolean) : []

export type Piece = { text: string; next: string }

// The command cut at &&, ||, ; and |; `next` is the operator after each piece ('' for the last).
export const piecesOf = (command: string): Piece[] => {
  const parts = command.split(/(&&|\|\||;|\|)/)
  const out: Piece[] = []
  for (let i = 0; i < parts.length; i += 2) out.push({ text: parts[i] ?? '', next: parts[i + 1] ?? '' })
  return out
}

const ENV = /^[A-Za-z_][A-Za-z0-9_]*=\S*\s+/
const RUNNER = /^(?:npx|bunx|pnpm\s+(?:exec|dlx)|uv\s+run|poetry\s+run|bundle\s+exec)\s+/

// A piece without what runs before the command itself: `cd dir`, `VAR=value`, a runner.
export const bareOf = (piece: string): string => {
  let s = piece.trim().replace(/\s+/g, ' ')
  if (/^cd(\s|$)/.test(s)) return ''
  for (let prev = ''; prev !== s; ) {
    prev = s
    s = s.replace(ENV, '').replace(RUNNER, '')
  }
  return s
}

// The piece starts with a test command, word for word.
export const isTestRun = (piece: string, extra: readonly string[] = []): boolean => {
  const s = bareOf(piece).toLowerCase()
  if (!s) return false
  return [...TEST_COMMANDS, ...extra].some(p => {
    const q = p.trim().toLowerCase()
    return !!q && (s === q || s.startsWith(`${q} `))
  })
}

// Failure first: a failed count, a FAIL at a line's head (go, jest), "Tests failed".
const FAILED = [/\b[1-9]\d*\s+(?:failed|failing|failures?|fail)\b/i, /^\s*(?:FAIL|FAILED)\b/m, /^--- FAIL:/m, /\btests failed\b/i]
const PASSED = [/\b\d+\s+(?:passed|pass)\b/i, /^ok\s/m, /\btests passed\b/i, /\b0\s+failed\b/i]

export const verdictOf = (output: string): Verdict | null =>
  FAILED.some(r => r.test(output)) ? 'fail' : PASSED.some(r => r.test(output)) ? 'pass' : null

export type BashCall = { command?: unknown; run_in_background?: unknown }
export type BashAnswer = { deny?: string; isError?: boolean; result?: unknown; text?: string }

// What the command printed: an errored call's text, or the record's stdout and stderr, and what the model read.
const outputOf = (r: BashAnswer): string => {
  const res = r.result
  const parts: unknown[] =
    typeof res === 'string' ? [res] : res && typeof res === 'object' ? [(res as { stdout?: unknown }).stdout, (res as { stderr?: unknown }).stderr] : []
  return [...parts, r.text].filter((p): p is string => typeof p === 'string').join('\n')
}

// 'pass' or 'fail' for a test run that finished in the foreground; null for anything else.
export const testVerdict = (call: BashCall, r: BashAnswer, extra: readonly string[] = []): Verdict | null => {
  if (r.deny !== undefined || call.run_in_background === true || typeof call.command !== 'string') return null
  const res = (r.result && typeof r.result === 'object' ? r.result : {}) as { interrupted?: unknown; backgroundTaskId?: unknown; timedOutAfterMs?: unknown }
  if (res.interrupted === true || res.backgroundTaskId || res.timedOutAfterMs) return null
  const pieces = piecesOf(call.command)
  let at = -1
  pieces.forEach((p, i) => {
    if (isTestRun(p.text, extra)) at = i
  })
  if (at < 0) return null
  // `a && b` stops at a failure, so the exit code is still the test's; `|`, `;` and `||` hide it.
  const isOwnExit = pieces.slice(at).every(p => p.next === '' || p.next === '&&')
  return isOwnExit ? (r.isError ? 'fail' : 'pass') : verdictOf(outputOf(r))
}
