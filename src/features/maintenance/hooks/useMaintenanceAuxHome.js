/**
 * Datos del inicio del auxiliar de mantenimiento: el Plan AM de la semana (con
 * lo ya cumplido), lo que cerró en su turno, las OT que tiene asignadas, y el
 * guardado de un trabajo como OT cerrada con sus fotos (FOMAT01 / FOMAT04).
 * Sin conexión, la OT y las fotos quedan en la cola y suben al volver la red.
 * Henry Stark Desarrollador
 */
import { useCallback, useMemo, useState } from 'react'
import { supabase } from '../../../lib/supabase'
import { isOnline } from '../../../lib/network'
import { EVIDENCE_BUCKET, saveWorkOrderWithEvidence } from '../../../lib/workOrderSave'
import { computePlanCompliance, knownKeysOf } from '../../../lib/planCompliance'
import { openEvidenceFormat, workOrderRecordItem } from '../../../lib/sigRecordDocuments'
import annualPlan from '../../../data/annualMaintenancePlanData.json'
import { useMaintenanceRecords } from './useMaintenanceRecords'
import { buildFindingOrderRow, ordersInShift, shiftWindowAt } from '../lib/maintenanceShift'

export function useMaintenanceAuxHome({ orgId, userId, userName }) {
  const rec = useMaintenanceRecords(orgId)
  const [now, setNow] = useState(() => new Date())
  const [saving, setSaving] = useState(false)
  // OT guardadas en esta sesión que aún no llegan en la recarga (o quedaron en la cola).
  const [localDone, setLocalDone] = useState([])

  const reload = useCallback(() => {
    setNow(new Date())
    rec.reload()
  }, [rec])

  const machines = useMemo(() => rec.data?.machines || [], [rec.data])
  const plants = useMemo(() => rec.data?.plants || [], [rec.data])
  const workOrders = useMemo(() => {
    const ids = new Set((rec.data?.workOrders || []).map((o) => o.id))
    return [...localDone.filter((o) => !ids.has(o.id)), ...(rec.data?.workOrders || [])]
  }, [rec.data, localDone])

  const compliance = useMemo(() => {
    if (!rec.data) return null
    const records = [...rec.records]
    // Lo guardado recién cuenta de una vez en el plan.
    for (const o of localDone) {
      records.push({
        id: `wo-${o.id}`,
        kind: 'ot',
        date: new Date(o.completed_at),
        keys: new Set(),
        text: [o.title, o.description].join(' · '),
        planCode: String(o.maintenance_plan_code || '').toUpperCase() || null,
        closed: true,
      })
    }
    return computePlanCompliance({ tasks: annualPlan.tasks || [], records, knownKeys: knownKeysOf(machines), now })
  }, [rec.data, rec.records, localDone, machines, now])

  const shift = useMemo(() => shiftWindowAt(now), [now])
  const myShiftOrders = useMemo(() => ordersInShift(workOrders, userId, shift), [workOrders, userId, shift])
  const assigned = useMemo(
    () =>
      workOrders
        .filter((o) => o.status === 'open' || o.status === 'in_progress')
        .filter((o) => o.assigned_to === userId || (o.status === 'open' && !o.assigned_to))
        .sort((a, b) => Number(b.assigned_to === userId) - Number(a.assigned_to === userId) || String(b.created_at).localeCompare(String(a.created_at))),
    [workOrders, userId]
  )

  const machineById = useMemo(() => Object.fromEntries(machines.map((m) => [m.id, m])), [machines])

  /** Abre el formato de la OT con sus evidencias (fotos con enlace firmado). */
  const openOrderFormat = useCallback(
    async (order) => {
      let files = []
      if (isOnline()) {
        const { data } = await supabase
          .from('wo_evidence')
          .select('id, file_path, file_name, file_type, note, uploaded_by, created_at')
          .eq('work_order_id', order.id)
          .order('created_at')
        files = await Promise.all(
          (data || []).map(async (f) => {
            const { data: signed } = await supabase.storage.from(EVIDENCE_BUCKET).createSignedUrl(f.file_path, 3600)
            return { ...f, url: signed?.signedUrl || null, uploadedByName: rec.data?.people?.[f.uploaded_by]?.name || null }
          })
        )
      }
      const people = rec.data?.people || {}
      openEvidenceFormat(
        workOrderRecordItem({
          order,
          files,
          machine: machineById[order.machine_id] || null,
          createdBy: people[order.created_by]?.name || null,
          assignedTo: people[order.assigned_to]?.name || order.technician_name || userName || null,
        })
      )
    },
    [machineById, rec.data, userName]
  )

  /**
   * Guarda el trabajo: la OT cerrada, sus fotos/documentos y, si algo quedó No OK
   * y así se pidió, la OT correctiva del hallazgo.
   * @returns {Promise<{ error: string|null, order?: object, offline?: boolean, finding?: boolean, warnings?: string[] }>}
   */
  const saveWork = useCallback(
    async ({ row, files = [], openFinding = false }) => {
      if (!orgId || !userId) return { error: 'Sesión inválida' }
      setSaving(true)
      try {
        const finding = openFinding ? buildFindingOrderRow({ parent: row, checklist: row.checklist || [], orgId, userId }) : null
        const res = await saveWorkOrderWithEvidence({ orgId, userId, order: row, files, extraOrders: finding ? [finding] : [] })
        if (res.error) return res
        setLocalDone((l) => [res.order, ...l])
        if (!res.offline) rec.reload()
        return { ...res, finding: !!finding }
      } finally {
        setSaving(false)
      }
    },
    [orgId, userId, rec]
  )

  return {
    loading: rec.loading,
    warnings: rec.data?.warnings || [],
    now,
    shift,
    machines,
    plants,
    compliance,
    myShiftOrders,
    assigned,
    machineById,
    openOrderFormat,
    saveWork,
    saving,
    reload,
  }
}
