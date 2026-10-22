#!/usr/bin/osascript -l JavaScript
// SPDX-License-Identifier: MIT
//
// <xbar.title>Claude Usage Meter</xbar.title>
// <xbar.version>v1.0.0</xbar.version>
// <xbar.author>Prasun Anand</xbar.author>
// <xbar.desc>Claude plan usage (session and weekly %) in the menu bar, with a pace warning.</xbar.desc>
// <xbar.abouturl>https://github.com/Anandprasun/claude-usage-meter</xbar.abouturl>
// <swiftbar.hideRunInTerminal>true</swiftbar.hideRunInTerminal>
// <swiftbar.hideDisablePlugin>false</swiftbar.hideDisablePlugin>
//
// A SwiftBar / xbar plugin. Runs on macOS's built-in JavaScript (JXA): nothing to
// install besides SwiftBar. The "2m" in the file name means it refreshes every
// 2 minutes; rename it (e.g. .1m.) to change that.
//
// It reads your usage with the login Claude Code already keeps on this Mac
// (Keychain item "Claude Code-credentials", or ~/.claude/.credentials.json).
// The token stays inside the shell pipeline below: it is never printed, stored
// or passed to this script. The usage endpoint is undocumented and may change.

const WARN_AT = 75
const ALERT_AT = 90
const HOUR = 3600e3
const WINDOW_MS = { session: 5 * HOUR, weekly: 7 * 24 * HOUR }
const USAGE_PAGE = 'https://claude.ai/settings/usage'

// ---- parsing (shared shape with the extension) -------------------------------

function toPct(v) {
  const n = Number(v)
  return v == null || !isFinite(n) ? null : Math.max(0, Math.min(100, n))
}

function toTime(v) {
  if (v == null || v === '') return null
  if (typeof v === 'number') return v < 1e12 ? v * 1000 : v
  const t = Date.parse(v)
  return isNaN(t) ? null : t
}

function normalizeUsage(raw) {
  const out = []
  if (!raw || typeof raw !== 'object') return out
  if (Array.isArray(raw.limits) && raw.limits.length) {
    for (const l of raw.limits) {
      const pct = toPct(l.percent != null ? l.percent : l.utilization)
      if (pct == null) continue
      const resetsAt = toTime(l.resets_at)
      if (l.kind === 'session') out.push({ key: 'session', label: 'Session', pct, resetsAt, windowMs: WINDOW_MS.session })
      else if (l.kind === 'weekly_all') out.push({ key: 'weekly', label: 'Week', pct, resetsAt, windowMs: WINDOW_MS.weekly })
      else if (l.kind === 'weekly_scoped') {
        const m = (l.scope && l.scope.model && l.scope.model.display_name) || 'model'
        out.push({ key: 'weekly_' + m.toLowerCase(), label: 'Week · ' + m, pct, resetsAt, windowMs: WINDOW_MS.weekly })
      }
    }
    if (out.length) return out
  }
  const flat = (o, key, label, windowMs) => {
    if (!o || typeof o !== 'object') return
    const pct = toPct(o.utilization != null ? o.utilization : o.percent)
    if (pct != null) out.push({ key, label, pct, resetsAt: toTime(o.resets_at), windowMs })
  }
  flat(raw.five_hour, 'session', 'Session', WINDOW_MS.session)
  flat(raw.seven_day, 'weekly', 'Week', WINDOW_MS.weekly)
  for (const k of Object.keys(raw)) {
    if (/^seven_day_/.test(k) && !/oauth|cowork/.test(k)) {
      const name = k.slice(10).replace(/_/g, ' ')
      flat(raw[k], 'weekly_' + k.slice(10), 'Week · ' + name.charAt(0).toUpperCase() + name.slice(1), WINDOW_MS.weekly)
    }
  }
  return out
}

// ---- maths ---------------------------------------------------------------------

