// SPDX-License-Identifier: MIT
importScripts("shared.js");

const DEFAULTS = { warnAt: 75, alertAt: 90, showPill: true, notify: true };
const POLL_MINUTES = 5;

async function getSettings() {
  const s = await chrome.storage.sync.get(DEFAULTS);
  return { ...DEFAULTS, ...s };
}

// ---- Fetching (fallback when no claude.ai tab is open) ----------------------

async function getOrgId() {
  const { orgId } = await chrome.storage.local.get("orgId");
  if (orgId) return orgId;
  const res = await fetch("https://claude.ai/api/organizations", { credentials: "include" });
  if (!res.ok) throw new Error("orgs " + res.status);
  const orgs = await res.json();
  const org = (Array.isArray(orgs) ? orgs : []).find(o => (o.capabilities || []).includes("chat")) || orgs[0];
  if (!org?.uuid) throw new Error("no org");
  await chrome.storage.local.set({ orgId: org.uuid });
  return org.uuid;
}

async function fetchUsageDirect() {
  let orgId = await getOrgId();
  let res = await fetch(`https://claude.ai/api/organizations/${orgId}/usage`, { credentials: "include" });
  if (res.status === 403 || res.status === 404) {
    await chrome.storage.local.remove("orgId"); // org may have changed; retry once
    orgId = await getOrgId();
    res = await fetch(`https://claude.ai/api/organizations/${orgId}/usage`, { credentials: "include" });
  }
  if (!res.ok) throw new Error("usage " + res.status);
  return res.json();
}

async function refresh() {
  try {
    const raw = await fetchUsageDirect();
    await ingest(raw, "background");
    return { ok: true };
  } catch (e) {
    await chrome.storage.local.set({ lastError: String(e.message || e), lastErrorAt: Date.now() });
    return { ok: false, error: String(e.message || e) };
  }
}

// ---- Processing --------------------------------------------------------------

async function ingest(raw, source) {
  const windows = normalizeUsage(raw);
  if (!windows.length) throw new Error("unrecognised usage response");
  await chrome.storage.local.set({ windows, updatedAt: Date.now(), source, lastError: null });
  await render(windows);
  await maybeNotify(windows);
}

async function render(windows) {
  const s = await getSettings();
  const session = windows.find(w => w.key === "session") || windows[0];
  const worst = windows.reduce((a, b) => (b.pct > a.pct ? b : a), windows[0]);
  const shown = worst.pct >= s.alertAt && worst !== session ? worst : session;

  const pace = paceStatus(shown);
  const lvl = level(shown.pct, s.warnAt);
  const color = lvl === "red" ? "#d93025" : lvl === "amber" || pace?.ahead ? "#e8a200" : "#1e8e3e";

  await chrome.action.setBadgeText({ text: `${Math.round(shown.pct)}` });
  await chrome.action.setBadgeBackgroundColor({ color });
  if (chrome.action.setBadgeTextColor) await chrome.action.setBadgeTextColor({ color: "#ffffff" });

  const lines = windows.map(w => {
    const p = paceStatus(w);
    return `${w.label}: ${Math.round(w.pct)}% · resets in ${fmtDuration(w.resetsAt - Date.now())}` +
      (p?.ahead ? ` · ⚠ on pace to hit limit in ~${fmtDuration(p.msToLimit)}` : "");
  });
  await chrome.action.setTitle({ title: lines.join("\n") });
}

async function maybeNotify(windows) {
  const s = await getSettings();
  if (!s.notify) return;
  const { notified = {} } = await chrome.storage.local.get("notified");
  const fresh = {};
  for (const w of windows) {
    const period = `${w.key}:${w.resetsAt || "?"}`;
    for (const t of [s.warnAt, s.alertAt]) {
      const id = `${period}:${t}`;
      if (notified[id]) { fresh[id] = true; continue; }
      if (w.pct >= t) {
        fresh[id] = true;
        chrome.notifications.create(id, {
          type: "basic",
          iconUrl: "icon128.png",
          title: `Claude ${w.label} usage at ${Math.round(w.pct)}%`,
          message: `Resets in ${fmtDuration(w.resetsAt - Date.now())}.` +
            (t >= s.alertAt ? " Consider switching to a lighter model or saving heavy tasks for after the reset." : ""),
          priority: t >= s.alertAt ? 2 : 0
        });
      }
    }
    // Pace warning once per window period
    const p = paceStatus(w);
    const paceId = `${period}:pace`;
    if (p?.ahead && w.pct >= 25 && !notified[paceId]) {
      fresh[paceId] = true;
      chrome.notifications.create(paceId, {
        type: "basic",
        iconUrl: "icon128.png",
        title: `Burning Claude ${w.label.toLowerCase()} usage fast`,
        message: `${Math.round(w.pct)}% used; at this rate you'll hit the limit in ~${fmtDuration(p.msToLimit)}, ` +
          `${fmtDuration(w.resetsAt - Date.now() - p.msToLimit)} before it resets.`
      });
    } else if (notified[paceId]) fresh[paceId] = true;
  }
  await chrome.storage.local.set({ notified: fresh }); // drops entries from past periods
}

// ---- Wiring ------------------------------------------------------------------

chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create("poll", { periodInMinutes: POLL_MINUTES });
  refresh();
});
chrome.runtime.onStartup.addListener(() => {
  chrome.alarms.create("poll", { periodInMinutes: POLL_MINUTES });
  refresh();
});
chrome.alarms.onAlarm.addListener(a => { if (a.name === "poll") refresh(); });

chrome.notifications.onClicked.addListener(() => {
  chrome.tabs.create({ url: "https://claude.ai/settings/usage" });
});

chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
  if (msg?.type === "usage-raw") {
    ingest(msg.data, "tab").then(() => reply({ ok: true }), e => reply({ ok: false, error: String(e) }));
    return true;
  }
  if (msg?.type === "refresh") {
    refresh().then(reply);
    return true;
  }
  if (msg?.type === "org-id" && msg.orgId) {
    chrome.storage.local.set({ orgId: msg.orgId });
  }
  if (msg?.type === "settings-changed") {
    chrome.storage.local.get("windows").then(({ windows }) => windows && render(windows));
  }
});
