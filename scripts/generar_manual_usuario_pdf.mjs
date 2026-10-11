/**
 * =============================================================================
 * SCRIPT: scripts/generar_manual_usuario_pdf.mjs
 * PROPÓSITO: Genera el Instructivo Integral de Manejo Aplicativo en formato PDF
 *            para todos los perfiles y roles de IncubApp (Antioqueña de Incubación SAS).
 * CONTIENE:
 *  - Portada ejecutiva y ficha técnica del sistema
 *  - Matriz de perfiles herméticos y navegación
 *  - Paso a paso ilustrado con maquetas de pantalla, figuras de señalización (❶, ❷, ❸),
 *    recuadros de foco y secuencia exacta de botones para cada rol:
 *      1. Acceso, Autenticación y Perfil
 *      2. Operario de Turno (Planta, Asistencia Selfie, Rondas y Semáforo)
 *      3. Líder de Área / Coordinador (Dashboard KPIs, Rondas, Mapa 2D/3D)
 *      4. Líder de Granja (Sedes, Plan AM Granja, Mortalidad y Lotes)
 *      5. Auxiliar de Mantenimiento (Plan AM, Checklists OTs, Calibración)
 *      6. Operaciones de Huevo (Recepción, Clasificación, Cargue y Liquidación)
 *      7. Calidad, SST y Desplazamientos Misionales (FOSST22, Espacios Confinados)
 *      8. Gerencia y Dirección (Tablero Ejecutivo, Cumplimiento y Metas)
 *      9. Administración de Empresa y Seguridad (Gestión de Personal y Roles)
 *      10. Guía de Operación Sin Conexión (Offline) y Solución de Problemas
 * Mantenido por: Henry Stark Desarrollador — CDH Maker
 * =============================================================================
 */

import fs from 'node:fs'
import path from 'node:path'
import { jsPDF } from 'jspdf'
import 'jspdf-autotable'

const OUTPUT_PDF = path.resolve('docs/Manual_de_Usuario_IncubApp.pdf')
const OUTPUT_HTML = path.resolve('docs/Manual_de_Usuario_IncubApp.html')

console.log('Iniciando generación del Manual de Usuario PDF de IncubApp...')

// Dimensiones Carta (mm): 215.9 x 279.4
const doc = new jsPDF({
  unit: 'mm',
  format: 'letter',
  orientation: 'portrait',
})

// Paleta corporativa IncubApp / SIG
const C = {
  orange: [224, 116, 10],       // #E0740A
  orangeDark: [194, 98, 8],     // #C26208
  orangeLight: [254, 243, 235], // #FEF3EB
  navy: [26, 35, 50],           // #1A2332
  navyLight: [44, 58, 80],      // #2C3A50
  slate: [71, 85, 105],         // #475569
  slateLight: [241, 245, 249],  // #F1F5F9
  border: [203, 213, 225],      // #CBD5E1
  green: [22, 163, 74],         // #16A34A
  greenLight: [240, 253, 244],  // #F0FDF4
  amber: [217, 119, 6],         // #D97706
  amberLight: [254, 252, 232],  // #FEFCE8
  red: [220, 38, 38],           // #DC2626
  redLight: [254, 242, 242],    // #FEF2F2
  blue: [37, 99, 235],          // #2563EB
  blueLight: [239, 246, 255],   // #EFF6FF
  white: [255, 255, 255],
  dark: [15, 23, 42],           // #0F172A
}

const PAGE_W = 215.9
const PAGE_H = 279.4
const MARGIN_L = 14
const MARGIN_R = 14
const CONTENT_W = PAGE_W - MARGIN_L - MARGIN_R // 187.9 mm
const MARGIN_T = 18
const MARGIN_B = 16

// -----------------------------------------------------------------------------
// UTILIDADES DE DIBUJO VECTORIAL
// -----------------------------------------------------------------------------

function drawHeader(title, subtitle) {
  // Barra superior decorativa
  doc.setFillColor(...C.navy)
  doc.rect(MARGIN_L, 8, CONTENT_W, 7, 'F')
  
  doc.setFillColor(...C.orange)
  doc.rect(MARGIN_L, 8, 4, 7, 'F')

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  doc.setTextColor(...C.white)
  doc.text('INCUBAPP · SISTEMA DE GESTIÓN INTEGRAL SIG', MARGIN_L + 7, 12.8)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7.5)
  doc.setTextColor(200, 210, 225)
  doc.text('Antioqueña de Incubación SAS', MARGIN_L + CONTENT_W - 38, 12.8)

  // Subtítulo del capítulo
  if (title) {
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(10)
    doc.setTextColor(...C.navy)
    doc.text(title, MARGIN_L, 20)

    if (subtitle) {
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(8)
      doc.setTextColor(...C.slate)
      doc.text(subtitle, MARGIN_L, 24)
    }

    doc.setDrawColor(...C.border)
    doc.setLineWidth(0.3)
    doc.line(MARGIN_L, 26, MARGIN_L + CONTENT_W, 26)
  }
}

function drawFooter(page, total) {
  const y = PAGE_H - 10
  doc.setDrawColor(...C.border)
  doc.setLineWidth(0.2)
  doc.line(MARGIN_L, y - 2, MARGIN_L + CONTENT_W, y - 2)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7)
  doc.setTextColor(...C.slate)
  doc.text('Manual de Usuario · Operación Multi-Módulo IncubApp v3.0 · CDH Maker', MARGIN_L, y + 2)
  doc.text(`Página ${page} de ${total}`, MARGIN_L + CONTENT_W - 20, y + 2)
}

function drawBadge(x, y, num, color = C.orange) {
  doc.setFillColor(...color)
  doc.circle(x, y, 3.2, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7.5)
  doc.setTextColor(...C.white)
  doc.text(String(num), x - (num > 9 ? 1.8 : 1.1), y + 1.2)
}

function drawActionButton(x, y, w, h, text, isPrimary = false, badgeNum = null) {
  doc.setFillColor(...(isPrimary ? C.orange : C.slateLight))
  doc.setDrawColor(...(isPrimary ? C.orangeDark : C.border))
  doc.setLineWidth(0.3)
  doc.roundedRect(x, y, w, h, 1.2, 1.2, 'FD')

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7.5)
  doc.setTextColor(...(isPrimary ? C.white : C.navy))
  doc.text(text, x + 2.5, y + h / 2 + 1.2)

  if (badgeNum !== null) {
    drawBadge(x + w - 1, y - 1, badgeNum, C.red)
  }
}

function drawHighlightBox(x, y, w, h, label, badgeNum) {
  // Recuadro punteado o destacado rojo que señala el botón
  doc.setDrawColor(...C.red)
  doc.setLineWidth(0.6)
  doc.roundedRect(x - 1, y - 1, w + 2, h + 2, 1.5, 1.5, 'D')

  if (badgeNum !== null) {
    drawBadge(x + w + 3, y + h / 2, badgeNum, C.red)
  }
}

function drawPointerArrow(fromX, fromY, toX, toY) {
  doc.setDrawColor(...C.red)
  doc.setLineWidth(0.5)
  doc.line(fromX, fromY, toX, toY)

  // Punta de flecha
  const angle = Math.atan2(toY - fromY, toX - fromX)
  const headLen = 2
  doc.line(toX, toY, toX - headLen * Math.cos(angle - Math.PI / 6), toY - headLen * Math.sin(angle - Math.PI / 6))
  doc.line(toX, toY, toX - headLen * Math.cos(angle + Math.PI / 6), toY - headLen * Math.sin(angle + Math.PI / 6))
}

function drawUIWindow(x, y, w, h, titleText, roleBadgeText = '') {
  // Fondo de ventana
  doc.setFillColor(252, 253, 255)
  doc.setDrawColor(...C.border)
  doc.setLineWidth(0.3)
  doc.roundedRect(x, y, w, h, 2, 2, 'FD')

  // Barra de título de la app
  doc.setFillColor(...C.navy)
  doc.roundedRect(x, y, w, 8, 2, 2, 'F')
  doc.rect(x, y + 4, w, 4, 'F') // ajustar esquinas inferiores

  // Botones simulados de ventana
  doc.setFillColor(...C.red)
  doc.circle(x + 4, y + 4, 1.2, 'F')
  doc.setFillColor(...C.amber)
  doc.circle(x + 8, y + 4, 1.2, 'F')
  doc.setFillColor(...C.green)
  doc.circle(x + 12, y + 4, 1.2, 'F')

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7.5)
  doc.setTextColor(...C.white)
  doc.text(titleText, x + 18, y + 5.2)

  if (roleBadgeText) {
    const bw = doc.getTextWidth(roleBadgeText) + 6
    doc.setFillColor(...C.orange)
    doc.roundedRect(x + w - bw - 4, y + 1.8, bw, 4.4, 1, 1, 'F')
    doc.setFontSize(6.5)
    doc.setTextColor(...C.white)
    doc.text(roleBadgeText, x + w - bw - 1, y + 4.9)
  }
}

function drawCardHeader(x, y, w, title, icon = '📋') {
  doc.setFillColor(...C.slateLight)
  doc.roundedRect(x, y, w, 6, 1, 1, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7.5)
  doc.setTextColor(...C.navy)
  doc.text(`${icon} ${title}`, x + 3, y + 4.3)
}

