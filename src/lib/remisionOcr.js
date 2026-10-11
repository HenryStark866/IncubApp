/**
 * Motor de reconocimiento óptico (OCR) y extracción inteligente de datos
 * para formatos físicos de "Remisión Huevos Galpón" (Antioqueña de Incubación S.A.S).
 *
 * Utiliza Tesseract.js cargado dinámicamente para procesar fotos tomadas
 * con la cámara del celular o subidas desde la galería.
 */

export const SAMPLE_REMISION_DATA = {
  remisionNo: '4854',
  fechaProd: '2026-10-08',
  fechaRemision: '2026-10-08',
  quienDespacha: 'Adrian Gil',
  quienRecibe: 'Nelson Palacio',
  observaciones: '',
  rows: [
    { galpon: '201', incubable: 2240, fisurado: '', extra: '', roto: '', sucio: '', cajas: 6, cubetas: '' },
    { galpon: '202', incubable: 2340, fisurado: '', extra: '', roto: '', sucio: '', cajas: 6, cubetas: '' },
    { galpon: '203', incubable: 2160, fisurado: '', extra: '', roto: '', sucio: '', cajas: 6, cubetas: '' },
    { galpon: '204', incubable: 1870, fisurado: '', extra: '', roto: '', sucio: '', cajas: 5, cubetas: '' },
    { galpon: '205', incubable: 2520, fisurado: '12030 ✓', extra: '', roto: '', sucio: '', cajas: 7, cubetas: '' },
    { galpon: '301', incubable: 1870, fisurado: '', extra: '', roto: '', sucio: '', cajas: 5, cubetas: '' },
    { galpon: '302', incubable: 1680, fisurado: '', extra: '', roto: '', sucio: '', cajas: 5, cubetas: '' },
    { galpon: '303', incubable: 1800, fisurado: '', extra: '', roto: '', sucio: '', cajas: 5, cubetas: '' },
    { galpon: '304', incubable: 1950, fisurado: '', extra: '', roto: '', sucio: '', cajas: 5, cubetas: '' },
    { galpon: '305', incubable: 1800, fisurado: '', extra: '', roto: '', sucio: '', cajas: 5, cubetas: '' },
    { galpon: '306', incubable: 1980, fisurado: '12840 ✓', extra: '', roto: '', cajas: 6, cubetas: '' },
    { galpon: '401', incubable: 1440, fisurado: '', extra: '', roto: '', sucio: '', cajas: 4, cubetas: '' },
    { galpon: '402', incubable: 1380, fisurado: '', extra: '', roto: '', sucio: '', cajas: 4, cubetas: '' },
    { galpon: '403', incubable: 1440, fisurado: '', extra: '', roto: '', sucio: '', cajas: 4, cubetas: '' },
    { galpon: '404', incubable: 1530, fisurado: '', extra: '', roto: '', sucio: '', cajas: 4, cubetas: '' },
    { galpon: '405', incubable: 1380, fisurado: '', extra: '', roto: '', sucio: '', cajas: 4, cubetas: '' },
    { galpon: '406', incubable: 1440, fisurado: '10650 +90', extra: '', roto: '', sucio: '', cajas: 4, cubetas: '' },
  ]
}

function normalizeDate(str) {
  if (!str) return ''
  // Extrae dígitos de día, mes, año permitiendo /, -, ., |, _, y espacios
  const digits = str.replace(/[^\d]/g, ' ').trim().split(/\s+/)
  if (digits.length >= 3) {
    let [d, m, y] = digits
    if (d.length === 4) {
      const yr = d; d = y; y = yr
    }
    if (d.length === 1) d = '0' + d
    if (m.length === 1) m = '0' + m
    if (y.length === 2) {
      const yr = Number(y)
      y = yr < 50 ? `20${y}` : `19${y}`
    }
    // Si mes > 12 y día <= 12, intercambiar
    if (Number(m) > 12 && Number(d) <= 12) {
      const tmp = d; d = m; m = tmp
    }
    // Asegura formato YYYY-MM-DD para <input type="date">
    return `${y}-${m}-${d}`
  }
  return ''
}

