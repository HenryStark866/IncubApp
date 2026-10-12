# IncubApp · Auditoría de los cambios de Kevin y estado por área

**Fecha:** 12-10-2026 · **Rama:** `claude/blissful-pasteur-pwx5gl` · **Base revisada:** 6 commits del 11-10-2026 (de `1c1430f` a `7d200d4`)

## 1. Resumen

Los cambios de Kevin compilan y no rompen las pruebas existentes, pero tenían **errores reales** que hacían que la remisión de galpón no se guardara, que la lectura de la foto diera cantidades equivocadas y que el operario de recepción perdiera pantallas del menú. Además, el commit del 11-10 metió en IncubApp (repositorio **público**) la copia completa del código **privado** de Misionales. Todo quedó corregido, salvo la limpieza del historial (ver punto 4).

Verificación final: lint sin errores · **475 pruebas OK** (9 nuevas) · build de producción OK · pantallas nuevas probadas en el navegador en PC y en celular (375 px, sin desbordes) con datos simulados.

## 2. Hallazgos en los cambios de Kevin y su corrección

| # | Gravedad | Hallazgo | Corrección |
|---|---|---|---|
| 1 | **Crítica** | «Remisión galpón» guarda en `reception_remisions`, pero **la tabla no existía**: ninguna remisión quedaba guardada. | Migración `20261012_remision_galpon.sql` (tabla, RLS por empresa, número único por empresa). Registrada en `servidor-local/migraciones.txt`. |
| 2 | **Crítica** | El código de Misionales es privado (lo dice `servidor-local/16-subir-misionales.ps1`) y se versionó entero dentro de IncubApp, que es público, junto con un `.zip` duplicado. | Se sacó de git (`git rm --cached`), se agregó a `.gitignore`. La carpeta sigue en el disco. **Falta limpiar el historial antes de subir la rama** (punto 4). |
| 3 | Alta | Lectura de la foto (OCR): «201 2240 6» se leía como **224** huevos y sin cajas; las cajas que no se leían se inventaban (÷360); fechas imposibles (45/13) se cargaban. | Expresión corregida, cajas vacías si no se leen, fechas validadas. 4 pruebas nuevas. |
| 4 | Alta | Cantidades con punto de miles («2.240») se sumaban como 2,24. | Se interpretan como en el papel; se guardan números, no texto. |
| 5 | Alta | El menú propio del operario de recepción **eliminaba** Supervisión (sus rondas obligatorias), Mi historial, Cargue, Misionales y Cumplimiento. | Su lista va primero y debajo sigue todo lo demás que su perfil permite. |
| 6 | Alta | Botón «Cargar datos ejemplo» llenaba la remisión 4854 con **nombres reales** y se podía guardar como si hubiera llegado. | Botón y datos de ejemplo eliminados; la imagen de referencia se conserva. |
| 7 | Media | Si la foto no subía, el mensaje igual decía «guardada con foto de evidencia». | Aviso honesto; si falla el registro se borra la foto subida. Se exige número de remisión y huevo incubable. |
| 8 | Media | Perfil: se mostraba el cambio antes de guardar y, si el servidor lo rechazaba, quedaba el dato falso en pantalla y en la caché. También usaba `profiles.updated_at`, que no se puede confirmar en el servidor (si no existe, nadie podría guardar su perfil). | Se revierte al dato anterior si falla y se reintenta sin `updated_at`. |
| 9 | Baja | Las subpantallas de recepción no recibían `onNavigate`: sus enlaces «ir a…» no hacían nada. Variables sin uso y escapes de regex de sobra. | Corregido; lint limpio. |
| 10 | Baja | Imagen de referencia duplicada (`public/assets/…`, 894 KB) sin uso. | Eliminada. |
| — | Aviso | El OCR (Tesseract) descarga el idioma español de internet la primera vez: sin internet no lee la foto (el formulario sigue funcionando a mano). | Documentado; opcional alojar el idioma en el servidor local. |

Lo que estaba bien y se conserva: protección del nombre en el registro, edición/cancelación del perfil, nombre actualizado en la entrada sin conexión, captura con cámara/galería, vista en tarjetas para celular, lista ampliable de la foto y los estilos móviles.

## 3. Lo nuevo que se construyó

### Líder de planta: SIG Producción y SIG Mantenimiento por separado
En «Hoy» hay dos botones y la app recuerda el último elegido.
- **SIG Producción**, en orden: decisiones del turno → equipo y plan del día → **proyección broiler** → acceso rápido → planta 3D y actividad de producción (rondas, actividades, cargues, transferencias) → evidencias de producción.
- **SIG Mantenimiento**, en orden: estado de máquinas y OT activas → herramientas (OT, Plan AM, calibraciones, Equipo y sedes) → OT recientes y evidencias de mantenimiento → Centro de Activos.
- El líder de planta ahora también tiene **Plan AM** y **Equipo y sedes**.

### Proyección broiler automática (PC y celular)
Pestaña «Proyección broiler» (líder de planta, líder de producción y gerencia) y dentro del SIG Producción.
- Ciclo por cada cargue: transferencia día 18, nacimiento día 21. Huevos del nacimiento → del mapa de cargue de esa incubadora → de las posturas del lote.
- Pollitos = estimado del supervisor o huevos × **tasa real** de la planta (nacimientos cerrados de 90 días; descarta registros con más pollitos que huevos). Solo sin historia usa la referencia de 83 % y lo avisa. Al cerrar el nacimiento manda el dato real.
- Indicadores 7/21 días, gráfico por día (proyectado vs. real), tabla en PC y tarjetas en celular, real contra estimado, exportación a Excel. Se actualiza solo con cada cargue, transferencia o nacimiento.

