/**
 * Bloque que se abre a pedido (07-10-2026). Lo de adentro no se monta hasta abrirlo:
 * así no carga sus consultas si nadie lo mira. Recuerda en este equipo si quedó abierto.
 */
import { useState } from 'react'
import './Desplegable.css'

const leer = (k) => {
  try {
    return localStorage.getItem(k) === '1'
  } catch {
    return false
  }
}

export default function Desplegable({ titulo, sub, storageKey, children }) {
  const [abierto, setAbierto] = useState(() => (storageKey ? leer(storageKey) : false))
  const cambiar = () => {
    const v = !abierto
    setAbierto(v)
    try {
      if (storageKey) localStorage.setItem(storageKey, v ? '1' : '0')
    } catch {
      /* sin almacenamiento: solo esta vez */
    }
  }
  return (
    <section className="despl">
      <button type="button" className="despl-head" aria-expanded={abierto} onClick={cambiar}>
        <span className="despl-txt">
          <b>{titulo}</b>
          {sub && <small>{sub}</small>}
        </span>
        <span className="despl-flecha" aria-hidden="true">
          {abierto ? '▴' : '▾'}
        </span>
      </button>
      {abierto && <div className="despl-cuerpo">{children}</div>}
    </section>
  )
}
