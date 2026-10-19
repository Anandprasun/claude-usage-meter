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
