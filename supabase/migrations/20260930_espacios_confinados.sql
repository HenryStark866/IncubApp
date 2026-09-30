-- IncubApp: espacios confinados (Resolución 0491 de 2020, MinTrabajo) y cierre de los
-- registros de SST y ambiental solo por quien corresponde (30-09-2026).
--
-- 1. Cierre de registros: cualquiera de la empresa sigue pudiendo REPORTAR (incidentes,
--    residuos, lecturas…), pero solo cierra quien lidera:
--      · incidente de SST → cerrado: líder de SST, gerencia, owner/admin;
--      · inspección de SST → hecha: además el auxiliar de SST;
--      · obligación ambiental → cumplida y retiro de residuos → entregado: líder
--        ambiental, auxiliar ambiental, gerencia, owner/admin.
-- 2. Inventario de espacios confinados de la planta: se siembra con las salas cuyo nombre
--    empieza por «Túnel» (los 4 túneles de aire de incubadoras y nacedoras). Nada más.
-- 3. Permiso de entrada: trabajo, vigía, entrantes, lista de verificación, mediciones de
--    atmósfera, ingresos y salidas. La base no deja:
--      · autorizar sin la lista completa ni con una medición de menos de 60 min fuera de
--        los límites (o sin medición);
--      · entrar sin permiso autorizado y vigente, ni a quien no está en el permiso;
--      · cerrar con gente adentro.
--    Una medición fuera de límites con el permiso en uso lo SUSPENDE: hay que salir.
-- Límites de atmósfera: O₂ 19,5–23,5 %, inflamables < 10 % del LIE, CO ≤ 25 ppm,
-- H₂S ≤ 1 ppm y formaldehído ≤ 0,1 ppm (TLV ACGIH). El responsable del SG-SST los revisa.
-- Idempotente: se puede aplicar varias veces.