function drawStepBlock(startY, { stepNumber, title, roleName, screenMockup, sequenceSteps, tip }) {
  let y = startY

  // Título del paso
  doc.setFillColor(...C.orangeLight)
  doc.setDrawColor(...C.orange)
  doc.setLineWidth(0.4)
  doc.roundedRect(MARGIN_L, y, CONTENT_W, 7, 1.5, 1.5, 'FD')

  drawBadge(MARGIN_L + 5, y + 3.5, stepNumber, C.orange)

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.setTextColor(...C.navy)
  doc.text(title, MARGIN_L + 12, y + 4.8)

  if (roleName) {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7.5)
    doc.setTextColor(...C.slate)
    doc.text(`[Perfil: ${roleName}]`, MARGIN_L + CONTENT_W - doc.getTextWidth(`[Perfil: ${roleName}]`) - 4, y + 4.8)
  }

  y += 10

  // Contenedor principal del paso (2 columnas: Maqueta visual a la izquierda, secuencia explicativa a la derecha)
  const mockupW = 104
  const mockupH = 68
  const mockupX = MARGIN_L

  const seqX = MARGIN_L + mockupW + 4
  const seqW = CONTENT_W - mockupW - 4

  // 1. Renderizar maqueta visual de la pantalla
  screenMockup(mockupX, y, mockupW, mockupH)

  // 2. Renderizar panel de secuencia de botones
  doc.setFillColor(...C.slateLight)
  doc.setDrawColor(...C.border)
  doc.setLineWidth(0.2)
  doc.roundedRect(seqX, y, seqW, mockupH, 1.5, 1.5, 'FD')

  doc.setFillColor(...C.navy)
  doc.roundedRect(seqX, y, seqW, 6, 1.5, 1.5, 'F')
  doc.rect(seqX, y + 3, seqW, 3, 'F')

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7.5)
  doc.setTextColor(...C.white)
  doc.text('SECUENCIA EXACTA DE ACCIÓN', seqX + 4, y + 4.2)

  let seqY = y + 9.5
  sequenceSteps.forEach((s, idx) => {
    // Número de botón circular
    drawBadge(seqX + 5, seqY + 1.5, idx + 1, C.red)

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(7.5)
    doc.setTextColor(...C.navy)
    doc.text(s.action, seqX + 11, seqY + 1.2)

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7)
    doc.setTextColor(...C.slate)
    const splitDesc = doc.splitTextToSize(s.desc, seqW - 13)
    doc.text(splitDesc, seqX + 11, seqY + 4.5)

    seqY += 4.5 + splitDesc.length * 3.2
  })

  // Tip o advertencia si existe
  if (tip) {
    const tipH = 13
    const tipY = y + mockupH - tipH
    doc.setFillColor(...C.amberLight)
    doc.setDrawColor(...C.amber)
    doc.setLineWidth(0.3)
    doc.roundedRect(seqX + 2, tipY, seqW - 4, tipH - 2, 1, 1, 'FD')

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(6.8)
    doc.setTextColor(...C.amber)
    doc.text('⚠ NOTA OPERATIVA:', seqX + 4, tipY + 3.8)

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(6.5)
    doc.setTextColor(...C.dark)
    const tipLines = doc.splitTextToSize(tip, seqW - 8)
    doc.text(tipLines, seqX + 4, tipY + 7.2)
  }

  return y + mockupH + 6
}

// -----------------------------------------------------------------------------
// PÁGINA 1: PORTADA EJECUTIVA
// -----------------------------------------------------------------------------
function buildCoverPage() {
  // Marco superior e inferior elegante
  doc.setFillColor(...C.navy)
  doc.rect(0, 0, PAGE_W, 20, 'F')

  doc.setFillColor(...C.orange)
  doc.rect(0, 20, PAGE_W, 3, 'F')

  // Banda de pie
  doc.setFillColor(...C.navy)
  doc.rect(0, PAGE_H - 18, PAGE_W, 18, 'F')
  doc.setFillColor(...C.orange)
  doc.rect(0, PAGE_H - 21, PAGE_W, 3, 'F')

  // Logo Badge Central
  doc.setFillColor(...C.orangeLight)
  doc.roundedRect(MARGIN_L, 40, CONTENT_W, 32, 3, 3, 'F')
  doc.setDrawColor(...C.orange)
  doc.setLineWidth(0.6)
  doc.roundedRect(MARGIN_L, 40, CONTENT_W, 32, 3, 3, 'D')

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(26)
  doc.setTextColor(...C.orange)
  doc.text('INCUBAPP', MARGIN_L + 10, 56)

  doc.setFontSize(11)
  doc.setTextColor(...C.navy)
  doc.text('SISTEMA INTEGRAL DE GESTIÓN OPERATIVA Y PLANTA (SIG)', MARGIN_L + 10, 65)

  // Título principal
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(22)
  doc.setTextColor(...C.navy)
  doc.text('MANUAL DE USUARIO E INSTRUCTIVO', MARGIN_L, 95)
  doc.text('OPERATIVO PASO A PASO', MARGIN_L, 105)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(12)
  doc.setTextColor(...C.slate)
  doc.text('Guía secuencial ilustrada por roles con diagramas de botones y funciones', MARGIN_L, 114)

  // Caja de ficha técnica
  const boxY = 130
  doc.setFillColor(...C.slateLight)
  doc.setDrawColor(...C.border)
  doc.setLineWidth(0.4)
  doc.roundedRect(MARGIN_L, boxY, CONTENT_W, 78, 2, 2, 'FD')

  doc.setFillColor(...C.navy)
  doc.roundedRect(MARGIN_L, boxY, CONTENT_W, 9, 2, 2, 'F')
  doc.rect(MARGIN_L, boxY + 5, CONTENT_W, 4, 'F')

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.setTextColor(...C.white)
  doc.text('FICHA TÉCNICA DEL MANUAL Y CONTROL DEL DOCUMENTO', MARGIN_L + 6, boxY + 6)

  const items = [
    ['Aplicación:', 'IncubApp Multi-Módulo (Web, Móvil & Tablet PWA Offline)'],
    ['Empresa Piloto:', 'Antioqueña de Incubación SAS · Planta & Granjas'],
    ['Versión del Sistema:', '3.0 (Octubre 2026) · Arquitectura Hermética'],
    ['Desarrollador / TI:', 'Henry Camilo Taborda Galeano — CDH Maker'],
    ['Perfiles Cubiertos:', 'Operario de turno, Líder de área, Líder de granja, Mantenimiento,'],
    ['', 'Recepción/Cargue, Calidad, SST, Misionales, Gerencia y Administración'],
    ['Objetivo del Manual:', 'Estandarizar la capacitación operativa paso a paso señalando cada botón'],
    ['', 'y flujo de datos desde el inicio de sesión hasta el cierre de turno.'],
    ['Soporte y Mesa TI:', 'Área de Mantenimiento / Sistemas · IncubApp Soporte'],
  ]

  let curY = boxY + 16
  items.forEach(([label, val]) => {
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8)
    doc.setTextColor(...C.navy)
    doc.text(label, MARGIN_L + 6, curY)

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.setTextColor(...C.dark)
    doc.text(val, MARGIN_L + 40, curY)

    curY += 6.5
  })

  // Texto de pie de portada
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  doc.setTextColor(...C.white)
  doc.text('CONFIDENCIAL · PROPIEDAD EXCLUSIVA DE ANTIOQUEÑA DE INCUBACIÓN SAS & CDH MAKER', MARGIN_L, PAGE_H - 8)
}

// -----------------------------------------------------------------------------
// PÁGINA 2: ÍNDICE Y MATRIZ DE PERFILES HERMÉTICOS
// -----------------------------------------------------------------------------
function buildIndexPage() {
  doc.addPage()
  drawHeader('CONTENIDO Y MATRIZ DE PERFILES', 'Estructura modular hermética y mapa de navegación del sistema')

  // Introducción
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8.5)
  doc.setTextColor(...C.dark)
  const intro = 'IncubApp opera bajo el principio de módulos herméticos: cada usuario visualiza y opera únicamente las herramientas asociadas a su rol autorizado en Antioqueña de Incubación SAS. A continuación se detalla la matriz de perfiles y la tabla de contenidos de este instructivo.'
  doc.text(doc.splitTextToSize(intro, CONTENT_W), MARGIN_L, 34)

  // Tabla resumen de contenidos
  const chapters = [
    ['Módulo 1', 'Acceso, Inicio de Sesión y Configuración de Perfil (Común a todos)', 'Pág. 3'],
    ['Módulo 2', 'Operario de Turno (Selfie, Asistencia, Rondas Horarias y Semáforo)', 'Pág. 4'],
    ['Módulo 3', 'Líder de Área / Coordinador (Dashboard KPIs, Mapa 2D/3D y Aprobación)', 'Pág. 5'],
    ['Módulo 4', 'Líder de Granja (Sedes Reproductoras, Plan AM Granja y Aves)', 'Pág. 6'],
    ['Módulo 5', 'Auxiliar de Mantenimiento y Técnico SIG (Plan AM, OTs y Calibraciones)', 'Pág. 7'],
    ['Módulo 6', 'Operaciones de Huevo (Recepción, Clasificación, Cargue y Liquidación)', 'Pág. 8'],
    ['Módulo 7', 'Calidad, SST y Desplazamientos Misionales (FOSST22 y Permisos)', 'Pág. 9'],
    ['Módulo 8', 'Gerencia y Dirección Estratégica (Tablero Ejecutivo y Metas 95%+)', 'Pág. 10'],
    ['Módulo 9', 'Administración de Empresa y Seguridad (Gestión de Personal y Roles)', 'Pág. 11'],
    ['Módulo 10', 'Operación Offline (Sin Internet), Iconografía y Soporte Técnico', 'Pág. 12'],
  ]

  let ty = 48
  doc.setFillColor(...C.navy)
  doc.roundedRect(MARGIN_L, ty, CONTENT_W, 6.5, 1, 1, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7.5)
  doc.setTextColor(...C.white)
  doc.text('CAPÍTULO', MARGIN_L + 4, ty + 4.5)
  doc.text('DESCRIPCIÓN DEL MÓDULO OPERATIVO', MARGIN_L + 28, ty + 4.5)
  doc.text('UBICACIÓN', MARGIN_L + CONTENT_W - 22, ty + 4.5)

  ty += 7.5
  chapters.forEach(([mod, desc, pag], i) => {
    const bg = i % 2 === 0 ? C.white : C.slateLight
    doc.setFillColor(...bg)
    doc.rect(MARGIN_L, ty, CONTENT_W, 6.2, 'F')
    doc.setDrawColor(...C.border)
    doc.setLineWidth(0.2)
    doc.rect(MARGIN_L, ty, CONTENT_W, 6.2, 'D')

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(7.5)
    doc.setTextColor(...C.orange)
    doc.text(mod, MARGIN_L + 4, ty + 4.2)

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7.5)
    doc.setTextColor(...C.dark)
    doc.text(desc, MARGIN_L + 28, ty + 4.2)

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(7.5)
    doc.setTextColor(...C.navy)
    doc.text(pag, MARGIN_L + CONTENT_W - 20, ty + 4.2)

    ty += 6.2
  })

  // Cuadro de simbología y botones
  const simY = ty + 10
  doc.setFillColor(...C.orangeLight)
  doc.setDrawColor(...C.orange)
  doc.setLineWidth(0.4)
  doc.roundedRect(MARGIN_L, simY, CONTENT_W, 44, 2, 2, 'FD')

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8.5)
  doc.setTextColor(...C.navy)
  doc.text('CÓMO LEER LAS FIGURAS Y BOTONES EN ESTE MANUAL', MARGIN_L + 5, simY + 6.5)

  const legend = [
    [1, 'Círculo Rojo Numerado (❶, ❷, ❸): Señala el orden cronológico estricto en que debes tocar la pantalla.'],
    [2, 'Recuadro Rojo Bordeado: Resalta el botón, pestaña o selector exacto en la interfaz que debes oprimir.'],
    [3, 'Flecha Indicadora (->): Indica la transición entre pantalla y diálogo modal emergente.'],
    [4, 'Píldora Verde/Naranja: Indica el rol requerido o estado en vivo de la conexión.'],
  ]

  let ly = simY + 13
  legend.forEach(([n, t]) => {
    drawBadge(MARGIN_L + 8, ly, n, C.red)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7.5)
    doc.setTextColor(...C.dark)
    doc.text(t, MARGIN_L + 15, ly + 1.2)
    ly += 7
  })

  drawFooter(2, 12)
}

