# Contributing

Issues and pull requests are welcome.

## Ground rules

- **No dependencies.** The extension is plain JavaScript and the status line is Python standard library only. This keeps installation to "load unpacked" and "run one script".
- **No new network destinations.** The extension talks only to claude.ai, and the status line makes no requests. Changes that add analytics or external calls won't be merged.
- **Keep both parsers in step.** If the usage response format changes, update `extension/shared.js` and `claude-code/usage-statusline.py` together, and add the new shape to the tests.

## Running the tests

```bash
node --test tests/*.test.js                 # extension logic (Node 18+)
python3 -m unittest discover -s tests -v   # status line + installer
```

CI runs both on every push and pull request.

## Trying the extension locally

Load `extension/` with **Load unpacked** in `chrome://extensions`, then click the reload icon on its card after each change. Inspect the background worker from the "service worker" link on that card, and the content script from DevTools on a claude.ai tab.

## Reporting a format change

If the extension stops picking up usage, please include the **structure** of the `/usage` response in the issue, with your organization ID and account details removed. See [docs/troubleshooting.md](docs/troubleshooting.md#extension).

## Releases

Bump `version` in `extension/manifest.json`, add an entry to `CHANGELOG.md`, and tag `vX.Y.Z`.