-- incubapp_area_norm viene de 20260930_admin_set_password_por_area.sql; se repite aquí por si
-- esta migración se aplica sola.
CREATE OR REPLACE FUNCTION public.incubapp_area_norm(p_area text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE coalesce(nullif(trim(p_area), ''), 'general')
    WHEN 'hse' THEN 'sst'
    ELSE coalesce(nullif(trim(p_area), ''), 'general')
  END
$$;

-- ─── ¿El usuario tiene uno de estos cargos (o lidera una de estas áreas) en la empresa? ───
CREATE OR REPLACE FUNCTION public.incubapp_org_role_ok(p_org uuid, p_roles text[], p_areas text[])
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_platform_admin() OR EXISTS (
    SELECT 1 FROM public.organization_members m
    WHERE m.org_id = p_org
      AND m.user_id = auth.uid()
      AND (
        m.role::text = ANY (p_roles)
        OR (m.role::text = 'coordinator' AND public.incubapp_area_norm(m.area::text) = ANY (p_areas))
      )
  )
$$;

-- ─── 1. Cierre de los registros de SST y ambiental ───
CREATE OR REPLACE FUNCTION public.incubapp_guard_record_close()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sst_lead boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW; -- tareas del servidor (sin sesión)
  END IF;
  IF TG_TABLE_NAME = 'sst_incidents' THEN
    IF (TG_OP = 'INSERT' AND NEW.status = 'closed')
       OR (TG_OP = 'UPDATE' AND (NEW.status = 'closed') IS DISTINCT FROM (OLD.status = 'closed')) THEN
      IF NOT public.incubapp_org_role_ok(NEW.org_id, ARRAY['owner', 'admin', 'management'], ARRAY['sst']) THEN
        RAISE EXCEPTION 'Solo el líder de SST o gerencia cierra o reabre un incidente' USING ERRCODE = '42501';
      END IF;
    END IF;
  ELSIF TG_TABLE_NAME = 'sst_inspections' THEN
    IF (TG_OP = 'INSERT' AND NEW.done_at IS NOT NULL)
       OR (TG_OP = 'UPDATE' AND (NEW.done_at IS NULL) <> (OLD.done_at IS NULL)) THEN
      v_sst_lead := public.incubapp_org_role_ok(NEW.org_id,
        ARRAY['owner', 'admin', 'management', 'sst_auxiliary', 'hse_auxiliary'], ARRAY['sst']);
      IF NOT v_sst_lead THEN
        RAISE EXCEPTION 'Solo SST (líder o auxiliar) registra el resultado de una inspección' USING ERRCODE = '42501';
      END IF;
    END IF;
  ELSIF TG_TABLE_NAME = 'env_obligations' THEN
    IF (TG_OP = 'INSERT' AND NEW.status = 'done')
       OR (TG_OP = 'UPDATE' AND (NEW.status = 'done') IS DISTINCT FROM (OLD.status = 'done')) THEN
      IF NOT public.incubapp_org_role_ok(NEW.org_id,
          ARRAY['owner', 'admin', 'management', 'environmental_auxiliary'], ARRAY['environmental']) THEN
        RAISE EXCEPTION 'Solo gestión ambiental o gerencia da por cumplida una obligación' USING ERRCODE = '42501';
      END IF;
    END IF;
  ELSIF TG_TABLE_NAME = 'env_waste' THEN
    IF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN
      IF NOT public.incubapp_org_role_ok(NEW.org_id,
          ARRAY['owner', 'admin', 'management', 'environmental_auxiliary'], ARRAY['environmental']) THEN
        RAISE EXCEPTION 'Solo gestión ambiental o gerencia confirma la entrega de residuos' USING ERRCODE = '42501';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['sst_incidents', 'sst_inspections', 'env_obligations', 'env_waste'] LOOP
    IF to_regclass('public.' || t) IS NOT NULL THEN
      EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.%I', t || '_guard_close', t);
      EXECUTE format(
        'CREATE TRIGGER %I BEFORE INSERT OR UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.incubapp_guard_record_close()',
        t || '_guard_close', t);
    END IF;
  END LOOP;
END $$;

-- ─── 2. Inventario de espacios confinados ───
CREATE TABLE IF NOT EXISTS public.sst_confined_spaces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  plant_id uuid,
  room_id uuid UNIQUE,
  code text NOT NULL,
  name text NOT NULL,
  width_m numeric(8, 2),
  length_m numeric(8, 2),
  height_m numeric(8, 2),
  access text,
  hazards text[] NOT NULL DEFAULT '{}'::text[],
  controls text[] NOT NULL DEFAULT '{}'::text[],
  typical_tasks text[] NOT NULL DEFAULT '{}'::text[],
  requires_permit boolean NOT NULL DEFAULT true,
  active boolean NOT NULL DEFAULT true,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sst_confined_spaces_org_idx ON public.sst_confined_spaces (org_id, code);

-- Los túneles de aire: volúmenes cerrados de 1,85–1,95 m de alto, sobre los cuartos de
-- máquinas, con entrada por compuerta. Peligros y controles de partida; SST los ajusta.
INSERT INTO public.sst_confined_spaces
  (org_id, plant_id, room_id, code, name, width_m, length_m, height_m, access, hazards, controls, typical_tasks)
SELECT
  coalesce(r.org_id, p.org_id),
  r.plant_id,
  r.id,
  r.code,
  r.name,
  r.width,
  r.height,
  coalesce(r.altura, 1.9),
  'Compuerta de inspección en el segundo nivel, sobre el cuarto de máquinas',
  ARRAY[
    'Atmósfera: residuos de desinfectantes o fumigación (formaldehído, amonio cuaternario, peróxido) y posible deficiencia de oxígeno si se cierra sin ventilar',
    'Energía mecánica: ventiladores, persianas (dampers) y equipos de climatización que pueden arrancar',
    'Espacio reducido: altura libre menor de 2 m, postura forzada y salida por una sola compuerta',
    'Caída al entrar o salir por la compuerta elevada',
    'Temperatura y humedad del aire acondicionado; polvo, plumón y hongos (material biológico)',
    'Iluminación deficiente'
  ],
  ARRAY[
    'Permiso de entrada firmado por el supervisor de entrada antes de cada ingreso',
    'Bloqueo y etiquetado (LOTO) de ventiladores, persianas y climatización del túnel',
    'Ventilación natural o forzada y medición de gases antes de entrar y durante el trabajo',
    'Vigía afuera todo el tiempo, con comunicación permanente con los entrantes',
    'Equipo de rescate listo en la compuerta (arnés, línea de vida, trípode o punto de anclaje)',
    'Señal «PELIGRO – ESPACIO CONFINADO – NO ENTRE SIN PERMISO» en cada compuerta',
    'EPP: respirador según la medición, guantes, gafas, casco y linterna intrínsecamente segura'
  ],
  ARRAY['Limpieza y desinfección', 'Cambio de filtros', 'Mantenimiento de ventiladores y persianas', 'Inspección']
FROM public.rooms r
LEFT JOIN public.plants p ON p.id = r.plant_id
WHERE r.name ~* '^\s*t[uú]nel\s'
  AND coalesce(r.org_id, p.org_id) IS NOT NULL
ON CONFLICT (room_id) DO NOTHING;

-- ─── 3. Permisos de entrada ───
CREATE TABLE IF NOT EXISTS public.sst_confined_permits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  space_id uuid NOT NULL REFERENCES public.sst_confined_spaces (id) ON DELETE RESTRICT,
  work_description text NOT NULL,
  work_type text NOT NULL DEFAULT 'other'
    CHECK (work_type IN ('cleaning', 'filters', 'maintenance', 'inspection', 'other')),
  valid_from timestamptz NOT NULL DEFAULT now(),
  valid_until timestamptz NOT NULL,
  supervisor_name text NOT NULL,
  attendant_name text NOT NULL,
  entrants text[] NOT NULL,
  rescue_plan text,
  communication text,
  ventilation text,
  checklist jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'authorized', 'active', 'suspended', 'closed', 'cancelled')),
  suspended_reason text,
  authorized_by uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  authorized_at timestamptz,
  closed_by uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  closed_at timestamptz,
  closing_notes text,
  photo_paths text[] NOT NULL DEFAULT '{}'::text[],
  created_by uuid REFERENCES public.profiles (id) ON DELETE SET NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sst_confined_permits_valid CHECK (
    valid_until > valid_from AND valid_until <= valid_from + interval '12 hours'),
  CONSTRAINT sst_confined_permits_entrants CHECK (cardinality(entrants) >= 1)
);
CREATE INDEX IF NOT EXISTS sst_confined_permits_org_idx ON public.sst_confined_permits (org_id, created_at DESC);
CREATE INDEX IF NOT EXISTS sst_confined_permits_open_idx ON public.sst_confined_permits (org_id, status)
  WHERE status IN ('draft', 'authorized', 'active', 'suspended');

