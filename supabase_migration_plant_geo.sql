-- IncubApp: calibración GPS del plano de planta/granja
-- Permite proyectar personas en tiempo real sobre el FloorMap.

ALTER TABLE public.plants
  ADD COLUMN IF NOT EXISTS geo_origin_lat double precision,
  ADD COLUMN IF NOT EXISTS geo_origin_lng double precision,
  ADD COLUMN IF NOT EXISTS geo_rotation_deg double precision DEFAULT 0,
  ADD COLUMN IF NOT EXISTS geo_scale double precision DEFAULT 1;

COMMENT ON COLUMN public.plants.geo_origin_lat IS 'Latitud GPS del origen (0,0) del plano';
COMMENT ON COLUMN public.plants.geo_origin_lng IS 'Longitud GPS del origen (0,0) del plano';
COMMENT ON COLUMN public.plants.geo_rotation_deg IS 'Rotación del plano respecto al norte (grados, sentido horario)';
COMMENT ON COLUMN public.plants.geo_scale IS 'Escala: metros reales por metro del plano (1 = 1:1)';
