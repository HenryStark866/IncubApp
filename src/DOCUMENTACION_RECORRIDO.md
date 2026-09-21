# Recorrido del código — IncubApp

Documentación de carpetas y archivos del código fuente.  
**Autor: Henry Stark Desarrollador** · **Versión docs: 3.0 · Julio 2026**

> Convención: cada archivo en `src/` lleva una cabecera con **PROPÓSITO**, **CÓMO FUNCIONA** y la firma **Henry Stark Desarrollador**.

Documentación de negocio y avance:

- `docs/Plan_Fidelizacion_y_Expansion_SaaS.md` — fidelización 90 d / bonos 95 % / expansión SaaS  
- `docs/Avance_Producto_Julio_2026.md` — qué está entregado  
- `docs/Tecnologias_y_Lenguajes_FAQ.md` — stack: qué es / cómo funciona / para qué  
- `docs/00_INDICE_DOCUMENTACION.md` — índice  

---

## Raíz de `src/`

| Archivo | Para qué sirve | Cómo funciona |
|---------|----------------|---------------|
| `main.jsx` | Arranque de la SPA | Monta React en `#root`, tema, ErrorBoundary. Henry Stark Desarrollador |
| `App.jsx` | Cerebro de la app autenticada | Login → perfil/org → permisos de **módulos** → menú y panel activo (incl. Cumplimiento y Asistencia). Henry Stark Desarrollador |
| `index.css` | Toda la apariencia | Tema claro/oscuro, shell, **fondo.jpg** (`.app-bg`), cockpits, asistencia. Henry Stark Desarrollador |
| `DOCUMENTACION_RECORRIDO.md` | Este mapa | Guía de carpetas para desarrolladores. Henry Stark Desarrollador |

---

## `src/components/` — Interfaz

### Núcleo / shell
- **AuthForm** — Login y registro Supabase Auth.  
- **SplashScreen** — Pantalla de carga inicial.  
- **PendingApproval** — Usuario sin aprobación o sin org.  
- **WorkspaceNav** — Menú formal + perfil (tema, foto, salir).  
- **ProfileCard** — Datos de perfil y avatar.  
- **Brand** — Marca IncubApp / CDH.  
- **ErrorBoundary** — Fallback de errores de render.  
- **ListControls** — Búsqueda/filtros en listados.  
- **ExecBoard** — KPI y paneles del tablero ejecutivo.  

### Dirección, gerencia y cumplimiento
- **AdminDashboard** — Admin de plataforma.  
- **DepartmentModule** — Paneles corporativos (gerencia, RRHH, etc.).  
- **ManagementCockpit** — Cockpit: torre, **bandeja gerencial**, asesor, scorecard IE.  
- **MgmtExpertChat** — Chatbot de gerencia/avicultura (local ± Grok opcional).  
- **TodayBoard** — Tablero «Hoy» por rol.  
- **SiloReportsPanel** — Canal y **bandeja** (OC, facturas, cotizaciones, informes; aprobar/exportar).  
- **PerformancePanel** — **Cumplimiento** esperado vs reportado, rondas, metas coord., elegibilidad bono 90 d / 95 %.  
- **NotificationBell** — Campana + push filtrado (OT fuera de gerencia).  

### Coordinación / planta
- **CoordinatorDashboard** — Panel por área (planta IE o accesos rápidos).  
- **CoordEngineeringBoard** — OEE, Pareto, 5S, bitácoras.  
- **SupervisorDashboard** — Tablero del supervisor.  
- **EngineeringTools** — Gauges, 5 porqués, calculadoras.  
- **MonitorMode** — Monitoreo de rondas.  
- **MaintenancePanel** — Órdenes de trabajo.  
- **SupervisionPanel** — Actividades de turno.  
- **MachineManager / SensorPanel** — Equipos y sensores.  

### Instalaciones y planos
- **PlantManager / FarmManager** — Sedes y planos.  
- **FloorMap** — Editor/visor del plano.  
- **PlantGeoCalibrator** — Calibración GPS del plano.  
- **WazeStyleMap** — Mapa logística.  

### Operación productiva
- **FarmBatchesPanel** — Levantes / lotes.  
- **EggReportPanel** — Reportes de huevo.  
- **ReceptionPanel / ColdRoomPanel / ColdStorageLoadPanel** — Recepción, frío, cargue.  
- **ShiftSchedule / ShiftOpsPanels** — Horarios y actividades de turno.  
- **AttendancePanel** — Ingreso/salida con **selfie + marca de agua** (nombre, fecha, hora, lugar, GPS).  

