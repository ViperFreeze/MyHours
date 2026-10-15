/* Service worker de MyHours.
   - L'appli s'ouvre toujours depuis le cache : instantané, et ça marche hors ligne.
   - Dès qu'il y a du réseau, chaque fichier est revérifié en arrière-plan. Si un fichier a changé
     (vous avez mis une nouvelle version en ligne), il est remplacé dans le cache et l'appli affiche
     « Mettre à jour ». Plus besoin de désinstaller, ni de changer de numéro de version. */
const CACHE = "myhours-app";
const FONT_CACHE = "myhours-fonts";
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

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(APP_FILES.map(p => new Request(abs(p), { cache: "reload" }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE && k !== FONT_CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
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

/* Revalide un fichier auprès du serveur et met le cache à jour. */
async function refresh(cache, url, cached) {
  const res = await fetch(url, { cache: "no-cache" });
  if (!res || !res.ok) return res;
  if (cached) {
    const changed = !(await sameBytes(cached.clone(), res.clone()));
    if (changed) { await cache.put(url, res.clone()); notifyUpdate(); }
  } else {
    await cache.put(url, res.clone());
  }
  return res;
}

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
  const key = req.mode === "navigate" ? abs("./index.html") : url.origin + url.pathname;
  event.respondWith(caches.open(CACHE).then(async cache => {
    const cached = await cache.match(key);
    const network = refresh(cache, key, cached ? cached.clone() : null);
    if (cached) {
      event.waitUntil(network.catch(() => {}));
      return cached;
    }
    try { return await network; }
    catch (e) { return req.mode === "navigate" ? (await cache.match(abs("./index.html"))) || Response.error() : Response.error(); }
  }));
});
