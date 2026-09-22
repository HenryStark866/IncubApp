import { describe, it, expect, beforeEach } from 'vitest';
import { LOCAL_DOCUMENT_LIBRARY } from '../../../data/maintenanceManuals';
import { PLANT_ASSET_REGISTRY } from '../../../data/plantAssetRegistry';
import {
    resolveSelectedEvidence,
    isPdfCandidate,
    resolveLoadMapPreviewUrl,
    resolveLoadedByName,
    sortEvidence,
    resolveSigFormatCatalog,
    mantumHistoricalEvidenceForMachine,
    readLocalLoadMapsForOrg,
    buildProductionEvidence,
    chunkList,
    safeRows,
} from './MachineAssetHub';

describe('load map local persistence', () => {
    beforeEach(() => {
        const store = {};
        Object.defineProperty(globalThis, 'localStorage', {
            value: {
                getItem: (key) => (Object.prototype.hasOwnProperty.call(store, key) ? store[key] : null),
                setItem: (key, value) => { store[String(key)] = String(value); },
                removeItem: (key) => { delete store[String(key)]; },
                clear: () => { Object.keys(store).forEach((key) => delete store[key]); },
            },
            configurable: true,
        });
    });

    it('preserva la imagen base64 del mapa local para que la vista previa funcione en el centro de activos', () => {
        const orgId = 'org-1';
        const key = 'incubapp_load_maps_v1';
        localStorage.setItem(key, JSON.stringify({
            [orgId]: [{
                id: 'map-1',
                machine_id: 'M-1',
                createdAt: '2026-09-22T12:00:00Z',
                status: 'approved',
                imageDataUrl: 'data:image/png;base64,abc',
                image_path: 'org/load-maps/map-1.png',
            }],
        }));

        expect(readLocalLoadMapsForOrg(orgId)[0].imageDataUrl).toBe('data:image/png;base64,abc');
        expect(readLocalLoadMapsForOrg(orgId)[0].image_path).toBe('org/load-maps/map-1.png');
        expect(resolveLoadMapPreviewUrl(readLocalLoadMapsForOrg(orgId)[0])).toBe('data:image/png;base64,abc');
    });
});

