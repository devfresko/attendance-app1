// Force fresh — bump version to bust old cache
var CACHE = 'att-v3';
var SHELL = ['./index.html', './manifest.json'];

self.addEventListener('install', function(e) {
  e.waitUntil(caches.open(CACHE).then(function(c) { return c.addAll(SHELL); }));
  self.skipWaiting();
});

self.addEventListener('activate', function(e) {
  e.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(keys.filter(function(k) { return k !== CACHE; }).map(function(k) { return caches.delete(k); }));
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', function(e) {
  var url = e.request.url;
  // Never cache API calls
  if (url.indexOf('script.google.com') >= 0 || url.indexOf('nominatim') >= 0) return;
  e.respondWith(
    fetch(e.request).catch(function() {
      return caches.match(e.request).then(function(r) { return r || caches.match('./index.html'); });
    })
  );
});
