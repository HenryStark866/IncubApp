/**
 * Genera Word de Tecnologías y lenguajes (FAQ qué / cómo / para qué).
 * Henry Stark Desarrollador · IncubApp
 */
import fs from 'fs'
import path from 'path'
import {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  Header, Footer, AlignmentType, HeadingLevel, BorderStyle, WidthType,
  ShadingType, PageNumber, LevelFormat,
} from 'docx'

const OUT = path.resolve('docs')
const DATE = '9 de julio de 2026'
const VER = '3.0'
const DEV = 'Henry Camilo Taborda Galeano — Desarrollador'
const BRAND = 'IncubApp'
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
    spacing: { after: opts.after ?? 100, before: opts.before ?? 0 },
    children: [
      new TextRun({
        text,
        font: 'Arial',
        size: opts.size ?? 21,
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
    spacing: { before: 260, after: 140 },
    children: [new TextRun({ text, font: 'Arial', size: 30, bold: true, color: navy })],
  })
}
function h2(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 200, after: 100 },
    children: [new TextRun({ text, font: 'Arial', size: 24, bold: true, color: orange })],
  })
}
function qa(q, a) {
  return [
    p(q, { bold: true, size: 20, after: 40 }),
    p(a, { size: 20, after: 120, color: ink }),
  ]
}
function cell(text, w, opts = {}) {
  return new TableCell({
    borders,
    width: { size: w, type: WidthType.DXA },
    shading: opts.fill ? { fill: opts.fill, type: ShadingType.CLEAR } : undefined,
    margins: { top: 50, bottom: 50, left: 80, right: 80 },
    children: [
      new Paragraph({
        children: [
          new TextRun({
            text: String(text),
            font: 'Arial',
            size: opts.size ?? 16,
            bold: opts.bold,
            color: opts.color ?? ink,
          }),
        ],
      }),
    ],
  })
}
function table(headers, rows, colWidths) {
  return new Table({
    width: { size: colWidths.reduce((a, b) => a + b, 0), type: WidthType.DXA },
    columnWidths: colWidths,
    rows: [
      new TableRow({
        children: headers.map((h, i) =>
          cell(h, colWidths[i], { bold: true, fill: cream, color: navy })
        ),
      }),
      ...rows.map(
        (r) => new TableRow({ children: r.map((c, i) => cell(String(c), colWidths[i])) })
      ),
    ],
  })
}

