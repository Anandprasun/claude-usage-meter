# How it works

## Data sources

### Chrome extension

claude.ai's own **Settings → Usage** page loads its numbers from:

```
GET https://claude.ai/api/organizations/{orgId}/usage
```

The extension calls the same endpoint with your existing claude.ai login. No password, token or cookie is read or stored by the extension. The browser attaches your session the same way it does for claude.ai itself.

`orgId` comes from the `lastActiveOrg` cookie on claude.ai, falling back to `GET /api/organizations` and picking the organization with chat access.

Two paths fetch the data:

1. **Content script** (`content.js`) on any open claude.ai tab. Because it runs on the claude.ai origin, this is the most reliable path. It polls every 60 seconds while the tab is visible, when the tab becomes visible again, and about 6 and 25 seconds after you send a message.
2. **Background worker** (`background.js`) every 5 minutes, so the badge stays roughly current when no claude.ai tab is open. Some browser privacy settings block this path. The content script still works.

### Claude Code status line

Claude Code runs the status line command and pipes it a JSON payload on stdin. Recent versions include:

```json
{
  "model": { "display_name": "Opus 5.5" },
  "context_window": { "used_percentage": 34.2 },
  "rate_limits": {
    "five_hour": { "used_percentage": 61.4, "resets_at": 1792420000 },
    "seven_day": { "used_percentage": 18,   "resets_at": 1792850000 }
  }
}
```

No network calls are made by the script.

## Response formats

The usage response has had two shapes. `shared.js` (extension) and `usage-statusline.py` both accept either.

**Flat keys** (older):

```json
{
  "five_hour":       { "utilization": 35.0, "resets_at": "2026-02-06T22:00:00+00:00" },
  "seven_day":       { "utilization": 14.0, "resets_at": "2026-02-12T20:00:00+00:00" },
  "seven_day_opus":  { "utilization": 40.0, "resets_at": "2026-02-12T20:00:00+00:00" },
  "seven_day_oauth_apps": null
}
```

**`limits` array** (newer):

```json
{
  "limits": [
    { "kind": "session",       "percent": 20, "resets_at": "..." },
    { "kind": "weekly_all",    "percent": 50, "resets_at": "..." },
    { "kind": "weekly_scoped", "percent": 70, "resets_at": "...", "scope": { "model": { "display_name": "Opus" } } }
  ]
}
```

Both are normalized into a list of windows:

```js
{ key: "session", label: "Session", pct: 61, resetsAt: 1792420000000, windowMs: 18000000 }
```

Percentages are clamped to 0–100. `resets_at` may be an ISO 8601 string or a Unix timestamp in seconds or milliseconds.

## Pace maths

For a window of length `W` that resets at time `R`, at time `now`:

```
left      = R - now
elapsed   = W - left
elapsed%  = elapsed / W × 100
projected = used% / elapsed% × 100          # % at reset if the rate holds
timeToCap = (100 - used%) × elapsed / used%  # time until 100% at the current rate
```

A window is flagged **ahead of pace** when `projected` exceeds 102% (the 2% tolerance avoids flagging someone exactly on pace). The status line flags it when `timeToCap < left`, which is equivalent. Nothing is flagged below 10% used or in the first 2% of a window, where the rate estimate is too noisy to be useful.

Window lengths are 5 hours (session) and 7 days (weekly).

## Notifications

The extension notifies once per window period for each threshold (warn and alert) and once for "burning fast" (ahead of pace and at least 25% used). A window period is identified by its `resets_at`, so you get fresh alerts after each reset. Clicking a notification opens the usage page.

## Files

```
extension/
  manifest.json   Manifest V3; permissions: storage, alarms, notifications; host: claude.ai
  shared.js       Response normalization, pace maths, formatting (shared by all scripts)
  background.js   Badge, tooltip, notifications, background polling
  content.js      Same-origin fetch on claude.ai, on-page pill
  popup.html/js   Popup UI and settings
claude-code/
  usage-statusline.py   The status line command
  install.py            Installs/uninstalls into ~/.claude/settings.json
tests/                  Unit tests for both
```
