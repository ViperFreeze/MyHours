/* MyHours — suivi des heures de prédication, utilisable hors ligne et par plusieurs personnes.
   Les données sont d'abord enregistrées dans le navigateur (localStorage) : l'appli marche sans réseau
   et sans compte. Une fois connecté (Google ou e-mail), elles sont synchronisées automatiquement avec
   le compte (Firebase), donc retrouvées sur tous les appareils. Un fichier exporté sert de copie de
   secours (fusionné sans rien écraser à l'import). */

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

  /* Version « canonique » des données : listes triées par identifiant et clés d'objets triées.
     Deux carnets identiques donnent exactement le même texte, quel que soit l'ordre de fusion
     ou l'ordre des champs renvoyé par la base. Sert à savoir si la copie en ligne est à jour. */
  function canonical(state) {
    const d = exportPayload(state).data;
    const byId = (x, y) => (x.id < y.id ? -1 : x.id > y.id ? 1 : 0);
    d.entries.sort(byId); d.planned.sort(byId); d.calRemove.sort();
    return d;
  }
  const stable = v => Array.isArray(v) ? "[" + v.map(stable).join(",") + "]"
    : v && typeof v === "object" ? "{" + Object.keys(v).sort().map(k => JSON.stringify(k) + ":" + stable(v[k])).join(",") + "}"
    : JSON.stringify(v);
  function signature(state) {
    const t = stable(canonical(state));
    let h = 5381; for (let i = 0; i < t.length; i++) h = ((h * 33) ^ t.charCodeAt(i)) >>> 0;
    return t.length + ":" + h;
  }

  function parseImport(text) {
    let obj;
    try { obj = JSON.parse(text); } catch (e) { throw new Error("Ce fichier n'est pas un export MyHours (JSON illisible)."); }
    if (!obj || !["myhours", "carnet-benevolat"].includes(obj.app) || !obj.data) throw new Error("Ce fichier ne vient pas de MyHours.");
    if (obj.format > 1) throw new Error("Ce fichier vient d'une version plus récente de l'appli. Mettez cet appareil à jour (rechargez la page en ligne), puis réessayez.");
    return normalize(obj.data);
  }

  return { normalize, merge, exportPayload, canonical, signature, parseImport, DEFAULT_NAME };
})();
if (typeof module !== "undefined") module.exports = CarnetCore;

