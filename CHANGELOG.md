# Changelog

All notable changes are listed here. This project uses [Semantic Versioning](https://semver.org/).

## [1.1.0] - 2026-10-22

### Added
- Mac menu-bar meter (SwiftBar plugin): session and weekly % in the menu bar whatever app you're in, a dropdown with every limit and the pace warning, and notifications. Uses your existing Claude Code login; one-command installer.
- Claude plugin (`usage-meter`): live usage inside Claude Code sessions in the desktop app, terminal and VS Code. Status line entry, a warning band above the prompt, alerts at 75% and 90%, and `/usage-meter`. Installs with `/plugin install usage-meter --marketplace Anandprasun/claude-usage-meter`.

## [1.0.0] - 2026-10-19

### Added
- Chrome extension for claude.ai: toolbar badge, popup with all limits, on-page pill, threshold and pace notifications, configurable warn/alert levels.
- Claude Code status line showing model, context %, session bar and weekly %, with pace warning.
- Installer and uninstaller for the status line that back up `settings.json`.
- Support for both the flat (`five_hour` / `seven_day`) and `limits`-array usage response formats.
- Unit tests and CI on Linux, macOS and Windows.

[1.1.0]: https://github.com/Anandprasun/claude-usage-meter/releases/tag/v1.1.0
[1.0.0]: https://github.com/Anandprasun/claude-usage-meter/releases/tag/v1.0.0
