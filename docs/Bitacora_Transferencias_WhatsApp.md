# Bitácora — Importación de transferencias del WhatsApp a IncubApp

**Autor:** Henry Taborda — Ing. en desarrollo de software
**Fecha:** 06-10-2026
**Módulo afectado:** Planta → Supervisión → Transferencia / Nacimiento (tabla `public.transfers`)
**Migración:** `supabase/migrations/20261006_transferencias_whatsapp.sql`
**Reporte del cruce:** [Cruce_Transferencias_WhatsApp.md](./Cruce_Transferencias_WhatsApp.md)

Esta bitácora explica qué se hizo, en qué orden, qué errores salieron y cómo se resolvieron, para que cualquier persona pueda dar soporte sin depender de quien lo construyó.

---

## 1. Objetivo

Planta reportó por el grupo de WhatsApp «Transferencias» (13-07-2026 a 05-10-2026) cada vez que pasó una incubadora a un salón de nacedoras. Esos datos no estaban en la app. El objetivo fue:

1. Pasar cada transferencia del chat a la app, donde debe estar (`public.transfers`), con incubadora de origen, nacedoras en orden, lotes y carros.
2. Cruzarla con la información real (mapas de cargue y cargues de la base) para corregir errores del chat.
3. Dejar el estado de las incubadoras al día: que la app muestre como pendientes solo las que de verdad tienen huevo.

## 2. Fuentes usadas

| Fuente | Qué aporta | Dónde está |
|---|---|---|
| Exportación del chat «Transferencias» (.zip) | 92 mensajes de transferencia, 2 pantallazos, 1 nota de voz | No se sube al repositorio (contiene nombres y teléfonos del personal). Su transcripción está en `scripts/transferencias_whatsapp/datos/transferencias_reportadas.mjs` con el texto original de cada mensaje. |
| Mapas de cargue reales de septiembre | Incubadora, hora de cargue, inicio de ciclo, carros y lotes de 24 cargues | `scripts/september_load_maps_raw.json` (exportación UTF-16 de `load_maps`) |
| Pantallazo de la app del 13-07-2026 | Lotes e inicio de ciclo de varias incubadoras en julio | Usado como evidencia de la corrección INC-05 → INC-03 |
| Cargues de la base (`setter_loads`) | Lotes, lote de aves (batch) e inicio de ciclo de todo el periodo | Se consultan al aplicar la migración en el servidor |
| Máquinas reales | Códigos INC-01…24 y NAC-01…12, salón de cada nacedora | `.respaldo/machines-2026-08-24.json` y la tabla `machines` |

La nota de voz (13-07) y el archivo multimedia del 21-08 no vienen legibles en la exportación; no se usaron.

## 3. Acciones, en orden

1. **Ubicar la app.** El repositorio es `HenryStark866/IncubApp`, rama `main`. El servidor (PC de la oficina) se actualiza con `servidor-local/7-ACTUALIZAR-APP.bat`, que trae `main`, reconstruye el contenedor y aplica las migraciones listadas en `servidor-local/migraciones.txt`. Por eso los datos se entregan como migración SQL.
2. **Transcribir el chat.** Cada mensaje se pasó a un registro con: hora del mensaje, quién lo envió, incubadora, salón, nacedoras en el orden en que las nombró y lotes con carros (`44x3` = 3 carros del lote 44). Se dejó el texto original en cada registro.
3. **Reglas de la planta aplicadas.** Salón 1 = NAC 1-3, salón 2 = NAC 4-6, salón 3 = NAC 7-9, salón 4 = NAC 10-12. «Todo LT 44» = las tres nacedoras del salón con el lote 44. Un carro = 16 bandejas.
4. **Mensajes atrasados.** Cuando el mensaje dice «la del lunes», «la del martes» o «la del miércoles», se registró ese día a las 06:00 (casos del 27-07, 18-08, 09-09 y 14-09).
5. **Cruce con los mapas de cargue reales** (`principal.mjs`). Para cada transferencia se busca el mapa de la misma incubadora con inicio de ciclo 15 a 23 días antes, se comparan los lotes y se buscan recargues de esa incubadora anteriores a la hora del reporte.
6. **Revisión del ritmo de cada incubadora.** Entre dos transferencias de la misma máquina debe pasar un ciclo completo (19 a 26 días). Menos de 16 es imposible; más de 30 indica una transferencia sin reportar.
7. **Correcciones** (detalle en la sección 5).
8. **Generación de la migración** con los datos ya corregidos, más un segundo cruce contra `setter_loads` que se hace en el servidor al aplicarla.
9. **Prueba en un PostgreSQL local** con las máquinas y los cargues reales: se aplicó dos veces para confirmar que la segunda corrida no duplica nada, y se calculó con el código de la app (`pendingSetters`) qué incubadoras quedan pendientes.
10. **Ajustes en la app** para que el histórico importado no ensucie las pantallas (sección 6).
11. **Pruebas automáticas, lint y compilación** antes del commit.

