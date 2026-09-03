-- ══════════════════════════════════════════════════════════════════
-- Registro de EDAD DE PARVADA por lote (flock_lots)
--
-- PROPÓSITO: el mapa de cargue Petersime debe ubicar cada carro según
-- TRES factores reales (Petersime, "How to correctly load incubators
-- with eggs from different flocks"): fertilidad de la parvada, edad/
-- tamaño del huevo y tiempo de almacenamiento. Fertilidad y edad de
-- parvada NO se digitan cada vez que se clasifica: se guardan una vez
-- por lote (código 41, 42, 43…) y el sistema calcula la edad ACTUAL
-- sumando las semanas transcurridas desde la última actualización
-- (reference_date). Así, empresas que solo tienen el módulo de planta
-- (sin el módulo Levantes/Datos completo) igual pueden alimentar este
-- dato mínimo y el cargue queda bien calibrado.
--
-- Regla de fertilidad (Petersime): parvada "prime" 30–44 semanas =
-- fertilidad alta; fuera de ese rango, media o baja según distancia.
-- Ver src/lib/flockLots.js (fertilityTierFromAge).
--
-- Ejecutar en Supabase → SQL Editor (o vía apply_migration).
-- Aditiva e idempotente. RLS igual a incubation_lots / classification_orders.
-- Henry Stark · CDH Maker
-- ══════════════════════════════════════════════════════════════════

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS public.flock_lots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  lot_code text NOT NULL,
  -- Edad de la parvada (en semanas) EN reference_date. La edad actual se
  -- deriva en el cliente: age_weeks_at + floor((hoy - reference_date) / 7).
  age_weeks_at int CHECK (age_weeks_at IS NULL OR age_weeks_at >= 0),
  reference_date date NOT NULL DEFAULT current_date,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'retired')),
  notes text,
  updated_by uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, lot_code)
);

CREATE INDEX IF NOT EXISTS flock_lots_org_idx ON public.flock_lots (org_id, status);

ALTER TABLE public.flock_lots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS flock_lots_member_all ON public.flock_lots;
CREATE POLICY flock_lots_member_all ON public.flock_lots
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.organization_members m
      WHERE m.org_id = flock_lots.org_id AND m.user_id = (select auth.uid())
    )
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = (select auth.uid()) AND p.platform_role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.organization_members m
      WHERE m.org_id = flock_lots.org_id AND m.user_id = (select auth.uid())
    )
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = (select auth.uid()) AND p.platform_role = 'admin'
    )
  );

CREATE TRIGGER trg_flock_lots_updated_at
  BEFORE UPDATE ON public.flock_lots
  FOR EACH ROW EXECUTE FUNCTION private.set_updated_at();

ALTER PUBLICATION supabase_realtime ADD TABLE public.flock_lots;

COMMENT ON TABLE public.flock_lots IS
  'Edad de parvada por código de lote (para fertilidad estimada en el mapa de cargue). age_weeks_at es la edad EN reference_date; la edad actual se calcula sumando semanas transcurridas.';

-- ── Semilla: edades conocidas a la fecha de referencia (Antioqueña de Incubación SAS) ──
INSERT INTO public.flock_lots (org_id, lot_code, age_weeks_at, reference_date, status, notes)
VALUES
  ('d54fca1e-1878-4967-aee5-330aa2e631cc', '41', NULL, '2026-07-19', 'retired', 'Parvada de salida (ya finalizó ciclo).'),
  ('d54fca1e-1878-4967-aee5-330aa2e631cc', '42', 62, '2026-07-19', 'active', NULL),
  ('d54fca1e-1878-4967-aee5-330aa2e631cc', '43', 54, '2026-07-19', 'active', NULL),
  ('d54fca1e-1878-4967-aee5-330aa2e631cc', '44', 48, '2026-07-19', 'active', NULL),
  ('d54fca1e-1878-4967-aee5-330aa2e631cc', '45', 49, '2026-07-19', 'active', NULL),
  ('d54fca1e-1878-4967-aee5-330aa2e631cc', '46', 32, '2026-07-19', 'active', NULL)
ON CONFLICT (org_id, lot_code) DO UPDATE SET
  age_weeks_at = EXCLUDED.age_weeks_at,
  reference_date = EXCLUDED.reference_date,
  status = EXCLUDED.status,
  notes = EXCLUDED.notes,
  updated_at = now();
