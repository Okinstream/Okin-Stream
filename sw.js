const CACHE_NAME = 'okin-v7'; // ⚠️ à incrémenter (v4, v5...) à CHAQUE déploiement
const STATIC = [
  '/',
  '/index.html',
  '/style.css',
  '/app.js',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
];

// Installation — mise en cache des fichiers statiques
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(STATIC))
  );
  self.skipWaiting();
});

// Activation — supprimer les anciens caches
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Fetch — réseau en priorité pour les fichiers du site (toujours la dernière
// version), cache seulement en secours si le réseau échoue (hors-ligne).
// Avant : cache en priorité -> un utilisateur pouvait rester bloqué sur un
// vieux app.js buggé indéfiniment, même après avoir rechargé la page.
self.addEventListener('fetch', e => {
  if(e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if(url.pathname.startsWith('/proxy')) return;
  if(url.hostname.includes('firebase')) return;
  if(url.hostname.includes('googleapis')) return;

  e.respondWith(
    fetch(e.request).then(res => {
      if(STATIC.includes(url.pathname)){
        const clone = res.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(e.request, clone));
      }
      return res;
    }).catch(() => caches.match(e.request).then(cached => cached || caches.match('/index.html')))
  );
});
