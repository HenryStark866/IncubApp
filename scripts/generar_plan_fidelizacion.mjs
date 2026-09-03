/**
 * Genera Word + PPTX del Plan de Fidelización y Expansión SaaS.
 * Henry Stark Desarrollador · IncubApp v3.0
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
            text: String(text),
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

async function writeWord() {
  const children = [
    p(BRAND, { size: 40, bold: true, color: orange, after: 80 }),
    p('Plan de fidelización y expansión SaaS', {
      size: 34,
      bold: true,
      color: navy,
      after: 120,
    }),
    p(
      '90 días de uso continuo · Bono por cumplimiento ≥95 % · Captación de clientes y empresas hermanas',
      { size: 20, color: muted, after: 160 }
    ),
    p(`${COMPANY} · ${DATE} · Versión ${VER}`, { size: 18, color: muted, after: 40 }),
    p(`Preparado por ${DEV}`, { size: 18, color: muted, after: 280 }),

    h1('1. Visión'),
    p(
      'Usar 90 días de uso continuo real en la planta piloto para demostrar un servicio sólido, medible y respaldado con datos, y con esa prueba de campo captar a clientes y empresas hermanas que adopten IncubApp como infraestructura administrada (SaaS: software + bases de datos).'
    ),

    h1('2. Fidelización del personal (uso al 100 %)'),
    p(
      'Todos los usuarios deben operar la app en su labor diaria. El coordinador define lo esperado; el personal reporta lo realizado. El sistema calcula el cumplimiento.'
    ),
    h2('2.1 Reglas del bono de cumplimiento'),
    table(
      ['Condición', 'Valor'],
      [
        ['Uso continuo de la SaaS', '≥ 90 días (racha diaria Bogotá)'],
        ['Cumplimiento de labores', '≥ 95 % (esperado vs reportado)'],
        ['Adherencia al turno', 'Ingreso + salida con selfie y marca de agua'],
        ['Turneros', 'Mínimo 6 reportes de ronda por turno (ajustable)'],
      ],
      [4200, 5000]
    ),
    p('', { after: 120 }),
    h2('2.2 Origen del dinero del bono'),
    p(
      'El bono NO se paga con fondos de nómina ni caja operativa de la planta. Se financia con la venta de infraestructura como servicio a clientes externos y empresas hermanas: licencia SaaS, administración del software y de sus bases de datos, soporte y mejora continua.',
      { bold: true }
    ),
    h2('2.3 Evidencia de asistencia'),
    bullet('Selfie obligatoria (cámara frontal).'),
    bullet('Marca de agua: IncubApp · INGRESO/SALIDA · nombre · fecha/hora · lugar/GPS.'),
    bullet('Sello SELFIE VERIFICADA en la imagen guardada.'),

    h1('3. Por qué 90 días son la prueba de fuego'),
    table(
      ['Días', 'Hito', 'Resultado'],
      [
        ['0–30', 'Adopción', 'Asistencia, rondas, reportes, roles en uso'],
        ['31–60', 'Estabilización', 'Metas del coordinador y bandeja gerencial'],
        ['61–90', 'Madurez', 'Indicadores e historial verificable'],
        ['90+', 'Expansión', 'Pitch SaaS a clientes y empresas hermanas'],
      ],
      [1600, 2800, 4800]
    ),
    p('', { after: 120 }),
    p(
      'Al día 90 se puede demostrar uso diario medible, cumplimiento por persona, documentos gerenciales aprobados y operación multi-módulo en producción. Ese es el respaldo real para captar a los demás.'
    ),

    h1('4. Expansión SaaS multi-empresa'),
    h2('4.1 Oferta'),
    bullet('Licencia IncubApp (web/PWA multi-usuario por organización).'),
    bullet('Administración de software (actualizaciones, módulos, roles, soporte).'),
    bullet('Administración de bases de datos (tenant por org, respaldos, RLS).'),
    bullet('Puesta en marcha (onboarding de plantas, metas de cumplimiento).'),
    h2('4.2 Ciclo virtuoso'),
    p(
      'Empresa ancla (90 días de uso real) → evidencia y producto maduro → clientes y hermanas contratan SaaS → ingresos de infraestructura → bolsa de bonos de cumplimiento → más uso al 100 % → mejor producto → más captación.'
    ),
    h2('4.3 Fases'),
    table(
      ['Fase', 'Nombre', 'Acción'],
      [
        ['F0', 'Piloto ancla', 'Uso interno 100 %; migraciones; cumplimiento activo'],
        ['F1', 'Maduración 90 d', 'Medir rachas, rondas, bandeja'],
        ['F2', 'Primeras hermanas', '1–3 organizaciones; contrato SaaS'],
        ['F3', 'Red SaaS', 'Multi-sede; bolsa de bonos consolidada'],
        ['F4', 'Escala', 'SLAs, facturación recurrente, IoT en vivo'],
      ],
      [1200, 2400, 5600]
    ),

    h1('5. Elevator pitch comercial'),
    p(
      '«No vendemos un software vacío: lo operamos 90+ días en planta real con asistencia selfie, rondas, OT, gerencia y cumplimiento medible. Usted recibe la misma infraestructura administrada (app + base de datos), y su personal puede sumarse a un plan de bonos por cumplimiento financiado por la red SaaS, no por su nómina.»',
      { italics: true }
    ),

    h1('6. Implementación en IncubApp (ya construida)'),
    bullet('Pestaña Cumplimiento: scores, rondas, metas del coordinador, ranking y export.'),
    bullet('Motor: complianceEngine.js (90 d / 95 % / 6 rondas).'),
    bullet('Asistencia con watermark: watermark.js + AttendancePanel.'),
    bullet('Bandeja gerencial: SiloReportsPanel (OC, facturas, cotizaciones).'),
    bullet('SQL: supabase_migration_performance_bonus.sql'),
    bullet('Docs Markdown: docs/Plan_Fidelizacion_y_Expansion_SaaS.md'),

    h1('7. Próximos pasos'),
    bullet('Operar 90 días con metas publicadas por el coordinador.'),
    bullet('Ejecutar migraciones SQL en Supabase producción.'),
    bullet('Revisión semanal del ranking de Cumplimiento.'),
    bullet('Definir precios SaaS por sede/usuario y % a bolsa de bonos.'),
    bullet('Abordar primera empresa hermana con el caso de 90 días.'),

    p('', { after: 200 }),
    p(`Documentado por ${DEV}`, { size: 18, color: muted }),
    p(`${BRAND} · ${VER} · ${DATE}`, { size: 18, color: muted }),
  ]

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
    numbering: {
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
                    text: `${BRAND} — Plan de fidelización y expansión SaaS`,
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
  const outPath = path.join(OUT, 'Plan_Fidelizacion_y_Expansion_SaaS.docx')
  fs.writeFileSync(outPath, await Packer.toBuffer(doc))
  console.log('OK', path.basename(outPath))
}

async function writePptx() {
  const pptx = new PptxGenJS()
  pptx.defineLayout({ name: 'WIDE', width: 13.333, height: 7.5 })
  pptx.layout = 'WIDE'
  pptx.author = DEV
  pptx.title = `${BRAND} — Plan fidelización y expansión`

  const addTitle = (s, t) => {
    s.addShape(pptx.shapes.RECTANGLE, {
      x: 0, y: 0, w: 13.333, h: 0.7, fill: { color: navy },
    })
    s.addText(t, {
      x: 0.5, y: 0.18, w: 12, h: 0.4,
      fontSize: 20, bold: true, color: 'FFFFFF', fontFace: 'Arial',
    })
  }

  // Portada
  {
    const s = pptx.addSlide()
    s.addShape(pptx.shapes.RECTANGLE, {
      x: 0, y: 0, w: 13.333, h: 7.5, fill: { color: navy },
    })
    s.addShape(pptx.shapes.RECTANGLE, {
      x: 0, y: 0, w: 0.25, h: 7.5, fill: { color: orange },
    })
    s.addText(BRAND, {
      x: 0.8, y: 2.0, w: 11, h: 0.5,
      fontSize: 18, color: orange, bold: true, fontFace: 'Arial',
    })
    s.addText('Plan de fidelización y expansión SaaS', {
      x: 0.8, y: 2.6, w: 11.5, h: 1,
      fontSize: 32, bold: true, color: 'FFFFFF', fontFace: 'Arial',
    })
    s.addText(
      '90 días de uso continuo · Bono ≥95 % · Clientes y empresas hermanas',
      {
        x: 0.8, y: 3.8, w: 11, h: 0.5,
        fontSize: 16, color: 'B8C4D9', fontFace: 'Arial',
      }
    )
    s.addText(`${COMPANY}\n${DATE} · v${VER}\n${DEV}`, {
      x: 0.8, y: 5.4, w: 11, h: 1.2,
      fontSize: 13, color: '8FA3C8', fontFace: 'Arial',
    })
  }

  // Visión
  {
    const s = pptx.addSlide()
    addTitle(s, 'Visión')
    s.addText(
      'Operar 90 días en planta real con IncubApp genera el respaldo para vender infraestructura administrada a clientes y empresas hermanas.',
      {
        x: 0.6, y: 1.2, w: 12, h: 1.2,
        fontSize: 20, color: ink, fontFace: 'Arial',
      }
    )
    const cards = [
      { t: 'Uso 100 %', d: 'Cada rol reporta su labor en la app' },
      { t: '90 días', d: 'Racha continua = madurez del servicio' },
      { t: '≥ 95 %', d: 'Elegible a bono de cumplimiento' },
      { t: 'SaaS', d: 'Ingresos a clientes/hermanas financian el bono' },
    ]
    cards.forEach((c, i) => {
      const x = 0.5 + (i % 4) * 3.15
      s.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
        x, y: 3.0, w: 3.0, h: 2.8,
        fill: { color: cream },
        rectRadius: 0.1,
      })
      s.addText(c.t, {
        x: x + 0.15, y: 3.25, w: 2.7, h: 0.5,
        fontSize: 18, bold: true, color: orange, fontFace: 'Arial',
      })
      s.addText(c.d, {
        x: x + 0.15, y: 3.9, w: 2.7, h: 1.5,
        fontSize: 14, color: ink, fontFace: 'Arial',
      })
    })
  }

  // Reglas bono
  {
    const s = pptx.addSlide()
    addTitle(s, 'Reglas del bono de cumplimiento')
    s.addTable(
      [
        [
          { text: 'Condición', options: { bold: true, fill: { color: cream } } },
          { text: 'Valor', options: { bold: true, fill: { color: cream } } },
        ],
        ['Uso continuo SaaS', '≥ 90 días (racha diaria)'],
        ['Cumplimiento', '≥ 95 % esperado vs reportado'],
        ['Turno', 'Selfie ingreso/salida + marca de agua'],
        ['Turneros', 'Mín. 6 rondas por turno (coord. ajusta)'],
        ['Fondo del bono', 'NO nómina de planta → ingresos SaaS'],
      ],
      {
        x: 0.8, y: 1.3, w: 11.7, h: 5,
        colW: [4.5, 7.2],
        border: [{ pt: 0.5, color: line }],
        fontFace: 'Arial',
        fontSize: 15,
        color: ink,
      }
    )
  }

  // Timeline 90d
  {
    const s = pptx.addSlide()
    addTitle(s, 'Maduración 90 días = respaldo comercial')
    const phases = [
      { n: '0–30', t: 'Adopción', d: 'Asistencia, rondas, roles' },
      { n: '31–60', t: 'Estabilización', d: 'Metas + bandeja gerencial' },
      { n: '61–90', t: 'Madurez', d: 'Indicadores verificables' },
      { n: '90+', t: 'Expansión', d: 'Pitch a clientes y hermanas' },
    ]
    phases.forEach((ph, i) => {
      const x = 0.5 + i * 3.2
      s.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
        x, y: 2.0, w: 3.0, h: 3.8,
        fill: { color: i === 3 ? orange : cream },
        rectRadius: 0.1,
      })
      s.addText(ph.n, {
        x: x + 0.15, y: 2.3, w: 2.7, h: 0.5,
        fontSize: 22, bold: true,
        color: i === 3 ? 'FFFFFF' : orange,
        fontFace: 'Arial',
      })
      s.addText(ph.t, {
        x: x + 0.15, y: 3.0, w: 2.7, h: 0.5,
        fontSize: 18, bold: true,
        color: i === 3 ? 'FFFFFF' : navy,
        fontFace: 'Arial',
      })
      s.addText(ph.d, {
        x: x + 0.15, y: 3.7, w: 2.7, h: 1.5,
        fontSize: 14,
        color: i === 3 ? 'FFFFFF' : ink,
        fontFace: 'Arial',
      })
    })
  }

  // Ciclo
  {
    const s = pptx.addSlide()
    addTitle(s, 'Ciclo virtuoso de expansión')
    const steps = [
      '1. Uso real 90 días en empresa ancla',
      '2. Evidencia y producto maduro',
      '3. Clientes y hermanas contratan SaaS',
      '4. Ingresos de infraestructura',
      '5. Bolsa de bonos por cumplimiento',
      '6. Más uso 100 % → mejor producto → más captación',
    ]
    steps.forEach((t, i) => {
      s.addText(t, {
        x: 1.0, y: 1.3 + i * 0.85, w: 11, h: 0.7,
        fontSize: 20, color: ink, fontFace: 'Arial', bold: i === 0 || i === 5,
      })
    })
  }

  // Pitch
  {
    const s = pptx.addSlide()
    addTitle(s, 'Elevator pitch')
    s.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
      x: 0.8, y: 1.5, w: 11.7, h: 4.5,
      fill: { color: cream },
      rectRadius: 0.12,
    })
    s.addText(
      'No vendemos un software vacío: lo operamos 90+ días en planta real con asistencia selfie, rondas, OT, gerencia y cumplimiento medible. Usted recibe la misma infraestructura administrada (app + base de datos), y su personal puede sumarse a un plan de bonos por cumplimiento financiado por la red SaaS, no por su nómina.',
      {
        x: 1.2, y: 2.0, w: 10.9, h: 3.5,
        fontSize: 20, color: navy, fontFace: 'Arial', italic: true,
      }
    )
  }

  // Cierre
  {
    const s = pptx.addSlide()
    s.addShape(pptx.shapes.RECTANGLE, {
      x: 0, y: 0, w: 13.333, h: 7.5, fill: { color: navy },
    })
    s.addText('IncubApp lista para madurar 90 días\ny expandirse como SaaS', {
      x: 0.8, y: 2.4, w: 11.5, h: 1.6,
      fontSize: 28, bold: true, color: 'FFFFFF', fontFace: 'Arial',
    })
    s.addText(`${DEV}\n${DATE} · v${VER}`, {
      x: 0.8, y: 4.5, w: 11, h: 1,
      fontSize: 14, color: '8FA3C8', fontFace: 'Arial',
    })
  }

  const pptPath = path.join(OUT, 'Plan_Fidelizacion_y_Expansion_SaaS.pptx')
  await pptx.writeFile({ fileName: pptPath })
  console.log('OK', path.basename(pptPath))
}

await writeWord()
await writePptx()
console.log('Plan de fidelización generado en docs/')
