// SPDX-License-Identifier: MIT
// Usage meter: live Claude plan usage inside Claude.
//
// - Status line under the prompt, always: "Session 61% (resets 3h 00m) · Week 18%"
// - A band above the prompt only when it matters: past the warn level, or on
//   pace to hit the limit before the window resets.
// - A toast at 75% and 90% of each window, and a native notification at 90%.
// - /usage-meter prints the full picture and brings the band back if hidden.
//
// The figures are pushed by the engine (`session.measure`), the same ones the
// status line gets; there is no polling and no unofficial endpoint.

import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, SessionRateLimit } from 'claude-code'

import type { Window } from '../types'

const WARN_AT = 75
const ALERT_AT = 90
const HOUR = 3600_000
const WINDOW_MS: Record<string, number> = { five_hour: 5 * HOUR, seven_day: 7 * 24 * HOUR }
const LABEL: Record<string, string> = { five_hour: 'Session', seven_day: 'Week', spend_limit: 'Spend' }

const windows = atom({ plugin: 'usage-meter', key: 'windows' } as const, [])
const isBandHidden = atom({ plugin: 'usage-meter', key: 'isBandHidden' } as const, false)
const alerted = atom({ plugin: 'usage-meter', key: 'alerted' } as const, [])

// ---- maths -------------------------------------------------------------------

export function toWindows(limits: readonly SessionRateLimit[]): Window[] {
  return limits
    .filter(l => typeof l.percentUsed === 'number' && isFinite(l.percentUsed))
    .map(l => {
      const t = l.resetsAt ? Date.parse(l.resetsAt) : NaN
      return { kind: l.kind, pct: Math.max(0, l.percentUsed), resetsAt: isNaN(t) ? null : t }
    })
}

/** Milliseconds until 100% at the average rate so far, when that's before the reset. */
export function msToLimit(w: Window, now: number): number | null {
  const len = WINDOW_MS[w.kind]
  if (!len || w.resetsAt == null || w.pct < 10 || w.pct >= 100) return null
  const left = w.resetsAt - now
  const elapsed = len - left
  if (left <= 0 || elapsed <= len * 0.02) return null
  const t = ((100 - w.pct) * elapsed) / w.pct
  return t < left ? t : null
}

export function fmt(ms: number | null): string {
  if (ms == null || !isFinite(ms)) return '?'
  if (ms <= 0) return 'now'
  const m = Math.round(ms / 60000)
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  if (h < 48) return `${h}h ${String(m % 60).padStart(2, '0')}m`
  return `${Math.floor(h / 24)}d ${h % 24}h`
}

const label = (w: Window) => LABEL[w.kind] ?? w.kind
const pct = (w: Window) => `${Math.round(w.pct)}%`

function bar(p: number, width = 10): string {
  const n = Math.max(0, Math.min(width, Math.round((p / 100) * width)))
  return '█'.repeat(n) + '░'.repeat(width - n)
}

function needsAttention(list: Window[], now: number): boolean {
  return list.some(w => w.pct >= WARN_AT || msToLimit(w, now) != null)
}

export function statusLine(list: Window[], now: number): string | undefined {
  if (!list.length) return undefined
  return list
    .map(w => {
      const ahead = msToLimit(w, now)
      const reset = w.kind === 'five_hour' && w.resetsAt ? ` (resets ${fmt(w.resetsAt - now)})` : ''
      return `${label(w)} ${pct(w)}${ahead != null ? ' ⚠' : ''}${reset}`
    })
    .join(' · ')
}

function summary(list: Window[], now: number): string {
  if (!list.length) {
    return 'No usage figures yet. They arrive with the first reply in this session (subscription plans only).'
  }
  return list
    .map(w => {
      const ahead = msToLimit(w, now)
      const reset = w.resetsAt ? `, resets in ${fmt(w.resetsAt - now)}` : ''
      const pace = ahead != null ? `\n  ⚠ at this rate you'll hit the limit in ~${fmt(ahead)}` : ''
      return `${label(w).padEnd(8)} ${bar(w.pct)} ${pct(w)}${reset}${pace}`
    })
    .join('\n')
}