### Líder de mantenimiento: «Equipo y sedes»
- Asigna la **sede** de cada auxiliar (y con ella su Plan AM). Respeta la jerarquía de la base (`incubapp_set_member_site`).
- **Crea OT o actividades en cualquier sede** y las asigna a un auxiliar o a sí mismo; reparte las OT sin asignar.
- **Mis trabajos**: «Atender» pone la OT en ejecución y reporta su lugar de trabajo solo; «Cerrar» lleva al cierre con evidencias.
- **Dónde está cada uno**, en vivo: OT que ejecuta, último lugar reportado o traslado misional (origen → destino).
- El auxiliar también reporta «📍 Estoy aquí» desde su inicio y ve su sede asignada.

### Traslado misional → SST y jefe
Al guardar la inspección de Misionales: queda una fila «en traslado» (origen → destino) que ve el jefe, y llega a la campana de **SST**, líderes, supervisión y gerencia como «Traslado misional» (con ⚠ si el vehículo no es apto). SST y los líderes ahora ven todas las inspecciones en «⚙ Admin».

Migración: `20261012_equipo_mantenimiento_traslados.sql` (tabla `team_locations`, función de sede y tiempo real).

### Manuales e instructivos dentro de la app
Pestaña «Manuales e instructivos» para **todos los perfiles**: cada uno ve primero su paso a paso (con botón «Abrir» a la pantalla), buscador, impresión, y el manual completo de Kevin en PDF y web (`/manuales/`). Instructivos: primeros pasos, líder de planta, proyección broiler, líder y auxiliar de mantenimiento, recepción, operario, SST, producción, gerencia y conductor.

## 4. Pendiente antes de publicar

1. **Limpiar el historial del commit `1c1430f`**: aunque la carpeta ya no está en la rama, el commit de Kevin la contiene. Si se sube así a GitHub, el código privado queda público en el historial. Hay que reescribir ese commit (solo existe en este equipo) antes de hacer push.
2. **Aplicar migraciones** en el servidor local con `7-ACTUALIZAR-APP` (ya están en `migraciones.txt`). Sin ellas la remisión no guarda y «Equipo y sedes» avisa que falta la migración.
3. **Unir a `produccion-local`**: esta rama va 114 commits por delante de la versión en producción; conviene probarla con usuarios reales antes de pasarla.
4. Probar con un usuario real de cada perfil (aquí se probó con datos simulados: no había credenciales de prueba).

## 5. Estado por área

El estado sale de revisar el código, los permisos y las pruebas automáticas de cada módulo; no de una prueba en campo con cada perfil.

| Área | Estado | Funciona | Pendiente |
|---|---|---|---|
| **Planta (líder)** | 🟢 Operativa | Inicio con SIG Producción/Mantenimiento separados, decisiones, equipo, plan del día, proyección broiler, mapas 2D/3D, Centro de Activos | Validar la proyección contra los nacimientos reales de las próximas semanas |
| **Producción / calidad** | 🟢 Operativa | Inicio propio, formatos de calidad, vacunación, proyección broiler | — |
| **Recepción** | 🟡 Parcial | Certificar envíos, llegada a planta, cuarto frío, clasificación, **remisión galpón** (tras la migración) | 8 pantallas en construcción: rotación, encintar, marcar carros, liquidar cargues, auditoría de huevos, autorizar datos, solicitudes, reportes |
| **Supervisión / turno** | 🟢 Operativa | Inicio «qué me toca», rondas con Alerta/Falla/Apagada y pedir OT, calibración, cargue, historial | — |
| **Mantenimiento** | 🟢 Operativa | OT, Plan AM con instructivos, calibraciones, indicadores, **Equipo y sedes**, lugar de trabajo | Aplicar la migración 20261012 |
| **SST** | 🟢 Operativa | Registros SST, espacios confinados, preoperacional FOSST22, **traslados misionales con aviso** | — |
| **Gestión ambiental** | 🟢 Operativa | Registros, sensores, residuos y vencimientos | — |
| **Logística / conductores** | 🟢 Operativa | Remisiones, despacho, preoperacional | — |
| **Ventas** | 🟢 Operativa | Pedidos, disponibilidad por nacimiento, cruce contable | Podría usar la proyección broiler para la disponibilidad |
| **Contabilidad** | 🟢 Operativa | Integración Siesa, exportes | — |
| **Sanidad veterinaria / granja** | 🟢 Operativa | Inicio del líder de granja con su sede, vacunación, Plan AM de granja | — |
| **Gerencia** | 🟢 Operativa | «La empresa hoy», informes, proyección broiler | — |
| **RR. HH.** | 🟠 En desarrollo | Inicio del líder y cobertura | Módulo marcado «en desarrollo» |
| **IoT y bioseguridad** | 🟠 En desarrollo | Tablero base | Módulo marcado «en desarrollo» |
| **Misionales** | 🟢 Operativa | Inspección, consolidados, aviso a SST y jefe | Código fuente original fuera de IncubApp (privado) |
| **Manuales** | 🟢 Nuevo | En la app para todos los perfiles | Actualizar el PDF de Kevin con las funciones de esta entrega |
