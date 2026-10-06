# scripts/transferencias_whatsapp

**Autor:** Henry Taborda — Ing. en desarrollo de software · 06-10-2026

ES: Importación de las transferencias reportadas en el grupo de WhatsApp «Transferencias», cruzadas con los mapas de cargue reales.
EN: Import of the transfers reported in the «Transferencias» WhatsApp group, cross-checked against the real load maps.

```bash
node scripts/transferencias_whatsapp/principal.mjs      # genera migración + reporte / builds migration + report
npx vitest run scripts/transferencias_whatsapp          # pruebas / tests
```

| Carpeta / archivo | Contenido |
|---|---|
| `datos/transferencias_reportadas.mjs` | Transcripción del chat (una entrada por transferencia, con el texto original y las correcciones) |
| `funciones/` | Una función por archivo: lectura, normalización, cruce, ajuste de horas, generación de SQL y reporte |
| `pruebas/` | Pruebas (vitest) y generador de una base PostgreSQL de prueba |
| `principal.mjs` | Punto de entrada |

Salidas / outputs: `supabase/migrations/20261006_transferencias_whatsapp.sql` y `docs/Cruce_Transferencias_WhatsApp.md`.
Bitácora completa / full log: `docs/Bitacora_Transferencias_WhatsApp.md`.
