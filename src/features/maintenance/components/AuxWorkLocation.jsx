/**
 * Inicio del auxiliar de mantenimiento: su sede asignada y «¿dónde estoy trabajando?».
 * Lo que reporta lo ve su jefe al instante en «Equipo y sedes». 12-10-2026.
 */
import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../../lib/supabase'
import { reportLocation, currentStatusByUser } from '../../../lib/teamLocations'
import WorkLocationReporter from './WorkLocationReporter'
import './MaintenanceTeamPanel.css'

export default function AuxWorkLocation({ orgId, userId, siteId = null, myOrders = [], onNavigate }) {
  const [plants, setPlants] = useState([])
  const [last, setLast] = useState(null)
  const [missing, setMissing] = useState(false)

  const load = useCallback(async () => {
    if (!orgId || !userId) return
    const [p, l] = await Promise.all([
      supabase.from('plants').select('id, name, code').eq('org_id', orgId).order('name'),
      supabase.from('team_locations').select('*').eq('org_id', orgId).eq('user_id', userId).order('reported_at', { ascending: false }).limit(1),
    ])
    const list = p.data || []
    setPlants(list)
    if (l.error) setMissing(true)
    else {
      const sites = Object.fromEntries(list.map((s) => [s.id, s]))
      setLast(currentStatusByUser({ locations: l.data || [], sitesById: sites }).get(userId) || null)
    }
  }, [orgId, userId])

  useEffect(() => {
    load()
  }, [load])

  if (missing) return null
  const site = plants.find((p) => p.id === siteId)
  return (
    <div className="mt-root">
      {site && <p className="mt-dim" style={{ margin: '0 0 8px' }}>Sede asignada por tu líder: <b>{site.name}</b></p>}
      <WorkLocationReporter
        plants={plants}
        myOrders={myOrders}
        defaultSiteId={siteId || ''}
        last={last}
        onNavigate={onNavigate}
        onReport={async (fields) => {
          const res = await reportLocation({ orgId, userId, ...fields })
          if (!res.error) load()
          return res
        }}
      />
    </div>
  )
}
