/**
 * ARCHIVO / FILE: scripts/transferencias_whatsapp/pruebas/generarBaseDePrueba.mjs
 * AUTOR / AUTHOR: Henry Taborda — Ing. en desarrollo de software
 *
 * ES: Genera un SQL con un esquema mínimo parecido al de producción (plantas, máquinas,
 *     perfiles, cargues y transferencias) y datos reales (máquinas del respaldo
 *     .respaldo/machines-2026-08-24.json y cargues de los mapas de septiembre), para
 *     probar la migración en un PostgreSQL local antes de subirla.
 * EN: Generates SQL with a minimal production-like schema (plants, machines, profiles,
 *     loads and transfers) and real data (machines from the backup and loads from the
 *     September maps), to test the migration on a local PostgreSQL before shipping it.
 *
 * USO / USAGE:
 *   node scripts/transferencias_whatsapp/pruebas/generarBaseDePrueba.mjs > base.sql
 *   psql -v ON_ERROR_STOP=1 -f base.sql
 *   (BEGIN; migración; COMMIT;) dos veces → la segunda no debe crear nada nuevo.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { leerMapasDeCargue } from '../funciones/leerMapasDeCargue.mjs'

// ES: Ruta dentro del repositorio. EN: Path inside the repository.
const raiz = (rel) => fileURLToPath(new URL(`../../../${rel}`, import.meta.url))
// ES: Comillas SQL. EN: SQL quoting.
const q = (v) => (v == null ? 'NULL' : `'${String(v).replace(/'/g, "''")}'`)
// ES: Ids fijos de prueba. EN: Fixed test ids.
const ORG = '00000000-0000-0000-0000-00000000a001'
const AUTOR = '00000000-0000-0000-0000-00000000b001'
const PLANTA = 'ea0d6e60-928a-4e47-84f9-504bf217136b'

// ES: Máquinas reales del respaldo. EN: Real machines from the backup.
const maquinas = JSON.parse(readFileSync(raiz('.respaldo/machines-2026-08-24.json'), 'utf8'))
// ES: Mapas reales → un cargue por mapa (lote = lotes del mapa). EN: Real maps → one load per map.
const mapas = leerMapasDeCargue(raiz('scripts/september_load_maps_raw.json')).filter((m) => !m.descartado)
const idPorCodigo = new Map(maquinas.map((m) => [m.code, m.id]))

const sql = []
sql.push(`CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE TABLE public.plants (id uuid PRIMARY KEY, org_id uuid NOT NULL, name text, code text);
CREATE TABLE public.machines (id uuid PRIMARY KEY, plant_id uuid, room_id uuid, code text, name text, type text, status text);
CREATE TABLE public.profiles (id uuid PRIMARY KEY, full_name text);
CREATE TABLE public.setter_loads (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), org_id uuid, plant_id uuid, machine_id uuid, batch_id uuid, lote text, loaded_at timestamptz, cycle_start_at timestamptz, created_by uuid);
CREATE TABLE public.transfers (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), org_id uuid NOT NULL, plant_id uuid, batch_id uuid, lote text NOT NULL, mode text, room_ids uuid[] DEFAULT '{}', weight_diff numeric, cycle_start_at timestamptz, transferred_at timestamptz NOT NULL DEFAULT now(), photo_path text NOT NULL, created_by uuid NOT NULL, created_at timestamptz DEFAULT now());
INSERT INTO public.plants VALUES ('${PLANTA}', '${ORG}', 'Planta Incubant', 'P1');
INSERT INTO public.profiles VALUES ('${AUTOR}', 'Henry Camilo Taborda Galeano');`)
for (const m of maquinas) sql.push(`INSERT INTO public.machines VALUES (${q(m.id)}, ${q(PLANTA)}, ${q(m.room_id)}, ${q(m.code)}, ${q(m.name)}, ${q(m.type)}, ${q(m.status)});`)
for (const m of mapas) {
  if (!idPorCodigo.has(m.codigo)) continue
  sql.push(`INSERT INTO public.setter_loads (org_id, plant_id, machine_id, lote, loaded_at, cycle_start_at, created_by) VALUES ('${ORG}', '${PLANTA}', ${q(idPorCodigo.get(m.codigo))}, ${q(m.lotes.join(' y '))}, ${q(m.cargadoEn)}, ${q(m.inicioCiclo)}, '${AUTOR}');`)
}
// ES: Transferencia que ya se registró en la app (debe detectarse y no duplicarse).
// EN: Transfer already recorded in the app (must be detected, not duplicated).
sql.push(`ALTER TABLE public.transfers ADD COLUMN source_machine_id uuid;
INSERT INTO public.transfers (org_id, plant_id, lote, mode, room_ids, transferred_at, photo_path, created_by, source_machine_id)
VALUES ('${ORG}', '${PLANTA}', '44 + 45 + 43 + 46', 'single', '{}', '2026-10-03T12:30:00-05:00', 'org/transfers/x.jpg', '${AUTOR}', ${q(idPorCodigo.get('INC-05'))});`)
console.log(sql.join('\n'))
