# Offline en IncubApp

**Versión:** 3.1 · Julio 2026  
**Autor:** Henry Stark Desarrollador  

## Objetivo

Que la planta pueda **seguir operando sin red**: registrar rondas, asistencia, reportes y labores; al volver internet, **subir la cola automáticamente**.

## Capas

| Capa | Qué hace |
|------|----------|
| **Service Worker** (`public/sw.js` v5) | Cachea shell (HTML/JS/CSS), iconos, fondo y logos. Abre la app sin red tras la 1.ª visita. |
| **Cola IndexedDB** (`offlineQueue.js`) | machine_check, activity_complete, db_insert/update/upsert, storage_upload |
| **Caché de lecturas** (`offlineCache.js`) | Última lista buena de checks, bandeja, etc. |
| **Fallbacks locales** | localStorage (asistencia, dispatches, cumplimiento, IoT, ventas…) |
| **useOfflineSync** | Detecta online/offline, vacía la cola, reintenta cada 20 s |
| **OfflineBanner** | Aviso “Sin conexión” + pendientes + “Subir ahora” |

## Módulos cubiertos

- Rondas / machine checks (foto en cola)
- Actividades de turno
- OT de mantenimiento
- Chat (mensajes en cola)
- Ventas / clientes (insert/update en cola)
- Reportes de huevo (upsert en cola)
- **Asistencia** selfie (storage + insert en cola + local)
- **Bandeja** / reportes entre módulos (cola + local + caché)
- Cumplimiento / rondas de turno (local + cloud cuando hay red)

## Cómo probar

1. Abra la app **con red** una vez (instala SW y caché).
2. Active modo avión.
3. Marque asistencia, una ronda o un reporte.
4. Debe verse banner “Sin conexión” y el dato en pantalla.
5. Reactive la red → banner “Sincronizando” y cola a 0.

## Importante

- Auth y datos en vivo de Supabase **no** se cachean (seguridad multi-tenant).
- La 1.ª instalación **requiere red** una vez.
- Si el SW se corrompe: `/reparar.html`

**Documentado por: Henry Stark Desarrollador**