/** Milliseconds until 100% at the average rate so far, when that's before the reset. */
function msToLimit(w, now) {
  if (!w.windowMs || w.resetsAt == null || w.pct < 10 || w.pct >= 100) return null
  const left = w.resetsAt - now
  const elapsed = w.windowMs - left
  if (left <= 0 || elapsed <= w.windowMs * 0.02) return null
  const t = ((100 - w.pct) * elapsed) / w.pct
  return t < left ? t : null
}

function fmt(ms) {
  if (ms == null || !isFinite(ms)) return '?'
  if (ms <= 0) return 'now'
  const m = Math.round(ms / 60000)
  if (m < 60) return m + 'm'
  const h = Math.floor(m / 60)
  if (h < 48) return h + 'h ' + String(m % 60).padStart(2, '0') + 'm'
  return Math.floor(h / 24) + 'd ' + (h % 24) + 'h'
}

function bar(p, width) {
  width = width || 12
  const n = Math.max(0, Math.min(width, Math.round((p / 100) * width)))
  return '█'.repeat(n) + '░'.repeat(width - n)
}

function colorFor(w, now) {
  if (w.pct >= ALERT_AT) return '#d93025,#ff6b5e'
  if (w.pct >= WARN_AT || msToLimit(w, now) != null) return '#b06d00,#f9ab00'
  return null
}

// ---- output ----------------------------------------------------------------------

/** SwiftBar's menu text for a successful reading. */
function render(windows, now) {
  const session = windows.find(w => w.key === 'session') || windows[0]
  const weekly = windows.find(w => w.key === 'weekly')
  const worst = windows.reduce((a, b) => (b.pct > a.pct ? b : a), windows[0])
  const ahead = windows.some(w => msToLimit(w, now) != null)

  let title = Math.round(session.pct) + '%'
  if (weekly && weekly !== session) title += ' · ' + Math.round(weekly.pct) + '%'
  if (ahead) title += ' ⚠'
  const tc = colorFor(worst, now)
  const lines = [title + ' | sfimage=gauge.with.needle' + (tc ? ' color=' + tc : '')]

  lines.push('---')
  for (const w of windows) {
    const reset = w.resetsAt ? '   resets in ' + fmt(w.resetsAt - now) : ''
    const c = colorFor(w, now)
    lines.push(w.label + '  ' + Math.round(w.pct) + '%' + reset + ' | size=13' + (c ? ' color=' + c : ''))
    lines.push(bar(w.pct) + ' | font=Menlo size=11')
    const t = msToLimit(w, now)
    if (t != null) lines.push('⚠ At this rate you hit the limit in ~' + fmt(t) + ' | size=12 color=#b06d00,#f9ab00')
  }
  lines.push('---')
  lines.push('Open usage page | href=' + USAGE_PAGE)
  lines.push('Refresh | refresh=true')
  return lines.join('\n')
}

/** SwiftBar's menu text when there's no reading. */
function renderProblem(title, detail) {
  return [
    '– | sfimage=gauge.with.needle',
    '---',
    title,
    detail + ' | size=12',
    '---',
    'Open usage page | href=' + USAGE_PAGE,
    'Refresh | refresh=true',
  ].join('\n')
}

/** Which notifications to show now, and the updated set of ones already shown. */
function alertsFor(windows, alerted, now) {
  const done = new Set(alerted || [])
  const keep = []
  const notes = []
  for (const w of windows) {
    const period = w.key + ':' + (w.resetsAt || '?')
    for (const t of [WARN_AT, ALERT_AT]) {
      const id = period + ':' + t
      if (done.has(id)) keep.push(id)
      else if (w.pct >= t) {
        keep.push(id)
        notes.push({
          title: 'Claude ' + w.label.toLowerCase() + ' usage at ' + Math.round(w.pct) + '%',
          body: w.resetsAt ? 'Resets in ' + fmt(w.resetsAt - now) + '.' : '',
        })
      }
    }
    const paceId = period + ':pace'
    const t = msToLimit(w, now)
    if (done.has(paceId)) keep.push(paceId)
    else if (t != null && w.pct >= 25) {
      keep.push(paceId)
      notes.push({
        title: 'Burning Claude ' + w.label.toLowerCase() + ' usage fast',
        body: Math.round(w.pct) + '% used; at this rate you hit the limit in ~' + fmt(t) + '.',
      })
    }
  }
  return { notes, alerted: keep }
}

