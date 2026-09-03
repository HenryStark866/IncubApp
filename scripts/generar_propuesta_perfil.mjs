/**
 * Actualiza docs con la propuesta profesional del autor
 * (tecnólogo mecatrónico + ing. software, dual coordinación).
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
const VER = '2.1'
const NAME = 'Henry Camilo Taborda Galeano'
const DEV = `${NAME} — Tecnólogo Mecatrónico · Estudiante de Ingeniería en Desarrollo de Software (6.º semestre)`
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
function bullet(text) {
  return new Paragraph({
    numbering: { reference: 'bullets', level: 0 },
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
        (r) => new TableRow({ children: r.map((c, i) => cell(String(c), colWidths[i])) })
      ),
    ],
  })
}
function cover(title, subtitle) {
  return [
    p(BRAND, { size: 40, bold: true, color: orange, after: 80 }),
    p(title, { size: 34, bold: true, color: navy, after: 120 }),
    p(subtitle, { size: 22, color: muted, after: 200 }),
    p(`${COMPANY} · ${DATE} · Versión ${VER}`, { size: 18, color: muted, after: 60 }),
    p(DEV, { size: 18, color: muted, after: 280 }),
  ]
}
function footerDoc(name) {
  return new Footer({
    children: [
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [
          new TextRun({
            text: `${BRAND} · ${name} · ${NAME} · pág. `,
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
  fs.writeFileSync(path.join(OUT, filename), buf)
  console.log('OK', filename)
}

/** Opinión estructurada + propuesta de cargo */
async function propuestaProfesional() {
  await writeDoc(
    'Propuesta Profesional y Area TI - IncubApp.docx',
    'Propuesta Profesional',
    [
      ...cover(
        'Propuesta profesional y creación del área de Implementación TI',
        'Perfil del proponente · valor demostrado · coordinación dual Mantenimiento + TI'
      ),

      h1('1. Propósito de este documento'),
      p(
        'Presentar a la dirección una propuesta clara, medible y alineada al negocio: formalizar el rol de quien ya diseñó, construyó y sostiene IncubApp con recursos propios, y crear el área de Implementación TI con coordinación dual junto a Mantenimiento. No es un pedido de título vacío: es un plan para reducir costos ocultos, dependencia externa, tiempos de respuesta y pérdida de conocimiento operativo.'
      ),

      h1('2. Perfil del proponente'),
      table(
        ['Dimensión', 'Hecho'],
        [
          ['Formación', 'Tecnólogo Mecatrónico; próximo ingeniero. Cursa 6.º semestre de Ingeniería en Desarrollo de Software.'],
          ['Experiencia en planta', 'Más de un (1) año en el área de mantenimiento, cargo de auxiliar.'],
          ['Producto', 'Ideador y único desarrollador de IncubApp (evolución de la línea Incubant).'],
          ['Inversión personal', 'Tiempo libre, vacaciones, y pago de membresías/herramientas de desarrollo con recursos propios.'],
          ['Doble dominio', 'Campo (mantenimiento, máquinas, turnos) + software (arquitectura, seguridad, módulos, despliegue).'],
        ],
        [2800, 6560]
      ),
      p(
        'Esta combinación es poco frecuente en el mercado: quien construye el sistema ya entiende el lenguaje de la planta. Eso acorta el ciclo “problema operativo → solución digital” de semanas a días o horas.',
        { before: 160 }
      ),

      h1('3. Valor ya demostrado (no promesas)'),
      bullet('Plataforma multi-módulo en operación conceptual y técnica real: rondas con foto, OT, granja/levantes, recepción, ventas, logística, sanidad, inventarios, gerencia, reportes verificados, asistencia, notificaciones selectivas y paneles de ingeniería industrial.'),
      bullet('Modelo de módulos herméticos: cada área ve lo suyo; se reduce ruido y riesgo de interferencia entre procesos.'),
      bullet('Documentación de presentación, manuales, contrato de licencia y manual técnico listos para decisión de dirección.'),
      bullet('Inversión de tiempo y dinero personal que la empresa no ha tenido que contratar como fábrica de software externa por el mismo alcance.'),

      h1('4. El problema que resuelve la propuesta organizacional'),
      h2('4.1 Hoy (riesgos)'),
      bullet('El conocimiento del sistema está concentrado en una sola persona sin cargo formal de TI/implementación.'),
      bullet('Mantenimiento y digitalización corren en paralelo sin un dueño único del “cómo se implementa en campo”.'),
      bullet('Cada falla, mejora o capacitación depende de tiempo libre del auxiliar, no de un plan de área.'),
      bullet('Proveedores externos de software suelen costar caro y no conocen la planta; aquí el know-how ya está dentro.'),

      h2('4.2 Mañana (con área de Implementación TI + coordinación dual)'),
      bullet('Un solo interlocutor entre dirección, mantenimiento, planta y gerencia para IncubApp y automatización ligera.'),
      bullet('Priorización formal: qué se construye, qué se estabiliza, qué se capacita, qué se mide.'),
      bullet('Reducción de planillas paralelas, retrabajo, tiempos de espera y dependencia de consultorías genéricas.'),
      bullet('Carrera interna clara: del auxiliar que ya produce valor, al coordinador que escala el valor.'),

      h1('5. Propuesta de cargo y estructura'),
      h2('5.1 Crear el área: Implementación TI'),
      p(
        'Área responsable de llevar tecnología a la operación real: despliegue de IncubApp por roles, capacitación, calidad de datos, integraciones, sensores/IoT piloto, soporte de primer nivel y evolución del producto con el negocio.'
      ),
      h2('5.2 Coordinación dual (petición formal)'),
      p(
        'Nombrar al proponente como Coordinador de Mantenimiento y Coordinador de Implementación TI (o Coordinador de Mantenimiento con funciones de Implementación TI, si la estructura salarial lo exige en una sola plaza con anexo de funciones).'
      ),
      p('Alcance conjunto (resumen):', { bold: true, before: 120 }),
      bullet('Mantenimiento: priorización de OT, estándares de respuesta, evidencia digital, indicadores de downtime y apoyo a la coordinación de planta.'),
      bullet('Implementación TI: roadmap de IncubApp, módulos herméticos, reportes a gerencia, asistencia, notificaciones, seguridad de acceso, documentación y soporte a usuarios.'),
      bullet('Puente mecatrónico: automatización y sensórica con criterio de planta (no “TI de escritorio” desconectado).'),

      h1('6. Qué se reduce (argumento de negocio)'),
      table(
        ['Qué se reduce', 'Cómo'],
        [
          ['Costo de desarrollo externo', 'Producto ya construido y mantenible por quien lo ideó; cotizaciones de fábrica de software suelen superar con creces el costo de formalizar el rol interno.'],
          ['Tiempo de respuesta', 'Misma persona entiende la falla en campo y el módulo en la app.'],
          ['Retrabajo y planillas', 'Una fuente de verdad digital por módulo.'],
          ['Riesgo de conocimiento único informal', 'Al formalizar el área se puede planear respaldo, documentación y sucesión.'],
          ['Ruido a gerencia', 'OT a planta; a gerencia llegan OC/facturas/reportes verificados (diseño actual de IncubApp).'],
          ['Fricción entre áreas', 'Módulos herméticos + accesos temporales controlados.'],
        ],
        [3200, 6160]
      ),

      h1('7. Condiciones mínimas para que el cargo funcione'),
      bullet('Reconocimiento formal del rol (coordinación) y tiempo laboral asignado a Implementación TI (no solo “en los ratos libres”).'),
      bullet('Presupuesto operativo básico: Supabase Pro, hosting comercial, dominio, y herramientas de desarrollo (hoy en parte absorbidas por el proponente).'),
      bullet('Autoridad para priorizar implementación con jefes de área y capacitar turnos.'),
      bullet('Licencia de uso de IncubApp a la empresa manteniendo la propiedad intelectual del desarrollador (ver contrato en /docs).'),
      bullet('Plan de 90 días con entregables medibles (sección 8).'),

      h1('8. Plan de 90 días (si se aprueba el nombramiento)'),
      table(
        ['Plazo', 'Entregable'],
        [
          ['Días 1–30', 'Migraciones SQL en cloud, roles por persona, capacitación a 2 turnos, tablero Hoy estable, política “todo en IncubApp”.'],
          ['Días 31–60', 'Bandeja de gerencia (reportes verificados), asistencia con foto en operación, indicadores de ronda/OT para planta.'],
          ['Días 61–90', 'Piloto IoT 2–3 máquinas o checklist digital de mantenimiento; manuales vivos; informe de reducción de planillas/tiempos a dirección.'],
        ],
        [2400, 6960]
      ),

      h1('9. Sobre compañeros y equipo'),
      p(
        'No se conoce a priori el nivel de estudio ni la experiencia en software de otros compañeros. Esa incertidumbre refuerza la necesidad de un dueño formal del sistema: sin él, la plataforma depende de buena voluntad informal. La propuesta no excluye formar un equipo; al contrario, el coordinador de Implementación TI es quien puede incorporar y orientar apoyo (interno o externo) sin perder el norte de planta.'
      ),

      h1('10. Lectura honesta (recomendación)'),
      p(
        'La petición es ambiciosa pero coherente: quien ya invirtió más de un año en mantenimiento y construyó en solitario una plataforma del tamaño de IncubApp está en posición natural de coordinar la implementación. El riesgo para la empresa no es “darle demasiado cargo”; el riesgo es seguir dependiendo de un auxiliar sin mandato ni presupuesto mientras el sistema se vuelve crítico.'
      ),
      p(
        'Recomendación: aprobar en dos pasos — (1) reconocimiento de Implementación TI y tiempo formal; (2) coordinación dual o anexo de funciones a coordinación de mantenimiento — con revisión a 90 días según indicadores.',
        { before: 120 }
      ),

      h1('11. Solicitud concreta a la dirección'),
      bullet(`Crear el área de Implementación TI en ${COMPANY}.`),
      bullet(`Nombrar a ${NAME} como Coordinador de Mantenimiento y de Implementación TI (o figura equivalente con ambas funciones).`),
      bullet('Asignar presupuesto mínimo de plataforma (ver Servicios y Presupuesto).'),
      bullet('Formalizar licencia de uso de IncubApp (ver Contrato).'),
      bullet('Aprobar el plan de 90 días y fecha de revisión.'),

      p(
        'Quedo atento a la conversación y a ajustar el alcance del cargo a la estructura salarial y organigrama de la empresa, sin diluir la responsabilidad sobre el producto y su implementación en campo.',
        { before: 200 }
      ),
      p(`${NAME}`, { before: 200, bold: true }),
      p('Tecnólogo Mecatrónico · 6.º semestre Ingeniería en Desarrollo de Software', {
        size: 18,
        color: muted,
      }),
      p('Auxiliar de Mantenimiento · Ideador y desarrollador de IncubApp', {
        size: 18,
        color: muted,
      }),
      p(`${COMPANY} · ${DATE}`, { size: 18, color: muted, before: 80 }),
    ]
  )
}

