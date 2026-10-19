#!/usr/bin/env python3
# SPDX-License-Identifier: MIT
"""Install the usage status line into Claude Code.

Copies usage-statusline.py to ~/.claude/ (or $CLAUDE_CONFIG_DIR) and points
settings.json's statusLine at it. Backs up settings.json first.
Run with --uninstall to remove the statusLine entry again.
"""
import json
import os
import shutil
import sys
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
CONFIG = Path(os.environ.get("CLAUDE_CONFIG_DIR", Path.home() / ".claude")).expanduser()
TARGET = CONFIG / "usage-statusline.py"
SETTINGS = CONFIG / "settings.json"


def load():
    if not SETTINGS.exists():
        return {}
    text = SETTINGS.read_text(encoding="utf-8").strip()
    return json.loads(text) if text else {}


def save(data):
    if SETTINGS.exists():
        backup = SETTINGS.with_name(f"settings.json.bak-{time.strftime('%Y%m%d-%H%M%S')}-{time.time_ns() % 1000000}")
        shutil.copy2(SETTINGS, backup)
        print(f"Backed up existing settings to {backup}")
    SETTINGS.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")


def main():
    CONFIG.mkdir(parents=True, exist_ok=True)
    try:
        settings = load()
    except json.JSONDecodeError as e:
        sys.exit(f"Couldn't parse {SETTINGS} ({e}). Fix it by hand, then rerun.")

    if "--uninstall" in sys.argv:
        if settings.pop("statusLine", None) is not None:
            save(settings)
        if TARGET.exists():
            TARGET.unlink()
        print("Removed the usage status line.")
        return

    shutil.copy2(HERE / "usage-statusline.py", TARGET)
    TARGET.chmod(0o755)
    py = "python" if os.name == "nt" else "python3"
    new = {"type": "command", "command": f'{py} "{TARGET}"', "padding": 0}

    old = settings.get("statusLine")
    if old and old != new:
        print(f"Replacing your existing statusLine: {json.dumps(old)}")
    settings["statusLine"] = new
    save(settings)
    print(f"Installed. Status line script: {TARGET}")
    print("Restart Claude Code (or start a new session) to see it.")


if __name__ == "__main__":
    main()
