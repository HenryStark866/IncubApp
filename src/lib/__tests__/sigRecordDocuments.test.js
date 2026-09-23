// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  calibrationRecordHtml,
  calibrationRecordItem,
  shiftActivityRecordItem,
  singleCheckRound,
  workOrderRecordItem,
  evidenceHasRecordDocument,
  evidenceRecordHtml,
  openRecordDocument,
  productionRecordHtml,
  roundRecordHtml,
  workOrderRecordHtml,
} from '../sigRecordDocuments'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe('formatos SIG diligenciados con los registros de IncubApp', () => {
  it('la ronda llena el FOMAT04 con cada equipo y deja «No registrado» lo que no se tomó', () => {
    const html = roundRecordHtml({
      file_name: 'Ronda 2026-09-22 · T2 · H3',
      shiftDate: '2026-09-22',
      shiftCode: 'T2',
      hourSlot: 'H3',
      items: [
        { machine: { code: 'INC-05' }, condition: 'warning', notes: 'Humedad baja', taken_at: '2026-09-22T15:00:00-05:00', takenByName: 'Ferney Tabares', photo_path: 'org/a.jpg', url: 'https://firmada.test/a.jpg' },
        { machine: { code: 'INC-06' }, condition: 'normal', notes: null, taken_at: null, takenByName: null },
      ],
      reports: [],
    })

    expect(html).toContain('FOMAT04')
    expect(html).toContain('INC-05')
    expect(html).toContain('Alerta')
    expect(html).toContain('Ferney Tabares')
    expect(html).toContain('No registrado')
    expect(html).toContain('https://firmada.test/a.jpg')
  })

  it('la calibración muestra las lecturas medidas sin calificarlas como conformes', () => {
    const html = calibrationRecordHtml({
      file_name: 'Calibración INC-05',
      machine: { code: 'INC-05', name: 'Incubadora 5' },
      performedByName: 'Ferney Tabares',
      calibration: { scope: 'temperature', calibrated_at: '2026-09-19T14:19:00-05:00', temp_machine_f: 99.5, temp_calibrator_f: 99.7, temp_delta_f: -0.2, reason: 'manual' },
      items: [],
    })

    expect(html).toContain('FOMAT08')
    expect(html).toContain('99.7')
    expect(html).toContain('Temperatura (°F)')
    expect(html).not.toContain('Humedad relativa (%)')
    expect(html).not.toMatch(/conforme|dentro de tolerancia/i)
  })

  it('la OT lista todos los archivos de evidencia que tiene', () => {
    const html = workOrderRecordHtml({
      order: { code: 'OT-0101', title: 'Cambio de empaque', status: 'completed', completed_at: '2026-09-20T10:00:00-05:00' },
      orderMachine: { code: 'NAC-03' },
      orderPeople: { createdBy: 'Henry', assignedTo: 'Juan' },
      orderFiles: [{ file_name: 'antes.jpg', note: 'Antes' }, { file_name: 'despues.jpg', note: 'Después' }],
    })

    expect(html).toContain('FOMAT01')
    expect(html).toContain('OT-0101')
    expect(html).toContain('Cerrada')
    expect(html).toContain('antes.jpg')
    expect(html).toContain('despues.jpg')
  })

  it('el registro de producción no se inventa un código de formato del SIG', () => {
    const html = productionRecordHtml({ recordTitle: 'REGISTRO DE CARGUE DE INCUBADORA', recordFields: [['Lote', '46'], ['Registró', 'Ana']], items: [] })

    expect(html).toContain('Registro operativo')
    expect(html).toContain('REGISTRO DE CARGUE DE INCUBADORA')
    expect(html).not.toMatch(/FOMAT0\d/)
  })

  it('una evidencia de OT sin los datos de la orden no genera formato', () => {
    expect(evidenceHasRecordDocument({ kind: 'work-order' })).toBe(false)
    expect(evidenceRecordHtml({ kind: 'work-order' })).toBeNull()
    expect(evidenceHasRecordDocument({ kind: 'round', items: [] })).toBe(true)
  })

  it('muestra el formato dentro de la app, cargado como Blob, y se cierra con Escape', () => {
    vi.useFakeTimers()
    const create = vi.fn(() => 'blob:prueba')
    const revoke = vi.fn()
    URL.createObjectURL = create
    URL.revokeObjectURL = revoke

    expect(openRecordDocument({ html: '<p>FOMAT04</p>', title: 'FOMAT04 · Ronda' })).toBe(true)
    const viewer = document.getElementById('sig-record-viewer')
    expect(viewer).not.toBeNull()
    expect(viewer.querySelector('iframe').getAttribute('src')).toBe('blob:prueba')
    expect(viewer.textContent).toContain('FOMAT04 · Ronda')
    expect(viewer.querySelector('a[target="_blank"]').getAttribute('href')).toBe('blob:prueba')
    expect(viewer.querySelector('a[download]').getAttribute('download')).toBe('FOMAT04-Ronda.html')
    expect(create.mock.calls[0][0].type).toContain('text/html')

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    expect(document.getElementById('sig-record-viewer')).toBeNull()
    vi.advanceTimersByTime(60000)
    expect(revoke).toHaveBeenCalledWith('blob:prueba')
  })

  it('una URL data: también se ve en el visor, porque Chrome no deja navegar a ella desde un enlace', () => {
    URL.createObjectURL = vi.fn(() => 'blob:data')
    URL.revokeObjectURL = vi.fn()
    const open = vi.spyOn(window, 'open').mockReturnValue(null)

    expect(openRecordDocument({ url: 'data:text/html;charset=utf-8,%3Cp%3Ehola%3C%2Fp%3E' })).toBe(true)
    expect(document.querySelector('#sig-record-viewer iframe').getAttribute('src')).toBe('blob:data')
    expect(open).not.toHaveBeenCalled()
    document.getElementById('sig-record-viewer').dispatchEvent(new Event('sig-close'))
  })

  it('Word y Excel se abren aparte; si el navegador bloquea la ventana, se descargan', () => {
    const opened = {}
    const open = vi.spyOn(window, 'open').mockReturnValueOnce(opened).mockReturnValueOnce(null)
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})

    expect(openRecordDocument({ url: 'https://firmada.test/OT-00001.docx?token=1' })).toBe(true)
    expect(open).toHaveBeenCalledWith('https://firmada.test/OT-00001.docx?token=1', '_blank')
    expect(opened.opener).toBeNull()
    expect(document.getElementById('sig-record-viewer')).toBeNull()

    expect(openRecordDocument({ url: 'https://firmada.test/FOMAT04.xlsx' })).toBe(true)
    expect(click).toHaveBeenCalledTimes(1)
    expect(openRecordDocument({})).toBe(false)
  })
})