const topics = [
  {
    t: 'JavaScript (JS)',
    items: [
      ['¿Qué es?', 'Lenguaje de programación principal de la web. Es lo que “piensa” la app en el navegador del usuario.'],
      ['¿Cómo funciona?', 'Chrome (u otro navegador) descarga el código y lo ejecuta: botones, llamadas a la base de datos, cálculos de cumplimiento, marca de agua en selfies.'],
      ['¿Para qué en IncubApp?', 'Toda la lógica de módulos (asistencia, bandeja, gerencia, chat, GPS, bonos). Archivos en src/ (.js y .jsx).'],
    ],
  },
  {
    t: 'JSX',
    items: [
      ['¿Qué es?', 'Extensión de JavaScript para escribir pantallas con sintaxis parecida a HTML, usada con React.'],
      ['¿Cómo funciona?', 'Vite transforma el JSX a JavaScript puro que el navegador entiende.'],
      ['¿Para qué?', 'Definir de forma clara botones, formularios y paneles (Asistencia, Cumplimiento, etc.).'],
    ],
  },
  {
    t: 'HTML',
    items: [
      ['¿Qué es?', 'Lenguaje de marcado: la estructura base de una página web.'],
      ['¿Cómo funciona?', 'El navegador lee el HTML y dibuja el esqueleto; React rellena el contenido dinámico.'],
      ['¿Para qué?', 'index.html carga la app y el punto #root; también reparar.html para recuperar caché.'],
    ],
  },
  {
    t: 'CSS',
    items: [
      ['¿Qué es?', 'Lenguaje de estilos: colores, tipografía, layout, tema claro/oscuro.'],
      ['¿Cómo funciona?', 'Reglas y variables CSS aplican la marca IncubApp y el fondo (fondo.jpg).'],
      ['¿Para qué?', 'Que la app se vea profesional y legible en celular y PC.'],
    ],
  },
  {
    t: 'SQL',
    items: [
      ['¿Qué es?', 'Lenguaje estándar para bases de datos relacionales (tablas, filas, consultas).'],
      ['¿Cómo funciona?', 'Scripts .sql crean tablas y políticas; la app consulta/inserta vía Supabase.'],
      ['¿Para qué?', 'Esquema de bandeja, asistencia, cumplimiento 90 días, OT, empresas, etc.'],
    ],
  },
  {
    t: 'React 19',
    items: [
      ['¿Qué es?', 'Librería de JavaScript para construir interfaces por componentes.'],
      ['¿Cómo funciona?', 'Cada pantalla es un componente; al cambiar datos, se actualiza lo necesario sin recargar toda la página.'],
      ['¿Para qué?', 'Toda la experiencia de usuario de IncubApp (SPA).'],
    ],
  },
  {
    t: 'Vite 8',
    items: [
      ['¿Qué es?', 'Herramienta de desarrollo y empaquetado (build) del frontend.'],
      ['¿Cómo funciona?', 'npm run dev abre el servidor local; npm run build genera la carpeta dist/ optimizada.'],
      ['¿Para qué?', 'Desarrollar rápido y publicar una versión liviana en Vercel.'],
    ],
  },
  {
    t: 'Supabase',
    items: [
      ['¿Qué es?', 'Backend en la nube: base de datos Postgres + Auth + Storage + Realtime.'],
      ['¿Cómo funciona?', 'La app se conecta con URL y clave anónima; el usuario inicia sesión y opera con permisos RLS.'],
      ['¿Para qué?', 'Login, datos multi-empresa, fotos, chat en vivo, notificaciones.'],
    ],
  },
  {
    t: 'PostgreSQL',
    items: [
      ['¿Qué es?', 'Motor de base de datos relacional robusto y de código abierto.'],
      ['¿Cómo funciona?', 'Guarda tablas relacionadas (org, usuarios, plantas, marcas, documentos).'],
      ['¿Para qué?', 'Fuente de verdad de la operación de incubación y granja.'],
    ],
  },
  {
    t: 'RLS (Row Level Security)',
    items: [
      ['¿Qué es?', 'Seguridad a nivel de fila en Postgres: políticas por usuario/empresa.'],
      ['¿Cómo funciona?', 'Aunque varias empresas estén en la misma base, cada una solo ve sus filas (org_id).'],
      ['¿Para qué?', 'Multi-tenant seguro para el modelo SaaS de expansión.'],
    ],
  },
  {
    t: 'Supabase Auth / Storage / Realtime',
    items: [
      ['¿Qué es Auth?', 'Servicio de inicio de sesión y sesiones seguras.'],
      ['¿Qué es Storage?', 'Almacén de archivos (selfies, fotos de ronda, adjuntos).'],
      ['¿Qué es Realtime?', 'Actualización en vivo por websocket (chat, bandeja, campana).'],
      ['¿Para qué en conjunto?', 'Operación completa sin montar un backend a mano.'],
    ],
  },
  {
    t: 'Vercel',
    items: [
      ['¿Qué es?', 'Hosting con CDN para la aplicación web.'],
      ['¿Cómo funciona?', 'Publica el dist/ con HTTPS y red global.'],
      ['¿Para qué?', 'Que la planta y futuros clientes SaaS accedan 24/7 (deploy_incubapp.bat).'],
    ],
  },
  {
    t: 'PWA y Service Worker',
    items: [
      ['¿Qué es?', 'Web instalable en el celular casi como app nativa.'],
      ['¿Cómo funciona?', 'manifest + service worker; puede cachear el shell de la app.'],
      ['¿Para qué?', 'Uso en planta sin Play Store; reparar.html si el caché falla.'],
    ],
  },
  {
    t: 'Leaflet',
    items: [
      ['¿Qué es?', 'Librería de mapas interactivos open source.'],
      ['¿Cómo funciona?', 'Dibuja mapa, marcadores y rutas en el navegador.'],
      ['¿Para qué?', 'Logística y vistas de rutas/flota.'],
    ],
  },
  {
    t: 'SheetJS (xlsx)',
    items: [
      ['¿Qué es?', 'Librería para generar archivos Excel.'],
      ['¿Cómo funciona?', 'Se carga al exportar y descarga un .xlsx.'],
      ['¿Para qué?', 'Bandeja gerencial, documentos aprobados, ranking de cumplimiento.'],
    ],
  },
  {
    t: 'Node.js y npm',
    items: [
      ['¿Qué es?', 'Node ejecuta JS fuera del navegador; npm instala paquetes.'],
      ['¿Cómo funciona?', 'npm install y scripts de build, lint y documentación.'],
      ['¿Para qué?', 'Herramientas del desarrollador (el operario no las usa).'],
    ],
  },
  {
    t: 'Grok / IA (opcional)',
    items: [
      ['¿Qué es?', 'API de modelo de lenguaje para el asesor de gerencia.'],
      ['¿Cómo funciona?', 'Si hay VITE_XAI_API_KEY enriquece respuestas; si no, usa conocimiento local.'],
      ['¿Para qué?', 'Apoyo a gerencia. No es obligatorio para entrar ni operar.'],
    ],
  },
]

