/**
 * Error boundary por módulo: un fallo no tumba todo el workspace.
 * Resetea al cambiar de pestaña (`name`) para no arrastrar errores entre módulos.
 * Henry Stark Desarrollador
 */
import { Component } from 'react'

export default class ModuleBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null, name: props.name }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  static getDerivedStateFromProps(props, state) {
    if (props.name !== state.name) {
      return { error: null, name: props.name }
    }
    return null
  }

  componentDidCatch(error, info) {
    console.error('ModuleBoundary:', this.props.name || 'módulo', error, info)
  }

  render() {
    if (this.state.error) {
      return (
        <div className="card wide">
          <div className="card-head">
            <h2 style={{ margin: 0 }}>{this.props.name || 'Módulo'}</h2>
          </div>
          <p className="msg error" style={{ marginTop: 12 }}>
            Este panel tuvo un error y se aisló del resto de la app.
          </p>
          <p className="hint" style={{ wordBreak: 'break-word' }}>
            {String(this.state.error?.message || this.state.error)}
          </p>
          <div className="actions row" style={{ gap: 8, marginTop: 12 }}>
            <button
              type="button"
              className="primary"
              onClick={() => this.setState({ error: null })}
            >
              Reintentar
            </button>
            <button type="button" className="ghost" onClick={() => window.location.reload()}>
              Recargar app
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
