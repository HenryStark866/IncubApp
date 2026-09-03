/**
 * IncubApp = producto SaaS del catálogo CDH Maker
 * Clientes = tenants con identidad propia (nunca mezclada con CDH ni entre sí)
 * Henry Stark · CEO CDH Maker
 */

import { BRAND, CLIENT_ASSET_ROOTS, LETTERHEAD } from './brandIdentity'

export const PLATFORM_OPERATOR = {
  legalName: 'CDH Maker',
  shortName: 'CDH Maker',
  role: 'Propietario y administrador del SaaS',
}

export const PLATFORM = {
  legalName: BRAND.productName,
  shortName: BRAND.productName,
  product: BRAND.productName,
  operator: PLATFORM_OPERATOR.legalName,
  slogan: BRAND.slogan,
  tagline: BRAND.tagline,
  confidentiality: LETTERHEAD.confidentiality,
  colors: BRAND.colors,
  themePreset: 'incubapp',
  logoPath: BRAND.assets.logo,
  markPath: BRAND.assets.mark,
  favicon: BRAND.assets.favicon,
  backgroundPath: BRAND.assets.platformBg,
  showClientBackground: false,
}

/**
 * Identidades white-label por cliente.
 * Assets SOLO en /client-brands/{key}/ o rutas dedicadas — nunca en /brand/ (producto).
 */
export const CLIENT_BRANDS = {
  incubant: {
    id: 'incubant',
    match: [
      'incubant',
      'antioquena',
      'antioqueña',
      'antioquena-de-incubacion',
      'antioqueña-de-incubación',
    ],
    legalName: 'Antioqueña de Incubación SAS',
    legacyBrand: 'Incubant',
    product: 'Incubant',
    slogan: 'Operación en planta y granja',
    city: 'Antioquia, Colombia',
    logoPath: CLIENT_ASSET_ROOTS.incubant.logo || CLIENT_ASSET_ROOTS.incubant.logoLegacy,
    markPath: CLIENT_ASSET_ROOTS.incubant.mark || CLIENT_ASSET_ROOTS.incubant.markLegacy,
    favicon: CLIENT_ASSET_ROOTS.incubant.mark || CLIENT_ASSET_ROOTS.incubant.markLegacy,
    backgroundPath: '/fondo.jpg',
    themePreset: 'client-incubant',
    showClientBackground: true,
    confidentiality:
      'Documento de Antioqueña de Incubación SAS. Generado con IncubApp.',
    colors: {
      primary: '#e0740a',
      accent: '#e0740a',
      accentDim: '#eda23f',
      navy: '#1a2332',
      ink: '#202634',
      muted: '#6d7688',
      cream: '#fbf3e7',
      line: '#e7e0d3',
      white: '#ffffff',
      onAccent: '#ffffff',
    },
  },
}

