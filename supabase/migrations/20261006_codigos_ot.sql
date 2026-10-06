-- =============================================================================
-- IncubApp · Códigos de OT dañados («OT-#####»)
-- IncubApp · Broken work-order codes ("OT-#####")
-- Autor / Author: Henry Taborda — Ing. en desarrollo de software · 06-10-2026
--
-- ES: work_order_defaults() arma el código con to_char(nextval, 'FM00000'). Cuando el
--     contador public.work_order_seq pasa de 99.999, to_char no cabe en 5 cifras y
--     devuelve «#####». Desde el 23-09-2026 las OTs nuevas salían todas como OT-#####
--     (29 en el servidor al 06-10). Esta migración:
--       1. Reescribe la función: 5 cifras mientras quepa, más cifras si no; nunca
--          repite un código existente.
--       2. Si el contador se desbordó, lo devuelve al mayor OT-NNNNN real + 1.
--       3. Da código nuevo, en orden de creación, a las OTs con «#», dejando nota.
-- EN: work_order_defaults() builds the code with to_char(nextval, 'FM00000'). Past
--     99,999 to_char overflows to "#####". This rewrites the function, resets an
--     overflowed sequence to the highest real OT-NNNNN + 1 and recodes broken OTs.
-- Idempotente / Idempotent.
-- =============================================================================
CREATE OR REPLACE FUNCTION public.work_order_defaults()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  n bigint;  -- ES: siguiente número / EN: next number
  c text;    -- ES: código candidato / EN: candidate code
begin
  -- ES: Sin código, o con el código dañado, se asigna uno nuevo.
  -- EN: No code, or a broken one, gets a new one.
  if new.code is null or new.code = '' or new.code like '%#%' then
    loop
      n := nextval('public.work_order_seq');
      -- ES: 5 cifras mientras quepa (OT-00111); si no, el número completo (OT-100000).
      -- EN: 5 digits while it fits; otherwise the full number.
      c := 'OT-' || case when n < 100000 then to_char(n, 'FM00000') else n::text end;
      -- ES: Nunca repetir un código existente. EN: Never reuse an existing code.
      exit when not exists (select 1 from public.work_orders w where w.code = c);
    end loop;
    new.code := c;
  end if;
  new.updated_at := now();
  return new;
end;
$function$;

DO $$
DECLARE
  v_max  bigint;  -- ES: mayor OT-NNNNN real / EN: highest real OT-NNNNN
  r      record;
BEGIN
  IF to_regclass('public.work_order_seq') IS NULL THEN
    RAISE NOTICE 'Sin public.work_order_seq: nada que hacer';
    RETURN;
  END IF;
  -- ES: Contador desbordado → vuelve al mayor código real de 1 a 5 cifras.
  -- EN: Overflowed sequence → back to the highest real 1-to-5-digit code.
  IF (SELECT last_value FROM public.work_order_seq) >= 100000 THEN
    SELECT coalesce(max((regexp_match(code, '^OT-([0-9]{1,5})$'))[1]::bigint), 0) INTO v_max
      FROM public.work_orders;
    PERFORM setval('public.work_order_seq', greatest(v_max, 1), v_max > 0);
  END IF;
  -- ES: Código nuevo para las dañadas, en orden de creación (el trigger lo asigna).
  -- EN: New code for broken ones, in creation order (the trigger assigns it).
  FOR r IN SELECT id FROM public.work_orders WHERE code LIKE '%#%' ORDER BY created_at, id LOOP
    UPDATE public.work_orders
       SET code = NULL,
           regularization_note = concat_ws(' · ', nullif(regularization_note, ''),
             'Código regenerado el 06-10-2026: tenía OT-##### por desborde del contador')
     WHERE id = r.id;
  END LOOP;
END $$;