### Comercial y otros
- **SalesModule / ClientPortal** — Ventas y portal cliente.  
- **LogisticsPanel** — Remisiones, flota, rutas.  
- **InventoryModule / CoordinatorInventoryPanel** — Inventarios.  
- **VeterinaryModule** — Sanidad veterinaria.  
- **IotBiosecurityHub** — Checklists IoT/bioseguridad por sede + semáforo.  
- **DevStudio / CustomModuleView** — Diseño de UI y módulos personalizados.  
- **DataFixPanel** — Edición de datos operativos.  
- **ChatWidget** — Chat org + DM.  
- **OnlinePresencePanel** — Personas en línea.  

---

## `src/hooks/` — Lógica de datos

Patrón: `useX(…)` → `{ data, loading, error, acciones }` + Realtime cuando aplica.

| Hook | Función |
|------|---------|
| `useOrganization` | Membresía y org |
| `useProfile` | Perfil y avatar |
| `useAccessControl` | Grants temporales entre módulos |
| `useNotifications` | Notificaciones + push filtrado |
| `useSiloDispatches` | Bandeja de reportes / OC (nube + local) |
| `useAttendance` | Marcas ingreso/salida + watermark |
| `usePerformance` | Metas, rondas, labores, rachas 90 d, scores |
| `useTodayBoard` | KPIs del tablero Hoy |
| `useDepartmentStats` | KPIs de módulos corporativos |
| `useMachineChecks` | Rondas / checks de máquina |
| `useWorkOrders` | OT de mantenimiento |
| `useOrgPresence` | Presencia + GPS opcional |
| `usePlants/Rooms/Machines/Sensors` | Instalaciones |
| `useBatches / EggReports / ColdRoom / Loads` | Cadena productiva |
| `useSalesOrders / Remittances / LogisticsFleet` | Comercial |
| `useOfflineSync` | Cola offline |
| … | Ver cabecera de cada archivo |

---

## `src/lib/` — Utilidades

| Módulo | Función |
|--------|---------|
| `privacyScopes.js` | Módulos herméticos y pestañas (incl. `cumplimiento`) |
| `roles.js` | Roles, áreas, módulos corporativos, etiquetas |
| `complianceEngine.js` | Reglas **90 días**, **95 %**, 6 rondas, scoring |
| `watermark.js` | Marca de agua en selfies de asistencia |
| `performanceLocalStore.js` | Fallback local de cumplimiento |
| `dispatchLocalStore.js` | Fallback local de bandeja |
| `notificationPolicy.js` | OT no a gerencia; docs a gerencia |
| `advisorEngine.js` / `incubationKnowledge.js` | Asesor local |
| `exportExcel.js` | Excel bajo demanda |
| `supabase.js` | Cliente seguro (no tumba la app si falta env) |
| `theme.js` / `image.js` / `precisionGps.js` | UI, compresión, GPS |

---

## `src/data/`

Datos demo (prospectos pollito de un día, etc.) para pruebas de UI.

---

## Fuera de `src/` (referencia)

| Ruta | Uso |
|------|-----|
| `public/fondo.jpg` | Imagen de fondo de la app |
| `public/sw.js` | Service worker PWA |
| `supabase_migration_performance_bonus.sql` | Metas, rondas, labores, rachas |
| `supabase_migration_dispatches_attendance.sql` | Bandeja + asistencia |
| `supabase_migration_*.sql` | Resto del esquema |
| `docs/` | Manuales, plan SaaS, presentación |
| `deploy_incubapp.bat` | Deploy Vercel |
| `dist/` | Build de producción (no editar a mano) |

---

## Flujo de ejecución (resumen)

1. `index.html` carga `main.jsx`.  
2. `main.jsx` monta `<App />` con ErrorBoundary.  
3. `App` espera sesión → perfil → organización.  
4. `Workspace` calcula módulos (`privacyScopes` + grants).  
5. Pestañas comunes: Hoy, Accesos, Reportes, **Asistencia**, **Cumplimiento**, Perfil.  
6. Datos en Supabase; offline / local fallback cuando falta migración.  

### Flujo de fidelización (producto)

1. Usuario marca asistencia (selfie watermark) y reporta rondas/labores.  
2. `usePerformance` actualiza racha de uso y score del día.  
3. A los **90 días** continuos + **≥ 95 %** → elegible a bono.  
4. Fondo del bono: ingresos SaaS (clientes / empresas hermanas), no nómina de planta.  

**Documentado por: Henry Stark Desarrollador**