// -----------------------------------------------------------------------------
// PÁGINA 3: MÓDULO 1 — ACCESO, AUTENTICACIÓN Y PERFIL
// -----------------------------------------------------------------------------
function buildModule1Page() {
  doc.addPage()
  drawHeader('MÓDULO 1: ACCESO, AUTENTICACIÓN Y PERFIL PERSONAL', 'Flujo de entrada, selección de empresa y datos de usuario')

  // Paso 1: Inicio de sesión
  let nextY = drawStepBlock(30, {
    stepNumber: 1,
    title: 'Paso 1: Inicio de Sesión y Selección de Empresa',
    roleName: 'Todos los colaboradores',
    screenMockup: (x, y, w, h) => {
      drawUIWindow(x, y, w, h, 'IncubApp · Acceso Seguro', 'Público')

      // Formulario de acceso
      doc.setFillColor(...C.white)
      doc.roundedRect(x + 10, y + 12, w - 20, h - 16, 1.5, 1.5, 'FD')

      doc.setFont('helvetica', 'bold')
      doc.setFontSize(8.5)
      doc.setTextColor(...C.navy)
      doc.text('Iniciar Sesión en IncubApp', x + 15, y + 18)

      // Campo Correo
      doc.setFontSize(6.5)
      doc.setTextColor(...C.slate)
      doc.text('Correo electrónico:', x + 15, y + 23)
      doc.setFillColor(...C.slateLight)
      doc.roundedRect(x + 15, y + 24.5, w - 30, 5, 0.8, 0.8, 'FD')
      doc.text('operario@incubant.co', x + 17, y + 28)

      // Campo Contraseña
      doc.text('Contraseña:', x + 15, y + 33)
      doc.setFillColor(...C.slateLight)
      doc.roundedRect(x + 15, y + 34.5, w - 30, 5, 0.8, 0.8, 'FD')
      doc.text('••••••••••••', x + 17, y + 38)

      // Botón Entrar
      const btnX = x + 15
      const btnY = y + 43
      const btnW = w - 30
      const btnH = 6
      drawActionButton(btnX, btnY, btnW, btnH, 'Entrar a IncubApp', true)
      drawHighlightBox(btnX, btnY, btnW, btnH, '', 1)

      // Enlaces inferiores
      doc.setFontSize(6)
      doc.setTextColor(...C.blue)
      doc.text('¿Olvidaste tu contraseña?', x + 15, y + 53)
      doc.text('Crear cuenta nueva', x + w - 42, y + 53)
    },
    sequenceSteps: [
      { action: '1. Digita tu correo y clave', desc: 'Ingresa tus credenciales autorizadas por administración.' },
      { action: '2. Presiona «Entrar a IncubApp»', desc: 'El sistema valida tu identidad e ingresa a tu módulo según tu rol.' },
      { action: '3. Sin red: Entrada Offline', desc: 'Si no hay internet, la app abre directamente con tu sesión guardada.' },
    ],
    tip: 'Si olvidaste tu contraseña, toca «¿Olvidaste tu contraseña?» o pide a tu líder una clave temporal en Administración.'
  })

  // Paso 2: Configuración de Perfil
  drawStepBlock(nextY + 2, {
    stepNumber: 2,
    title: 'Paso 2: Edición de Perfil, Foto y Permisos de Dispositivo',
    roleName: 'Todos los colaboradores',
    screenMockup: (x, y, w, h) => {
      drawUIWindow(x, y, w, h, 'Mi Perfil · Configuración Personal', 'Perfil')

      // Cabecera de perfil
      doc.setFillColor(...C.orangeLight)
      doc.roundedRect(x + 5, y + 11, w - 10, 14, 1.5, 1.5, 'FD')

      // Avatar circular con botón de cámara
      doc.setFillColor(...C.orange)
      doc.circle(x + 14, y + 18, 4.5, 'F')
      doc.setFontSize(7)
      doc.setTextColor(...C.white)
      doc.text('MT', x + 12.2, y + 19.2)

      // Botón subir foto
      drawBadge(x + 17, y + 21, 1, C.red)

      doc.setFont('helvetica', 'bold')
      doc.setFontSize(7.5)
      doc.setTextColor(...C.navy)
      doc.text('Miguel Taborda', x + 22, y + 16.5)
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(6.5)
      doc.setTextColor(...C.slate)
      doc.text('Líder · Mantenimiento · Planta', x + 22, y + 20.5)

      // Formulario de edición
      doc.setFontSize(6.5)
      doc.text('Nombre Completo:', x + 6, y + 29)
      doc.setFillColor(...C.white)
      doc.roundedRect(x + 6, y + 30.5, 45, 5, 0.8, 0.8, 'FD')
      doc.text('Miguel Taborda', x + 8, y + 34)

      doc.text('Teléfono celular:', x + 55, y + 29)
      doc.roundedRect(x + 55, y + 30.5, 42, 5, 0.8, 0.8, 'FD')
      doc.text('+57 312 000 0000', x + 57, y + 34)

      // Botones de acción
      drawActionButton(x + 6, y + 38, 22, 5, 'Editar', false)
      drawHighlightBox(x + 6, y + 38, 22, 5, '', 2)

      drawActionButton(x + 32, y + 38, 28, 5, 'Guardar cambios', true)
      drawHighlightBox(x + 32, y + 38, 28, 5, '', 3)

      // Permisos de dispositivo
      doc.setFillColor(...C.slateLight)
      doc.roundedRect(x + 5, y + 46, w - 10, 16, 1, 1, 'FD')
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(6.5)
      doc.setTextColor(...C.navy)
      doc.text('Permisos Corporativos (Cámara, GPS, Notificaciones):', x + 8, y + 50)

      doc.setFont('helvetica', 'normal')
      doc.setFontSize(6)
      doc.setTextColor(...C.green)
      doc.text('✓ Cámara Activa   ✓ GPS Localización Activa   ✓ Notificaciones', x + 8, y + 55)
    },
    sequenceSteps: [
      { action: '1. Toca tu Avatar / Foto', desc: 'Toma una selfie o elige foto de tu galería corporativa.' },
      { action: '2. Presiona «Editar»', desc: 'Desbloquea los campos de nombre y teléfono celular.' },
      { action: '3. Presiona «Guardar cambios»', desc: 'Se sincroniza al instante en la base de datos y la caché offline.' },
      { action: '4. Concede permisos solicitados', desc: 'Acepta los permisos de GPS y Cámara para validar evidencias.' },
    ],
    tip: 'El nombre guardado aquí es el que se reflejará en tus firmas digitales de rondas, cargues y órdenes de mantenimiento.'
  })

  drawFooter(3, 12)
}