-- Mediciones de atmósfera (detector multigás). ok lo calcula la base.
CREATE TABLE IF NOT EXISTS public.sst_confined_readings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  permit_id uuid NOT NULL REFERENCES public.sst_confined_permits (id) ON DELETE CASCADE,
  taken_at timestamptz NOT NULL DEFAULT now(),
  o2_pct numeric(5, 2) NOT NULL CHECK (o2_pct >= 0 AND o2_pct <= 100),
  lel_pct numeric(5, 2) NOT NULL CHECK (lel_pct >= 0 AND lel_pct <= 100),
  co_ppm numeric(8, 2) CHECK (co_ppm IS NULL OR co_ppm >= 0),
  h2s_ppm numeric(8, 2) CHECK (h2s_ppm IS NULL OR h2s_ppm >= 0),
  hcho_ppm numeric(8, 3) CHECK (hcho_ppm IS NULL OR hcho_ppm >= 0),
  instrument text,
  taken_by_name text,
  ok boolean NOT NULL DEFAULT false,
  created_by uuid REFERENCES public.profiles (id) ON DELETE SET NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sst_confined_readings_permit_idx ON public.sst_confined_readings (permit_id, taken_at DESC);

-- Ingresos y salidas de cada entrante.
CREATE TABLE IF NOT EXISTS public.sst_confined_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  permit_id uuid NOT NULL REFERENCES public.sst_confined_permits (id) ON DELETE CASCADE,
  person_name text NOT NULL,
  entered_at timestamptz NOT NULL DEFAULT now(),
  exited_at timestamptz,
  created_by uuid REFERENCES public.profiles (id) ON DELETE SET NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sst_confined_entries_order CHECK (exited_at IS NULL OR exited_at >= entered_at)
);
CREATE INDEX IF NOT EXISTS sst_confined_entries_permit_idx ON public.sst_confined_entries (permit_id, entered_at DESC);
CREATE INDEX IF NOT EXISTS sst_confined_entries_inside_idx ON public.sst_confined_entries (org_id)
  WHERE exited_at IS NULL;

