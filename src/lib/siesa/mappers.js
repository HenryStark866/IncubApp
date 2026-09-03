/**
 * Mapeo IncubApp → payload Siesa (terceros, pedidos, remisiones, facturas, costos).
 * Campos genéricos compatibles con APIs REST / middleware y con planos.
 */

function digitos(nit) {
  if (nit == null || nit === '') return ''
  return String(nit).replace(/[^\d]/g, '')
}

function money(n) {
  const v = Number(n)
  if (!Number.isFinite(v)) return 0
  return Math.round(v * 100) / 100
}

function qty(n) {
  const v = Number(n)
  return Number.isFinite(v) ? v : 0
}

function externalId(prefix, type, id) {
  const p = (prefix || 'INC').toUpperCase().slice(0, 8)
  const short = String(id || '').replace(/-/g, '').slice(0, 12)
  return `${p}-${type}-${short}`
}

function itemCode(config, productType) {
  const map = config?.itemCodes || {}
  const code = map[productType] || map.day_old_chicks || map.other || ''
  return code || productType || 'GEN'
}

/**
 * Cliente IncubApp → tercero Siesa
 */
export function mapCustomerToTercero(customer, config = {}) {
  const nit = digitos(customer.nit)
  return {
    entity: 'tercero',
    externalId: externalId(config.externalPrefix, 'TER', customer.id),
    companyCode: config.companyCode || '',
    co: config.co || '',
    nit,
    digitoVerificacion: customer.nit_dv || '',
    razonSocial: customer.name || '',
    nombreComercial: customer.name || '',
    contacto: customer.contact_name || '',
    email: customer.email || '',
    telefono: customer.phone || '',
    ciudad: customer.city || '',
    departamento: customer.department || '',
    direccion: customer.address || '',
    codigoInterno: customer.code || '',
    estado: customer.status === 'active' ? 'A' : customer.status === 'blocked' ? 'B' : 'I',
    sitioWeb: customer.website || '',
    notas: customer.notes || '',
    meta: {
      incubappId: customer.id,
      orgId: customer.org_id,
      productInterest: customer.product_interest,
    },
  }
}

/**
 * Pedido de venta → documento PV Siesa
 */
export function mapOrderToPedido(order, config = {}) {
  const females = qty(order.qty_females)
  const males = qty(order.qty_males)
  const total = qty(order.qty_total) || females + males
  const unit = money(order.unit_price)
  const productType = order.product_type || 'day_old_chicks'
  const customer = order.customers || {}

  return {
    entity: 'pedido',
    externalId: externalId(config.externalPrefix, 'PV', order.id),
    companyCode: config.companyCode || '',
    co: config.co || '',
    un: config.un || '',
    docType: config.docTypes?.pedido || 'PV',
    documento: order.code || '',
    fecha: order.requested_date || order.created_at?.slice?.(0, 10) || new Date().toISOString().slice(0, 10),
    fechaEntrega: order.delivery_date || '',
    terceroNit: digitos(customer.nit),
    terceroNombre: customer.name || '',
    terceroId: order.customer_id,
    estado: order.status,
    direccionEntrega: order.delivery_address || '',
    moneda: order.currency || 'COP',
    lineas: [
      {
        item: itemCode(config, productType),
        descripcion: productType === 'eggs' ? 'Huevo fértil' : 'Pollito de un día',
        cantidad: total,
        cantidadHembras: females,
        cantidadMachos: males,
        valorUnitario: unit,
        valorTotal: money(unit * total),
        bodega: config.co || '',
      },
    ],
    valorTotal: money(unit * total),
    notas: order.notes || '',
    meta: {
      incubappId: order.id,
      orgId: order.org_id,
      customerId: order.customer_id,
    },
  }
}

/**
 * Remisión → documento RM Siesa
 */
