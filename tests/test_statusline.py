"""Tests for the Claude Code status line and installer.

Run: python3 -m unittest discover -s tests -v
"""
import importlib.util
import json
import os
import subprocess
import sys
import tempfile
import time
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SCRIPT = ROOT / "claude-code" / "usage-statusline.py"
INSTALLER = ROOT / "claude-code" / "install.py"

spec = importlib.util.spec_from_file_location("statusline", SCRIPT)
sl = importlib.util.module_from_spec(spec)
spec.loader.exec_module(sl)


def run(payload, **env):
    e = {**os.environ, "NO_COLOR": "1", **env}
    data = payload if isinstance(payload, str) else json.dumps(payload)
    out = subprocess.run([sys.executable, str(SCRIPT)], input=data, capture_output=True, text=True, env=e, check=True)
    return out.stdout.strip()


class Parsing(unittest.TestCase):
    def test_rate_limits_shape(self):
        w = sl.windows_from({"rate_limits": {
            "five_hour": {"used_percentage": 61.4, "resets_at": 100},
            "seven_day": {"used_percentage": 18, "resets_at": 200}}})
        self.assertEqual(w, {"session": (61.4, 100), "weekly": (18.0, 200)})

    def test_limits_array_shape(self):
        w = sl.windows_from({"limits": [
            {"kind": "session", "percent": 45, "resets_at": "2026-10-19T12:00:00+00:00"},
            {"kind": "weekly_all", "percent": 10},
            {"kind": "weekly_scoped", "percent": 99}]})
        self.assertEqual(w["session"][0], 45.0)
        self.assertEqual(w["weekly"], (10.0, None))

    def test_utilization_key_and_clamping(self):
        w = sl.windows_from({"rate_limits": {"five_hour": {"utilization": 130}}})
        self.assertEqual(w["session"], (100.0, None))

    def test_timestamps(self):
        self.assertEqual(sl.to_epoch(1792420000), 1792420000)
        self.assertEqual(sl.to_epoch(1792420000000), 1792420000)
        self.assertEqual(sl.to_epoch("2026-10-19T00:00:00Z"), 1792368000.0)
        self.assertIsNone(sl.to_epoch("nonsense"))

    def test_pace(self):
        now = 1_000_000
        # 60% used, 2h of 5h elapsed, reset in 3h -> cap in 80 minutes
        self.assertAlmostEqual(sl.pace(60, now + 3 * 3600, 5 * 3600, now), 80 * 60)
        self.assertIsNone(sl.pace(20, now + 4 * 3600, 5 * 3600, now))   # under pace
        self.assertIsNone(sl.pace(5, now + 3 * 3600, 5 * 3600, now))    # too little data
        self.assertIsNone(sl.pace(60, None, 5 * 3600, now))             # no reset time

    def test_fmt_dur(self):
        self.assertEqual(sl.fmt_dur(None), "?")
        self.assertEqual(sl.fmt_dur(0), "now")
        self.assertEqual(sl.fmt_dur(45 * 60), "45m")
        self.assertEqual(sl.fmt_dur(3 * 3600 + 5 * 60), "3h 05m")
        self.assertEqual(sl.fmt_dur(50 * 3600), "2d 2h")


class Output(unittest.TestCase):
    def test_full_line(self):
        now = int(time.time())
        out = run({"model": {"display_name": "Opus 5.5"},
                   "context_window": {"used_percentage": 34.2},
                   "rate_limits": {"five_hour": {"used_percentage": 61.4, "resets_at": now + 3 * 3600},
                                   "seven_day": {"used_percentage": 18, "resets_at": now + 5 * 86400}}})
        self.assertTrue(out.startswith("Opus 5.5 · ctx 34% · 5h █████░░░ 61% ⚠ limit in ~"), out)
        self.assertIn("· wk 18%", out)
        self.assertNotIn("\033[", out)

    def test_no_usage_yet(self):
        self.assertEqual(run({"model": {"display_name": "Opus 5.5"}}), "Opus 5.5 · usage: n/a until first reply")

    def test_bad_input_does_not_crash(self):
        self.assertEqual(run(""), "usage: n/a until first reply")
        self.assertEqual(run("not json"), "usage: n/a until first reply")

    def test_colour_and_thresholds(self):
        payload = {"rate_limits": {"five_hour": {"used_percentage": 80}}}
        out = run(payload, NO_COLOR="", CLAUDE_USAGE_WARN="75")
        self.assertIn("\033[33m", out)  # yellow at/above warn
        out = run(payload, NO_COLOR="", CLAUDE_USAGE_WARN="85")
        self.assertIn("\033[32m", out)  # green below warn


class Installer(unittest.TestCase):
    def setUp(self):
        self.dir = tempfile.TemporaryDirectory()
        self.cfg = Path(self.dir.name)
        self.env = {**os.environ, "CLAUDE_CONFIG_DIR": str(self.cfg)}

    def tearDown(self):
        self.dir.cleanup()

    def install(self, *args):
        return subprocess.run([sys.executable, str(INSTALLER), *args], capture_output=True, text=True, env=self.env)

    def settings(self):
        return json.loads((self.cfg / "settings.json").read_text())

    def test_install_preserves_other_settings_and_backs_up(self):
        (self.cfg / "settings.json").write_text(json.dumps({"model": "opus", "permissions": {"allow": ["Bash(ls)"]}}))
        r = self.install()
        self.assertEqual(r.returncode, 0, r.stderr)
        s = self.settings()
        self.assertEqual(s["model"], "opus")
        self.assertEqual(s["permissions"], {"allow": ["Bash(ls)"]})
        self.assertEqual(s["statusLine"]["type"], "command")
        self.assertIn("usage-statusline.py", s["statusLine"]["command"])
        self.assertTrue((self.cfg / "usage-statusline.py").exists())
        self.assertTrue(list(self.cfg.glob("settings.json.bak-*")))

    def test_install_without_existing_settings(self):
        r = self.install()
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertIn("statusLine", self.settings())

    def test_uninstall(self):
        (self.cfg / "settings.json").write_text(json.dumps({"model": "opus"}))
        self.install()
        r = self.install("--uninstall")
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertEqual(self.settings(), {"model": "opus"})
        self.assertFalse((self.cfg / "usage-statusline.py").exists())

    def test_refuses_to_touch_invalid_json(self):
        bad = '{"model": "opus",}'
        (self.cfg / "settings.json").write_text(bad)
        r = self.install()
        self.assertNotEqual(r.returncode, 0)
        self.assertEqual((self.cfg / "settings.json").read_text(), bad)


if __name__ == "__main__":
    unittest.main()
