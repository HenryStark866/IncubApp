-- =============================================================================
-- IncubApp · Fotos y evidencias solo para la empresa dueña · 13-10-2026
--
-- Hallazgo de la auditoría:
--   1. Los depósitos machine-checks (rondas, cargues, nacimientos, misionales, remisiones),
--      wo-evidence (evidencias de OT) y sig-evidence (SIG) estaban marcados como PÚBLICOS:
--      cualquiera con el enlace de una foto la podía abrir sin iniciar sesión.
--   2. Las reglas checks_storage_insert / checks_storage_select dejaban a cualquier usuario con
--      sesión subir y leer en esos depósitos, de cualquier empresa (solo miraban el depósito).
--
-- Ahora: los tres depósitos son privados (la app, el recorrido 3D, el lector y n8n ya usan
-- enlaces firmados o leen el disco) y solo los miembros aprobados de la empresa —la primera
-- carpeta de la ruta es el id de la empresa— suben y leen sus archivos. Las fotos de perfil
-- (avatars) siguen públicas para verse en la app.
-- Idempotente.
-- =============================================================================

UPDATE storage.buckets SET public = false WHERE id IN ('machine-checks', 'wo-evidence', 'sig-evidence');

DROP POLICY IF EXISTS checks_storage_insert ON storage.objects;
DROP POLICY IF EXISTS checks_storage_select ON storage.objects;

DROP POLICY IF EXISTS org_files_insert ON storage.objects;
CREATE POLICY org_files_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id IN ('machine-checks', 'wo-evidence', 'sig-evidence')
    AND (
      (SELECT private.is_platform_admin())
      OR (storage.foldername(name))[1] IN (SELECT o::text FROM private.my_org_ids() o)
    )
  );

DROP POLICY IF EXISTS org_files_select ON storage.objects;
CREATE POLICY org_files_select ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id IN ('machine-checks', 'wo-evidence', 'sig-evidence')
    AND (
      (SELECT private.is_platform_admin())
      OR (storage.foldername(name))[1] IN (SELECT o::text FROM private.my_org_ids() o)
    )
  );

-- Reemplazar un archivo propio (subidas con upsert, p. ej. la evidencia de Misionales)
DROP POLICY IF EXISTS org_files_update ON storage.objects;
CREATE POLICY org_files_update ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id IN ('machine-checks', 'wo-evidence', 'sig-evidence')
    AND (storage.foldername(name))[1] IN (SELECT o::text FROM private.my_org_ids() o)
  )
  WITH CHECK (
    bucket_id IN ('machine-checks', 'wo-evidence', 'sig-evidence')
    AND (storage.foldername(name))[1] IN (SELECT o::text FROM private.my_org_ids() o)
  );