describe('registros sueltos de las listas: dossier, feed del líder y OT de Mantenimiento', () => {
  it('un chequeo de ronda arma su línea del FOMAT04 con turno, franja y quién lo tomó', () => {
    const item = singleCheckRound({
      check: { id: 'c1', shift_date: '2026-09-22', shift_number: 2, hour_slot: 'H3', condition: 'fault', notes: 'Ventilador trabado', taken_at: '2026-09-22T15:10:00-05:00', photo_path: 'org/x.jpg' },
      machine: { code: 'INC-05', name: 'Incubadora 5' },
      takenByName: 'Ferney Tabares',
      photoUrl: 'https://firmada.test/x.jpg',
    })

    expect(item.shiftCode).toBe('T2')
    const html = evidenceRecordHtml(item)
    expect(html).toContain('FOMAT04')
    expect(html).toContain('INC-05')
    expect(html).toContain('Falla')
    expect(html).toContain('Ventilador trabado')
    expect(html).toContain('Ferney Tabares')
    expect(html).toContain('https://firmada.test/x.jpg')
  })

  it('la calibración llega al FOMAT08 con sus lecturas y solo con las fotos que abren', () => {
    const item = calibrationRecordItem({
      calibration: { id: 'k1', scope: 'both', calibrated_at: '2026-09-19T14:19:00-05:00', temp_machine_f: 99.5, temp_calibrator_f: 99.7, temp_delta_f: -0.2, rh_machine_pct: 55, rh_calibrator_pct: 57, rh_delta_pct: -2 },
      machine: { code: 'INC-05' },
      performedByName: 'Ferney Tabares',
      workOrderCode: 'OT-0101',
      photos: [{ url: 'https://firmada.test/patron.jpg', file_name: 'Patrón' }, { url: null, file_name: 'Pantalla' }],
    })

    expect(item.items).toHaveLength(1)
    const html = evidenceRecordHtml(item)
    expect(html).toContain('FOMAT08')
    expect(html).toContain('99.7')
    expect(html).toContain('57')
    expect(html).toContain('OT-0101')
    expect(html).toContain('https://firmada.test/patron.jpg')
  })

  it('la OT llega al FOMAT01 con quien la pidió, quien la atendió y sus archivos', () => {
    const item = workOrderRecordItem({
      order: { id: 'w1', code: 'OT-0102', title: 'Cambio de empaque', status: 'completed' },
      files: [{ file_name: 'antes.jpg', note: 'Antes', uploadedByName: 'Juan' }],
      machine: { code: 'NAC-03' },
      createdBy: 'Henry',
      assignedTo: 'Juan',
    })

    const html = evidenceRecordHtml(item)
    expect(html).toContain('FOMAT01')
    expect(html).toContain('OT-0102')
    expect(html).toContain('NAC-03')
    expect(html).toContain('Henry')
    expect(html).toContain('antes.jpg')
  })

  it('la actividad del turno sale como registro operativo y sin código de formato del SIG', () => {
    const item = shiftActivityRecordItem({
      activity: { id: 'a1', title: 'Lavado de bandejas', status: 'done', assigned_to: 'u1', completed_at: '2026-09-22T11:00:00-05:00', result_qty: 120, photo_path: null },
      people: { u1: 'Ana Operaria' },
    })

    const html = evidenceRecordHtml(item)
    expect(html).toContain('REGISTRO DE ACTIVIDAD DEL TURNO')
    expect(html).toContain('Lavado de bandejas')
    expect(html).toContain('Ana Operaria')
    expect(html).toContain('120')
    expect(html).toContain('Sin foto')
    expect(html).not.toMatch(/FOMAT0\d/)
  })
})
