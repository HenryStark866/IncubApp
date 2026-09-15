/* =============================================================================
 * controles.js — dos formas de moverse por la planta:
 *   1) Primera persona (metaverso): WASD + mouse, con choque contra muros y equipos.
 *   2) Órbita: girar / acercar / desplazar la planta completa como una maqueta.
 * Ambos funcionan con mouse y con pantalla táctil.
 * =============================================================================
 */
(function (global) {
  'use strict'

  const RAD = Math.PI / 180

  // ───────────────────────────────────────────────────────────── 1ª persona
  function PrimeraPersona(camara, dom, opciones) {
    const o = Object.assign(
      {
        // Ojos a 1,60 —una persona de 1,72— y no a 1,68. Cuanto más alto va el
        // punto de vista, más pequeño se ve todo alrededor: con la cámara a
        // 1,68 la planta parecía menor de lo que es al recorrerla.
        alturaOjos: 1.60, velocidad: 3.2, velocidadCorrer: 7.0,
        // Medio ancho del cuerpo. Con 0,34 el visitante media 68 cm y no pasaba
        // por las puertas de 70 de los W.C.: quedaba un centimetro por lado.
        // 0,30 es un hombro normal, deja pasar esas y sigue sin caber por la
        // puertilla de 60 del plenum, que es lo correcto.
        radio: 0.30,
        limites: null,
      },
      opciones || {}
    )

    const st = {
      activo: false,
      bloqueado: false,
      atravesar: false,
      volar: false,
      yaw: 0,
      pitch: 0,
      pos: new THREE.Vector3(0, o.alturaOjos, 0),
      altura: o.alturaOjos,
      // Piso del nivel donde está parado el visitante (0 en planta baja, el
      // del entrepiso en el nivel 2): se suma a la altura de ojos de siempre,
      // así caminar por el nivel 2 no lo deja con los ojos a la altura del
      // suelo de abajo.
      piso: 0,
      teclas: Object.create(null),
      colisiones: [],
      // Suelos por encima de la planta baja. `losa` son los trozos del
      // entrepiso y `rampas` los tramos de escalera, que son los unicos sitios
      // por donde se cambia de nivel a pie.
      losa: null,
      rampas: [],
      joystick: { x: 0, y: 0, correr: false },
      sensibilidad: 0.0022,
      onEstado: null,
    }

    // Lo que se sube o se baja de UN PASO, sin escalera. Es la medida que separa
    // un desnivel que se salva andando de uno al que hay que subir por rampa, y
    // vale 1,05 por los cuartos de maquinas: su piso cuelga un metro justo del
    // entrepiso, y ahi se entra bajando ese metro y se sale subiendolo. Por
    // encima de eso no se pasa, asi que del borde del entrepiso —3,40 al vacio—
    // se sigue sin poder caer.
    const ESCALON = 1.05
    // Lo que se salva de un paso sin subir escalon: el antepecho de la
    // compuerta de un tunel. Mas alto que esto ya es un muro.
    const BORDILLO = 0.5

    // Cota del suelo bajo un punto PARA QUIEN ESTA EN `desde`. Estando abajo, el
    // suelo es la planta baja aunque encima pase el entrepiso: si no, caminar
    // bajo la losa se leia como querer subirse a ella y no se podia dar un paso.
    const pisoEn = (x, z, desde) => {
      const cotaAhora = desde == null ? st.piso : desde
      for (let i = 0; i < st.rampas.length; i++) {
        const r = st.rampas[i]
        if (x < r.x0 || x > r.x1 || z < r.z0 || z > r.z1) continue
        // Huella nula: una escalera dibujada en el plano con cero de fondo daba
        // NaN aqui, y de ahi pasaba a `st.piso`, a la altura de la camara y a
        // su posicion. La escena dejaba de dibujarse y no se recuperaba, porque
        // cualquier comparacion con NaN es falsa y tampoco se podia uno mover.
        const corrida = r.a1 - r.a0
        const t = corrida ? Math.max(0, Math.min(1, (z - r.a0) / corrida)) : 0
        const y = r.y0 + (r.y1 - r.y0) * t
        // Una rampa solo es suelo si se está A SU ALTURA. El puente de la
        // escalera cruza el pasillo de zona sucia por encima, a 3,40, y su
        // huella se leía como piso desde abajo: el paso quedaba prohibido —el
        // salto era de más de tres metros— y no se podía pasar por debajo.
        if (Math.abs(y - cotaAhora) > 1.2) continue
        return y
      }
      const L = st.losa
      if (L) {
        // Los suelos hundidos van primero: donde hay uno, la losa esta recortada
        // justo encima y manda el. Es el caso de los cuartos de maquinas de las
        // incubadoras, con el piso un metro por debajo del entrepiso; mientras
        // la losa los tapaba se caminaba sobre un suelo que no existe.
        const listas = L.hundidos && L.hundidos.length ? [L.hundidos, L.trozos] : [L.trozos]
        for (let n = 0; n < listas.length; n++) {
          const lista = listas[n]
          for (let i = 0; i < lista.length; i++) {
            const t = lista[i]
            if (x <= t.x0 || x >= t.x1 || z <= t.z0 || z >= t.z1) continue
            // Los trozos no se solapan: el primero que cubre el punto es EL
            // suelo de ahi arriba, y solo cuenta si se alcanza de un paso.
            const y = t.y == null ? L.alto : t.y
            return Math.abs(y - cotaAhora) <= ESCALON ? y : 0
          }
        }
      }
      return 0
    }

    // Cota de la rampa que pisa este punto, o null. Mirar solo la huella en
    // PLANTA no basta: el puente de la escalera cruza el pasillo de zona sucia
    // por encima, a 3,40, y desde la planta baja su huella apagaba todas las
    // colisiones — se atravesaban de largo los dos muros que hay debajo. Es la
    // misma comprobacion de altura que ya hace `pisoEn`.
    const rampaEn = (x, z) => {
      for (let i = 0; i < st.rampas.length; i++) {
        const r = st.rampas[i]
        if (x < r.x0 || x > r.x1 || z < r.z0 || z > r.z1) continue
        const corrida = r.a1 - r.a0
        const t = corrida ? Math.max(0, Math.min(1, (z - r.a0) / corrida)) : 0
        return r.y0 + (r.y1 - r.y0) * t
      }
      return null
    }
    const enRampa = (x, z) => {
      const y = rampaEn(x, z)
      return y != null && Math.abs(y - st.piso) <= 1.2
    }

    const chocaEn = (x, z) => {
      if (st.atravesar || st.volar) return false
      // Sobre una escalera no se choca con nada: por ahi pasa, y tiene que
      // cruzar el muro que separa la sala tecnica del pasillo — en la planta
      // real ese muro esta abierto justo donde sube.
      if (enRampa(x, z)) return false
      const r = o.radio
      // Franja que ocupa el cuerpo desde el piso en el que se esta parado. Un
      // obstaculo que quede entero por encima de la cabeza —el sobremuro sobre
      // una puerta, la tapa de un tunel del piso de arriba— o entero por debajo
      // de los pies no estorba el paso.
      const pies = st.piso + 0.05
      const cabeza = st.piso + o.alturaOjos + 0.12
      for (let i = 0; i < st.colisiones.length; i++) {
        const c = st.colisiones[i]
        if (!(x > c.x0 - r && x < c.x1 + r && z > c.z0 - r && z < c.z1 + r)) continue
        // Sin franja declarada se comporta como siempre: estorba.
        if (c.y1 == null || c.y0 == null) return true
        // Bordillo que se pisa: el antepecho de un vano no frena si no le llega
        // mas arriba del escalon. Sin esto, los 30 cm de la compuerta de los
        // tuneles de incubadoras dejaban al visitante clavado en la entrada.
        if (c.sePisa && c.y1 - st.piso <= BORDILLO) continue
        // Borde de la losa sobre un foso de incubadoras: no frena, se baja
        // el metro. Si el desnivel no se puede salvar lo dice `pisoOk`.
        if (c.bordeLosa) continue
        if (c.y1 > pies && c.y0 < cabeza) return true
      }
      return false
    }

    // ── Mouse / puntero ──
    const onMouseMove = (e) => {
      if (!st.bloqueado) return
      st.yaw -= e.movementX * st.sensibilidad
      st.pitch -= e.movementY * st.sensibilidad
      st.pitch = Math.max(-89 * RAD, Math.min(89 * RAD, st.pitch))
    }

    const onLockChange = () => {
      st.bloqueado = document.pointerLockElement === dom
      st.onEstado?.(st.bloqueado)
      if (!st.bloqueado) st.teclas = Object.create(null)
    }

    // Escribir en un campo no es caminar. El buscador de salas esta siempre a
    // la vista, y sin esto teclear en el movia al visitante y ademas se tragaba
    // la barra espaciadora.
    const escribiendo = (e) => {
      const t = e.target
      return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' ||
        t.tagName === 'SELECT' || t.isContentEditable)
    }
    const onKeyDown = (e) => {
      if (!st.activo || escribiendo(e)) return
      st.teclas[e.code] = true
      if (e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault()
    }
    const onKeyUp = (e) => { st.teclas[e.code] = false }

    // ── Táctil: arrastrar en la pantalla para mirar ──
    // La mano del joystick no mueve la vista. Antes se descartaba un rectángulo
    // fijo —el 38 % izquierdo por debajo de la mitad— escrito a ojo: si el
    // joystick se movía o cambiaba de tamaño, o dejaba de responder o se comía
    // media pantalla. Ahora quien dibuja el joystick declara aquí su zona.
    st.zonaJoystick = null
    let tocando = null
    const enJoystick = (x, y) => {
      const z = st.zonaJoystick
      return !!z && x >= z.x0 && x <= z.x1 && y >= z.y0 && y <= z.y1
    }
    const onTouchStart = (e) => {
      if (!st.activo) return
      const t = e.changedTouches[0]
      if (enJoystick(t.clientX, t.clientY)) return
      tocando = { id: t.identifier, x: t.clientX, y: t.clientY }
    }
    const onTouchMove = (e) => {
      if (!tocando) return
      for (const t of e.changedTouches) {
        if (t.identifier !== tocando.id) continue
        st.yaw -= (t.clientX - tocando.x) * 0.005
        st.pitch -= (t.clientY - tocando.y) * 0.005
        st.pitch = Math.max(-89 * RAD, Math.min(89 * RAD, st.pitch))
        tocando.x = t.clientX
        tocando.y = t.clientY
      }
    }
    // Solo cuenta si se levanta EL dedo que estaba mirando: con el pulgar
    // izquierdo en el joystick y el derecho girando la vista, soltar el
    // joystick dejaba la camara muerta hasta volver a tocar.
    const onTouchEnd = (e) => {
      if (!tocando) return
      for (const t of e.changedTouches) if (t.identifier === tocando.id) { tocando = null; return }
    }

    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('pointerlockchange', onLockChange)
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    // Alt+Tab con una tecla pulsada: el keyup no llega nunca y el visitante se
    // queda andando solo contra una pared al volver.
    const onBlur = () => { st.teclas = Object.create(null); st.joystick = { x: 0, y: 0, correr: false } }
    window.addEventListener('blur', onBlur)
    dom.addEventListener('touchstart', onTouchStart, { passive: true })
    dom.addEventListener('touchmove', onTouchMove, { passive: true })
    dom.addEventListener('touchend', onTouchEnd, { passive: true })
    dom.addEventListener('touchcancel', onTouchEnd, { passive: true })

    return {
      estado: st,
      set colisiones(v) { st.colisiones = v },
      set losa(v) { st.losa = v },
      set rampas(v) { st.rampas = v || [] },
      pedirBloqueo() {
        // Devuelve promesa en los navegadores nuevos, y hay sitios donde el
        // bloqueo de puntero está prohibido —una página incrustada, por
        // ejemplo—: sin capturarla, cada intento deja un error suelto en la
        // consola. Se camina igual, solo que mirando con arrastre.
        const p = dom.requestPointerLock?.()
        if (p && p.catch) p.catch(() => {})
      },
      soltarBloqueo() { document.exitPointerLock?.() },
      activar(v) {
        st.activo = v
        // Sin esto, salir del recorrido con una tecla pulsada la dejaba pegada:
        // al volver, el visitante arrancaba andando solo.
        if (!v) { st.teclas = Object.create(null); st.joystick = { x: 0, y: 0, correr: false } }
        if (!v && st.bloqueado) document.exitPointerLock()
      },
      /** Inclinacion absoluta, ya acotada. La usa el sensor del telefono. */
      ponerPitch(v) {
        st.pitch = Math.max(-89 * RAD, Math.min(89 * RAD, v))
      },
      /**
       * Coloca al visitante en un punto del plano (metros) mirando a un rumbo.
       * `piso` es la cota del suelo ahí (0 en planta baja, la del entrepiso o
       * la del cuarto de máquinas en el nivel 2); si no se da, se queda en el
       * piso donde ya estaba parado.
       */
      colocar(x, z, yawGrados, piso) {
        if (piso != null) st.piso = piso
        st.altura = st.piso + o.alturaOjos
        st.pos.set(x, st.altura, z)
        if (yawGrados != null) st.yaw = yawGrados * RAD
        st.pitch = 0
      },
      /**
       * Empuje del joystick o del mando, de −1 a 1. `correr` llega cuando el
       * dedo o la palanca pasan del 85 % del recorrido: en un mando no hay
       * tecla Shift, y sin esto no había forma de correr sin teclado.
       */
      joystick(x, y, correr) {
        st.joystick.x = x
        st.joystick.y = y
        st.joystick.correr = !!correr
      },
      /** Giro de cámara desde fuera (palanca derecha del mando). En radianes. */
      mirar(dYaw, dPitch) {
        st.yaw -= dYaw
        st.pitch = Math.max(-89 * RAD, Math.min(89 * RAD, st.pitch - dPitch))
      },
      /** Rectángulo de pantalla que ocupa el joystick, para no mirar con esa mano. */
      set zonaJoystick(z) { st.zonaJoystick = z },
      actualizar(dt) {
        if (!st.activo) return
        const k = st.teclas
        let av = 0, lat = 0, vert = 0
        if (k.KeyW || k.ArrowUp) av += 1
        if (k.KeyS || k.ArrowDown) av -= 1
        if (k.KeyA || k.ArrowLeft) lat -= 1
        if (k.KeyD || k.ArrowRight) lat += 1
        if (k.KeyE || k.Space) vert += 1
        if (k.KeyQ || k.ShiftRight) vert -= 1
        av += -st.joystick.y
        lat += st.joystick.x

        const correr = !!(k.ShiftLeft || k.ControlLeft || st.joystick.correr)
        const vel = (correr ? o.velocidadCorrer : o.velocidad) * (st.volar ? 2.2 : 1)
        const len = Math.hypot(av, lat)
        if (len > 1) { av /= len; lat /= len }

        const sin = Math.sin(st.yaw), cos = Math.cos(st.yaw)
        // En three.js la cámara mira hacia −Z cuando yaw = 0
        const dx = (-sin * av + cos * lat) * vel * dt
        const dz = (-cos * av - sin * lat) * vel * dt

        // Un paso solo vale si ademas hay suelo al que ir: se sube y se baja por
        // rampa y se salva el escalon de los cuartos de maquinas, pero no se
        // cae del borde del entrepiso ni se cruza un foso abierto.
        // Sin esto, caminar por el segundo nivel era caminar sobre el vacio.
        const pisoOk = (x, z) => {
          if (st.volar || st.atravesar) return true
          return Math.abs(pisoEn(x, z, st.piso) - st.piso) <= ESCALON
        }
        let nx = st.pos.x + dx
        let nz = st.pos.z + dz
        // Si ya se esta DENTRO de una caja de choque, todo destino cercano
        // tambien lo esta y los dos ejes quedan bloqueados para siempre. Se
        // deja salir: mientras se este atrapado el choque no cuenta, y en
        // cuanto se sale vuelve la regla. El suelo se sigue respetando.
        const atrapado = chocaEn(st.pos.x, st.pos.z)
        if ((atrapado || !chocaEn(nx, st.pos.z)) && pisoOk(nx, st.pos.z)) st.pos.x = nx
        if ((atrapado || !chocaEn(st.pos.x, nz)) && pisoOk(st.pos.x, nz)) st.pos.z = nz
        if (!st.volar) st.piso = pisoEn(st.pos.x, st.pos.z, st.piso)

        if (st.volar) {
          st.altura = Math.max(0.4, Math.min(60, st.altura + vert * vel * dt))
        } else {
          st.altura = st.piso + o.alturaOjos
        }
        st.pos.y = st.altura

        if (o.limites) {
          const L = o.limites, m = 14
          st.pos.x = Math.max(L.minX - m, Math.min(L.maxX + m, st.pos.x))
          st.pos.z = Math.max(L.minZ - m, Math.min(L.maxZ + m, st.pos.z))
        }

        camara.position.copy(st.pos)
        camara.rotation.set(0, 0, 0)
        camara.rotateY(st.yaw)
        camara.rotateX(st.pitch)
      },
      destruir() {
        document.removeEventListener('mousemove', onMouseMove)
        document.removeEventListener('pointerlockchange', onLockChange)
        window.removeEventListener('keydown', onKeyDown)
        window.removeEventListener('keyup', onKeyUp)
        window.removeEventListener('blur', onBlur)
        dom.removeEventListener('touchstart', onTouchStart)
        dom.removeEventListener('touchmove', onTouchMove)
        dom.removeEventListener('touchend', onTouchEnd)
        dom.removeEventListener('touchcancel', onTouchEnd)
      },
    }
  }

  // ─────────────────────────────────────────────────────────────── Órbita
  function Orbita(camara, dom, opciones) {
    const o = Object.assign({ minDist: 4, maxDist: 400, minPolar: 2 * RAD, maxPolar: 89.5 * RAD }, opciones || {})
    const st = {
      activo: false,
      objetivo: new THREE.Vector3(0, 0, 0),
      dist: 120,
      azim: -35 * RAD,
      polar: 55 * RAD,
      girando: false,
      moviendo: false,
      ultimo: { x: 0, y: 0 },
      auto: 0, // giro automático (rad/s)
    }

    const aplicar = () => {
      const sp = Math.sin(st.polar), cp = Math.cos(st.polar)
      camara.position.set(
        st.objetivo.x + st.dist * sp * Math.sin(st.azim),
        st.objetivo.y + st.dist * cp,
        st.objetivo.z + st.dist * sp * Math.cos(st.azim)
      )
      camara.up.set(0, 1, 0)
      camara.lookAt(st.objetivo)
    }

    // El tactil va por `touchstart`/`touchmove`, mas abajo. Sin descartarlo
    // aqui, un arrastre de un dedo se contaba dos veces y la maqueta giraba al
    // doble de velocidad en pantalla tactil.
    const onDown = (e) => {
      if (!st.activo || e.pointerType === 'touch') return
      dom.setPointerCapture?.(e.pointerId)
      if (e.button === 2 || e.button === 1 || e.shiftKey) st.moviendo = true
      else st.girando = true
      st.ultimo = { x: e.clientX, y: e.clientY }
    }
    const onMove = (e) => {
      if (!st.activo || e.pointerType === 'touch') return
      if (!st.girando && !st.moviendo) return
      const dx = e.clientX - st.ultimo.x
      const dy = e.clientY - st.ultimo.y
      st.ultimo = { x: e.clientX, y: e.clientY }
      if (st.girando) {
        st.azim -= dx * 0.005
        st.polar = Math.max(o.minPolar, Math.min(o.maxPolar, st.polar - dy * 0.005))
      } else {
        const f = st.dist * 0.0016
        const derecha = new THREE.Vector3(Math.cos(st.azim), 0, -Math.sin(st.azim))
        const adelante = new THREE.Vector3(Math.sin(st.azim), 0, Math.cos(st.azim))
        st.objetivo.addScaledVector(derecha, -dx * f)
        st.objetivo.addScaledVector(adelante, -dy * f)
      }
      aplicar()
    }
    const onUp = () => { st.girando = false; st.moviendo = false }
    const onWheel = (e) => {
      if (!st.activo) return
      e.preventDefault()
      st.dist = Math.max(o.minDist, Math.min(o.maxDist, st.dist * (1 + Math.sign(e.deltaY) * 0.12)))
      aplicar()
    }

    // Táctil: 1 dedo gira, 2 dedos acercan/desplazan
    let toques = []
    const distToques = () => Math.hypot(toques[0].x - toques[1].x, toques[0].y - toques[1].y)
    const onTS = (e) => {
      if (!st.activo) return
      toques = Array.from(e.touches).map((t) => ({ id: t.identifier, x: t.clientX, y: t.clientY }))
      st.ultimo = { x: toques[0].x, y: toques[0].y }
      if (toques.length === 2) st._d0 = distToques()
    }
    const onTM = (e) => {
      if (!st.activo) return
      const nuevos = Array.from(e.touches).map((t) => ({ id: t.identifier, x: t.clientX, y: t.clientY }))
      if (nuevos.length === 1 && toques.length === 1) {
        st.azim -= (nuevos[0].x - st.ultimo.x) * 0.006
        st.polar = Math.max(o.minPolar, Math.min(o.maxPolar, st.polar - (nuevos[0].y - st.ultimo.y) * 0.006))
        st.ultimo = { x: nuevos[0].x, y: nuevos[0].y }
      } else if (nuevos.length === 2 && toques.length === 2) {
        const d = Math.hypot(nuevos[0].x - nuevos[1].x, nuevos[0].y - nuevos[1].y)
        st.dist = Math.max(o.minDist, Math.min(o.maxDist, st.dist * (st._d0 / (d || 1))))
        st._d0 = d
      }
      toques = nuevos
      aplicar()
    }
    const onTE = (e) => { toques = Array.from(e.touches).map((t) => ({ id: t.identifier, x: t.clientX, y: t.clientY })) }

    const onMenu = (e) => { if (st.activo) e.preventDefault() }
    dom.addEventListener('pointerdown', onDown)
    dom.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    dom.addEventListener('wheel', onWheel, { passive: false })
    dom.addEventListener('contextmenu', onMenu)
    dom.addEventListener('touchstart', onTS, { passive: true })
    dom.addEventListener('touchmove', onTM, { passive: true })
    dom.addEventListener('touchend', onTE, { passive: true })

    return {
      estado: st,
      activar(v) { st.activo = v; if (v) aplicar() },
      /** Encuadra un punto con una distancia y ángulos concretos. */
      encuadrar(x, z, dist, azimGrados, polarGrados, y) {
        st.objetivo.set(x, y || 0, z)
        if (dist != null) st.dist = dist
        if (azimGrados != null) st.azim = azimGrados * RAD
        if (polarGrados != null) st.polar = Math.max(o.minPolar, Math.min(o.maxPolar, polarGrados * RAD))
        aplicar()
      },
      autoGiro(v) { st.auto = v },
      actualizar(dt) {
        if (!st.activo) return
        if (st.auto) { st.azim += st.auto * dt; aplicar() }
      },
      aplicar,
    }
  }

  global.Controles = { PrimeraPersona, Orbita }
})(window)
