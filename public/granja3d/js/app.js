/* =============================================================================
 * GRANJA 3D INCUBANT — app.js
 * Orquestador principal del recorrido virtual interactivo de la Granja
 * =============================================================================
 */
;(function () {
  'use strict'

  const canvas = document.getElementById('lienzo')
  const contEtiquetas = document.getElementById('contenedorEtiquetas')
  const cargando = document.getElementById('cargando')
  const portada = document.getElementById('portada')

  const escena = new THREE.Scene()
  escena.background = new THREE.Color(0x7dd3fc) // Cielo diurno despejado
  escena.fog = new THREE.FogExp2(0xbae6fd, 0.0035)

  const camara = new THREE.PerspectiveCamera(58, window.innerWidth / window.innerHeight, 0.5, 500)

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false })
  renderer.setSize(window.innerWidth, window.innerHeight)
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFSoftShadowMap

  let mundo = null
  let controles = null
  let etiquetas = null
  let datosGranja = window.GRANJA

  // ── 1. Inicialización ──────────────────────────────────────────────────────
  function init() {
    mundo = window.construirGranja(datosGranja)
    escena.add(mundo.raiz)

    controles = window.ControlesGranja(camara, canvas)
    etiquetas = window.EtiquetasGranja(camara, contEtiquetas, datosGranja, (sala) => {
      mostrarDetalle(sala)
    })

    poblarListaSalas()
    dibujarMinimapa()

    // Ocultar pantalla de carga
    setTimeout(() => {
      cargando.classList.add('oculto')
    }, 400)

    // Animación
    let lastTime = performance.now()
    function anim(now) {
      requestAnimationFrame(anim)
      const dt = Math.min((now - lastTime) / 1000, 0.1)
      lastTime = now

      controles.update(dt)
      etiquetas.update()
      actualizarMinimapaJugador()

      renderer.render(escena, camara)
    }
    requestAnimationFrame(anim)
  }

  // ── 2. Lista lateral de Galpones y Áreas ───────────────────────────────────
  function poblarListaSalas() {
    const contenedor = document.getElementById('listaSalas')
    if (!contenedor) return
    contenedor.innerHTML = ''

    const rooms = datosGranja.rooms || []
    const levante = rooms.filter((r) => r.type === 'levante')
    const produccion = rooms.filter((r) => r.type === 'produccion')
    const otros = rooms.filter((r) => r.type !== 'levante' && r.type !== 'produccion')

    function renderGrupo(titulo, color, items) {
      if (!items.length) return
      const gHeader = document.createElement('div')
      gHeader.className = 'grupoTipo'
      gHeader.innerHTML = `<i style="background:${color}"></i>${titulo}`
      contenedor.appendChild(gHeader)

      items.forEach((r) => {
        const btn = document.createElement('button')
        btn.className = 'filaSala'
        btn.innerHTML = `
          <span>${r.name}</span>
          <small>${r.code}</small>
        `
        btn.onclick = () => {
          document.querySelectorAll('.filaSala').forEach((b) => b.classList.remove('sel'))
          btn.classList.add('sel')
          controles.enfocarGalpon(r.x + r.w / 2, r.y + r.h / 2)
          mostrarDetalle(r)
        }
        contenedor.appendChild(btn)
      })
    }

    renderGrupo('Levante (M100)', '#6366f1', levante)
    renderGrupo('Producción (M200)', '#10b981', produccion)
    renderGrupo('Bioseguridad y Vías', '#94a3b8', otros)
  }

  // ── 3. Panel de detalle / Inspección ───────────────────────────────────────
  function mostrarDetalle(room) {
    const panel = document.getElementById('panelInfo')
    const cuerpo = document.getElementById('cuerpoInfo')
    if (!panel || !cuerpo) return

    const esGalpon = /^G\d{3}/i.test(room.code) || /GALPON/i.test(room.name)
    const maquinas = (datosGranja.machines || []).filter((m) => m.roomCode === room.code)

    let html = `
      <h3>${room.name}</h3>
      <div class="codigo">${room.code} · ${room.type?.toUpperCase() || 'ÁREA'}</div>
      <div class="dato"><span>Dimensiones:</span><b>${room.w} m × ${room.h} m</b></div>
      <div class="dato"><span>Área construida:</span><b>${Math.round(room.w * room.h)} m²</b></div>
    `

    if (esGalpon) {
      html += `
        <div class="dato"><span>Estructura:</span><b>Galpón 2 Pisos Climatizado</b></div>
        <div class="dato"><span>Ventilación:</span><b>Túnel Forzado + Cooling Pads</b></div>
        <div class="dato"><span>Capacidad total:</span><b>50.000 aves</b></div>
        <div style="margin-top:14px;border-top:1px solid rgba(255,255,255,.1);padding-top:10px;">
          <b style="color:var(--acento);font-size:12px;">PISOS Y SENSORES:</b>
          ${maquinas.map((m) => `
            <div class="dato">
              <span>${m.name}:</span>
              <span class="pill" style="background:#065f46;color:#a7f3d0;">Activo</span>
            </div>
          `).join('')}
        </div>
      `
    }

    cuerpo.innerHTML = html
    panel.classList.add('visible')
  }

  // ── 4. Minimapa ────────────────────────────────────────────────────────────
  const miniCanvas = document.getElementById('miniCanvas')
  const miniCtx = miniCanvas ? miniCanvas.getContext('2d') : null

  function dibujarMinimapa() {
    if (!miniCtx) return
    const w = miniCanvas.width
    const h = miniCanvas.height
    miniCtx.fillStyle = '#1e293b'
    miniCtx.fillRect(0, 0, w, h)

    const sx = w / 160
    const sy = h / 130

    datosGranja.rooms.forEach((r) => {
      miniCtx.fillStyle = r.type === 'levante' ? '#4f46e5' : r.type === 'produccion' ? '#059669' : '#475569'
      miniCtx.fillRect(r.x * sx, r.y * sy, r.w * sx, r.h * sy)
    })
  }

  function actualizarMinimapaJugador() {
    if (!miniCtx) return
    dibujarMinimapa()

    const sx = miniCanvas.width / 160
    const sy = miniCanvas.height / 130
    const px = camara.position.x * sx
    const py = camara.position.z * sy

    miniCtx.fillStyle = '#ef4444'
    miniCtx.beginPath()
    miniCtx.arc(px, py, 3.5, 0, Math.PI * 2)
    miniCtx.fill()
  }

  // ── 5. Botones y controles UI ──────────────────────────────────────────────
  document.getElementById('btnCerrarPortada')?.addEventListener('click', () => {
    portada.style.display = 'none'
  })

  document.getElementById('btnModoOrbita')?.addEventListener('click', () => {
    controles.setModo('orbita')
    document.getElementById('btnModoOrbita')?.classList.add('activo')
    document.getElementById('btnModoFPS')?.classList.remove('activo')
  })

  document.getElementById('btnModoFPS')?.addEventListener('click', () => {
    controles.setModo('fps')
    document.getElementById('btnModoFPS')?.classList.add('activo')
    document.getElementById('btnModoOrbita')?.classList.remove('activo')
  })

  document.getElementById('btnCerrarInfo')?.addEventListener('click', () => {
    document.getElementById('panelInfo')?.classList.remove('visible')
  })

  // Resize
  window.addEventListener('resize', () => {
    camara.aspect = window.innerWidth / window.innerHeight
    camara.updateProjectionMatrix()
    renderer.setSize(window.innerWidth, window.innerHeight)
  })

  // Iniciar al cargar
  window.addEventListener('DOMContentLoaded', init)
})()
