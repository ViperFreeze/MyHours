/* MyHours — suivi des heures de bénévolat, version hors ligne.
   Toutes les données restent dans le navigateur (localStorage).
   La synchronisation entre appareils se fait par export / import d'un fichier JSON, fusionné sans rien écraser. */

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
      deleted, lastSync: a.lastSync, changes: a.changes
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
  const nf = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 });
  const num = h => nf.format(Math.round(h * 10) / 10);
  const dur = h => { const t = Math.round(h * 60), H = Math.floor(t / 60), M = t % 60; return H ? (M ? `${H} h ${pad(M)}` : `${H} h`) : `${M} min`; };
  const dfLong = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", year: "numeric" });
  const dfDM = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long" });
  const dfWd = new Intl.DateTimeFormat("fr-FR", { weekday: "short" });
  const dfMon = new Intl.DateTimeFormat("fr-FR", { month: "short" });
  const dfMonth = new Intl.DateTimeFormat("fr-FR", { month: "long", year: "numeric" });
  const dfFull = new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long" });
  const dfStamp = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });
  const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));
  const sum = (a, f) => a.reduce((s, x) => s + f(x), 0);
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const nowIso = () => new Date().toISOString();
  const DAY = 864e5;
  const LS = "carnet-benevolat-v1";
  const ICO_CAL = '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4M12 13v5M9.5 15.5h5"/></svg>';

  /* ---------- stockage local ---------- */
  function load() { try { const r = localStorage.getItem(LS); return r ? normalize(JSON.parse(r)) : normalize({}); } catch (e) { return normalize({}); } }
  let state = load();
  let storageOk = true;
  function save() {
    try { localStorage.setItem(LS, JSON.stringify(state)); storageOk = true; }
    catch (e) { storageOk = false; }
    $("#status").textContent = storageOk ? "Données enregistrées sur cet appareil." : "Impossible d'enregistrer sur cet appareil (stockage plein ou bloqué). Exportez vos données pour ne rien perdre.";
  }
  function commit() { state.changes = (state.changes || 0) + 1; save(); render(); }
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});

  /* ---------- calculs ---------- */
  const endOf = p => { const s = parseLocal(p.start); if (p.allDay) { s.setDate(s.getDate() + 1); return s; } return new Date(s.getTime() + p.hours * 36e5); };
  const timeLabel = p => { if (p.allDay) return "Heure libre"; const d = parseLocal(p.start); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
  function weekStart(d) { const x = new Date(d.getFullYear(), d.getMonth(), d.getDate()); x.setDate(x.getDate() - (x.getDay() + 6) % 7); return x; }
  function calc() {
    const now = new Date();
    const done = sum(state.entries, e => e.hours);
    const plannedH = sum(state.planned, p => p.hours);
    const left = Math.max(0, state.goal - done);
    const dates = state.entries.map(e => parseYmd(e.date)).sort((a, b) => a - b);
    let rate = 0, finish = null;
    if (dates.length) {
      const days = Math.max(7, (now - dates[0]) / DAY + 1);
      rate = done / (days / 7);
      if (left > 0 && rate > 0) finish = new Date(now.getTime() + left / rate * 7 * DAY);
    }
    let needed = null, status = null;
    if (state.deadline) {
      const dl = parseYmd(state.deadline); dl.setHours(23, 59);
      const weeksLeft = (dl - now) / (7 * DAY);
      if (left <= 0) status = "done";
      else if (weeksLeft <= 0) status = "late";
      else {
        needed = left / weeksLeft;
        status = (done + plannedH >= state.goal) ? "covered" : (finish && finish <= dl) ? "ontrack" : dates.length ? "behind" : "start";
      }
    } else if (left <= 0) status = "done";
    return { now, done, plannedH, left, rate, finish, needed, status, pct: Math.min(100, done / state.goal * 100) };
  }

  /* ---------- rendu ---------- */
  function render() {
    const c = calc();
    $("#h-name").textContent = state.name;
    $("#h-sub").textContent = `Objectif ${num(state.goal)} h` + (state.deadline ? ` · avant le ${dfLong.format(parseYmd(state.deadline))}` : "");
    $("#f-done").textContent = num(c.done);
    $("#f-of").textContent = `/ ${num(state.goal)} h`;
    $("#k-done").textContent = `${num(c.done)} h`;
    $("#k-left").textContent = `${num(c.left)} h`;
    $("#k-plan").textContent = `${num(c.plannedH)} h`;
    const map = { done: ["ok", "Objectif atteint"], covered: ["info", "Couvert par les sorties prévues"], ontrack: ["ok", "Dans les temps"], behind: ["warn", "En retard sur le rythme"], late: ["warn", "Échéance dépassée"], start: ["info", "À démarrer"] };
    const st = $("#f-status");
    if (c.status && map[c.status]) { st.className = "chip " + map[c.status][0]; st.textContent = map[c.status][1]; }
    else { st.className = "chip"; st.textContent = `${Math.round(c.pct)} %`; }
    renderCells(c);
    const pace = [`<span><b>${Math.round(c.pct)} %</b> de l'objectif</span>`];
    if (c.left > 0 && c.finish) pace.push(`<span>· à ce rythme, terminé vers le <b>${dfLong.format(c.finish)}</b></span>`);
    if (c.needed != null && c.left > 0) pace.push(`<span>· il faut <b>${dur(c.needed)}</b> par semaine pour l'échéance</span>`);
    if (c.left > 0 && c.done + c.plannedH >= state.goal) pace.push(`<span>· vos sorties prévues suffisent à finir</span>`);
    $("#pace").innerHTML = pace.join(" ");
    renderTodo(c); renderUpcoming(c); renderHistory(); renderStats(c); renderSyncState(); renderQuick(); updateLogBtn();
  }
  function renderCells(c) {
    const goal = state.goal;
    const unit = goal <= 60 ? 1 : goal <= 150 ? 2 : goal <= 400 ? 5 : 10;
    const n = Math.ceil(goal / unit);
    const g = $("#cells");
    g.style.gridTemplateColumns = n <= 30 ? `repeat(auto-fill,minmax(${n <= 15 ? 28 : 22}px,1fr))` : "repeat(auto-fill,minmax(16px,1fr))";
    let html = "";
    for (let i = 0; i < n; i++) {
      const cap = Math.min(unit, goal - i * unit);
      const d = Math.max(0, Math.min(1, (c.done - i * unit) / cap));
      const p = Math.max(0, Math.min(1 - d, (c.done + c.plannedH - i * unit) / cap - d));
      html += `<div class="cell"${n > 30 ? ' style="height:20px"' : ""}>${d > 0 ? `<span class="d" style="width:${d * 100}%"></span>` : ""}${p > 0 ? `<span class="p" style="left:${d * 100}%;width:${p * 100}%"></span>` : ""}</div>`;
    }
    g.innerHTML = html;
    $("#scale").innerHTML = `<span>0 h</span><span>1 case = ${unit} h</span><span>${num(goal)} h</span>`;
  }
  const dateBlock = d => `<div class="date">${esc(dfWd.format(d).replace(".", ""))}<b>${d.getDate()}</b>${esc(dfMon.format(d).replace(".", ""))}</div>`;

  function gcalUrl(p) {
    const s = parseLocal(p.start), e = endOf(p);
    const f = p.allDay ? d => `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}` : d => `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}T${pad(d.getHours())}${pad(d.getMinutes())}00`;
    const q = new URLSearchParams({ action: "TEMPLATE", text: p.title, dates: `${f(s)}/${f(e)}`, details: `Sortie · ${state.name} · objectif ${num(state.goal)} h.` });
    try { q.set("ctz", Intl.DateTimeFormat().resolvedOptions().timeZone); } catch (err) {}
    if (p.location) q.set("location", p.location);
    return "https://calendar.google.com/calendar/render?" + q.toString();
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
    $("#up-box").hidden = !up.length;
    // Total des heures prévues sur les 30 prochains jours, mis à jour à chaque modification.
    const limit = new Date(c.now.getTime() + 30 * DAY);
    const monthH = sum(up.filter(p => parseLocal(p.start) < limit), p => p.hours);
    const um = $("#up-month");
    um.textContent = monthH ? `${dur(monthH)} sur 30 jours` : "Rien sur 30 jours";
    um.classList.toggle("has", monthH > 0);
    $("#up-list").innerHTML = up.map(p => {
      const d = parseLocal(p.start);
      return `<div class="item" data-id="${esc(p.id)}">${dateBlock(d)}
        <div class="what"><div class="t">${esc(p.title)}</div><div class="s"><span>${timeLabel(p)}</span>${p.location ? `<span>${esc(p.location)}</span>` : ""}${p.calAdded ? '<span class="chip info">Dans l\'agenda</span>' : ""}</div></div>
        <div class="dur">${dur(p.hours)}</div>
        <div class="acts"><a class="sbtn cal" data-act="gcal" href="${esc(gcalUrl(p))}" target="_blank" rel="noopener" aria-label="Ajouter à Google Agenda">${ICO_CAL}Agenda</a>
        <button class="sbtn del" data-act="cancel" data-confirm="Confirmer">Annuler</button></div></div>`;
    }).join("");
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
          <div class="what"><div class="t">${esc(x.note || "Sortie")}</div><div class="s">${x.source === "planning" ? '<span class="chip info">Prévue</span>' : ""}</div></div>
          <div class="dur">${dur(x.hours)}</div>
          <div class="acts"><button class="sbtn del" data-act="del-entry" data-confirm="Confirmer la suppression">Supprimer</button></div></div>`;
      });
    });
    $("#hist-list").innerHTML = html;
  }
  function renderStats(c) {
    const e = state.entries, now = c.now;
    const avg = e.length ? c.done / e.length : 0;
    const monthH = sum(e.filter(x => x.date.slice(0, 7) === ymd(now).slice(0, 7)), x => x.hours);
    const kp = [
      [e.length, e.length > 1 ? "sorties réalisées" : "sortie réalisée"],
      [e.length ? dur(avg) : "–", "en moyenne par sortie"],
      [`${num(monthH)} h`, `en ${dfMonth.format(now).split(" ")[0]}`],
      [c.rate ? dur(c.rate) : "–", "par semaine en moyenne"],
      [c.left > 0 ? (c.finish ? dfDM.format(c.finish) : "–") : "Atteint", "fin estimée à ce rythme"],
      [c.needed != null && c.left > 0 ? dur(c.needed) : (state.deadline ? "–" : "Aucune"), state.deadline ? "par semaine pour l'échéance" : "échéance définie"]
    ];
    $("#kpis").innerHTML = kp.map(([v, l]) => `<div class="kpi"><b class="num">${esc(v)}</b><span>${esc(l)}</span></div>`).join("");

    const ws = weekStart(now), weeks = [];
    for (let i = 7; i >= 0; i--) { const s = new Date(ws); s.setDate(s.getDate() - 7 * i); weeks.push({ s, h: 0 }); }
    e.forEach(x => { const k = weekStart(parseYmd(x.date)).getTime(); const w = weeks.find(w => w.s.getTime() === k); if (w) w.h += x.hours; });
    const pace = c.needed != null && c.left > 0 ? c.needed : null;
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
    $("#chart-hint").textContent = "8 dernières semaines, du lundi au dimanche" + (pace ? ` · pointillés : rythme à tenir pour l'échéance (${dur(pace)} par semaine)` : "");

    const names = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"], wd = [0, 0, 0, 0, 0, 0, 0];
    e.forEach(x => { wd[(parseYmd(x.date).getDay() + 6) % 7] += x.hours; });
    const mw = Math.max(...wd);
    $("#weekdays").innerHTML = e.length
      ? wd.map((v, i) => `<div class="wd"><span>${names[i]}</span><div class="tr"><span style="width:${mw ? v / mw * 100 : 0}%"></span></div><span class="v num">${v ? num(v) + " h" : "–"}</span></div>`).join("")
      : `<p class="empty">Les statistiques apparaîtront après votre première sortie.</p>`;
  }
  function renderSyncState() {
    const ch = state.changes || 0;
    $("#sync-dot").hidden = !ch;
    const last = state.lastSync ? `Dernière synchronisation : <b>${esc(dfStamp.format(new Date(state.lastSync)))}</b>.` : "Pas encore synchronisé.";
    $("#sync-state").innerHTML = `${last} ${ch ? `<b>${ch}</b> modification${ch > 1 ? "s" : ""} depuis.` : "Rien de nouveau depuis."}`;
  }

  /* ---------- onglets ---------- */
  const TABS = ["log", "stats", "hist"];
  function showTab(t) {
    TABS.forEach(k => { $("#t-" + k).setAttribute("aria-selected", String(k === t)); $("#p-" + k).hidden = k !== t; });
    try { localStorage.setItem(LS + "-tab", t); } catch (e) {}
  }
  TABS.forEach(k => $("#t-" + k).addEventListener("click", () => showTab(k)));
  let startTab = "log";
  try { startTab = localStorage.getItem(LS + "-tab") || "log"; } catch (e) {}
  showTab(TABS.includes(startTab) ? startTab : "log");

  /* ---------- puces de durée ---------- */
  document.querySelectorAll(".chips").forEach(box => {
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

  /* ---------- tiroirs : réglages et synchronisation ---------- */
  function openDrawer(which) {
    const set = which === "settings", syn = which === "sync";
    $("#settings").hidden = !set; $("#btn-settings").setAttribute("aria-expanded", String(set));
    $("#syncbox").hidden = !syn; $("#btn-sync").setAttribute("aria-expanded", String(syn));
    if (set) { $("#s-name").value = state.name; $("#s-goal").value = state.goal; $("#s-deadline").value = state.deadline || ""; setDefaultSelect(); $("#s-goal").focus(); }
    if (syn) { $("#x-msg").hidden = true; renderSyncState(); }
  }
  $("#btn-settings").addEventListener("click", () => openDrawer($("#settings").hidden ? "settings" : null));
  $("#btn-sync").addEventListener("click", () => openDrawer($("#syncbox").hidden ? "sync" : null));
  $("#s-cancel").addEventListener("click", () => openDrawer(null));
  $("#settings").addEventListener("submit", ev => {
    ev.preventDefault();
    const g = parseFloat(String($("#s-goal").value).replace(",", "."));
    if (!(g > 0)) { toast("Indiquez un nombre d'heures supérieur à 0."); return; }
    state.goal = g; state.name = $("#s-name").value.trim() || DEFAULT_NAME; state.deadline = $("#s-deadline").value || "";
    state.defaultHours = parseFloat($("#s-default").value) || 2;
    state.settingsUpdated = nowIso();
    openDrawer(null); commit(); toast("Réglages enregistrés");
  });

  function xmsg(t, ok) { const m = $("#x-msg"); m.hidden = !t; m.textContent = t || ""; m.className = "msg full" + (ok ? " okm" : ""); }

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
    xmsg(`Fichier « ${name} » créé. Importez-le sur votre autre appareil.`, true);
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
    if (report.addedEntries) parts.push(`${report.addedEntries} saisie${report.addedEntries > 1 ? "s" : ""} ajoutée${report.addedEntries > 1 ? "s" : ""}`);
    if (report.addedPlanned) parts.push(`${report.addedPlanned} sortie${report.addedPlanned > 1 ? "s" : ""} prévue${report.addedPlanned > 1 ? "s" : ""} ajoutée${report.addedPlanned > 1 ? "s" : ""}`);
    if (report.removed) parts.push(`${report.removed} suppression${report.removed > 1 ? "s" : ""} appliquée${report.removed > 1 ? "s" : ""}`);
    let txt = parts.length ? `Import terminé : ${parts.join(", ")}.` : "Import terminé : ce carnet était déjà à jour.";
    if (report.localOnly) txt += " Cet appareil a aussi des données que l'autre n'a pas : exportez maintenant et importez le fichier là-bas pour que les deux soient identiques.";
    xmsg(txt, true);
  });

  /* ---------- saisie en 1 clic (aujourd'hui) ---------- */
  function setDefaultSelect() {
    const sel = $("#s-default"), v = String(state.defaultHours);
    if (![...sel.options].some(o => o.value === v)) { const o = document.createElement("option"); o.value = v; o.textContent = dur(state.defaultHours); sel.appendChild(o); }
    sel.value = v;
  }
  function quickValues() {
    const def = state.defaultHours, out = [def];
    for (const v of [1, 1.5, 2, 3]) { if (out.length >= 3) break; if (!out.includes(v)) out.push(v); }
    return out.sort((a, b) => a - b);
  }
  let quickKey = "";
  function renderQuick() {
    const today = ymd(new Date());
    const tot = sum(state.entries.filter(e => e.date === today), e => e.hours);
    const tt2 = $("#today-tot");
    tt2.textContent = tot ? `${dur(tot)} saisie${tot > 1 ? "s" : ""} aujourd'hui` : "Rien de saisi";
    tt2.classList.toggle("has", tot > 0);
    $("#q-date").textContent = `${dfFull.format(new Date()).replace(/^./, c => c.toUpperCase())} · un appui ajoute les heures faites aujourd'hui.`;
    const vals = quickValues(), key = vals.join("|") + "/" + state.defaultHours;
    if (key === quickKey) return;
    quickKey = key;
    $("#qbtns").innerHTML = vals.map(v => {
      const main = v === state.defaultHours;
      return `<button type="button" class="qbtn${main ? " main" : ""}" data-q="${v}" aria-label="Ajouter ${dur(v)} aujourd'hui${main ? " (durée par défaut)" : ""}">+${dur(v).replace(/ /g, " ")}${main ? "<small>par défaut</small>" : ""}</button>`;
    }).join("");
  }
  $("#qbtns").addEventListener("click", ev => {
    const b = ev.target.closest(".qbtn"); if (!b) return;
    const hrs = parseFloat(b.dataset.q), t = nowIso(), id = uid();
    state.entries.push({ id, date: ymd(new Date()), hours: hrs, note: "", source: "rapide", created: t, updated: t });
    commit();
    const fresh = $(`#qbtns .qbtn[data-q="${hrs}"]`);
    if (fresh) { fresh.classList.add("flash"); setTimeout(() => fresh.classList.remove("flash"), 700); }
    if (navigator.vibrate) try { navigator.vibrate(12); } catch (e) {}
    toast(`+${dur(hrs)} aujourd'hui`, () => {
      state.entries = state.entries.filter(e => e.id !== id); tomb(id);
      commit(); toast("Saisie annulée");
    });
  });
  $("#q-edit").addEventListener("click", () => { openDrawer("settings"); $("#s-default").focus(); window.scrollTo({ top: 0, behavior: "smooth" }); });

  /* ---------- saisie avec date : réalisée si passée, prévision si à venir ---------- */
  $("#e-date").value = ymd(new Date());
  const isFuture = date => date > ymd(new Date());
  function updateLogBtn() {
    const v = parseFloat($("#e-hours").value), date = $("#e-date").value, fut = !!date && isFuture(date);
    $("#e-time-f").hidden = !fut;
    $("#e-kind").innerHTML = !date ? "" : fut
      ? `<span class="chip warn">Prévision</span><span>Sortie prévue, à valider le ${esc(dfDM.format(parseYmd(date)))}.</span>`
      : `<span class="chip ok">Réalisée</span><span>${date === ymd(new Date()) ? "Ajoutée aux heures faites aujourd'hui." : `Ajoutée aux heures faites le ${esc(dfDM.format(parseYmd(date)))}.`}</span>`;
    const d = v > 0 ? dur(v) : "";
    $("#e-submit").textContent = fut ? (d ? `Prévoir ${d}` : "Prévoir") : (d ? `Ajouter ${d}` : "Ajouter");
  }
  ["#e-hours", "#e-date"].forEach(s => { $(s).addEventListener("input", updateLogBtn); $(s).addEventListener("change", updateLogBtn); });
  $("#f-log").addEventListener("submit", ev => {
    ev.preventDefault();
    const hrs = parseFloat($("#e-hours").value), date = $("#e-date").value;
    if (!(hrs > 0) || !date) { toast("Indiquez une date et une durée."); return; }
    const t = nowIso(), id = uid(), h = Math.round(hrs * 100) / 100, note = $("#e-note").value.trim();
    let msg;
    if (isFuture(date)) {
      const time = $("#e-time").value;
      state.planned.push({ id, title: note || "Sortie", start: `${date}T${time || "00:00"}:00`, allDay: !time, hours: h, location: "", created: t, updated: t });
      msg = `Sortie prévue le ${dfDM.format(parseYmd(date))}`;
    } else {
      state.entries.push({ id, date, hours: h, note, source: "manuel", created: t, updated: t });
      msg = `${dur(h)} ajoutées le ${dfDM.format(parseYmd(date))}`;
    }
    $("#e-note").value = ""; $("#e-time").value = "";
    $("#e-date").value = ymd(new Date());
    commit();
    toast(msg, () => {
      state.entries = state.entries.filter(e => e.id !== id);
      state.planned = state.planned.filter(p => p.id !== id); tomb(id);
      commit(); toast("Saisie annulée");
    });
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
      if (!p.calAdded) { p.calAdded = true; p.updated = nowIso(); setTimeout(commit, 0); }
      return; // le lien s'ouvre normalement
    }
    if (act === "validate") {
      const v = parseFloat(row.querySelector("input.mini").value);
      if (!(v > 0)) { toast("Indiquez les heures effectuées."); return; }
      const t = nowIso();
      state.planned = state.planned.filter(x => x.id !== id); tomb(id);
      state.entries.push({ id: uid(), date: p.start.slice(0, 10), hours: Math.round(v * 100) / 100, note: p.title, source: "planning", created: t, updated: t });
      commit(); toast(`${dur(v)} validées`);
    } else if (act === "skip" || act === "cancel") {
      if (!armed(btn)) return;
      state.planned = state.planned.filter(x => x.id !== id); tomb(id);
      commit();
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
  if ("serviceWorker" in navigator && location.protocol !== "file:") {
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
  document.addEventListener("visibilitychange", () => { if (!document.hidden) { state = load(); if (!$("#e-note").value && $("#e-date").value < ymd(new Date())) $("#e-date").value = ymd(new Date()); render(); } });
  window.addEventListener("storage", e => { if (e.key === LS) { state = load(); render(); } });

  save(); render();
})();
