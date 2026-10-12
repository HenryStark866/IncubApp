-- =============================================================================
-- IncubApp · Equipo de mantenimiento: sedes, lugar de trabajo y traslados · 12-10-2026
--
-- 1. incubapp_set_member_site: el líder de mantenimiento (y quien administra personas)
--    asigna la sede de cada auxiliar (organization_members.site_id, 20261006). Misma
--    regla de rango que el resto de la gestión de personas (20261007_jerarquia_usuarios):
--    solo a gente de menor rango de su área.
-- 2. team_locations: «dónde estoy y para dónde voy». Cada persona reporta su lugar de
--    trabajo (sede, sitio, actividad u OT) y cada traslado misional deja aquí una fila
--    «en_traslado» (origen → destino) que ve su jefe y le llega a SST.
-- RLS por empresa con public.is_org_member(org_id). Idempotente.
-- =============================================================================

-- ── 1. Asignar sede a un miembro ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.incubapp_set_member_site(p_org uuid, p_user uuid, p_site uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text;
  v_area text;
BEGIN
  SELECT m.role::text, m.area::text INTO v_role, v_area
  FROM public.organization_members m
  WHERE m.org_id = p_org AND m.user_id = p_user;
  IF v_role IS NULL THEN
    RAISE EXCEPTION 'La persona no pertenece a la empresa' USING ERRCODE = '42501';
  END IF;
  IF NOT public.incubapp_can_manage_member(p_org, v_role, v_area)
     AND NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.platform_role = 'admin') THEN
    RAISE EXCEPTION 'No tiene rango para asignar la sede de esta persona' USING ERRCODE = '42501';
  END IF;
  IF p_site IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.plants s WHERE s.id = p_site AND s.org_id = p_org) THEN
    RAISE EXCEPTION 'La sede no es de la empresa' USING ERRCODE = '22023';
  END IF;
  UPDATE public.organization_members SET site_id = p_site WHERE org_id = p_org AND user_id = p_user;
END;
$$;

REVOKE ALL ON FUNCTION public.incubapp_set_member_site(uuid, uuid, uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.incubapp_set_member_site(uuid, uuid, uuid) TO authenticated;

-- ── 2. Lugar de trabajo y traslados ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.team_locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE DEFAULT auth.uid(),
  status text NOT NULL DEFAULT 'en_sitio' CHECK (status IN ('en_sitio', 'en_traslado', 'fuera')),
  site_id uuid REFERENCES public.plants (id) ON DELETE SET NULL,
  place text,
  origin text,
  destination text,
  activity text,
  work_order_id uuid,
  mission_inspection_id text,
  lat double precision,
  lng double precision,
  reported_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS team_locations_org_idx ON public.team_locations (org_id, reported_at DESC);
CREATE INDEX IF NOT EXISTS team_locations_user_idx ON public.team_locations (org_id, user_id, reported_at DESC);

ALTER TABLE public.team_locations ENABLE ROW LEVEL SECURITY;

-- Toda la empresa lo ve: el jefe, SST y quien coordina el trabajo
DROP POLICY IF EXISTS team_locations_select ON public.team_locations;
CREATE POLICY team_locations_select ON public.team_locations
  FOR SELECT TO authenticated USING (public.is_org_member(org_id));

-- Cada quien reporta solo su propia ubicación
DROP POLICY IF EXISTS team_locations_insert ON public.team_locations;
CREATE POLICY team_locations_insert ON public.team_locations
  FOR INSERT TO authenticated
  WITH CHECK (public.is_org_member(org_id) AND user_id = auth.uid());

DROP POLICY IF EXISTS team_locations_delete ON public.team_locations;
CREATE POLICY team_locations_delete ON public.team_locations
  FOR DELETE TO authenticated
  USING (
    user_id = auth.uid() OR EXISTS (
      SELECT 1 FROM public.organization_members m
      WHERE m.org_id = team_locations.org_id AND m.user_id = auth.uid()
        AND m.role IN ('owner', 'admin', 'management')
    )
  );

GRANT SELECT, INSERT, DELETE ON public.team_locations TO authenticated;

-- Tiempo real: el tablero del jefe y de SST se actualiza solo
DO $$
DECLARE
  t text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    RETURN;
  END IF;
  FOREACH t IN ARRAY ARRAY['team_locations', 'work_orders', 'mission_inspections', 'organization_members'] LOOP
    IF to_regclass('public.' || t) IS NOT NULL
       AND EXISTS (SELECT 1 FROM pg_constraint c WHERE c.conrelid = to_regclass('public.' || t) AND c.contype = 'p')
       AND NOT EXISTS (
         SELECT 1 FROM pg_publication_tables
         WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = t) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    END IF;
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';
