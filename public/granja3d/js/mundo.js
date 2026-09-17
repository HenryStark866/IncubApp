/* =============================================================================
 * GRANJA 3D INCUBANT — mundo.js
 * Construcción 3D del paisaje rural, vías, módulos, galpones de 2 pisos, silos
 * y bioseguridad para el recorrido virtual de la Granja.
 * Escala 1:1 en metros.
 * =============================================================================
 */
;(function (global) {
  'use strict'

  function tono(hex, f) {
    const c = new THREE.Color(hex)
    c.multiplyScalar(f)
    return c
  }

  function construirGranja(datos) {
    const raiz = new THREE.Group()
    raiz.name = 'granja'

    const gTerreno = new THREE.Group(); gTerreno.name = 'terreno'
    const gEdificios = new THREE.Group(); gEdificios.name = 'edificios'
    const gGalpones = new THREE.Group(); gGalpones.name = 'galpones'
    const gSilos = new THREE.Group(); gSilos.name = 'silos'
    const gVegetacion = new THREE.Group(); gVegetacion.name = 'vegetacion'
    const gCercas = new THREE.Group(); gCercas.name = 'cercas'
    const gLuces = new THREE.Group(); gLuces.name = 'luces'

    raiz.add(gTerreno)
    raiz.add(gEdificios)
    raiz.add(gGalpones)
    raiz.add(gSilos)
    raiz.add(gVegetacion)
    raiz.add(gCercas)
    raiz.add(gLuces)

    // Materiales comunes
    const matPasto = new THREE.MeshLambertMaterial({ color: 0x3d7032 })
    const matTierra = new THREE.MeshLambertMaterial({ color: 0x5c4d3c })
    const matVia = new THREE.MeshLambertMaterial({ color: 0x7c7365 })
    const matAsfalto = new THREE.MeshLambertMaterial({ color: 0x33373d })
    const matMuroBlanco = new THREE.MeshLambertMaterial({ color: 0xf1f5f9 })
    const matMuroGris = new THREE.MeshLambertMaterial({ color: 0x94a3b8 })
    const matTechoGalpon = new THREE.MeshLambertMaterial({ color: 0x475569 })
    const matTechoM100 = new THREE.MeshLambertMaterial({ color: 0x3b82f6 })
    const matTechoM200 = new THREE.MeshLambertMaterial({ color: 0x10b981 })
    const matCortinaP1 = new THREE.MeshLambertMaterial({ color: 0xf59e0b, side: THREE.DoubleSide })
    const matCortinaP2 = new THREE.MeshLambertMaterial({ color: 0x3b82f6, side: THREE.DoubleSide })
    const matMalla = new THREE.MeshBasicMaterial({ color: 0x1e293b, wireframe: true })
    const matMetal = new THREE.MeshStandardMaterial({ color: 0xcbd5e1, roughness: 0.3, metalness: 0.8 })
    const matMetalOscuro = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.5, metalness: 0.6 })
    const matSilo = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, roughness: 0.25, metalness: 0.85 })
    const matVidrio = new THREE.MeshLambertMaterial({ color: 0x93c5fd, transparent: true, opacity: 0.55 })
    const matAgua = new THREE.MeshLambertMaterial({ color: 0x0284c7 })
    const matMadera = new THREE.MeshLambertMaterial({ color: 0x78350f })
    const matFollaje = new THREE.MeshLambertMaterial({ color: 0x22542a })
    const matFollajeOscuro = new THREE.MeshLambertMaterial({ color: 0x16381c })

    // ── 1. TERRENO Y PAISAJE RURAL ──────────────────────────────────────────
    const anchoT = 240
    const largoT = 200
    const geoPasto = new THREE.PlaneGeometry(anchoT, largoT, 32, 32)
    geoPasto.rotateX(-Math.PI / 2)
    const terreno = new THREE.Mesh(geoPasto, matPasto)
    terreno.position.set(65, -0.05, 55)
    terreno.receiveShadow = true
    gTerreno.add(terreno)

    // Colinas en el horizonte
    for (let i = 0; i < 12; i++) {
      const colinaR = 40 + Math.random() * 35
      const colinaGeo = new THREE.ConeGeometry(colinaR, 25 + Math.random() * 20, 16)
      const colina = new THREE.Mesh(colinaGeo, matFollajeOscuro)
      const ang = (i / 12) * Math.PI * 2
      const dist = 140 + Math.random() * 30
      colina.position.set(65 + Math.cos(ang) * dist, 8, 55 + Math.sin(ang) * dist)
      gTerreno.add(colina)
    }

    // ── 2. ILUMINACIÓN ──────────────────────────────────────────────────────
    const luzAmb = new THREE.AmbientLight(0xffffff, 0.65)
    gLuces.add(luzAmb)

    const sol = new THREE.DirectionalLight(0xfffaed, 1.1)
    sol.position.set(90, 120, -50)
    sol.castShadow = true
    sol.shadow.mapSize.width = 2048
    sol.shadow.mapSize.height = 2048
    sol.shadow.camera.near = 10
    sol.shadow.camera.far = 300
    sol.shadow.camera.left = -120
    sol.shadow.camera.right = 120
    sol.shadow.camera.top = 120
    sol.shadow.camera.bottom = -120
    gLuces.add(sol)

    // Luz de relleno azulada desde el cielo
    const hemisferio = new THREE.HemisphereLight(0xb1e1ff, 0x3d7032, 0.45)
    gLuces.add(hemisferio)

    // ── 3. VÍAS Y ACCESOS ───────────────────────────────────────────────────
    const viaGeo = new THREE.PlaneGeometry(160, 7)
    viaGeo.rotateX(-Math.PI / 2)
    const viaPrincipal = new THREE.Mesh(viaGeo, matVia)
    viaPrincipal.position.set(65, 0.02, 12)
    viaPrincipal.receiveShadow = true
    gTerreno.add(viaPrincipal)

    // Vías secundarias perpendiculares hacia los galpones
    const viasGalpon = [18, 48, 78, 108]
    viasGalpon.forEach((vx) => {
      const vSecGeo = new THREE.PlaneGeometry(5, 90)
      vSecGeo.rotateX(-Math.PI / 2)
      const viaSec = new THREE.Mesh(vSecGeo, matVia)
      viaSec.position.set(vx, 0.015, 58)
      viaSec.receiveShadow = true
      gTerreno.add(viaSec)
    })

    // ── 4. CONSTRUCCIÓN DE SALAS Y EDIFICIOS DE BIOSEGURIDAD ─────────────────
    const salas = datos.rooms || []
    const galponRooms = []

    salas.forEach((s) => {
      const isGalpon = /^G\d{3}/i.test(s.code) || /GALPON/i.test(s.name)
      if (isGalpon) {
        galponRooms.push(s)
        return
      }

      const isModulo = /^M\d{3}/i.test(s.code) || /MODULO/i.test(s.name)
      if (isModulo) {
        // Marcador perimetral de módulo con postes de señalización
        const mGeo = new THREE.BoxGeometry(s.w, 0.15, s.h)
        const mMesh = new THREE.Mesh(mGeo, s.type === 'levante' ? matTechoM100 : matTechoM200)
        mMesh.position.set(s.x + s.w / 2, 0.03, s.y + s.h / 2)
        mMesh.material = new THREE.MeshBasicMaterial({
          color: s.type === 'levante' ? 0x6366f1 : 0x10b981,
          wireframe: true,
        })
        gEdificios.add(mMesh)
        return
      }

      if (s.code === 'VIA-ACC') return

      if (s.code === 'BIO-ARC') {
        // Arco de desinfección vehicular
        const arcoGrupo = new THREE.Group()
        arcoGrupo.position.set(s.x + s.w / 2, 0, s.y + s.h / 2)

        // Columnas laterales
        const colGeo = new THREE.BoxGeometry(0.8, 5, 0.8)
        const colIzq = new THREE.Mesh(colGeo, matMetalOscuro)
        colIzq.position.set(-3.5, 2.5, 0)
        const colDer = new THREE.Mesh(colGeo, matMetalOscuro)
        colDer.position.set(3.5, 2.5, 0)

        // Travesaño superior con boquillas
        const travGeo = new THREE.BoxGeometry(8, 0.6, 0.8)
        const trav = new THREE.Mesh(travGeo, matMetalOscuro)
        trav.position.set(0, 5, 0)

        // Tejadillo de policarbonato
        const tejGeo = new THREE.BoxGeometry(9, 0.1, 3.5)
        const tej = new THREE.Mesh(tejGeo, matVidrio)
        tej.position.set(0, 5.3, 0)

        // Letrero
        const letGeo = new THREE.BoxGeometry(7, 0.8, 0.1)
        const letrero = new THREE.Mesh(letGeo, matMuroBlanco)
        letrero.position.set(0, 4.4, 0.45)

        arcoGrupo.add(colIzq, colDer, trav, tej, letrero)
        gEdificios.add(arcoGrupo)
        return
      }

      if (s.code === 'SILO-CEN') {
        // Silos centrales
        const posX = s.x + s.w / 2
        const posZ = s.y + s.h / 2
        crearBateriaSilos(gSilos, posX, posZ, 3)
        return
      }

      if (s.code === 'TANQ-AGUA') {
        // Tanques de agua
        const tGeo = new THREE.CylinderGeometry(2.4, 2.4, 4.5, 24)
        const tanque = new THREE.Mesh(tGeo, matAgua)
        tanque.position.set(s.x + s.w / 2, 2.25, s.y + s.h / 2)
        tanque.castShadow = true
        gEdificios.add(tanque)
        return
      }

      // Edificios administrativos / bodega estándar
      const hEdif = s.code === 'BOD-ALM' ? 4.5 : 3.2
      const edifGrupo = new THREE.Group()
      edifGrupo.position.set(s.x + s.w / 2, 0, s.y + s.h / 2)

      const cuerpoGeo = new THREE.BoxGeometry(s.w, hEdif, s.h)
      const cuerpo = new THREE.Mesh(cuerpoGeo, matMuroBlanco)
      cuerpo.position.y = hEdif / 2
      cuerpo.castShadow = true
      cuerpo.receiveShadow = true

      // Techo a 2 aguas para edificios
      const techoGeo = new THREE.ConeGeometry(Math.max(s.w, s.h) * 0.75, 1.4, 4)
      techoGeo.rotateY(Math.PI / 4)
      const techo = new THREE.Mesh(techoGeo, matTechoGalpon)
      techo.position.y = hEdif + 0.7
      techo.scale.set(s.w / (Math.max(s.w, s.h) * 0.75), 1, s.h / (Math.max(s.w, s.h) * 0.75))

      edifGrupo.add(cuerpo, techo)
      gEdificios.add(edifGrupo)
    })

    // ── 5. BATERÍA DE SILOS AUXILIAR ─────────────────────────────────────────
    function crearBateriaSilos(padre, x, z, cantidad) {
      for (let i = 0; i < cantidad; i++) {
        const siloGrupo = new THREE.Group()
        siloGrupo.position.set(x + (i - (cantidad - 1) / 2) * 3.8, 0, z)

        // Cuerpo cilíndrico
        const radio = 1.4
        const alto = 5.5
        const cuerpoGeo = new THREE.CylinderGeometry(radio, radio, alto, 24)
        const cuerpo = new THREE.Mesh(cuerpoGeo, matSilo)
        cuerpo.position.y = 2.0 + alto / 2
        cuerpo.castShadow = true

        // Cono superior
        const conoGeo = new THREE.ConeGeometry(radio, 1.4, 24)
        const cono = new THREE.Mesh(conoGeo, matSilo)
        cono.position.y = 2.0 + alto + 0.7
        cono.castShadow = true

        // Tolva cónica inferior
        const tolvaGeo = new THREE.ConeGeometry(radio, 1.5, 24)
        tolvaGeo.rotateX(Math.PI)
        const tolva = new THREE.Mesh(tolvaGeo, matSilo)
        tolva.position.y = 1.35
        tolva.castShadow = true

        // Patas de soporte
        for (let j = 0; j < 4; j++) {
          const pataGeo = new THREE.CylinderGeometry(0.08, 0.08, 2.1, 8)
          const pata = new THREE.Mesh(pataGeo, matMetalOscuro)
          const ang = (j / 4) * Math.PI * 2
          pata.position.set(Math.cos(ang) * 1.2, 1.05, Math.sin(ang) * 1.2)
          siloGrupo.add(pata)
        }

        siloGrupo.add(cuerpo, cono, tolva)
        padre.add(siloGrupo)
      }
    }

    // ── 6. CONSTRUCCIÓN DETALLADA DE GALPONES (2 PISOS) ─────────────────────
    galponRooms.forEach((g) => {
      const galponGrupo = new THREE.Group()
      galponGrupo.name = `galpon_${g.code}`
      galponGrupo.userData = { room: g }
      galponGrupo.position.set(g.x + g.w / 2, 0, g.y + g.h / 2)

      const esLevante = g.type === 'levante'
      const colAcento = esLevante ? 0x6366f1 : 0x10b981
      const matAcento = new THREE.MeshLambertMaterial({ color: colAcento })

      const gw = g.w
      const gh = g.h
      const hP1 = 2.4
      const hP2 = 2.4
      const hTotal = hP1 + hP2

      // Zócalo de concreto inferior
      const zocaloGeo = new THREE.BoxGeometry(gw, 0.45, gh)
      const zocalo = new THREE.Mesh(zocaloGeo, matMuroGris)
      zocalo.position.y = 0.225
      zocalo.castShadow = true
      zocalo.receiveShadow = true
      galponGrupo.add(zocalo)

      // Columnas y pórticos estructurales
      const pasosX = 5
      const pasosZ = 6
      for (let ix = 0; ix <= pasosX; ix++) {
        for (let iz = 0; iz <= pasosZ; iz++) {
          if (ix === 0 || ix === pasosX || iz === 0 || iz === pasosZ) {
            const colGeo = new THREE.CylinderGeometry(0.12, 0.12, hTotal, 8)
            const col = new THREE.Mesh(colGeo, matMetalOscuro)
            col.position.set(
              -gw / 2 + (ix / pasosX) * gw,
              hTotal / 2 + 0.225,
              -gh / 2 + (iz / pasosZ) * gh
            )
            col.castShadow = true
            galponGrupo.add(col)
          }
        }
      }

      // Fachada frontal y posterior (cerradas en bloque / lámina aislada)
      const testeroGeo = new THREE.BoxGeometry(gw, hTotal, 0.25)
      const testeroNorte = new THREE.Mesh(testeroGeo, matMuroBlanco)
      testeroNorte.position.set(0, hTotal / 2 + 0.225, -gh / 2)
      testeroNorte.castShadow = true
      galponGrupo.add(testeroNorte)

      const testeroSur = new THREE.Mesh(testeroGeo, matMuroBlanco)
      testeroSur.position.set(0, hTotal / 2 + 0.225, gh / 2)
      testeroSur.castShadow = true
      galponGrupo.add(testeroSur)

      // Cortinas laterales Piso 1 y Piso 2
      // Piso 1 cortina
      const cortGeo = new THREE.BoxGeometry(0.1, hP1 - 0.5, gh - 0.5)
      const cortP1Izq = new THREE.Mesh(cortGeo, matCortinaP1)
      cortP1Izq.position.set(-gw / 2, 0.45 + (hP1 - 0.5) / 2, 0)
      const cortP1Der = new THREE.Mesh(cortGeo, matCortinaP1)
      cortP1Der.position.set(gw / 2, 0.45 + (hP1 - 0.5) / 2, 0)
      galponGrupo.add(cortP1Izq, cortP1Der)

      // Losa intermedia entre Piso 1 y Piso 2
      const losaGeo = new THREE.BoxGeometry(gw + 0.4, 0.2, gh + 0.2)
      const losa = new THREE.Mesh(losaGeo, matMuroGris)
      losa.position.y = 0.45 + hP1
      losa.castShadow = true
      galponGrupo.add(losa)

      // Piso 2 cortina
      const cortP2Izq = new THREE.Mesh(cortGeo, matCortinaP2)
      cortP2Izq.position.set(-gw / 2, 0.45 + hP1 + 0.2 + (hP2 - 0.5) / 2, 0)
      const cortP2Der = new THREE.Mesh(cortGeo, matCortinaP2)
      cortP2Der.position.set(gw / 2, 0.45 + hP1 + 0.2 + (hP2 - 0.5) / 2, 0)
      galponGrupo.add(cortP2Izq, cortP2Der)

      // Malla anti-pájaros encima de las cortinas
      const mallaGeo = new THREE.BoxGeometry(0.05, 0.5, gh - 0.5)
      const mallaP1I = new THREE.Mesh(mallaGeo, matMalla)
      mallaP1I.position.set(-gw / 2, 0.45 + hP1 - 0.25, 0)
      const mallaP1D = new THREE.Mesh(mallaGeo, matMalla)
      mallaP1D.position.set(gw / 2, 0.45 + hP1 - 0.25, 0)
      galponGrupo.add(mallaP1I, mallaP1D)

      // Techo a 2 aguas con cumbrera
      const faldonAncho = gw / 2 + 0.6
      const faldonLargo = gh + 0.8
      const inclinacion = Math.atan2(1.4, gw / 2)

      const alaGeo = new THREE.BoxGeometry(faldonAncho, 0.08, faldonLargo)
      const alaIzq = new THREE.Mesh(alaGeo, matTechoGalpon)
      alaIzq.position.set(-faldonAncho / 2 + 0.1, hTotal + 0.45 + 0.7, 0)
      alaIzq.rotation.z = inclinacion
      alaIzq.castShadow = true

      const alaDer = new THREE.Mesh(alaGeo, matTechoGalpon)
      alaDer.position.set(faldonAncho / 2 - 0.1, hTotal + 0.45 + 0.7, 0)
      alaDer.rotation.z = -inclinacion
      alaDer.castShadow = true

      galponGrupo.add(alaIzq, alaDer)

      // Cumbrera central de ventilación
      const cumbGeo = new THREE.BoxGeometry(1.2, 0.06, faldonLargo)
      const cumb = new THREE.Mesh(cumbGeo, matAcento)
      cumb.position.set(0, hTotal + 0.45 + 1.45, 0)
      galponGrupo.add(cumb)

      // Ventiladores de túnel en la pared trasera
      for (let vf = 0; vf < 4; vf++) {
        const vGeo = new THREE.CylinderGeometry(0.7, 0.7, 0.35, 16)
        vGeo.rotateX(Math.PI / 2)
        const fan = new THREE.Mesh(vGeo, matMetalOscuro)
        fan.position.set(-gw / 2 + 3.5 + vf * 5.5, 1.8, gh / 2 + 0.15)
        galponGrupo.add(fan)
      }

      // Paneles de enfriamiento (cooling pads) en la pared frontal
      const padGeo = new THREE.BoxGeometry(gw - 4, 1.8, 0.3)
      const pad = new THREE.Mesh(padGeo, matMadera)
      pad.position.set(0, 1.8, -gh / 2 - 0.12)
      galponGrupo.add(pad)

      // Silo de concentrado propio de este galpón
      const siloGalp = new THREE.Group()
      siloGalp.position.set(gw / 2 + 2.5, 0, -gh / 2 + 4)
      const rS = 1.2
      const hS = 4.2
      const sCpo = new THREE.Mesh(new THREE.CylinderGeometry(rS, rS, hS, 20), matSilo)
      sCpo.position.y = 1.8 + hS / 2
      sCpo.castShadow = true
      const sTop = new THREE.Mesh(new THREE.ConeGeometry(rS, 1.2, 20), matSilo)
      sTop.position.y = 1.8 + hS + 0.6
      const sBot = new THREE.Mesh(new THREE.ConeGeometry(rS, 1.3, 20), matSilo)
      sBot.rotateX(Math.PI)
      sBot.position.y = 1.2
      siloGalp.add(sCpo, sTop, sBot)

      // Tubo de alimentación hacia el galpón
      const tuboGeo = new THREE.CylinderGeometry(0.08, 0.08, 3.2, 8)
      tuboGeo.rotateZ(Math.PI / 3)
      const tuboSilo = new THREE.Mesh(tuboGeo, matMetal)
      tuboSilo.position.set(-1.2, 1.2, 0)
      siloGalp.add(tuboSilo)

      galponGrupo.add(siloGalp)

      // Escalera exterior de acceso al Piso 2
      const escGrupo = new THREE.Group()
      escGrupo.position.set(-gw / 2 - 1.2, 0, -gh / 2 + 3)
      const numPel = 12
      for (let p = 0; p < numPel; p++) {
        const pelGeo = new THREE.BoxGeometry(1.0, 0.05, 0.3)
        const pel = new THREE.Mesh(pelGeo, matMetalOscuro)
        pel.position.set(0, 0.2 + (p / numPel) * (hP1 + 0.4), (p / numPel) * 3.2)
        escGrupo.add(pel)
      }
      galponGrupo.add(escGrupo)

      // Letrero identificador en fachada frontal
      const letGeo = new THREE.BoxGeometry(6, 1.1, 0.1)
      const letMesh = new THREE.Mesh(letGeo, matAcento)
      letMesh.position.set(0, hTotal + 0.1, -gh / 2 - 0.2)
      galponGrupo.add(letMesh)

      gGalpones.add(galponGrupo)
    })

    // ── 7. CERCAS Y VEGETACIÓN ──────────────────────────────────────────────
    // Cerca perimetral
    for (let cx = -10; cx <= 150; cx += 8) {
      const posteGeo = new THREE.CylinderGeometry(0.08, 0.08, 1.6, 6)
      const posteN = new THREE.Mesh(posteGeo, matMadera)
      posteN.position.set(cx, 0.8, -15)
      const posteS = new THREE.Mesh(posteGeo, matMadera)
      posteS.position.set(cx, 0.8, 115)
      gCercas.add(posteN, posteS)
    }

    // Árboles rurales
    for (let a = 0; a < 28; a++) {
      const arbGrupo = new THREE.Group()
      const ax = -15 + Math.random() * 170
      const az = Math.random() > 0.5 ? -10 - Math.random() * 25 : 105 + Math.random() * 25
      arbGrupo.position.set(ax, 0, az)

      const troncoGeo = new THREE.CylinderGeometry(0.2, 0.35, 3.2, 8)
      const tronco = new THREE.Mesh(troncoGeo, matMadera)
      tronco.position.y = 1.6
      tronco.castShadow = true

      const copaGeo = new THREE.DodecahedronGeometry(2.4 + Math.random() * 1.2, 1)
      const copa = new THREE.Mesh(copaGeo, Math.random() > 0.5 ? matFollaje : matFollajeOscuro)
      copa.position.y = 4.2
      copa.castShadow = true

      arbGrupo.add(tronco, copa)
      gVegetacion.add(arbGrupo)
    }

    return {
      raiz,
      galpones: gGalpones,
      edificios: gEdificios,
      luces: gLuces,
      terreno: gTerreno,
    }
  }

  global.construirGranja = construirGranja
})(window)
