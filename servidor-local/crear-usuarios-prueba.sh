#!/usr/bin/env bash
# IncubApp · servidor local — usuarios de prueba, uno por rol (y un líder por área),
# en una empresa aparte «Empresa de prueba (QA)» con su planta, salas y máquinas.
# Nada de lo que hagan esos usuarios aparece en los datos de las empresas reales.
# Se puede volver a correr: no duplica nada y deja la misma contraseña.
# Correos: qa.<rol>[.<área>]@incubapp.test · contraseña en servidor-local/usuarios-prueba.local
# Uso (en WSL como root): bash crear-usuarios-prueba.sh /mnt/c/IncubApp
set -euo pipefail
RAIZ="${1:-/mnt/c/IncubApp}"
SRV=/opt/incubapp/server
ARCHIVO="$RAIZ/servidor-local/usuarios-prueba.local"
env_de() { grep "^$1=" "$SRV/.env" | head -1 | cut -d= -f2-; }
PGPW=$(env_de POSTGRES_PASSWORD)
KEY=$(env_de SERVICE_ROLE_KEY)
API=http://localhost:8000
sql() { docker exec -i -e PGPASSWORD="$PGPW" supabase-db psql -h localhost -U supabase_admin -d postgres -v ON_ERROR_STOP=1 -tA "$@"; }

# Contraseña: la del archivo si ya existe; si no, una nueva al azar.
if [ -f "$ARCHIVO" ] && grep -q '^CONTRASEÑA=' "$ARCHIVO"; then
  PASS=$(grep '^CONTRASEÑA=' "$ARCHIVO" | cut -d= -f2-)
else
  PASS="Qa-$(openssl rand -hex 6)-Incub"
fi

# rol|área|nombre visible
USUARIOS=$(cat <<'LISTA'
owner||Propietario
admin||Administrador
management||Gerencia
management_auxiliary||Auxiliar de gerencia
supervisor||Supervisor de planta
operator||Operario de turno
auxiliary||Auxiliar de turno
auxiliary_production||Auxiliar de producción
reception_operator||Operario de recepción
barn_operator||Operario galponero
maintenance_auxiliary||Auxiliar de mantenimiento
hr_auxiliary||Auxiliar de RR. HH.
accounting_auxiliary||Auxiliar de contabilidad
sales_logistics_auxiliary||Auxiliar de ventas
logistics_auxiliary||Auxiliar de logística
driver||Conductor
customer||Cliente
sst_auxiliary||Auxiliar de SST
environmental_auxiliary||Auxiliar ambiental
plant_veterinarian||Veterinario de planta
vaccination_auxiliary||Auxiliar de vacunación
viewer||Observador
coordinator|general|Líder general
coordinator|plant|Líder de planta
coordinator|farm|Líder de granja
coordinator|maintenance|Líder de mantenimiento
coordinator|quality|Líder de calidad
coordinator|hr|Líder de RR. HH.
coordinator|management|Líder de gerencia
coordinator|accounting|Líder de contabilidad
coordinator|sales|Líder de ventas
coordinator|logistics|Líder de logística
coordinator|sst|Líder de SST
coordinator|environmental|Líder ambiental
coordinator|veterinary|Líder de sanidad veterinaria
LISTA
)

echo "==> Empresa, planta, salas y máquinas de prueba"
ORG=$(sql <<'SQL'
insert into public.organizations (name, slug, legal_name, country, timezone, settings, brand_key)
select 'Empresa de prueba (QA)', 'prueba-qa', 'Empresa de prueba IncubApp', 'CO', 'America/Bogota',
       coalesce((select settings from public.organizations where name ilike 'Antioque%' limit 1), '{}'::jsonb) || '{"qa": true}'::jsonb,
       (select brand_key from public.organizations where name ilike 'Antioque%' limit 1)
where not exists (select 1 from public.organizations where slug = 'prueba-qa');
select id from public.organizations where slug = 'prueba-qa';
SQL
)
ORG=$(echo "$ORG" | tail -1)
sql -v org="$ORG" <<'SQL' >/dev/null
insert into public.plants (org_id, name, code, city, timezone)
select :'org', 'Planta de prueba', 'PQA', 'Medellín', 'America/Bogota'
where not exists (select 1 from public.plants where org_id = :'org' and code = 'PQA');
with p as (select id from public.plants where org_id = :'org' and code = 'PQA')
insert into public.rooms (plant_id, org_id, name, code, type)
select p.id, :'org', r.name, r.code, r.type::room_type
from p, (values ('Incubadoras QA', 'SI-QA', 'incubation'), ('Nacedoras QA', 'SN-QA', 'hatching'), ('Cuarto técnico QA', 'CT-QA', 'technical')) as r(name, code, type)
where not exists (select 1 from public.rooms x where x.plant_id = p.id and x.code = r.code);
with p as (select id from public.plants where org_id = :'org' and code = 'PQA')
insert into public.machines (plant_id, room_id, code, name, type, status)
select p.id, (select id from public.rooms where plant_id = p.id and code = m.room), m.code, m.name, m.type::machine_type, 'active'
from p, (values
  ('INC-001.1', 'Incubadora QA 1', 'setter', 'SI-QA'),
  ('INC-001.2', 'Incubadora QA 2', 'setter', 'SI-QA'),
  ('INC-001.3', 'Incubadora QA 3', 'setter', 'SI-QA'),
  ('NAC-001.1', 'Nacedora QA 1', 'hatcher', 'SN-QA'),
  ('NAC-001.2', 'Nacedora QA 2', 'hatcher', 'SN-QA'),
  ('005.4', 'Chiller QA', 'chiller', 'CT-QA')
) as m(code, name, type, room)
where not exists (select 1 from public.machines x where x.plant_id = p.id and x.code = m.code);
SQL
echo "   empresa $ORG"

