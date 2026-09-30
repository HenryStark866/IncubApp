/* =============================================================================
 * vivo.js — mantiene la maqueta sincronizada con el plano de IncubApp.
 *
 * Cuando alguien mueve una puerta, gira una máquina o cambia una sala en el
 * editor 2D, el cambio se ve aquí en el acto, sin recargar.
 *
 * Cómo funciona:
 *   1. El recorrido vive en el MISMO dominio que IncubApp, así que puede leer
 *      la sesión que la app ya guardó en localStorage. No hay login aparte.
 *   2. Con ese token pide rooms y machines por PostgREST (la RLS solo exige ser
 *      miembro de la organización) y reemplaza los datos de la instantánea.
 *   3. Se suscribe por Realtime a las dos tablas y, ante cualquier cambio,
 *      vuelve a pedir el plano y manda reconstruir la escena.
 *   4. Trae la última foto de ronda de cada equipo (machine_checks) para su
 *      pantalla, la renueva cada 5 minutos y cuando entra una ronda nueva, y
 *      la cambia sin reconstruir nada.
 *
 * Sin sesión —una visita pública— no pasa nada: se queda la instantánea de
 * data/planta.js, que es el respaldo y funciona hasta sin internet.
 * =============================================================================
 */
;(function (global) {
  'use strict'

  const CFG0 = global.PLANTA3D_SUPABASE
  if (!CFG0 || !CFG0.url || !CFG0.key) return

  // La MISMA regla que la app (src/lib/supabase.js): con Supabase en la nube se usa
  // su URL; con servidor propio (incubapp.cdhmaker.com, túnel o red local) la API
  // sale por el mismo nginx que sirve esta página. Antes se usaba la URL con que se
  // compiló (el túnel ngrok): la sesión que la app guarda con el nombre del dominio
  // no se encontraba y las pantallas nunca traían las fotos de ronda.
  function urlSupabase() {
    const fija = String(CFG0.url).replace(/\/$/, '')
    if (/\.supabase\.co$/i.test(fija)) return fija
    const { origin, hostname, port, protocol } = global.location
    if (hostname.includes('ngrok') || hostname.includes('trycloudflare.com') || protocol === 'https:' || !port || port === '80') {
      return origin
    }
    if (port === '5173') return `${protocol}//${hostname}:8000`
    return fija
  }
  const CFG = { url: urlSupabase(), key: CFG0.key }
  const ENCABEZADOS = { apikey: CFG.key, 'ngrok-skip-browser-warning': '1' }

  const PLANTA = global.PLANTA?.meta?.plantId
  if (!PLANTA) return

  const refDe = (u) => String(u).replace(/^https?:\/\//, '').split(/[.:/]/)[0]
  const REFS = [...new Set([refDe(CFG.url), refDe(CFG0.url)])]

  /** La sesión que guarda supabase-js en este mismo dominio. */
  function tokenDeSesion() {
    try {
      for (const clave of [...REFS.map((r) => `sb-${r}-auth-token`), 'supabase.auth.token']) {
        const crudo = localStorage.getItem(clave)
        if (!crudo) continue
        const j = JSON.parse(crudo)
        const t = j?.access_token || j?.currentSession?.access_token
        if (t) return t
      }
    } catch { /* localStorage bloqueado: se sigue con la instantánea */ }
    return null
  }

  const aviso = (txt) => {
    const el = document.getElementById('aviso')
    if (!el) return
    el.textContent = txt
    el.style.display = 'block'
    clearTimeout(aviso._t)
    aviso._t = setTimeout(() => { el.style.display = 'none' }, 2600)
  }

  async function pedir(ruta, token) {
    const r = await fetch(`${CFG.url}/rest/v1/${ruta}`, {
      headers: { ...ENCABEZADOS, Authorization: `Bearer ${token}` },
    })
    if (!r.ok) throw new Error(`${r.status} ${r.statusText}`)
    return r.json()
  }

  const num = (v) => (v == null ? 0 : Number(v))

  /** Trae el plano y lo vuelca sobre window.PLANTA, respetando lo curado. */
  async function traerPlano(token) {
    const [rooms, machines] = await Promise.all([
      pedir(`rooms?plant_id=eq.${PLANTA}&select=id,code,name,type,nivel,pos_x,pos_y,width,height,rotation,color,doors,parte_de,altura,wall_heights,points`, token),
      pedir(`machines?plant_id=eq.${PLANTA}&select=id,code,name,type,brand,status,room_id,pos_x,pos_y,rotation,width,depth,height`, token),
    ])

    // Lo que NO vive en la base se conserva de la instantánea: los nombres con
    // tilde curados a mano y las marcas locales que siguen siendo solo del
    // snapshot (proyectada, medida en campo). `altura` y `parte_de` SÍ son
    // columnas reales desde el 2026-09-01 y mandan si están, cayendo a lo que
    // ya había en el snapshot solo para una sala que no se ha vuelto a tocar
    // desde el editor (así no se pierde el ajuste manual con el que se cargó
    // antes de existir la columna). `wall_heights` es enteramente nueva, sin
    // ese respaldo.
    const previas = new Map((global.PLANTA.rooms || []).map((r) => [r.id, r]))

    global.PLANTA.rooms = rooms.map((r) => {
      const p = previas.get(r.id) || {}
      const sala = {
        id: r.id,
        code: r.code,
        name: p.name || r.name,
        type: r.type,
        x: num(r.pos_x), y: num(r.pos_y), w: num(r.width), h: num(r.height),
        rot: num(r.rotation),
        color: r.color ?? null,
        // `lado` (el muro donde va escrita), `w` (ancho propio: ventanas de
        // comedor, puertillas de plenum) y `h`/`base` (ventana de alto o
        // antepecho propio) también son del vano, no solo x/y/rot/type — sin
        // esto una puerta viva podía perder el muro con el que se guardó, o
        // una ventana volver a su ancho por defecto.
        // `cristal` y `rejilla` dicen de que es la hoja, y viven en el jsonb de
        // la base igual que el resto. Sin copiarlos aqui, el primer refresco en
        // vivo devolvia la vidriera de la oficina de produccion a una hoja
        // opaca y las ventanillas de los cuartos de succion a un vidrio liso,
        // sin que nadie hubiera tocado el plano.
        doors: (r.doors || []).map((d) => ({
          x: num(d.x), y: num(d.y), rot: num(d.rot), type: d.type || 'normal',
          ...(d.lado ? { lado: d.lado } : null),
          ...(d.abre ? { abre: d.abre } : null),
          ...(d.w != null ? { w: num(d.w) } : null),
          ...(d.h != null ? { h: num(d.h) } : null),
          ...(d.base != null ? { base: num(d.base) } : null),
          ...(d.cristal ? { cristal: true } : null),
          ...(d.rejilla ? { rejilla: true } : null),
        })),
      }
      if (Number(r.nivel) === 2) sala.nivel = 2
      const altura = r.altura != null ? Number(r.altura) : p.altura
      if (altura != null) sala.altura = altura
      const parteDe = r.parte_de || p.parteDe
      if (parteDe) sala.parteDe = parteDe
      if (r.wall_heights && Object.keys(r.wall_heights).length) sala.wallHeights = r.wall_heights
      // Contorno de forma libre. Se dibuja a mano en el editor 2D y hasta ahora
      // no venia en la consulta en vivo: el 3D levantaba el rectangulo
      // envolvente y el recorte no aparecia hasta regenerar la instantanea.
      if (Array.isArray(r.points) && r.points.length > 2) {
        sala.puntos = r.points.map((q) => ({ x: num(q.x), y: num(q.y) }))
      }
      // Marcas que NO son columnas de la base y solo viven en la instantanea.
      // Se arrastran todas, no solo dos: sin `exterior`, el corredor de las
      // oficinas volvia a contarse como pasillo interior y se cerraba con muro
      // por los cuatro costados —dejando el ala administrativa incomunicada— en
      // cuanto entraba el primer refresco en vivo. Y sin `terraza` el bloque se
      // quedaba sin su losa plana y sin el antepecho de los 360 grados.
      if (p.proyectada) sala.proyectada = p.proyectada
      if (p.medida) sala.medida = p.medida
      if (p.exterior) sala.exterior = p.exterior
      if (p.terraza) sala.terraza = p.terraza
      return sala
    })

    const antes = new Map((global.PLANTA.machines || []).map((m) => [m.id, m]))
    global.PLANTA.machines = machines.map((m) => {
      const p = antes.get(m.id) || {}
      return {
        id: m.id, code: m.code, name: m.name, type: m.type,
        brand: m.brand ?? null, status: m.status,
        room: m.room_id,
        x: num(m.pos_x), y: num(m.pos_y), rot: num(m.rotation),
        // Medidas propias del equipo. Ausentes, manda la medida de su tipo:
        // por eso van solo si vienen, en vez de caer a cero.
        ...(m.width != null ? { w: num(m.width) } : null),
        ...(m.depth != null ? { d: num(m.depth) } : null),
        ...(m.height != null ? { h: num(m.height) } : null),
        // `ops` y las fotos son derivados: no viven en la tabla. `foto` es la
        // de la instantánea (fotos/) hasta que llega la de la ronda en vivo, y
        // entonces la de la instantánea pasa a `fotoRespaldo`.
        ops: p.ops || 'idle',
        foto: p.foto !== undefined ? p.foto : `${m.code}.jpg`,
        ...(p.fotoRespaldo !== undefined ? { fotoRespaldo: p.fotoRespaldo } : null),
        ...(p.fotoTomada ? { fotoTomada: p.fotoTomada, fotoCondicion: p.fotoCondicion ?? null } : null),
      }
    })
  }

  // ── Fotos de ronda en vivo ──────────────────────────────────────────────
  // La pantalla de cada equipo enseña su ÚLTIMA foto de ronda. La carpeta
  // fotos/ es una instantánea que envejece (se bajó el 18-08-2026 con
  // `npm run planta3d:fotos`): con sesión abierta se pide a la base la última
  // foto de cada equipo, se firma en Storage y se vuelve a mirar cada 5 min y
  // cada vez que Realtime avisa de una ronda nueva. Sin sesión o sin red se
  // queda la instantánea, que es también el respaldo si una foto no carga.
  const FOTOS_CADA_MS = 5 * 60 * 1000
  const FIRMA_SEG = 6 * 60 * 60
  const CAMPOS_RONDA = 'select=machine_id,photo_path,taken_at,condition'
  const firmas = new Map() // photo_path → { url, vence }
  const ultimas = new Map() // machine_id → { path, tomada, condicion }
  let barridoCompleto = false

  const ms = (iso) => { const t = Date.parse(iso); return Number.isNaN(t) ? 0 : t }

  function anotar(f) {
    if (!f?.machine_id || !f.photo_path) return
    const previa = ultimas.get(f.machine_id)
    if (previa && ms(previa.tomada) >= ms(f.taken_at)) return
    ultimas.set(f.machine_id, { path: f.photo_path, tomada: f.taken_at, condicion: f.condition || null })
  }

  /** URL firmadas del bucket privado machine-checks, reutilizadas mientras no estén por vencer. */
  async function firmar(paths, token) {
    const ahora = Date.now()
    const faltan = paths.filter((p) => !(firmas.get(p)?.vence > ahora + 30 * 60 * 1000))
    for (let i = 0; i < faltan.length; i += 100) {
      const r = await fetch(`${CFG.url}/storage/v1/object/sign/machine-checks`, {
        method: 'POST',
        headers: { ...ENCABEZADOS, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ expiresIn: FIRMA_SEG, paths: faltan.slice(i, i + 100) }),
      })
      if (!r.ok) throw new Error(`firma ${r.status} ${r.statusText}`)
      for (const f of await r.json()) {
        if (f?.path && f.signedURL) {
          firmas.set(f.path, { url: encodeURI(`${CFG.url}/storage/v1${f.signedURL}`), vence: ahora + FIRMA_SEG * 1000 })
        }
      }
    }
    return new Map(paths.filter((p) => firmas.has(p)).map((p) => [p, firmas.get(p).url]))
  }

  /** Trae la última foto de ronda de cada equipo y la deja en window.PLANTA. */
  async function traerFotos(token) {
    const maquinas = global.PLANTA.machines || []
    const base = `machine_checks?plant_id=eq.${PLANTA}&photo_path=not.is.null&${CAMPOS_RONDA}&order=taken_at.desc`
    let desde = 0
    for (const u of ultimas.values()) desde = Math.max(desde, ms(u.tomada))
    // La primera vez, las mil rondas con foto más recientes; después, solo lo nuevo.
    const filas = barridoCompleto && desde
      ? await pedir(`${base}&taken_at=gt.${encodeURIComponent(new Date(desde).toISOString())}&limit=500`, token)
      : await pedir(`${base}&limit=1000`, token)
    filas.forEach(anotar)

    if (!barridoCompleto) {
      // Un equipo que no salió entre esas mil (un compresor que se revisa poco)
      // se busca aparte, de a seis consultas a la vez.
      const faltan = maquinas.filter((m) => !ultimas.has(m.id))
      for (let i = 0; i < faltan.length; i += 6) {
        await Promise.all(faltan.slice(i, i + 6).map(async (m) => {
          try {
            const [f] = await pedir(`machine_checks?machine_id=eq.${m.id}&photo_path=not.is.null&${CAMPOS_RONDA}&order=taken_at.desc&limit=1`, token)
            anotar(f)
          } catch { /* se queda con la foto de la instantánea */ }
        }))
      }
      barridoCompleto = true
    }

    const urls = await firmar([...new Set([...ultimas.values()].map((u) => u.path))], token)
    for (const m of maquinas) {
      const u = ultimas.get(m.id)
      const url = u && urls.get(u.path)
      if (!url) continue
      // La foto de la instantánea queda de respaldo por si la de la base no carga.
      if (m.fotoRespaldo === undefined) m.fotoRespaldo = m.foto && !/^https?:/i.test(m.foto) ? m.foto : null
      m.foto = url
      m.fotoTomada = u.tomada
      m.fotoCondicion = u.condicion
    }
  }

  let fotosEnCurso = null
  function refrescarFotos() {
    if (fotosEnCurso) return fotosEnCurso
    const token = tokenDeSesion()
    if (!token) return Promise.resolve()
    fotosEnCurso = traerFotos(token)
      .then(() => global.PLANTA3D?.actualizarPantallas?.())
      .catch((e) => console.warn('[planta3d] no se pudieron leer las fotos de ronda:', e.message))
      .finally(() => { fotosEnCurso = null })
    return fotosEnCurso
  }

  // ── Espacios confinados en vivo ─────────────────────────────────────────
  // Los túneles se pintan según su permiso de entrada (SST → Espacios confinados):
  // libre, por autorizar, autorizado, gente adentro o suspendido. Se lee al abrir,
  // cada minuto y cuando Realtime avisa de un permiso o de una entrada/salida. Si el
  // servidor todavía no tiene las tablas, no pasa nada: quedan marcados como libres.
  const hhmm = (iso) => (iso ? new Date(iso).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' }) : '')

  async function traerConfinados(token) {
    const espacios = await pedir(`sst_confined_spaces?plant_id=eq.${PLANTA}&active=is.true&select=id,room_id`, token)
    const conSala = espacios.filter((e) => e.room_id)
    const estados = {}
    if (conSala.length) {
      const ids = conSala.map((e) => e.id).join(',')
      const permisos = await pedir(
        `sst_confined_permits?space_id=in.(${ids})&status=in.(draft,authorized,active,suspended)` +
        '&select=id,space_id,status,attendant_name,valid_until,suspended_reason&order=created_at.desc',
        token
      )
      const adentro = permisos.length
        ? await pedir(`sst_confined_entries?permit_id=in.(${permisos.map((p) => p.id).join(',')})&exited_at=is.null&select=permit_id,person_name`, token)
        : []
      for (const esp of conSala) {
        const suyos = permisos.filter((p) => p.space_id === esp.id)
        if (!suyos.length) continue
        const gente = adentro.filter((a) => suyos.some((p) => p.id === a.permit_id)).map((a) => a.person_name)
        const suspendido = suyos.find((p) => p.status === 'suspended')
        const vivo = suyos.find((p) => p.status === 'active' || p.status === 'authorized')
        const ref = suspendido || vivo || suyos[0]
        estados[esp.room_id] = {
          state: suspendido ? 'suspended' : gente.length ? 'occupied' : vivo ? 'authorized' : 'draft',
          inside: gente,
          attendant: ref.attendant_name || '',
          until: hhmm(ref.valid_until),
          reason: suspendido?.suspended_reason || '',
        }
      }
    }
    global.PLANTA.confinados = estados
  }

  let confinadosEnCurso = null
  let sinConfinados = false
  function refrescarConfinados() {
    if (confinadosEnCurso || sinConfinados) return confinadosEnCurso
    const token = tokenDeSesion()
    if (!token) return Promise.resolve()
    confinadosEnCurso = traerConfinados(token)
      .then(() => global.PLANTA3D?.actualizarConfinados?.())
      .catch((e) => {
        // 404/400: el servidor aún no tiene espacios confinados; no se vuelve a pedir.
        if (/^(400|404) /.test(e.message)) sinConfinados = true
        else console.warn('[planta3d] no se pudieron leer los espacios confinados:', e.message)
      })
      .finally(() => { confinadosEnCurso = null })
    return confinadosEnCurso
  }

  // ── Realtime por WebSocket, sin librería ────────────────────────────────
  // El canal de Supabase habla el protocolo de Phoenix. Se pide `postgres_changes`
  // sobre rooms y machines de esta planta; cada aviso dispara una relectura.
  function escuchar(token, alCambiar) {
    const ws = new WebSocket(
      `${CFG.url.replace(/^http/, 'ws')}/realtime/v1/websocket?apikey=${CFG.key}&vsn=1.0.0`
    )
    let ref = 0
    const env = (topic, event, payload) =>
      ws.send(JSON.stringify({ topic, event, payload, ref: String(++ref) }))

    let latido
    ws.onopen = () => {
      env('realtime:planta3d', 'phx_join', {
        config: {
          broadcast: { self: false },
          postgres_changes: [
            { event: '*', schema: 'public', table: 'rooms', filter: `plant_id=eq.${PLANTA}` },
            { event: '*', schema: 'public', table: 'machines', filter: `plant_id=eq.${PLANTA}` },
          ],
        },
        access_token: token,
      })
      // Las rondas van en un canal aparte: si ese no se pudiera suscribir, el
      // del plano sigue funcionando igual.
      env('realtime:planta3d-rondas', 'phx_join', {
        config: {
          broadcast: { self: false },
          postgres_changes: [
            { event: 'INSERT', schema: 'public', table: 'machine_checks', filter: `plant_id=eq.${PLANTA}` },
          ],
        },
        access_token: token,
      })
      // Permisos y entradas a los túneles (espacios confinados), también aparte.
      env('realtime:planta3d-confinados', 'phx_join', {
        config: {
          broadcast: { self: false },
          postgres_changes: [
            { event: '*', schema: 'public', table: 'sst_confined_permits' },
            { event: '*', schema: 'public', table: 'sst_confined_entries' },
          ],
        },
        access_token: token,
      })
      latido = setInterval(() => env('phoenix', 'heartbeat', {}), 25000)
    }

    ws.onmessage = (ev) => {
      let msg
      try { msg = JSON.parse(ev.data) } catch { return }
      if (msg.event === 'postgres_changes') alCambiar(msg.payload?.data?.table)
    }

    const reintentar = () => {
      clearInterval(latido)
      // Con la sesión de ahora: la del arranque vence a la hora.
      setTimeout(() => escuchar(tokenDeSesion() || token, alCambiar), 4000)
    }
    ws.onclose = reintentar
    ws.onerror = () => ws.close()
    return ws
  }

  // ── Arranque ────────────────────────────────────────────────────────────
  async function iniciar() {
    const token = tokenDeSesion()
    if (!token) return           // visita pública: se queda la instantánea

    try {
      await traerPlano(token)
      global.PLANTA3D?.reconstruir?.()
    } catch (e) {
      console.warn('[planta3d] no se pudo leer el plano en vivo:', e.message)
      return                     // sin permiso o sin red: sigue la instantánea
    }

    refrescarFotos()
    setInterval(refrescarFotos, FOTOS_CADA_MS)
    refrescarConfinados()
    setInterval(refrescarConfinados, 60 * 1000)

    let pendiente = null
    let pendienteFotos = null
    let pendienteConfinados = null
    escuchar(token, (tabla) => {
      if (String(tabla || '').startsWith('sst_confined')) {
        clearTimeout(pendienteConfinados)
        pendienteConfinados = setTimeout(refrescarConfinados, 800)
        return
      }
      // Una ronda nueva solo cambia la pantalla de su equipo: no se reconstruye.
      if (tabla === 'machine_checks') {
        clearTimeout(pendienteFotos)
        pendienteFotos = setTimeout(refrescarFotos, 1500)
        return
      }
      // Varios cambios seguidos (arrastrar una puerta emite muchos) se juntan
      // en una sola reconstrucción.
      clearTimeout(pendiente)
      pendiente = setTimeout(async () => {
        try {
          await traerPlano(tokenDeSesion() || token)
          global.PLANTA3D?.reconstruir?.()
          aviso('Plano actualizado desde IncubApp')
        } catch (e) {
          console.warn('[planta3d] no se pudo refrescar:', e.message)
        }
      }, 250)
    })
  }

  if (document.readyState === 'complete') setTimeout(iniciar, 400)
  else window.addEventListener('load', () => setTimeout(iniciar, 400))
})(window)
