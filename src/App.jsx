/**
 * =============================================================================
 * ARCHIVO: src/App.jsx
 * PROPÓSITO: Orquesta el workspace multi-tenant CDH Maker.
 * SaaS 100 % CDH Maker; marcas de clientes (p. ej. Incubant) solo en su org.
 * Aislamiento: cada usuario solo opera en orgs donde tiene membership.
 * Henry Stark Desarrollador · CDH Maker
 * =============================================================================
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase, supabaseConfigError } from './lib/supabase.js'
// Shell ligero (eager): auth, nav, chrome. Paneles pesados → lazyPanels (code-split).
import AuthForm from './components/AuthForm.jsx'
import ResetPasswordForm from './components/ResetPasswordForm.jsx'
import PlatformCompanyBar from './components/PlatformCompanyBar.jsx'
import {
  usePlatformOrgs,
  readDevTenantId,
  writeDevTenantId,
} from './hooks/usePlatformOrgs.js'
import { buildPlatformNavItems } from './lib/platformMenu.js'
import { buildClientNavItems } from './lib/clientMenuTemplate.js'
import { ContextualMark, CdhSignature, PLATFORM_NAME, IncubantSigPill } from './components/Brand.jsx'
import PendingApproval from './components/PendingApproval.jsx'
import SplashScreen from './components/SplashScreen.jsx'
import LegalDocsModal from './components/LegalDocsModal.jsx'
import { useLegalAcceptance } from './hooks/useLegalAcceptance.js'
import { useOrganization } from './hooks/useOrganization.js'
import { useProfile } from './hooks/useProfile.js'
import { useOfflineSync } from './hooks/useOfflineSync.js'
import { useModuleGrants } from './hooks/useModuleGrants.js'
import { useUiSettings } from './hooks/useUiSettings.js'
import { useCustomModules } from './hooks/useCustomModules.js'
import { useOrgModuleConfig } from './hooks/useOrgModuleConfig.js'
import WorkspaceNav from './components/WorkspaceNav.jsx'
import OfflineBanner from './components/OfflineBanner.jsx'
import ModuleBoundary from './components/ModuleBoundary.jsx'
import RolePreviewBar from './components/RolePreviewBar.jsx'
import {
  LazyPanel,
  BusinessModule,
  PlatformHub,
  PlatformTemplatesPanel,
  PlatformOrgModulesPanel,
  PlatformProductPanel,
  PlatformDevTools,
  AccessRegistryPanel,
  TodayBoard,
  LeaderDashboard,
  LeaderOpsMap,
  AccessVaultPanel,
  SiloReportsPanel,
  AttendancePanel,
  PerformancePanel,
  AdminDashboard,
  OnlinePresencePanel,
  CoordinatorDashboard,
  SupervisorDashboard,
  ClientPortal,
  DevStudio,
  DataFixPanel,
  CustomModuleView,
  SalesModule,
  LogisticsPanel,
  DepartmentModule,
  InventoryModule,
  VeterinaryModule,
  IotBiosecurityHub,
  MaintenancePanel,
  SupervisionPanel,
  ShiftSchedule,
  MonitorMode,
  PlantManager,
  FarmManager,
  FarmBatchesPanel,
  EggReportPanel,
  ReceptionPanel,
  ColdStorageLoadPanel,
  OperationsDataCenter,
  MisionalesPanel,
  OperatorHistoryPanel,
  VehiclePreopPanel,
  MachineCalibrationPanel,
  ChatWidget,
  NotificationBell,
  ProfileCard,
} from './components/lazyPanels'
import { useOrgPresence } from './hooks/useOrgPresence'
import { useAccessControl } from './hooks/useAccessControl'
import {
  defaultHomeTab,
  DEPARTMENT_MODULES,
  ROLE_LABEL,
  canManageOrgUsers,
} from './lib/roles'
import { capabilitiesFromTabs, primarySiloLabel } from './lib/privacyScopes'
import { applyBrandToDocument, resolveBrandContext } from './lib/platform'
import { recordAccess } from './lib/accessLog'
import { requestOperationalDevicePermissions } from './lib/devicePermissions'

/** Tabs fijos de consola SaaS (evita recrear Set en cada render). */
const PLATFORM_TAB_IDS = new Set([
  'platform-business',
  'platform-home',
  'platform-templates',
  'platform-modules',
  'platform-product',
  'platform-dev',
  'platform-access',
  'admin',
  'diseno',
  'datos',
  'perfil',
])

/** Catálogo omnisciente (modo desarrollador en tenant). */
const OMNISCIENT_TABS = [
  'hoy',
  'panel',
  'supervision',
  'mantenimiento',
  'monitoreo',
  'plantas',
  'granjas',
  'produccion',
  'huevos',
  'recepcion',
  'cargue',
  'horarios',
  'gerencia',
  'informes',
  'ventas',
  'logistica',
  'rrhh',
  'contabilidad',
  'sst',
  'ambiental',
  'veterinaria',
  'iot',
  'inventarios',
  'accesos',
  'reportes',
  'asistencia',
  'cumplimiento',
  'misionales',
  'historial',
  'preoperacional',
  'calibracion',
]

const VIEW_AS_KEY = 'incubapp_view_as_v1'

function readViewAs() {
  try {
    const raw = sessionStorage.getItem(VIEW_AS_KEY)
    if (!raw) return null
    const p = JSON.parse(raw)
    if (p?.role) return { role: p.role, area: p.area || null }
  } catch {
    /* */
  }
  return null
}

