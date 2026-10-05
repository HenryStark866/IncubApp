/** Liquidar cargues (operario de recepción) — en construcción con su formato. */
import { RxHeader, RxPending } from './ReceptionScaffold'

export default function LoadLiquidationPanel({ onNavigate }) {
  return (
    <div className="module-panel rx-panel">
      <RxHeader
        icon="⚖️"
        title="Liquidación de cargues"
        hint="Cierre numérico de carros cargados, balance de bandejas útiles contra sobrantes y confirmación antes de entrar a la incubadora."
      />
      <RxPending
        onNavigate={onNavigate}
        functions={[
          'Ver las órdenes y carros listos para liquidar, por máquina y lote.',
          'Cerrar cada carro: bandejas útiles, sobrantes y total de huevos cargados.',
          'Cuadrar lo cargado contra la orden de cargue y lo clasificado.',
          'Confirmar la liquidación antes de que el carro entre a la incubadora.',
        ]}
        fields={['Orden de cargue', 'Máquina', 'Lote y edad', 'Carros llenos / programados', 'Bandejas útiles', 'Bandejas sobrantes', 'Total de huevos', 'Responsable']}
        links={[
          { tab: 'cargue', label: 'Órdenes de cargue' },
          { tab: 'clasificacion', label: 'Clasificación' },
        ]}
      />
    </div>
  )
}
