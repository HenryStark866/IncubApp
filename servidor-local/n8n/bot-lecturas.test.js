import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const { decidir, cuerpoLectura, numeroDeCodigo } = require('./bot-lecturas.cjs')

const campo = (valor, legible = true, consigna = null) => ({ legible, valor: legible ? valor : null, consigna })
const pantalla = (over = {}) => ({
  pantalla_visible: true,
  etiqueta_pantalla: '2 - 18 XS12SHDOX',
  numero_maquina: 18,
  temp_ovoscan: campo(100.0),
  temp_air: campo(97.8),
  humidity: campo(76.9),
  co2: campo(0.25),
  turn_count: { legible: true, valor: 386 },
  observaciones: 'Sin novedad',
  ...over,
})
const api = (datos) => ({ model: 'claude-opus-5-5', stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify(datos) }] })
const incubadora = { check_id: 'c1', machine_code: 'INC-18', machine_name: 'Inc 18', machine_type: 'setter' }

describe('bot de lecturas', () => {
  it('llena todo cuando las dos lecturas coinciden', () => {
    const r = decidir(incubadora, [api(pantalla()), api(pantalla())])
    expect(r.status).toBe('aplicada')
    expect(r.valores).toEqual({ temp_ovoscan: 100, temp_air: 97.8, humidity: 76.9, co2: 0.25, turn_count: 386 })
  })

  it('no llena un campo si las lecturas no coinciden, pero sí los demás', () => {
    const r = decidir(incubadora, [api(pantalla()), api(pantalla({ temp_air: campo(97.9) }))])
    expect(r.status).toBe('revisar')
    expect(r.valores.temp_air).toBeUndefined()
    expect(r.valores.co2).toBe(0.25)
    expect(r.discrepancias).toEqual([{ campo: 'temp_air', tipo: 'lecturas_distintas', lectura_a: 97.8, lectura_b: 97.9 }])
  })

  it('deja vacío lo que se ve como «---» sin marcar revisión', () => {
    const r = decidir(incubadora, [api(pantalla({ temp_ovoscan: campo(null, false, 100.1) })), api(pantalla({ temp_ovoscan: campo(null, false, 100.1) }))])
    expect(r.status).toBe('aplicada')
    expect(r.valores.temp_ovoscan).toBeUndefined()
  })

  it('si una lectura lo ve y la otra no, no lo llena', () => {
    const r = decidir(incubadora, [api(pantalla()), api(pantalla({ co2: campo(null, false) }))])
    expect(r.valores.co2).toBeUndefined()
    expect(r.status).toBe('revisar')
  })

  it('rechaza valores imposibles aunque coincidan', () => {
    const r = decidir(incubadora, [api(pantalla({ co2: campo(25) })), api(pantalla({ co2: campo(25) }))])
    expect(r.valores.co2).toBeUndefined()
    expect(r.discrepancias[0].tipo).toBe('fuera_de_rango')
  })

  it('no llena nada si la pantalla es de otra máquina', () => {
    const r = decidir(incubadora, [api(pantalla({ numero_maquina: 19 })), api(pantalla({ numero_maquina: 19 }))])
    expect(r.status).toBe('revisar')
    expect(r.valores).toEqual({})
    expect(r.discrepancias[0].tipo).toBe('maquina_distinta')
  })

  it('en nacedoras no escribe ovoscan ni volteo', () => {
    const nac = { check_id: 'c2', machine_code: 'NAC-09', machine_type: 'hatcher' }
    const p = pantalla({ numero_maquina: 9 })
    const r = decidir(nac, [api(p), api(p)])
    expect(Object.keys(r.valores).sort()).toEqual(['co2', 'humidity', 'temp_air'])
  })

  it('marca error si la API falla o se niega, sin llenar nada', () => {
    expect(decidir(incubadora, [api(pantalla()), { error: { message: 'overloaded' } }]).status).toBe('error')
    expect(decidir(incubadora, [api(pantalla()), { stop_reason: 'refusal', content: [] }]).status).toBe('error')
    expect(decidir(incubadora, [api(pantalla())]).status).toBe('error')
  })

  it('reintenta sin gastar intentos si falla la cuenta o la conexión, no si falla la foto', () => {
    expect(decidir(incubadora, [{ error: { message: '401 invalid x-api-key' } }, { error: { message: '401' } }]).reintentar).toBe(true)
    expect(decidir(incubadora, [api(pantalla()), { stop_reason: 'refusal', content: [] }]).reintentar).toBe(false)
  })

  it('foto sin pantalla queda sin lecturas', () => {
    const nada = pantalla({ pantalla_visible: false, temp_ovoscan: campo(null, false), temp_air: campo(null, false), humidity: campo(null, false), co2: campo(null, false), turn_count: { legible: false, valor: null } })
    expect(decidir(incubadora, [api(nada), api(nada)]).status).toBe('sin_lecturas')
  })

  it('saca el número de máquina del código', () => {
    expect(numeroDeCodigo('INC-18')).toBe(18)
    expect(numeroDeCodigo('NAC-09')).toBe(9)
    expect(numeroDeCodigo('Chiller QA')).toBeNull()
  })

  it('pide salida estructurada al modelo por defecto', () => {
    const c = cuerpoLectura({ imagenBase64: 'x', maquina: incubadora, variante: 'b' })
    expect(c.model).toBe('claude-opus-5-5')
    expect(c.output_config.format.type).toBe('json_schema')
    expect(c.messages[0].content[0].source.data).toBe('x')
  })
})
