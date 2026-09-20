-- IncubApp: presencia y última ubicación de miembros de la organización
-- Ejecutar en el SQL Editor de Supabase (opcional pero recomendado).
-- La app funciona con Realtime Presence aunque esta tabla no exista;
-- la tabla añade heartbeat persistente y respaldo si el canal falla.

CREATE TABLE IF NOT EXISTS public.member_presence (
  org_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  lat double precision,
  lng double precision,
  accuracy_m double precision,
  location_at timestamptz,
  display_name text,
  role text,
  area text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (org_id, user_id)
);

CREATE INDEX IF NOT EXISTS member_presence_org_seen_idx
  ON public.member_presence (org_id, last_seen_at DESC);

ALTER TABLE public.member_presence ENABLE ROW LEVEL SECURITY;

-- Lectura: miembros de la misma org (no clientes externos si se desea filtrar en app)
DROP POLICY IF EXISTS member_presence_select ON public.member_presence;
CREATE POLICY member_presence_select ON public.member_presence
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.organization_members m
      WHERE m.org_id = member_presence.org_id
        AND m.user_id = auth.uid()
    )
  );

-- Inserción / actualización: solo la propia fila
DROP POLICY IF EXISTS member_presence_upsert ON public.member_presence;
CREATE POLICY member_presence_upsert ON public.member_presence
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.organization_members m
      WHERE m.org_id = member_presence.org_id
        AND m.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS member_presence_update ON public.member_presence;
CREATE POLICY member_presence_update ON public.member_presence
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS member_presence_delete ON public.member_presence;
CREATE POLICY member_presence_delete ON public.member_presence
  FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- Admin de plataforma (si existe la función)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'is_platform_admin'
  ) THEN
    EXECUTE $pol$
      DROP POLICY IF EXISTS member_presence_admin ON public.member_presence;
      CREATE POLICY member_presence_admin ON public.member_presence
        FOR ALL TO authenticated
        USING (public.is_platform_admin())
        WITH CHECK (public.is_platform_admin());
    $pol$;
  END IF;
END $$;