async function presentacion() {
  const pptx = new PptxGenJS()
  pptx.defineLayout({ name: 'WIDE', width: 13.333, height: 7.5 })
  pptx.layout = 'WIDE'
  pptx.author = NAME
  pptx.title = `${BRAND} — Presentación y propuesta profesional`

  // 1 Portada
  {
    const s = pptx.addSlide()
    s.addShape(pptx.shapes.RECTANGLE, { x: 0, y: 0, w: 13.333, h: 7.5, fill: { color: navy } })
    s.addShape(pptx.shapes.RECTANGLE, { x: 0, y: 0, w: 0.28, h: 7.5, fill: { color: orange } })
    s.addText(BRAND, {
      x: 0.9, y: 1.8, w: 11, h: 0.65,
      fontSize: 40, bold: true, color: orange, fontFace: 'Arial',
    })
    s.addText('Plataforma de incubación + propuesta de área TI', {
      x: 0.9, y: 2.55, w: 11.5, h: 0.5,
      fontSize: 22, color: 'FFFFFF', fontFace: 'Arial',
    })
    s.addText(
      `${NAME}\nTecnólogo Mecatrónico · 6.º semestre Ing. Desarrollo de Software\nAuxiliar de Mantenimiento · Ideador y único desarrollador de IncubApp\n${COMPANY} · ${DATE}`,
      {
        x: 0.9, y: 4.3, w: 11.5, h: 2.0,
        fontSize: 14, color: 'A8B0C0', fontFace: 'Arial',
      }
    )
  }

  // 2 Quién soy
  {
    const s = pptx.addSlide()
    s.addShape(pptx.shapes.RECTANGLE, { x: 0, y: 0, w: 13.333, h: 0.9, fill: { color: cream } })
    s.addText('Quién presenta (y por qué pesa el perfil)', {
      x: 0.5, y: 0.25, w: 12, h: 0.5,
      fontSize: 24, bold: true, color: navy, fontFace: 'Arial',
    })
    const cards = [
      { t: 'Mecatrónica + Software', d: 'Tecnólogo mecatrónico y estudiante de ingeniería de software (6.º semestre): une campo y código.' },
      { t: 'Más de 1 año en mantenimiento', d: 'Auxiliar en planta: conozco máquinas, turnos, OT y el dolor real del día a día.' },
      { t: 'Producto propio', d: 'La idea, el diseño y el desarrollo de IncubApp los hice solo, en tiempo libre y vacaciones.' },
      { t: 'Inversión personal', d: 'Membresías y herramientas las he pagado yo. No es un proyecto “regalado por la empresa”: es una apuesta profesional.' },
    ]
    cards.forEach((c, i) => {
      const x = 0.45 + (i % 2) * 6.4
      const y = 1.2 + Math.floor(i / 2) * 2.85
      s.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
        x, y, w: 6.1, h: 2.55,
        fill: { color: 'FFFFFF' },
        shadow: { type: 'outer', color: '000000', blur: 8, opacity: 0.08, offset: 2 },
        rectRadius: 0.1,
      })
      s.addShape(pptx.shapes.RECTANGLE, { x, y, w: 0.14, h: 2.55, fill: { color: orange } })
      s.addText(c.t, {
        x: x + 0.4, y: y + 0.35, w: 5.4, h: 0.5,
        fontSize: 16, bold: true, color: navy, fontFace: 'Arial',
      })
      s.addText(c.d, {
        x: x + 0.4, y: y + 1.0, w: 5.4, h: 1.2,
        fontSize: 13, color: muted, fontFace: 'Arial',
      })
    })
  }

  // 3 Qué es IncubApp
  {
    const s = pptx.addSlide()
    s.addShape(pptx.shapes.RECTANGLE, { x: 0, y: 0, w: 13.333, h: 0.9, fill: { color: cream } })
    s.addText('IncubApp: de la planta al software', {
      x: 0.5, y: 0.25, w: 12, h: 0.5,
      fontSize: 24, bold: true, color: navy, fontFace: 'Arial',
    })
    s.addText(
      'No es un “excel bonito”: es una plataforma multi-módulo con permisos herméticos, evidencia fotográfica, gerencia con bandeja verificada, asistencia, notificaciones selectivas y paneles de ingeniería industrial.',
      { x: 0.5, y: 1.15, w: 12.3, h: 0.9, fontSize: 15, color: ink, fontFace: 'Arial' }
    )
    const pills = [
      'Rondas + foto',
      'OT / mantenimiento',
      'Granja / levantes',
      'Recepción y frío',
      'Ventas y logística',
      'Gerencia + Asesor',
      'Reportes OC/factura',
      'Asistencia',
      'Módulos herméticos',
    ]
    pills.forEach((t, i) => {
      const x = 0.5 + (i % 3) * 4.2
      const y = 2.3 + Math.floor(i / 3) * 1.45
      s.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
        x, y, w: 3.95, h: 1.2,
        fill: { color: i % 2 ? navy : orange },
        rectRadius: 0.08,
      })
      s.addText(t, {
        x: x + 0.15, y: y + 0.38, w: 3.65, h: 0.45,
        fontSize: 14, bold: true, color: 'FFFFFF', fontFace: 'Arial', align: 'center',
      })
    })
  }

  // 4 Módulos herméticos
  {
    const s = pptx.addSlide()
    s.addShape(pptx.shapes.RECTANGLE, { x: 0, y: 0, w: 13.333, h: 0.9, fill: { color: cream } })
    s.addText('Módulos herméticos: orden y menos ruido', {
      x: 0.5, y: 0.25, w: 12, h: 0.5,
      fontSize: 24, bold: true, color: navy, fontFace: 'Arial',
    })
    s.addText(
      'Cada área ve su módulo. Acceso temporal solo con solicitud y aprobación del responsable. Gerencia no se satura con cada OT: recibe documentos y reportes verificados. Coordinación de planta atiende la operación.',
      { x: 0.5, y: 1.2, w: 12.3, h: 1.1, fontSize: 15, color: ink, fontFace: 'Arial' }
    )
    const cols = [
      { t: 'Planta', d: 'Ronda, monitoreo, recepción, OT' },
      { t: 'Gerencia', d: 'Bandeja, OC, facturas, informes' },
      { t: 'Mantenimiento', d: 'OT, evidencias, prioridades' },
      { t: 'Admin plataforma', d: 'Único omnisciente multi-empresa' },
    ]
    cols.forEach((c, i) => {
      const x = 0.45 + i * 3.2
      s.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
        x, y: 2.7, w: 3.0, h: 3.6,
        fill: { color: 'FFFFFF' },
        shadow: { type: 'outer', color: '000000', blur: 8, opacity: 0.08, offset: 2 },
        rectRadius: 0.1,
      })
      s.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
        x, y: 2.7, w: 3.0, h: 0.7,
        fill: { color: i === 3 ? orange : navy },
        rectRadius: 0.1,
      })
      s.addText(c.t, {
        x: x + 0.1, y: 2.85, w: 2.8, h: 0.4,
        fontSize: 14, bold: true, color: 'FFFFFF', fontFace: 'Arial', align: 'center',
      })
      s.addText(c.d, {
        x: x + 0.2, y: 3.8, w: 2.6, h: 2.0,
        fontSize: 13, color: muted, fontFace: 'Arial', align: 'center',
      })
    })
  }

  // 5 Propuesta de cargo
  {
    const s = pptx.addSlide()
    s.addShape(pptx.shapes.RECTANGLE, { x: 0, y: 0, w: 13.333, h: 0.9, fill: { color: cream } })
    s.addText('Propuesta: Coordinación dual', {
      x: 0.5, y: 0.25, w: 12, h: 0.5,
      fontSize: 24, bold: true, color: navy, fontFace: 'Arial',
    })
    s.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
      x: 0.5, y: 1.2, w: 6.0, h: 5.5,
      fill: { color: navy },
      rectRadius: 0.12,
    })
    s.addText('Mantenimiento', {
      x: 0.8, y: 1.5, w: 5.4, h: 0.5,
      fontSize: 20, bold: true, color: orange, fontFace: 'Arial',
    })
    s.addText(
      '• Prioridad de OT y estándares\n• Evidencia digital en campo\n• Indicadores de downtime\n• Lenguaje de planta y turnos\n• Apoyo a coordinación de planta',
      {
        x: 0.8, y: 2.3, w: 5.4, h: 3.8,
        fontSize: 15, color: 'FFFFFF', fontFace: 'Arial',
      }
    )
    s.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
      x: 6.8, y: 1.2, w: 6.0, h: 5.5,
      fill: { color: orange },
      rectRadius: 0.12,
    })
    s.addText('Implementación TI (nueva área)', {
      x: 7.1, y: 1.5, w: 5.4, h: 0.7,
      fontSize: 18, bold: true, color: 'FFFFFF', fontFace: 'Arial',
    })
    s.addText(
      '• IncubApp por roles y módulos\n• Capacitación y adopción\n• Reportes a gerencia\n• Seguridad de accesos\n• IoT / automatización ligera\n• Roadmap del producto',
      {
        x: 7.1, y: 2.4, w: 5.4, h: 3.8,
        fontSize: 15, color: 'FFFFFF', fontFace: 'Arial',
      }
    )
  }

  // 6 Qué se reduce
  {
    const s = pptx.addSlide()
    s.addShape(pptx.shapes.RECTANGLE, { x: 0, y: 0, w: 13.333, h: 0.9, fill: { color: cream } })
    s.addText('Qué se reduce al formalizar el rol', {
      x: 0.5, y: 0.25, w: 12, h: 0.5,
      fontSize: 24, bold: true, color: navy, fontFace: 'Arial',
    })
    const rows = [
      ['Costo de software externo', 'El producto ya existe y lo mantiene quien conoce la planta'],
      ['Tiempo de respuesta', 'Misma persona: falla en campo ↔ módulo en la app'],
      ['Retrabajo y planillas', 'Una sola fuente de verdad por módulo'],
      ['Ruido a gerencia', 'OT en planta; a gerencia documentos verificados'],
      ['Riesgo de conocimiento informal', 'Área con plan, indicadores y sucesión'],
      ['Dependencia de “tiempo libre”', 'Horas laborales asignadas a implementación'],
    ]
    rows.forEach((r, i) => {
      const y = 1.15 + i * 0.95
      s.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
        x: 0.5, y, w: 12.3, h: 0.85,
        fill: { color: i % 2 ? cream : 'FFFFFF' },
        rectRadius: 0.06,
      })
      s.addText(r[0], {
        x: 0.7, y: y + 0.22, w: 4.8, h: 0.45,
        fontSize: 14, bold: true, color: orange, fontFace: 'Arial',
      })
      s.addText(r[1], {
        x: 5.6, y: y + 0.22, w: 6.9, h: 0.45,
        fontSize: 14, color: ink, fontFace: 'Arial',
      })
    })
  }

  // 7 90 días
  {
    const s = pptx.addSlide()
    s.addShape(pptx.shapes.RECTANGLE, { x: 0, y: 0, w: 13.333, h: 0.9, fill: { color: cream } })
    s.addText('Plan de 90 días si se aprueba el nombramiento', {
      x: 0.5, y: 0.25, w: 12, h: 0.5,
      fontSize: 22, bold: true, color: navy, fontFace: 'Arial',
    })
    const phases = [
      { n: '30', t: 'Días 1–30', d: 'SQL en cloud, roles, 2 turnos capacitados, Hoy estable, política “todo en IncubApp”.' },
      { n: '60', t: 'Días 31–60', d: 'Bandeja gerencia, asistencia en operación, KPIs de ronda/OT para planta.' },
      { n: '90', t: 'Días 61–90', d: 'Piloto IoT o checklist digital de MTTO; informe de reducción a dirección.' },
    ]
    phases.forEach((ph, i) => {
      const x = 0.5 + i * 4.2
      s.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
        x, y: 1.4, w: 4.0, h: 5.2,
        fill: { color: i === 1 ? orange : navy },
        rectRadius: 0.12,
      })
      s.addText(ph.n, {
        x: x + 0.3, y: 1.8, w: 3.4, h: 0.7,
        fontSize: 36, bold: true, color: 'FFFFFF', fontFace: 'Arial',
      })
      s.addText(ph.t, {
        x: x + 0.3, y: 2.7, w: 3.4, h: 0.5,
        fontSize: 16, bold: true, color: cream, fontFace: 'Arial',
      })
      s.addText(ph.d, {
        x: x + 0.3, y: 3.5, w: 3.4, h: 2.5,
        fontSize: 14, color: 'FFFFFF', fontFace: 'Arial',
      })
    })
  }

  // 8 Pedidos a dirección
  {
    const s = pptx.addSlide()
    s.addShape(pptx.shapes.RECTANGLE, { x: 0, y: 0, w: 13.333, h: 0.9, fill: { color: cream } })
    s.addText('Lo que pido a la dirección (concreto)', {
      x: 0.5, y: 0.25, w: 12, h: 0.5,
      fontSize: 24, bold: true, color: navy, fontFace: 'Arial',
    })
    const asks = [
      'Crear el área de Implementación TI',
      'Nombrarme Coordinador de Mantenimiento + Implementación TI',
      'Asignar tiempo laboral real (no solo vacaciones y noches)',
      'Presupuesto mínimo de plataforma (Supabase, hosting, dominio)',
      'Licencia formal de uso de IncubApp (IP del desarrollador)',
      'Revisión a 90 días con indicadores',
    ]
    asks.forEach((a, i) => {
      const y = 1.2 + i * 0.95
      s.addShape(pptx.shapes.OVAL, {
        x: 0.6, y: y + 0.1, w: 0.55, h: 0.55,
        fill: { color: orange },
      })
      s.addText(String(i + 1), {
        x: 0.6, y: y + 0.18, w: 0.55, h: 0.4,
        fontSize: 14, bold: true, color: 'FFFFFF', fontFace: 'Arial', align: 'center',
      })
      s.addText(a, {
        x: 1.4, y: y + 0.15, w: 11.2, h: 0.5,
        fontSize: 16, color: ink, fontFace: 'Arial',
      })
    })
  }

  // 9 Cierre
  {
    const s = pptx.addSlide()
    s.addShape(pptx.shapes.RECTANGLE, { x: 0, y: 0, w: 13.333, h: 7.5, fill: { color: navy } })
    s.addShape(pptx.shapes.RECTANGLE, { x: 0, y: 0, w: 0.28, h: 7.5, fill: { color: orange } })
    s.addText('El riesgo no es formalizar el cargo.', {
      x: 0.9, y: 2.0, w: 11.5, h: 0.7,
      fontSize: 26, bold: true, color: 'FFFFFF', fontFace: 'Arial',
    })
    s.addText(
      'El riesgo es seguir dependiendo de un auxiliar sin mandato ni presupuesto mientras el sistema se vuelve crítico para la operación.',
      {
        x: 0.9, y: 2.9, w: 11.5, h: 1.2,
        fontSize: 18, color: 'A8B0C0', fontFace: 'Arial',
      }
    )
    s.addText(
      `${NAME}\nTecnólogo Mecatrónico · 6.º semestre Ingeniería en Desarrollo de Software\nAuxiliar de Mantenimiento · Desarrollador de IncubApp`,
      {
        x: 0.9, y: 4.8, w: 11.5, h: 1.5,
        fontSize: 14, color: orange, fontFace: 'Arial',
      }
    )
  }

  const pptPath = path.join(OUT, 'Presentacion General - IncubApp.pptx')
  await pptx.writeFile({ fileName: pptPath })
  console.log('OK Presentacion General - IncubApp.pptx')
}

