/**
 * Distintivo «En desarrollo» para módulos incompletos (06-10-2026). Avisa que la pantalla
 * todavía no está terminada: se puede usar, pero puede cambiar o faltarle partes.
 * Uso: <EnDesarrollo /> junto al título, o <EnDesarrollo bloque detalle="…" /> como aviso.
 */
import './EnDesarrollo.css'

export default function EnDesarrollo({ bloque = false, detalle = '' }) {
  if (bloque) {
    return (
      <div className="en-desarrollo-bloque" role="note">
        <span className="en-desarrollo" aria-hidden="true">
          🚧 En desarrollo
        </span>
        <span>{detalle || 'Este módulo aún no está terminado: puede cambiar o faltarle funciones.'}</span>
      </div>
    )
  }
  return (
    <span className="en-desarrollo" title="Módulo en desarrollo: puede cambiar o estar incompleto">
      🚧 En desarrollo
    </span>
  )
}
