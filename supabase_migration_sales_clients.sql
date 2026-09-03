-- ══════════════════════════════════════════════════════════════════
-- Ventas: tablas customers + sales_orders
-- Copia TODO este archivo en Supabase → SQL Editor → Run
-- Proyecto: pdxlmjlooeqlvvgbosbu (o el tuyo)
-- ══════════════════════════════════════════════════════════════════

-- 0) Extensiones
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1) Tabla CLIENTES (CRM)
CREATE TABLE IF NOT EXISTS public.customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  user_id uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  code text,
  name text NOT NULL,
  contact_name text,
  email text,
  phone text,
  city text,
  department text,
  address text,
  website text,
  nit text,
  status text NOT NULL DEFAULT 'prospect'
    CHECK (status IN ('prospect', 'active', 'inactive', 'blocked')),
  product_interest text NOT NULL DEFAULT 'day_old_chicks'
    CHECK (product_interest IN ('day_old_chicks', 'eggs', 'both', 'other')),
  buys_day_old_chicks boolean NOT NULL DEFAULT true,
  farm_type text,
  capacity_birds int,
  notes text,
  last_order_at timestamptz,
  created_by uuid REFERENCES public.profiles (id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS customers_org_idx ON public.customers (org_id);
CREATE INDEX IF NOT EXISTS customers_org_day_old_idx
  ON public.customers (org_id, buys_day_old_chicks)
  WHERE buys_day_old_chicks = true AND status IN ('prospect', 'active');
CREATE INDEX IF NOT EXISTS customers_user_idx ON public.customers (user_id)
  WHERE user_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS customers_org_code_uidx
  ON public.customers (org_id, code)
  WHERE code IS NOT NULL;

-- 2) Tabla PEDIDOS
CREATE TABLE IF NOT EXISTS public.sales_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES public.customers (id) ON DELETE RESTRICT,
  code text,
  product_type text NOT NULL DEFAULT 'day_old_chicks'
    CHECK (product_type IN ('day_old_chicks', 'eggs', 'other')),
  qty_females int NOT NULL DEFAULT 0,
  qty_males int NOT NULL DEFAULT 0,
  unit_price numeric(14, 2),
  currency text DEFAULT 'COP',
  status text NOT NULL DEFAULT 'requested'
    CHECK (status IN (
      'requested', 'confirmed', 'scheduled', 'dispatched', 'delivered', 'cancelled'
    )),
  requested_date date,
  delivery_date date,
  delivery_address text,
  notes text,
  created_by uuid REFERENCES public.profiles (id),
  confirmed_by uuid REFERENCES public.profiles (id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- qty_total calculado (si falla en tu PG, se omite)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'sales_orders' AND column_name = 'qty_total'
  ) THEN
    ALTER TABLE public.sales_orders
      ADD COLUMN qty_total int
      GENERATED ALWAYS AS (COALESCE(qty_females, 0) + COALESCE(qty_males, 0)) STORED;
  END IF;
EXCEPTION WHEN others THEN
  RAISE NOTICE 'qty_total omitido: %', SQLERRM;
END $$;

CREATE INDEX IF NOT EXISTS sales_orders_org_idx ON public.sales_orders (org_id, created_at DESC);
CREATE INDEX IF NOT EXISTS sales_orders_customer_idx ON public.sales_orders (customer_id);
CREATE INDEX IF NOT EXISTS sales_orders_status_idx ON public.sales_orders (org_id, status);

-- 3) Trigger last_order_at
CREATE OR REPLACE FUNCTION public.touch_customer_last_order()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.customers
  SET
    last_order_at = now(),
    updated_at = now(),
    status = CASE WHEN status = 'prospect' THEN 'active' ELSE status END
  WHERE id = NEW.customer_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sales_orders_touch_customer ON public.sales_orders;
CREATE TRIGGER sales_orders_touch_customer
  AFTER INSERT ON public.sales_orders
  FOR EACH ROW
  EXECUTE PROCEDURE public.touch_customer_last_order();

-- 4) RLS (políticas simples: miembros de la org + dueño de la ficha)
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales_orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS customers_select ON public.customers;
CREATE POLICY customers_select ON public.customers
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.organization_members m
      WHERE m.org_id = customers.org_id AND m.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS customers_insert ON public.customers;
CREATE POLICY customers_insert ON public.customers
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.organization_members m
      WHERE m.org_id = customers.org_id AND m.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS customers_update ON public.customers;
CREATE POLICY customers_update ON public.customers
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.organization_members m
      WHERE m.org_id = customers.org_id AND m.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.organization_members m
      WHERE m.org_id = customers.org_id AND m.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS customers_delete ON public.customers;
CREATE POLICY customers_delete ON public.customers
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.organization_members m
      WHERE m.org_id = customers.org_id
        AND m.user_id = auth.uid()
        AND m.role IN ('owner', 'admin', 'management', 'coordinator', 'sales_logistics_auxiliary')
    )
  );

DROP POLICY IF EXISTS sales_orders_select ON public.sales_orders;
CREATE POLICY sales_orders_select ON public.sales_orders
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.organization_members m
      WHERE m.org_id = sales_orders.org_id AND m.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.customers c
      WHERE c.id = sales_orders.customer_id AND c.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS sales_orders_insert ON public.sales_orders;
CREATE POLICY sales_orders_insert ON public.sales_orders
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.organization_members m
      WHERE m.org_id = sales_orders.org_id AND m.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.customers c
      WHERE c.id = sales_orders.customer_id AND c.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS sales_orders_update ON public.sales_orders;
CREATE POLICY sales_orders_update ON public.sales_orders
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.organization_members m
      WHERE m.org_id = sales_orders.org_id AND m.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.organization_members m
      WHERE m.org_id = sales_orders.org_id AND m.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS sales_orders_delete ON public.sales_orders;
CREATE POLICY sales_orders_delete ON public.sales_orders
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.organization_members m
      WHERE m.org_id = sales_orders.org_id
        AND m.user_id = auth.uid()
        AND m.role IN ('owner', 'admin', 'management', 'coordinator', 'sales_logistics_auxiliary')
    )
  );

-- 5) Grants para roles de API
GRANT SELECT, INSERT, UPDATE, DELETE ON public.customers TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sales_orders TO authenticated;
GRANT ALL ON public.customers TO service_role;
GRANT ALL ON public.sales_orders TO service_role;

-- 6) Realtime (ignora error si ya está)
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.customers;
EXCEPTION WHEN others THEN NULL;
END $$;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.sales_orders;
EXCEPTION WHEN others THEN NULL;
END $$;

-- 7) Verificación
SELECT 'customers' AS tabla, count(*)::int AS filas FROM public.customers
UNION ALL
SELECT 'sales_orders', count(*)::int FROM public.sales_orders;
