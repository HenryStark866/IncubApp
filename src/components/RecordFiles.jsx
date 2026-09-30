/**
 * Piezas compartidas de los registros con evidencia (SST, ambiental):
 * - FilesPicker: elegir o tomar fotos (y PDF si se permite), con chips para quitar.
 * - FileLinks: botones que abren cada foto o PDF guardado con URL firmada.
 * Henry Stark Desarrollador
 */
import { useState } from 'react'
import { openOrgFile } from '../lib/orgFiles'

export function FilesPicker({ label, files, onChange, max = 6, pdf = false, capture = true }) {
  return (
    <>
      <label style={{ marginTop: 8 }}>
        {label}
        <input
          type="file"
          accept={pdf ? 'image/*,application/pdf' : 'image/*'}
          capture={capture && !pdf ? 'environment' : undefined}
          multiple={max > 1}
          onChange={(e) => {
            const picked = Array.from(e.target.files || [])
            onChange([...files, ...picked].slice(0, max))
            e.target.value = ''
          }}
        />
      </label>
      {files.length > 0 && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 6 }}>
          {files.map((f, i) => (
            <button
              key={`${f.name}-${i}`}
              type="button"
              className="chip ghost"
              title="Quitar"
              onClick={() => onChange(files.filter((_, idx) => idx !== i))}
            >
              {/pdf/i.test(f.type || f.name) ? '📄' : '📷'} {f.name ? f.name.slice(0, 24) : `Archivo ${i + 1}`} ✕
            </button>
          ))}
        </div>
      )}
    </>
  )
}

export function FileLinks({ paths = [], label = 'Foto' }) {
  const [err, setErr] = useState(null)
  const list = (paths || []).filter(Boolean)
  if (!list.length) return null
  return (
    <span style={{ display: 'inline-flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
      {list.map((p, i) => (
        <button
          key={p}
          type="button"
          className="chip ghost small"
          onClick={async () => {
            const r = await openOrgFile(p)
            setErr(r.error)
          }}
        >
          {/\.pdf$/i.test(p) ? '📄' : '📷'} {list.length > 1 ? `${label} ${i + 1}` : label}
        </button>
      ))}
      {err && <span className="hint">{err}</span>}
    </span>
  )
}
