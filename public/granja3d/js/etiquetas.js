/* =============================================================================
 * GRANJA 3D INCUBANT — etiquetas.js
 * Rótulos flotantes interactivos en el espacio 3D para galpones y módulos
 * =============================================================================
 */
;(function (global) {
  'use strict'

  function EtiquetasGranja(camara, contenedor, datos, onSelect) {
    const lista = []

    const salas = datos.rooms || []
    salas.forEach((s) => {
      const isGalpon = /^G\d{3}/i.test(s.code) || /GALPON/i.test(s.name)
      const isModulo = /^M\d{3}/i.test(s.code) || /MODULO/i.test(s.name)

      if (!isGalpon && !isModulo && s.code !== 'BIO-ARC' && s.code !== 'BOD-ALM') return

      const el = document.createElement('div')
      el.className = `etiqueta-3d ${isGalpon ? 'galpon' : isModulo ? 'modulo' : 'edif'} ${s.type || ''}`
      el.innerHTML = `
        <span class="cod">${s.code}</span>
        <span class="nom">${s.name}</span>
      `
      el.onclick = () => onSelect?.(s)
      contenedor.appendChild(el)

      // Altura del rótulo
      const yAlt = isGalpon ? 6.5 : isModulo ? 8.5 : 4.8
      const pos3D = new THREE.Vector3(s.x + s.w / 2, yAlt, s.y + s.h / 2)

      lista.push({ el, pos3D, room: s })
    })

    function update() {
      const w = window.innerWidth
      const h = window.innerHeight
      const fwd = new THREE.Vector3()
      camara.getWorldDirection(fwd)

      lista.forEach((item) => {
        const v = item.pos3D.clone()
        v.project(camara)

        // Verificar si está detrás de la cámara
        const dir = item.pos3D.clone().sub(camara.position)
        const visible = dir.dot(fwd) > 0 && v.z < 1

        if (!visible) {
          item.el.style.display = 'none'
          return
        }

        const sx = (v.x * 0.5 + 0.5) * w
        const sy = (-(v.y * 0.5) + 0.5) * h
        const dist = camara.position.distanceTo(item.pos3D)

        if (dist > 160) {
          item.el.style.display = 'none'
          return
        }

        item.el.style.display = 'flex'
        item.el.style.transform = `translate(-50%, -100%) translate(${sx}px, ${sy}px)`
        item.el.style.opacity = dist > 110 ? String(1 - (dist - 110) / 50) : '1'
      })
    }

    return { update }
  }

  global.EtiquetasGranja = EtiquetasGranja
})(window)