describe('resolveSelectedEvidence', () => {
    const allEvidence = [
        { id: 'global-1', file_name: 'Global 1' },
        { id: 'global-2', file_name: 'Global 2' },
    ];

    const documents = [
        { id: 'doc-1', file_name: 'Documento activo' },
    ];

    it('prefers the global evidence list when the user is in the evidence section', () => {
        expect(resolveSelectedEvidence({
            section: 'evidence',
            selectedDocumentId: 'global-2',
            allEvidence,
            documents,
        })).toEqual({ id: 'global-2', file_name: 'Global 2' });
    });

    it('keeps the active machine document preview for asset dossiers', () => {
        expect(resolveSelectedEvidence({
            section: 'assets',
            selectedDocumentId: 'doc-1',
            allEvidence,
            documents,
        })).toEqual({ id: 'doc-1', file_name: 'Documento activo' });
    });

    it('detecta PDFs aun cuando no tienen el tipo de archivo exacto', () => {
        expect(isPdfCandidate({ file_name: 'manual.pdf' })).toBe(true);
        expect(isPdfCandidate({ file_type: 'image', url: 'https://cdn.example.com/archivo.pdf?download=1' })).toBe(true);
        expect(isPdfCandidate({ file_name: 'imagen.jpg', file_type: 'image' })).toBe(false);
    });

    it('usa la imagen real generada cuando el mapa trae un data URL o path de storage', () => {
        expect(resolveLoadMapPreviewUrl({ imageDataUrl: 'data:image/png;base64,abc' })).toBe('data:image/png;base64,abc');
        expect(resolveLoadMapPreviewUrl({ image_path: 'org/load-maps/123.png' })).toBe('org/load-maps/123.png');
        expect(resolveLoadMapPreviewUrl({ url: 'https://example.test/mapa.png' })).toBe('https://example.test/mapa.png');
    });

    it('resuelve el responsable de cargue por turno cuando la carga se hizo en un turno asignado', () => {
        const people = {
            u1: 'Ana Operario',
            u2: 'Luis Supervisor',
        };
        const shiftAssignments = [
            { user_id: 'u1', work_date: '2026-09-22', shift_number: 2, is_rest: false },
            { user_id: 'u2', work_date: '2026-09-22', shift_number: 1, is_rest: false },
        ];

        expect(resolveLoadedByName({
            loadedAt: '2026-09-22T16:40:00-05:00',
            loadedBy: 'u9',
            people,
            shiftAssignments,
        })).toBe('Ana Operario');

        expect(resolveLoadedByName({
            loadedAt: '2026-09-22T09:15:00-05:00',
            loadedBy: 'u9',
            people,
            shiftAssignments,
        })).toBe('Luis Supervisor');
    });

    it('prioriza las evidencias del año actual antes que las históricas', () => {
        const currentYear = new Date().getFullYear();
        const ordered = sortEvidence([
            { id: 'old', created_at: `${currentYear - 2}-06-10T10:00:00Z` },
            { id: 'new', created_at: `${currentYear}-09-21T12:00:00Z` },
            { id: 'mid', created_at: `${currentYear - 1}-12-15T08:00:00Z` },
        ]);

        expect(ordered.map((item) => item.id)).toEqual(['new', 'mid', 'old']);
    });

    it('usa la carpeta de registros del SIG como fuente de evidencia activa para toda la gestión', () => {
        expect(LOCAL_DOCUMENT_LIBRARY.length).toBeGreaterThan(0);
        expect(LOCAL_DOCUMENT_LIBRARY.every((file) => String(file.sourcePath || '').includes('MANTENIMIENTO/SIG-MANTENIMIENTO/REGISTROS'))).toBe(true);
    });

    it('incluye las salas y sistemas de la planta como activos del plan anual de mantenimiento', () => {
        const names = PLANT_ASSET_REGISTRY.map((asset) => asset.name.toLowerCase());
        expect(names.some((name) => name.includes('sala de incubadoras 1'))).toBe(true);
        expect(names.some((name) => name.includes('sala de nacedoras 1'))).toBe(true);
        expect(names.some((name) => name.includes('cuarto de maquinas inc 1'))).toBe(true);
        expect(names.some((name) => name.includes('lavandería zona limpia'))).toBe(true);
    });

    it('asocia los registros Mantum del año actual con el formato original del SIG', () => {
        const [record] = mantumHistoricalEvidenceForMachine({ code: '005.4' });
        expect(record).toBeTruthy();
        expect(record.sourceFile).toBeTruthy();
        expect(record.sourceFile.file_name).toMatch(/FOMAT01/i);
        expect([record.url.includes('FOMAT01'), record.url.includes('data:text/html')]).toContain(true);
    });

    it('resuelve la imagen real de un mapa de cargue desde los campos del payload o la imagen firmada', () => {
        expect(resolveLoadMapPreviewUrl({ imageUrl: 'https://example.test/mapa.png' })).toBe('https://example.test/mapa.png');
        expect(resolveLoadMapPreviewUrl({ payload: { imageDataUrl: 'data:image/png;base64,abc' } })).toBe('data:image/png;base64,abc');
    });

    it('asocia cada formato SIG con el archivo original del proyecto', () => {
        const catalog = resolveSigFormatCatalog([{ code: 'FOMAT01', name: 'ORDEN DE TRABAJO DE MANTENIMIENTO', process: 'GESTIÓN DE MANTENIMIENTO', version: '01', date: '18-08-2026' }]);

        expect(catalog[0].sourceFile.file_name).toContain('FOMAT01');
        expect(catalog[0].url).toBeTruthy();
    });

    it('devuelve una OT histórica independiente por máquina, sin mezclar responsables en un mismo formato', () => {
        const records = mantumHistoricalEvidenceForMachine({ code: '005.4' });

        expect(records.length).toBeGreaterThan(0);
        expect(records.every((record) => record.formatCode === 'FOMAT01')).toBe(true);
        expect(records.every((record) => record.machineCode === '005.4')).toBe(true);
        expect([records[0].url.includes('data:text/html'), /MANTENIMIENTO\/SIG-MANTENIMIENTO\/REGISTROS\/2026\/.*FOMAT01/i.test(records[0].url || '')].some(Boolean)).toBe(true);
    });

    it('separa cada tarea de una OT histórica en un formato individual', () => {
        const records = mantumHistoricalEvidenceForMachine({ code: '005.4' });
        const taskCodes = new Set(records.map((record) => record.workOrderCode));

        expect(taskCodes.has('005.4-P-001')).toBe(true);
        expect(taskCodes.has('005.4-S-006')).toBe(true);
        expect(taskCodes.size).toBeGreaterThan(1);
    });
});

