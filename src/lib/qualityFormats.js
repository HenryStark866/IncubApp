/**
 * Formatos de calidad de la planta de incubación (auxiliar de calidad · 06-10-2026).
 * Cada formato define sus campos y calcula sus indicadores y un estado
 * (ok / watch = vigilar / alert = alerta) contra valores de referencia.
 * Los valores de REFERENCIA son los de uso común en incubación de pollo de engorde;
 * planta (SIG) puede ajustarlos aquí.
 */

export const REFERENCIA = {
  pesoHuevo: { min: 52, max: 70, alertaMin: 48, alertaMax: 74 }, // g
  uniformidad: { vigilar: 80, alerta: 70 }, // % de huevos dentro de ±10 % del promedio
  humedad: { min: 11, max: 13, alertaMin: 10, alertaMax: 14 }, // % de pérdida al día 18
  fertilidad: { vigilar: 90, alerta: 85 }, // % fertilidad aparente en ovoscopia
  mortalidadTemprana: { vigilar: 3, alerta: 5 }, // % en ovoscopia
  contaminados: { vigilar: 0.5, alerta: 1 }, // % de los revisados
  pesoPollito: { min: 38, max: 44, alertaMin: 35, alertaMax: 47 }, // g
  segunda: { vigilar: 1, alerta: 2 }, // % de pollito de segunda
  // Auxiliar de vacunación (07-10-2026)
  nevera: { min: 2, max: 8, alertaMin: 0, alertaMax: 10 }, // °C nevera de vacunas
  nitrogeno: { vigilar: 37, alerta: 34 }, // cm de nitrógeno en el tanque: rellenar
  ombligoIII: { vigilar: 2, alerta: 5 }, // % de ombligos grado III
  ombligoII: { vigilar: 35, alerta: 50 }, // % de ombligos grado II
}

export const ESTADOS = {
  ok: { label: 'Normal', tone: 'ok' },
  watch: { label: 'Vigilar', tone: 'warn' },
  alert: { label: 'Alerta', tone: 'danger' },
}

const n = (v) => {
  if (v === '' || v == null) return null
  const x = Number(String(v).replace(',', '.'))
  return Number.isFinite(x) ? x : null
}
const pct = (a, b) => (b ? Math.round((1000 * a) / b) / 10 : null)
const r1 = (x) => (x == null ? null : Math.round(x * 10) / 10)
const peor = (...e) => (e.includes('alert') ? 'alert' : e.includes('watch') ? 'watch' : 'ok')
const rango = (v, ref) =>
  v == null ? 'ok' : v < ref.alertaMin || v > ref.alertaMax ? 'alert' : v < ref.min || v > ref.max ? 'watch' : 'ok'
const minimo = (v, ref) => (v == null ? 'ok' : v < ref.alerta ? 'alert' : v < ref.vigilar ? 'watch' : 'ok')
const maximo = (v, ref) => (v == null ? 'ok' : v > ref.alerta ? 'alert' : v > ref.vigilar ? 'watch' : 'ok')

/**
 * «62, 58.5 61; 60,5» → [62, 58.5, 61, 60.5]. Separan espacios, «;» y «, »; una coma
 * pegada entre cifras es decimal.
 */
export function listaNumeros(texto) {
  return String(texto || '')
    .replace(/,(\s|$)/g, ' ')
    .split(/[\s;]+/)
    .map((t) => n(t))
    .filter((x) => x != null && x > 0)
}

/** Promedio, mínimo, máximo, CV y uniformidad (±10 % del promedio) de una lista de pesos. */
export function estadisticaPesos(pesos) {
  if (!pesos.length) return null
  const prom = pesos.reduce((s, x) => s + x, 0) / pesos.length
  const var_ = pesos.reduce((s, x) => s + (x - prom) ** 2, 0) / pesos.length
  const dentro = pesos.filter((x) => Math.abs(x - prom) <= prom * 0.1).length
  return {
    n: pesos.length,
    promedio: r1(prom),
    minimo: Math.min(...pesos),
    maximo: Math.max(...pesos),
    cv: r1((Math.sqrt(var_) / prom) * 100),
    uniformidad: pct(dentro, pesos.length),
  }
}

