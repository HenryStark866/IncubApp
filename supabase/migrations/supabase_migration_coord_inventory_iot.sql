-- IncubApp: inventarios personalizados por coordinador
-- (libros de inventario + ítems desde cero)

CREATE TABLE IF NOT EXISTS public.coord_inventory_books (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  owner_user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  area text DEFAULT 'general',
  name text NOT NULL,
  description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS coord_inv_books_org_owner_idx
  ON public.coord_inventory_books (org_id, owner_user_id);

CREATE TABLE IF NOT EXISTS public.coord_inventory_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  book_id uuid NOT NULL REFERENCES public.coord_inventory_books (id) ON DELETE CASCADE,
  item_code text,
  item_name text NOT NULL,
  unit text NOT NULL DEFAULT 'und',
  qty_on_hand numeric(14, 3) NOT NULL DEFAULT 0,
  min_qty numeric(14, 3) DEFAULT 0,
  location text,
  notes text,
  custom_label text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS coord_inv_items_book_idx
  ON public.coord_inventory_items (book_id, item_name);

ALTER TABLE public.coord_inventory_books ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coord_inventory_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS coord_inv_books_member ON public.coord_inventory_books;
CREATE POLICY coord_inv_books_member ON public.coord_inventory_books
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.organization_members m
      WHERE m.org_id = coord_inventory_books.org_id AND m.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.organization_members m
      WHERE m.org_id = coord_inventory_books.org_id AND m.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS coord_inv_items_member ON public.coord_inventory_items;
CREATE POLICY coord_inv_items_member ON public.coord_inventory_items
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.organization_members m
      WHERE m.org_id = coord_inventory_items.org_id AND m.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.organization_members m
      WHERE m.org_id = coord_inventory_items.org_id AND m.user_id = auth.uid()
    )
  );
