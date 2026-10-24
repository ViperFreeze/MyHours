/* MyHours — suivi des heures de prédication, version hors ligne.
   Toutes les données restent dans le navigateur (localStorage).
   Les sorties à venir peuvent être envoyées vers Google Agenda, et les données sauvegardées dans Google Drive
   ou dans un fichier exporté (fusionné sans rien écraser à l'import). */

/* ---------- Cœur : données et fusion (sans DOM, testable) ---------- */
const CarnetCore = (() => {
  const DEFAULT_NAME = "Mon engagement";
  const nowIso = () => new Date().toISOString();

  function normalize(d) {
    d = d && typeof d === "object" ? JSON.parse(JSON.stringify(d)) : {};
    const okEntry = e => e && typeof e.id === "string" && /^\d{4}-\d{2}-\d{2}$/.test(e.date) && Number(e.hours) > 0;
    const okPlan = p => p && typeof p.id === "string" && typeof p.start === "string" && Number(p.hours) > 0;
    const deleted = {};
    if (d.deleted && typeof d.deleted === "object") for (const [k, v] of Object.entries(d.deleted)) if (typeof v === "string") deleted[k] = v;
    return {
      goal: Number(d.goal) > 0 ? Number(d.goal) : 30,
      name: typeof d.name === "string" && d.name.trim() ? d.name : DEFAULT_NAME,
      deadline: typeof d.deadline === "string" ? d.deadline : "",
      defaultHours: Number(d.defaultHours) > 0 && Number(d.defaultHours) <= 24 ? Number(d.defaultHours) : 2,
      settingsUpdated: typeof d.settingsUpdated === "string" ? d.settingsUpdated : "",
      entries: Array.isArray(d.entries) ? d.entries.filter(okEntry).map(e => ({ ...e, hours: Number(e.hours) })) : [],
      planned: Array.isArray(d.planned) ? d.planned.filter(okPlan).map(p => ({ ...p, hours: Number(p.hours) })) : [],
      deleted,
      calRemove: Array.isArray(d.calRemove) ? d.calRemove.filter(x => typeof x === "string") : [],
      lastSync: typeof d.lastSync === "string" ? d.lastSync : "",
      changes: Number.isFinite(d.changes) ? d.changes : 0
    };
  }

  const stamp = x => x.updated || x.created || "";

  /* Fusionne deux carnets : union par identifiant, la version la plus récente gagne,
     les suppressions (pierres tombales) s'appliquent des deux côtés. */
  function merge(local, incoming) {
    const a = normalize(local), b = normalize(incoming);
    const deleted = { ...a.deleted };
    for (const [k, v] of Object.entries(b.deleted)) if (!deleted[k] || v > deleted[k]) deleted[k] = v;
    const union = (x, y) => {
      const m = new Map();
      for (const it of [...x, ...y]) {
        const cur = m.get(it.id);
        if (!cur || stamp(it) > stamp(cur)) m.set(it.id, it);
      }
      return [...m.values()].filter(it => !deleted[it.id]);
    };
    const s = (b.settingsUpdated || "") > (a.settingsUpdated || "") ? b : a;
    const merged = {
      goal: s.goal, name: s.name, deadline: s.deadline, defaultHours: s.defaultHours, settingsUpdated: s.settingsUpdated,
      entries: union(a.entries, b.entries),
      planned: union(a.planned, b.planned),
      deleted,
      calRemove: [...new Set([...a.calRemove, ...b.calRemove])],
      lastSync: a.lastSync, changes: a.changes
    };
    const ids = arr => new Set(arr.map(x => x.id));
    const aE = ids(a.entries), aP = ids(a.planned), bE = ids(b.entries), bP = ids(b.planned);
    const report = {
      addedEntries: merged.entries.filter(e => !aE.has(e.id)).length,
      addedPlanned: merged.planned.filter(p => !aP.has(p.id)).length,
      removed: (a.entries.length + a.planned.length) - (a.entries.filter(e => !deleted[e.id]).length + a.planned.filter(p => !deleted[p.id]).length),
      localOnly: merged.entries.filter(e => !bE.has(e.id)).length + merged.planned.filter(p => !bP.has(p.id)).length
        + Object.keys(a.deleted).filter(k => !b.deleted[k]).length
        + ((a.settingsUpdated || "") > (b.settingsUpdated || "") ? 1 : 0)
    };
    return { merged, report };
  }

  function exportPayload(state) {
    const s = normalize(state);
    delete s.lastSync; delete s.changes;
    return { app: "myhours", format: 1, exportedAt: nowIso(), data: s };
  }

  function parseImport(text) {
    let obj;
    try { obj = JSON.parse(text); } catch (e) { throw new Error("Ce fichier n'est pas un export MyHours (JSON illisible)."); }
    if (!obj || !["myhours", "carnet-benevolat"].includes(obj.app) || !obj.data) throw new Error("Ce fichier ne vient pas de MyHours.");
    if (obj.format > 1) throw new Error("Ce fichier vient d'une version plus récente de l'appli. Mettez cet appareil à jour (rechargez la page en ligne), puis réessayez.");
    return normalize(obj.data);
  }

  return { normalize, merge, exportPayload, parseImport, DEFAULT_NAME };
})();
if (typeof module !== "undefined") module.exports = CarnetCore;

