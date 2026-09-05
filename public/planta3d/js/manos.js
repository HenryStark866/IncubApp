/* =============================================================================
 * manos.js — las manos del visitante en primera persona.
 *
 * Lo que en los juegos se llama «viewmodel»: dos manos colgadas de la cámara,
 * que se balancean al caminar y se estiran hacia la puerta cuando se va a
 * abrir. No son un adorno: en los videos de capacitación son lo que hace que el
 * que mira entienda que es ÉL quien entra, empuja y pasa.
 *
 * Están hechas con geometría redonda —cápsulas y esferas, no cajas— y con
 * falanges de verdad: cada dedo son tres articulaciones encadenadas y el pulgar
 * dos, opuesto al resto. Eso es lo que permite que la mano se cierre como se
 * cierra una mano y no como una pinza.
 *
 * Lo que NO es: un modelo escaneado. Sin traer un archivo de malla con su
 * esqueleto y su textura de piel, esto es lo más cerca que se llega —silueta,
 * proporciones y articulación correctas—, pero de muy cerca sigue siendo un
 * modelo de pocos polígonos.
 *
 * El movimiento es lo que más engaña al ojo, y va en cuatro capas: el balanceo
 * del paso (los brazos alternos), la respiración, el cierre ESCALONADO de los
 * dedos —el meñique va detrás del índice, nunca todos a la vez— y un temblor
 * mínimo para que la mano nunca se quede congelada.
 *
 * Va colgado de la cámara, así que hay que meter la cámara en la escena
 * (three.js solo dibuja lo que cuelga de lo que se le pasa a render).
 * =============================================================================
 */
