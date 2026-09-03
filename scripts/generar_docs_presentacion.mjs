/**
 * Genera/actualiza la carpeta docs/ con la documentación de IncubApp
 * alineada al avance actual. Henry Stark Desarrollador
 */
import fs from 'fs'
import path from 'path'
import {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  Header, Footer, AlignmentType, HeadingLevel, BorderStyle, WidthType,
  ShadingType, PageNumber, LevelFormat,
} from 'docx'
import PptxGenJS from 'pptxgenjs'

const OUT = path.resolve('docs')
const DATE = '9 de julio de 2026'
const VER = '3.0'
const DEV = 'Henry Camilo Taborda Galeano — Desarrollador'
const BRAND = 'IncubApp'
const COMPANY = 'Antioqueña de Incubación SAS'

const orange = 'E0740A'
const navy = '1A2332'
const ink = '202634'
const muted = '6D7688'
const line = 'E7E0D3'
const cream = 'FBF3E7'

const border = { style: BorderStyle.SINGLE, size: 4, color: line }
const borders = { top: border, bottom: border, left: border, right: border }

function p(text, opts = {}) {
  return new Paragraph({
    spacing: { after: opts.after ?? 120, before: opts.before ?? 0 },
    alignment: opts.align,
    ...opts,
    children: [
      new TextRun({
        text,
        font: 'Arial',
        size: opts.size ?? 22,
        bold: opts.bold,
        color: opts.color ?? ink,
        italics: opts.italics,
      }),
    ],
  })
}

function h1(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_1,
    spacing: { before: 280, after: 160 },
    children: [new TextRun({ text, font: 'Arial', size: 32, bold: true, color: navy })],
  })
}

function h2(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 220, after: 120 },
    children: [new TextRun({ text, font: 'Arial', size: 26, bold: true, color: orange })],
  })
}

function bullet(text, ref = 'bullets') {
  return new Paragraph({
    numbering: { reference: ref, level: 0 },
    spacing: { after: 80 },
    children: [new TextRun({ text, font: 'Arial', size: 21, color: ink })],
  })
}

function cell(text, w, opts = {}) {
  return new TableCell({
    borders,
    width: { size: w, type: WidthType.DXA },
    shading: opts.fill ? { fill: opts.fill, type: ShadingType.CLEAR } : undefined,
    margins: { top: 60, bottom: 60, left: 100, right: 100 },
    children: [
      new Paragraph({
        children: [
          new TextRun({
            text,
            font: 'Arial',
            size: opts.size ?? 18,
            bold: opts.bold,
            color: opts.color ?? ink,
          }),
        ],
      }),
    ],
  })
}

function table(headers, rows, colWidths) {
  const total = colWidths.reduce((a, b) => a + b, 0)
  return new Table({
    width: { size: total, type: WidthType.DXA },
    columnWidths: colWidths,
    rows: [
      new TableRow({
        children: headers.map((h, i) =>
          cell(h, colWidths[i], { bold: true, fill: cream, color: navy })
        ),
      }),
      ...rows.map(
        (r) =>
          new TableRow({
            children: r.map((c, i) => cell(String(c), colWidths[i])),
          })
      ),
    ],
  })
}

function cover(title, subtitle) {
  return [
    p(BRAND, { size: 40, bold: true, color: orange, after: 80 }),
    p(title, { size: 36, bold: true, color: navy, after: 120 }),
    p(subtitle, { size: 22, color: muted, after: 200 }),
    p(`${COMPANY} · ${DATE} · Versión ${VER}`, { size: 18, color: muted, after: 80 }),
    p(`Preparado por ${DEV}`, { size: 18, color: muted, after: 280 }),
  ]
}

function footerDoc(name) {
  return new Footer({
    children: [
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [
          new TextRun({
            text: `${BRAND} · ${name} · ${DEV} · pág. `,
            font: 'Arial',
            size: 16,
            color: muted,
          }),
          new TextRun({ children: [PageNumber.CURRENT], font: 'Arial', size: 16, color: muted }),
        ],
      }),
    ],
  })
}

function numbering() {
  return {
    config: [
      {
        reference: 'bullets',
        levels: [
          {
            level: 0,
            format: LevelFormat.BULLET,
            text: '•',
            alignment: AlignmentType.LEFT,
            style: { paragraph: { indent: { left: 720, hanging: 360 } } },
          },
        ],
      },
      {
        reference: 'numbers',
        levels: [
          {
            level: 0,
            format: LevelFormat.DECIMAL,
            text: '%1.',
            alignment: AlignmentType.LEFT,
            style: { paragraph: { indent: { left: 720, hanging: 360 } } },
          },
        ],
      },
    ],
  }
}

async function writeDoc(filename, title, children) {
  const doc = new Document({
    styles: {
      default: { document: { run: { font: 'Arial', size: 22 } } },
      paragraphStyles: [
        {
          id: 'Heading1',
          name: 'Heading 1',
          basedOn: 'Normal',
          next: 'Normal',
          quickFormat: true,
          run: { size: 32, bold: true, font: 'Arial', color: navy },
          paragraph: { spacing: { before: 280, after: 160 }, outlineLevel: 0 },
        },
        {
          id: 'Heading2',
          name: 'Heading 2',
          basedOn: 'Normal',
          next: 'Normal',
          quickFormat: true,
          run: { size: 26, bold: true, font: 'Arial', color: orange },
          paragraph: { spacing: { before: 220, after: 120 }, outlineLevel: 1 },
        },
      ],
    },
    numbering: numbering(),
    sections: [
      {
        properties: {
          page: {
            size: { width: 12240, height: 15840 },
            margin: { top: 1008, right: 1008, bottom: 1008, left: 1008 },
          },
        },
        headers: {
          default: new Header({
            children: [
              new Paragraph({
                children: [
                  new TextRun({
                    text: `${BRAND} — ${title}`,
                    font: 'Arial',
                    size: 16,
                    color: muted,
                  }),
                ],
              }),
            ],
          }),
        },
        footers: { default: footerDoc(title) },
        children,
      },
    ],
  })
  const buf = await Packer.toBuffer(doc)
  const outPath = path.join(OUT, filename)
  fs.writeFileSync(outPath, buf)
  console.log('OK', filename)
}

