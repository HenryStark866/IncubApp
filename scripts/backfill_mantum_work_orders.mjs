import fs from 'node:fs'
import path from 'node:path'
import XLSX from 'xlsx'
import { createClient } from '@supabase/supabase-js'

const ROOT = process.cwd()
const CLOSED_FILE = path.join(ROOT, 'MANTENIMIENTO', 'generador', 'datos_mantum', 'ot_cerradas_historico_mantum.xlsx')
const BACKLOG_FILE = path.join(ROOT, 'MANTENIMIENTO', 'generador', 'datos_mantum', 'backlog_pendientes_mantum.xlsx')
const FROM_DATE = process.env.MANTUM_FROM_DATE || '2026-05-01'
const TO_DATE = process.env.MANTUM_TO_DATE || new Date().toISOString().slice(0, 10)
const DRY_RUN = process.argv.includes('--dry-run')
const ORG_ID = process.env.INCUBAPP_ORG_ID || (DRY_RUN ? 'dry-run' : null)

function requiredEnv(name) {
    const value = process.env[name]
    if (!value) throw new Error(`Falta la variable ${name}`)
    return value
}

function readRows(filePath, width) {
    const worksheet = XLSX.readFile(filePath, { cellDates: false }).Sheets['Hoja 1']
    const range = XLSX.utils.decode_range(worksheet['!ref'])
    const rows = []
    for (let row = 2; row <= range.e.r; row += 1) {
        const values = []
        for (let column = 0; column < width; column += 1) {
            const cell = worksheet[XLSX.utils.encode_cell({ r: row, c: column })]
            values.push(cell?.v == null ? null : String(cell.v).trim())
        }
        if (values.some(Boolean)) rows.push(values)
    }
    return rows
}

