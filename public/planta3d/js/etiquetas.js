/* =============================================================================
 * etiquetas.js — carteles flotantes (sprites) dibujados en un canvas.
 * No requiere fuentes ni archivos externos: todo se genera en memoria.
 * =============================================================================
 */
(function (global) {
  'use strict'

  const cache = new Map()

  /**
   * Crea un sprite con texto legible desde cualquier ángulo.
   * @param {string} texto
   * @param {{ color?:string, fondo?:string, tam?:number, alturaM?:number, sub?:string, colorSub?:string }} opts
   *   alturaM = altura del cartel en metros dentro de la escena.
   */
  function crearEtiqueta(texto, opts) {
    const o = Object.assign(
      { color: '#eaf2ff', fondo: 'rgba(10,16,28,0.72)', borde: 'rgba(140,180,230,0.55)', tam: 64, alturaM: 1.1, sub: '', colorSub: 'rgba(200,220,245,0.85)' },
      opts || {}
    )
    const clave = [texto, o.sub, o.color, o.fondo, o.borde, o.tam, o.colorSub].join('|')
    let tex = cache.get(clave)

    if (!tex) {
      const pad = 22
      const medir = document.createElement('canvas').getContext('2d')
      medir.font = `700 ${o.tam}px "Segoe UI", system-ui, sans-serif`
      const wTitulo = medir.measureText(texto).width
      medir.font = `500 ${o.tam * 0.62}px "Segoe UI", system-ui, sans-serif`
      const wSub = o.sub ? medir.measureText(o.sub).width : 0

      const w = Math.ceil(Math.max(wTitulo, wSub) + pad * 2)
      const h = Math.ceil(o.tam * (o.sub ? 2.05 : 1.35) + pad * 1.2)

      const cv = document.createElement('canvas')
      cv.width = w
      cv.height = h
      const ctx = cv.getContext('2d')

      // Cápsula de fondo
      const r = Math.min(h / 2, 26)
      ctx.beginPath()
      ctx.moveTo(r, 0)
      ctx.arcTo(w, 0, w, h, r)
      ctx.arcTo(w, h, 0, h, r)
      ctx.arcTo(0, h, 0, 0, r)
      ctx.arcTo(0, 0, w, 0, r)
      ctx.closePath()
      ctx.fillStyle = o.fondo
      ctx.fill()
      ctx.lineWidth = 3
      ctx.strokeStyle = o.borde
      ctx.stroke()

      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillStyle = o.color
      ctx.font = `700 ${o.tam}px "Segoe UI", system-ui, sans-serif`
      ctx.fillText(texto, w / 2, o.sub ? h * 0.36 : h / 2)
      if (o.sub) {
        ctx.font = `500 ${o.tam * 0.62}px "Segoe UI", system-ui, sans-serif`
        ctx.fillStyle = o.colorSub
        ctx.fillText(o.sub, w / 2, h * 0.72)
      }

      tex = new THREE.CanvasTexture(cv)
      tex.anisotropy = 4
      tex.needsUpdate = true
      cache.set(clave, tex)
    }

    const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: true, depthWrite: false })
    const sp = new THREE.Sprite(mat)
    const rel = tex.image.width / tex.image.height
    sp.scale.set(o.alturaM * rel, o.alturaM, 1)
    // Escala base: la app la reescala según la distancia para que siempre se lea
    sp.userData.base = { w: o.alturaM * rel, h: o.alturaM }
    sp.renderOrder = 10
    return sp
  }

  global.Etiquetas = { crearEtiqueta }
})(window)
