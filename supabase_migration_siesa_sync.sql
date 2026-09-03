-- ══════════════════════════════════════════════════════════════════
-- Integración Siesa (ERP contable) — config por org + log de sync
-- Ejecutar en Supabase → SQL Editor
-- ══════════════════════════════════════════════════════════════════

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1) Configuración Siesa por empresa (JSON flexible)
CREATE TABLE IF NOT EXISTS public.org_siesa_config (
  org_id uuid PRIMARY KEY REFERENCES public.organizations (id) ON DELETE CASCADE,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES public.profiles (id) ON DELETE SET NULL
);

COMMENT ON TABLE public.org_siesa_config IS
  'Configuración de integración Siesa por tenant (modo REST/planos, CIA, CO, mapeos).';

-- 2) Log de sincronizaciones
CREATE TABLE IF NOT EXISTS public.siesa_sync_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  mode text,
  count_total int NOT NULL DEFAULT 0,
  count_synced int NOT NULL DEFAULT 0,
  count_errors int NOT NULL DEFAULT 0,
  detail jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.profiles (id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS siesa_sync_log_org_created_idx
  ON public.siesa_sync_log (org_id, created_at DESC);

-- 3) Campos de sync en remisiones (si existe la tabla)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'sales_remittances'
  ) THEN
    ALTER TABLE public.sales_remittances
      ADD COLUMN IF NOT EXISTS siesa_synced_at timestamptz,
      ADD COLUMN IF NOT EXISTS siesa_synced_by uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS siesa_external_id text;

    CREATE INDEX IF NOT EXISTS sales_remittances_siesa_pending_idx
      ON public.sales_remittances (org_id)
      WHERE siesa_synced_at IS NULL AND status IS DISTINCT FROM 'cancelled';
  END IF;
END $$;

-- 4) Campos opcionales en pedidos / clientes
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'sales_orders'
  ) THEN
    ALTER TABLE public.sales_orders
      ADD COLUMN IF NOT EXISTS siesa_synced_at timestamptz,
      ADD COLUMN IF NOT EXISTS siesa_external_id text;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'customers'
  ) THEN
    ALTER TABLE public.customers
      ADD COLUMN IF NOT EXISTS siesa_synced_at timestamptz,
      ADD COLUMN IF NOT EXISTS siesa_external_id text;
  END IF;
END $$;

-- 5) RLS básica (misma lógica multi-tenant: miembro de la org)
ALTER TABLE public.org_siesa_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.siesa_sync_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS org_siesa_config_member_all ON public.org_siesa_config;
CREATE POLICY org_siesa_config_member_all ON public.org_siesa_config
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.organization_members m
      WHERE m.org_id = org_siesa_config.org_id AND m.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.platform_role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.organization_members m
      WHERE m.org_id = org_siesa_config.org_id AND m.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.platform_role = 'admin'
    )
  );

DROP POLICY IF EXISTS siesa_sync_log_member_select ON public.siesa_sync_log;
CREATE POLICY siesa_sync_log_member_select ON public.siesa_sync_log
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.organization_members m
      WHERE m.org_id = siesa_sync_log.org_id AND m.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.platform_role = 'admin'
    )
  );

DROP POLICY IF EXISTS siesa_sync_log_member_insert ON public.siesa_sync_log;
CREATE POLICY siesa_sync_log_member_insert ON public.siesa_sync_log
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.organization_members m
      WHERE m.org_id = siesa_sync_log.org_id AND m.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.platform_role = 'admin'
    )
  );