function isoDate(value, endOfDay = false) {
    if (!value) return null
    const text = String(value).trim().replace(' ', 'T')
    if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return `${text}T${endOfDay ? '23:59:59' : '00:00:00'}-05:00`
    const date = new Date(text.includes('-05:00') ? text : `${text}-05:00`)
    return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

function dateOnly(value) {
    return String(value || '').slice(0, 10)
}

function normalize(value) {
    return String(value || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toUpperCase()
        .replace(/[^A-Z0-9]+/g, ' ')
        .trim()
}

function parseCost(value) {
    if (!value) return null
    const normalized = String(value).replace(/\./g, '').replace(',', '.').replace(/[^0-9.-]/g, '')
    const number = Number(normalized)
    return Number.isFinite(number) ? number : null
}

function priority(value) {
    const text = normalize(value)
    if (text.startsWith('1') || text.includes('ALTA')) return 'high'
    if (text.startsWith('3') || text.includes('BAJA')) return 'low'
    return 'medium'
}

function workType(value) {
    return normalize(value).includes('CORRECT') ? 'corrective' : 'preventive'
}

function findMachine(entity, machines) {
    const target = normalize(entity).split(' | ')[0]
    if (!target) return null
    return machines.find((machine) => {
        const candidates = [machine.code, machine.mantum_code, machine.name].map(normalize).filter(Boolean)
        return candidates.some((candidate) => candidate === target || target.includes(candidate) || candidate.includes(target))
    }) || null
}

function inRange(date) {
    const day = dateOnly(date)
    return day >= FROM_DATE && day <= TO_DATE
}

function buildClosedOrders(machines) {
    return readRows(CLOSED_FILE, 13).flatMap((row) => {
        const [code, rawPriority, created, started, completed, entity, activity, description, feedback, maintenanceType, technician, cost, approver] = row
        const effectiveDate = completed || created
        if (!code || !inRange(effectiveDate)) return []
        const machine = findMachine(entity, machines)
        return [{
            org_id: ORG_ID,
            plant_id: machine?.plant_id || null,
            room_id: machine?.room_id || null,
            machine_id: machine?.id || null,
            title: activity || `OT Mantum ${code}`,
            description: [description, `Entidad Mantum: ${entity || 'Sin entidad'}`].filter(Boolean).join('\n'),
            type: workType(maintenanceType || activity),
            priority: priority(rawPriority),
            status: 'completed',
            source: 'mantum_historical',
            scheduled_for: isoDate(created),
            started_at: isoDate(started),
            completed_at: isoDate(completed || created, true),
            cost: parseCost(cost),
            resolution: feedback || null,
            technician_name: technician || null,
            approver_name: approver || null,
            auto_generated: false,
            maintenance_plan_code: `MANTUM-HIST-${code}`,
        }]
    })
}

function buildBacklogOrders(machines) {
    return readRows(BACKLOG_FILE, 5).flatMap((row) => {
        const [trigger, dueDate, activity, observations, processed] = row
        if (!dueDate || !activity || !inRange(dueDate) || normalize(processed) !== 'NO') return []
        const machine = findMachine(activity, machines)
        const key = `MANTUM-BACKLOG-${dateOnly(dueDate)}-${normalize(activity).slice(0, 80)}`
        return [{
            org_id: ORG_ID,
            plant_id: machine?.plant_id || null,
            room_id: machine?.room_id || null,
            machine_id: machine?.id || null,
            title: activity,
            description: [observations, `Disparo Mantum: ${trigger || 'Tiempo'}`].filter(Boolean).join('\n'),
            type: 'preventive',
            priority: 'medium',
            status: 'open',
            source: 'mantum_backlog',
            scheduled_for: isoDate(dueDate),
            auto_generated: true,
            maintenance_plan_code: key,
        }]
    })
}

async function main() {
    if (DRY_RUN && !process.env.SUPABASE_URL) {
        const candidates = [...buildClosedOrders([]), ...buildBacklogOrders([])]
        console.log(JSON.stringify({
            range: { from: FROM_DATE, to: TO_DATE },
            candidates: candidates.length,
            withoutMachineLink: candidates.length,
            dryRun: true,
            note: 'Simulación local sin Supabase: no valida duplicados ni cruza máquinas.',
        }, null, 2))
        return
    }
    const url = requiredEnv('SUPABASE_URL')
    const serviceRoleKey = requiredEnv('SUPABASE_SERVICE_ROLE_KEY')
    requiredEnv('INCUBAPP_ORG_ID')
    const supabase = createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } })

    const { data: machines, error: machinesError } = await supabase
        .from('machines')
        .select('id, code, name, mantum_code, plant_id, room_id')
        .eq('org_id', ORG_ID)
    if (machinesError) throw machinesError

    const candidates = [...buildClosedOrders(machines || []), ...buildBacklogOrders(machines || [])]
    const { data: existing, error: existingError } = await supabase
        .from('work_orders')
        .select('maintenance_plan_code')
        .eq('org_id', ORG_ID)
        .in('source', ['mantum_historical', 'mantum_backlog'])
    if (existingError) throw existingError

    const existingKeys = new Set((existing || []).map((row) => row.maintenance_plan_code).filter(Boolean))
    const pending = candidates.filter((row) => !existingKeys.has(row.maintenance_plan_code))
    const unlinked = pending.filter((row) => !row.machine_id).length
    console.log(JSON.stringify({
        range: { from: FROM_DATE, to: TO_DATE },
        candidates: candidates.length,
        alreadyLoaded: candidates.length - pending.length,
        toInsert: pending.length,
        withoutMachineLink: unlinked,
        dryRun: DRY_RUN,
    }, null, 2))

    if (DRY_RUN || !pending.length) return
    for (let index = 0; index < pending.length; index += 100) {
        const batch = pending.slice(index, index + 100)
        const { error } = await supabase.from('work_orders').insert(batch)
        if (error) throw error
        console.log(`Insertadas ${Math.min(index + batch.length, pending.length)} de ${pending.length}`)
    }
}

main().catch((error) => {
    console.error(error.message || error)
    process.exitCode = 1
})
