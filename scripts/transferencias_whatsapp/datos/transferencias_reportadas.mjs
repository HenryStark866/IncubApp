/**
 * =============================================================================
 * ARCHIVO / FILE: scripts/transferencias_whatsapp/datos/transferencias_reportadas.mjs
 * AUTOR / AUTHOR: Henry Taborda — Ing. en desarrollo de software
 * FECHA / DATE:   06-10-2026
 *
 * ES: Transcripción, una por una, de las transferencias de incubadora a salón de
 *     nacedoras reportadas en el grupo de WhatsApp «Transferencias» (13-07-2026 a
 *     05-10-2026). Cada registro conserva el texto original para auditoría.
 * EN: One-by-one transcription of the setter-to-hatcher-room transfers reported in
 *     the «Transferencias» WhatsApp group (2026-07-13 to 2026-10-05). Each record
 *     keeps the original text for auditing.
 *
 * FORMATO / FORMAT:
 *   reportado  ES: fecha y hora del mensaje (hora de Bogotá, -05:00).
 *              EN: message date and time (Bogota time, -05:00).
 *   transferido ES: fecha real cuando el mensaje dice otro día («la del lunes»).
 *              EN: actual date when the message names another day ("Monday's").
 *   inc        ES: número de incubadora (INC-xx). EN: setter number (INC-xx).
 *   salon      ES: salón de nacedoras 1..4 (1 → NAC 1-3, 2 → 4-6, 3 → 7-9, 4 → 10-12).
 *              EN: hatcher room 1..4 (1 → NAC 1-3, 2 → 4-6, 3 → 7-9, 4 → 10-12).
 *   nac        ES: { nacedora: 'lote[xcarros], ...' } en el orden del mensaje.
 *              EN: { hatcher: 'lot[xcarts], ...' } in the message order.
 *   todo       ES: lote único para las tres nacedoras del salón.
 *              EN: single lot for the three hatchers of the room.
 *   correccion ES: cambio aplicado sobre lo reportado y su justificación.
 *              EN: change applied over the report and its justification.
 * =============================================================================
 */