async function actualizarPeticiones() {
  await writeDoc(
    'Peticiones a Coordinacion - IncubApp.docx',
    'Peticiones a Coordinación',
    [
      ...cover(
        'Peticiones a Coordinación',
        'Recursos de plataforma + formalización del área de Implementación TI'
      ),
      h1('1. Propósito'),
      p(
        `Este documento integra dos frentes: (A) lo que la plataforma necesita para operar con estándar industrial; (B) la propuesta de ${NAME} — tecnólogo mecatrónico, estudiante de 6.º semestre de Ingeniería en Desarrollo de Software, auxiliar de mantenimiento con más de un año en el área, ideador y único desarrollador de IncubApp con recursos y tiempo propios — para crear el área de Implementación TI y coordinar Mantenimiento + TI.`
      ),

      h1('2. Contexto del proponente'),
      bullet('Formación dual: mecatrónica (campo/máquinas) + ingeniería de software en curso.'),
      bullet('IncubApp construida en solitario en tiempo libre y vacaciones; membresías de herramientas pagadas por el proponente.'),
      bullet('Experiencia real de mantenimiento: entiende OT, turnos y lenguaje de planta.'),
      bullet('Aspiración: Coordinador de Mantenimiento y de Implementación TI para reducir costos externos, tiempos de respuesta y conocimiento informal.'),

      h1('3. Peticiones críticas de plataforma'),
      h2('3.1 Supabase Pro'),
      p('Backups y storage de fotos. Plan free no es viable para operación industrial.'),
      h2('3.2 Hosting comercial (Vercel Pro) + dominio'),
      p('Uso comercial legítimo y URL profesional.'),
      h2('3.3 GitHub privado'),
      p('Versionado, auditoría y rollback.'),
      h2('3.4 Migraciones SQL en cloud'),
      p('access_grants, dispatches/attendance y migraciones previas deben estar aplicadas.'),
      h2('3.5 Credenciales y 2FA'),
      p('Rotación de llaves y doble factor en cuentas raíz.'),

      h1('4. Petición organizacional (núcleo de esta versión)'),
      h2('4.1 Crear el área de Implementación TI'),
      p(
        'Responsable de llevar IncubApp y automatización ligera a la operación: despliegue por roles, capacitación, calidad de datos, soporte, IoT piloto y roadmap con el negocio.'
      ),
      h2('4.2 Nombramiento dual'),
      p(
        `Nombrar a ${NAME} como Coordinador de Mantenimiento y Coordinador de Implementación TI (o un solo cargo de coordinación con anexo de ambas funciones, según estructura salarial).`
      ),
      h2('4.3 Condiciones para que funcione'),
      bullet('Tiempo laboral formal para TI (no solo noches y vacaciones).'),
      bullet('Presupuesto mínimo de plataforma (ver Servicios y Presupuesto).'),
      bullet('Autoridad para priorizar con jefes de área y capacitar turnos.'),
      bullet('Licencia de uso de IncubApp con IP del desarrollador (ver Contrato).'),
      bullet('Plan de 90 días con revisión (detalle en Propuesta Profesional).'),

      h1('5. Qué se reduce'),
      bullet('Costo de desarrollo externo equivalente.'),
      bullet('Tiempo entre problema de planta y solución digital.'),
      bullet('Planillas paralelas y retrabajo.'),
      bullet('Ruido a gerencia (diseño actual: OT en planta; documentos verificados en gerencia).'),
      bullet('Dependencia de un “favor” informal del auxiliar.'),

      h1('6. Eficiencia operativa (complemento)'),
      bullet('Celulares con buena cámara y conectividad en planta/granja.'),
      bullet('Capacitación por rol con Manual de Usuario v2.'),
      bullet('Política: una sola fuente de verdad en IncubApp.'),
      bullet('Piloto IoT 2–3 incubadoras cuando el presupuesto lo permita.'),

      h1('7. Documentos de soporte en /docs'),
      bullet('Propuesta Profesional y Area TI - IncubApp.docx (argumento completo).'),
      bullet('Presentacion General - IncubApp.pptx.'),
      bullet('Manual de Usuario / Manual Técnico / Contrato / Presupuesto / Depósito de código.'),

      p(
        'La lectura honesta: el riesgo no es formalizar el cargo; es que el sistema se vuelva crítico sin mandato ni presupuesto para quien ya lo sostiene.',
        { before: 200, italics: true }
      ),
      p(`${NAME}`, { before: 200, bold: true }),
      p('Tecnólogo Mecatrónico · 6.º semestre Ingeniería en Desarrollo de Software', {
        size: 18,
        color: muted,
      }),
      p('Auxiliar de Mantenimiento · Desarrollador de IncubApp', { size: 18, color: muted }),
      p(`${COMPANY} · ${DATE}`, { size: 18, color: muted, before: 80 }),
    ]
  )
}

async function main() {
  if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true })
  await propuestaProfesional()
  await actualizarPeticiones()
  await presentacion()
  console.log('\nActualizado. Ver docs/')
  for (const f of fs.readdirSync(OUT)) console.log(' -', f)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
