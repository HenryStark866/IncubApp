# Plan AM y manuales de G-GRANJA LA FE: v06 aprobado

El Área de Mantenimiento aprobó el contenido el 2026-10-06. Ya está cargado en IncubApp y en el PRGMAT01 oficial (v06). Falta la firma física de la portada y de cada manual.

## Granja
- **Producción** (equipos Big Herdsman): módulos 2, 3 y 4, con 4 galpones cada uno (G201–G204, G301–G304, G401–G404).
- **Levante**: módulos 1 y 5, con 6 galpones cada uno (G101–G106, G501–G506).
- **Servicios**: tableros eléctricos, motobombas, 11 tanques de agua, chumaceras, silos, planta eléctrica y ATS.

## Quién usa qué en la app
| Persona | Rol | Qué ve |
|---|---|---|
| Dario León Villada | Líder de granja (sede G-GRANJA LA FE) | Inicio de la granja con su equipo, menú ☰ con sus herramientas y «Plan AM y manuales». No ve la planta ni otras sedes. |
| Jorge Arley Vázquez Araque, Johan Daniel Orrego Flórez | Auxiliares de mantenimiento (sede G-GRANJA LA FE) | Su inicio abre en las tareas de La Fe para ejecutarlas con lista de chequeo y evidencias. También tienen «Plan AM y manuales». |

## Contenido
| Archivo | Qué es |
|---|---|
| `Manuales/MAN-LF-01` … `MAN-LF-06` | Manuales de operación y mantenimiento: banda de huevo, nidos, alimentación, agua y antipercheo, iluminación, y el MAN-LF-06 de tableros, motobombas, tanques y chumaceras. |
| `PRGMAT01 06.2 Plan AM Granja La Fe (v06 aprobado).xlsx` | El plan con 58 actividades (LF-100 a LF-221), las indicaciones, el cronograma de 52 semanas, la carga de trabajo, la hoja LEVANTAMIENTO LF-100 y los pendientes con su estado. |
| `Indicaciones de cada actividad - Plan AM Granja La Fe.docx` | Una ficha por actividad: los 6 pasos del PROMAT01, los pasos técnicos, la seguridad y las herramientas. |
| `Carta solicitud manuales Big Herdsman.docx` | Solicitud del manual original al fabricante, en español y en inglés. Está lista para enviar. |
| `datos/plan_am_la_fe.json` | Las tareas en el formato del plan de la app. |
| `_generador/` | `generar.py` produce los documentos. `actualizar_prgmat01.py --solo-app` recarga las tareas en la app. |

## Lo que queda en campo
- **Tarea LF-100 (semanas 42-43):** levantar las placas de los motores, las chumaceras, los silos, las motobombas, los tableros generales, la planta, el ATS y el equipo de levante. Se hace con la hoja LEVANTAMIENTO LF-100.
- **Firmas** de aprobación.
