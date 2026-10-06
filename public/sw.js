/**
 * Service Worker IncubApp — shell offline-first + red para datos.
 * Cachea la app (HTML/JS/CSS/iconos/fondo) para operar sin red.
 * Nunca cachea Supabase (datos en vivo / auth).
 * Henry Stark Desarrollador
 */
/* v12: la versión sube a propósito para que el activate borre las cachés
   viejas. Hasta v5 cualquier página .html navegada se guardaba TAMBIÉN como
   caparazón de la app, así que quien hubiera entrado a /reparar.html (o al
   recorrido 3D) abría IncubApp sin red y le salía esa página en vez del login.
   Al cambiar de nombre la caché, esos caparazones envenenados se descartan. */
// v15 (05-10-2026): Clasificación del operario y lecturas de ronda por foto: que todos los
// equipos descarten la caché vieja al abrir la app.
// v16 (06-10-2026): Plan AM y manuales de Granja La Fe, inicio del líder de granja y menú de
// líderes: que todos los equipos descarten la caché vieja al abrir la app.
// v17 (06-10-2026): apariencia de Misionales en toda la app, Misionales nuevo y OT del líder.
const CACHE = 'incubapp-shell-v17'
const PRECACHE = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/reparar.html',
  '/icon-192.png',
  '/icon-512.png',
  '/favicon.png',
  '/favicon.ico',
  '/apple-touch-icon.png',
  '/fondo.jpg',
  '/incubant-logo-full.png',
  '/incubant-mark.png',
  '/incubant-logo.svg',
]

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((c) =>
        Promise.all(
          PRECACHE.map((url) =>
            c.add(url).catch(() => {
              /* asset opcional */
            })
          )
        )
      )
      .then(() => self.skipWaiting())
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
      )
      .then(() => self.clients.claim())
  )
})

function isSupabase(url) {
  return (
    url.hostname.endsWith('.supabase.co') ||
    url.hostname.includes('supabase') ||
    url.pathname.startsWith('/auth/v1') ||
    url.pathname.startsWith('/rest/v1') ||
    url.pathname.startsWith('/storage/v1') ||
    url.pathname.startsWith('/realtime/v1') ||
    url.pathname.startsWith('/functions/v1') ||
    url.pathname.startsWith('/sb/')
  )
}

/**
 * Páginas que se sirven solas y NO son la app: el recorrido 3D de la planta y
 * la página de reparación. Se cachean bajo su propia URL, pero nunca como
 * caparazón de IncubApp.
 */
const STANDALONE_PAGES = ['/planta3d/', '/reparar.html']
function isStandalonePage(url) {
  return STANDALONE_PAGES.some((p) => url.pathname === p || url.pathname.startsWith(p))
}

function isStaticAsset(url) {
  return (
    url.pathname.startsWith('/assets/') ||
    url.pathname.endsWith('.js') ||
    url.pathname.endsWith('.css') ||
    url.pathname.endsWith('.woff2') ||
    url.pathname.endsWith('.png') ||
    url.pathname.endsWith('.jpg') ||
    url.pathname.endsWith('.jpeg') ||
    url.pathname.endsWith('.svg') ||
    url.pathname.endsWith('.ico') ||
    url.pathname.endsWith('.webp') ||
    url.pathname.endsWith('.webmanifest')
  )
}

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return

  let url
  try {
    url = new URL(req.url)
  } catch {
    return
  }

  // Datos / API: siempre red (sin caché). /sb/ es Supabase por el dominio de la app.
  if (isSupabase(url) || url.origin !== self.location.origin || url.pathname.startsWith('/sb/')) return

  // Navegación (SPA): network first → cache → index.html
  if (req.mode === 'navigate' || url.pathname === '/' || url.pathname.endsWith('.html')) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res && res.ok) {
            // Las copias se sacan YA: dentro del .then de caches.open el navegador
            // ya empezó a leer `res` y res.clone() fallaba, así que el caparazón
            // offline (/ y /index.html) se quedaba con la versión de la instalación.
            const copy = res.clone()
            // Solo el caparazón real de la app sobreescribe / y /index.html.
            const shell = isStandalonePage(url) ? null : [res.clone(), res.clone()]
            caches.open(CACHE).then((c) => {
              c.put(req, copy).catch(() => { })
              if (shell) {
                c.put('/index.html', shell[0]).catch(() => { })
                c.put('/', shell[1]).catch(() => { })
              }
            })
          }
          return res
        })
        .catch(async () => {
          // Una página aparte no cae al caparazón de la app: sin red se
          // responde con su propia copia o con el aviso de abajo.
          const hit = isStandalonePage(url)
            ? await caches.match(req)
            : (await caches.match(req)) ||
            (await caches.match('/index.html')) ||
            (await caches.match('/'))
          return (
            hit ||
            new Response(
              '<!DOCTYPE html><html><body style="font-family:system-ui;padding:24px"><h1>IncubApp offline</h1><p>Sin red y sin caché local. Conéctese una vez para instalar la app.</p><a href="/">Reintentar</a></body></html>',
              { headers: { 'Content-Type': 'text/html; charset=utf-8' } }
            )
          )
        })
    )
    return
  }

  // El recorrido 3D se sirve siempre de red primero. Sus archivos (data/planta.js,
  // js/*.js, las fotos de ronda) conservan el MISMO nombre en cada despliegue, así
  // que con la estrategia cache-first de abajo la primera visita tras publicar
  // mostraba la versión anterior y solo se actualizaba al recargar.
  if (url.pathname.startsWith('/planta3d/')) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res && res.ok) {
            const copy = res.clone()
            caches.open(CACHE).then((c) => c.put(req, copy))
          }
          return res
        })
        .catch(() => caches.match(req))
    )
    return
  }

  // Assets: cache-first (rápido offline), actualiza en segundo plano
  if (isStaticAsset(url)) {
    event.respondWith(
      caches.match(req).then((cached) => {
        const network = fetch(req)
          .then((res) => {
            if (res && res.ok) {
              const copy = res.clone()
              caches.open(CACHE).then((c) => c.put(req, copy))
            }
            return res
          })
          .catch(() => cached)
        return cached || network
      })
    )
    return
  }

  // Resto: network first con fallback a caché
  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res && res.ok) {
          const copy = res.clone()
          caches.open(CACHE).then((c) => c.put(req, copy))
        }
        return res
      })
      .catch(() => caches.match(req))
  )
})

self.addEventListener('message', (event) => {
  const type = event.data?.type
  if (type === 'SKIP_WAITING') self.skipWaiting()
  if (type === 'INCUBAPP_KEEPALIVE_START') {
    /* no-op heartbeat opcional */
  }
  if (type === 'CACHE_URLS' && Array.isArray(event.data?.urls)) {
    event.waitUntil(
      caches.open(CACHE).then((c) =>
        Promise.all(event.data.urls.map((u) => c.add(u).catch(() => { })))
      )
    )
  }
})
