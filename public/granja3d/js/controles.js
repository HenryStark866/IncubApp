/* =============================================================================
 * GRANJA 3D INCUBANT — controles.js
 * Modos de navegación:
 *   1) Primera persona (metaverso a pie): WASD + mouse look / joystick táctil.
 *   2) Dron / Órbita aérea: vista panorámica desde el aire para supervisión.
 * =============================================================================
 */
;(function (global) {
  'use strict'

  function ControlesGranja(camara, canvas) {
    let modo = 'orbita' // 'fps' | 'orbita'

    // Estado FPS
    const fps = {
      activo: false,
      pos: new THREE.Vector3(65, 1.7, 10),
      yaw: 0,
      pitch: 0,
      teclas: {},
      velocidad: 5.5,
      correr: 11.0,
      alturaOjos: 1.7,
    }

    // Estado Órbita (Dron)
    const orb = {
      target: new THREE.Vector3(65, 0, 45),
      distancia: 85,
      distMin: 15,
      distMax: 220,
      theta: Math.PI / 4,
      phi: Math.PI / 3.2,
      arrastrando: false,
      pan: false,
      lastX: 0,
      lastY: 0,
    }

    // Inicializar posición de cámara en órbita
    actualizarCamaraOrbita()

    function actualizarCamaraOrbita() {
      const x = orb.target.x + orb.distancia * Math.sin(orb.phi) * Math.sin(orb.theta)
      const y = orb.target.y + orb.distancia * Math.cos(orb.phi)
      const z = orb.target.z + orb.distancia * Math.sin(orb.phi) * Math.cos(orb.theta)
      camara.position.set(x, y, z)
      camara.lookAt(orb.target)
    }

    // Eventos teclado
    window.addEventListener('keydown', (e) => {
      fps.teclas[e.code] = true
    })
    window.addEventListener('keyup', (e) => {
      fps.teclas[e.code] = false
    })

    // Pointer lock para FPS
    canvas.addEventListener('click', () => {
      if (modo === 'fps' && document.pointerLockElement !== canvas) {
        canvas.requestPointerLock?.()
      }
    })

    document.addEventListener('pointerlockchange', () => {
      fps.activo = document.pointerLockElement === canvas
    })

    // Movimiento mouse
    window.addEventListener('mousemove', (e) => {
      if (modo === 'fps' && fps.activo) {
        const sens = 0.0022
        fps.yaw -= e.movementX * sens
        fps.pitch -= e.movementY * sens
        fps.pitch = Math.max(-Math.PI / 2.2, Math.min(Math.PI / 2.2, fps.pitch))
      } else if (modo === 'orbita' && orb.arrastrando) {
        const dx = e.clientX - orb.lastX
        const dy = e.clientY - orb.lastY
        orb.lastX = e.clientX
        orb.lastY = e.clientY

        if (orb.pan) {
          // Desplazamiento lateral
          const vFwd = new THREE.Vector3()
          camara.getWorldDirection(vFwd)
          vFwd.y = 0
          vFwd.normalize()
          const vRight = new THREE.Vector3().crossVectors(vFwd, new THREE.Vector3(0, 1, 0)).normalize()

          orb.target.addScaledVector(vRight, -dx * 0.15)
          orb.target.addScaledVector(vFwd, dy * 0.15)
        } else {
          // Rotación orbital
          orb.theta -= dx * 0.006
          orb.phi -= dy * 0.006
          orb.phi = Math.max(0.1, Math.min(Math.PI / 2.05, orb.phi))
        }
        actualizarCamaraOrbita()
      }
    })

    canvas.addEventListener('mousedown', (e) => {
      if (modo === 'orbita') {
        orb.arrastrando = true
        orb.pan = e.button === 2 || e.shiftKey
        orb.lastX = e.clientX
        orb.lastY = e.clientY
      }
    })

    window.addEventListener('mouseup', () => {
      orb.arrastrando = false
    })

    canvas.addEventListener('contextmenu', (e) => e.preventDefault())

    // Zoom rueda del ratón
    canvas.addEventListener('wheel', (e) => {
      if (modo === 'orbita') {
        e.preventDefault()
        orb.distancia *= e.deltaY > 0 ? 1.08 : 0.92
        orb.distancia = Math.max(orb.distMin, Math.min(orb.distMax, orb.distMin + (orb.distMax - orb.distMin) * ((orb.distancia - orb.distMin) / (orb.distMax - orb.distMin))))
        actualizarCamaraOrbita()
      }
    }, { passive: false })

    // Bucle de actualización por frame
    function update(dt) {
      if (modo === 'fps') {
        const v = fps.teclas['ShiftLeft'] || fps.teclas['ShiftRight'] ? fps.correr : fps.velocidad
        const moveDist = v * dt

        const fwd = new THREE.Vector3(-Math.sin(fps.yaw), 0, -Math.cos(fps.yaw))
        const right = new THREE.Vector3(Math.cos(fps.yaw), 0, -Math.sin(fps.yaw))

        if (fps.teclas['KeyW'] || fps.teclas['ArrowUp']) fps.pos.addScaledVector(fwd, moveDist)
        if (fps.teclas['KeyS'] || fps.teclas['ArrowDown']) fps.pos.addScaledVector(fwd, -moveDist)
        if (fps.teclas['KeyA'] || fps.teclas['ArrowLeft']) fps.pos.addScaledVector(right, -moveDist)
        if (fps.teclas['KeyD'] || fps.teclas['ArrowRight']) fps.pos.addScaledVector(right, moveDist)

        // Limites de terreno
        fps.pos.x = Math.max(-10, Math.min(150, fps.pos.x))
        fps.pos.z = Math.max(-20, Math.min(125, fps.pos.z))
        fps.pos.y = fps.alturaOjos

        camara.position.copy(fps.pos)

        const target = new THREE.Vector3()
        target.x = fps.pos.x - Math.sin(fps.yaw) * Math.cos(fps.pitch)
        target.y = fps.pos.y + Math.sin(fps.pitch)
        target.z = fps.pos.z - Math.cos(fps.yaw) * Math.cos(fps.pitch)
        camara.lookAt(target)
      }
    }

    function setModo(nuevoModo) {
      modo = nuevoModo
      if (modo === 'fps') {
        fps.pos.set(camara.position.x, fps.alturaOjos, camara.position.z)
        document.body.classList.add('fps')
      } else {
        if (document.pointerLockElement === canvas) document.exitPointerLock?.()
        document.body.classList.remove('fps')
        actualizarCamaraOrbita()
      }
    }

    function enfocarGalpon(x, z) {
      orb.target.set(x, 2, z)
      orb.distancia = 35
      orb.phi = Math.PI / 3.4
      actualizarCamaraOrbita()
    }

    return {
      update,
      setModo,
      getModo: () => modo,
      enfocarGalpon,
    }
  }

  global.ControlesGranja = ControlesGranja
})(window)
