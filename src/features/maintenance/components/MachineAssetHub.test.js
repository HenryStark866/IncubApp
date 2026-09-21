import { describe, it, expect } from 'vitest';
import { resolveSelectedEvidence } from './MachineAssetHub';

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
});
