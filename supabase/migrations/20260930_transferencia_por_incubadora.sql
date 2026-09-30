-- IncubApp: la transferencia sale de una INCUBADORA y va a NACEDORAS en el orden que
-- indica el turnero (30-09-2026). Antes se elegía el lote y una sala de nacedoras.
--   source_machine_id  incubadora de origen
--   hatcher_ids        nacedoras destino, en el orden del turnero
--   allocations        qué recibe cada nacedora: [{order, hatcher_id, carts[], lots[{lot,trays}], trays, eggs}]
--   load_map_id        mapa de cargue de donde salieron los carros (si había)
-- room_ids, lote y mode se siguen llenando (salas de esas nacedoras, «41 + 43», sencilla
-- o doble) para que nacimientos, tableros y reportes sigan funcionando igual.
-- Idempotente: se puede aplicar varias veces.
DO $$
BEGIN
  IF to_regclass('public.transfers') IS NULL THEN
    RAISE NOTICE 'No existe public.transfers: nada que hacer';
    RETURN;
  END IF;
  ALTER TABLE public.transfers
    ADD COLUMN IF NOT EXISTS source_machine_id uuid,
    ADD COLUMN IF NOT EXISTS hatcher_ids uuid[] NOT NULL DEFAULT '{}'::uuid[],
    ADD COLUMN IF NOT EXISTS allocations jsonb NOT NULL DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS load_map_id text;
  CREATE INDEX IF NOT EXISTS transfers_source_machine_idx
    ON public.transfers (org_id, source_machine_id, transferred_at DESC);
END $$;

NOTIFY pgrst, 'reload schema';