const arch = [
  ['¿Qué es una SPA?', 'Web de una sola página que cambia de módulo sin recargar todo (React).'],
  ['¿Qué es multi-tenant?', 'Varias empresas en la misma plataforma, aisladas por org_id y RLS.'],
  ['¿Qué es un módulo hermético?', 'Área visible solo a ciertos roles; acceso temporal con aprobación.'],
  ['¿Qué es un hook (useX)?', 'Pieza de React que encapsula datos y acciones (ej. useAttendance).'],
  ['¿Qué es una migración SQL?', 'Script que crea/altera tablas en Supabase (bandeja, asistencia, 90 días).'],
  ['¿Qué es el build dist/?', 'Versión optimizada de la app que se publica en Vercel.'],
]

const children = [
  p(BRAND, { size: 36, bold: true, color: orange, after: 60 }),
  p('Tecnologías y lenguajes aplicados', { size: 32, bold: true, color: navy, after: 80 }),
  p('Preguntas y respuestas: qué son, cómo funcionan y para qué', {
    size: 20,
    color: muted,
    after: 120,
  }),
  p(`${DATE} · Versión ${VER} · ${DEV}`, { size: 17, color: muted, after: 200 }),

  h1('1. Mapa rápido del stack'),
  table(
    ['Tecnología', 'Tipo', 'Rol en IncubApp'],
    [
      ['JavaScript / JSX', 'Lenguaje', 'Lógica y pantallas'],
      ['HTML / CSS', 'Marcado / estilos', 'Estructura y apariencia'],
      ['SQL + PostgreSQL', 'Datos', 'Tablas y verdad operativa'],
      ['React 19 + Vite 8', 'Frontend', 'UI y empaquetado'],
      ['Supabase', 'Backend', 'Auth, BD, Storage, Realtime'],
      ['RLS', 'Seguridad', 'Aislamiento multi-empresa'],
      ['Vercel', 'Hosting', 'Publicación 24/7'],
      ['PWA', 'App web', 'Instalable en celular'],
      ['Leaflet / SheetJS', 'Librerías', 'Mapas y Excel'],
      ['Grok (opcional)', 'IA', 'Asesor de gerencia'],
    ],
    [2800, 2200, 4360]
  ),
  p('', { after: 80 }),

  h1('2. Cada tecnología en detalle'),
]

for (const topic of topics) {
  children.push(h2(topic.t))
  for (const [q, a] of topic.items) {
    children.push(...qa(q, a))
  }
}

children.push(h1('3. Conceptos de arquitectura (FAQ)'))
for (const [q, a] of arch) {
  children.push(...qa(q, a))
}

children.push(h1('4. Respuestas de pasillo (10 segundos)'))
children.push(
  table(
    ['Pregunta', 'Respuesta corta'],
    [
      ['¿En qué está hecha?', 'React + JavaScript + Supabase/SQL'],
      ['¿Dónde están los datos?', 'PostgreSQL en Supabase (nube)'],
      ['¿Quién ve qué?', 'Roles + módulos herméticos + RLS'],
      ['¿Grok es obligatorio?', 'No'],
      ['¿Play Store?', 'No; es web/PWA instalable'],
      ['¿Dónde se publica?', 'Vercel'],
    ],
    [3600, 5760]
  )
)

children.push(p('', { after: 160 }))
children.push(
  p(
    'Versión extendida en Markdown: docs/Tecnologias_y_Lenguajes_FAQ.md',
    { size: 18, color: muted, italics: true }
  )
)
children.push(p(`Documentado por ${DEV}`, { size: 18, color: muted, before: 120 }))

const doc = new Document({
  styles: {
    default: { document: { run: { font: 'Arial', size: 21 } } },
    paragraphStyles: [
      {
        id: 'Heading1',
        name: 'Heading 1',
        basedOn: 'Normal',
        next: 'Normal',
        quickFormat: true,
        run: { size: 30, bold: true, font: 'Arial', color: navy },
        paragraph: { spacing: { before: 260, after: 140 }, outlineLevel: 0 },
      },
      {
        id: 'Heading2',
        name: 'Heading 2',
        basedOn: 'Normal',
        next: 'Normal',
        quickFormat: true,
        run: { size: 24, bold: true, font: 'Arial', color: orange },
        paragraph: { spacing: { before: 200, after: 100 }, outlineLevel: 1 },
      },
    ],
  },
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
                  text: `${BRAND} — Tecnologías y lenguajes (FAQ)`,
                  font: 'Arial',
                  size: 16,
                  color: muted,
                }),
              ],
            }),
          ],
        }),
      },
      footers: {
        default: new Footer({
          children: [
            new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [
                new TextRun({
                  text: `${BRAND} · ${DEV} · pág. `,
                  font: 'Arial',
                  size: 16,
                  color: muted,
                }),
                new TextRun({
                  children: [PageNumber.CURRENT],
                  font: 'Arial',
                  size: 16,
                  color: muted,
                }),
              ],
            }),
          ],
        }),
      },
      children,
    },
  ],
})

fs.mkdirSync(OUT, { recursive: true })
const outPath = path.join(OUT, 'Tecnologias_y_Lenguajes_FAQ.docx')
fs.writeFileSync(outPath, await Packer.toBuffer(doc))
console.log('OK', path.basename(outPath))
