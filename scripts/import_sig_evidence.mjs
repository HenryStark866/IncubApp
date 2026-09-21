import fs from 'node:fs'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'
import XLSX from 'xlsx'

const ROOT = process.cwd()
const ORG_ID = process.env.INCUBAPP_ORG_ID
const BUCKET = 'sig-evidence'
const SOURCE_ROOTS = [
    { source: 'mantum', dir: path.join(ROOT, 'MANTENIMIENTO', 'activos-mantum', 'imagenes-equipos') },
    { source: 'mantum', dir: path.join(ROOT, 'MANTENIMIENTO', 'activos-mantum', 'imagenes-instalaciones') },
    { source: 'mantum', dir: path.join(ROOT, 'MANTENIMIENTO', 'activos-mantum', 'manuales') },
    { source: 'sig', dir: path.join(ROOT, 'MANTENIMIENTO', 'SIG-MANTENIMIENTO', 'REGISTROS') },
]
const PLATE_FILE = path.join(ROOT, 'MANTENIMIENTO', 'SIG-MANTENIMIENTO', 'REGISTROS', '2026', 'FOMAT02', 'LEVANTAMIENTO en campo - datos de placa.xlsx')
const MANTUM_EQUIPMENT_FILE = path.join(ROOT, 'src', 'data', 'mantumEquipos.json')
const DRY_RUN = process.argv.includes('--dry-run')

function env(name) {
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

function relativeSourcePath(filePath) {
    return path.relative(ROOT, filePath).replaceAll('\\', '/')
}

function listFiles(root) {
    if (!fs.existsSync(root)) return []
    const output = []
    for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
        const fullPath = path.join(root, entry.name)
        if (entry.isDirectory()) output.push(...listFiles(fullPath))
        else if (entry.isFile()) output.push(fullPath)
    }
    return output
}

function mimeType(fileName) {
    const extension = path.extname(fileName).toLowerCase()
    return {
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.png': 'image/png',
        '.pdf': 'application/pdf',
        '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        '.doc': 'application/msword',
    }[extension] || 'application/octet-stream'
}

function formatCode(sourcePath) {
    const match = sourcePath.match(/FOMAT0[1-8]/i)
    return match ? match[0].toUpperCase() : null
}

function fileType(fileName) {
    return mimeType(fileName).startsWith('image/') ? 'image' : 'document'
}

function findMachineCode(sourcePath, machines) {
    const normalizedPath = normalize(sourcePath)
    return machines.find((machine) => {
        const codes = [machine.code, machine.mantum_code].filter(Boolean).map(normalize)
        return codes.some((code) => code && normalizedPath.includes(code))
    }) || null
}

function readPlateData() {
    if (!fs.existsSync(PLATE_FILE)) return []
    const worksheet = XLSX.readFile(PLATE_FILE, { cellDates: false }).Sheets['Levantamiento']
    if (!worksheet) return []
    const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: null }).slice(4)
    return rows.map((row) => ({
        code: row[0],
        name: row[1],
        serial_number: row[3],
        brand: row[4] || row[6],
        model: row[5] || row[7],
        installed_at: row[10],
        capacity_eggs: row[11],
        sig_notes: row[17],
    })).filter((row) => row.code)
}

function buildMetadata(filePath, stat) {
    const sourcePath = relativeSourcePath(filePath)
    return {
        source_path: sourcePath,
        original_folder: path.dirname(sourcePath),
        imported_at: new Date().toISOString(),
        local_modified_at: stat.mtime.toISOString(),
    }
}

async function updateMachineFacts(supabase, machines) {
    const plateData = readPlateData()
    const equipment = JSON.parse(fs.readFileSync(MANTUM_EQUIPMENT_FILE, 'utf8'))
    let updated = 0
    for (const machine of machines) {
        const key = [machine.code, machine.mantum_code].find((value) => value && equipment[value])
        const catalog = key ? equipment[key] : null
        const plate = plateData.find((row) => normalize(row.code) === normalize(machine.code) || normalize(row.code) === normalize(machine.mantum_code))
        if (!catalog && !plate) continue
        const patch = {
            mantum_code: machine.mantum_code || catalog?.mantum_code || plate?.code || machine.code,
            serial_number: machine.serial_number || plate?.serial_number || catalog?.serial_number || null,
            brand: machine.brand || plate?.brand || null,
            model: machine.model || plate?.model || null,
            installed_at: machine.installed_at || plate?.installed_at || null,
            capacity_eggs: machine.capacity_eggs || plate?.capacity_eggs || null,
            criticidad: machine.criticidad || catalog?.criticidad || 'Media',
            sig_notes: machine.sig_notes || plate?.sig_notes || catalog?.responsable || null,
        }
        const { error } = await supabase.from('machines').update(patch).eq('id', machine.id).eq('org_id', ORG_ID)
        if (error) throw error
        updated += 1
    }
    return updated
}

async function main() {
    if (!ORG_ID && !DRY_RUN) throw new Error('Falta INCUBAPP_ORG_ID')
    const files = SOURCE_ROOTS.flatMap(({ source, dir }) => listFiles(dir).map((filePath) => ({ source, filePath })))
    if (DRY_RUN) {
        const byExtension = Object.groupBy(files, ({ filePath }) => path.extname(filePath).toLowerCase() || 'sin-extension')
        console.log(JSON.stringify({ files: files.length, byExtension: Object.fromEntries(Object.entries(byExtension).map(([key, values]) => [key, values.length])), dryRun: true }, null, 2))
        return
    }

    const supabase = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false, autoRefreshToken: false } })
    const { data: machines, error: machinesError } = await supabase
        .from('machines')
        .select('id, org_id, code, name, mantum_code, serial_number, brand, model, installed_at, capacity_eggs, criticidad, sig_notes')
        .eq('org_id', ORG_ID)
    if (machinesError) throw machinesError

    const updatedMachines = await updateMachineFacts(supabase, machines || [])
    const rows = []
    for (const item of files) {
        const stat = fs.statSync(item.filePath)
        const machine = findMachineCode(relativeSourcePath(item.filePath), machines || [])
        const sourcePath = relativeSourcePath(item.filePath)
        const storagePath = `${ORG_ID}/${sourcePath}`
        const fileName = path.basename(item.filePath)
        const format = formatCode(sourcePath)
        const fileBuffer = fs.readFileSync(item.filePath)
        const { error: uploadError } = await supabase.storage.from(BUCKET).upload(storagePath, fileBuffer, { contentType: mimeType(fileName), upsert: true })
        if (uploadError) throw uploadError
        rows.push({
            org_id: ORG_ID,
            machine_id: machine?.id || null,
            machine_code: machine?.code || null,
            source: item.source,
            format_code: format,
            title: format ? `${format} · ${fileName}` : fileName,
            file_name: fileName,
            source_path: sourcePath,
            file_path: storagePath,
            file_type: fileType(fileName),
            recorded_at: stat.mtime.toISOString(),
            metadata: buildMetadata(item.filePath, stat),
        })
        if (rows.length >= 50) {
            const { error } = await supabase.from('sig_evidence').upsert(rows.splice(0), { onConflict: 'org_id,source_path' })
            if (error) throw error
        }
    }
    if (rows.length) {
        const { error } = await supabase.from('sig_evidence').upsert(rows, { onConflict: 'org_id,source_path' })
        if (error) throw error
    }
    console.log(JSON.stringify({ files: files.length, updatedMachines, registryRows: files.length, bucket: BUCKET }, null, 2))
}

main().catch((error) => {
    console.error(error.message || error)
    process.exitCode = 1
})
