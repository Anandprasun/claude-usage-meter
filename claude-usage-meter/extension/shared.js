// SPDX-License-Identifier: MIT
// Shared helpers: turn claude.ai's usage response into a uniform list of windows.
// The usage endpoint is unofficial and its shape has changed over time, so this
// accepts both the older flat keys (five_hour / seven_day / seven_day_<model>)
// and the newer `limits` array (kind / percent / resets_at / scope).

const HOUR = 3600 * 1000;
const WINDOW_MS = { session: 5 * HOUR, weekly: 7 * 24 * HOUR };

function toPct(v) {
  const n = Number(v);
  if (!isFinite(n)) return null;
  return Math.max(0, Math.min(100, n));
}

function toTime(v) {
  if (v == null || v === "") return null;
  if (typeof v === "number") return v < 1e12 ? v * 1000 : v; // epoch s or ms
  const t = Date.parse(v);
  return isNaN(t) ? null : t;
}

function prettyModel(key) {
  const name = key.replace(/^seven_day_/, "").replace(/_/g, " ");
  return name.charAt(0).toUpperCase() + name.slice(1);
}

function normalizeUsage(raw) {
  const out = [];
  if (!raw || typeof raw !== "object") return out;

  if (Array.isArray(raw.limits) && raw.limits.length) {
    for (const l of raw.limits) {
      const pct = toPct(l.percent ?? l.utilization ?? l.used_percentage);
      if (pct == null) continue;
      const resetsAt = toTime(l.resets_at);
      if (l.kind === "session") {
        out.push({ key: "session", label: "Session", pct, resetsAt, windowMs: WINDOW_MS.session });
      } else if (l.kind === "weekly_all") {
        out.push({ key: "weekly", label: "Weekly (all models)", pct, resetsAt, windowMs: WINDOW_MS.weekly });
      } else if (l.kind === "weekly_scoped") {
        const model = l.scope?.model?.display_name || "model";
        out.push({ key: "weekly_" + model.toLowerCase(), label: `Weekly · ${model}`, pct, resetsAt, windowMs: WINDOW_MS.weekly });
      }
    }
    if (out.length) return out;
  }

  const flat = (obj, key, label, windowMs) => {
    if (!obj || typeof obj !== "object") return;
    const pct = toPct(obj.utilization ?? obj.used_percentage ?? obj.percent);
    if (pct == null) return;
    out.push({ key, label, pct, resetsAt: toTime(obj.resets_at), windowMs });
  };
  flat(raw.five_hour, "session", "Session", WINDOW_MS.session);
  flat(raw.seven_day, "weekly", "Weekly (all models)", WINDOW_MS.weekly);
  for (const [k, v] of Object.entries(raw)) {
    if (/^seven_day_/.test(k) && !/oauth|cowork/.test(k)) {
      flat(v, "weekly_" + k.slice(10), `Weekly · ${prettyModel(k)}`, WINDOW_MS.weekly);
    }
  }
  return out;
}

// How far through the window we are (0-100). Used to tell whether usage is
// running ahead of a pace that would last until the reset.
function elapsedPct(w, now = Date.now()) {
  if (!w.resetsAt || !w.windowMs) return null;
  const left = w.resetsAt - now;
  if (left <= 0) return 100;
  return Math.max(0, Math.min(100, ((w.windowMs - left) / w.windowMs) * 100));
}

function paceStatus(w, now = Date.now()) {
  const e = elapsedPct(w, now);
  if (e == null || w.pct < 10) return null;
  // Projected % at reset if usage continues at the current rate.
  const projected = e > 2 ? (w.pct / e) * 100 : null;
  if (projected != null && projected > 102) { // small tolerance so "exactly on pace" isn't flagged
    const msToLimit = ((100 - w.pct) / w.pct) * (w.windowMs * e / 100);
    return { ahead: true, projected, msToLimit };
  }
  return { ahead: false, projected };
}

function level(pct, warnAt) {
  if (pct >= 90) return "red";
  if (pct >= warnAt) return "amber";
  return "green";
}

function fmtDuration(ms) {
  if (ms == null || !isFinite(ms)) return "?";
  if (ms <= 0) return "now";
  const m = Math.round(ms / 60000);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h}h ${m % 60}m`;
  return `${Math.floor(h / 24)}d ${h % 24}h`;
}

if (typeof module !== "undefined") {
  module.exports = { normalizeUsage, elapsedPct, paceStatus, level, fmtDuration };
}