// -----------------------------------------------------------------------------
// PÁGINA 4: MÓDULO 2 — OPERARIO DE TURNO
// -----------------------------------------------------------------------------
function buildModule2Page() {
  doc.addPage()
  drawHeader('MÓDULO 2: OPERARIO DE TURNO (OPERACIONES DE PLANTA)', 'Registro de asistencia con selfie, control de rondas y semáforo de máquinas')

  // Paso 1: Asistencia biométrica
  let nextY = drawStepBlock(30, {
    stepNumber: 3,
    title: 'Paso 1: Ingreso de Turno con Selfie Biométrica',
    roleName: 'Operario / Auxiliar de Planta',
    screenMockup: (x, y, w, h) => {
      drawUIWindow(x, y, w, h, 'Mi Turno · Asistencia Diaria', 'Operario')

      // Tarjeta de marcación
      doc.setFillColor(...C.white)
      doc.roundedRect(x + 6, y + 11, w - 12, h - 14, 1.5, 1.5, 'FD')

      doc.setFont('helvetica', 'bold')
      doc.setFontSize(8)
      doc.setTextColor(...C.navy)
      doc.text('Buenos días, Turno 1 (06:00 - 14:00)', x + 10, y + 17)

      // Cuadro de cámara selfie
      doc.setFillColor(...C.navy)
      doc.roundedRect(x + 10, y + 21, 38, 32, 1, 1, 'FD')
      doc.setFillColor(...C.slate)
      doc.circle(x + 29, y + 33, 7, 'F')
      doc.setFontSize(6.5)
      doc.setTextColor(...C.white)
      doc.text('Foto Selfie', x + 23, y + 43)

      // Botón tomar foto
      drawActionButton(x + 10, y + 54, 38, 5, '📷 Tomar Selfie', true)
      drawHighlightBox(x + 10, y + 54, 38, 5, '', 1)

      // Panel derecho de turno
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(7.5)
      doc.setTextColor(...C.navy)
      doc.text('Datos de marcación:', x + 53, y + 23)

      doc.setFont('helvetica', 'normal')
      doc.setFontSize(6.5)
      doc.setTextColor(...C.slate)
      doc.text('• Hora actual: 06:02 a. m. (A tiempo)', x + 53, y + 28)
      doc.text('• Sede: Planta Antioqueña', x + 53, y + 33)
      doc.text('• GPS: 6.2442, -75.5812 (En planta)', x + 53, y + 38)

      // Botón Confirmar Entrada
      drawActionButton(x + 53, y + 46, 42, 6, 'Marcar Ingreso al Turno', true)
      drawHighlightBox(x + 53, y + 46, 42, 6, '', 2)
    },
    sequenceSteps: [
      { action: '1. Oprime «Tomar Selfie»', desc: 'Se abre la cámara frontal del móvil o tableta.' },
      { action: '2. Encuadra tu rostro claro', desc: 'Asegúrate de tener buena luz y portar la dotación.' },
      { action: '3. Toca «Marcar Ingreso al Turno»', desc: 'Registra la hora y GPS en la bitácora de cumplimiento SIG.' },
    ],
    tip: 'La marcación dentro de los 15 minutos del turno otorga puntuación para los bonos de puntualidad y calidad (95%+).'
  })

  // Paso 2: Rondas horarias y semáforo
  drawStepBlock(nextY + 2, {
    stepNumber: 4,
    title: 'Paso 2: Registro de Ronda Horaria y Semáforo de Máquinas',
    roleName: 'Operario / Auxiliar de Planta',
    screenMockup: (x, y, w, h) => {
      drawUIWindow(x, y, w, h, 'Rondas de Planta · INC-04', 'Ronda')

      // Selector de máquina
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(7.5)
      doc.setTextColor(...C.navy)
      doc.text('Máquina:', x + 6, y + 15)
      doc.setFillColor(...C.white)
      doc.roundedRect(x + 20, y + 11.5, 40, 5, 0.8, 0.8, 'FD')
      doc.text('INC-04 (Incubadora 04)', x + 22, y + 15)

      // Hora de ronda
      doc.text('Hora: 08:00 a. m.', x + 64, y + 15)

      // Semáforo de condición
      doc.setFontSize(7)
      doc.text('Condición operativa detectada:', x + 6, y + 22)

      // Botón Normal
      drawActionButton(x + 6, y + 24, 28, 6, 'Normal (Verde)', false)
      drawHighlightBox(x + 6, y + 24, 28, 6, '', 1)

      // Botón Alerta
      drawActionButton(x + 37, y + 24, 28, 6, 'Alerta (Amarillo)', false)

      // Botón Falla
      drawActionButton(x + 68, y + 24, 28, 6, 'Falla (Rojo)', false)

      // Cuadro foto evidencia
      doc.setFillColor(...C.slateLight)
      doc.roundedRect(x + 6, y + 33, 42, 18, 1, 1, 'FD')
      doc.setFontSize(6.5)
      doc.setTextColor(...C.navy)
      doc.text('Evidencia visual:', x + 8, y + 38)
      drawActionButton(x + 8, y + 41, 38, 5, '📷 Foto de panel INC-04', false)
      drawHighlightBox(x + 8, y + 41, 38, 5, '', 2)

      // Botón Guardar Ronda
      drawActionButton(x + 52, y + 43, 44, 7, 'Guardar Ronda Horaria', true)
      drawHighlightBox(x + 52, y + 43, 44, 7, '', 3)

      // Resumen inferior
      doc.setFontSize(6)
      doc.setTextColor(...C.slate)
      doc.text('Rondas realizadas hoy: 2 de 3 completadas.', x + 6, y + 57)
    },
    sequenceSteps: [
      { action: '1. Selecciona Condición', desc: 'Toca Verde (Normal), Amarillo (Alerta) o Rojo (Falla crítica).' },
      { action: '2. Oprime «Foto de panel»', desc: 'Toma la foto clara de temperatura, humedad y volteo.' },
      { action: '3. Presiona «Guardar Ronda»', desc: 'El dato se sincroniza al tablero del líder y genera alertas si hay falla.' },
    ],
    tip: 'Si marcas «Falla (Rojo)», el sistema notifica inmediatamente al líder de mantenimiento para generar la OT.'
  })

  drawFooter(4, 12)
}

// -----------------------------------------------------------------------------
// PÁGINA 5: MÓDULO 3 — LÍDER DE ÁREA / COORDINADOR
// -----------------------------------------------------------------------------
function buildModule3Page() {
  doc.addPage()
  drawHeader('MÓDULO 3: LÍDER DE ÁREA Y COORDINACIÓN', 'Monitoreo de planta en vivo, ritmo del turno, mapa interactivo y OTs')

  // Paso 1: LeaderDashboard
  let nextY = drawStepBlock(30, {
    stepNumber: 5,
    title: 'Paso 1: Monitoreo en Vivo (LeaderDashboard)',
    roleName: 'Líder de Área / Coordinador',
    screenMockup: (x, y, w, h) => {
      drawUIWindow(x, y, w, h, 'LeaderDashboard · Planta Central', 'Líder')

      // Tarjetas KPI de planta
      const kw = 22
      const kh = 12
      // Operativas
      doc.setFillColor(...C.greenLight)
      doc.roundedRect(x + 5, y + 11, kw, kh, 1, 1, 'FD')
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(9)
      doc.setTextColor(...C.green)
      doc.text('36', x + 12, y + 17)
      doc.setFontSize(5.5)
      doc.text('Operativas', x + 8, y + 21)

      // En alerta
      doc.setFillColor(...C.amberLight)
      doc.roundedRect(x + 29, y + 11, kw, kh, 1, 1, 'FD')
      doc.setFontSize(9)
      doc.setTextColor(...C.amber)
      doc.text('0', x + 38, y + 17)
      doc.setFontSize(5.5)
      doc.text('En Alerta', x + 33, y + 21)

      // Con falla
      doc.setFillColor(...C.redLight)
      doc.roundedRect(x + 53, y + 11, kw, kh, 1, 1, 'FD')
      doc.setFontSize(9)
      doc.setTextColor(...C.red)
      doc.text('0', x + 62, y + 17)
      doc.setFontSize(5.5)
      doc.text('Con Falla', x + 57, y + 21)

      // OTs Activas
      doc.setFillColor(...C.blueLight)
      doc.roundedRect(x + 77, y + 11, kw, kh, 1, 1, 'FD')
      doc.setFontSize(9)
      doc.setTextColor(...C.blue)
      doc.text('0', x + 86, y + 17)
      doc.setFontSize(5.5)
      doc.text('OTs Activas', x + 80, y + 21)

      // Mi equipo en el turno
      doc.setFillColor(...C.white)
      doc.roundedRect(x + 5, y + 26, w - 10, 18, 1, 1, 'FD')
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(7)
      doc.setTextColor(...C.navy)
      doc.text('Personal en Turno:', x + 8, y + 31)

      doc.setFont('helvetica', 'normal')
      doc.setFontSize(6.5)
      doc.text('👤 German Arango · Operario · Última foto: INC-04 (06:23)', x + 8, y + 36)
      doc.text('👤 Miguel Taborda · Líder · Turno 1 Activo', x + 8, y + 40)

      // Botones de acción rápida del líder
      drawActionButton(x + 5, y + 47, 30, 6, '🗺️ Mapa de Planta', true)
      drawHighlightBox(x + 5, y + 47, 30, 6, '', 1)

      drawActionButton(x + 38, y + 47, 30, 6, '📋 Revisar Rondas', false)
      drawHighlightBox(x + 38, y + 47, 30, 6, '', 2)

      drawActionButton(x + 71, y + 47, 26, 6, '🔧 Crear OT', false)
      drawHighlightBox(x + 71, y + 47, 26, 6, '', 3)
    },
    sequenceSteps: [
      { action: '1. Toca «Mapa de Planta»', desc: 'Abre el plano interactivo 2D/3D con el estado térmico de cada máquina.' },
      { action: '2. Toca «Revisar Rondas»', desc: 'Inspecciona las fotos tomadas por el operario y valida lecturas.' },
      { action: '3. Toca «Crear OT»', desc: 'Asigna órdenes de trabajo correctivas si una máquina está en alerta.' },
    ],
    tip: 'El reloj superior indica el tiempo transcurrido del turno para asegurar que ninguna ronda quede retrasada.'
  })

  // Paso 2: Mapa interactivo y navegación
  drawStepBlock(nextY + 2, {
    stepNumber: 6,
    title: 'Paso 2: Mapa de Planta 2D / 3D y Salas',
    roleName: 'Líder de Área / Coordinador',
    screenMockup: (x, y, w, h) => {
      drawUIWindow(x, y, w, h, 'Mapa Operativo · Vista de Planta 2D', 'Mapa')

      // Simulación del plano de planta
      doc.setFillColor(...C.navy)
      doc.roundedRect(x + 5, y + 11, w - 10, 36, 1.5, 1.5, 'FD')

      // Cuadrículas de salas
      doc.setDrawColor(...C.slate)
      doc.setLineWidth(0.3)
      doc.rect(x + 8, y + 14, 26, 14)
      doc.rect(x + 36, y + 14, 28, 14)
      doc.rect(x + 66, y + 14, 26, 14)

      doc.setFontSize(6)
      doc.setTextColor(...C.white)
      doc.text('SALA 1 (INC-01 a 06)', x + 10, y + 18)
      doc.text('SALA 2 (INC-07 a 18)', x + 38, y + 18)
      doc.text('NACEDORAS (NAC)', x + 68, y + 18)

      // Máquinas dentro de sala
      doc.setFillColor(...C.green)
      doc.rect(x + 10, y + 21, 5, 5, 'F')
      doc.rect(x + 17, y + 21, 5, 5, 'F')
      doc.rect(x + 24, y + 21, 5, 5, 'F')

      // Foco en máquina INC-04
      drawHighlightBox(x + 10, y + 21, 5, 5, '', 1)

      // Selector de vista
      drawActionButton(x + 8, y + 33, 16, 5, 'Vista 2D', true)
      drawActionButton(x + 26, y + 33, 16, 5, 'Vista 3D', false)
      drawHighlightBox(x + 26, y + 33, 16, 5, '', 2)

      // Botón volver al tablero
      drawActionButton(x + 5, y + 50, 42, 6, '⬅ Volver al Tablero del Líder', false)
      drawHighlightBox(x + 5, y + 50, 42, 6, '', 3)
    },
    sequenceSteps: [
      { action: '1. Toca cualquier Máquina', desc: 'Despliega su temperatura actual, volteo, lote y última foto tomada.' },
      { action: '2. Alterna entre 2D y 3D', desc: 'Visualiza la planta con gemelo digital tridimensional.' },
      { action: '3. Toca «Volver al Tablero»', desc: 'Regresa a la consola principal de toma de decisiones.' },
    ],
    tip: 'Las máquinas con advertencia parpadean en amarillo; las paradas por falla se muestran en rojo brillante.'
  })

  drawFooter(5, 12)
}

