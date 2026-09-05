/**
 * Identidad para documentos exportados (Excel, Word, PDF).
 * - Dentro de un cliente white-label (Incubant): membrete del cliente.
 * - Resto / plataforma: CDH Maker.
 * Henry Stark Desarrollador · CDH Maker
 */

import { resolveBrandContext } from './platform'
import { BRAND, LETTERHEAD } from './brandIdentity'

/** Marca comercial del producto */
export const CORP_LEGAL_NAME = BRAND.productName
export const CORP_PRODUCT = BRAND.productName
export const CORP_LEGACY_BRAND = 'Incubant'
export const CORP_SLOGAN = BRAND.slogan
export const CORP_OPERATOR = BRAND.legalOperator

export const CORP_COLORS = {
  orange: 'E0740A',
  navy: '0B1428',
  ink: '202634',
  muted: '6D7688',
  cream: 'FBF3E7',
  line: 'E7E0D3',
  white: 'FFFFFF',
  cyan: '35D6E8',
}

export const CORP_LOGO_PATH = '/incubant-logo-full.png'
export const CORP_MARK_PATH = '/incubant-mark.png'

/**
 * @param {{
 *   orgName?: string,
 *   org?: object|null,
 *   nit?: string,
 *   city?: string,
 *   phone?: string,
 *   email?: string,
 *   forcePlatform?: boolean,
 * }} extra
 */
export function getCorporateIdentity(extra = {}) {
  const brand = resolveBrandContext({
    org: extra.org || (extra.orgName ? { name: extra.orgName, slug: extra.orgName } : null),
    forcePlatform: !!extra.forcePlatform,
  })

  const isClient = brand.mode === 'client'
  const line1 = isClient
    ? `${brand.product} · ${brand.legalName}`
    : `${LETTERHEAD.productLine}`
  const line2 = isClient
    ? `${brand.slogan}${brand.legacyBrand ? ` · ${brand.legacyBrand}` : ''}`
    : `${brand.slogan} · ${LETTERHEAD.operatorLine}`

  return {
    legalName: isClient ? brand.legalName : BRAND.productName,
    product: brand.product || BRAND.productName,
    legacyBrand: brand.legacyBrand || '',
    slogan: brand.slogan || BRAND.slogan,
    line1,
    line2,
    orgName: extra.orgName || brand.orgName || brand.legalName,
    nit: extra.nit || '',
    city: extra.city || brand.city || '',
    phone: extra.phone || '',
    email: extra.email || '',
    confidentiality: brand.confidentiality || LETTERHEAD.confidentiality,
    logoUrl: brand.logoPath ? absoluteAssetUrl(brand.logoPath) : absoluteAssetUrl(BRAND.assets.logo),
    markUrl: brand.markPath ? absoluteAssetUrl(brand.markPath) : absoluteAssetUrl(BRAND.assets.mark),
    platform: BRAND.legalOperator,
    brandMode: brand.mode,
  }
}

function absoluteAssetUrl(path) {
  try {
    if (typeof window !== 'undefined' && window.location?.origin) {
      return `${window.location.origin}${path}`
    }
  } catch {
    /* */
  }
  return path
}

/** Líneas de membrete para filas de Excel (texto plano) */
export function excelLetterheadRows(meta = {}) {
  const id = getCorporateIdentity(meta)
  const now = new Date().toLocaleString('es-CO', { timeZone: 'America/Bogota' })
  const title = meta.title || meta.documentTitle || 'Reporte operativo'
  const module = meta.module || meta.area || ''
  const by = meta.generatedBy || meta.userName || ''

  const rows = [
    [id.line1],
    [id.line2],
    [id.nit ? `NIT: ${id.nit}` : id.city, id.phone || '', id.email || ''].filter((c) => c !== ''),
    [`Documento: ${title}`],
    [
      `Empresa / sede: ${id.orgName}`,
      module ? `Módulo: ${module}` : '',
      by ? `Generado por: ${by}` : '',
    ].filter((c) => c !== ''),
    [`Fecha de generación: ${now} (America/Bogota)`],
    [id.confidentiality],
  ]
  if (id.brandMode === 'client') rows.push([`Plataforma: ${id.platform}`])
  rows.push([])
  return rows
}

