(() => {
const $ = (s) => document.querySelector(s), APPS = window.HUB_APPS;
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const CACHE = "hub.pushed", TTL = 10 * 60 * 1000; // GitHub unauthenticated limit is 60/hour; cache 10 min
let pushed = JSON.parse(localStorage.getItem(CACHE) || "{}"), asks = "-", toSend = "-";

async function loadPushed(force) {
  await Promise.all(APPS.map(async (a) => {
    const c = pushed[a.repo]; if (!force && c && Date.now() - c.at < TTL) return;
    try { const r = await fetch("https://api.github.com/repos/" + a.repo, { headers: { Accept: "application/vnd.github+json" } });
      if (!r.ok) throw new Error(r.status); pushed[a.repo] = { v: (await r.json()).pushed_at, at: Date.now() };
    } catch (e) { pushed[a.repo] = { v: c?.v || null, at: 0, err: true }; }
  }));
  localStorage.setItem(CACHE, JSON.stringify(pushed));
}
// Open asks for the Brief App. Same origin (webermanapps.github.io), so the brief app's localStorage is readable.
// 1) If the brief app is connected to Dropbox with a live token, read today's brief + taps.  2) Else use the
// count the brief app caches (briefapp.openAsks, Dropbox mode only).  3) Else "-". Only a number is shown.
const today = () => new Date().toLocaleDateString("en-CA");
function countOpen(brief, taps) {
  const last = {}; (taps || []).forEach((t) => { last[t.id] = t.action; });
  const open = (id) => !last[id] || last[id] === "ask"; let n = 0;
  (brief.agents || []).forEach((ag) => (ag.asks || []).forEach((a) => { if (open(ag.id + ":" + a.id)) n++; }));
  return n;
}
const sendOpen = (brief, taps) => { const last = {}; (taps || []).forEach((t) => { last[t.id] = t; });
  return (brief.send_items || []).filter((s) => { const l = last["send:" + s.id]; return !(l && (l.action === "sent" || (l.action === "park" && l.park_date > today()))); }).length; };
async function loadAsks() {
  asks = "-"; toSend = "-";
  try {
    const tok = JSON.parse(localStorage.getItem("briefapp.dbx.token") || "null");
    if (localStorage.getItem("briefapp.mode") === "dropbox" && tok && Date.now() < tok.exp) {
      const dl = async (path) => { const r = await fetch("https://content.dropboxapi.com/2/files/download", { method: "POST", headers: { Authorization: "Bearer " + tok.access, "Dropbox-API-Arg": JSON.stringify({ path }) } }); return r.status === 409 ? null : r.ok ? r.json() : Promise.reject(r.status); };
      const brief = await dl(`/brief-${today()}.json`);
      if (brief) { const local = JSON.parse(localStorage.getItem("briefapp.taps." + brief.date) || "[]"); const all = [...((await dl(`/taps-${brief.date}.json`)) || []), ...local].sort((x, y) => String(x.ts).localeCompare(String(y.ts))); asks = countOpen(brief, all); toSend = sendOpen(brief, all); return; }
    }
    const ok = (k) => { const c = JSON.parse(localStorage.getItem(k) || "null"); return c && c.date === today() && c.mode === "dropbox" && Number.isInteger(c.n) ? c.n : "-"; };
    asks = ok("briefapp.openAsks"); toSend = ok("briefapp.openSends");
  } catch (e) { asks = "-"; toSend = "-"; }
}
function ago(iso) {
  if (!iso) return "-"; const m = Math.round((Date.now() - new Date(iso)) / 60000);
  return m < 1 ? "Just Now" : m < 60 ? m + " min ago" : m < 1440 ? Math.round(m / 60) + " hr ago" : Math.round(m / 1440) + " days ago";
}
function sorted() {
  const by = $("#sort").value, az = (x, y) => x.name.localeCompare(y.name), t = (a) => pushed[a.repo]?.v || "";
  const n = (a) => (a.asks ? (asks === "-" ? 0 : asks) + (toSend === "-" ? 0 : toSend) - (asks === "-" && toSend === "-" ? 1 : 0) : -1);
  return [...APPS].sort(by === "az" ? az : by === "recent" ? (x, y) => t(y).localeCompare(t(x)) || az(x, y) : by === "asks" ? (x, y) => n(y) - n(x) || az(x, y) : (x, y) => (y.pinned ? 1 : 0) - (x.pinned ? 1 : 0) || az(x, y));
}
function render() {
  $("#tiles").innerHTML = sorted().map((a) => {
    const p = pushed[a.repo], v = p?.v, n = a.asks ? asks : "-";
    const txt = a.asks && (asks !== "-" || toSend !== "-") ? `${asks} Asks · ${toSend} To Send` : "-";
    return `<a class="tile card mw-hover" href="${esc(a.url)}" data-app="${esc(a.id)}">
      <h2><span>${esc(a.name)} <span class="arrow" aria-hidden="true">→</span></span><span class="badge${n === "-" || n === 0 ? " zero" : ""}" data-k="asks" title="Open Asks" aria-label="Open: ${esc(txt)}">${esc(txt)}</span></h2>
      <dl><div><dt class="label">Owner</dt><dd data-k="owner">${esc(a.owner)}</dd></div>
      <div><dt class="label">Last Update</dt><dd data-k="updated" title="${esc(v || "")}">${v ? esc(ago(v)) + ` <span class="muted">· ${esc(new Date(v).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }))}</span>` : p?.err ? "Unavailable" : "Loading…"}</dd></div>
      <div><dt class="label">Open</dt><dd data-k="asks-text">${esc(txt)}</dd></div></dl>
      <span class="url muted">${esc(a.url.replace("https://", ""))}</span></a>`;
  }).join("");
  $("#clock").textContent = new Date().toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}
async function refresh(force) { render(); await Promise.all([loadPushed(force), loadAsks()]); render(); }
$("#sort").onchange = render; $("#refresh").onclick = () => refresh(true);
document.addEventListener("visibilitychange", () => { if (!document.hidden) refresh(false); });
setInterval(() => refresh(false), 5 * 60 * 1000);
// Share (brand standard): link + neutral summary only. No phone number.
async function share() {
  const url = location.origin + location.pathname, text = `App hub: ${APPS.length} live apps.`;
  if (navigator.share) { try { await navigator.share({ title: "App Hub", text, url }); return; } catch (e) { if (e && e.name === "AbortError") return; } }
  if (matchMedia("(pointer:coarse)").matches) { location.href = "sms:?&body=" + encodeURIComponent(text + "\n" + url); return; }
  try { await navigator.clipboard.writeText(text + "\n" + url); $("#msg").textContent = "Link Copied"; } catch (e) { $("#msg").textContent = "Copy this link: " + url; }
}
$("#share").onclick = share;
refresh(false);
})();