// ── Manual de Usuario ─────────────────────────────────────────
async function manualUsuario() {
  await writeDoc(
    'Manual de Usuario - IncubApp.docx',
    'Manual de Usuario',
    [
      ...cover('Manual de Usuario', 'Guía de uso por roles y módulos herméticos'),
      h1('1. ¿Qué es IncubApp?'),
      p(
        'IncubApp es la plataforma digital de operación de incubación y granja: levantes, reportes de huevo, recepción y cuarto frío, cargue, rondas con foto, órdenes de trabajo, ventas, logística, sanidad, inventarios, IoT/bioseguridad y gerencia. Cada persona entra con su usuario y ve solo los módulos de su rol (módulos herméticos).'
      ),
      p(
        'El único perfil omnisciente (ve todos los módulos) es el administrador de plataforma. El rol de organización «owner» se muestra como Desarrollador.'
      ),

      h1('2. Ingreso y perfil'),
      h2('2.1 Registro e ingreso'),
      bullet('Abra la URL en Chrome (recomendado). Puede instalar la PWA en el celular.'),
      bullet('Regístrese con correo y contraseña. La cuenta queda pendiente de aprobación.'),
      bullet('El administrador aprueba y asigna empresa, rol y área (si aplica).'),
      bullet('Puede trabajar sin GPS; la ubicación es opcional para asistencia y mapas.'),
      h2('2.2 Perfil'),
      bullet('Foto, nombre, teléfono y contraseña desde Perfil.'),
      bullet('Tema claro u oscuro.'),
      bullet('Menú formal «Menú» + chip de perfil (foto, tema, cerrar sesión).'),

      h1('3. Módulos herméticos y accesos'),
      p(
        'Cada rol opera su módulo (planta, granja, gerencia, ventas, etc.). No ve el trabajo de otros módulos salvo que solicite acceso temporal y el responsable del módulo lo apruebe (pestaña Accesos). Duraciones típicas: 2 h, 8 h, 24 h, 3 días, 7 días.'
      ),
      h2('3.1 Pestañas comunes'),
      bullet('Hoy — tablero del día según su rol.'),
      bullet('Accesos — solicitar o aprobar módulos.'),
      bullet('Reportes — enviar información a persona o módulo (OC, facturas, cotizaciones, informes).'),
      bullet('Asistencia — selfie de ingreso/salida con marca de agua (nombre, fecha, hora, lugar, GPS).'),
      bullet('Cumplimiento — esperado vs reportado, rondas de turno, elegibilidad de bono (90 días / ≥95 %).'),
      bullet('Perfil.'),

      h1('3.2 Plan de fidelización y bonos (resumen)'),
      p(
        'Tras 90 días de uso continuo de la SaaS, el personal con ≥95 % de cumplimiento (metas del coordinador + adherencia al turno) es elegible al bono. Turneros: mínimo 6 reportes de ronda por turno. El dinero del bono no sale de la nómina de la planta: se financia con la venta de infraestructura como servicio a clientes y empresas hermanas. Detalle: docs/Plan_Fidelizacion_y_Expansion_SaaS.md'
      ),

      h1('4. Por rol (qué usa)'),
      table(
        ['Rol / área', 'Módulos principales'],
        [
          ['Operario / auxiliar', 'Hoy, Supervisión (ronda), Asistencia selfie, Cumplimiento, Chat'],
          ['Supervisor', 'Panel, monitoreo, OT, plantas, supervisión, Cumplimiento'],
          ['Coordinador planta', 'Panel IE (OEE, Pareto, 5S), monitoreo, recepción/cargue'],
          ['Coordinador granja', 'Levantes, granjas, sanidad según área'],
          ['Gerencia', 'Cockpit, bandeja OC/facturas, Informes, Asesor, Cumplimiento equipo'],
          ['Ventas / Logística', 'Ventas o Logística (remisiones, flota, mapa)'],
          ['Mantenimiento', 'Órdenes de trabajo, evidencias'],
          ['Desarrollador (owner)', 'Su módulo; diseño de interfaz si aplica'],
          ['Admin plataforma', 'Administración multi-empresa (todo)'],
        ],
        [3200, 6160]
      ),

      h1('5. Supervisión y ronda'),
      bullet('Turnos T1 / T2 / T3; ronda horaria por máquina con foto.'),
      bullet('Offline: se guarda en el teléfono y sube al volver la red.'),
      bullet('OT: mantenimiento; las alertas de OT van a coordinación de planta, no a gerencia.'),

      h1('6. Reportes y gerencia'),
      bullet('Cualquier rol puede enviar reportes a un módulo o persona.'),
      bullet('Tipos: informe de área, solicitud, orden de compra, factura, cotización, evidencia.'),
      bullet('El receptor verifica/autoriza. Gerencia consolida e exporta solo lo verificado.'),
      bullet('Cockpit de gerencia: torre, bandeja, scorecard, metas, asesor (chatbot) y herramientas.'),

      h1('7. Asistencia y cumplimiento'),
      bullet('Marcar ingreso y salida con selfie obligatoria (cámara frontal).'),
      bullet('Marca de agua en la foto: nombre, fecha, hora, lugar y GPS (sello SELFIE VERIFICADA).'),
      bullet('Pestaña Cumplimiento: esperado (coordinador) vs reportado; turneros mín. 6 rondas/turno.'),
      bullet('Bono de cumplimiento: ≥90 días de uso continuo y ≥95 % de cumplimiento.'),
      bullet('El bono se financia con SaaS a clientes/empresas hermanas, no con nómina de planta.'),
      bullet('Si hay GPS, se registra posición; si no, puede usar la app igualmente.'),

      h1('8. Chat y notificaciones'),
      bullet('Chat general y directos (FAB burbuja).'),
      bullet('Campana: avisos filtrados por rol. Puede activar alertas del navegador.'),
      bullet('Gerencia recibe OC/facturas/cotizaciones/solicitudes; no alertas de cada OT.'),

      h1('9. Consejos'),
      bullet('Una sola fuente de verdad: registre la operación en IncubApp.'),
      bullet('Use Chrome actualizado; en planta, buena iluminación para las fotos.'),
      bullet('Si algo no aparece, revise Accesos o pida al responsable del módulo.'),

      p(`Preparado por ${DEV}.`, { before: 240, size: 18, color: muted }),
    ]
  )
}