function normalizeHay(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

/**
 * Identidad desde org.settings.brand (JSON) si la empresa la configuró.
 * No hereda de otros tenants.
 */
function brandFromOrgSettings(org) {
  const b = org?.settings?.brand
  if (!b || typeof b !== 'object') return null
  const key = b.key || org.brand_key || org.slug || 'tenant'
  return {
    id: key,
    legalName: b.legalName || org.name,
    legacyBrand: b.displayName || b.legacyBrand || org.name,
    product: b.product || org.name,
    slogan: b.slogan || `Operación · ${org.name}`,
    city: b.city || '',
    logoPath: b.logoPath || null,
    markPath: b.markPath || b.logoPath || null,
    favicon: b.favicon || b.markPath || null,
    backgroundPath: b.backgroundPath || null,
    themePreset: b.themePreset || `client-${key}`,
    showClientBackground: b.showClientBackground !== false && !!b.backgroundPath,
    confidentiality:
      b.confidentiality ||
      `Documento de ${org.name}. Software IncubApp propiedad de CDH Maker.`,
    colors: b.colors || null,
    match: [],
  }
}

export function resolveClientBrand(org) {
  if (!org) return null

  // 1) brand_key explícito
  if (org.brand_key && CLIENT_BRANDS[org.brand_key]) {
    return CLIENT_BRANDS[org.brand_key]
  }

  // 2) settings.brand por org (aislada)
  const fromSettings = brandFromOrgSettings(org)
  if (fromSettings?.logoPath || fromSettings?.markPath) return fromSettings

  // 3) match por slug/nombre
  const hay = `${normalizeHay(org.slug)} ${normalizeHay(org.name)}`
  for (const brand of Object.values(CLIENT_BRANDS)) {
    for (const m of brand.match || []) {
      if (hay.includes(normalizeHay(m))) return brand
    }
  }

  // 4) settings.brand mínimo (solo nombre)
  if (fromSettings) return fromSettings

  return null
}

/**
 * @param {{ org?: object|null, forcePlatform?: boolean, isPlatformStaff?: boolean }} ctx
 * isPlatformStaff / forcePlatform: identidad IncubApp·CDH, NUNCA logos de clientes
 */
export function resolveBrandContext(ctx = {}) {
  const { org = null, forcePlatform = false, isPlatformStaff = false } = ctx

  if (forcePlatform || isPlatformStaff || !org) {
    return {
      mode: 'platform',
      preset: PLATFORM.themePreset,
      legalName: PLATFORM.legalName,
      product: PLATFORM.product,
      slogan: PLATFORM.slogan,
      tagline: PLATFORM.tagline,
      operator: PLATFORM.operator,
      legacyBrand: null,
      city: '',
      logoPath: PLATFORM.logoPath,
      markPath: PLATFORM.markPath,
      favicon: PLATFORM.favicon,
      backgroundPath: PLATFORM.backgroundPath,
      showClientBackground: false,
      confidentiality: PLATFORM.confidentiality,
      colors: PLATFORM.colors,
      client: null,
      orgName: null,
      orgId: null,
    }
  }

  const client = resolveClientBrand(org)
  if (client) {
    return {
      mode: 'client',
      preset: client.themePreset,
      legalName: client.legalName,
      product: client.product || client.legacyBrand || org.name,
      slogan: client.slogan,
      tagline: client.slogan,
      operator: PLATFORM.operator,
      legacyBrand: client.legacyBrand,
      city: client.city || '',
      logoPath: client.logoPath,
      markPath: client.markPath,
      favicon: client.favicon || client.markPath,
      backgroundPath: client.backgroundPath || null,
      showClientBackground: !!client.showClientBackground,
      confidentiality: client.confidentiality,
      colors: client.colors,
      client,
      orgName: org.name || client.legalName,
      orgId: org.id,
    }
  }

  // Tenant genérico: nombre de la empresa, marca producto solo en pie (operator)
  return {
    mode: 'tenant',
    preset: 'client-generic',
    legalName: org.name || PLATFORM.legalName,
    product: org.name || PLATFORM.product,
    slogan: `Operación · ${org.name || 'Empresa'}`,
    tagline: org.name || PLATFORM.product,
    operator: PLATFORM.operator,
    legacyBrand: org.name || null,
    city: '',
    logoPath: null,
    markPath: null,
    favicon: null,
    backgroundPath: null,
    showClientBackground: false,
    confidentiality: `Documento de ${org.name || 'la empresa'}. Software IncubApp propiedad de CDH Maker.`,
    colors: null,
    client: null,
    orgName: org.name || PLATFORM.legalName,
    orgId: org.id,
  }
}

function setMetaThemeColor(color) {
  try {
    let meta = document.querySelector('meta[name="theme-color"]')
    if (!meta) {
      meta = document.createElement('meta')
      meta.name = 'theme-color'
      document.head.appendChild(meta)
    }
    meta.content = color
  } catch {
    /* */
  }
}

function setFavicon(href) {
  if (!href) return
  try {
    let link = document.querySelector("link[rel='icon']")
    if (!link) {
      link = document.createElement('link')
      link.rel = 'icon'
      document.head.appendChild(link)
    }
    link.href = href
    link.type = href.endsWith('.svg') ? 'image/svg+xml' : 'image/png'
  } catch {
    /* */
  }
}

/**
 * Aplica identidad al documento: data-brand, favicon, título, CSS vars y fondo.
 * Aislamiento: cada modo/cliente tiene su preset; no se mezclan.
 */
export function applyBrandToDocument(brand) {
  try {
    const root = document.documentElement
    const preset = brand?.preset || PLATFORM.themePreset
    const mode = brand?.mode || 'platform'

    root.setAttribute('data-brand', preset)
    root.setAttribute('data-brand-mode', mode)
    if (brand?.orgId) root.setAttribute('data-org-id', brand.orgId)
    else root.removeAttribute('data-org-id')

    // Variables de color del cliente (si existen)
    const c = brand?.colors
    if (mode === 'client' && c) {
      if (c.accent || c.primary) root.style.setProperty('--accent', c.accent || c.primary)
      if (c.accentDim) root.style.setProperty('--accent-dim', c.accentDim)
      if (c.onAccent) root.style.setProperty('--on-accent', c.onAccent)
      if (c.line) root.style.setProperty('--line', c.line)
    } else {
      root.style.removeProperty('--accent')
      root.style.removeProperty('--accent-dim')
      root.style.removeProperty('--on-accent')
      root.style.removeProperty('--line')
    }

    // Fondo cliente por org (CSS var usada por .client-bg)
    if (mode === 'client' && brand.backgroundPath) {
      root.style.setProperty('--client-bg-image', `url('${brand.backgroundPath}')`)
    } else {
      root.style.removeProperty('--client-bg-image')
    }

    if (mode === 'client') {
      setFavicon(brand.favicon || brand.markPath)
      setMetaThemeColor(c?.accent || c?.primary || '#e0740a')
      document.title = `${brand.legacyBrand || brand.legalName || brand.orgName} · operación`
    } else if (mode === 'tenant') {
      setFavicon(PLATFORM.favicon)
      setMetaThemeColor('#35d6e8')
      document.title = `${brand.orgName || PLATFORM.product} · IncubApp`
    } else {
      setFavicon(PLATFORM.favicon)
      setMetaThemeColor('#050a14')
      document.title = `${PLATFORM.product} · Consola CDH Maker`
    }
  } catch {
    /* */
  }
}

export const ACTIVE_ORG_STORAGE_KEY = 'cdh_active_org_id'