/* ---------- Interface ---------- */
if (typeof document !== "undefined") (function () {
  "use strict";
  const { normalize, merge, exportPayload, signature, parseImport, DEFAULT_NAME } = CarnetCore;
  const $ = s => document.querySelector(s);
  const pad = n => String(n).padStart(2, "0");
  const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const parseYmd = s => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
  const parseLocal = s => { const [a, b = "00:00"] = s.split("T"); const [y, m, d] = a.split("-").map(Number); const [h, mi] = b.split(":").map(Number); return new Date(y, m - 1, d, h || 0, mi || 0); };
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
    scheduleBackup();
    syncReminders();
  }
  function commit() { state.changes = (state.changes || 0) + 1; save(); render(); }

  /* ---------- Compte et synchronisation automatique (Firebase) ----------
     Les données restent d'abord sur l'appareil : l'appli marche hors ligne et sans compte.
     Une fois connecté (Google ou e-mail), chaque modification part quelques secondes plus tard dans
     Firestore, dans un document propre au compte (users/{uid}). Les règles de sécurité (firestore.rules)
     le réservent à son propriétaire : personne d'autre ne peut le lire.
     Chaque envoi est une fusion (union + pierres tombales, voir merge) faite dans une transaction :
     deux appareils qui écrivent en même temps ne s'écrasent jamais. Sans réseau, l'envoi attend.
     La synchro se fait à l'ouverture, après chaque modification, au retour au premier plan,
     au retour du réseau, et toutes les 2 minutes tant que l'appli est affichée. */
  const FB_CONFIG = window.MYHOURS_FIREBASE || null;
  const fbReady = !!(FB_CONFIG && FB_CONFIG.apiKey && FB_CONFIG.projectId);
  const CLOUD = LS + "-cloud"; // { uid, email, sig, last, error } — sig : empreinte de la dernière version connue en ligne
  const clGet = () => { try { return JSON.parse(localStorage.getItem(CLOUD) || "{}") || {}; } catch (e) { return {}; } };
  const clSet = patch => { const v = { ...clGet(), ...patch }; try { localStorage.setItem(CLOUD, JSON.stringify(v)); } catch (e) {} return v; };
  // Anciennes sauvegardes (Gist GitHub, Google Drive) retirées : on efface leurs réglages, dont le jeton GitHub.
  try { [LS + "-gist", LS + "-gcid", LS + "-lastbackup"].forEach(k => localStorage.removeItem(k)); } catch (e) {}

  const dataSig = () => signature(state);
  /* Des modifications de ce carnet ne sont pas encore en ligne (même si la session a expiré). */
  const cloudPending = () => { const s = clGet(); return !!s.uid && s.sig !== dataSig(); };
  const offlineError = () => Object.assign(new Error("Pas de réseau : la synchronisation reprendra dès le retour de la connexion."), { offline: true });

  let fb = null, fbLoading = null, user = null, authReady = false, deleting = false;
  let pendingConsent = ""; // date de l'accord donné juste avant la connexion
  function loadFirebase() {
    if (!fbReady) return Promise.reject(new Error("La synchronisation n'est pas encore configurée sur ce site."));
    if (!fbLoading) fbLoading = (async () => {
      const m = await import("./firebase.js");
      const app = m.initializeApp(FB_CONFIG);
      const auth = m.initializeAuth(app, {
        persistence: [m.indexedDBLocalPersistence, m.browserLocalPersistence],
        popupRedirectResolver: m.browserPopupRedirectResolver
      });
      auth.languageCode = "fr";
      fb = { m, auth, db: m.getFirestore(app) };
      m.onAuthStateChanged(auth, u => { onUser(u).catch(() => {}); });
      return fb;
    })().catch(e => { fbLoading = null; throw new Error("Impossible de charger la synchronisation. Vérifiez la connexion."); });
    return fbLoading;
  }

  const blankState = () => ({ ...normalize({}), lastSync: "", changes: 0 });
  async function onUser(u) {
    authReady = true;
    if (!u) { user = null; renderAccount(); renderStatus(); return; }
    const meta = clGet();
    if (meta.uid && meta.uid !== u.uid) {
      // Les données de cet appareil appartiennent à un autre compte : on ne les mélange jamais.
      if (cloudPending()) {
        await fb.m.signOut(fb.auth);
        accMsg(`Ce téléphone a des modifications pas encore envoyées pour ${meta.email || "un autre compte"}. Reconnectez-vous d'abord avec ce compte.`);
        return;
      }
      state = blankState(); save(); render();
      try { localStorage.removeItem(CLOUD); } catch (e) {}
    }
    user = u;
    // Premier lien avec ce compte : les heures déjà sur l'appareil seront fusionnées dans le compte.
    clSet({ uid: u.uid, email: u.email || "", error: "", consentAt: pendingConsent || (meta.uid === u.uid && meta.consentAt) || "" });
    pendingConsent = "";
    $("#acc-consent").checked = false; // à recocher pour une prochaine connexion sur ce téléphone
    accMsg("");
    renderAccount(); cloudSoon(200);
  }

  function cloudError(e) {
    if (e && e.offline) return e;
    const code = (e && e.code) || "";
    if (code === "permission-denied") return new Error("La base a refusé l'accès : vérifiez les règles de sécurité Firestore.");
    if (code === "unavailable" || code === "deadline-exceeded" || !navigator.onLine) return offlineError();
    if (code === "unauthenticated") return new Error("Session expirée : reconnectez-vous.");
    return new Error(e && e.message ? e.message : "La synchronisation a échoué.");
  }
  const withTimeout = (p, ms) => Promise.race([p, new Promise((_, ko) => setTimeout(() => ko(Object.assign(new Error("délai dépassé"), { code: "deadline-exceeded" })), ms))]);

  let clBusy = null, clTimer = null;
  /* Fusionne la version en ligne avec celle de l'appareil, enregistre le résultat des deux côtés.
     Renvoie le rapport de fusion côté appareil (ce qui a été récupéré). */
  function cloudSync() {
    if (clBusy) return clBusy;
    clBusy = (async () => {
      if (!user) throw new Error("Connectez-vous pour synchroniser.");
      if (deleting) throw new Error("Suppression du compte en cours.");
      if (!navigator.onLine) throw offlineError();
      const { m, db } = fb, ref = m.doc(db, "users", user.uid), uidAtStart = user.uid;
      const result = await withTimeout(m.runTransaction(db, async tx => {
        const snap = await tx.get(ref);
        const remote = snap.exists() && snap.data().data ? normalize(snap.data().data) : null;
        // Date de l'accord à la politique de confidentialité, gardée avec les données.
        const consentAt = clGet().consentAt || (snap.exists() && snap.data().consentAt) || null;
        const merged = remote ? merge(state, remote).merged : normalize(state);
        if (!remote || signature(remote) !== signature(merged)) {
          tx.set(ref, { app: "myhours", format: 1, consentAt, data: CarnetCore.canonical(merged), updatedAt: m.serverTimestamp() });
        }
        return merged;
      }), 25000);
      if (!user || user.uid !== uidAtStart) return null; // déconnecté pendant l'envoi
      // L'utilisateur a pu modifier le carnet pendant l'envoi : on fusionne au lieu de remplacer.
      const before = dataSig();
      const { merged, report } = merge(state, result);
      state = merged;
      clSet({ sig: signature(result), last: nowIso(), error: "" });
      save();
      if (dataSig() !== before) render();
      return report;
    })()
      .catch(e => { const err = cloudError(e); if (!err.offline) clSet({ error: err.message }); throw err; })
      .finally(() => { clBusy = null; renderStatus(); if (user && cloudPending() && navigator.onLine && !clGet().error) cloudSoon(1500); });
    renderStatus();
    return clBusy;
  }
  function cloudSoon(delay) {
    clearTimeout(clTimer);
    if (!user || !navigator.onLine) { renderStatus(); return; }
    clTimer = setTimeout(() => cloudSync().then(rep => {
      if (rep && (rep.addedEntries || rep.addedPlanned || rep.removed)) toast("Données récupérées depuis votre compte");
    }).catch(() => {}), delay);
    renderStatus();
  }
  function scheduleBackup() { if (user && cloudPending()) { clSet({ error: "" }); cloudSoon(3000); } else renderStatus(); }

  function cloudLabel() {
    const s = clGet();
    if (!s.uid) return "";
    if (!user) return authReady ? "reconnectez-vous pour reprendre la synchronisation" : cloudPending() ? "synchronisation en attente" : "";
    if (clBusy) return "synchronisation…";
    if (s.error) return "la synchronisation a échoué";
    if (cloudPending()) return navigator.onLine ? "synchronisation dans un instant" : "synchronisation en attente du réseau";
    return s.last ? `synchronisé le ${dfStamp.format(new Date(s.last))}` : "synchronisation active";
  }
  function renderStatus() {
    const st = $("#status-text"); if (!st) return;
    const lbl = cloudLabel();
    st.textContent = !storageOk
      ? "Impossible d'enregistrer sur cet appareil (stockage plein ou bloqué). Exportez vos données pour ne rien perdre."
      : `Données enregistrées sur cet appareil${lbl ? ` · ${lbl}` : ""}.`;
    const q = $("#quick-save");
    if (q) q.textContent = user ? "Synchroniser" : fbReady ? "Se connecter" : "Exporter";
    const hint = $("#acc-hint"); if (!hint) return;
    const s = clGet();
    hint.textContent = user ? cap(lbl) + "." + (s.error ? ` ${s.error}` : "") : "";
  }

  /* ---------- Section « Compte » des réglages ---------- */
  function accMsg(t, ok) { const m = $("#acc-msg"); if (!m) return; m.hidden = !t; m.textContent = t || ""; m.className = "msg" + (ok ? " okm" : ""); }
  function renderAccount() {
    if (!$("#acc")) return;
    $("#acc-off").hidden = fbReady;
    $("#acc-out").hidden = !fbReady || !!user;
    $("#acc-in").hidden = !user;
    if (user) {
      $("#acc-who").textContent = user.email || "compte connecté";
      $("#acc-del-pass-f").hidden = !isPasswordAccount();
    }
    renderStatus(); renderSyncState();
  }
  function authError(e) {
    const code = (e && e.code) || "";
    const map = {
      "auth/popup-blocked": "La fenêtre de connexion a été bloquée. Touchez à nouveau le bouton.",
      "auth/popup-closed-by-user": "Connexion annulée.",
      "auth/cancelled-popup-request": "Connexion annulée.",
      "auth/unauthorized-domain": "Ce site n'est pas autorisé dans Firebase (Authentication → Paramètres → Domaines autorisés).",
      "auth/operation-not-allowed": "Ce mode de connexion n'est pas activé dans Firebase.",
      "auth/invalid-credential": "E-mail ou mot de passe incorrect.",
      "auth/invalid-login-credentials": "E-mail ou mot de passe incorrect.",
      "auth/wrong-password": "E-mail ou mot de passe incorrect.",
      "auth/user-not-found": "Aucun compte avec cet e-mail : utilisez « Créer un compte ».",
      "auth/email-already-in-use": "Un compte existe déjà avec cet e-mail : utilisez « Se connecter ».",
      "auth/weak-password": "Mot de passe trop court : 6 caractères minimum.",
      "auth/invalid-email": "Adresse e-mail invalide.",
      "auth/missing-password": "Indiquez un mot de passe.",
      "auth/network-request-failed": "Pas de réseau : réessayez une fois connecté.",
      "auth/too-many-requests": "Trop de tentatives : réessayez dans quelques minutes."
    };
    return map[code] || (e && e.message) || "Connexion impossible.";
  }
  async function withBtn(btn, label, fn) {
    const orig = btn.dataset.armed === "1" ? btn.dataset.orig : btn.textContent;
    btn.dataset.armed = "0"; btn.disabled = true; btn.textContent = label;
    try { await fn(); } finally { btn.disabled = false; btn.textContent = orig; }
  }
  /* Les heures de prédication peuvent révéler une conviction religieuse (donnée sensible au sens du RGPD) :
     on demande un accord explicite avant de les enregistrer dans un compte. */
  function needConsent() {
    if ($("#acc-consent").checked) { pendingConsent = nowIso(); return false; }
    accMsg("Cochez d'abord la case d'accord pour enregistrer vos heures dans un compte.");
    $("#acc-consent").focus();
    return true;
  }
  $("#acc-consent").addEventListener("change", () => accMsg(""));
  $("#acc-google").addEventListener("click", ev => {
    accMsg("");
    if (needConsent()) return;
    if (!navigator.onLine) { accMsg("Pas de réseau : réessayez une fois connecté."); return; }
    // La fenêtre Google doit s'ouvrir directement dans le clic, sinon le navigateur la bloque :
    // Firebase est donc déjà chargé à l'ouverture de l'appli.
    if (!fb) { loadFirebase().then(() => accMsg("Prêt : touchez à nouveau le bouton.", true)).catch(e => accMsg(e.message)); return; }
    const p = fb.m.signInWithPopup(fb.auth, new fb.m.GoogleAuthProvider());
    withBtn(ev.currentTarget, "Connexion…", () => p.then(() => toast("Connecté")).catch(e => {
      accMsg(authError(e) + (isIOS && standalone && e.code !== "auth/popup-closed-by-user" ? " Sur iPhone, vous pouvez aussi utiliser une adresse e-mail." : ""));
    }));
  });
  const readCreds = () => {
    const email = $("#acc-email").value.trim(), pass = $("#acc-pass").value;
    if (!email) { accMsg("Indiquez votre adresse e-mail."); $("#acc-email").focus(); return null; }
    return { email, pass };
  };
  async function mailAuth(btn, create) {
    accMsg("");
    const c = readCreds(); if (!c) return;
    if (!c.pass) { accMsg("Indiquez un mot de passe."); $("#acc-pass").focus(); return; }
    if (needConsent()) return;
    if (!navigator.onLine) { accMsg("Pas de réseau : réessayez une fois connecté."); return; }
    await withBtn(btn, create ? "Création…" : "Connexion…", async () => {
      try {
        const { m, auth } = await loadFirebase();
        await (create ? m.createUserWithEmailAndPassword : m.signInWithEmailAndPassword)(auth, c.email, c.pass);
        $("#acc-pass").value = "";
        toast(create ? "Compte créé" : "Connecté");
      } catch (e) { accMsg(authError(e)); }
    });
  }
  $("#acc-login").addEventListener("click", ev => mailAuth(ev.currentTarget, false));
  $("#acc-create").addEventListener("click", ev => mailAuth(ev.currentTarget, true));
  ["#acc-email", "#acc-pass"].forEach(s => $(s).addEventListener("keydown", ev => { if (ev.key === "Enter") { ev.preventDefault(); $("#acc-login").click(); } }));
  $("#acc-reset").addEventListener("click", async ev => {
    accMsg("");
    const c = readCreds(); if (!c) return;
    await withBtn(ev.currentTarget, "Envoi…", async () => {
      try { const { m, auth } = await loadFirebase(); await m.sendPasswordResetEmail(auth, c.email); accMsg(`Un e-mail pour choisir un nouveau mot de passe a été envoyé à ${c.email}.`, true); }
      catch (e) { accMsg(authError(e)); }
    });
  });
  $("#acc-sync").addEventListener("click", () => syncNow());
  /* Déconnexion : les heures restent dans le compte et quittent ce téléphone (utile s'il est partagé). */
  $("#acc-signout").addEventListener("click", async ev => {
    const btn = ev.currentTarget;
    if (!armed(btn)) return;
    await withBtn(btn, "Déconnexion…", async () => {
      if (cloudPending()) { try { await cloudSync(); } catch (e) {} }
      if (cloudPending()) { accMsg("Des modifications ne sont pas encore envoyées : reconnectez-vous au réseau, puis réessayez."); return; }
      clearTimeout(clTimer);
      await fb.m.signOut(fb.auth);
      try { localStorage.removeItem(CLOUD); } catch (e) {}
      state = blankState(); save(); render(); renderAccount();
      toast("Déconnecté. Vos heures restent dans votre compte.");
    });
  });

  const isPasswordAccount = () => !!(user && user.providerData && user.providerData.some(p => p.providerId === "password"));

  /* Télécharger mes données : tout le carnet (après une dernière synchro) et les informations du compte,
     dans un fichier JSON que « Importer » sait relire. */
  $("#acc-dl").addEventListener("click", async ev => {
    accMsg("");
    await withBtn(ev.currentTarget, "Préparation…", async () => {
      if (user && navigator.onLine) { try { await cloudSync(); } catch (e) {} }
      const meta = clGet();
      const payload = {
        ...exportPayload(state),
        compte: user ? {
          email: user.email || "",
          identifiant: user.uid,
          connexion: (user.providerData || []).map(p => p.providerId === "google.com" ? "Google" : p.providerId === "password" ? "e-mail et mot de passe" : p.providerId),
          nom: user.displayName || "",
          creeLe: (user.metadata && user.metadata.creationTime) || "",
          derniereConnexion: (user.metadata && user.metadata.lastSignInTime) || "",
          accordConfidentialite: meta.consentAt || "",
          derniereSynchro: meta.last || ""
        } : null
      };
      try {
        const name = await shareJson(payload, `myhours-mes-donnees-${ymd(new Date())}.json`);
        if (name) accMsg(`Fichier « ${name} » créé : il contient toutes vos heures et les informations de votre compte.`, true);
      } catch (e) { accMsg(e.message); }
    });
  });

  /* Supprimer mon compte : Firebase exige une connexion récente, on redemande donc l'identité
     (fenêtre Google ou mot de passe), puis on efface le document des heures, le compte, et ce téléphone. */
  $("#acc-del").addEventListener("click", ev => {
    const btn = ev.currentTarget;
    accMsg("");
    if (!user || !fb) return;
    if (!navigator.onLine) { accMsg("Pas de réseau : la suppression demande une connexion."); return; }
    const pass = $("#acc-del-pass").value;
    if (isPasswordAccount() && !pass) { accMsg("Indiquez votre mot de passe pour confirmer la suppression."); $("#acc-del-pass").focus(); return; }
    if (!armed(btn)) return;
    const { m, auth, db } = fb, u = auth.currentUser;
    // Appelé directement dans le clic, pour que la fenêtre Google ne soit pas bloquée.
    const reauth = isPasswordAccount()
      ? m.reauthenticateWithCredential(u, m.EmailAuthProvider.credential(u.email, pass))
      : m.reauthenticateWithPopup(u, new m.GoogleAuthProvider());
    withBtn(btn, "Suppression…", async () => {
      try { await reauth; }
      catch (e) { accMsg(e && e.code === "auth/user-mismatch" ? "Choisissez le même compte Google que celui connecté." : authError(e)); return; }
      deleting = true; clearTimeout(clTimer);
      try {
        if (clBusy) { try { await clBusy; } catch (e) {} }
        await m.deleteDoc(m.doc(db, "users", u.uid));
        await m.deleteUser(u);
      } catch (e) {
        deleting = false;
        accMsg("La suppression n'a pas pu aller au bout : " + (e && e.code ? authError(e) : cloudError(e).message) + " Vos heures sont toujours sur ce téléphone.");
        cloudSoon(1000);
        return;
      }
      deleting = false;
      $("#acc-del-pass").value = ""; $("#acc-del-box").open = false;
      try { localStorage.removeItem(CLOUD); } catch (e) {}
      user = null;
      state = blankState(); save(); render(); renderAccount();
      accMsg("Votre compte et toutes vos heures ont été supprimés.", true);
      toast("Compte supprimé");
    });
  });

  async function syncNow() {
    if (!user) { openDrawer("settings"); $("#acc").scrollIntoView({ behavior: "smooth", block: "start" }); return; }
    if (!navigator.onLine) { toast("Pas de réseau : la synchronisation reprendra dès le retour de la connexion."); return; }
    clearTimeout(clTimer); clSet({ error: "" });
    try { await cloudSync(); toast("Synchronisé avec votre compte"); }
    catch (e) { toast(e.message || "Synchronisation impossible."); }
  }
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
    renderTodo(c); renderStats(c); renderCal(); renderDay(); renderReset(); renderSyncState(); renderNotif();
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
  const TABS = ["log", "stats"];
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
      $("#s-goal").value = state.goal;
      $("#s-err").hidden = true; $("#x-msg").hidden = true;
      setDefaultChips(state.defaultHours);
      updateSettingsSum(); renderAccount(); disarmReset(); renderReset(); renderStatus(); renderNotif();
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
    state.defaultHours = pickedDefault;
    state.settingsUpdated = nowIso();
    openDrawer(null); commit(); toast("Réglages enregistrés");
  });

  /* ---------- fichier de sauvegarde : export / import fusionné ---------- */
  function xmsg(t, ok) { const m = $("#x-msg"); m.hidden = !t; m.textContent = t || ""; m.className = "msg" + (ok ? " okm" : ""); }
  function renderSyncState() {
    if (user) { $("#x-state").textContent = "Vos heures sont synchronisées automatiquement avec votre compte. L'export reste utile comme copie de secours."; return; }
    const ch = state.changes || 0;
    const last = state.lastSync ? `Dernier export ou import : ${dfStamp.format(new Date(state.lastSync))}.` : "Aucun export pour l'instant.";
    $("#x-state").textContent = `${last} ${ch ? `${plural(ch, "modification")} depuis.` : "Rien de nouveau depuis."}`;
  }
  async function exportFile() {
    const name = await shareJson(exportPayload(state), `myhours-${ymd(new Date())}.json`);
    if (!name) return null;
    state.lastSync = nowIso(); state.changes = 0; save(); render();
    return name;
  }
  /* Crée un fichier JSON (menu de partage sur mobile, téléchargement sinon).
     Renvoie le nom du fichier, ou null si l'utilisateur a fermé le menu de partage. */
  async function shareJson(obj, name) {
    const json = JSON.stringify(obj, null, 2);
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
      if (e && e.name === "AbortError") return null;
      throw new Error("Le fichier n'a pas pu être créé. Réessayez, ou utilisez un autre navigateur.");
    }
    return name;
  }
  $("#x-export").addEventListener("click", async () => {
    try {
      const name = await exportFile();
      if (name) xmsg(`Fichier « ${name} » créé. Importez-le sur votre autre appareil, ou gardez-le comme sauvegarde.`, true);
    } catch (e) { xmsg(e.message); }
  });

  /* Le petit lien en bas de l'écran : synchroniser si connecté, sinon se connecter (ou exporter
     si la synchronisation n'est pas configurée sur ce site). */
  $("#quick-save").addEventListener("click", async () => {
    if (user || fbReady) { syncNow(); return; }
    try { const name = await exportFile(); if (name) toast(`Fichier « ${name} » créé`); }
    catch (e) { toast(e.message); }
  });
  window.addEventListener("online", () => cloudSoon(1000));
  window.addEventListener("offline", renderStatus);
  document.addEventListener("visibilitychange", () => {
    if (!user || !navigator.onLine) return;
    if (document.hidden) { if (cloudPending()) { clearTimeout(clTimer); cloudSync().catch(() => {}); } } // on part : envoyer tout de suite
    else cloudSoon(800); // on revient : récupérer ce qui a changé sur les autres appareils
  });
  setInterval(() => { if (user && !document.hidden && navigator.onLine && !clBusy) cloudSoon(0); }, 120000);
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
    const k = sel, fut = isFuture(k), now = new Date(), name = dayName(k);
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
      <div class="w"><b>${dur(p.hours)}</b><span>${esc(p.title)} · ${timeLabel(p)}${ended ? " · à valider" : ""}</span></div>
      <div class="acts">${ended
        ? `<input class="mini num" type="number" min="0.25" max="24" step="0.25" inputmode="decimal" value="${p.hours}" aria-label="Heures faites"><button class="sbtn go" data-act="validate">Valider</button><button class="sbtn" data-act="skip" data-confirm="Confirmer">Pas faite</button>`
        : `<button class="sbtn del" data-act="cancel" data-confirm="Confirmer">Retirer</button>`}</div></div>`;
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
  $("#q-edit").addEventListener("click", () => { openDrawer("settings"); window.scrollTo({ top: 0, behavior: "smooth" }); focusDefaultChip(); });

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
      commit();
      toast(act === "skip" ? "Sortie retirée du suivi" : "Sortie annulée");
    }
  });

  /* ---------- rappels : sortie prévue terminée mais pas validée ----------
     Pas de serveur, donc pas de vrai « push » distant : les notifications sont locales.
     La liste des rappels est copiée dans le cache, où le service worker peut la lire :
     - appli ouverte ou en arrière-plan : minuterie jusqu'à l'échéance ;
     - appli fermée (Android, appli installée) : vérification périodique en arrière-plan ;
     - dans tous les cas : vérification à chaque ouverture. */
  const REMIND_AFTER = 30 * 60 * 1000; // délai après la fin prévue de la sortie
  const REM_CACHE = "myhours-data", REM_KEY = "./__reminders.json";
  const NOTIF_PREF = LS + "-notif";
  const isLocal = location.protocol === "file:" || ["localhost", "127.0.0.1"].includes(location.hostname);
  const notifSupported = "Notification" in window && "serviceWorker" in navigator && "caches" in window && !isLocal;
  const notifWanted = () => { try { return localStorage.getItem(NOTIF_PREF) === "on"; } catch (e) { return false; } };
  const notifOn = () => notifSupported && notifWanted() && Notification.permission === "granted";
  let remTimer = null;

  function renderNotif() {
    const st = $("#n-state"), btn = $("#n-btn");
    if (!st) return;
    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    const inApp = window.matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
    if (!notifSupported) {
      btn.hidden = true;
      st.textContent = isLocal ? "Les rappels ne marchent pas en aperçu local : testez-les depuis l'adresse GitHub Pages."
        : ios && !inApp ? "Sur iPhone, installez d'abord l'appli sur l'écran d'accueil (iOS 16.4 ou plus), puis activez les rappels depuis l'icône."
        : "Ce navigateur ne gère pas les notifications.";
      return;
    }
    btn.hidden = false;
    if (Notification.permission === "denied") { btn.hidden = true; st.textContent = "Notifications bloquées : autorisez-les pour MyHours dans les réglages du téléphone ou du navigateur."; }
    else if (notifOn()) { st.textContent = "Activés : une notification arrive 30 minutes après une sortie prévue qui n'a pas été validée."; btn.textContent = "Désactiver les rappels"; }
    else { st.textContent = "Une notification si une sortie prévue est terminée depuis 30 minutes sans avoir été validée."; btn.textContent = "Activer les rappels"; }
  }

  async function syncReminders() {
    if (!notifSupported) return;
    const enabled = notifOn();
    const items = state.planned.map(p => {
      const s = parseLocal(p.start);
      return { id: p.id, title: p.title || DEFAULT_TYPE, due: endOf(p).getTime() + REMIND_AFTER, when: p.allDay ? dfDM.format(s) : `${dfDM.format(s)} à ${timeLabel(p)}`, hours: dur(p.hours) };
    });
    try {
      const cache = await caches.open(REM_CACHE);
      const old = await cache.match(REM_KEY);
      const prev = old ? await old.json() : {};
      const notified = {};
      for (const it of items) if (prev.notified && prev.notified[it.id]) notified[it.id] = prev.notified[it.id];
      await cache.put(REM_KEY, new Response(JSON.stringify({ enabled, items, notified }), { headers: { "Content-Type": "application/json" } }));
      // Sortie validée ou annulée : sa notification encore affichée disparaît.
      const reg = await navigator.serviceWorker.getRegistration();
      if (reg) (await reg.getNotifications()).forEach(n => { if (n.tag && !items.some(i => i.id === n.tag)) n.close(); });
    } catch (e) {}
    clearTimeout(remTimer);
    if (!enabled) return;
    askReminderCheck();
    const next = items.map(i => i.due).filter(d => d > Date.now()).sort((a, b) => a - b)[0];
    if (next && next - Date.now() < 2 ** 31 - 1) remTimer = setTimeout(() => { render(); askReminderCheck(); }, next - Date.now() + 1000);
  }
  function askReminderCheck() {
    navigator.serviceWorker.ready.then(reg => { if (reg.active) reg.active.postMessage({ type: "check-reminders" }); }).catch(() => {});
  }
  async function registerPeriodic() {
    try {
      const reg = await navigator.serviceWorker.ready;
      if (!("periodicSync" in reg)) return;
      const perm = await navigator.permissions.query({ name: "periodic-background-sync" });
      if (perm.state === "granted") await reg.periodicSync.register("myhours-reminders", { minInterval: 60 * 60 * 1000 });
    } catch (e) {}
  }
  $("#n-btn").addEventListener("click", async () => {
    if (!notifSupported) return;
    if (notifOn()) {
      try { localStorage.setItem(NOTIF_PREF, "off"); } catch (e) {}
      try { const reg = await navigator.serviceWorker.ready; if (reg.periodicSync) await reg.periodicSync.unregister("myhours-reminders"); } catch (e) {}
      renderNotif(); syncReminders(); toast("Rappels désactivés"); return;
    }
    let perm = Notification.permission;
    if (perm === "default") { try { perm = await Notification.requestPermission(); } catch (e) {} }
    if (perm !== "granted") { renderNotif(); toast("Notifications refusées : les rappels restent désactivés."); return; }
    try { localStorage.setItem(NOTIF_PREF, "on"); } catch (e) {}
    await registerPeriodic();
    renderNotif(); syncReminders(); toast("Rappels activés");
  });

  // Ouverture depuis une notification : on montre les sorties à valider.
  function focusTodo() {
    showTab("log");
    const box = $("#todo-box");
    if (box.hidden) return;
    box.classList.add("alert");
    box.scrollIntoView({ behavior: "smooth", block: "start" });
    setTimeout(() => box.classList.remove("alert"), 2500);
  }

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
    navigator.serviceWorker.addEventListener("message", e => {
      if (!e.data) return;
      if (e.data.type === "update-available") showUpdate();
      if (e.data.type === "open-todo") { state = load(); render(); focusTodo(); }
    });
    navigator.serviceWorker.addEventListener("controllerchange", () => { if (hadController) showUpdate(); });
    $("#update-btn").addEventListener("click", () => location.reload());
    navigator.serviceWorker.register("sw.js", { updateViaCache: "none" }).then(reg => {
      if (notifOn()) registerPeriodic();
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
    render(); syncReminders();
  });
  window.addEventListener("storage", e => { if (e.key === LS) { state = load(); render(); } });

  save(); render();
  if (new URLSearchParams(location.search).has("valider")) {
    history.replaceState(null, "", location.pathname);
    setTimeout(focusTodo, 300);
  }
  // À l'ouverture : charger Firebase (la session est retrouvée toute seule), puis synchroniser.
  renderAccount();
  if (fbReady) loadFirebase().catch(() => renderStatus());
})();
