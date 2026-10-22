# Privacy

Claude Usage Meter has no server, analytics, telemetry or third-party code.

## Chrome extension

**Reads**: your usage percentages and reset times from `claude.ai`, using the session your browser already has. It also reads the `lastActiveOrg` cookie value on claude.ai to know which organization to query.

**Stores** (in Chrome's extension storage, on your device):
- the latest usage numbers and when they were fetched
- your organization ID, so it doesn't have to look it up every time
- which alerts have already been shown in the current window
- your settings (thresholds, notifications on/off, pill on/off), synced through your browser profile if you use Chrome sync

**Never**: reads your conversations, reads or stores passwords, tokens or cookies, or sends any data to any host other than claude.ai.

**Permissions and why**:

| Permission | Used for |
|---|---|
| `https://claude.ai/*` | Fetching usage, showing the pill |
| `storage` | Settings and latest numbers |
| `alarms` | Refreshing every 5 minutes in the background |
| `notifications` | Threshold and pace alerts |

## Claude Code status line

Reads the JSON Claude Code passes on stdin and prints one line. It makes no network requests and writes no files. The installer only edits `~/.claude/settings.json` (after backing it up) and copies one script into `~/.claude/`.

## Claude plugin

Reads the usage figures Claude passes to plugins (each window's percentage and reset time). Keeps the latest figures, which alerts it has shown, and whether you hid the band, in the session's plugin state. Makes no network requests and reads no conversations or files.

## Mac menu-bar meter

**Reads**: your Claude Code login from the macOS Keychain item "Claude Code-credentials" (or `~/.claude/.credentials.json`), only to send one request for your usage to `api.anthropic.com`, Anthropic's API. macOS asks your permission the first time.

**How the login is handled**: it is read and used inside a single shell command and handed to `curl` through its standard input, so it never appears in the process list, in logs, on screen or on disk. The meter never writes, refreshes or copies your login.

**Stores**: the latest usage figures and which alerts it has shown, in SwiftBar's data folder for the plugin (or `~/Library/Application Support/claude-usage-meter/`).

**Never**: reads your conversations, or contacts any host other than `api.anthropic.com`.
