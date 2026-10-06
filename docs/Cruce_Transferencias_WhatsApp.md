# Cruce de transferencias del WhatsApp con la información real

**Autor:** Henry Taborda — Ing. en desarrollo de software · **Generado:** 2026-10-06 · **Herramienta:** `node scripts/transferencias_whatsapp/principal.mjs`

> Documento generado automáticamente. Para cambiar algo se corrigen los datos en
> `scripts/transferencias_whatsapp/datos/transferencias_reportadas.mjs` y se vuelve a generar.
> La explicación paso a paso, errores y soluciones están en `docs/Bitacora_Transferencias_WhatsApp.md`.

## Resumen

- Transferencias registradas desde el chat: **91** (13-07-2026 a 05-10-2026).
- Con mapa de cargue real para comparar (septiembre-octubre): **17** → — sin mapa del ciclo: 1 · ✅ coincide: 10 · 🟡 parcial: 2 · 🔴 no coincide: 4
- Correcciones hechas al transcribir: **5**.
- Horas ajustadas porque la incubadora se recargó antes del reporte: **3**.

## Transferencias que nunca se reportaron

- **2026-08-08:** Natalia (21-08): «falta la del sábado 8… que fue sábado para nacer martes». Juan Carlos respondió con un archivo multimedia que no viene en la exportación del chat. Por el ritmo de las máquinas, ese sábado debieron salir la INC-05 y la INC-20 (ambas se transfirieron el 19-07 y no vuelven a aparecer hasta el 22-08 y el 29-08). Sin salón ni lotes no se puede registrar con seguridad: queda pendiente de que planta la confirme.
- **INC-05:** pasan 34.3 días entre la transferencia del 19/07/2026, 05:57 y la del 22/08/2026, 12:46; le falta una en medio (ciclo sin reportar).
- **INC-20:** pasan 41 días entre la transferencia del 19/07/2026, 05:58 y la del 29/08/2026, 05:45; le falta una en medio (ciclo sin reportar).

## Cargues reales que aún no tienen transferencia (corte: hoy)

| Incubadora | Inicio de ciclo | Lotes | Días | Estado |
|---|---|---|---|---|
| INC-04 | 16/09/2026, 22:00 | 45, 46, 47 | 19.6 | ⚠️ ya debía transferirse |
| INC-06 | 17/09/2026, 22:00 | 43, 44, 46 | 18.6 | incubando |
| INC-08 | 17/09/2026, 22:00 | 45, 46, 47, 48 | 18.6 | incubando |
| INC-20 | 20/09/2026, 22:00 | 213, 215, 44 | 15.6 | incubando |
| INC-17 | 20/09/2026, 21:07 | 43, 44, 45 | 15.7 | incubando |
| INC-11 | 21/09/2026, 22:00 | 43, 44, 45, 46, 47 | 14.6 | incubando |

## Detalle de todas las transferencias

