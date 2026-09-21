import React, { useState, useMemo } from 'react';
import { supabase } from '../../core/supabase';
import { useMachineDossier } from '../hooks/useMachineDossier';
import { exportToExcel } from '../../lib/exportExcel';
import { exportToPDF } from '../../lib/exportDocument';
import { Loader, FileText, Download, Search, Filter, User, Tool } from 'lucide-react';

const MachineAssetHub = () => {
  const [machines, setMachines] = useState([]);
  const [selectedMachineId, setSelectedMachineId] = useState(null);
  const [filterText, setFilterText] = useState('');
  const [filterGroup, setFilterGroup] = useState('all');
  const [loading, setLoading] = useState(true);

  const { dossier, loading: dossierLoading } = useMachineDossier(selectedMachineId);

  React.useEffect(() => {
    async function loadMachines() {
      const { data, error } = await supabase
        .from('machine_sig_summary')
        .select('*');
      if (!error) setMachines(data);
      setLoading(false);
    }
    loadMachines();
  }, []);

  const filteredMachines = useMemo(() => {
    return machines.filter(m => {
      const matchesText = m.name.toLowerCase().includes(filterText.toLowerCase()) || 
                          m.code.toLowerCase().includes(filterText.toLowerCase());
      const matchesGroup = filterGroup === 'all' || m.criticidad === filterGroup;
      return matchesText && matchesGroup;
    });
  }, [machines, filterText, filterGroup]);

  const handleExport = async (type) => {
    if (!dossier) return;
    const dataToExport = {
      summary: dossier.summary,
      history: dossier.history,
      calibrations: dossier.calibrations
    };
    if (type === 'excel') {
      await exportToExcel(dataToExport, \Dossier_\.xlsx\);
    } else {
      await exportToPDF(dataToExport, \Dossier_\.pdf\);
    }
  };

  if (loading) return <div className="flex justify-center p-10"><Loader className="animate-spin" /> Cargando Activos...</div>;

  return (
    <div className="flex h-screen bg-slate-50 font-sans text-slate-900">
      <div className="w-1/3 border-r bg-white flex flex-col">
        <div className="p-4 border-b space-y-3">
          <h2 className="text-xl font-bold flex items-center gap-2">
            <Tool className="text-blue-600" /> Inventario de Máquinas
          </h2>
          <div className="relative">
            <Search className="absolute left-3 top-2.5 text-slate-400 size-4" />
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
                className={\px-3 py-1 text-xs rounded-full border \\}
              >
                {group === 'all' ? 'Todos' : group}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {filteredMachines.map(m => (
            <div 
              key={m.machine_id}
              onClick={() => setSelectedMachineId(m.machine_id)}
              className={\p-4 border-b cursor-pointer transition-colors \\}
            >
              <div className="flex justify-between items-start">
                <div>
                  <span className="text-xs font-mono text-slate-500">{m.code}</span>
                  <h3 className="font-semibold">{m.name}</h3>
                </div>
                <span className={\	ext-[10px] px-2 py-0.5 rounded-full \\}>
                  {m.status}
                </span>
              </div>
              <div className="mt-2 text-xs text-slate-500 flex gap-3">
                <span className="flex items-center gap-1"><Tool size={12}/> {m.type}</span>
                <span className="flex items-center gap-1"><User size={12}/> {m.criticidad}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-8">
        {!selectedMachineId ? (
          <div className="h-full flex flex-col items-center justify-center text-slate-400">
            <FileText size={48} className="mb-4 opacity-20" />
            <p>Selecciona una máquina para ver su expediente completo</p>
          </div>
        ) : dossierLoading ? (
          <div className="h-full flex items-center justify-center"><Loader className="animate-spin" /> Cargando Dossier...</div>
        ) : dossier ? (
          <div className="space-y-8 animate-in fade-in duration-500">
            <div className="flex justify-between items-start">
              <div>
                <h1 className="text-3xl font-bold text-slate-800">{dossier.summary.name}</h1>
                <p className="text-slate-500">Código SIG: {dossier.summary.code} | Serie: {dossier.summary.serial_number}</p>
              </div>
              <div className="flex gap-2">
                <button onClick={() => handleExport('excel')} className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700 transition-colors">
                  <Download size={16} /> Excel
                </button>
                <button onClick={() => handleExport('pdf')} className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg text-sm hover:bg-red-700 transition-colors">
                  <Download size={16} /> PDF
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
                    {dossier.history.map(ot => (
                      <tr key={ot.id} className="hover:bg-slate-50">
                        <td className="py-3">{new Date(ot.created_at).toLocaleDateString()}</td>
                        <td className="py-3 font-medium">{ot.description || 'OT Operativa'}</td>
                        <td className="py-3">{ot.technician_name || ot.profiles?.full_name || 'N/A'}</td>
                        <td className="py-3">
                          <span className={\px-2 py-0.5 rounded-full text-[10px] \\}>
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
      </div>
    </div>
  );
};

export default MachineAssetHub;
