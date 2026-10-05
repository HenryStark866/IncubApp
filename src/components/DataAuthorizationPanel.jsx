/** Autorizar datos (operario de recepción) — en construcción con su formato. */
import { RxHeader, RxPending } from './ReceptionScaffold'

export default function DataAuthorizationPanel({ onNavigate }) {
  return (
    <div className="module-panel rx-panel">
      <RxHeader
        icon="✅"
        title="Autorización y validación de datos"
        hint="Validación formal de diferencias entre la remisión de la granja y la recepción física, mermas y aprobaciones de ingreso."
      />
      <RxPending
        onNavigate={onNavigate}
        functions={[
          'Ver las diferencias entre lo enviado por la granja y lo recibido en planta.',
          'Registrar el motivo de cada diferencia (fisurados en transporte, conteo, etc.).',
          'Autorizar o devolver cada ajuste, con quién y cuándo lo autorizó.',
          'Aprobar cambios de cuarto frío y reubicaciones de lotes.',
        ]}
        fields={['Tipo de ajuste', 'Lote', 'Granja', 'Huevos enviados', 'Huevos recibidos', 'Diferencia', 'Motivo', 'Autoriza']}
        links={[{ tab: 'recepcion', label: 'Recepción / cuarto frío' }]}
      />
    </div>
  )
}
