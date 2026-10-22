# Troubleshooting

## Extension

**The badge is empty / popup says "No usage data yet"**
Open [claude.ai](https://claude.ai) in a tab and make sure you're signed in. The content script fetches usage within a few seconds of the page loading.

**The badge stopped updating**
1. Click **Refresh** in the popup. If it shows **Open claude.ai**, the background fetch is blocked; keep a claude.ai tab open and it will update from there.
2. Check the "Last error" line in the popup when there's no data.
3. Open the usage page (Settings → Usage) to confirm the numbers are still there. If the page works but the extension doesn't, the endpoint or its response format has probably changed. Please [open an issue](https://github.com/Anandprasun/claude-usage-meter/issues/new/choose) with the shape of the response (see below).

**Finding the response shape for a bug report**
On claude.ai, open DevTools → Network, filter for `usage`, reload the Settings → Usage page, and copy the response body. **Replace your organization ID and any account details before posting.** Only the key names and structure are needed; the numbers can be anything.

**I hid the pill and want it back**
Open the popup and tick **Show pill on claude.ai**.

**Too many / too few notifications**
Adjust **Warn at** and **Alert at** in the popup, or untick **Desktop notifications**. If none ever appear, check that your OS allows notifications from your browser.

**I switched organizations**
The extension follows your active organization on claude.ai. If numbers look like the wrong workspace, reload a claude.ai tab after switching.

## Status line

**Shows `usage: n/a until first reply`**
Normal at the start of a session. Claude Code only receives rate-limit data after its first response. If it never changes, your Claude Code version may not pass `rate_limits` to status lines yet; update Claude Code.

**Nothing shows at all**
Run the command from `~/.claude/settings.json` → `statusLine.command` yourself with a sample payload:

```bash
echo '{"rate_limits":{"five_hour":{"used_percentage":40}}}' | python3 ~/.claude/usage-statusline.py
```

If that errors with "python3: command not found", edit `statusLine.command` to point to your Python (for example `python` on Windows, or a full path).

**Colours look wrong or show escape codes**
Set `NO_COLOR=1` in your environment.

**`install.py` says it couldn't parse settings.json**
Your `settings.json` has a syntax error (often a trailing comma). Fix it, then rerun. The installer doesn't modify a file it can't parse.

**I had a custom status line before**
The installer prints the old value before replacing it and saves a timestamped backup next to `settings.json` (`settings.json.bak-…`).

## Mac menu bar

**It shows – instead of a percentage**
Click it; the menu says why.
- *Claude Code isn't signed in on this Mac*: run `claude` in Terminal and sign in with your Claude account (not an API key), then click Refresh.
- *Claude login expired*: Claude Code renews its login when it runs. Open any Claude Code session (terminal or the desktop app's Code tab), then click Refresh.
- *Couldn't read usage*: a network problem, or the usage endpoint changed. If it persists while Settings → Usage on claude.ai works, please [open an issue](https://github.com/Anandprasun/claude-usage-meter/issues/new/choose).

**macOS keeps asking for permission to use "Claude Code-credentials"**
Choose **Always Allow** rather than Allow. If you clicked Deny, open **Keychain Access**, find "Claude Code-credentials", open it, and under **Access Control** add SwiftBar (and `osascript`), or simply delete those entries and choose Always Allow next time.

**Nothing appears in the menu bar at all**
Make sure SwiftBar is running (it shows its own icon) and that the plugin file is in SwiftBar's plugin folder and executable. Rerunning `sh macos-menubar/install.sh` fixes both. On a crowded menu bar, macOS hides items that don't fit; quit a few menu-bar apps or use a tool like Ice or Bartender.

**Notifications don't appear**
Allow notifications for **Script Editor** in System Settings → Notifications (macOS shows the meter's alerts under that name).
