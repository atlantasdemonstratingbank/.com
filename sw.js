// sw.js — Atlantas User App Service Worker v4 (Background Push)
var CACHE = 'atl-user-v4';
var ASSETS = ['/', 'index.html', 'user.js', 'config.js', 'pwa.js', 'manifest.json'];

// ── INSTALL ──────────────────────────────────────────────────
self.addEventListener('install', function(e) {
  e.waitUntil(caches.open(CACHE).then(function(c) { return c.addAll(ASSETS); }).catch(function() {}));
  self.skipWaiting();
});

// ── ACTIVATE ─────────────────────────────────────────────────
self.addEventListener('activate', function(e) {
  e.waitUntil(caches.keys().then(function(keys) {
    return Promise.all(keys.filter(function(k) { return k !== CACHE; }).map(function(k) { return caches.delete(k); }));
  }));
  self.clients.claim();
});

// ── FETCH ─────────────────────────────────────────────────────
self.addEventListener('fetch', function(e) {
  if (e.request.method !== 'GET') return;
  if (e.request.url.indexOf('firebaseio.com') !== -1 ||
      e.request.url.indexOf('googleapis.com') !== -1 ||
      e.request.url.indexOf('gstatic.com') !== -1 ||
      e.request.url.indexOf('cloudinary.com') !== -1 ||
      e.request.url.indexOf('emailjs.com') !== -1) {
    e.respondWith(fetch(e.request).catch(function() { return caches.match(e.request); }));
    return;
  }
  e.respondWith(
    caches.match(e.request).then(function(cached) {
      var fetched = fetch(e.request).then(function(resp) {
        if (resp && resp.status === 200 && resp.type !== 'opaque') {
          var clone = resp.clone();
          caches.open(CACHE).then(function(c) { c.put(e.request, clone); });
        }
        return resp;
      }).catch(function() {});
      return cached || fetched;
    })
  );
});

// ── PUSH: fires when app is closed (requires VAPID or FCM) ───
// This fires for both Web Push (VAPID) and Firebase Cloud Messaging pushes.
self.addEventListener('push', function(e) {
  var data = {
    title: 'Atlantas',
    body: 'You have a new notification.',
    icon: 'https://i.imgur.com/iN8T10D.jpeg',
    badge: 'https://i.imgur.com/iN8T10D.jpeg',
    tag: 'atl-user-' + Date.now(),
    requireInteraction: false,
    url: '/'
  };
  try { if (e.data) { var d = e.data.json(); data = Object.assign(data, d); } } catch (err) {}
  e.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: data.icon,
      badge: data.badge,
      tag: data.tag,
      requireInteraction: data.requireInteraction || false,
      vibrate: [200, 100, 200],
      data: { url: data.url || '/' }
    })
  );
});

// ── NOTIFICATION CLICK ────────────────────────────────────────
self.addEventListener('notificationclick', function(e) {
  e.notification.close();
  var target = (e.notification.data && e.notification.data.url) || '/';
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(cls) {
      for (var i = 0; i < cls.length; i++) {
        if (cls[i].url && cls[i].focus) { cls[i].focus(); return; }
      }
      if (clients.openWindow) return clients.openWindow(target);
    })
  );
});

// ── FIREBASE MESSAGING BACKGROUND HANDLER ────────────────────
// This enables FCM push when the app is closed on Android Chrome & iOS 16.4+ PWA.
// You must also call firebase.messaging().setBackgroundMessageHandler in this SW.
try {
  importScripts('https://www.gstatic.com/firebasejs/9.23.0/firebase-app-compat.js');
  importScripts('https://www.gstatic.com/firebasejs/9.23.0/firebase-messaging-compat.js');
  firebase.initializeApp({
    apiKey:            'AIzaSyDLPAktzLmpfNX9XUmw9i_B2P2I3XPwOLs',
    authDomain:        'viccybank.firebaseapp.com',
    databaseURL:       'https://viccybank-default-rtdb.firebaseio.com',
    projectId:         'viccybank',
    storageBucket:     'viccybank.firebasestorage.app',
    messagingSenderId: '328465601734',
    appId:             '1:328465601734:web:ae8d6bee3683be60629b32'
  });
  var messaging = firebase.messaging();
  // Handle background FCM messages (app closed / background)
  messaging.onBackgroundMessage(function(payload) {
    var notifTitle = (payload.notification && payload.notification.title) || 'Atlantas';
    var notifBody  = (payload.notification && payload.notification.body)  || 'You have a new notification.';
    self.registration.showNotification(notifTitle, {
      body: notifBody,
      icon:  'https://i.imgur.com/iN8T10D.jpeg',
      badge: 'https://i.imgur.com/iN8T10D.jpeg',
      tag:   'atl-fcm-' + Date.now(),
      requireInteraction: false,
      vibrate: [200, 100, 200],
      data: { url: '/' }
    });
  });
} catch(e) { /* FCM not available — standard Web Push still works */ }

// ── MESSAGES FROM APP ─────────────────────────────────────────
self.addEventListener('message', function(e) {
  if (!e.data) return;
  if (e.data.type === 'PING') {
    self.clients.matchAll().then(function(cls) {
      cls.forEach(function(c) { c.postMessage({ type: 'PONG' }); });
    });
  }
  if (e.data.type === 'NEW_NOTIF') {
    self.clients.matchAll({ includeUncontrolled: true }).then(function(cls) {
      cls.forEach(function(c) { c.postMessage(e.data); });
    });
  }
});

// ── BACKGROUND SYNC ───────────────────────────────────────────
self.addEventListener('sync', function(e) {
  if (e.tag === 'atl-user-sync') {
    e.waitUntil(
      self.clients.matchAll().then(function(cls) {
        cls.forEach(function(c) { c.postMessage({ type: 'SYNC' }); });
      })
    );
  }
});
