/**
 * Piezas de formulario compartidas por los inicios de planta y de mantenimiento.
 * Estilos en ShiftForms.css (prefijo sf-).
 * Henry Stark Desarrollador · CDH Maker
 */
import { useEffect, useMemo, useRef } from 'react'
import { Icon } from './shiftIcons'

/**
 * Fotos y documentos adjuntos: miniaturas con «quitar» y un botón que abre la
 * cámara o el selector de archivos.
 */
export function EvidencePicker({
  files,
  onChange,
  accept = 'image/*,application/pdf,.doc,.docx,.xls,.xlsx',
  capture,
  multiple = true,
  addLabel = 'Foto o archivo',
  hint = 'Las fotos y documentos quedan adjuntos a la OT y salen en su formato.',
}) {
  const input = useRef(null)
  const previews = useMemo(() => files.map((f) => (f.type?.startsWith('image/') ? URL.createObjectURL(f) : null)), [files])
  useEffect(() => () => previews.forEach((u) => u && URL.revokeObjectURL(u)), [previews])
  const canAdd = multiple || files.length === 0
  return (
    <div className="sf-evidence">
      <div className="sf-thumbs">
        {files.map((f, i) => (
          <figure key={`${f.name}-${i}`} className="sf-thumb">
            {previews[i] ? <img src={previews[i]} alt={f.name} /> : <span className="sf-thumb-doc">{Icon.doc(26)}</span>}
            <figcaption>{f.name}</figcaption>
            <button type="button" aria-label={`Quitar ${f.name}`} onClick={() => onChange(files.filter((_, j) => j !== i))}>×</button>
          </figure>
        ))}
        {canAdd && (
          <button type="button" className="sf-thumb sf-thumb-add" onClick={() => input.current?.click()}>
            {Icon.camera(26)}
            <span>{addLabel}</span>
          </button>
        )}
      </div>
      <input
        ref={input}
        type="file"
        accept={accept}
        capture={capture}
        multiple={multiple}
        hidden
        onChange={(e) => {
          const picked = [...(e.target.files || [])]
          if (picked.length) onChange(multiple ? [...files, ...picked] : picked.slice(0, 1))
          e.target.value = ''
        }}
      />
      {hint ? <p className="sf-hint">{hint}</p> : null}
    </div>
  )
}

/** Botones de una sola opción (p. ej. Completa / Parcial). */
export function Segmented({ options, value, onChange, label }) {
  return (
    <div className="sf-seg" role="group" aria-label={label} style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
      {options.map((o) => (
        <button key={o.value} type="button" aria-pressed={value === o.value} className={`sf-seg-${o.tone || 'ok'}`} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  )
}
