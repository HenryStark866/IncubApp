-- IncubApp: el líder revisa las lecturas que el bot dejó en «revisar».
-- Ve la foto, lo que digitó el turnero y lo que leyó el bot; deja el valor
-- correcto y la lectura pasa a «revisada» con quién y cuándo. Solo pueden
-- hacerlo quienes supervisan planta (mismo criterio que canSupervisePlant en
-- src/lib/roles.js) o el admin de plataforma. Idempotente.

ALTER TABLE public.machine_check_ai_readings
  ADD COLUMN IF NOT EXISTS revisada_por uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS revisada_at timestamptz,
  ADD COLUMN IF NOT EXISTS nota_revision text,
  ADD COLUMN IF NOT EXISTS valores_finales jsonb;

ALTER TABLE public.machine_check_ai_readings DROP CONSTRAINT IF EXISTS machine_check_ai_readings_status_check;
ALTER TABLE public.machine_check_ai_readings ADD CONSTRAINT machine_check_ai_readings_status_check
  CHECK (status IN ('procesando', 'aplicada', 'revisar', 'revisada', 'sin_lecturas', 'error'));

CREATE INDEX IF NOT EXISTS machine_check_ai_readings_revisar_idx
  ON public.machine_check_ai_readings (org_id, procesada_at DESC) WHERE status = 'revisar';

-- ¿Quien llama supervisa la planta de esa empresa?
CREATE OR REPLACE FUNCTION public.incubapp_can_supervise_plant(p_org uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT private.is_platform_admin() OR EXISTS (
    SELECT 1 FROM public.organization_members om
    WHERE om.org_id = p_org AND om.user_id = auth.uid()
      AND (om.role::text IN ('owner', 'admin', 'supervisor', 'management', 'management_auxiliary', 'coordinator', 'plant_coordinator')
           OR (om.role::text = 'leader' AND public.incubapp_area_norm(om.area::text) = 'plant'))
  )
$$;

-- Guarda la revisión. p_valores = {campo: número o null} con el valor final de
-- cada campo que el líder dejó; los campos que no vienen no se tocan.
CREATE OR REPLACE FUNCTION public.resolver_lectura_bot(p_check_id uuid, p_valores jsonb, p_nota text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_org uuid;
  v jsonb := CASE WHEN jsonb_typeof(p_valores) = 'object' THEN p_valores ELSE '{}'::jsonb END;
  campo text;
BEGIN
  SELECT a.org_id INTO v_org FROM public.machine_check_ai_readings a WHERE a.check_id = p_check_id FOR UPDATE;
  IF v_org IS NULL THEN RAISE EXCEPTION 'Esa lectura no existe'; END IF;
  IF NOT public.incubapp_can_supervise_plant(v_org) THEN
    RAISE EXCEPTION 'Solo quien supervisa la planta puede revisar lecturas' USING ERRCODE = '42501';
  END IF;
  FOR campo IN SELECT jsonb_object_keys(v) LOOP
    IF campo NOT IN ('temp_ovoscan', 'temp_air', 'humidity', 'co2', 'turn_count') THEN
      RAISE EXCEPTION 'Campo desconocido: %', campo;
    END IF;
    IF jsonb_typeof(v->campo) NOT IN ('number', 'null') THEN
      RAISE EXCEPTION 'El valor de % no es un número', campo;
    END IF;
  END LOOP;

  UPDATE public.machine_checks SET
    temp_ovoscan = CASE WHEN v ? 'temp_ovoscan' THEN (v->>'temp_ovoscan')::numeric ELSE temp_ovoscan END,
    temp_air     = CASE WHEN v ? 'temp_air'     THEN (v->>'temp_air')::numeric     ELSE temp_air END,
    humidity     = CASE WHEN v ? 'humidity'     THEN (v->>'humidity')::numeric     ELSE humidity END,
    co2          = CASE WHEN v ? 'co2'          THEN (v->>'co2')::numeric          ELSE co2 END,
    turn_count   = CASE WHEN v ? 'turn_count'   THEN round((v->>'turn_count')::numeric)::smallint ELSE turn_count END
  WHERE id = p_check_id;

  UPDATE public.machine_check_ai_readings SET
    status = 'revisada',
    valores_finales = v,
    nota_revision = left(nullif(trim(p_nota), ''), 500),
    revisada_por = auth.uid(),
    revisada_at = now()
  WHERE check_id = p_check_id;
END $$;

REVOKE ALL ON FUNCTION public.incubapp_can_supervise_plant(uuid) FROM public, anon;
REVOKE ALL ON FUNCTION public.resolver_lectura_bot(uuid, jsonb, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.incubapp_can_supervise_plant(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.resolver_lectura_bot(uuid, jsonb, text) TO authenticated;

NOTIFY pgrst, 'reload schema';
