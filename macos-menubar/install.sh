#!/bin/sh
# SPDX-License-Identifier: MIT
# Installs the Claude usage menu-bar meter into SwiftBar.
#   sh macos-menubar/install.sh            install / update
#   sh macos-menubar/install.sh --uninstall
set -e

HERE=$(cd "$(dirname "$0")" && pwd)
NAME="claude-usage.2m.js"

if [ "$(uname)" != "Darwin" ]; then
  echo "This menu-bar meter is for macOS." >&2
  exit 1
fi

if ! [ -d "/Applications/SwiftBar.app" ] && ! [ -d "$HOME/Applications/SwiftBar.app" ]; then
  if command -v brew >/dev/null 2>&1; then
    echo "Installing SwiftBar with Homebrew..."
    brew install --cask swiftbar
  else
    echo "SwiftBar isn't installed. Get it from https://swiftbar.app (or 'brew install --cask swiftbar'), open it once, then rerun this." >&2
    exit 1
  fi
fi

DIR=$(defaults read com.ameba.SwiftBar PluginDirectory 2>/dev/null || true)
if [ -z "$DIR" ]; then
  DIR="$HOME/Library/Application Support/SwiftBar/Plugins"
  mkdir -p "$DIR"
  defaults write com.ameba.SwiftBar PluginDirectory -string "$DIR"
  echo "Set SwiftBar's plugin folder to: $DIR"
fi
DIR=$(eval echo "$DIR")   # expand a leading ~

if [ "$1" = "--uninstall" ]; then
  rm -f "$DIR"/claude-usage.*.js
  open -g "swiftbar://refreshallplugins" 2>/dev/null || true
  echo "Removed the Claude usage meter."
  exit 0
fi

rm -f "$DIR"/claude-usage.*.js          # an older copy, possibly with another interval
cp "$HERE/$NAME" "$DIR/$NAME"
chmod +x "$DIR/$NAME"
xattr -d com.apple.quarantine "$DIR/$NAME" 2>/dev/null || true

open -a SwiftBar 2>/dev/null || true
sleep 1
open -g "swiftbar://refreshallplugins" 2>/dev/null || true

echo "Installed. Look for the gauge and your usage % in the menu bar."
echo "The first time, macOS asks whether SwiftBar may use 'Claude Code-credentials':"
echo "choose Always Allow (it's your existing Claude Code login; nothing is copied)."
