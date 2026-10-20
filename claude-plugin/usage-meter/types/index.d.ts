/** One usage window as the meter keeps it. */
export type Window = {
  /** `five_hour`, `seven_day`, or a gateway's `spend_limit`. */
  kind: string
  /** 0-100 (can pass 100 on an exceeded spend limit). */
  pct: number
  /** Reset time in epoch milliseconds, when known. */
  resetsAt: number | null
}

declare module 'claude-code' {
  interface PluginState {
    'usage-meter': {
      /** Latest windows the engine reported. */
      windows: Window[]
      /** When the person hid the warning band (until it changes level again). */
      isBandHidden: boolean
      /** Alerts already shown, keyed by window, reset time and threshold. */
      alerted: string[]
    }
  }
}
