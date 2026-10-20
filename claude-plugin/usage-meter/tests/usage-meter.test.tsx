import { expect, test } from 'claude-code/testing'

import { fmt, msToLimit, statusLine, toWindows } from '../hooks/register'

const H = 3600_000
const NOW = Date.UTC(2026, 9, 20, 8, 0, 0)
const iso = (ms: number) => new Date(ms).toISOString()

test('maths: pace, formatting, parsing', async () => {
  const w = { kind: 'five_hour', pct: 60, resetsAt: NOW + 3 * H }
  // 60% used with 40% of the window gone: limit in 1h20m, before the 3h reset
  expect(fmt(msToLimit(w, NOW))).toBe('1h 20m')
  expect(msToLimit({ ...w, pct: 20, resetsAt: NOW + 4 * H }, NOW)).toBe(null) // on pace
  expect(msToLimit({ ...w, pct: 5 }, NOW)).toBe(null) // too early to tell
  expect(msToLimit({ kind: 'spend_limit', pct: 60, resetsAt: NOW + H }, NOW)).toBe(null)
  expect(fmt(45 * 60_000)).toBe('45m')
  expect(fmt(50 * H)).toBe('2d 2h')

  const parsed = toWindows([
    { kind: 'five_hour', percentUsed: 61.4, resetsAt: iso(NOW + 3 * H) },
    { kind: 'seven_day', percentUsed: 18 },
  ])
  expect(parsed).toEqual([
    { kind: 'five_hour', pct: 61.4, resetsAt: NOW + 3 * H },
    { kind: 'seven_day', pct: 18, resetsAt: null },
  ])
  expect(statusLine(parsed, NOW)).toBe('Session 61% ⚠ (resets 3h 00m) · Week 18%')
  expect(statusLine([], NOW)).toBe(undefined)
})

test('a measurement sets the status line, alerts once per threshold, and shows the band', async ($, on) => {
  const statuses: (string | undefined)[] = []
  const toasts: string[] = []
  on('ui.status', (_, e) => { statuses.push(e.text); return { value: undefined } })
  on('ui.toast', (_, e) => { toasts.push(e.text); return { value: undefined } })
  const now = Date.now()
  on('clock.now', () => ({ value: now }))
  on('ui.notify', () => ({ value: { isSent: true, channel: 'terminal_bell' } }))
  on('command.register', () => ({ value: { command: 'usage-meter' } }))
  let current: { kind: string; percentUsed: number; resetsAt?: string }[] = []
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 200000 }, rateLimits: current } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('session.measure', (_, e) => ({ changed: e.changed }))
  // Stands for the engine's own (empty) band when the meter has nothing to say.
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>engine</Text>
  })

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })

  const measure = (p: number) => {
    current = [
        { kind: 'five_hour', percentUsed: p, resetsAt: new Date(now + 4.5 * H).toISOString() },
        { kind: 'seven_day', percentUsed: 12, resetsAt: new Date(now + 6 * 24 * H).toISOString() },
    ]
    return $.session.measure({ context: { window: 200000 }, rateLimits: current, changed: ['rateLimits'] })
  }

  await measure(40)
  expect(statuses.at(-1)).toMatch(/^Session 40% .*\(resets 4h 30m\) · Week 12%$/)
  const afterFirst = toasts.length

  await measure(80)
  await measure(81)
  const warn = toasts.filter(t => /usage at 8\d%/.test(t))
  expect(warn.length).toBe(1) // 75% alert fires once, not on every measurement
  expect(toasts.length).toBeGreaterThan(afterFirst)

  const BAND = {
    plugin: 'usage-meter',
    component: 'AbovePrompt',
    props: { hasSurvey: false, isWorking: false, maxRows: 5, bodyColumns: 80, scroll: { offset: 0, bodyRows: 5 }, view: {} },
  } as const

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...BAND, surface })
    expect((await ui.find({ type: 'Text', text: /Session .* 81%/ }))?.text).toMatch(/resets/)
    await ui.unmount()
  }

  // Hide takes the band away and hands the spot back to the engine.
  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  await ui.press({ key: 'hide' })
  expect(await ui.find({ type: 'Text', text: /Session/ })).toBe(undefined)
  expect((await ui.find({ type: 'Text', text: /engine/ }))?.text).toBe('engine')
  await ui.unmount()
})
