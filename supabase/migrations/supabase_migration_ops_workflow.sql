-- IncubApp: flujo comercial + inventarios por área
-- Ejecutar en Supabase SQL Editor después de sales_clients.

-- 1) Remisiones / despachos (logística)
CREATE TABLE IF NOT EXISTS public.sales_remittances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  order_id uuid NOT NULL REFERENCES public.sales_orders (id) ON DELETE RESTRICT,
  customer_id uuid NOT NULL REFERENCES public.customers (id) ON DELETE RESTRICT,
  code text NOT NULL,
  dispatch_date date NOT NULL DEFAULT (CURRENT_DATE),
  vehicle text,
  driver_name text,
  qty_females int NOT NULL DEFAULT 0,
  qty_males int NOT NULL DEFAULT 0,
  delivery_address text,
  notes text,
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'dispatched', 'delivered', 'cancelled')),
  created_by uuid REFERENCES public.profiles (id),
  accounting_exported_at timestamptz,
  accounting_exported_by uuid REFERENCES public.profiles (id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS sales_remittances_org_idx
  ON public.sales_remittances (org_id, dispatch_date DESC);
CREATE INDEX IF NOT EXISTS sales_remittances_order_idx
  ON public.sales_remittances (order_id);
CREATE UNIQUE INDEX IF NOT EXISTS sales_remittances_org_code_uidx
  ON public.sales_remittances (org_id, code);

-- 2) Inventarios por área (huevos, alimento, compras, dotación…)
CREATE TABLE IF NOT EXISTS public.area_inventories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  category text NOT NULL
    CHECK (category IN (
      'eggs', 'feed', 'purchases', 'supplies', 'chicks', 'other'
    )),
  item_code text,
  item_name text NOT NULL,
  unit text NOT NULL DEFAULT 'und',
  qty_on_hand numeric(14, 3) NOT NULL DEFAULT 0,
  min_qty numeric(14, 3) DEFAULT 0,
  location text,
  responsible_user_id uuid REFERENCES public.profiles (id),
  responsible_label text,
  notes text,
  updated_by uuid REFERENCES public.profiles (id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS area_inventories_org_cat_idx
  ON public.area_inventories (org_id, category);
CREATE INDEX IF NOT EXISTS area_inventories_resp_idx
  ON public.area_inventories (org_id, responsible_user_id);

-- 3) Movimientos de inventario
CREATE TABLE IF NOT EXISTS public.inventory_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  inventory_id uuid NOT NULL REFERENCES public.area_inventories (id) ON DELETE CASCADE,
  movement_type text NOT NULL
    CHECK (movement_type IN ('in', 'out', 'adjust', 'transfer')),
  qty numeric(14, 3) NOT NULL,
  ref_type text,
  ref_id uuid,
  notes text,
  created_by uuid REFERENCES public.profiles (id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS inventory_movements_inv_idx
  ON public.inventory_movements (inventory_id, created_at DESC);

-- 4) Responsable principal por categoría de inventario
CREATE TABLE IF NOT EXISTS public.inventory_area_leads (
  org_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  category text NOT NULL
    CHECK (category IN (
      'eggs', 'feed', 'purchases', 'supplies', 'chicks', 'other', 'sales', 'logistics'
    )),
  user_id uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  label text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (org_id, category)
);

-- 5) RLS
ALTER TABLE public.sales_remittances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.area_inventories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_area_leads ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.is_org_member(p_org uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.organization_members m
    WHERE m.org_id = p_org AND m.user_id = auth.uid()
  );
$$;

DROP POLICY IF EXISTS remittances_all ON public.sales_remittances;
CREATE POLICY remittances_all ON public.sales_remittances
  FOR ALL TO authenticated
  USING (public.is_org_member(org_id))
  WITH CHECK (public.is_org_member(org_id));

DROP POLICY IF EXISTS area_inv_all ON public.area_inventories;
CREATE POLICY area_inv_all ON public.area_inventories
  FOR ALL TO authenticated
  USING (public.is_org_member(org_id))
  WITH CHECK (public.is_org_member(org_id));

DROP POLICY IF EXISTS inv_mov_all ON public.inventory_movements;
CREATE POLICY inv_mov_all ON public.inventory_movements
  FOR ALL TO authenticated
  USING (public.is_org_member(org_id))
  WITH CHECK (public.is_org_member(org_id));

DROP POLICY IF EXISTS inv_leads_all ON public.inventory_area_leads;
CREATE POLICY inv_leads_all ON public.inventory_area_leads
  FOR ALL TO authenticated
  USING (public.is_org_member(org_id))
  WITH CHECK (public.is_org_member(org_id));
