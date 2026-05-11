var CACHE = 'attendance-v1';
var SHELL = ['./', './index.html', './app.js', './manifest.json', './icon-192.png', './icon-512.png'];

self.addEventListener('install', function(e) {
  e.waitUntil(caches.open(CACHE).then(function(c){ return c.addAll(SHELL); }));
  self.skipWaiting();
});

self.addEventListener('activate', function(e) {
  e.waitUntil(caches.keys().then(function(keys) {
    return Promise.all(keys.filter(function(k){ return k !== CACHE; }).map(function(k){ return caches.delete(k); }));
  }));
  self.clients.claim();
});

self.addEventListener('fetch', function(e) {
  var url = e.request.url;
  if (url.indexOf('script.google.com') >= 0 || url.indexOf('googleapis.com') >= 0) return;
  e.respondWith(
    caches.match(e.request).then(function(c){
      return c || fetch(e.request).catch(function(){ return caches.match('./index.html'); });
    })
  );
});