export function mapRemittanceToRemision(rem, config = {}) {
  const females = qty(rem.qty_females)
  const males = qty(rem.qty_males)
  const total = females + males
  const order = rem.sales_orders || {}
  const customer = rem.customers || {}
  const unit = money(order.unit_price)
  const productType = order.product_type || 'day_old_chicks'

  return {
    entity: 'remision',
    externalId: externalId(config.externalPrefix, 'RM', rem.id),
    companyCode: config.companyCode || '',
    co: config.co || '',
    un: config.un || '',
    docType: config.docTypes?.remision || 'RM',
    documento: rem.code || '',
    documentoPedido: order.code || '',
    fecha: rem.dispatch_date || rem.created_at?.slice?.(0, 10) || new Date().toISOString().slice(0, 10),
    terceroNit: digitos(customer.nit),
    terceroNombre: customer.name || '',
    terceroId: rem.customer_id,
    estado: rem.status,
    vehiculo: rem.vehicle || '',
    conductor: rem.driver_name || '',
    direccionEntrega: rem.delivery_address || '',
    moneda: 'COP',
    lineas: [
      {
        item: itemCode(config, productType),
        descripcion: productType === 'eggs' ? 'Huevo fértil' : 'Pollito de un día',
        cantidad: total,
        cantidadHembras: females,
        cantidadMachos: males,
        valorUnitario: unit,
        valorTotal: money(unit * total),
      },
    ],
    valorTotal: money(unit * total),
    notas: rem.notes || '',
    meta: {
      incubappId: rem.id,
      orderId: rem.order_id,
      orgId: rem.org_id,
      accountingExportedAt: rem.accounting_exported_at || null,
      siesaSyncedAt: rem.siesa_synced_at || null,
    },
  }
}

/**
 * Remisión entregada / despachada → factura comercial (borrador contable)
 */
export function mapRemittanceToFactura(rem, config = {}) {
  const base = mapRemittanceToRemision(rem, config)
  return {
    ...base,
    entity: 'factura',
    externalId: externalId(config.externalPrefix, 'FV', rem.id),
    docType: config.docTypes?.factura || 'FV',
    origenRemision: base.documento,
    meta: {
      ...base.meta,
      sourceEntity: 'remision',
    },
  }
}

/**
 * Ítem de inventario de área → movimiento IM
 */
export function mapInventoryItem(item, config = {}) {
  return {
    entity: 'inventario',
    externalId: externalId(config.externalPrefix, 'IM', item.id),
    companyCode: config.companyCode || '',
    co: config.co || '',
    docType: config.docTypes?.inventario || 'IM',
    item: item.sku || item.code || item.id,
    descripcion: item.name || item.label || '',
    cantidad: qty(item.qty ?? item.quantity ?? item.stock),
    unidad: item.unit || 'UND',
    bodega: item.warehouse || config.co || '',
    area: item.area || '',
    costoUnitario: money(item.unit_cost ?? item.cost),
    meta: {
      incubappId: item.id,
      orgId: item.org_id,
    },
  }
}

/**
 * OT con costo → nota / movimiento de costo
 */
export function mapWorkOrderCost(wo, config = {}) {
  return {
    entity: 'costo_ot',
    externalId: externalId(config.externalPrefix, 'NC', wo.id),
    companyCode: config.companyCode || '',
    co: config.co || '',
    docType: config.docTypes?.costo_ot || 'NC',
    documento: wo.code || wo.id?.slice?.(0, 8) || '',
    fecha: (wo.completed_at || wo.updated_at || wo.created_at || '').toString().slice(0, 10),
    descripcion: wo.title || 'Costo orden de trabajo',
    valor: money(wo.cost),
    downtimeMinutos: qty(wo.downtime_minutes),
    estado: wo.status,
    notas: wo.notes || '',
    meta: {
      incubappId: wo.id,
      orgId: wo.org_id,
      machineId: wo.machine_id,
    },
  }
}

export function mapEntity(entityType, record, config) {
  switch (entityType) {
    case 'tercero':
      return mapCustomerToTercero(record, config)
    case 'pedido':
      return mapOrderToPedido(record, config)
    case 'remision':
      return mapRemittanceToRemision(record, config)
    case 'factura':
      return mapRemittanceToFactura(record, config)
    case 'inventario':
      return mapInventoryItem(record, config)
    case 'costo_ot':
      return mapWorkOrderCost(record, config)
    default:
      throw new Error(`Tipo Siesa no soportado: ${entityType}`)
  }
}