// ---------------------------------------------------------------------------
// SECCION: Workspace — shell autenticado (menú, permisos de módulos, paneles).
// Calcula pestañas efectivas y renderiza el módulo activo. Henry Stark Desarrollador
// ---------------------------------------------------------------------------
function Workspace({
  session,
  org: membershipOrg,
  role: realRole,
  area: realArea,
  isPlatformAdmin,
  profileApi,
  memberships = [],
  switchOrg,
}) {
  /**
   * Tenant activo en modo desarrollador (admin plataforma elige compañía).
   * No usa logos del cliente: identidad siempre IncubApp / CDH Maker.
   */
  const { orgs: platformOrgs, loading: platformOrgsLoading } = usePlatformOrgs(!!isPlatformAdmin)
  const [devTenant, setDevTenant] = useState(() => {
    if (!isPlatformAdmin) return null
    const id = readDevTenantId()
    return id ? { id } : null
  })

  // Resolver objeto org completo desde lista de plataforma
  const platformOrg = useMemo(() => {
    if (!isPlatformAdmin || !devTenant?.id) return null
    return platformOrgs.find((o) => o.id === devTenant.id) || (devTenant.name ? devTenant : null)
  }, [isPlatformAdmin, devTenant, platformOrgs])

  // Org efectiva:
  // - Admin SaaS: SOLO la empresa elegida en la barra (nunca membership de cliente).
  //   Así henrytaborda@… no opera como empleado de Incubant.
  // - Usuario cliente: membership de su empresa.
  const org = isPlatformAdmin ? platformOrg : membershipOrg
  const developerMode = !!(isPlatformAdmin && platformOrg)

  const brand = useMemo(
    () =>
      resolveBrandContext({
        org,
        // Staff de plataforma: identidad futurista IncubApp, nunca marca del cliente
        isPlatformStaff: !!isPlatformAdmin,
        forcePlatform: !!isPlatformAdmin,
      }),
    [org, isPlatformAdmin]
  )

  useEffect(() => {
    applyBrandToDocument(brand)
  }, [brand])

  // Los permisos de dispositivo (cámara, GPS, notificaciones) NO se piden al
  // arrancar: el navegador bloquea el diálogo si no viene de un gesto del
  // usuario. Se piden bajo demanda, al aceptar los términos y al entrar a lo
  // que los necesita, con `requestOperationalDevicePermissions`. El gate de
  // «ya se preguntó» vive en lib/devicePermissions.js por si vuelve a hacer
  // falta.

  const {
    online,
    pending: pendingOffline,
    syncing: offlineSyncing,
    lastSync: offlineLastSync,
    sync: syncOfflineQueue,
  } = useOfflineSync()

  /**
   * Vista QA: admin simula rol de CLIENTE (hermético).
   * Sin viewAs + con tenant = modo desarrollador general (omnisciente).
   */
  const [viewAs, setViewAs] = useState(() =>
    isPlatformAdmin ? readViewAs() : null
  )

  useEffect(() => {
    if (!isPlatformAdmin) {
      setViewAs(null)
      return
    }
    try {
      if (viewAs) sessionStorage.setItem(VIEW_AS_KEY, JSON.stringify(viewAs))
      else sessionStorage.removeItem(VIEW_AS_KEY)
    } catch {
      /* */
    }
  }, [viewAs, isPlatformAdmin])

  // Admin SaaS sin tenant: rol de plataforma (no coordinator/gerencia de cliente).
  // Con tenant + sin “ver como”: desarrollador de plataforma.
  const role =
    viewAs?.role ||
    (developerMode ? 'developer' : isPlatformAdmin ? 'platform_admin' : realRole)
  const area = viewAs
    ? viewAs.area ?? null
    : developerMode
      ? 'general'
      : isPlatformAdmin
        ? null
        : realArea
  const previewing = !!(isPlatformAdmin && viewAs)

  const presence = useOrgPresence({
    orgId: org?.id,
    userId: session.user.id,
    role,
    area,
    userName: profileApi.profile?.full_name ?? session.user.email,
    forceLocation: false,
  })

  /**
   * Omnisciente: admin plataforma sin “ver como” cliente.
   * En modo desarrollador general ve todos los módulos del tenant.
   */
  const isOmniscient = !!isPlatformAdmin && !previewing

  const access = useAccessControl({
    orgId: org?.id,
    userId: session.user.id,
    role,
    area,
    isOmniscient,
  })

  const taskGrants = useModuleGrants(org?.id, session.user.id)

  /**
   * Módulos habilitados/deshabilitados por empresa (consola CDH Maker).
   * Lista negra en organizations.settings.disabled_menu_ids; el omnisciente
   * no se ve afectado (necesita ver todo para administrar).
   */
  const { moduleEnabled } = useOrgModuleConfig(org?.id)

  const tabs = useMemo(() => {
    const s = new Set(access.tabs)
    if (taskGrants.reception) s.add('recepcion')
    if (taskGrants.plans) {
      s.add('plantas')
      s.add('granjas')
    }
    if (isPlatformAdmin) {
      s.add('admin')
      s.add('diseno')
      if (org) s.add('datos')
    }
    // Coordinadores (cualquier área), gerencia, owner/admin de empresa → usuarios de su org
    if (org && canManageOrgUsers(role) && !isPlatformAdmin) {
      s.add('admin')
    }
    // Líderes de área / gerencia: sedes para calibrar GPS (sin editar planos)
    if (
      org &&
      !isPlatformAdmin &&
      ['coordinator', 'management', 'management_auxiliary', 'owner', 'admin', 'supervisor'].includes(
        role
      )
    ) {
      s.add('plantas')
      s.add('granjas')
    }
    // Modo desarrollador: todo el catálogo operativo del tenant
    if (isOmniscient && org) {
      OMNISCIENT_TABS.forEach((t) => s.add(t))
    }
    return s
  }, [access.tabs, taskGrants.reception, taskGrants.plans, isPlatformAdmin, org, role, isOmniscient])

  const cap = useMemo(
    () => capabilitiesFromTabs(tabs, { isOmniscient }),
    [tabs, isOmniscient]
  )

  const can = useCallback(
    (t) => {
      if (isPlatformAdmin) {
        if (
          t === 'admin' ||
          t === 'diseno' ||
          t === 'datos' ||
          t === 'platform-business' ||
          t === 'platform-home' ||
          t === 'platform-templates' ||
          t === 'platform-modules' ||
          t === 'platform-product' ||
          t === 'platform-dev' ||
          t === 'platform-access'
        ) {
          return true
        }
      }
      // Admin de usuarios de la empresa (no consola SaaS / no developer)
      if (t === 'admin' && org && canManageOrgUsers(role) && !isPlatformAdmin) return true
      if (isOmniscient) return true
      // Módulo apagado para esta empresa desde la consola → nadie del cliente lo ve
      if (org && !moduleEnabled(t)) return false
      return cap.canOpen(t)
    },
    [isPlatformAdmin, org, role, isOmniscient, cap, moduleEnabled]
  )

  const isCoordinator = role === 'coordinator'
  const isSupervisor = role === 'supervisor'
  const isCustomer = role === 'customer'

  const corpModules = useMemo(
    () => DEPARTMENT_MODULES.filter((m) => can(m.tab)),
    [can]
  )

  useUiSettings(org?.id)
  const { modules: customModules } = useCustomModules(org?.id)
  const visibleModules = useMemo(() => {
    if (!(can('*custom*') || isOmniscient)) return []
    return customModules.filter((m) => m.enabled)
  }, [can, isOmniscient, customModules])

  const [tab, setTab] = useState(() =>
    defaultHomeTab({ role: realRole, area: realArea, isPlatformAdmin })
  )

  const onSelectDevTenant = (selected) => {
    if (!selected) {
      setDevTenant(null)
      writeDevTenantId(null)
      setViewAs(null)
      setTab('platform-business')
      return
    }
    setDevTenant(selected)
    writeDevTenantId(selected.id)
    setViewAs(null) // modo desarrollador general (no simular operario)
    // Al elegir empresa en consola SaaS → panel de administración del tenant
    setTab('admin')
  }

  // Al cambiar de rol simulado, ir a la home de ese perfil
  useEffect(() => {
    if (!previewing) return
    setTab(defaultHomeTab({ role, area, isPlatformAdmin: false }))
  }, [previewing, role, area])

  // Si el usuario pierde acceso al tab actual, redirigir
  useEffect(() => {
    if (['perfil'].includes(tab)) return
    if (isPlatformAdmin && PLATFORM_TAB_IDS.has(tab)) return
    if (!org) {
      if (isPlatformAdmin && !PLATFORM_TAB_IDS.has(tab)) setTab('platform-business')
      return
    }
    if (['hoy', 'accesos', 'reportes', 'asistencia', 'cumplimiento'].includes(tab)) return
    if (String(tab).startsWith('cm-') && visibleModules.some((m) => `cm-${m.id}` === tab)) return
    if (!can(tab) && !(isPlatformAdmin && PLATFORM_TAB_IDS.has(tab))) {
      setTab(isPlatformAdmin && !developerMode ? 'platform-business' : 'hoy')
    }
  }, [tabs, tab, org, isPlatformAdmin, visibleModules, developerMode, can])

  /**
   * MENÚS SEPARADOS:
   * 1) Consola plataforma (sin tenant) → solo herramientas CDH Maker / IncubApp
   * 2) Dentro de un tenant → menú operativo del cliente (plantilla Incubant) + atajos staff
   * 3) Usuario cliente → solo menú operativo
   */
  const navItems = useMemo(() => {
    const items = []
    if (isPlatformAdmin && !previewing) {
      if (!developerMode) {
        items.push(...buildPlatformNavItems({ inTenant: false }))
      } else {
        items.push(...buildPlatformNavItems({ inTenant: true, hasTenant: !!org }))
        if (org) {
          const clientItems = buildClientNavItems({ can, role })
          for (const it of clientItems) {
            // El menú de plataforma ya trae 'admin' ("Empresas y usuarios") y
            // 'datos' ("Datos del tenant"): sin este guard, el mismo tab
            // aparecía dos veces (uno por cada menú) apuntando a la misma
            // pantalla — el "módulo repetido" en modo desarrollador.
            if (items.some((n) => n.id === it.id)) continue
            items.push({
              ...it,
              group: it.group ? `Cliente · ${it.group}` : 'Cliente',
            })
          }
          for (const m of visibleModules) {
            items.push({
              id: `cm-${m.id}`,
              label: m.title,
              group: 'Cliente · Personalizados',
              match: (t) => t === `cm-${m.id}`,
            })
          }
        }
      }
    } else if (org) {
      const clientItems = buildClientNavItems({ can, role })
      for (const it of clientItems) {
        if (it.id === 'accesos' && access.pendingCount > 0) {
          items.push({ ...it, label: `Accesos (${access.pendingCount})` })
        } else {
          items.push(it)
        }
      }
      for (const m of corpModules) {
        if (items.some((n) => n.id === m.tab)) continue
        if (!can(m.tab)) continue
        items.push({ id: m.tab, label: m.label, group: 'Dirección', hint: m.tagline })
      }
      for (const m of visibleModules) {
        items.push({
          id: `cm-${m.id}`,
          label: m.title,
          group: 'Personalizados',
          match: (t) => t === `cm-${m.id}`,
        })
      }
    }
    items.push({ id: 'perfil', label: 'Perfil', group: null })
    return items
  }, [
    isPlatformAdmin,
    previewing,
    developerMode,
    org,
    can,
    role,
    visibleModules,
    access.pendingCount,
    corpModules,
  ])

  // Default tab staff: módulo de negocio del servicio
  useEffect(() => {
    if (!isPlatformAdmin) return
    if (!developerMode && (tab === 'hoy' || !tab)) setTab('platform-business')
  }, [isPlatformAdmin, developerMode])

  const siloHint = previewing
    ? `Ver como cliente: ${ROLE_LABEL[role] || role}${area ? ` · ${area}` : ''}`
    : developerMode
      ? `Modo desarrollador general · ${org?.name || 'tenant'}`
      : isOmniscient
        ? 'Consola plataforma · CDH Maker'
        : primarySiloLabel(role, area)

  const liveLocation = presence.myLocation
  const locationReady = !!(liveLocation?.lat != null)

  const onNavigate = (t) => {
    setTab(t)
  }

  // Multi-membresía solo para usuarios cliente (no confunde con selector de plataforma)
  const multiOrg = !isPlatformAdmin && memberships.length > 1

  return (
    <>
      {isPlatformAdmin && (
        <PlatformCompanyBar
          orgs={platformOrgs}
          activeOrgId={platformOrg?.id || null}
          onSelect={onSelectDevTenant}
          loading={platformOrgsLoading}
          developerMode={developerMode}
          onOpenAdmin={() => setTab('admin')}
        />
      )}
      <header className={`workspace-header wide social${isPlatformAdmin ? ' platform-header' : ''}`}>
        <div className="ws-brand">
          <ContextualMark brand={brand} size={34} />
          <div className="ws-brand-text">
            <strong>
              {isPlatformAdmin
                ? developerMode
                  ? `${PLATFORM_NAME} · ${org?.name || 'tenant'}`
                  : `${PLATFORM_NAME} · Consola`
                : brand?.mode === 'client'
                  ? brand.legacyBrand || brand.legalName || org?.name
                  : org?.name || PLATFORM_NAME}
            </strong>
            <span className="ws-brand-sub">
              {isPlatformAdmin
                ? `${siloHint}${locationReady ? ` · ±${Math.round(liveLocation.accuracy || 0)} m` : ''} · propiedad CDH Maker`
                : brand?.mode === 'client'
                  ? `${siloHint}${locationReady ? ` · ±${Math.round(liveLocation.accuracy || 0)} m` : ''}`
                  : `${siloHint}${locationReady ? ` · ±${Math.round(liveLocation.accuracy || 0)} m` : ''}`}
            </span>
          </div>
          {brand?.mode === 'client' && (
            <IncubantSigPill text="SIG · Antioqueña de Incubación" />
          )}
        </div>

        {multiOrg && typeof switchOrg === 'function' && (
          <label className="ws-org-switch" title="Empresas donde tienes membership de cliente">
            <span className="hint" style={{ margin: 0 }}>
              Mi empresa
            </span>
            <select
              value={membershipOrg?.id || ''}
              onChange={(e) => {
                const r = switchOrg(e.target.value)
                if (r?.error) window.alert(r.error)
                else setTab('hoy')
              }}
            >
              {memberships.map((m) => {
                const o = m.organizations
                if (!o) return null
                return (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                )
              })}
            </select>
          </label>
        )}
        <WorkspaceNav
          tab={tab}
          onNavigate={onNavigate}
          items={navItems}
          profile={profileApi.profile}
          role={role}
          orgName={org?.name}
          onlineCount={presence.onlineCount}
          online={online}
          pendingOffline={pendingOffline}
          uploadAvatar={profileApi.uploadAvatar}
          removeAvatar={profileApi.removeAvatar}
          hideMenu={role === 'coordinator'}
        />
      </header>
      {isPlatformAdmin && (
        <RolePreviewBar
          active={viewAs}
          onChange={setViewAs}
          realRole={developerMode ? 'developer' : realRole}
          realArea={developerMode ? 'general' : realArea}
        />
      )}
      <OfflineBanner
        online={online}
        pending={pendingOffline}
        syncing={offlineSyncing}
        lastSync={offlineLastSync}
        onSync={() => syncOfflineQueue()}
      />
      <ModuleBoundary key={`${tab}-${role}-${area || ''}-${developerMode ? 'dev' : 'x'}`} name={tab}>
        <LazyPanel label={tab}>
          {tab === 'platform-business' && isPlatformAdmin ? (
            <BusinessModule orgCount={platformOrgs.length} onNavigate={setTab} />
          ) : tab === 'platform-home' && isPlatformAdmin ? (
            <PlatformHub
              orgCount={platformOrgs.length}
              onNavigate={setTab}
              onSelectTemplate={() => setTab('platform-templates')}
            />
          ) : tab === 'platform-templates' && isPlatformAdmin ? (
            <PlatformTemplatesPanel />
          ) : tab === 'platform-modules' && isPlatformAdmin && !previewing ? (
            <PlatformOrgModulesPanel
              orgs={platformOrgs}
              defaultOrgId={platformOrg?.id || null}
              userId={session.user.id}
            />
          ) : tab === 'platform-product' && isPlatformAdmin ? (
            <PlatformProductPanel />
          ) : tab === 'platform-dev' && isPlatformAdmin ? (
            <PlatformDevTools
              online={online}
              pendingOffline={pendingOffline}
              onSync={() => syncOfflineQueue()}
              activeTenantName={developerMode ? org?.name : null}
            />
          ) : tab === 'platform-access' && isPlatformAdmin && !previewing ? (
            <AccessRegistryPanel />
          ) : tab === 'hoy' && org && role === 'coordinator' ? (
            // Líder de área: panel de control completo (dashboard KPIs + acceso rápido + mini-mapa + feed)
            // El LeaderOpsMap queda accesible con los botones de acción del dashboard.
            <LeaderDashboard
              orgId={org.id}
              userId={session.user.id}
              role={role}
              developerMode={developerMode}
              area={area}
              userName={profileApi.profile?.full_name ?? session.user.email}
              orgName={org.name}
              onNavigate={(t) => {
                if (t === 'mapa-planta' || t === 'mapa-3d') { setTab(t); return }
                if (can(t) || t === 'accesos' || t === 'hoy' || t === 'perfil') setTab(t)
                else setTab('accesos')
              }}
              presence={presence}
              can={can}
            />
          ) : (tab === 'mapa-planta' || tab === 'mapa-3d') && org && role === 'coordinator' ? (
            // Vista de mapa de planta completo (accesible desde el dashboard del líder)
            <LeaderOpsMap
              orgId={org.id}
              userId={session.user.id}
              role={role}
              area={area}
              userName={profileApi.profile?.full_name ?? session.user.email}
              orgName={org.name}
              initialVista={tab === 'mapa-3d' ? '3d' : '2d'}
              onNavigate={(t) => {
                if (t === 'hoy') { setTab('hoy'); return }
                if (can(t) || t === 'accesos' || t === 'perfil') setTab(t)
                else setTab('accesos')
              }}
              presence={presence}
              can={can}
            />
          ) : tab === 'hoy' && org ? (
            <TodayBoard
              orgId={org.id}
              userId={session.user.id}
              role={role}
              area={area}
              userName={profileApi.profile?.full_name ?? session.user.email}
              orgName={org.name}
              onNavigate={(t) => {
                if (can(t) || t === 'accesos' || t === 'hoy' || t === 'perfil') setTab(t)
                else setTab('accesos')
              }}
              presence={presence}
              grantedScopeIds={access.grantedScopeIds}
              isOmniscient={isOmniscient}
            />
          ) : tab === 'accesos' && org ? (
            <AccessVaultPanel
              access={access}
              role={role}
              area={area}
              isOmniscient={isOmniscient}
              userName={profileApi.profile?.full_name ?? session.user.email}
            />
          ) : tab === 'reportes' && org ? (
            <SiloReportsPanel
              orgId={org.id}
              userId={session.user.id}
              role={role}
              area={area}
              location={liveLocation}
              isOmniscient={isOmniscient}
              mode="channel"
              orgName={org.name}
              userName={profileApi.profile?.full_name ?? session.user.email}
            />
          ) : tab === 'informes' && org && can('informes') ? (
            <SiloReportsPanel
              orgId={org.id}
              userId={session.user.id}
              role={role}
              area={area}
              location={liveLocation}
              isOmniscient={isOmniscient}
              mode="reports"
              orgName={org.name}
              userName={profileApi.profile?.full_name ?? session.user.email}
            />
          ) : tab === 'asistencia' && org ? (
            <AttendancePanel
              orgId={org.id}
              userId={session.user.id}
              userName={profileApi.profile?.full_name ?? session.user.email}
              location={liveLocation}
              locationReady={locationReady}
            />
          ) : tab === 'cumplimiento' && org ? (
            <PerformancePanel
              orgId={org.id}
              userId={session.user.id}
              role={role}
              area={area}
              userName={profileApi.profile?.full_name ?? session.user.email}
              orgName={org.name}
              location={liveLocation}
              isOmniscient={isOmniscient}
            />
          ) : tab === 'preoperacional' && org && can('preoperacional') ? (
            <VehiclePreopPanel
              orgId={org.id}
              userId={session.user.id}
              role={role}
              area={area}
              userName={profileApi.profile?.full_name ?? session.user.email}
              orgName={org.name}
              isOmniscient={isOmniscient}
            />
          ) : tab === 'historial' && org && can('historial') ? (
            <OperatorHistoryPanel
              orgId={org.id}
              userId={session.user.id}
              role={role}
              area={area}
              userName={profileApi.profile?.full_name ?? session.user.email}
              can={can}
              onNavigate={setTab}
            />
          ) : tab === 'admin' && isPlatformAdmin && developerMode && org ? (
            <>
              <AdminDashboard
                myId={session.user.id}
                mode="tenant"
                orgId={org.id}
                orgName={org.name}
              />
              <OnlinePresencePanel
                presence={presence}
                currentUserId={session.user.id}
                orgId={org.id}
                asCard
              />
            </>
          ) : tab === 'admin' && isPlatformAdmin ? (
            <>
              <AdminDashboard myId={session.user.id} mode="platform" />
            </>
          ) : tab === 'admin' && org && canManageOrgUsers(role) && can('admin') ? (
            <>
              <AdminDashboard
                myId={session.user.id}
                mode="tenant"
                orgId={org.id}
                orgName={org.name}
              />
              <OnlinePresencePanel
                presence={presence}
                currentUserId={session.user.id}
                orgId={org.id}
                asCard
              />
            </>
          ) : tab === 'panel' && org && can('panel') && isSupervisor ? (
            <SupervisorDashboard
              orgId={org.id}
              userId={session.user.id}
              coordinatorName={profileApi.profile?.full_name ?? session.user.email}
              onNavigate={setTab}
            />
          ) : tab === 'panel' && org && can('panel') ? (
            <>
              <CoordinatorDashboard
                orgId={org.id}
                userId={session.user.id}
                role={role}
                area={
                  isCoordinator
                    ? area
                    : // Acceso temporal de otro perfil → vista de planta
                    'plant'
                }
                coordinatorName={profileApi.profile?.full_name ?? session.user.email}
                onNavigate={setTab}
              />
              {/* Ventana de usuarios en línea con sede/ubicación (coordinador) */}
              <OnlinePresencePanel
                presence={presence}
                currentUserId={session.user.id}
                orgId={org.id}
                asCard
              />
            </>
          ) : tab === 'ventas' && org && can('ventas') && isCustomer ? (
            <ClientPortal
              orgId={org.id}
              userId={session.user.id}
              profile={profileApi.profile}
            />
          ) : tab === 'ventas' && org && can('ventas') ? (
            <SalesModule
              orgId={org.id}
              userId={session.user.id}
              role={role}
              area={area}
              userName={profileApi.profile?.full_name ?? session.user.email}
              forceProfile={isOmniscient ? 'full' : 'sales'}
            />
          ) : tab === 'logistica' && org && can('logistica') ? (
            <LogisticsPanel
              orgId={org.id}
              userId={session.user.id}
              role={role}
              area={area}
              userName={profileApi.profile?.full_name ?? session.user.email}
              presence={presence}
            />
          ) : org &&
            can(tab) &&
            tab !== 'ventas' &&
            tab !== 'logistica' &&
            DEPARTMENT_MODULES.some((m) => m.tab === tab && corpModules.some((c) => c.id === m.id)) ? (
            <DepartmentModule
              module={DEPARTMENT_MODULES.find((m) => m.tab === tab)}
              orgId={org.id}
              role={role}
              area={area}
              userId={session.user.id}
              userName={profileApi.profile?.full_name ?? session.user.email}
              onNavigate={setTab}
              grantedScopeIds={access.grantedScopeIds}
              isOmniscient={isOmniscient}
              location={liveLocation}
            />
          ) : tab === 'mantenimiento' && org && can('mantenimiento') ? (
            <MaintenancePanel orgId={org.id} userId={session.user.id} role={role} />
          ) : tab === 'calibracion' && org && can('calibracion') ? (
            <MachineCalibrationPanel orgId={org.id} userId={session.user.id} role={role} />
          ) : tab === 'supervision' && org && can('supervision') ? (
            <SupervisionPanel orgId={org.id} userId={session.user.id} role={role} area={area} />
          ) : tab === 'horarios' && org && can('horarios') ? (
            <ShiftSchedule orgId={org.id} userId={session.user.id} role={role} />
          ) : tab === 'monitoreo' && org && can('monitoreo') ? (
            <MonitorMode orgId={org.id} userId={session.user.id} role={role} />
          ) : tab === 'plantas' && org && can('plantas') ? (
            <PlantManager
              orgId={org.id}
              role={role}
              presence={presence}
              currentUserId={session.user.id}
              isPlatformStaff={!!isPlatformAdmin}
            />
          ) : tab === 'granjas' && org && can('granjas') ? (
            <FarmManager
              orgId={org.id}
              role={role}
              presence={presence}
              currentUserId={session.user.id}
              isPlatformStaff={!!isPlatformAdmin}
            />
          ) : tab === 'inventarios' && org && can('inventarios') ? (
            <InventoryModule
              orgId={org.id}
              userId={session.user.id}
              role={role}
              area={area}
              userName={profileApi.profile?.full_name ?? session.user.email}
            />
          ) : tab === 'iot' && org && can('iot') ? (
            <IotBiosecurityHub
              orgId={org.id}
              role={role}
              area={area}
              userName={profileApi.profile?.full_name ?? session.user.email}
            />
          ) : tab === 'veterinaria' && org && can('veterinaria') ? (
            <VeterinaryModule
              orgId={org.id}
              userId={session.user.id}
              role={role}
              area={area}
              userName={profileApi.profile?.full_name ?? session.user.email}
            />
          ) : tab === 'produccion' && org && can('produccion') ? (
            <FarmBatchesPanel orgId={org.id} userId={session.user.id} role={role} area={area} />
          ) : tab === 'huevos' && org && can('huevos') ? (
            <EggReportPanel
              orgId={org.id}
              userId={session.user.id}
              role={role}
              area={area}
              coordinatorName={profileApi.profile?.full_name ?? session.user.email}
            />
          ) : tab === 'recepcion' && org && can('recepcion') ? (
            <ReceptionPanel
              orgId={org.id}
              userId={session.user.id}
              role={role}
              showReception
              showColdRoom
              coordinatorName={profileApi.profile?.full_name ?? session.user.email}
            />
          ) : tab === 'cargue' && org && can('cargue') ? (
            <ColdStorageLoadPanel
              orgId={org.id}
              userId={session.user.id}
              role={role}
              coordinatorName={profileApi.profile?.full_name ?? session.user.email}
            />
          ) : tab === 'datos-op' && org && can('datos-op') ? (
            <OperationsDataCenter
              orgId={org.id}
              userId={session.user.id}
              role={role}
              area={area}
              userName={profileApi.profile?.full_name ?? session.user.email}
              onNavigate={setTab}
            />
          ) : tab === 'misionales' && org && can('misionales') ? (
            <MisionalesPanel
              orgId={org.id}
              userId={session.user.id}
              role={role}
              userName={profileApi.profile?.full_name ?? session.user.email}
              orgName={org.name}
            />
          ) : tab === 'diseno' && isPlatformAdmin && !previewing ? (
            <DevStudio orgId={org?.id} userId={session.user.id} role={role} />
          ) : tab === 'datos' && isPlatformAdmin && !previewing && org ? (
            <div className="card wide">
              <div className="card-head">
                <h2>Datos operativos · CDH Maker</h2>
              </div>
              <p className="hint" style={{ marginTop: 4 }}>
                Solo administración de plataforma. Edite datos del tenant activo (aislados por org_id).
                No mezclar empresas.
              </p>
              <DataFixPanel orgId={org.id} canDelete={isPlatformAdmin} />
            </div>
          ) : tab.startsWith('cm-') && org && visibleModules.some((m) => `cm-${m.id}` === tab) ? (
            <CustomModuleView module={visibleModules.find((m) => `cm-${m.id}` === tab)} />
          ) : (
            <ProfileCard session={session} org={org} role={role} profileApi={profileApi} />
          )}
        </LazyPanel>
      </ModuleBoundary>
      {org && (
        <LazyPanel quiet>
          <ChatWidget orgId={org.id} userId={session.user.id} />
        </LazyPanel>
      )}
      {org && (
        <LazyPanel quiet>
          <NotificationBell
            orgId={org.id}
            userId={session.user.id}
            role={role}
            area={area}
            isOmniscient={isOmniscient}
            canNotify={
              can('mantenimiento') ||
              can('gerencia') ||
              isOmniscient ||
              role === 'coordinator' ||
              role === 'supervisor'
            }
          />
        </LazyPanel>
      )}
    </>
  )
}

