/**
 * Tablero de rotación de huevo (operario de recepción).
 * Muestra el estado de rotación de cada lote en cuarto frío:
 * fecha de ingreso, última rotación, próxima rotación y responsable.
 */
import { RxHeader, RxPending } from './ReceptionScaffold'

export default function EggRotationBoardPanel({ onNavigate }) {
  return (
    <div className="module-panel rx-panel">
      <RxHeader
        icon="🔄"
        title="Tablero de rotación de huevo"
        hint="Control y registro de la rotación de lotes en cuarto frío: mantiene la calidad del huevo fértil durante el almacenamiento."
      />
      <RxPending
        onNavigate={onNavigate}
        functions={[
          'Ver el tablero con todos los lotes activos en cuarto frío y su estado de rotación.',
          'Registrar cuándo se realizó la última rotación de cada lote (con responsable y hora).',
          'Alertar cuando un lote supera el tiempo máximo sin rotar (según los parámetros de calidad).',
          'Consultar el historial de rotaciones por lote y por turno.',
          'Calcular la próxima fecha/hora de rotación automáticamente.',
        ]}
        fields={[
          'Lote / Galpón',
          'Fecha de ingreso al cuarto frío',
          'Última rotación (fecha y hora)',
          'Responsable de la rotación',
          'Próxima rotación (calculada)',
          'Estado (OK / Vence pronto / Vencida)',
          'Observaciones',
        ]}
        links={[
          { tab: 'recepcion', label: 'Recepción / cuarto frío' },
          { tab: 'clasificacion', label: 'Clasificación' },
        ]}
      />
    </div>
  )
}