## 4. Resultado

- **91 transferencias** registradas (92 mensajes; uno era la misma transferencia reportada dos veces).
- En la prueba con datos reales: 90 nuevas y 1 detectada como ya registrada en la app (la INC-05 del 03-10), sin duplicar.
- Tras la importación, la app deja como pendientes de transferir solo las incubadoras que de verdad tienen huevo: **INC-04, INC-06, INC-08, INC-17, INC-20 e INC-11**.
- **INC-04** (lotes 45, 46, 47; inicio de ciclo 16-09) llevaba 19,6 días el 06-10 y no tiene transferencia reportada: hay que confirmar con planta si ya salió.

## 5. Errores encontrados en los datos y su solución

| # | Error | Evidencia | Solución aplicada |
|---|---|---|---|
| 1 | El 05-10, Juan Alejandro reporta «incubadora #11» al salón 1 | La INC-11 se cargó el 21-09: el 05-10 llevaba 14 días. La INC-01 (cargada el 16-09, 18,8 días) tiene exactamente los lotes 43, 44 y 45 reportados. | Se registra como **INC-01** (confianza alta). |
| 2 | Don Jhon reporta la «incubadora 5» el lunes 27-07 | La INC-05 ya se había transferido el 19-07 (8 días antes). La INC-03 no aparece en julio, su ciclo del 17-06 (pantallazo) cuadra, y sigue el ritmo 18-08 → 08-09 → 30-09. | Se registra como **INC-03** (confianza media). |
| 3 | El 05-08, Ferney no escribe el número de la incubadora | La INC-07 va al salón 2 el 15-07, el 26-08 y el 16-09; le falta justo una hacia el 05-08 y sale en pareja con la 11, igual que el 15-07. | Se registra como **INC-07** (confianza media). |
| 4 | La INC-09 → salón 1 se reportó dos veces (31-07 13:39 y 01-08 05:59) | Mismos lotes por nacedora. | Una sola transferencia, con la hora del primer reporte y los carros del segundo. |
| 5 | La INC-12 del miércoles 09-09 no trae lote | Natalia pidió «la del lote 46 y 47»; la 16 fue toda 46. | Lote 47. Si la base tiene el cargue de la INC-12 de ese ciclo, la migración usa el lote de la base. |
| 6 | INC-04 (20-09), INC-08 (19-09) e INC-06 (19-09) se reportaron después de que la máquina ya se había vuelto a cargar (16-09 y 17-09) | Mapas de cargue con hora de cargue anterior al reporte. | La hora se ajusta a una hora antes del recargue. Si no, la app tomaría el huevo nuevo como transferido. La migración repite esta revisión con `setter_loads`. |
| 7 | Tres parejas de incubadoras tienen los lotes cruzados entre el chat y los mapas: **INC-15/INC-21** (27-09), **INC-24/INC-10** (27-09) e **INC-16/INC-12** (30-09) | En cada pareja ambas máquinas tienen el mismo inicio de ciclo, y sus mapas fueron «regularizados» el 15-09 deduciendo la máquina por el contador de la pantalla. Con dos contadores iguales esa deducción no distingue cuál es cuál. Las dos parejas del mismo método con días distintos (22/13 y 14/2) sí coinciden. | Se respeta la incubadora que leyó el operario en planta y se deja la observación en la transferencia y en el reporte. **Pendiente:** confirmar con planta y, si se confirma, intercambiar la incubadora de esos 6 mapas de cargue. No se tocaron los mapas automáticamente. |
| 8 | Falta la transferencia del sábado 08-08 | Natalia lo pidió el 21-08; la respuesta fue un archivo multimedia que no viene en la exportación. Por ritmo, ese día debieron salir la INC-05 y la INC-20 (34 y 41 días entre sus transferencias del 19-07 y las siguientes). | No se registró: sin salón ni lotes no se puede hacer con seguridad. Pendiente de que planta la confirme. |
| 9 | INC-03 (30-09) reporta lote 46, que no está en su mapa (45 y 47) | Diferencia menor: un carro mal anotado. | Se registra lo reportado con la observación. |

## 6. Cambios en la app

