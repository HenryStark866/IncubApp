/* =============================================================================
 * manos.js — las manos del visitante en primera persona.
 *
 * Lo que en los juegos se llama «viewmodel»: dos manos colgadas de la cámara,
 * que se balancean al caminar y se estiran hacia la puerta cuando se va a
 * abrir. No son un adorno: en los videos de capacitación son lo que hace que
 * el que mira entienda que es ÉL quien entra, empuja y pasa.
 *
 * Guante azul de nitrilo y manga blanca, que es como se entra a la planta.
 *
 * Va colgado de la cámara, así que hay que meter la cámara en la escena
 * (three.js solo dibuja lo que cuelga de lo que se le pasa a render).
 * =============================================================================
 */
;(function (global) {
  'use strict'

  const matGuante = new THREE.MeshStandardMaterial({ color: 0x6fa8cf, roughness: 0.72, metalness: 0.02 })
  const matManga = new THREE.MeshStandardMaterial({ color: 0xeef2f6, roughness: 0.85, metalness: 0.0 })
  const matPuno = new THREE.MeshStandardMaterial({ color: 0x54809e, roughness: 0.8, metalness: 0.0 })

  const caja = new THREE.BoxGeometry(1, 1, 1)

  /** Una mano: manga, puño, palma y cinco dedos, mirando hacia −Z. */
  function armarMano(signo) {
    const g = new THREE.Group()
    const pon = (mat, sx, sy, sz, x, y, z) => {
      const m = new THREE.Mesh(caja, mat)
      m.scale.set(sx, sy, sz)
      m.position.set(x, y, z)
      g.add(m)
      return m
    }

    pon(matManga, 0.105, 0.105, 0.24, 0, 0, 0.16)      // antebrazo
    pon(matPuno, 0.12, 0.12, 0.035, 0, 0, 0.045)       // puño del guante
    pon(matGuante, 0.10, 0.048, 0.135, 0, 0, -0.045)   // palma

    // Cuatro dedos en fila, cada uno con su nudillo para poder cerrarlos.
    const dedos = []
    for (let i = 0; i < 4; i++) {
      const nudillo = new THREE.Group()
      nudillo.position.set((i - 1.5) * 0.026, 0, -0.11)
      const d = new THREE.Mesh(caja, matGuante)
      d.scale.set(0.022, 0.026, 0.072)
      d.position.set(0, 0, -0.036)
      nudillo.add(d)
      g.add(nudillo)
      dedos.push(nudillo)
    }
    // Pulgar: sale del canto, hacia adentro de la mano.
    const pulgar = new THREE.Group()
    pulgar.position.set(signo * -0.05, -0.005, -0.035)
    pulgar.rotation.y = signo * 0.75
    const p = new THREE.Mesh(caja, matGuante)
    p.scale.set(0.026, 0.026, 0.062)
    p.position.set(0, 0, -0.031)
    pulgar.add(p)
    g.add(pulgar)
    dedos.push(pulgar)

    g.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false } })
    return { grupo: g, dedos }
  }

  /**
   * @param {THREE.Camera} camara
   */
  function Manos(camara) {
    const raiz = new THREE.Group()
    raiz.name = 'manos'
    // Se dibujan al final y sin recorte por cercanía: una mano a 40 cm de la
    // cámara entra de lleno en el plano near y se vería cortada por la mitad.
    raiz.renderOrder = 10
    raiz.scale.setScalar(0.82)   // a tamaño de mano, no de guante de portero
    camara.add(raiz)

    const der = armarMano(1)
    const izq = armarMano(-1)
    izq.grupo.scale.x = -1        // la izquierda es la derecha reflejada
    raiz.add(der.grupo, izq.grupo)

    // Sitio de reposo: abajo, a los lados, apenas asomando en el encuadre.
    // Entran en diagonal desde las esquinas de abajo, como en cualquier juego
    // en primera persona: de frente y planas parecían dos guantes colgados.
    const REPOSO = {
      der: { p: [0.29, -0.35, -0.52], r: [0.62, -0.5, -0.3] },
      izq: { p: [-0.29, -0.36, -0.55], r: [0.66, 0.5, 0.3] },
    }
    // Sitio de empuje: la mano se estira HACIA LA PUERTA, o sea lejos de la
    // cámara. Con la palma a 66 cm y el antebrazo detrás, el codo se metía casi
    // en el ojo y el brazo tapaba un cuarto de la pantalla: se aleja a 80, baja
    // un poco y entra en diagonal desde la esquina, que es como se ve un brazo
    // propio y no un guante pegado al lente.
    const EMPUJE = {
      der: { p: [0.19, -0.2, -0.82], r: [0.2, -0.34, -0.16] },
      izq: { p: [-0.19, -0.21, -0.82], r: [0.22, 0.34, 0.16] },
    }

    const st = { fase: 0, alcance: { der: 0, izq: 0 }, visible: false }

    const mezcla = (mano, cual, t) => {
      const a = REPOSO[cual], b = EMPUJE[cual]
      const s = t * t * (3 - 2 * t)   // suavizado en las dos puntas
      const bob = Math.sin(st.fase) * 0.014 * (1 - s)
      const vaiv = Math.cos(st.fase * 0.5) * 0.008 * (1 - s)
      mano.grupo.position.set(
        a.p[0] + (b.p[0] - a.p[0]) * s + vaiv * (cual === 'der' ? 1 : -1),
        a.p[1] + (b.p[1] - a.p[1]) * s + bob,
        a.p[2] + (b.p[2] - a.p[2]) * s
      )
      mano.grupo.rotation.set(
        a.r[0] + (b.r[0] - a.r[0]) * s,
        a.r[1] + (b.r[1] - a.r[1]) * s,
        a.r[2] + (b.r[2] - a.r[2]) * s
      )
      // Los dedos van cerrados en reposo y se abren para empujar la hoja.
      const curva = 0.55 - 0.42 * s
      mano.dedos.forEach((d, i) => { d.rotation.x = i === 4 ? 0 : curva })
    }

    return {
      raiz,
      /**
       * @param {number} dt
       * @param {{visible:boolean, velocidad:number, puerta:?{lado:number, cerca:number}}} e
       *   `puerta.lado` es −1 si queda a la izquierda del visitante y +1 si a la
       *   derecha; `cerca` va de 0 a 1 según lo cerca que esté de alcanzarla.
       */
      actualizar(dt, e) {
        raiz.visible = !!e.visible
        if (!raiz.visible) return
        st.fase += dt * (2.6 + (e.velocidad || 0) * 1.1)

        const metaDer = e.puerta && e.puerta.lado >= 0 ? e.puerta.cerca : 0
        const metaIzq = e.puerta && e.puerta.lado < 0 ? e.puerta.cerca : 0
        const v = 1 - Math.pow(0.001, dt)   // seguimiento suave, no salto
        st.alcance.der += (metaDer - st.alcance.der) * v
        st.alcance.izq += (metaIzq - st.alcance.izq) * v

        mezcla(der, 'der', st.alcance.der)
        mezcla(izq, 'izq', st.alcance.izq)
      },
    }
  }

  global.Manos = Manos
})(window)
