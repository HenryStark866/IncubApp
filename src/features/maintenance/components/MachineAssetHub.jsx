import React, { useState, useMemo } from 'react';
import { supabase } from '../../../lib/supabase';
import { useMachineDossier } from '../hooks/useMachineDossier';
import { exportCorporate } from '../../../lib/exportDocument';
import { MANTUM_EQUIPOS, MANTUM_INVENTORY, MANTUM_HISTORICAL_OTS } from '../../../data/mantumCatalog';
import { SIG_FORMATS } from '../../../lib/corporateBrand';
import './MachineAssetHub.css';

const STORAGE_KEY = 'incubapp:sig-asset-hub:custom-assets';

function catalogMachines() {
  return Object.entries(MANTUM_EQUIPOS).map(([key, item]) => ({
    machine_id: `catalog-${key}`,
    code: item.mantum_code || key,
    name: item.nombre || `Activo ${key}`,
    type: item.tipo || 'Equipo de planta',
    criticidad: item.criticidad || 'Media',
    status: item.estado_mantum || 'En operación',
    serial_number: item.serial_number || '',
    source: 'catalog',
    catalogKey: key,
  }));
}

function readCustomAssets() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
  } catch {
    return [];
  }
}

const MachineAssetHub = () => {
  const [machines, setMachines] = useState([]);
  const [customAssets, setCustomAssets] = useState(readCustomAssets);
  const [selectedMachineId, setSelectedMachineId] = useState(null);
  const [filterText, setFilterText] = useState('');
  const [filterGroup, setFilterGroup] = useState('all');
  const [section, setSection] = useState('assets');
  const [showNewAsset, setShowNewAsset] = useState(false);
  const [newAsset, setNewAsset] = useState({ code: '', name: '', type: 'Equipo de planta', criticidad: 'Media' });
  const [loading, setLoading] = useState(true);

  const selectedMachine = machines.find((machine) => machine.machine_id === selectedMachineId);
  const remoteMachineId = selectedMachine?.source === 'remote' ? selectedMachine.machine_id : null;
  const { dossier: remoteDossier, loading: dossierLoading } = useMachineDossier(remoteMachineId);

  const localDossier = useMemo(() => {
    if (!selectedMachine || selectedMachine.source === 'remote') return null;
    return {
      summary: selectedMachine,
      history: MANTUM_HISTORICAL_OTS[selectedMachine.catalogKey] || [],
      calibrations: [],
      imageUrl: MANTUM_INVENTORY[selectedMachine.catalogKey]?.url || null,
    };
  }, [selectedMachine]);

  const dossier = selectedMachine?.source === 'remote' ? remoteDossier : localDossier;

  React.useEffect(() => {
    async function loadMachines() {
      const catalog = [...catalogMachines(), ...readCustomAssets()];
      const { data, error } = await supabase
        .from('machine_sig_summary')
        .select('*');
      const remote = (error ? [] : data || []).map((machine) => ({ ...machine, source: 'remote' }));
      setMachines([...remote, ...catalog]);
      setLoading(false);
    }
    loadMachines();
  }, []);

  const filteredMachines = useMemo(() => {
    return machines.filter(m => {
      const matchesText = (m.name || '').toLowerCase().includes(filterText.toLowerCase()) ||
        (m.code || '').toLowerCase().includes(filterText.toLowerCase());
      const matchesGroup = filterGroup === 'all' || m.criticidad === filterGroup;
      return matchesText && matchesGroup;
    });
  }, [machines, filterText, filterGroup]);

  const saveAsset = (event) => {
    event.preventDefault();
    if (!newAsset.code.trim() || !newAsset.name.trim()) return;
    const asset = {
      ...newAsset,
      code: newAsset.code.trim().toUpperCase(),
      name: newAsset.name.trim(),
      machine_id: `custom-${Date.now()}`,
      status: 'Pendiente de ficha SIG',
      source: 'custom',
    };
    const next = [...customAssets, asset];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    setCustomAssets(next);
    setMachines((current) => [...current, asset]);
    setSelectedMachineId(asset.machine_id);
    setNewAsset({ code: '', name: '', type: 'Equipo de planta', criticidad: 'Media' });
    setShowNewAsset(false);
  };

  const handleExport = async (type) => {
    if (!dossier) return;
    const sheets = [
      { name: 'Resumen', rows: [dossier.summary] },
      { name: 'Historial', rows: dossier.history },
      { name: 'Calibraciones', rows: dossier.calibrations },
    ];
    await exportCorporate(type, 'Dossier_SIG', sheets, {
      title: 'Dossier SIG de maquina',
      module: 'Centro de Activos',
    });
  };

  if (loading) return <div className="flex justify-center p-10"><span aria-hidden="true">...</span> Cargando Activos...</div>;

  return (
    <div className="sig-asset-hub flex h-screen bg-slate-50 font-sans text-slate-900">
      <div className="sig-asset-sidebar w-1/3 border-r bg-white flex flex-col">
        <div className="p-4 border-b space-y-3">
          <h2 className="text-xl font-bold flex items-center gap-2">
            <span className="text-blue-600" aria-hidden="true">[+]</span> Centro SIG
          </h2>
          <div className="flex gap-2">
            <button type="button" onClick={() => { setSection('assets'); setSelectedMachineId(null); }} className="px-3 py-1 text-xs rounded border">Activos ({machines.length})</button>
            <button type="button" onClick={() => { setSection('documents'); setSelectedMachineId(null); }} className="px-3 py-1 text-xs rounded border">Formatos ({Object.keys(SIG_FORMATS).length})</button>
            <button type="button" onClick={() => setShowNewAsset(true)} className="px-3 py-1 text-xs rounded border">Nuevo activo</button>
          </div>
          {showNewAsset && (
            <form onSubmit={saveAsset} className="space-y-2 rounded border p-3 bg-slate-50">
              <input required className="w-full border rounded p-2 text-sm" placeholder="Código SIG / Mantum" value={newAsset.code} onChange={(e) => setNewAsset({ ...newAsset, code: e.target.value })} />
              <input required className="w-full border rounded p-2 text-sm" placeholder="Nombre del activo" value={newAsset.name} onChange={(e) => setNewAsset({ ...newAsset, name: e.target.value })} />
              <div className="flex gap-2">
                <button type="submit" className="px-3 py-1 text-xs rounded bg-blue-600 text-white">Guardar</button>
                <button type="button" onClick={() => setShowNewAsset(false)} className="px-3 py-1 text-xs rounded border">Cancelar</button>
              </div>
            </form>
          )}
          {section === 'documents' && (
            <div className="flex-1 overflow-y-auto space-y-2">
              {Object.values(SIG_FORMATS).map((format) => (
                <button key={format.code} type="button" onClick={() => exportCorporate('excel', format.code, [{ name: 'Control', rows: [format] }], { title: format.name, code: format.code })} className="w-full text-left p-3 border rounded hover:bg-slate-50">
                  <strong className="text-sm">{format.code}</strong>
                  <span className="block text-xs text-slate-600">{format.name}</span>
                  <span className="block text-[10px] text-slate-400">Versión {format.version} · {format.process}</span>
                </button>
              ))}
            </div>
          )}
          {section === 'assets' && <>
            <div className="relative">
              <span className="absolute left-3 top-2.5 text-slate-400" aria-hidden="true">?</span>
              <input
                className="w-full pl-9 pr-4 py-2 border rounded-lg text-sm outline-none focus:ring-2 ring-blue-500"
                placeholder="Buscar por código o nombre..."
                value={filterText}
                onChange={(e) => setFilterText(e.target.value)}
              />
            </div>
            <div className="flex gap-2 overflow-x-auto pb-2">
              {['all', 'Alta', 'Media', 'Baja'].map(group => (
                <button
                  key={group}
                  onClick={() => setFilterGroup(group)}
                  className="px-3 py-1 text-xs rounded-full border"
                >
                  {group === 'all' ? 'Todos' : group}
                </button>
              ))}
            </div>
          </>}
        </div>

        {section === 'assets' && <div className="flex-1 overflow-y-auto">
          {filteredMachines.map(m => (
            <div
              key={m.machine_id}
              onClick={() => setSelectedMachineId(m.machine_id)}
              className="p-4 border-b cursor-pointer transition-colors"
            >
              <div className="flex justify-between items-start">
                <div>
                  <span className="text-xs font-mono text-slate-500">{m.code}</span>
                  <h3 className="font-semibold">{m.name}</h3>
                </div>
                <span className="text-[10px] px-2 py-0.5 rounded-full">
                  {m.status}
                </span>
              </div>
              <div className="mt-2 text-xs text-slate-500 flex gap-3">
                <span className="flex items-center gap-1"><span aria-hidden="true">#</span> {m.type}</span>
                <span className="flex items-center gap-1"><span aria-hidden="true">*</span> {m.criticidad}</span>
              </div>
            </div>
          ))
          }
          {filteredMachines.length === 0 && <p className="p-4 text-sm text-slate-500">No hay activos que coincidan con el filtro.</p>}
        </div >}
      </div >

      <div className="sig-asset-detail flex-1 overflow-y-auto p-8">
        {!selectedMachineId ? (
          <div className="h-full flex flex-col items-center justify-center text-slate-400">
            <span className="mb-4 opacity-20" aria-hidden="true">[doc]</span>
            <p>{section === 'documents' ? 'Selecciona un formato para exportarlo' : 'Selecciona un activo para ver su expediente completo'}</p>
          </div>
        ) : dossierLoading ? (
          <div className="h-full flex items-center justify-center"><span aria-hidden="true">...</span> Cargando Dossier...</div>
        ) : dossier ? (
          <div className="space-y-8 animate-in fade-in duration-500">
            <div className="flex justify-between items-start">
              <div>
                <h1 className="text-3xl font-bold text-slate-800">{dossier.summary.name}</h1>
                <p className="text-slate-500">Código SIG: {dossier.summary.code} | Serie: {dossier.summary.serial_number || 'Pendiente de registrar'}</p>
              </div>
              <div className="flex gap-2">
                <button onClick={() => handleExport('excel')} className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700 transition-colors">
                  <span aria-hidden="true">↓</span> Excel
                </button>
                <button onClick={() => handleExport('pdf')} className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg text-sm hover:bg-red-700 transition-colors">
                  <span aria-hidden="true">↓</span> PDF
                </button>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="p-4 bg-white rounded-xl border shadow-sm">
                <span className="text-xs text-slate-400 uppercase font-bold">Adquisición</span>
                <p className="text-lg font-medium">{dossier.summary.acquisition_date || 'N/A'}</p>
                <p className="text-sm text-slate-500">\</p>
              </div>
              <div className="p-4 bg-white rounded-xl border shadow-sm">
                <span className="text-xs text-slate-400 uppercase font-bold">Proveedor</span>
                <p className="text-lg font-medium">{dossier.summary.supplier || 'No registrado'}</p>
              </div>
              <div className="p-4 bg-white rounded-xl border shadow-sm">
                <span className="text-xs text-slate-400 uppercase font-bold">Criticidad</span>
                <p className="text-lg font-medium">{dossier.summary.criticidad}</p>
              </div>
            </div>
            <div className="bg-white rounded-2xl border shadow-sm overflow-hidden">
              <div className="border-b bg-slate-50 flex">
                <button className="px-6 py-3 text-sm font-medium border-b-2 border-blue-600 text-blue-600">Historial Operativo</button>
                <button className="px-6 py-3 text-sm font-medium text-slate-500 hover:text-slate-700">Calibraciones</button>
                <button className="px-6 py-3 text-sm font-medium text-slate-500 hover:text-slate-700">Plan Mantenimiento</button>
              </div>
              <div className="p-6">
                <table className="w-full text-left text-sm">
                  <thead className="text-slate-400 border-b">
                    <tr>
                      <th className="pb-3 font-medium">Fecha</th>
                      <th className="pb-3 font-medium">Actividad/OT</th>
                      <th className="pb-3 font-medium">Técnico</th>
                      <th className="pb-3 font-medium">Estado</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {dossier.history.map((ot, index) => (
                      <tr key={ot.id || `${ot.code || 'ot'}-${index}`} className="hover:bg-slate-50">
                        <td className="py-3">{ot.created_at ? new Date(ot.created_at).toLocaleDateString() : 'Histórico Mantum'}</td>
                        <td className="py-3 font-medium">{ot.description || 'OT Operativa'}</td>
                        <td className="py-3">{ot.technician_name || ot.profiles?.full_name || 'N/A'}</td>
                        <td className="py-3">
                          <span className="px-2 py-0.5 rounded-full text-[10px]">
                            {ot.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        ) : (
          <div className="h-full flex items-center justify-center text-slate-400">Error al cargar el dossier.</div>
        )}
      </div >
    </div >
  );
};

export default MachineAssetHub;
