/**
 * Aceptación de Términos y Condiciones / Política de Privacidad (Habeas Data).
 * mode="gate": pregunta compacta y bloqueante ("¿aceptas?"); el texto completo
 *   permanece oculto y solo se abre al pulsar el título-enlace (como en el
 *   onboarding de cualquier SaaS actual).
 * mode="view": abre directo el lector completo (enlace "Términos y privacidad"
 *   del pie de página), navegable en cualquier momento.
 * Henry Stark Desarrollador · CDH Maker
 */
import { useState } from 'react'
import { supabase } from '../lib/supabase'
import {
  TERMS_SECTIONS,
  PRIVACY_SECTIONS,
  TERMS_VERSION,
  PRIVACY_VERSION,
} from '../legal/legalContent'

const DOCS = [
  { id: 'terms', label: 'Términos y Condiciones', sections: TERMS_SECTIONS },
  { id: 'privacy', label: 'Política de Privacidad', sections: PRIVACY_SECTIONS },
]

function DocsReader({ initialDoc, onBack, onClose }) {
  const [docId, setDocId] = useState(initialDoc)
  const active = DOCS.find((d) => d.id === docId)

  return (
    <div className="legal-card">
      <div className="legal-card-head">
        <div>
          <h2 style={{ margin: 0 }}>Términos y Condiciones · Política de Privacidad</h2>
        </div>
        <button type="button" className="ghost small" onClick={onBack ?? onClose}>
          {onBack ? '← Volver' : '✕'}
        </button>
      </div>

      <div className="tabs" role="tablist" style={{ margin: '10px 20px 0', flexWrap: 'wrap' }}>
        {DOCS.map((d) => (
          <button
            key={d.id}
            type="button"
            role="tab"
            className={docId === d.id ? 'tab active' : 'tab'}
            onClick={() => setDocId(d.id)}
          >
            {d.label}
          </button>
        ))}
      </div>

      <div className="legal-body">
        {active.sections.map((s) => (
          <div key={s.title}>
            <h4>{s.title}</h4>
            {s.paragraphs.map((p, i) => (
              <p key={i}>{p}</p>
            ))}
          </div>
        ))}
      </div>

      <div className="legal-foot">
        <p className="legal-version">
          Términos v{TERMS_VERSION} · Política de privacidad v{PRIVACY_VERSION}
        </p>
      </div>
    </div>
  )
}

export default function LegalDocsModal({ mode = 'view', onAccept, onClose, busy = false, error = null }) {
  const isGate = mode === 'gate'
  const [reading, setReading] = useState(isGate ? null : 'terms')
  const [checked, setChecked] = useState(false)
  const [err, setErr] = useState(null)

  const handleAccept = async () => {
    setErr(null)
    const res = await onAccept?.()
    if (res?.error) setErr(res.error)
  }

  // Lector de documento completo: se abre solo al pulsar el enlace del título.
  if (reading) {
    return (
      <div className={`legal-overlay${isGate ? '' : ' embedded'}`}>
        <DocsReader
          initialDoc={reading}
          onBack={isGate ? () => setReading(null) : null}
          onClose={onClose}
        />
      </div>
    )
  }

  if (!isGate) return null

  return (
    <div className="legal-overlay">
      <div className="legal-card legal-card-compact">
        <div className="legal-card-head">
          <div>
            <h2 style={{ margin: 0 }}>Antes de continuar</h2>
            <p className="hint" style={{ margin: '4px 0 0' }}>
              Para usar IncubApp debes aceptar estos documentos.
            </p>
          </div>
        </div>
        <div className="legal-foot" style={{ borderTop: 'none' }}>
          <label className="legal-consent-row">
            <input
              type="checkbox"
              checked={checked}
              onChange={(e) => setChecked(e.target.checked)}
            />
            <span>
              He leído y acepto los{' '}
              <button
                type="button"
                className="legal-inline-link"
                onClick={() => setReading('terms')}
              >
                Términos y Condiciones
              </button>{' '}
              y la{' '}
              <button
                type="button"
                className="legal-inline-link"
                onClick={() => setReading('privacy')}
              >
                Política de Privacidad
              </button>
              , incluida la autorización de geolocalización y captura de fotografía para
              asistencia, plano en tiempo real y logística.
            </span>
          </label>
          {(err || error) && (
            <p className="msg error">
              No pudimos guardar tu aceptación. {err || error} Puedes intentarlo nuevamente.
            </p>
          )}
          <div className="actions row" style={{ marginTop: 10 }}>
            <button
              type="button"
              className="primary"
              disabled={!checked || busy}
              onClick={handleAccept}
            >
              {busy ? 'Guardando…' : 'Aceptar y continuar'}
            </button>
            <button type="button" className="ghost" onClick={() => supabase.auth.signOut()}>
              Cerrar sesión
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
