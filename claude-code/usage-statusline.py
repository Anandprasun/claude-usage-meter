#!/usr/bin/env python3
# SPDX-License-Identifier: MIT
"""Claude Code status line: model, context %, and plan usage with a pace warning.

Claude Code pipes a JSON blob to this script on stdin before each status line
refresh. Recent versions include `rate_limits.five_hour` / `rate_limits.seven_day`
with `used_percentage` and `resets_at`. This script also accepts the newer
`limits` array shape, so it keeps working if the payload format shifts.

Output example:
  Opus 5.5 · ctx 34% · 5h ███░░░░░ 41% ⚠ limit in ~1h 10m · resets 2h 05m · wk 18%

Standard library only. Set NO_COLOR=1 to disable colours.
"""
import json
import os
import sys
import time
from datetime import datetime

WARN_AT = int(os.environ.get("CLAUDE_USAGE_WARN", "75"))
ALERT_AT = int(os.environ.get("CLAUDE_USAGE_ALERT", "90"))
COLOR = not os.environ.get("NO_COLOR")
WINDOW_S = {"session": 5 * 3600, "weekly": 7 * 24 * 3600}


def c(code, s):
    return f"\033[{code}m{s}\033[0m" if COLOR else s


def to_epoch(v):
    if v in (None, ""):
        return None
    if isinstance(v, (int, float)):
        return v / 1000 if v > 1e12 else v
    try:
        return datetime.fromisoformat(str(v).replace("Z", "+00:00")).timestamp()
    except ValueError:
        return None


def pct_of(d):
    for k in ("used_percentage", "utilization", "percent"):
        if isinstance(d, dict) and d.get(k) is not None:
            try:
                return max(0.0, min(100.0, float(d[k])))
            except (TypeError, ValueError):
                return None
    return None


def windows_from(data):
    """Return {'session': (pct, resets_at), 'weekly': (pct, resets_at)}."""
    out = {}
    rl = data.get("rate_limits") or {}
    limits = rl.get("limits") if isinstance(rl, dict) else None
    limits = limits or data.get("limits")
    if isinstance(limits, list):
        for l in limits:
            kind = {"session": "session", "weekly_all": "weekly"}.get(l.get("kind"))
            p = pct_of(l)
            if kind and p is not None:
                out[kind] = (p, to_epoch(l.get("resets_at")))
    for key, name in (("five_hour", "session"), ("seven_day", "weekly")):
        src = rl.get(key) if isinstance(rl, dict) else None
        p = pct_of(src)
        if name not in out and p is not None:
            out[name] = (p, to_epoch(src.get("resets_at")))
    return out


def fmt_dur(sec):
    if sec is None:
        return "?"
    if sec <= 0:
        return "now"
    m = int(round(sec / 60))
    if m < 60:
        return f"{m}m"
    h, m = divmod(m, 60)
    if h < 48:
        return f"{h}h {m:02d}m"
    d, h = divmod(h, 24)
    return f"{d}d {h}h"


def colour_for(p):
    return "31" if p >= ALERT_AT else "33" if p >= WARN_AT else "32"


def bar(p, width=8):
    filled = int(round(p / 100 * width))
    return "█" * filled + "░" * (width - filled)


def pace(p, resets_at, window_s, now):
    """Seconds until the limit at the current burn rate, if that's before reset."""
    if resets_at is None or p < 10:
        return None
    left = resets_at - now
    elapsed = window_s - left
    if elapsed <= window_s * 0.02 or left <= 0:
        return None
    to_limit = (100 - p) * elapsed / p
    return to_limit if to_limit < left else None


def main():
    # Claude Code speaks UTF-8; Windows Python defaults to a legacy code page,
    # which can't encode the bar and warning characters.
    for stream in (sys.stdin, sys.stdout):
        try:
            stream.reconfigure(encoding="utf-8")
        except (AttributeError, ValueError):
            pass
    try:
        data = json.loads(sys.stdin.read() or "{}")
    except json.JSONDecodeError:
        data = {}
    now = time.time()
    parts = []

    model = (data.get("model") or {}).get("display_name")
    if model:
        parts.append(c("1", model))

    ctx = pct_of(data.get("context_window") or {})
    if ctx is not None:
        parts.append(c(colour_for(ctx), f"ctx {ctx:.0f}%"))

    w = windows_from(data)
    if "session" in w:
        p, r = w["session"]
        seg = c(colour_for(p), f"5h {bar(p)} {p:.0f}%")
        t = pace(p, r, WINDOW_S["session"], now)
        if t is not None:
            seg += " " + c("33;1", f"⚠ limit in ~{fmt_dur(t)}")
        if r:
            seg += c("2", f" · resets {fmt_dur(r - now)}")
        parts.append(seg)
    if "weekly" in w:
        p, r = w["weekly"]
        seg = c(colour_for(p), f"wk {p:.0f}%")
        t = pace(p, r, WINDOW_S["weekly"], now)
        if t is not None:
            seg += " " + c("33;1", f"⚠ ~{fmt_dur(t)} left")
        parts.append(seg)
    if not w:
        parts.append(c("2", "usage: n/a until first reply"))

    print(" · ".join(parts))


if __name__ == "__main__":
    main()
