-- ══════════════════════════════════════════════════════════════════
-- Registro de accesos y metadatos de dispositivo por usuario
-- (módulo de desarrollador / consola CDH Maker). Auditable + exportable.
-- Ejecutar en Supabase → SQL Editor (o vía apply_migration).
-- Henry Stark · CDH Maker
-- ══════════════════════════════════════════════════════════════════

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS public.user_access_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  org_id uuid REFERENCES public.organizations (id) ON DELETE SET NULL,
  -- login (nueva sesión) | session (apertura de app) | logout
  event_type text NOT NULL DEFAULT 'session'
    CHECK (event_type IN ('login', 'session', 'app_open', 'logout')),
  role text,
  area text,
  platform_role text,
  -- Metadatos de dispositivo / navegador
  user_agent text,
  browser text,
  os text,
  device_type text,           -- mobile | tablet | desktop
  platform text,
  language text,
  timezone text,
  screen_w int,
  screen_h int,
  viewport_w int,
  viewport_h int,
  pixel_ratio numeric(6, 3),
  device_memory numeric(6, 2),
  hardware_concurrency int,
  max_touch_points int,
  online boolean,
  app_version text,
  url text,
  referrer text,
  ip text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS user_access_log_user_idx
  ON public.user_access_log (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS user_access_log_created_idx
  ON public.user_access_log (created_at DESC);
CREATE INDEX IF NOT EXISTS user_access_log_org_idx
  ON public.user_access_log (org_id, created_at DESC);

ALTER TABLE public.user_access_log ENABLE ROW LEVEL SECURITY;

-- Lectura: admin de plataforma (consola desarrollador) o el propio usuario.
DROP POLICY IF EXISTS user_access_log_select ON public.user_access_log;
CREATE POLICY user_access_log_select ON public.user_access_log
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.platform_role = 'admin'
    )
  );

-- Inserción: solo el propio usuario registra sus accesos.
DROP POLICY IF EXISTS user_access_log_insert ON public.user_access_log;
CREATE POLICY user_access_log_insert ON public.user_access_log
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

COMMENT ON TABLE public.user_access_log IS
  'Bitácora de accesos a la app y metadatos de dispositivo por usuario (consola desarrollador CDH Maker).';
