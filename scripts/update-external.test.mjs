import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseTags, newestRelease, pin, externals, repinNotice } from './update-external.mjs'

const A = 'a'.repeat(40)
const B = 'b'.repeat(40)
const C = 'c'.repeat(40)
const D = 'd'.repeat(40)

test('parseTags takes the commit an annotated tag points at', () => {
  const out = `${A}\trefs/tags/v0.7.1\n${B}\trefs/tags/v0.7.1^{}\n${C}\trefs/tags/v0.6.0\n`
  assert.deepEqual(parseTags(out), { 'v0.7.1': B, 'v0.6.0': C })
})

test('newestRelease compares versions as numbers and skips prereleases', () => {
  const tags = { 'v0.9.0': A, 'v0.10.0': B, 'v0.11.0-rc.1': C, 'latest': D }
  assert.deepEqual(newestRelease(tags), { ref: 'v0.10.0', sha: B })
})

test('newestRelease is null without a release tag', () => {
  assert.equal(newestRelease({ nightly: A }), null)
})

const market = () => ({
  name: 'cc-mods',
  plugins: [
    { name: 'work-band', source: './mods/work-band' },
    { name: 'filetree', source: { source: 'github', repo: 'o/filetree', ref: 'v0.8.0', sha: A } },
  ],
})

test('externals lists only github sources', () => {
  assert.deepEqual(externals(market()).map(p => p.name), ['filetree'])
})

test('pin moves ref and sha to the release and reports the old pin', () => {
  const m = market()
  const r = pin(m, 'filetree', { ref: 'v0.9.0', sha: B })
  assert.equal(r.changed, true)
  assert.deepEqual(r.old, { ref: 'v0.8.0', sha: A })
  assert.deepEqual(m.plugins[1].source, { source: 'github', repo: 'o/filetree', ref: 'v0.9.0', sha: B })
})

test('pin leaves an up-to-date entry alone', () => {
  const m = market()
  assert.equal(pin(m, 'filetree', { ref: 'v0.8.0', sha: A }).changed, false)
})

test('pin refuses a local mod and an unknown name', () => {
  assert.throws(() => pin(market(), 'work-band', { ref: 'v1.0.0', sha: B }), /not a github source/)
  assert.throws(() => pin(market(), 'nope', { ref: 'v1.0.0', sha: B }), /no plugin named/)
})

test('repinNotice rewrites the pin on that repo row only', () => {
  const text = [
    `| \`other@cc-mods\` | https://github.com/o/other | MIT | \`v0.8.0\` | \`${A}\` |`,
    `| \`filetree@cc-mods\` | https://github.com/o/filetree | MIT | \`v0.8.0\` | \`${A}\` |`,
  ].join('\n')
  const out = repinNotice(text, 'o/filetree', { ref: 'v0.8.0', sha: A }, { ref: 'v0.9.0', sha: B })
  assert.equal(out.split('\n')[0], text.split('\n')[0])
  assert.equal(out.split('\n')[1], `| \`filetree@cc-mods\` | https://github.com/o/filetree | MIT | \`v0.9.0\` | \`${B}\` |`)
})

test('repinNotice is null when no row names the repo', () => {
  assert.equal(repinNotice('nothing here', 'o/filetree', { ref: 'v0.8.0', sha: A }, { ref: 'v0.9.0', sha: B }), null)
})
