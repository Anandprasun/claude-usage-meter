// Tests for macos-menubar/claude-usage.2m.js (the logic; the JXA I/O needs a Mac).
// Run: node --test tests/*.test.js
const test = require('node:test')
const assert = require('node:assert/strict')
const { execFileSync } = require('node:child_process')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const m = require('../macos-menubar/claude-usage.2m.js')

const H = 3600e3
const NOW = Date.UTC(2026, 9, 22, 6, 0, 0)
const iso = ms => new Date(ms).toISOString()

const usage = (s, w) => ({
  five_hour: { utilization: s, resets_at: iso(NOW + 3 * H) },
  seven_day: { utilization: w, resets_at: iso(NOW + 120 * H) },
  seven_day_opus: null,
  seven_day_oauth_apps: { utilization: 3 },
})

test('parses the flat and limits-array formats', () => {
  assert.deepEqual(m.normalizeUsage(usage(42, 18)).map(w => [w.key, w.pct]), [['session', 42], ['weekly', 18]])
  const arr = m.normalizeUsage({ limits: [
    { kind: 'session', percent: 20, resets_at: iso(NOW + 4 * H) },
    { kind: 'weekly_all', percent: 50 },
    { kind: 'weekly_scoped', percent: 70, scope: { model: { display_name: 'Opus' } } },
  ] })
  assert.deepEqual(arr.map(w => w.label), ['Session', 'Week', 'Week · Opus'])
  assert.deepEqual(m.normalizeUsage(null), [])
})

test('menu bar title and dropdown, calm', () => {
  const out = m.render(m.normalizeUsage(usage(12, 18)), NOW)
  const lines = out.split('\n')
  assert.equal(lines[0], '12% · 18% | sfimage=gauge.with.needle')
  assert.ok(out.includes('Session  12%   resets in 3h 00m | size=13'))
  assert.ok(out.includes('Open usage page | href=https://claude.ai/settings/usage'))
  assert.ok(!out.includes('⚠'))
})

test('menu bar warns when ahead of pace and colours by level', () => {
  // 60% used, 40% of the window gone -> limit in 1h20m, before the 3h reset
  const out = m.render(m.normalizeUsage(usage(60, 18)), NOW)
  assert.match(out.split('\n')[0], /^60% · 18% ⚠ \| sfimage=gauge\.with\.needle color=/)
  assert.ok(out.includes('⚠ At this rate you hit the limit in ~1h 20m'))
  const red = m.render(m.normalizeUsage(usage(95, 18)), NOW)
  assert.match(red.split('\n')[0], /color=#d93025/)
})

test('alerts fire once per threshold per window', () => {
  const w1 = m.normalizeUsage(usage(80, 18))
  const a = m.alertsFor(w1, [], NOW)
  assert.ok(a.notes.some(n => n.title === 'Claude session usage at 80%'))
  const b = m.alertsFor(m.normalizeUsage(usage(82, 18)), a.alerted, NOW)
  assert.equal(b.notes.filter(n => /usage at/.test(n.title)).length, 0)
  const c = m.alertsFor(m.normalizeUsage(usage(91, 18)), b.alerted, NOW)
  assert.deepEqual(c.notes.map(n => n.title), ['Claude session usage at 91%'])
})

test('problem view has a dash title and refresh', () => {
  const out = m.renderProblem('Claude login expired', 'Open Claude Code once')
  assert.equal(out.split('\n')[0], '– | sfimage=gauge.with.needle')
  assert.ok(out.includes('Refresh | refresh=true'))
})

test('fetch pipeline: token never appears in output, args or the response handling', { skip: process.platform === 'win32' }, () => {
  // Fake `security`, `plutil` and `curl` on PATH and check what curl is handed.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cum-'))
  const bin = path.join(dir, 'bin')
  fs.mkdirSync(bin)
  const w = (name, body) => { fs.writeFileSync(path.join(bin, name), '#!/bin/sh\n' + body); fs.chmodSync(path.join(bin, name), 0o755) }
  w('security', `echo '{"claudeAiOauth":{"accessToken":"SECRET123"}}'`)
  w('plutil', `cat >/dev/null; printf SECRET123`)
  w('curl', `echo "ARGS:$*" > "${dir}/args"; cat > "${dir}/stdin"; printf '{"five_hour":{"utilization":5}}\\n200'`)
  const script = m.FETCH.replace(/\/usr\/bin\//g, '')
  const out = execFileSync('/bin/sh', ['-c', script], { env: { PATH: bin + ':/usr/bin:/bin', HOME: dir }, encoding: 'utf8' })
  assert.equal(out, '{"five_hour":{"utilization":5}}\n200')
  assert.ok(!fs.readFileSync(path.join(dir, 'args'), 'utf8').includes('SECRET123'), 'token must not be a curl argument')
  assert.equal(fs.readFileSync(path.join(dir, 'stdin'), 'utf8'), 'Authorization: Bearer SECRET123\n')
  fs.rmSync(dir, { recursive: true, force: true })
})

test('fetch pipeline reports NOLOGIN when nothing is signed in', { skip: process.platform === 'win32' }, () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cum-'))
  const bin = path.join(dir, 'bin')
  fs.mkdirSync(bin)
  fs.writeFileSync(path.join(bin, 'security'), '#!/bin/sh\nexit 44\n'); fs.chmodSync(path.join(bin, 'security'), 0o755)
  const script = m.FETCH.replace(/\/usr\/bin\//g, '')
  const out = execFileSync('/bin/sh', ['-c', script], { env: { PATH: bin + ':/usr/bin:/bin', HOME: dir }, encoding: 'utf8' })
  assert.equal(out.trim(), 'NOLOGIN')
  fs.rmSync(dir, { recursive: true, force: true })
})
