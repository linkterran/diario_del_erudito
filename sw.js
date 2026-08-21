// Service Worker del Diario del Erudito
// Cachea el "app shell" (el propio index.html) para que la app funcione
// sin conexion una vez instalada. Todos los datos del usuario ya viven
// en localStorage, asi que lo unico que faltaba era poder cargar el
// documento en si sin red.

const CACHE_NAME = 'diario-erudito-v1';
const APP_SHELL = [
  './',
  './index.html'
];

// Instalacion: precachea el shell de la app
self.addEventListener('install', function(event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function(cache) {
      return cache.addAll(APP_SHELL);
    }).then(function() {
      return self.skipWaiting();
    })
  );
});

// Activacion: limpia caches antiguos si algun dia cambia la version
self.addEventListener('activate', function(event) {
  event.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(
        keys.filter(function(key) { return key !== CACHE_NAME; })
            .map(function(key) { return caches.delete(key); })
      );
    }).then(function() {
      return self.clients.claim();
    })
  );
});

// Estrategia de red: "cache primero, con actualizacion en segundo plano"
// para el documento principal, y "cache con fallback a red" para todo lo demas
// (incluidas las fuentes de Google, que si no hay red simplemente se omiten
// y el navegador usa la fuente serif de reserva).
self.addEventListener('fetch', function(event) {
  const request = event.request;

  // Solo interceptamos peticiones GET
  if (request.method !== 'GET') return;

  const isAppShell = APP_SHELL.some(function(url) {
    return request.url.endsWith(url.replace('./', ''));
  }) || request.mode === 'navigate';

  if (isAppShell) {
    event.respondWith(
      caches.match('./index.html').then(function(cached) {
        const networkFetch = fetch(request).then(function(response) {
          if (response && response.ok) {
            caches.open(CACHE_NAME).then(function(cache) {
              cache.put('./index.html', response.clone());
            });
          }
          return response;
        }).catch(function() {
          return cached;
        });
        // Sirve la version en cache de inmediato si existe; si no, espera a la red
        return cached || networkFetch;
      })
    );
    return;
  }

  // Recursos externos (p.ej. fuentes): cache primero, luego red, sin romper
  // la app si ambos fallan.
  event.respondWith(
    caches.match(request).then(function(cached) {
      if (cached) return cached;
      return fetch(request).then(function(response) {
        if (response && response.ok) {
          caches.open(CACHE_NAME).then(function(cache) {
            cache.put(request, response.clone());
          });
        }
        return response;
      }).catch(function() {
        // Sin red y sin cache: deja que falle silenciosamente (p.ej. una fuente)
        return new Response('', { status: 504, statusText: 'Sin conexion' });
      });
    })
  );
});