/** ES: Lista de transferencias reportadas. EN: List of reported transfers. */
export const transferenciasReportadas = [
  { reportado: '2026-07-14T05:06', por: 'Ferney (turnero)', inc: 8, salon: 1, nac: { 1: '44x3,43x1', 2: '41x3,44x1', 3: '41' }, texto: 'Se trasfiere incubadora # 8 A salon de nacedoras # 1 Nac # 1 LT 44 3 carr LT 43 1 carr Nac # 2 LT 41 3 carr LT 44 1 carr Nac 3 LT 41' },
  { reportado: '2026-07-14T05:09', por: 'Ferney (turnero)', inc: 1, salon: 3, nac: { 7: '45', 8: '44x3,45x1', 9: '44' }, texto: 'Se trasfiere incubadora # 1 A salon de nacedoras # 3 Nac # 7 LT 45 Nac # 8 LT 44 3 carr LT 45 1 carr Nac # 9 LT 44' },
  { reportado: '2026-07-15T06:01', por: 'Juan Alejandro', inc: 7, salon: 2, nac: { 4: '42', 5: '46', 6: '42' }, texto: 'Se transfiere incubadora #7 al salón de nacedoras #2 Nac #4 lotes 42 Nac#5 lotes 46 Nac #6 lotes 42' },
  { reportado: '2026-07-15T06:01', por: 'Juan Alejandro', inc: 11, salon: 4, nac: { 10: '43', 11: '43', 12: '43' }, texto: 'Se transfiere incubadora #11 al salón de nacedoras #4 Nac #10 lote 43 Nac#11 lote 43 Nac#12 lote 43' },
  { reportado: '2026-07-17T22:11', por: 'Juan Carlos Suaza', inc: 6, salon: 1, nac: { 1: '42', 2: '41', 3: '42,41' }, texto: 'Se transfirio..incubadora # 6 a salon de nacedoras #1 Naced#1 lote 42 Nace#2 lote 41 Nace#3 lote42 y 41' },
  { reportado: '2026-07-19T05:57', por: 'Ferney (turnero)', inc: 5, salon: 2, todo: '44', texto: 'Se trasfiere incubadora # 5 A salon de nacedoras # 2 Todo LT 44' },
  { reportado: '2026-07-19T05:58', por: 'Ferney (turnero)', inc: 20, salon: 4, todo: '45', texto: 'Incubadora # 20 A salon de nacedoras # 4 Todo LT 45' },
  { reportado: '2026-07-21T05:51', por: 'Ferney (turnero)', inc: 13, salon: 1, nac: { 1: '41', 2: '42', 3: '41x2,42x2' }, texto: 'Incubadora # 13 A salon de nacedoras # 1 Nac # 1 LT 41 Nac # 2 LT 42 Nac # 3 LT 41 2 carr LT 42 2 carr' },
  { reportado: '2026-07-21T05:51', por: 'Ferney (turnero)', inc: 14, salon: 3, todo: '46', texto: 'Incubadora # 14 A salon de nacedoras # 3 Todo LT 46' },
  { reportado: '2026-07-22T05:54', por: 'Ferney (turnero)', inc: 22, salon: 4, nac: { 10: '42x3,43x1', 11: '43', 12: '43' }, texto: 'Incubadora # 22 A salon de nacedoras # 4 Nac 10 LT 42 3 carr LT 43 1 carr Nac 11 LT 43 Nac 12 LT 43' },
  { reportado: '2026-07-22T05:59', por: 'Ferney (turnero)', inc: 2, salon: 2, nac: { 4: '45', 5: '44x2,45x2', 6: '45x2,44x2' }, texto: 'Incubadora # 2 A salon de nacedoras # 2 Nac # 4 LT 45 Nac 5 LT 44 2 carr LT 45 2 carr Nac 6 LT 45 2 carr LT 44 2 carr' },
  { reportado: '2026-07-25T06:00', por: 'Ferney (turnero)', inc: 10, salon: 1, nac: { 1: '45x2,46x2', 2: '46', 3: '46' }, texto: 'Incubadora # 10 A salon de nacedoras # 1 Nac 1 LT 45 2 carr LT 46 2 carr Nac # 2 LT 46 Nac 3 LT 46' },
  { reportado: '2026-07-25T06:01', por: 'Ferney (turnero)', inc: 15, salon: 3, nac: { 7: '45', 8: '46', 9: '45' }, texto: 'Incubadora # 15 A salon de nacedoras# 3 Nac 7 LT 45 Nac 8 LT 46 Nac 9 LT 45' },
  { reportado: '2026-07-26T14:35', por: 'Juan Carlos Suaza', inc: 24, salon: 2, nac: { 4: '44', 5: '43', 6: '44,43' }, texto: 'Incubadora # 24 a salon de nacedoras #2 Nac#4 LT44 Nac#5 LT43 Nac#6LT44y43' },
  { reportado: '2026-07-26T14:38', por: 'Juan Carlos Suaza', inc: 21, salon: 4, nac: { 10: '42', 11: '41', 12: '41' }, texto: 'Incubadora #21 a salon de nacedoras#4 Nac10LT42 Nac11 LT 41 Nace12 LT 41' },
  {
    reportado: '2026-07-31T05:59', transferido: '2026-07-27T06:00', por: 'Don Jhon (supervisor)', inc: 3, salon: 1, nac: { 1: '45', 3: '45', 2: '46' },
    texto: 'transferencia del lunes incubadora 5. Lote 45 y 46 salón 1 nacedoras 1 y3 lote 45 y en la 2 46 4 carros',
    correccion: { campo: 'incubadora', de: 5, a: 3, confianza: 'media', motivo: 'La incubadora 5 ya se había transferido el 19-07 (8 días antes): no pudo tener huevo de 18 días el 27-07. La 3 es la única que encaja: no aparece en julio, su ciclo del 17-06 (pantallazo de la app del 13-07) da transferencia hacia el 06-07 y la siguiente hacia el 27-07, y sigue el ritmo 18-08 → 08-09 → 30-09.' },
  },
  { reportado: '2026-07-31T05:59', transferido: '2026-07-27T06:00', por: 'Don Jhon (supervisor)', inc: 16, salon: 3, todo: '45', texto: 'y la incubadora 16 lote 45 en el salón 3 nacedora 7 8 y9' },
  {
    reportado: '2026-07-31T13:39', por: 'CDH Maker IT', inc: 9, salon: 1, nac: { 1: '42x2,44x2', 2: '44', 3: '42' },
    texto: 'Transferencia de incubadora No 9 a sala de nacedoras 1 · Lote 42 en nacedora No 3 · Lote 44 en nacedora No 2 · Lote 44 y 42 en nacedora No 1 (Ferney la repite el 01-08 05:59 con 2 carros de 42 y 2 de 44 en la Nac 1)',
    correccion: { campo: 'duplicado', confianza: 'alta', motivo: 'Ferney reportó la misma transferencia (incubadora 9 → salón 1, mismos lotes por nacedora) el 01-08 a las 05:59. Se registra una sola vez, con la hora del primer reporte y el detalle de carros del segundo.' },
  },
  { reportado: '2026-08-01T06:01', por: 'Ferney (turnero)', inc: 23, salon: 3, nac: { 7: '43', 8: '43', 9: '43' }, texto: 'Incubadora # 23 A salon de nacedoras # 3 Nac #7 LT 43 Nac # 8 LT 43 Nac # 9 LT 43' },
  { reportado: '2026-08-01T06:02', por: 'Ferney (turnero)', inc: 17, salon: 2, todo: '46', texto: 'Incubadora # 17 Salon de ncedoras # 2 Todo con LT 46' },
  { reportado: '2026-08-01T06:04', por: 'Ferney (turnero)', inc: 18, salon: 4, todo: '45', texto: 'Incubadora # 18 Salon de nacedoras # 4 Todo con LT 45' },
  { reportado: '2026-08-04T06:53', por: 'Ferney (turnero)', inc: 8, salon: 1, todo: '44', texto: 'Incubadora # 8 a aalon de nacedoras # 1 LT 44 todo' },
  { reportado: '2026-08-04T06:54', por: 'Ferney (turnero)', inc: 1, salon: 3, todo: '44', texto: 'Incubadora # 1 A salon de nacedoras # 3 LT 44 todo' },
  {
    reportado: '2026-08-05T05:54', por: 'Ferney (turnero)', inc: 7, salon: 2, nac: { 4: '41x3,42x1', 5: '41', 6: '42' },
    texto: 'Incubadora # (sin número) A salon de nacedoras # 2 Nav # 4 LT 41 3 carr Lar 42 1 carr Nac # 5 LT 41 Nac # 6 LT 42',
    correccion: { campo: 'incubadora', de: null, a: 7, confianza: 'media', motivo: 'El mensaje no trae el número. La incubadora 7 es la única que falta en ese turno: va al salón 2 el 15-07, el 26-08 y el 16-09 (cada ~21 días) y entre 15-07 y 26-08 le falta una transferencia justo hacia el 05-08; además sale en pareja con la 11 (salón 4) igual que el 15-07.' },
  },
  { reportado: '2026-08-05T05:57', por: 'Ferney (turnero)', inc: 11, salon: 4, nac: { 10: '43x2,45x2', 11: '45x3,43x1', 12: '43x3,45x1' }, texto: 'Incubadora # 11 A salon de nacedoras # 4 Nac 10 LT 43 2 carr LT 45 2 carr Nac 11 LT 45 3 carr LT 43 1 carr Nac 12 LT 43 3 carr LT 45 1 carro' },
  { reportado: '2026-08-07T21:38', por: 'Juan Carlos Suaza', inc: 6, salon: 1, todo: '46', texto: 'Se transfiere incubadora #6 a salon de nacedoras #1. Todo queda con lote # 46' },
  { reportado: '2026-08-07T21:45', por: 'Juan Carlos Suaza', inc: 4, salon: 3, todo: '45', texto: 'Se transfiere incubadora # 4 a salon de nacedoras # 3. Todo queda con lote #45' },
  { reportado: '2026-08-10T15:42', por: 'CDH Maker IT', inc: 14, salon: 4, nac: { 10: '44,46', 11: '44', 12: '44' }, texto: 'Se transfiere de la Incubadora 14, a la sala de nacedoras 4. Lote # 44 y 46 en nacedora No 10. Lote 44 en nacedoras 11 y 12' },
  { reportado: '2026-08-10T21:04', por: 'Juan Carlos Suaza', inc: 13, salon: 3, nac: { 7: '42', 8: '46', 9: '42' }, texto: 'Se transfiere incubadora # 13 a salon de nacedoras #3. Nace# 7 LT42 Nace#8LT46 Naced #9LT42' },
  { reportado: '2026-08-11T12:20', por: 'CDH Maker IT', inc: 2, salon: 1, nac: { 3: '42', 2: '46,42', 1: '46,42' }, texto: 'De transfirió incubadora No 2 a sala de nacedoras 1 Lote 42 a nacedora 3 Lote 46 y 42 a nacedora 2 Lote 46 y 42 a nacedora 1' },
  { reportado: '2026-08-11T21:52', por: 'Juan Carlos Suaza', inc: 22, salon: 2, nac: { 4: '43,44', 5: '43,44', 6: '43' }, texto: 'Se transfirio incubadora #22 a salon de nacedoras #2 Nace #4LT43y44 Nace#5LT43y44 Nace#6LT43' },
  { reportado: '2026-08-14T22:29', por: 'Juan Carlos Suaza', inc: 15, salon: 4, nac: { 10: '46,45', 11: '45,46', 12: '46,45' }, texto: 'Se transfiere incubadora #15 a salon de nacedoras #4 Nace#10LT46yLT45 Nace#11LT45yLT46 Nace#12LTLT46yLT45' },
  { reportado: '2026-08-15T02:39', por: 'Juan Alejandro', inc: 21, salon: 1, nac: { 1: '43,44', 2: '44', 3: '43' }, texto: 'Se transfiere incubadora #21 al salón de nacedoras #1 Nac #1 lote 43,44 Nac #2 lote 44 Nac #3 lote 43' },
  { reportado: '2026-08-15T10:19', por: 'Germán (planta)', inc: 10, salon: 3, nac: { 7: '45', 8: '45', 9: '45' }, texto: 'Se transfiere incubadora #10 al salón de nacedoras #3 Nac#7 lote 45 Nac#8 lote 45 Nac#9 lote 45' },
  { reportado: '2026-08-15T13:33', por: 'Germán (planta)', inc: 24, salon: 2, nac: { 4: '45', 5: '45', 6: '45,46' }, texto: 'Se transfiere incubadora #24 al salón de nacedoras #2 Nac#4 lote 45 Nac#5 lote 45 Nac#6 lote 45 y lote 46' },
  { reportado: '2026-08-18T06:02', por: 'Juan Alejandro', inc: 3, salon: 1, nac: { 1: '46', 2: '46', 3: '46' }, texto: 'Se transfiere la incubadora #3 al salón de nacedoras #1 Nac #1 lote 46 Nac#2 lote 46 Nac #3 lote 46' },
  { reportado: '2026-08-18T11:14', por: 'Germán (planta)', inc: 16, salon: 4, nac: { 10: '44', 11: '44', 12: '44' }, texto: 'Se transfiere incubadora #16 al salón de nacedoras #4 Nac#10 lote 44 Nac#11 lote 44 Nac#12 lote 44' },
  { reportado: '2026-08-19T11:12', por: 'Germán (planta)', inc: 19, salon: 3, nac: { 7: '43', 8: '42,43', 9: '42,43' }, texto: 'Se transfiere incubadora #19 al salón de nacedoras #3 Nac#7 lote 43 Nac#8 lote 42, 43 Nac#9 lote 42, 43' },
  { reportado: '2026-08-20T15:36', transferido: '2026-08-18T06:00', por: 'Ferney (turnero)', inc: 12, salon: 2, nac: { 4: '44x2,45x2', 5: '44', 6: '45' }, texto: 'Ttasferencia del martes Incunadora # 12 A salon de nacedoras # 2 Nac # 4 LT 44 2carr LT 45 2 carr Nac # 5 LT 44 Nac # 6 LT 45' },
  { reportado: '2026-08-21T21:43', por: 'Ferney (turnero)', inc: 18, salon: 4, nac: { 10: '44x3,43x1', 11: '43', 12: '43' }, texto: 'Se trasfiere incubadora # 18 A salon de nacedoras # 4 Nac # 10 LT 44 3 carr LT 43 1 carr Nac # 11 LT 43 Nac # 12 LT 43' },
  { reportado: '2026-08-22T01:23', por: 'Juan Alejandro', inc: 17, salon: 1, nac: { 1: '45,44', 2: '45,44', 3: '45' }, texto: 'Se transfiere incubadora #17 al salón de nacedoras #1 Nac #1 lote 45 y 44 Nac #2 lote 45 y 44 Nac #3 lote 45' },
  { reportado: '2026-08-22T12:38', por: 'Juan Carlos Suaza', inc: 23, salon: 2, nac: { 4: '45', 5: '45,44,47', 6: '45' }, texto: 'Se transfiere incubadora #23 a salon de nacedoras #2 Nac#4 lote 45 Nac#5 lote45 44 y47 Nac#6 lote 45' },
  { reportado: '2026-08-22T12:46', por: 'Juan Carlos Suaza', inc: 5, salon: 3, todo: '46', texto: 'Se transfiere incubadora #5 a salon de nacedoras #3 Nac #7 Nac #8 Nac #9 Todas lote #46' },
  { reportado: '2026-08-25T02:01', por: 'Juan Alejandro', inc: 1, salon: 4, nac: { 10: '44,45', 11: '43,46,44', 12: '46,44' }, texto: 'Se transfiere incubadora #1 al salón de nacedoras #4 Nac #10 lote 44 y 45 Nace #11 lote 43,46,44 Nac #12 lote 46 ,44' },
  { reportado: '2026-08-25T06:48', por: 'Juan Alejandro', inc: 9, salon: 1, nac: { 1: '43,42', 2: '42', 3: '42' }, texto: 'Se transfiere incubadora #9 al salón de nacedoras #1 Nac #1 lote 43,42 Nac #2 lote 42 Nac #3 lote 42' },
  { reportado: '2026-08-26T03:12', por: 'Juan Alejandro', inc: 7, salon: 2, nac: { 4: '46', 5: '46', 6: '46' }, texto: 'Se transfiere incubadora #7 al salón de nacedoras #2 Nac #4 lote 46 Nac #5 lote 46 Nac #6 lote 46' },
  { reportado: '2026-08-26T03:14', por: 'Juan Alejandro', inc: 11, salon: 3, nac: { 7: '45', 8: '45', 9: '45,46' }, texto: 'Se transfiere incubadora #11 al salón de nacedoras #3 Nac #7 lote 45 Nac#8 lote 45 Nac#9 lote 45,46' },
  { reportado: '2026-08-28T22:02', por: 'Juan Carlos Suaza', inc: 8, salon: 1, todo: '46', texto: 'Se transfiere incubadora #8 a salon de nacedoras #1 Nace#1 Nace#2 Nace#3 Todas quedan con el lote # 46' },
  { reportado: '2026-08-29T05:45', por: 'Juan Alejandro', inc: 20, salon: 3, nac: { 7: '42', 8: '42', 9: '42' }, texto: 'Se transfiere incubadora #20 al salón de nacedoras #3 Nac #7 lote 42 Nac #8 lote 42 Nac#9 lote 42' },
  { reportado: '2026-08-29T12:29', por: 'Germán (planta)', inc: 4, salon: 2, nac: { 4: '43,44,45', 5: '43,44,45', 6: '45' }, texto: 'Se transfiere incubadora #4 al salón de nacedora#2 Nac#4 lote 43, 44, 45 Nac#5 lote 43, 44, 45 Nac#6 lote 45' },
  { reportado: '2026-08-29T22:01', por: 'Juan Carlos Suaza', inc: 6, salon: 4, nac: { 10: '43', 11: '43,42', 12: '43,42' }, texto: 'Se transfiere incubadora #6 asalon de nacedoras # 4 Nace#10 L.T43 Nace#11L.T43y42 Naced#12L.T43y42' },
  { reportado: '2026-09-01T05:59', por: 'Ferney (turnero)', inc: 22, salon: 3, todo: '44', texto: 'Se trasfiere incubadora # 22 A salon de nacedoras # 3 Todo LT 44' },
  { reportado: '2026-09-01T08:03', por: 'Germán (planta)', inc: 2, salon: 1, nac: { 1: '47', 2: '42', 3: '46,47' }, texto: 'Se transfiere incubadora #2 al salón de nacedora #1 Nac#1 lote 47 Nac#2 lote 42 Nac#3 lote 46, 47' },
  { reportado: '2026-09-02T05:42', por: 'Ferney (turnero)', inc: 13, salon: 2, todo: '44', texto: 'Se trasfiere incubadora # 13 a salon de nacedoras # 2 Todo LT 44' },
  { reportado: '2026-09-02T07:48', por: 'Germán (planta)', inc: 14, salon: 4, nac: { 10: '44', 11: '44,47', 12: '44,47' }, texto: 'Se transfiere incubadora#14 al salón de nacedoras#4 Nac#10 lote 44 Nac#11 lote 44, 47 Nac#12 lote 44, 47' },
  { reportado: '2026-09-04T21:48', por: 'Juan Alejandro', inc: 15, salon: 3, nac: { 7: '46', 8: '46', 9: '46' }, texto: 'Se transfiere incubadora #15 al salón de nacedoras #3 Nac #7 lote 46 Nac#8 lote46 Nac #9 lote 46' },
  { reportado: '2026-09-04T21:51', por: 'Juan Alejandro', inc: 24, salon: 1, nac: { 1: '43', 2: '43', 3: '43' }, texto: 'Se transfiere incubadora #24 al salón de nacedoras #1 Nac#1 lote 43 Nac #2 lote 43 Nac #3 lote 43' },
  { reportado: '2026-09-05T05:57', por: 'Ferney (turnero)', inc: 21, salon: 2, todo: '45', texto: 'Se rrasfiere incubadora # 21 a salon de nacedoras # 2 queda todo con LT 45' },
  { reportado: '2026-09-05T05:59', por: 'Ferney (turnero)', inc: 10, salon: 4, nac: { 10: '44', 11: '47', 12: '44x2,47x2' }, texto: 'Incubadora # 10 A salon de nacedoras # 4 Nac # 10 LT 44 Nac # 11 LT 47 Nac # 12 LT 44 2 carr LT 47 2 carr' },
  { reportado: '2026-09-08T10:25', por: 'Germán (planta)', inc: 3, salon: 1, nac: { 1: '43,44', 2: '42,43', 3: '45' }, texto: 'Se transfiere incubadora#3 al salón de nacedoras #1 Nac#1 lote 43,44 Nac#2 lote 42,43 Nac#3 lote 45' },
  { reportado: '2026-09-08T10:30', por: 'Germán (planta)', inc: 19, salon: 3, nac: { 7: '45', 8: '45', 9: '45' }, texto: 'Se transfiere incubadora#19 al salón de nacedoras#3 Nac#7 lote 45 Nac#8 lote 45 Nac#9 lote 45' },
  { reportado: '2026-09-11T12:38', transferido: '2026-09-09T06:00', por: 'Ferney (turnero)', inc: 16, salon: 2, todo: '46', texto: 'Incubadora # 16 A salom de nacedoras # 2 todo lt 46 (respuesta a «la transferencia del miércoles, la del lote 46 y 47»)' },
  {
    reportado: '2026-09-11T12:39', transferido: '2026-09-09T06:00', por: 'Ferney (turnero)', inc: 12, salon: 4, todo: '47',
    texto: 'Incunadora # 12 a salon de nacedoras # 4 (respuesta a «la transferencia del miércoles, la del lote 46 y 47»)',
    correccion: { campo: 'lote', de: null, a: '47', confianza: 'media', motivo: 'El mensaje no trae lote. Natalia pidió «la del lote 46 y 47» y la 16 fue toda 46, así que a la 12 le corresponde el 47. Al aplicar, si la base tiene el cargue de la INC-12 con otro lote, manda el de la base.' },
  },
  { reportado: '2026-09-11T21:51', por: 'Juan Alejandro', inc: 5, salon: 1, nac: { 1: '43', 2: '43', 3: '44' }, texto: 'Se transfiere incubadora #5 al salón de nacedoras #1 Nac #1 lote 43 Nac #2 lote 43 Nac #3 lote 44' },
  { reportado: '2026-09-11T21:51', por: 'Juan Alejandro', inc: 17, salon: 3, nac: { 7: '46', 8: '45,46,42', 9: '46' }, texto: 'Se transfiere incubadora #17 al salón de nacedoras #3 Nac #7 lote 46 Nac #8 lote 45 ,46,42 Nac #9 lote 46' },
  { reportado: '2026-09-12T13:47', por: 'Germán (planta)', inc: 18, salon: 4, nac: { 10: '47', 11: '45', 12: '47' }, texto: 'Se transfiere incubadora#18 al salón de nacedoras#4 Nac#10 lote 47 Nac#11 lote 45 Nac#12 lote47' },
  { reportado: '2026-09-12T13:50', por: 'Germán (planta)', inc: 23, salon: 2, nac: { 4: '44', 5: '44,45', 6: '44,45' }, texto: 'Se transfiere incubadora#23 al salón de nacedoras#2 Nac#4 lote 44 Nac#5 lote 44, 45 Nac#6 lote 44, 45' },
  { reportado: '2026-09-15T09:40', por: 'Germán (planta)', inc: 9, salon: 1, nac: { 1: '45,46', 2: '45,46', 3: '46' }, texto: 'Se transfiere incubadora#9 al salón de nacedoras#1 Nac#1 lote 45, 46 Nac#2 lote 45, 46 Nac#3 lote 46' },
  { reportado: '2026-09-15T10:10', por: 'Germán (planta)', inc: 11, salon: 3, nac: { 7: '44,45', 8: '44,45', 9: '44,45' }, texto: 'Se transfiere incubadora#11 al salón de nacedoras#3 Nac#7 lote 44, 45 Nac#8 lote 44, 45 Nac#9 lote 44, 45' },
  { reportado: '2026-09-16T16:23', transferido: '2026-09-14T06:00', por: 'Germán (planta)', inc: 7, salon: 2, nac: { 4: '47', 5: '47', 6: '46,47' }, texto: 'Se transfiere incubadora#7 al salón de nacedoras #2 Nac#4 lote 47 Nac#5 lote 47 Nac#6 lote 46, 47 (respuesta a «me comparten la transferencia del lunes»)' },
  { reportado: '2026-09-16T16:25', transferido: '2026-09-14T06:00', por: 'Germán (planta)', inc: 1, salon: 4, nac: { 10: '43,45', 11: '43', 12: '45' }, texto: 'Se transfiere incubadora#1 al salón de nacedoras#4 Nac#10 lote 43, 45 Nac#11 lote 43 Nac#12 lote 45 (respuesta a «me comparten la transferencia del lunes»)' },
  { reportado: '2026-09-19T07:42', por: 'Germán (planta)', inc: 20, salon: 1, nac: { 1: '45,46', 2: '45', 3: '46' }, texto: 'Se transfiere incubadora#20 al salón de nacedora#1 Nac#1 lote 45, 46 Nac#2 lote 45 Nac#3 lote 46' },
  { reportado: '2026-09-19T07:44', por: 'Germán (planta)', inc: 8, salon: 3, nac: { 7: '43,44', 8: '43,44', 9: '44' }, texto: 'Se transfiere incubadora#8 al salón de nacedora#3 Nac#7 lote 43, 44 Nac#8 lote 43, 44 Nac#9 lote 44' },
  { reportado: '2026-09-19T20:20', por: 'Ferney (turnero)', inc: 6, salon: 4, nac: { 10: '46x1,47x3', 11: '46x1,47x3', 12: '46' }, texto: 'Incubadora # 6 A salon dd nacedoras # 4 Nac # 10 LT 46 1 carr LT 47 3 carr Nac # 11 LT 461 carr LT 47 3 carr Mac # 12 LT 46' },
  { reportado: '2026-09-20T06:50', por: 'Germán (planta)', inc: 4, salon: 2, nac: { 4: '44', 5: '44,45', 6: '45' }, texto: 'Se transfiere incubadora#4 al salón de nacedoras#2 Nac#4 lote 44 Nac#5 lote 44, 45 Nac#6 lote 45' },
  { reportado: '2026-09-22T08:01', por: 'Germán (planta)', inc: 22, salon: 3, nac: { 7: '43,44', 8: '43,44', 9: '44' }, texto: 'Se transfiere incubadora#22 al salón de nacedora#3 Nac#7 lote 43, 44 Nac#8 lote 43, 44 Nac#9 lote 44' },
  { reportado: '2026-09-22T08:04', por: 'Germán (planta)', inc: 13, salon: 1, nac: { 1: '45', 2: '44,45', 3: '46' }, texto: 'Se transfiere incubadora#13 al salón de nacedora#1 Nac#1 lote 45 Nac#2 lote 44, 45 Nac#3 lote 46' },
  { reportado: '2026-09-23T13:47', por: 'Germán (planta)', inc: 14, salon: 2, nac: { 4: '43', 5: '43,44', 6: '43,44' }, texto: 'Se transfiere incubadora#14 al salón de nacedora#2 Nac#4 lote 43 Nac#5 lote 43, 44 Nac#6 lote 43, 44' },
  { reportado: '2026-09-23T13:50', por: 'Germán (planta)', inc: 2, salon: 4, nac: { 10: '44,47', 11: '44,45,47', 12: '45,47' }, texto: 'Se transfiere incubadora#2 al salón de nacedora#4 Nac#10 lote 44, 47 Nac#11 lote 44, 45, 47 Nac#12 lote 45, 47' },
  { reportado: '2026-09-27T06:08', por: 'Germán (planta)', inc: 15, salon: 1, nac: { 1: '46', 2: '43,44', 3: '46' }, texto: 'Se transfiere incubadora#15 al salón de nacedora#1 Nac#1 lote 46 Nac#2 lote 43,44 Nac#3 lote 46' },
  { reportado: '2026-09-27T06:08', por: 'Germán (planta)', inc: 21, salon: 3, nac: { 7: '43', 8: '43', 9: '43,44' }, texto: 'Se transfiere incubadora#21 al salón de nacedora#3 Nac#7 lote 43 Nac#8 lote 43 Nac#9 lote 43,44' },
  { reportado: '2026-09-27T06:11', por: 'Germán (planta)', inc: 24, salon: 2, nac: { 4: '44,45', 5: '44,45', 6: '45' }, texto: 'Se transfiere incubadora#24 al salón de nacedora#2 Nac#4 lote 44,45 Nac#5 lote 44,45 Nac#6 lote 45' },
  { reportado: '2026-09-27T14:00', por: 'Germán (planta)', inc: 10, salon: 4, nac: { 10: '47', 11: '47', 12: '47' }, texto: 'Se transfiere incubadora#10 al salón de nacedora#4 Nac#10 lote 47 Nac#11 lote 47 Nac#12 lote 47' },
  { reportado: '2026-09-30T07:05', por: 'Germán (planta)', inc: 16, salon: 3, nac: { 7: '46,47', 8: '46,47', 9: '46,47' }, texto: 'Se transfiere incubadora#16 al salón de nacedora#3 Nac#7 lote 46,47 Nac#8 lote 46,47 Nac#9 lote 46,47' },
  { reportado: '2026-09-30T07:05', por: 'Germán (planta)', inc: 12, salon: 1, nac: { 1: '43,44,45', 2: '43,45', 3: '44,45' }, texto: 'Se transfiere incubadora#12 al salón de nacedora#1 Nac#1 lote 43,44,45 Nac#2 lote 43,45 Nac#3 lote 44,45' },
  { reportado: '2026-09-30T07:11', por: 'Germán (planta)', inc: 19, salon: 4, nac: { 10: '44,45,46', 11: '43,44', 12: '45,46' }, texto: 'Se transfiere incubadora#19 al salón de nacedora#4 Nac#10 lote 44,45,46 Nac#11 lote 43,44 Nac#12 lote 45,46' },
  { reportado: '2026-09-30T07:11', por: 'Germán (planta)', inc: 3, salon: 2, nac: { 4: '45,47', 5: '45,47', 6: '46,47' }, texto: 'Se transfiere incubadora#3 al salón de nacedora#2 Nac#4 lote 45,47 Nac#5 lote 45,47 Nac#6 lote 46,47' },
  { reportado: '2026-10-03T13:38', por: 'Germán (planta)', inc: 18, salon: 1, nac: { 1: '50', 2: '43,50', 3: '50' }, texto: 'Se transfiere incubadora#18 al salón de nacedora#1 Nac#1 lote 50 Nac#2 lote 43,50 Nac#3 lote 50' },
  { reportado: '2026-10-03T13:43', por: 'Germán (planta)', inc: 5, salon: 3, nac: { 7: '44,45', 8: '43,45', 9: '45,46' }, texto: 'Se transfiere incubadora#5 al salón de nacedora#3 Nac#7 lote 44,45 Nac#8 lote 43,45 Nac#9 lote 45,46' },
  { reportado: '2026-10-03T13:43', por: 'Germán (planta)', inc: 23, salon: 4, nac: { 10: '47', 11: '43,46,47', 12: '47' }, texto: 'Se transfiere incubadora#23 al salón de nacedora#4 Nac#10 lote 47 Nac#11 lote 43,46,47 Nac#12 lote 47' },
  {
    reportado: '2026-10-05T22:01', por: 'Juan Alejandro', inc: 1, salon: 1, nac: { 1: '45x2,44x1,43x1', 2: '43', 3: '44x3,45x1' },
    texto: 'Se transfiere incubadora #11 al salón de nacedoras #1 Nac #1, 2 carros de lote 45 uno de lote 44 y uno de lote 43 Nac #2 lote 43 Nac #3, 3 carros del lote 44 y uno del lote 45',
    correccion: { campo: 'incubadora', de: 11, a: 1, confianza: 'alta', motivo: 'La INC-11 se cargó el 21-09 (inicio de ciclo 22-09): el 05-10 llevaba 14 días, no pudo transferirse. La INC-01 se cargó el 16-09 (inicio 17-09 → 18,8 días el 05-10) y su mapa de cargue trae exactamente los lotes 43, 44 y 45 que se reportan; la 11 traía además 46 y 47.' },
  },
]

/**
 * ES: Transferencias que se pidieron en el grupo y nunca se reportaron con detalle.
 * EN: Transfers requested in the group that were never reported in detail.
 */
export const transferenciasFaltantes = [
  {
    fecha: '2026-08-08',
    detalle: 'Natalia (21-08): «falta la del sábado 8… que fue sábado para nacer martes». Juan Carlos respondió con un archivo multimedia que no viene en la exportación del chat. Por el ritmo de las máquinas, ese sábado debieron salir la INC-05 y la INC-20 (ambas se transfirieron el 19-07 y no vuelven a aparecer hasta el 22-08 y el 29-08). Sin salón ni lotes no se puede registrar con seguridad: queda pendiente de que planta la confirme.',
  },
]