| Archivo | Cambio | Por qué |
|---|---|---|
| `src/lib/transferenciasPorNacer.js` (nuevo) | «Listas para nacimiento» muestra solo transferencias de los últimos 6 días sin nacimiento. | Sin esto, las más de 80 transferencias históricas aparecerían como nacimientos pendientes. |
| `src/lib/origenTransferencia.js` (nuevo) | Reconoce las transferencias importadas, muestra «💬 WhatsApp · quien reportó» y oculta el botón de foto (no hay foto). | Para que se distingan de las registradas en la app. |
| `src/lib/transferenciasDeLaIncubadora.js` (nuevo) | El estado de cada incubadora cierra el cargue también por incubadora de origen, no solo por el texto del lote. | El lote del cargue («43 y 44») y el de la transferencia («43 + 44») casi nunca son el mismo texto. |
| `src/lib/machineOpsState.js`, `src/hooks/useMachineStateSync.js` | Usan lo anterior y traen `source_machine_id`. | Ídem. |
| `src/components/SupervisionPanel.jsx` | Usa los dos primeros ayudantes. | Ídem. |
| `public.transfers.origen` (columna nueva, `jsonb`) | Clave de importación, quién reportó, texto original, corrección y cruce. `NULL` en las registradas en la app. | Trazabilidad, y que la migración no duplique si se vuelve a correr. |
| `incubapp_ops.cruce_transferencias_whatsapp` (tabla nueva) | Resultado del cruce en el servidor, una fila por transferencia. | Soporte: ver qué pasó con cada una sin leer el código. |

## 7. Errores técnicos durante el desarrollo y su solución

| Error | Causa | Solución |
|---|---|---|
| `scripts/september_load_maps_raw_utf8.json` vacío; `JSON.parse` falla sobre el original | La exportación está en UTF-16 LE con BOM (PowerShell) y la copia UTF-8 quedó vacía. | `leerMapasDeCargue.mjs` detecta el BOM `FF FE` y decodifica `utf16le`. |
| `initdb: could not access directory … Permission denied` al montar el PostgreSQL de prueba | El usuario `postgres`/`claude` no tenía acceso a la carpeta temporal. | Base de prueba en una carpeta propia (`/home/claude/pgtest`). |
| `Array value must start with "{"` en `v_obs := v_obs \|\| 'texto'` | PostgreSQL toma el literal como arreglo al concatenarlo con `text[]`. | `array_append(v_obs, 'texto')`. |
| Los candidatos de «incubadoras cruzadas» salían con 3 o 4 máquinas | La ventana de 15-23 días junta cargues de varios días. | Solo se comparan incubadoras cargadas el mismo día (±1,5 días). Así sale exactamente la pareja. |
| En una segunda corrida el reporte perdía las observaciones | Las ya importadas sobrescribían su fila con el estado `ya_importada`. | `CONTINUE WHEN v_estado = 'ya_importada'`: su fila se deja como quedó. |
| Las de hora ajustada salían como «antes de septiembre» en el reporte | Tras ajustar la hora quedan antes del primer mapa exportado. | El reporte las marca como «🟠 hora ajustada». |
| Riesgo: una columna `NOT NULL` desconocida en producción haría fallar la inserción | No se tiene el esquema exacto de producción en el repo. | `photo_path` y `created_by` se resuelven según el esquema real. Cada inserción captura su error. Si alguna falla, la migración se revierte entera con el mensaje del primer error y se reintenta en la siguiente actualización (no queda a medias ni marcada como aplicada). |

## 8. Cómo dar soporte

**Ver el resultado en el servidor** (Ubuntu/WSL del PC de la oficina):

```bash
docker exec -it supabase-db psql -U supabase_admin -d postgres -c \
  "SELECT clave, incubadora, salon, transferido_en, lotes_chat, lotes_bd, estado, observaciones
     FROM incubapp_ops.cruce_transferencias_whatsapp ORDER BY transferido_en;"
```

**Corregir un dato** (por ejemplo, planta confirma la transferencia del 08-08):

1. Editar `scripts/transferencias_whatsapp/datos/transferencias_reportadas.mjs` (agregar o corregir el registro, con su `texto` y, si aplica, `correccion`).
2. `node scripts/transferencias_whatsapp/principal.mjs` (regenera la migración y el reporte).
3. `npx vitest run scripts/transferencias_whatsapp` (pruebas).
4. Como la migración ya quedó aplicada en el servidor, el cambio se entrega en una migración nueva (por ejemplo `20261010_transferencias_whatsapp_2.sql`) copiando el archivo generado y agregándola al final de `servidor-local/migraciones.txt`. Las transferencias ya importadas no se duplican porque se saltan por `origen->>'clave'`.