;(function (global) {
  'use strict'

  const matPiel = new THREE.MeshStandardMaterial({ color: 0xc99274, roughness: 0.82, metalness: 0.0 })
  const matUna = new THREE.MeshStandardMaterial({ color: 0xdcb6a0, roughness: 0.45, metalness: 0.0 })
  const matManga = new THREE.MeshStandardMaterial({ color: 0xeef2f6, roughness: 0.88, metalness: 0.0 })
  const matPuno = new THREE.MeshStandardMaterial({ color: 0xd7dee6, roughness: 0.9, metalness: 0.0 })

  const geoEsfera = new THREE.SphereGeometry(1, 12, 9)
  const geoCil = new THREE.CylinderGeometry(1, 1, 1, 12, 1, true)

  /** Cápsula tumbada sobre −Z: cilindro con sus dos casquetes. */
  function capsula(r0, r1, largo, mat) {
    const g = new THREE.Group()
    const cil = new THREE.Mesh(geoCil, mat)
    cil.scale.set((r0 + r1) / 2, largo, (r0 + r1) / 2)
    cil.rotation.x = Math.PI / 2
    cil.position.z = -largo / 2
    const a = new THREE.Mesh(geoEsfera, mat)
    a.scale.setScalar(r0)
    const b = new THREE.Mesh(geoEsfera, mat)
    b.scale.setScalar(r1)
    b.position.z = -largo
    g.add(cil, a, b)
    return g
  }

  /** Un dedo: falanges encadenadas, cada una colgando de la anterior. */
  function dedo(largos, radio) {
    const raiz = new THREE.Group()
    let padre = raiz
    const nudos = []
    largos.forEach((L, i) => {
      const nudo = new THREE.Group()
      nudo.position.z = i === 0 ? 0 : -largos[i - 1]
      const r0 = radio * (1 - i * 0.13)
      const r1 = radio * (1 - (i + 1) * 0.13)
      nudo.add(capsula(r0, r1, L, matPiel))
      if (i === largos.length - 1) {
        const una = new THREE.Mesh(geoEsfera, matUna)
        una.scale.set(r1 * 0.62, r1 * 0.3, L * 0.34)
        una.position.set(0, r1 * 0.62, -L * 0.6)
        nudo.add(una)
      }
      padre.add(nudo)
      nudos.push(nudo)
      padre = nudo
    })
    return { raiz, nudos }
  }

  /** Una mano completa, mirando hacia −Z, con la palma hacia abajo. */
  function armarMano(signo) {
    const g = new THREE.Group()

    // Antebrazo con manga y puño del uniforme
    const brazo = capsula(0.052, 0.044, 0.30, matManga)
    brazo.rotation.x = Math.PI      // la cápsula apunta al codo, no a los dedos
    brazo.position.z = 0.02
    g.add(brazo)
    const puno = new THREE.Mesh(geoCil, matPuno)
    puno.scale.set(0.05, 0.05, 0.05)
    puno.rotation.x = Math.PI / 2
    puno.position.z = 0.035
    g.add(puno)

    // Muñeca, palma y canto: esferas achatadas, que es la forma de una mano
    const muneca = new THREE.Mesh(geoEsfera, matPiel)
    muneca.scale.set(0.039, 0.031, 0.036)
    muneca.position.z = 0.012
    g.add(muneca)
    const palma = new THREE.Mesh(geoEsfera, matPiel)
    palma.scale.set(0.046, 0.021, 0.056)
    palma.position.z = -0.052
    g.add(palma)
    const canto = new THREE.Mesh(geoEsfera, matPiel)
    canto.scale.set(0.017, 0.019, 0.05)
    canto.position.set(signo * 0.04, -0.002, -0.05)
    g.add(canto)

    // Cuatro dedos en abanico: los nudillos de una mano no van en fila.
    const dedos = []
    const largos = [
      [0.040, 0.026, 0.020],   // índice
      [0.043, 0.028, 0.021],   // corazón
      [0.039, 0.026, 0.019],   // anular
      [0.031, 0.020, 0.017],   // meñique
    ]
    largos.forEach((L, i) => {
      const d = dedo(L, 0.0108 - i * 0.0004)
      d.raiz.position.set(signo * (-0.031 + i * 0.0215), 0.001, -0.101 + Math.abs(i - 1.2) * 0.004)
      d.raiz.rotation.z = signo * (i - 1.5) * 0.045
      g.add(d.raiz)
      dedos.push(d)
    })

    // Pulgar: dos falanges, salido del canto y opuesto al resto.
    const pulgar = dedo([0.036, 0.028], 0.0125)
    pulgar.raiz.position.set(signo * -0.042, -0.004, -0.028)
    pulgar.raiz.rotation.set(0.25, signo * 0.95, signo * 0.35)
    g.add(pulgar.raiz)

    g.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false } })
    return { grupo: g, dedos, pulgar }
  }

  /**
   * @param {THREE.Camera} camara
   */
  function Manos(camara) {
    const raiz = new THREE.Group()
    raiz.name = 'manos'
    raiz.renderOrder = 10
    raiz.scale.setScalar(0.95)
    camara.add(raiz)

    const der = armarMano(1)
    const izq = armarMano(-1)
    raiz.add(der.grupo, izq.grupo)

    // Reposo: entran en diagonal desde las esquinas de abajo, como el brazo
    // propio de cualquiera que camine mirando al frente.
    const REPOSO = {
      der: { p: [0.28, -0.36, -0.5], r: [0.58, -0.46, -0.26] },
      izq: { p: [-0.28, -0.37, -0.53], r: [0.6, 0.46, 0.26] },
    }
    // Empuje: la mano se estira HACIA la puerta, lejos de la cámara. A 66 cm el
    // codo se metía en el ojo y el brazo tapaba un cuarto de la pantalla.
    const EMPUJE = {
      der: { p: [0.19, -0.2, -0.82], r: [0.2, -0.34, -0.16] },
      izq: { p: [-0.19, -0.21, -0.82], r: [0.22, 0.34, 0.16] },
    }

    const st = { t: 0, paso: 0, alcance: { der: 0, izq: 0 } }
    const lerp = (a, b, k) => a + (b - a) * k

    const mezcla = (mano, cual, t, vel) => {
      const s = t * t * (3 - 2 * t)
      const a = REPOSO[cual], b = EMPUJE[cual]
      const lado = cual === 'der' ? 1 : -1

      // 1. el paso: los brazos van alternos, como al caminar de verdad
      const fase = st.paso + (cual === 'der' ? 0 : Math.PI)
      const balanceo = Math.sin(fase) * 0.034 * vel * (1 - s)
      const rebote = Math.abs(Math.cos(fase)) * 0.016 * vel * (1 - s)
      // 2. la respiración, que sigue ahí cuando se está quieto
      const resp = Math.sin(st.t * 1.15 + lado) * 0.005 * (1 - s * 0.7)
      // 3. un temblor mínimo: una mano viva nunca se congela
      const tiembla = Math.sin(st.t * 7.3 + lado * 2) * 0.0012

      mano.grupo.position.set(
        lerp(a.p[0], b.p[0], s) + tiembla,
        lerp(a.p[1], b.p[1], s) + resp + rebote,
        lerp(a.p[2], b.p[2], s) + balanceo
      )
      mano.grupo.rotation.set(
        lerp(a.r[0], b.r[0], s) + resp * 1.6 - balanceo * 0.5,
        lerp(a.r[1], b.r[1], s),
        lerp(a.r[2], b.r[2], s) + tiembla * 2
      )

      // 4. los dedos: se cierran ESCALONADOS y con más curva en la falange del
      //    medio, que es como se cierra una mano. Todos a la vez y por igual se
      //    ve a plástico.
      mano.dedos.forEach((d, i) => {
        const retardo = i * 0.1
        const k = Math.max(0, Math.min(1, s * (1 + retardo) - retardo))
        const base = 0.62 - 0.5 * k + Math.sin(st.t * 1.3 + i) * 0.02
        d.nudos[0].rotation.x = base * 0.85
        d.nudos[1].rotation.x = base * 1.25
        d.nudos[2].rotation.x = base * 0.95
      })
      mano.pulgar.nudos[0].rotation.x = 0.35 - 0.25 * s
      mano.pulgar.nudos[1].rotation.x = 0.5 - 0.35 * s
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
        const vel = Math.max(0, Math.min(1, e.velocidad || 0))
        st.t += dt
        st.paso += dt * (3.4 + vel * 3.2)

        const metaDer = e.puerta && e.puerta.lado >= 0 ? e.puerta.cerca : 0
        const metaIzq = e.puerta && e.puerta.lado < 0 ? e.puerta.cerca : 0
        const v = 1 - Math.pow(0.0015, dt)   // seguimiento suave, no salto
        st.alcance.der += (metaDer - st.alcance.der) * v
        st.alcance.izq += (metaIzq - st.alcance.izq) * v

        mezcla(der, 'der', st.alcance.der, vel)
        mezcla(izq, 'izq', st.alcance.izq, vel)
      },
    }
  }

  global.Manos = Manos
})(window)
