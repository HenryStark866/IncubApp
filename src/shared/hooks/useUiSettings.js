/**
 * =============================================================================
 * ARCHIVO: src/hooks/useUiSettings.js
 * PROPÓSITO: Hook «useUiSettings»: encapsula estado, carga de datos Supabase/Realtime y acciones reutilizables para los paneles que lo consumen.
 * CÓMO FUNCIONA: Exporta un hook React que, al montarse, consulta Supabase (y a veces Realtime), expone loading/error/datos y funciones mutadoras; el componente se re-renderiza al cambiar el estado.
 * Cada bloque relevante de este archivo está orientado a la operación multi-módulo
 * de incubación / granja / gerencia en IncubApp.
 * Documentado y mantenido por: Henry Stark Desarrollador
 * =============================================================================
 */

import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

/**
 * Apariencia de la interfaz por empresa (la edita el rol desarrollador en Diseño):
 * fuente, escala general y colores de acento, guardados en ui_settings.vars.
 * Se aplican como estilos globales; Realtime los refleja en todos los
 * dispositivos al instante.
 */

/** Export «UI_FONTS»: API pública de este módulo. Henry Stark Desarrollador */
export const UI_FONTS = [
  { value: '', label: 'Predeterminada del sistema' },
  { value: "'Segoe UI', system-ui, sans-serif", label: 'Segoe UI (moderna)' },
  { value: 'Arial, Helvetica, sans-serif', label: 'Arial (clásica)' },
  { value: 'Verdana, Geneva, sans-serif', label: 'Verdana (amplia)' },
  { value: 'Tahoma, Geneva, sans-serif', label: 'Tahoma (compacta)' },
  { value: 'Georgia, "Times New Roman", serif', label: 'Georgia (serif)' },
]

/** Export «UI_SCALES»: API pública de este módulo. Henry Stark Desarrollador */
export const UI_SCALES = [
  { value: '', label: 'Normal (100%)' },
  { value: '0.9', label: 'Compacta (90%)' },
  { value: '0.95', label: 'Ligera (95%)' },
  { value: '1.05', label: 'Amplia (105%)' },
  { value: '1.1', label: 'Grande (110%)' },
  { value: '1.15', label: 'Extra grande (115%)' },
]

/** Aplica (o limpia, con {}) las variables de apariencia en el documento. */
export function applyUiVars(vars) {
  const root = document.documentElement
  const body = document.body
  if (!body) return
  body.style.fontFamily = vars?.font || ''
  body.style.zoom = vars?.scale || ''
  if (vars?.accent) root.style.setProperty('--accent', vars.accent)
  else root.style.removeProperty('--accent')
  if (vars?.accentDim) root.style.setProperty('--accent-dim', vars.accentDim)
  else root.style.removeProperty('--accent-dim')
}

/** Export «useUiSettings»: API pública de este módulo. Henry Stark Desarrollador */
export function useUiSettings(orgId) {
  const [vars, setVars] = useState(null)

  useEffect(() => {
    if (!orgId) return
    let alive = true
    const load = async () => {
      const { data } = await supabase.from('ui_settings').select('vars').eq('org_id', orgId).maybeSingle()
      if (!alive) return
      const v = data?.vars ?? {}
      setVars(v)
      applyUiVars(v)
    }
    load()
    const ch = supabase
      .channel(`ui:${orgId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ui_settings', filter: `org_id=eq.${orgId}` }, () => load())
      .subscribe()
    return () => {
      alive = false
      supabase.removeChannel(ch)
      applyUiVars({}) // al salir de la org, volver a la apariencia base
    }
  }, [orgId])

  return vars
}
