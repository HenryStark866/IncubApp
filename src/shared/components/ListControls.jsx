/**
 * =============================================================================
 * ARCHIVO: src/components/ListControls.jsx
 * PROPÓSITO: Componente UI «ListControls»: pantalla o widget de la interfaz operativa de IncubApp. Se renderiza cuando el usuario tiene permiso de módulo o pestaña correspondiente.
 * CÓMO FUNCIONA: Recibe props (orgId, userId, role, etc.), usa hooks y renderiza JSX. Los eventos del usuario llaman a mutaciones o navegación hacia otros módulos.
 * Cada bloque relevante de este archivo está orientado a la operación multi-módulo
 * de incubación / granja / gerencia en IncubApp.
 * Documentado y mantenido por: Henry Stark Desarrollador
 * =============================================================================
 */

import { useState } from 'react'

/**
 * Buscador + tamaño de página + paginación, reutilizable en todos los dashboards.
 *
 * Uso:
 *   const lc = useListControls(items, (item, q) => item.name.toLowerCase().includes(q))
 *   <ListControls lc={lc} placeholder="Buscar máquina…" />
 *   lc.visible.map(...)
 */
export function useListControls(items, matcher, defaultPerPage = 10) {
  const [query, setQuery] = useState('')
  const [perPage, setPerPage] = useState(defaultPerPage)
  const [page, setPage] = useState(1)

  const q = query.trim().toLowerCase()
  const filtered = q ? items.filter((it) => matcher(it, q)) : items

  const totalPages = Math.max(1, Math.ceil(filtered.length / perPage))
  const safePage = Math.min(page, totalPages)
  const visible = filtered.slice((safePage - 1) * perPage, safePage * perPage)

  return {
    query,
    setQuery: (v) => {
      setQuery(v)
      setPage(1)
    },
    perPage,
    setPerPage: (n) => {
      setPerPage(n)
      setPage(1)
    },
    page: safePage,
    setPage,
    totalPages,
    total: filtered.length,
    visible,
  }
}

export default function ListControls({ lc, placeholder = 'Buscar…' }) {
  return (
    <div className="list-controls">
      <input
        type="search"
        className="list-search"
        value={lc.query}
        onChange={(e) => lc.setQuery(e.target.value)}
        placeholder={placeholder}
        aria-label="Buscar en la lista"
      />
      <select
        className="list-perpage"
        value={lc.perPage}
        onChange={(e) => lc.setPerPage(Number(e.target.value))}
        title="Elementos por página"
        aria-label="Elementos por página"
      >
        {[5, 10, 25, 50].map((n) => (
          <option key={n} value={n}>{n} por pág.</option>
        ))}
      </select>
      <span className="list-pager">
        <button
          className="ghost"
          onClick={() => lc.setPage(lc.page - 1)}
          disabled={lc.page <= 1}
          aria-label="Página anterior"
        >
          ‹
        </button>
        <span className="list-pageinfo">
          {lc.total === 0 ? '0' : `${lc.page} / ${lc.totalPages}`}
          <em> · {lc.total} resultado{lc.total === 1 ? '' : 's'}</em>
        </span>
        <button
          className="ghost"
          onClick={() => lc.setPage(lc.page + 1)}
          disabled={lc.page >= lc.totalPages}
          aria-label="Página siguiente"
        >
          ›
        </button>
      </span>
    </div>
  )
}