// -----------------------------------------------------------------------------
// PÁGINA 6: MÓDULO 4 — LÍDER DE GRANJA
// -----------------------------------------------------------------------------
function buildModule4Page() {
  doc.addPage()
  drawHeader('MÓDULO 4: LÍDER DE GRANJA (FARM LEADER)', 'Gestión de sedes reproductoras, Plan AM de granja, mortalidad y lotes')

  let nextY = drawStepBlock(30, {
    stepNumber: 7,
    title: 'Paso 1: Tablero de Granja y Plan AM de Sede',
    roleName: 'Líder de Granja (Ej. Granja La Fe)',
    screenMockup: (x, y, w, h) => {
      drawUIWindow(x, y, w, h, 'FarmLeaderHome · Granja La Fe', 'Granja')

      // Cabecera de sede
      doc.setFillColor(...C.greenLight)
      doc.roundedRect(x + 5, y + 11, w - 10, 13, 1, 1, 'FD')
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(8)
      doc.setTextColor(...C.green)
      doc.text('Sede Asignada: G-GRANJA LA FE', x + 8, y + 16)
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(6.5)
      doc.setTextColor(...C.dark)
      doc.text('4 Galpones Activos · Lote L-2026-A · Aves reproductoras', x + 8, y + 21)

      // Lista de tareas del Plan AM
      doc.setFillColor(...C.white)
      doc.roundedRect(x + 5, y + 26, w - 10, 22, 1, 1, 'FD')
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(7)
      doc.setTextColor(...C.navy)
      doc.text('Plan de Mantenimiento de la Sede:', x + 8, y + 31)

      doc.setFont('helvetica', 'normal')
      doc.setFontSize(6.5)
      doc.text('☑ Revisión de silos y líneas de alimentación (Galpón 1 y 2)', x + 8, y + 36)
      doc.text('☐ Desinfección de arcos de bioseguridad y pediluvios', x + 8, y + 40)
      doc.text('☐ Control de nebulizadores y extractores de clima', x + 8, y + 44)

      // Botones de acción
      drawActionButton(x + 5, y + 51, 38, 6, '📋 Abrir Plan de Sede', true)
      drawHighlightBox(x + 5, y + 51, 38, 6, '', 1)

      drawActionButton(x + 46, y + 51, 48, 6, '🥚 Registrar Producción Huevo', false)
      drawHighlightBox(x + 46, y + 51, 48, 6, '', 2)
    },
    sequenceSteps: [
      { action: '1. Oprime «Abrir Plan de Sede»', desc: 'Accede al instructivo de mantenimiento preventivo de tu granja.' },
      { action: '2. Toca «Registrar Producción»', desc: 'Ingresa los huevos fértiles recolectados para despacho a planta.' },
      { action: '3. Marca tareas ejecutadas', desc: 'Confirma la finalización de rutinas con tu firma digital.' },
    ],
    tip: 'El líder de granja tiene acceso hermético exclusivamente a su sede; no visualiza datos de otras granjas ni de planta.'
  })

  drawStepBlock(nextY + 2, {
    stepNumber: 8,
    title: 'Paso 2: Registro de Mortalidad y Novedades Sanitarias',
    roleName: 'Líder de Granja',
    screenMockup: (x, y, w, h) => {
      drawUIWindow(x, y, w, h, 'Novedad de Granja · Lote y Mortalidad', 'Sanidad')

      doc.setFont('helvetica', 'bold')
      doc.setFontSize(7.5)
      doc.setTextColor(...C.navy)
      doc.text('Formato Diario de Sanidad Aviar:', x + 6, y + 15)

      // Galpón
      doc.setFontSize(6.5)
      doc.text('Galpón:', x + 6, y + 21)
      doc.setFillColor(...C.white)
      doc.roundedRect(x + 20, y + 17.5, 30, 5, 0.8, 0.8, 'FD')
      doc.text('Galpón 02', x + 22, y + 21)

      // Mortalidad
      doc.text('Bajas / Mortalidad:', x + 6, y + 28)
      doc.roundedRect(x + 32, y + 24.5, 20, 5, 0.8, 0.8, 'FD')
      doc.text('2 aves', x + 34, y + 28)

      // Causa
      doc.text('Causa preliminar:', x + 6, y + 35)
      doc.roundedRect(x + 32, y + 31.5, 58, 5, 0.8, 0.8, 'FD')
      doc.text('Causa natural / Descarte operativo', x + 34, y + 35)

      // Botón foto
      drawActionButton(x + 6, y + 40, 36, 5, '📷 Adjuntar Foto Acta', false)
      drawHighlightBox(x + 6, y + 40, 36, 5, '', 1)

      // Botón enviar reporte
      drawActionButton(x + 6, y + 48, 48, 7, 'Guardar Novedad de Granja', true)
      drawHighlightBox(x + 6, y + 48, 48, 7, '', 2)
    },
    sequenceSteps: [
      { action: '1. Digita número de bajas', desc: 'Ingresa las aves retiradas durante la inspección matutina.' },
      { action: '2. Adjunta foto de acta', desc: 'Toma la foto del formato físico o certificado veterinario.' },
      { action: '3. Presiona «Guardar Novedad»', desc: 'Alimenta el consolidado técnico para el médico veterinario.' },
    ],
    tip: 'Si la mortalidad supera el umbral normal del lote, el sistema emite una alerta naranja al área veterinaria.'
  })

  drawFooter(6, 12)
}

// -----------------------------------------------------------------------------
// PÁGINA 7: MÓDULO 5 — AUXILIAR DE MANTENIMIENTO
// -----------------------------------------------------------------------------
function buildModule5Page() {
  doc.addPage()
  drawHeader('MÓDULO 5: AUXILIAR DE MANTENIMIENTO Y TÉCNICO SIG', 'Plan de mantenimiento semanal, lista de chequeo de OTs y calibración')

  let nextY = drawStepBlock(30, {
    stepNumber: 9,
    title: 'Paso 1: Plan Semanal y Lista de Chequeo Técnico (OT)',
    roleName: 'Auxiliar de Mantenimiento',
    screenMockup: (x, y, w, h) => {
      drawUIWindow(x, y, w, h, 'MaintenanceAuxHome · Plan de la Semana', 'Mantenimiento')

      // Tarea del día
      doc.setFillColor(...C.white)
      doc.roundedRect(x + 5, y + 11, w - 10, 20, 1.5, 1.5, 'FD')

      doc.setFont('helvetica', 'bold')
      doc.setFontSize(7.5)
      doc.setTextColor(...C.navy)
      doc.text('OT Preventiva: OT-2026-088 · INC-02', x + 8, y + 16)
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(6.5)
      doc.setTextColor(...C.slate)
      doc.text('Frecuencia: Mensual · Sistema de volteo y rodamientos', x + 8, y + 20)

      // Botón Ejecutar Tarea
      drawActionButton(x + 8, y + 23, 40, 5, '▶ Ejecutar Tarea (Chequeo)', true)
      drawHighlightBox(x + 8, y + 23, 40, 5, '', 1)

      // Lista de chequeo modal
      doc.setFillColor(...C.slateLight)
      doc.roundedRect(x + 5, y + 33, w - 10, 24, 1, 1, 'FD')
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(6.8)
      doc.setTextColor(...C.navy)
      doc.text('Items de verificación técnica:', x + 8, y + 37)

      doc.setFont('helvetica', 'normal')
      doc.setFontSize(6.2)
      doc.text('☑ 1. Verificación de cadenas y tensores de volteo', x + 8, y + 42)
      doc.text('☑ 2. Lubricación de chumaceras con grasa grado alimenticio', x + 8, y + 46)
      doc.text('☑ 3. Ajuste de pernos de anclaje de la torre motriz', x + 8, y + 50)

      // Botón Cerrar OT
      drawActionButton(x + 58, y + 49, 36, 5, '✓ Completar OT', true)
      drawHighlightBox(x + 58, y + 49, 36, 5, '', 2)
    },
    sequenceSteps: [
      { action: '1. Oprime «Ejecutar Tarea»', desc: 'Abre el instructivo técnico asociado y la lista de chequeo obligatoria.' },
      { action: '2. Marca cada item completado', desc: 'Verifica los puntos de inspección mecánicos y eléctricos.' },
      { action: '3. Toca «Completar OT»', desc: 'Registra el tiempo invertido, repuestos usados y firma el formato SIG.' },
    ],
    tip: 'No se permite cerrar una orden preventiva sin marcar todos los puntos de inspección y adjuntar la foto del trabajo.'
  })

  drawStepBlock(nextY + 2, {
    stepNumber: 10,
    title: 'Paso 2: Reporte de Trabajo Correctivo y Calibraciones',
    roleName: 'Auxiliar de Mantenimiento',
    screenMockup: (x, y, w, h) => {
      drawUIWindow(x, y, w, h, 'Orden Correctiva · Calibración de Sensores', 'Técnico')

      doc.setFont('helvetica', 'bold')
      doc.setFontSize(7.5)
      doc.setTextColor(...C.navy)
      doc.text('Calibración Termohigrómetros (Ventana 24h):', x + 6, y + 15)

      // Campos de calibración
      doc.setFontSize(6.5)
      doc.text('Máquina:', x + 6, y + 21)
      doc.setFillColor(...C.white)
      doc.roundedRect(x + 20, y + 17.5, 30, 5, 0.8, 0.8, 'FD')
      doc.text('INC-03', x + 22, y + 21)

      doc.text('Temp. Patrón:', x + 6, y + 28)
      doc.roundedRect(x + 26, y + 24.5, 20, 5, 0.8, 0.8, 'FD')
      doc.text('37.5 °C', x + 28, y + 28)

      doc.text('Temp. Sensor:', x + 50, y + 28)
      doc.roundedRect(x + 70, y + 24.5, 20, 5, 0.8, 0.8, 'FD')
      doc.text('37.6 °C', x + 72, y + 28)

      // Desviación
      doc.setFontSize(6)
      doc.setTextColor(...C.green)
      doc.text('Δ Desviación: +0.1 °C (Dentro de rango admisible ±0.2 °C)', x + 6, y + 35)

      // Botón foto patrón
      drawActionButton(x + 6, y + 38, 42, 5, '📷 Foto de Termómetro Patrón', false)
      drawHighlightBox(x + 6, y + 38, 42, 5, '', 1)

      // Botón guardar calibración
      drawActionButton(x + 6, y + 46, 50, 7, 'Guardar Certificado de Calibración', true)
      drawHighlightBox(x + 6, y + 46, 50, 7, '', 2)
    },
    sequenceSteps: [
      { action: '1. Ingresa lecturas patrón', desc: 'Compara el sensor de la incubadora con el termómetro de precisión calibrado.' },
      { action: '2. Foto de lectura patrón', desc: 'Sube la evidencia fotográfica de ambos instrumentos simultáneamente.' },
      { action: '3. Presiona «Guardar Certificado»', desc: 'Genera la curva de desviación para trazabilidad de auditorías ISO/SIG.' },
    ],
    tip: 'Las ventanas de calibración se barren automáticamente cada 30 minutos para garantizar que no se venzan los plazos.'
  })

  drawFooter(7, 12)
}

