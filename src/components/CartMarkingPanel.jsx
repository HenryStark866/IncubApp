/**
 * Marcar carros (operario de recepción).
 * Identificación y marcación de carros con los datos del lote antes del cargue.
 */
import { RxHeader, RxPending } from './ReceptionScaffold'

export default function CartMarkingPanel({ onNavigate }) {
  return (
    <div className="module-panel rx-panel">
      <RxHeader
        icon="🏷️"
        title="Marcar carros"
        hint="Identificación visual de cada carro con la información del lote: número de carro, galpón, fecha de postura y máquina de destino. Garantiza la trazabilidad dentro de la incubadora."
      />
      <RxPending
        onNavigate={onNavigate}
        functions={[
          'Registrar la marcación de cada carro con sus datos de lote y destino.',
          'Asociar el número de carro con el galpón, lote y fecha de postura.',
          'Indicar la máquina INC o nacedora a la que va destinado el carro.',
          'Generar etiquetas o fichas de identificación para imprimir.',
          'Verificar que todos los carros estén marcados antes del cargue.',
          'Consultar historial de marcaciones por turno y por máquina.',
        ]}
        fields={[
          'Nº de carro',
          'Lote',
          'Galpón de origen',
          'Fecha de postura',
          'Nº de bandejas en el carro',
          'Máquina destino (INC / Nacedora)',
          'Posición en la máquina (fila/col)',
          'Operario que marca',
          'Turno',
          'Fecha y hora de marcación',
        ]}
        links={[
          { tab: 'clasificacion', label: 'Clasificación' },
          { tab: 'encintar', label: 'Encintar' },
          { tab: 'liquidar-cargues', label: 'Liquidar cargues' },
        ]}
      />
    </div>
  )
}
