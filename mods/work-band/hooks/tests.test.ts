import { expect, test } from 'claude-code/testing'

import { bareOf, isTestRun, parseList, piecesOf, testVerdict, verdictOf } from './tests'

const ok = (stdout = '', stderr = '') => ({ result: { stdout, stderr, interrupted: false } })
const err = (text: string) => ({ isError: true, result: text })

test('parseList keeps the trimmed, non-empty entries', () => {
  expect(parseList(' just test, ,./run.sh ')).toEqual(['just test', './run.sh'])
  expect(parseList(undefined)).toEqual([])
})

test('piecesOf keeps the operator after each piece', () => {
  expect(piecesOf('cd x && npm test 2>&1 | tail -5; echo hi || true')).toEqual([
    { text: 'cd x ', next: '&&' },
    { text: ' npm test 2>&1 ', next: '|' },
    { text: ' tail -5', next: ';' },
    { text: ' echo hi ', next: '||' },
    { text: ' true', next: '' },
  ])
})

test('bareOf drops cd, variables and runners', () => {
  expect(bareOf('  cd "C:\\a b" ')).toBe('')
  expect(bareOf('CI=1 NODE_ENV=test npx vitest run')).toBe('vitest run')
  expect(bareOf('uv run pytest -q')).toBe('pytest -q')
  expect(bareOf('pnpm exec jest')).toBe('jest')
})

test('isTestRun knows test commands by whole words', () => {
  for (const c of ['npm test', 'npm run test -- --watch=false', 'pytest -q', 'python -m pytest tests', 'go test ./...', 'cargo test', 'claude plugin test ./mods/work-band', './gradlew test', 'bun test'])
    expect(isTestRun(c)).toBe(true)
  for (const c of ['npm install', 'go testing', 'pytestx', 'echo npm test', 'git commit -m test']) expect(isTestRun(c)).toBe(false)
  expect(isTestRun('just test --all', ['just test'])).toBe(true)
})

test('verdictOf reads a runner’s summary', () => {
  expect(verdictOf('Tests: 1 failed, 4 passed')).toBe('fail')
  expect(verdictOf('=== 5 passed in 0.12s ===')).toBe('pass')
  expect(verdictOf(' 78 pass\n 0 fail\nRan 78 tests')).toBe('pass')
  expect(verdictOf('FAIL\tgithub.com/x/y\t0.1s')).toBe('fail')
  expect(verdictOf('--- FAIL: TestLogin (0.00s)')).toBe('fail')
  expect(verdictOf('ok  \tgithub.com/x/y\t0.1s')).toBe('pass')
  expect(verdictOf('test result: ok. 3 passed; 0 failed')).toBe('pass')
  expect(verdictOf('(pass) handles FAIL lines [1ms]\n 1 pass\n 0 fail')).toBe('pass')
  expect(verdictOf('done')).toBeNull()
})

test('testVerdict trusts the exit code only when it is the test’s own', () => {
  expect(testVerdict({ command: 'npm test' }, err('Exit code 1'))).toBe('fail')
  expect(testVerdict({ command: 'npm test' }, ok('nothing'))).toBe('pass')
  expect(testVerdict({ command: 'cd "C:\\a b" && npm test && echo ok' }, ok())).toBe('pass')
  expect(testVerdict({ command: 'cd "C:\\a b" && npm test' }, err('Exit code 1'))).toBe('fail')
  expect(testVerdict({ command: 'npm test | tail -3' }, ok(' 3 failed'))).toBe('fail')
  expect(testVerdict({ command: 'npm test 2>&1 | tail -3' }, ok(' 78 pass\n 0 fail'))).toBe('pass')
  expect(testVerdict({ command: 'npm test; echo done' }, ok('done'))).toBeNull()
  expect(testVerdict({ command: 'go test ./... || true' }, ok('FAIL\tpkg/a\t0.1s'))).toBe('fail')
  // bun prints its summary on stderr, which a pipe of stdout leaves alone.
  expect(testVerdict({ command: 'bun test | tail -1' }, ok('', ' 2 fail'))).toBe('fail')
})

test('a newline or a background & ends a piece; a line continuation does not', () => {
  expect(piecesOf('cd x\nnpm test').map(p => p.next)).toEqual(['\n', ''])
  expect(piecesOf('npm test \\\n  --ci\n').length).toBe(1)
  expect(piecesOf('npm test 2>&1 &> log >&2 |& cat').map(p => p.next)).toEqual(['|&', ''])
  expect(piecesOf('npm test & echo hi').map(p => p.next)).toEqual(['&', ''])
  expect(testVerdict({ command: 'npm test\necho done' }, ok(' 3 failed\ndone'))).toBe('fail')
  expect(testVerdict({ command: 'npm test\necho done' }, ok('done'))).toBeNull()
  expect(testVerdict({ command: 'npm test\r\necho done' }, ok('done'))).toBeNull()
  expect(testVerdict({ command: 'cd x\nnpm test' }, err('Exit code 1'))).toBe('fail')
  expect(testVerdict({ command: 'npm test \\\n  --ci' }, err('Exit code 1'))).toBe('fail')
  expect(testVerdict({ command: 'npm test\n' }, err('Exit code 1'))).toBe('fail')
  // A line ending in an operator goes on to the next.
  expect(testVerdict({ command: 'npm test &&\necho done' }, err('Exit code 1'))).toBe('fail')
  expect(testVerdict({ command: 'npm test &&\n  echo done' }, ok('done'))).toBe('pass')
  expect(testVerdict({ command: 'cd x &&\nnpm test' }, err('Exit code 1'))).toBe('fail')
  expect(testVerdict({ command: 'npm test |\ntail -1' }, ok(' 2 failed'))).toBe('fail')
  expect(piecesOf('npm test 0<&3').length).toBe(1)
  expect(testVerdict({ command: 'npm test &' }, ok())).toBeNull()
  expect(testVerdict({ command: 'npm test & wait' }, ok(' 2 failed'))).toBe('fail')
  expect(testVerdict({ command: 'npm test &> log' }, err('Exit code 1'))).toBe('fail')
  expect(testVerdict({ command: 'npm test 2>&1' }, ok())).toBe('pass')
})

test('testVerdict leaves out what did not run to the end in the foreground', () => {
  expect(testVerdict({ command: 'npm test' }, { deny: 'no' })).toBeNull()
  expect(testVerdict({ command: 'npm test', run_in_background: true }, ok())).toBeNull()
  expect(testVerdict({ command: 'npm test' }, { result: { stdout: '', stderr: '', interrupted: true } })).toBeNull()
  expect(testVerdict({ command: 'npm test' }, { result: { stdout: '', stderr: '', interrupted: false, backgroundTaskId: 'b1' } })).toBeNull()
  expect(testVerdict({ command: 'npm test' }, { result: { stdout: '', stderr: '', interrupted: false, timedOutAfterMs: 120_000 } })).toBeNull()
  expect(testVerdict({ command: 'npm install' }, err('x'))).toBeNull()
  expect(testVerdict({}, ok())).toBeNull()
})