// -----------------------------------------------------------------------------
// PÁGINA 8: MÓDULO 6 — RECEPCIÓN, CLASIFICACIÓN Y CARGUE
// -----------------------------------------------------------------------------
function buildModule6Page() {
  doc.addPage()
  drawHeader('MÓDULO 6: OPERACIONES DE HUEVO FÉRTIL', 'Recepción de lotes, clasificación por peso/calidad, mapa de cargue y liquidación')

  let nextY = drawStepBlock(30, {
    stepNumber: 11,
    title: 'Paso 1: Recepción y Clasificación de Huevos',
    roleName: 'Operario de Recepción / Clasificación',
    screenMockup: (x, y, w, h) => {
      drawUIWindow(x, y, w, h, 'Clasificación de Lote · Carros y Bandejas', 'Recepción')

      // Información de lote
      doc.setFillColor(...C.white)
      doc.roundedRect(x + 5, y + 11, w - 10, 15, 1, 1, 'FD')
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(7.5)
      doc.setTextColor(...C.navy)
      doc.text('Lote: LOTE-LA-FE-42 · Edad Ave: 38 sem', x + 8, y + 16)
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(6.5)
      doc.setTextColor(...C.slate)
      doc.text('Total recibidos: 19,200 huevos · Carros programados: 4', x + 8, y + 21)

      // Botón Clasificar
      drawActionButton(x + 65, y + 14, 26, 5, '▶ Clasificar Lote', true)
      drawHighlightBox(x + 65, y + 14, 26, 5, '', 1)

      // Carga carro por carro
      doc.setFillColor(...C.slateLight)
      doc.roundedRect(x + 5, y + 28, w - 10, 28, 1, 1, 'FD')
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(7)
      doc.setTextColor(...C.navy)
      doc.text('Carro 01 de 04: Asignación de Bandejas', x + 8, y + 33)

      doc.setFont('helvetica', 'normal')
      doc.setFontSize(6.5)
      doc.text('• Huevos aptos para incubar: 4,800', x + 8, y + 38)
      doc.text('• Descarte (Rotos / Sucios / Fisurados): 42', x + 8, y + 42)
      doc.text('• Peso promedio por huevo: 62.4 g', x + 8, y + 46)

      // Botón Siguiente Carro
      drawActionButton(x + 56, y + 45, 36, 6, 'Guardar Carro 01 ➔', true)
      drawHighlightBox(x + 56, y + 45, 36, 6, '', 2)
    },
    sequenceSteps: [
      { action: '1. Oprime «Clasificar Lote»', desc: 'Abre el asistente de llenado carro por carro con el lote precargado.' },
      { action: '2. Digita aptos y descartes', desc: 'Ingresa los números reales contados durante el embandejado.' },
      { action: '3. Toca «Guardar Carro»', desc: 'Avanza al siguiente carro hasta completar el lote recibido.' },
    ],
    tip: 'El asistente no requiere selectores complejos de fecha y hora; guía paso a paso de manera fluida y táctil.'
  })

  drawStepBlock(nextY + 2, {
    stepNumber: 12,
    title: 'Paso 2: Mapa de Cargue de Máquina y Liquidación',
    roleName: 'Operario de Cargue / Liquidación',
    screenMockup: (x, y, w, h) => {
      drawUIWindow(x, y, w, h, 'Mapa de Cargue · Incubadora INC-05', 'Cargue')

      // Plano de posiciones en la máquina
      doc.setFillColor(...C.navy)
      doc.roundedRect(x + 5, y + 11, w - 10, 24, 1.5, 1.5, 'FD')

      // Rieles de carros
      doc.setFontSize(6)
      doc.setTextColor(...C.white)
      doc.text('Posición 1: Carro 101 (La Fe)', x + 8, y + 16)
      doc.text('Posición 2: Carro 102 (La Fe)', x + 8, y + 21)
      doc.text('Posición 3: Carro 103 (La Fe)', x + 52, y + 16)
      doc.text('Posición 4: Carro 104 (La Fe)', x + 52, y + 21)

      // Carros seleccionados
      drawHighlightBox(x + 6, y + 13, 40, 5, '', 1)

      // Botón Fijar Fecha y Hora de Cargue
      drawActionButton(x + 8, y + 27, 42, 5, '📅 Fijar Hora de Encendido', true)
      drawHighlightBox(x + 8, y + 27, 42, 5, '', 2)

      // Panel de liquidación inferior
      doc.setFillColor(...C.white)
      doc.roundedRect(x + 5, y + 38, w - 10, 18, 1, 1, 'FD')
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(7)
      doc.setTextColor(...C.navy)
      doc.text('Liquidación de Cargue:', x + 8, y + 43)

      doc.setFont('helvetica', 'normal')
      doc.setFontSize(6.5)
      doc.text('Fecha prevista de transferencia: Día 18 · Nacimiento previsto: Día 21', x + 8, y + 47)

      // Botón Liquidar
      drawActionButton(x + 54, y + 46, 38, 6, '✓ Liquidar y Sellar Cargue', true)
      drawHighlightBox(x + 54, y + 46, 38, 6, '', 3)
    },
    sequenceSteps: [
      { action: '1. Asigna carros a posiciones', desc: 'Arrastra o toca cada posición en el mapa digital de la incubadora.' },
      { action: '2. Fija fecha y hora de inicio', desc: 'Establece el inicio del ciclo térmico para programar transferencias.' },
      { action: '3. Oprime «Liquidar y Sellar»', desc: 'Bloquea el mapa y emite el documento oficial del lote para SIG.' },
    ],
    tip: 'El mapa de cargue evita duplicidad de carros y valida que ninguna máquina supere su capacidad máxima autorizada.'
  })

  drawFooter(8, 12)
}

// -----------------------------------------------------------------------------
// PÁGINA 9: MÓDULO 7 — CALIDAD, SST Y MISIONALES
// -----------------------------------------------------------------------------
function buildModule7Page() {
  doc.addPage()
  drawHeader('MÓDULO 7: CALIDAD, SST Y DESPLAZAMIENTOS MISIONALES', 'Inspección preoperacional FOSST22, permisos de trabajo y gastos misionales')

  let nextY = drawStepBlock(30, {
    stepNumber: 13,
    title: 'Paso 1: Preoperacional de Vehículos (Formato FOSST22)',
    roleName: 'Conductor / Auxiliar de Logística / SST',
    screenMockup: (x, y, w, h) => {
      drawUIWindow(x, y, w, h, 'FOSST22 · Inspección Preoperacional', 'SST')

      // Datos del vehículo
      doc.setFillColor(...C.white)
      doc.roundedRect(x + 5, y + 11, w - 10, 14, 1, 1, 'FD')
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(7)
      doc.setTextColor(...C.navy)
      doc.text('Vehículo: Camión TermoKing · Placa: TKL-804', x + 8, y + 16)
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(6.5)
      doc.text('Kilometraje actual: 124,500 km · SOAT / Tecno: Vigentes', x + 8, y + 21)

      // Checklist preoperacional
      doc.setFillColor(...C.slateLight)
      doc.roundedRect(x + 5, y + 27, w - 10, 24, 1, 1, 'FD')
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(6.8)
      doc.setTextColor(...C.navy)
      doc.text('Puntos de control preoperacional:', x + 8, y + 31)

      doc.setFont('helvetica', 'normal')
      doc.setFontSize(6.2)
      doc.text('☑ Frenos de servicio y emergencia: Operativos', x + 8, y + 36)
      doc.text('☑ Luces altas, bajas, direccionales y stop: Operativas', x + 8, y + 40)
      doc.text('☑ Llantas (profundidad de labrado y presión): Adecuada', x + 8, y + 44)
      doc.text('☑ Botiquín, extintor y equipo de carretera: Completo', x + 8, y + 48)

      // Botón Firma y Foto
      drawActionButton(x + 5, y + 53, 38, 5, '📷 Foto Kilometraje / Firma', false)
      drawHighlightBox(x + 5, y + 53, 38, 5, '', 1)

      // Botón Guardar FOSST22
      drawActionButton(x + 46, y + 53, 48, 5, 'Emitir Formato FOSST22', true)
      drawHighlightBox(x + 46, y + 53, 48, 5, '', 2)
    },
    sequenceSteps: [
      { action: '1. Revisa items del vehículo', desc: 'Verifica físicamente frenos, llantas, fluidos y equipo de carretera.' },
      { action: '2. Foto y firma del conductor', desc: 'Toma la foto del odómetro y firma digitalmente en pantalla.' },
      { action: '3. Presiona «Emitir FOSST22»', desc: 'Genera el PDF oficial listo para presentar a las autoridades viales.' },
    ],
    tip: 'El formato FOSST22 es de obligatorio cumplimiento antes de iniciar cualquier ruta de transporte de huevo o pollito.'
  })

  drawStepBlock(nextY + 2, {
    stepNumber: 14,
    title: 'Paso 2: Registro de Desplazamientos Misionales y Viáticos',
    roleName: 'Todos los perfiles con viajes autorizados',
    screenMockup: (x, y, w, h) => {
      drawUIWindow(x, y, w, h, 'Misionales · Desplazamiento y Gastos', 'Misionales')

      doc.setFont('helvetica', 'bold')
      doc.setFontSize(7.5)
      doc.setTextColor(...C.navy)
      doc.text('Registro de Desplazamiento Corporativo:', x + 6, y + 15)

      // Campos de viaje
      doc.setFontSize(6.5)
      doc.text('Destino:', x + 6, y + 21)
      doc.setFillColor(...C.white)
      doc.roundedRect(x + 22, y + 17.5, 40, 5, 0.8, 0.8, 'FD')
      doc.text('Granja La Fe (Sede Sonsón)', x + 24, y + 21)

      doc.text('Motivo:', x + 6, y + 28)
      doc.roundedRect(x + 22, y + 24.5, 68, 5, 0.8, 0.8, 'FD')
      doc.text('Mantenimiento electromecánico de urgencia INC-02', x + 24, y + 28)

      // Gastos
      doc.text('Gasto / Peaje:', x + 6, y + 35)
      doc.roundedRect(x + 22, y + 31.5, 30, 5, 0.8, 0.8, 'FD')
      doc.text('$ 18,500 COP (Peaje)', x + 24, y + 35)

      // Botón foto recibo
      drawActionButton(x + 55, y + 31.5, 35, 5, '📷 Foto Factura / Recibo', false)
      drawHighlightBox(x + 55, y + 31.5, 35, 5, '', 1)

      // Botón guardar misional
      drawActionButton(x + 6, y + 43, 50, 7, 'Registrar y Liquidar Viaje Misional', true)
      drawHighlightBox(x + 6, y + 43, 50, 7, '', 2)
    },
    sequenceSteps: [
      { action: '1. Selecciona Destino y Motivo', desc: 'Indica la sede visitada y la orden de servicio correspondiente.' },
      { action: '2. Foto de factura o recibo', desc: 'Captura el comprobante de peaje, combustible o viáticos.' },
      { action: '3. Toca «Liquidar Viaje»', desc: 'Envía el reporte automático a contabilidad para reembolso oportuno.' },
    ],
    tip: 'El módulo misional está habilitado para todos los perfiles de la empresa con trazabilidad de GPS de salida y regreso.'
  })

  drawFooter(9, 12)
}

