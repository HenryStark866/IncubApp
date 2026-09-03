# Plan de fidelización y expansión SaaS — IncubApp

**Versión:** 3.0 · **9 de julio de 2026**  
**Autor:** Henry Camilo Taborda Galeano — Desarrollador  
**Marca:** IncubApp  
**Empresa ancla (piloto):** Antioqueña de Incubación SAS  

---

## 1. Visión en una frase

Usar **90 días de uso continuo real** en la planta piloto para demostrar un servicio **sólido, medible y respaldado con datos**, y con esa prueba de campo captar a **clientes y empresas hermanas** que adopten IncubApp como **infraestructura administrada (SaaS)**.

---

## 2. Problema que resolvemos

En incubación y granja, el rendimiento del personal y de la operación suele medirse de forma incompleta:

- Labores esperadas vs lo realmente reportado no quedan en un solo sistema.
- Asistencia y turnos sin evidencia confiable (selfie + tiempo + lugar).
- Reportes entre áreas (OC, facturas, cotizaciones, novedades) sin bandeja de aprobación.
- La gerencia no ve solo datos **verificados**.
- No hay un plan de **bonos por cumplimiento** desacoplado de la caja de nómina de la planta.

IncubApp unifica operación, evidencia y cumplimiento en una sola app multi-empresa.

---

## 3. Pilares del producto (estado actual)

| Pilar | Qué hace | Estado |
|-------|----------|--------|
| **Módulos herméticos** | Cada rol ve solo su módulo; acceso temporal con aprobación | Operativo |
| **Bandeja gerencial** | OC, facturas, cotizaciones, informes; aprobar / rechazar / exportar | Operativo |
| **Asistencia con selfie** | Ingreso/salida con **marca de agua** (nombre, fecha, hora, lugar, GPS) | Operativo |
| **Cumplimiento** | Esperado (coordinador) vs reportado (operario); rondas mín. 6/turno | Operativo |
| **Bonos / fidelización** | Elegibilidad tras **90 días** de uso continuo y **≥ 95 %** de cumplimiento | Motor en app |
| **Fondo del bono** | **No sale de nómina de la planta**; se financia con ingresos SaaS a clientes y empresas hermanas | Modelo de negocio documentado |
| **Cockpit de gerencia + asesor** | Torre de control, scorecard IE, chat experto (local o Grok opcional) | Operativo |
| **Multi-tenant** | Varias empresas en la misma plataforma (Supabase + org_id) | Base lista |

---

## 4. Plan de fidelización interna (personal de planta)

### 4.1 Objetivo

Que **todos los usuarios usen la app al 100 %** de su labor diaria, con indicadores claros:

> **Esperado** (lo define el coordinador) **vs reportado** (lo registra el personal).

### 4.2 Reglas de elegibilidad al bono de cumplimiento

| Condición | Valor | Notas |
|-----------|-------|--------|
| Uso continuo de la SaaS | **≥ 90 días** | Racha diaria: si se salta un día calendario (zona Bogotá), la racha se reinicia |
| Cumplimiento de labores | **≥ 95 %** | Promedio de indicadores con meta > 0 |
| Adherencia al turno | Ingreso + salida | Selfie con marca de agua obligatoria |
| Turneros (operarios / auxiliares) | **Mín. 6 reportes de ronda por turno** | El coordinador puede subir o bajar la meta |

### 4.3 Quién define el “esperado”

El **coordinador** (y perfiles de dirección según permisos) configura en **Cumplimiento → Metas**:

- Rondas por turno  
- Labores completadas con éxito  
- Marcas de asistencia válidas  
- Adherencia al turno (%)  
- Otros indicadores por rol o por persona  

### 4.4 Evidencia de asistencia (anti-disputa)

Cada marca genera una **selfie** con sello visible:

- IncubApp · INGRESO / SALIDA  
- Nombre del operario  
- Fecha y hora (America/Bogota)  
- Lugar / coordenadas y precisión GPS  
- Sello “SELFIE VERIFICADA”  

Esto alimenta el indicador de **adherencia al turno** del plan de bonos.

### 4.5 Origen del dinero del bono (principio rector)

> El bono de cumplimiento **no se paga con fondos de nómina ni caja operativa de la planta ancla**.  
> Se financia con la **venta de infraestructura como servicio** a **clientes externos y empresas hermanas**: licencia SaaS, administración del software y de sus bases de datos, soporte y mejora continua.

Así el personal gana por **cumplimiento real**, y la planta no diluye su nómina: el incentivo se sostiene con el **crecimiento comercial** de IncubApp.

### 4.6 Mensaje de fidelización al equipo

1. Usas la app todos los días (tu labor queda registrada).  
2. A los **90 días** entras al plan de bonos.  
3. Si cumples **≥ 95 %** de lo esperado, eres **elegible**.  
4. El bono se liquida cuando el **programa SaaS** (clientes / hermanas) genera la bolsa de incentivos.  

---

## 5. Por qué 90 días son la “prueba de fuego”

Los primeros **90 días de uso continuo** en la empresa ancla no son solo un requisito de bono: son la **etapa de maduración del servicio**.

| Día aprox. | Hito | Resultado comercial |
|------------|------|---------------------|
| 0–30 | Adopción: asistencia, rondas, reportes, roles | Datos reales empiezan a fluir |
| 31–60 | Estabilización: metas del coordinador, bandeja gerencial, correcciones | Menos papel / WhatsApp paralelo |
| 61–90 | Madurez: indicadores de cumplimiento, historial verificable | **Respaldo real** para vender a terceros |
| 90+ | Programa de bonos interno + **pitch SaaS** a clientes y hermanas | Expansión multi-empresa |

