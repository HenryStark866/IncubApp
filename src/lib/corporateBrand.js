/**
 * Identidad para documentos exportados (Excel, Word, PDF).
 * - Dentro de un cliente white-label (Incubant): membrete del cliente.
 * - Resto / plataforma: CDH Maker.
 * Henry Stark Desarrollador · CDH Maker
 */

import { resolveBrandContext } from './platform'
import { BRAND } from './brandIdentity'

/** Marca comercial del producto */
export const CORP_LEGAL_NAME = 'Antioqueña de Incubación S.A.S.'
export const CORP_PRODUCT = 'Incubant'
export const CORP_LEGACY_BRAND = 'Incubant'
export const CORP_SLOGAN = 'Nuestra calidad nos define.'
export const CORP_OPERATOR = BRAND.legalOperator
export const CORP_NIT = '900.762.687-1'
export const CORP_CITY = 'Hispania, Antioquia'

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

export const CORP_LOGO_PATH = '/client-brands/incubant/logo_sig.png'
export const CORP_MARK_PATH = '/client-brands/incubant/mark.png'

/** Catálogo oficial de formatos del Sistema Integrado de Gestión (SIG) */
export const SIG_FORMATS = {
  FOMAT01: { code: 'FOMAT01', name: 'ORDEN DE TRABAJO DE MANTENIMIENTO', version: '01', date: '18-08-2026', process: 'GESTIÓN DE MANTENIMIENTO' },
  FOMAT02: { code: 'FOMAT02', name: 'INVENTARIO DE INFRAESTRUCTURA Y EQUIPOS', version: '02', date: '20-08-2026', process: 'GESTIÓN DE MANTENIMIENTO' },
  FOMAT03: { code: 'FOMAT03', name: 'HOJA DE VIDA DEL EQUIPO', version: '01', date: '18-08-2026', process: 'GESTIÓN DE MANTENIMIENTO' },
  FOMAT04: { code: 'FOMAT04', name: 'LISTA DE CHEQUEO DE INSPECCIÓN DE INFRAESTRUCTURA Y EQUIPOS', version: '01', date: '18-08-2026', process: 'GESTIÓN DE MANTENIMIENTO' },
  FOMAT05: { code: 'FOMAT05', name: 'LIBERACIÓN DE EQUIPO', version: '01', date: '18-08-2026', process: 'GESTIÓN DE MANTENIMIENTO' },
  FOMAT06: { code: 'FOMAT06', name: 'SOLICITUD DE MANTENIMIENTO', version: '01', date: '18-08-2026', process: 'GESTIÓN DE MANTENIMIENTO' },
  FOMAT07: { code: 'FOMAT07', name: 'PLAN ANUAL DE MANTENIMIENTO', version: '01', date: '18-08-2026', process: 'GESTIÓN DE MANTENIMIENTO' },
  FOMAT08: { code: 'FOMAT08', name: 'CALIBRACIÓN DE EQUIPOS', version: '01', date: '18-08-2026', process: 'GESTIÓN DE MANTENIMIENTO' },
  INMAT01: { code: 'INMAT01', name: 'INDICADORES DEL PROCESO DE MANTENIMIENTO', version: '01', date: '18-08-2026', process: 'GESTIÓN DE MANTENIMIENTO' },
  CAMAT01: { code: 'CAMAT01', name: 'CARACTERIZACIÓN PROCESO GESTIÓN DE MANTENIMIENTO', version: '02', date: '18-08-2026', process: 'GESTIÓN DE MANTENIMIENTO' },
  PROMAT01: { code: 'PROMAT01', name: 'PROCEDIMIENTO PROCESO DE MANTENIMIENTO', version: '02', date: '18-08-2026', process: 'GESTIÓN DE MANTENIMIENTO' },
  // Registros de producción que IncubApp diligencia con las rondas y los movimientos de la planta.
  FOINC01: { code: 'FOINC01', name: 'CONTROL DIARIO DE INCUBADORAS', version: '01', date: '15-09-2026', process: 'PRODUCCIÓN · INCUBACIÓN' },
  FONAC01: { code: 'FONAC01', name: 'CONTROL DIARIO DE NACEDORAS', version: '01', date: '15-09-2026', process: 'PRODUCCIÓN · INCUBACIÓN' },
  // Código siguiente del proceso de incubación; confirmar con la asesora del SIG (23-09-2026).
  FOINC02: { code: 'FOINC02', name: 'REPORTE CONSOLIDADO DE OPERACIÓN Y RONDAS', version: '01', date: '23-09-2026', process: 'PRODUCCIÓN · INCUBACIÓN' },
  // Formato impreso del mapa de cargue (src/lib/loadMapPrint.js). Código por confirmar con la
  // asesora del SIG (05-10-2026): es el siguiente libre del proceso de incubación, como FOINC02.
  FOINC03: { code: 'FOINC03', name: 'MAPA DE CARGUE DE INCUBADORA', version: '01', date: '05-10-2026', process: 'PRODUCCIÓN · INCUBACIÓN' },
}

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

  const line1 = 'Antioqueña de Incubación S.A.S.'
  const line2 = 'Sistema Integrado de Gestión (SIG) · "Nuestra calidad nos define."'

  return {
    legalName: CORP_LEGAL_NAME,
    product: CORP_PRODUCT,
    legacyBrand: CORP_LEGACY_BRAND,
    slogan: CORP_SLOGAN,
    line1,
    line2,
    orgName: extra.orgName || 'Antioqueña de Incubación S.A.S.',
    nit: extra.nit || CORP_NIT,
    city: extra.city || CORP_CITY,
    phone: extra.phone || '',
    email: extra.email || '',
    confidentiality: 'Documento controlado del Sistema Integrado de Gestión (SIG) de Antioqueña de Incubación S.A.S. Prohibida su reproducción no autorizada.',
    logoUrl: absoluteAssetUrl('/logo_sig.png'),
    markUrl: absoluteAssetUrl(CORP_MARK_PATH),
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

/** Líneas de membrete para filas de Excel (formato oficial SIG) */
export function excelLetterheadRows(meta = {}) {
  const fomatKey = meta.fomatCode || meta.code || 'FOMAT03'
  const sigInfo = SIG_FORMATS[fomatKey] || {
    code: fomatKey,
    version: meta.version || '01',
    date: meta.date || '18-08-2026',
    process: meta.process || 'SISTEMA INTEGRADO DE GESTIÓN (SIG)',
  }

  const title = meta.title || meta.documentTitle || sigInfo.name || 'FORMATO OFICIAL DE GESTIÓN'
  const now = new Date().toLocaleDateString('es-CO')

  return [
    ['ANTIOQUEÑA DE INCUBACIÓN S.A.S.', '', 'SISTEMA INTEGRADO DE GESTIÓN (SIG)', '', `CÓDIGO: ${sigInfo.code}`],
    ['NIT: 900.762.687-1 · Hispania, Antioquia', '', `PROCESO: ${sigInfo.process}`, '', `VERSIÓN: ${sigInfo.version}`],
    [`Lema: "${CORP_SLOGAN}"`, '', `FORMATO: ${title}`, '', `FECHA: ${sigInfo.date}`],
    [`Sede / Planta: ${meta.plantName || 'Planta Incubant'}`, '', `Generado: ${now}`, '', 'PÁGINA: 1 de 1'],
    [],
  ]
}

/** Pie de página textual */
export function excelFooterRows(meta = {}) {
  const id = getCorporateIdentity(meta)
  return [
    [],
    ['CONTROL DE FIRMAS Y AUTORIZACIÓN:'],
    ['Elaboró: Operario / Técnico Ejecutor', '', 'Revisó: Líder de Mantenimiento / Planta', '', 'Aprobó: Coordinador SIG / Dirección'],
    [],
    [`— Fin del documento — ${id.legalName} · NIT ${id.nit} · "${CORP_SLOGAN}"`],
    [id.confidentiality],
  ]
}

/**
 * HTML de membrete oficial SIG (Word / PDF / Impresión) con tabla de 3 cuerpos.
 */
export function letterheadHtml(meta = {}) {
  const id = getCorporateIdentity(meta)
  const fomatKey = meta.fomatCode || meta.code || 'FOMAT03'
  const sigInfo = SIG_FORMATS[fomatKey] || {
    code: meta.code || 'SIG-DOC',
    version: meta.version || '01',
    date: meta.date || '18-08-2026',
    process: meta.process || 'GESTIÓN DE MANTENIMIENTO',
  }

  const title = escapeHtml(meta.title || sigInfo.name || 'FORMATO DE REGISTRO OPERATIVO')
  const logo = `<img src="${escapeHtml(id.logoUrl)}" alt="Logo SIG Incubant" style="height:55px;width:auto;max-width:200px;object-fit:contain;display:block;margin:0 auto;" />`

  return `
  <header style="font-family:'Segoe UI',Arial,sans-serif;margin-bottom:20px;">
    <table style="width:100%;border-collapse:collapse;border:2px solid #0b1428;text-align:center;">
      <tr>
        <td style="width:25%;border:1px solid #0b1428;padding:8px;vertical-align:middle;background:#ffffff;">
          ${logo}
        </td>
        <td style="width:50%;border:1px solid #0b1428;padding:8px;vertical-align:middle;background:#f8fafc;">
          <div style="font-size:13px;font-weight:800;color:#0b1428;letter-spacing:0.04em;">ANTIOQUEÑA DE INCUBACIÓN S.A.S.</div>
          <div style="font-size:11px;font-weight:700;color:#e0740a;margin:2px 0;">SISTEMA INTEGRADO DE GESTIÓN (SIG)</div>
          <div style="font-size:10px;color:#64748b;font-style:italic;">"${CORP_SLOGAN}"</div>
          <div style="font-size:12px;font-weight:800;color:#1e293b;margin-top:4px;border-top:1px dashed #cbd5e1;padding-top:4px;">
            ${title}
          </div>
        </td>
        <td style="width:25%;border:1px solid #0b1428;padding:6px 8px;vertical-align:middle;text-align:left;font-size:10.5px;line-height:1.45;background:#ffffff;">
          <div><strong>Código:</strong> ${escapeHtml(sigInfo.code)}</div>
          <div><strong>Versión:</strong> ${escapeHtml(sigInfo.version)}</div>
          <div><strong>Fecha:</strong> ${escapeHtml(sigInfo.date)}</div>
          <div><strong>Proceso:</strong> ${escapeHtml(sigInfo.process)}</div>
          <div><strong>Página:</strong> 1 de 1</div>
        </td>
      </tr>
    </table>
    <div style="display:flex;justify-content:space-between;font-size:11px;color:#475569;margin-top:6px;padding:0 2px;">
      <span><strong>Sede:</strong> ${escapeHtml(meta.plantName || 'Planta Incubant · Hispania, Antioquia')}</span>
      <span><strong>Fecha de Generación:</strong> ${new Date().toLocaleDateString('es-CO')}</span>
    </div>
  </header>`
}

export function documentFooterHtml(meta = {}) {
  const id = getCorporateIdentity(meta)
  return `
  <footer style="margin-top:30px;font-family:'Segoe UI',Arial,sans-serif;">
    <table style="width:100%;border-collapse:collapse;border:1px solid #cbd5e1;margin-bottom:12px;font-size:10px;text-align:center;">
      <tr style="background:#f1f5f9;font-weight:700;color:#1e293b;">
        <td style="width:33.3%;border:1px solid #cbd5e1;padding:6px;">ELABORÓ</td>
        <td style="width:33.3%;border:1px solid #cbd5e1;padding:6px;">REVISÓ</td>
        <td style="width:33.3%;border:1px solid #cbd5e1;padding:6px;">APROBÓ</td>
      </tr>
      <tr style="height:48px;">
        <td style="border:1px solid #cbd5e1;vertical-align:bottom;padding:4px;color:#64748b;">Operario / Técnico Ejecutor</td>
        <td style="border:1px solid #cbd5e1;vertical-align:bottom;padding:4px;color:#64748b;">Líder de Mantenimiento / Planta</td>
        <td style="border:1px solid #cbd5e1;vertical-align:bottom;padding:4px;color:#64748b;">Coordinación SIG / Gerencia</td>
      </tr>
    </table>
    <div style="font-size:9.5px;color:#64748b;text-align:center;border-top:1px solid #e2e8f0;padding-top:6px;">
      ${escapeHtml(id.confidentiality)} · NIT ${CORP_NIT}
    </div>
  </footer>`
}

/** Alias usado por exportDocument */
export function footerHtml(meta = {}) {
  return documentFooterHtml(meta)
}

/** Estilos de membrete para Word / impresión PDF */
export function letterheadCss() {
  return `
    body { font-family: 'Segoe UI', Arial, sans-serif; color: #1e293b; margin: 24px; font-size: 11.5px; }
    .corp-table { width: 100%; border-collapse: collapse; margin: 10px 0 18px; font-size: 10.5px; }
    .corp-table th { background: #0b1428; color: #ffffff; text-align: left; padding: 7px 9px; font-weight: 700; border: 1px solid #0b1428; }
    .corp-table td { border: 1px solid #cbd5e1; padding: 6px 9px; vertical-align: top; }
    .corp-table tr:nth-child(even) td { background: #fbf3e7; }
    @media print {
      .no-print { display: none !important; }
      body { margin: 10mm; }
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