-- Límites de atmósfera aceptable.
CREATE OR REPLACE FUNCTION public.incubapp_confined_reading_ok(
  p_o2 numeric, p_lel numeric, p_co numeric, p_h2s numeric, p_hcho numeric)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT p_o2 >= 19.5 AND p_o2 <= 23.5
     AND p_lel < 10
     AND coalesce(p_co, 0) <= 25
     AND coalesce(p_h2s, 0) <= 1
     AND coalesce(p_hcho, 0) <= 0.1
$$;

-- Quién hace de supervisor de entrada (autoriza, cancela y cierra).
CREATE OR REPLACE FUNCTION public.incubapp_confined_supervisor(p_org uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.incubapp_org_role_ok(p_org,
    ARRAY['owner', 'admin', 'management', 'sst_auxiliary', 'hse_auxiliary'],
    ARRAY['sst', 'maintenance', 'plant'])
$$;

CREATE OR REPLACE FUNCTION public.incubapp_confined_reading_before()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status text;
BEGIN
  SELECT status INTO v_status FROM public.sst_confined_permits WHERE id = NEW.permit_id;
  IF v_status IS NULL THEN
    RAISE EXCEPTION 'El permiso no existe' USING ERRCODE = 'P0002';
  END IF;
  IF v_status IN ('closed', 'cancelled') THEN
    RAISE EXCEPTION 'El permiso ya está cerrado' USING ERRCODE = '22023';
  END IF;
  NEW.org_id := (SELECT org_id FROM public.sst_confined_permits WHERE id = NEW.permit_id);
  NEW.ok := public.incubapp_confined_reading_ok(NEW.o2_pct, NEW.lel_pct, NEW.co_ppm, NEW.h2s_ppm, NEW.hcho_ppm);
  RETURN NEW;
END;
$$;

-- Medición mala con el permiso en uso: se suspende y hay que salir.
CREATE OR REPLACE FUNCTION public.incubapp_confined_reading_after()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT NEW.ok THEN
    UPDATE public.sst_confined_permits
       SET status = 'suspended',
           suspended_reason = format('Medición fuera de límites a las %s: O₂ %s %%, LIE %s %%%s%s%s',
             to_char(NEW.taken_at AT TIME ZONE 'America/Bogota', 'HH24:MI'), NEW.o2_pct, NEW.lel_pct,
             CASE WHEN NEW.co_ppm IS NULL THEN '' ELSE format(', CO %s ppm', NEW.co_ppm) END,
             CASE WHEN NEW.h2s_ppm IS NULL THEN '' ELSE format(', H₂S %s ppm', NEW.h2s_ppm) END,
             CASE WHEN NEW.hcho_ppm IS NULL THEN '' ELSE format(', formaldehído %s ppm', NEW.hcho_ppm) END)
     WHERE id = NEW.permit_id AND status IN ('authorized', 'active');
  END IF;
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.incubapp_confined_permit_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_last record;
  v_key text;
  v_inside integer;
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.org_id := (SELECT org_id FROM public.sst_confined_spaces WHERE id = NEW.space_id);
    IF NEW.status <> 'draft' THEN
      RAISE EXCEPTION 'El permiso se crea en borrador y luego se autoriza' USING ERRCODE = '22023';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.status = OLD.status THEN
    RETURN NEW;
  END IF;
  IF OLD.status IN ('closed', 'cancelled') THEN
    RAISE EXCEPTION 'El permiso ya está cerrado' USING ERRCODE = '22023';
  END IF;

  IF NEW.status = 'authorized' THEN
    IF OLD.status NOT IN ('draft', 'suspended') THEN
      RAISE EXCEPTION 'Solo se autoriza un permiso en borrador o suspendido' USING ERRCODE = '22023';
    END IF;
    IF NOT public.incubapp_confined_supervisor(NEW.org_id) THEN
      RAISE EXCEPTION 'Solo el supervisor de entrada (SST, líder de planta o de mantenimiento) autoriza el permiso'
        USING ERRCODE = '42501';
    END IF;
    FOREACH v_key IN ARRAY ARRAY['lockout', 'ventilation', 'rescue', 'ppe', 'signage', 'training', 'communication'] LOOP
      IF coalesce((NEW.checklist ->> v_key)::boolean, false) IS NOT TRUE THEN
        RAISE EXCEPTION 'Falta confirmar la lista de verificación antes de autorizar (%)', v_key USING ERRCODE = '22023';
      END IF;
    END LOOP;
    IF now() > NEW.valid_until THEN
      RAISE EXCEPTION 'El permiso ya venció: cree uno nuevo' USING ERRCODE = '22023';
    END IF;
    SELECT * INTO v_last FROM public.sst_confined_readings
     WHERE permit_id = NEW.id ORDER BY taken_at DESC LIMIT 1;
    IF v_last IS NULL OR v_last.taken_at < now() - interval '60 minutes' THEN
      RAISE EXCEPTION 'Registre la medición de gases (de menos de 60 minutos) antes de autorizar' USING ERRCODE = '22023';
    END IF;
    IF NOT v_last.ok THEN
      RAISE EXCEPTION 'La última medición está fuera de límites: ventile y vuelva a medir' USING ERRCODE = '22023';
    END IF;
    NEW.authorized_by := auth.uid();
    NEW.authorized_at := now();
    NEW.suspended_reason := NULL;
  ELSIF NEW.status = 'active' THEN
    IF OLD.status <> 'authorized' THEN
      RAISE EXCEPTION 'El permiso no está autorizado' USING ERRCODE = '22023';
    END IF;
  ELSIF NEW.status = 'suspended' THEN
    -- Cualquiera puede parar el trabajo (derecho a detener una tarea insegura).
    IF OLD.status NOT IN ('authorized', 'active') THEN
      RAISE EXCEPTION 'Solo se suspende un permiso autorizado o en uso' USING ERRCODE = '22023';
    END IF;
    NEW.suspended_reason := coalesce(NEW.suspended_reason, 'Suspendido por el equipo');
  ELSIF NEW.status IN ('closed', 'cancelled') THEN
    IF NOT public.incubapp_confined_supervisor(NEW.org_id) THEN
      RAISE EXCEPTION 'Solo el supervisor de entrada cierra o cancela el permiso' USING ERRCODE = '42501';
    END IF;
    SELECT count(*) INTO v_inside FROM public.sst_confined_entries
     WHERE permit_id = NEW.id AND exited_at IS NULL;
    IF v_inside > 0 THEN
      RAISE EXCEPTION 'Hay % persona(s) adentro: registre su salida antes de cerrar', v_inside USING ERRCODE = '22023';
    END IF;
    NEW.closed_by := auth.uid();
    NEW.closed_at := now();
  ELSIF NEW.status = 'draft' THEN
    RAISE EXCEPTION 'Un permiso no vuelve a borrador' USING ERRCODE = '22023';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.incubapp_confined_entry_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_p record;
BEGIN
  SELECT * INTO v_p FROM public.sst_confined_permits WHERE id = NEW.permit_id;
  IF v_p IS NULL THEN
    RAISE EXCEPTION 'El permiso no existe' USING ERRCODE = 'P0002';
  END IF;
  NEW.org_id := v_p.org_id;
  IF TG_OP = 'INSERT' THEN
    IF v_p.status NOT IN ('authorized', 'active') THEN
      RAISE EXCEPTION 'No se puede entrar: el permiso no está autorizado (%)', v_p.status USING ERRCODE = '22023';
    END IF;
    IF now() < v_p.valid_from OR now() > v_p.valid_until THEN
      RAISE EXCEPTION 'No se puede entrar: el permiso no está vigente a esta hora' USING ERRCODE = '22023';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM unnest(v_p.entrants) e WHERE lower(trim(e)) = lower(trim(NEW.person_name))) THEN
      RAISE EXCEPTION '% no está en el permiso como entrante', NEW.person_name USING ERRCODE = '22023';
    END IF;
    IF EXISTS (SELECT 1 FROM public.sst_confined_entries
                WHERE permit_id = NEW.permit_id AND exited_at IS NULL
                  AND lower(trim(person_name)) = lower(trim(NEW.person_name))) THEN
      RAISE EXCEPTION '% ya está adentro', NEW.person_name USING ERRCODE = '22023';
    END IF;
  ELSE
    IF OLD.exited_at IS NOT NULL AND NEW.exited_at IS DISTINCT FROM OLD.exited_at THEN
      RAISE EXCEPTION 'La salida ya quedó registrada' USING ERRCODE = '22023';
    END IF;
    NEW.person_name := OLD.person_name;
    NEW.entered_at := OLD.entered_at;
    NEW.permit_id := OLD.permit_id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.incubapp_confined_entry_after()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.sst_confined_permits SET status = 'active'
   WHERE id = NEW.permit_id AND status = 'authorized';
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS sst_confined_permits_guard ON public.sst_confined_permits;
CREATE TRIGGER sst_confined_permits_guard BEFORE INSERT OR UPDATE ON public.sst_confined_permits
  FOR EACH ROW EXECUTE FUNCTION public.incubapp_confined_permit_guard();
