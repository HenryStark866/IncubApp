-- =============================================================================
-- Sede asignada por miembro (organization_members.site_id)
-- Para qué: un líder de sede (p. ej. el líder de G-GRANJA LA FE) ve solo su sede y su
-- gente; los auxiliares asignados a una sede ven primero el Plan AM de esa sede.
-- NULL = toda la empresa (comportamiento de siempre). La sede es una fila de «plants»
-- (las granjas también viven ahí: bird_batches.farm_id → plants).
-- Henry Stark Desarrollador
-- =============================================================================

ALTER TABLE public.organization_members
  ADD COLUMN IF NOT EXISTS site_id uuid REFERENCES public.plants(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS organization_members_site_id_idx ON public.organization_members(site_id);

COMMENT ON COLUMN public.organization_members.site_id IS
  'Sede asignada (plants.id). NULL = toda la empresa. Con sede, el líder solo ve su sede y su equipo.';

-- Asignación inicial pedida por Mantenimiento (2026-10-06): G-GRANJA LA FE
--   Dario León Villada (líder de granja) y los auxiliares de mantenimiento que ejecutan el Plan AM
--   de la granja: Jorge Arley Vázquez Araque y Johan Daniel Orrego Flórez.
UPDATE public.organization_members m
   SET site_id = s.id
  FROM public.plants s, public.profiles p
 WHERE s.org_id = m.org_id
   AND s.code = 'G-FE'
   AND p.id = m.user_id
   AND lower(p.email) IN (
     'lider.granja1@incubant.co',
     'francisjorge162@gmail.com',
     'johandanielorregoflorez23@gmail.com'
   );
