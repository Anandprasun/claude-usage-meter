// SPDX-License-Identifier: MIT
const DEFAULTS = { warnAt: 75, alertAt: 90, showPill: true, notify: true };
const $ = id => document.getElementById(id);

function esc(s) {
  return String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

async function draw() {
  const s = { ...DEFAULTS, ...(await chrome.storage.sync.get(DEFAULTS)) };
  const { windows, updatedAt, lastError } = await chrome.storage.local.get(["windows", "updatedAt", "lastError"]);
  const box = $("windows");

  if (!windows?.length) {
    box.innerHTML = `<div class="empty">No usage data yet. Open <b>claude.ai</b> while signed in and this fills in within a minute.` +
      (lastError ? `<br><br><span class="sub">Last error: ${esc(lastError)}</span>` : "") + `</div>`;
  } else {
    const now = Date.now();
    box.innerHTML = windows.map(w => {
      const lvl = level(w.pct, s.warnAt);
      const e = elapsedPct(w, now);
      const pace = paceStatus(w, now);
      const tick = e != null ? `<span class="tick" style="left:calc(${e}% - 1px)" title="Even pace: ${Math.round(e)}% of the window has passed"></span>` : "";
      const warn = pace?.ahead
        ? `<div class="warn">⚠ At this rate you'll hit the limit in ~${fmtDuration(pace.msToLimit)}</div>`
        : "";
      return `<div class="win">
        <div class="row"><span>${esc(w.label)}</span><span class="pct">${Math.round(w.pct)}%</span></div>
        <div class="track"><div class="fill ${lvl}" style="width:${w.pct}%"></div>${tick}</div>
        <div class="sub">Resets in ${fmtDuration(w.resetsAt - now)}${e != null ? ` · ${Math.round(e)}% of window elapsed` : ""}</div>
        ${warn}
      </div>`;
    }).join("");
  }
  const age = updatedAt ? Date.now() - updatedAt : null;
  $("updated").textContent = age == null ? "" : age < 60000 ? "Updated just now" : `Updated ${fmtDuration(age)} ago`;

  for (const k of ["warnAt", "alertAt"]) $(k).value = s[k];
  for (const k of ["notify", "showPill"]) $(k).checked = s[k];
}

for (const k of ["warnAt", "alertAt"]) {
  $(k).addEventListener("change", async e => {
    const v = Math.max(10, Math.min(100, parseInt(e.target.value, 10) || DEFAULTS[k]));
    await chrome.storage.sync.set({ [k]: v });
    chrome.runtime.sendMessage({ type: "settings-changed" });
    draw();
  });
}
for (const k of ["notify", "showPill"]) {
  $(k).addEventListener("change", async e => {
    await chrome.storage.sync.set({ [k]: e.target.checked });
    chrome.runtime.sendMessage({ type: "settings-changed" });
  });
}

$("refresh").addEventListener("click", async () => {
  const btn = $("refresh");
  if (btn.dataset.fallback) { chrome.tabs.create({ url: "https://claude.ai" }); return; }
  btn.textContent = "…";
  const r = await chrome.runtime.sendMessage({ type: "refresh" });
  // The background fetch can be blocked; a claude.ai tab always works.
  if (r?.ok) btn.textContent = "Refresh";
  else { btn.textContent = "Open claude.ai"; btn.dataset.fallback = "1"; }
  draw();
});
$("open").addEventListener("click", () => chrome.tabs.create({ url: "https://claude.ai/settings/usage" }));

chrome.storage.onChanged.addListener(draw);
draw();
