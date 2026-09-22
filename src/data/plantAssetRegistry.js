const FALLBACK_ASSET_SEEDS = [
    { code: 'SI1', name: 'Sala de incubadoras 1', type: 'incubation', criticidad: 'Alta', status: 'En operación', source: 'plan-anual' },
    { code: 'SI2', name: 'Sala de incubadoras 2', type: 'incubation', criticidad: 'Alta', status: 'En operación', source: 'plan-anual' },
    { code: 'SN1', name: 'Sala de nacedoras 1', type: 'hatching', criticidad: 'Alta', status: 'En operación', source: 'plan-anual' },
    { code: 'SN2', name: 'Sala de nacedoras 2', type: 'hatching', criticidad: 'Alta', status: 'En operación', source: 'plan-anual' },
    { code: 'SN3', name: 'Sala de nacedoras 3', type: 'hatching', criticidad: 'Alta', status: 'En operación', source: 'plan-anual' },
    { code: 'SN4', name: 'Sala de nacedoras 4', type: 'hatching', criticidad: 'Alta', status: 'En operación', source: 'plan-anual' },
    { code: 'S75', name: 'Cuarto de maquinas INC 2', type: 'technical', criticidad: 'Alta', status: 'En operación', source: 'plan-anual' },
    { code: 'S76', name: 'Cuarto de maquinas INC 1', type: 'technical', criticidad: 'Alta', status: 'En operación', source: 'plan-anual' },
    { code: 'S78', name: 'Túnel incubadoras No 2', type: 'technical', criticidad: 'Alta', status: 'En operación', source: 'plan-anual' },
    { code: 'S79', name: 'Túnel incubadoras No 1', type: 'technical', criticidad: 'Alta', status: 'En operación', source: 'plan-anual' },
    { code: 'S80', name: 'Túnel nacedoras No 2', type: 'technical', criticidad: 'Alta', status: 'En operación', source: 'plan-anual' },
    { code: 'S81', name: 'Túnel nacedoras No 1', type: 'technical', criticidad: 'Alta', status: 'En operación', source: 'plan-anual' },
    { code: 'S82', name: 'Cuarto de maquinas NAC 1', type: 'technical', criticidad: 'Alta', status: 'En operación', source: 'plan-anual' },
    { code: 'S83', name: 'Cuarto de maquinas NAC 2', type: 'technical', criticidad: 'Alta', status: 'En operación', source: 'plan-anual' },
    { code: 'S84', name: 'Cuarto de maquinas NAC 3', type: 'technical', criticidad: 'Alta', status: 'En operación', source: 'plan-anual' },
    { code: 'S85', name: 'Cuarto de maquinas NAC 4', type: 'technical', criticidad: 'Alta', status: 'En operación', source: 'plan-anual' },
    { code: 'S86', name: 'Área técnica de ambiente controlado', type: 'technical', criticidad: 'Alta', status: 'En operación', source: 'plan-anual' },
    { code: 'LAV', name: 'Sala de lavado canastillas', type: 'washing', criticidad: 'Alta', status: 'En operación', source: 'plan-anual' },
    { code: 'REC', name: 'Sala recepción de huevos', type: 'egg_storage', criticidad: 'Alta', status: 'En operación', source: 'plan-anual' },
    { code: 'S21', name: 'Lavado nacimiento', type: 'washing', criticidad: 'Alta', status: 'En operación', source: 'plan-anual' },
    { code: 'S22', name: 'Cuarto frío', type: 'egg_storage', criticidad: 'Alta', status: 'En operación', source: 'plan-anual' },
    { code: 'S23', name: 'Pasillo', type: 'hallway', criticidad: 'Media', status: 'En operación', source: 'plan-anual' },
    { code: 'S24', name: 'Pasillo', type: 'hallway', criticidad: 'Media', status: 'En operación', source: 'plan-anual' },
    { code: 'S25', name: 'Pasillo', type: 'hallway', criticidad: 'Media', status: 'En operación', source: 'plan-anual' },
    { code: 'S31', name: 'Lavandería zona limpia', type: 'washing', criticidad: 'Alta', status: 'En operación', source: 'plan-anual' },
    { code: 'S32', name: 'Almacén dotación', type: 'other', criticidad: 'Media', status: 'En operación', source: 'plan-anual' },
    { code: 'S33', name: 'Sala de sexaje', type: 'chick_processing', criticidad: 'Alta', status: 'En operación', source: 'plan-anual' },
    { code: 'S91', name: 'Sala de transferencia', type: 'chick_processing', criticidad: 'Alta', status: 'En operación', source: 'plan-anual' },
    { code: 'S92', name: 'Sala de vacunación', type: 'chick_processing', criticidad: 'Alta', status: 'En operación', source: 'plan-anual' },
    { code: 'S93', name: 'Oficina producción', type: 'office', criticidad: 'Media', status: 'En operación', source: 'plan-anual' },
    { code: 'S97', name: 'Oficina administrativa', type: 'office', criticidad: 'Media', status: 'En operación', source: 'plan-anual' },
    { code: 'S99', name: 'Archivo', type: 'office', criticidad: 'Media', status: 'En operación', source: 'plan-anual' },
    { code: 'S40', name: 'Lavandería zona sucia', type: 'washing', criticidad: 'Alta', status: 'En operación', source: 'plan-anual' },
    { code: 'S37', name: 'Comedor zona sucia', type: 'other', criticidad: 'Media', status: 'En operación', source: 'plan-anual' },
    { code: 'S28', name: 'Comedor zona limpia', type: 'other', criticidad: 'Media', status: 'En operación', source: 'plan-anual' },
    { code: 'S45', name: 'Almacén de canastas', type: 'chick_processing', criticidad: 'Alta', status: 'En operación', source: 'plan-anual' },
    { code: 'S46', name: 'Despacho', type: 'chick_processing', criticidad: 'Alta', status: 'En operación', source: 'plan-anual' },
    { code: 'S48', name: 'Sala de cargue despacho', type: 'chick_processing', criticidad: 'Alta', status: 'En operación', source: 'plan-anual' },
    { code: 'S64', name: 'Bodega agrosan', type: 'chick_processing', criticidad: 'Alta', status: 'En operación', source: 'plan-anual' },
    { code: 'S18', name: 'Almacenamiento huevo comercial', type: 'egg_storage', criticidad: 'Alta', status: 'En operación', source: 'plan-anual' },
    { code: 'S19', name: 'Almacenamiento de carros', type: 'washing', criticidad: 'Alta', status: 'En operación', source: 'plan-anual' },
    { code: 'S72', name: 'Lavado carros', type: 'chick_processing', criticidad: 'Alta', status: 'En operación', source: 'plan-anual' },
    { code: 'S67', name: 'Cuarto de vacuna', type: 'technical', criticidad: 'Alta', status: 'En operación', source: 'plan-anual' },
    { code: 'S67B', name: 'Cuarto de vacuna B', type: 'technical', criticidad: 'Alta', status: 'En operación', source: 'plan-anual' },
    { code: 'REP', name: 'Almacén de repuestos', type: 'technical', criticidad: 'Alta', status: 'En operación', source: 'plan-anual' },
    { code: 'TEC-1', name: 'Sala técnica No 1', type: 'technical', criticidad: 'Alta', status: 'En operación', source: 'plan-anual' },
    { code: 'S9', name: 'Sala técnica No 2', type: 'technical', criticidad: 'Alta', status: 'En operación', source: 'plan-anual' },
    { code: 'TUN', name: 'Pasillo (túnel)', type: 'hallway', criticidad: 'Media', status: 'En operación', source: 'plan-anual' },
];

