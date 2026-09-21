/**
 * =============================================================================
 * ARCHIVO: src/components/ErrorBoundary.jsx
 * PROPÓSITO: Componente UI «ErrorBoundary»: pantalla o widget de la interfaz operativa de IncubApp. Se renderiza cuando el usuario tiene permiso de módulo o pestaña correspondiente.
 * CÓMO FUNCIONA: Recibe props (orgId, userId, role, etc.), usa hooks y renderiza JSX. Los eventos del usuario llaman a mutaciones o navegación hacia otros módulos.
 * Cada bloque relevante de este archivo está orientado a la operación multi-módulo
 * de incubación / granja / gerencia en IncubApp.
 * Documentado y mantenido por: Henry Stark Desarrollador
 * =============================================================================
 */

import { Component } from 'react'

/**
 * Barrera de errores: si algún componente falla en runtime,
 * muestra un mensaje claro con opción de recargar en lugar de
 * dejar la pantalla en negro.
 */
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    console.error('ErrorBoundary:', error, info)
  }

  render() {
    if (!this.state.error) return this.props.children

    return (
      <main className="shell">
        <div className="card auth-card pending-card">
          <div className="pending-icon" aria-hidden="true">⚠️</div>
          <h1>Algo salió mal</h1>
          <p className="brand-sub" style={{ textAlign: 'center' }}>
            Ocurrió un error inesperado en la aplicación. Recarga para continuar —
            tus datos están seguros en el servidor.
          </p>
          <p className="hint" style={{ textAlign: 'center', wordBreak: 'break-word' }}>
            {String(this.state.error?.message ?? this.state.error)}
          </p>
          <button className="primary" onClick={() => window.location.reload()}>
            Recargar la aplicación
          </button>
        </div>
      </main>
    )
  }
}
