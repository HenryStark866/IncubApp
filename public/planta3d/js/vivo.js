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
 *
 * Sin sesión —una visita pública— no pasa nada: se queda la instantánea de
 * data/planta.js, que es el respaldo y funciona hasta sin internet.
 * =============================================================================
 */
;(function (global) {
  'use strict'

  const CFG = global.PLANTA3D_SUPABASE
  if (!CFG || !CFG.url || !CFG.key) return

  const PLANTA = global.PLANTA?.meta?.plantId
  if (!PLANTA) return

  const REF = CFG.url.replace(/^https?:\/\//, '').split('.')[0]

  /** La sesión que guarda supabase-js en este mismo dominio. */
  function tokenDeSesion() {
    try {
      for (const clave of [`sb-${REF}-auth-token`, 'supabase.auth.token']) {
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
      headers: { apikey: CFG.key, Authorization: `Bearer ${token}` },
    })
    if (!r.ok) throw new Error(`${r.status} ${r.statusText}`)
    return r.json()
  }

  const num = (v) => (v == null ? 0 : Number(v))

  /** Trae el plano y lo vuelca sobre window.PLANTA, respetando lo curado. */
  async function traerPlano(token) {
    const [rooms, machines] = await Promise.all([
      pedir(`rooms?plant_id=eq.${PLANTA}&select=id,code,name,type,nivel,pos_x,pos_y,width,height,rotation,color,doors,parte_de,altura,wall_heights,points`, token),
      pedir(`machines?plant_id=eq.${PLANTA}&select=id,code,name,type,brand,status,room_id,pos_x,pos_y,rotation`, token),
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
        doors: (r.doors || []).map((d) => ({
          x: num(d.x), y: num(d.y), rot: num(d.rot), type: d.type || 'normal',
          ...(d.lado ? { lado: d.lado } : null),
          ...(d.abre ? { abre: d.abre } : null),
          ...(d.w != null ? { w: num(d.w) } : null),
          ...(d.h != null ? { h: num(d.h) } : null),
          ...(d.base != null ? { base: num(d.base) } : null),
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
      if (p.proyectada) sala.proyectada = p.proyectada
      if (p.medida) sala.medida = p.medida
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
        // `ops` y `foto` son derivados: no viven en la tabla.
        ops: p.ops || 'idle',
        foto: p.foto !== undefined ? p.foto : `${m.code}.jpg`,
      }
    })
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
      latido = setInterval(() => env('phoenix', 'heartbeat', {}), 25000)
    }

    ws.onmessage = (ev) => {
      let msg
      try { msg = JSON.parse(ev.data) } catch { return }
      if (msg.event === 'postgres_changes') alCambiar(msg.payload?.data?.table)
    }

    const reintentar = () => {
      clearInterval(latido)
      setTimeout(() => escuchar(token, alCambiar), 4000)
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

    let pendiente = null
    escuchar(token, () => {
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