// ── Manual Técnico ────────────────────────────────────────────
async function manualTecnico() {
  await writeDoc(
    'Manual Tecnico - IncubApp.docx',
    'Manual Técnico',
    [
      ...cover('Manual Técnico', 'Arquitectura, stack, módulos y despliegue'),
      h1('1. Visión general'),
      p(
        'SPA React 19 + Vite 8, backend Supabase (Auth, Postgres, RLS, Realtime, Storage). Multi-tenant por organization_members. Despliegue típico en Vercel. Offline: IndexedDB + cola de reintentos.'
      ),

      h1('2. Stack'),
      table(
        ['Capa', 'Tecnología'],
        [
          ['Lenguajes', 'JavaScript/JSX, HTML, CSS, SQL'],
          ['Frontend', 'React 19, Vite 8, CSS variables (tema claro/oscuro)'],
          ['Backend', 'Supabase (PostgreSQL + Auth + Storage + Realtime)'],
          ['Mapas', 'Leaflet (logística / estilo Waze)'],
          ['Excel', 'SheetJS (xlsx) bajo demanda'],
          ['PWA', 'Service worker, manifest instalable'],
          ['Offline', 'IndexedDB offlineQueue + localStorage fallback'],
          ['Hosting', 'Vercel (CDN)'],
        ],
        [2800, 6560]
      ),
      p(
        'FAQ extendida (qué es, cómo funciona, para qué): docs/Tecnologias_y_Lenguajes_FAQ.md y Tecnologias_y_Lenguajes_FAQ.docx.',
        { italics: true, size: 20, color: muted }
      ),

      h1('2.1 Tecnologías — preguntas y respuestas frecuentes'),
      h2('JavaScript (JS)'),
      p('¿Qué es? Lenguaje principal de la web que ejecuta el navegador.'),
      p('¿Cómo funciona? Reacciona a botones, llama a Supabase, calcula cumplimiento, marca de agua en selfies.'),
      p('¿Para qué? Toda la lógica de módulos de IncubApp en src/.'),
      h2('JSX + React 19'),
      p('¿Qué es? React es la librería de pantallas por componentes; JSX es la sintaxis de esas pantallas.'),
      p('¿Cómo funciona? Cada módulo (Asistencia, Cumplimiento, Gerencia…) es un componente que se re-dibuja al cambiar datos.'),
      p('¿Para qué? UI fluida tipo app en celular y PC (SPA).'),
      h2('HTML y CSS'),
      p('¿Qué es? HTML estructura la página; CSS define colores, layout y tema.'),
      p('¿Cómo funciona? index.html monta #root; index.css aplica marca IncubApp y fondo.jpg.'),
      p('¿Para qué? Identidad visual, legibilidad y responsivo.'),
      h2('SQL + PostgreSQL'),
      p('¿Qué es? SQL habla con la base relacional PostgreSQL (tablas y relaciones).'),
      p('¿Cómo funciona? Migraciones .sql crean tablas; la app consulta/inserta vía Supabase.'),
      p('¿Para qué? Guardar empresas, OT, bandeja, asistencia, rachas de 90 días, etc.'),
      h2('Supabase (Auth, Storage, Realtime, RLS)'),
      p('¿Qué es? Backend en la nube sobre Postgres con login, archivos y tiempo real.'),
      p('¿Cómo funciona? Cliente JS con URL y clave anónima; RLS filtra filas por organización.'),
      p('¿Para qué? Multi-empresa seguro, fotos de evidencia, chat y notificaciones en vivo.'),
      h2('Vite 8 + Vercel'),
      p('¿Qué es? Vite empaqueta el frontend; Vercel lo publica en internet.'),
      p('¿Cómo funciona? npm run build → dist/; deploy a CDN HTTPS.'),
      p('¿Para qué? Desarrollo rápido y app disponible 24/7 para planta y clientes SaaS.'),
      h2('PWA / Service Worker'),
      p('¿Qué es? Web instalable en el celular casi como app nativa.'),
      p('¿Cómo funciona? manifest + sw.js; opcionalmente cachea el shell.'),
      p('¿Para qué? Uso en planta sin Play Store; reparar.html si el caché falla.'),
      h2('Leaflet y SheetJS'),
      p('¿Qué es? Leaflet = mapas; SheetJS = Excel.'),
      p('¿Cómo funciona? Mapa en logística; export bajo demanda a .xlsx.'),
      p('¿Para qué? Rutas/flota y reportes de bandeja/cumplimiento para gerencia.'),
      h2('Node.js / npm'),
      p('¿Qué es? Entorno y gestor de paquetes del desarrollador.'),
      p('¿Cómo funciona? npm install y scripts de build, lint y docs.'),
      p('¿Para qué? Construir y mantener el proyecto (no lo usa el operario).'),
      h2('Grok / IA (opcional)'),
      p('¿Qué es? API de modelo de lenguaje para el asesor de gerencia.'),
      p('¿Cómo funciona? Si hay VITE_XAI_API_KEY enriquece respuestas; si no, conocimiento local.'),
      p('¿Para qué? Apoyo a gerencia. No es obligatorio para operar.'),

      h1('3. Estructura de carpetas src/'),
      bullet('App.jsx / main.jsx — orquestación y arranque.'),
      bullet('components/ — pantallas por dominio (planta, granja, gerencia, etc.).'),
      bullet('hooks/ — datos y mutaciones Supabase.'),
      bullet('lib/ — roles, privacyScopes (módulos), GPS, notificaciones, chatbot, Excel.'),
      bullet('Ver también src/DOCUMENTACION_RECORRIDO.md (cabeceras por archivo: Henry Stark Desarrollador).'),

      h1('4. Seguridad y módulos herméticos'),
      p(
        'privacyScopes.js define dominios/módulos (plant, farm, gerencia, sales…). effectiveTabsFor calcula pestañas nativas + grants. useAccessControl usa tabla access_grants. Solo platform_role=admin es omnisciente. RLS en tablas de negocio; notificaciones filtradas en cliente (OT ≠ gerencia).'
      ),
      h2('4.1 Migraciones SQL relevantes (recientes)'),
      bullet('supabase_migration_access_grants.sql — accesos temporales entre módulos.'),
      bullet('supabase_migration_dispatches_attendance.sql — reportes entre módulos + asistencia.'),
      bullet('supabase_migration_performance_bonus.sql — metas, rondas, rachas 90 d, labores (bonos).'),
      bullet('Migraciones previas: presence, plant_geo, logistics, veterinary, ops_workflow, etc.'),

      h1('5. Flujos clave'),
      h2('5.1 Ronda de máquina'),
      p('useMachineChecks + SupervisionPanel / MonitorMode; foto en bucket machine-checks; cola offline si no hay red.'),
      h2('5.2 Reportes y gerencia'),
      p(
        'silo_dispatches (kinds: informe, purchase_order, invoice, quotation, solicitud…). Verificación por responsable; ManagementCockpit + export Excel de verificados; notificaciones con kinds y notificationPolicy.'
      ),
      h2('5.3 Asistencia'),
      p('attendance_punches: punch_type in|out, photo_path, lat/lng opcionales vía GPS de alta precisión.'),
      h2('5.4 Coordinación IE'),
      p('CoordEngineeringBoard: OEE proxy, Pareto, balanceo, 5 porqués, Gemba/5S, plan de acción (localStorage + datos vivos).'),

      h1('6. Variables de entorno'),
      bullet('VITE_SUPABASE_URL'),
      bullet('VITE_SUPABASE_ANON_KEY'),
      p('Nunca commitear .env ni secretos de service role en el cliente.'),

      h1('7. Build y despliegue'),
      bullet('npm install && npm run build → dist/'),
      bullet('vercel --prod o pipeline desde Git.'),
      bullet('Tras cambios de SW: hard refresh / unregister SW si se ve UI antigua.'),

      h1('8. Riesgos conocidos'),
      bullet('Plan free Supabase: cupos de storage y sin backup automático — se recomienda Pro.'),
      bullet('RLS y migraciones deben aplicarse en el proyecto cloud antes de usar nuevas tablas.'),
      bullet('GPS es opcional; no bloquea el workspace.'),

      p(`Preparado por ${DEV}.`, { before: 240, size: 18, color: muted }),
    ]
  )
}