// ---- hooks -------------------------------------------------------------------

async function ingest($: EngineInterface, limits: readonly SessionRateLimit[]) {
  const list = toWindows(limits)
  const now = await $.clock.now()
  const before = await read($, windows)
  await update($, windows, () => list)
  $.ui.status(statusLine(list, now))

  // Bring the band back when things get worse after it was hidden.
  const wasBad = needsAttention(before, now)
  if (!wasBad && needsAttention(list, now)) await update($, isBandHidden, () => false)

  // One alert per window period and threshold.
  const done = new Set(await read($, alerted))
  const fresh: string[] = []
  for (const w of list) {
    const period = `${w.kind}:${w.resetsAt ?? '?'}`
    for (const t of [WARN_AT, ALERT_AT]) {
      const id = `${period}:${t}`
      if (done.has(id)) { fresh.push(id); continue }
      if (w.pct >= t) {
        fresh.push(id)
        const reset = w.resetsAt ? ` Resets in ${fmt(w.resetsAt - now)}.` : ''
        $.ui.toast(`Claude ${label(w).toLowerCase()} usage at ${pct(w)}.${reset}`, { timeoutMs: 8000 })
        if (t >= ALERT_AT) {
          void $.ui.notify(`${label(w)} usage at ${pct(w)}.${reset}`, { title: 'Claude usage' }).catch(() => {})
        }
      }
    }
    const paceId = `${period}:pace`
    const ahead = msToLimit(w, now)
    if (done.has(paceId)) fresh.push(paceId)
    else if (ahead != null && w.pct >= 25) {
      fresh.push(paceId)
      $.ui.toast(`Burning ${label(w).toLowerCase()} usage fast: limit in ~${fmt(ahead)} at this rate.`, { timeoutMs: 8000 })
    }
  }
  await update($, alerted, () => fresh)
}


export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'usage-meter',
      description: 'Show your Claude plan usage (session and weekly) with reset times and pace',
    })
    const ran = await next(e)
    try {
      const { rateLimits } = await $.session.usage()
      if (rateLimits.length) await ingest($, rateLimits)
    } catch {
      // No figures yet; session.measure will bring them.
    }
    return ran
  })

  on('session.measure', async ($, e, next) => {
    if (e.changed.includes('rateLimits')) await ingest($, e.rateLimits)
    return next(e)
  })

  on('command.run', { command: 'usage-meter' }, async $ => {
    const { rateLimits } = await $.session.usage()
    if (rateLimits.length) await ingest($, rateLimits)
    await update($, isBandHidden, () => false)
    return { text: summary(await read($, windows), await $.clock.now()) }
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const list = await read($, windows)
    const now = await $.clock.now()
    if (e.props.hasSurvey || !needsAttention(list, now) || (await read($, isBandHidden))) {
      return next(e)
    }
    const { Box, Button, Text } = $.ui.resolve(e)
    return (
      <Box flexDirection="row" flexWrap="wrap" alignItems="center" gap={2}>
        {list.map(w => {
          const ahead = msToLimit(w, now)
          const color = w.pct >= ALERT_AT ? 'error' : w.pct >= WARN_AT || ahead != null ? 'warning' : 'success'
          return (
            <Text key={w.kind} color={color}>
              {label(w)} {bar(w.pct)} {pct(w)}
              {ahead != null ? ` ⚠ limit in ~${fmt(ahead)}` : ''}
              {w.resetsAt ? ` · resets ${fmt(w.resetsAt - now)}` : ''}
            </Text>
          )
        })}
        <Button key="hide" label="Hide" onPress={() => update($, isBandHidden, () => true)} />
      </Box>
    )
  })
}
