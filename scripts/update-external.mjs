#!/usr/bin/env node
// Pin each mod this marketplace takes from another GitHub repo to that repo's
// newest release tag (vX.Y.Z) and the commit it points at.
//
//   node scripts/update-external.mjs            every external mod
//   node scripts/update-external.mjs filetree   one mod
//   node scripts/update-external.mjs --check    report only, change nothing
//
// It rewrites the pin in marketplace.json and on the repo's row of
// THIRD_PARTY_NOTICES.md, and prints a compare link for each change, so you
// can read what the new release changed before you commit and push it.
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const RELEASE = /^v(\d+)\.(\d+)\.(\d+)$/

// `git ls-remote --tags` output to { tag: commit sha }. An annotated tag lists
// its own object and then `tag^{}` for the commit; the commit wins.
export function parseTags(out) {
  const tags = {}
  for (const line of out.split(/\r?\n/)) {
    const m = line.match(/^([0-9a-f]{40})\trefs\/tags\/(.+?)(\^\{\})?$/)
    if (!m) continue
    if (m[3] || !(m[2] in tags)) tags[m[2]] = m[1]
  }
  return tags
}

// The highest vX.Y.Z tag, or null. Prereleases and other names are skipped.
export function newestRelease(tags) {
  let best = null
  for (const [ref, sha] of Object.entries(tags)) {
    const m = ref.match(RELEASE)
    if (!m) continue
    const v = m.slice(1).map(Number)
    if (!best || compare(v, best.v) > 0) best = { ref, sha, v }
  }
  return best && { ref: best.ref, sha: best.sha }
}

function compare(a, b) {
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] - b[i]
  return 0
}

export function externals(marketplace) {
  return marketplace.plugins.filter(p => typeof p.source === 'object' && p.source.source === 'github')
}

// Move one entry's ref and sha to `release`, in place.
export function pin(marketplace, name, release) {
  const entry = marketplace.plugins.find(p => p.name === name)
  if (!entry) throw new Error(`no plugin named ${name} in marketplace.json`)
  if (!externals(marketplace).includes(entry)) throw new Error(`${name} is not a github source`)
  const old = { ref: entry.source.ref, sha: entry.source.sha }
  const changed = old.ref !== release.ref || old.sha !== release.sha
  if (changed) Object.assign(entry.source, release)
  return { changed, old }
}

// THIRD_PARTY_NOTICES.md with the pin on `repo`'s row moved from `old` to
// `next`; null when no row names the repo.
export function repinNotice(text, repo, old, next) {
  let found = false
  const lines = text.split('\n').map(line => {
    if (!line.startsWith('|') || !line.includes(`github.com/${repo} `)) return line
    found = true
    return line.replace(`\`${old.ref}\``, `\`${next.ref}\``).replace(`\`${old.sha}\``, `\`${next.sha}\``)
  })
  return found ? lines.join('\n') : null
}

function main(argv) {
  const check = argv.includes('--check')
  const names = argv.filter(a => !a.startsWith('--'))
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
  const file = path.join(root, '.claude-plugin', 'marketplace.json')
  const marketplace = JSON.parse(readFileSync(file, 'utf8'))
  const noticesFile = path.join(root, 'THIRD_PARTY_NOTICES.md')
  let notices = readFileSync(noticesFile, 'utf8')
  const targets = names.length ? names : externals(marketplace).map(p => p.name)
  let changes = 0

  for (const name of targets) {
    const entry = marketplace.plugins.find(p => p.name === name)
    const repo = entry?.source?.repo
    if (!repo) throw new Error(`${name} is not a github source in marketplace.json`)
    const out = execFileSync('git', ['ls-remote', '--tags', `https://github.com/${repo}.git`], { encoding: 'utf8' })
    const release = newestRelease(parseTags(out))
    if (!release) {
      console.log(`${name}: ${repo} has no vX.Y.Z tag; left as is`)
      continue
    }
    const { changed, old } = pin(marketplace, name, release)
    if (!changed) {
      console.log(`${name}: up to date at ${release.ref}`)
      continue
    }
    changes++
    console.log(`${name}: ${old.ref ?? '(none)'} -> ${release.ref}`)
    console.log(`  review: https://github.com/${repo}/compare/${old.sha ?? old.ref}...${release.sha}`)
    const repinned = repinNotice(notices, repo, old, release)
    if (repinned === null) console.log(`  THIRD_PARTY_NOTICES.md has no row for ${repo}; add one by hand`)
    else notices = repinned
  }

  if (!changes) return
  if (check) {
    console.log('--check: marketplace.json not changed')
    process.exitCode = 1
    return
  }
  writeFileSync(file, JSON.stringify(marketplace, null, 2) + '\n')
  writeFileSync(noticesFile, notices)
  console.log('marketplace.json and THIRD_PARTY_NOTICES.md updated; validating...')
  // The shell finds an npm `claude.cmd` on Windows; the quotes keep a path with spaces whole.
  const win = process.platform === 'win32'
  execFileSync('claude', ['plugin', 'validate', win ? `"${root}"` : root], { stdio: 'inherit', shell: win })
  console.log('Read the review links, then commit and push. Installs pick it up through auto-update.')
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main(process.argv.slice(2))
  } catch (err) {
    console.error(err.message)
    process.exitCode = 1
  }
}
