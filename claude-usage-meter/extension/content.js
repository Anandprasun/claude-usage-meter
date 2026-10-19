// SPDX-License-Identifier: MIT
// Runs on claude.ai. Fetches usage same-origin (most reliable path), forwards it
// to the background worker, and shows a small usage pill on the page.
(() => {
  const POLL_MS = 60 * 1000;
  let orgId = null;
  let settings = { warnAt: 75, alertAt: 90, showPill: true };
  let pill = null;

  function cookie(name) {
    const m = document.cookie.match(new RegExp("(?:^|; )" + name + "=([^;]*)"));
    return m ? decodeURIComponent(m[1]) : null;
  }

  async function resolveOrg() {
    if (orgId) return orgId;
    orgId = cookie("lastActiveOrg");
    if (!orgId) {
      const res = await fetch("/api/organizations", { credentials: "include" });
      if (!res.ok) throw new Error("orgs " + res.status);
      const orgs = await res.json();
      const org = orgs.find(o => (o.capabilities || []).includes("chat")) || orgs[0];
      orgId = org?.uuid || null;
    }
    if (orgId) chrome.runtime.sendMessage({ type: "org-id", orgId });
    return orgId;
  }

  let inflight = false;
  async function poll() {
    if (inflight || document.hidden) return;
    inflight = true;
    try {
      const id = await resolveOrg();
      if (!id) return;
      const res = await fetch(`/api/organizations/${id}/usage`, { credentials: "include" });
      if (res.status === 403 || res.status === 404) { orgId = null; return; }
      if (!res.ok) return;
      const data = await res.json();
      chrome.runtime.sendMessage({ type: "usage-raw", data });
      drawPill(normalizeUsage(data));
    } catch (_) {
      // network blips are fine; next poll will retry
    } finally {
      inflight = false;
    }
  }

  // ---- On-page pill --------------------------------------------------------

  function drawPill(windows) {
    if (!settings.showPill || !windows.length) { pill?.remove(); pill = null; return; }
    if (!pill || !pill.isConnected) {
      const host = document.createElement("div");
      host.id = "claude-usage-meter-pill";
      const root = host.attachShadow({ mode: "open" });
      root.innerHTML = `
        <style>
          .p { position: fixed; right: 14px; bottom: 14px; z-index: 2147483000;
               font: 12px/1.2 system-ui, -apple-system, Segoe UI, sans-serif;
               display: flex; gap: 10px; align-items: center; padding: 6px 10px;
               border-radius: 999px; background: rgba(30,30,30,.86); color: #fff;
               box-shadow: 0 2px 10px rgba(0,0,0,.25); cursor: pointer; user-select: none;
               opacity: .78; transition: opacity .15s; }
          .p:hover { opacity: 1; }
          .w { display: flex; align-items: center; gap: 5px; white-space: nowrap; }
          .bar { width: 38px; height: 5px; border-radius: 3px; background: rgba(255,255,255,.22); overflow: hidden; }
          .bar, .fill { display: block; }
          .fill { height: 100%; }
          .green { background: #34a853; } .amber { background: #f9ab00; } .red { background: #ea4335; }
          .x { margin-left: 2px; opacity: .55; font-size: 13px; }
          .x:hover { opacity: 1; }
        </style>
        <div class="p" title="Open Claude usage settings"></div>`;
      root.querySelector(".p").addEventListener("click", e => {
        if (e.target.classList.contains("x")) {
          chrome.storage.sync.set({ showPill: false });
          return;
        }
        window.open("/settings/usage", "_self");
      });
      document.documentElement.appendChild(host);
      pill = host;
    }
    const box = pill.shadowRoot.querySelector(".p");
    const pick = windows.filter(w => w.key === "session" || w.key === "weekly");
    const list = pick.length ? pick : windows.slice(0, 2);
    box.innerHTML = list.map(w => {
      const pace = paceStatus(w);
      let lvl = level(w.pct, settings.warnAt);
      if (lvl === "green" && pace?.ahead) lvl = "amber";
      const short = w.key === "session" ? "Session" : "Week";
      const warn = pace?.ahead ? " ⚠" : "";
      const tip = `${w.label}: ${Math.round(w.pct)}%, resets in ${fmtDuration(w.resetsAt - Date.now())}` +
        (pace?.ahead ? `; on pace to hit limit in ~${fmtDuration(pace.msToLimit)}` : "");
      return `<span class="w" title="${tip.replace(/[&<>"]/g, c => `&#${c.charCodeAt(0)};`)}">${short} ${Math.round(w.pct)}%${warn}
        <span class="bar"><span class="fill ${lvl}" style="width:${w.pct}%"></span></span></span>`;
    }).join("") + `<span class="x" title="Hide (re-enable from the extension popup)">×</span>`;
  }

  // ---- Triggers --------------------------------------------------------------

  // Re-check shortly after the user sends a message, since that's when usage moves.
  function afterSend() {
    setTimeout(poll, 6000);
    setTimeout(poll, 25000);
  }
  document.addEventListener("keydown", e => {
    if (e.key === "Enter" && !e.shiftKey && !e.isComposing &&
        e.target?.closest?.('[contenteditable="true"], textarea')) afterSend();
  }, true);
  document.addEventListener("click", e => {
    if (e.target?.closest?.('button[aria-label*="Send" i]')) afterSend();
  }, true);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) poll(); });

  chrome.storage.sync.get(settings, s => {
    settings = { ...settings, ...s };
    poll();
  });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "sync") return;
    for (const [k, v] of Object.entries(changes)) settings[k] = v.newValue;
    chrome.storage.local.get("windows", ({ windows }) => windows && drawPill(windows));
  });
  setInterval(poll, POLL_MS);
})();
