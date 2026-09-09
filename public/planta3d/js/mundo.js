/* =============================================================================
 * mundo.js — construye la planta en 3D a partir de las medidas reales.
 *
 * Sistema de coordenadas:
 *   plano IncubApp (x, y en metros)  →  3D (X = x, Z = y, Y = altura)
 *   Norte del plano = −Z.
 *
 * Todo lo que se dibuja aquí está a escala 1:1 en metros.
 * =============================================================================
 */
(function (global) {
  'use strict'

  const GROSOR_MURO = 0.18   // espesor de muro (m)
  const ANCHO_VANO = 1.7     // ancho libre de puerta (m)
  const ALTO_PUERTA = 2.15   // puerta peatonal (m)
  // Corrediza y paso de carros. Venía en 2,9, que es EXACTAMENTE la altura del
  // muro: los veinticuatro vanos de este tipo iban de piso a techo y el muro se
  // quedaba sin dintel. 2,3 deja pasar un carro cargado de bandejas y conserva
  // medio metro largo de muro por encima.
  const ALTO_PORTON = 2.3

  // Puerta de carga de muelle. Medidas tomadas de las fotos de la planta
  // (muelle despacho y muelle subproducto): el vano es mucho más ancho que una
  // corrediza y arranca sobre una plataforma de concreto a la altura de la
  // batea del camión, con su franja amarilla y sus topes de caucho.
  const ANCHO_VANO_CARGA = 2.6
  const ALTO_PORTON_CARGA = 2.8
  // Ventanas de vidrio hacia el pasillo. A diferencia de una puerta, el hueco
  // no arranca del piso: queda el antepecho debajo. El ancho viene en la propia
  // ventana (`w`), porque las de los comedores son de 2 m y el resto de 1.
  const ANCHO_VENTANA = 1
  const ALTO_VENTANA = 1
  const ANTEPECHO = 1
  // El ancho propio (`w`) manda sobre el del tipo, y sirve para cualquier vano:
  // las ventanas de los comedores son de 2 m y las puertillas de acceso al
  // plenum, de 0,6.
  const anchoVano = (d) =>
    d.w ? d.w
      : d.type === 'window' ? ANCHO_VENTANA
      : d.type === 'loading' ? ANCHO_VANO_CARGA
      : ANCHO_VANO
  // `base` es la altura a la que arranca el hueco y `h` lo que mide de alto.
  // Una ventana normal arranca en el antepecho; con base 0 y el alto del muro,
  // el mismo mecanismo da una PARED de vidrio entera.
  const baseVano = (d) =>
    d.base != null ? d.base : d.type === 'window' ? ANTEPECHO : 0
  const altoVano = (d) => {
    if (d.h) return baseVano(d) + d.h
    if (d.type === 'window') return ANTEPECHO + ALTO_VENTANA
    if (d.type === 'loading') return ALTO_PORTON_CARGA
    // Un paso de carros mide lo mismo abra como abra: la altura la manda lo que
    // tiene que pasar por el, no si la hoja gira o corre. Las batientes de 1,60
    // se quedaban en la altura de una puerta de persona y las corredizas del
    // mismo ancho eran quince centimetros mas altas.
    if (anchoVano(d) >= 1.5) return ALTO_PORTON
    return ALTO_PUERTA
  }
  // Medido en planta: el piso interior queda 0.36 m sobre el terreno. En vez de
  // subir el edificio (que rompería el caminado, que asume piso en y=0) se baja
  // el terreno y se levanta un zócalo bajo cada sala, como el de bloque de las fotos.
  const NIVEL_TERRENO = -0.36
  const ALTO_MEDIA_CANA = 0.11   // guardaescoba sanitario (m)

  // Pantalla de control del equipo (m). Sobre ella se proyecta la última foto de ronda.
  const ANCHO_PANTALLA = 0.56
  const ALTO_PANTALLA = 0.40
  const cargadorTex = new THREE.TextureLoader()

  const round2 = (n) => Math.round(n * 100) / 100

  function tono(hex, f) {
    const c = new THREE.Color(hex)
    c.multiplyScalar(f)
    return c
  }

  /**
   * Construye toda la planta y devuelve las piezas que la app necesita.
   * `opciones.nivel`: 'ambos' (o ausente) muestra los dos niveles juntos, tal
   * como está construida; 1 o 2 aísla ese nivel. El cálculo de fondo (fusión
   * de muros, entrepiso, uniones de salas en L) sigue viendo TODAS las salas
   * — solo se filtra qué se dibuja al final — para que aislar un nivel no le
   * cambie la geometría al otro cuando se vuelve a ver "ambos".
   */
  function construirPlanta(datos, opciones) {
    const nivelFiltro = opciones?.nivel && opciones.nivel !== 'ambos' ? Number(opciones.nivel) : null
    const seVeNivel = (n) => nivelFiltro == null || nivelFiltro === n

    const raiz = new THREE.Group()
    raiz.name = 'planta'

    const gPisos = new THREE.Group(); gPisos.name = 'pisos'
    const gMuros = new THREE.Group(); gMuros.name = 'muros'
    const gPuertas = new THREE.Group(); gPuertas.name = 'puertas'
    const gEquipos = new THREE.Group(); gEquipos.name = 'equipos'
    const gTechos = new THREE.Group(); gTechos.name = 'techos'
    const gCielos = new THREE.Group(); gCielos.name = 'cielos'   // cielo raso de la planta baja
    // La losa del entrepiso va en su propio grupo: es el TECHO de la planta
    // baja pero el PISO del segundo nivel, y metida con los techos desaparecia
    // en cuanto se apagaban para poder mirar adentro — con lo que el nivel 2
    // quedaba flotando sobre el vacio.
    const gEntrepiso = new THREE.Group(); gEntrepiso.name = 'entrepiso'
    const gEtiquetas = new THREE.Group(); gEtiquetas.name = 'etiquetas'
    const gCotas = new THREE.Group(); gCotas.name = 'cotas'
    raiz.add(gPisos, gMuros, gPuertas, gEquipos, gTechos, gCielos, gEntrepiso, gEtiquetas, gCotas)
    // Asidero para inspeccionar la planta ya construida desde la consola:
    // contar vidrios, buscar una sala, medir un muro. No lo usa el recorrido.
    globalThis.__PLANTA3D = { raiz, gPisos, gMuros, gPuertas, gEquipos, gTechos, segmentos: null, puertas: null, colisiones: null, losa: null, rampas: null }

    const colisiones = []            // AABB {x0,x1,z0,z1} para caminar
    const trozosLosa = []            // suelo del entrepiso, para caminar por el
    // Suelo PISABLE del segundo nivel, cada trozo con su cota. Va aparte de
    // `trozosLosa` porque son cosas distintas: la losa se dibuja por sala de la
    // planta baja y solo donde esa sala la carga, mientras que arriba se camina
    // por donde hay sala de nivel 2. Mientras el caminante se guio solo por la
    // losa, el entrepiso se veia entero pero se cruzaba por un 2,7 % de su
    // superficie: en el resto se pisaba suelo dibujado y se caia a la planta
    // baja. Aqui entran el piso del area tecnica y el de los cuartos de
    // maquinas de incubadoras, que cuelgan un metro.
    const suelosNivel2 = []
    const rampas = []                // tramos de escalera: por ahi se cambia de nivel
    const seleccionables = []        // meshes con userData para el raycaster
    const salasPorId = new Map()
    const salasPorCodigo = new Map()

    // ── Límites reales de la planta ────────────────────────────────────────
    let minX = Infinity, minZ = Infinity, maxX = -Infinity, maxZ = -Infinity
    datos.rooms.forEach((r) => {
      minX = Math.min(minX, r.x); minZ = Math.min(minZ, r.y)
      maxX = Math.max(maxX, r.x + r.w); maxZ = Math.max(maxZ, r.y + r.h)
    })
    const limites = { minX, minZ, maxX, maxZ, ancho: round2(maxX - minX), largo: round2(maxZ - minZ) }
    limites.cx = (minX + maxX) / 2
    limites.cz = (minZ + maxZ) / 2

    // El predio y el edificio no miden lo mismo: los corredores exteriores y la
    // plataforma de chillers están dibujados pero quedan fuera del muro. Las
    // cotas generales tienen que medir el edificio —lo que se comparó contra
    // los 91,5 m que se midieron en sitio—, no el predio.
    let eMinX = Infinity, eMinZ = Infinity, eMaxX = -Infinity, eMaxZ = -Infinity
    datos.rooms.forEach((r) => {
      if (r.exterior || r.type === 'plenum') return
      eMinX = Math.min(eMinX, r.x); eMinZ = Math.min(eMinZ, r.y)
      eMaxX = Math.max(eMaxX, r.x + r.w); eMaxZ = Math.max(eMaxZ, r.y + r.h)
    })
    const edificio = {
      minX: eMinX, minZ: eMinZ, maxX: eMaxX, maxZ: eMaxZ,
      ancho: round2(eMaxX - eMinX), largo: round2(eMaxZ - eMinZ),
      cx: (eMinX + eMaxX) / 2, cz: (eMinZ + eMaxZ) / 2,
    }

    // Cota a la que se apoya una sala. El nivel 2 vive sobre el entrepiso, asi
    // que su piso, sus muros y su techo arrancan de ahi y no del suelo.
    const NIVEL2 = 2
    const esNivel2 = (r) => Number(r.nivel) === NIVEL2

    // Cuarto de máquinas (nacedoras o incubadoras): no se apoya en el
    // entrepiso, CUELGA de él — baja 1 m para toparse con el equipo, así que
    // su "cota" es la del entrepiso MENOS esa caída. Se detecta por nombre
    // («CUARTO DE MAQUINAS…»), igual que ya se hace con baños/filtros/
    // oficinas para amoblarlos: es más liviano que agregar un campo nuevo al
    // esquema solo para esto. Las de incubadoras («…INC…») además llevan el
    // muro hasta la cubierta (ver `subeAlTecho`), las de nacedoras no.
    const CAIDA_CUARTO_MAQUINAS = 1
    const esCuartoMaquinas = (r) => /^CUARTO DE M[AÁ]QUINAS/i.test((r.name || '').trim())
    const esCuartoMaquinasIncubadoras = (r) => esCuartoMaquinas(r) && /INC/i.test(r.name)
    // Los túneles de aire del área técnica. Los de las incubadoras cuelgan como
    // los cuartos de máquinas —bajan el mismo metro hasta topar con el equipo—
    // pero desde ahí levantan su propia altura, así que asoman por encima del
    // entrepiso como un ducto corrido. Los de las nacedoras sí se apoyan en el
    // piso del nivel 2.
    const esTunel = (r) => /^T[UÚ]NEL\s/i.test((r.name || '').trim())
    // Un hueco de escalera: sube desde la planta baja hasta el piso del segundo
    // nivel que tenga encima. Se reconoce por el nombre para que Henry pueda
    // moverla y redimensionarla desde el plano, sin tocar codigo.
    const esEscalera = (r) => /^ESCALERA\b/i.test((r.name || '').trim())
    const esTunelIncubadoras = (r) => esTunel(r) && /INCUBADORAS/i.test(r.name)
    const cuelgaDelEntrepiso = (r) => esCuartoMaquinas(r) || esTunelIncubadoras(r)
    const cotaDe = (r) => {
      if (!esNivel2(r)) return 0
      const base = datos.meta.alturaEntrepiso || 0
      return cuelgaDelEntrepiso(r) ? base - CAIDA_CUARTO_MAQUINAS : base
    }

    // ── Cubierta a dos aguas, asimetrica ───────────────────────────────────
    // La nave no es de altura constante ni sube por igual a los dos lados:
    // arranca en 5,60 contra la fachada de atras —la del norte, la del ala de
    // incubadoras—, sube hasta 7,40 en la cumbrera del medio y baja hasta 2,90
    // contra la del frente, la de la oficina. Las tres cotas son internas y se
    // miden desde el piso de la planta. `alturaBajoCubierta` da la altura libre
    // en cualquier punto, y de ella cuelga todo lo demas.
    const ALERO_FRENTE = datos.meta.alturaMuro
    const ALERO_ATRAS = datos.meta.alturaMuroAtras || ALERO_FRENTE
    const CUMBRERA = datos.meta.alturaCumbrera || ALERO_FRENTE
    // Las dos fachadas vienen declaradas en el plano, no de los limites de las
    // salas: una sala suelta fuera de sitio corria la cumbrera y descuadraba el
    // techo de toda la nave.
    const Z_ATRAS = datos.meta.fachadaAtrasY ?? edificio.minZ
    const Z_FRENTE = datos.meta.fachadaFrenteY ?? edificio.maxZ
    const Z_CUMBRERA = (Z_ATRAS + Z_FRENTE) / 2
    const alturaBajoCubierta = (z) => {
      if (z <= Z_CUMBRERA) {
        const t = (z - Z_ATRAS) / Math.max(0.01, Z_CUMBRERA - Z_ATRAS)
        return ALERO_ATRAS + (CUMBRERA - ALERO_ATRAS) * Math.min(1, Math.max(0, t))
      }
      const t = (z - Z_CUMBRERA) / Math.max(0.01, Z_FRENTE - Z_CUMBRERA)
      return CUMBRERA + (ALERO_FRENTE - CUMBRERA) * Math.min(1, Math.max(0, t))
    }

    // Entrepiso del segundo nivel: cubre el ala de incubadoras hacia atras y
    // deja fuera el pasillo de zona sucia, los filtros y todo lo que va de ahi
    // hacia el frente hasta la oficina.
    const ENTREPISO = datos.meta.alturaEntrepiso || 0
    // Un pasillo tambien tiene entrepiso encima: lo que decide es la zona, no
    // si la sala levanta tabiques.
    // Las salas del ala vienen enumeradas: el ala no es un rectangulo —el cuarto
    // frio y la recepcion de huevos bajan mas que el resto— y cualquier corte
    // por coordenada dejaba fuera unas o metia otras que no van.
    const CON_ENTREPISO = new Set(datos.meta.entrepisoSalas || [])
    const llevaEntrepiso = (r) =>
      ENTREPISO > 0 && !r.exterior && CON_ENTREPISO.has(r.code)

    // Que muros suben hasta la cubierta y cuales se quedan en su altura.
    //
    // Solo sube el tabique que tiene segundo nivel encima: es el que carga y
    // cierra el entrepiso. Donde no lo hay, el tabique se queda en 2,90 y la
    // nave vuela por encima, que es como esta construida. Los banos tampoco
    // suben aunque caigan dentro del ala del segundo nivel: son cubiculos, no
    // llegan al techo.
    const esBano = (r) => /^\s*W\.?C\.?\s*$/i.test(r.name || '')

    // La planta es de ambiente controlado: su envolvente cierra hasta la
    // cubierta, no puede quedar abierta por encima de los muros. Un muro es de
    // fachada cuando por ese lado no tiene ninguna sala del edificio enfrente.
    const delEdificio = datos.rooms.filter((o) => !o.exterior)
    const LADO_A_EJE = { arriba: 'n', abajo: 's', izquierda: 'o', derecha: 'e' }
    const esFachada = (r, lado) => {
      if (r.exterior) return false
      const e = LADO_A_EJE[lado]
      return !delEdificio.some((o) => {
        if (o.id === r.id) return false
        if (e === 'n') return Math.abs(o.y + o.h - r.y) < 0.25 && o.x < r.x + r.w - 0.2 && o.x + o.w > r.x + 0.2
        if (e === 's') return Math.abs(o.y - (r.y + r.h)) < 0.25 && o.x < r.x + r.w - 0.2 && o.x + o.w > r.x + 0.2
        if (e === 'o') return Math.abs(o.x + o.w - r.x) < 0.25 && o.y < r.y + r.h - 0.2 && o.y + o.h > r.y + 0.2
        return Math.abs(o.x - (r.x + r.w)) < 0.25 && o.y < r.y + r.h - 0.2 && o.y + o.h > r.y + 0.2
      })
    }
    // La sala que hay al otro lado de un vano, si la hay. Se prefiere la que
    // queda justo enfrente del hueco; si ninguna lo cubre, la que comparta el
    // muro. Devuelve null cuando ese lado da al exterior.
    const vecinaDeVano = (r, lado, desde, hasta) => {
      const e = LADO_A_EJE[lado]
      const h = e === 'n' || e === 's'
      let mejor = null
      for (const o of datos.rooms) {
        if (o.id === r.id) continue
        if ((Number(o.nivel) || 1) !== (Number(r.nivel) || 1)) continue
        const pega =
          e === 'n' ? Math.abs(o.y + o.h - r.y) < 0.3
          : e === 's' ? Math.abs(o.y - (r.y + r.h)) < 0.3
          : e === 'o' ? Math.abs(o.x + o.w - r.x) < 0.3
          : Math.abs(o.x - (r.x + r.w)) < 0.3
        if (!pega) continue
        const ini = h ? Math.max(r.x, o.x) : Math.max(r.y, o.y)
        const fin = h ? Math.min(r.x + r.w, o.x + o.w) : Math.min(r.y + r.h, o.y + o.h)
        if (fin - ini < 0.3) continue
        if (fin > desde + 0.05 && ini < hasta - 0.05) return o
        if (!mejor) mejor = o
      }
      return mejor
    }

    // ── Hacia dónde abre cada hoja ─────────────────────────────────────────
    // Hasta ahora TODAS giraban hacia la misma cara del muro, la de coordenada
    // menor, mirase lo que mirase al otro lado: había hojas barriendo el paso
    // de un pasillo y escotillas de 70 cm que abrían hacia dentro de un cuarto
    // de máquinas de 1 m de alto, donde no cabe ni la hoja.
    //
    // El signo dice por qué cara del muro se estaciona: +1 la de coordenada
    // mayor, −1 la menor. `dentro` es la cara donde está la sala del vano.
    const sinMuro = (o) => (datos.tiposSala[o.type] || {}).muro === false
    const caraDeLaSala = (lado) => (lado === 'arriba' || lado === 'izquierda') ? 1 : -1
    const haciaDondeAbre = (v) => {
      const r = v.sala
      const dentro = caraDeLaSala(v.lado)
      // Sentido escrito a mano desde el editor 2D (`abre` del vano). Manda
      // sobre todas las reglas de abajo y, además, deja la hoja FIJA: el
      // repaso que voltea hojas midiendo estorbos la respeta. Las reglas
      // aciertan casi siempre, pero no lo ven todo —la puerta del área técnica
      // da a la escalera, que no es una sala, y por eso la trataban como salida
      // al exterior y la abrían sobre el hueco.
      if (v.abreManual === 'adentro') return dentro
      if (v.abreManual === 'afuera') return -dentro
      const vec = vecinaDeVano(r, v.lado, v.c - v.ancho / 2, v.c + v.ancho / 2)

      // 1. Espacio confinado —cuarto de máquinas, túnel—: la hoja no cabe
      //    dentro, y de todos modos se abre desde fuera para entrar a él.
      const confinado = (o) => esCuartoMaquinas(o) || esTunel(o)
      if (confinado(r)) return -dentro
      if (vec && confinado(vec)) return dentro

      // 2. W.C.: un cubículo de 1 × 2 m no admite la hoja por dentro.
      if (esBano(r)) return -dentro
      if (vec && esBano(vec)) return dentro

      // 3. Puerta al exterior: abre hacia afuera, en el sentido de la salida.
      if (!vec || vec.exterior) return -dentro
      if (r.exterior) return dentro

      // 4. Contra un pasillo: la hoja abierta no puede quedarse en el paso.
      if (sinMuro(vec) && !sinMuro(r)) return dentro
      if (sinMuro(r) && !sinMuro(vec)) return -dentro

      // 5. Entre dos salas cerradas: hacia la más amplia, que es la que tiene
      //    sitio para recibirla.
      return vec.w * vec.h > r.w * r.h ? -dentro : dentro
    }

    // Los tramos de un lado que NO tienen ninguna sala del edificio enfrente.
    // `esFachada` responde por el lado ENTERO, y a un muro le basta con que una
    // sala le tape la mitad para dejar de contarse como fachada: el resto se
    // quedaba sin subir. Le pasaba al muro oeste de la oficina, que la
    // recepcion de huevos tapa hasta z=27,9 y de ahi al frente da a la calle:
    // cinco metros abiertos entre 2,90 y la cubierta.
    const tramosSinVecina = (r, lado) => {
      if (r.exterior) return []
      const e = LADO_A_EJE[lado]
      const h = e === 'n' || e === 's'
      const a0 = h ? r.x : r.y, a1 = h ? r.x + r.w : r.y + r.h
      const cubierto = []
      for (const o of delEdificio) {
        if (o.id === r.id) continue
        const pega =
          e === 'n' ? Math.abs(o.y + o.h - r.y) < 0.25
          : e === 's' ? Math.abs(o.y - (r.y + r.h)) < 0.25
          : e === 'o' ? Math.abs(o.x + o.w - r.x) < 0.25
          : Math.abs(o.x - (r.x + r.w)) < 0.25
        if (!pega) continue
        const b0 = h ? o.x : o.y, b1 = h ? o.x + o.w : o.y + o.h
        if (Math.min(a1, b1) - Math.max(a0, b0) > 0.2) cubierto.push([Math.max(a0, b0), Math.min(a1, b1)])
      }
      cubierto.sort((p, q) => p[0] - q[0])
      const libres = []
      let cur = a0
      for (const [p, q] of cubierto) { if (p > cur + 0.05) libres.push([cur, p]); cur = Math.max(cur, q) }
      if (cur < a1 - 0.05) libres.push([cur, a1])
      return libres
    }

    // Hasta dónde remata cada muro por encima de su tabique: 'techo' llega a
    // la cubierta, 'entrepiso' se detiene en el piso del segundo nivel (mismo
    // material, sin seguir de largo), null no remata nada.
    //
    // Un muro que CARGA el entrepiso cierra contra el piso del segundo nivel y
    // ahí se detiene, sea de fachada o no: de la losa para arriba ya cierra el
    // muro del nivel 2 —o su contorno, que se levanta justo en el borde de la
    // losa, que es donde cae ese muro—. Mandaba antes la regla de fachada, y
    // por eso el cuarto frío, que da al corredor exterior por el sur, subía a
    // escalones siguiendo el faldón cuando en la planta real sus cuatro muros
    // mueren en la losa. Donde NO hay entrepiso detrás, la fachada sí sube de
    // corrido hasta la cubierta, que es lo que cierra la nave por los 360°.
    // Los baños no rematan aunque caigan dentro del ala: son
    // cubiculos. El cuarto de máquinas de las incubadoras tampoco es cubículo:
    // a diferencia del de las nacedoras, sus paredes siguen de largo hasta la
    // cubierta —esa es la única diferencia entre los dos, así que la regla de
    // fachada se descarta para AMBOS (una sala angosta metida dentro de otra
    // más grande, como estas, no comparte ningún borde con nadie y la regla
    // de fachada la marcaría entera como si no tuviera vecinos por ningún
    // lado).
    // Salones del segundo nivel: los cuartos que se dibujan arriba, SIN contar
    // los tuneles ni los cuartos de maquinas, que llevan muro propio. Su forma
    // no la dan muros independientes: la dan los mismos muros del nivel 1, que
    // siguen de largo hasta la cubierta por donde cae su perimetro.
    const salonesArriba = () => datos.rooms.filter((o) =>
      Number(o.nivel) === NIVEL2 && !esCuartoMaquinas(o) && !esTunel(o))

    // Tramos de un lado que quedan justo debajo del perimetro de uno de esos
    // salones. Se compara contra las aristas de su contorno, asi que un salon
    // de forma libre se respeta tal cual.
    const tramosBajoSalon = (r, eje, pos, a, b) => {
      const TOL = 0.3
      const out = []
      for (const o of salonesArriba()) {
        for (const ar of aristasDe(o)) {
          if (ar.eje !== eje || Math.abs(ar.pos - pos) > TOL) continue
          const p = Math.max(a, ar.a), q = Math.min(b, ar.b)
          if (q - p > 0.3) out.push([p, q])
        }
      }
      out.sort((x, y) => x[0] - y[0])
      const fus = []
      for (const [p, q] of out) {
        const u = fus[fus.length - 1]
        if (u && p <= u[1] + 0.05) u[1] = Math.max(u[1], q)
        else fus.push([p, q])
      }
      return fus
    }

    // Cara inferior de la losa del entrepiso: los 10 cm que mide la losa por
    // debajo de su piso. Contra ella mueren los muros internos.
    const SOFITO = ENTREPISO > 0 ? ENTREPISO - 0.1 : 0

    const remateHasta = (r, lado) => {
      // Un W.C. es un cubiculo y muere donde acaba su tabique... salvo que ESE
      // lado sea fachada. Los dos W.C. del comedor de zona limpia se apoyan en
      // el muro de poniente, y en cuanto el comedor se recorto alrededor de
      // ellos pasaron a ser quienes cierran ahi: con el remate en null quedaba
      // un boquete de 2 m abierto entre el cubiculo y la cubierta.
      if (esBano(r)) return esFachada(r, lado) ? 'techo' : null
      if (esCuartoMaquinasIncubadoras(r)) return 'techo'
      if (esCuartoMaquinas(r) || esTunel(r)) return null
      // Un muro que CARGA el entrepiso muere en la losa aunque sea fachada, y
      // ahi se detiene: por encima ya cierra el contorno del segundo nivel. Es
      // la misma regla que ya aplicaba el reparto por tramos de mas abajo, pero
      // el remate del lado seguia diciendo 'techo' y ganaba: el sobremuro corria
      // entero hasta la cumbrera, tambien por delante de las puertas del nivel
      // 2, y tapiaba el desembarco de la escalera al area tecnica.
      //
      // Ojo: cargar la losa no basta. `entrepisoSalas` es una lista de salas
      // enteras y la losa sobra por los bordes —sobre la recepcion de huevos no
      // hay nada arriba—, asi que ahi no hay volumen que siga cerrando y el
      // muro tiene que subir el mismo o queda un boquete de fachada entre la
      // losa y el faldon.
      if (llevaEntrepiso(r) && hayNivel2Sobre(r) && hayNivel2SobreLado(r, lado)) return 'entrepiso'
      // Un muro que da a la calle por su otra cara sube hasta la cubierta: es
      // la envolvente. Todos los demas —los internos— mueren en la cara
      // inferior de la losa, a 3,30, tengan o no entrepiso encima. Antes solo
      // subian los que lo cargaban y el resto se quedaba en 2,90.
      if (esFachada(r, lado)) return 'techo'
      return 'entrepiso'
    }
    const RANGO_REMATE = { techo: 2, entrepiso: 1 }
    const masAlto = (a, b) => (RANGO_REMATE[b] || 0) > (RANGO_REMATE[a] || 0) ? b : a

    // ── Terreno ────────────────────────────────────────────────────────────
    const terreno = new THREE.Mesh(
      new THREE.PlaneGeometry(600, 600),
      new THREE.MeshStandardMaterial({ color: 0x1e2a1b, roughness: 1 })
    )
    terreno.rotation.x = -Math.PI / 2
    terreno.position.set(limites.cx, NIVEL_TERRENO - 0.05, limites.cz)
    terreno.receiveShadow = true
    raiz.add(terreno)

    const explanada = new THREE.Mesh(
      new THREE.PlaneGeometry(limites.ancho + 26, limites.largo + 26),
      new THREE.MeshStandardMaterial({ color: 0x323944, roughness: 0.95 })
    )
    explanada.rotation.x = -Math.PI / 2
    explanada.position.set(limites.cx, NIVEL_TERRENO - 0.02, limites.cz)
    explanada.receiveShadow = true
    raiz.add(explanada)

    // ── Pisos por sala (las más pequeñas se dibujan encima) ────────────────
    const geoZocalo = new THREE.BoxGeometry(1, 1, 1)
    const matZocalo = new THREE.MeshStandardMaterial({ color: 0x8b8f96, roughness: 0.95, metalness: 0.02 })
    // ── Salas de forma libre ───────────────────────────────────────────────
    // El editor 2D deja dibujar el contorno a mano y lo guarda en `puntos`, en
    // coordenadas locales. Solo lo usaba el plenum: una sala con muro levantaba
    // su rectangulo envolvente y se comia el recorte —la de transferencia
    // esquiva el pasillo del tunel y la de vacunacion esquiva lavado
    // nacimiento—. Estos tres helpers lo resuelven en un solo sitio.
    const esLibre = (r) => Array.isArray(r.puntos) && r.puntos.length > 2
    const contornoDe = (r) => {
      const p = r.puntos.map((q) => ({ x: r.x + q.x, z: r.y + q.y }))
      // el editor cierra el anillo repitiendo el primer punto: sobra
      const n = p.length
      if (n > 1 && Math.abs(p[0].x - p[n - 1].x) < 0.001 && Math.abs(p[0].z - p[n - 1].z) < 0.001) p.pop()
      return p
    }
    // Tramos de muro, con el nombre del lado al que pertenece cada uno. Los
    // tramos INTERIORES del recorte no llevan nombre: ahi no cuelga ninguna
    // puerta y nunca son fachada, por definicion.
    const aristasDe = (r) => {
      const x0 = r.x, x1 = r.x + r.w, z0 = r.y, z1 = r.y + r.h
      if (!esLibre(r)) return [
        { nombre: 'arriba', eje: 'h', pos: z0, a: x0, b: x1 },
        { nombre: 'abajo', eje: 'h', pos: z1, a: x0, b: x1 },
        { nombre: 'izquierda', eje: 'v', pos: x0, a: z0, b: z1 },
        { nombre: 'derecha', eje: 'v', pos: x1, a: z0, b: z1 },
      ]
      const p = contornoDe(r), out = []
      for (let i = 0; i < p.length; i++) {
        const A = p[i], B = p[(i + 1) % p.length]
        if (Math.abs(A.z - B.z) < 0.02 && Math.abs(A.x - B.x) > 0.02) {
          const pos = (A.z + B.z) / 2
          out.push({ eje: 'h', pos, a: Math.min(A.x, B.x), b: Math.max(A.x, B.x),
            nombre: Math.abs(pos - z0) < 0.02 ? 'arriba' : Math.abs(pos - z1) < 0.02 ? 'abajo' : null })
        } else if (Math.abs(A.x - B.x) < 0.02 && Math.abs(A.z - B.z) > 0.02) {
          const pos = (A.x + B.x) / 2
          out.push({ eje: 'v', pos, a: Math.min(A.z, B.z), b: Math.max(A.z, B.z),
            nombre: Math.abs(pos - x0) < 0.02 ? 'izquierda' : Math.abs(pos - x1) < 0.02 ? 'derecha' : null })
        }
      }
      return out
    }
    // El contorno partido en rectángulos, para poder cruzarlo con la losa, que
    // se dibuja por rectángulos. Barrido por las x de sus aristas verticales:
    // en cada franja se mira dónde corta una vertical a las aristas
    // horizontales y los cortes se emparejan de dos en dos. Vale para cualquier
    // contorno ortogonal, que es lo único que dibuja el editor 2D.
    const rectangulosDe = (r) => {
      if (!esLibre(r)) return [{ x0: r.x, x1: r.x + r.w, z0: r.y, z1: r.y + r.h }]
      const p = contornoDe(r)
      const xs = [...new Set(p.map((q) => round2(q.x)))].sort((a, b) => a - b)
      const out = []
      for (let i = 0; i < xs.length - 1; i++) {
        const xa = xs[i], xb = xs[i + 1]
        if (xb - xa < 0.02) continue
        const xm = (xa + xb) / 2
        const cortes = []
        for (let k = 0; k < p.length; k++) {
          const A = p[k], B = p[(k + 1) % p.length]
          if (Math.abs(A.z - B.z) > 0.02) continue
          if (Math.min(A.x, B.x) < xm && Math.max(A.x, B.x) > xm) cortes.push(A.z)
        }
        cortes.sort((a, b) => a - b)
        for (let k = 0; k + 1 < cortes.length; k += 2) {
          if (cortes[k + 1] - cortes[k] < 0.02) continue
          out.push({ x0: xa, x1: xb, z0: cortes[k], z1: cortes[k + 1] })
        }
      }
      return out
    }
    // La huella del segundo nivel, en rectangulos, calculada una sola vez.
    let _rectsNivel2 = null
    const rectsNivel2 = () => (_rectsNivel2 ||= datos.rooms.filter(esNivel2).flatMap(rectangulosDe))
    // ¿Hay piso de segundo nivel sobre esta sala? Se muestrea su huella en vez
    // de sumar areas: los tuneles caen DENTRO de los cuartos de maquinas y al
    // sumarlas el solape daba mas del 100 %.
    const hayNivel2Sobre = (r) => {
      const rr = rectsNivel2()
      let dentro = 0, tot = 0
      for (let x = r.x + 0.25; x < r.x + r.w; x += 0.5) {
        for (let z = r.y + 0.25; z < r.y + r.h; z += 0.5) {
          tot++
          if (rr.some((u) => x > u.x0 && x < u.x1 && z > u.z0 && z < u.z1)) dentro++
        }
      }
      return tot === 0 || dentro > tot * 0.5
    }
    // ¿Y hay piso de segundo nivel sobre ESTE LADO? Por sala entera no basta:
    // el PASILLO S25 va de x 6 a x 33 y el area tecnica arranca en x 12, asi
    // que su punta de poniente asoma fuera de la losa aunque el 78 % de la sala
    // si la tenga encima. Decidido por sala, ese muro de fachada moria a 3,40 y
    // dejaba un boquete de 1,50 m abierto hasta la cubierta — el que se veia
    // desde el corredor exterior de zona limpia.
    const hayNivel2SobreLado = (r, lado) => {
      const rr = rectsNivel2()
      const d = 0.25
      const puntos = []
      if (lado === 'arriba' || lado === 'abajo') {
        const z = lado === 'arriba' ? r.y + d : r.y + r.h - d
        for (let x = r.x + d; x < r.x + r.w; x += 0.5) puntos.push([x, z])
      } else {
        const x = lado === 'izquierda' ? r.x + d : r.x + r.w - d
        for (let z = r.y + d; z < r.y + r.h; z += 0.5) puntos.push([x, z])
      }
      if (!puntos.length) return true
      const dentro = puntos.filter(([x, z]) =>
        rr.some((u) => x > u.x0 && x < u.x1 && z > u.z0 && z < u.z1)).length
      return dentro > puntos.length * 0.5
    }
    const areaDe = (r) => {
      if (!esLibre(r)) return r.w * r.h
      const p = contornoDe(r)
      let s2 = 0
      for (let i = 0; i < p.length; i++) { const q = p[(i + 1) % p.length]; s2 += p[i].x * q.z - q.x * p[i].z }
      return Math.abs(s2 / 2)
    }
    // Contorno como THREE.Shape, ya en coordenadas del mundo. La forma se dibuja
    // en XY y se acuesta con rotateX(-PI/2), que manda la Y a -Z: por eso se
    // construye con la z del mundo cambiada de signo.
    /** ¿Cae este punto dentro del contorno de la sala? */
    const enContorno = (r, x, z) => {
      const p = contornoDe(r)
      let dentro = false
      for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
        if ((p[i].z > z) !== (p[j].z > z) &&
            x < ((p[j].x - p[i].x) * (z - p[i].z)) / (p[j].z - p[i].z) + p[i].x) dentro = !dentro
      }
      return dentro
    }
    const formaDe = (r) => {
      const p = contornoDe(r)
      const f = new THREE.Shape()
      p.forEach((q, i) => (i === 0 ? f.moveTo(q.x, -q.z) : f.lineTo(q.x, -q.z)))
      f.closePath()
      // Los cuartos de maquinas CUELGAN por debajo del piso del segundo nivel:
      // donde cae uno, ese piso se agujerea. Sin esto el piso del area tecnica
      // pasaba por encima de los cuatro fosos de las nacedoras y los tapaba
      // justo desde donde se miran — desde arriba, que es como se ven en la
      // planta: canaletas abiertas con su motor y su variador dentro.
      // Un cuarto de maquinas si recibe el hueco de una escalera —hay que
      // salir por algun lado al llegar arriba— aunque el no agujeree a nadie.
      if (esNivel2(r) && !esTunel(r)) {
        datos.rooms.filter((o) => esCuartoMaquinas(o) || esEscalera(o)).forEach((o) => {
          if (o.id === r.id) return
          if (esCuartoMaquinas(r) && !esEscalera(o)) return
          if (!enContorno(r, o.x + o.w / 2, o.y + o.h / 2)) return
          // Dos centimetros adentro por cada lado. Un agujero que COMPARTE
          // arista con el contorno es degenerado y el triangulador lo descarta
          // sin avisar: la escalera pega contra el muro oriental de su sala y
          // el hueco no salia. Con 5 mm ya no coinciden y el labio no se ve.
          const m = 0.005
          const hx0 = o.x + m, hx1 = o.x + o.w - m
          const hz0 = o.y + m, hz1 = o.y + o.h - m
          const h = new THREE.Path()
          h.moveTo(hx0, -hz0)
          h.lineTo(hx1, -hz0)
          h.lineTo(hx1, -hz1)
          h.lineTo(hx0, -hz1)
          h.closePath()
          f.holes.push(h)
        })
      }
      return f
    }

    // El piso de cada sala se pintaba con un material nuevo: 75 materiales para
    // 11 combinaciones reales de (¿lleva muro?, color). El color depende solo de
    // esas dos entradas, asi que se reparten. La clave lleva el booleano ademas
    // del color porque el mismo cian da gris claro mezclado sobre 0x8e8f8c y
    // gris azulado sobre 0x4a5058: con la clave solo por color, salas del color
    // equivocado. Las mallas siguen siendo 75 —cada piso es el blanco del
    // raycast de su sala—, lo que se ahorra son cambios de estado por cuadro,
    // tambien en la pasada de sombras.
    const matsPiso = new Map()
    const materialPiso = (conMuro, color) => {
      const clave = (conMuro ? 'M' : 'x') + color
      if (!matsPiso.has(clave)) {
        matsPiso.set(clave, new THREE.MeshStandardMaterial({
          // Concreto gris con un dejo del color del tipo de sala: se ve como el
          // piso real sin perder la lectura por zonas desde la vista cenital.
          color: new THREE.Color(conMuro ? 0x8e8f8c : 0x4a5058)
            .lerp(new THREE.Color(color), conMuro ? 0.22 : 0.35),
          roughness: 0.88,
          metalness: 0.02,
        }))
      }
      return matsPiso.get(clave)
    }

    const porArea = datos.rooms.slice().sort((a, b) => b.w * b.h - a.w * a.h)
    porArea.forEach((r, i) => {
      const cat = datos.tiposSala[r.type] || datos.tiposSala.other
      const color = r.color || cat.color
      r._cat = cat
      r._color = color
      r._centro = { x: r.x + r.w / 2, z: r.y + r.h / 2 }
      r._area = round2(areaDe(r))

      // El plenum es un vacío técnico que cuelga del cielo raso de su sala
      // anfitriona (parteDe): no tiene piso propio ni zócalo, no se camina ni
      // se selecciona en el listado. Se levanta aparte, más abajo, una vez se
      // conocen las alturas de todas las salas (la suya depende de la de su
      // anfitriona).
      if (r.type === 'plenum') return

      // Aislar un nivel no le cambia la geometría al otro: solo deja de
      // dibujar su piso/zócalo. `salasPorId`/`salasPorCodigo` se registran
      // igual, porque una sala del nivel oculto puede seguir haciendo falta
      // (anfitriona de un plenum, pieza de una sala en L, etc.).
      salasPorId.set(r.id, r)
      salasPorCodigo.set(r.code, r)
      if (!seVeNivel(esNivel2(r) ? 2 : 1)) return

      // El piso sigue el contorno real: en una sala de forma libre, el
      // rectangulo se metia dentro de la vecina por el recorte.
      const geoPiso = esLibre(r)
        ? (() => { const g = new THREE.ShapeGeometry(formaDe(r)); g.rotateX(-Math.PI / 2); return g })()
        : new THREE.PlaneGeometry(r.w, r.h)
      const piso = new THREE.Mesh(geoPiso, materialPiso(cat.muro, color))
      // La geometria libre ya viene en coordenadas del mundo y acostada.
      if (!esLibre(r)) {
        piso.rotation.x = -Math.PI / 2
        piso.position.set(r.x + r.w / 2, cotaDe(r) + 0.004 + i * 0.0016, r.y + r.h / 2)
      } else {
        piso.position.set(0, cotaDe(r) + 0.004 + i * 0.0016, 0)
      }
      piso.receiveShadow = true
      piso.userData = { tipo: 'sala', sala: r }
      gPisos.add(piso)
      seleccionables.push(piso)

      // Zócalo: la losa sobre la que se para la sala, del piso al terreno.
      // El zocalo es la losa sobre la que se para la sala contra el terreno: solo
      // tiene sentido en la planta baja. Una sala del segundo nivel esta a 2,40
      // o 3,40 y le quedaba un zocalo suelto enterrado bajo el piso — diez, uno
      // por cada cuarto de maquinas y cada tunel.
      const zocalo = cotaDe(r) > 0.01 ? null : esLibre(r)
        ? (() => {
            const g = new THREE.ExtrudeGeometry(formaDe(r), { depth: -NIVEL_TERRENO, bevelEnabled: false })
            g.rotateX(-Math.PI / 2)
            g.translate(0, NIVEL_TERRENO, 0)
            return new THREE.Mesh(g, matZocalo)
          })()
        : new THREE.Mesh(geoZocalo, matZocalo)
      if (zocalo) {
        if (!esLibre(r)) {
          zocalo.position.set(r.x + r.w / 2, NIVEL_TERRENO / 2, r.y + r.h / 2)
          zocalo.scale.set(r.w, -NIVEL_TERRENO, r.h)
        }
        zocalo.receiveShadow = true
        zocalo.castShadow = true
        gPisos.add(zocalo)
      }

      r._yPiso = piso.position.y
    })

    // Altura efectiva de una sala: la que traiga el plano, si no la de su tipo.
    // `r.altura` permite cuartos más bajos que el estándar (p. ej. la cava del huevo, 2.2 m).
    const alturaDe = (r) =>
      esCuartoMaquinas(r) ? CAIDA_CUARTO_MAQUINAS : (r.altura || r._cat.altura || datos.meta.alturaMuro)

    // ── Muros: se recogen los 4 lados de cada sala y se fusionan los compartidos
    const segmentos = new Map()

    const ORDEN_LADOS = ['arriba', 'abajo', 'izquierda', 'derecha']
    const LADOS_VALIDOS = new Set(ORDEN_LADOS)
    const EJE_LADO = { arriba: 'H', abajo: 'H', izquierda: 'V', derecha: 'V' }

    // ¿En cuál de los 4 muros va la puerta? En el plano 2D la puerta es un glifo
    // de 1.6 m que se arrastra libremente, así que el muro no viene dado: se
    // deduce de la posición. Con 56 de las 67 puertas eso basta, porque quedan
    // pegadas a un solo muro. Pero 10 caen justo en una ESQUINA, con dos muros
    // empatados a distancia 0, y ahí desempatar por un orden fijo ponía la
    // puerta en el muro equivocado. Para esas manda `rot`, que es la única
    // señal que distingue: 0/180 = puerta horizontal (muro de arriba o abajo),
    // 90/270 = vertical (izquierda o derecha).
    const ladoDePuerta = (r, d) => {
      // Si el vano trae escrito su muro, manda y no se deduce nada. El muro es
      // un dato del plano, no una consecuencia de cuánto mida la sala: mientras
      // se dedujo por distancia, bastaba con reescalar una sala para que una
      // puerta se pasara sola al muro de al lado. Le pasó a la del pasillo de
      // la oficina, que terminó dando contra nacedoras 4.
      if (d.lado && LADOS_VALIDOS.has(d.lado)) return d.lado

      // Se mide con el ancho propio del vano cuando lo trae. Sin esto, una
      // puertilla de 0,6 pegada al muro izquierdo daba distancia NEGATIVA por
      // abajo —porque restaba 1,6 de una sala de 4,2— y se colgaba del muro
      // equivocado. Las puertas sin `w` conservan el 1,6 de siempre para no
      // mover ninguna de las que ya están puestas.
      const ancho = d.w ?? 1.6
      const dist = {
        arriba: d.y,
        abajo: r.h - ancho - d.y,
        izquierda: d.x,
        derecha: r.w - ancho - d.x,
      }
      const m = Math.min(dist.arriba, dist.abajo, dist.izquierda, dist.derecha)
      const empatados = ORDEN_LADOS.filter((l) => Math.abs(dist[l] - m) < 0.05)
      if (empatados.length === 1) return empatados[0]

      const q = ((Math.round((Number(d.rot) || 0) / 90) * 90) % 360 + 360) % 360
      const ejeDeRot = q === 0 || q === 180 ? 'H' : 'V'
      const porRot = empatados.filter((l) => (EJE_LADO[l] === ejeDeRot))
      return porRot[0] || empatados[0]
    }

    // Vanos de salas que no levantan muros (los pasillos y corredores). Su
    // puerta tiene que abrirse en el muro del VECINO, que es el que sí existe;
    // si no, la puerta queda registrada contra un muro que nunca se dibuja y no
    // se ve nada. Pasaba con las dos del túnel, entre otras.
    const vanosSueltos = []
    const puertas = []   // hojas animadas: se abren al acercarse

    datos.rooms.forEach((r) => {
      const cat = r._cat
      if (!cat.muro) {
        const cotaVano = cotaDe(r)
        ;(r.doors || []).forEach((d) => {
          const lado = ladoDePuerta(r, d)
          const horiz = lado === 'arriba' || lado === 'abajo'
          const pos = lado === 'arriba' ? r.y : lado === 'abajo' ? r.y + r.h
                    : lado === 'izquierda' ? r.x : r.x + r.w
          const vano = {
            eje: horiz ? 'h' : 'v',
            pos,
            // El centro es el borde más MEDIO ancho del propio vano: una
            // ventana de 1 m no se centra con la media puerta de 0,8.
            c: (horiz ? r.x + d.x : r.y + d.y) + anchoVano(d) / 2,
            ancho: anchoVano(d),
            // El vano sin puerta se abre a la altura del portón: son pasos de
            // máquina entre salas, no puertas de persona.
            alto: altoVano(d),
            base: baseVano(d),
            tipo: d.type,
            cristal: !!d.cristal,
            rejilla: !!d.rejilla,
            lado,
            sala: r,
            abreManual: d.abre || null,
            // La cota del pasillo al que pertenece la puerta: es lo que decide
            // en qué muro puede abrirse, porque el mismo plano puede llevar un
            // tramo en la planta baja y otro en el segundo nivel.
            cota: cotaVano,
          }
          vano.abre = haciaDondeAbre(vano)
          vanosSueltos.push(vano)

          // Una puerta implica un muro. Entre dos pasillos no hay ninguno —
          // ambos se levantan sin muros— así que el vano no tenía dónde
          // abrirse y la puerta no se veía. Cuando el lado de un pasillo lleva
          // puerta se levanta ese muro, que además es lo correcto: son los
          // límites entre zona limpia, zona sucia y oficinas.
          //
          // El muro que ya exista tiene que estar A LA MISMA COTA. Un cuarto
          // del segundo nivel puede caer justo encima del pasillo —el túnel de
          // nacedoras 2 se apoya sobre el muro sur del PASILLO S23— y sin
          // comparar la cota ese muro de arriba pasaba por «ya hay», el de la
          // planta baja no se levantaba, y el pasillo quedaba tapiado.
          const yaHay = [...segmentos.values()].some(
            (g) => g.eje === vano.eje && Math.abs(g.pos - pos) < 0.06 &&
                   Math.abs((g.cota || 0) - cotaVano) < 0.06 &&
                   g.a < vano.c - 0.1 && g.b > vano.c + 0.1
          )
          if (!yaHay) {
            let s2 = horiz
              ? { eje: 'h', pos, a: r.x, b: r.x + r.w }
              : { eje: 'v', pos, a: r.y, b: r.y + r.h }
            // En una sala de forma libre el muro que la puerta obliga a levantar
            // NO cruza todo el rectángulo envolvente: solo el tramo del CONTORNO
            // donde está el vano. El plenum de las nacedoras es una L —una
            // franja detrás de la hilera y una pata por el costado— y su
            // envolvente son los 12 m del salón: se plantaba un muro de once
            // metros por delante de las máquinas y al entrar no se veía una sola
            // nacedora, solo la puertilla del plenum.
            if (esLibre(r)) {
              const arista = aristasDe(r).find((z) =>
                z.eje === s2.eje && Math.abs(z.pos - pos) < 0.06 &&
                vano.c > z.a - 0.12 && vano.c < z.b + 0.12)
              if (arista) s2 = { eje: s2.eje, pos, a: arista.a, b: arista.b }
            }
            // Nunca por encima de la cubierta. Un tabique del segundo nivel
            // arranca a 3,40 y con los 2,90 de rigor remata en 6,30, muy por
            // encima del faldón: hacia la fachada del frente la cubierta va
            // bajando y ahí el muro salía por el tejado. La altura libre no es
            // constante, así que en un muro vertical manda el extremo más bajo
            // —la cubierta es una carpa de una sola cumbrera, su mínimo sobre
            // un tramo siempre cae en una punta.
            const libre = horiz
              ? alturaBajoCubierta(pos) - cotaVano
              : Math.min(alturaBajoCubierta(s2.a), alturaBajoCubierta(s2.b)) - cotaVano
            const altoMuro = Math.max(0.05, Math.min(datos.meta.alturaMuro, libre))
            // Y el vano tampoco pasa de ahí — la misma regla que ya rige en las
            // salas con muro. Si no, el dintel se dibuja por encima del muro que
            // lo lleva y vuelve a salir por el tejado. Se recorta el vano MISMO,
            // no una copia: el reparto de vanos sueltos de más abajo reconoce
            // por identidad los que ya están colocados, y con una copia volvía a
            // colgar una segunda hoja en el mismo agujero.
            vano.alto = Math.min(vano.alto, altoMuro - 0.05)
            segmentos.set(`p${r.code}|${lado}`, {
              ...s2, alto: altoMuro, color: r._color, proyectada: false, cota: cotaVano,
              vanos: [vano],
            })
          }
        })
        return
      }
      const alto = alturaDe(r)

      // Tramos de muro: los cuatro lados del rectangulo, o las aristas del
      // contorno si la sala es de forma libre.
      const aristas = aristasDe(r)

      // En una sala de forma libre el `lado` que trae la puerta no sirve: el
      // editor 2D lo calcula contra el RECTANGULO ENVOLVENTE, y el muro real
      // puede estar metros adentro. La puerta del área técnica —el desembarco
      // de la escalera— venía marcada 'abajo', o sea el borde del envolvente en
      // z=28, cuando el contorno por ahí va por z=23,5: se quedaba sin arista
      // donde abrirse y no se dibujaba. Para esas salas manda la geometría: se
      // busca la arista del contorno más cercana al punto de la puerta.
      const ladoDeArista = (s) =>
        s.eje === 'h'
          ? (s.pos > r.y + r.h / 2 ? 'abajo' : 'arriba')
          : (s.pos > r.x + r.w / 2 ? 'derecha' : 'izquierda')
      const aristaCercana = (d) => {
        // El muro que trae ESCRITO el vano manda sobre la distancia. Recortar
        // una sala le hace nacer aristas nuevas: al recortar el comedor de zona
        // limpia alrededor de sus dos W.C. le apareció un tabique vertical a
        // medio metro de su puerta, más cerca que su propio muro del sur, y la
        // puerta se pasó sola a él — el comedor se quedó sin un solo acceso.
        // Solo si el lado declarado no tiene ninguna arista en rango se cae a la
        // búsqueda por pura distancia, que es para lo que se escribió esto.
        const buscar = (soloDelLado) => {
          let mejor = -1, dMin = Infinity
          aristas.forEach((s, i) => {
            if (soloDelLado && ladoDeArista(s) !== soloDelLado) return
            const horiz = s.eje === 'h'
            const along = horiz ? r.x + d.x : r.y + d.y
            if (along < s.a - 0.6 || along > s.b + 0.6) return
            const dist = Math.abs((horiz ? r.y + d.y : r.x + d.x) - s.pos)
            if (dist < dMin) { dMin = dist; mejor = i }
          })
          return mejor
        }
        const conLado = LADOS_VALIDOS.has(d.lado) ? buscar(d.lado) : -1
        return conLado >= 0 ? conLado : buscar(null)
      }
      const vanos = { arriba: [], abajo: [], izquierda: [], derecha: [] }
      const vanosPorArista = new Map()
      ;(r.doors || []).forEach((d) => {
        const iCerca = esLibre(r) ? aristaCercana(d) : -1
        // El nombre del lado sigue haciendo falta para saber hacia dónde abre la
        // hoja: se saca de a qué lado del centro de la sala cae esa arista.
        const lado = iCerca < 0 ? ladoDePuerta(r, d)
          : aristas[iCerca].eje === 'h'
            ? (aristas[iCerca].pos > r.y + r.h / 2 ? 'abajo' : 'arriba')
            : (aristas[iCerca].pos > r.x + r.w / 2 ? 'derecha' : 'izquierda')
        const centro = (lado === 'arriba' || lado === 'abajo' ? r.x + d.x : r.y + d.y) + anchoVano(d) / 2
        const vano = {
          c: centro,
          ancho: anchoVano(d),
          // Nunca más alto que el muro que lo lleva. Los cuartos de máquinas
          // miden 1 m de alto y sus escotillas venían del editor con el alto
          // de una puerta de persona: el hueco atravesaba la losa del
          // entrepiso y se veía el boquete desde arriba.
          alto: Math.min(altoVano(d), alto),
          base: Math.min(baseVano(d), Math.max(0, alto - 0.2)),
          tipo: d.type,
          cristal: !!d.cristal,
          rejilla: !!d.rejilla,
          lado,
          sala: r,
          abreManual: d.abre || null,
        }
        vano.abre = haciaDondeAbre(vano)
        if (iCerca >= 0) {
          if (!vanosPorArista.has(iCerca)) vanosPorArista.set(iCerca, [])
          vanosPorArista.get(iCerca).push(vano)
        } else vanos[lado].push(vano)
      })

      aristas.forEach((s, iArista) => {
        const nombre = s.nombre
        s.proyectada = !!r.proyectada
        // La cota entra en la clave. Sin ella, una sala de la planta baja y una
        // del segundo nivel con EXACTAMENTE el mismo tramo de muro caian en el
        // mismo registro, y el `Math.max` de mas abajo levantaba la cota del
        // conjunto: la fachada de atras de los dos salones de incubadoras
        // —cincuenta metros— arrancaba a 2,40 m del suelo, porque los cuartos
        // de maquinas de encima tienen su mismo ancho exacto.
        const clave = `${s.eje}|${round2(s.pos)}|${round2(s.a)}|${round2(s.b)}|${round2(cotaDe(r))}`
        // Altura manual del muro (herramienta del editor 2D): ausente/null es
        // la regla automática de siempre; 'techo' fuerza el sobremuro hasta la
        // cubierta aunque la regla no lo haría; un número fija el tabique en
        // esa cifra y sin sobremuro, así el editor manda sobre la regla.
        const manual = nombre ? (r.wallHeights || {})[nombre] : null
        // Y por encima de la cubierta no pasa ninguno. En la planta baja no se
        // nota nunca —el faldón más bajo mide justo los 2,90 del muro estándar—
        // pero apoyados en el entrepiso esos mismos 2,90 rematan en 6,30 y
        // salían por el tejado a lo largo de todo el frente del área técnica.
        // La cubierta es una carpa de una sola cumbrera, así que sobre un tramo
        // su punto más bajo cae siempre en una de las dos puntas.
        const libreLado = (s.eje === 'h'
          ? alturaBajoCubierta(s.pos)
          : Math.min(alturaBajoCubierta(s.a), alturaBajoCubierta(s.b))) - cotaDe(r)
        const altoLado = Math.max(0.05, Math.min(
          typeof manual === 'number' ? manual : alto,
          libreLado
        ))
        let reg = segmentos.get(clave)
        if (!reg) {
          reg = { eje: s.eje, pos: s.pos, a: s.a, b: s.b, alto: altoLado, color: r._color, vanos: [], proyectada: s.proyectada, sube: false, subeHasta: null, cota: cotaDe(r) }
          segmentos.set(clave, reg)
        }
        // Una arista INTERIOR del recorte no tiene lado al que pertenecer, y
        // tampoco puede ser fachada: remata como cualquier muro interior.
        const subeHastaLado = manual === 'techo' ? 'techo'
          : typeof manual === 'number' ? null
          : nombre ? remateHasta(r, nombre)
          : (esBano(r) || esCuartoMaquinas(r) || esTunel(r) ? null : (llevaEntrepiso(r) ? 'entrepiso' : null))
        reg.alto = Math.max(reg.alto, altoLado)
        // Basta con que una de las dos salas que comparten el muro pida
        // remate (o pida "hasta la cubierta" a mano): ese muro es el que lo
        // cierra por ese lado. Si una pide techo y la otra solo entrepiso,
        // gana techo — el muro entero tiene que quedar cerrado por completo.
        reg.subeHasta = masAlto(reg.subeHasta, subeHastaLado)
        reg.sube = reg.sube || !!subeHastaLado
        reg.cota = Math.max(reg.cota || 0, cotaDe(r))
        reg.proyectada = reg.proyectada && s.proyectada
        // En forma libre el vano ya sabe su arista exacta, por geometría.
        if (vanosPorArista.has(iArista)) reg.vanos.push(...vanosPorArista.get(iArista))
        // Cada vano va al TRAMO que lo contiene: un lado partido por el recorte
        // son varias aristas, y meter todos sus vanos en cada una los repetiria.
        else if (nombre) {
          const mios = vanos[nombre].filter((v) => v.c > s.a - 0.02 && v.c < s.b + 0.02)
          // Si un vano no cae en ninguna arista de su lado —puede pasar si la
          // puerta quedo sobre el recorte—, se le da a la mas larga del lado.
          const sueltos = iArista === aristas.findIndex((z) => z.nombre === nombre)
            ? vanos[nombre].filter((v) => !aristas.some((z) => z.nombre === nombre && v.c > z.a - 0.02 && v.c < z.b + 0.02))
            : []
          reg.vanos.push(...mios, ...sueltos)
        }

        // Si el lado esta a medias —parte con sala enfrente y parte contra la
        // calle—, el trozo que da a la calle se registra aparte y sube hasta la
        // cubierta. Los dos tramos se pisan, y de eso ya se encarga el reparto
        // por bandas de mas abajo: gana el remate mas alto y los vanos se van
        // con el muro que se dibuja.
        // Y solo donde NO hay entrepiso: si la sala carga la losa, por encima
        // cierra el contorno del segundo nivel y este muro muere en ella —que
        // es como esta el cuarto frio en la planta real, con sus cuatro muros
        // a ras de losa aunque el del sur de a un corredor exterior.
        const rematable = !r.exterior && !esBano(r) && !esCuartoMaquinas(r) &&
          !esTunel(r) && !llevaEntrepiso(r)
        // Por donde cae el perimetro de un salon del segundo nivel, este mismo
        // muro sigue de largo hasta la cubierta: es el que da forma al salon de
        // arriba. Se registra aparte, como la fachada por tramos, y el reparto
        // por bandas de mas abajo resuelve el solape con el tramo de 3,30.
        if (cotaDe(r) === 0 && manual == null && !esBano(r)) {
          tramosBajoSalon(r, s.eje, s.pos, s.a, s.b).forEach(([p, q], t) => {
            segmentos.set(`salon2|${r.code}|${nombre || 'int'}|${iArista}|${t}`, {
              eje: s.eje, pos: s.pos, a: p, b: q, alto: altoLado, color: r._color,
              vanos: [], proyectada: s.proyectada, sube: true, subeHasta: 'techo', cota: 0,
            })
          })
        }

        if (nombre && rematable && subeHastaLado !== 'techo' && manual == null) {
          tramosSinVecina(r, nombre).forEach(([p, q], t) => {
            // Recortado a esta arista: en una sala de forma libre el lado del
            // rectangulo es mas largo que el muro que de verdad hay ahi.
            const p2 = Math.max(p, s.a), q2 = Math.min(q, s.b)
            if (q2 - p2 < 0.3) return
            segmentos.set(`fachada|${r.code}|${nombre}|${iArista}|${t}`, {
              eje: s.eje, pos: s.pos, a: p2, b: q2, alto: altoLado, color: r._color,
              vanos: [], proyectada: s.proyectada, sube: true, subeHasta: 'techo', cota: cotaDe(r),
            })
          })
        }
      })
    })

    // ── Cerrar la planta donde un pasillo interior da al exterior ─────────
    // Los pasillos se levantan sin muros a propósito, para poder caminarlos y
    // para que la vista aérea se lea. Pero cuando un pasillo INTERIOR termina
    // contra el andén exterior, ahí no queda nada y la planta se ve abierta por
    // ese costado, como si le faltara la fachada. Se cierra ese tramo: la
    // fachada existe, y el acceso a zona limpia es por los filtros, no por ahí.
    // Los corredores exteriores no entran en la regla — esos sí van abiertos.
    const esCorredorExterior = (r) => r.type === 'exterior' || /EXTERIOR/i.test(r.name)
    // El plenum tampoco es pasillo: no tiene muro (como un corredor) pero
    // tampoco es circulación que haya que cerrar contra la fachada — se
    // levanta aparte, colgado de su sala anfitriona.
    const esPasilloInterior = (r) => !r._cat.muro && !esCorredorExterior(r) && r.type !== 'plenum'
    const solapa = (a0, a1, b0, b1) => Math.min(a1, b1) - Math.max(a0, b0)

    datos.rooms.filter(esPasilloInterior).forEach((c) => {
      const lados = [
        { eje: 'h', pos: c.y,       a: c.x, b: c.x + c.w, rango: (o) => [o.x, o.x + o.w], toca: (o) => Math.abs(o.y + o.h - c.y) < 0.3 },
        { eje: 'h', pos: c.y + c.h, a: c.x, b: c.x + c.w, rango: (o) => [o.x, o.x + o.w], toca: (o) => Math.abs(o.y - (c.y + c.h)) < 0.3 },
        { eje: 'v', pos: c.x,       a: c.y, b: c.y + c.h, rango: (o) => [o.y, o.y + o.h], toca: (o) => Math.abs(o.x + o.w - c.x) < 0.3 },
        { eje: 'v', pos: c.x + c.w, a: c.y, b: c.y + c.h, rango: (o) => [o.y, o.y + o.h], toca: (o) => Math.abs(o.x - (c.x + c.w)) < 0.3 },
      ]
      lados.forEach((L) => {
        const cubierto = []
        datos.rooms.forEach((o) => {
          if (o === c) return
          // Solo cierra lo que esta en el mismo nivel. Un cuarto del segundo
          // nivel se superpone al pasillo en planta pero esta 2,40 m mas
          // arriba: contarlo dejaba medio metro de fachada sin muro en el
          // costado oeste, tapado «por» el cuarto de maquinas de incubadoras.
          if ((Number(o.nivel) || 1) !== (Number(c.nivel) || 1)) return
          if (!o._cat.muro && !esPasilloInterior(o)) return   // el andén exterior no cierra nada
          const dentro = L.toca(o) ||
            (o.x < c.x + c.w && o.x + o.w > c.x && o.y < c.y + c.h && o.y + o.h > c.y)
          if (!dentro) return
          const [p, q] = L.rango(o)
          if (solapa(L.a, L.b, p, q) > 0.05) cubierto.push([Math.max(L.a, p), Math.min(L.b, q)])
        })
        cubierto.sort((x, y) => x[0] - y[0])
        let cur = L.a
        const abiertos = []
        cubierto.forEach(([p, q]) => { if (p > cur + 0.05) abiertos.push([cur, p]); cur = Math.max(cur, q) })
        if (cur < L.b - 0.05) abiertos.push([cur, L.b])

        abiertos.filter(([p, q]) => q - p > 0.6).forEach(([p, q]) => {
          // Remata como cualquier otro muro de ese pasillo: si el pasillo
          // carga el entrepiso cierra contra la losa, y si no, sube hasta la
          // cubierta. Sin esto se quedaba en 2,90 y el contorno del segundo
          // nivel arranca en 3,40: quedaba un anillo de 50 cm abierto al
          // exterior en el costado oeste y en el sur del ala.
          const hasta = remateHasta(c, {
            n: 'arriba', s: 'abajo', o: 'izquierda', e: 'derecha',
          }[L.eje === 'h' ? (Math.abs(L.pos - c.y) < 0.05 ? 'n' : 's')
                          : (Math.abs(L.pos - c.x) < 0.05 ? 'o' : 'e')])
          segmentos.set(`cierre|${L.eje}|${round2(L.pos)}|${round2(p)}`, {
            eje: L.eje, pos: L.pos, a: p, b: q,
            alto: datos.meta.alturaMuro, color: c._color, vanos: [], proyectada: false,
            sube: !!hasta, subeHasta: hasta, cota: 0,
          })
        })
      })
    })

    // ── Salas en L: dos rectángulos que son una sola sala ─────────────────
    // El editor 2D solo dibuja rectángulos, así que una sala en L se carga como
    // dos piezas y la segunda trae `parteDe` con el id de la principal. El muro
    // que las separa no existe: se recoge aquí para descontarlo al dibujar.
    const uniones = []
    datos.rooms.forEach((r) => {
      // `parteDe` también enlaza el plenum con su anfitriona, pero ese no es
      // un muro que descontar: el plenum flota encima, no linda en el plano.
      if (!r.parteDe || r.type === 'plenum') return
      const g = salasPorId.get(r.parteDe)
      if (!g) return
      const ox = solapa(r.x, r.x + r.w, g.x, g.x + g.w)
      const oz = solapa(r.y, r.y + r.h, g.y, g.y + g.h)
      if (Math.abs(r.y + r.h - g.y) < 0.05 && ox > 0.05) uniones.push({ eje: 'h', pos: g.y, a: Math.max(r.x, g.x), b: Math.min(r.x + r.w, g.x + g.w) })
      else if (Math.abs(g.y + g.h - r.y) < 0.05 && ox > 0.05) uniones.push({ eje: 'h', pos: r.y, a: Math.max(r.x, g.x), b: Math.min(r.x + r.w, g.x + g.w) })
      else if (Math.abs(r.x + r.w - g.x) < 0.05 && oz > 0.05) uniones.push({ eje: 'v', pos: g.x, a: Math.max(r.y, g.y), b: Math.min(r.y + r.h, g.y + g.h) })
      else if (Math.abs(g.x + g.w - r.x) < 0.05 && oz > 0.05) uniones.push({ eje: 'v', pos: r.x, a: Math.max(r.y, g.y), b: Math.min(r.y + r.h, g.y + g.h) })
    })

    // ── Contorno de cada área ─────────────────────────────────────────────
    // Se dibuja aquí y no con el piso porque hay que descontar los tramos de
    // unión: una sala en L son dos rectángulos, y si cada uno traza su contorno
    // completo queda una línea cruzándola por la mitad y parece dos salas.
    datos.rooms.forEach((r) => {
      if (r.type === 'plenum') return // no tiene piso: su contorno no va aquí
      if (!seVeNivel(esNivel2(r) ? 2 : 1)) return
      // Las aristas del contorno real, no las del rectangulo envolvente.
      const lados = aristasDe(r)
      const pts = []
      lados.forEach((L) => {
        let tramos = [[L.a, L.b]]
        uniones
          .filter((u) => u.eje === L.eje && Math.abs(u.pos - L.pos) < 0.05)
          .forEach((u) => {
            tramos = tramos.flatMap(([a, b]) => {
              if (u.b <= a + 0.02 || u.a >= b - 0.02) return [[a, b]]
              const res = []
              if (u.a > a + 0.02) res.push([a, u.a])
              if (u.b < b - 0.02) res.push([u.b, b])
              return res
            })
          })
        tramos.forEach(([a, b]) => {
          if (b - a < 0.02) return
          if (L.eje === 'h') pts.push(a, 0, L.pos, b, 0, L.pos)
          else pts.push(L.pos, 0, a, L.pos, 0, b)
        })
      })
      if (!pts.length) return
      const geo = new THREE.BufferGeometry()
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3))
      const borde = new THREE.LineSegments(
        geo,
        new THREE.LineBasicMaterial({ color: new THREE.Color(r._color), transparent: true, opacity: 0.75 })
      )
      borde.position.y = (r._yPiso || 0) + 0.012
      gPisos.add(borde)
    })

    // ── Fusión de muros colineales ────────────────────────────────────────
    // Dos salas pueden compartir un tramo de muro sin compartir el lado entero:
    // pasa con los W.C., que son un recorte en la esquina de cada comedor y
    // repiten parte de su muro exterior. Sin fusionar quedaban dos paredes en el
    // mismo plano, una corta metida dentro de una larga. Se agrupan por eje y
    // posición, se unen los tramos que se solapan o se tocan, y se juntan sus
    // vanos: así el muro se levanta una sola vez y ninguna puerta se pierde.
    {
      // La clave incluye ALTURA y si es proyectado: dos muros colineales solo se
      // funden si son del mismo tipo de muro. Si no, el muro sur de la cava
      // —2.20 m y translúcido— se fundía con el de la sala vecina y salía a
      // 2.90 y opaco, o sea perdía las dos cosas que lo distinguen.
      const porPlano = new Map()
      for (const reg of segmentos.values()) {
        // `sube`/`subeHasta` entran en la clave: un plano puede cerrar el
        // segundo nivel en un tramo y no en el de al lado, y si se fundieran
        // subiria entero. Es lo que pasaba en el muro de recepcion de huevos,
        // que se levantaba a 5,90 arrastrado por el tramo del ala de
        // incubadoras. Y un tramo que remata contra el entrepiso no se puede
        // fundir con uno que remata contra la cubierta, aunque estén al ras:
        // son alturas de remate distintas aunque el tabique de abajo mida igual.
        const k = `${reg.eje}|${round2(reg.pos)}|${round2(reg.alto)}|${reg.proyectada ? 1 : 0}|${reg.sube ? 1 : 0}|${reg.subeHasta || ''}|${round2(reg.cota || 0)}`
        if (!porPlano.has(k)) porPlano.set(k, [])
        porPlano.get(k).push(reg)
      }
      segmentos.clear()
      let n = 0
      // (el registro final se expone mas abajo, para poder inspeccionarlo)
      for (const grupo of porPlano.values()) {
        grupo.sort((p, q) => p.a - q.a)
        let act = null
        for (const reg of grupo) {
          if (act && reg.a <= act.b + 0.05) {
            act.b = Math.max(act.b, reg.b)
            act.vanos.push(...reg.vanos)
          } else {
            act = { ...reg, vanos: [...reg.vanos] }
            segmentos.set(`f${n++}`, act)
          }
        }
      }
    }

    // Panel sándwich blanco, que es de lo que está hecha toda la planta.
    // Medianera entre una sala proyectada y una construida: el muro ya existe,
    // lo levanta la sala real. La cara proyectada sobraría y quedaría metida en
    // el mismo plano, así que se descarta. (Solo aplica si la real la cubre por
    // completo; si asoma, se conserva.)
    for (const [k, reg] of [...segmentos.entries()]) {
      if (!reg.proyectada) continue
      for (const otro of segmentos.values()) {
        if (otro === reg || otro.proyectada) continue
        if (otro.eje !== reg.eje || Math.abs(otro.pos - reg.pos) > 0.06) continue
        if (otro.a <= reg.a + 0.05 && otro.b >= reg.b - 0.05) {
          // Los vanos pasan al muro que se queda. Si no, la puerta declarada
          // sobre la cara proyectada se iba con ella: la cava del huevo llevaba
          // todo este tiempo sin su puertilla.
          otro.vanos.push(...reg.vanos)
          segmentos.delete(k)
          break
        }
      }
    }

    // ── Una sola cara por muro ─────────────────────────────────────────────
    // Cada sala declara su lado del muro. Cuando las dos caras rematan distinto
    // —una cierra contra el entrepiso o la cubierta y la otra no— la clave de
    // fusion las separa, y el mismo panel acaba dibujado dos veces: cuarenta
    // metros seguidos en el pasillo de atras y treinta en la fachada del
    // frente, con las dos caras peleandose el mismo plano.
    //
    // Manda el remate mas alto, que es el que de verdad cierra; a igualdad, el
    // primero. El que pierde cede el tramo compartido y conserva lo que le
    // sobresalga, que puede partirlo en dos. Los vanos siguen al panel que se
    // queda: la puerta tiene que estar en el muro que se dibuja.
    {
      const RANGO = { techo: 2, entrepiso: 1 }
      const rango = (r) => RANGO[r.subeHasta] || 0
      const antes = [...segmentos.entries()]
      const mismoPlano = (o, r) =>
        o.eje === r.eje && Math.abs(o.pos - r.pos) < 0.06 &&
        Math.abs((o.cota || 0) - (r.cota || 0)) < 0.06 &&
        Math.abs(o.alto - r.alto) < 0.06
      // Se calcula todo contra la foto de antes: el orden (rango, y a igualdad
      // la posicion en la lista) es un orden total, asi que nadie cede dos veces
      // el mismo tramo ni dos tramos se ceden el uno al otro.
      const recortes = antes.map(([, reg], i) => {
        let tramos = [[reg.a, reg.b]]
        antes.forEach(([, o], j) => {
          if (o === reg || !mismoPlano(o, reg)) return
          if (!(rango(o) > rango(reg) || (rango(o) === rango(reg) && j < i))) return
          tramos = tramos.flatMap(([p, q]) => {
            if (o.b <= p + 0.02 || o.a >= q - 0.02) return [[p, q]]
            const trozos = []
            if (o.a - p > 0.05) trozos.push([p, o.a])
            if (q - o.b > 0.05) trozos.push([o.b, q])
            return trozos
          })
        })
        return tramos
      })
      const huerfanos = []
      antes.forEach(([k, reg], i) => {
        const tramos = recortes[i]
        if (tramos.length === 1 && Math.abs(tramos[0][0] - reg.a) < 0.02 && Math.abs(tramos[0][1] - reg.b) < 0.02) return
        segmentos.delete(k)
        tramos.forEach(([p, q], t) => {
          segmentos.set(`c${k}#${t}`, { ...reg, a: p, b: q, vanos: reg.vanos.filter((v) => v.c > p && v.c < q) })
        })
        reg.vanos.filter((v) => !tramos.some(([p, q]) => v.c > p && v.c < q))
          .forEach((v) => huerfanos.push({ v, reg }))
      })
      for (const { v, reg } of huerfanos) {
        const dueno = [...segmentos.values()].find((o) => mismoPlano(o, reg) && v.c > o.a + 0.02 && v.c < o.b - 0.02)
        if (dueno && !dueno.vanos.includes(v)) dueno.vanos.push(v)
      }
    }

    // ── Muros que se pisan en vertical ─────────────────────────────────────
    // Un cuarto del segundo nivel puede tener EXACTAMENTE el mismo perimetro
    // que la sala de abajo —los de maquinas lo tienen, porque cuelgan dentro de
    // su propio salon— y entonces el mismo plano lo levantan dos tramos: el de
    // la planta baja, que cierra hasta la losa, y el de arriba, que arranca a
    // 2,40. La banda compartida se dibujaba dos veces y las dos caras
    // parpadeaban al mover la camara.
    //
    // Se resuelve por bandas, comparando lo que cubre cada tramo de verdad —el
    // tabique mas su remate—:
    //   · si lo de uno cabe entero dentro de lo del otro, sobra y cede el trozo
    //   · si solo se pisan por arriba, el de abajo baja su remate hasta donde
    //     arranca el de arriba
    // Nunca se sube el arranque de un tramo: los vanos cuelgan de el. Y un
    // remate no se baja por debajo de su propio dintel: antes que recortar una
    // puerta, se deja el panel repetido.
    {
      const techoDe = (r) => {
        if (!r.sube) return (r.cota || 0) + r.alto
        if (r.subeHasta === 'entrepiso') return SOFITO
        // Contra la cubierta: se toma el punto MAS BAJO del faldon sobre el
        // tramo, que es hasta donde se puede garantizar que tapa.
        return r.eje === 'h'
          ? alturaBajoCubierta(r.pos)
          : Math.min(alturaBajoCubierta(r.a), alturaBajoCubierta(r.b))
      }
      const antes = [...segmentos.entries()]
      const alturas = antes.map(([, r]) => techoDe(r))
      const cabeDentro = (i, j) =>   // el tramo i cabe en la banda del j
        (antes[i][1].cota || 0) >= (antes[j][1].cota || 0) - 0.02 && alturas[i] <= alturas[j] + 0.02

      const huerfanos = []
      antes.forEach(([k, reg], i) => {
        const vecinos = antes
          .map(([, o], j) => ({ o, j }))
          .filter(({ o, j }) => j !== i && o.eje === reg.eje && Math.abs(o.pos - reg.pos) < 0.06 &&
            Math.min(o.b, reg.b) - Math.max(o.a, reg.a) > 0.02)
        if (!vecinos.length) return

        // Cortes elementales del tramo, en los bordes de todos sus vecinos
        const bordes = new Set([reg.a, reg.b])
        vecinos.forEach(({ o }) => {
          if (o.a > reg.a + 0.02 && o.a < reg.b - 0.02) bordes.add(o.a)
          if (o.b > reg.a + 0.02 && o.b < reg.b - 0.02) bordes.add(o.b)
        })
        const cortes = [...bordes].sort((x, y) => x - y)

        const piezas = []
        for (let t = 0; t < cortes.length - 1; t++) {
          const p = cortes[t], q = cortes[t + 1]
          if (q - p < 0.03) continue
          const m = (p + q) / 2
          let quitar = false
          let tope = Infinity
          for (const { o, j } of vecinos) {
            if (m <= o.a + 0.01 || m >= o.b - 0.01) continue
            const yo = alturas[j], yr = alturas[i]
            if (cabeDentro(i, j)) {
              // empate exacto: solo cede uno de los dos, el de mas atras
              const empate = cabeDentro(j, i)
              if (!empate || j < i) { quitar = true; break }
            } else if (cabeDentro(j, i)) {
              continue                       // el vecino es el que sobra
            } else if ((o.cota || 0) > (reg.cota || 0) + 0.02 && yo >= yr - 0.02) {
              tope = Math.min(tope, o.cota || 0)
            }
          }
          const mios = reg.vanos.filter((v) => v.c > p && v.c < q)
          // Un tramo con vanos no se quita nunca: se perderia la puerta.
          if (quitar && !mios.length) { piezas.push(null); continue }
          if (tope === Infinity) { piezas.push({ p, q, alto: reg.alto, sube: reg.sube, mios }); continue }
          const nuevoAlto = tope - (reg.cota || 0)
          const dintel = mios.reduce((a, v) => Math.max(a, v.alto), 0)
          if (nuevoAlto < dintel + 0.05 || nuevoAlto < 0.05) {
            piezas.push({ p, q, alto: reg.alto, sube: reg.sube, mios })   // no cabe el corte
          } else {
            piezas.push({ p, q, alto: nuevoAlto, sube: false, mios })
          }
        }

        const cambia = piezas.some((z) => !z || z.alto !== reg.alto || z.sube !== reg.sube)
        if (!cambia) return
        segmentos.delete(k)
        piezas.forEach((z, t) => {
          if (!z) {
            if (z === null) reg.vanos.filter((v) => v.c > cortes[t] && v.c < cortes[t + 1]).forEach((v) => huerfanos.push({ v, reg }))
            return
          }
          segmentos.set(`b${k}#${t}`, {
            ...reg, a: z.p, b: z.q, alto: z.alto,
            sube: z.sube, subeHasta: z.sube ? reg.subeHasta : null,
            vanos: z.mios,
          })
        })
      })
      // Un vano cuyo tramo desaparecio se pasa al muro que lo tapa, y solo si
      // arranca a su misma cota: si no, la puerta se iria de altura.
      for (const { v, reg } of huerfanos) {
        const dueno = [...segmentos.values()].find((o) =>
          o.eje === reg.eje && Math.abs(o.pos - reg.pos) < 0.06 &&
          Math.abs((o.cota || 0) - (reg.cota || 0)) < 0.02 &&
          v.c > o.a + 0.02 && v.c < o.b - 0.02)
        if (dueno && !dueno.vanos.includes(v)) dueno.vanos.push(v)
      }
    }

    // Cada vano suelto se abre en el tramo de muro que lo contiene.
    for (const v of vanosSueltos) {
      // Cuando el pasillo no tenia muro en ese lado, mas arriba se le levanto
      // uno CON este mismo vano ya dentro. Si se vuelve a colocar acaba en dos
      // tramos del mismo plano —el que sube al entrepiso y el que no— y el 3D
      // cuelga dos hojas en el mismo agujero. Pasaba con cinco de las trece
      // puertas de pasillo.
      if ([...segmentos.values()].some((g) => g.vanos.includes(v))) continue
      for (const reg of segmentos.values()) {
        if (reg.eje !== v.eje || Math.abs(reg.pos - v.pos) > 0.06) continue
        // Y a su misma cota: el mismo plano puede llevar dos tramos, uno de la
        // planta baja y otro del segundo nivel. Sin este filtro la puerta del
        // PASILLO S23 se abría en el muro del TÚNEL NACEDORAS No 2 —tres metros
        // y medio en el aire, con la hoja colgada allá arriba— y abajo quedaba
        // el muro corrido y sin vano.
        if (Math.abs((reg.cota || 0) - (v.cota || 0)) > 0.06) continue
        if (v.c <= reg.a + 0.05 || v.c >= reg.b - 0.05) continue
        reg.vanos.push({ c: v.c, ancho: v.ancho, alto: v.alto, base: v.base || 0, tipo: v.tipo, cristal: v.cristal, rejilla: v.rejilla, abre: v.abre, abreManual: v.abreManual })
        reg.alto = Math.max(reg.alto, v.alto + 0.1)
        break
      }
    }

    const matMuro = new THREE.MeshStandardMaterial({ color: 0xeef1f4, roughness: 0.65, metalness: 0.04 })
    // Media caña sanitaria: el guardaescoba curvo color arena que remata
    // el encuentro de muro y piso en todas las salas.
    const matMediaCana = new THREE.MeshStandardMaterial({ color: 0xbb9a72, roughness: 0.75, metalness: 0.03 })
    const matDintel = new THREE.MeshStandardMaterial({ color: 0xc3cad6, roughness: 0.9 })
    const matMuroProyectado = new THREE.MeshStandardMaterial({
      color: 0xa9d8e8, roughness: 0.9, metalness: 0.02, transparent: true, opacity: 0.42,
    })
    const matMarco = new THREE.MeshStandardMaterial({ color: 0x3c72b4, roughness: 0.5, metalness: 0.25 })
    // Corredizas de la planta: hoja blanca con canto de aluminio y su riel.
    const matPorton = new THREE.MeshStandardMaterial({ color: 0xdfe5ea, roughness: 0.4, metalness: 0.35 })
    // Portón de carga: lámina galvanizada clara, como los de la planta.
    const matPortonCarga = new THREE.MeshStandardMaterial({ color: 0xb9c2cf, roughness: 0.4, metalness: 0.45 })
    const matHojaPeatonal = new THREE.MeshStandardMaterial({ color: 0xf3f6f8, roughness: 0.42, metalness: 0.12 })
    const matPortonHoja = new THREE.MeshStandardMaterial({ color: 0xe3e9ee, roughness: 0.38, metalness: 0.3 })
    const matFranja = new THREE.MeshStandardMaterial({ color: 0xf2c23d, roughness: 0.8 })
    const matTope = new THREE.MeshStandardMaterial({ color: 0x1c1c1e, roughness: 0.85 })
    const geoCaja = new THREE.BoxGeometry(1, 1, 1)

    // ── Acabados tomados de las fotos de la planta ────────────────────────
    const matHojaEquipo = new THREE.MeshStandardMaterial({ color: 0xf1f5fb, roughness: 0.35, metalness: 0.35 })
    const matVisorEquipo = new THREE.MeshStandardMaterial({ color: 0x141b26, roughness: 0.12, metalness: 0.65 })
    const matColumna = new THREE.MeshStandardMaterial({ color: 0x14161a, roughness: 0.35, metalness: 0.55 })
    const matAluminio = new THREE.MeshStandardMaterial({ color: 0xc3cbd4, roughness: 0.3, metalness: 0.75 })
    const matLed = new THREE.MeshBasicMaterial({ color: 0x39e07a })
    const matMando = new THREE.MeshBasicMaterial({ color: 0x2b6fb8 })
    const matParo = new THREE.MeshStandardMaterial({ color: 0xd7541f, roughness: 0.5 })
    // Chiller y compresor: rejilla de aletas, calderín de acero y el aislante
    // negro de las tuberías de agua helada.
    const matRejilla = new THREE.MeshStandardMaterial({ color: 0x3b4757, roughness: 0.85, metalness: 0.35 })
    const matTanque = new THREE.MeshStandardMaterial({ color: 0xb9c3d2, roughness: 0.3, metalness: 0.8 })
    const matAislante = new THREE.MeshStandardMaterial({ color: 0x1b2029, roughness: 0.9 })
    // Marco de ventana: blanco, que es como estan en planta.
    const matMarcoVentana = new THREE.MeshStandardMaterial({
      color: 0xf2f4f7, roughness: 0.55, metalness: 0.04,
    })
    const matVidrio = new THREE.MeshStandardMaterial({
      color: 0xbcd2de, roughness: 0.06, metalness: 0.25, transparent: true, opacity: 0.34,
    })
    const matEscritorio = new THREE.MeshStandardMaterial({ color: 0xe9edf1, roughness: 0.55 })
    const matSilla = new THREE.MeshStandardMaterial({ color: 0x23262c, roughness: 0.7 })
    const matMonitor = new THREE.MeshStandardMaterial({ color: 0x101318, roughness: 0.25, metalness: 0.4 })
    const matLogo = new THREE.MeshBasicMaterial({ color: 0xe0740a })
    const matPlaca = new THREE.MeshStandardMaterial({
      color: 0xa9bcc6, roughness: 0.08, metalness: 0.5, transparent: true, opacity: 0.55,
    })
    const matArmario = new THREE.MeshStandardMaterial({ color: 0xeceff2, roughness: 0.5 })
    const matNegro = new THREE.MeshStandardMaterial({ color: 0x1a1c20, roughness: 0.6 })
    const matLuminaria = new THREE.MeshBasicMaterial({ color: 0xfdfbf2 })

    // Materiales de equipo que NO dependen de la maquina. Eran ocho
    // `new MeshStandardMaterial` dentro del bucle y con 41 maquinas salian 249
    // materiales para ocho aspectos. three.js no agrupa nada solo: cada
    // material distinto es un programa que revalidar y un cambio de estado por
    // cuadro. El patron es el de `materialPlaca` de aqui abajo.
    const matCuerpoEquipo = new THREE.MeshStandardMaterial({ color: 0x9aa6b8, roughness: 0.38, metalness: 0.55 })
    const matBaseEquipo = new THREE.MeshStandardMaterial({ color: 0x2a3444, roughness: 0.8 })
    const matMarcoPantalla = new THREE.MeshStandardMaterial({ color: 0x161e2c, roughness: 0.55, metalness: 0.3 })
    // Los tenidos del color de su familia: el aro del chiller, la banda del
    // compresor, la franja de las Petersime y el piloto de estado. El factor de
    // emissive va en la clave a proposito: la banda usa 0,20 y la franja 0,22, y
    // unificarlos cambiaria el brillo del compresor.
    const tenidos = new Map()
    const matTenido = (color, emisivo, extra) => {
      const clave = `${color}|${emisivo}|${extra ? JSON.stringify(extra) : ''}`
      if (!tenidos.has(clave)) {
        const receta = { color: new THREE.Color(color), roughness: 0.5, ...(extra || {}) }
        if (emisivo) receta.emissive = new THREE.Color(color).multiplyScalar(emisivo)
        tenidos.set(clave, new THREE.MeshStandardMaterial(receta))
      }
      return tenidos.get(clave)
    }

    // Placa numerada de la máquina: se pinta el número en un lienzo.
    const placas = new Map()
    function materialPlaca(txt) {
      if (placas.has(txt)) return placas.get(txt)
      const c = document.createElement('canvas')
      c.width = 128; c.height = 96
      const g2 = c.getContext('2d')
      g2.fillStyle = '#f4f6f8'; g2.fillRect(0, 0, 128, 96)
      g2.fillStyle = '#1b1e24'; g2.font = 'bold 62px system-ui, sans-serif'
      g2.textAlign = 'center'; g2.textBaseline = 'middle'
      g2.fillText(txt, 64, 52)
      const tex = new THREE.CanvasTexture(c)
      tex.encoding = THREE.sRGBEncoding
      const mat = new THREE.MeshBasicMaterial({ map: tex })
      placas.set(txt, mat)
      return mat
    }

    // Los cuartos de maquinas de incubadoras son fosos que se pisan, y su losa
    // se apoya sobre los muros de la planta baja: ninguno de esos muros puede
    // asomar por encima de ese piso. Sin esto, el que separa incubadoras 2 del
    // pasillo cruzaba los dos fosos de lado a lado como un bordillo de medio
    // metro —y su sobremuro, noventa centimetros mas— y el visitante que bajaba
    // el metro quedaba clavado ahi mismo, sin poder entrar al tunel.
    const fososPisables = datos.rooms.filter(esCuartoMaquinasIncubadoras).map((o) => ({
      x0: o.x, x1: o.x + o.w, z0: o.y, z1: o.y + o.h, y: cotaDe(o),
    }))
    // Los tuneles se quedan: son volumenes propios dentro del foso, con sus
    // muros y su tapa, y arrancan de ese mismo piso.
    const tunelesDelFoso = datos.rooms.filter(esTunel)
      .map((o) => ({ x0: o.x - 0.2, x1: o.x + o.w + 0.2, z0: o.y - 0.2, z1: o.y + o.h + 0.2 }))

    function bloqueMuro(cx, cy, cz, sx, sy, sz, material, esColision, sePisa) {
      const y0 = cy - sy / 2, y1 = cy + sy / 2
      const enTunel = tunelesDelFoso.some((t) =>
        cx - sx / 2 > t.x0 - 0.02 && cx + sx / 2 < t.x1 + 0.02 &&
        cz - sz / 2 > t.z0 - 0.02 && cz + sz / 2 < t.z1 + 0.02)
      const f = enTunel ? null : fososPisables.find((q) =>
        y1 > q.y + 0.02 && Math.abs(y0 - q.y) > 0.05 &&
        cx + sx / 2 > q.x0 + 0.02 && cx - sx / 2 < q.x1 - 0.02 &&
        cz + sz / 2 > q.z0 + 0.02 && cz - sz / 2 < q.z1 - 0.02)
      if (f) {
        // Lo que cae DENTRO del foso se corta a la altura de su piso; lo que
        // sobra por fuera sigue de largo como el muro que es.
        const bx0 = cx - sx / 2, bx1 = cx + sx / 2, bz0 = cz - sz / 2, bz1 = cz + sz / 2
        const ix0 = Math.max(bx0, f.x0), ix1 = Math.min(bx1, f.x1)
        const iz0 = Math.max(bz0, f.z0), iz1 = Math.min(bz1, f.z1)
        const trozo = (x0, x1, z0, z1, a, b) => {
          if (x1 - x0 < 0.02 || z1 - z0 < 0.02 || b - a < 0.02) return
          bloqueMuro((x0 + x1) / 2, (a + b) / 2, (z0 + z1) / 2, x1 - x0, b - a, z1 - z0,
            material, esColision, sePisa)
        }
        if (ix0 - bx0 > 0.02) trozo(bx0, ix0, bz0, bz1, y0, y1)
        if (bx1 - ix1 > 0.02) trozo(ix1, bx1, bz0, bz1, y0, y1)
        if (iz0 - bz0 > 0.02) trozo(ix0, ix1, bz0, iz0, y0, y1)
        if (bz1 - iz1 > 0.02) trozo(ix0, ix1, iz1, bz1, y0, y1)
        trozo(ix0, ix1, iz0, iz1, y0, f.y)
        return null
      }
      return piezaMuro(cx, cy, cz, sx, sy, sz, material, esColision, sePisa)
    }

    function piezaMuro(cx, cy, cz, sx, sy, sz, material, esColision, sePisa) {
      const m = new THREE.Mesh(geoCaja, material || matMuro)
      m.position.set(cx, cy, cz)
      m.scale.set(sx, sy, sz)
      m.castShadow = true
      m.receiveShadow = true
      gMuros.add(m)
      if (esColision) {
        // Con su franja de alturas. Sin ella el caminante chocaba con todo lo
        // que tuviera encima o debajo: el sobremuro corre por TODO el largo del
        // muro —tambien por encima de las puertas— y tapiaba cada vano, la tapa
        // de un tunel del segundo nivel cortaba el pasillo de la planta baja, y
        // el contorno del entrepiso cerraba el paso seis metros mas abajo.
        colisiones.push({
          x0: cx - sx / 2, x1: cx + sx / 2, z0: cz - sz / 2, z1: cz + sz / 2,
          y0: cy - sy / 2, y1: cy + sy / 2,
          // `sePisa`: el caminante lo salva de un paso si no le llega mas
          // arriba del escalon. Es el antepecho de un vano, no un muro.
          sePisa: !!sePisa,
        })
      }
      return m
    }

    // ── Plenums: vacíos técnicos colgados del cielo raso de su anfitriona ───
    // No arrancan del piso: su base es la altura de la sala que los aloja
    // (parteDe), más la cota del entrepiso si esa sala vive en el nivel 2. Su
    // propia profundidad (`altura`, 0,6 m si no trae otra) da hasta dónde
    // suben. Se dibujan como una caja técnica traslúcida sobre su huella —
    // como cualquier sala de forma libre, el 3D usa su rectángulo envolvente,
    // no el polígono que guarda el editor 2D.
    const matPlenum = new THREE.MeshStandardMaterial({
      color: 0x5c6f8f, roughness: 0.7, metalness: 0.05, transparent: true, opacity: 0.32,
    })
    // El tabique que cierra el plenum: chapa clara como el resto del salón, no
    // un vidrio azul. Lo que se ve desde adentro del salón es esto.
    const matTabiquePlenum = new THREE.MeshStandardMaterial({ color: 0xe9edf1, roughness: 0.8, metalness: 0.04 })
    // Lama de rejilla: aluminio mate. La ventanilla de los cuartos de succion
    // no lleva vidrio sino lamas escalonadas —pasa el aire, no la vista.
    const matLama = new THREE.MeshStandardMaterial({ color: 0xd4dae1, roughness: 0.42, metalness: 0.62 })
    const geoBordePlenum = new THREE.EdgesGeometry(geoCaja)
    datos.rooms.forEach((r) => {
      if (r.type !== 'plenum') return
      const host = r.parteDe ? salasPorId.get(r.parteDe) : null
      if (!host) return
      if (!seVeNivel(esNivel2(host) ? 2 : 1)) return
      // Contorno de forma libre. El plenum de las nacedoras es una L en PLANTA
      // —una franja corrida por detras de la hilera y una pata que sube por el
      // extremo libre del salon—, y levantar su rectangulo envolvente se comia
      // la forma y tapaba las maquinas. Se extruye el poligono tal cual, del
      // piso de su sala hasta su altura.
      const piso = cotaDe(host)
      const tope = piso + (r.altura || alturaDe(host))
      const alto = tope - piso
      if (alto <= 0.05) return
      const base = piso

      if (Array.isArray(r.puntos) && r.puntos.length > 2) {
        // El plenum NO es otra sala. Es el vacío que queda detrás de la hilera
        // de nacedoras y a su costado, cerrado por un tabique con su puertilla:
        // un espacio confinado DENTRO del mismo salón. Se dibujaba como un
        // bloque translúcido de piso a techo sobre toda su huella, y al entrar
        // al salón uno se daba de narices con esa masa en vez de ver las
        // máquinas. Ahora se levanta solo el tabique que lo cierra y por dentro
        // queda hueco, que es lo que hay.
        const pts = r.puntos.map((p) => ({ x: r.x + p.x, z: r.y + p.y }))
        // Su alto es el del salón que lo aloja: un tabique más alto que la sala
        // saldría por el cielo raso.
        const altoTab = Math.min(alto, alturaDe(host))
        // Un lado que cae sobre el muro del salón ya está construido: repetirlo
        // ahí es un tabique dentro de un muro.
        const sobreElMuro = (a, b) => {
          const eps = 0.14
          if (Math.abs(a.x - b.x) < 0.02) {
            return Math.abs(a.x - host.x) < eps || Math.abs(a.x - (host.x + host.w)) < eps
          }
          if (Math.abs(a.z - b.z) < 0.02) {
            return Math.abs(a.z - host.y) < eps || Math.abs(a.z - (host.y + host.h)) < eps
          }
          return false
        }
        // El lado que lleva la puertilla ya lo levanta el sistema de vanos, con
        // su hueco: repetirlo aquí tapia la única entrada al plenum.
        const conVano = (a, b) => (r.doors || []).some((d) => {
          const L = ladoDePuerta(r, d)
          const horizD = L === 'arriba' || L === 'abajo'
          const posD = L === 'arriba' ? r.y : L === 'abajo' ? r.y + r.h
                     : L === 'izquierda' ? r.x : r.x + r.w
          const cD = (horizD ? r.x + d.x : r.y + d.y) + anchoVano(d) / 2
          const horizE = Math.abs(a.z - b.z) < 0.02
          if (horizD !== horizE) return false
          if (Math.abs(posD - (horizE ? a.z : a.x)) > 0.14) return false
          const e0 = horizE ? Math.min(a.x, b.x) : Math.min(a.z, b.z)
          const e1 = horizE ? Math.max(a.x, b.x) : Math.max(a.z, b.z)
          return cD > e0 - 0.2 && cD < e1 + 0.2
        })
        for (let k = 0; k < pts.length; k++) {
          const a = pts[k], b = pts[(k + 1) % pts.length]
          const dx = Math.abs(b.x - a.x), dz = Math.abs(b.z - a.z)
          const largo = Math.max(dx, dz)
          if (largo < 0.06 || sobreElMuro(a, b) || conVano(a, b)) continue
          const horiz = dz < 0.02
          const tab = new THREE.Mesh(geoCaja, matTabiquePlenum)
          tab.scale.set(horiz ? largo : 0.09, altoTab, horiz ? 0.09 : largo)
          tab.position.set((a.x + b.x) / 2, base + altoTab / 2, (a.z + b.z) / 2)
          tab.castShadow = true
          tab.receiveShadow = true
          gMuros.add(tab)
          colisiones.push({
            x0: Math.min(a.x, b.x) - (horiz ? 0 : 0.045), x1: Math.max(a.x, b.x) + (horiz ? 0 : 0.045),
            z0: Math.min(a.z, b.z) - (horiz ? 0.045 : 0), z1: Math.max(a.z, b.z) + (horiz ? 0.045 : 0),
            y0: base, y1: base + altoTab,
          })
        }
      } else {
        const caja = new THREE.Mesh(geoCaja, matPlenum)
        caja.position.set(r.x + r.w / 2, base + alto / 2, r.y + r.h / 2)
        caja.scale.set(r.w, alto, r.h)
        gMuros.add(caja)
        const borde = new THREE.LineSegments(
          geoBordePlenum,
          new THREE.LineBasicMaterial({ color: 0x8fa3c8, transparent: true, opacity: 0.55 })
        )
        borde.position.copy(caja.position)
        borde.scale.copy(caja.scale)
        gMuros.add(borde)
      }

      ;(r.doors || []).forEach((d) => {
        const l = d.lado || 'arriba'
        const horiz = l === 'arriba' || l === 'abajo'
        const an = d.w || 0.6, hh = d.h || 2
        const cy = base + (d.base || 0) + hh / 2
        const cc = (horiz ? r.x : r.y) + (d.x || 0) + an / 2
        const cara = l === 'arriba' ? r.y : l === 'abajo' ? r.y + r.h
                   : l === 'izquierda' ? r.x : r.x + r.w
        const fuera = (l === 'arriba' || l === 'izquierda' ? -1 : 1) * 0.04
        const poner = (sx, sy, sz, mat) => horiz
          ? bloqueMuro(cc, cy, cara + fuera, sx, sy, sz, mat, false)
          : bloqueMuro(cara + fuera, cy, cc, sz, sy, sx, mat, false)
        poner(an + 0.09, hh + 0.09, 0.03, matAluminio)   // marco
        poner(an, hh, 0.05, matHojaPeatonal)             // tablero
      })
    })

    // ── Escalera de acceso al nivel 2: TEC-1 → puente sobre S62 → S77 ───────
    // Estructura puntual, medida por Henry en sitio el 2026-09-01. Metálica
    // negra con franjas amarillas antideslizantes. Iba al revés: la primera
    // versión subía alejándose del muro de S62, con la llegada metida contra
    // la puerta de S77 — un tramo que no correspondía a nada real, un falso
    // espacio. Va así:
    //   1) tramo principal, un solo recto (no dos, no hace falta rampa de
    //      umbral): 1,70 m de huella · 3 m de subida (dato de Henry), bastante
    //      empinado (~60°) porque el sitio es angosto. La base queda adentro
    //      de TEC-1 y sube ACERCÁNDOSE al muro que separa TEC-1 de S62 —justo
    //      al lado de la puerta que ya hay ahí, a nivel del piso—, no
    //      alejándose de él. TEC-1 no está en la lista de salas con
    //      entrepiso, así que ya no hay losa dibujada encima suyo: el hueco
    //      para que la escalera pase queda solo, no hay que recortar nada.
    //   2) puente: tramo plano, mismo ancho y mismo material, que arranca
    //      donde termina el tramo principal —sobre ese muro— y cruza los
    //      1,6 m de S62 (el pasillo, que tampoco tiene entrepiso) hasta el
    //      borde de AREA TECNICA DE AMBIENTE CONTROLADO (S86).
    // Ancho: se deja el mismo 51,2-52,18 de la versión anterior porque Henry
    // nunca corrigió esa medida, solo el sentido en que sube.
    {
      const ESC_X0 = 51.2, ESC_X1 = 52.18
      const ESC_ANCHO = ESC_X1 - ESC_X0
      const ESC_CX = (ESC_X0 + ESC_X1) / 2
      const ESC_Z_MURO = 25              // muro entre TEC-1 y S62
      const ESC_Z_AREA = 23.4            // borde de S62 hacia el area tecnica (ancho de S62: 1,6 m)
      // Sube hasta la cota del entrepiso, no hasta un numero fijo: mientras
      // estuvo clavada en 3 m y el entrepiso paso a 3,40, la escalera llegaba
      // 40 cm por debajo del piso al que va.
      const ESC_ALTO_TRAMO = ENTREPISO || 3
      const ESC_HUELLA = 1.7             // huella en el piso del tramo principal (dato de Henry)
      const ESC_Z_BASE = ESC_Z_MURO + ESC_HUELLA   // adentro de TEC-1
      const grosorRampa = 0.08

      const tramoEscalera = (x0, x1, y0, h0, y1, h1, nFranjas, conPasamanos = true) => {
        const ANCHO = x1 - x0, CX = (x0 + x1) / 2
        // El tramo se orienta con su eje largo hacia +z. El principal sube
        // ACERCANDOSE al muro, o sea hacia -z, y alinear el eje con esa
        // direccion volteaba la rampa boca abajo: las franjas antideslizantes y
        // el pasamanos quedaban colgando por la cara de abajo. Se le da la
        // vuelta a los extremos —la escalera es la misma— para que el eje
        // siempre vaya hacia +z y el arriba siga siendo arriba.
        if (y1 < y0) {
          const ay = y0, ah = h0
          y0 = y1; h0 = h1; y1 = ay; h1 = ah
        }
        const dz = y1 - y0, dh = h1 - h0
        const largo = Math.sqrt(dz * dz + dh * dh)
        const angulo = Math.atan2(dh, dz)
        const grupo = new THREE.Group()

        // Rampa: representa la estructura del tramo; los peldaños
        // individuales no se modelan, quedan sugeridos por las franjas.
        const rampa = new THREE.Mesh(geoCaja, matNegro)
        rampa.scale.set(ANCHO, grosorRampa, largo)
        rampa.castShadow = true
        grupo.add(rampa)

        for (let i = 0; i < nFranjas; i++) {
          const t = (i + 0.5) / nFranjas - 0.5
          const franja = new THREE.Mesh(geoCaja, matFranja)
          franja.scale.set(ANCHO * 0.88, 0.015, 0.07)
          franja.position.set(0, grosorRampa / 2 + 0.008, t * largo)
          grupo.add(franja)
        }

        // Pasamanos a los dos lados: postes cada ~0,9 m más el riel corrido.
        // La escalera del plenum de incubadoras va sin él: el hueco mide un
        // metro y las barandas se comían el paso.
        ;(conPasamanos ? [-1, 1] : []).forEach((lado) => {
          const xPoste = (lado * ANCHO) / 2
          const nPostes = Math.max(1, Math.round(largo / 0.9))
          for (let i = 0; i <= nPostes; i++) {
            const t = i / nPostes - 0.5
            const poste = new THREE.Mesh(geoCaja, matNegro)
            poste.scale.set(0.045, 0.9, 0.045)
            poste.position.set(xPoste, grosorRampa / 2 + 0.45, t * largo)
            grupo.add(poste)
          }
          const riel = new THREE.Mesh(geoCaja, matNegro)
          riel.scale.set(0.045, 0.045, largo + 0.1)
          riel.position.set(xPoste, grosorRampa / 2 + 0.9, 0)
          grupo.add(riel)
        })

        grupo.position.set(CX, (h0 + h1) / 2, (y0 + y1) / 2)
        grupo.rotation.x = -angulo
        gMuros.add(grupo)
        // La escalera no estorba: se sube. Se registra como rampa para que el
        // caminante cambie de nivel por ella en vez de chocar con una caja.
        // La huella se alarga medio metro por cada extremo: el tramo tiene que
        // pasar por encima del muro que cruza —el que separa la sala tecnica
        // del pasillo, y el contorno del entrepiso al llegar arriba— y esos
        // muros, engordados con el radio del cuerpo, cortaban el paso justo
        // antes de pisar la escalera. La interpolacion se recorta a [0,1], asi
        // que en ese margen la cota se queda en la del extremo.
        rampas.push({
          x0: x0 - 0.15, x1: x1 + 0.15,
          z0: Math.min(y0, y1) - 0.5, z1: Math.max(y0, y1) + 0.5,
          a0: y0, a1: y1, y0: h0, y1: h1,
        })
      }

      // ── Escaleras dibujadas en el plano ──────────────────────────────────
      // Cualquier sala que se llame ESCALERA… es un hueco de escalera: sube
      // desde su piso hasta el piso del segundo nivel que tenga encima. La
      // proyectada al plenum de incubadoras No 2 va en el metro que queda entre
      // la incubadora No 24 y el muro oriental de la sala, y evita el rodeo del
      // otro acceso, que obliga a montar dos escaleras para cruzar el túnel.
      datos.rooms.filter(esEscalera).forEach((r) => {
        if (!seVeNivel(1)) return
        const arriba = datos.rooms.find((o) =>
          esNivel2(o) && !esTunel(o) &&
          o.x < r.x + r.w - 0.1 && o.x + o.w > r.x + 0.1 &&
          o.y < r.y + r.h - 0.1 && o.y + o.h > r.y + 0.1)
        const sube = arriba ? cotaDe(arriba) : ENTREPISO
        // Se deja medio metro de holgura a cada lado del ancho de la sala para
        // que la baranda no se incruste en los muros, y la huella arranca junto
        // a la puerta —el extremo por donde se entra— subiendo hacia el fondo.
        const m = 0.1
        const x0 = r.x + m, x1 = r.x + r.w - m
        const zPie = r.y + r.h - 0.1, zTope = r.y + 0.2
        tramoEscalera(x0, x1, zPie, 0, zTope, sube, Math.max(4, Math.round(sube / 0.18)), false)
      })

      tramoEscalera(ESC_X0, ESC_X1, ESC_Z_BASE, 0, ESC_Z_MURO, ESC_ALTO_TRAMO, 7)
      tramoEscalera(ESC_X0, ESC_X1, ESC_Z_AREA, ESC_ALTO_TRAMO, ESC_Z_MURO, ESC_ALTO_TRAMO, 2)
    }

    segmentos.forEach((s) => {
      // `cota` ya distingue el nivel del segmento (0 = planta baja, la del
      // entrepiso = nivel 2): con eso basta para aislar un nivel al dibujar,
      // sin haber filtrado antes la fusión de muros ni el cálculo del entrepiso.
      if (!seVeNivel(s.cota > 0 ? 2 : 1)) return
      const vanos = s.vanos
        .map((v) => ({ ...v, ini: Math.max(s.a, v.c - v.ancho / 2), fin: Math.min(s.b, v.c + v.ancho / 2) }))
        .filter((v) => v.fin > v.ini)
        .sort((p, q) => p.ini - q.ini)

      // Tramos macizos entre vanos
      let cursor = s.a
      let tramos = []
      vanos.forEach((v) => {
        if (v.ini > cursor + 0.02) tramos.push([cursor, v.ini])
        cursor = Math.max(cursor, v.fin)
      })
      if (cursor < s.b - 0.02) tramos.push([cursor, s.b])

      // Sala en L: se descuenta el tramo que une sus dos piezas. A diferencia de
      // un vano, aquí no va dintel: ese muro sencillamente no existe.
      const unir = uniones.filter((u) => u.eje === s.eje && Math.abs(u.pos - s.pos) < 0.05)
      if (unir.length) {
        tramos = tramos.flatMap(([ini, fin]) => {
          let trozos = [[ini, fin]]
          unir.forEach((u) => {
            trozos = trozos.flatMap(([p, q]) => {
              if (u.b <= p + 0.02 || u.a >= q - 0.02) return [[p, q]]
              const out = []
              if (u.a > p + 0.02) out.push([p, u.a])
              if (u.b < q - 0.02) out.push([u.b, q])
              return out
            })
          })
          return trozos
        })
      }

      // Una sala proyectada (aún no construida) levanta sus muros translúcidos,
      // para que se lea como lo que va a quedar y no se confunda con lo ya hecho.
      const mat = s.proyectada ? matMuroProyectado : matMuro
      // Cota del arranque: 0 en la planta baja, la del entrepiso en el nivel 2.
      const Y0 = s.cota || 0
      tramos.forEach(([ini, fin]) => {
        const L = fin - ini
        const c = (ini + fin) / 2
        if (s.eje === 'h') bloqueMuro(c, Y0 + s.alto / 2, s.pos, L, s.alto, GROSOR_MURO, mat, true)
        else bloqueMuro(s.pos, Y0 + s.alto / 2, c, GROSOR_MURO, s.alto, L, mat, true)

        // Media caña al pie del muro. Se dibuja un poco más ancha que el muro,
        // así queda vista por sus dos caras con una sola pieza.
        if (!s.proyectada) {
          const g = GROSOR_MURO + 0.09
          if (s.eje === 'h') bloqueMuro(c, Y0 + ALTO_MEDIA_CANA / 2, s.pos, L, ALTO_MEDIA_CANA, g, matMediaCana, false)
          else bloqueMuro(s.pos, Y0 + ALTO_MEDIA_CANA / 2, c, g, ALTO_MEDIA_CANA, L, matMediaCana, false)
        }
      })

      // Sobremuro: del alto del tabique hasta la cara inferior de la cubierta.
      // Corre por TODO el largo del muro (s.a a s.b), no solo por los tramos
      // macizos: sube de corrido igual que la fachada real, sin importar que
      // abajo haya una puerta o una ventana. Antes se armaba adentro del
      // `tramos.forEach` de arriba, así que se saltaba exactamente el ancho de
      // cada vano — quedaba un hueco en la fachada justo encima de cada puerta
      // y una sombra encima de cada ventana, porque ahí no había con qué
      // taparlo hasta la cubierta.
      //
      // Un muro que corre a lo largo del edificio está todo a la misma
      // distancia de la cumbrera y sube parejo. Uno que la cruza sube en
      // rampa, y para eso se parte en tramos de medio metro: con la pendiente
      // que hay, cada escalón mide menos de diez centímetros y no se nota.
      if (!s.proyectada && s.sube) {
        // Un muro de fachada sigue la pendiente de la cubierta y remata contra
        // ella; un muro interior que solo cierra el entrepiso remata contra su
        // piso, que es plano y no depende de dónde caiga el muro en la nave.
        const aTecho = s.subeHasta !== 'entrepiso'
        // Los vanos del muro de ARRIBA, si en este mismo plano hay una sala del
        // segundo nivel. El sobremuro sube de corrido —esa es la gracia, cerrar
        // también por encima de las puertas— pero cuando detrás hay un cuarto
        // del nivel 2 le tapiaba la suya: la puerta existe en el muro de arriba
        // y este, a diez centímetros, la cerraba. Pasaba con el desembarco de la
        // escalera al área técnica. Se le abre el mismo hueco.
        const huecosArriba = []
        for (const o of segmentos.values()) {
          if (o === s || o.eje !== s.eje || Math.abs(o.pos - s.pos) > 0.25) continue
          if ((o.cota || 0) <= Y0 + 0.02) continue
          for (const v of (o.vanos || [])) {
            huecosArriba.push({
              a: v.c - v.ancho / 2, b: v.c + v.ancho / 2,
              y0: (o.cota || 0) + (v.base || 0), y1: (o.cota || 0) + v.alto,
            })
          }
        }
        const remate = (cc, zz, ll) => {
          // Aislando la planta baja, los muros se cortan a la altura del piso
          // del segundo nivel: se mira el nivel 1 como lo que es, un volumen
          // rebanado por la losa, y no con las fachadas subiendo a la cumbrera
          // por encima de un entrepiso que no se esta dibujando.
          const tope = nivelFiltro === 1 && ENTREPISO > 0 ? ENTREPISO : Infinity
          // Nunca por encima de la cubierta: en la banda del frente el faldon
          // baja a 2,90 y un muro interno a 3,30 la atravesaria.
          const techo = Math.min(aTecho ? alturaBajoCubierta(zz) : SOFITO, alturaBajoCubierta(zz), tope)
          if (techo <= Y0 + s.alto + 0.02) return
          const base = Y0 + s.alto
          const trozo = (c2, l2, d0, d1) => {
            const h = d1 - d0
            if (h <= 0.02 || l2 <= 0.02) return
            if (s.eje === 'h') bloqueMuro(c2, d0 + h / 2, s.pos, l2, h, GROSOR_MURO, mat, true)
            else bloqueMuro(s.pos, d0 + h / 2, c2, GROSOR_MURO, h, l2, mat, true)
          }
          const p0 = cc - ll / 2, p1 = cc + ll / 2
          const corta = huecosArriba
            .filter((k) => k.b > p0 + 0.02 && k.a < p1 - 0.02 && k.y1 > base + 0.02 && k.y0 < techo - 0.02)
            .sort((u, w) => u.a - w.a)
          if (!corta.length) { trozo(cc, ll, base, techo); return }
          let x = p0
          for (const k of corta) {
            const a = Math.max(p0, k.a), b = Math.min(p1, k.b)
            if (a > x + 0.02) trozo((x + a) / 2, a - x, base, techo)
            // Antepecho y dintel del vano de arriba, dentro de su propio ancho.
            trozo((a + b) / 2, b - a, base, Math.max(base, Math.min(techo, k.y0)))
            trozo((a + b) / 2, b - a, Math.min(techo, Math.max(base, k.y1)), techo)
            x = Math.max(x, b)
          }
          if (p1 > x + 0.02) trozo((x + p1) / 2, p1 - x, base, techo)
        }
        const largoTotal = s.b - s.a
        const centroTotal = (s.a + s.b) / 2
        if (s.eje === 'h' || !aTecho) remate(centroTotal, s.pos, largoTotal)
        else {
          const PASO = 0.5
          const n = Math.max(1, Math.ceil(largoTotal / PASO))
          for (let k = 0; k < n; k++) {
            const a1 = s.a + (largoTotal * k) / n, a2 = s.a + (largoTotal * (k + 1)) / n
            // Se remata a la altura MAYOR del escalon, no a la de su centro:
            // asi el muro entra un poco en la cubierta en vez de quedarse
            // corto. Con el centro faltaban hasta 8 cm y quedaba una rendija
            // de luz entre el remate y el faldon.
            remate((a1 + a2) / 2,
              alturaBajoCubierta(a1) >= alturaBajoCubierta(a2) ? a1 : a2,
              a2 - a1)
          }
        }
      }

      // Dintel sobre cada vano + marco de la puerta
      vanos.forEach((v, i) => {
        const L = v.fin - v.ini
        const c = (v.ini + v.fin) / 2
        const hDintel = Math.max(0.05, s.alto - v.alto)
        const yDintel = Y0 + v.alto + hDintel / 2

        // Antepecho: el pedazo de muro que queda DEBAJO de una ventana. Los
        // tramos macizos se calcularon salteando el vano entero, así que sin
        // esto la ventana llegaría hasta el piso.
        if (v.base > 0) {
          // El antepecho SE PISA. La compuerta de los tuneles del segundo nivel
          // arranca a 30 cm del piso —asi es en la planta— y ese bordillo
          // frenaba en seco al visitante delante del vano, cuando de verdad se
          // pasa de un paso. Un antepecho de ventana, mas alto que el escalon,
          // sigue frenando como debe.
          // Solo el de un PASO: el antepecho de una ventana mide un metro y por
          // ahi no se entra, se mira.
          const bordillo = v.tipo !== 'window'
          if (s.eje === 'h') bloqueMuro(c, Y0 + v.base / 2, s.pos, L, v.base, GROSOR_MURO, mat, true, bordillo)
          else bloqueMuro(s.pos, Y0 + v.base / 2, c, GROSOR_MURO, v.base, L, mat, true, bordillo)
        }
        const matPuerta =
          v.tipo === 'loading' ? matPortonCarga : v.tipo === 'sliding' ? matPorton : matMarco

        // El muelle lleva cortina enrollable: sube en vez de correrse de lado.
        const enrolla = v.tipo === 'loading'
        const corre = v.tipo === 'sliding'
        const anchoHoja = corre || enrolla ? L + 0.12 : L
        const rec = anchoHoja * 0.92          // lo que recorre la hoja al abrir

        // Hacia qué lado corre la hoja: hacia el tramo de muro macizo más largo
        // de sus dos costados, para que al abrir se estacione sobre pared.
        // Sin esto todas corrían al mismo lado y dos puertas vecinas se
        // estorbaban: la primera terminaba tapando el vano de la segunda, que es
        // lo que pasaba con las dos de transferencia hacia las nacedoras. En la
        // planta esas dos corren justamente una al contrario de la otra.
        const libreAntes = v.ini - (i > 0 ? vanos[i - 1].fin : s.a)
        const libreDespues = (i < vanos.length - 1 ? vanos[i + 1].ini : s.b) - v.fin
        const sentido = libreDespues >= libreAntes ? 1 : -1

        // Cara del muro por la que se cuelga la hoja: +1 la de coordenada
        // mayor, −1 la menor. La decide la regla de apertura del vano.
        const cara = v.abre === 1 ? 1 : -1
        const desplante = cara * (GROSOR_MURO / 2 + 0.05)
        // Jamba de la que cuelga: la más cercana a un rincón, para que la hoja
        // abierta se recueste contra él en vez de plantarse en mitad del paso.
        // +1 cuelga del arranque del vano, −1 de su final.
        const jamba = libreAntes <= libreDespues ? 1 : -1

        // Riel de la corredera, visible sobre el vano en todas las fotos. Se
        // alarga hacia el lado por donde se va la hoja, que es donde va colgada.
        let riel = null
        if (corre) {
          const yRiel = Y0 + v.alto + 0.09
          const largoRiel = L + rec + 0.3
          const cRiel = c + (sentido * rec) / 2
          if (s.eje === 'h') riel = bloqueMuro(cRiel, yRiel, s.pos + desplante, largoRiel, 0.1, 0.07, matAluminio, false)
          else riel = bloqueMuro(s.pos + desplante, yRiel, cRiel, 0.07, 0.1, largoRiel, matAluminio, false)
        }

        // ── Hoja de la puerta ────────────────────────────────────────
        // Nace CERRADA, tapando el vano, y se abre sola al acercarse. Las
        // corredizas y los portones corren a un lado; las peatonales giran
        // sobre su jamba, como las blancas de las fotos.
        //
        // Salvo los vanos 'open': ahí el muro se abre pero no hay puerta que
        // colgar, solo el marco. Su hoja no llega a la escena y no entra al
        // registro de puertas animadas, así que ni se mueve ni suena. El
        // dintel y las jambas de más abajo sí se dibujan: son el marco.
        // Una ventana lleva vidrio fijo en vez de hoja: ni gira, ni corre, ni
        // entra al registro de puertas animadas.
        // Una ventana lleva vidrio fijo con su marco: ni gira, ni corre, ni entra
        // al registro de puertas animadas.
        //
        // El dintel se dibuja aqui y no mas abajo porque esta rama sale antes de
        // llegar alli. Sin el, el muro por encima del vidrio no se levantaba y
        // la ventana abria un boquete hasta el techo.
        if (v.tipo === 'window') {
          const hVidrio = v.alto - v.base
          const M = 0.05          // escuadria del marco
          const F = GROSOR_MURO + 0.04   // sobresale un pelo a cada cara
          const horiz = s.eje === 'h'
          const poner = (cc, yy, ll, hh) => {
            if (horiz) bloqueMuro(cc, Y0 + yy, s.pos, ll, hh, F, matMarcoVentana, false)
            else bloqueMuro(s.pos, Y0 + yy, cc, F, hh, ll, matMarcoVentana, false)
          }
          // Dintel: el muro que va del alto de la ventana al techo.
          if (horiz) bloqueMuro(c, yDintel, s.pos, L, hDintel, GROSOR_MURO, matDintel, false)
          else bloqueMuro(s.pos, yDintel, c, GROSOR_MURO, hDintel, L, matDintel, false)
          // Marco blanco: cabecero, alfeizar y las dos jambas. Sin peinazo en
          // medio: es un vidrio entero, no dos hojas.
          poner(c, v.alto - M / 2, L, M)
          poner(c, v.base + M / 2, L, M)
          poner(v.ini + M / 2, v.base + hVidrio / 2, M, hVidrio)
          poner(v.fin - M / 2, v.base + hVidrio / 2, M, hVidrio)
          // Y el vidrio, embebido dentro del marco. Salvo si el vano es una
          // REJILLA: la ventanilla de los cuartos de succion no lleva vidrio
          // sino lamas de aluminio escalonadas —pasa el aire y detras va la
          // malla de filtro, pero desde afuera no se ve hacia adentro.
          if (v.rejilla) {
            const libre = hVidrio - M * 2
            const nLamas = Math.max(3, Math.round(libre / 0.16))
            const paso = libre / nLamas
            for (let i = 0; i < nLamas; i++) {
              const lama = new THREE.Mesh(geoCaja, matLama)
              const yy = Y0 + v.base + M + paso * (i + 0.5)
              if (horiz) {
                lama.scale.set(L - M * 2, paso * 1.15, 0.05)
                lama.position.set(c, yy, s.pos)
                lama.rotation.x = -0.62
              } else {
                lama.scale.set(0.05, paso * 1.15, L - M * 2)
                lama.position.set(s.pos, yy, c)
                lama.rotation.z = 0.62
              }
              lama.castShadow = true
              gPuertas.add(lama)
            }
          } else {
          const vidrio = new THREE.Mesh(geoCaja, matVidrio)
          if (horiz) {
            vidrio.scale.set(L - M * 2, hVidrio - M * 2, 0.02)
            vidrio.position.set(c, Y0 + v.base + hVidrio / 2, s.pos)
          } else {
            vidrio.scale.set(0.02, hVidrio - M * 2, L - M * 2)
            vidrio.position.set(s.pos, Y0 + v.base + hVidrio / 2, c)
          }
          gPuertas.add(vidrio)
          }
          // Y frena. Una ventana corriente ya queda tapiada por el antepecho
          // que lleva debajo, pero con `base: 0` esto es una PARED de vidrio
          // entera y sin caja de choque se atravesaba caminando.
          const gx = horiz ? L : GROSOR_MURO, gz = horiz ? GROSOR_MURO : L
          const gcx = horiz ? c : s.pos, gcz = horiz ? s.pos : c
          colisiones.push({
            x0: gcx - gx / 2, x1: gcx + gx / 2,
            z0: gcz - gz / 2, z1: gcz + gz / 2,
            y0: Y0 + v.base, y1: Y0 + v.alto,
          })
          return
        }

        const sinHoja = v.tipo === 'open'
        // Hoja de cristal: el frente de la oficina de produccion es una
        // vidriera —corrediza de un metro y pano fijo al lado—, y con la hoja
        // opaca del resto de corredizas se veia un porton de taller.
        const matHoja = v.tipo === 'loading' ? matPortonCarga
                      : v.cristal ? matVidrio
                      : v.tipo === 'sliding' ? matPortonHoja : matHojaPeatonal
        const pivote = new THREE.Group()
        const hoja = new THREE.Mesh(geoCaja, matHoja)
        hoja.castShadow = !v.cristal
        // La corrediza y la cortina cuelgan del centro del vano; la batiente,
        // de la jamba que le toca, con la hoja tendida hacia el otro lado.
        const arranque = corre || enrolla ? c : (jamba === 1 ? v.ini : v.fin)
        const tendido = corre || enrolla ? 0 : (jamba * anchoHoja) / 2
        if (s.eje === 'h') {
          hoja.scale.set(anchoHoja, v.alto - 0.04, 0.06)
          hoja.position.set(tendido, (v.alto - 0.04) / 2, 0)
          pivote.position.set(arranque, Y0, s.pos + desplante)
        } else {
          hoja.scale.set(0.06, v.alto - 0.04, anchoHoja)
          hoja.position.set(0, (v.alto - 0.04) / 2, tendido)
          pivote.position.set(s.pos + desplante, Y0, arranque)
        }
        pivote.add(hoja)
        if (!sinHoja) gPuertas.add(pivote)

        // Ojo de buey de las peatonales, como en las fotos de la planta. La
        // cortina del muelle no lleva.
        if (!corre && !enrolla) {
          const ojo = new THREE.Mesh(new THREE.CircleGeometry(0.16, 20), matVisorEquipo)
          if (s.eje === 'h') ojo.position.set(tendido, v.alto * 0.72, -0.04)
          else { ojo.rotation.y = -Math.PI / 2; ojo.position.set(-0.04, v.alto * 0.72, tendido) }
          pivote.add(ojo)
        }

        if (!sinHoja) puertas.push({
          pivote,
          corre,
          enrolla,
          // Sentido puesto a mano: el repaso que voltea hojas no la toca.
          fijo: !!v.abreManual,
          eje: s.eje,
          // Punto por donde se pasa: si el visitante se acerca ahí, abre.
          px: s.eje === 'h' ? c : s.pos,
          pz: s.eje === 'h' ? s.pos : c,
          // Firmado: el signo es el lado hacia el que se estaciona la hoja.
          recorrido: corre ? rec * sentido : 0,
          // Lo que sube la cortina al abrir: su propio alto, que la deja
          // recogida sobre el dintel.
          alza: enrolla ? v.alto - 0.04 : 0,
          // Un cuarto de vuelta hacia la cara que le toca. El signo sale de
          // combinar esa cara con la jamba de la que cuelga: colgada del otro
          // lado, la hoja tiene que girar al revés para acabar en el mismo
          // sitio.
          giro: corre || enrolla ? 0
              : (s.eje === 'h' ? -1 : 1) * cara * jamba * (Math.PI / 2),
          abierta: 0,
          meta: 0,       // hacia dónde va: sirve para sonar solo en el cambio
          // Para poder cambiarle el lado a la hoja con la escena ya montada:
          // el riel se mueve con ella, reflejado sobre el centro del vano.
          riel,
          cVano: c,
        })

        // El marco se coloca sobre la cota del muro, igual que el resto del
        // vano. Sin sumar Y0, el de una puerta del segundo nivel aterrizaba en
        // el suelo de la planta baja: aislando el nivel 2 se veian jambas y
        // cabeceros sueltos alla abajo, sin muro ni puerta alrededor.
        if (s.eje === 'h') {
          bloqueMuro(c, yDintel, s.pos, L, hDintel, GROSOR_MURO, matDintel, false)
          // jambas
          ;[v.ini, v.fin].forEach((px) => {
            const j = new THREE.Mesh(geoCaja, matPuerta)
            j.position.set(px, Y0 + v.alto / 2, s.pos)
            j.scale.set(0.1, v.alto, GROSOR_MURO + 0.06)
            j.castShadow = true
            gPuertas.add(j)
          })
          const cab = new THREE.Mesh(geoCaja, matPuerta)
          cab.position.set(c, Y0 + v.alto + 0.06, s.pos)
          cab.scale.set(L + 0.1, 0.12, GROSOR_MURO + 0.06)
          gPuertas.add(cab)
        } else {
          bloqueMuro(s.pos, yDintel, c, GROSOR_MURO, hDintel, L, matDintel, false)
          ;[v.ini, v.fin].forEach((pz) => {
            const j = new THREE.Mesh(geoCaja, matPuerta)
            j.position.set(s.pos, Y0 + v.alto / 2, pz)
            j.scale.set(GROSOR_MURO + 0.06, v.alto, 0.1)
            j.castShadow = true
            gPuertas.add(j)
          })
          const cab = new THREE.Mesh(geoCaja, matPuerta)
          cab.position.set(s.pos, Y0 + v.alto + 0.06, c)
          cab.scale.set(GROSOR_MURO + 0.06, 0.12, L + 0.1)
          gPuertas.add(cab)
        }

        if (v.tipo === 'loading') muelleDeCarga(s, v, c, L)
      })
    })

    /**
     * Muelle de carga. NO lleva plataforma saliente: el muelle es el borde mismo
     * del edificio — el piso interior llega hasta el muro y el terreno de afuera
     * queda más abajo, que es la altura a la que arrima la batea del camión.
     * Se dibuja lo que sí sobresale en las fotos: la franja amarilla del filo y
     * los topes de caucho en la cara del zócalo. Nada de esto bloquea el paso,
     * porque delante del muelle se cruza a pie y el camión solo está mientras
     * carga o descarga.
     */
    function muelleDeCarga(s, v, c, L) {
      const fuera = { arriba: -1, izquierda: -1, abajo: 1, derecha: 1 }[v.lado] || 1
      const filo = GROSOR_MURO / 2
      const ancho = L + 0.6

      const franja = new THREE.Mesh(geoCaja, matFranja)
      if (s.eje === 'h') {
        franja.position.set(c, 0.008, s.pos + fuera * (filo + 0.09))
        franja.scale.set(ancho, 0.016, 0.18)
      } else {
        franja.position.set(s.pos + fuera * (filo + 0.09), 0.008, c)
        franja.scale.set(0.18, 0.016, ancho)
      }
      gMuros.add(franja)

      // Topes de caucho, atornillados a la cara del zócalo bajo el filo
      ;[-0.62, 0.62].forEach((t) => {
        const tope = new THREE.Mesh(geoCaja, matTope)
        const y = NIVEL_TERRENO / 2
        if (s.eje === 'h') {
          tope.position.set(c + t * (L / 2), y, s.pos + fuera * (filo + 0.06))
          tope.scale.set(0.42, 0.16, 0.12)
        } else {
          tope.position.set(s.pos + fuera * (filo + 0.06), y, c + t * (L / 2))
          tope.scale.set(0.12, 0.16, 0.42)
        }
        gMuros.add(tope)
      })
    }

    // Se aplaza a un microtask porque los equipos se montan mas abajo que este
    // punto del archivo: midiendo aqui mismo, gEquipos todavia esta vacio y una
    // corrediza se "arreglaba" metiendose dentro de una maquina.
    // ── Lado de apertura: se decide midiendo, no solo por regla ──────────────
    // Las reglas de mas arriba eligen el lado mirando unicamente el propio tramo
    // de muro, y no ven lo que hay de verdad al otro lado: un muro perpendicular,
    // un equipo o la hoja de la puerta de al lado. Con la escena ya montada si se
    // puede comprobar: se abre cada hoja de par en par y, si invade la franja por
    // la que se pasa, se prueba el lado contrario y gana el que menos estorbe.
    // Asi salieron de sitio una batiente del pasillo que se metia entera en el
    // muro y los dos pares de corredizas que se montaban una sobre otra. Solo se
    // cambia lo que mejora de forma clara: la hoja que ya estaba en su mejor lado
    // se queda donde estaba.
    /**
     * Funde las mallas estaticas de un grupo en una sola por material.
     *
     * three.js dibuja UNA llamada por malla: 907 tabiques son 907 llamadas para
     * 10.884 triangulos, y el cuello de esta escena no son los triangulos sino
     * las llamadas. Todos comparten la misma caja y once materiales, asi que se
     * juntan en once mallas sin que cambie un pixel.
     *
     * Lo que se pierde es el descarte por camara de cada muro: la malla fundida
     * se dibuja siempre. A cambio de bajar de 907 llamadas a once, dibujar unos
     * miles de triangulos de mas no se nota.
     *
     * La union va a mano porque el three que trae el proyecto (r149, global sin
     * modulos) NO incluye BufferGeometryUtils — lo unico que aparece con ese
     * nombre es el texto del aviso de `BufferGeometry.merge()`. Se normaliza
     * todo a no indexado antes de concatenar: la caja es indexada y los faldones
     * de cubierta vienen crudos y sin `uv`, y sin normalizar los atributos se
     * desalinean.
     *
     * CUANDO: al final del microtask del estorbo, nunca antes. Ese microtask
     * mide una caja POR MALLA para decidir hacia donde abre cada hoja; con los
     * muros ya fundidos veria diez cajas del tamano de la planta y voltearia
     * puertas que estaban bien. El sintoma no seria un error en consola, seria
     * un puñado de puertas abriendo al lado que no.
     */
    function fusionarEstaticos(grupo, saltar, profundo) {
      grupo.updateMatrixWorld(true)
      const aLocal = grupo.matrixWorld.clone().invert()
      const cubos = new Map()
      // `profundo` entra en los subgrupos: los equipos no cuelgan sueltos del
      // grupo, cada maquina es un grupo con sus veintitantas piezas dentro.
      const candidatos = []
      if (profundo) grupo.traverse((o) => candidatos.push(o))
      else candidatos.push(...grupo.children)
      candidatos.forEach((o) => {
        const g = o.geometry
        if (!o.isMesh || !o.visible || Array.isArray(o.material) || !g || !g.attributes ||
            !g.attributes.position || (saltar && saltar(o))) return
        // Se agrupa tambien por sombra y orden de dibujo: fundir una malla que
        // no proyecta con otra que si le cambiaria la sombra.
        const clave = `${o.material.uuid}|${o.castShadow ? 1 : 0}|${o.receiveShadow ? 1 : 0}|${o.renderOrder}`
        if (!cubos.has(clave)) cubos.set(clave, [])
        cubos.get(clave).push(o)
      })
      let ahorradas = 0
      cubos.forEach((lista) => {
        if (lista.length < 2) return
        const partes = []
        let vertices = 0
        lista.forEach((o) => {
          const g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone()
          g.applyMatrix4(o.matrixWorld)
          g.applyMatrix4(aLocal)
          partes.push(g)
          vertices += g.attributes.position.count
        })
        const pos = new Float32Array(vertices * 3)
        const nor = new Float32Array(vertices * 3)
        const uv = new Float32Array(vertices * 2)
        let d3 = 0, d2 = 0
        partes.forEach((g) => {
          const a = g.attributes
          pos.set(a.position.array, d3)
          if (a.normal) nor.set(a.normal.array, d3)
          if (a.uv) uv.set(a.uv.array, d2)
          d3 += a.position.count * 3
          d2 += a.position.count * 2
          g.dispose()
        })
        const geo = new THREE.BufferGeometry()
        geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
        geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3))
        geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2))
        geo.computeBoundingSphere()
        const malla = new THREE.Mesh(geo, lista[0].material)
        malla.castShadow = lista[0].castShadow
        malla.receiveShadow = lista[0].receiveShadow
        malla.renderOrder = lista[0].renderOrder
        malla.name = `${grupo.name}-fundido`
        lista.forEach((o) => o.parent && o.parent.remove(o))
        grupo.add(malla)
        ahorradas += lista.length - 1
      })
      return ahorradas
    }

    queueMicrotask(() => {
      const Y_BAJO = 0.10, Y_ALTO = 1.90   // franja del cuerpo al pasar
      const recorta = (b) => {
        b.min.y = Math.max(b.min.y, Y_BAJO)
        b.max.y = Math.min(b.max.y, Y_ALTO)
        return b
      }
      const volumen = (b) =>
        Math.max(0, b.max.x - b.min.x) * Math.max(0, b.max.y - b.min.y) * Math.max(0, b.max.z - b.min.z)
      const corte = (a, b) => {
        const dx = Math.min(a.max.x, b.max.x) - Math.max(a.min.x, b.min.x)
        const dy = Math.min(a.max.y, b.max.y) - Math.max(a.min.y, b.min.y)
        const dz = Math.min(a.max.z, b.max.z) - Math.max(a.min.z, b.min.z)
        return (dx <= 0 || dy <= 0 || dz <= 0) ? 0 : dx * dy * dz
      }
      // El riel de una corrediza acompana a su hoja: no cuenta como estorbo.
      const rieles = new Set(puertas.map((p) => p.riel).filter(Boolean))
      const fijos = []
      for (const o of gMuros.children) if (!rieles.has(o)) fijos.push(recorta(new THREE.Box3().setFromObject(o)))
      for (const o of gEquipos.children) fijos.push(recorta(new THREE.Box3().setFromObject(o)))

      // Caja de la hoja abierta del todo, sin dejar la puerta movida.
      const cajaAbierta = (p) => {
        const hoja = p.pivote.children[0]
        const g = { rot: p.pivote.rotation.y, x: hoja.position.x, z: hoja.position.z, sy: hoja.scale.y, y: hoja.position.y }
        if (p.enrolla) { hoja.scale.y = 0.06; hoja.position.y = g.sy - 0.03 }
        else if (p.corre) { if (p.eje === 'h') hoja.position.x = p.recorrido; else hoja.position.z = p.recorrido }
        else p.pivote.rotation.y = p.giro
        p.pivote.updateMatrixWorld(true)
        const b = recorta(new THREE.Box3().setFromObject(hoja))
        p.pivote.rotation.y = g.rot
        hoja.position.x = g.x; hoja.position.z = g.z
        hoja.scale.y = g.sy; hoja.position.y = g.y
        p.pivote.updateMatrixWorld(true)
        return b
      }
      // Cuanto invade, en tanto por uno de su propio volumen.
      const estorbo = (i, cajas) => {
        const b = cajas[i]
        const v = volumen(b)
        if (v <= 0) return 0
        let peor = 0
        for (const c of fijos) { const x = corte(b, c); if (x > peor) peor = x }
        for (let k = 0; k < cajas.length; k++) {
          if (k === i) continue
          const x = corte(b, cajas[k]); if (x > peor) peor = x
        }
        return peor / v
      }
      // Al otro lado: la corrediza corre al reves y su riel se refleja sobre el
      // centro del vano; la batiente gira hacia la otra cara.
      const voltear = (p) => {
        if (p.corre) {
          p.recorrido = -p.recorrido
          if (p.riel) {
            const eje = p.eje === 'h' ? 'x' : 'z'
            p.riel.position[eje] = 2 * p.cVano - p.riel.position[eje]
            p.riel.updateMatrixWorld(true)
          }
        } else p.giro = -p.giro
      }

      let recolocadas = 0
      // Dos vueltas: al mover una hoja cambia lo que estorba a sus vecinas.
      for (let vuelta = 0; vuelta < 2; vuelta++) {
        const cajas = puertas.map((p) => cajaAbierta(p))
        for (let i = 0; i < puertas.length; i++) {
          const p = puertas[i]
          if (p.enrolla) continue                 // la cortina sube: no tiene otro lado
          if (p.fijo) continue                    // sentido escrito a mano: no se discute
          const ahora = estorbo(i, cajas)
          if (ahora <= 0.15) continue
          const previa = cajas[i]
          voltear(p)
          cajas[i] = cajaAbierta(p)
          if (estorbo(i, cajas) < ahora - 0.05) recolocadas++
          else { voltear(p); cajas[i] = previa }  // no mejora: se deja como estaba
        }
      }
      globalThis.__PLANTA3D.hojasRecolocadas = recolocadas

      // Y solo ahora, con el estorbo ya medido malla por malla y las hojas en
      // su sitio definitivo, se funden los estaticos. Ni un cuadro antes.
      // Quedan fuera a proposito: los pisos y los cuerpos de los equipos, que
      // son el blanco del clic para ver detalle; las puertas, que se mueven; y
      // la cubierta, que viene apagada y no cuesta llamadas.
      // De los equipos se conservan intactas las dos piezas que hacen falta por
      // maquina: el CUERPO, que es el blanco del clic para ver detalle, y el
      // rotulo, que es un sprite y no entra. Lo demas —bases, aros, bandas,
      // franjas, marcos, pilotos, placas— es decoracion que ni se pincha ni se
      // mueve. Esto solo funde algo porque antes se repartieron los materiales:
      // con un material nuevo por maquina no habria dos mallas que juntar.
      const ahorradas = fusionarEstaticos(gMuros, (o) => rieles.has(o))
        + fusionarEstaticos(gCielos)
        + fusionarEstaticos(gEntrepiso)
        + fusionarEstaticos(gEquipos, (o) => !!(o.userData && o.userData.tipo), true)
      globalThis.__PLANTA3D.llamadasAhorradas = ahorradas
      if (ahorradas) console.info(`[planta3d] ${ahorradas} llamada(s) de dibujo menos al fundir estaticos`)
    })

    globalThis.__PLANTA3D.puertas = puertas
    globalThis.__PLANTA3D.colisiones = colisiones
    globalThis.__PLANTA3D.losa = { alto: ENTREPISO, trozos: trozosLosa, hundidos: suelosNivel2 }
    globalThis.__PLANTA3D.rampas = rampas
    globalThis.__PLANTA3D.segmentos = [...segmentos.entries()].map(([clave, r]) => ({
      clave,
      eje: r.eje, pos: r.pos, a: r.a, b: r.b, alto: r.alto, sube: !!r.sube,
      cota: r.cota || 0, subeHasta: r.subeHasta || null,
      // centro de cada vano del tramo: sirve para cazar hojas repetidas
      vanos: r.vanos.map((v) => ({ c: round2(v.c), ancho: v.ancho, tipo: v.tipo })),
    }))

    // ── Techos (traslúcidos, se pueden apagar) ─────────────────────────────
    datos.rooms.forEach((r) => {
      if (!r._cat.muro) return
      if (!seVeNivel(esNivel2(r) ? 2 : 1)) return
      // Los cuartos de maquinas van DESPEJADOS por arriba: los de nacedoras son
      // fosos abiertos al segundo nivel y los de incubadoras se abren a la nave.
      // Este techo se los tapaba con una tapa a 3,42, y ademas se veia rosada
      // porque el tipo `technical` es lila: era lo unico que quedaba cerrandolos
      // cuando se encendia la capa de techos.
      if (esCuartoMaquinas(r)) return
      // El techo se apoya en la cota de la sala, no en 0: sin esto, el techo
      // de una sala del nivel 2 quedaba flotando dentro de su propio cuerpo
      // (a la altura del tipo desde el suelo, muy por debajo de su piso real).
      const alto = cotaDe(r) + alturaDe(r)
      // Y no se dibuja si no cabe bajo la cubierta. El AREA TECNICA del segundo
      // nivel mide 2,90 desde su losa: su plato quedaba a 6,32, metro y medio
      // por encima del faldon en los dos extremos de la nave, y desde afuera se
      // veian dos manchas lila cruzando el techo de lado a lado. Donde el plato
      // no cabe, el techo de esa sala ES la cubierta.
      let cabe = true
      for (let z = r.y; z <= r.y + r.h + 0.001 && cabe; z += 0.25)
        if (alto + 0.02 > alturaBajoCubierta(z) + 0.10) cabe = false
      if (!cabe) return
      const techo = new THREE.Mesh(
        new THREE.PlaneGeometry(r.w, r.h),
        new THREE.MeshStandardMaterial({
          color: tono(r._color, 0.55),
          roughness: 0.85,
          transparent: true,
          opacity: 0.9,
          side: THREE.DoubleSide,
        })
      )
      techo.rotation.x = Math.PI / 2
      techo.position.set(r._centro.x, alto + 0.02, r._centro.z)
      techo.castShadow = true
      gTechos.add(techo)
    })

    // ── Faldones de la cubierta ────────────────────────────────────────────
    // Se arman sala por sala en vez de como dos planos grandes, porque la
    // planta no es un rectangulo: el borde sur va escalonado y un faldon
    // rectangular sobresaldria por los entrantes. Una sala que cruza la
    // cumbrera se parte en dos aguas.
    const matCubierta = new THREE.MeshStandardMaterial({
      color: 0x9fb0c2, roughness: 0.72, metalness: 0.12,
      transparent: true, opacity: 0.92, side: THREE.DoubleSide,
    })
    const faldon = (x0, x1, z0, z1) => {
      if (x1 - x0 < 0.05 || z1 - z0 < 0.05) return
      const g = new THREE.BufferGeometry()
      const y0 = alturaBajoCubierta(z0), y1 = alturaBajoCubierta(z1)
      g.setAttribute('position', new THREE.Float32BufferAttribute([
        x0, y0, z0, x1, y0, z0, x1, y1, z1,
        x0, y0, z0, x1, y1, z1, x0, y1, z1,
      ], 3))
      g.computeVertexNormals()
      const m = new THREE.Mesh(g, matCubierta)
      m.castShadow = true
      gTechos.add(m)
    }
    // La cubierta vuela sobre el muro lo que mide la canoa, y nada mas: los
    // corredores exteriores quedan practicamente a la intemperie. Solo vuela
    // por el lado que da afuera, no contra la sala vecina.
    const VUELO = datos.meta.aleroVuelo || 0
    const interiores3d = datos.rooms.filter((o) => !o.exterior)
    const daAfuera = (r, lado) => !interiores3d.some((o) => {
      if (o.id === r.id) return false
      if (lado === 'n') return Math.abs(o.y + o.h - r.y) < 0.2 && o.x < r.x + r.w - 0.2 && o.x + o.w > r.x + 0.2
      if (lado === 's') return Math.abs(o.y - (r.y + r.h)) < 0.2 && o.x < r.x + r.w - 0.2 && o.x + o.w > r.x + 0.2
      if (lado === 'o') return Math.abs(o.x + o.w - r.x) < 0.2 && o.y < r.y + r.h - 0.2 && o.y + o.h > r.y + 0.2
      return Math.abs(o.x - (r.x + r.w)) < 0.2 && o.y < r.y + r.h - 0.2 && o.y + o.h > r.y + 0.2
    })
    datos.rooms.forEach((r) => {
      // Tambien los pasillos: `_cat.muro` dice si la sala levanta tabiques, no
      // si tiene techo encima. Sin esto la cubierta quedaba agujereada por
      // encima de cada pasillo.
      if (r.exterior) return
      // Solo la planta baja arma el faldon: una sala del segundo nivel esta
      // bajo el mismo techo que la de abajo, y cuando comparten huella exacta
      // —incubadoras 1 y su cuarto de maquinas— salia dibujado dos veces.
      if (esNivel2(r)) return
      const vN = daAfuera(r, 'n') ? VUELO : 0, vS = daAfuera(r, 's') ? VUELO : 0
      const vO = daAfuera(r, 'o') ? VUELO : 0, vE = daAfuera(r, 'e') ? VUELO : 0
      const x0f = r.x - vO, x1f = r.x + r.w + vE
      const z0 = r.y - vN, z1 = r.y + r.h + vS, cz = Z_CUMBRERA
      if (z0 < cz && z1 > cz) { faldon(x0f, x1f, z0, cz); faldon(x0f, x1f, cz, z1) }
      else faldon(x0f, x1f, z0, z1)
    })

    // ── Terraza ────────────────────────────────────────────────────────────
    // El ala de oficinas no va bajo la cubierta a dos aguas: remata en losa
    // plana transitable, con antepecho de panel blanco en los 360 grados y su
    // pasamanos de aluminio encima. Lo marca `terraza: true` en el plano.
    const matLosaTerraza = new THREE.MeshStandardMaterial({ color: 0xeef1f4, roughness: 0.8, metalness: 0.04 })
    const matPanelTerraza = new THREE.MeshStandardMaterial({ color: 0xf7f9fb, roughness: 0.5, metalness: 0.06 })
    const matPasamanos = new THREE.MeshStandardMaterial({ color: 0xc6ced8, roughness: 0.35, metalness: 0.65 })
    const ALTO_ANTEPECHO = 0.95
    datos.rooms.filter((r) => r.terraza && seVeNivel(esNivel2(r) ? 2 : 1)).forEach((r) => {
      // La losa se apoya en el muro MAS ALTO del bloque: la envolvente declara
      // 2,50 pero sus tabiques interiores miden 2,90, y una losa a 2,50 los
      // dejaba asomados por encima.
      let alto = cotaDe(r) + alturaDe(r)
      datos.rooms.forEach((o) => {
        if (o.id === r.id || o.exterior) return
        if (o.x < r.x - 0.05 || o.x + o.w > r.x + r.w + 0.05) return
        if (o.y < r.y - 0.05 || o.y + o.h > r.y + r.h + 0.05) return
        alto = Math.max(alto, cotaDe(o) + alturaDe(o))
      })
      const losa = new THREE.Mesh(geoCaja, matLosaTerraza)
      losa.position.set(r.x + r.w / 2, alto + 0.09, r.y + r.h / 2)
      losa.scale.set(r.w + GROSOR_MURO + 0.2, 0.18, r.h + GROSOR_MURO + 0.2)
      losa.castShadow = true
      losa.receiveShadow = true
      gTechos.add(losa)

      const yAnt = alto + 0.18
      aristasDe(r).forEach((s) => {
        const largo = s.b - s.a + GROSOR_MURO
        const cu = (s.a + s.b) / 2
        const poner = (h, y, e, mat) => {
          const m = new THREE.Mesh(geoCaja, mat)
          if (s.eje === 'h') { m.position.set(cu, y, s.pos); m.scale.set(largo, h, e) }
          else { m.position.set(s.pos, y, cu); m.scale.set(e, h, largo) }
          m.castShadow = true
          gTechos.add(m)
        }
        poner(ALTO_ANTEPECHO, yAnt + ALTO_ANTEPECHO / 2, 0.12, matPanelTerraza)
        poner(0.07, yAnt + ALTO_ANTEPECHO + 0.035, 0.2, matPasamanos)
      })
    })

    // ── Contorno del segundo nivel ─────────────────────────────────────────
    // Mientras no haya salas dibujadas arriba, el entrepiso se cierra con su
    // propio contorno: un muro que va de la losa a la cubierta por todo el
    // borde del ala. Así el volumen queda estanco —la planta es de ambiente
    // controlado— y por dentro queda el espacio libre para dibujar.
    //
    // El borde se saca sala por sala: un lado es contorno si la sala de
    // enfrente no tiene entrepiso, o si no hay ninguna.
    const conEntrepiso = datos.rooms.filter(llevaEntrepiso)
    // Los TRAMOS de un lado que no tienen losa enfrente, no un si/no para el
    // lado entero: a un borde le basta con que una sala con entrepiso le tape
    // la mitad para que el contorno no se levantara en la otra mitad. Asi
    // quedaban abiertos, entre 2,90 y la cubierta, el costado de Lavado
    // Nacimiento por donde no llega el almacen de canastas, y otros pocos.
    const bordeSinEntrepiso = (r, lado) => {
      const h = lado === 'n' || lado === 's'
      const a0 = h ? r.x : r.y, a1 = h ? r.x + r.w : r.y + r.h
      const cubierto = []
      for (const o of conEntrepiso) {
        if (o.id === r.id) continue
        const pega =
          lado === 'n' ? Math.abs(o.y + o.h - r.y) < 0.25
          : lado === 's' ? Math.abs(o.y - (r.y + r.h)) < 0.25
          : lado === 'o' ? Math.abs(o.x + o.w - r.x) < 0.25
          : Math.abs(o.x - (r.x + r.w)) < 0.25
        if (!pega) continue
        const b0 = h ? o.x : o.y, b1 = h ? o.x + o.w : o.y + o.h
        if (Math.min(a1, b1) - Math.max(a0, b0) > 0.2) cubierto.push([Math.max(a0, b0), Math.min(a1, b1)])
      }
      cubierto.sort((p, q) => p[0] - q[0])
      const libres = []
      let cur = a0
      for (const [p, q] of cubierto) { if (p > cur + 0.05) libres.push([cur, p]); cur = Math.max(cur, q) }
      if (cur < a1 - 0.05) libres.push([cur, a1])
      return libres
    }
    // El contorno cierra el borde del PISO del segundo nivel, así que solo tiene
    // sentido donde de verdad hay piso arriba. La losa se dibuja por sala de la
    // planta baja, y dos de ellas asoman por fuera de lo que el nivel 2 ocupa
    // —la SALA RECEPCIÓN DE HUEVOS entera, y el extremo occidental del PASILLO
    // S25, que es más largo que el área técnica—. Ahí quedaban dos plataformas
    // peladas con su antepecho levantado, flotando en el aire y sin pertenecer a
    // ninguna sala: las dos formas raras que se veían al aislar el nivel 2.
    const polisNivel2 = datos.rooms.filter(esNivel2).map((r) => esLibre(r) ? contornoDe(r) : [
      { x: r.x, z: r.y }, { x: r.x + r.w, z: r.y },
      { x: r.x + r.w, z: r.y + r.h }, { x: r.x, z: r.y + r.h },
    ])
    const hayPisoArriba = (px, pz) => polisNivel2.some((pol) => {
      let d = false
      for (let i = 0, j = pol.length - 1; i < pol.length; j = i++) {
        const xi = pol[i].x, zi = pol[i].z, xj = pol[j].x, zj = pol[j].z
        if (((zi > pz) !== (zj > pz)) && (px < ((xj - xi) * (pz - zi)) / (zj - zi) + xi)) d = !d
      }
      return d
    })
    let tramosContorno = 0
    let interiores = 0   // paños descartados por caer dentro de la losa, no en su borde
    if (ENTREPISO > 0 && seVeNivel(2)) {
      const PASO = 0.5
      const alza = (cx, cz, largoX, largoZ) => {
        // El muro sigue la pendiente de la cubierta: si corre cruzándola, se
        // parte en tramos para que su remate acompañe el faldón.
        const techo = alturaBajoCubierta(cz)
        const h = techo - ENTREPISO
        if (h <= 0.05) return
        bloqueMuro(cx, ENTREPISO + h / 2, cz, largoX, h, largoZ, matMuro, true)
        tramosContorno++
      }
      // Dos salas que compartan borde piden el mismo tramo de contorno —el
      // almacen de repuestos y la sala de incubadoras 2 lo hacian en x=12— y
      // salia el muro dibujado dos veces. Se recogen primero y se levanta uno.
      const puestos = new Set()
      // Si por ahi ya sube un muro del nivel 1 hasta la cubierta —porque debajo
      // cae el perimetro de un salon de arriba, o porque es fachada— el
      // contorno sobra: seria el mismo panel dos veces. El contorno solo cierra
      // donde no hay nada que suba.
      const yaSube = (cx, cz, lx, lz) => {
        const eje = lx > lz ? 'h' : 'v'
        const pos = eje === 'h' ? cz : cx
        const a = eje === 'h' ? cx - lx / 2 : cz - lz / 2
        const b = eje === 'h' ? cx + lx / 2 : cz + lz / 2
        for (const g of segmentos.values()) {
          if (g.eje !== eje || Math.abs(g.pos - pos) > 0.3) continue
          if ((g.cota || 0) > 0.05 || g.subeHasta !== 'techo') continue
          if (g.a <= a + 0.05 && g.b >= b - 0.05) return true
        }
        return false
      }
      // `ix`/`iz` apuntan hacia adentro de la sala, que es el lado donde estaría
      // el piso: si a 30 cm para allá no hay sala del nivel 2, ese borde no es
      // borde de nada y no se levanta.
      const unaVez = (cx, cz, lx, lz, ix, iz) => {
        const k = [cx, cz, lx, lz].map((v) => v.toFixed(2)).join('|')
        if (puestos.has(k)) return
        puestos.add(k)
        if (!hayPisoArriba(cx + ix * 0.3, cz + iz * 0.3)) return
        // Y si TAMBIÉN hay losa del otro lado, esto no es un borde: es un muro
        // plantado en mitad del entrepiso. Pasa donde dos salas de la planta
        // baja se SOLAPAN en vez de tocarse —la sala de transferencia entra
        // medio metro en el pasillo túnel, y la de vacunación un metro en el
        // lavado de nacimiento—: el vecino no cuenta como pegado (el `pega` de
        // arriba pide 25 cm), el borde se daba por libre y se levantaban cuatro
        // paños que encerraban un hueco de 2 × 0,5 m y otro de 1,5 × 1, de la
        // losa a la cubierta. Dos saloncitos que no son ninguna sala, que no
        // salen en el plano —porque no existen— y que no se podían borrar.
        if (hayPisoArriba(cx - ix * 0.3, cz - iz * 0.3)) { interiores++; return }
        if (yaSube(cx, cz, lx, lz)) return
        alza(cx, cz, lx, lz)
      }
      for (const r of conEntrepiso) {
        for (const [lado, zz, iz] of [['n', r.y, 1], ['s', r.y + r.h, -1]]) {
          for (const [p, q] of bordeSinEntrepiso(r, lado)) unaVez((p + q) / 2, zz, q - p, GROSOR_MURO, 0, iz)
        }
        for (const [lado, xx, ix] of [['o', r.x, 1], ['e', r.x + r.w, -1]]) {
          for (const [p, q] of bordeSinEntrepiso(r, lado)) {
            const n = Math.max(1, Math.ceil((q - p) / PASO))
            for (let k = 0; k < n; k++) {
              const z1 = p + ((q - p) * k) / n, z2 = p + ((q - p) * (k + 1)) / n
              unaVez(xx, (z1 + z2) / 2, GROSOR_MURO, z2 - z1, ix, 0)
            }
          }
        }
      }
      console.info(`[planta3d] contorno del segundo nivel: ${tramosContorno} tramos` +
        (interiores ? ` (${interiores} descartados por quedar dentro de la losa)` : ''))
    }

    // ── Techos internos propios ────────────────────────────────────────────
    // La oficina lleva cielo raso a la altura del entrepiso porque tiene aire
    // acondicionado, pero no es segundo nivel: es solo un techo mas bajo que la
    // nave, con el volumen de la cubierta por encima.
    const TECHO_PROPIO = datos.meta.techoPropio || {}
    const matCieloRaso = new THREE.MeshStandardMaterial({
      color: 0xdfe6ee, roughness: 0.92, metalness: 0.03, side: THREE.DoubleSide,
    })
    let cielosRasos = 0
    datos.rooms.forEach((r) => {
      const cota = TECHO_PROPIO[r.code]
      if (!cota) return
      if (!seVeNivel(esNivel2(r) ? 2 : 1)) return
      const cr = new THREE.Mesh(new THREE.PlaneGeometry(r.w, r.h), matCieloRaso)
      cr.rotation.x = Math.PI / 2
      cr.position.set(r._centro.x, cota, r._centro.z)
      cr.receiveShadow = true
      gTechos.add(cr)
      cielosRasos++
    })
    if (cielosRasos) console.info(`[planta3d] ${cielosRasos} techo(s) interno(s) propio(s)`)

    // ── Tapa de los tuneles ────────────────────────────────────────────────
    // Los cuatro tuneles almacenan aire limpio del exterior: son volumenes
    // sellados, del mismo panel que el resto de la planta, y solo se abren por
    // sus escotillas para mantenimiento. Sin tapa quedaban como cajas abiertas
    // por arriba y el aire se escaparia contra la cubierta.
    let tapas = 0
    datos.rooms.forEach((r) => {
      if (!esTunel(r)) return
      if (!seVeNivel(esNivel2(r) ? 2 : 1)) return
      const y = cotaDe(r) + alturaDe(r) + GROSOR_MURO / 2
      bloqueMuro(r._centro.x, y, r._centro.z, r.w + GROSOR_MURO, GROSOR_MURO, r.h + GROSOR_MURO, matMuro, true)
      tapas++
    })
    if (tapas) console.info(`[planta3d] ${tapas} tunel(es) sellado(s) por arriba`)

    // ── Entrepiso del segundo nivel ────────────────────────────────────────
    // Losa a 3,40 sobre el ala de incubadoras, en su propio grupo: aislando el
    // nivel 2 tiene que verse siempre —es el suelo que se pisa alli arriba— y
    // con los dos niveles a la vista sigue al interruptor de techos, que es lo
    // que permite mirar la planta baja desde arriba.
    // Con los dos niveles a la vista la losa va TRASLUCIDA: tiene que verse —si
    // no, el segundo nivel aparece flotando sobre el suelo de la planta baja,
    // sin piso debajo— pero sin tapar lo que hay abajo. Aislando el nivel 2 se
    // pone opaca, que ahi es el suelo que se pisa.
    const matEntrepiso = new THREE.MeshStandardMaterial({
      color: 0xb9c4d0, roughness: 0.9, metalness: 0.04, side: THREE.DoubleSide,
      transparent: nivelFiltro !== 2, opacity: nivelFiltro === 2 ? 1 : 0.55,
    })
    // Los cuartos de maquinas cuelgan un metro del entrepiso: su piso esta a
    // 2,40 y la losa NO pasa por encima de ninguno. Los de las nacedoras quedan
    // asi como fosos abiertos —se ven desde el nivel 2 y no se cruzan, que es
    // como estan en la planta— y los de las incubadoras como salas hundidas, en
    // las que se baja ese metro. Mientras la losa los tapaba a todos, en las
    // incubadoras se caminaba sobre un suelo que no existe.
    //
    // La excepcion es el foso de NAC 4: la puerta del area tecnica cae justo
    // encima, y sin un panel delante no habria por donde llegar a ella. Ese
    // panel es el unico trozo de losa que cruza un foso, y se coloca DONDE
    // ESTA LA PUERTA, no a ojo: si la puerta se mueve en el plano, el panel la
    // sigue. Las puertas se buscan solo en las salas del nivel 2 que no son
    // cuartos de maquinas ni tuneles —la del propio cuarto de maquinas de
    // incubadoras no pide panel, porque ahi si se entra bajando.
    // ── El borde de la losa sobre un foso de incubadoras no frena ──────────
    // A esos cuartos «se entra bajando el metro, no cruzando por encima», y ese
    // metro es justo lo que mide su muro: de la cota del foso (2,40) al piso del
    // nivel 2 (3,40). Como muro, dejaba al visitante clavado — cruzaba la puerta
    // del área técnica, caía al foso y ya no podía ni entrar al túnel ni volver
    // a subir, porque el borde le tapaba los cuatro costados. Quien decide si el
    // paso vale es el escalón del piso, no esta caja.
    const bordesDeFoso = datos.rooms.filter(esCuartoMaquinasIncubadoras).map((o) => ({
      x0: o.x - 0.25, x1: o.x + o.w + 0.25, z0: o.y - 0.25, z1: o.y + o.h + 0.25,
      y0: cotaDe(o), y1: cotaDe(o) + CAIDA_CUARTO_MAQUINAS,
    }))
    let bordesSueltos = 0
    colisiones.forEach((c) => {
      if (c.y0 == null || c.y1 == null) return
      const esBorde = bordesDeFoso.some((f) =>
        Math.abs(c.y0 - f.y0) < 0.06 && Math.abs(c.y1 - f.y1) < 0.06 &&
        c.x1 > f.x0 && c.x0 < f.x1 && c.z1 > f.z0 && c.z0 < f.z1)
      if (!esBorde) return
      c.bordeLosa = true
      bordesSueltos++
    })
    if (bordesSueltos) console.info(`[planta3d] ${bordesSueltos} tramo(s) de borde de foso liberados`)

    const fososDeMaquinas = datos.rooms.filter(esCuartoMaquinas)
      .map((o) => ({ x0: o.x, x1: o.x + o.w, z0: o.y, z1: o.y + o.h }))
    // Lo que ocupa el suelo del nivel 2 y no se pisa: los fosos, que son huecos,
    // y los tuneles, que son volumenes cerrados apoyados encima. Sin restar los
    // tuneles, su huella quedaba marcada como suelo y aparecia como una isla
    // inalcanzable dentro de sus propios muros.
    const ocupanElSuelo = fososDeMaquinas.concat(
      datos.rooms.filter((o) => esTunel(o) || esEscalera(o))
        .map((o) => ({ x0: o.x, x1: o.x + o.w, z0: o.y, z1: o.y + o.h }))
    )
    const PANEL_PUERTA = 1.6
    const puertasDelNivel2 = datos.rooms
      .filter((o) => esNivel2(o) && !esCuartoMaquinas(o) && !esTunel(o))
      .flatMap((o) => (o.doors ?? []).map((d) => ({
        x: o.x + (Number(d.x) || 0), z: o.y + (Number(d.y) || 0),
      })))
    const huecosLosa = []
    let panelesSobreFoso = 0
    datos.rooms.filter(esCuartoMaquinas).forEach((o) => {
      const entero = { x: o.x, y: o.y, w: o.w, h: o.h }
      // Solo los fosos abiertos —los de nacedoras— necesitan panel: en los de
      // incubadoras se entra bajando el metro, no cruzando por encima.
      const puerta = esCuartoMaquinasIncubadoras(o) ? null : puertasDelNivel2.find((d) =>
        d.x > o.x && d.x < o.x + o.w && d.z > o.y - 1.2 && d.z < o.y + o.h + 1.2)
      if (!puerta) { huecosLosa.push(entero); return }
      const a = Math.max(o.x, puerta.x - PANEL_PUERTA / 2)
      const b = Math.min(o.x + o.w, puerta.x + PANEL_PUERTA / 2)
      if (a - o.x > 0.02) huecosLosa.push({ x: o.x, y: o.y, w: a - o.x, h: o.h })
      if (o.x + o.w - b > 0.02) huecosLosa.push({ x: b, y: o.y, w: o.x + o.w - b, h: o.h })
      panelesSobreFoso++
    })
    if (panelesSobreFoso) console.info(`[planta3d] ${panelesSobreFoso} panel(es) de paso sobre foso`)

    // Y el piso de los cuartos de maquinas de INCUBADORAS pasa a ser suelo que
    // se camina, a su cota real. Los de nacedoras no: son fosos de 1,80 de
    // ancho con la maquinaria dentro, no sitio por donde andar.
    datos.rooms.filter(esCuartoMaquinasIncubadoras).forEach((o) => {
      suelosNivel2.push({ x0: o.x, x1: o.x + o.w, z0: o.y, z1: o.y + o.h, y: cotaDe(o) })
    })

    // Y se camina por TODA la sala de nivel 2, no solo por donde la losa la
    // acompana: es su piso, y es el que se ve. Se le restan los cuartos de
    // maquinas, que son huecos —los de nacedoras no se pisan y los de
    // incubadoras ya entraron arriba con su propia cota.
    datos.rooms.forEach((r) => {
      if (!esNivel2(r) || esCuartoMaquinas(r) || esTunel(r)) return
      rectangulosDe(r).forEach((q) => {
        let trozos = [q]
        ocupanElSuelo.forEach((o) => {
          trozos = trozos.flatMap((t) => {
            const ax = Math.max(t.x0, o.x0), bx = Math.min(t.x1, o.x1)
            const az = Math.max(t.z0, o.z0), bz = Math.min(t.z1, o.z1)
            if (bx - ax < 0.02 || bz - az < 0.02) return [t]
            const out = []
            if (az - t.z0 > 0.02) out.push({ ...t, z1: az })
            if (t.z1 - bz > 0.02) out.push({ ...t, z0: bz })
            if (ax - t.x0 > 0.02) out.push({ x0: t.x0, x1: ax, z0: az, z1: bz })
            if (t.x1 - bx > 0.02) out.push({ x0: bx, x1: t.x1, z0: az, z1: bz })
            return out
          })
        })
        trozos.forEach((t) => suelosNivel2.push({ ...t, y: cotaDe(r) }))
      })
    })

    let salasConEntrepiso = 0
    datos.rooms.forEach((r) => {
      if (!llevaEntrepiso(r) || !seVeNivel(2)) return
      salasConEntrepiso++
      // Rectangulo de la sala menos los huecos que le caigan dentro: se parte
      // en bandas, primero lo que queda antes y despues del hueco en z, y luego
      // lo que queda a sus lados dentro de esa banda.
      let trozos = [{ x0: r.x, x1: r.x + r.w, z0: r.y, z1: r.y + r.h }]
      huecosLosa.forEach((o) => {
        trozos = trozos.flatMap((t) => {
          const ax = Math.max(t.x0, o.x), bx = Math.min(t.x1, o.x + o.w)
          const az = Math.max(t.z0, o.y), bz = Math.min(t.z1, o.y + o.h)
          if (bx - ax < 0.02 || bz - az < 0.02) return [t]
          const out = []
          if (az - t.z0 > 0.02) out.push({ ...t, z1: az })
          if (t.z1 - bz > 0.02) out.push({ ...t, z0: bz })
          if (ax - t.x0 > 0.02) out.push({ x0: t.x0, x1: ax, z0: az, z1: bz })
          if (t.x1 - bx > 0.02) out.push({ x0: bx, x1: t.x1, z0: az, z1: bz })
          return out
        })
      })
      // Y solo donde hay piso arriba. La losa se dibuja por sala de la planta
      // baja, y dos de ellas asoman por fuera de lo que ocupa el nivel 2: la
      // SALA RECEPCIÓN DE HUEVOS entera y el extremo occidental del PASILLO
      // S25, que es más largo que el área técnica. Quedaban dos plataformas
      // peladas colgadas a 3,40 sin ser ninguna sala. Se cruza cada trozo con
      // los rectángulos del nivel 2 y se queda solo la parte cubierta; el
      // reparto es disjunto, así que ninguna banda se dibuja dos veces.
      const cubiertos = []
      for (const u of rectsNivel2()) {
        trozos = trozos.flatMap((t) => {
          const ax = Math.max(t.x0, u.x0), bx = Math.min(t.x1, u.x1)
          const az = Math.max(t.z0, u.z0), bz = Math.min(t.z1, u.z1)
          if (bx - ax < 0.02 || bz - az < 0.02) return [t]
          cubiertos.push({ x0: ax, x1: bx, z0: az, z1: bz })
          const out = []
          if (az - t.z0 > 0.02) out.push({ ...t, z1: az })
          if (t.z1 - bz > 0.02) out.push({ ...t, z0: bz })
          if (ax - t.x0 > 0.02) out.push({ x0: t.x0, x1: ax, z0: az, z1: bz })
          if (t.x1 - bx > 0.02) out.push({ x0: bx, x1: t.x1, z0: az, z1: bz })
          return out
        })
        if (!trozos.length) break
      }
      trozos = cubiertos
      trozos.forEach((t) => {
        const an = t.x1 - t.x0, la = t.z1 - t.z0
        if (an < 0.02 || la < 0.02) return
        trozosLosa.push({ x0: t.x0, x1: t.x1, z0: t.z0, z1: t.z1 })
        const losa = new THREE.Mesh(new THREE.PlaneGeometry(an, la), matEntrepiso)
        losa.rotation.x = Math.PI / 2
        losa.position.set((t.x0 + t.x1) / 2, ENTREPISO, (t.z0 + t.z1) / 2)
        losa.receiveShadow = true
        losa.castShadow = true
        gEntrepiso.add(losa)
      })
    })
    if (salasConEntrepiso) {
      console.info(`[planta3d] entrepiso a ${ENTREPISO} m sobre ${salasConEntrepiso} salas`)
    }
    gTechos.visible = false
    // La losa se ve siempre que se vea el segundo nivel: es su piso. Solo se
    // apaga al aislar la planta baja, que es cuando estorba.
    gEntrepiso.visible = nivelFiltro !== 1

    // ── Cielo raso de la planta baja ───────────────────────────────────────
    // Las salas de abajo se veían sin techo: el techo que ya existía es el
    // traslúcido teñido del color de la sala, y vive en el grupo de la CUBIERTA,
    // que viene apagado de fábrica para poder mirar la planta desde arriba. Así
    // que caminando no había nada encima y desde el aire el segundo nivel
    // parecía no tener piso.
    //
    // Va una losa maciza de 5 cm, blanca como los muros:
    //   · en una sala con entrepiso encima, a la cota del entrepiso, que es el
    //     piso del nivel 2 — y solo donde la losa de verdad NO llega, porque la
    //     losa se recorta a la huella que tiene piso arriba y deja fuera salas
    //     enteras (transferencia, nacedoras 1 y 2);
    //   · en el resto, a la altura de su propio muro.
    // Un centímetro por debajo de la losa, para que donde se solapen no se
    // peleen en pantalla.
    const matCieloBlanco = new THREE.MeshStandardMaterial({ color: 0xeef2f6, roughness: 0.92, metalness: 0.02 })
    const losaCubre = (x, z) => trozosLosa.some((t) => x > t.x0 + 0.05 && x < t.x1 - 0.05 && z > t.z0 + 0.05 && z < t.z1 - 0.05)

    // Bajo un cuarto de maquinas no va cielo raso: lo que cierra por arriba es
    // el piso propio del cuarto, que esta a 2,40 —un metro por debajo del
    // entrepiso—. Sin este recorte la losa blanca del cielo raso volvia a tapar
    // los cuatro fosos de las nacedoras, que van despejados por arriba, y en
    // los de incubadoras aparecia un techo justo donde acabo de quitar la losa.
    const fososMaquinas = datos.rooms.filter((o) => esCuartoMaquinas(o) || esEscalera(o))
      .map((o) => ({ x0: o.x, x1: o.x + o.w, z0: o.y, z1: o.y + o.h, cota: cotaDe(o) }))
    const sinFosos = (q) => fososMaquinas.reduce((trozos, o) => trozos.flatMap((t) => {
      const ax = Math.max(t.x0, o.x0), bx = Math.min(t.x1, o.x1)
      const az = Math.max(t.z0, o.z0), bz = Math.min(t.z1, o.z1)
      if (bx - ax < 0.02 || bz - az < 0.02) return [t]
      const out = []
      if (az - t.z0 > 0.02) out.push({ ...t, z1: az })
      if (t.z1 - bz > 0.02) out.push({ ...t, z0: bz })
      if (ax - t.x0 > 0.02) out.push({ x0: t.x0, x1: ax, z0: az, z1: bz })
      if (t.x1 - bx > 0.02) out.push({ x0: bx, x1: t.x1, z0: az, z1: bz })
      return out
    }), [q])
    let cielos = 0
    datos.rooms.forEach((r) => {
      // Los plenum que cuelgan de una sala anfitriona (`parteDe`) ya quedan
      // fuera por esa misma condición. Los que NO la tienen —los dos cuartos
      // de succión de aire— son cuartos de verdad, recortados de su sala
      // técnica, y sin esto quedaban a cielo abierto.
      if (esNivel2(r) || r.exterior || r.parteDe) return
      // Los pasillos también llevan techo: no tienen muro propio —se abren a
      // las salas— pero están bajo el mismo cielo raso, y sin esto el corredor
      // de zona sucia se veía a cielo abierto. Fuera quedan solo los espacios
      // que de verdad son exteriores.
      if (/^(exterior|green_area|road|parking|tank)$/.test(r.type) || !seVeNivel(1)) return
      const conLosa = llevaEntrepiso(r)
      const cota = conLosa ? ENTREPISO - 0.01 : cotaDe(r) + alturaDe(r)
      // El trozo que cae bajo un cuarto de maquinas lleva su cielo raso MAS
      // BAJO: pegado por debajo del piso del cuarto, que cuelga un metro del
      // entrepiso. Ese piso es en realidad el techo de la sala de abajo, pero
      // es una cara que mira hacia arriba y desde abajo no se ve — al quitar la
      // losa de encima de los cuartos, las dos salas de incubadoras se quedaron
      // mirando al vacio. La losa blanca va debajo del piso, asi que no cierra
      // por arriba los fosos de las nacedoras, que siguen despejados.
      const piezas = []
      rectangulosDe(r).forEach((q) => {
        fososMaquinas.forEach((o) => {
          const ax = Math.max(q.x0, o.x0), bx = Math.min(q.x1, o.x1)
          const az = Math.max(q.z0, o.z0), bz = Math.min(q.z1, o.z1)
          if (bx - ax > 0.02 && bz - az > 0.02)
            piezas.push({ x0: ax, x1: bx, z0: az, z1: bz, cota: o.cota - 0.06, bajoLosa: false })
        })
        sinFosos(q).forEach((t) => piezas.push({ ...t, cota, bajoLosa: conLosa }))
      })
      piezas.forEach((q) => {
        // Si la losa del entrepiso ya tapa este trozo entero, ella hace de
        // techo y aquí no va nada.
        if (q.bajoLosa) {
          const puntos = [
            [q.x0 + 0.2, q.z0 + 0.2], [q.x1 - 0.2, q.z0 + 0.2],
            [q.x0 + 0.2, q.z1 - 0.2], [q.x1 - 0.2, q.z1 - 0.2],
            [(q.x0 + q.x1) / 2, (q.z0 + q.z1) / 2],
          ]
          if (puntos.every(([px, pz]) => losaCubre(px, pz))) return
        }
        const losa = new THREE.Mesh(geoCaja, matCieloBlanco)
        losa.scale.set(q.x1 - q.x0, 0.05, q.z1 - q.z0)
        losa.position.set((q.x0 + q.x1) / 2, q.cota + 0.025, (q.z0 + q.z1) / 2)
        losa.receiveShadow = true
        gCielos.add(losa)
        cielos++
      })
    })
    if (cielos) console.info(`[planta3d] ${cielos} losa(s) de cielo raso en planta baja`)

    // ── Salas proyectadas: techo propio y aviso ────────────────────────────
    // La cava del huevo aún no existe: se dibuja como quedará. A diferencia del
    // resto, su losa va SIEMPRE visible —no con el grupo de techos, que está
    // apagado por defecto— porque es lo que remata el volumen y deja claro que
    // es un cuerpo cerrado de 2.20 m, más bajo que todo lo demás.
    datos.rooms.filter((r) => r.proyectada).forEach((r) => {
      if (!seVeNivel(esNivel2(r) ? 2 : 1)) return
      // Un hueco de escalera proyectado no lleva tapa: es justo por donde se
      // sale al piso de arriba. Con la losa puesta, la escalera subia contra
      // un techo.
      if (esEscalera(r)) return
      const alto = cotaDe(r) + alturaDe(r)

      const losa = new THREE.Mesh(geoCaja, matMuroProyectado)
      losa.position.set(r._centro.x, alto + 0.06, r._centro.z)
      losa.scale.set(r.w + GROSOR_MURO, 0.12, r.h + GROSOR_MURO)
      losa.castShadow = true
      raiz.add(losa)

      // Filo de la losa, para que el borde del volumen se lea desde lejos
      const filo = new THREE.LineSegments(
        new THREE.EdgesGeometry(new THREE.BoxGeometry(r.w + GROSOR_MURO, 0.12, r.h + GROSOR_MURO)),
        new THREE.LineBasicMaterial({ color: 0xa9d8e8, transparent: true, opacity: 0.9 })
      )
      filo.position.copy(losa.position)
      raiz.add(filo)

      if (global.Etiquetas) {
        const aviso = global.Etiquetas.crearEtiqueta('PROYECCIÓN DE AMPLIACIÓN', {
          sub: `${r.name} · ${round2(r.w)} × ${round2(r.h)} m · altura ${alto} m`,
          color: '#eaf7fb',
          fondo: 'rgba(20,58,74,0.88)',
          borde: 'rgba(169,216,232,0.85)',
          alturaM: 0.62,
        })
        // Justo sobre la losa: el rótulo de la sala va más arriba y si se
        // ponen a la misma altura se pisan.
        aviso.position.set(r._centro.x, alto + 0.42, r._centro.z)
        raiz.add(aviso)
      }
    })


    // ── Equipos ────────────────────────────────────────────────────────────
    const equipos = []
    datos.machines.forEach((m) => {
      const sala = salasPorId.get(m.room)
      if (!sala) return
      if (!seVeNivel(esNivel2(sala) ? 2 : 1)) return
      const cat = datos.tiposEquipo[m.type] || datos.tiposEquipo.other
      const est = datos.estadosEquipo[m.status] || datos.estadosEquipo.idle
      // Medidas propias del equipo si las trae; si no, las de su tipo. Dos
      // chillers distintos ya no tienen por qué medir lo mismo.
      const dim = {
        w: Number(m.w) > 0 ? Number(m.w) : cat.w,
        d: Number(m.d) > 0 ? Number(m.d) : cat.d,
        h: Number(m.h) > 0 ? Number(m.h) : cat.h,
      }

      const g = new THREE.Group()
      const cx = sala.x + m.x + dim.w / 2
      const cz = sala.y + m.y + dim.d / 2
      g.position.set(cx, cotaDe(sala), cz)
      g.rotation.y = (-(Number(m.rot) || 0) * Math.PI) / 180

      // Cuerpo en acero claro: contrasta con el piso de color de la sala.
      // El compresor no es una caja entera: el gabinete llega a dos tercios y
      // encima va el calderín, así que su cuerpo se dibuja más bajo. Todo cabe
      // dentro del alto declarado — de ahí salen la caja de colisión, el
      // piloto y el rótulo, y si algo sobresale, el recorrido a pie se
      // tropieza con lo que no ve.
      const altoCuerpo = m.type === 'compressor' ? dim.h * 0.62 : dim.h
      const cuerpo = new THREE.Mesh(
        geoCaja,
        matCuerpoEquipo
      )
      // Se deja una junta de 8 cm para que se distingan las unidades contiguas
      // Sin recorte en el ancho: con las incubadoras en banco corrido, ese
      // margen dejaba una costura visible de 8 cm entre máquina y máquina.
      cuerpo.scale.set(dim.w, altoCuerpo, dim.d - 0.06)
      cuerpo.position.y = altoCuerpo / 2
      cuerpo.castShadow = true
      cuerpo.receiveShadow = true
      cuerpo.userData = { tipo: 'equipo', equipo: m, sala, cat, est }
      g.add(cuerpo)
      seleccionables.push(cuerpo)

      // Zócalo oscuro
      const base = new THREE.Mesh(geoCaja, matBaseEquipo)
      base.scale.set(dim.w - 0.02, 0.16, dim.d - 0.02)
      base.position.y = 0.08
      g.add(base)

      // ── Cada equipo con su facha ───────────────────────────────────────
      // El frente de dos hojas con visor, columna de mando y placa numerada es
      // el de las máquinas Petersime: incubadoras, combinadas y nacedoras. Un
      // chiller y un compresor no se parecen en nada a eso —en el plano 2D
      // cada uno ya tenía su dibujo—, y aquí salían los tres iguales, con
      // puertas de incubadora y todo. Cada familia tiene ahora la suya.
      const zF = -dim.d / 2
      if (m.type === 'chiller') {
        // Chiller de aire: lo que lo identifica desde cualquier punto de la
        // sala son los dos ventiladores del techo y el serpentín de aletas de
        // los costados largos.
        const nVent = 2
        const rad = Math.min((dim.w / nVent) * 0.42, dim.d * 0.38)
        for (let i = 0; i < nVent; i++) {
          const vx = (i - (nVent - 1) / 2) * (dim.w / nVent)
          const aro = new THREE.Mesh(
            new THREE.CylinderGeometry(rad, rad * 0.94, 0.14, 22, 1, true),
            matTenido(cat.color, 0, { roughness: 0.45, metalness: 0.5, side: THREE.DoubleSide })
          )
          aro.position.set(vx, dim.h - 0.03, 0)
          aro.castShadow = true
          g.add(aro)

          const eje = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.09, 10), matColumna)
          eje.position.set(vx, dim.h - 0.05, 0)
          g.add(eje)
          for (let a = 0; a < 4; a++) {
            const ang = (a * Math.PI) / 2
            const aspa = new THREE.Mesh(geoCaja, matAluminio)
            aspa.scale.set(rad * 0.86, 0.02, 0.15)
            aspa.position.set(vx + Math.cos(ang) * rad * 0.44, dim.h - 0.05, Math.sin(ang) * rad * 0.44)
            aspa.rotation.y = -ang
            g.add(aspa)
          }
        }

        // Serpentín: las dos caras largas son rejilla, no chapa lisa
        ;[-1, 1].forEach((s) => {
          const rejilla = new THREE.Mesh(geoCaja, matRejilla)
          rejilla.scale.set(dim.w * 0.92, dim.h * 0.6, 0.03)
          rejilla.position.set(0, dim.h * 0.48, s * (dim.d / 2 - 0.02))
          g.add(rejilla)
        })

        // Cuadro eléctrico a un costado del frente: el centro queda libre para
        // la pantalla de ronda.
        const cuadro = new THREE.Mesh(geoCaja, matColumna)
        cuadro.scale.set(dim.w * 0.26, dim.h * 0.3, 0.09)
        cuadro.position.set(-dim.w * 0.31, dim.h * 0.4, zF - 0.05)
        g.add(cuadro)
        const display = new THREE.Mesh(geoCaja, matMando)
        display.scale.set(dim.w * 0.14, 0.1, 0.03)
        display.position.set(-dim.w * 0.31, dim.h * 0.47, zF - 0.1)
        g.add(display)
        const paroCh = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.035, 12), matParo)
        paroCh.rotation.x = Math.PI / 2
        paroCh.position.set(-dim.w * 0.31, dim.h * 0.32, zF - 0.1)
        g.add(paroCh)

        // Las dos tuberías de agua helada, por el costado
        ;[-0.14, 0.14].forEach((dz) => {
          const tubo = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, dim.h * 0.55, 12), matAislante)
          tubo.position.set(dim.w / 2 + 0.08, dim.h * 0.34, dz)
          g.add(tubo)
        })
      } else if (m.type === 'compressor') {
        // Compresor de tornillo: gabinete con su rejilla de ventilación y el
        // calderín horizontal encima, sobre sus cunas.
        const rTanque = Math.min(dim.d * 0.32, (dim.h - altoCuerpo) / 2 - 0.05)
        const tanque = new THREE.Mesh(
          new THREE.CylinderGeometry(rTanque, rTanque, dim.w * 0.8, 18),
          matTanque
        )
        tanque.rotation.z = Math.PI / 2
        tanque.position.set(0, altoCuerpo + rTanque + 0.04, 0)
        tanque.castShadow = true
        g.add(tanque)
        ;[-1, 1].forEach((s) => {
          const tapa = new THREE.Mesh(new THREE.SphereGeometry(rTanque, 16, 10), matTanque)
          tapa.scale.set(0.45, 1, 1)
          tapa.position.set(s * dim.w * 0.4, altoCuerpo + rTanque + 0.04, 0)
          g.add(tapa)
          const cuna = new THREE.Mesh(geoCaja, matColumna)
          cuna.scale.set(0.1, 0.1, dim.d * 0.55)
          cuna.position.set(s * dim.w * 0.26, altoCuerpo + 0.05, 0)
          g.add(cuna)
        })

        // Banda del color del tipo por el frente del gabinete: es lo que
        // distingue un compresor de un chiller desde el aire, ahora que
        // ninguno de los dos lleva la franja superior.
        const banda = new THREE.Mesh(
          geoCaja,
          matTenido(cat.color, 0.2)
        )
        banda.scale.set(dim.w * 0.98, 0.12, dim.d * 0.99)
        banda.position.set(0, altoCuerpo - 0.08, 0)
        g.add(banda)

        // Rejilla de ventilación y cuadro de mando, a los costados del frente
        const rejilla = new THREE.Mesh(geoCaja, matRejilla)
        rejilla.scale.set(dim.w * 0.3, altoCuerpo * 0.5, 0.03)
        rejilla.position.set(dim.w * 0.3, altoCuerpo * 0.45, zF - 0.02)
        g.add(rejilla)
        const cuadro = new THREE.Mesh(geoCaja, matColumna)
        cuadro.scale.set(dim.w * 0.28, altoCuerpo * 0.34, 0.08)
        cuadro.position.set(-dim.w * 0.3, altoCuerpo * 0.52, zF - 0.04)
        g.add(cuadro)
        const display = new THREE.Mesh(geoCaja, matMando)
        display.scale.set(dim.w * 0.15, 0.1, 0.03)
        display.position.set(-dim.w * 0.3, altoCuerpo * 0.6, zF - 0.09)
        g.add(display)
        const paroCo = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.035, 12), matParo)
        paroCo.rotation.x = Math.PI / 2
        paroCo.position.set(-dim.w * 0.3, altoCuerpo * 0.42, zF - 0.09)
        g.add(paroCo)

        // Tubo de descarga del calderín hacia el techo
        const tubo = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, dim.h * 0.35, 10), matAluminio)
        tubo.position.set(dim.w * 0.42, altoCuerpo + rTanque * 1.4, dim.d * 0.22)
        g.add(tubo)
      } else {
        // Franja superior con el color del tipo (se distingue desde el aire).
        // Solo la llevan las Petersime: en el chiller la ocupan los
        // ventiladores y en el compresor, el calderín.
        const franja = new THREE.Mesh(
          geoCaja,
          matTenido(cat.color, 0.22)
        )
        franja.scale.set(dim.w - 0.16, 0.26, dim.d - 0.02)
        franja.position.y = dim.h - 0.13
        franja.castShadow = true
        g.add(franja)

        // ── Frente, copiado de las fotos de la planta ────────────────────
        // Dos hojas blancas con una franja de visor ancha, la columna de mando
        // negra al medio con su pantalla, el pulsador de emergencia naranja,
        // las dos tiras LED verdes a los costados y la placa con el número.
        const anchoHoja = (dim.w - 0.5) / 2
        ;[-1, 1].forEach((s) => {
          const hx = s * (anchoHoja / 2 + 0.26)
          const hoja = new THREE.Mesh(geoCaja, matHojaEquipo)
          hoja.scale.set(anchoHoja, dim.h * 0.86, 0.06)
          hoja.position.set(hx, dim.h * 0.47, zF - 0.03)
          g.add(hoja)

          // Franja de visor: en las máquinas reales cruza casi toda la hoja
          const visor = new THREE.Mesh(geoCaja, matVisorEquipo)
          visor.scale.set(anchoHoja * 0.92, dim.h * 0.085, 0.03)
          visor.position.set(hx, dim.h * 0.63, zF - 0.07)
          g.add(visor)

          // Manija de palanca, horizontal y larga
          const manija = new THREE.Mesh(geoCaja, matAluminio)
          manija.scale.set(anchoHoja * 0.34, 0.045, 0.05)
          manija.position.set(hx - s * anchoHoja * 0.26, dim.h * 0.45, zF - 0.09)
          g.add(manija)
        })

        // Columna de mando
        const columna = new THREE.Mesh(geoCaja, matColumna)
        columna.scale.set(0.5, dim.h * 0.92, 0.1)
        columna.position.set(0, dim.h * 0.48, zF - 0.05)
        g.add(columna)

        // Tiras LED verdes a lado y lado, a la altura del visor
        ;[-1, 1].forEach((s) => {
          const led = new THREE.Mesh(geoCaja, matLed)
          led.scale.set(0.055, dim.h * 0.11, 0.04)
          led.position.set(s * 0.3, dim.h * 0.63, zF - 0.1)
          g.add(led)
        })

        // Pantalla de mando y pulsador de emergencia
        const mando = new THREE.Mesh(geoCaja, matMando)
        mando.scale.set(0.3, 0.22, 0.03)
        mando.position.set(0, dim.h * 0.71, zF - 0.11)
        g.add(mando)
        const paro = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.035, 12), matParo)
        paro.rotation.x = Math.PI / 2
        paro.position.set(0, dim.h * 0.55, zF - 0.11)
        g.add(paro)

        // Placa con el número de la máquina, como la de las fotos
        const numero = (m.code.match(/(\d+)\s*$/) || [])[1]
        if (numero) {
          const placa = new THREE.Mesh(geoCaja, materialPlaca(numero))
          placa.scale.set(0.34, 0.26, 0.02)
          placa.position.set(0, dim.h * 0.3, zF - 0.11)
          g.add(placa)
        }
      }

      // ── Pantalla de control ────────────────────────────────────────────
      // Muestra la última foto de ronda del equipo (carpeta fotos/), sin importar
      // si está operando: lo que decide es tener foto. La pantalla nace oscura y
      // solo se enciende cuando la imagen termina de cargar, así un equipo sin
      // archivo se ve apagado en vez de encendido y vacío.
      const yPantalla = dim.h * 0.72
      const zPantalla = -dim.d / 2 - 0.11

      const marco = new THREE.Mesh(geoCaja, matMarcoPantalla)
      marco.scale.set(ANCHO_PANTALLA + 0.07, ALTO_PANTALLA + 0.07, 0.05)
      marco.position.set(0, yPantalla, zPantalla)
      g.add(marco)

      // MeshBasic: la pantalla se ve igual de nítida sin depender de la luz de la sala.
      const matPantalla = new THREE.MeshBasicMaterial({ color: 0x0a0f18 })
      const pantalla = new THREE.Mesh(new THREE.PlaneGeometry(ANCHO_PANTALLA, ALTO_PANTALLA), matPantalla)
      pantalla.rotation.y = Math.PI          // el frente del equipo mira a −Z
      pantalla.position.set(0, yPantalla, zPantalla - 0.028)
      g.add(pantalla)

      if (m.foto) {
        cargadorTex.load(
          'fotos/' + m.foto,
          (tex) => {
            tex.encoding = THREE.sRGBEncoding
            matPantalla.map = tex
            matPantalla.color.set(0xffffff)
            matPantalla.needsUpdate = true
          },
          undefined,
          () => { /* falta el archivo: la pantalla se queda apagada, como un equipo sin ronda */ }
        )
      }

      // Piloto de estado
      const piloto = new THREE.Mesh(
        new THREE.SphereGeometry(0.11, 16, 12),
        matTenido(est.color, 0.6, { roughness: 0.3 })
      )
      piloto.position.set(0, dim.h + 0.13, 0)
      g.add(piloto)

      const et = Etiquetas.crearEtiqueta(m.code, {
        sub: `${cat.label} · ${est.label}`,
        alturaM: 0.66,
        fondo: 'rgba(8,14,24,0.82)',
        borde: est.color,
      })
      et.position.set(0, dim.h + 0.72, 0)
      et.userData.tipoEtiqueta = 'equipo'
      g.add(et)

      gEquipos.add(g)
      colisiones.push({
        x0: cx - dim.w / 2, x1: cx + dim.w / 2, z0: cz - dim.d / 2, z1: cz + dim.d / 2,
        y0: cotaDe(sala), y1: cotaDe(sala) + dim.h,
      })

      m._sala = sala
      m._cat = cat
      // Las medidas con las que se dibujó de verdad: la ficha del equipo las
      // enseña, y enseñar las del tipo cuando el equipo trae las suyas es
      // mentir sobre lo que se está viendo.
      m._dim = dim
      m._est = est
      m._pos = { x: cx, z: cz }
      m._grupo = g
      equipos.push(m)
    })

    // ── Filtros sanitarios ─────────────────────────────────────────────────
    // Disposición real, según Henry: la ducha va en la mitad, los vestuarios a
    // los lados y los lockers en los dos extremos. Son salas angostas y largas,
    // y se atraviesan: se entra por un extremo, se pasa por la ducha y se sale
    // por el otro, que es lo que hace de filtro entre zona sucia y zona limpia.
    const matLocker = new THREE.MeshStandardMaterial({ color: 0x26272c, roughness: 0.45, metalness: 0.15 })
    const matBanca = new THREE.MeshStandardMaterial({ color: 0xd8dce1, roughness: 0.6, metalness: 0.1 })
    const matTabique = new THREE.MeshStandardMaterial({ color: 0xe7ebee, roughness: 0.55, metalness: 0.05 })
    const matGrifo = new THREE.MeshStandardMaterial({ color: 0xb9c2cf, roughness: 0.3, metalness: 0.7 })
    const matPlato = new THREE.MeshStandardMaterial({ color: 0xcfd6db, roughness: 0.35, metalness: 0.05 })
    const matRejillaDucha = new THREE.MeshStandardMaterial({ color: 0x8b949e, roughness: 0.5, metalness: 0.6 })

    // Cota de la sala que se está amoblando en este momento: amoblarFiltro/
    // amoblarBano/amoblarOficina calculan sus muebles en coordenadas LOCALES
    // (piso en 0), igual que siempre lo hicieron desde antes de que existiera
    // el nivel 2. En vez de sumar `cotaDe(r)` en cada una de sus llamadas a
    // `mueble` (decenas, con alto riesgo de olvidar una), se suma una sola vez
    // aquí. Cada función la fija al entrar, antes de mover un solo mueble.
    let cotaActual = 0

    // Franja libre delante de cada vano. Los muebles que estorban no se ponen
    // ahi: los lockers del filtro sanitario se arriman a los muros laterales
    // —para no cruzar las puertas de los extremos, que es donde suelen estar—
    // y en el filtro de hombres y en el ingreso de zona sucia las puertas caen
    // justo en esos laterales, asi que el banco de lockers las tapiaba. Con
    // esto lo respeta cualquier mueble, no solo ese.
    const PASO_LIBRE = 0.7
    const zonasPaso = []
    datos.rooms.forEach((r) => {
      ;(r.doors || []).forEach((d) => {
        if (d.type === 'window') return
        const l = ladoDePuerta(r, d)
        const horiz = l === 'arriba' || l === 'abajo'
        const a = anchoVano(d)
        const de = (horiz ? r.x : r.y) + (horiz ? d.x : d.y)
        const pos = l === 'arriba' ? r.y : l === 'abajo' ? r.y + r.h
                  : l === 'izquierda' ? r.x : r.x + r.w
        zonasPaso.push(horiz
          ? { x0: de - 0.1, x1: de + a + 0.1, z0: pos - PASO_LIBRE, z1: pos + PASO_LIBRE, cota: cotaDe(r) }
          : { x0: pos - PASO_LIBRE, x1: pos + PASO_LIBRE, z0: de - 0.1, z1: de + a + 0.1, cota: cotaDe(r) })
      })
    })
    const tapaUnVano = (x0, x1, z0, z1, cota) => zonasPaso.some((p) =>
      Math.abs(p.cota - cota) < 0.05 && x1 > p.x0 && x0 < p.x1 && z1 > p.z0 && z0 < p.z1)

    /** Cilindro para tubería, grifería y regaderas. `eje` es 'x', 'y' o 'z'. */
    function muebleCil(cx, cy, cz, radio, largo, eje, material) {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(radio, radio, largo, 14), material)
      m.position.set(cx, cy + cotaActual, cz)
      if (eje === 'x') m.rotation.z = Math.PI / 2
      else if (eje === 'z') m.rotation.x = Math.PI / 2
      m.castShadow = true
      gEquipos.add(m)
      return m
    }

    function mueble(cx, cy, cz, sx, sy, sz, material, esColision) {
      // Solo se descarta lo que de verdad estorba el paso: un plato de ducha o
      // una franja pintada en el piso pueden quedarse donde esten.
      if (esColision && cy + sy / 2 > 0.25 &&
          tapaUnVano(cx - sx / 2, cx + sx / 2, cz - sz / 2, cz + sz / 2, cotaActual)) return null
      const m = new THREE.Mesh(geoCaja, material)
      m.position.set(cx, cy + cotaActual, cz)
      m.scale.set(sx, sy, sz)
      m.castShadow = true
      m.receiveShadow = true
      gEquipos.add(m)
      if (esColision) colisiones.push({
        x0: cx - sx / 2, x1: cx + sx / 2, z0: cz - sz / 2, z1: cz + sz / 2,
        y0: cy + cotaActual - sy / 2, y1: cy + cotaActual + sy / 2,
      })
    }

    function amoblarFiltro(r) {
      cotaActual = cotaDe(r)
      const m = GROSOR_MURO / 2
      // Eje largo de la sala: por ahí se atraviesa.
      const largoEnZ = r.h >= r.w
      const cx = r.x + r.w / 2, cz = r.y + r.h / 2
      const anchoUtil = (largoEnZ ? r.w : r.h) - GROSOR_MURO
      const a0 = (largoEnZ ? r.y : r.x) + m
      const a1 = (largoEnZ ? r.y + r.h : r.x + r.w) - m

      // Coloca una pieza dando su posición en el eje largo (u) y en el corto (v).
      const pon = (u, v, largo, ancho, alto, y, mat, col) =>
        largoEnZ ? mueble(cx + v, y, u, ancho, alto, largo, mat, col)
                 : mueble(u, y, cz + v, largo, alto, ancho, mat, col)

      // Lockers en los dos extremos, pero ARRIMADOS a los muros laterales, no
      // cruzados: en los extremos están las puertas de acceso y evacuación, y
      // un banco de lockers atravesado las tapaba y dejaba el filtro sin paso.
      const fondoL = 0.5, altoL = 1.85, largoL = 1.4
      ;[a0 + largoL / 2, a1 - largoL / 2].forEach((u) => {
        ;[-1, 1].forEach((lado) => {
          pon(u, lado * (anchoUtil / 2 - fondoL / 2), largoL, fondoL, altoL, altoL / 2, matLocker, true)
        })
      })

      // ── Las duchas: el paso obligatorio ──────────────────────────────
      // La ducha ES el paso, no algo al lado del paso: una barrera de muro a
      // muro con cabinas de un metro, y por dentro de una pasa todo el que
      // entra a la planta. De eso vive la bioseguridad.
      //
      // Cuántas lleva cada filtro no sale de la medida, lo dictó Henry: en zona
      // limpia una por filtro —damas al occidente, hombres al oriente— y en
      // zona sucia dos para damas y una para hombres. Lo que no es cabina es
      // muro macizo; en el filtro el sitio se lo lleva el vestuario, y la
      // lavandería es el espacio más amplio de esa zona.
      const DUCHAS = { S29: 1, S30: 1, S38: 2, S39: 1 }
      const centro = largoEnZ ? cz : cx
      const fondoD = 1.25          // fondo de la cabina, en el sentido del paso
      const altoT = 2.4
      const ESPESOR = 0.09
      const ANCHO_CAB = Math.min(1.0, anchoUtil - 0.2)
      const ANCHO_PUERTA = 0.7
      const nCab = Math.max(1, DUCHAS[r.code] || 1)

      // Cilindros en el mismo marco (u = eje largo, v = eje corto) que `pon`.
      const ponCil = (u, v, y, radio, largo, eje, mat) => {
        const ejeMundo = eje === 'y' ? 'y' : largoEnZ ? (eje === 'u' ? 'z' : 'x') : (eje === 'u' ? 'x' : 'z')
        return largoEnZ
          ? muebleCil(cx + v, y, u, radio, largo, ejeMundo, mat)
          : muebleCil(u, y, cz + v, radio, largo, ejeMundo, mat)
      }

      // La barrera, franja por franja: cabina o macizo.
      const franjas = []
      let vCursor = -anchoUtil / 2
      for (let i = 0; i < nCab; i++) {
        const c = -anchoUtil / 2 + (anchoUtil / nCab) * (i + 0.5)
        const a = c - ANCHO_CAB / 2
        const b = c + ANCHO_CAB / 2
        if (a - vCursor > 0.02) franjas.push([vCursor, a, false])
        franjas.push([a, b, true])
        vCursor = b
      }
      if (anchoUtil / 2 - vCursor > 0.02) franjas.push([vCursor, anchoUtil / 2, false])

      franjas.forEach(([a, b, esCabina]) => {
        const ancho = b - a
        const vC = (a + b) / 2
        if (!esCabina) {
          // Macizo de lado a lado del fondo: por aquí no se pasa ni se ve hueco.
          pon(centro, vC, fondoD, ancho, altoT, altoT / 2, matTabique, true)
          return
        }

        // Los dos frentes de la cabina, con su vano y su dintel
        const jamba = (ancho - ANCHO_PUERTA) / 2
        ;[-1, 1].forEach((cara) => {
          const u = centro + (cara * fondoD) / 2
          if (jamba > 0.02) {
            ;[-1, 1].forEach((lado) => {
              pon(u, vC + lado * (ANCHO_PUERTA / 2 + jamba / 2),
                  ESPESOR, jamba, altoT, altoT / 2, matTabique, true)
            })
          }
          pon(u, vC, ESPESOR, ANCHO_PUERTA, altoT - 2.1, 2.1 + (altoT - 2.1) / 2, matTabique, false)
        })

        // Piso de la cabina y rejilla de desagüe
        pon(centro, vC, fondoD - ESPESOR, ancho - 0.02, 0.012, 0.006, matPlato, false)
        pon(centro, vC, 0.18, 0.18, 0.014, 0.014, matRejillaDucha, false)

        // Regadera colgando del brazo y mezclador a la altura de la mano
        const vMuro = vC - ancho / 2 + 0.08
        ponCil(centro, vMuro, 1.1, 0.02, 2.0, 'y', matGrifo)
        ponCil(centro, vMuro + 0.16, 2.08, 0.018, 0.32, 'v', matGrifo)
        ponCil(centro, vMuro + 0.3, 2.0, 0.02, 0.14, 'y', matGrifo)
        const reg = ponCil(centro, vMuro + 0.3, 1.91, 0.1, 0.05, 'y', matGrifo)
        reg.scale.y = 0.7
        pon(centro, vMuro + 0.04, 0.13, 0.09, 0.15, 1.1, matGrifo, false)
        ;[-0.08, 0.08].forEach((du) => {
          ponCil(centro + du, vMuro + 0.1, 1.1, 0.025, 0.055, 'v', matGrifo)
        })

        // Las dos hojas, CORREDIZAS, una a cada lado. Entran en el sistema de
        // puertas del recorrido: se abren solas al acercarse, suenan y las manos
        // del visitante se estiran hacia ellas. Corren hacia el macizo de al
        // lado, que es donde hay muro para esconderlas.
        const anchoHoja = ANCHO_PUERTA + 0.06
        const sentido = vC <= 0 ? -1 : 1
        ;[-1, 1].forEach((cara) => {
          const u = centro + (cara * fondoD) / 2
          const mx = largoEnZ ? cx + vC : u
          const mz = largoEnZ ? u : cz + vC

          const pivote = new THREE.Group()
          const hoja = new THREE.Mesh(geoCaja, matHojaPeatonal)
          hoja.scale.set(largoEnZ ? anchoHoja : 0.04, 2.05, largoEnZ ? 0.04 : anchoHoja)
          hoja.position.set(0, 1.03, 0)
          hoja.castShadow = true
          pivote.add(hoja)
          pivote.position.set(mx, cotaActual, mz)
          gPuertas.add(pivote)

          // Riel sobre el vano, por donde corre
          pon(u, vC + (sentido * anchoHoja) / 2, 0.05, anchoHoja * 2, 0.05, 2.14, matGrifo, false)

          puertas.push({
            pivote, corre: true, enrolla: false,
            // El repaso que voltea hojas ya corrió cuando se amuebla, y aquí el
            // sentido lo manda el macizo, no una medición.
            fijo: true,
            eje: largoEnZ ? 'h' : 'v',
            px: mx, pz: mz,
            recorrido: sentido * anchoHoja,
            alza: 0, giro: 0, abierta: 0, meta: 0,
          })
        })
      })

      // Vestuarios: bancas contra los dos muros largos, entre locker y ducha
      const altoB = 0.45, fondoB = 0.36
      // Delante de la barrera de duchas queda una franja libre a todo lo ancho.
      // Sin ella la banca llega hasta el tabique y, para meterse en la cabina
      // del extremo, hay que pasar por encima: el visitante se queda trabado
      // contra la banca sin poder entrar a ducharse, que es justo lo que no
      // puede pasar en el único paso obligatorio de la planta.
      const APRON = 0.75
      const tramoA = [a0 + largoL, centro - fondoD / 2 - APRON]
      const tramoB = [centro + fondoD / 2 + APRON, a1 - largoL]
      // Solo se ponen bancas contra el muro largo que NO tiene vano: por el otro
      // se comunica con la salita de ingreso y una banca corrida tapaba el paso.
      // OJO: esa puerta pertenece a la SALITA, no al filtro, así que no basta
      // mirar r.doors — hay que buscar los vanos de cualquier sala que caigan
      // sobre ese muro.
      const conPuerta = { '-1': false, '1': false }
      const planoDe = { '-1': largoEnZ ? r.x : r.y, '1': largoEnZ ? r.x + r.w : r.y + r.h }
      datos.rooms.forEach((o) => {
        ;(o.doors || []).forEach((d) => {
          const L = ladoDePuerta(o, d)
          const vertical = L === 'izquierda' || L === 'derecha'
          if (vertical !== largoEnZ) return
          const plano = L === 'izquierda' ? o.x : L === 'derecha' ? o.x + o.w
            : L === 'arriba' ? o.y : o.y + o.h
          const ini = vertical ? o.y + d.y : o.x + d.x
          const fin = ini + 1.6
          const a = largoEnZ ? r.y : r.x
          const b = largoEnZ ? r.y + r.h : r.x + r.w
          if (Math.min(fin, b) - Math.max(ini, a) <= 0.05) return
          ;['-1', '1'].forEach((k) => {
            if (Math.abs(plano - planoDe[k]) < 0.06) conPuerta[k] = true
          })
        })
      })
      ;[tramoA, tramoB].forEach(([p, q]) => {
        if (q - p < 0.5) return
        ;[-1, 1].forEach((lado) => {
          if (conPuerta[String(lado)]) return
          pon((p + q) / 2, lado * (anchoUtil / 2 - fondoB / 2), q - p - 0.1, fondoB, altoB, altoB / 2, matBanca, true)
        })
      })
    }

    // Baños: sanitario contra el muro del fondo y lavamanos al lado, con su
    // espejo. Son cuartos de 4 x 3 recortados en la esquina de la sala que los
    // contiene (los dos comedores y la sala técnica 2).
    const matLoza = new THREE.MeshStandardMaterial({ color: 0xf4f6f7, roughness: 0.25, metalness: 0.05 })
    const matEspejo = new THREE.MeshStandardMaterial({ color: 0x9fb4c4, roughness: 0.08, metalness: 0.85 })

    /**
     * Baño. Los tres sitios sirven a hombres y mujeres: en los comedores es un
     * solo cuarto partido por un tabique, con una puerta por lado —por eso el
     * plano les da DOS puertas sobre el mismo muro—, y en la sala técnica son
     * dos cuartos separados. La división se deduce de ahí y no de una lista.
     */
    function amoblarBano(r) {
      cotaActual = cotaDe(r)
      // Muro por donde se entra, y las puertas que hay en él.
      const puertas = (r.doors || []).map((d) => ({ d, l: ladoDePuerta(r, d) }))
      const porMuro = {}
      puertas.forEach((p) => { (porMuro[p.l] = porMuro[p.l] || []).push(p.d) })
      const L = Object.keys(porMuro).sort((a, b) => porMuro[b].length - porMuro[a].length)[0]
      if (!L) return

      const m = GROSOR_MURO / 2
      const horiz = L === 'arriba' || L === 'abajo'
      const u0 = horiz ? r.x : r.y                 // origen del eje del muro de acceso
      const uLen = horiz ? r.w : r.h               // largo de ese muro
      const vLen = horiz ? r.h : r.w               // fondo del cuarto
      const signo = L === 'arriba' || L === 'izquierda' ? 1 : -1
      const vBase = L === 'arriba' ? r.y : L === 'abajo' ? r.y + r.h
                  : L === 'izquierda' ? r.x : r.x + r.w

      // (u = a lo largo del muro de acceso, v = hacia adentro) -> mundo
      const pon = (u, v, au, av, alto, y, mat, col) => {
        const cu = u0 + u, cv = vBase + signo * v
        if (horiz) mueble(cu, y, cv, au, alto, av, mat, col)
        else mueble(cv, y, cu, av, alto, au, mat, col)
      }

      const dividido = porMuro[L].length >= 2
      const mitades = dividido
        ? [[m, uLen / 2], [uLen / 2, uLen - m]]
        : [[m, uLen - m]]

      if (dividido) {
        // Tabique de piso a techo entre el lado de hombres y el de mujeres.
        pon(uLen / 2, (vLen + m) / 2, 0.1, vLen - m, 2.4, 1.2, matTabique, true)
      }

      mitades.forEach(([ua, ub]) => {
        const uc = (ua + ub) / 2
        const ancho = ub - ua
        // Sanitario contra el muro del fondo
        pon(uc - ancho * 0.22, vLen - m - 0.34, 0.4, 0.6, 0.4, 0.2, matLoza, true)
        pon(uc - ancho * 0.22, vLen - m - 0.08, 0.44, 0.18, 0.58, 0.29, matLoza, true)
        // Lavamanos con pedestal y espejo, en el mismo fondo
        pon(uc + ancho * 0.26, vLen - m - 0.24, 0.52, 0.4, 0.14, 0.82, matLoza, true)
        pon(uc + ancho * 0.26, vLen - m - 0.24, 0.14, 0.14, 0.72, 0.36, matLoza, false)
        pon(uc + ancho * 0.26, vLen - m - 0.03, 0.46, 0.03, 0.58, 1.45, matEspejo, false)
      })
    }

    /**
     * Oficina, copiada de las fotos de la planta.
     *
     * Es una sala larga y angosta con una HILERA CENTRAL de puestos enfrentados
     * —separados por mamparitas de vidrio— y sillas de visitante contra un muro.
     * Al fondo, una mampara de vidrio con puerta separa una oficina privada, que
     * tiene su escritorio, su televisor en el muro y su archivador.
     */
    function amoblarOficina(r) {
      cotaActual = cotaDe(r)
      const m = GROSOR_MURO / 2 + 0.08
      const largoEnZ = r.h >= r.w
      const largo = (largoEnZ ? r.h : r.w) - 2 * m
      const ancho = (largoEnZ ? r.w : r.h) - 2 * m
      if (largo < 4 || ancho < 2.6) return       // el recorte en L no se amobla
      const cx = r.x + r.w / 2, cz = r.y + r.h / 2
      const u0 = (largoEnZ ? r.y : r.x) + m

      // (u = a lo largo de la sala, v = a lo ancho desde el eje) -> mundo
      const pon = (u, v, au, av, alto, y, mat, col) =>
        largoEnZ ? mueble(cx + v, y, u, av, alto, au, mat, col)
                 : mueble(u, y, cz + v, au, alto, av, mat, col)

      const alto = alturaDe(r)
      const uFin = u0 + largo

      // ── Mampara de vidrio del fondo, con su puerta ──────────────────────
      const uM = uFin - 2.9
      const paso = 0.95
      const ala = (ancho - paso) / 2
      ;[-1, 1].forEach((lado) => {
        const v = lado * (paso / 2 + ala / 2)
        pon(uM, v, 0.05, ala, 2.45, 1.22, matVidrio, true)
        pon(uM, v, 0.07, ala, 0.05, 2.47, matAluminio, false)
      })
      pon(uM, -(paso / 2 + ala / 2) + ala / 2 + 0.02, 0.07, 0.06, 2.45, 1.22, matAluminio, false)

      // ── Oficina privada, más allá de la mampara ─────────────────────────
      const uPriv = (uM + uFin) / 2
      pon(uPriv + 0.3, -0.2, 1.6, 0.8, 0.05, 0.73, matEscritorio, true)
      pon(uPriv + 0.3, -0.2, 0.07, 0.07, 0.72, 0.36, matAluminio, false)
      pon(uPriv + 0.3, -0.62, 0.5, 0.05, 0.34, 1.06, matMonitor, false)
      pon(uPriv - 0.35, -0.2, 0.55, 0.55, 0.5, 0.26, matSilla, false)  // silla del puesto
      ;[-0.5, 0.5].forEach((dv) =>                                      // dos de visitante
        pon(uPriv + 1.15, dv + 0.6, 0.5, 0.5, 0.45, 0.24, matNegro, false))
      pon(uFin - 0.12, 0.55, 0.06, 1.05, 0.6, 1.75, matMonitor, false)  // televisor en el muro
      pon(uPriv + 1.3, -(ancho / 2 - 0.25), 0.9, 0.45, 0.75, 0.38, matNegro, false) // archivador

      // ── Zona abierta: hilera central de puestos enfrentados ─────────────
      // Entre el ultimo puesto y la mampara queda un paso cruzado. La puerta de
      // la mampara va centrada, justo donde cae la hilera, y la hilera moria a
      // 45 cm de ella: no se llegaba a esa puerta desde ninguno de los dos
      // pasillos laterales, asi que la oficina quedaba partida en dos y su
      // mitad de atras —y con ella la pieza en L y el almacen de huevo
      // comercial— sin forma de entrar a pie.
      const CRUCE = 1.4
      const hilera = uM - u0 - 0.45 - CRUCE
      const puestos = Math.max(1, Math.floor(hilera / 1.55))
      const salto = hilera / puestos
      for (let i = 0; i < puestos; i++) {
        const u = u0 + 0.45 + salto * (i + 0.5)
        ;[-1, 1].forEach((lado) => {
          const v = lado * 0.37
          pon(u, v, salto - 0.12, 0.72, 0.05, 0.73, matEscritorio, true)
          pon(u, v, 0.07, 0.07, 0.72, 0.36, matAluminio, false)
          pon(u, v * 1.55, 0.5, 0.05, 0.32, 1.05, matMonitor, false)
          pon(u, lado * 1.35, 0.55, 0.55, 0.5, 0.26, matSilla, false)
        })
        // Mamparita de vidrio entre los dos puestos enfrentados
        pon(u, 0, salto - 0.2, 0.03, 0.42, 0.94, matVidrio, false)
      }
      // Impresora al final de la hilera
      pon(uM - 0.6, 0.35, 0.55, 0.45, 0.35, 0.9, matNegro, false)

      // ── Detalles de muro y techo ────────────────────────────────────────
      // Sillas de visitante arrimadas a un costado
      for (let i = 0; i < Math.min(3, puestos); i++)
        pon(u0 + 0.7 + i * 0.75, -(ancho / 2 - 0.24), 0.5, 0.45, 0.45, 0.24, matSilla, false)
      // Logo naranja en un muro y placa de vidrio en el de enfrente
      pon(u0 + 1.2, -(ancho / 2 + 0.02), 0.42, 0.04, 0.42, 1.85, matLogo, false)
      pon(u0 + 1.6, ancho / 2 + 0.02, 0.62, 0.04, 0.44, 1.7, matPlaca, false)
      // Armario blanco junto a la mampara
      pon(uM - 0.45, ancho / 2 - 0.24, 0.85, 0.45, 1.8, 0.9, matArmario, false)
      // Dos luminarias lineales a lo largo del techo
      ;[-0.3, 0.3].forEach((dv) =>
        pon(u0 + largo / 2, dv * ancho, largo * 0.72, 0.1, 0.05, alto - 0.12, matLuminaria, false))
    }

    const enNivelVisible = (r) => seVeNivel(esNivel2(r) ? 2 : 1)

    // Una sala que CONTIENE otras no es un espacio: es la envolvente del bloque.
    // La oficina administrativa encierra el archivo, gerencia, RR.HH. y el baño,
    // y amueblarla sembraba escritorios y mamparas a través de los tabiques: la
    // mampara de vidrio del fondo cruzaba entera el archivo y le dejaba la mitad
    // sur sin forma de entrar. El bloque se amuebla por sus salas, no por su
    // envolvente.
    const envuelveOtraSala = (r) => datos.rooms.some((o) =>
      o.id !== r.id && !o.exterior && o.type !== 'plenum' &&
      esNivel2(o) === esNivel2(r) && o.w * o.h < r.w * r.h - 0.01 &&
      o.x >= r.x - 0.05 && o.x + o.w <= r.x + r.w + 0.05 &&
      o.y >= r.y - 0.05 && o.y + o.h <= r.y + r.h + 0.05)
    const amoblable = (r) => enNivelVisible(r) && !envuelveOtraSala(r)

    datos.rooms.filter((r) => r.type === 'office' && amoblable(r)).forEach(amoblarOficina)
    datos.rooms.filter((r) => /FILTRO SANITARIO/i.test(r.name) && amoblable(r)).forEach(amoblarFiltro)
    datos.rooms.filter((r) => /^W\.?C/i.test(r.name.trim()) && amoblable(r)).forEach(amoblarBano)

    /**
     * Abre y cierra las hojas según la distancia del visitante.
     * Se llama desde el bucle de render con la posición de la cámara.
     */
    const DIST_ABRE = 3.2      // m: a partir de aquí la puerta empieza a abrir
    function actualizarPuertas(pos, dt) {
      const v = Math.min(1, dt * 4.5)   // suavizado del movimiento
      // Un vano doble son dos hojas que arrancan juntas. Si cada una lanzara su
      // sonido se oiría al doble de volumen y con eco, así que se agrupan por
      // vano y solo suena la primera de cada uno.
      let sonando = null
      // La más cercana de las que se están abriendo, para que las manos del
      // visitante sepan hacia dónde estirarse.
      let masCerca = null
      for (const p of puertas) {
        const dx = pos.x - p.px, dz = pos.z - p.pz
        const d2 = dx * dx + dz * dz
        const cerca = d2 < DIST_ABRE * DIST_ABRE
        const meta = cerca ? 1 : 0
        if (cerca && (!masCerca || d2 < masCerca.d2)) masCerca = { d2, x: p.px, z: p.pz, abierta: p.abierta }
        // El sonido va en el instante en que cambia la intención, no mientras
        // se mueve: así suena una vez por apertura y no en cada cuadro.
        if (meta !== p.meta) {
          p.meta = meta
          if (window.Sonido) {
            const clave = `${Math.round(p.px)}|${Math.round(p.pz)}|${meta}`
            sonando = sonando || new Set()
            if (!sonando.has(clave)) {
              sonando.add(clave)
              window.Sonido.puerta(p.corre || p.enrolla ? 'corre' : 'gira', meta ? 'abre' : 'cierra', Math.sqrt(d2))
            }
          }
        }
        if (Math.abs(p.abierta - meta) < 0.002) { p.abierta = meta; continue }
        p.abierta += (meta - p.abierta) * v
        const t = p.abierta
        if (p.enrolla) {
          // La cortina se enrolla hacia arriba: sube y se acorta a la vez, que
          // es lo que hace una de verdad al recogerse sobre el dintel.
          const hoja = p.pivote.children[0]
          const alto0 = p.altoHoja ?? (p.altoHoja = hoja.scale.y)
          const queda = Math.max(0.06, alto0 * (1 - t))
          hoja.scale.y = queda
          hoja.position.y = alto0 - queda / 2
        } else if (p.corre) {
          const d = p.recorrido * t
          if (p.eje === 'h') p.pivote.children[0].position.x = d
          else p.pivote.children[0].position.z = d
        } else {
          p.pivote.rotation.y = p.giro * t
        }
      }
      return masCerca && { x: masCerca.x, z: masCerca.z, dist: Math.sqrt(masCerca.d2), abierta: masCerca.abierta }
    }

    // ── Etiquetas de sala ──────────────────────────────────────────────────
    datos.rooms.forEach((r) => {
      // La segunda pieza de una sala en L no lleva rótulo propio: es la misma
      // sala y se vería el nombre repetido dos veces.
      if (r.parteDe) return
      if (!seVeNivel(esNivel2(r) ? 2 : 1)) return
      const alto = cotaDe(r) + (r._cat.muro ? alturaDe(r) : 0)
      const et = Etiquetas.crearEtiqueta(r.name, {
        sub: `${r.code} · ${r.w} × ${r.h} m · ${r._area} m²`,
        alturaM: r._cat.muro ? 1.15 : 0.95,
        borde: r._color,
      })
      et.position.set(r._centro.x, alto + 1.5, r._centro.z)
      et.userData.tipoEtiqueta = 'sala'
      et.userData.sala = r
      gEtiquetas.add(et)
      r._etiqueta = et
    })

    // ── Cotas generales de la planta ───────────────────────────────────────
    const matCota = new THREE.LineBasicMaterial({ color: 0xffd166 })
    const yCota = 0.05
    const off = 3.5
    const puntos = [
      [new THREE.Vector3(edificio.minX, yCota, minZ - off), new THREE.Vector3(edificio.maxX, yCota, minZ - off)],
      [new THREE.Vector3(minX - off, yCota, edificio.minZ), new THREE.Vector3(minX - off, yCota, edificio.maxZ)],
    ]
    puntos.forEach((p) => {
      const l = new THREE.Line(new THREE.BufferGeometry().setFromPoints(p), matCota)
      gCotas.add(l)
      // topes
      ;[p[0], p[1]].forEach((v) => {
        const dir = p[0].x === p[1].x ? new THREE.Vector3(1.2, 0, 0) : new THREE.Vector3(0, 0, 1.2)
        const t = new THREE.Line(
          new THREE.BufferGeometry().setFromPoints([v.clone().sub(dir), v.clone().add(dir)]),
          matCota
        )
        gCotas.add(t)
      })
    })
    const cotaX = Etiquetas.crearEtiqueta(`${edificio.ancho} m`, { alturaM: 2.4, borde: '#ffd166', color: '#ffe9b0' })
    cotaX.position.set(edificio.cx, 1.8, minZ - off)
    gCotas.add(cotaX)
    const cotaZ = Etiquetas.crearEtiqueta(`${edificio.largo} m`, { alturaM: 2.4, borde: '#ffd166', color: '#ffe9b0' })
    cotaZ.position.set(minX - off, 1.8, edificio.cz)
    gCotas.add(cotaZ)

    // Rosa de los vientos (norte = −Z)
    const norte = new THREE.Group()
    const aguja = new THREE.Mesh(
      new THREE.ConeGeometry(0.9, 3.2, 4),
      new THREE.MeshStandardMaterial({ color: 0xff6b6b, roughness: 0.5 })
    )
    aguja.rotation.x = -Math.PI / 2
    aguja.position.set(0, 0.6, -1.6)
    norte.add(aguja)
    const etNorte = Etiquetas.crearEtiqueta('N', { alturaM: 2, borde: '#ff6b6b' })
    etNorte.position.set(0, 2.6, -3.6)
    norte.add(etNorte)
    norte.position.set(maxX + 6, 0, minZ - 2)
    gCotas.add(norte)

    return {
      raiz,
      actualizarPuertas,
      grupos: { pisos: gPisos, muros: gMuros, puertas: gPuertas, equipos: gEquipos, techos: gTechos, cielos: gCielos, entrepiso: gEntrepiso, etiquetas: gEtiquetas, cotas: gCotas },
      colisiones,
      // Suelo del entrepiso y tramos de escalera: con esto el recorrido a pie
      // tambien se puede hacer arriba, sin caminar sobre el vacio.
      losa: { alto: ENTREPISO, trozos: trozosLosa, hundidos: suelosNivel2 },
      rampas,
      seleccionables,
      salasPorId,
      salasPorCodigo,
      equipos,
      limites,
    }
  }

  global.Mundo = { construirPlanta, GROSOR_MURO }
})(window)