// -----------------------------------------------------------------------------
// PÁGINA 10: MÓDULO 8 — GERENCIA Y DIRECCIÓN
// -----------------------------------------------------------------------------
function buildModule8Page() {
  doc.addPage()
  drawHeader('MÓDULO 8: GERENCIA Y DIRECCIÓN ESTRATÉGICA', 'Tablero ejecutivo (ExecTodayBoard), metas de calidad y bonos de cumplimiento')

  let nextY = drawStepBlock(30, {
    stepNumber: 15,
    title: 'Paso 1: Tablero Ejecutivo (ExecTodayBoard)',
    roleName: 'Gerencia General / Propietario',
    screenMockup: (x, y, w, h) => {
      drawUIWindow(x, y, w, h, 'ExecTodayBoard · Resumen de Dirección', 'Gerencia')

      // Indicadores macro
      const cw = 28
      const ch = 13
      // Rendimiento Incubación
      doc.setFillColor(...C.greenLight)
      doc.roundedRect(x + 5, y + 11, cw, ch, 1, 1, 'FD')
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(8.5)
      doc.setTextColor(...C.green)
      doc.text('88.4 %', x + 10, y + 17)
      doc.setFontSize(5.5)
      doc.text('Nacimiento Promedio', x + 7, y + 21)

      // Eficiencia Energética
      doc.setFillColor(...C.blueLight)
      doc.roundedRect(x + 36, y + 11, cw, ch, 1, 1, 'FD')
      doc.setFontSize(8.5)
      doc.setTextColor(...C.blue)
      doc.text('99.2 %', x + 41, y + 17)
      doc.setFontSize(5.5)
      doc.text('Disponibilidad Máquinas', x + 38, y + 21)

      // Bonos de Calidad
      doc.setFillColor(...C.orangeLight)
      doc.roundedRect(x + 67, y + 11, cw, ch, 1, 1, 'FD')
      doc.setFontSize(8.5)
      doc.setTextColor(...C.orange)
      doc.text('96.8 %', x + 72, y + 17)
      doc.setFontSize(5.5)
      doc.text('Cumplimiento Bonos', x + 69, y + 21)

      // Gráfico de tendencias simulado
      doc.setFillColor(...C.white)
      doc.roundedRect(x + 5, y + 26, w - 10, 22, 1, 1, 'FD')
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(7)
      doc.setTextColor(...C.navy)
      doc.text('Tendencia Semanal de Nacimientos vs Metas SIG:', x + 8, y + 31)

      doc.setDrawColor(...C.orange)
      doc.setLineWidth(0.8)
      doc.line(x + 10, y + 42, x + 30, y + 38)
      doc.line(x + 30, y + 38, x + 55, y + 36)
      doc.line(x + 55, y + 36, x + 85, y + 35)

      // Botones ejecutivos
      drawActionButton(x + 5, y + 50, 42, 6, '📊 Descargar Informe Gerencial', true)
      drawHighlightBox(x + 5, y + 50, 42, 6, '', 1)

      drawActionButton(x + 50, y + 50, 44, 6, '👥 Presencia del Personal en Vivo', false)
      drawHighlightBox(x + 50, y + 50, 44, 6, '', 2)
    },
    sequenceSteps: [
      { action: '1. Revisa los KPIs del día', desc: 'Supervisa nacimientos, alertas críticas y cumplimiento del plan.' },
      { action: '2. Toca «Descargar Informe»', desc: 'Exporta el balance consolidado en PDF y Excel para junta directiva.' },
      { action: '3. Toca «Presencia en Vivo»', desc: 'Visualiza la asistencia y ubicación operativa de cada colaborador.' },
    ],
    tip: 'El perfil de Gerencia es el único de la empresa con visión global multi-área sobre todas las sedes y módulos.'
  })

  drawStepBlock(nextY + 2, {
    stepNumber: 16,
    title: 'Paso 2: Aprobación de Metas y Bonos de Cumplimiento (95%+)',
    roleName: 'Gerencia General / Dirección',
    screenMockup: (x, y, w, h) => {
      drawUIWindow(x, y, w, h, 'Cumplimiento · Plan de Fidelización SIG', 'Metas')

      doc.setFont('helvetica', 'bold')
      doc.setFontSize(7.5)
      doc.setTextColor(...C.navy)
      doc.text('Liquidación de Bonos de Eficiencia Operativa:', x + 6, y + 15)

      // Tabla de turnos evaluados
      doc.setFillColor(...C.white)
      doc.roundedRect(x + 6, y + 18, w - 12, 24, 1, 1, 'FD')
      doc.setFontSize(6.5)
      doc.setTextColor(...C.navy)
      doc.text('Colaborador', x + 8, y + 23)
      doc.text('Puntualidad', x + 38, y + 23)
      doc.text('Rondas %', x + 60, y + 23)
      doc.text('Bono 95%', x + 80, y + 23)

      doc.setFont('helvetica', 'normal')
      doc.setFontSize(6)
      doc.text('German Arango', x + 8, y + 28)
      doc.text('100 % (0 retardo)', x + 38, y + 28)
      doc.text('98.5 % (Fotos ok)', x + 60, y + 28)
      doc.setTextColor(...C.green)
      doc.text('Aprobado ✓', x + 80, y + 28)

      doc.setTextColor(...C.navy)
      doc.text('Miguel Taborda', x + 8, y + 33)
      doc.text('100 %', x + 38, y + 33)
      doc.text('99.1 %', x + 60, y + 33)
      doc.setTextColor(...C.green)
      doc.text('Aprobado ✓', x + 80, y + 28)

      // Botón autorizar bono
      drawActionButton(x + 6, y + 46, 52, 7, '✓ Autorizar Liquidación de Bonos', true)
      drawHighlightBox(x + 6, y + 46, 52, 7, '', 1)
    },
    sequenceSteps: [
      { action: '1. Revisa cumplimiento individual', desc: 'Verifica los porcentajes de rondas y puntualidad biométrica.' },
      { action: '2. Audita evidencias en fotos', desc: 'Comprueba que las fotos de respaldo cumplan el estándar de nitidez.' },
      { action: '3. Toca «Autorizar Liquidación»', desc: 'Aprueba el desembolso de los bonos pactados en el plan de 90 días.' },
    ],
    tip: 'El algoritmo calcula automáticamente si el colaborador alcanzó el 95% requerido para hacerse acreedor al beneficio.'
  })

  drawFooter(10, 12)
}