// ── Peticiones ────────────────────────────────────────────────
async function peticiones() {
  await writeDoc(
    'Peticiones a Coordinacion - IncubApp.docx',
    'Peticiones a Coordinación',
    [
      ...cover(
        'Peticiones a Coordinación',
        'Decisiones y recursos para operación industrial de IncubApp'
      ),
      h1('1. Propósito'),
      p(
        'IncubApp ya cubre operación real: módulos herméticos, rondas, OT, granja, recepción, reportes entre áreas, gerencia con bandeja verificada, asistencia con foto, notificaciones selectivas y paneles de ingeniería industrial. Para sostenerlo a escala se requieren las siguientes decisiones.'
      ),

      h1('2. Críticas'),
      h2('2.1 Supabase Pro'),
      p(
        'Situación: plan free con riesgo de storage y sin backups diarios. Petición: plan Pro (~USD 25/mes + consumo). Riesgo: pérdida de fotos y datos sin restore.'
      ),
      h2('2.2 GitHub privado + deploy formal'),
      p('Versionado, auditoría y rollback; Vercel conectado al repo.'),
      h2('2.3 Credenciales y 2FA'),
      p('Rotación de llaves, MFA en Supabase/Vercel/GitHub/correo admin.'),
      h2('2.4 Aplicar migraciones SQL en cloud'),
      p(
        'access_grants, silo_dispatches, attendance_punches y migraciones previas deben estar aplicadas para módulos, reportes y asistencia.'
      ),

      h1('3. Eficiencia operativa'),
      bullet('Teléfonos Android con buena cámara para rondas y asistencia.'),
      bullet('WiFi/datos en puntos ciegos de planta y granja.'),
      bullet('Capacitación por rol (2 h) con Manual de Usuario v2.'),
      bullet('Política: operación solo en IncubApp (sin planillas paralelas).'),
      bullet('Piloto IoT T°/HR en 2–3 incubadoras (modelo de datos ya preparado).'),

      h1('4. Equipo y continuidad'),
      bullet('Respaldo de desarrollo / segundo dev o contrato de soporte.'),
      bullet('Dominio propio (ej. incubapp.co) y correo transaccional.'),
      bullet('Auditoría ligera de RLS y accesos anuales.'),

      h1('5. Resumen'),
      p(
        'Con 2.1–2.4 se protege datos, versiones y funcionalidades nuevas (módulos, reportes, asistencia). El resto eleva eficiencia y prepara multi-sede.'
      ),
      p(`Preparado por ${DEV}.`, { before: 200, size: 18, color: muted }),
    ]
  )
}

// ── Servicios y presupuesto ───────────────────────────────────
async function presupuesto() {
  await writeDoc(
    'Servicios y Presupuesto - IncubApp.docx',
    'Servicios y Presupuesto',
    [
      ...cover(
        'Servicios y Presupuesto',
        'Qué pagar, por qué, y dónde aplica AWS — Anexo a Peticiones'
      ),
      h1('1. Resumen'),
      p(
        'IncubApp opera sobre servicios cloud. Los planes gratuitos ya no cubren operación industrial (fotos, backups, términos comerciales de hosting). Este anexo detalla costos.'
      ),

      h1('2. Recurrentes recomendados'),
      table(
        ['Servicio', 'Uso', 'Orden de magnitud'],
        [
          ['Supabase Pro', 'DB, Auth, Storage, Realtime, backups', 'USD ~25/mes + consumo'],
          ['Vercel Pro', 'Hosting frontend comercial + CDN', 'USD ~20/mes'],
          ['Dominio', 'URL profesional', 'USD 10–35/año'],
          ['Correo (Resend/SES)', 'Recuperación de clave, avisos', 'USD 0–20/mes'],
          ['Herramientas IA (opcional)', 'Acelerar desarrollo y soporte', 'Según plan'],
        ],
        [2400, 4200, 2760]
      ),

      h1('3. Gratuitos a activar'),
      bullet('GitHub privado + CI hacia Vercel.'),
      bullet('Sentry free para errores en producción.'),
      bullet('Correo básico sobre dominio (Zoho free u otro) mientras no se use Workspace.'),

      h1('4. ¿AWS?'),
      p(
        'Supabase ya corre sobre AWS. No se recomienda cuenta AWS propia hoy. Futuro: SES (correo barato), S3/Glacier (archivo frío de fotos), IoT Core si hay decenas de sensores.'
      ),

      h1('5. Inversión única'),
      p(
        'Portátil de desarrollo confiable (gama media-alta, 16 GB RAM, SSD) para soporte en planta y continuidad. Referencia mercado COP 5–7 M según configuración.'
      ),

      h1('6. Contexto'),
      p(
        'El costo mensual de plataforma suele ser inferior al de una hora de parada de incubadora. Incluye soporte de módulos nuevos: gerencia, reportes, asistencia, notificaciones y paneles IE.'
      ),
      p(`Preparado por ${DEV}.`, { before: 200, size: 18, color: muted }),
    ]
  )
}

