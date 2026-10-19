# Claude Usage Meter

[![CI](https://github.com/Anandprasun/claude-usage-meter/actions/workflows/ci.yml/badge.svg)](https://github.com/Anandprasun/claude-usage-meter/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

See how much of your Claude plan you've used, and get warned **before** you hit the limit, not after.

Two small, dependency-free tools:

| | Where it runs | What it shows |
|---|---|---|
| [**Chrome extension**](#chrome-extension) | claude.ai in Chrome, Edge, Brave, Arc | Toolbar badge, popup with every limit, on-page pill, desktop alerts |
| [**Status line**](#claude-code-status-line) | Claude Code in your terminal | Model · context % · 5-hour bar · weekly % |

Both track the same limits as claude.ai → **Settings → Usage**: the **session** window (resets every 5 hours), the **weekly** window, and per-model weekly limits where your plan has them. Usage is shared across claude.ai and Claude Code, so either tool reflects both.

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

1. [Download the repo as a ZIP](https://github.com/Anandprasun/claude-usage-meter/archive/refs/heads/main.zip) and unzip it, or `git clone` it.
2. Open `chrome://extensions` (or `edge://extensions`, `brave://extensions`).
3. Turn on **Developer mode**.
4. Click **Load unpacked** and select the `extension` folder.
5. Pin **Claude Usage Meter** from the puzzle-piece menu so the badge stays visible.
6. Open [claude.ai](https://claude.ai) while signed in. The badge fills in within a few seconds.

To update later, pull or re-download, then click the reload icon on the extension's card in `chrome://extensions`.

### What you get

- **Badge**: your session %, green / amber / red. It turns amber early if you're ahead of pace, and switches to a weekly limit if that one crosses your alert level.
- **Popup**: every limit with a bar, reset countdown, pace tick and settings.
- **On-page pill** (bottom-right of claude.ai): session and week at a glance. Click it to open the usage page; × hides it (turn it back on from the popup).
- **Desktop notifications** at your warn level (default 75%) and alert level (default 90%), once per window, plus a one-time "burning fast" heads-up.

<p align="center"><img src="docs/images/pill.png" width="420" alt="Usage pill on claude.ai"></p>

---

## Claude Code status line

Requires Python 3 (standard library only). Works on macOS, Linux and Windows.

### Install

```bash
git clone https://github.com/Anandprasun/claude-usage-meter.git
cd claude-usage-meter
python3 claude-code/install.py
```

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

Nothing leaves your machine. The extension reads usage from claude.ai using your existing browser session, stores only the latest numbers and your settings in Chrome's extension storage, and sends no data anywhere else. The status line reads only what Claude Code passes to it. See [PRIVACY.md](PRIVACY.md).

## Caveats

- **The extension relies on an undocumented claude.ai endpoint** (the one the Settings → Usage page uses). Anthropic can change it at any time. The parser handles both response formats seen so far, but if the badge stops updating, that's the most likely cause. The Usage page in Settings is always the source of truth. See [docs/troubleshooting.md](docs/troubleshooting.md).
- The status line uses data Claude Code supplies to status line commands, which is the supported route.
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
