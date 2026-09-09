const CACHE_VERSION = 'neuronest-v1'
const PRECACHE = `${CACHE_VERSION}-precache`
const RUNTIME = `${CACHE_VERSION}-runtime`

const PRECACHE_URLS = ['/', '/index.html', '/icon.svg']

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(PRECACHE).then((cache) => cache.addAll(PRECACHE_URLS)).then(() => self.skipWaiting())
  )
})

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k !== PRECACHE && k !== RUNTIME)
          .map((k) => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', (e) => {
  const { request } = e
  // Skip non-GET
  if (request.method !== 'GET') return

  // Navigation requests: network-first fallback to cache
  if (request.mode === 'navigate') {
    e.respondWith(
      fetch(request).catch(() => caches.match('/index.html'))
    )
    return
  }

  // API calls: network only, let IndexedDB handle offline
  if (request.url.includes('/api/')) return

  // Static assets: stale-while-revalidate
  e.respondWith(
    caches.match(request).then((cached) => {
      const fetched = fetch(request).then((response) => {
        if (response && response.status === 200) {
          const clone = response.clone()
          caches.open(RUNTIME).then((cache) => cache.put(request, clone))
        }
        return response
      })
      return cached || fetched
    })
  )
})