/**
 * Datos del inicio del auxiliar de mantenimiento: el Plan AM de la semana (con
 * lo ya cumplido), lo que cerró en su turno, las OT que tiene asignadas, y el
 * guardado de un trabajo como OT cerrada con sus fotos (FOMAT01 / FOMAT04).
 * Sin conexión, la OT y las fotos quedan en la cola y suben al volver la red.
 * Henry Stark Desarrollador
 */
import { useCallback, useMemo, useState } from 'react'
import { supabase } from '../../../lib/supabase'
import { compressImage } from '../../../lib/image'
import { isNetworkError, isOnline } from '../../../lib/network'
import { enqueueInsert, enqueueStorageUpload } from '../../../lib/offlineQueue'
import { computePlanCompliance, knownKeysOf } from '../../../lib/planCompliance'
import { openEvidenceFormat, workOrderRecordItem } from '../../../lib/sigRecordDocuments'
import annualPlan from '../../../data/annualMaintenancePlanData.json'
import { useMaintenanceRecords } from './useMaintenanceRecords'
import {
  buildFindingOrderRow,
  insertDroppingMissingColumns,
  ordersInShift,
  pickColumns,
  shiftWindowAt,
} from '../lib/maintenanceShift'

const BUCKET = 'wo-evidence'

const newId = () =>
  typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0
        return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16)
      })

const safeName = (name) => String(name || 'archivo').replace(/[^a-zA-Z0-9._-]+/g, '_').slice(-80)

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
            const { data: signed } = await supabase.storage.from(BUCKET).createSignedUrl(f.file_path, 3600)
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
      const warnings = []
      const order = { ...row, id: row.id || newId() }
      const prepared = await Promise.all(files.map((f) => compressImage(f)))
      const evidenceRows = prepared.map((file, i) => ({
        file,
        path: `${orgId}/${order.id}/${Date.now()}-${i}-${safeName(file.name)}`,
        row: {
          org_id: orgId,
          work_order_id: order.id,
          uploaded_by: userId,
          file_name: file.name,
          file_type: file.type?.startsWith('image/') ? 'image' : 'document',
          note: `Evidencia de ${order.format_code || 'la OT'} · ${order.title}`,
        },
      }))
      const finding = openFinding ? buildFindingOrderRow({ parent: order, checklist: order.checklist || [], orgId, userId }) : null

      const queueAll = async () => {
        await enqueueInsert('work_orders', pickColumns(order))
        for (const ev of evidenceRows) {
          await enqueueStorageUpload(BUCKET, ev.path, ev.file, ev.file.type)
          await enqueueInsert('wo_evidence', { ...ev.row, file_path: ev.path })
        }
        if (finding) await enqueueInsert('work_orders', pickColumns(finding))
      }

      try {
        if (!isOnline()) {
          await queueAll()
          setLocalDone((l) => [order, ...l])
          return { error: null, order, offline: true, finding: !!finding }
        }
        const ins = await insertDroppingMissingColumns(supabase, 'work_orders', order)
        if (ins.error) {
          if (isNetworkError(ins.error)) {
            await queueAll()
            setLocalDone((l) => [order, ...l])
            return { error: null, order, offline: true, finding: !!finding }
          }
          return { error: ins.error }
        }
        for (const ev of evidenceRows) {
          const up = await supabase.storage.from(BUCKET).upload(ev.path, ev.file, { contentType: ev.file.type, upsert: false })
          if (up.error) {
            if (isNetworkError(up.error.message)) {
              await enqueueStorageUpload(BUCKET, ev.path, ev.file, ev.file.type)
              await enqueueInsert('wo_evidence', { ...ev.row, file_path: ev.path })
              warnings.push(`«${ev.file.name}» quedó en cola y sube al volver la red.`)
            } else warnings.push(`No se pudo subir «${ev.file.name}»: ${up.error.message}`)
            continue
          }
          const { error: evErr } = await supabase.from('wo_evidence').insert({ ...ev.row, file_path: ev.path })
          if (evErr) {
            await supabase.storage.from(BUCKET).remove([ev.path])
            warnings.push(`No se pudo anotar «${ev.file.name}»: ${evErr.message}`)
          }
        }
        if (finding) {
          const f = await insertDroppingMissingColumns(supabase, 'work_orders', finding)
          if (f.error) warnings.push(`No se pudo abrir la OT del hallazgo: ${f.error}`)
        }
        // El código de la OT lo pone la base.
        const { data: saved } = await supabase.from('work_orders').select('*').eq('id', order.id).maybeSingle()
        const full = saved || order
        setLocalDone((l) => [full, ...l])
        rec.reload()
        return { error: null, order: full, finding: !!finding, warnings }
      } catch (e) {
        if (isNetworkError(e?.message)) {
          await queueAll()
          setLocalDone((l) => [order, ...l])
          return { error: null, order, offline: true, finding: !!finding }
        }
        return { error: e?.message || String(e) }
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
