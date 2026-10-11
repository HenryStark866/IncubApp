/**
 * Encintar (operario de recepción).
 * Registro del sellado/encintado de carros previo al cargue en incubadora.
 */
import { RxHeader, RxPending } from './ReceptionScaffold'

export default function TapingPanel({ onNavigate }) {
  return (
    <div className="module-panel rx-panel">
      <RxHeader
        icon="🎀"
        title="Encintar carros"
        hint="Sellado con cinta adhesiva de los carros de huevo para asegurar la identificación y trazabilidad del lote antes de ingresar a la incubadora."
      />
      <RxPending
        onNavigate={onNavigate}
        functions={[
          'Registrar los carros que fueron encintados por turno y por lote.',
          'Anotar el número de carro, lote, galpón y fecha de postura de cada carro encintado.',
          'Indicar el operario responsable del encintado.',
          'Generar la lista de carros encintados pendientes de cargue.',
          'Consultar el historial de encintado por turno y por máquina de destino.',
        ]}
        fields={[
          'Nº de carro',
          'Lote / Galpón',
          'Fecha de postura',
          'Cantidad de huevos en el carro',
          'Operario que encinta',
          'Turno (mañana / tarde / noche)',
          'Fecha y hora del encintado',
          'Máquina destino (INC / Nacedora)',
          'Observaciones',
        ]}
        links={[
          { tab: 'clasificacion', label: 'Clasificación' },
          { tab: 'liquidar-cargues', label: 'Liquidar cargues' },
        ]}
      />
    </div>
  )
}
