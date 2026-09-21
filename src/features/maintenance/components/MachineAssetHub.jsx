import React, { useState, useMemo, useCallback } from 'react';
import { supabase } from '../../../lib/supabase';
import { useMachineDossier } from '../hooks/useMachineDossier';
import { exportCorporate } from '../../../lib/exportDocument';
import { MANTUM_EQUIPOS, MANTUM_INVENTORY, MANTUM_HISTORICAL_OTS, MANTUM_PLANS } from '../../../data/mantumCatalog';
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

function mergeMachines(remote, catalog) {
  const merged = new Map();
  for (const machine of [...catalog, ...remote]) {
    const key = String(machine.code || machine.mantum_code || machine.machine_id).trim().toUpperCase();
    if (!merged.has(key) || machine.source === 'remote') merged.set(key, machine);
  }
  return Array.from(merged.values());
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
  const [detailTab, setDetailTab] = useState('history');
  const [documentFilter, setDocumentFilter] = useState('');
  const [selectedFormatCode, setSelectedFormatCode] = useState('FOMAT03');
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
      maintenancePlan: MANTUM_PLANS[selectedMachine.catalogKey] || [],
      imageUrl: MANTUM_INVENTORY[selectedMachine.catalogKey]?.url || null,
    };
  }, [selectedMachine]);

  const dossier = selectedMachine?.source === 'remote' ? remoteDossier : localDossier;

  const loadMachines = useCallback(async () => {
    setLoading(true);
    try {
      const catalog = [...catalogMachines(), ...readCustomAssets()];
      const { data, error } = await supabase
        .from('machine_sig_summary')
        .select('*');
      if (error) throw error;
      const remote = (data || []).map((machine) => ({ ...machine, source: 'remote' }));
      setMachines(mergeMachines(remote, catalog));
    } catch (error) {
      setMachines(mergeMachines([], [...catalogMachines(), ...readCustomAssets()]));
      console.warn('Centro SIG: se usa el catálogo local mientras la vista remota no está disponible.', error);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => { loadMachines(); }, [loadMachines]);

  const filteredMachines = useMemo(() => {
    return machines.filter(m => {
      const matchesText = (m.name || '').toLowerCase().includes(filterText.toLowerCase()) ||
        (m.code || '').toLowerCase().includes(filterText.toLowerCase());
      const matchesGroup = filterGroup === 'all' || m.criticidad === filterGroup;
      return matchesText && matchesGroup;
    });
  }, [machines, filterText, filterGroup]);

  const filteredFormats = useMemo(() => Object.values(SIG_FORMATS).filter((format) => {
    const query = documentFilter.toLowerCase();
    return !query || `${format.code} ${format.name} ${format.process}`.toLowerCase().includes(query);
  }), [documentFilter]);

  const selectedFormat = SIG_FORMATS[selectedFormatCode] || SIG_FORMATS.FOMAT03;

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
    setSection('assets');
    setDetailTab('history');
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

  const handleFormatExport = async (type = 'excel') => {
    await exportCorporate(type, selectedFormat.code, [{ name: 'Control', rows: [selectedFormat] }], {
      title: selectedFormat.name,
      code: selectedFormat.code,
    });
  };

  if (loading) return <div className="sig-asset-loading"><span className="sig-asset-spinner" aria-hidden="true" /> Cargando Centro SIG...</div>;

  return (
    <div className="sig-asset-hub flex h-screen bg-slate-50 font-sans text-slate-900">
      <div className="sig-asset-sidebar w-1/3 border-r bg-white flex flex-col">
        <div className="p-4 border-b space-y-3">
          <h2 className="sig-asset-title">
            <span aria-hidden="true">SIG</span> Centro de Activos
          </h2>
          <div className="sig-asset-nav" role="tablist" aria-label="Secciones del Centro SIG">
            <button type="button" role="tab" aria-selected={section === 'assets'} className={section === 'assets' ? 'is-active' : ''} onClick={() => { setSection('assets'); setSelectedMachineId(null); }}>Activos <b>{machines.length}</b></button>
            <button type="button" role="tab" aria-selected={section === 'documents'} className={section === 'documents' ? 'is-active' : ''} onClick={() => { setSection('documents'); setSelectedMachineId(null); }}>Formatos <b>{Object.keys(SIG_FORMATS).length}</b></button>
            <button type="button" className="sig-asset-new" onClick={() => setShowNewAsset(true)}>+ Nuevo</button>
          </div>
          {showNewAsset && (
            <form onSubmit={saveAsset} className="space-y-2 rounded border p-3 bg-slate-50">
              <input required className="w-full border rounded p-2 text-sm" placeholder="Código SIG / Mantum" value={newAsset.code} onChange={(e) => setNewAsset({ ...newAsset, code: e.target.value })} />
              <input required className="w-full border rounded p-2 text-sm" placeholder="Nombre del activo" value={newAsset.name} onChange={(e) => setNewAsset({ ...newAsset, name: e.target.value })} />
              <div className="flex gap-2">
                <select className="w-full border rounded p-2 text-sm" value={newAsset.type} onChange={(e) => setNewAsset({ ...newAsset, type: e.target.value })}>
                  <option>Equipo de planta</option><option>Incubadora</option><option>Nacedora</option><option>Infraestructura</option>
                </select>
                <select className="w-full border rounded p-2 text-sm" value={newAsset.criticidad} onChange={(e) => setNewAsset({ ...newAsset, criticidad: e.target.value })}>
                  <option>Alta</option><option>Media</option><option>Baja</option>
                </select>
                <div className="sig-asset-form-actions"><button type="submit" className="sig-asset-primary">Guardar activo</button><button type="button" onClick={() => setShowNewAsset(false)}>Cancelar</button></div>
              </div>
            </form>
          )}
          {section === 'documents' && (
            <>
              <input className="sig-asset-doc-search" placeholder="Buscar formato o proceso..." value={documentFilter} onChange={(e) => setDocumentFilter(e.target.value)} />
              <div className="sig-asset-document-list">
                {filteredFormats.map((format) => (
                  <button key={format.code} type="button" className={selectedFormatCode === format.code ? 'is-active' : ''} onClick={() => setSelectedFormatCode(format.code)}>
                    <strong className="text-sm">{format.code}</strong>
                    <span className="block text-xs text-slate-600">{format.name}</span>
                    <span className="block text-[10px] text-slate-400">Versión {format.version} · {format.process}</span>
                  </button>
                ))}
              </div>
            </>
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
                  type="button"
                  onClick={() => setFilterGroup(group)}
                  className={`px-3 py-1 text-xs rounded-full border${filterGroup === group ? ' is-active' : ''}`}
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
        {section === 'documents' ? (
          <div className="sig-format-detail">
            <span className="sig-detail-kicker">Documento controlado SIG</span>
            <h1>{selectedFormat.code} · {selectedFormat.name}</h1>
            <p className="sig-format-description">{selectedFormat.process}</p>
            <div className="sig-format-meta"><span>Versión <b>{selectedFormat.version}</b></span><span>Fecha <b>{selectedFormat.date}</b></span></div>
            <div className="sig-format-preview" aria-label={`Vista previa de ${selectedFormat.code}`}>
              <div className="sig-preview-head"><strong>ANTIOQUEÑA DE INCUBACIÓN S.A.S.</strong><span>SISTEMA INTEGRADO DE GESTIÓN</span></div>
              <div className="sig-preview-title"><b>{selectedFormat.code}</b><span>{selectedFormat.name}</span></div>
              <div className="sig-preview-grid"><span>PROCESO</span><b>{selectedFormat.process}</b><span>VERSIÓN</span><b>{selectedFormat.version}</b><span>FECHA</span><b>{selectedFormat.date}</b></div>
              <div className="sig-preview-lines"><i /><i /><i /><i /></div>
              <small>Documento controlado · Vista previa para exportación</small>
            </div>
            <div className="sig-format-actions"><button type="button" className="sig-asset-primary" onClick={() => handleFormatExport('excel')}>Exportar Excel</button><button type="button" onClick={() => handleFormatExport('pdf')}>Exportar PDF</button></div>
          </div>
        ) : !selectedMachineId ? (
          <div className="h-full flex flex-col items-center justify-center text-slate-400">
            <span className="mb-4 opacity-20" aria-hidden="true">[doc]</span>
            <p>{section === 'documents' ? 'Selecciona un formato para exportarlo' : 'Selecciona un activo para ver su expediente completo'}</p>
          </div>
        ) : dossierLoading ? (
          <div className="h-full flex items-center justify-center"><span aria-hidden="true">...</span> Cargando Dossier...</div>
        ) : dossier ? (
          <div className="sig-dossier">
            <div className="sig-dossier-header">
              <div>
                <h1 className="text-3xl font-bold text-slate-800">{dossier.summary.name}</h1>
                <p className="text-slate-500">Código SIG: {dossier.summary.code} · Serie: {dossier.summary.serial_number || 'Pendiente de registrar'}</p>
              </div>
              <div className="sig-dossier-actions">
                <button onClick={() => handleExport('excel')} className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700 transition-colors">
                  <span aria-hidden="true">↓</span> Excel
                </button>
                <button onClick={() => handleExport('pdf')} className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg text-sm hover:bg-red-700 transition-colors">
                  <span aria-hidden="true">↓</span> PDF
                </button>
              </div>
            </div>
            <div className="sig-dossier-kpis">
              <div className="p-4 bg-white rounded-xl border shadow-sm">
                <span className="text-xs text-slate-400 uppercase font-bold">Adquisición</span>
                <p className="text-lg font-medium">{dossier.summary.acquisition_date || 'N/A'}</p>
                <p className="text-sm text-slate-500">{dossier.summary.installed_at || 'Fecha no registrada'}</p>
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
            <div className="sig-dossier-panel">
              <div className="sig-dossier-tabs" role="tablist">
                {[["history", `Historial (${dossier.history.length})`], ["calibrations", `Calibraciones (${dossier.calibrations.length})`], ["plan", `Plan AM (${dossier.maintenancePlan?.length || 0})`]].map(([tab, label]) => <button key={tab} type="button" className={detailTab === tab ? 'is-active' : ''} onClick={() => setDetailTab(tab)}>{label}</button>)}
              </div>
              <div className="sig-dossier-content">
                {detailTab === 'history' && (
                  <div className="sig-table-wrap">
                    <table><thead><tr><th>Fecha</th><th>Actividad/OT</th><th>Técnico</th><th>Estado</th></tr></thead>
                      <tbody>{dossier.history.map((ot, index) => (
                        <tr key={ot.id || `${ot.code || 'ot'}-${index}`}>
                          <td>{ot.created_at ? new Date(ot.created_at).toLocaleDateString('es-CO') : 'Histórico Mantum'}</td>
                          <td>{ot.description || 'OT Operativa'}</td>
                          <td>{ot.technician_name || ot.profiles?.full_name || 'N/A'}</td>
                          <td>{ot.status || 'Registrada'}</td>
                        </tr>
                      ))}</tbody>
                    </table>
                    {!dossier.history.length && <p className="sig-empty-tab">No hay órdenes históricas registradas para este activo.</p>}
                  </div>
                )}
                {detailTab === 'calibrations' && (
                  dossier.calibrations.length ? <div className="sig-table-wrap"><table><thead><tr><th>Fecha</th><th>Alcance</th><th>Resultado</th></tr></thead><tbody>{dossier.calibrations.map((cal, index) => <tr key={cal.id || index}><td>{cal.calibrated_at ? new Date(cal.calibrated_at).toLocaleDateString('es-CO') : 'Sin fecha'}</td><td>{cal.scope || 'Equipo'}</td><td>{cal.result || cal.status || 'Registrada'}</td></tr>)}</tbody></table></div> : <p className="sig-empty-tab">No hay calibraciones registradas para este activo.</p>
                )}
                {detailTab === 'plan' && (
                  dossier.maintenancePlan?.length ? <div className="sig-table-wrap"><table><thead><tr><th>Actividad</th><th>Frecuencia</th><th>Especialidad</th></tr></thead><tbody>{dossier.maintenancePlan.map((task, index) => <tr key={task.plan_code || index}><td>{task.activity || task.title || 'Actividad preventiva'}</td><td>{task.frequency || 'Programada'}</td><td>{task.specialty || 'Mantenimiento'}</td></tr>)}</tbody></table></div> : <p className="sig-empty-tab">No hay tareas de mantenimiento programadas para este activo.</p>
                )}
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
