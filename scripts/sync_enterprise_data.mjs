import fs from 'node:fs'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'
import XLSX from 'xlsx'
import plansByMachine from '../src/data/mantumMaintenancePlans.json' with { type: 'json' }

const ROOT = process.cwd()
const ORG_ID = process.env.INCUBAPP_ORG_ID
const DRY_RUN = process.argv.includes('--dry-run')
const GENERATE_OTS = process.argv.includes('--generate-ots')
const REGULARIZE = process.argv.includes('--regularize')
const REGULARIZE_FROM = process.env.MAINTENANCE_FROM || '2026-05-01'
const UNTIL = process.env.MAINTENANCE_UNTIL || new Date().toISOString().slice(0, 10)
const PRODUCTION_ROOT = path.join(ROOT, 'PRODUCCION Y PROYECCION INCUBANT')

function requiredEnv(name) {
    const value = process.env[name]
    if (!value) throw new Error(`Falta la variable ${name}`)
    return value
}

function normalize(value) {
    return String(value || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toUpperCase()
        .replace(/[^A-Z0-9]+/g, ' ')
        .trim()
}

function frequencyDays(value) {
    const text = normalize(value)
    const explicit = text.match(/(?:CADA|CADA\s+)(\d+)\s*DIA/)
    if (explicit) return Number(explicit[1])
    if (text.includes('DIARIA') || text.includes('DIARIO')) return 1
    if (text.includes('SEMANAL')) return 7
    if (text.includes('QUINCENAL')) return 15
    if (text.includes('MENSUAL')) return 30
    if (text.includes('BIMESTRAL')) return 60
    if (text.includes('TRIMESTRAL')) return 90
    if (text.includes('SEMESTRAL')) return 182
    if (text.includes('ANUAL')) return 365
    return null
}

function listXlsx(root) {
    if (!fs.existsSync(root)) return []
    const files = []
    for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
        const fullPath = path.join(root, entry.name)
        if (entry.isDirectory()) files.push(...listXlsx(fullPath))
        else if (entry.isFile() && fullPath.toLowerCase().endsWith('.xlsx')) files.push(fullPath)
    }
    return files
}

function sourcePath(filePath) {
    return path.relative(ROOT, filePath).replaceAll('\\', '/')
}

function workbookSnapshots(filePath) {
    const workbook = XLSX.readFile(filePath, { cellDates: false })
    const output = []
    for (const sheetName of workbook.SheetNames) {
        const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, defval: null })
        for (let index = 0; index < rows.length; index += 1) {
            const row = rows[index]
            if (!row.some((value) => value !== null && value !== '')) continue
            const payload = Object.fromEntries(row.map((value, column) => [`c${column + 1}`, value]).filter(([, value]) => value !== null && value !== ''))
            output.push({
                source: 'production',
                source_path: sourcePath(filePath),
                sheet_name: sheetName,
                row_number: index + 1,
                period: /20\d{2}/.exec(sourcePath(filePath))?.[0] || null,
                payload,
            })
        }
    }
    return output
}

function buildPlanRows(machines) {
    const machineMap = new Map()
    for (const machine of machines) {
        for (const code of [machine.code, machine.mantum_code]) {
            if (code) machineMap.set(normalize(code), machine)
        }
    }
    const rows = []
    for (const [machineCode, tasks] of Object.entries(plansByMachine)) {
        const machine = machineMap.get(normalize(machineCode))
        for (const task of tasks || []) {
            if (task.auto_ot_eligible === false || task.status === 'Inactiva') continue
            const days = frequencyDays(task.frequency)
            rows.push({
                org_id: ORG_ID,
                machine_id: machine?.id || null,
                machine_code: machine?.code || machineCode,
                source_key: `MANTUM-PLAN-${task.plan_code}`,
                activity: task.activity || 'Mantenimiento preventivo',
                activity_description: `Tarea Mantum ${task.plan_code} · Frecuencia: ${task.frequency || 'Sin frecuencia'}`,
                maintenance_type: normalize(task.type).includes('CORRECT') ? 'corrective' : 'preventive',
                frequency_text: task.frequency || null,
                frequency_days: days,
                specialty: task.specialty || null,
                source: 'mantum',
                active: true,
                next_due_date: new Date().toISOString().slice(0, 10),
                source_payload: task,
            })
        }
    }
    return rows
}

async function main() {
    if (DRY_RUN && !process.env.SUPABASE_URL) {
        const plans = buildPlanRows([])
        const snapshots = listXlsx(PRODUCTION_ROOT).flatMap(workbookSnapshots)
        console.log(JSON.stringify({
            planTasks: plans.length,
            productionWorkbooks: listXlsx(PRODUCTION_ROOT).length,
            productionRows: snapshots.length,
            generateOts: GENERATE_OTS,
            regularize: REGULARIZE,
            from: REGULARIZE_FROM,
            until: UNTIL,
            dryRun: true,
            note: 'Simulación local: no valida tenant, duplicados ni inserta datos.',
        }, null, 2))
        return
    }

    const supabase = createClient(requiredEnv('SUPABASE_URL'), requiredEnv('SUPABASE_SERVICE_ROLE_KEY'), {
        auth: { persistSession: false, autoRefreshToken: false },
    })
    requiredEnv('INCUBAPP_ORG_ID')

    const { data: machines, error: machinesError } = await supabase
        .from('machines')
        .select('id, code, mantum_code, plant_id, room_id, plants!inner(org_id)')
        .eq('plants.org_id', ORG_ID)
    if (machinesError) throw machinesError

    const plans = buildPlanRows(machines || [])
    for (let index = 0; index < plans.length; index += 100) {
        const { error } = await supabase
            .from('maintenance_plan_tasks')
            .upsert(plans.slice(index, index + 100), { onConflict: 'org_id,source_key' })
        if (error) throw error
    }

    const snapshots = listXlsx(PRODUCTION_ROOT).flatMap(workbookSnapshots).map((row) => ({ ...row, org_id: ORG_ID }))
    for (let index = 0; index < snapshots.length; index += 100) {
        const { error } = await supabase
            .from('enterprise_data_snapshots')
            .upsert(snapshots.slice(index, index + 100), { onConflict: 'org_id,source_path,sheet_name,row_number' })
        if (error) throw error
    }

    let generated = 0
    if (GENERATE_OTS) {
        const { data, error } = await supabase.rpc('generate_maintenance_work_orders', {
            p_org_id: ORG_ID,
            p_until: UNTIL,
        })
        if (error) throw error
        generated = Number(data || 0)
    }

    let regularized = 0
    if (REGULARIZE) {
        const { data, error } = await supabase.rpc('regularize_maintenance_work_orders', {
            p_org_id: ORG_ID,
            p_from: REGULARIZE_FROM,
            p_until: UNTIL,
        })
        if (error) throw error
        regularized = Number(data || 0)
    }

    console.log(JSON.stringify({
        planTasks: plans.length,
        productionWorkbooks: listXlsx(PRODUCTION_ROOT).length,
        productionRows: snapshots.length,
        generatedWorkOrders: generated,
        regularizedWorkOrders: regularized,
        from: REGULARIZE_FROM,
        until: UNTIL,
    }, null, 2))
}

main().catch((error) => {
    console.error(error.message || error)
    process.exitCode = 1
})
