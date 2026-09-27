/**
 * Identidad IncubApp (producto SaaS).
 * Copy público en empresas/clientes: solo producto + slogan (sin nombres personales).
 */

/** Uso interno de plataforma; no se muestra en tenants cliente. */
export const FOUNDER = {
  name: '',
  title: '',
  company: 'CDH Maker',
  product: 'IncubApp',
}

/** Producto comercial */
export const BRAND = {
  productName: 'IncubApp',
  legalOperator: 'CDH Maker',
  /** Línea pública: nunca nombre de persona */
  founderLine: '',
  tagline: 'SaaS de operación industrial · IA y desarrollo avanzado',
  slogan: 'Infraestructura operativa con inteligencia. Multi-empresa. Tiempo real.',
  shortPitch:
    'IncubApp es el SaaS de operación industrial para plantas de incubación y granjas: evidencia, roles herméticos, offline y tableros de gerencia.',
  domainHint: 'IncubApp',
  email: 'hola@cdhmaker.com',
  support: 'soporte@cdhmaker.com',
  city: 'Colombia',
  colors: {
    primary: '#35D6E8',
    primaryDeep: '#1B8FA0',
    accent: '#7C5CFF',
    magenta: '#E84DFF',
    navy: '#050A14',
    navy2: '#0A1628',
    glass: 'rgba(12, 24, 48, 0.72)',
    ink: '#E8F0FF',
    muted: '#8BA3C7',
    line: '#1E3358',
    white: '#FFFFFF',
    ok: '#3DDC97',
  },
  fonts: {
    display: 'IBM Plex Sans, Segoe UI, system-ui, sans-serif',
    body: 'IBM Plex Sans, Segoe UI, system-ui, sans-serif',
  },
  /** Assets del PRODUCTO (nunca logos de clientes) */
  assets: {
    mark: '/brand/incubapp-mark.svg',
    logo: '/brand/incubapp-logo.svg',
    /** Mismo logo con texto oscuro, para tarjetas claras (pantalla de acceso). */
    logoLight: '/brand/incubapp-logo-light.svg',
    wordmark: '/brand/incubapp-wordmark.svg',
    og: '/brand/incubapp-og.svg',
    favicon: '/brand/incubapp-favicon.svg',
    platformBg: '/brand/incubapp-platform-bg.svg',
  },
  /** Assets del operador CDH Maker (plataforma) */
  operatorAssets: {
    mark: '/brand/cdh-mark.svg',
    wordmark: '/brand/cdh-wordmark.svg',
  },
}

/**
 * Identidad de CLIENTES (white-label). Solo se usa dentro del tenant del cliente
 * y NUNCA en la consola de admin de plataforma / login de desarrolladores.
 */
export const CLIENT_ASSET_ROOTS = {
  incubant: {
    logo: '/client-brands/incubant/logo-full.png',
    mark: '/client-brands/incubant/mark.png',
    logoLegacy: '/incubant-logo-full.png',
    markLegacy: '/incubant-mark.png',
    background: '/fondo.jpg',
    favicon: '/client-brands/incubant/mark.png',
  },
}

export const MISSION =
  'Construir software SaaS multi-empresa de nivel industrial: operación medible, evidencia, IA asistida y aislamiento extremo entre clientes — desde el catálogo de CDH Maker.'

export const VISION =
  'Que cada planta y granja del continente opere sobre IncubApp como sistema nervioso digital, mientras CDH Maker escala el producto, la plataforma y la inteligencia.'

export const VALUES = [
  {
    title: 'Producto de catálogo',
    text: 'IncubApp es un SaaS de CDH Maker, no un desarrollo “a medida” atrapado en un solo cliente.',
  },
  {
    title: 'Cliente ≠ plataforma',
    text: 'Logos, favicons y temas de empresas clientes nunca se mezclan con la identidad de producto ni de CDH Maker.',
  },
  {
    title: 'Modo desarrollador',
    text: 'El equipo de plataforma entra a cualquier tenant con potestad de desarrollo general para construir y depurar.',
  },
  {
    title: 'IA y futuro',
    text: 'Arquitectura lista para asistentes, automatización y analítica — estética inmersiva y stack moderno.',
  },
  {
    title: 'Propiedad del software',
    text: 'La propiedad intelectual y la operación del SaaS son de CDH Maker. Cada empresa cliente solo ve y administra sus propios datos.',
  },
]

export const ABOUT = {
  title: 'Acerca de IncubApp',
  paragraphs: [
    'IncubApp es el SaaS de operación industrial para plantas de incubación y granjas: evidencia fotográfica, roles herméticos, operación offline y tableros de gerencia en una plataforma multi-tenant segura.',
    'Cada organización opera en su propio espacio. Su marca y datos viven solo dentro de su empresa; no definen la identidad pública del producto.',
    BRAND.slogan,
  ],
}

export const GO_TO_MARKET = {
  title: 'A quién vendemos y cómo',
  segments: [
    {
      who: 'Plantas de incubación',
      why: 'Rondas con foto, nacimiento, OT y gerencia medible.',
      entry: 'Piloto 30–90 días con métricas de cumplimiento.',
    },
    {
      who: 'Grupos multi-sede',
      why: 'Un SaaS, varios tenants aislados.',
      entry: 'Licencia multi-empresa + onboarding CDH Maker.',
    },
    {
      who: 'Gerencia industrial',
      why: 'Decisiones con evidencia, no con ruido operativo.',
      entry: 'Cockpit + exportes con membrete de producto o del cliente.',
    },
  ],
  channels: [
    'Venta consultiva CDH Maker (CEO / equipo comercial).',
    'Referidos y red avícola.',
    'Landing IncubApp + demos de plataforma.',
    'Expansión módulo a módulo (ops → gerencia → multi-sede).',
  ],
  packaging: [
    { name: 'IncubApp Starter', includes: 'Rondas, OT, asistencia, offline, multi-usuario.' },
    { name: 'IncubApp Ops', includes: 'Starter + nacimiento/cargue, inventarios, sensores, reportes.' },
    { name: 'IncubApp Enterprise', includes: 'Ops + multi-sede, white-label cliente, SLA, onboarding.' },
  ],
}

export const LETTERHEAD = {
  productLine: 'IncubApp',
  operatorLine: BRAND.slogan,
  confidentiality:
    'Documento generado con IncubApp. Confidencial según la organización. Uso interno autorizado.',
}

export const PLATFORM_DEV_ROLE = {
  value: 'platform_developer',
  label: 'Desarrollador de plataforma (CDH Maker)',
  description:
    'Acceso general a módulos dentro de un tenant seleccionado, para construir, depurar y soportar el SaaS. No es un rol de empleado del cliente.',
}

export function brandDocumentMeta(extra = {}) {
  return {
    product: BRAND.productName,
    slogan: BRAND.slogan,
    tagline: BRAND.tagline,
    ...extra,
  }
}