DROP TRIGGER IF EXISTS sst_confined_readings_before ON public.sst_confined_readings;
CREATE TRIGGER sst_confined_readings_before BEFORE INSERT ON public.sst_confined_readings
  FOR EACH ROW EXECUTE FUNCTION public.incubapp_confined_reading_before();
DROP TRIGGER IF EXISTS sst_confined_readings_after ON public.sst_confined_readings;
CREATE TRIGGER sst_confined_readings_after AFTER INSERT ON public.sst_confined_readings
  FOR EACH ROW EXECUTE FUNCTION public.incubapp_confined_reading_after();
DROP TRIGGER IF EXISTS sst_confined_entries_guard ON public.sst_confined_entries;
CREATE TRIGGER sst_confined_entries_guard BEFORE INSERT OR UPDATE ON public.sst_confined_entries
  FOR EACH ROW EXECUTE FUNCTION public.incubapp_confined_entry_guard();
DROP TRIGGER IF EXISTS sst_confined_entries_after ON public.sst_confined_entries;
CREATE TRIGGER sst_confined_entries_after AFTER INSERT ON public.sst_confined_entries
  FOR EACH ROW EXECUTE FUNCTION public.incubapp_confined_entry_after();

-- ─── RLS por empresa: ver y registrar; borrar no (queda la trazabilidad) ───
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['sst_confined_spaces', 'sst_confined_permits', 'sst_confined_readings', 'sst_confined_entries'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_select', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (public.is_org_member(org_id))',
      t || '_select', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_insert', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (public.is_org_member(org_id))',
      t || '_insert', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_update', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING (public.is_org_member(org_id)) WITH CHECK (public.is_org_member(org_id))',
      t || '_update', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE ON public.%I TO authenticated', t);
  END LOOP;
END $$;

-- El inventario lo edita solo SST o gerencia (los permisos, cualquiera de la empresa).
DROP POLICY IF EXISTS sst_confined_spaces_insert ON public.sst_confined_spaces;
CREATE POLICY sst_confined_spaces_insert ON public.sst_confined_spaces FOR INSERT TO authenticated
  WITH CHECK (public.incubapp_org_role_ok(org_id, ARRAY['owner', 'admin', 'management', 'sst_auxiliary', 'hse_auxiliary'], ARRAY['sst']));
DROP POLICY IF EXISTS sst_confined_spaces_update ON public.sst_confined_spaces;
CREATE POLICY sst_confined_spaces_update ON public.sst_confined_spaces FOR UPDATE TO authenticated
  USING (public.incubapp_org_role_ok(org_id, ARRAY['owner', 'admin', 'management', 'sst_auxiliary', 'hse_auxiliary'], ARRAY['sst']))
  WITH CHECK (public.incubapp_org_role_ok(org_id, ARRAY['owner', 'admin', 'management', 'sst_auxiliary', 'hse_auxiliary'], ARRAY['sst']));

-- updated_at al día.
DO $$
DECLARE
  t text;
BEGIN
  IF to_regprocedure('public.incubapp_touch_updated_at()') IS NULL THEN
    RETURN;
  END IF;
  FOREACH t IN ARRAY ARRAY['sst_confined_spaces', 'sst_confined_permits'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.%I', t || '_touch', t);
    EXECUTE format(
      'CREATE TRIGGER %I BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.incubapp_touch_updated_at()',
      t || '_touch', t);
  END LOOP;
END $$;

-- Realtime: el mapa 3D y el panel ven los ingresos y permisos al instante.
DO $$
DECLARE
  t text;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    FOREACH t IN ARRAY ARRAY['sst_confined_permits', 'sst_confined_entries'] LOOP
      IF NOT EXISTS (SELECT 1 FROM pg_publication_tables
                      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = t) THEN
        EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
      END IF;
    END LOOP;
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