/** Pie de página textual */
export function excelFooterRows(meta = {}) {
  const id = getCorporateIdentity(meta)
  const tail =
    id.brandMode === 'client'
      ? `${id.product} · ${id.legalName} · servicio ${id.platform}`
      : `${id.product} · ${id.legalName}`
  return [[], [`— Fin del documento — ${tail}`], [id.confidentiality]]
}

/**
 * HTML de membrete (Word / PDF impresión).
 */
export function letterheadHtml(meta = {}) {
  const id = getCorporateIdentity(meta)
  const now = new Date().toLocaleString('es-CO', { timeZone: 'America/Bogota' })
  const title = escapeHtml(meta.title || 'Documento operativo')
  const subtitle = escapeHtml(meta.subtitle || id.slogan)
  const org = escapeHtml(id.orgName)
  const by = escapeHtml(meta.generatedBy || '')
  const mod = escapeHtml(meta.module || '')
  const nit = escapeHtml(id.nit || '')
  const logo = id.logoUrl
    ? `<img src="${escapeHtml(id.logoUrl)}" alt="" style="height:48px;width:auto;max-width:220px;object-fit:contain" />`
    : `<div style="font-weight:700;font-size:18px;color:#0b1428">${escapeHtml(id.product)}</div>`

  return `
  <header style="font-family:Segoe UI,system-ui,sans-serif;border-bottom:2px solid #1c2c52;padding-bottom:12px;margin-bottom:16px">
    <div style="display:flex;gap:16px;align-items:center;justify-content:space-between">
      <div>${logo}</div>
      <div style="text-align:right;font-size:12px;color:#6d7688">
        <div style="font-weight:600;color:#202634">${escapeHtml(id.line1)}</div>
        <div>${escapeHtml(id.line2)}</div>
        ${nit ? `<div>NIT: ${nit}</div>` : ''}
      </div>
    </div>
    <h1 style="margin:14px 0 4px;font-size:18px;color:#202634">${title}</h1>
    <div style="font-size:12px;color:#6d7688">
      ${subtitle ? `${subtitle} · ` : ''}${org}
      ${mod ? ` · ${mod}` : ''}
      ${by ? ` · ${by}` : ''}
      · ${escapeHtml(now)}
    </div>
  </header>`
}

export function documentFooterHtml(meta = {}) {
  const id = getCorporateIdentity(meta)
  return `
  <footer style="margin-top:24px;padding-top:10px;border-top:1px solid #e7e0d3;font-family:Segoe UI,system-ui,sans-serif;font-size:10px;color:#6d7688">
    <div>${escapeHtml(id.confidentiality)}</div>
    <div style="margin-top:4px">${escapeHtml(id.line1)}${id.brandMode === 'client' ? ` · SaaS ${escapeHtml(id.platform)}` : ''}</div>
  </footer>`
}

/** Alias usado por exportDocument */
export function footerHtml(meta = {}) {
  return documentFooterHtml(meta)
}

/** Estilos de membrete para Word / impresión PDF */
export function letterheadCss() {
  return `
    body { font-family: Segoe UI, Arial, sans-serif; color: #202634; margin: 24px; font-size: 12px; }
    .corp-table { width: 100%; border-collapse: collapse; margin: 8px 0 16px; font-size: 11px; }
    .corp-table th { background: #0b1428; color: #fff; text-align: left; padding: 6px 8px; }
    .corp-table td { border: 1px solid #e7e0d3; padding: 5px 8px; vertical-align: top; }
    .corp-table tr:nth-child(even) td { background: #fbf3e7; }
    @media print {
      .no-print { display: none !important; }
      body { margin: 12mm; }
    }
  `
}

export function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