const ROOM_TYPE_LABELS = {
    incubation: 'Incubación',
    hatching: 'Nacedora',
    egg_storage: 'Bodega de huevo',
    chick_processing: 'Proceso de pollito',
    washing: 'Lavado',
    technical: 'Cuarto técnico',
    office: 'Oficina',
    hallway: 'Pasillo / corredor',
    other: 'Infraestructura',
};

function normalizeAssetType(type) {
    const key = String(type || '').trim().toLowerCase();
    const label = ROOM_TYPE_LABELS[key] || 'Infraestructura';
    return label;
}

function buildSeedFromPlantRooms(rooms = []) {
    return rooms
        .map((room) => {
            const code = String(room.code || room.name || room.id || '').trim();
            const name = String(room.name || room.label || code || '').trim();
            if (!code || !name) return null;
            const normalizedType = room.type || room.roomType || 'other';
            return {
                id: room.id || `plant-${code}`,
                code,
                name,
                type: normalizeAssetType(normalizedType),
                roomType: String(normalizedType || 'other').toLowerCase(),
                criticidad: room.criticidad || (['incubation', 'hatching', 'technical', 'washing', 'chick_processing'].includes(String(normalizedType || '').toLowerCase()) ? 'Alta' : 'Media'),
                status: room.status || 'En operación',
                source: room.source || 'plan-anual',
            };
        })
        .filter(Boolean);
}

export function getPlantAssetRegistry() {
    const plantRooms = typeof window !== 'undefined' && Array.isArray(window.PLANTA?.rooms)
        ? window.PLANTA.rooms
        : FALLBACK_ASSET_SEEDS;

    const registry = buildSeedFromPlantRooms(plantRooms);
    const deduped = new Map();

    for (const asset of registry) {
        const key = String(asset.code || asset.name).trim().toUpperCase();
        if (!key || deduped.has(key)) continue;
        deduped.set(key, asset);
    }

    return Array.from(deduped.values());
}

export const PLANT_ASSET_REGISTRY = getPlantAssetRegistry();