// ---------------------------------------------------------------------------
// SECCION: App raíz — ciclo de vida de sesión, perfil, org y splash/login.
// Decide qué pantalla mostrar antes del Workspace. Henry Stark Desarrollador
// ---------------------------------------------------------------------------
export default function App() {
  const [session, setSession] = useState(null)
  const [ready, setReady] = useState(false)
  const [isRecoveryMode, setIsRecoveryMode] = useState(
    () =>
      typeof window !== 'undefined' &&
      (window.location.hash.includes('type=recovery') ||
        (window.location.hash.includes('access_token') && window.location.hash.includes('recovery')))
  )

  useEffect(() => {
    let alive = true
    // Nunca colgar el arranque: máximo 4s aunque Supabase no responda
    const timeout = setTimeout(() => {
      if (alive) {
        console.warn('getSession timeout — continuando sin sesión')
        setReady(true)
      }
    }, 4000)

    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (!alive) return
        setSession(data.session ?? null)
        if (data.session?.access_token) {
          try {
            supabase.realtime.setAuth(data.session.access_token)
          } catch {
            /* */
          }
        }
      })
      .catch((err) => {
        console.error('getSession:', err)
      })
      .finally(() => {
        clearTimeout(timeout)
        if (alive) setReady(true)
      })

    let sub
    try {
      const res = supabase.auth.onAuthStateChange((event, s) => {
        setSession(s)
        if (event === 'PASSWORD_RECOVERY') {
          setIsRecoveryMode(true)
        }
        try {
          if (s?.access_token) supabase.realtime.setAuth(s.access_token)
          else supabase.realtime.setAuth()
        } catch {
          /* */
        }
      })
      sub = res?.data
    } catch (e) {
      console.error('onAuthStateChange:', e)
    }
    return () => {
      alive = false
      clearTimeout(timeout)
      try {
        sub?.subscription?.unsubscribe()
      } catch {
        /* */
      }
    }
  }, [])

  const userId = session?.user?.id ?? null
  const profileApi = useProfile(userId)
  const { profile, loading: profileLoading } = profileApi
  const {
    org,
    role,
    area,
    memberships,
    switchOrg,
    loading: orgLoading,
  } = useOrganization(userId)

  // Auto-vincular usuarios nuevos (Google OAuth o registro) a su organización y aprobarlos
  useEffect(() => {
    if (!userId || orgLoading || memberships.length > 0) return
    const pendingOrg = localStorage.getItem('incubapp_pending_org_id') || 'd54fca1e-1878-4967-aee5-330aa2e631cc'
    const pendingName = localStorage.getItem('incubapp_pending_full_name') || session?.user?.user_metadata?.full_name || ''

    async function ensureUserMembership() {
      try {
        localStorage.removeItem('incubapp_pending_org_id')
        localStorage.removeItem('incubapp_pending_full_name')

        // Asegurar que su perfil esté aprobado y tenga nombre
        const updates = { is_approved: true }
        if (pendingName) updates.full_name = pendingName
        await supabase.from('profiles').update(updates).eq('id', userId)

        // Crear membresía en Antioqueña de Incubación SAS (o la empresa seleccionada)
        await supabase.from('organization_members').upsert({
          org_id: pendingOrg,
          user_id: userId,
          role: 'operator',
          area: 'general',
        })
      } catch (err) {
        console.warn('Auto-membership notice:', err)
      }
    }
    ensureUserMembership()
  }, [userId, orgLoading, memberships.length, session])

  const legal = useLegalAcceptance({ userId, orgId: org?.id })
  const [legalBusy, setLegalBusy] = useState(false)
  const [showLegalView, setShowLegalView] = useState(false)

  // Migración de permisos para usuarios que ya aceptaron términos y condiciones anteriormente
  useEffect(() => {
    if (!legal.loading && legal.accepted && userId) {
      try {
        const current = localStorage.getItem('incubapp_share_location')
        if (current === null) {
          localStorage.setItem('incubapp_share_location', '1')
        }
      } catch { }
    }
  }, [legal.loading, legal.accepted, userId])

  const acceptLegal = async () => {
    setLegalBusy(true)
    const res = await legal.accept()
    if (res && !res.error) {
      try {
        localStorage.setItem('incubapp_share_location', '1')
      } catch { }
      // Solicitar el GPS y notificaciones inmediatamente después de la aceptación (bajo interacción del usuario)
      await requestOperationalDevicePermissions({
        camera: false,
        notifications: true,
        contacts: false,
        geo: true
      }).catch(() => { })
    }
    setLegalBusy(false)
    return res
  }

  // Identidad global: CDH fuera de tenant; cliente solo con org activa
  useEffect(() => {
    if (!session) {
      applyBrandToDocument(resolveBrandContext({ forcePlatform: true }))
    }
  }, [session])

  // Timeout de seguridad para perfil/org (no bloquear por red lenta)
  const [bootWait, setBootWait] = useState(true)

  useEffect(() => {
    if (!session) {
      setBootWait(false)
      return
    }
    setBootWait(true)
    const t = setTimeout(() => setBootWait(false), 5000)
    if (!profileLoading && !orgLoading) {
      clearTimeout(t)
      setBootWait(false)
    }
    return () => clearTimeout(t)
  }, [session, profileLoading, orgLoading])

  // Bitácora de acceso + metadatos de dispositivo (una vez por sesión).
  useEffect(() => {
    if (!session?.user?.id || profileLoading || orgLoading) return
    recordAccess({
      userId: session.user.id,
      orgId: org?.id,
      role,
      area,
      platformRole: profile?.platform_role || null,
    })
  }, [session, profileLoading, orgLoading, org?.id, role, area, profile?.platform_role])

  // Barrido de ventanas de calibración. La ventana INC dura 24 h y el panel de
  // calibración solo escanea mientras está abierto: sin esto, una ventana se
  // pierde si nadie entra al panel ese día.
  useEffect(() => {
    const uid = session?.user?.id
    if (!uid || !org?.id || profileLoading || orgLoading) return
    let vivo = true
    const barrer = async () => {
      if (!vivo) return
      const { scanCalibrationWindows } = await import('./hooks/useMachineCalibration')
      await scanCalibrationWindows({ orgId: org.id, userId: uid })
    }
    barrer()
    const t = setInterval(barrer, 30 * 60 * 1000)
    return () => {
      vivo = false
      clearInterval(t)
    }
  }, [session?.user?.id, org?.id, profileLoading, orgLoading])

  if (supabaseConfigError) {
    return (
      <main className="shell">
        <div className="card auth-card pending-card" style={{ maxWidth: 420 }}>
          <div className="pending-icon" aria-hidden="true">
            ⚠️
          </div>
          <h1 style={{ fontSize: '1.15rem' }}>Configuración incompleta</h1>
          <p className="brand-sub" style={{ textAlign: 'center' }}>
            {supabaseConfigError}
          </p>
          <p className="hint" style={{ textAlign: 'center' }}>
            Revisa <code>.env</code>: <code>VITE_SUPABASE_URL</code> y{' '}
            <code>VITE_SUPABASE_KEY</code>. El asesor IA no necesita clave aqui:
            la guarda la funcion asesor-ia en Supabase.
          </p>
        </div>
      </main>
    )
  }

  if (!ready) {
    return (
      <main className="shell">
        <div className="app-bg" aria-hidden="true" />
        <div className="card auth-card pending-card" style={{ maxWidth: 360 }}>
          <div className="pending-icon" aria-hidden="true">
            ⟳
          </div>
          <h1 style={{ fontSize: '1.15rem' }}>Iniciando…</h1>
          <p className="brand-sub" style={{ textAlign: 'center', margin: 0 }}>
            Si tarda, recarga la página.
          </p>
        </div>
      </main>
    )
  }

  const isPlatformAdmin = profile?.platform_role === 'admin' && profile?.is_approved

  let content
  if (isRecoveryMode) {
    content = <ResetPasswordForm onCompleted={() => setIsRecoveryMode(false)} />
  } else if (!session) {
    content = (
      <AuthForm />
    )
  } else if ((profileLoading || orgLoading) && bootWait) {
    content = (
      <div className="card auth-card pending-card" style={{ maxWidth: 360 }}>
        <div className="pending-icon" aria-hidden="true">
          ⟳
        </div>
        <h1 style={{ fontSize: '1.15rem' }}>Cargando workspace…</h1>
        <p className="brand-sub" style={{ textAlign: 'center', margin: 0 }}>
          Conectando con tu organización
        </p>
      </div>
    )
  } else if (profile && !profile.is_approved && !isPlatformAdmin) {
    content = <PendingApproval email={profile.email ?? session.user.email} />
  } else if (!org && !isPlatformAdmin) {
    content = <PendingApproval email={profile?.email ?? session.user.email} variant="org" />
  } else {
    content = (
      <Workspace
        session={session}
        org={org}
        role={role}
        area={area}
        isPlatformAdmin={isPlatformAdmin}
        profileApi={profileApi}
        memberships={memberships}
        switchOrg={switchOrg}
      />
    )
  }

  // Identidad visual del TENANT (cliente) solo si NO es staff de plataforma
  const clientBrand =
    session && !isPlatformAdmin && org
      ? resolveBrandContext({ org, isPlatformStaff: false })
      : null
  const showClientBg = !!(clientBrand?.mode === 'client' && clientBrand.showClientBackground)

  return (
    <main
      className={`shell${showClientBg ? ' brand-client' : ' brand-platform'}${isPlatformAdmin ? ' shell-platform' : ''
        }`}
    >
      <div
        className={`app-bg${showClientBg ? ' client-bg' : ' platform-bg'}${isPlatformAdmin ? ' platform-immersive' : ''
          }`}
        aria-hidden="true"
      />
      <SplashScreen />
      <div className="grid-bg" aria-hidden="true" />
      {content}
      {!!session && !legal.loading && !legal.accepted && (
        <LegalDocsModal mode="gate" onAccept={acceptLegal} busy={legalBusy} />
      )}
      {showLegalView && (
        <LegalDocsModal mode="view" onClose={() => setShowLegalView(false)} />
      )}
      <footer className="app-foot">
        <CdhSignature clientMode={clientBrand?.mode === 'client' || clientBrand?.mode === 'tenant'} />
        <button
          type="button"
          className="app-foot-legal-link"
          onClick={() => setShowLegalView(true)}
        >
          Términos y privacidad
        </button>
      </footer>
    </main>
  )
}
