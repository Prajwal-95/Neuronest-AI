const CACHE_VERSION = 'neuronest-v2'
const PRECACHE = `${CACHE_VERSION}-precache`
const RUNTIME = `${CACHE_VERSION}-runtime`

const PRECACHE_URLS = ['/', '/index.html', '/icon.svg', '/manifest.webmanifest']

/* ---------- Install: precache shell ---------- */
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches
      .open(PRECACHE)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
  )
})

/* ---------- Activate: purge old caches ---------- */
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k !== PRECACHE && k !== RUNTIME)
            .map((k) => caches.delete(k))
        )
      )
      .then(() => self.clients.claim())
  )
})

/* ---------- Fetch strategies ---------- */
self.addEventListener('fetch', (e) => {
  const { request } = e
  if (request.method !== 'GET') return

  /* Navigation: network-first, fallback to cached shell */
  if (request.mode === 'navigate') {
    e.respondWith(
      fetch(request)
        .then((res) => {
          /* Update the cached shell so offline gets latest HTML */
          const clone = res.clone()
          caches.open(PRECACHE).then((c) => c.put('/index.html', clone))
          return res
        })
        .catch(() => caches.match('/index.html'))
    )
    return
  }

  /* API calls: network only; IndexedDB handles offline */
  if (request.url.includes('/api/')) return

  /* Static assets: stale-while-revalidate with network-fail fallback */
  e.respondWith(
    caches.match(request).then((cached) => {
      const networkFetch = fetch(request)
        .then((response) => {
          if (response && response.status === 200) {
            const clone = response.clone()
            caches.open(RUNTIME).then((cache) => cache.put(request, clone))
          }
          return response
        })
        /* Network failed — serve stale cache if available, else opaque error */
        .catch(() => (cached ? cached : new Response('', { status: 504, statusText: 'Offline' })))

      return cached || networkFetch
    })
  )
})