# n8n · bot de lecturas de rondas

Lee las fotos que toman los turneros de las pantallas Petersime (incubadoras y
nacedoras) y llena las lecturas del formato (FOMAT04 / control diario) en
`machine_checks`: temp. ovoscan, temp. aire, humedad (bulbo húmedo °F), CO₂ y
número de volteos. La posición de volteo no se lee: la sigue digitando el turnero.

## Instalar o actualizar

`10-INSTALAR-N8N.bat` (pide la clave de Claude `sk-ant-...`; Enter deja la guardada).
Se puede repetir. Abre n8n en **http://127.0.0.1:5678** (con `localhost` no carga
en este equipo). Usuario `admin@incubapp.local`; la clave queda en
`/opt/incubapp/n8n/.env` (`N8N_ADMIN_PASSWORD`).

## Cómo decide (bot-lecturas.cjs)

Cada foto se lee **dos veces por separado** con `claude-opus-5-5` y salida JSON
con esquema fijo. Un campo se escribe solo si:

1. las dos lecturas dan exactamente el mismo número y ambas lo ven claro;
2. el número es físicamente posible (temperaturas 60–110 °F, humedad 40–100,
   CO₂ 0–2 %, volteos 0–9999);
3. el número de máquina de la pantalla («2 - 18 XS12SHDOX» → 18) no contradice
   la máquina que eligió el turnero;
4. el campo está **vacío**: lo que digitó el turnero nunca se pisa.

Lo que no cumple queda en `machine_check_ai_readings` con `status = 'revisar'` y
el motivo (lecturas distintas, fuera de rango, otra máquina, turnero ≠ foto).

El líder de planta (y gerencia) lo ve en su inicio, en **Lecturas por revisar**:
foto, lo del turnero, lo del bot y el valor final; al guardar queda `revisada`
con quién y cuándo (`resolver_lectura_bot`). También se puede consultar así:

```sql
select k.shift_date, k.hour_slot, m.code, a.status, a.valores, a.discrepancias, a.motivo
from machine_check_ai_readings a
join machine_checks k on k.id = a.check_id join machines m on m.id = k.machine_id
where a.status = 'revisar' order by k.taken_at desc;
```

## Cambiar la lógica

No edites los nodos Code en n8n. Cambia `bot-lecturas.cjs`, corre
`npx vitest run servidor-local/n8n` y `node servidor-local/n8n/generar-flujo.mjs`,
y vuelve a correr `10-INSTALAR-N8N.bat`.

## Fotos anteriores

Por defecto solo procesa fotos tomadas después de instalarlo. Para llenar el
histórico (cuesta una llamada doble por foto) se mueve la fecha de inicio:

```sql
update incubapp_bot.config set desde = '2026-09-01';
```
