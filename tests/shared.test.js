// Tests for extension/shared.js. Run: node --test tests/*.test.js
const test = require("node:test");
const assert = require("node:assert/strict");
const { normalizeUsage, elapsedPct, paceStatus, level, fmtDuration } = require("../extension/shared.js");

const H = 3600e3;
const NOW = Date.UTC(2026, 9, 19, 12, 0, 0);
const iso = ms => new Date(ms).toISOString();

test("parses flat-key response and skips null / oauth / cowork keys", () => {
  const w = normalizeUsage({
    five_hour: { utilization: 60, resets_at: iso(NOW + 3 * H) },
    seven_day: { utilization: 14, resets_at: iso(NOW + 120 * H) },
    seven_day_opus: { utilization: 40, resets_at: iso(NOW + 120 * H) },
    seven_day_sonnet: null,
    seven_day_oauth_apps: { utilization: 5 },
    seven_day_cowork: { utilization: 5 },
  });
  assert.deepEqual(w.map(x => x.key), ["session", "weekly", "weekly_opus"]);
  assert.equal(w[0].pct, 60);
  assert.equal(w[0].resetsAt, NOW + 3 * H);
  assert.equal(w[2].label, "Weekly · Opus");
});

test("parses limits-array response", () => {
  const w = normalizeUsage({
    limits: [
      { kind: "session", percent: 20, resets_at: iso(NOW + 4 * H) },
      { kind: "weekly_all", percent: 50, resets_at: iso(NOW + 144 * H) },
      { kind: "weekly_scoped", percent: 70, resets_at: iso(NOW + 144 * H), scope: { model: { display_name: "Opus" } } },
      { kind: "something_new", percent: 1 },
    ],
  });
  assert.deepEqual(w.map(x => x.label), ["Session", "Weekly (all models)", "Weekly · Opus"]);
});

test("limits array takes precedence over flat keys", () => {
  const w = normalizeUsage({ limits: [{ kind: "session", percent: 33 }], five_hour: { utilization: 99 } });
  assert.equal(w.length, 1);
  assert.equal(w[0].pct, 33);
});

test("falls back to flat keys when limits array is empty", () => {
  const w = normalizeUsage({ limits: [], five_hour: { utilization: 12 } });
  assert.equal(w[0].pct, 12);
});

test("handles empty, null and junk input", () => {
  assert.deepEqual(normalizeUsage(null), []);
  assert.deepEqual(normalizeUsage({}), []);
  assert.deepEqual(normalizeUsage("x"), []);
  assert.deepEqual(normalizeUsage({ five_hour: { utilization: "abc" } }), []);
});

test("clamps percentages and accepts epoch seconds and ms", () => {
  const secs = Math.floor((NOW + H) / 1000);
  const [a] = normalizeUsage({ five_hour: { utilization: 140, resets_at: secs } });
  assert.equal(a.pct, 100);
  assert.equal(a.resetsAt, secs * 1000);
  const [b] = normalizeUsage({ five_hour: { utilization: -5, resets_at: NOW + H } });
  assert.equal(b.pct, 0);
  assert.equal(b.resetsAt, NOW + H);
});

test("elapsedPct", () => {
  const w = { resetsAt: NOW + 3 * H, windowMs: 5 * H };
  assert.equal(Math.round(elapsedPct(w, NOW)), 40);
  assert.equal(elapsedPct({ ...w, resetsAt: NOW - 1 }, NOW), 100);
  assert.equal(elapsedPct({ windowMs: 5 * H }, NOW), null);
});

test("pace: flags when projected to exceed the limit before reset", () => {
  // 60% used, 40% elapsed -> projected 150%, cap in 1h20m (reset in 3h)
  const p = paceStatus({ pct: 60, resetsAt: NOW + 3 * H, windowMs: 5 * H }, NOW);
  assert.equal(p.ahead, true);
  assert.equal(Math.round(p.projected), 150);
  assert.equal(fmtDuration(p.msToLimit), "1h 20m");
});

test("pace: not flagged when on or under pace", () => {
  assert.equal(paceStatus({ pct: 20, resetsAt: NOW + 4 * H, windowMs: 5 * H }, NOW).ahead, false); // exactly on pace
  assert.equal(paceStatus({ pct: 14, resetsAt: NOW + 120 * H, windowMs: 168 * H }, NOW).ahead, false);
});

test("pace: ignored below 10% used or without a reset time", () => {
  assert.equal(paceStatus({ pct: 9, resetsAt: NOW + 4.9 * H, windowMs: 5 * H }, NOW), null);
  assert.equal(paceStatus({ pct: 50, windowMs: 5 * H }, NOW), null);
});

test("level thresholds", () => {
  assert.equal(level(10, 75), "green");
  assert.equal(level(75, 75), "amber");
  assert.equal(level(90, 75), "red");
});

test("fmtDuration", () => {
  assert.equal(fmtDuration(null), "?");
  assert.equal(fmtDuration(-1), "now");
  assert.equal(fmtDuration(45 * 60e3), "45m");
  assert.equal(fmtDuration(3 * H), "3h 0m");
  assert.equal(fmtDuration(50 * H), "2d 2h");
});