export const FORMATOS = [
  {
    id: 'egg_weight',
    area: 'calidad',
    label: 'Peso del huevo',
    icon: '⚖️',
    codigo: 'FOCAL-01',
    ayuda: 'Pese una muestra del lote (30 a 100 huevos). Escriba cada peso o solo la cantidad y el peso total.',
    campos: [
      { k: 'pesos', label: 'Pesos individuales (g)', tipo: 'texto', placeholder: 'ej: 62 59.5 61 63 …' },
      { k: 'cantidad', label: 'O cantidad de huevos', tipo: 'numero' },
      { k: 'pesoTotal', label: 'y peso total (g)', tipo: 'numero' },
    ],
    calcular(d) {
      const est = estadisticaPesos(listaNumeros(d.pesos))
      if (est) {
        return {
          muestra: est.n,
          results: { ...est },
          status: peor(rango(est.promedio, REFERENCIA.pesoHuevo), minimo(est.uniformidad, REFERENCIA.uniformidad)),
          resumen: `Promedio ${est.promedio} g · uniformidad ${est.uniformidad} % · CV ${est.cv} %`,
        }
      }
      const c = n(d.cantidad)
      const t = n(d.pesoTotal)
      if (!c || !t) return { error: 'Escriba los pesos, o la cantidad y el peso total.' }
      const prom = r1(t / c)
      return {
        muestra: c,
        results: { n: c, promedio: prom },
        status: rango(prom, REFERENCIA.pesoHuevo),
        resumen: `Promedio ${prom} g (${c} huevos)`,
      }
    },
  },
  {
    id: 'moisture_loss',
    area: 'calidad',
    label: 'Pérdida de humedad',
    icon: '💧',
    codigo: 'FOCAL-02',
    ayuda: 'Bandeja testigo: pésela vacía, con huevo al cargar y otra vez antes de transferir.',
    campos: [
      { k: 'bandejaVacia', label: 'Bandeja vacía (g)', tipo: 'numero' },
      { k: 'pesoCargue', label: 'Con huevo al cargar (g)', tipo: 'numero' },
      { k: 'pesoActual', label: 'Con huevo hoy (g)', tipo: 'numero' },
      { k: 'dia', label: 'Día de incubación', tipo: 'numero', placeholder: '18' },
    ],
    calcular(d) {
      const v = n(d.bandejaVacia) ?? 0
      const a = n(d.pesoCargue)
      const b = n(d.pesoActual)
      const dia = n(d.dia) || 18
      if (!a || !b || a <= v || b > a) return { error: 'Revise los pesos: el de hoy debe ser menor que el del cargue.' }
      const perdida = ((a - b) / (a - v)) * 100
      const al18 = r1((perdida * 18) / dia)
      return {
        muestra: null,
        results: { perdida: r1(perdida), dia, perdidaDia18: al18 },
        status: rango(al18, REFERENCIA.humedad),
        resumen: `Pérdida ${r1(perdida)} % al día ${dia} · ${al18} % proyectado al día 18 (meta 11–13 %)`,
      }
    },
  },
  {
    id: 'candling',
    area: 'calidad',
    label: 'Ovoscopia / fertilidad',
    icon: '🔦',
    codigo: 'FOCAL-03',
    ayuda: 'Ovoscopia al día 10–12. Cuente los huevos revisados y los retirados por tipo.',
    campos: [
      { k: 'revisados', label: 'Huevos revisados', tipo: 'numero' },
      { k: 'claros', label: 'Claros (infértiles)', tipo: 'numero' },
      { k: 'muertos', label: 'Muertos tempranos (anillo de sangre)', tipo: 'numero' },
      { k: 'contaminados', label: 'Contaminados / podridos', tipo: 'numero' },
      { k: 'rotos', label: 'Rotos / fisurados', tipo: 'numero' },
    ],
    calcular(d) {
      const rev = n(d.revisados)
      if (!rev) return { error: 'Escriba cuántos huevos revisó.' }
      const claros = n(d.claros) || 0
      const muertos = n(d.muertos) || 0
      const cont = n(d.contaminados) || 0
      const rotos = n(d.rotos) || 0
      if (claros + muertos + cont + rotos > rev) return { error: 'Los retirados suman más que los revisados.' }
      const fert = pct(rev - claros, rev)
      const res = {
        fertilidad: fert,
        infertilidad: pct(claros, rev),
        mortalidadTemprana: pct(muertos, rev),
        contaminados: pct(cont, rev),
        rotos: pct(rotos, rev),
        viables: pct(rev - claros - muertos - cont - rotos, rev),
      }
      return {
        muestra: rev,
        results: res,
        status: peor(
          minimo(fert, REFERENCIA.fertilidad),
          maximo(res.mortalidadTemprana, REFERENCIA.mortalidadTemprana),
          maximo(res.contaminados, REFERENCIA.contaminados),
        ),
        resumen: `Fertilidad ${fert} % · mortalidad temprana ${res.mortalidadTemprana} % · contaminados ${res.contaminados} %`,
      }
    },
  },
  {
    id: 'breakout',
    area: 'calidad',
    label: 'Embriodiagnóstico',
    icon: '🥚',
    codigo: 'FOCAL-04',
    ayuda: 'Abra los huevos que no nacieron (residuo de nacedora) y clasifíquelos por etapa.',
    campos: [
      { k: 'cargados', label: 'Huevos cargados del lote (opcional)', tipo: 'numero' },
      { k: 'infertiles', label: 'Infértiles', tipo: 'numero' },
      { k: 'temprana', label: 'Mortalidad temprana (días 1–7)', tipo: 'numero' },
      { k: 'intermedia', label: 'Mortalidad intermedia (8–14)', tipo: 'numero' },
      { k: 'tardia', label: 'Mortalidad tardía (15–21)', tipo: 'numero' },
      { k: 'picadosVivos', label: 'Picados vivos', tipo: 'numero' },
      { k: 'picadosMuertos', label: 'Picados muertos', tipo: 'numero' },
      { k: 'contaminados', label: 'Contaminados', tipo: 'numero' },
      { k: 'malposicion', label: 'Malposición / malformados', tipo: 'numero' },
    ],
    calcular(d) {
      const claves = ['infertiles', 'temprana', 'intermedia', 'tardia', 'picadosVivos', 'picadosMuertos', 'contaminados', 'malposicion']
      const v = Object.fromEntries(claves.map((k) => [k, n(d[k]) || 0]))
      const total = claves.reduce((s, k) => s + v[k], 0)
      if (!total) return { error: 'Escriba al menos una cantidad.' }
      const cargados = n(d.cargados)
      const base = cargados && cargados >= total ? cargados : null
      const results = { analizados: total, cargados: base }
      for (const k of claves) {
        results[k] = v[k]
        results[`${k}Pct`] = pct(v[k], total)
        if (base) results[`${k}DeCargados`] = pct(v[k], base)
      }
      const tardias = v.tardia + v.picadosVivos + v.picadosMuertos
      results.tardiasPct = pct(tardias, total)
      const contCargados = base ? pct(v.contaminados, base) : null
      const status = peor(
        contCargados != null ? maximo(contCargados, REFERENCIA.contaminados) : 'ok',
        results.tardiasPct > 50 ? 'watch' : 'ok',
      )
      const mayor = claves.reduce((m, k) => (v[k] > v[m] ? k : m), claves[0])
      const nombres = {
        infertiles: 'infértiles',
        temprana: 'mortalidad temprana',
        intermedia: 'mortalidad intermedia',
        tardia: 'mortalidad tardía',
        picadosVivos: 'picados vivos',
        picadosMuertos: 'picados muertos',
        contaminados: 'contaminados',
        malposicion: 'malposición',
      }
      return {
        muestra: total,
        results,
        status,
        resumen: `${total} huevos analizados · la mayor causa: ${nombres[mayor]} (${results[`${mayor}Pct`]} %)${base ? ` · ${pct(total, base)} % de lo cargado` : ''}`,
      }
    },
  },
  {
    id: 'chick_quality',
    area: 'calidad',
    label: 'Calidad del pollito',
    icon: '🐣',
    codigo: 'FOCAL-05',
    ayuda: 'Muestra al sacar de nacedora: peso y pollitos de segunda por defecto.',
    campos: [
      { k: 'pesos', label: 'Pesos individuales (g)', tipo: 'texto', placeholder: 'ej: 41 40.5 42 …' },
      { k: 'muestra', label: 'O pollitos pesados', tipo: 'numero' },
      { k: 'pesoTotal', label: 'y peso total (g)', tipo: 'numero' },
      { k: 'nacidos', label: 'Pollitos del lote (para el % de segunda)', tipo: 'numero' },
      { k: 'ombligo', label: 'Ombligo mal cerrado', tipo: 'numero' },
      { k: 'patas', label: 'Patas / pico defectuosos', tipo: 'numero' },
      { k: 'deshidratados', label: 'Deshidratados / débiles', tipo: 'numero' },
      { k: 'otros', label: 'Otros de segunda', tipo: 'numero' },
    ],
    calcular(d) {
      const est = estadisticaPesos(listaNumeros(d.pesos))
      let prom = est?.promedio ?? null
      let muestra = est?.n ?? null
      if (prom == null) {
        const c = n(d.muestra)
        const t = n(d.pesoTotal)
        if (c && t) {
          prom = r1(t / c)
          muestra = c
        }
      }
      const segunda = ['ombligo', 'patas', 'deshidratados', 'otros'].reduce((s, k) => s + (n(d[k]) || 0), 0)
      const nacidos = n(d.nacidos)
      if (prom == null && !segunda) return { error: 'Escriba los pesos o los pollitos de segunda.' }
      const segPct = nacidos ? pct(segunda, nacidos) : null
      return {
        muestra,
        results: { promedio: prom, ...(est || {}), segunda, segundaPct: segPct },
        status: peor(rango(prom, REFERENCIA.pesoPollito), maximo(segPct, REFERENCIA.segunda)),
        resumen: [prom != null && `Peso ${prom} g`, est && `uniformidad ${est.uniformidad} %`, `${segunda} de segunda${segPct != null ? ` (${segPct} %)` : ''}`]
          .filter(Boolean)
          .join(' · '),
      }
    },
  },
  // ─── Auxiliar de vacunación (07-10-2026), igual a los formatos en papel ───
  {
    id: 'nitrogen_fridge',
    area: 'vacunacion',
    sinLote: true,
    label: 'Nevera y nitrógeno',
    icon: '🧊',
    codigo: 'PR06-1',
    ayuda: 'Control diario: temperatura de la nevera de vacunas y medida de nitrógeno de cada tanque (cm).',
    campos: [
      { k: 'tempNevera', label: 'Temperatura nevera (°C)', tipo: 'numero' },
      { k: 'tanque1', label: 'Medida tanque 1 (cm)', tipo: 'numero' },
      { k: 'tanque2', label: 'Medida tanque 2 (cm)', tipo: 'numero' },
      { k: 'relleno1', label: 'Relleno tanque 1', tipo: 'si' },
      { k: 'relleno2', label: 'Relleno tanque 2', tipo: 'si' },
    ],
    calcular(d) {
      const t = n(d.tempNevera)
      const t1 = n(d.tanque1)
      const t2 = n(d.tanque2)
      if (t == null && t1 == null && t2 == null) return { error: 'Escriba la temperatura o la medida de los tanques.' }
      const tanque = (v) => (v == null ? 'ok' : v <= REFERENCIA.nitrogeno.alerta ? 'alert' : v <= REFERENCIA.nitrogeno.vigilar ? 'watch' : 'ok')
      const ajuste = [d.relleno1 === 'si' && 'relleno tanque 1', d.relleno2 === 'si' && 'relleno tanque 2'].filter(Boolean)
      const rellenar = [t1 != null && t1 <= REFERENCIA.nitrogeno.vigilar && !ajuste.includes('relleno tanque 1') && 'tanque 1', t2 != null && t2 <= REFERENCIA.nitrogeno.vigilar && !ajuste.includes('relleno tanque 2') && 'tanque 2'].filter(Boolean)
      return {
        muestra: null,
        results: { tempNevera: t, tanque1: t1, tanque2: t2, ajuste, rellenar },
        status: peor(rango(t, REFERENCIA.nevera), ajuste.includes('relleno tanque 1') ? 'ok' : tanque(t1), ajuste.includes('relleno tanque 2') ? 'ok' : tanque(t2)),
        resumen: [
          t != null && `Nevera ${t} °C`,
          t1 != null && `tanque 1: ${t1} cm`,
          t2 != null && `tanque 2: ${t2} cm`,
          ajuste.length && ajuste.join(' y '),
          rellenar.length && `programar relleno de ${rellenar.join(' y ')}`,
        ]
          .filter(Boolean)
          .join(' · '),
      }
    },
  },
  {
    id: 'sexing_count',
    area: 'vacunacion',
    label: 'Sexaje y conteo',
    icon: '🐥',
    codigo: 'Sexaje',
    ayuda: 'Verificación del lote, igual al formato en papel: sexaje (machos y hembras) y conteo (machos y hembras).',
    campos: [
      { k: 'sexajeMac', label: 'Sexaje · machos', tipo: 'numero' },
      { k: 'sexajeHem', label: 'Sexaje · hembras', tipo: 'numero' },
      { k: 'conteoMac', label: 'Conteo · machos', tipo: 'numero' },
      { k: 'conteoHem', label: 'Conteo · hembras', tipo: 'numero' },
    ],
    calcular(d) {
      const v = ['sexajeMac', 'sexajeHem', 'conteoMac', 'conteoHem'].map((k) => n(d[k]))
      if (v.every((x) => x == null)) return { error: 'Escriba los valores de sexaje y conteo.' }
      const [sm, sh, cm, ch] = v.map((x) => x || 0)
      return {
        muestra: null,
        results: { sexajeMac: sm, sexajeHem: sh, conteoMac: cm, conteoHem: ch, sexaje: sm + sh, conteo: cm + ch },
        status: 'ok',
        resumen: `Sexaje: ${sm} M / ${sh} H · Conteo: ${cm} M / ${ch} H`,
      }
    },
  },
  {
    id: 'navel_quality',
    area: 'vacunacion',
    label: 'Ombligo y cicatrización',
    icon: '🩹',
    codigo: 'Ombligo',
    ayuda: 'Muestra de pollitos del lote: cuántos con cicatrización n II y n III, y con problema de abdomen, tarso, pico o actividad.',
    campos: [
      { k: 'muestra', label: 'Pollitos revisados', tipo: 'numero', placeholder: '100' },
      { k: 'nII', label: 'Cicatrización n II', tipo: 'numero' },
      { k: 'nIII', label: 'Cicatrización n III', tipo: 'numero' },
      { k: 'abdomen', label: 'Abdomen', tipo: 'numero' },
      { k: 'tarso', label: 'Tarso', tipo: 'numero' },
      { k: 'pico', label: 'Pico', tipo: 'numero' },
      { k: 'actividad', label: 'Actividad (sin actividad)', tipo: 'numero' },
    ],
    calcular(d) {
      const claves = ['nII', 'nIII', 'abdomen', 'tarso', 'pico', 'actividad']
      const v = Object.fromEntries(claves.map((k) => [k, n(d[k])]))
      if (claves.every((k) => v[k] == null)) return { error: 'Escriba al menos un valor.' }
      const muestra = n(d.muestra) || 100
      const c = Object.fromEntries(claves.map((k) => [k, v[k] || 0]))
      if (c.nII + c.nIII > muestra) return { error: 'Los ombligos n II y n III suman más que los pollitos revisados.' }
      const results = { muestra, ...c, nI: muestra - c.nII - c.nIII }
      for (const k of [...claves, 'nI']) results[`${k}Pct`] = pct(results[k], muestra)
      const hayActividad = c.actividad > 0
      return {
        muestra,
        results,
        status: peor(maximo(results.nIIIPct, REFERENCIA.ombligoIII), maximo(results.nIIPct, REFERENCIA.ombligoII), c.actividad > 2 ? 'watch' : 'ok'),
        resumen: `n I ${results.nIPct} % · n II ${results.nIIPct} % · n III ${results.nIIIPct} %${c.abdomen || c.tarso || c.pico ? ` · abdomen ${c.abdomen}, tarso ${c.tarso}, pico ${c.pico}` : ''} · ${hayActividad ? `${c.actividad} sin actividad` : 'actividad normal'}`,
      }
    },
  },
]

export const formatoPorId = (id) => FORMATOS.find((f) => f.id === id)

/** Formatos de un área: «calidad» o «vacunacion» */
export const formatosDe = (area) => FORMATOS.filter((f) => f.area === area)
