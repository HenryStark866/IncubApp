# Avance de producto IncubApp — Julio 2026

**Versión:** 3.0 · **9 de julio de 2026**  
**Autor:** Henry Camilo Taborda Galeano — Desarrollador  

Documento de avance para coordinación, gerencia y presentación comercial.  
Complementa el [Plan de fidelización y expansión SaaS](./Plan_Fidelizacion_y_Expansion_SaaS.md).

---

## 1. Resumen ejecutivo

IncubApp es una SPA multi-empresa (React 19 + Vite 8 + Supabase) para **incubación avícola y granja**, con:

- Perfiles y **módulos herméticos** (solo el admin de plataforma ve todo).  
- Operación de planta/granja (rondas, OT, recepción, levantes, huevo, IoT checklist).  
- **Gerencia** con bandeja de OC/facturas/cotizaciones e informes verificados.  
- **Asistencia** con selfie y marca de agua.  
- **Cumplimiento** esperado vs reportado y plan de bonos (90 días / 95 %).  
- Asesor de gerencia (conocimiento local; Grok/OpenAI **opcionales**).  
- La app **funciona sin API de Grok**.  

---

## 2. Módulos y funcionalidades entregadas

### 2.1 Núcleo

| Función | Detalle |
|---------|---------|
| Auth multi-tenant | Supabase Auth + `organization_members` |
| Menú formal | WorkspaceNav por grupos (Dirección, Operación, etc.) |
| Tema | Claro corporativo / oscuro futurista |
| Fondo | Imagen `fondo.jpg` (pollitos) restaurada y visible |
| PWA | Manifest + service worker (caché controlada; `/reparar.html`) |
| Offline | Cola de reintentos en operaciones de turno |

### 2.2 Módulos herméticos y accesos

- Dominios: gerencia, planta, granja, mantenimiento, ventas, logística, RRHH, contabilidad, SST, ambiental, veterinaria, IoT, diseño, datos.  
- Pestaña **Accesos**: solicitar / aprobar grants temporales.  
- Rol **Desarrollador** (antes “Propietario” en UI).  

### 2.3 Gerencia

- **ManagementCockpit**: torre de control, scorecard IE, decisiones, metas, herramientas.  
- **Bandeja gerencial**: OC, facturas, cotizaciones, solicitudes, informes.  
  - Filtros, búsqueda, monto, proveedor, referencia, adjuntos.  
  - Aprobar / rechazar / archivar + notificaciones.  
  - Export Excel.  
  - Fallback local si falta SQL en Supabase.  
- **Asesor IA** (local + opcional Grok).  
- Informes solo con datos **verificados**.  
- Notificaciones: **OT no van a gerencia** (`notificationPolicy`).  

### 2.4 Operación

| Módulo | Avance |
|--------|--------|
| Supervisión / rondas | Checks con foto, actividades de turno |
| Mantenimiento | OT, evidencias |
| Plantas / granjas / planos | FloorMap, geo-calibración |
| Levantes | Lotes y grading |
| Huevo / recepción / frío / cargue | Paneles operativos |
| Horarios | Turnos |
| Inventarios / ventas / logística / veterinaria | Módulos activos |
| IoT y bioseguridad | Checklists por sede + semáforo consolidado |

### 2.5 Asistencia (cumplimiento laboral)

- Selfie obligatoria (cámara frontal).  
- **Marca de agua**: nombre, fecha, hora, lugar, GPS, sello verificado.  
- Fallback local si no hay tabla en nube.  
- Alimenta **adherencia al turno**.  

### 2.6 Cumplimiento y bonos (nuevo)

Pestaña **Cumplimiento** (todos los usuarios):

- Mi cumplimiento (barras esperado vs reportado).  
- Rondas de turno (mín. 6 por defecto para turneros).  
- Reportar labor exitosa.  
- Metas (coordinador).  
- Equipo / elegibles a bono + export.  
- Reglas: **90 días** uso continuo + **≥ 95 %**.  
- Texto de fondo del bono: **SaaS clientes / empresas hermanas**, no nómina de planta.  

SQL: `supabase_migration_performance_bonus.sql`.

### 2.7 Comunicación

- Chat org + DM.  
- Reportes entre módulos (persona o área).  
- Campana + push de navegador filtrado por rol.  

---

## 3. Stack y despliegue

| Capa | Tecnología |
|------|------------|
| Frontend | React 19, Vite 8 |
| Backend | Supabase (Postgres, RLS, Auth, Realtime, Storage) |
| Hosting | Vercel (`deploy_incubapp.bat`) |
| Export | SheetJS (xlsx) bajo demanda |
| Mapas | Leaflet (logística / geo) |

Variables: `VITE_SUPABASE_URL`, `VITE_SUPABASE_KEY` (obligatorias).  
Opcional: `VITE_XAI_API_KEY` (Grok) — **no requerido para entrar**.

---

## 4. Migraciones SQL relevantes

| Archivo | Propósito |
|---------|-----------|
| `supabase_migration_dispatches_attendance.sql` | Bandeja + asistencia |
| `supabase_migration_performance_bonus.sql` | Metas, rondas, labores, rachas 90 d |
| `supabase_migration_access_grants.sql` | Accesos temporales entre módulos |
| `supabase_migration_org_roles_modules.sql` | Roles / áreas |
| Otras `supabase_migration_*.sql` | Logística, vet, geo, inventarios, etc. |

---

## 5. Archivos clave del avance reciente

```
src/components/SiloReportsPanel.jsx      # Bandeja gerencial
src/components/PerformancePanel.jsx      # Cumplimiento y bonos
src/components/AttendancePanel.jsx       # Selfie + watermark
src/components/ManagementCockpit.jsx     # Cockpit gerencia
src/components/IotBiosecurityHub.jsx     # Checklists IoT
src/hooks/useSiloDispatches.js
src/hooks/usePerformance.js
src/hooks/useAttendance.js
src/lib/complianceEngine.js
src/lib/watermark.js
src/lib/notificationPolicy.js
src/lib/privacyScopes.js
public/fondo.jpg                         # Fondo de la app
docs/Plan_Fidelizacion_y_Expansion_SaaS.md
```

---

## 6. Qué demuestra el piloto a los 90 días

Con uso continuo de la SaaS se obtiene:

1. **Historial de uso** (rachas por persona).  
2. **Cumplimiento medible** (esperado vs reportado).  
3. **Evidencia de turno** (selfies con marca de agua).  
4. **Gobierno documental** (bandeja verificada).  
5. **Caso real** para vender a clientes y empresas hermanas.  

Ese es el **respaldo real** del plan de expansión.

---

## 7. Pendiente / roadmap cercano

- Periodos de liquidación de bono (semanal/mensual) y bolsa contable SaaS.  
- ~~Márgenes exactos de llegada/salida vs horario de turno.~~ Hecho (sept. 2026): el coordinador fija la tolerancia en *Cumplimiento → Metas*; la adherencia compara cada marca con T1/T2/T3 (`src/lib/shiftPunctuality.js`).  
- Onboarding multi-tenant comercial (precios, facturación).  
- Telemetría IoT en vivo (hoy checklist operativo por sede).  
- Liveness / anti-fraude facial opcional.  

---

**Documentado por: Henry Stark Desarrollador**
