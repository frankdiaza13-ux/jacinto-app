/* Jacinto: guarda la app para abrir sin señal. Nunca guarda Google Sheets ni GitHub (otro origen). */
var CACHE = 'jacinto-v2';
var CASCARA = ['./', './index.html', './app.css', './nucleo.js', './app.js', './manifest.webmanifest',
  './icon-192.png', './icon-512.png', './apple-touch-icon.png'];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(CASCARA); }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (ks) {
    return Promise.all(ks.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

function guardar(req, resp) {
  if (resp && resp.ok && resp.type === 'basic') {
    var copia = resp.clone();
    caches.open(CACHE).then(function (c) { c.put(req, copia); });
  }
  return resp;
}

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  if (url.origin !== self.location.origin) return;   // Sheets/GitHub: siempre red

  var esHTML = req.mode === 'navigate' || (req.headers.get('accept') || '').indexOf('text/html') !== -1;
  if (esHTML) {   // HTML: red primero
    e.respondWith(fetch(req).then(function (r) {
      if (r.ok) { var copia = r.clone(); caches.open(CACHE).then(function (c) { c.put('./index.html', copia); }); }
      return r;
    }).catch(function () {
      return caches.match('./index.html').then(function (r) { return r || caches.match('./'); });
    }));
    return;
  }
  if (/\.json$/.test(url.pathname)) {   // demo.json: red primero
    e.respondWith(fetch(req).then(function (r) { return guardar(req, r); }).catch(function () {
      return caches.match(req).then(function (r) { return r || Response.error(); });
    }));
    return;
  }
  // CSS/JS/íconos: copia al tiro y se actualiza por detrás
  e.respondWith(caches.match(req).then(function (hit) {
    var red = fetch(req).then(function (r) { return guardar(req, r); }).catch(function () { return hit || Response.error(); });
    return hit || red;
  }));
});