// ── Contrato ──────────────────────────────────────────────────
async function contrato() {
  await writeDoc(
    'Contrato Licencia de Software - IncubApp.docx',
    'Contrato de Licencia',
    [
      p(
        'CONTRATO DE LICENCIA DE USO DE SOFTWARE Y PRESTACIÓN DE SERVICIOS DE DESARROLLO Y SOPORTE',
        { bold: true, size: 26, color: navy, after: 120, align: AlignmentType.CENTER }
      ),
      p(`Plataforma «${BRAND}»`, {
        bold: true,
        size: 24,
        color: orange,
        after: 200,
        align: AlignmentType.CENTER,
      }),
      p(
        `Entre los suscritos, de una parte, HENRY CAMILO TABORDA GALEANO, mayor de edad, identificado con cédula de ciudadanía No. ________________ de ____________, actuando en nombre propio, quien en adelante se denominará EL DESARROLLADOR o EL LICENCIANTE; y de la otra, ${COMPANY} (o la razón social que se indique), representada por ________________, quien en adelante se denominará LA EMPRESA o LA LICENCIATARIA.`
      ),

      h1('CONSIDERACIONES'),
      p(
        `EL DESARROLLADOR concibió, diseñó y construyó por su propia iniciativa la plataforma «${BRAND}» (antes referenciada como Incubant en documentos previos), aplicación web para gestión de incubación avícola y granjas: módulos por rol, rondas, OT, producción, recepción, ventas, logística, sanidad, inventarios, reportes entre módulos, gerencia, asistencia y paneles de ingeniería industrial.`
      ),
      p(
        'EL SOFTWARE comprende código fuente y objeto, arquitectura, modelo de datos, interfaces, algoritmos, políticas de acceso (módulos herméticos), artefactos de despliegue y documentación asociada.'
      ),
      p(
        'LA EMPRESA desea usar EL SOFTWARE para operación interna y contratar desarrollo evolutivo y soporte del DESARROLLADOR, sin cesión de la titularidad del software.'
      ),

      h1('CLÁUSULA PRIMERA — OBJETO'),
      p(
        '(i) Licencia de uso de EL SOFTWARE en los términos de la cláusula tercera; (ii) servicios de desarrollo evolutivo y soporte según cláusula sexta.'
      ),

      h1('CLÁUSULA SEGUNDA — PROPIEDAD INTELECTUAL'),
      p(
        '2.1. EL DESARROLLADOR es y seguirá siendo titular exclusivo de los derechos patrimoniales de autor sobre EL SOFTWARE (Ley 23 de 1982, Decisión Andina 351 y concordantes).'
      ),
      p(
        '2.2. Este contrato NO es obra por encargo con transferencia de derechos ni cesión patrimonial. Es licencia de uso + servicios.'
      ),
      p(
        '2.3. LA LICENCIATARIA no adquiere derecho de acceso al código fuente, repositorios, credenciales de infraestructura o cuentas de despliegue, salvo acuerdo escrito posterior de depósito o escrow.'
      ),
      p(
        '2.4. EL DESARROLLADOR conserva el derecho de licenciar o comercializar EL SOFTWARE a terceros.'
      ),

      h1('CLÁUSULA TERCERA — LICENCIA'),
      bullet('No exclusiva, intransferible, de uso interno de LA EMPRESA.'),
      bullet('Prohibida ingeniería inversa, sublicencia o retiro de avisos de titularidad.'),
      bullet('Vigente mientras el contrato esté activo y los pagos al día.'),

      h1('CLÁUSULA CUARTA — DATOS'),
      p(
        'Los datos operativos de LA EMPRESA (producción, fotos, usuarios, inventarios, reportes, asistencia, etc.) son de propiedad de LA EMPRESA. EL DESARROLLADOR los trata solo para operar y soportar EL SOFTWARE (Ley 1581 de 2012). A la terminación, entrega exportación en formatos estándar (SQL/CSV/Excel/media) en plazo razonable (p. ej. 30 días).'
      ),

      h1('CLÁUSULA QUINTA — CONTRAPRESTACIÓN'),
      p(
        'LA LICENCIATARIA pagará al DESARROLLADOR los valores de licencia/soporte y desarrollos que se detallen en anexo de presupuesto o factura (incluyendo servicios cloud reembolsables: Supabase, Vercel, dominio, etc., cuando se acuerde). Incremento anual IPC DANE salvo pacto distinto. Mora > 60 días: suspensión de acceso.'
      ),

      h1('CLÁUSULA SEXTA — SERVICIOS'),
      p(
        'Mantenimiento correctivo, soporte a administradores, desarrollo evolutivo razonable de módulos (gerencia, reportes, logística, etc.) y documentación actualizada. Cambios mayores se cotizan aparte.'
      ),

      h1('CLÁUSULAS SÉPTIMA A DÉCIMA SEGUNDA'),
      p(
        'Naturaleza civil/comercial (sin vínculo laboral); confidencialidad recíproca; duración 1 año renovable con preaviso 60 días; transición de hasta 90 días en solo lectura; garantías de autoría y corrección diligente de fallas; ley colombiana y arreglo directo / conciliación / jurisdicción del domicilio de LA EMPRESA; integridad del acuerdo por escrito.'
      ),

      p(
        'En constancia se firma en dos ejemplares, en ________________, el ____ de ____________ de 2026.',
        { before: 200 }
      ),
      p(
        'Nota: borrador base de negociación. Se recomienda revisión por abogado colombiano antes de la firma.',
        { size: 18, italics: true, color: muted, before: 160 }
      ),
      p(`Redacción actualizada ${DATE} · ${DEV}.`, { size: 18, color: muted, before: 120 }),
    ]
  )
}

