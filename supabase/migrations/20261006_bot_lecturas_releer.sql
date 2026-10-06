-- IncubApp: vuelve a leer TODAS las fotos de ronda con el lector v3 (06-10-2026), para corregir
-- solas las lecturas viejas (números corridos de campo, campos vacíos por «0100.0F»). Las pone
-- otra vez en cola; el lector las procesa en segundo plano (las más nuevas primero).
-- Aplicar DESPUÉS de reconstruir el contenedor del lector con la versión nueva.
UPDATE public.machine_check_ai_readings
   SET status = 'error', intentos = 0, reclamada_at = now() - interval '1 hour'
 WHERE status IN ('aplicada', 'revisar', 'revisada', 'sin_lecturas');
