/**
 * Generación de planos / CSV compatibles con importación Siesa.
 * Formato delimitado por punto y coma (estándar contable CO) + JSONL de respaldo.
 */

function esc(v) {
  if (v == null) return ''
  const s = String(v)
  if (/[;"\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

function row(fields) {
  return fields.map(esc).join(';')
}

export function planoTerceros(payloads) {
  const header = row([
    'CIA',
    'NIT',
    'RAZON_SOCIAL',
    'CONTACTO',
    'EMAIL',
    'TELEFONO',
    'CIUDAD',
    'DEPARTAMENTO',
    'DIRECCION',
    'CODIGO',
    'ESTADO',
    'ID_EXTERNO',
  ])
  const lines = payloads.map((p) =>
    row([
      p.companyCode,
      p.nit,
      p.razonSocial,
      p.contacto,
      p.email,
      p.telefono,
      p.ciudad,
      p.departamento,
      p.direccion,
      p.codigoInterno,
      p.estado,
      p.externalId,
    ])
  )
  return [header, ...lines].join('\r\n')
}

export function planoDocumentos(payloads) {
  const header = row([
    'CIA',
    'CO',
    'TIPO_DOC',
    'DOCUMENTO',
    'FECHA',
    'NIT',
    'TERCERO',
    'ITEM',
    'DESCRIPCION',
    'CANTIDAD',
    'HEMBRAS',
    'MACHOS',
    'VR_UNIT',
    'VR_TOTAL',
    'DOC_PEDIDO',
    'DIRECCION',
    'ID_EXTERNO',
    'NOTAS',
  ])
  const lines = []
  for (const p of payloads) {
    const lineas = p.lineas?.length ? p.lineas : [{ item: '', descripcion: p.descripcion || '', cantidad: 1, valorUnitario: p.valor || 0, valorTotal: p.valor || 0 }]
    for (const ln of lineas) {
      lines.push(
        row([
          p.companyCode,
          p.co,
          p.docType,
          p.documento,
          p.fecha,
          p.terceroNit,
          p.terceroNombre,
          ln.item,
          ln.descripcion,
          ln.cantidad,
          ln.cantidadHembras ?? '',
          ln.cantidadMachos ?? '',
          ln.valorUnitario ?? p.valor ?? '',
          ln.valorTotal ?? p.valorTotal ?? p.valor ?? '',
          p.documentoPedido || '',
          p.direccionEntrega || '',
          p.externalId,
          p.notas || '',
        ])
      )
    }
  }
  return [header, ...lines].join('\r\n')
}

export function planoCostos(payloads) {
  const header = row([
    'CIA',
    'CO',
    'TIPO_DOC',
    'DOCUMENTO',
    'FECHA',
    'DESCRIPCION',
    'VALOR',
    'DOWNTIME_MIN',
    'ESTADO',
    'ID_EXTERNO',
  ])
  const lines = payloads.map((p) =>
    row([
      p.companyCode,
      p.co,
      p.docType,
      p.documento,
      p.fecha,
      p.descripcion,
      p.valor,
      p.downtimeMinutos,
      p.estado,
      p.externalId,
    ])
  )
  return [header, ...lines].join('\r\n')
}

export function buildPlanoBundle(mappedByEntity) {
  const files = []
  if (mappedByEntity.tercero?.length) {
    files.push({
      name: 'siesa_terceros.csv',
      mime: 'text/csv;charset=utf-8',
      content: planoTerceros(mappedByEntity.tercero),
      entity: 'tercero',
      count: mappedByEntity.tercero.length,
    })
  }
  const docs = [
    ...(mappedByEntity.pedido || []),
    ...(mappedByEntity.remision || []),
    ...(mappedByEntity.factura || []),
    ...(mappedByEntity.inventario || []),
  ]
  if (docs.length) {
    files.push({
      name: 'siesa_documentos.csv',
      mime: 'text/csv;charset=utf-8',
      content: planoDocumentos(docs),
      entity: 'documentos',
      count: docs.length,
    })
  }
  if (mappedByEntity.costo_ot?.length) {
    files.push({
      name: 'siesa_costos_ot.csv',
      mime: 'text/csv;charset=utf-8',
      content: planoCostos(mappedByEntity.costo_ot),
      entity: 'costo_ot',
      count: mappedByEntity.costo_ot.length,
    })
  }
  // JSONL completo para middleware avanzado
  const all = Object.values(mappedByEntity).flat()
  if (all.length) {
    files.push({
      name: 'siesa_payload.jsonl',
      mime: 'application/x-ndjson',
      content: all.map((x) => JSON.stringify(x)).join('\n'),
      entity: 'all',
      count: all.length,
    })
  }
  return files
}

export function downloadTextFile(filename, content, mime = 'text/plain;charset=utf-8') {
  const blob = new Blob(['\uFEFF' + content], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}

export function downloadPlanoFiles(files) {
  for (const f of files) {
    downloadTextFile(f.name, f.content, f.mime)
  }
  return { count: files.length, files: files.map((f) => ({ name: f.name, count: f.count })) }
}