// ── Depósito código ───────────────────────────────────────────
function deposito() {
  const text = `DEPÓSITO / INVENTARIO DE CÓDIGO FUENTE — ${BRAND}
${DATE} · Versión ${VER}
${DEV}

1. IDENTIFICACIÓN
Producto: ${BRAND} (plataforma de incubación avanzada; evolución de la línea documentada como Incubant).
Tipo: aplicación web (SPA) multi-empresa, multi-rol, módulos herméticos.
Repositorio local típico: incubant-app / incubapp (package name: incubapp).

2. STACK
- React 19 + Vite 8 (JSX)
- Supabase: Auth, PostgreSQL, RLS, Realtime, Storage
- Leaflet (mapas logística)
- SheetJS xlsx (exportaciones)
- PWA: public/sw.js (caché incubapp-shell-v3)

3. ÁRBOL PRINCIPAL (src/)
- main.jsx, App.jsx, index.css
- components/  (~50 paneles: planta, granja, gerencia, reportes, asistencia, IE, etc.)
- hooks/       (datos y Realtime)
- lib/         (roles, privacyScopes, notificaciones, GPS, chatbot, offline…)
- data/        (demos)
- DOCUMENTACION_RECORRIDO.md

4. FUNCIONALIDADES CUBIERTAS EN EL CÓDIGO (avance ${DATE})
- Módulos herméticos + access_grants (acceso temporal entre módulos)
- Tablero Hoy, Admin plataforma, cockpits de gerencia e ingeniería industrial
- Rondas con foto, OT, supervisión, monitoreo
- Levantes/granjas, huevo, recepción, cuarto frío, cargue
- Ventas, logística/flota, inventarios, sanidad, IoT stubs
- Reportes entre módulos (OC, facturas, cotizaciones, informes verificados)
- Cumplimiento y plan de bonos (90 días uso continuo, ≥95 %, rondas mín. 6)
- Asistencia selfie con marca de agua (nombre, fecha, hora, lugar, GPS)
- Expansión SaaS a clientes y empresas hermanas (fondo de bonos sin nómina de planta)
- Notificaciones filtradas (OT → planta; documentos → gerencia) + push navegador
- Asistencia ingreso/salida con foto
- Chat org + presencia; GPS opcional (no bloquea ingreso)
- Offline queue; export Excel; documentación en código (Henry Stark Desarrollador)

5. MIGRACIONES SQL (aplicar en Supabase)
- supabase_migration_*.sql en la raíz del proyecto
- Críticos recientes: access_grants, dispatches_attendance, logistics, veterinary, plant_geo, member_presence, ops_workflow, etc.

6. SECRETOS
- Solo VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY en cliente
- Service role y .env NUNCA en el repositorio público

7. BUILD
npm install
npm run build
Salida: dist/ (publicar en Vercel u otro hosting estático)

8. NOTA SOBRE ESTE ARCHIVO
La versión anterior de «Depósito Código Fuente» incluía un volcado masivo de texto.
Esta versión 2.0 es el inventario canónico actualizado. El código fuente vivo está en el
árbol del proyecto y en el control de versiones que la empresa habilite (GitHub privado recomendado).

Documentado por: Henry Stark Desarrollador / ${DEV}
`

  // Remove old Incubant deposit if exists and write new
  const old = path.join(OUT, 'Deposito Codigo Fuente - Incubant.txt')
  const neu = path.join(OUT, 'Deposito Codigo Fuente - IncubApp.txt')
  if (fs.existsSync(old)) fs.unlinkSync(old)
  fs.writeFileSync(neu, text, 'utf8')
  console.log('OK', 'Deposito Codigo Fuente - IncubApp.txt')
}

