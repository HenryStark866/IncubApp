/** Solicitudes (operario de recepción) — en construcción con su formato. */
import { RxHeader, RxPending } from './ReceptionScaffold'

export default function ReceptionRequestsPanel({ onNavigate }) {
  return (
    <div className="module-panel rx-panel">
      <RxHeader
        icon="📝"
        title="Solicitudes y novedades de recepción"
        hint="Pedido de insumos (bandejas, separadores, papel), dotación y EPP, daños de equipos y novedades de personal."
      />
      <RxPending
        onNavigate={onNavigate}
        functions={[
          'Pedir insumos: bandejas plásticas, separadores, carros y papel.',
          'Pedir EPP y dotación de bioseguridad.',
          'Reportar daños de equipos (ovoscopio, balanza, cortina) a mantenimiento.',
          'Registrar permisos y novedades de personal, y ver en qué va cada solicitud.',
        ]}
        fields={['Tipo de solicitud', 'Cantidad y unidad', 'Prioridad', 'Detalle y justificación', 'Estado']}
        links={[
          { tab: 'horarios', label: 'Mi horario' },
          { tab: 'asistencia', label: 'Asistencia' },
        ]}
      />
    </div>
  )
}