**Deshacer la importación** (solo si se decide):

```sql
DELETE FROM public.transfers WHERE origen->>'fuente' = 'whatsapp:Transferencias';
```

**Probar la migración en local antes de subirla:** ver el encabezado de `scripts/transferencias_whatsapp/pruebas/generarBaseDePrueba.mjs`.

## 9. Pendientes para planta / coordinación

1. Confirmar las tres parejas cruzadas (INC-15/21, INC-24/10, INC-16/12) y, si el operario tenía razón, corregir la incubadora de esos mapas de cargue.
2. Reportar la transferencia del sábado 08-08 (probablemente INC-05 e INC-20).
3. Confirmar el estado de la INC-04 (ya cumplía días el 06-10).
4. De aquí en adelante, registrar cada transferencia en la app (Supervisión → Transferencia) y no solo en el WhatsApp.

## 10. Corrección del tipo de huevo en el mapa de cargue (06-10-2026)

**Error encontrado:** el informe de nacimiento de las salas 3 y 4 del 06-10-2026 se armó con los mapas de cargue, y ahí se vio que IncubApp interpretaba el tipo de huevo 1 a 5 como tamaño (5 = huevo más grande, el que más calor da). Planta (David, Incubant) aclaró que **en Incubant el tipo es la edad del lote: 1 y 2 = lotes viejos, 5 = lote muy joven**. El huevo de lote viejo es el más grande, así que el modelo de calor del mapa ubicaba los carros con el criterio al revés.

**Solución aplicada:**

| Archivo | Cambio |
|---|---|
| `src/lib/tipoHuevo.js` (nuevo) | Define la edad por tipo y el tamaño relativo invertido (tipo 1 = 1, tipo 5 = 0). |
| `src/lib/loadMapEngine.js` | El factor «Tamaño de huevo (por edad del lote)» usa `tamanoRelativoPorTipo()`. |
| `src/components/LoadClassificationWorkspace.jsx` | La clasificación muestra «Tipo 1 · viejo» … «Tipo 5 · muy joven», con una ayuda de qué significa cada número. |
| `src/lib/incubationKnowledge.js` | El asesor explica el tipo como edad del lote. |
| `src/lib/__tests__/heatScore.test.js`, `tipoHuevo.test.js` | Pruebas con el significado correcto. |

**Alcance:** aplica a los mapas de cargue nuevos. Los mapas ya cerrados guardaron su puntaje de calor y no se recalculan. No hay migración de base de datos.

## 11. Exportador de un ciclo para análisis (06-10-2026)

Para analizar la baja de nacimiento del 06-10 hacían falta las rondas, lecturas, OTs y alarmas de las máquinas del ciclo, que solo están en la base del servidor de la oficina (no se alcanzan desde fuera). Se agregó `servidor-local/14-EXPORTAR-CICLO.bat` (→ `14-exportar-ciclo.ps1` → `exportar-ciclo.sh`):

- **Solo lee** la base. Exporta en un JSON: máquinas, salas, rondas con lecturas, lecturas del bot, OTs, calibraciones, cargues, mapas de cargue, transferencias, nacimientos y actividades de turno. Las fotos no van, solo su ruta.
- Por defecto exporta INC-05, INC-23 y NAC-07 a NAC-12 del 12-09 al 06-10-2026. Para otras máquinas o fechas: `exportar-ciclo.sh "INC-01,NAC-01" 2026-09-01 2026-09-30`.
- Si una tabla no existe en el servidor, esa parte sale como `no_disponible` y el resto se exporta igual.
- El archivo queda en `servidor-local/exportes/`, que está excluido de git porque son datos de planta.
- Se probó contra un PostgreSQL local con tablas parciales.

## 12. Análisis del ciclo exportado y verificación del servidor (06-10-2026)

**Hallazgos en el archivo `ciclo_2026-09-12_2026-10-06.json` (INC-05, INC-23, NAC-07 a NAC-12):**