// -----------------------------------------------------------------------------
// PÁGINA 11: MÓDULO 9 — ADMINISTRACIÓN DE EMPRESA
// -----------------------------------------------------------------------------
function buildModule9Page() {
  doc.addPage()
  drawHeader('MÓDULO 9: ADMINISTRACIÓN DE EMPRESA Y SEGURIDAD', 'Gestión de personal, asignación de roles, contraseñas y catálogo de planta')

  let nextY = drawStepBlock(30, {
    stepNumber: 17,
    title: 'Paso 1: Aprobación de Usuarios y Asignación de Roles',
    roleName: 'Administrador de Empresa (Admin)',
    screenMockup: (x, y, w, h) => {
      drawUIWindow(x, y, w, h, 'AdminDashboard · Usuarios y Roles', 'Admin')

      // Fila de usuario pendiente
      doc.setFillColor(...C.amberLight)
      doc.roundedRect(x + 5, y + 11, w - 10, 18, 1, 1, 'FD')

      doc.setFont('helvetica', 'bold')
      doc.setFontSize(7.5)
      doc.setTextColor(...C.navy)
      doc.text('Nuevo Registro: Carlos Pérez (carlos@incubant.co)', x + 8, y + 16)

      doc.setFont('helvetica', 'normal')
      doc.setFontSize(6.5)
      doc.setTextColor(...C.slate)
      doc.text('Estado: Pendiente de aprobación · Empresa: Antioqueña de Incubación', x + 8, y + 20)

      // Botón Aprobar
      drawActionButton(x + 8, y + 22, 22, 5, '✓ Aprobar', true)
      drawHighlightBox(x + 8, y + 22, 22, 5, '', 1)

      // Botón Asignar Rol
      drawActionButton(x + 32, y + 22, 24, 5, '🏷️ Asignar Rol', false)
      drawHighlightBox(x + 32, y + 22, 24, 5, '', 2)

      // Cuadro de asignación
      doc.setFillColor(...C.white)
      doc.roundedRect(x + 5, y + 31, w - 10, 24, 1, 1, 'FD')
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(6.8)
      doc.setTextColor(...C.navy)
      doc.text('Asignar Rol y Área Operativa:', x + 8, y + 36)

      doc.setFont('helvetica', 'normal')
      doc.setFontSize(6.5)
      doc.text('Rol: Operario de turno (operator)', x + 8, y + 41)
      doc.text('Área: Mantenimiento y Planta Central', x + 8, y + 45)

      // Botón Guardar Asignación
      drawActionButton(x + 8, y + 48, 36, 5, 'Guardar Permisos', true)
      drawHighlightBox(x + 8, y + 48, 36, 5, '', 3)
    },
    sequenceSteps: [
      { action: '1. Oprime «Aprobar»', desc: 'Valida que el nuevo empleado esté contratado y autorizado.' },
      { action: '2. Toca «Asignar Rol»', desc: 'Define el perfil hermético: Operario, Líder, Mantenimiento, etc.' },
      { action: '3. Selecciona Área y Guarda', desc: 'Habilita únicamente las pestañas correspondientes en su dispositivo.' },
    ],
    tip: 'Un usuario recién registrado permanece inactivo y sin acceso hasta que el administrador lo aprueba expresamente.'
  })

  drawStepBlock(nextY + 2, {
    stepNumber: 18,
    title: 'Paso 2: Generación de Contraseñas Temporales y Bloqueo',
    roleName: 'Administrador de Empresa (Admin)',
    screenMockup: (x, y, w, h) => {
      drawUIWindow(x, y, w, h, 'Seguridad · Contraseña Temporal', 'Seguridad')

      doc.setFont('helvetica', 'bold')
      doc.setFontSize(7.5)
      doc.setTextColor(...C.navy)
      doc.text('Restablecimiento de Credencial de Acceso:', x + 6, y + 15)

      // Usuario seleccionado
      doc.setFontSize(6.5)
      doc.text('Usuario:', x + 6, y + 21)
      doc.setFillColor(...C.white)
      doc.roundedRect(x + 20, y + 17.5, 45, 5, 0.8, 0.8, 'FD')
      doc.text('operario@incubant.co', x + 22, y + 21)

      // Campo contraseña temporal
      doc.text('Nueva clave temporal:', x + 6, y + 28)
      doc.roundedRect(x + 35, y + 24.5, 30, 5, 0.8, 0.8, 'FD')
      doc.text('Incubant2026*', x + 37, y + 28)

      // Botón generar clave
      drawActionButton(x + 6, y + 33, 48, 6, 'Establecer Contraseña Temporal', true)
      drawHighlightBox(x + 6, y + 33, 48, 6, '', 1)

      // Botón Revocar Acceso
      drawActionButton(x + 58, y + 33, 35, 6, '⛔ Revocar Acceso', false)
      drawHighlightBox(x + 58, y + 33, 35, 6, '', 2)

      // Advertencia
      doc.setFontSize(6)
      doc.setTextColor(...C.slate)
      doc.text('El usuario deberá cambiar la clave temporal al ingresar a su perfil.', x + 6, y + 43)
    },
    sequenceSteps: [
      { action: '1. Digita clave temporal segura', desc: 'Asigna una contraseña de al menos 6 caracteres al colaborador.' },
      { action: '2. Toca «Establecer Contraseña»', desc: 'Se sincroniza en el servidor y permite acceso inmediato sin correo.' },
      { action: '3. Botón «Revocar Acceso»', desc: 'Bloquea el ingreso al instante en caso de retiro o suspensión de labores.' },
    ],
    tip: 'Si el servidor de correo tiene fallas, este método garantiza que ningún operario se quede sin entrar a su turno.'
  })

  drawFooter(11, 12)
}

// -----------------------------------------------------------------------------
// PÁGINA 12: MÓDULO 10 — GUÍA OFFLINE Y SOPORTE TÉCNICO
// -----------------------------------------------------------------------------
function buildModule10Page() {
  doc.addPage()
  drawHeader('MÓDULO 10: OPERACIÓN OFFLINE Y SOPORTE TÉCNICO', 'Manejo sin conexión a internet, sincronización automática y canales de soporte')

  // Caja de arquitectura offline
  doc.setFillColor(...C.slateLight)
  doc.setDrawColor(...C.border)
  doc.setLineWidth(0.4)
  doc.roundedRect(MARGIN_L, 30, CONTENT_W, 60, 2, 2, 'FD')

  doc.setFillColor(...C.navy)
  doc.roundedRect(MARGIN_L, 30, CONTENT_W, 7, 2, 2, 'F')
  doc.rect(MARGIN_L, 30 + 4, CONTENT_W, 3, 'F')

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  doc.setTextColor(...C.white)
  doc.text('¿CÓMO OPERA INCUBAPP CUANDO NO HAY SEÑAL O INTERNET EN PLANTA / GRANJA?', MARGIN_L + 6, 35)

  const offlineSteps = [
    ['1. Inicio Offline Transparente:', 'Si no hay red, la app arranca utilizando la caché segura guardada en el dispositivo móvil.'],
    ['2. Cola de Almacenamiento Local:', 'Todas las rondas, fotos, OTs y checklists se guardan en IndexedDB cifrado localmente.'],
    ['3. Banner Indicador Naranja:', 'La pantalla muestra el aviso: «Sin conexión estable: se sincroniza solo al volver la señal».'],
    ['4. Sincronización Automática:', 'Al recuperar Wi-Fi o datos móviles, la app envía todas las evidencias al servidor sin perder datos.'],
    ['5. Botón de Sincronización Manual:', 'Puedes forzar el envío en cualquier momento tocando «Sincronizar ahora» en el banner.'],
  ]

  let oy = 42
  offlineSteps.forEach(([title, desc]) => {
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(7.5)
    doc.setTextColor(...C.orange)
    doc.text(title, MARGIN_L + 6, oy)

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7.5)
    doc.setTextColor(...C.dark)
    doc.text(desc, MARGIN_L + 48, oy)

    oy += 7.2
  })

  // Simulación de banner offline
  doc.setFillColor(254, 242, 242)
  doc.setDrawColor(...C.red)
  doc.setLineWidth(0.4)
  doc.roundedRect(MARGIN_L, 95, CONTENT_W, 16, 1.5, 1.5, 'FD')

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7.5)
  doc.setTextColor(...C.red)
  doc.text('⚠ MODO SIN CONEXIÓN ACTIVO', MARGIN_L + 6, 101)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(6.8)
  doc.setTextColor(...C.dark)
  doc.text('Tienes 3 registros pendientes por enviar. El sistema los enviará automáticamente al reconectar.', MARGIN_L + 6, 106)

  drawActionButton(MARGIN_L + CONTENT_W - 38, 99, 32, 7, '🔄 Sincronizar Ahora', true)
  drawHighlightBox(MARGIN_L + CONTENT_W - 38, 99, 32, 7, '', 1)

  // Directorio de soporte técnico y TI
  const supY = 118
  doc.setFillColor(...C.navy)
  doc.roundedRect(MARGIN_L, supY, CONTENT_W, 46, 2, 2, 'F')

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.setTextColor(...C.orange)
  doc.text('DIRECTORIO DE SOPORTE TÉCNICO Y MESA DE AYUDA TI', MARGIN_L + 6, supY + 8)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7.5)
  doc.setTextColor(...C.white)
  doc.text('Para dudas operativas, incidentes de acceso, reporte de fallas en tabletas o solicitud de roles:', MARGIN_L + 6, supY + 14)

  const supItems = [
    ['Responsable TI & Desarrollo:', 'Henry Camilo Taborda Galeano (CDH Maker)'],
    ['Canal de Soporte en Plataforma:', 'Widget de Chat Integrado (Icono inferior derecho 💬)'],
    ['Área de Mantenimiento / Planta:', 'Coordinación de Mantenimiento e Instrumentación SIG'],
    ['Empresa:', 'Antioqueña de Incubación SAS · Sede Central'],
  ]

  let sy = supY + 20
  supItems.forEach(([l, v]) => {
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(7)
    doc.setTextColor(200, 215, 235)
    doc.text(l, MARGIN_L + 6, sy)

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7)
    doc.setTextColor(...C.white)
    doc.text(v, MARGIN_L + 48, sy)

    sy += 5.5
  })

  // Mensaje final de cierre
  doc.setFillColor(...C.orangeLight)
  doc.roundedRect(MARGIN_L, 172, CONTENT_W, 20, 2, 2, 'F')
  doc.setDrawColor(...C.orange)
  doc.setLineWidth(0.3)
  doc.roundedRect(MARGIN_L, 172, CONTENT_W, 20, 2, 2, 'D')

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  doc.setTextColor(...C.navy)
  doc.text('COMPROMISO CON LA EXCELENCIA Y BIOSEGURIDAD', MARGIN_L + 6, 178)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7)
  doc.setTextColor(...C.dark)
  const closureText = 'IncubApp es la herramienta tecnológica diseñada para garantizar la trazabilidad total del embrión, la confiabilidad de nuestras máquinas y la seguridad de cada colaborador. Cumplir este instructivo paso a paso asegura la máxima calidad de nuestros pollitos de un día.'
  doc.text(doc.splitTextToSize(closureText, CONTENT_W - 12), MARGIN_L + 6, 183)

  drawFooter(12, 12)
}

// -----------------------------------------------------------------------------
// ENSAMBLAR Y GUARDAR PDF
// -----------------------------------------------------------------------------
buildCoverPage()
buildIndexPage()
buildModule1Page()
buildModule2Page()
buildModule3Page()
buildModule4Page()
buildModule5Page()
buildModule6Page()
buildModule7Page()
buildModule8Page()
buildModule9Page()
buildModule10Page()

const pdfBuffer = Buffer.from(doc.output('arraybuffer'))
fs.writeFileSync(OUTPUT_PDF, pdfBuffer)
console.log(`✓ PDF generado exitosamente en: ${OUTPUT_PDF} (${pdfBuffer.length} bytes, 12 páginas).`)