Al día 90 se puede demostrar con hechos:

- Uso diario medible (rachas, marcas, rondas).  
- Cumplimiento por persona y por rol.  
- Documentos gerenciales aprobados.  
- Operación multi-módulo en producción, no demo de PowerPoint.

Eso es el **respaldo real** para captar a los demás.

---

## 6. Plan de expansión (SaaS multi-empresa)

### 6.1 Oferta a clientes y empresas hermanas

| Servicio | Descripción |
|----------|-------------|
| **Licencia IncubApp (SaaS)** | Acceso web/PWA multi-usuario por organización |
| **Administración de software** | Actualizaciones, módulos, roles, soporte |
| **Administración de bases de datos** | Tenant aislado (org), respaldos, políticas RLS |
| **Puesta en marcha** | Onboarding de roles, plantas, granjas, metas de cumplimiento |
| **Mejora continua** | Roadmap compartido financiado por la red de clientes |

### 6.2 Modelo de valor

```
Empresa ancla (90 días de uso real)
        ↓ genera evidencia y mejora el producto
Clientes + empresas hermanas contratan SaaS
        ↓ generan ingresos de infraestructura
Bolsa de bonos de cumplimiento (personal que ≥95 %)
        ↓ refuerza uso 100 % de la app
Más datos y mejor producto → más captación
```

### 6.3 Fases de expansión

| Fase | Nombre | Acciones |
|------|--------|----------|
| **F0** | Piloto ancla | Uso interno 100 %; migraciones SQL; asistencia + cumplimiento activos |
| **F1** | Maduración 90 d | Medir rachas, rondas, bandeja; liquidación piloto de indicadores |
| **F2** | Primeras hermanas / clientes | Onboarding 1–3 organizaciones; tenant separado; contrato + presupuesto |
| **F3** | Red SaaS | Multi-sede, white-label opcional, bolsa de bonos consolidada |
| **F4** | Escala | SLAs, facturación recurrente, soporte por niveles, IoT en vivo |

### 6.4 Argumento de venta (elevator pitch)

> “No vendemos un software vacío: lo operamos **90+ días en planta real** con asistencia selfie, rondas, OT, gerencia y cumplimiento medible. Usted recibe la misma infraestructura **administrada** (app + base de datos), y su personal puede sumarse a un plan de **bonos por cumplimiento** financiado por la red SaaS, no por su nómina.”

---

## 7. Indicadores de éxito (KPI del plan)

### Internos (fidelización)

- % de personal con racha de uso ≥ 7 / 30 / 90 días  
- % de turneros con ≥ 6 rondas por turno  
- % de marcas de asistencia con selfie + watermark  
- % de personas con cumplimiento ≥ 95 % (elegibles)  
- Tiempo medio de aprobación de documentos en bandeja gerencial  

### Externos (expansión)

- Nº de organizaciones activas (tenants)  
- Ingresos SaaS mensuales (MRR)  
- % del MRR destinado a bolsa de bonos (política comercial)  
- NPS / retención de clientes hermanos a 6 meses  

---

## 8. Implementación técnica (ya en el código)

| Pieza | Ubicación |
|-------|-----------|
| Motor de reglas 90 d / 95 % / 6 rondas | `src/lib/complianceEngine.js` |
| Panel Cumplimiento | `src/components/PerformancePanel.jsx` |
| Hook metas, rondas, rachas | `src/hooks/usePerformance.js` |
| Selfie + marca de agua | `src/lib/watermark.js` + `AttendancePanel` |
| SQL nube | `supabase_migration_performance_bonus.sql` |
| Bandeja gerencial | `SiloReportsPanel` + `useSiloDispatches` |
| Módulos herméticos | `privacyScopes.js` + `AccessVaultPanel` |

**Migración recomendada en Supabase:** ejecutar `supabase_migration_performance_bonus.sql` y `supabase_migration_dispatches_attendance.sql`.

---

## 9. Riesgos y mitigación

| Riesgo | Mitigación |
|--------|------------|
| Personal no usa la app | Metas del coordinador + bono + pestaña Cumplimiento visible a todos |
| GPS / cámara fallan en campo | Mensajes claros; fallback local; reintento |
| Racha se rompe por un día | Comunicación de “uso continuo”; posible política de gracia futura |
| Bolsa de bonos sin clientes SaaS aún | Transparencia: elegibilidad se acumula; liquidación al activar programa |
| Datos sensibles multi-empresa | RLS por `org_id`; módulos herméticos; solo admin de plataforma omnisciente |

---

## 10. Próximos pasos recomendados

1. **Operar 90 días** con metas publicadas por el coordinador.  
2. Ejecutar migraciones SQL de cumplimiento y asistencia en producción.  
3. Revisar semanalmente ranking de Cumplimiento (export Excel).  
4. Preparar **anexo comercial SaaS** (precio por sede / usuario / mes).  
5. Abordar **primera empresa hermana** con el caso de los 90 días documentado.  
6. Definir % de ingresos SaaS que alimenta la **bolsa de bonos**.  

---

## 11. Cierre

El plan no es “dar bonos y ya”. Es un **ciclo virtuoso**:

1. Uso real 90 días → servicio probado.  
2. Prueba de campo → captación de clientes y hermanas.  
3. Ingresos SaaS → bonos por cumplimiento sin tocar nómina de la planta.  
4. Más cumplimiento → más uso al 100 % → mejor producto → más expansión.

**Documentado por: Henry Stark Desarrollador**  
IncubApp · Julio 2026