// ---- macOS side (JXA only) -----------------------------------------------------

// Reads the token and calls the endpoint in one shell pipeline, so the token never
// reaches this script, the process list or disk. Prints the body, then the HTTP code.
const FETCH = [
  "creds=$(/usr/bin/security find-generic-password -s 'Claude Code-credentials' -w 2>/dev/null || cat \"$HOME/.claude/.credentials.json\" 2>/dev/null)",
  'if [ -z "$creds" ]; then echo NOLOGIN; exit 0; fi',
  "tok=$(printf '%s' \"$creds\" | /usr/bin/plutil -extract claudeAiOauth.accessToken raw -o - - 2>/dev/null)",
  'if [ -z "$tok" ]; then echo NOLOGIN; exit 0; fi',
  "printf 'Authorization: Bearer %s\\n' \"$tok\" | /usr/bin/curl -sS -m 20 -H @- " +
    "-H 'anthropic-beta: oauth-2025-04-20' -H 'User-Agent: claude-usage-meter/1.0' " +
    "-w '\\n%{http_code}' https://api.anthropic.com/api/oauth/usage 2>&1",
].join('\n')

function sh(app, script) {
  // alteringLineEndings: false, or AppleScript turns every \n into \r.
  try { return app.doShellScript(script, { alteringLineEndings: false }).replace(/\n$/, '') } catch (e) { return 'ERROR ' + String(e.message || e) }
}

function shq(s) { return "'" + String(s).replace(/'/g, "'\\''") + "'" }

function run() {
  const app = Application.currentApplication()
  app.includeStandardAdditions = true
  const now = Date.now()

  const dir = sh(app, 'printf %s "${SWIFTBAR_PLUGIN_DATA_PATH:-$HOME/Library/Application Support/claude-usage-meter}"')
  const stateFile = dir + '/state.json'
  let state = {}
  try { state = JSON.parse(sh(app, 'cat ' + shq(stateFile) + ' 2>/dev/null || echo {}')) } catch (e) { state = {} }

  const res = sh(app, FETCH)
  if (res === 'NOLOGIN') {
    return renderProblem('Claude Code isn’t signed in on this Mac', 'Run `claude` in Terminal and sign in, then Refresh.')
  }
  const cut = res.lastIndexOf('\n')
  const code = cut >= 0 ? res.slice(cut + 1).trim() : ''
  const body = cut >= 0 ? res.slice(0, cut) : res
  if (code === '401' || code === '403') {
    return renderProblem('Claude login expired', 'Open Claude Code once (any session) to refresh it, then Refresh.')
  }
  let windows = []
  if (code === '200') { try { windows = normalizeUsage(JSON.parse(body)) } catch (e) { windows = [] } }
  if (!windows.length) {
    // Keep showing the last good reading if this one failed.
    if (state.windows && state.windows.length && now - (state.at || 0) < 30 * 60e3) {
      return render(state.windows, now) + '\nLast update failed; showing figures from ' + fmt(now - state.at) + ' ago | size=11'
    }
    return renderProblem('Couldn’t read usage', (code ? 'HTTP ' + code : 'No response') + '. Check your connection, then Refresh.')
  }

  const a = alertsFor(windows, state.alerted, now)
  for (const n of a.notes) {
    try { app.displayNotification(n.body, { withTitle: n.title, soundName: 'Glass' }) } catch (e) {}
  }
  const json = JSON.stringify({ windows, alerted: a.alerted, at: now })
  sh(app, 'mkdir -p ' + shq(dir) + ' && printf %s ' + shq(json) + ' > ' + shq(stateFile))
  return render(windows, now)
}

if (typeof module !== 'undefined') {
  module.exports = { normalizeUsage, msToLimit, fmt, render, renderProblem, alertsFor, FETCH }
}