| # | Hallazgo | Consecuencia |
|---|---|---|
| 1 | **0 transferencias** en la base para esas máquinas y salas. | La migración `20261006_transferencias_whatsapp.sql` no quedó aplicada: o no se corrió `7-ACTUALIZAR-APP.bat` completo, o falló. Se verifica con el script 15. |
| 2 | Las rondas de la INC-05 y la INC-23 **no tienen lecturas del día 0 al 12 del ciclo** (15 al 27-09). Del 24 al 26-09 no hay ninguna ronda. Hay lecturas solo desde el 27-09, cuando empezó el bot de lecturas. | No se puede comprobar con datos qué pasó en la primera mitad de la incubación. |
| 3 | Días 13 a 18: OvoScan 99,3 a 100,1 °F y aire 97,2 a 98,5 °F, estables. Sin alarmas. Volteo avanzando. | No hay señal de sobrecalentamiento en las incubadoras al final del ciclo. |
| 4 | **INC-23 sin calibración en este ciclo**: su OT de ventana (OT-00103) se anuló por vencida. La INC-05 sí se calibró el 17-09 (Δ 0). | Falla de proceso: la máquina corrió sin verificación de sensores. |
| 5 | **Calibración antes de transferencia no hecha** en 5 de las 6 nacedoras que recibieron este huevo. Las OTs del 02-10 de NAC-09, 10, 11 y 12 siguen abiertas. La NAC-07 se calibró el 03-10 18:33, después de recibir el huevo. La **NAC-11 no se calibra desde antes del 16-09**. | Se recibió huevo en nacedoras sin verificar. Cuando se calibraron, los desvíos fueron pequeños (≤ 0,3 °F y ≤ 1,3 % HR). |
| 6 | Nacedoras sin rondas entre la transferencia y el día siguiente: sala 3 de 03-10 07:55 a 04-10 06:06, sala 4 hasta 04-10 06:07. | Primeras 17 a 22 horas en nacedora sin vigilancia registrada. |
| 7 | Rondas con datos imposibles: el 04-10 22:10 la INC-05 (vacía) aparece con lecturas de máquina cargada. El 06-10 06:16 el aire de la INC-05 es 88,5 °F (humedad leída como temperatura). | Fotos asignadas a la máquina equivocada o mal leídas. Afecta la confianza en los registros SIG. |
| 8 | **Cargue de la INC-05 del 14-09 con inicio de ciclo 01-10** (real: 14-09 22:05). Además, cada máquina tiene el cargue del 14-09 registrado dos veces. | Corregido con `20261006_corregir_inicio_ciclo_inc05.sql`. Los duplicados se dejan para revisión de planta. |
| 9 | **Cargues nuevos del 05-10:** INC-05 con inicio de ciclo 5 h 45 min **antes** del cargue e INC-23 con 20 h 45 min **antes**. Por el volteo, ambas arrancaron cerca de las 22:00 del 05-10. | La app les calcula más edad de la real (ventanas de calibración y transferencia adelantadas). Corregir con el contador de la pantalla en Corrección de datos. |
| 10 | 10 OTs de calibración de estas máquinas desde el 26-09 con código **`OT-#####`**. | Sucede cuando el número no cabe en el formato del código (`to_char` desborda). El generador vive en la base; el script 15 lo extrae para corregirlo. |

**Script agregado:** `servidor-local/15-VERIFICAR-SERVIDOR.bat`. Es de solo lectura y muestra:
- la versión del código y las últimas líneas del registro de actualización;
- las migraciones pendientes;
- el resultado de la importación del WhatsApp;
- los inicios de ciclo dudosos;
- las OTs con código dañado y la función que arma el código.

El resultado queda en `servidor-local/exportes/verificacion_*.txt`.

## 13. Primera aplicación en el servidor: error y corrección (06-10-2026)

| Error (registro de 7-ACTUALIZAR, 13:55) | Causa | Solución |
|---|---|---|
| `column "mode" is of type hatch_scale but expression is of type text`: las 90 transferencias fallaron y la migración se revirtió completa, sin quedar a medias. | En el servidor, `transfers.mode` es un tipo propio (`hatch_scale`), no texto. La prueba local usaba texto. | La inserción lee el tipo real de la columna y convierte el valor (`EXECUTE … $5::<tipo>`). Probada con el enum en PostgreSQL local. |
| El script 15 decía «Todas aplicadas» aunque la migración había fallado. | `docker exec -i` leía el resto de `migraciones.txt` como su propia entrada. | La consulta lee de `</dev/null`. |
| 29 OTs con código `OT-#####` desde el 23-09. | `work_order_defaults()` usa `to_char(n, 'FM00000')`; el contador pasó de 99.999 y `to_char` desborda. | `20261006_codigos_ot.sql`: la función usa 5 cifras mientras quepa y nunca repite un código. El contador vuelve al mayor OT-NNNNN real + 1. Las OTs dañadas reciben código nuevo en orden de creación, con nota en `regularization_note`. |

La prueba local se armó con el esquema real del servidor: `mode` como enum y un contador en 150.000. Las tres migraciones del 06-10 se aplicaron dos veces cada una; la segunda vez no cambiaron nada.