describe('lectura del repositorio de evidencias', () => {
    it('parte las listas de IDs en tandas para no desbordar la URL del filtro in()', () => {
        const ids = Array.from({ length: 205 }, (_, index) => `id-${index}`);
        const chunks = chunkList(ids, 80);

        expect(chunks.map((chunk) => chunk.length)).toEqual([80, 80, 45]);
        expect(chunks.flat()).toEqual(ids);
    });

    it('una fuente que falla devuelve filas vacías y su nombre, sin tumbar las demás', async () => {
        const failed = await safeRows('las evidencias de OT', Promise.resolve({ data: null, error: { message: 'Bad Request' } }));
        const ok = await safeRows('las rondas', Promise.resolve({ data: [{ id: 1 }], error: null }));
        const thrown = await safeRows('los cargues', Promise.reject(new Error('sin red')));

        expect(failed).toEqual({ rows: [], failed: 'las evidencias de OT' });
        expect(ok).toEqual({ rows: [{ id: 1 }], failed: null });
        expect(thrown).toEqual({ rows: [], failed: 'los cargues' });
    });
});

describe('evidencia de producción', () => {
    const now = new Date('2026-09-22T15:00:00-05:00');
    const machines = { m1: { id: 'm1', code: 'INC-05', name: 'Incubadora 5' } };
    const people = { u1: 'Ferney Tabares', u2: 'Ana Supervisora' };
    const photoUrls = new Map([['org/loads/foto.jpg', 'https://firmada.test/foto.jpg']]);

    it('convierte cargues, transferencias y nacimientos reales en evidencias con su responsable', () => {
        const records = buildProductionEvidence({
            now,
            machines,
            people,
            photoUrls,
            loads: [{ id: 'l1', machine_id: 'm1', lote: '46', loaded_at: '2026-09-21T08:00:00-05:00', tape_color_name: 'Roja', photo_path: 'org/loads/foto.jpg', created_by: 'u1' }],
            transfers: [{ id: 't1', lote: '45', mode: 'double', transferred_at: '2026-09-20T10:00:00-05:00', created_by: 'u2' }],
            hatches: [{ id: 'h1', lote: '44', status: 'completed', actual_chicks: 102915, started_at: '2026-09-19T05:00:00-05:00', ended_at: '2026-09-19T11:00:00-05:00', started_by: 'u1', closed_by: 'u2' }],
        });

        expect(records.map((record) => record.formatCode)).toEqual(['PRODUCCIÓN · CARGUE', 'PRODUCCIÓN · TRANSFERENCIA', 'PRODUCCIÓN · NACIMIENTO']);
        expect(records.every((record) => record.kind === 'production')).toBe(true);

        const [load, transfer, hatch] = records;
        expect(load.file_name).toBe('Cargue INC-05 · Lote 46');
        expect(load.url).toBe('https://firmada.test/foto.jpg');
        expect(load.note).toContain('Registró: Ferney Tabares');
        expect(load.note).toContain('Cinta Roja');
        expect(transfer.note).toContain('Transferencia doble');
        expect(transfer.items[0].url).toBeNull();
        expect(transfer.items[0].notes).toBe('Registro sin foto adjunta');
        expect(hatch.note).toContain('Cerró: Ana Supervisora');
        expect(hatch.created_at).toBe('2026-09-19T11:00:00-05:00');
    });

    it('no cuenta como evidencia un cargue planeado que todavía no ocurre', () => {
        const records = buildProductionEvidence({
            now,
            machines,
            people,
            loads: [
                { id: 'futuro', machine_id: 'm1', lote: '47', loaded_at: '2026-09-25T08:00:00-05:00', created_by: 'u1' },
                { id: 'hecho', machine_id: 'm1', lote: '46', loaded_at: '2026-09-22T08:00:00-05:00', created_by: 'u1' },
            ],
        });

        expect(records.map((record) => record.id)).toEqual(['production-load-hecho']);
    });

    it('dice cuando la foto existe pero no se pudo firmar, en vez de inventar una', () => {
        const [record] = buildProductionEvidence({
            now,
            loads: [{ id: 'l2', lote: '46', loaded_at: '2026-09-22T08:00:00-05:00', photo_path: 'org/loads/otra.jpg' }],
        });

        expect(record.url).toBeNull();
        expect(record.items[0].notes).toBe('La foto no se pudo abrir');
        expect(record.note).toContain('Registró: No registrado');
    });
});
