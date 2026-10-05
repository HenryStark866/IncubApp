/** Auditoría de huevos (operario de recepción) — en construcción con su formato. */
import { RxHeader, RxPending } from './ReceptionScaffold'

export default function EggAuditPanel({ onNavigate }) {
  return (
    <div className="module-panel rx-panel">
      <RxHeader
        icon="🔍"
        title="Auditoría y control de calidad del huevo"
        hint="Muestreo técnico por lote: peso promedio, temperatura de cáscara, porcentaje de fisuras, suciedad y deformes."
      />
      <RxPending
        onNavigate={onNavigate}
        functions={[
          'Registrar una muestra por lote (90, 180 o 360 huevos).',
          'Calcular los porcentajes de fisurados, sucios y deformes.',
          'Calificar el lote y avisar al líder cuando pase los límites.',
          'Consultar el historial de auditorías por lote y por granja.',
        ]}
        fields={['Lote', 'Tamaño de la muestra', 'Peso promedio (g)', 'Temperatura de cáscara (°C)', 'Fisurados', 'Sucios', 'Deformes / micro', 'Calificación']}
        links={[
          { tab: 'recepcion', label: 'Recepción / cuarto frío' },
          { tab: 'clasificacion', label: 'Clasificación' },
        ]}
      />
    </div>
  )
}
