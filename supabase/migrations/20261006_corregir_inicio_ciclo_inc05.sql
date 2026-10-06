-- =============================================================================
-- IncubApp · Corrige el inicio de ciclo del cargue del 14-09-2026 de la INC-05
-- IncubApp · Fixes the cycle start of the INC-05 load of 2026-09-14
-- Autor / Author: Henry Taborda — Ing. en desarrollo de software · 06-10-2026
--
-- ES: El cargue de la INC-05 del 14-09-2026 15:11 (lotes 43, 44, 45, 46 y tratado)
--     quedó con inicio de ciclo 01-10-2026 03:00 UTC en setter_loads y en su mapa de
--     cargue (lc_mu1m60a3_4l17xv). El inicio real, leído en la pantalla Petersime en la
--     ronda del 15-09-2026, es 15-09-2026 03:05 UTC (14-09 22:05 hora de Bogotá).
--     Con el dato errado la app calculaba mal la edad del huevo de esa máquina.
-- EN: The INC-05 load of 2026-09-14 15:11 was stored with cycle start 2026-10-01 03:00
--     UTC; the real start read on the Petersime screen is 2026-09-15 03:05 UTC.
-- Idempotente: solo toca filas que aún tengan el valor errado exacto.
-- =============================================================================
UPDATE public.setter_loads s
   SET cycle_start_at = '2026-09-15T03:05:00+00'
  FROM public.machines m
 WHERE m.id = s.machine_id
   AND m.code = 'INC-05'
   AND s.loaded_at = '2026-09-14T20:11:00+00'
   AND s.cycle_start_at = '2026-10-01T03:00:00+00';

DO $$
BEGIN
  IF to_regclass('public.load_maps') IS NOT NULL THEN
    UPDATE public.load_maps
       SET payload = jsonb_set(payload, '{cycleStartAt}', '"2026-09-15T03:05:00.000Z"')
     WHERE id = 'lc_mu1m60a3_4l17xv'
       AND payload->>'cycleStartAt' = '2026-10-01T03:00:00.000Z';
  END IF;
END $$;
