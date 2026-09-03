# Índice de documentación — IncubApp

**Versión:** 3.0 · **Fecha:** 9 de julio de 2026  
**Autor:** Henry Camilo Taborda Galeano — Desarrollador  
**Empresa piloto / referencia:** Antioqueña de Incubación SAS

---

## Documentos de producto y negocio

| Documento | Contenido |
|-----------|-----------|
| [Plan_Fidelizacion_y_Expansion_SaaS.md](./Plan_Fidelizacion_y_Expansion_SaaS.md) | Plan de **fidelización** (90 días + bonos 95%), **expansión** multi-empresa y modelo SaaS |
| [Avance_Producto_Julio_2026.md](./Avance_Producto_Julio_2026.md) | Qué está construido hoy: módulos, bandeja, cumplimiento, asistencia selfie |
| [Tecnologias_y_Lenguajes_FAQ.md](./Tecnologias_y_Lenguajes_FAQ.md) | **FAQ stack:** qué son, cómo funcionan y para qué (JS, React, Supabase, SQL…) |
| [Offline_Operacion.md](./Offline_Operacion.md) | Operación sin red: SW, cola IndexedDB, sincronización |
| [Tecnologias_y_Lenguajes_FAQ.docx](./Tecnologias_y_Lenguajes_FAQ.docx) | Misma FAQ en Word |
| [Plan_Fidelizacion_y_Expansion_SaaS.docx](./Plan_Fidelizacion_y_Expansion_SaaS.docx) | Misma estrategia en Word (para junta / impresión) |
| [Plan_Fidelizacion_y_Expansion_SaaS.pptx](./Plan_Fidelizacion_y_Expansion_SaaS.pptx) | Presentación dedicada al plan 90 días / SaaS |
| [Presentacion General - IncubApp.pptx](./Presentacion%20General%20-%20IncubApp.pptx) | Diapositivas generales del producto (v3.0) |

## Manuales y legales (generados)

| Documento | Contenido |
|-----------|-----------|
| Manual de Usuario - IncubApp.docx | Uso por roles y pestañas |
| Manual Tecnico - IncubApp.docx | Stack, migraciones, despliegue |
| Peticiones a Coordinacion - IncubApp.docx | Decisiones pendientes de coordinación |
| Servicios y Presupuesto - IncubApp.docx | Cloud, soporte, inversión |
| Contrato Licencia de Software - IncubApp.docx | Licencia y datos |
| Propuesta Profesional y Area TI - IncubApp.docx | Perfil del desarrollador + dual MTTO/TI |
| Deposito Codigo Fuente - IncubApp.txt | Inventario de código |

## Código y repo

| Ruta | Contenido |
|------|-----------|
| [../README.md](../README.md) | Resumen del producto, stack y arranque |
| [../src/DOCUMENTACION_RECORRIDO.md](../src/DOCUMENTACION_RECORRIDO.md) | Mapa de carpetas `src/` |
| `../supabase_migration_*.sql` | Esquema Supabase (incl. cumplimiento y bonos) |

## Regenerar Word/PPTX

```bash
node scripts/generar_docs_presentacion.mjs
node scripts/generar_plan_fidelizacion.mjs
node scripts/generar_faq_tecnologias.mjs
node scripts/generar_propuesta_perfil.mjs
```

**Documentado por: Henry Stark Desarrollador**
