-- IncubApp: flota logística — conductores, rutas, entregas, contactos, mensajes

CREATE TABLE IF NOT EXISTS public.logistics_drivers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  full_name text NOT NULL,
  phone text,
  license_id text,
  vehicle text,
  plate text,
  user_id uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  active boolean NOT NULL DEFAULT true,
  last_lat double precision,
  last_lng double precision,
  last_location_at timestamptz,
  on_route boolean NOT NULL DEFAULT false,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS logistics_drivers_org_idx
  ON public.logistics_drivers (org_id, active);

CREATE TABLE IF NOT EXISTS public.logistics_routes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  code text NOT NULL,
  name text NOT NULL,
  driver_id uuid REFERENCES public.logistics_drivers (id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'planned'
    CHECK (status IN ('planned', 'en_route', 'completed', 'cancelled')),
  plant_id uuid REFERENCES public.plants (id) ON DELETE SET NULL,
  plant_lat double precision,
  plant_lng double precision,
  plant_radius_m double precision DEFAULT 120,
  started_at timestamptz,
  ended_at timestamptz,
  notes text,
  created_by uuid REFERENCES public.profiles (id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS logistics_routes_org_idx
  ON public.logistics_routes (org_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS public.logistics_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  route_id uuid NOT NULL REFERENCES public.logistics_routes (id) ON DELETE CASCADE,
  sequence int NOT NULL DEFAULT 1,
  operation_type text NOT NULL DEFAULT 'delivery'
    CHECK (operation_type IN (
      'delivery', 'pickup', 'plant_return', 'transfer', 'other'
    )),
  label text,
  address text,
  lat double precision,
  lng double precision,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'departed', 'arrived', 'skipped', 'cancelled')),
  departed_at timestamptz,
  arrived_at timestamptz,
  remittance_id uuid,
  customer_name text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS logistics_deliveries_route_idx
  ON public.logistics_deliveries (route_id, sequence);

CREATE TABLE IF NOT EXISTS public.logistics_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  name text NOT NULL,
  kind text NOT NULL DEFAULT 'other'
    CHECK (kind IN ('mechanic', 'supplier', 'customer', 'fuel', 'other')),
  phone text,
  email text,
  city text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS logistics_contacts_org_idx
  ON public.logistics_contacts (org_id, kind);

CREATE TABLE IF NOT EXISTS public.logistics_driver_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  driver_id uuid NOT NULL REFERENCES public.logistics_drivers (id) ON DELETE CASCADE,
  sender_id uuid REFERENCES public.profiles (id),
  sender_role text DEFAULT 'logistics',
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS logistics_driver_msg_idx
  ON public.logistics_driver_messages (driver_id, created_at DESC);

ALTER TABLE public.logistics_drivers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.logistics_routes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.logistics_deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.logistics_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.logistics_driver_messages ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'logistics_drivers',
    'logistics_routes',
    'logistics_deliveries',
    'logistics_contacts',
    'logistics_driver_messages'
  ] LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I_member ON public.%I', t, t);
    EXECUTE format(
      'CREATE POLICY %I_member ON public.%I FOR ALL TO authenticated
       USING (EXISTS (SELECT 1 FROM public.organization_members m WHERE m.org_id = %I.org_id AND m.user_id = auth.uid()))
       WITH CHECK (EXISTS (SELECT 1 FROM public.organization_members m WHERE m.org_id = %I.org_id AND m.user_id = auth.uid()))',
      t, t, t, t
    );
  END LOOP;
END $$;
