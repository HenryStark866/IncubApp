import { describe, it, expect } from 'vitest';
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
} from './MachineAssetHub';

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