| # | Fecha registrada | Incubadora | Salón → nacedoras (lotes) | Reportó | Cruce con mapa | Notas |
|---|---|---|---|---|---|---|
| 1 | 14/07/2026, 05:06 | INC-08 | S1 → N01: 44×3/43×1 · N02: 41×3/44×1 · N03: 41 | Ferney (turnero) | — (antes de septiembre) |  |
| 2 | 14/07/2026, 05:09 | INC-01 | S3 → N07: 45 · N08: 44×3/45×1 · N09: 44 | Ferney (turnero) | — (antes de septiembre) |  |
| 3 | 15/07/2026, 06:01 | INC-07 | S2 → N04: 42 · N05: 46 · N06: 42 | Juan Alejandro | — (antes de septiembre) |  |
| 4 | 15/07/2026, 06:01 | INC-11 | S4 → N10: 43 · N11: 43 · N12: 43 | Juan Alejandro | — (antes de septiembre) |  |
| 5 | 17/07/2026, 22:11 | INC-06 | S1 → N01: 42 · N02: 41 · N03: 42/41 | Juan Carlos Suaza | — (antes de septiembre) |  |
| 6 | 19/07/2026, 05:57 | INC-05 | S2 → N04: 44 · N05: 44 · N06: 44 | Ferney (turnero) | — (antes de septiembre) |  |
| 7 | 19/07/2026, 05:58 | INC-20 | S4 → N10: 45 · N11: 45 · N12: 45 | Ferney (turnero) | — (antes de septiembre) |  |
| 8 | 21/07/2026, 05:51 | INC-13 | S1 → N01: 41 · N02: 42 · N03: 41×2/42×2 | Ferney (turnero) | — (antes de septiembre) |  |
| 9 | 21/07/2026, 05:51 | INC-14 | S3 → N07: 46 · N08: 46 · N09: 46 | Ferney (turnero) | — (antes de septiembre) |  |
| 10 | 22/07/2026, 05:54 | INC-22 | S4 → N10: 42×3/43×1 · N11: 43 · N12: 43 | Ferney (turnero) | — (antes de septiembre) |  |
| 11 | 22/07/2026, 05:59 | INC-02 | S2 → N04: 45 · N05: 44×2/45×2 · N06: 45×2/44×2 | Ferney (turnero) | — (antes de septiembre) |  |
| 12 | 25/07/2026, 06:00 | INC-10 | S1 → N01: 45×2/46×2 · N02: 46 · N03: 46 | Ferney (turnero) | — (antes de septiembre) |  |
| 13 | 25/07/2026, 06:01 | INC-15 | S3 → N07: 45 · N08: 46 · N09: 45 | Ferney (turnero) | — (antes de septiembre) |  |
| 14 | 26/07/2026, 14:35 | INC-24 | S2 → N04: 44 · N05: 43 · N06: 44/43 | Juan Carlos Suaza | — (antes de septiembre) |  |
| 15 | 26/07/2026, 14:38 | INC-21 | S4 → N10: 42 · N11: 41 · N12: 41 | Juan Carlos Suaza | — (antes de septiembre) |  |
| 16 | 27/07/2026, 06:00 | INC-03 | S1 → N01: 45 · N02: 46 · N03: 45 | Don Jhon (supervisor) | — (antes de septiembre) | Corrección (incubadora, confianza media): La incubadora 5 ya se había transferido el 19-07 (8 días antes): no pudo tener huevo de 18 días el 27-07. La 3 es la única que encaja: no aparece en julio, su ciclo del 17-06 (pantallazo de la app del 13-07) da transferencia hacia el 06-07 y la siguiente hacia el 27-07, y sigue el ritmo 18-08 → 08-09 → 30-09. — El mensaje se envió días después («la del lunes/martes/miércoles»): se registra ese día a las 06:00 |
| 17 | 27/07/2026, 06:00 | INC-16 | S3 → N07: 45 · N08: 45 · N09: 45 | Don Jhon (supervisor) | — (antes de septiembre) | El mensaje se envió días después («la del lunes/martes/miércoles»): se registra ese día a las 06:00 |
| 18 | 31/07/2026, 13:39 | INC-09 | S1 → N01: 42×2/44×2 · N03: 42 · N02: 44 | CDH Maker IT | — (antes de septiembre) | Corrección (duplicado, confianza alta): Ferney reportó la misma transferencia (incubadora 9 → salón 1, mismos lotes por nacedora) el 01-08 a las 05:59. Se registra una sola vez, con la hora del primer reporte y el detalle de carros del segundo. |
| 19 | 01/08/2026, 06:01 | INC-23 | S3 → N07: 43 · N08: 43 · N09: 43 | Ferney (turnero) | — (antes de septiembre) |  |
| 20 | 01/08/2026, 06:02 | INC-17 | S2 → N04: 46 · N05: 46 · N06: 46 | Ferney (turnero) | — (antes de septiembre) |  |
| 21 | 01/08/2026, 06:04 | INC-18 | S4 → N10: 45 · N11: 45 · N12: 45 | Ferney (turnero) | — (antes de septiembre) |  |
| 22 | 04/08/2026, 06:53 | INC-08 | S1 → N01: 44 · N02: 44 · N03: 44 | Ferney (turnero) | — (antes de septiembre) |  |
| 23 | 04/08/2026, 06:54 | INC-01 | S3 → N07: 44 · N08: 44 · N09: 44 | Ferney (turnero) | — (antes de septiembre) |  |
| 24 | 05/08/2026, 05:54 | INC-07 | S2 → N05: 41 · N06: 42 · N04: 41×3/42×1 | Ferney (turnero) | — (antes de septiembre) | Corrección (incubadora, confianza media): El mensaje no trae el número. La incubadora 7 es la única que falta en ese turno: va al salón 2 el 15-07, el 26-08 y el 16-09 (cada ~21 días) y entre 15-07 y 26-08 le falta una transferencia justo hacia el 05-08; además sale en pareja con la 11 (salón 4) igual que el 15-07. |
| 25 | 05/08/2026, 05:57 | INC-11 | S4 → N10: 43×2/45×2 · N11: 45×3/43×1 · N12: 43×3/45×1 | Ferney (turnero) | — (antes de septiembre) |  |
| 26 | 07/08/2026, 21:38 | INC-06 | S1 → N01: 46 · N02: 46 · N03: 46 | Juan Carlos Suaza | — (antes de septiembre) |  |
| 27 | 07/08/2026, 21:45 | INC-04 | S3 → N07: 45 · N08: 45 · N09: 45 | Juan Carlos Suaza | — (antes de septiembre) |  |
| 28 | 10/08/2026, 15:42 | INC-14 | S4 → N10: 44/46 · N11: 44 · N12: 44 | CDH Maker IT | — (antes de septiembre) |  |
| 29 | 10/08/2026, 21:04 | INC-13 | S3 → N07: 42 · N08: 46 · N09: 42 | Juan Carlos Suaza | — (antes de septiembre) |  |
| 30 | 11/08/2026, 12:20 | INC-02 | S1 → N01: 46/42 · N03: 42 · N02: 46/42 | CDH Maker IT | — (antes de septiembre) |  |
| 31 | 11/08/2026, 21:52 | INC-22 | S2 → N04: 43/44 · N05: 43/44 · N06: 43 | Juan Carlos Suaza | — (antes de septiembre) |  |
| 32 | 14/08/2026, 22:29 | INC-15 | S4 → N10: 46/45 · N11: 45/46 · N12: 46/45 | Juan Carlos Suaza | — (antes de septiembre) |  |
| 33 | 15/08/2026, 02:39 | INC-21 | S1 → N01: 43/44 · N02: 44 · N03: 43 | Juan Alejandro | — (antes de septiembre) |  |
| 34 | 15/08/2026, 10:19 | INC-10 | S3 → N07: 45 · N08: 45 · N09: 45 | Germán (planta) | — (antes de septiembre) |  |
| 35 | 15/08/2026, 13:33 | INC-24 | S2 → N04: 45 · N05: 45 · N06: 45/46 | Germán (planta) | — (antes de septiembre) |  |
| 36 | 18/08/2026, 06:00 | INC-12 | S2 → N04: 44×2/45×2 · N05: 44 · N06: 45 | Ferney (turnero) | — (antes de septiembre) | El mensaje se envió días después («la del lunes/martes/miércoles»): se registra ese día a las 06:00 |
| 37 | 18/08/2026, 06:02 | INC-03 | S1 → N01: 46 · N02: 46 · N03: 46 | Juan Alejandro | — (antes de septiembre) |  |
| 38 | 18/08/2026, 11:14 | INC-16 | S4 → N10: 44 · N11: 44 · N12: 44 | Germán (planta) | — (antes de septiembre) |  |
| 39 | 19/08/2026, 11:12 | INC-19 | S3 → N07: 43 · N08: 42/43 · N09: 42/43 | Germán (planta) | — (antes de septiembre) |  |
| 40 | 21/08/2026, 21:43 | INC-18 | S4 → N10: 44×3/43×1 · N11: 43 · N12: 43 | Ferney (turnero) | — (antes de septiembre) |  |
| 41 | 22/08/2026, 01:23 | INC-17 | S1 → N01: 45/44 · N02: 45/44 · N03: 45 | Juan Alejandro | — (antes de septiembre) |  |
| 42 | 22/08/2026, 12:38 | INC-23 | S2 → N04: 45 · N05: 45/44/47 · N06: 45 | Juan Carlos Suaza | — (antes de septiembre) |  |
| 43 | 22/08/2026, 12:46 | INC-05 | S3 → N07: 46 · N08: 46 · N09: 46 | Juan Carlos Suaza | — (antes de septiembre) |  |
| 44 | 25/08/2026, 02:01 | INC-01 | S4 → N10: 44/45 · N11: 43/46/44 · N12: 46/44 | Juan Alejandro | — (antes de septiembre) |  |
| 45 | 25/08/2026, 06:48 | INC-09 | S1 → N01: 43/42 · N02: 42 · N03: 42 | Juan Alejandro | — (antes de septiembre) |  |
| 46 | 26/08/2026, 03:12 | INC-07 | S2 → N04: 46 · N05: 46 · N06: 46 | Juan Alejandro | — (antes de septiembre) |  |
| 47 | 26/08/2026, 03:14 | INC-11 | S3 → N07: 45 · N08: 45 · N09: 45/46 | Juan Alejandro | — (antes de septiembre) |  |
| 48 | 28/08/2026, 22:02 | INC-08 | S1 → N01: 46 · N02: 46 · N03: 46 | Juan Carlos Suaza | — (antes de septiembre) |  |
| 49 | 29/08/2026, 05:45 | INC-20 | S3 → N07: 42 · N08: 42 · N09: 42 | Juan Alejandro | — (antes de septiembre) |  |
| 50 | 29/08/2026, 12:29 | INC-04 | S2 → N04: 43/44/45 · N05: 43/44/45 · N06: 45 | Germán (planta) | — (antes de septiembre) |  |
| 51 | 29/08/2026, 22:01 | INC-06 | S4 → N10: 43 · N11: 43/42 · N12: 43/42 | Juan Carlos Suaza | — (antes de septiembre) |  |
| 52 | 01/09/2026, 05:59 | INC-22 | S3 → N07: 44 · N08: 44 · N09: 44 | Ferney (turnero) | — (antes de septiembre) |  |
| 53 | 01/09/2026, 08:03 | INC-02 | S1 → N01: 47 · N02: 42 · N03: 46/47 | Germán (planta) | — (antes de septiembre) |  |
| 54 | 02/09/2026, 05:42 | INC-13 | S2 → N04: 44 · N05: 44 · N06: 44 | Ferney (turnero) | — (antes de septiembre) |  |
| 55 | 02/09/2026, 07:48 | INC-14 | S4 → N10: 44 · N11: 44/47 · N12: 44/47 | Germán (planta) | — (antes de septiembre) |  |
| 56 | 04/09/2026, 21:48 | INC-15 | S3 → N07: 46 · N08: 46 · N09: 46 | Juan Alejandro | — (antes de septiembre) |  |
| 57 | 04/09/2026, 21:51 | INC-24 | S1 → N01: 43 · N02: 43 · N03: 43 | Juan Alejandro | — (antes de septiembre) |  |
| 58 | 05/09/2026, 05:57 | INC-21 | S2 → N04: 45 · N05: 45 · N06: 45 | Ferney (turnero) | — (antes de septiembre) |  |
| 59 | 05/09/2026, 05:59 | INC-10 | S4 → N10: 44 · N11: 47 · N12: 44×2/47×2 | Ferney (turnero) | — (antes de septiembre) |  |
| 60 | 08/09/2026, 10:25 | INC-03 | S1 → N01: 43/44 · N02: 42/43 · N03: 45 | Germán (planta) | — (antes de septiembre) |  |
| 61 | 08/09/2026, 10:30 | INC-19 | S3 → N07: 45 · N08: 45 · N09: 45 | Germán (planta) | — (antes de septiembre) |  |
| 62 | 09/09/2026, 06:00 | INC-16 | S2 → N04: 46 · N05: 46 · N06: 46 | Ferney (turnero) | — (antes de septiembre) | El mensaje se envió días después («la del lunes/martes/miércoles»): se registra ese día a las 06:00 |
| 63 | 09/09/2026, 06:00 | INC-12 | S4 → N10: 47 · N11: 47 · N12: 47 | Ferney (turnero) | — (antes de septiembre) | Corrección (lote, confianza media): El mensaje no trae lote. Natalia pidió «la del lote 46 y 47» y la 16 fue toda 46, así que a la 12 le corresponde el 47. Al aplicar, si la base tiene el cargue de la INC-12 con otro lote, manda el de la base. — El mensaje se envió días después («la del lunes/martes/miércoles»): se registra ese día a las 06:00 |
| 64 | 11/09/2026, 21:51 | INC-05 | S1 → N01: 43 · N02: 43 · N03: 44 | Juan Alejandro | — (antes de septiembre) |  |
| 65 | 11/09/2026, 21:51 | INC-17 | S3 → N07: 46 · N08: 45/46/42 · N09: 46 | Juan Alejandro | — (antes de septiembre) |  |
| 66 | 12/09/2026, 13:47 | INC-18 | S4 → N10: 47 · N11: 45 · N12: 47 | Germán (planta) | — (antes de septiembre) |  |
| 67 | 12/09/2026, 13:50 | INC-23 | S2 → N04: 44 · N05: 44/45 · N06: 44/45 | Germán (planta) | — (antes de septiembre) |  |
| 68 | 14/09/2026, 06:00 | INC-07 | S2 → N04: 47 · N05: 47 · N06: 46/47 | Germán (planta) | — (antes de septiembre) | El mensaje se envió días después («la del lunes/martes/miércoles»): se registra ese día a las 06:00 |
| 69 | 14/09/2026, 06:00 | INC-01 | S4 → N10: 43/45 · N11: 43 · N12: 45 | Germán (planta) | — (antes de septiembre) | El mensaje se envió días después («la del lunes/martes/miércoles»): se registra ese día a las 06:00 |
| 70 | 15/09/2026, 09:40 | INC-09 | S1 → N01: 45/46 · N02: 45/46 · N03: 46 | Germán (planta) | — (antes de septiembre) |  |
| 71 | 15/09/2026, 10:10 | INC-11 | S3 → N07: 44/45 · N08: 44/45 · N09: 44/45 | Germán (planta) | — (antes de septiembre) |  |
| 72 | 16/09/2026, 14:07 | INC-04 | S2 → N04: 44 · N05: 44/45 · N06: 45 | Germán (planta) | 🟠 hora ajustada | Hora ajustada a antes del recargue del 2026-09-16 20:07 UTC (mapa lc_mu4r7sov_ks0i0b); reportada 2026-09-20 06:50 |
| 73 | 17/09/2026, 14:06 | INC-08 | S3 → N07: 43/44 · N08: 43/44 · N09: 44 | Germán (planta) | 🟠 hora ajustada | Hora ajustada a antes del recargue del 2026-09-17 20:06 UTC (mapa lc_mu6867ir_kjrz19); reportada 2026-09-19 07:44 |
| 74 | 17/09/2026, 14:06 | INC-06 | S4 → N10: 46×1/47×3 · N11: 46×1/47×3 · N12: 46 | Ferney (turnero) | 🟠 hora ajustada | Hora ajustada a antes del recargue del 2026-09-17 20:06 UTC (mapa lc_mu673pj4_f1scll); reportada 2026-09-19 20:20 |
| 75 | 19/09/2026, 07:42 | INC-20 | S1 → N01: 45/46 · N02: 45 · N03: 46 | Germán (planta) | — sin mapa del ciclo | No hay mapa de cargue exportado de ese ciclo |
| 76 | 22/09/2026, 08:01 | INC-22 | S3 → N07: 43/44 · N08: 43/44 · N09: 44 | Germán (planta) | ✅ coincide | Mapa de cargue lc_mtkfyuyg_v1uvqj: lotes 43, 44 · 19.4 días de ciclo · coincide |
| 77 | 22/09/2026, 08:04 | INC-13 | S1 → N01: 45 · N02: 44/45 · N03: 46 | Germán (planta) | ✅ coincide | Mapa de cargue lc_mtkh3ht7_3obqcx: lotes 44, 45, 46 · 19.4 días de ciclo · coincide |
| 78 | 23/09/2026, 13:47 | INC-14 | S2 → N04: 43 · N05: 43/44 · N06: 43/44 | Germán (planta) | ✅ coincide | Mapa de cargue lc_mtlupjqs_u04zck: lotes 43, 44 · 19.7 días de ciclo · coincide |
| 79 | 23/09/2026, 13:50 | INC-02 | S4 → N10: 44/47 · N11: 44/45/47 · N12: 45/47 | Germán (planta) | ✅ coincide | Mapa de cargue lc_mtlvtjqm_kbbxxi: lotes 44, 45, 47 · 19.7 días de ciclo · coincide |
| 80 | 27/09/2026, 06:08 | INC-15 | S1 → N01: 46 · N02: 43/44 · N03: 46 | Germán (planta) | 🟡 parcial | Mapa de cargue lc_mtq6mgr7_k2nswl de INC-15: lotes 43, 44 · el chat reporta 46, 43, 44 (no estaban: 46) — Esos lotes estaban en el mapa de: INC-21 |
| 81 | 27/09/2026, 06:08 | INC-21 | S3 → N07: 43 · N08: 43 · N09: 43/44 | Germán (planta) | ✅ coincide | Mapa de cargue lc_mtqa2f9s_rxt2be: lotes 43, 44, 46 · 20.3 días de ciclo · coincide (el chat no menciona 46) |
| 82 | 27/09/2026, 06:11 | INC-24 | S2 → N04: 44/45 · N05: 44/45 · N06: 45 | Germán (planta) | 🔴 no coincide | Mapa de cargue lc_mtrjzx8f_je4efg de INC-24: lotes 47 · el chat reporta 44, 45 (no estaban: 44, 45) — Esos lotes estaban en el mapa de: INC-10 |
| 83 | 27/09/2026, 14:00 | INC-10 | S4 → N10: 47 · N11: 47 · N12: 47 | Germán (planta) | 🔴 no coincide | Mapa de cargue lc_mtrk7flx_j40bnw de INC-10: lotes 44, 45 · el chat reporta 47 (no estaban: 47) — Esos lotes estaban en el mapa de: INC-24 |
| 84 | 30/09/2026, 07:05 | INC-16 | S3 → N07: 46/47 · N08: 46/47 · N09: 46/47 | Germán (planta) | 🔴 no coincide | Mapa de cargue lc_mtuehqjf_uy7qvi de INC-16: lotes 43, 44, 45 · el chat reporta 46, 47 (no estaban: 46, 47) — Esos lotes estaban en el mapa de: INC-12 |
| 85 | 30/09/2026, 07:05 | INC-12 | S1 → N01: 43/44/45 · N02: 43/45 · N03: 44/45 | Germán (planta) | 🔴 no coincide | Mapa de cargue lc_mtuev8d6_kqrkga de INC-12: lotes 46, 47 · el chat reporta 43, 44, 45 (no estaban: 43, 44, 45) — Esos lotes estaban en el mapa de: INC-16, INC-19 |
| 86 | 30/09/2026, 07:11 | INC-19 | S4 → N10: 44/45/46 · N11: 43/44 · N12: 45/46 | Germán (planta) | ✅ coincide | Mapa de cargue lc_mtw4l89q_laz0rp: lotes 43, 44, 45, 46 · 19.3 días de ciclo · coincide |
| 87 | 30/09/2026, 07:11 | INC-03 | S2 → N04: 45/47 · N05: 45/47 · N06: 46/47 | Germán (planta) | 🟡 parcial | Mapa de cargue lc_mtw3yebb_zzb9p1 de INC-03: lotes 45, 47 · el chat reporta 45, 47, 46 (no estaban: 46) |
| 88 | 03/10/2026, 13:38 | INC-18 | S1 → N01: 50 · N02: 43/50 · N03: 50 | Germán (planta) | ✅ coincide | Mapa de cargue lc_mu07jo43_0w7dwc: lotes 43, 50 · 19.7 días de ciclo · coincide |
| 89 | 03/10/2026, 13:43 | INC-05 | S3 → N07: 44/45 · N08: 43/45 · N09: 45/46 | Germán (planta) | ✅ coincide | Mapa de cargue lc_mu1m60a3_4l17xv: lotes 43, 44, 45, 46 · 18.7 días de ciclo · coincide |
| 90 | 03/10/2026, 13:43 | INC-23 | S4 → N10: 47 · N11: 43/46/47 · N12: 47 | Germán (planta) | ✅ coincide | Mapa de cargue lc_mu1obzb1_7rsh96: lotes 43, 46, 47 · 18.5 días de ciclo · coincide |
| 91 | 05/10/2026, 22:01 | INC-01 | S1 → N01: 45×2/44×1/43×1 · N02: 43 · N03: 44×3/45×1 | Juan Alejandro | ✅ coincide | Corrección (incubadora, confianza alta): La INC-11 se cargó el 21-09 (inicio de ciclo 22-09): el 05-10 llevaba 14 días, no pudo transferirse. La INC-01 se cargó el 16-09 (inicio 17-09 → 18,8 días el 05-10) y su mapa de cargue trae exactamente los lotes 43, 44 y 45 que se reportan; la 11 traía además 46 y 47. — Mapa de cargue lc_mu4l6trz_5kefhm: lotes 43, 44, 45 · 19 días de ciclo · coincide |