/* ---------- Interface ---------- */
if (typeof document !== "undefined") (function () {
  "use strict";
  const { normalize, merge, exportPayload, parseImport, DEFAULT_NAME } = CarnetCore;
  const $ = s => document.querySelector(s);
  const pad = n => String(n).padStart(2, "0");
  const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const parseYmd = s => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
  const parseLocal = s => { const [a, b = "00:00"] = s.split("T"); const [y, m, d] = a.split("-").map(Number); const [h, mi] = b.split(":").map(Number); return new Date(y, m - 1, d, h || 0, mi || 0); };
  const localIso = d => `${ymd(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}:00`;
  const nf = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 });
  const num = h => nf.format(Math.round(h * 10) / 10);
  const dur = h => { const t = Math.round(h * 60), H = Math.floor(t / 60), M = t % 60; return H ? (M ? `${H} h ${pad(M)}` : `${H} h`) : `${M} min`; };
  const dfDM = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long" });
  const dfWd = new Intl.DateTimeFormat("fr-FR", { weekday: "short" });
  const dfMon = new Intl.DateTimeFormat("fr-FR", { month: "short" });
  const dfMonth = new Intl.DateTimeFormat("fr-FR", { month: "long", year: "numeric" });
  const dfFull = new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long" });
  const dfStamp = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });
  const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));
  const sum = (a, f) => a.reduce((s, x) => s + f(x), 0);
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const cap = s => s.replace(/^./, c => c.toUpperCase());
  const plural = (n, w) => `${n} ${w}${n > 1 ? "s" : ""}`;
  const nowIso = () => new Date().toISOString();
  const DAY = 864e5;
  const LS = "carnet-benevolat-v1";
  const ICO_CAL = '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4M12 13v5M9.5 15.5h5"/></svg>';

  /* Types d'activité : « Prédic » par défaut. */
  const TYPES = ["Prédic", "Étude", "Présentoir"];
  const DEFAULT_TYPE = TYPES[0];
  let curType = DEFAULT_TYPE;
  try { const t = localStorage.getItem(LS + "-type"); if (TYPES.includes(t)) curType = t; } catch (e) {}
  document.querySelectorAll(".type-select").forEach(s => { s.innerHTML = TYPES.map(t => `<option value="${t}">${t}</option>`).join(""); s.value = curType; });

  /* ---------- stockage local ---------- */
  function load() { try { const r = localStorage.getItem(LS); return r ? normalize(JSON.parse(r)) : normalize({}); } catch (e) { return normalize({}); } }
  let state = load();
  let storageOk = true;
  function save() {
    try { localStorage.setItem(LS, JSON.stringify(state)); storageOk = true; }
    catch (e) { storageOk = false; }
    $("#status").textContent = storageOk ? "Données enregistrées sur cet appareil." : "Impossible d'enregistrer sur cet appareil (stockage plein ou bloqué). Exportez vos données dans Réglages pour ne rien perdre.";
  }
  function commit() { state.changes = (state.changes || 0) + 1; save(); render(); }
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});

  /* ---------- thème : automatique, clair ou sombre ---------- */
  const THEME = "myhours-theme";
  const THEMES = {
    auto: { label: "automatique", icon: '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8"/><path d="M12 4a8 8 0 0 1 0 16z" fill="currentColor"/></svg>' },
    light: { label: "clair", icon: '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>' },
    dark: { label: "sombre", icon: '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/></svg>' }
  };
  let theme = "auto";
  try { theme = localStorage.getItem(THEME) || "auto"; } catch (e) {}
  if (!THEMES[theme]) theme = "auto";
  function applyTheme(announce) {
    const root = document.documentElement;
    if (theme === "auto") root.removeAttribute("data-theme"); else root.setAttribute("data-theme", theme);
    const metas = document.querySelectorAll('meta[name="theme-color"]');
    if (theme === "auto") { metas[0] && metas[0].setAttribute("content", "#ECEFF3"); metas[1] && metas[1].setAttribute("content", "#0E141A"); }
    else metas.forEach(m => m.setAttribute("content", theme === "dark" ? "#0E141A" : "#ECEFF3"));
    const b = $("#btn-theme"), t = THEMES[theme];
    b.innerHTML = t.icon;
    b.setAttribute("aria-label", `Thème : ${t.label}. Toucher pour changer`);
    b.title = `Thème : ${t.label}`;
    if (announce) toast(theme === "auto" ? "Thème automatique (suit le téléphone)" : `Thème ${t.label}`);
  }
  $("#btn-theme").addEventListener("click", () => {
    theme = { auto: "light", light: "dark", dark: "auto" }[theme];
    try { localStorage.setItem(THEME, theme); } catch (e) {}
    applyTheme(true);
  });

  /* ---------- calculs (objectif mensuel) ---------- */
  const endOf = p => { const s = parseLocal(p.start); if (p.allDay) { s.setDate(s.getDate() + 1); return s; } return new Date(s.getTime() + p.hours * 36e5); };
  const timeLabel = p => { if (p.allDay) return "Heure libre"; const d = parseLocal(p.start); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
  function weekStart(d) { const x = new Date(d.getFullYear(), d.getMonth(), d.getDate()); x.setDate(x.getDate() - (x.getDay() + 6) % 7); return x; }
  function calc(goal = state.goal) {
    const now = new Date();
    // Le compteur repart à zéro le 1er de chaque mois (l'historique est conservé).
    const month = ymd(now).slice(0, 7);
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59);
    const done = sum(state.entries.filter(e => e.date.slice(0, 7) === month), e => e.hours);
    const plannedH = sum(state.planned.filter(p => p.start.slice(0, 7) === month), p => p.hours);
    const left = Math.max(0, goal - done);
    const dates = state.entries.map(e => parseYmd(e.date)).sort((a, b) => a - b);
    let rate = 0;
    if (dates.length) rate = sum(state.entries, e => e.hours) / (Math.max(7, (now - dates[0]) / DAY + 1) / 7);
    // Moins d'une semaine avant la fin du mois : tout ce qui reste est à faire « cette semaine ».
    const needed = left > 0 ? left / Math.max(1, (monthEnd - now) / (7 * DAY)) : null;
    const elapsed = (now - monthStart) / (monthEnd - monthStart);
    const status = left <= 0 ? "done" : done + plannedH >= goal ? "covered" : done / goal >= elapsed ? "ontrack" : done > 0 ? "behind" : "start";
    return { now, monthEnd, done, plannedH, left, rate, needed, status, pct: Math.min(100, done / goal * 100) };
  }

  /* ---------- rendu ---------- */
  function render() {
    const c = calc();
    $("#h-sub").textContent = `Objectif ${num(state.goal)} h par mois · ${dfMonth.format(c.now)}`;
    $("#f-done").textContent = num(c.done);
    $("#f-of").textContent = `/ ${num(state.goal)} h`;
    $("#k-done").textContent = `${num(c.done)} h`;
    $("#k-left").textContent = `${num(c.left)} h`;
    $("#k-plan").textContent = `${num(c.plannedH)} h`;
    const map = { done: ["ok", "Objectif atteint"], covered: ["info", "Couvert par les sorties prévues"], ontrack: ["ok", "Dans les temps"], behind: ["warn", "En retard sur le rythme"], start: ["info", "À démarrer"] };
    const st = $("#f-status");
    if (c.status && map[c.status]) { st.className = "chip " + map[c.status][0]; st.textContent = map[c.status][1]; }
    else { st.className = "chip"; st.textContent = `${Math.round(c.pct)} %`; }
    renderCells(c);
    renderTodo(c); renderUpcoming(c); renderHistory(); renderStats(c); renderCal(); renderDay(); renderReset(); renderSyncState(); updatePreview();
  }
  function renderCells(c) {
    const goal = state.goal;
    const unit = goal <= 60 ? 1 : goal <= 150 ? 2 : goal <= 400 ? 5 : 10;
    const n = Math.ceil(goal / unit);
    const g = $("#cells");
    g.style.gridTemplateColumns = n <= 30 ? `repeat(auto-fill,minmax(${n <= 15 ? 28 : 22}px,1fr))` : "repeat(auto-fill,minmax(16px,1fr))";
    let html = "";
    for (let i = 0; i < n; i++) {
      const capH = Math.min(unit, goal - i * unit);
      const d = Math.max(0, Math.min(1, (c.done - i * unit) / capH));
      const p = Math.max(0, Math.min(1 - d, (c.done + c.plannedH - i * unit) / capH - d));
      html += `<div class="cell"${n > 30 ? ' style="height:20px"' : ""}>${d > 0 ? `<span class="d" style="width:${d * 100}%"></span>` : ""}${p > 0 ? `<span class="p" style="left:${d * 100}%;width:${p * 100}%"></span>` : ""}</div>`;
    }
    g.innerHTML = html;
    $("#scale").innerHTML = `<span>0 h</span><span>1 case = ${unit} h</span><span>${num(goal)} h</span>`;
  }
  const dateBlock = d => `<div class="date">${esc(dfWd.format(d).replace(".", ""))}<b>${d.getDate()}</b>${esc(dfMon.format(d).replace(".", ""))}</div>`;

  /* Lien Google Agenda pré-rempli (sans compte configuré : un événement à confirmer à la main). */
  function gcalUrl(p) {
    const s = parseLocal(p.start), e = endOf(p);
    const f = p.allDay ? d => `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}` : d => `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}T${pad(d.getHours())}${pad(d.getMinutes())}00`;
    const q = new URLSearchParams({ action: "TEMPLATE", text: p.title, dates: `${f(s)}/${f(e)}`, details: `${p.title} · ${dur(p.hours)} · ${state.name}` });
    try { q.set("ctz", Intl.DateTimeFormat().resolvedOptions().timeZone); } catch (err) {}
    if (p.location) q.set("location", p.location);
    return "https://calendar.google.com/calendar/render?" + q.toString();
  }
  const calLink = (p, label) => `<a class="sbtn cal" data-act="gcal" href="${esc(gcalUrl(p))}" target="_blank" rel="noopener" aria-label="Ajouter à Google Agenda">${ICO_CAL}${label}</a>`;

  /* ---------- Google Agenda : toutes les sorties à venir envoyées en un bouton ----------
     API Google Agenda appelée depuis le navigateur, sans serveur. Chaque sortie a un identifiant d'événement
     fixe, dérivé du sien : renvoyer met l'événement à jour au lieu de créer un doublon. Les sorties annulées
     après un envoi sont notées dans calRemove et retirées de l'agenda à l'envoi suivant. */
  const GCID = LS + "-gcid";
  const getGcid = () => { try { return localStorage.getItem(GCID) || ""; } catch (e) { return ""; } };
  const setGcid = v => { try { v ? localStorage.setItem(GCID, v) : localStorage.removeItem(GCID); } catch (e) {} };
  const gEventId = id => ("mh" + id.toLowerCase().replace(/[^a-v0-9]/g, "")).padEnd(5, "0");
  let gToken = null, gTokenExp = 0;
  function loadGis() {
    if (window.google && google.accounts && google.accounts.oauth2) return Promise.resolve();
    return new Promise((ok, ko) => {
      const s = document.createElement("script");
      s.src = "https://accounts.google.com/gsi/client"; s.async = true;
      s.onload = ok; s.onerror = () => { s.remove(); ko(new Error("Impossible de joindre Google. Vérifiez la connexion.")); };
      document.head.appendChild(s);
    });
  }
  async function gAuth() {
    if (gToken && Date.now() < gTokenExp) return;
    await loadGis();
    await new Promise((ok, ko) => {
      google.accounts.oauth2.initTokenClient({
        client_id: getGcid(), scope: "https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/drive.appdata",
        callback: r => { if (r.error) { ko(new Error("Connexion Google refusée.")); return; } gToken = r.access_token; gTokenExp = Date.now() + (r.expires_in - 60) * 1000; ok(); },
        error_callback: () => ko(new Error("Connexion Google annulée."))
      }).requestAccessToken({ prompt: "" });
    });
  }
  const gApi = (method, path, body) => fetch("https://www.googleapis.com/calendar/v3/calendars/primary/events" + path, {
    method, headers: { Authorization: "Bearer " + gToken, "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined
  });
  /* Sauvegarde dans Google Drive, dans le dossier caché propre à l'appli (appDataFolder) :
     un seul fichier, invisible dans le Drive, et l'appli n'a accès à rien d'autre. */
  const BACKUP = "myhours-sauvegarde.json";
  const LASTB = LS + "-lastbackup";
  const gFetch = async (url, opts = {}) => {
    const r = await fetch(url, { ...opts, headers: { Authorization: "Bearer " + gToken, ...(opts.headers || {}) } });
    if (r.status === 401) { gToken = null; throw new Error("Connexion Google expirée : réessayez."); }
    return r;
  };
  async function backupFileId() {
    const q = new URLSearchParams({ spaces: "appDataFolder", q: `name='${BACKUP}'`, fields: "files(id,modifiedTime)", orderBy: "modifiedTime desc" });
    const r = await gFetch("https://www.googleapis.com/drive/v3/files?" + q);
    if (!r.ok) throw new Error("Google Drive inaccessible. Vérifiez que l'API Google Drive est activée.");
    const f = (await r.json()).files || [];
    return f.length ? f[0] : null;
  }
  async function gBackup() {
    const body = JSON.stringify(exportPayload(state));
    const f = await backupFileId();
    let r;
    if (f) r = await gFetch(`https://www.googleapis.com/upload/drive/v3/files/${f.id}?uploadType=media`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body });
    else {
      const meta = JSON.stringify({ name: BACKUP, parents: ["appDataFolder"], mimeType: "application/json" }), b = "myhours" + Date.now();
      r = await gFetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart", {
        method: "POST", headers: { "Content-Type": `multipart/related; boundary=${b}` },
        body: `--${b}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n--${b}\r\nContent-Type: application/json\r\n\r\n${body}\r\n--${b}--`
      });
    }
    if (!r.ok) throw new Error("La sauvegarde Google Drive a échoué.");
    try { localStorage.setItem(LASTB, nowIso()); } catch (e) {}
    renderBackup();
  }
  async function gRestore() {
    const f = await backupFileId();
    if (!f) throw new Error("Aucune sauvegarde trouvée dans Google Drive.");
    const r = await gFetch(`https://www.googleapis.com/drive/v3/files/${f.id}?alt=media`);
    if (!r.ok) throw new Error("Lecture de la sauvegarde impossible.");
    const obj = await r.json();
    if (!obj || obj.app !== "myhours" || !obj.data) throw new Error("La sauvegarde est illisible.");
    state = normalize(obj.data);
    return obj.savedAt || obj.exportedAt;
  }
  function renderBackup() {
    let last = ""; try { last = localStorage.getItem(LASTB) || ""; } catch (e) {}
    $("#b-hint").textContent = (last ? `Dernière sauvegarde depuis cet appareil : ${dfStamp.format(new Date(last))}. ` : "Pas encore de sauvegarde depuis cet appareil. ")
      + "Une copie est aussi faite à chaque envoi vers Google Agenda.";
  }
  const needGoogle = () => {
    if (!getGcid()) { toast("Ajoutez d'abord votre ID client Google dans Réglages."); openDrawer("settings"); $("#s-gcid").focus(); window.scrollTo({ top: 0, behavior: "smooth" }); return true; }
    if (!navigator.onLine) { toast("Pas de réseau : réessayez une fois connecté."); return true; }
    return false;
  };
  async function busy(btn, label, fn) {
    const orig = btn.dataset.armed === "1" ? btn.dataset.orig : btn.textContent;
    btn.dataset.armed = "0"; btn.disabled = true; btn.textContent = label;
    try { await gAuth(); await fn(); } catch (e) { toast(e.message || "Opération Google impossible."); }
    finally { btn.disabled = false; btn.textContent = orig; }
  }

  function gEvent(p) {
    const s = parseLocal(p.start), e = endOf(p);
    let tz = "Europe/Paris"; try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || tz; } catch (err) {}
    const when = p.allDay ? { start: { date: ymd(s) }, end: { date: ymd(e) } } : { start: { dateTime: localIso(s), timeZone: tz }, end: { dateTime: localIso(e), timeZone: tz } };
    return { id: gEventId(p.id), summary: p.title, location: p.location || "", description: `${p.title} · ${dur(p.hours)} · ${state.name}\nAjouté par MyHours.`, status: "confirmed", ...when };
  }
  async function gSync() {
    const btn = $("#gcal-sync");
    if (needGoogle()) return;
    btn.disabled = true;
    let sent = 0, removed = 0, failed = 0;
    try {
      await gAuth();
      const expired = r => { if (r.status === 401) { gToken = null; throw new Error("Connexion Google expirée : touchez à nouveau le bouton."); } return r; };
      for (const p of state.planned.filter(p => endOf(p) > new Date())) {
        const ev = gEvent(p);
        let r = expired(await gApi("PUT", "/" + ev.id, ev));
        if (r.status === 404) r = expired(await gApi("POST", "", ev));
        if (r.ok) { sent++; p.calAdded = true; } else failed++;
      }
      for (const id of [...state.calRemove]) {
        const r = expired(await gApi("DELETE", "/" + gEventId(id)));
        if (r.ok || r.status === 404 || r.status === 410) { state.calRemove = state.calRemove.filter(x => x !== id); removed++; } else failed++;
      }
      save();
      const backed = await gBackup().then(() => true, () => false);
      toast((failed ? `${failed} sortie(s) n'ont pas pu être envoyées. Réessayez.`
        : `Google Agenda à jour : ${plural(sent, "sortie")} à venir` + (removed ? `, ${removed} retirée${removed > 1 ? "s" : ""}` : ""))
        + (backed ? " · sauvegarde Drive faite" : " · sauvegarde Drive impossible"));
    } catch (e) {
      toast(e.message || "Envoi vers Google Agenda impossible.");
    } finally {
      save(); render();
      btn.disabled = false;
    }
  }

  function renderTodo(c) {
    const past = state.planned.filter(p => endOf(p) <= c.now).sort((a, b) => a.start.localeCompare(b.start));
    $("#todo-box").hidden = !past.length;
    $("#todo-list").innerHTML = past.map(p => {
      const d = parseLocal(p.start);
      return `<div class="item" data-id="${esc(p.id)}">${dateBlock(d)}
        <div class="what"><div class="t">${esc(p.title)}</div><div class="s"><span>${timeLabel(p)}</span>${p.location ? `<span>${esc(p.location)}</span>` : ""}</div></div>
        <div class="dur">${dur(p.hours)}</div>
        <div class="acts"><label class="label" for="v-${esc(p.id)}">Heures faites</label><input class="mini num" id="v-${esc(p.id)}" type="number" min="0.25" max="24" step="0.25" inputmode="decimal" value="${p.hours}">
        <button class="sbtn go" data-act="validate">Valider</button><button class="sbtn" data-act="skip" data-confirm="Confirmer">Pas faite</button></div></div>`;
    }).join("");
  }
  function renderUpcoming(c) {
    const up = state.planned.filter(p => endOf(p) > c.now).sort((a, b) => a.start.localeCompare(b.start));
    // Total des heures prévues sur le mois en cours (du 1er au dernier jour du mois).
    const monthKey = ymd(c.now).slice(0, 7), monthName = dfMonth.format(c.now).split(" ")[0];
    const monthH = sum(state.planned.filter(p => p.start.slice(0, 7) === monthKey), p => p.hours);
    const um = $("#up-month");
    um.textContent = monthH ? `${dur(monthH)} prévues en ${monthName}` : `Rien de prévu en ${monthName}`;
    um.classList.toggle("has", monthH > 0);
    const linked = !!getGcid();
    $("#up-list").innerHTML = up.length ? up.map(p => {
      const d = parseLocal(p.start);
      return `<div class="item" data-id="${esc(p.id)}">${dateBlock(d)}
        <div class="what"><div class="t">${esc(p.title)}</div><div class="s"><span>${timeLabel(p)}</span>${p.location ? `<span>${esc(p.location)}</span>` : ""}${p.calAdded ? '<span class="chip info">Dans l\'agenda</span>' : ""}</div></div>
        <div class="dur">${dur(p.hours)}</div>
        <div class="acts">${linked ? "" : calLink(p, "Agenda")}
        <button class="sbtn del" data-act="cancel" data-confirm="Confirmer">Annuler</button></div></div>`;
    }).join("") : `<p class="empty">Aucune sortie prévue. Planifiez-en une ci-dessus, ou touchez un jour à venir dans le calendrier de l'onglet <b>Saisir</b>.</p>`;
  }
  function renderHistory() {
    const e = [...state.entries].sort((a, b) => b.date.localeCompare(a.date) || String(b.created || "").localeCompare(String(a.created || "")));
    if (!e.length) { $("#hist-list").innerHTML = `<p class="empty">Aucune heure saisie pour l'instant. Ajoutez votre première sortie dans l'onglet <b>Saisir</b>.</p>`; return; }
    const groups = {};
    e.forEach(x => { (groups[x.date.slice(0, 7)] = groups[x.date.slice(0, 7)] || []).push(x); });
    let html = "";
    Object.keys(groups).sort().reverse().forEach(k => {
      const [y, m] = k.split("-").map(Number);
      html += `<div class="month"><span>${esc(dfMonth.format(new Date(y, m - 1, 1)))}</span><span class="num">${num(sum(groups[k], x => x.hours))} h</span></div>`;
      groups[k].forEach(x => {
        html += `<div class="item" data-eid="${esc(x.id)}">${dateBlock(parseYmd(x.date))}
          <div class="what"><div class="t">${esc(TYPES.includes(x.note) ? x.note : (x.note || DEFAULT_TYPE))}</div><div class="s">${x.source === "planning" ? '<span class="chip info">Prévue</span>' : ""}</div></div>
          <div class="dur">${dur(x.hours)}</div>
          <div class="acts"><button class="sbtn del" data-act="del-entry" data-confirm="Confirmer la suppression">Supprimer</button></div></div>`;
      });
    });
    $("#hist-list").innerHTML = html;
  }
  function renderStats(c) {
    const e = state.entries, now = c.now;
    const avg = e.length ? sum(e, x => x.hours) / e.length : 0;
    const kp = [
      [e.length, e.length > 1 ? "sorties réalisées" : "sortie réalisée"],
      [e.length ? dur(avg) : "–", "en moyenne par sortie"],
      [`${num(c.done)} h`, `en ${dfMonth.format(now).split(" ")[0]}`],
      [c.rate ? dur(c.rate) : "–", "par semaine en moyenne"],
      [c.left > 0 ? `${num(c.left)} h` : "Atteint", "restantes ce mois-ci"],
      [c.needed != null ? dur(c.needed) : "–", "par semaine pour finir le mois"]
    ];
    $("#kpis").innerHTML = kp.map(([v, l]) => `<div class="kpi"><b class="num">${esc(v)}</b><span>${esc(l)}</span></div>`).join("");

    const ws = weekStart(now), weeks = [];
    for (let i = 7; i >= 0; i--) { const s = new Date(ws); s.setDate(s.getDate() - 7 * i); weeks.push({ s, h: 0 }); }
    e.forEach(x => { const k = weekStart(parseYmd(x.date)).getTime(); const w = weeks.find(w => w.s.getTime() === k); if (w) w.h += x.hours; });
    const pace = c.needed;
    const maxV = Math.max(1, ...weeks.map(w => w.h), pace || 0);
    const step = maxV <= 4 ? 1 : maxV <= 10 ? 2 : maxV <= 25 ? 5 : 10;
    const top = Math.ceil(maxV / step) * step;
    const W = 360, H = 200, L = 26, R = 4, T = 16, B = 32, cw = (W - L - R) / weeks.length, bw = Math.min(28, cw * .62);
    const y = v => T + (H - T - B) * (1 - v / top);
    let svg = `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Heures par semaine sur les 8 dernières semaines">`;
    for (let v = 0; v <= top; v += step) svg += `<line class="grid-l" x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}"/><text x="${L - 6}" y="${y(v) + 4}" text-anchor="end">${v}</text>`;
    weeks.forEach((w, i) => {
      const cx = L + cw * i + cw / 2, cur = i === weeks.length - 1;
      if (w.h > 0) {
        svg += `<rect class="bar${cur ? " cur" : ""}" x="${cx - bw / 2}" y="${y(w.h)}" width="${bw}" height="${Math.max(1, y(0) - y(w.h))}" rx="3"/>`;
        svg += `<text class="val" x="${cx}" y="${y(w.h) - 5}" text-anchor="middle">${num(w.h)}</text>`;
      }
      svg += `<text x="${cx}" y="${H - B + 16}" text-anchor="middle">${w.s.getDate()}/${pad(w.s.getMonth() + 1)}</text>`;
      if (cur) svg += `<text x="${cx}" y="${H - B + 29}" text-anchor="middle">en cours</text>`;
    });
    if (pace) svg += `<line class="pace-l" x1="${L}" x2="${W - R}" y1="${y(pace)}" y2="${y(pace)}"/>`;
    $("#chart").innerHTML = svg + "</svg>";
    $("#chart-hint").textContent = "8 dernières semaines, du lundi au dimanche" + (pace ? ` · pointillés : rythme à tenir pour finir le mois (${dur(pace)} par semaine)` : "");

    const names = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"], wd = [0, 0, 0, 0, 0, 0, 0];
    e.forEach(x => { wd[(parseYmd(x.date).getDay() + 6) % 7] += x.hours; });
    const mw = Math.max(...wd);
    $("#weekdays").innerHTML = e.length
      ? wd.map((v, i) => `<div class="wd"><span>${names[i]}</span><div class="tr"><span style="width:${mw ? v / mw * 100 : 0}%"></span></div><span class="v num">${v ? num(v) + " h" : "–"}</span></div>`).join("")
      : `<p class="empty">Les statistiques apparaîtront après votre première sortie.</p>`;
  }

  /* ---------- remise à zéro (toutes les heures ou un mois) ---------- */
  const monthLabel = k => { const [y, m] = k.split("-").map(Number); return cap(dfMonth.format(new Date(y, m - 1, 1))); };
  const resetTargets = v => state.entries.filter(e => v === "all" || e.date.slice(0, 7) === v);
  function disarmReset() { const b = $("#r-go"); if (b.dataset.armed === "1") { b.dataset.armed = "0"; b.textContent = b.dataset.orig; } }
  function renderReset() {
    const sel = $("#r-scope"), prev = sel.value;
    const months = {};
    state.entries.forEach(e => { const k = e.date.slice(0, 7); months[k] = (months[k] || 0) + e.hours; });
    let html = `<option value="all">Toutes les heures (${num(sum(state.entries, e => e.hours))} h)</option>`;
    Object.keys(months).sort().reverse().forEach(k => { html += `<option value="${k}">${esc(monthLabel(k))} (${num(months[k])} h)</option>`; });
    sel.innerHTML = html;
    if ([...sel.options].some(o => o.value === prev)) sel.value = prev;
    updateResetHint();
  }
  function updateResetHint() {
    const list = resetTargets($("#r-scope").value), n = list.length;
    $("#r-go").disabled = !n;
    $("#r-hint").textContent = n
      ? `${num(sum(list, e => e.hours))} h sur ${plural(n, "saisie")} seront effacées.`
      : "Aucune heure à effacer.";
  }
  $("#r-scope").addEventListener("change", () => { disarmReset(); updateResetHint(); });
  $("#r-go").addEventListener("click", ev => {
    const btn = ev.currentTarget, v = $("#r-scope").value, list = resetTargets(v);
    if (!list.length) return;
    if (!armed(btn)) return;
    disarmReset();
    const ids = new Set(list.map(e => e.id)), h = sum(list, e => e.hours);
    state.entries = state.entries.filter(e => !ids.has(e.id));
    ids.forEach(id => tomb(id));
    commit();
    toast(v === "all" ? `Toutes les heures remises à zéro (${num(h)} h)` : `${monthLabel(v)} remis à zéro (${num(h)} h)`, () => {
      // Restaurées sous de nouveaux identifiants (les anciens restent marqués comme supprimés).
      const t = nowIso();
      list.forEach(e => state.entries.push({ ...e, id: uid(), updated: t }));
      commit(); toast("Remise à zéro annulée");
    });
  });

  /* ---------- onglets ---------- */
  const TABS = ["log", "plan", "stats", "hist"];
  function showTab(t) {
    TABS.forEach(k => { $("#t-" + k).setAttribute("aria-selected", String(k === t)); $("#p-" + k).hidden = k !== t; });
    try { localStorage.setItem(LS + "-tab", t); } catch (e) {}
  }
  TABS.forEach(k => $("#t-" + k).addEventListener("click", () => showTab(k)));
  let startTab = "log";
  try { startTab = localStorage.getItem(LS + "-tab") || "log"; } catch (e) {}
  showTab(TABS.includes(startTab) ? startTab : "log");

  /* ---------- puces de durée (formulaires) ---------- */
  document.querySelectorAll(".chips[data-for]").forEach(box => {
    const inp = document.getElementById(box.dataset.for);
    [1, 1.5, 2, 3, 4].forEach(v => {
      const b = document.createElement("button");
      b.type = "button"; b.className = "dchip"; b.textContent = dur(v); b.dataset.h = v;
      b.addEventListener("click", () => { inp.value = v; inp.dispatchEvent(new Event("input")); });
      box.appendChild(b);
    });
    const sync = () => box.querySelectorAll(".dchip").forEach(b => b.setAttribute("aria-pressed", String(+b.dataset.h === +inp.value)));
    inp.addEventListener("input", sync); sync();
  });

  /* ---------- puces de type (saisie rapide) ---------- */
  const qType = $("#q-type");
  TYPES.forEach(t => {
    const b = document.createElement("button");
    b.type = "button"; b.className = "dchip"; b.textContent = t; b.dataset.type = t;
    b.addEventListener("click", () => setType(t));
    qType.appendChild(b);
  });
  function setType(t) {
    curType = t;
    try { localStorage.setItem(LS + "-type", t); } catch (e) {}
    syncTypeChips();
  }
  function syncTypeChips() {
    qType.querySelectorAll(".dchip").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.type === curType)));
    document.querySelectorAll(".type-select").forEach(s => { s.value = curType; });
  }
  document.querySelectorAll(".type-select").forEach(s => s.addEventListener("change", () => setType(s.value)));
  syncTypeChips();

  let tt;
  function toast(m, undo) {
    const t = $("#toast");
    t.innerHTML = "";
    const span = document.createElement("span"); span.textContent = m; t.appendChild(span);
    if (undo) {
      const b = document.createElement("button"); b.type = "button"; b.textContent = "Annuler";
      b.addEventListener("click", () => { clearTimeout(tt); t.classList.remove("on"); undo(); }, { once: true });
      t.appendChild(b);
    }
    t.classList.add("on"); clearTimeout(tt);
    tt = setTimeout(() => t.classList.remove("on"), undo ? 6000 : 2800);
  }
  applyTheme(false);

  /* ---------- tiroir des réglages ---------- */
  function openDrawer(which) {
    const set = which === "settings";
    $("#settings").hidden = !set; $("#btn-settings").setAttribute("aria-expanded", String(set));
    if (set) {
      $("#s-name").value = state.name === DEFAULT_NAME ? "" : state.name;
      $("#s-goal").value = state.goal;
      $("#s-gcid").value = getGcid();
      $("#s-err").hidden = true; $("#x-msg").hidden = true;
      setDefaultChips(state.defaultHours);
      updateSettingsSum(); renderBackup(); renderSyncState(); disarmReset(); renderReset();
    }
  }
  $("#btn-settings").addEventListener("click", () => openDrawer($("#settings").hidden ? "settings" : null));
  $("#s-cancel").addEventListener("click", () => { openDrawer(null); $("#btn-settings").focus(); });
  document.addEventListener("keydown", ev => {
    if (ev.key === "Escape" && !$("#settings").hidden) { openDrawer(null); $("#btn-settings").focus(); }
  });

  /* Durée par défaut : une rangée de pastilles, une seule active. */
  const DEFAULT_CHOICES = [0.5, 1, 1.5, 2, 2.5, 3, 4, 5, 6, 8];
  let pickedDefault = 2;
  function setDefaultChips(v) {
    pickedDefault = v;
    const vals = [...new Set([...DEFAULT_CHOICES, v])].sort((a, b) => a - b);
    $("#s-default-chips").innerHTML = vals.map(x =>
      `<button type="button" class="dchip" role="radio" aria-checked="${x === v}" tabindex="${x === v ? 0 : -1}" data-h="${x}">${dur(x)}</button>`).join("");
  }
  function focusDefaultChip() { const b = $(`#s-default-chips [data-h="${pickedDefault}"]`); if (b) b.focus(); }
  $("#s-default-chips").addEventListener("click", ev => {
    const b = ev.target.closest(".dchip"); if (!b) return;
    setDefaultChips(+b.dataset.h); focusDefaultChip();
  });
  $("#s-default-chips").addEventListener("keydown", ev => {
    const keys = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };
    if (!(ev.key in keys)) return;
    ev.preventDefault();
    const btns = [...$("#s-default-chips").querySelectorAll(".dchip")];
    const i = btns.findIndex(b => +b.dataset.h === pickedDefault);
    const next = btns[Math.min(btns.length - 1, Math.max(0, i + keys[ev.key]))];
    setDefaultChips(+next.dataset.h); focusDefaultChip();
  });

  /* Résumé en direct : ce que l'objectif saisi implique pour le mois en cours, avant d'enregistrer. */
  const readGoal = () => parseFloat(String($("#s-goal").value).replace(",", "."));
  function updateSettingsSum() {
    const g = readGoal(), out = $("#s-sum");
    if (!(g > 0)) { out.textContent = "Indiquez le nombre d'heures visées chaque mois."; return; }
    const c = calc(g);
    out.textContent = c.left <= 0
      ? `Avec ${num(c.done)} h faites ce mois-ci, cet objectif est déjà atteint.`
      : `${c.done ? `${num(c.done)} h faites ce mois-ci, il en reste ${num(c.left)}` : `Il reste ${num(c.left)} h à faire ce mois-ci`}, soit environ ${dur(c.needed)} par semaine d'ici la fin du mois.`;
  }
  $("#s-goal").addEventListener("input", () => { $("#s-err").hidden = true; updateSettingsSum(); });

  $("#settings").addEventListener("submit", ev => {
    ev.preventDefault();
    const g = readGoal();
    if (!(g > 0) || g > 2000) {
      const err = $("#s-err");
      err.textContent = "L'objectif doit être compris entre 1 et 2000 heures par mois.";
      err.hidden = false; $("#s-goal").focus(); return;
    }
    state.goal = Math.round(g * 2) / 2;
    state.name = $("#s-name").value.trim() || DEFAULT_NAME;
    state.defaultHours = pickedDefault;
    setGcid($("#s-gcid").value.trim());
    if (getGcid() && navigator.onLine) loadGis().catch(() => {});
    state.settingsUpdated = nowIso();
    openDrawer(null); commit(); toast("Réglages enregistrés");
  });

  /* ---------- fichier de sauvegarde : export / import fusionné ---------- */
  function xmsg(t, ok) { const m = $("#x-msg"); m.hidden = !t; m.textContent = t || ""; m.className = "msg" + (ok ? " okm" : ""); }
  function renderSyncState() {
    const ch = state.changes || 0;
    const last = state.lastSync ? `Dernier export ou import : ${dfStamp.format(new Date(state.lastSync))}.` : "Aucun export pour l'instant.";
    $("#x-state").textContent = `${last} ${ch ? `${plural(ch, "modification")} depuis.` : "Rien de nouveau depuis."}`;
  }
  $("#x-export").addEventListener("click", async () => {
    const json = JSON.stringify(exportPayload(state), null, 2);
    const name = `myhours-${ymd(new Date())}.json`;
    let file = null;
    try { file = new File([json], name, { type: "application/json" }); } catch (e) {}
    try {
      if (file && navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: "MyHours" });
      } else {
        const url = URL.createObjectURL(new Blob([json], { type: "application/json" }));
        const a = document.createElement("a"); a.href = url; a.download = name;
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 4000);
      }
    } catch (e) {
      if (e && e.name === "AbortError") return;
      xmsg("L'export n'a pas pu être envoyé. Réessayez, ou utilisez un autre navigateur."); return;
    }
    state.lastSync = nowIso(); state.changes = 0; save(); render();
    xmsg(`Fichier « ${name} » créé. Importez-le sur votre autre appareil, ou gardez-le comme sauvegarde.`, true);
  });
  $("#x-import").addEventListener("click", () => { $("#x-file").value = ""; $("#x-file").click(); });
  $("#x-file").addEventListener("change", async () => {
    const f = $("#x-file").files && $("#x-file").files[0];
    if (!f) return;
    let incoming;
    try { incoming = parseImport(await f.text()); }
    catch (e) { xmsg(e.message || "Ce fichier n'a pas pu être lu."); return; }
    const { merged, report } = merge(state, incoming);
    state = merged; state.lastSync = nowIso(); state.changes = report.localOnly;
    save(); render();
    const parts = [];
    if (report.addedEntries) parts.push(`${plural(report.addedEntries, "saisie")} ajoutée${report.addedEntries > 1 ? "s" : ""}`);
    if (report.addedPlanned) parts.push(`${plural(report.addedPlanned, "sortie")} prévue${report.addedPlanned > 1 ? "s" : ""} ajoutée${report.addedPlanned > 1 ? "s" : ""}`);
    if (report.removed) parts.push(`${plural(report.removed, "suppression")} appliquée${report.removed > 1 ? "s" : ""}`);
    let txt = parts.length ? `Import terminé : ${parts.join(", ")}.` : "Import terminé : ce carnet était déjà à jour.";
    if (report.localOnly) txt += " Cet appareil a aussi des données que l'autre n'a pas : exportez maintenant et importez le fichier là-bas pour que les deux soient identiques.";
    xmsg(txt, true);
  });

  /* ---------- calendrier de saisie ---------- */
  function quickValues() {
    const def = state.defaultHours, out = [def];
    for (const v of [1, 1.5, 2, 3]) { if (out.length >= 3) break; if (!out.includes(v)) out.push(v); }
    return out.sort((a, b) => a - b);
  }
  const today = () => ymd(new Date());
  const isFuture = date => date > today();
  const short = h => { const t = Math.round(h * 60), H = Math.floor(t / 60), M = t % 60; return H ? (M ? `${H}h${pad(M)}` : `${H}h`) : `${M}m`; };
  let sel = today();
  let view = (() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); })();

  function byDay() {
    const done = {}, plan = {};
    state.entries.forEach(e => { done[e.date] = (done[e.date] || 0) + e.hours; });
    state.planned.forEach(p => { const k = p.start.slice(0, 10); plan[k] = (plan[k] || 0) + p.hours; });
    return { done, plan };
  }
  function renderCal() {
    const { done, plan } = byDay();
    const y = view.getFullYear(), m = view.getMonth(), t = today();
    $("#cal-month").textContent = dfMonth.format(view);
    const key = `${y}-${pad(m + 1)}`;
    const mDone = sum(Object.entries(done).filter(([k]) => k.startsWith(key)), ([, v]) => v);
    const mPlan = sum(Object.entries(plan).filter(([k]) => k.startsWith(key)), ([, v]) => v);
    $("#cal-sum").textContent = (mDone || mPlan) ? [mDone ? `${num(mDone)} h réalisées` : "", mPlan ? `${num(mPlan)} h prévues` : ""].filter(Boolean).join(" · ") : "Aucune heure ce mois-ci";
    const first = new Date(y, m, 1), lead = (first.getDay() + 6) % 7;
    const days = new Date(y, m + 1, 0).getDate();
    const cells = Math.ceil((lead + days) / 7) * 7;
    let html = "";
    for (let i = 0; i < cells; i++) {
      const d = new Date(y, m, 1 - lead + i), k = ymd(d), out = d.getMonth() !== m;
      const dh = done[k] || 0, ph = plan[k] || 0;
      const lvl = dh ? (dh < 2 ? "l1" : dh < 4 ? "l2" : "l3") : "";
      const cls = ["cd", out && "out", lvl, ph && "plan", k === t && "today", k === sel && "sel"].filter(Boolean).join(" ");
      const label = `${cap(dfFull.format(d))}${dh ? `, ${dur(dh)} réalisées` : ""}${ph ? `, ${dur(ph)} prévues` : ""}`;
      html += `<button type="button" class="${cls}" data-d="${k}" aria-label="${esc(label)}" aria-pressed="${k === sel}"><span class="n">${d.getDate()}</span><span class="h">${dh ? short(dh) : ph ? short(ph) : ""}</span></button>`;
    }
    $("#cal-grid").innerHTML = html;
  }
  function dayName(k) {
    const t = parseYmd(today()), d = parseYmd(k), diff = Math.round((d - t) / DAY);
    return diff === 0 ? "Aujourd'hui" : diff === -1 ? "Hier" : diff === 1 ? "Demain" : cap(dfFull.format(d));
  }
  let quickKey = "";
  function renderDay() {
    const k = sel, fut = isFuture(k), now = new Date(), name = dayName(k), linked = !!getGcid();
    $("#day-title").textContent = name;
    $("#day-sub").textContent = /^(Aujourd'hui|Hier|Demain)$/.test(name) ? dfFull.format(parseYmd(k)) : "";
    const kind = $("#day-kind");
    kind.className = "chip " + (fut ? "warn" : "ok"); kind.textContent = fut ? "Prévision" : "Réalisée";
    const ents = state.entries.filter(e => e.date === k);
    const plans = state.planned.filter(p => p.start.slice(0, 10) === k).sort((a, b) => a.start.localeCompare(b.start));
    let html = ents.map(e => `<div class="drow" data-eid="${esc(e.id)}"><span class="dot"></span>
      <div class="w"><b>${dur(e.hours)}</b><span>${esc(e.note || DEFAULT_TYPE)}</span></div>
      <div class="acts"><button class="sbtn del" data-act="del-entry" data-confirm="Confirmer">Supprimer</button></div></div>`).join("");
    html += plans.map(p => {
      const ended = endOf(p) <= now;
      return `<div class="drow p" data-id="${esc(p.id)}"><span class="dot"></span>
      <div class="w"><b>${dur(p.hours)}</b><span>${esc(p.title)} · ${timeLabel(p)}${ended ? " · à valider" : ""}${p.calAdded && !ended ? " · dans l'agenda" : ""}</span></div>
      <div class="acts">${ended
        ? `<input class="mini num" type="number" min="0.25" max="24" step="0.25" inputmode="decimal" value="${p.hours}" aria-label="Heures faites"><button class="sbtn go" data-act="validate">Valider</button><button class="sbtn" data-act="skip" data-confirm="Confirmer">Pas faite</button>`
        : `${linked ? "" : calLink(p, "Agenda")}<button class="sbtn del" data-act="cancel" data-confirm="Confirmer">Retirer</button>`}</div></div>`;
    }).join("");
    $("#day-list").innerHTML = html;
    const tot = sum(ents, e => e.hours), ptot = sum(plans, p => p.hours);
    $("#day-hint").textContent = fut
      ? (ptot ? `${dur(ptot)} prévues ce jour-là. Choisissez le type, puis touchez une durée et confirmez pour en prévoir plus.` : "Choisissez le type, puis touchez une durée et confirmez pour prévoir une sortie ce jour-là.")
      : (tot ? `${dur(tot)} réalisées ce jour-là. Choisissez le type, puis touchez une durée et confirmez pour en ajouter.` : `Choisissez le type, puis touchez une durée et confirmez pour ajouter les heures faites ${k === today() ? "aujourd'hui" : "ce jour-là"}.`);
    $("#d-time-f").hidden = !fut;
    const v = parseFloat($("#d-hours").value);
    $("#d-submit").textContent = `${fut ? "Prévoir" : "Ajouter"} ${v > 0 ? dur(v) : ""}`.trim();
    const vals = quickValues(), qk = vals.join("|") + "/" + state.defaultHours + "/" + fut;
    if (qk !== quickKey) {
      quickKey = qk;
      $("#qbtns").innerHTML = vals.map(v => {
        const main = v === state.defaultHours;
        return `<button type="button" class="qbtn${main ? " main" : ""}" data-q="${v}">+${dur(v).replace(/ /g, " ")}<small>${main ? "par défaut" : fut ? "prévision" : " "}</small></button>`;
      }).join("");
    }
    $("#qbtns").querySelectorAll(".qbtn").forEach(b => b.setAttribute("aria-label", `${fut ? "Prévoir" : "Ajouter"} ${dur(+b.dataset.q)} le ${dfFull.format(parseYmd(k))}`));
  }

  function addOn(date, hrs, type, time) {
    const t = nowIso(), id = uid(), h = Math.round(hrs * 100) / 100;
    type = type || DEFAULT_TYPE;
    const when = date === today() ? "aujourd'hui" : date === ymd(new Date(Date.now() + DAY)) ? "demain" : "le " + dfDM.format(parseYmd(date));
    let msg;
    if (isFuture(date)) {
      state.planned.push({ id, title: type, start: `${date}T${time || "00:00"}:00`, allDay: !time, hours: h, location: "", created: t, updated: t });
      msg = `${dur(h)} ${type} prévues ${when}`;
    } else {
      state.entries.push({ id, date, hours: h, note: type, source: "calendrier", created: t, updated: t });
      msg = `+${dur(h)} ${type} ${when}`;
    }
    commit();
    if (navigator.vibrate) try { navigator.vibrate(12); } catch (e) {}
    toast(msg, () => {
      state.entries = state.entries.filter(e => e.id !== id);
      state.planned = state.planned.filter(p => p.id !== id); tomb(id);
      commit(); toast("Saisie annulée");
    });
  }

  $("#cal-grid").addEventListener("click", ev => {
    const c = ev.target.closest(".cd"); if (!c) return;
    sel = c.dataset.d;
    const d = parseYmd(sel);
    if (d.getMonth() !== view.getMonth()) view = new Date(d.getFullYear(), d.getMonth(), 1);
    renderCal(); renderDay();
  });
  function shiftMonth(n) { view = new Date(view.getFullYear(), view.getMonth() + n, 1); renderCal(); }
  $("#cal-prev").addEventListener("click", () => shiftMonth(-1));
  $("#cal-next").addEventListener("click", () => shiftMonth(1));
  let tx = null, ty = null;
  $("#cal-grid").addEventListener("touchstart", e => { tx = e.touches[0].clientX; ty = e.touches[0].clientY; }, { passive: true });
  $("#cal-grid").addEventListener("touchend", e => {
    if (tx == null) return;
    const dx = e.changedTouches[0].clientX - tx, dy = e.changedTouches[0].clientY - ty; tx = null;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) shiftMonth(dx < 0 ? 1 : -1);
  }, { passive: true });

  $("#qbtns").addEventListener("click", ev => {
    const b = ev.target.closest(".qbtn"); if (!b) return;
    // Deux appuis : le premier demande confirmation (3,5 s), le second ajoute.
    const small = b.querySelector("small");
    const disarm = x => { if (x.dataset.armed === "1") { x.dataset.armed = "0"; x.querySelector("small").textContent = x.dataset.orig; } };
    $("#qbtns").querySelectorAll(".qbtn").forEach(x => { if (x !== b) disarm(x); });
    if (b.dataset.armed !== "1") {
      b.dataset.armed = "1"; b.dataset.orig = small.textContent; small.textContent = "Confirmer ?";
      setTimeout(() => { if (b.isConnected) disarm(b); }, 3500);
      return;
    }
    disarm(b);
    addOn(sel, parseFloat(b.dataset.q), curType, "");
    const fresh = $(`#qbtns .qbtn[data-q="${b.dataset.q}"]`);
    if (fresh) { fresh.classList.add("flash"); setTimeout(() => fresh.classList.remove("flash"), 700); }
  });
  $("#d-hours").addEventListener("input", renderDay);
  $("#f-day").addEventListener("submit", ev => {
    ev.preventDefault();
    const hrs = parseFloat($("#d-hours").value);
    if (!(hrs > 0)) { toast("Indiquez une durée."); return; }
    addOn(sel, hrs, $("#d-note").value, isFuture(sel) ? $("#d-time").value : "");
    $("#d-time").value = ""; $("#day-more").open = false;
  });
  $("#gcal-sync").addEventListener("click", gSync);
  $("#b-save").addEventListener("click", ev => {
    if (needGoogle()) return;
    busy(ev.currentTarget, "Sauvegarde…", async () => { await gBackup(); toast("Sauvegarde Google Drive faite"); });
  });
  $("#b-restore").addEventListener("click", ev => {
    const btn = ev.currentTarget;
    if (btn.dataset.armed !== "1" && needGoogle()) return;
    if (!armed(btn)) return;
    busy(btn, "Restauration…", async () => {
      const when = await gRestore();
      save(); render(); openDrawer(null);
      toast(`Données restaurées${when ? ` (sauvegarde du ${dfFull.format(new Date(when))})` : ""}`);
    });
  });
  // Préchargé pour que la fenêtre de connexion Google s'ouvre directement au clic (sinon le navigateur peut la bloquer).
  if (getGcid() && navigator.onLine) loadGis().catch(() => {});
  $("#q-edit").addEventListener("click", () => { openDrawer("settings"); window.scrollTo({ top: 0, behavior: "smooth" }); focusDefaultChip(); });

  /* ---------- planification (sorties répétées) ---------- */
  $("#p-date").value = ymd(new Date(Date.now() + DAY));
  function updatePreview() {
    const hrs = parseFloat($("#p-hours").value) || 0, n = +$("#p-repeat").value || 1, c = calc();
    const add = hrs * n, after = Math.max(0, state.goal - c.done - c.plannedH - add);
    $("#p-preview").innerHTML = hrs > 0
      ? `${n > 1 ? `${n} sorties de ${dur(hrs)} = ` : ""}<b>${dur(add)}</b> prévues. Pour ce mois-ci, il resterait ensuite <b>${num(after)} h</b> à organiser${after === 0 ? " : objectif couvert" : ""}.`
      : "Indiquez une durée.";
    $("#p-submit").textContent = n > 1 ? `Planifier ${n} sorties` : "Planifier la sortie";
  }
  ["#p-hours", "#p-repeat"].forEach(s => $(s).addEventListener("input", updatePreview));
  $("#f-plan").addEventListener("submit", ev => {
    ev.preventDefault();
    const title = $("#p-title").value || DEFAULT_TYPE, date = $("#p-date").value, time = $("#p-time").value, hrs = parseFloat($("#p-hours").value);
    const loc = $("#p-loc").value.trim(), n = +$("#p-repeat").value || 1;
    if (!date || !time || !(hrs > 0)) { toast("Indiquez une date, une heure de début et une durée."); return; }
    const t = nowIso();
    for (let i = 0; i < n; i++) {
      const start = parseLocal(date + "T" + time); start.setDate(start.getDate() + 7 * i);
      state.planned.push({ id: uid(), title, start: localIso(start), hours: Math.round(hrs * 100) / 100, location: loc, created: t, updated: t });
    }
    $("#p-repeat").value = "1";
    commit();
    toast(n > 1 ? `${n} sorties « ${title} » planifiées` : `${title} planifiée le ${dfFull.format(parseLocal(date + "T" + time))}`);
  });

  /* ---------- actions des listes (confirmation dans la page) ---------- */
  function armed(btn) {
    if (!btn.dataset.confirm || btn.dataset.armed === "1") return true;
    btn.dataset.armed = "1"; btn.dataset.orig = btn.textContent; btn.textContent = btn.dataset.confirm;
    setTimeout(() => { if (btn.isConnected && btn.dataset.armed === "1") { btn.dataset.armed = "0"; btn.textContent = btn.dataset.orig; } }, 3500);
    return false;
  }
  const tomb = id => { state.deleted[id] = nowIso(); };
  document.addEventListener("click", ev => {
    const btn = ev.target.closest("[data-act]"); if (!btn) return;
    const act = btn.dataset.act;
    if (act === "del-entry") {
      if (!armed(btn)) return;
      const id = btn.closest("[data-eid]").dataset.eid;
      state.entries = state.entries.filter(e => e.id !== id); tomb(id);
      commit(); toast("Saisie supprimée"); return;
    }
    const row = btn.closest("[data-id]"); if (!row) return;
    const id = row.dataset.id, p = state.planned.find(x => x.id === id); if (!p) return;
    if (act === "gcal") {
      if (!navigator.onLine) toast("Pas de réseau : Google Agenda s'ouvrira dès que vous serez connecté.");
      if (!p.calAdded) { p.calAdded = true; p.updated = nowIso(); commit(); }
      return; // le lien s'ouvre normalement
    }
    if (act === "validate") {
      const v = parseFloat(row.querySelector("input.mini").value);
      if (!(v > 0)) { toast("Indiquez les heures effectuées."); return; }
      const t = nowIso();
      state.planned = state.planned.filter(x => x.id !== id); tomb(id);
      state.entries.push({ id: "v-" + p.id, date: p.start.slice(0, 10), hours: Math.round(v * 100) / 100, note: p.title, source: "planning", created: t, updated: t });
      commit(); toast(`${dur(v)} validées`);
    } else if (act === "skip" || act === "cancel") {
      if (!armed(btn)) return;
      state.planned = state.planned.filter(x => x.id !== id); tomb(id);
      const inCal = act === "cancel" && p.calAdded && getGcid();
      if (inCal) state.calRemove.push(id);
      commit();
      if (inCal) { toast("Sortie annulée. Elle sera retirée de Google Agenda au prochain envoi."); return; }
      toast(act === "skip" ? "Sortie retirée du suivi" : (p.calAdded ? "Sortie annulée. Pensez à la retirer aussi de votre agenda." : "Sortie annulée"));
    }
  });

  /* ---------- hors ligne, installation, mises à jour ---------- */
  const setOnline = () => { $("#offline").hidden = navigator.onLine; };
  window.addEventListener("online", setOnline); window.addEventListener("offline", setOnline); setOnline();

  const standalone = window.matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
  let dismissed = false; try { dismissed = localStorage.getItem(LS + "-install") === "no"; } catch (e) {}
  let deferred = null;
  window.addEventListener("beforeinstallprompt", e => {
    e.preventDefault(); deferred = e;
    if (!standalone && !dismissed) { $("#install").hidden = false; $("#install-btn").textContent = "Installer"; }
  });
  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  if (isIOS && !standalone && !dismissed) {
    $("#install").hidden = false;
    $("#install-text").textContent = "Pour l'installer : touchez Partager, puis « Sur l'écran d'accueil ».";
    $("#install-btn").textContent = "OK";
  }
  $("#install-btn").addEventListener("click", async () => {
    if (deferred) { deferred.prompt(); try { await deferred.userChoice; } catch (e) {} deferred = null; }
    else { try { localStorage.setItem(LS + "-install", "no"); } catch (e) {} }
    $("#install").hidden = true;
  });
  window.addEventListener("appinstalled", () => { $("#install").hidden = true; toast("Appli installée"); });

  /* Mises à jour : le service worker revérifie les fichiers en arrière-plan et prévient quand l'un a changé. */
  // En aperçu local (apercu.bat), pas de service worker : chaque F5 montre directement les derniers changements.
  const local = location.protocol === "file:" || ["localhost", "127.0.0.1"].includes(location.hostname);
  if (local && "serviceWorker" in navigator) navigator.serviceWorker.getRegistrations().then(rs => rs.forEach(r => r.unregister())).catch(() => {});
  if ("serviceWorker" in navigator && !local) {
    const hadController = !!navigator.serviceWorker.controller;
    const showUpdate = () => { $("#update").hidden = false; };
    navigator.serviceWorker.addEventListener("message", e => { if (e.data && e.data.type === "update-available") showUpdate(); });
    navigator.serviceWorker.addEventListener("controllerchange", () => { if (hadController) showUpdate(); });
    $("#update-btn").addEventListener("click", () => location.reload());
    navigator.serviceWorker.register("sw.js", { updateViaCache: "none" }).then(reg => {
      // L'appli peut rester ouverte en arrière-plan des jours : on revérifie à chaque retour au premier plan.
      document.addEventListener("visibilitychange", () => {
        if (document.hidden || !navigator.onLine) return;
        reg.update().catch(() => {});
        ["index.html", "app.js"].forEach(f => fetch(f).catch(() => {}));
      });
    }).catch(() => {});
  }

  // Les sorties passées deviennent « à valider » : rafraîchir quand l'appli revient au premier plan.
  let lastDay = ymd(new Date());
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) return;
    state = load();
    const t = ymd(new Date());
    if (t !== lastDay) { if (sel === lastDay) { sel = t; const d = new Date(); view = new Date(d.getFullYear(), d.getMonth(), 1); } lastDay = t; }
    render();
  });
  window.addEventListener("storage", e => { if (e.key === LS) { state = load(); render(); } });

  save(); render();
})();
