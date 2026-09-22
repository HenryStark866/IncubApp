const localFiles = import.meta.glob('../assets/manuales/**/*', {
    eager: true,
    import: 'default',
    query: '?url',
})

function fileType(path) {
    return /\.pdf$/i.test(path) ? 'pdf' : /\.xlsx?$/i.test(path) ? 'spreadsheet' : 'document'
}

function basename(path) {
    return path.split('/').pop() || path
}

function assetCode(name) {
    return name.match(/^([A-Z]{2,4}-?\d+(?:\.\d+)?|\d{3}\.\d+)/i)?.[1]?.toUpperCase() || null
}

function titleFromName(name) {
    return name
        .replace(/\.[^.]+$/, '')
        .replace(/^([A-Z]{2,4}-?\d+(?:\.\d+)?|\d{3}\.\d+)__?/i, '')
        .replace(/[-_]+/g, ' ')
        .trim()
}

export const LOCAL_MAINTENANCE_MANUALS = Object.entries(localFiles).map(([sourcePath, url]) => {
    const name = basename(sourcePath)
    const machineCode = assetCode(name)
    const source = sourcePath.includes('/mantum/') ? 'mantum' : 'sig'
    return {
        id: `local-manual-${source}-${name}`,
        file_name: name,
        file_type: fileType(name),
        formatCode: source === 'sig' ? 'DOCUMENTO SIG' : 'MANUAL MANTUM',
        workOrderTitle: titleFromName(name),
        machineCode,
        source,
        sourcePath,
        url,
        created_at: null,
        kind: 'local-manual',
        note: source === 'sig' ? 'Manual, instructivo o formato controlado del SIG' : 'Manual técnico del inventario Mantum',
    }
})

const mantumResources = [
    ['public/assets/mantum/LEEME.md', '/assets/mantum/LEEME.md'],
    ['public/assets/mantum/inventario_imagenes.csv', '/assets/mantum/inventario_imagenes.csv'],
    ['public/assets/mantum/inventario_imagenes_instalaciones.csv', '/assets/mantum/inventario_imagenes_instalaciones.csv'],
    ['public/assets/mantum/manuales_por_equipo.csv', '/assets/mantum/manuales_por_equipo.csv'],
    ['public/assets/mantum/manuales.zip', '/assets/mantum/manuales.zip'],
]

export const LOCAL_MANTUM_RESOURCES = mantumResources.map(([sourcePath, url]) => {
    const name = basename(sourcePath)
    return {
        id: `mantum-resource-${name}`,
        file_name: name,
        file_type: /\.zip$/i.test(name) ? 'archive' : /\.csv$/i.test(name) ? 'spreadsheet' : 'document',
        formatCode: 'RECURSO MANTUM',
        workOrderTitle: titleFromName(name),
        source: 'mantum',
        sourcePath,
        url,
        created_at: null,
        kind: 'mantum-resource',
        note: 'Recurso importado de activos-mantum',
    }
})