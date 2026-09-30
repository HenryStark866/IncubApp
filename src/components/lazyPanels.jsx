/**
 * Code-splitting de paneles del workspace.
 * Cada pestaña se descarga solo al navegar a ella → reduce el bundle inicial ~1 MB.
 * Henry Stark Desarrollador · CDH Maker
 */
import { lazy, Suspense } from 'react'

function panelLoader(importFn) {
  return lazy(async () => {
    const mod = await importFn()
    // Soporta default export y named export único
    return { default: mod.default ?? Object.values(mod)[0] }
  })
}

/** Fallback visual mientras carga el chunk del módulo. */
export function PanelFallback({ label = 'módulo' }) {
  return (
    <div className="card wide" role="status" aria-live="polite">
      <div className="card-head">
        <h2 style={{ margin: 0 }}>Cargando {label}…</h2>
      </div>
      <p className="hint" style={{ marginTop: 8 }}>
        Preparando el panel. Solo se descarga la primera vez.
      </p>
      <div className="pending-icon" aria-hidden="true" style={{ margin: '16px auto' }}>
        ⟳
      </div>
    </div>
  )
}

/** Envuelve un lazy panel con Suspense. `quiet` = sin UI (widgets flotantes). */
export function LazyPanel({ children, label, quiet = false }) {
  return (
    <Suspense fallback={quiet ? null : <PanelFallback label={label} />}>{children}</Suspense>
  )
}

// —— Consola plataforma ——
export const BusinessModule = panelLoader(() => import('./BusinessModule'))
export const PlatformHub = panelLoader(() => import('./PlatformHub'))
export const PlatformTemplatesPanel = panelLoader(() => import('./PlatformTemplatesPanel'))
export const PlatformOrgModulesPanel = panelLoader(() => import('./PlatformOrgModulesPanel'))
export const PlatformProductPanel = panelLoader(() => import('./PlatformProductPanel'))
export const PlatformDevTools = panelLoader(() => import('./PlatformDevTools'))

// —— Operación diaria ——
export const TodayBoard = panelLoader(() => import('./TodayBoard'))
export const ShiftHome = panelLoader(() => import('../features/shift/components/ShiftHome'))
export const MaintenanceAuxHome = panelLoader(() => import('../features/maintenance/components/MaintenanceAuxHome'))
export const LeaderAreaHome = panelLoader(() => import('../features/leader/components/LeaderAreaHome'))
export const LeaderDashboard = panelLoader(() => import('./LeaderDashboard'))
export const LeaderOpsMap = panelLoader(() => import('./LeaderOpsMap'))
export const SiloReportsPanel = panelLoader(() => import('./SiloReportsPanel'))
export const AttendancePanel = panelLoader(() => import('./AttendancePanel'))
export const PerformancePanel = panelLoader(() => import('./PerformancePanel'))

// —— Dashboards y admin ——
export const AdminDashboard = panelLoader(() => import('./AdminDashboard'))
export const OnlinePresencePanel = panelLoader(() => import('./OnlinePresencePanel'))
export const CoordinatorDashboard = panelLoader(() => import('./CoordinatorDashboard'))
export const SupervisorDashboard = panelLoader(() => import('./SupervisorDashboard'))
export const ClientPortal = panelLoader(() => import('./ClientPortal'))
export const DevStudio = panelLoader(() => import('./DevStudio'))
export const DataFixPanel = panelLoader(() => import('./DataFixPanel'))
export const AccessRegistryPanel = panelLoader(() => import('./AccessRegistryPanel'))
export const CustomModuleView = panelLoader(() => import('./CustomModuleView'))

// —— Módulos de negocio ——
export const SalesModule = panelLoader(() => import('./SalesModule'))
export const LogisticsPanel = panelLoader(() => import('./LogisticsPanel'))
export const DepartmentModule = panelLoader(() => import('./DepartmentModule'))
export const InventoryModule = panelLoader(() => import('./InventoryModule'))
export const VeterinaryModule = panelLoader(() => import('./VeterinaryModule'))
export const IotBiosecurityHub = panelLoader(() => import('./IotBiosecurityHub'))

// —— Planta / granja / ops ——
export const MaintenancePanel = panelLoader(() => import('./MaintenancePanel'))
export const SupervisionPanel = panelLoader(() => import('./SupervisionPanel'))
export const ShiftSchedule = panelLoader(() => import('./ShiftSchedule'))
export const MonitorMode = panelLoader(() => import('./MonitorMode'))
export const PlantManager = panelLoader(() => import('./PlantManager'))
export const FarmManager = panelLoader(() => import('./FarmManager'))
export const FarmBatchesPanel = panelLoader(() => import('./FarmBatchesPanel'))
export const EggReportPanel = panelLoader(() => import('./EggReportPanel'))
export const ReceptionPanel = panelLoader(() => import('./ReceptionPanel'))
export const ColdStorageLoadPanel = panelLoader(() => import('./ColdStorageLoadPanel'))
export const OperationsDataCenter = panelLoader(() => import('./OperationsDataCenter'))
export const MisionalesPanel = panelLoader(() => import('./MisionalesPanel'))
export const OperatorHistoryPanel = panelLoader(() => import('./OperatorHistoryPanel'))
export const VehiclePreopPanel = panelLoader(() => import('./VehiclePreopPanel'))
export const MachineCalibrationPanel = panelLoader(() => import('./MachineCalibrationPanel'))

// —— Widgets siempre montados con org (carga diferida del shell) ——
export const ChatWidget = panelLoader(() => import('./ChatWidget'))
export const NotificationBell = panelLoader(() => import('./NotificationBell'))
export const ProfileCard = panelLoader(() => import('./ProfileCard'))
