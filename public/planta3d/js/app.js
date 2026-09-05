/* =============================================================================
 * app.js — arranque, vistas, interfaz y recorrido guiado.
 * =============================================================================
 */
(function () {
  'use strict'

  const D = window.PLANTA
  const $ = (s) => document.querySelector(s)
  const $$ = (s) => Array.from(document.querySelectorAll(s))
  const GRADO = Math.PI / 180

  // ── Escena ───────────────────────────────────────────────────────────────
  const lienzo = $('#lienzo')
  const renderer = new THREE.WebGLRenderer({
    canvas: lienzo, antialias: true, preserveDrawingBuffer: true, powerPreference: 'high-performance',
  })
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
  renderer.setSize(innerWidth, innerHeight)
  renderer.outputEncoding = THREE.sRGBEncoding
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.05
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFSoftShadowMap

  const escena = new THREE.Scene()
  escena.background = new THREE.Color(0x0a1526)
  escena.fog = new THREE.Fog(0x0a1526, 90, 330)

  const camara = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.1, 2500)
  const FOV_NORMAL = 62

  const hemi = new THREE.HemisphereLight(0x8fb4e8, 0x1d2a19, 0.45)
  escena.add(hemi)
  const sol = new THREE.DirectionalLight(0xfff3e2, 1.55)
  sol.castShadow = true
  sol.shadow.mapSize.set(2048, 2048)
  sol.shadow.camera.near = 1
  sol.shadow.camera.far = 400
  sol.shadow.bias = -0.0009
  escena.add(sol, sol.target)
  const relleno = new THREE.DirectionalLight(0xbcd6ff, 0.35)
  relleno.position.set(-60, 50, 80)
  escena.add(relleno)

  // ── Opciones (se declara ya, porque el primer armado del mundo la necesita) ─
  const opciones = {
    etiquetas: true, equipos: true, techos: false, cotas: true,
    sombras: true, atravesar: false, volar: false, giro: false, sonido: true,
    // 'ambos' arma la planta completa con sus dos niveles, tal como está
    // construida; 1 o 2 aísla ese nivel (ver el toggle #grupoNivel).
    nivel: 'ambos',
  }

  // ── Mundo ────────────────────────────────────────────────────────────────
  let mundo = Mundo.construirPlanta(D, opciones)
  escena.add(mundo.raiz)
  const L = mundo.limites

  sol.position.set(L.cx + 70, 110, L.cz - 90)
  sol.target.position.set(L.cx, 0, L.cz)
  const sc = sol.shadow.camera
  sc.left = -(L.ancho / 2 + 25); sc.right = L.ancho / 2 + 25
  sc.top = L.largo / 2 + 60; sc.bottom = -(L.largo / 2 + 60)
  sc.updateProjectionMatrix()

  // ── Controles ────────────────────────────────────────────────────────────
  const fps = Controles.PrimeraPersona(camara, lienzo, { limites: L })
  fps.colisiones = mundo.colisiones
  fps.losa = mundo.losa
  fps.rampas = mundo.rampas
  const orbita = Controles.Orbita(camara, lienzo)

  fps.estado.onEstado = (bloqueado) => {
    if (vista === 'fps' && !bloqueado) aviso('Recorrido en pausa — haga clic en la planta para seguir caminando')
  }

  // ── Estado de la interfaz ────────────────────────────────────────────────
  let vista = 'orbita'
  let seleccion = null
  let reloj = new THREE.Clock()

  // ── Utilidades ───────────────────────────────────────────────────────────
  let avisoTimer = null
  function aviso(txt, ms) {
    const el = $('#aviso')
    el.textContent = txt
    el.style.display = 'block'
    clearTimeout(avisoTimer)
    avisoTimer = setTimeout(() => { el.style.display = 'none' }, ms || 2600)
  }

  /**
   * Distancia mínima para que una caja quepa completa en pantalla desde un ángulo dado.
   * Se resuelve proyectando las 8 esquinas: sirve igual para la vista cenital,
   * la isométrica o cualquier fachada, sin dejar aire de sobra.
   */
  const camaraPrueba = new THREE.PerspectiveCamera()
  function ajustarDistancia(caja, objetivo, azim, polar, margen) {
    const esquinas = []
    for (const x of [caja.minX, caja.maxX])
      for (const y of [caja.minY, caja.maxY])
        for (const z of [caja.minZ, caja.maxZ]) esquinas.push(new THREE.Vector3(x, y, z))

    const sp = Math.sin(polar * GRADO), cp = Math.cos(polar * GRADO)
    const dir = new THREE.Vector3(sp * Math.sin(azim * GRADO), cp, sp * Math.cos(azim * GRADO))

    camaraPrueba.fov = camara.fov
    camaraPrueba.aspect = camara.aspect
    camaraPrueba.near = 0.1
    camaraPrueba.far = 4000
    const lim = 1 - (margen == null ? 0.05 : margen)
    const q = new THREE.Vector3()

    let bajo = 3, alto = 1200
    for (let i = 0; i < 30; i++) {
      const medio = (bajo + alto) / 2
      camaraPrueba.position.copy(objetivo).addScaledVector(dir, medio)
      camaraPrueba.up.set(0, 1, 0)
      camaraPrueba.lookAt(objetivo)
      camaraPrueba.updateMatrixWorld(true)
      camaraPrueba.updateProjectionMatrix()
      let cabe = true
      for (const p of esquinas) {
        q.copy(p).project(camaraPrueba)
        if (Math.abs(q.x) > lim || Math.abs(q.y) > lim || q.z > 1) { cabe = false; break }
      }
      if (cabe) alto = medio; else bajo = medio
    }
    return alto
  }

  function encuadrarPlanta(azim, polar, fov) {
    camara.fov = fov || FOV_NORMAL
    camara.updateProjectionMatrix()
    // El margen derecho/superior deja ver la rosa de los vientos y las cotas
    const caja = { minX: L.minX - 6, maxX: L.maxX + 10, minY: 0, maxY: 5, minZ: L.minZ - 6, maxZ: L.maxZ + 2 }
    const objetivo = new THREE.Vector3(L.cx, 1.5, L.cz)
    const d = ajustarDistancia(caja, objetivo, azim, polar, 0.045)
    orbita.encuadrar(L.cx, L.cz, d, azim, polar, 1.5)
  }

  /**
   * Piso sobre el que se camina en una sala, con la misma regla que mundo.js:
   * la planta baja en 0 y el segundo nivel en la cota del entrepiso, salvo los
   * cuartos que cuelgan de él, que bajan un metro.
   */
  function pisoDe(sala) {
    if (Number(sala.nivel) !== 2) return 0
    const E = D.meta.alturaEntrepiso || 0
    const cuelga = /^CUARTO DE M[AÁ]QUINAS/i.test(sala.name || '') ||
      /^T[UÚ]NEL\s+INCUBADORAS/i.test(sala.name || '')
    return cuelga ? E - 1 : E
  }

  /**
   * Estorba un obstáculo a quien camina con los pies en `piso`. Lo que queda
   * entero por encima de la cabeza —el sobremuro que corre sobre las puertas—
   * o entero por debajo de los pies, no.
   */
  function estorba(c, x, z, r, piso) {
    if (!(x > c.x0 - r && x < c.x1 + r && z > c.z0 - r && z < c.z1 + r)) return false
    if (c.y1 == null || c.y0 == null) return true
    return c.y1 > piso + 0.05 && c.y0 < piso + 1.8
  }

  /** Busca un punto libre para dejar al visitante dentro de una sala. */
  function puntoLibre(sala) {
    const c = sala._centro
    const candidatos = [[0, 0], [0, -1.6], [0, 1.6], [-1.8, 0], [1.8, 0], [0, -3], [0, 3], [-3.4, 0], [3.4, 0]]
    for (const [dx, dz] of candidatos) {
      const x = c.x + dx, z = c.z + dz
      if (x < sala.x + 0.5 || x > sala.x + sala.w - 0.5) continue
      if (z < sala.y + 0.5 || z > sala.y + sala.h - 0.5) continue
      const piso = pisoDe(sala)
      let choca = false
      for (const col of mundo.colisiones) {
        if (estorba(col, x, z, 0.5, piso)) { choca = true; break }
      }
      if (!choca) return { x, z }
    }
    return { x: c.x, z: c.z }
  }

  // ── Cambio de vista ──────────────────────────────────────────────────────
  function ponerVista(v, silencioso) {
    vista = v
    document.body.classList.toggle('fps', v === 'fps')
    $$('#grupoVistas button').forEach((b) => b.classList.toggle('activo', b.dataset.vista === v))
    $('#grupoOrientacion').style.display = v === 'fps' || v === 'tour' ? 'none' : ''
    tour.activo = v === 'tour'
    $('#tour').classList.toggle('visible', v === 'tour')

    fps.activar(v === 'fps')
    orbita.activar(v === 'orbita' || v === 'cenital' || v === 'iso')

    if (v === 'fps') {
      camara.fov = FOV_NORMAL
      camara.updateProjectionMatrix()
      escena.fog.far = 330
      fps.pedirBloqueo()
      if (!silencioso) aviso('Camine con W A S D y mire con el mouse. Esc para salir.')
    } else if (v === 'orbita') {
      escena.fog.far = 900
      encuadrarPlanta(-22, 52, 42)
    } else if (v === 'cenital') {
      escena.fog.far = 1400
      encuadrarPlanta(0, 1.2, 24)
      if (!silencioso) aviso(`Vista en planta · ${L.ancho} m × ${L.largo} m`)
    } else if (v === 'iso') {
      escena.fog.far = 1200
      encuadrarPlanta(-20, 38, 30)
    } else if (v === 'tour') {
      escena.fog.far = 500
      camara.fov = FOV_NORMAL
      camara.updateProjectionMatrix()
      iniciarTour()
    }
  }

  const ORIENTACIONES = { norte: 0, sur: 180, este: -90, oeste: 90 }
  $$('#grupoOrientacion button').forEach((b) => {
    b.onclick = () => {
      if (vista === 'fps' || vista === 'tour') ponerVista('orbita', true)
      encuadrarPlanta(ORIENTACIONES[b.dataset.orientacion], 24, 34)
      aviso(`Fachada ${b.dataset.orientacion}`)
    }
  })
  $$('#grupoVistas button').forEach((b) => { b.onclick = () => ponerVista(b.dataset.vista) })

  // ── Nivel: ambos juntos (como está construida) o cada uno aislado ─────────
  function ponerNivel(n) {
    opciones.nivel = n
    $$('#grupoNivel button').forEach((b) => b.classList.toggle('activo', b.dataset.nivel === n))
    reconstruir()
    aviso(n === 'ambos' ? 'Mostrando los dos niveles' : `Mostrando solo el Nivel ${n}`)
  }
  $$('#grupoNivel button').forEach((b) => { b.onclick = () => ponerNivel(b.dataset.nivel) })

  // ── Selección e información ──────────────────────────────────────────────
  const contorno = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1)),
    new THREE.LineBasicMaterial({ color: 0xffd166, depthTest: false, transparent: true, opacity: 0.95 })
  )
  contorno.renderOrder = 20
  contorno.visible = false
  escena.add(contorno)

  function marcar(caja) {
    if (!caja) { contorno.visible = false; return }
    // `cota` es el piso de la sala. Sin ella, marcar una sala del segundo nivel
    // dibujaba el recuadro hundido en la planta baja.
    const base = caja.cota || 0
    contorno.position.set((caja.x0 + caja.x1) / 2, base + caja.alto / 2, (caja.z0 + caja.z1) / 2)
    contorno.scale.set(caja.x1 - caja.x0, caja.alto, caja.z1 - caja.z0)
    contorno.visible = true
  }

  const round2 = (n) => Math.round(n * 100) / 100

  function fila(etq, val) {
    return `<div class="dato"><span>${etq}</span><span><b>${val}</b></span></div>`
  }

  function mostrarSala(sala, mover) {
    seleccion = { tipo: 'sala', sala }
    const cat = sala._cat
    // Una sala en L se carga como varios rectángulos; el área que importa es la
    // suma. El plenum también trae `parteDe` (a su sala anfitriona), pero es un
    // vacío sobre el cielo raso, no un cuerpo más de piso: no entra en la cuenta.
    const piezas = D.rooms.filter((o) => o.parteDe === sala.id && o.type !== 'plenum')
    const equipos = D.machines.filter((m) => m.room === sala.id)
    // Altura libre y piso, con la misma regla que mundo.js. Sin ella la ficha
    // decía 2,9 m para las salas del ala de atrás, cuando su techo es la losa
    // del entrepiso a 3,40 —y el volumen salía corto por medio metro—, y las
    // del segundo nivel se medían desde el suelo de la planta.
    const ENTREPISO = D.meta.alturaEntrepiso || 0
    const esMaquinas = /^CUARTO DE M[AÁ]QUINAS/i.test(sala.name || '')
    const esTunelInc = /^T[UÚ]NEL\s+INCUBADORAS/i.test(sala.name || '')
    const cotaSala = Number(sala.nivel) !== 2 ? 0
      : (esMaquinas || esTunelInc) ? ENTREPISO - 1
      : ENTREPISO
    const cargaEntrepiso = ENTREPISO > 0 && !sala.exterior &&
      (D.meta.entrepisoSalas || []).indexOf(sala.code) >= 0
    const cieloPropio = (D.meta.techoPropio || {})[sala.code]
    const alto = !cat.muro ? 0.4
      : esMaquinas ? 1
      : sala.altura ? sala.altura
      : cieloPropio ? cieloPropio
      : cargaEntrepiso ? ENTREPISO
      : (cat.altura || D.meta.alturaMuro)
    // Una sala en L es UNA sala: el área y el volumen son los del conjunto, no
    // los del rectángulo principal.
    const areaTotal = round2(sala._area + piezas.reduce((a, p) => a + p._area, 0))
    marcar({ x0: sala.x, x1: sala.x + sala.w, z0: sala.y, z1: sala.y + sala.h, alto, cota: cotaSala })

    $('#cuerpoInfo').innerHTML =
      `<h3>${sala.name}</h3><div class="codigo">${sala.code} · <span class="pill" style="background:${cat.color}22;color:${cat.color}">${cat.label}</span></div>` +
      (sala.proyectada
        ? `<div class="avisoSala proyectada">Proyectada · todavía no construida. Se dibuja como quedará.</div>`
        : '') +
      (piezas.length
        ? fila('Cuerpos', [sala, ...piezas].map((p) => `${p.w} × ${p.h} m`).join('  +  '))
        : fila('Ancho × largo', `${sala.w} × ${sala.h} m`)) +
      (sala.medida
        ? `<div class="avisoSala medida">Medida en campo el ${sala.medida}</div>`
        : '') +
      fila('Área', `${areaTotal} m²`) +
      fila('Altura libre', cat.muro ? `${alto} m` : 'a cielo abierto') +
      fila('Volumen', cat.muro ? `${Math.round(areaTotal * alto)} m³` : '—') +
      fila('Puertas', (sala.doors || []).length) +
      fila('Equipos', equipos.length) +
      fila('Ubicación en el plano', `x ${sala.x} m · y ${sala.y} m`) +
      (equipos.length
        ? `<div style="margin-top:12px;font-size:11px;letter-spacing:.07em;color:var(--tenue);text-transform:uppercase">Equipos de esta sala</div>` +
          equipos.map((m) =>
            `<button class="filaSala" data-equipo="${m.id}"><span>${m.code} · ${m.name}</span><small style="color:${m._est.color}">${m._est.label}</small></button>`
          ).join('')
        : '') +
      `<div class="accionesInfo">
         <button data-ir="${sala.id}">🚶 Caminar aquí</button>
         <button data-enfocar="${sala.id}">🔍 Enfocar</button>
       </div>`

    abrirHoja('#panelInfo', 'visible')
    $$('#listaSalas .filaSala').forEach((b) => b.classList.toggle('sel', b.dataset.sala === sala.id))

    if (mover === 'caminar') irCaminando(sala)
    else if (mover === 'enfocar') enfocarSala(sala)
  }

  function mostrarEquipo(m) {
    seleccion = { tipo: 'equipo', equipo: m }
    const cat = m._cat, est = m._est, sala = m._sala
    // Medidas reales del equipo: las suyas si las tiene, las del tipo si no.
    const dim = m._dim || cat
    marcar({
      x0: m._pos.x - dim.w / 2, x1: m._pos.x + dim.w / 2,
      z0: m._pos.z - dim.d / 2, z1: m._pos.z + dim.d / 2, alto: dim.h,
    })
    $('#cuerpoInfo').innerHTML =
      `<h3>${m.name}</h3><div class="codigo">${m.code} · <span class="pill" style="background:${est.color}22;color:${est.color}">${est.label}</span></div>` +
      fila('Tipo', cat.label) +
      (m.brand ? fila('Marca', m.brand) : '') +
      fila('Medidas', `${dim.w} × ${dim.d} × ${dim.h} m`) +
      fila('Sala', `${sala.name} (${sala.code})`) +
      fila('Posición en la sala', `x ${m.x} m · y ${m.y} m`) +
      fila('Posición en el plano', `x ${Math.round(m._pos.x * 10) / 10} m · y ${Math.round(m._pos.z * 10) / 10} m`) +
      `<div class="accionesInfo">
         <button data-ir="${sala.id}">🚶 Caminar hasta la sala</button>
         <button data-enfocarEquipo="${m.id}">🔍 Enfocar equipo</button>
       </div>`
    abrirHoja('#panelInfo', 'visible')
  }

  function irCaminando(sala) {
    const p = puntoLibre(sala)
    const yaw = sala.w >= sala.h ? 90 : 180
    // `_yPiso` es la cota real del piso de esa sala (0 en planta baja, la del
    // entrepiso —o la del cuarto de máquinas— en el nivel 2): sin esto, entrar
    // caminando a una sala del nivel 2 dejaba al visitante con los ojos a la
    // altura del suelo de la planta baja, metido dentro del entrepiso.
    fps.colocar(p.x, p.z, yaw, sala._yPiso || 0)
    if (vista !== 'fps') ponerVista('fps', true)
    else fps.pedirBloqueo()
    aviso(`Está en: ${sala.name}`)
  }

  function enfocarSala(sala) {
    if (vista === 'fps' || vista === 'tour') ponerVista('orbita', true)
    camara.fov = FOV_NORMAL
    camara.updateProjectionMatrix()
    const alto = (sala._cat.altura || D.meta.alturaMuro) + 2
    const caja = {
      minX: sala.x - 3, maxX: sala.x + sala.w + 3, minY: 0, maxY: alto,
      minZ: sala.y - 3, maxZ: sala.y + sala.h + 3,
    }
    const objetivo = new THREE.Vector3(sala._centro.x, 1.5, sala._centro.z)
    const d = ajustarDistancia(caja, objetivo, -35, 52, 0.06)
    orbita.encuadrar(sala._centro.x, sala._centro.z, Math.max(10, d), -35, 52, 1.5)
  }

  $('#cuerpoInfo').addEventListener('click', (e) => {
    const b = e.target.closest('button')
    if (!b) return
    if (b.dataset.ir) irCaminando(mundo.salasPorId.get(b.dataset.ir))
    else if (b.dataset.enfocar) enfocarSala(mundo.salasPorId.get(b.dataset.enfocar))
    else if (b.dataset.equipo) mostrarEquipo(D.machines.find((m) => m.id === b.dataset.equipo))
    else if (b.dataset.enfocarequipo) {
      const m = D.machines.find((x) => x.id === b.dataset.enfocarequipo)
      if (vista === 'fps' || vista === 'tour') ponerVista('orbita', true)
      orbita.encuadrar(m._pos.x, m._pos.z, 12, -40, 55, 1.4)
    }
  })
  $('#cerrarInfo').onclick = () => { cerrarHojas(); contorno.visible = false; seleccion = null }

  // ── Hojas inferiores (móvil) ─────────────────────────────────────────────
  // En pantalla angosta los tres paneles dejan de flotar sobre el recorrido y
  // se comportan como hojas que suben desde abajo. Solo puede haber una
  // abierta: con dos, en un celular no queda nada de 3D a la vista.
  const esMovil = () => window.matchMedia('(max-width:820px)').matches

  function marcarHoja() {
    const abierta = $('#panelSalas').classList.contains('abierto') ||
      $('#panelInfo').classList.contains('visible') ||
      $('#panelOpciones').classList.contains('visible')
    document.body.classList.toggle('hoja-abierta', esMovil() && abierta)
  }

  function cerrarHojas(salvo) {
    ;[['#panelSalas', 'abierto'], ['#panelInfo', 'visible'], ['#panelOpciones', 'visible']]
      .forEach(([sel, cls]) => { if (sel !== salvo) $(sel).classList.remove(cls) })
    marcarHoja()
  }

  function abrirHoja(sel, cls) {
    if (esMovil()) cerrarHojas(sel)
    $(sel).classList.add(cls)
    marcarHoja()
  }

  $('#btnAreas').onclick = () => {
    const abierto = $('#panelSalas').classList.contains('abierto')
    if (abierto) cerrarHojas()
    else abrirHoja('#panelSalas', 'abierto')
  }
  $('#velo').onclick = () => cerrarHojas()
  window.addEventListener('resize', marcarHoja)

  // ── Listado de áreas ─────────────────────────────────────────────────────
  function pintarLista(filtro) {
    const f = (filtro || '').trim().toLowerCase()
    const porTipo = new Map()
    D.rooms.forEach((r) => {
      if (r.parteDe) return          // pieza de una sala en L: ya está listada
      const equipos = D.machines.filter((m) => m.room === r.id)
      const texto = `${r.name} ${r.code} ${r._cat.label} ${equipos.map((m) => m.code + ' ' + m.name).join(' ')}`.toLowerCase()
      if (f && !texto.includes(f)) return
      if (!porTipo.has(r.type)) porTipo.set(r.type, [])
      porTipo.get(r.type).push(r)
    })

    const orden = Object.keys(D.tiposSala)
    let html = ''
    let total = 0
    orden.forEach((tipo) => {
      const lista = porTipo.get(tipo)
      if (!lista || !lista.length) return
      const cat = D.tiposSala[tipo]
      html += `<div class="grupoTipo"><i style="background:${cat.color}"></i>${cat.label} (${lista.length})</div>`
      lista.sort((a, b) => a.name.localeCompare(b.name)).forEach((r) => {
        total++
        html += `<button class="filaSala" data-sala="${r.id}"><span>${r.name}</span><small>${r.w}×${r.h} m</small></button>`
      })
    })
    $('#listaSalas').innerHTML = html || '<p style="color:var(--tenue);font-size:13px;padding:10px">Sin resultados.</p>'
    $('#contSalas').textContent = `${total} de ${D.rooms.length}`
  }

  $('#listaSalas').addEventListener('click', (e) => {
    const b = e.target.closest('.filaSala')
    if (b && b.dataset.sala) mostrarSala(mundo.salasPorId.get(b.dataset.sala), vista === 'fps' ? 'caminar' : 'enfocar')
  })
  $('#buscar').addEventListener('input', (e) => pintarLista(e.target.value))
  pintarLista('')

  // ── Selección con el mouse ───────────────────────────────────────────────
  const rayo = new THREE.Raycaster()
  const punto = new THREE.Vector2()

  function elegir(cx, cy) {
    punto.x = (cx / innerWidth) * 2 - 1
    punto.y = -(cy / innerHeight) * 2 + 1
    rayo.setFromCamera(punto, camara)
    const hits = rayo.intersectObjects(mundo.seleccionables, false)
    if (!hits.length) return false
    const u = hits[0].object.userData
    if (u.tipo === 'equipo') mostrarEquipo(u.equipo)
    else if (u.tipo === 'sala') mostrarSala(u.sala)
    return true
  }

  lienzo.addEventListener('click', (e) => {
    if (vista === 'fps') {
      if (!fps.estado.bloqueado) { fps.pedirBloqueo(); return }
      elegir(innerWidth / 2, innerHeight / 2)
    } else if (vista !== 'tour') {
      if (Math.abs(e.movementX || 0) > 3) return
      elegir(e.clientX, e.clientY)
    }
  })

  // ── Opciones ─────────────────────────────────────────────────────────────
  // Los rótulos se reescalan según la distancia para que se lean desde cualquier vista
  let rotulosSala = []
  let rotulosEquipo = []
  function recogerRotulos() {
    rotulosSala = mundo.grupos.etiquetas.children.filter((o) => o.isSprite)
    rotulosEquipo = []
    mundo.grupos.equipos.children.forEach((g) =>
      g.children.forEach((h) => { if (h.isSprite) rotulosEquipo.push(h) })
    )
  }
  recogerRotulos()
  const posRotulo = new THREE.Vector3()
  const tamPantalla = new THREE.Vector2()
  const PX_ROTULO = 16    // altura aparente deseada del rótulo, en píxeles
  const PX_MINIMO = 38    // por debajo de este tamaño aparente, el área no se rotula

  function actualizarRotulos() {
    const cp = camara.position
    renderer.getSize(tamPantalla)
    const tanV = Math.tan((camara.fov / 2) * GRADO)
    const pxPorMetro = (d) => tamPantalla.y / (2 * d * tanV)

    // 1) Tamaño en pantalla y descarte de las áreas demasiado pequeñas
    const candidatos = []
    rotulosSala.forEach((sp) => {
      if (!opciones.etiquetas) { sp.visible = false; return }
      const d = Math.max(1, cp.distanceTo(sp.position))
      const ppm = pxPorMetro(d)
      const sala = sp.userData.sala
      sp.visible = Math.max(sala.w, sala.h) * ppm > PX_MINIMO
      if (!sp.visible) return
      const k = Math.min(3.0, Math.max(1, PX_ROTULO / (ppm * sp.userData.base.h)))
      sp.scale.set(sp.userData.base.w * k, sp.userData.base.h * k, 1)
      candidatos.push({ sp, sala, alto: sp.userData.base.h * k * ppm })
    })

    // 2) Cuando dos rótulos se pisan en pantalla, gana el área más grande
    candidatos.sort((a, b) => b.sala._area - a.sala._area)
    const puestos = []
    candidatos.forEach((c) => {
      posRotulo.copy(c.sp.position).project(camara)
      if (posRotulo.z > 1) { c.sp.visible = false; return }
      const alto = c.alto
      const ancho = alto * (c.sp.userData.base.w / c.sp.userData.base.h)
      const cx = (posRotulo.x * 0.5 + 0.5) * tamPantalla.x
      const cy = (-posRotulo.y * 0.5 + 0.5) * tamPantalla.y
      const r = { x0: cx - ancho / 2, x1: cx + ancho / 2, y0: cy - alto / 2, y1: cy + alto / 2 }
      const choca = puestos.some((p) => r.x0 < p.x1 && r.x1 > p.x0 && r.y0 < p.y1 && r.y1 > p.y0)
      if (choca) c.sp.visible = false
      else puestos.push(r)
    })

    rotulosEquipo.forEach((sp) => {
      if (!opciones.etiquetas || !opciones.equipos) { sp.visible = false; return }
      sp.getWorldPosition(posRotulo)
      const d = Math.max(1, cp.distanceTo(posRotulo))
      const ppm = pxPorMetro(d)
      sp.visible = 3 * ppm > PX_MINIMO
      if (!sp.visible) return
      const k = Math.min(1.8, Math.max(1, (PX_ROTULO * 0.85) / (ppm * sp.userData.base.h)))
      sp.scale.set(sp.userData.base.w * k, sp.userData.base.h * k, 1)
    })
  }

  function aplicarOpciones() {
    mundo.grupos.etiquetas.visible = opciones.etiquetas
    mundo.grupos.equipos.visible = opciones.equipos
    mundo.grupos.techos.visible = opciones.techos
    // La losa del entrepiso es el PISO del segundo nivel, no un techo: se ve
    // siempre que se vea ese nivel —traslúcida con los dos a la vista, opaca al
    // aislarlo— y solo se apaga al aislar la planta baja. Atada al interruptor
    // de techos, el nivel 2 aparecía flotando sobre el suelo de abajo.
    if (mundo.grupos.entrepiso) {
      mundo.grupos.entrepiso.visible = opciones.nivel !== '1'
    }
    mundo.grupos.cotas.visible = opciones.cotas
    renderer.shadowMap.enabled = opciones.sombras
    escena.traverse((o) => { if (o.isMesh) o.material.needsUpdate = true })
    fps.estado.atravesar = opciones.atravesar
    fps.estado.volar = opciones.volar
    orbita.autoGiro(opciones.giro ? 0.09 : 0)
    if (window.Sonido) window.Sonido.activo = opciones.sonido
    $$('#panelOpciones .opcion').forEach((el) => el.classList.toggle('on', !!opciones[el.dataset.op]))
  }

  $$('#panelOpciones .opcion').forEach((el) => {
    el.onclick = () => { opciones[el.dataset.op] = !opciones[el.dataset.op]; aplicarOpciones() }
  })
  $('#btnOpciones').onclick = () => {
    if ($('#panelOpciones').classList.contains('visible')) cerrarHojas()
    else abrirHoja('#panelOpciones', 'visible')
  }
  aplicarOpciones()

  // ── Recorrido guiado ─────────────────────────────────────────────────────
  const tour = { activo: false, pasos: [], i: 0, t: 0 }

  const ocupado = (x, z, r, piso = 0) => mundo.colisiones.some((c) => estorba(c, x, z, r, piso))

  /**
   * Punto de entrada de una parada: cerca de un extremo del eje largo de la sala
   * y sobre el pasillo libre, para que la cámara mire a lo largo del recinto.
   */
  function puntoRecorrido(s) {
    const largoX = s.w >= s.h
    const a = largoX ? s.x + Math.min(3, s.w * 0.16) : s.x + s.w / 2
    const b = largoX ? s.y + s.h / 2 : s.y + Math.min(3, s.h * 0.16)
    const lado = largoX ? s.h : s.w

    /** Ancho del pasillo libre que contiene el punto, medido sobre el eje corto. */
    const holguraEn = (x, z) => {
      const ini = largoX ? s.y + 0.15 : s.x + 0.15
      const fin = largoX ? s.y + s.h - 0.15 : s.x + s.w - 0.15
      const p = largoX ? z : x
      let lo = p, hi = p
      while (lo - 0.1 > ini && !ocupado(largoX ? x : lo - 0.1, largoX ? lo - 0.1 : z, 0.05)) lo -= 0.1
      while (hi + 0.1 < fin && !ocupado(largoX ? x : hi + 0.1, largoX ? hi + 0.1 : z, 0.05)) hi += 0.1
      return hi - lo
    }

    // Se prefiere el pasillo más ancho entre los candidatos libres
    let mejor = null
    const desvios = [0, -lado * 0.3, lado * 0.3, -lado * 0.42, lado * 0.42]
    for (const d of desvios) {
      const x = largoX ? a : a + d
      const z = largoX ? b + d : b
      if (x < s.x + 0.6 || x > s.x + s.w - 0.6) continue
      if (z < s.y + 0.6 || z > s.y + s.h - 0.6) continue
      if (ocupado(x, z, 0.5)) continue
      const holgura = holguraEn(x, z)
      if (!mejor || holgura > mejor.holgura) mejor = { x, z, largoX, holgura }
    }
    return mejor || { x: s._centro.x, z: s._centro.z, largoX, holgura: lado }
  }

  function construirTour() {
    const paradas = D.recorrido
      .map((p) => ({ sala: mundo.salasPorCodigo.get(p.code), titulo: p.titulo }))
      .filter((p) => p.sala)
      .map((p) => {
        const s = p.sala
        const e = puntoRecorrido(s)
        // Si el pasillo libre es estrecho (nacedoras, filtros), a 1,70 m solo se verían
        // las dos paredes: la cámara sube dentro del mismo pasillo para dominar la fila
        // de equipos, como quien mira la sala desde una plataforma.
        const estrecho = e.holgura < 2.6
        const techo = (s._cat.altura || D.meta.alturaMuro) - 0.7
        return {
          ...p,
          e,
          x: e.x,
          z: e.z,
          yOjos: estrecho ? Math.min(2.9, Math.max(1.7, techo)) : 1.7,
          yMira: estrecho ? 1.4 : 1.55,
        }
      })

    const ALTO_VUELO = 12
    const k = []

    paradas.forEach((p, i) => {
      const s = p.sala
      const e = p.e
      const sig = paradas[(i + 1) % paradas.length]

      const pos = new THREE.Vector3(p.x, p.yOjos, p.z)
      const arriba = new THREE.Vector3(p.x, ALTO_VUELO, p.z)

      // Mira a lo largo del eje mayor de la sala, sin salirse de ella
      const lejos = e.largoX
        ? new THREE.Vector3(s.x + s.w - 0.4, p.yMira, p.z)
        : new THREE.Vector3(p.x, p.yMira, s.y + s.h - 0.4)
      const eje = lejos.clone().sub(pos)
      const barrido = (grados) => {
        const v = eje.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), grados * GRADO)
        return pos.clone().add(v)
      }
      const izq = barrido(-26)
      const der = barrido(26)

      // 1) Descenso sobre la sala
      k.push({ titulo: p.titulo, sala: s, dur: 1.9,
        p0: arriba.clone(), p1: pos.clone(),
        l0: new THREE.Vector3(p.x, 0.2, p.z), l1: izq.clone() })
      // 2) Barrido de la sala, girando sobre el punto de parada
      k.push({ titulo: p.titulo, sala: s, dur: 3.6,
        p0: pos.clone(), p1: pos.clone(), l0: izq.clone(), l1: der.clone() })
      // 3) Ascenso
      k.push({ titulo: p.titulo, sala: s, dur: 1.4,
        p0: pos.clone(), p1: arriba.clone(),
        l0: der.clone(), l1: new THREE.Vector3(sig.x, 2, sig.z) })
      // 4) Vuelo hasta la siguiente parada
      const dist = Math.hypot(sig.x - p.x, sig.z - p.z)
      k.push({ titulo: sig.titulo, sala: sig.sala, dur: Math.max(1.6, dist / 16),
        p0: arriba.clone(), p1: new THREE.Vector3(sig.x, ALTO_VUELO, sig.z),
        l0: new THREE.Vector3(sig.x, 2, sig.z), l1: new THREE.Vector3(sig.x, 0.6, sig.z) })
    })
    tour.pasos = k
  }
  construirTour()

  function iniciarTour() {
    tour.i = 0
    tour.t = 0
    aviso('Recorrido guiado — 13 paradas por el proceso completo')
  }

  const suave = (t) => t * t * (3 - 2 * t)
  const vTmp = new THREE.Vector3()

  function actualizarTour(dt) {
    if (!tour.pasos.length) return
    const paso = tour.pasos[tour.i]
    tour.t += dt
    let a = Math.min(1, tour.t / paso.dur)
    const e = suave(a)
    camara.fov = FOV_NORMAL
    camara.position.lerpVectors(paso.p0, paso.p1, e)
    vTmp.lerpVectors(paso.l0, paso.l1, e)
    camara.up.set(0, 1, 0)
    camara.lookAt(vTmp)
    $('#tourTitulo').textContent = paso.titulo
    $('#tourPaso').textContent = `${paso.sala.code} · ${paso.sala.w} × ${paso.sala.h} m · ${paso.sala._area} m²`
    if (a >= 1) { tour.t = 0; tour.i = (tour.i + 1) % tour.pasos.length }
  }

  // ── Minimapa ─────────────────────────────────────────────────────────────
  const mini = $('#lienzoMini')
  const mctx = mini.getContext('2d')
  const MARGEN = 8
  const escalaMini = Math.min(
    (mini.width - MARGEN * 2) / L.ancho,
    (mini.height - MARGEN * 2) / L.largo
  )
  const mx = (x) => MARGEN + (x - L.minX) * escalaMini
  const mz = (z) => MARGEN + (z - L.minZ) * escalaMini

  function pintarMini() {
    mctx.clearRect(0, 0, mini.width, mini.height)
    mctx.fillStyle = '#0a1120'
    mctx.fillRect(0, 0, mini.width, mini.height)
    D.rooms.forEach((r) => {
      const cat = r._cat
      mctx.fillStyle = cat.muro ? hexA(r._color, 0.42) : hexA(r._color, 0.18)
      mctx.fillRect(mx(r.x), mz(r.y), r.w * escalaMini, r.h * escalaMini)
      mctx.strokeStyle = hexA(r._color, 0.75)
      mctx.lineWidth = 0.6
      mctx.strokeRect(mx(r.x), mz(r.y), r.w * escalaMini, r.h * escalaMini)
    })
    if (seleccion && seleccion.tipo === 'sala') {
      const r = seleccion.sala
      mctx.strokeStyle = '#ffd166'
      mctx.lineWidth = 1.6
      mctx.strokeRect(mx(r.x), mz(r.y), r.w * escalaMini, r.h * escalaMini)
    }
    // Posición y rumbo del visitante
    const p = vista === 'fps' ? fps.estado.pos : camara.position
    const px = mx(p.x), pz = mz(p.z)
    const dir = new THREE.Vector3()
    camara.getWorldDirection(dir)
    const ang = Math.atan2(dir.x, dir.z)
    mctx.save()
    mctx.translate(px, pz)
    mctx.rotate(-ang)
    mctx.fillStyle = 'rgba(53,214,232,0.28)'
    mctx.beginPath()
    mctx.moveTo(0, 0)
    mctx.arc(0, 0, 16, -Math.PI / 2 - 0.5, -Math.PI / 2 + 0.5)
    mctx.closePath()
    mctx.fill()
    mctx.restore()
    mctx.fillStyle = '#35d6e8'
    mctx.beginPath()
    mctx.arc(px, pz, 3, 0, Math.PI * 2)
    mctx.fill()
  }

  function hexA(hex, a) {
    const c = new THREE.Color(hex)
    return `rgba(${Math.round(c.r * 255)},${Math.round(c.g * 255)},${Math.round(c.b * 255)},${a})`
  }

  mini.addEventListener('click', (e) => {
    const r = mini.getBoundingClientRect()
    const x = L.minX + ((e.clientX - r.left) * (mini.width / r.width) - MARGEN) / escalaMini
    const z = L.minZ + ((e.clientY - r.top) * (mini.height / r.height) - MARGEN) / escalaMini
    const sala = D.rooms.find((s) => x >= s.x && x <= s.x + s.w && z >= s.y && z <= s.y + s.h)
    if (sala) mostrarSala(sala, vista === 'fps' ? 'caminar' : 'enfocar')
  })

  /** Sala donde está parado el visitante (para el rótulo de ubicación). */
  function salaEn(x, z) {
    let mejor = null
    for (const r of D.rooms) {
      if (x >= r.x && x <= r.x + r.w && z >= r.y && z <= r.y + r.h) {
        if (!mejor || r.w * r.h < mejor.w * mejor.h) mejor = r
      }
    }
    return mejor
  }

  // ── Teclado, foto, pantalla completa ─────────────────────────────────────
  window.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT') return
    if (e.code === 'Digit1') ponerVista('fps')
    else if (e.code === 'Digit2') ponerVista('orbita')
    else if (e.code === 'Digit3') ponerVista('cenital')
    else if (e.code === 'Digit4') ponerVista('iso')
    else if (e.code === 'Digit5') ponerVista('tour')
    else if (e.code === 'KeyF') { opciones.volar = !opciones.volar; aplicarOpciones(); aviso(opciones.volar ? 'Modo vuelo activado (E sube · Q baja)' : 'Modo vuelo desactivado') }
    else if (e.code === 'KeyL') { opciones.etiquetas = !opciones.etiquetas; aplicarOpciones() }
    else if (e.code === 'KeyT') { opciones.techos = !opciones.techos; aplicarOpciones() }
  })

  $('#btnFoto').onclick = () => {
    renderer.render(escena, camara)
    const a = document.createElement('a')
    a.download = `planta-3d-incubant-${vista}.png`
    a.href = renderer.domElement.toDataURL('image/png')
    a.click()
    aviso('Imagen descargada')
  }

  $('#btnPantalla').onclick = () => {
    if (document.fullscreenElement) document.exitFullscreen()
    else document.documentElement.requestFullscreen()
  }

  // ── Manos del visitante ──────────────────────────────────────────────────
  // Cuelgan de la cámara, así que la cámara tiene que estar dentro de la
  // escena: three.js solo dibuja lo que cuelga de lo que se le pasa a render, y
  // una cámara suelta deja sus hijos sin pintar.
  escena.add(camara)
  const manos = Manos(camara)

  // ── Joystick de navegación libre ─────────────────────────────────────────
  // Flotante, como en un juego: aparece donde se apoya el pulgar en la mitad
  // izquierda y lo sigue. El anterior era un círculo fijo en una esquina que
  // solo reaccionaba al ARRASTRAR —apoyar el dedo y dejarlo quieto no movía
  // nada— y sin zona muerta, así que el roce más leve ya echaba a andar. Y la
  // mano que lo usaba giraba también la cámara, porque la zona que el control
  // de primera persona ignoraba era un rectángulo escrito a ojo que no
  // coincidía con el dibujo.
  if (matchMedia('(pointer:coarse)').matches) document.body.classList.add('tactil')
  const joy = $('#joystick')
  const perilla = joy.querySelector('i')
  const RADIO_JOY = 58   // px de recorrido útil desde el centro
  const MUERTA = 0.14    // por debajo, quieto: el pulgar nunca está del todo quieto
  const CORRE = 0.85     // por encima, a correr
  let joyId = null
  let joyCentro = null

  // Convenio de juego: mitad izquierda para caminar, mitad derecha para mirar.
  const zonaJoy = () => ({ x0: 0, y0: innerHeight * 0.35, x1: innerWidth * 0.5, y1: innerHeight })
  const enZonaJoy = (x, y) => {
    const z = zonaJoy()
    return x >= z.x0 && x <= z.x1 && y >= z.y0 && y <= z.y1
  }
  fps.zonaJoystick = zonaJoy()
  addEventListener('resize', () => { fps.zonaJoystick = zonaJoy() })

  const moverJoy = (cx, cy) => {
    const dx = (cx - joyCentro.x) / RADIO_JOY
    const dy = (cy - joyCentro.y) / RADIO_JOY
    const l = Math.hypot(dx, dy) || 1
    const m = Math.min(1, l)
    perilla.style.transform = `translate(${(dx / l) * m * RADIO_JOY * 0.6}px, ${(dy / l) * m * RADIO_JOY * 0.6}px)`
    // Curva de respuesta: el primer tramo manda poco, para poder acercarse
    // despacio a una máquina sin pasarse de largo.
    const fuerza = m < MUERTA ? 0 : Math.pow((m - MUERTA) / (1 - MUERTA), 1.6)
    fps.joystick((dx / l) * fuerza, (dy / l) * fuerza, m > CORRE)
  }
  const soltarJoy = () => {
    joyId = null
    perilla.style.transform = ''
    joy.classList.remove('activo')
    fps.joystick(0, 0, false)
  }

  // El lienzo ya está declarado arriba: es el mismo <canvas> del renderer.
  lienzo.addEventListener('pointerdown', (e) => {
    if (vista !== 'fps' || joyId !== null) return
    if (!document.body.classList.contains('tactil')) return
    if (!enZonaJoy(e.clientX, e.clientY)) return
    joyId = e.pointerId
    joyCentro = { x: e.clientX, y: e.clientY }
    joy.style.left = `${e.clientX - RADIO_JOY}px`
    joy.style.top = `${e.clientY - RADIO_JOY}px`
    joy.classList.add('activo')
    // Capturar puede fallar si el puntero ya se soltó (o si es sintético, como
    // en las pruebas): el joystick sigue funcionando sin captura.
    try { lienzo.setPointerCapture(e.pointerId) } catch { /* sin captura */ }
    moverJoy(e.clientX, e.clientY)   // vale desde el primer toque, sin arrastrar
  })
  lienzo.addEventListener('pointermove', (e) => {
    if (joyId === e.pointerId) moverJoy(e.clientX, e.clientY)
  })
  lienzo.addEventListener('pointerup', (e) => { if (joyId === e.pointerId) soltarJoy() })
  lienzo.addEventListener('pointercancel', (e) => { if (joyId === e.pointerId) soltarJoy() })

  // ── Mando de consola ─────────────────────────────────────────────────────
  // Palanca izquierda para caminar, derecha para mirar, gatillo o palanca
  // pulsada para correr. Para grabar los videos de capacitación un mando da un
  // movimiento parejo que con teclado y ratón no sale.
  const MUERTA_MANDO = 0.16
  const limpio = (v) => (Math.abs(v) < MUERTA_MANDO ? 0 : (v - Math.sign(v) * MUERTA_MANDO) / (1 - MUERTA_MANDO))
  function leerMando(dt) {
    const lista = navigator.getGamepads ? navigator.getGamepads() : []
    let g = null
    for (const p of lista) if (p && p.connected) { g = p; break }
    if (!g || vista !== 'fps') return
    const mx = limpio(g.axes[0] || 0), my = limpio(g.axes[1] || 0)
    const vx = limpio(g.axes[2] || 0), vy = limpio(g.axes[3] || 0)
    const corre = !!(g.buttons[10]?.pressed || (g.buttons[7]?.value || 0) > 0.5)
    if (mx || my) fps.joystick(mx, my, corre)
    else if (joyId === null) fps.joystick(0, 0, false)
    if (vx || vy) fps.mirar(vx * 2.6 * dt, vy * 1.9 * dt)
  }
  addEventListener('gamepadconnected', (e) => aviso(`Mando conectado: ${e.gamepad.id.split('(')[0].trim()}`))

  // ── Portada ──────────────────────────────────────────────────────────────
  $('#tituloPlanta').textContent = D.meta.nombre
  $('#subPlanta').textContent = `${D.meta.empresa} · ${D.meta.ciudad} · ${L.ancho} × ${L.largo} m`
  $('#subPortada').textContent = `${D.meta.empresa} · ${D.meta.nombre} · ${D.meta.ciudad} · ${D.rooms.length} áreas · ${D.machines.length} equipos`
  $('#pieMini').textContent = `${L.ancho} × ${L.largo} m · ${D.rooms.length} áreas`

  function cerrarPortada() { $('#portada').style.display = 'none' }
  $('#btnEntrar').onclick = () => {
    cerrarPortada()
    const entrada = mundo.salasPorCodigo.get('S41') || D.rooms[0]
    irCaminando(entrada)
  }
  $('#btnMaqueta').onclick = () => { cerrarPortada(); ponerVista('orbita') }
  $('#btnTourInicio').onclick = () => { cerrarPortada(); ponerVista('tour') }

  // ── Bucle ────────────────────────────────────────────────────────────────
  function medir() {
    camara.aspect = innerWidth / innerHeight
    camara.updateProjectionMatrix()
    renderer.setSize(innerWidth, innerHeight)
    if (vista === 'cenital') encuadrarPlanta(0, 1.2, 24)
    else if (vista === 'iso') encuadrarPlanta(-20, 38, 30)
  }
  window.addEventListener('resize', medir)

  let acum = 0
  // Asidero de consola: además de inspeccionar, permite forzar un cuadro. El
  // navegador congela requestAnimationFrame cuando la pestaña no está visible,
  // y entonces el lienzo se queda con el último cuadro dibujado —lo que hacía
  // que una captura desde fuera saliera siempre igual por más que se cambiara
  // de vista.
  globalThis.__PLANTA3D_VISTA = {
    renderer, escena, camara,
    dibujar: () => renderer.render(escena, camara),
  }

  function bucle() {
    requestAnimationFrame(bucle)
    const dt = Math.min(0.06, reloj.getDelta())

    if (vista === 'fps') { leerMando(dt); fps.actualizar(dt) }
    else if (vista === 'tour') actualizarTour(dt)
    else orbita.actualizar(dt)

    // Rótulo de ubicación en primera persona
    if (vista === 'fps') {
      const s = salaEn(fps.estado.pos.x, fps.estado.pos.z)
      $('#ubicNombre').textContent = s ? s.name : 'Exterior de la planta'
      $('#ubicDato').textContent = s ? `${s.code} · ${s.w} × ${s.h} m · ${s._area} m²` : '—'
    }

    actualizarRotulos()

    // Las puertas se abren solas al acercarse. En primera persona manda la
    // posición del visitante; en las vistas de conjunto, la de la cámara, que
    // es lo que hace que se abran al bajar a mirar de cerca.
    const puertaCerca = mundo.actualizarPuertas(vista === 'fps' ? fps.estado.pos : camara.position, dt)

    // Las manos solo existen caminando en primera persona. Se estira la que
    // queda del lado de la puerta, y solo si la tiene DELANTE: pasar de largo
    // por una puerta abierta no es ir a empujarla.
    if (vista === 'fps') {
      let puerta = null
      if (puertaCerca) {
        const yaw = fps.estado.yaw
        const dx = puertaCerca.x - fps.estado.pos.x
        const dz = puertaCerca.z - fps.estado.pos.z
        // Delante = −Z de la cámara; a la derecha = +X. Los dos en el marco del
        // visitante, girando el vector por −yaw.
        const cos = Math.cos(-yaw), sin = Math.sin(-yaw)
        const adelante = -(dz * cos - dx * sin)
        const lateral = dx * cos + dz * sin
        if (adelante > 0.1) {
          const cerca = Math.max(0, Math.min(1, (2.3 - puertaCerca.dist) / 1.5))
          puerta = { lado: lateral >= 0 ? 1 : -1, cerca }
        }
      }
      const j = fps.estado.joystick
      const vel = Math.hypot(j.x, j.y) || (Object.values(fps.estado.teclas).some(Boolean) ? 1 : 0)
      manos.actualizar(dt, { visible: true, velocidad: vel, puerta })
    } else {
      manos.actualizar(dt, { visible: false })
    }

    acum += dt
    if (acum > 0.08) { pintarMini(); acum = 0 }

    renderer.render(escena, camara)
  }

  // ── Reconstrucción en caliente ───────────────────────────────────────────
  // Se usa cuando el plano cambia en IncubApp: se rehace la planta con los
  // datos nuevos sin recargar la página ni mover la cámara. Reconstruir entero
  // es más simple y seguro que parchear pieza por pieza, y a esta escala
  // (≈250 muros) toma pocos milisegundos.
  function liberar(obj) {
    obj.traverse((o) => {
      if (o.geometry) o.geometry.dispose()
      const m = o.material
      if (Array.isArray(m)) m.forEach((x) => { if (x.map) x.map.dispose(); x.dispose() })
      else if (m) { if (m.map) m.map.dispose(); m.dispose() }
    })
  }

  function reconstruir() {
    const anterior = mundo
    escena.remove(anterior.raiz)

    mundo = Mundo.construirPlanta(D, opciones)
    escena.add(mundo.raiz)
    fps.colisiones = mundo.colisiones
  fps.losa = mundo.losa
  fps.rampas = mundo.rampas
    recogerRotulos()
    aplicarOpciones()

    // La selección abierta se refresca contra el objeto nuevo, o se cierra si
    // lo que estaba seleccionado dejó de existir.
    if (seleccion?.tipo === 'sala') {
      const s = mundo.salasPorId.get(seleccion.sala.id)
      if (s) mostrarSala(s, false); else cerrarHojas()
    } else if (seleccion?.tipo === 'equipo') {
      const e = D.machines.find((m) => m.id === seleccion.equipo.id)
      if (e) mostrarEquipo(e); else cerrarHojas()
    }

    pintarLista($('#buscar').value)
    pintarMini()
    liberar(anterior.raiz)
  }

  // Punto de acceso para diagnóstico / automatización (no lo usa la interfaz)
  window.PLANTA3D = {
    escena, camara, renderer, fps, orbita, opciones, reconstruir,
    get mundo() { return mundo },
    ponerVista, encuadrarPlanta, mostrarSala, mostrarEquipo, irCaminando, aplicarOpciones,
    actualizarRotulos, pintarMini, actualizarTour, tour,
    get vista() { return vista },
  }

  ponerVista('orbita', true)
  bucle()
  setTimeout(() => $('#cargando').classList.add('oculto'), 350)
})()
