# Claude Usage Meter

[![CI](https://github.com/Anandprasun/claude-usage-meter/actions/workflows/ci.yml/badge.svg)](https://github.com/Anandprasun/claude-usage-meter/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

See how much of your Claude plan you've used, and get warned **before** you hit the limit, not after.

Three small, dependency-free tools. Pick the one(s) for where you use Claude:

| | Where it runs | What it shows |
|---|---|---|
| [**Chrome extension**](#chrome-extension) | claude.ai in Chrome, Edge, Brave, Arc | Toolbar badge, popup with every limit, on-page pill, desktop alerts |
| [**Claude plugin**](#claude-plugin-live-meter-inside-claude) | Inside Claude: Claude Code sessions in the desktop app, terminal or VS Code | Live usage under the prompt, a warning band, alerts, `/usage-meter` |
| [**Status line**](#claude-code-status-line) | Claude Code in your terminal | Model · context % · 5-hour bar · weekly % |

All three track the same limits as claude.ai → **Settings → Usage**: the **session** window (resets every 5 hours), the **weekly** window, and per-model weekly limits where your plan has them. Usage is shared across claude.ai and Claude Code, so either tool reflects both.

<p align="center">
  <img src="docs/images/popup-light.png" width="260" alt="Extension popup in light mode">
  &nbsp;
  <img src="docs/images/popup-dark.png" width="260" alt="Extension popup in dark mode">
</p>

## Why a pace warning

A percentage alone is misleading. 60% used with 20 minutes left until reset is fine; 60% used with 4 hours left means you'll run out halfway through the afternoon.

Both tools compare **% used** with **% of the window that has passed**. If your average rate so far would reach 100% before the reset, you get a ⚠ and an estimate of when. In the popup, the tick mark on each bar is the "even pace" point. If the fill is past the tick, you're ahead of a sustainable rate. More detail in [docs/how-it-works.md](docs/how-it-works.md).

---

## Chrome extension

### Install

1. Download `claude-usage-meter-extension-vX.Y.Z.zip` from the [latest release](https://github.com/Anandprasun/claude-usage-meter/releases/latest) and unzip it into a folder you'll keep (Chrome loads it from there, so don't delete it).
2. Open `chrome://extensions` (or `edge://extensions`, `brave://extensions`).
3. Turn on **Developer mode**.
4. Click **Load unpacked** and select the unzipped folder. (If you cloned the repo instead, select its `extension` folder.)
5. Pin **Claude Usage Meter** from the puzzle-piece menu so the badge stays visible.
6. Open [claude.ai](https://claude.ai) while signed in. The badge fills in within a few seconds.

To update later, replace the folder's contents with the newer release (or `git pull`), then click the reload icon on the extension's card in `chrome://extensions`.

### What you get

- **Badge**: your session %, green / amber / red. It turns amber early if you're ahead of pace, and switches to a weekly limit if that one crosses your alert level.
- **Popup**: every limit with a bar, reset countdown, pace tick and settings.
- **On-page pill** (bottom-right of claude.ai): session and week at a glance. Click it to open the usage page; × hides it (turn it back on from the popup).
- **Desktop notifications** at your warn level (default 75%) and alert level (default 90%), once per window, plus a one-time "burning fast" heads-up.

<p align="center"><img src="docs/images/pill.png" width="420" alt="Usage pill on claude.ai"></p>

---

## Claude plugin: live meter inside Claude

A plugin that shows your usage inside Claude itself, live, with no unofficial endpoint involved. Claude sends it the same usage figures it uses for its own limit warnings, after each reply.

### Install

At the prompt of a Claude Code session:

```
/plugin install usage-meter --marketplace Anandprasun/claude-usage-meter
```

Answer `y` to add the marketplace, then choose where to install it (for yourself, or for one project).

From a shell:

```bash
claude plugin install usage-meter --marketplace Anandprasun/claude-usage-meter
```

In the desktop app, where `/plugin` doesn't run: click **+** next to the prompt box, then **Plugins**, **Add marketplace** with `Anandprasun/claude-usage-meter`, then **Add plugin**.

### What you get

- **Under the prompt**, always: `Session 61% ⚠ (resets 3h 00m) · Week 18%`. The ⚠ means you're on pace to hit the limit before it resets.
- **Above the prompt**, only when it matters (past 75%, or ahead of pace): a coloured bar for each limit with time to the limit and to the reset. **Hide** puts it away until things get worse.
- **Alerts** at 75% and 90% of each window, once per window, plus a desktop notification at 90%.
- **`/usage-meter`** prints the full breakdown.

Figures appear after the first reply in a session, and only on subscription plans (Pro, Max, Team, Enterprise); API-key usage has no plan limits to show.

### Where it doesn't work

Plugins run in Claude Code sessions, not in regular chats in the Claude app or on claude.ai. For those, use the [Chrome extension](#chrome-extension), or check **Settings → Usage**.

---

## Claude Code status line

Requires Python 3 (standard library only). Works on macOS, Linux and Windows.

### Install

```bash
git clone https://github.com/Anandprasun/claude-usage-meter.git
cd claude-usage-meter
python3 claude-code/install.py
```

Or download `claude-usage-meter-statusline-vX.Y.Z.zip` from the [latest release](https://github.com/Anandprasun/claude-usage-meter/releases/latest), unzip it, and run `python3 install.py` inside it.

The installer copies the script to `~/.claude/usage-statusline.py` (or `$CLAUDE_CONFIG_DIR`), sets `statusLine` in `settings.json`, and keeps your other settings. It backs up `settings.json` first and tells you if it's replacing an existing status line. Restart Claude Code to see it.

```
Opus 5.5 · ctx 34% · 5h █████░░░ 61% ⚠ limit in ~1h 15m · resets 3h 00m · wk 18%
```

At the start of a session it shows `usage: n/a until first reply`, because Claude Code only receives the numbers after its first response.

### Options

Set these as environment variables before starting Claude Code:

| Variable | Default | Effect |
|---|---|---|
| `CLAUDE_USAGE_WARN` | `75` | % at which a value turns yellow |
| `CLAUDE_USAGE_ALERT` | `90` | % at which a value turns red |
| `NO_COLOR` | unset | Any value disables colours |

### Uninstall

```bash
python3 claude-code/install.py --uninstall
```

---

## Privacy

Nothing leaves your machine. The extension reads usage from claude.ai using your existing browser session, stores only the latest numbers and your settings in Chrome's extension storage, and sends no data anywhere else. The status line and the Claude plugin read only the figures Claude passes to them, and make no network requests. See [PRIVACY.md](PRIVACY.md).

## Caveats

- **The extension relies on an undocumented claude.ai endpoint** (the one the Settings → Usage page uses). Anthropic can change it at any time. The parser handles both response formats seen so far, but if the badge stops updating, that's the most likely cause. The Usage page in Settings is always the source of truth. See [docs/troubleshooting.md](docs/troubleshooting.md).
- The status line and the Claude plugin use figures Claude itself supplies, which is the supported route. The plugin API is marked early access, so a future Claude update may need a plugin update.
- The pace projection assumes you continue at your average rate since the window opened. A burst of heavy work early in a window will look alarming until you slow down. That's intended.
- Team and Enterprise plans with different limit structures may show fewer windows.

## Documentation

- [How it works](docs/how-it-works.md): data sources, response formats, pace maths, polling
- [Troubleshooting](docs/troubleshooting.md)
- [Contributing](CONTRIBUTING.md)
- [Changelog](CHANGELOG.md)

## License

[MIT](LICENSE) © 2026 Prasun Anand

*This is an independent project and is not affiliated with, endorsed by, or supported by Anthropic. "Claude" is a trademark of Anthropic, PBC.*
