-- IncubApp: fotos de la llegada del huevo en recepción (etapa 2).
-- Las fotos se suben al bucket «machine-checks» bajo {org_id}/lot-arrivals/…, que ya
-- tiene políticas por empresa; aquí solo se guarda la lista de rutas.
-- Idempotente.
ALTER TABLE public.lot_arrivals
  ADD COLUMN IF NOT EXISTS photo_paths text[] NOT NULL DEFAULT '{}'::text[];
