/** Reportes e informes (operario de recepción) — en construcción con su formato. */
import { RxHeader, RxPending } from './ReceptionScaffold'

export default function ReceptionReportsPanel({ onNavigate }) {
  return (
    <div className="module-panel rx-panel">
      <RxHeader
        icon="📊"
        title="Reportes e informes de recepción"
        hint="Consolidado de entradas de huevo fértil, balance por granja y estadísticas de mermas y roturas."
      />
      <RxPending
        onNavigate={onNavigate}
        functions={[
          'Totales del día, la semana y el mes: huevos recibidos, incubables y descartados.',
          'Balance por granja de origen y por lote, con el porcentaje de aprovechamiento.',
          'Tendencia de fisurados, sucios y deformes.',
          'Exportar a Excel.',
        ]}
        fields={['Granja', 'Lote', 'Total recibido', 'Incubable', 'Fisurado', 'Sucio / deforme', '% de aprovechamiento']}
        links={[
          { tab: 'recepcion', label: 'Recepción / cuarto frío' },
          { tab: 'historial', label: 'Mi historial' },
        ]}
      />
    </div>
  )
}