export function parseRemisionOcrText(text) {
  const result = {
    remisionNo: '',
    fechaProd: '',
    fechaRemision: '',
    quienDespacha: '',
    quienRecibe: '',
    observaciones: '',
    rows: []
  }

  if (!text || typeof text !== 'string') return result

  const lines = text.split('\n').map(l => l.trim()).filter(Boolean)

  for (const line of lines) {
    // 1. Número de remisión (ej: "№ 4854", "No. 4854", "N° 1234", "Remisión Nº 4854")
    if (!result.remisionNo) {
      const explicitNo = line.match(/(?:(?:Remisi[oó]n.*?|^|\s)(?:№|N[°ºo\.]|No\.?|#))\s*[:#]?\s*([0-9]{3,8})/i)
      if (explicitNo) {
        const candidate = explicitNo[1].trim()
        if (!['2020','2021','2022','2023','2024','2025','2026','2027','900'].includes(candidate)) {
          result.remisionNo = candidate
        }
      }
    }

    // 2. Fecha de producción
    if (!result.fechaProd) {
      const fpMatch = line.match(/Producci[oó]n\D*?(\d{1,2}[\s\/\-\.\|_]+\d{1,2}[\s\/\-\.\|_]+\d{2,4})/i)
      if (fpMatch) {
        result.fechaProd = normalizeDate(fpMatch[1])
      }
    }

    // 3. Fecha de remisión (evitando la cabecera "Remisión Huevos Galpón")
    if (!result.fechaRemision && !line.toLowerCase().includes('huevos galp')) {
      const frMatch = line.match(/(?:Fecha\s*de\s*)?Remisi[oó]n\D*?(\d{1,2}[\s\/\-\.\|_]+\d{1,2}[\s\/\-\.\|_]+\d{2,4})/i)
      if (frMatch) {
        result.fechaRemision = normalizeDate(frMatch[1])
      }
    }

    // 4. Quien despacha
    if (!result.quienDespacha) {
      const qdMatch = line.match(/(?:Quien\s*Despacha|Despachad?o?r?)\s*[:_]?\s*([A-Za-z\u00C0-\u017F\s]{2,35})/i)
      if (qdMatch && !qdMatch[1].toLowerCase().includes('recibe')) {
        const cleaned = qdMatch[1]
          .replace(/^(?:a|de|el|la)\s+/i, '')
          .replace(/\bdespacha\b/gi, '')
          .replace(/[_|]/g, '')
          .trim()
        if (cleaned.length >= 2) {
          result.quienDespacha = cleaned
        }
      }
    }

    // 5. Quien recibe
    if (!result.quienRecibe) {
      const qrMatch = line.match(/(?:Quien\s*Recibe|Receptor)\s*[:_]?\s*([A-Za-z\u00C0-\u017F\s]{2,35})/i)
      if (qrMatch && !qrMatch[1].toLowerCase().includes('despacha')) {
        const cleaned = qrMatch[1]
          .replace(/^(?:a|de|el|la)\s+/i, '')
          .replace(/\brecibe\b/gi, '')
          .replace(/[_|()]/g, '')
          .trim()
        if (cleaned.length >= 2) {
          result.quienRecibe = cleaned
        }
      }
    }

    // 6. Filas de galpón: busca líneas con identificador de galpón y cantidades
    // Ejemplos: "201 2240 6", "202  2340  6", "G1 1800 5", "301 1870"
    const rowMatch = line.match(/^(?:Galp[oó]n\s*)?([Gg]?\d{1,4})\s+.*?(\d{1,3}(?:[.,]\d{3})*|\d{3,5})(?:\s+(\d{1,3}))?/)
    if (rowMatch) {
      const galponCode = rowMatch[1]
      const rawIncubable = rowMatch[2].replace(/[.,]/g, '')
      const incubableNum = Number(rawIncubable)
      if (incubableNum > 50 && !['900','2020','2021','2022','2023','2024','2025','2026','2027'].includes(galponCode)) {
        result.rows.push({
          galpon: galponCode,
          incubable: incubableNum,
          cajas: rowMatch[3] ? Number(rowMatch[3]) : (Math.floor(incubableNum / 360) || ''),
          fisurado: '',
          extra: '',
          roto: '',
          sucio: '',
          cubetas: ''
        })
      }
    }
  }

  // Si el número de remisión aún no se encontró, buscar en todo el texto cualquier Nº o número no-año
  if (!result.remisionNo) {
    const anyNo = text.match(/(?:№|N[°ºo\.]|No\.?|#)\s*[:#]?\s*([0-9]{3,8})/i)
    if (anyNo && !['2020','2021','2022','2023','2024','2025','2026','2027','900'].includes(anyNo[1])) {
      result.remisionNo = anyNo[1]
    } else {
      // Buscar números de 4 a 6 dígitos en el texto que no sean fechas o NIT
      const allNums = text.match(/\b([1-9]\d{3,5})\b/g)
      if (allNums) {
        const valid = allNums.find(n => !['2020','2021','2022','2023','2024','2025','2026','2027','900','1600','1080','1920'].includes(n))
        if (valid) result.remisionNo = valid
      }
    }
  }

  // Si alguna fecha no se detectó individualmente pero se encontraron fechas genéricas
  if (!result.fechaRemision || !result.fechaProd) {
    const genericDates = text.match(/\b(\d{1,2}[\s\/\-\.\|_]+\d{1,2}[\s\/\-\.\|_]+\d{2,4})\b/g)
    if (genericDates && genericDates.length > 0) {
      const parsed = genericDates.map(normalizeDate).filter(Boolean)
      if (parsed[0]) {
        if (!result.fechaProd) result.fechaProd = parsed[0]
        if (!result.fechaRemision) result.fechaRemision = parsed[1] || parsed[0]
      }
    }
  }

  return result
}

/**
 * Ejecuta OCR sobre una imagen (File, Blob, ObjectURL o DataURL) y devuelve los datos extraídos
 */
export async function recognizeAndParseRemision(imageSource, onProgress) {
  try {
    const Tesseract = await import('tesseract.js')
    const tesseractRecognize = Tesseract.default?.recognize || Tesseract.recognize

    if (onProgress) onProgress({ status: 'loading', progress: 0.1, message: 'Iniciando motor de reconocimiento OCR…' })

    const res = await tesseractRecognize(imageSource, 'spa+eng', {
      logger: m => {
        if (onProgress && m.status === 'recognizing text') {
          onProgress({ status: 'recognizing', progress: m.progress, message: `Escaneando texto e imagen (${Math.round(m.progress * 100)}%)…` })
        }
      }
    })

    const rawText = res?.data?.text || ''
    const parsed = parseRemisionOcrText(rawText)

    let fieldsFoundCount = 0
    if (parsed.remisionNo) fieldsFoundCount++
    if (parsed.fechaProd) fieldsFoundCount++
    if (parsed.fechaRemision) fieldsFoundCount++
    if (parsed.quienDespacha) fieldsFoundCount++
    if (parsed.quienRecibe) fieldsFoundCount++
    fieldsFoundCount += parsed.rows.length

    return {
      ok: true,
      data: parsed,
      rawText,
      fieldsFoundCount
    }
  } catch (err) {
    console.error('OCR Error:', err)
    return {
      ok: false,
      error: err.message || 'No se pudo procesar la imagen con OCR',
      data: null
    }
  }
}
