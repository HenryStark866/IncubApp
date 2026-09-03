/**
 * =============================================================================
 * ARCHIVO: src/components/CustomModuleView.jsx
 * PROPÓSITO: Componente UI «CustomModuleView»: pantalla o widget de la interfaz operativa de IncubApp. Se renderiza cuando el usuario tiene permiso de módulo o pestaña correspondiente.
 * CÓMO FUNCIONA: Recibe props (orgId, userId, role, etc.), usa hooks y renderiza JSX. Los eventos del usuario llaman a mutaciones o navegación hacia otros módulos.
 * Cada bloque relevante de este archivo está orientado a la operación multi-módulo
 * de incubación / granja / gerencia en IncubApp.
 * Documentado y mantenido por: Henry Stark Desarrollador
 * =============================================================================
 */

/**
 * Renderiza una pestaña personalizada creada en Diseño.
 * Los bloques son datos (no código): título, texto, lista, enlace, separador.
 */
const isSafeUrl = (u) => /^https?:\/\//i.test(u || '')

export default function CustomModuleView({ module }) {
  const blocks = Array.isArray(module.blocks) ? module.blocks : []
  return (
    <div className="card wide">
      <div className="card-head">
        <h2>{module.icon ? `${module.icon} ` : ''}{module.title}</h2>
      </div>
      {blocks.length === 0 && (
        <p className="hint">Este módulo aún no tiene contenido. El desarrollador lo está construyendo en Diseño.</p>
      )}
      {blocks.map((b, i) => {
        if (b.type === 'titulo') return <p key={i} className="component-title" style={{ marginTop: 14 }}>{b.text}</p>
        if (b.type === 'texto') return <p key={i} style={{ whiteSpace: 'pre-wrap', margin: '6px 0' }}>{b.text}</p>
        if (b.type === 'lista') {
          const items = (b.items ?? []).filter(Boolean)
          return (
            <ul key={i} style={{ margin: '6px 0 10px', paddingLeft: 22 }}>
              {items.map((it, j) => <li key={j} style={{ margin: '3px 0' }}>{it}</li>)}
            </ul>
          )
        }
        if (b.type === 'enlace') {
          if (!isSafeUrl(b.url)) return null
          return (
            <p key={i} style={{ margin: '6px 0' }}>
              <a href={b.url} target="_blank" rel="noreferrer">🔗 {b.label || b.url}</a>
            </p>
          )
        }
        if (b.type === 'separador') return <hr key={i} style={{ border: 'none', borderTop: '1px solid var(--line)', margin: '14px 0' }} />
        return null
      })}
    </div>
  )
}
