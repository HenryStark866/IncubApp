/**
 * Menú de la compañía CDH Maker / producto IncubApp (plataforma SaaS).
 * Independiente del menú operativo de cada cliente (Incubant, etc.).
 * Henry Stark · CEO y co-fundador de CDH Maker
 */

export const PLATFORM_MENU = [
  {
    id: 'platform-business',
    label: 'Módulo de negocio',
    group: 'Administración del servicio',
    hint: 'Roles staff, garantías, ciclo de cliente, go-live y SLA',
  },
  {
    id: 'platform-home',
    label: 'Inicio plataforma',
    group: 'Administración del servicio',
    hint: 'Hub CDH Maker · mapa de la consola',
  },
  {
    id: 'admin',
    label: 'Empresas y usuarios',
    group: 'Administración del servicio',
    hint: 'Tenants, membresías, aprobaciones, plantas base',
  },
  {
    id: 'platform-templates',
    label: 'Plantillas de empresa',
    group: 'Administración del servicio',
    hint: 'Menú operativo predeterminado (incubant_ops_v1)',
  },
  {
    id: 'platform-modules',
    label: 'Módulos por empresa',
    group: 'Administración del servicio',
    hint: 'Habilitar, deshabilitar, crear y asignar módulos por tenant',
  },
  {
    id: 'platform-product',
    label: 'Producto e identidad',
    group: 'Administración del servicio',
    hint: 'Marca IncubApp, misión, GTM, assets',
  },
  {
    id: 'diseno',
    label: 'Studio UI / módulos',
    group: 'Ingeniería del servicio',
    hint: 'Diseño de interfaz y módulos personalizados',
  },
  {
    id: 'platform-dev',
    label: 'Herramientas de desarrollo',
    group: 'Ingeniería del servicio',
    hint: 'Cola offline, diagnóstico, modo tenant',
  },
  {
    id: 'platform-access',
    label: 'Accesos y dispositivos',
    group: 'Ingeniería del servicio',
    hint: 'Bitácora de uso por usuario, metadatos de dispositivo y perfil · exportable',
  },
]

/**
 * Menú corto de staff cuando ya está dentro de un tenant (modo desarrollador).
 * El menú largo del cliente se muestra aparte.
 */
export const PLATFORM_STAFF_IN_TENANT = [
  {
    id: 'platform-business',
    label: '← Negocio SaaS',
    group: 'CDH Maker',
    hint: 'Módulo de negocio y garantías del servicio',
  },
  {
    id: 'platform-home',
    label: 'Consola plataforma',
    group: 'CDH Maker',
    hint: 'Hub de la consola',
  },
  {
    id: 'admin',
    label: 'Empresas y usuarios',
    group: 'CDH Maker',
    hint: 'Tenants y membresías',
  },
  {
    id: 'platform-modules',
    label: 'Módulos empresa',
    group: 'CDH Maker',
    hint: 'Encender/apagar módulos del tenant',
  },
  {
    id: 'diseno',
    label: 'Studio UI',
    group: 'CDH Maker',
  },
  {
    id: 'datos',
    label: 'Datos del tenant',
    group: 'CDH Maker',
    hint: 'Solo con compañía seleccionada',
  },
]

export function buildPlatformNavItems({ inTenant = false, hasTenant = false } = {}) {
  if (inTenant) {
    return PLATFORM_STAFF_IN_TENANT.filter((i) => i.id !== 'datos' || hasTenant)
  }
  return PLATFORM_MENU.map((i) => ({ ...i }))
}
