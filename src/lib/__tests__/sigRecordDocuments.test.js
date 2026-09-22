// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  calibrationRecordHtml,
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