echo "==> Cuentas"
{
  echo "# Usuarios de prueba de IncubApp (empresa «Empresa de prueba (QA)»). NO se versiona."
  echo "# Entrar en https://incubapp.cdhmaker.com o http://127.0.0.1 con cualquiera de estos correos."
  echo "CONTRASEÑA=$PASS"
  echo
} > "$ARCHIVO.tmp"
creadas=0; existian=0
while IFS='|' read -r ROL AREA NOMBRE; do
  [ -n "$ROL" ] || continue
  EMAIL="qa.${ROL//_/-}${AREA:+.$AREA}@incubapp.test"
  FULL="Prueba · $NOMBRE"
  ID=$(sql -c "select id from auth.users where email = '$EMAIL'" </dev/null)
  if [ -z "$ID" ]; then
    RESP=$(curl -s -X POST "$API/auth/v1/admin/users" -H "apikey: $KEY" -H "Authorization: Bearer $KEY" -H 'Content-Type: application/json' \
      -d "{\"email\":\"$EMAIL\",\"password\":\"$PASS\",\"email_confirm\":true,\"user_metadata\":{\"full_name\":\"$FULL\"}}")
    ID=$(echo "$RESP" | sed -n 's/^{"id":"\([0-9a-f-]*\)".*/\1/p')
    [ -n "$ID" ] || { echo "   ERROR al crear $EMAIL: $(echo "$RESP" | head -c 200)"; continue; }
    creadas=$((creadas + 1))
  else
    curl -s -o /dev/null -X PUT "$API/auth/v1/admin/users/$ID" -H "apikey: $KEY" -H "Authorization: Bearer $KEY" -H 'Content-Type: application/json' \
      -d "{\"password\":\"$PASS\",\"email_confirm\":true}"
    existian=$((existian + 1))
  fi
  sql -v id="$ID" -v org="$ORG" -v rol="$ROL" -v area="${AREA:-general}" -v nombre="$FULL" -v email="$EMAIL" <<'SQL' >/dev/null
insert into public.profiles (id, full_name, email, is_approved, platform_role) values (:'id', :'nombre', :'email', true, 'user')
on conflict (id) do update set full_name = excluded.full_name, email = excluded.email, is_approved = true, platform_role = 'user';
insert into public.organization_members (org_id, user_id, role, area)
select :'org', :'id', :'rol'::user_role, :'area'::work_area
where not exists (select 1 from public.organization_members where org_id = :'org' and user_id = :'id');
update public.organization_members set role = :'rol'::user_role, area = :'area'::work_area where org_id = :'org' and user_id = :'id';
SQL
  printf '%-58s %s\n' "$EMAIL" "$NOMBRE" >> "$ARCHIVO.tmp"
done <<< "$USUARIOS"
mv "$ARCHIVO.tmp" "$ARCHIVO"
echo "   creadas $creadas · ya existían $existian"

echo "==> Turnos de hoy y mañana (hora de Colombia) para el personal de turno"
sql -v org="$ORG" <<'SQL' >/dev/null
with ahora as (select (now() at time zone 'America/Bogota') t),
turno as (
  select case when extract(hour from t) >= 6 and extract(hour from t) < 14 then 1
              when extract(hour from t) >= 14 and extract(hour from t) < 22 then 2 else 3 end n,
         case when extract(hour from t) < 6 then (t - interval '1 day')::date else t::date end d
  from ahora
),
gente as (
  select m.user_id from public.organization_members m
  where m.org_id = :'org' and m.role in ('operator', 'auxiliary', 'auxiliary_production', 'reception_operator')
),
filas as (
  select g.user_id, t.d as work_date, t.n as shift_number from gente g, turno t
  union all
  select g.user_id, t.d + 1, t.n from gente g, turno t
)
insert into public.shift_assignments (org_id, plant_id, user_id, work_date, shift_number, is_rest, created_by)
select :'org', (select id from public.plants where org_id = :'org' and code = 'PQA'), f.user_id, f.work_date, f.shift_number, false,
       (select user_id from public.organization_members where org_id = :'org' and role = 'supervisor' limit 1)
from filas f
on conflict (org_id, user_id, work_date) do update set shift_number = excluded.shift_number, is_rest = false;
SQL
echo "==> Listo. Correos y contraseña en servidor-local/usuarios-prueba.local"
