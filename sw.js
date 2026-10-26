/* Service worker de MyHours.
   - L'appli s'ouvre toujours depuis le cache : instantané, et ça marche hors ligne.
   - Dès qu'il y a du réseau, TOUS les fichiers de l'appli sont revérifiés ensemble en arrière-plan.
     Si au moins un a changé, ils sont tous remplacés d'un coup dans le cache, puis l'appli affiche
     « Mettre à jour ». On ne mélange donc jamais un ancien app.js avec un nouvel index.html.
     Si un fichier ne peut pas être téléchargé (réseau coupé en cours de route), rien n'est modifié.
   - Rappels : si une sortie prévue est terminée sans être validée, une notification locale est affichée. */
const CACHE = "myhours-app";
const FONT_CACHE = "myhours-fonts";
const DATA_CACHE = "myhours-data"; // liste des rappels, écrite par l'appli
const APP_FILES = [
  "./index.html",
  "./app.js",
  "./manifest.webmanifest",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-maskable-512.png",
  "./icons/apple-touch-icon.png",
  "./icons/logo-mark.png"
];
const abs = p => new URL(p, self.registration.scope).href;
const APP_URLS = APP_FILES.map(abs);
const APP_SET = new Set(APP_URLS);
const INDEX = abs("./index.html");
const APP_JS = abs("./app.js");
const CHECK_INTERVAL = 30 * 1000; // au plus une vérification toutes les 30 s

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(APP_URLS.map(u => new Request(u, { cache: "reload" }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => ![CACHE, FONT_CACHE, DATA_CACHE].includes(k)).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
      .then(checkReminders)
  );
});

async function sameBytes(a, b) {
  const [x, y] = await Promise.all([a.arrayBuffer(), b.arrayBuffer()]);
  if (x.byteLength !== y.byteLength) return false;
  const u = new Uint8Array(x), v = new Uint8Array(y);
  for (let i = 0; i < u.length; i++) if (u[i] !== v[i]) return false;
  return true;
}

async function notifyUpdate() {
  const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
  clients.forEach(c => c.postMessage({ type: "update-available" }));
}

/* Vérifie l'ensemble des fichiers et met le cache à jour en bloc. */
let checking = null, lastCheck = 0;
function checkForUpdate() {
  if (checking) return checking;
  if (Date.now() - lastCheck < CHECK_INTERVAL) return Promise.resolve(false);
  checking = (async () => {
    const cache = await caches.open(CACHE);
    const fresh = await Promise.all(APP_URLS.map(u => fetch(u, { cache: "no-cache" })));
    if (fresh.some(r => !r || !r.ok)) return false; // version incomplète : on garde l'ancienne telle quelle

    let changed = false, missing = false;
    for (let i = 0; i < APP_URLS.length; i++) {
      const cached = await cache.match(APP_URLS[i]);
      if (!cached) { missing = true; continue; }
      if (!(await sameBytes(cached, fresh[i].clone()))) { changed = true; break; }
    }
    if (!changed && !missing) return false;

    await Promise.all(APP_URLS.map((u, i) => cache.put(u, fresh[i])));
    if (changed) await notifyUpdate();
    return changed;
  })()
    .catch(() => false)
    .finally(() => { checking = null; lastCheck = Date.now(); });
  return checking;
}

/* ---------- Rappels : sortie prévue terminée mais pas validée ---------- */
const REM_KEY = abs("./__reminders.json");
let remChecking = null;
function checkReminders() {
  // Une seule vérification à la fois, pour ne jamais notifier deux fois la même sortie.
  if (!remChecking) remChecking = doCheckReminders().catch(() => {}).finally(() => { remChecking = null; });
  return remChecking;
}
async function doCheckReminders() {
  const cache = await caches.open(DATA_CACHE);
  const res = await cache.match(REM_KEY);
  if (!res) return;
  const d = await res.json();
  if (!d || !d.enabled || !Array.isArray(d.items)) return;
  if (self.Notification && Notification.permission !== "granted") return;
  d.notified = d.notified || {};
  const now = Date.now();
  const due = d.items.filter(it => it.due <= now && !d.notified[it.id]);
  if (!due.length) return;
  for (const it of due) {
    await self.registration.showNotification("Sortie à valider", {
      body: `${it.title} · ${it.when} (${it.hours}) : vous ne l'avez pas encore validée.`,
      tag: it.id,
      icon: abs("./icons/icon-192.png"),
      badge: abs("./icons/icon-192.png"),
      data: { url: abs("./?valider=1") }
    });
    d.notified[it.id] = now;
  }
  await cache.put(REM_KEY, new Response(JSON.stringify(d), { headers: { "Content-Type": "application/json" } }));
}

self.addEventListener("message", event => {
  if (event.data && event.data.type === "check-reminders") event.waitUntil(checkReminders());
});

// Android (appli installée) : Chrome réveille le service worker de temps en temps, même appli fermée.
self.addEventListener("periodicsync", event => {
  if (event.tag === "myhours-reminders") event.waitUntil(checkReminders());
});

self.addEventListener("notificationclick", event => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || abs("./?valider=1");
  event.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const win = wins.find(w => w.url.startsWith(self.registration.scope));
    if (win) { await win.focus(); win.postMessage({ type: "open-todo" }); return; }
    await self.clients.openWindow(url);
  })());
});

self.addEventListener("fetch", event => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  // Polices Google : cache d'abord, rafraîchies en arrière-plan.
  if (url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com") {
    event.respondWith(caches.open(FONT_CACHE).then(async cache => {
      const cached = await cache.match(req);
      const network = fetch(req).then(res => { if (res && (res.ok || res.type === "opaque")) cache.put(req, res.clone()); return res; }).catch(() => cached);
      return cached || network;
    }));
    return;
  }
  if (url.origin !== self.location.origin) return;

  // Ouverture de l'appli → index.html ; autres fichiers → eux-mêmes (sans paramètres d'URL).
  const key = req.mode === "navigate" ? INDEX : url.origin + url.pathname;
  if (!APP_SET.has(key)) return; // fichier hors appli : réseau normal

  // Ouvrir l'appli (ou la ramener au premier plan) déclenche la vérification de l'ensemble.
  if (key === INDEX || key === APP_JS) event.waitUntil(checkForUpdate());
  if (req.mode === "navigate") event.waitUntil(checkReminders());

  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(key);
    if (cached) return cached;
    try {
      const res = await fetch(key, { cache: "no-cache" });
      if (res && res.ok) await cache.put(key, res.clone());
      return res;
    } catch (e) {
      if (req.mode === "navigate") return (await cache.match(INDEX)) || Response.error();
      return Response.error();
    }
  })());
});