// ── Presentación PPTX ─────────────────────────────────────────
async function presentacion() {
  const pptx = new PptxGenJS()
  pptx.defineLayout({ name: 'WIDE', width: 13.333, height: 7.5 })
  pptx.layout = 'WIDE'
  pptx.author = DEV
  pptx.title = `${BRAND} — Presentación General`

  // Slide 1 Title
  {
    const s = pptx.addSlide()
    s.addShape(pptx.shapes.RECTANGLE, {
      x: 0, y: 0, w: 13.333, h: 7.5, fill: { color: navy },
    })
    s.addShape(pptx.shapes.RECTANGLE, {
      x: 0, y: 0, w: 0.25, h: 7.5, fill: { color: orange },
    })
    s.addText(BRAND, {
      x: 0.8, y: 2.2, w: 11, h: 0.7,
      fontSize: 40, bold: true, color: orange, fontFace: 'Arial',
    })
    s.addText('Plataforma de Incubación avanzada', {
      x: 0.8, y: 2.95, w: 11, h: 0.5,
      fontSize: 24, color: 'FFFFFF', fontFace: 'Arial',
    })
    s.addText(`${COMPANY}\n${DATE} · Versión ${VER}\n${DEV}`, {
      x: 0.8, y: 5.2, w: 11, h: 1.2,
      fontSize: 14, color: 'A8B0C0', fontFace: 'Arial',
    })
  }

  // Slide 2 Qué es
  {
    const s = pptx.addSlide()
    s.addShape(pptx.shapes.RECTANGLE, {
      x: 0, y: 0, w: 13.333, h: 0.9, fill: { color: cream },
    })
    s.addText('¿Qué es IncubApp?', {
      x: 0.5, y: 0.25, w: 12, h: 0.5,
      fontSize: 28, bold: true, color: navy, fontFace: 'Arial',
    })
    const cards = [
      { t: 'Operación', d: 'Rondas con foto, OT, supervisión, monitoreo en vivo' },
      { t: 'Cadena', d: 'Granja → recepción → frío → cargue → nacimiento' },
      { t: 'Módulos', d: 'Cada rol ve solo su módulo; accesos temporales controlados' },
      { t: 'Gerencia + fidelización', d: 'Bandeja verificada, cumplimiento 90d/95%, expansión SaaS' },
    ]
    cards.forEach((c, i) => {
      const x = 0.5 + (i % 2) * 6.3
      const y = 1.3 + Math.floor(i / 2) * 2.6
      s.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
        x, y, w: 5.9, h: 2.3,
        fill: { color: 'FFFFFF' },
        shadow: { type: 'outer', color: '000000', blur: 8, opacity: 0.08, offset: 2 },
        rectRadius: 0.1,
      })
      s.addShape(pptx.shapes.RECTANGLE, {
        x, y, w: 0.15, h: 2.3, fill: { color: orange },
      })
      s.addText(c.t, {
        x: x + 0.4, y: y + 0.4, w: 5.2, h: 0.5,
        fontSize: 20, bold: true, color: navy, fontFace: 'Arial',
      })
      s.addText(c.d, {
        x: x + 0.4, y: y + 1.0, w: 5.2, h: 0.9,
        fontSize: 14, color: muted, fontFace: 'Arial',
      })
    })
  }

  // Slide 3 Módulos
  {
    const s = pptx.addSlide()
    s.addShape(pptx.shapes.RECTANGLE, {
      x: 0, y: 0, w: 13.333, h: 0.9, fill: { color: cream },
    })
    s.addText('Módulos herméticos (no «silos»)', {
      x: 0.5, y: 0.25, w: 12, h: 0.5,
      fontSize: 26, bold: true, color: navy, fontFace: 'Arial',
    })
    s.addText(
      [
        { text: 'Principio: ', options: { bold: true, color: orange } },
        {
          text: 'cada perfil opera su módulo. El gerente no ve la operación del coordinador de planta (ni al revés) salvo acceso temporal aprobado. Solo el admin de plataforma ve todo.',
          options: { color: ink },
        },
      ],
      { x: 0.5, y: 1.2, w: 12.3, h: 1.0, fontSize: 15, fontFace: 'Arial' }
    )
    const mods = [
      'Planta / coordinación',
      'Granja / levantes',
      'Gerencia + informes',
      'Ventas',
      'Logística',
      'Mantenimiento',
      'Sanidad',
      'SST / Ambiental',
      'Reportes & Asistencia',
    ]
    mods.forEach((m, i) => {
      const x = 0.5 + (i % 3) * 4.2
      const y = 2.5 + Math.floor(i / 3) * 1.4
      s.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
        x, y, w: 3.9, h: 1.15,
        fill: { color: i % 2 === 0 ? navy : orange },
        rectRadius: 0.08,
      })
      s.addText(m, {
        x: x + 0.2, y: y + 0.35, w: 3.5, h: 0.5,
        fontSize: 14, bold: true, color: 'FFFFFF', fontFace: 'Arial', align: 'center',
      })
    })
  }

  // Slide 4 Avance hoy
  {
    const s = pptx.addSlide()
    s.addShape(pptx.shapes.RECTANGLE, {
      x: 0, y: 0, w: 13.333, h: 0.9, fill: { color: cream },
    })
    s.addText(`Avance incorporado (${DATE})`, {
      x: 0.5, y: 0.25, w: 12, h: 0.5,
      fontSize: 26, bold: true, color: navy, fontFace: 'Arial',
    })
    const items = [
      ['Accesos entre módulos', 'Solicitud + aprobación temporal'],
      ['Reportes / OC / facturas', 'Verificación por responsable → gerencia'],
      ['Cockpit de gerencia', 'Bandeja, scorecard, metas, Asesor IA'],
      ['Coordinación IE', 'OEE proxy, Pareto, 5S, Gemba, 5 porqués'],
      ['Asistencia', 'Ingreso/salida con foto'],
      ['Notificaciones inteligentes', 'OT a planta; documentos a gerencia'],
      ['Rol Desarrollador', 'Etiqueta del perfil owner en la UI'],
      ['GPS no bloqueante', 'La app abre aunque se deniegue ubicación'],
    ]
    items.forEach((row, i) => {
      const y = 1.15 + i * 0.72
      s.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
        x: 0.5, y, w: 12.3, h: 0.62,
        fill: { color: i % 2 ? cream : 'FFFFFF' },
        rectRadius: 0.06,
      })
      s.addText(row[0], {
        x: 0.7, y: y + 0.12, w: 4.5, h: 0.4,
        fontSize: 14, bold: true, color: orange, fontFace: 'Arial',
      })
      s.addText(row[1], {
        x: 5.3, y: y + 0.12, w: 7.2, h: 0.4,
        fontSize: 14, color: ink, fontFace: 'Arial',
      })
    })
  }

  // Slide 5 Roles
  {
    const s = pptx.addSlide()
    s.addShape(pptx.shapes.RECTANGLE, {
      x: 0, y: 0, w: 13.333, h: 0.9, fill: { color: cream },
    })
    s.addText('Quién usa qué', {
      x: 0.5, y: 0.25, w: 12, h: 0.5,
      fontSize: 26, bold: true, color: navy, fontFace: 'Arial',
    })
    s.addTable(
      [
        [
          { text: 'Perfil', options: { bold: true, color: 'FFFFFF', fill: { color: navy } } },
          { text: 'Enfoque', options: { bold: true, color: 'FFFFFF', fill: { color: navy } } },
        ],
        ['Operario / auxiliar', 'Ronda, asistencia, chat'],
        ['Supervisor / coord. planta', 'Panel IE, OT, monitoreo, recepción'],
        ['Coord. granja', 'Levantes, granjas, sanidad'],
        ['Gerencia', 'Cockpit, informes verificados, OC/facturas'],
        ['Ventas / logística', 'Pedidos, remisiones, flota'],
        ['Admin plataforma', 'Multi-empresa (omnisciente)'],
        ['Desarrollador (owner org)', 'Titularidad de producto; UI de diseño si aplica'],
      ],
      {
        x: 0.5, y: 1.3, w: 12.3, h: 5.5,
        colW: [4.2, 8.1],
        border: [{ pt: 0.5, color: line }],
        fontFace: 'Arial',
        fontSize: 13,
        color: ink,
        align: 'left',
        valign: 'middle',
      }
    )
  }

  // Slide 6 Pedidos
  {
    const s = pptx.addSlide()
    s.addShape(pptx.shapes.RECTANGLE, {
      x: 0, y: 0, w: 13.333, h: 0.9, fill: { color: cream },
    })
    s.addText('Para operar en serio mañana', {
      x: 0.5, y: 0.25, w: 12, h: 0.5,
      fontSize: 26, bold: true, color: navy, fontFace: 'Arial',
    })
    const asks = [
      { n: '01', t: 'Supabase Pro', d: 'Backups y storage de fotos' },
      { n: '02', t: 'Vercel Pro + dominio', d: 'Uso comercial y URL propia' },
      { n: '03', t: 'GitHub privado', d: 'Versionado y rollback' },
      { n: '04', t: 'Migraciones SQL', d: 'Tablas de módulos, reportes, asistencia' },
      { n: '05', t: 'Capacitación por rol', d: 'Manual de Usuario v2' },
      { n: '06', t: 'Dotación de campo', d: 'Celulares y conectividad' },
    ]
    asks.forEach((a, i) => {
      const x = 0.5 + (i % 3) * 4.2
      const y = 1.4 + Math.floor(i / 3) * 2.6
      s.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
        x, y, w: 3.95, h: 2.3,
        fill: { color: 'FFFFFF' },
        shadow: { type: 'outer', color: '000000', blur: 8, opacity: 0.08, offset: 2 },
        rectRadius: 0.1,
      })
      s.addText(a.n, {
        x: x + 0.3, y: y + 0.35, w: 3.3, h: 0.45,
        fontSize: 22, bold: true, color: orange, fontFace: 'Arial',
      })
      s.addText(a.t, {
        x: x + 0.3, y: y + 0.9, w: 3.3, h: 0.45,
        fontSize: 16, bold: true, color: navy, fontFace: 'Arial',
      })
      s.addText(a.d, {
        x: x + 0.3, y: y + 1.45, w: 3.3, h: 0.5,
        fontSize: 13, color: muted, fontFace: 'Arial',
      })
    })
  }

  // Slide fidelización / expansión
  {
    const s = pptx.addSlide()
    s.addShape(pptx.shapes.RECTANGLE, {
      x: 0, y: 0, w: 13.333, h: 0.9, fill: { color: cream },
    })
    s.addText('Fidelización 90 días · Expansión SaaS', {
      x: 0.5, y: 0.25, w: 12, h: 0.5,
      fontSize: 26, bold: true, color: navy, fontFace: 'Arial',
    })
    s.addText(
      'Tras 90 días de uso continuo real, IncubApp tiene respaldo medible para captar clientes y empresas hermanas. El bono ≥95 % se financia con ingresos SaaS, no con nómina de la planta.',
      {
        x: 0.5, y: 1.15, w: 12.3, h: 1.0,
        fontSize: 15, color: ink, fontFace: 'Arial',
      }
    )
    const steps = [
      { n: '01', t: 'Uso 100 %', d: 'Todos reportan labor en la app' },
      { n: '02', t: '90 días', d: 'Racha continua = servicio maduro' },
      { n: '03', t: '≥ 95 %', d: 'Elegible a bono de cumplimiento' },
      { n: '04', t: 'SaaS', d: 'Clientes/hermanas financian la bolsa' },
    ]
    steps.forEach((st, i) => {
      const x = 0.5 + i * 3.2
      s.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
        x, y: 2.5, w: 3.0, h: 3.5,
        fill: { color: 'FFFFFF' },
        shadow: { type: 'outer', color: '000000', blur: 8, opacity: 0.08, offset: 2 },
        rectRadius: 0.1,
      })
      s.addText(st.n, {
        x: x + 0.2, y: 2.8, w: 2.6, h: 0.5,
        fontSize: 22, bold: true, color: orange, fontFace: 'Arial',
      })
      s.addText(st.t, {
        x: x + 0.2, y: 3.5, w: 2.6, h: 0.5,
        fontSize: 18, bold: true, color: navy, fontFace: 'Arial',
      })
      s.addText(st.d, {
        x: x + 0.2, y: 4.2, w: 2.6, h: 1.2,
        fontSize: 14, color: muted, fontFace: 'Arial',
      })
    })
  }

  // Slide cierre
  {
    const s = pptx.addSlide()
    s.addShape(pptx.shapes.RECTANGLE, {
      x: 0, y: 0, w: 13.333, h: 7.5, fill: { color: navy },
    })
    s.addShape(pptx.shapes.RECTANGLE, {
      x: 0, y: 0, w: 0.25, h: 7.5, fill: { color: orange },
    })
    s.addText('IncubApp: 90 días de uso real,\nluego expansión SaaS con respaldo', {
      x: 0.9, y: 2.1, w: 11.5, h: 1.4,
      fontSize: 26, bold: true, color: 'FFFFFF', fontFace: 'Arial',
    })
    s.addText(
      'Documentación en /docs (Plan de fidelización, avance de producto, manuales)\nCódigo en /src · Propiedad intelectual del desarrollador · Licencia a la empresa',
      {
        x: 0.9, y: 3.8, w: 11.5, h: 1.0,
        fontSize: 15, color: 'A8B0C0', fontFace: 'Arial',
      }
    )
    s.addText(DEV, {
      x: 0.9, y: 5.5, w: 11.5, h: 0.4,
      fontSize: 14, color: orange, fontFace: 'Arial',
    })
  }

  const pptPath = path.join(OUT, 'Presentacion General - IncubApp.pptx')
  await pptx.writeFile({ fileName: pptPath })
  // remove old pptx name
  const oldPpt = path.join(OUT, 'Presentacion General - Incubant.pptx')
  if (fs.existsSync(oldPpt)) fs.unlinkSync(oldPpt)
  console.log('OK', 'Presentacion General - IncubApp.pptx')
}

async function main() {
  if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true })

  // Remove obsolete Incubant-named docs after generating IncubApp versions
  await manualUsuario()
  await manualTecnico()
  await peticiones()
  await presupuesto()
  await contrato()
  deposito()
  await presentacion()

  for (const f of fs.readdirSync(OUT)) {
    if (f.includes('Incubant')) {
      const p = path.join(OUT, f)
      // keep only if we didn't create IncubApp twin - delete old names
      try {
        fs.unlinkSync(p)
        console.log('removed old', f)
      } catch {
        /* */
      }
    }
  }

  console.log('\nListo. Archivos en docs/:')
  for (const f of fs.readdirSync(OUT)) console.log(' -', f)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
