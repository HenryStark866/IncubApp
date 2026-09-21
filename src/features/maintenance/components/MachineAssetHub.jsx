import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { supabase } from '../../../lib/supabase';
import { useMachineDossier } from '../hooks/useMachineDossier';
import { useBatches } from '../../../hooks/useBatches';
import { useLoads } from '../../../hooks/useLoads';
import { useWorkOrders } from '../../../hooks/useWorkOrders';
import { exportCorporate } from '../../../lib/exportDocument';
import { MANTUM_EQUIPOS, MANTUM_INVENTORY, MANTUM_HISTORICAL_OTS, getMantumDataForMachine } from '../../../data/mantumCatalog';
import { SIG_FORMATS } from '../../../lib/corporateBrand';
import './MachineAssetHub.css';

const STORAGE_KEY = 'incubapp:sig-asset-hub:custom-assets';

function formatCodeForEvidence(file = {}) {
  const text = `${file.file_name || ''} ${file.note || ''} ${file.workOrderCode || ''}`.toUpperCase();
  return Object.keys(SIG_FORMATS).find((code) => text.includes(code)) || 'EVIDENCIA SIG';
}

function mantumInventoryEvidence() {
  return Object.values(MANTUM_INVENTORY).map((image) => ({
    id: `mantum-image-${image.code}`,
    file_name: image.archivo || `${image.code}.jpg`,
    file_type: 'image',
    file_path: image.url,
    url: image.url,
    formatCode: 'INVENTARIO MANTUM',
    workOrderCode: image.code,
    workOrderTitle: image.nombre,
    note: image.tipo_imagen || 'Imagen del inventario Mantum',
    created_at: null,
    source: 'mantum',
  }));
}

function mantumHistoricalEvidence() {
  return Object.entries(MANTUM_HISTORICAL_OTS).flatMap(([machineCode, orders]) =>
    (orders || []).map((order) => ({
      id: `mantum-ot-${machineCode}-${order.code}`,
      file_name: `OT Mantum ${order.code}`,
      file_type: 'record',
      formatCode: 'FOMAT01',
      workOrderCode: order.code,
      workOrderTitle: order.activity || 'Orden histórica Mantum',
      machineCode,
      note: order.feedback || order.description || order.activity || 'OT histórica Mantum',
      created_at: order.completed_at || order.started_at || order.created_at || null,
      source: 'mantum',
      kind: 'mantum-order',
      url: null,
    }))
  );
}

function sortEvidence(items) {
  return items.sort((a, b) => {
    const aTime = a.created_at ? new Date(a.created_at).getTime() : 0;
    const bTime = b.created_at ? new Date(b.created_at).getTime() : 0;
    return bTime - aTime;
  });
}

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

export function resolveSelectedEvidence({ section, selectedDocumentId, allEvidence = [], documents = [] }) {
  const source = section === 'evidence' ? allEvidence : documents;
  return source.find((file) => file.id === selectedDocumentId) || source[0] || null;
}

export function buildLeaderControlSummary({ machines = [], batches = [], orders = [], loads = [], transfers = [], allEvidence = [] }) {
  const activeOrders = orders.filter((order) => !['completed', 'cancelled'].includes(order.status)).length;
  const productionLotCount = batches.filter((batch) => batch.status === 'production').length;
  const levanteLotCount = batches.filter((batch) => batch.status === 'levante').length;
  const criticalMachines = machines.filter((machine) => String(machine.criticidad || '').toLowerCase() === 'alta').length;

  return [
    { label: 'Producción', value: String(productionLotCount), meta: `${batches.length || 0} lotes activos`, accent: '#0b1428' },
    { label: 'Levante', value: String(levanteLotCount), meta: 'etapa en crecimiento', accent: '#0ea5e9' },
    { label: 'OT activas', value: String(activeOrders), meta: 'mantenimiento', accent: '#f97316' },
    { label: 'Cargues', value: String(loads.length), meta: 'transferencias y cargas', accent: '#10b981' },
    { label: 'Mantum / activos', value: String(machines.length), meta: `${criticalMachines} críticos`, accent: '#a855f7' },
    { label: 'Evidencias', value: String(allEvidence.length), meta: 'fotos y documentos', accent: '#e0740a' },
    { label: 'Transferencias', value: String(transfers.length), meta: 'movimientos', accent: '#14b8a6' },
  ];
}

const MachineAssetHub = ({ orgId }) => {
  const [machines, setMachines] = useState([]);
  const [customAssets, setCustomAssets] = useState(readCustomAssets);
  const [selectedMachineId, setSelectedMachineId] = useState(null);
  const [filterText, setFilterText] = useState('');
  const [filterGroup, setFilterGroup] = useState('all');
  const [detailTab, setDetailTab] = useState('history');
  const [documents, setDocuments] = useState([]);
  const [documentsLoading, setDocumentsLoading] = useState(false);
  const [selectedDocumentId, setSelectedDocumentId] = useState(null);
  const [allEvidence, setAllEvidence] = useState([]);
  const [allEvidenceLoading, setAllEvidenceLoading] = useState(false);
  const [evidenceFilter, setEvidenceFilter] = useState('');
  const [documentFilter, setDocumentFilter] = useState('');
  const [selectedFormatCode, setSelectedFormatCode] = useState('FOMAT03');
  const [section, setSection] = useState('assets');
  const [showNewAsset, setShowNewAsset] = useState(false);
  const [newAsset, setNewAsset] = useState({ code: '', name: '', type: 'Equipo de planta', criticidad: 'Media' });
  const [loading, setLoading] = useState(true);

  const selectedMachine = machines.find((machine) => machine.machine_id === selectedMachineId);
  const remoteMachineId = selectedMachine?.source === 'remote' ? selectedMachine.machine_id : null;
  const { dossier: remoteDossier, loading: dossierLoading } = useMachineDossier(remoteMachineId, orgId);
  const { batches = [] } = useBatches(orgId, orgId || 'leader-area');
  const { loads = [], transfers = [] } = useLoads(orgId, orgId || 'leader-area');
  const { orders = [] } = useWorkOrders(orgId, orgId || 'leader-area');

  const operationSummary = useMemo(() => buildLeaderControlSummary({
    machines,
    batches,
    orders,
    loads,
    transfers,
    allEvidence,
  }), [machines, batches, orders, loads, transfers, allEvidence]);

  const localDossier = useMemo(() => {
    if (!selectedMachine || selectedMachine.source === 'remote') return null;
    const mantum = getMantumDataForMachine(selectedMachine);
    return {
      summary: { ...selectedMachine, ...(mantum.equipo || {}), location: mantum.equipo?.ubicacion_proceso || '' },
      history: mantum.historicalOTs || [],
      calibrations: [],
      maintenancePlan: mantum.maintenancePlan || [],
      components: mantum.components || [],
      imageUrl: mantum.imageUrl || null,
      mantum,
    };
  }, [selectedMachine]);

  const dossier = selectedMachine?.source === 'remote' ? remoteDossier : localDossier;

  const filteredEvidence = useMemo(() => {
    const query = evidenceFilter.trim().toLowerCase();
    if (!query) return allEvidence;
    return allEvidence.filter((file) => [
      file.file_name,
      file.formatCode,
      file.workOrderCode,
      file.workOrderTitle,
      file.machineCode,
      file.note,
      file.source,
    ].some((value) => String(value || '').toLowerCase().includes(query)));
  }, [allEvidence, evidenceFilter]);

  const loadDocuments = useCallback(async () => {
    if (!orgId || !selectedMachine?.machine_id) {
      setDocuments([]);
      return;
    }
    setDocumentsLoading(true);
    try {
      const ordersResult = selectedMachine.source === 'remote'
        ? await supabase
          .from('work_orders')
          .select('id, code, title, machine_id, created_at')
          .eq('org_id', orgId)
          .eq('machine_id', selectedMachine.machine_id)
          .order('created_at', { ascending: false })
        : { data: [], error: null };
      const { data: orders, error: ordersError } = ordersResult;
      if (ordersError) throw ordersError;
      const orderIds = (orders || []).map((order) => order.id);
      const evidenceResult = orderIds.length
        ? await supabase
          .from('wo_evidence')
          .select('id, work_order_id, file_path, file_name, file_type, note, uploaded_by, created_at')
          .eq('org_id', orgId)
          .in('work_order_id', orderIds)
          .order('created_at', { ascending: false })
        : { data: [], error: null };
      if (evidenceResult.error) throw evidenceResult.error;
      let registryQuery = supabase
        .from('sig_evidence')
        .select('id, machine_id, machine_code, source, format_code, title, file_name, file_path, file_type, recorded_at, metadata')
        .eq('org_id', orgId);
      if (selectedMachine.source === 'remote') {
        registryQuery = registryQuery.or(`machine_id.eq.${selectedMachine.machine_id},machine_code.eq.${selectedMachine.code}`);
      } else {
        registryQuery = registryQuery.eq('machine_code', selectedMachine.code);
      }
      const registryResult = await registryQuery.order('recorded_at', { ascending: false });
      const registry = registryResult.error ? [] : (registryResult.data || []);
      const orderMap = Object.fromEntries((orders || []).map((order) => [order.id, order]));
      const resolved = await Promise.all((evidenceResult.data || []).map(async (file) => {
        const { data: signed } = await supabase.storage.from('wo-evidence').createSignedUrl(file.file_path, 3600);
        const order = orderMap[file.work_order_id] || {};
        return { ...file, workOrderCode: order.code, workOrderTitle: order.title, url: signed?.signedUrl || null, formatCode: formatCodeForEvidence({ ...file, workOrderCode: order.code }) };
      }));
      const resolvedRegistry = await Promise.all(registry.map(async (file) => {
        const { data: signed } = await supabase.storage.from('sig-evidence').createSignedUrl(file.file_path, 3600);
        return {
          id: `sig-${file.id}`,
          file_name: file.file_name,
          file_type: file.file_type,
          file_path: file.file_path,
          note: file.title,
          workOrderTitle: file.title,
          formatCode: file.format_code || 'EVIDENCIA SIG',
          created_at: file.recorded_at,
          url: signed?.signedUrl || null,
          source: file.source,
          kind: 'sig-registry',
        };
      }));
      const combined = sortEvidence([...resolved, ...resolvedRegistry]);
      setDocuments(combined);
      setSelectedDocumentId((current) => current && combined.some((file) => file.id === current) ? current : combined[0]?.id || null);
    } catch (error) {
      console.warn('Centro SIG: no se pudieron cargar las evidencias del activo.', error);
      setDocuments([]);
    } finally {
      setDocumentsLoading(false);
    }
  }, [orgId, selectedMachine]);

  useEffect(() => { loadDocuments(); }, [loadDocuments]);

  const loadAllEvidence = useCallback(async () => {
    if (!orgId) return;
    setAllEvidenceLoading(true);
    try {
      const { data: orders, error: ordersError } = await supabase
        .from('work_orders')
        .select('id, code, title, machine_id, created_at, completed_at')
        .eq('org_id', orgId)
        .order('created_at', { ascending: false });
      if (ordersError) throw ordersError;
      const orderIds = (orders || []).map((order) => order.id);
      const [evidenceResult, checksResult, calibrationsResult, reportsResult, machinesResult, registryResult] = await Promise.all([
        orderIds.length
          ? supabase
            .from('wo_evidence')
            .select('id, work_order_id, file_path, file_name, file_type, note, uploaded_by, created_at')
            .eq('org_id', orgId)
            .in('work_order_id', orderIds)
            .order('created_at', { ascending: false })
          : Promise.resolve({ data: [], error: null }),
        supabase
          .from('machine_checks')
          .select('id, machine_id, plant_id, taken_by, taken_at, shift_date, shift_number, hour_slot, condition, notes, photo_path')
          .eq('org_id', orgId)
          .order('taken_at', { ascending: false })
          .limit(2000),
        supabase
          .from('machine_calibrations')
          .select('id, machine_id, work_order_id, performed_by, calibrated_at, scope, notes, photo_calibrator_path, photo_screen_path')
          .eq('org_id', orgId)
          .order('calibrated_at', { ascending: false })
          .limit(500),
        supabase
          .from('round_reports')
          .select('id, user_id, shift_date, shift_code, title, body, created_at')
          .eq('org_id', orgId)
          .order('created_at', { ascending: false })
          .limit(1000),
        supabase.from('machines').select('id, code, name').eq('org_id', orgId),
        supabase
          .from('sig_evidence')
          .select('id, machine_id, machine_code, source, format_code, title, file_name, file_path, file_type, recorded_at, metadata')
          .eq('org_id', orgId)
          .order('recorded_at', { ascending: false })
          .limit(5000),
      ]);
      if (evidenceResult.error) throw evidenceResult.error;
      if (checksResult.error) throw checksResult.error;
      if (calibrationsResult.error) throw calibrationsResult.error;
      if (reportsResult.error) throw reportsResult.error;
      if (machinesResult.error) throw machinesResult.error;
      const evidence = evidenceResult.data || [];
      const orderMap = Object.fromEntries((orders || []).map((order) => [order.id, order]));
      const resolved = await Promise.all((evidence || []).map(async (file) => {
        const { data: signed } = await supabase.storage.from('wo-evidence').createSignedUrl(file.file_path, 3600);
        const order = orderMap[file.work_order_id] || {};
        return { ...file, workOrderCode: order.code, workOrderTitle: order.title, machineId: order.machine_id, url: signed?.signedUrl || null, formatCode: formatCodeForEvidence({ ...file, workOrderCode: order.code }), source: 'incubapp', kind: 'work-order' };
      }));
      const resolvedRegistry = await Promise.all((registryResult.error ? [] : (registryResult.data || [])).map(async (file) => {
        const { data: signed } = await supabase.storage.from('sig-evidence').createSignedUrl(file.file_path, 3600);
        return {
          id: `sig-${file.id}`,
          file_name: file.file_name,
          file_type: file.file_type,
          file_path: file.file_path,
          workOrderCode: file.machine_code,
          workOrderTitle: file.title,
          note: file.title,
          created_at: file.recorded_at,
          source: file.source,
          kind: 'sig-registry',
          formatCode: file.format_code || 'EVIDENCIA SIG',
          url: signed?.signedUrl || null,
        };
      }));
      const machineMap = Object.fromEntries((machinesResult.data || []).map((machine) => [machine.id, machine]));
      const checksByRound = new Map();
      for (const check of checksResult.data || []) {
        const rawShift = check.shift_number || 'T?';
        const shiftCode = String(rawShift).startsWith('T') ? rawShift : `T${rawShift}`;
        const key = `${check.shift_date || 'sin-fecha'}|${shiftCode}|${check.hour_slot || 'H?'}`;
        checksByRound.set(key, [...(checksByRound.get(key) || []), check]);
      }
      const reportsByRound = new Map();
      for (const report of reportsResult.data || []) {
        const key = `${report.shift_date || 'sin-fecha'}|${report.shift_code || 'T?'}`;
        reportsByRound.set(key, [...(reportsByRound.get(key) || []), report]);
      }
      const rounds = await Promise.all(Array.from(checksByRound.entries()).map(async ([key, checks]) => {
        const [shiftDate, shiftNumber, hourSlot] = key.split('|');
        const items = await Promise.all(checks.map(async (check) => {
          if (!check.photo_path) return { ...check, url: null, machine: machineMap[check.machine_id] || null };
          const { data: signed } = await supabase.storage.from('machine-checks').createSignedUrl(check.photo_path, 3600);
          return { ...check, url: signed?.signedUrl || null, machine: machineMap[check.machine_id] || null };
        }));
        const latest = checks.reduce((date, check) => check.taken_at > date ? check.taken_at : date, checks[0]?.taken_at || null);
        return {
          id: `round-${key}`,
          file_name: `Ronda ${shiftDate} · ${shiftNumber} · ${hourSlot}`,
          file_type: 'round',
          formatCode: 'FOMAT04',
          workOrderTitle: 'Ronda de inspección',
          note: `${checks.length} máquinas reportadas en una sola ronda`,
          created_at: latest,
          source: 'incubapp',
          kind: 'round',
          items,
          reports: reportsByRound.get(`${shiftDate}|${shiftNumber}`) || [],
          url: items.find((item) => item.url)?.url || null,
        };
      }));
      for (const [key, reports] of reportsByRound.entries()) {
        if (Array.from(checksByRound.keys()).some((checkKey) => checkKey.startsWith(`${key}|`))) continue;
        const [shiftDate, shiftNumber] = key.split('|');
        rounds.push({
          id: `round-report-${key}`,
          file_name: `Ronda ${shiftDate} · ${shiftNumber}`,
          file_type: 'round',
          formatCode: 'FOMAT04',
          workOrderTitle: 'Reporte de ronda',
          note: `${reports.length} reporte(s) de ronda`,
          created_at: reports[0]?.created_at || null,
          source: 'incubapp',
          kind: 'round',
          items: [],
          reports,
          url: null,
        });
      }
      const calibrations = await Promise.all((calibrationsResult.data || []).map(async (calibration) => {
        const paths = [calibration.photo_calibrator_path, calibration.photo_screen_path].filter(Boolean);
        const urls = await Promise.all(paths.map(async (path) => {
          const { data: signed } = await supabase.storage.from('wo-evidence').createSignedUrl(path, 3600);
          if (signed?.signedUrl) return signed.signedUrl;
          const { data: fallback } = await supabase.storage.from('machine-checks').createSignedUrl(path, 3600);
          return fallback?.signedUrl || null;
        }));
        const machine = machineMap[calibration.machine_id] || {};
        return {
          id: `calibration-${calibration.id}`,
          file_name: `Calibración ${machine.code || 'de máquina'}`,
          file_type: 'calibration',
          formatCode: 'FOMAT08',
          workOrderTitle: machine.name || 'Calibración de máquina',
          note: calibration.notes || `${calibration.scope || 'both'} · evidencia de calibración`,
          created_at: calibration.calibrated_at,
          source: 'incubapp',
          kind: 'calibration',
          items: urls.filter(Boolean).map((url, index) => ({ url, file_name: index === 0 ? 'Foto del calibrador' : 'Foto de pantalla' })),
          url: urls.find(Boolean) || null,
        };
      }));
      const combined = sortEvidence([
        ...resolved,
        ...resolvedRegistry,
        ...rounds,
        ...calibrations,
        ...mantumInventoryEvidence(),
        ...mantumHistoricalEvidence(),
      ]);
      setAllEvidence(combined);
      setSelectedDocumentId((current) => current && combined.some((file) => file.id === current) ? current : combined[0]?.id || null);
    } catch (error) {
      console.warn('Centro SIG: no se pudieron cargar todas las evidencias.', error);
      setAllEvidence(sortEvidence([...mantumInventoryEvidence(), ...mantumHistoricalEvidence()]));
    } finally {
      setAllEvidenceLoading(false);
    }
  }, [orgId]);

  useEffect(() => { loadAllEvidence(); }, [loadAllEvidence]);

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
  const selectedDocument = resolveSelectedEvidence({
    section,
    selectedDocumentId,
    allEvidence,
    documents,
  });

  useEffect(() => {
    if (section !== 'evidence') return;
    if (!allEvidence.length) {
      setSelectedDocumentId(null);
      return;
    }
    if (!selectedDocumentId || !allEvidence.some((file) => file.id === selectedDocumentId)) {
      setSelectedDocumentId(allEvidence[0].id);
    }
  }, [section, allEvidence, selectedDocumentId]);

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
    <div className="sig-asset-hub">
      <div className="sig-asset-sidebar">
        <div className="sig-asset-summary-panel" aria-label="Resumen operativo del líder de área">
          <div className="sig-asset-summary-header">
            <span aria-hidden="true">📊</span>
            <div>
              <strong>Panel de control</strong>
              <small>Producción · mantenimiento · Mantum</small>
            </div>
          </div>
          <div className="sig-asset-summary-grid">
            {operationSummary.map((item) => (
              <div key={item.label} className="sig-asset-summary-card" style={{ '--sig-summary-accent': item.accent }}>
                <span>{item.label}</span>
                <strong>{item.value}</strong>
                <small>{item.meta}</small>
              </div>
            ))}
          </div>
        </div>
        <div className="p-4 border-b space-y-3">
          <h2 className="sig-asset-title">
            <span aria-hidden="true">SIG</span> Centro de Activos
          </h2>
          <div className="sig-asset-nav" role="tablist" aria-label="Secciones del Centro SIG">
            <button type="button" role="tab" aria-selected={section === 'assets'} className={section === 'assets' ? 'is-active' : ''} onClick={() => { setSection('assets'); setSelectedMachineId(null); }}>Activos <b>{machines.length}</b></button>
            <button type="button" role="tab" aria-selected={section === 'documents'} className={section === 'documents' ? 'is-active' : ''} onClick={() => { setSection('documents'); setSelectedMachineId(null); }}>Formatos <b>{Object.keys(SIG_FORMATS).length}</b></button>
            <button type="button" role="tab" aria-selected={section === 'evidence'} className={section === 'evidence' ? 'is-active' : ''} onClick={() => { setSection('evidence'); setSelectedMachineId(null); }}>Evidencias <b>{allEvidence.length}</b></button>
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
          {section === 'evidence' && (
            <div className="sig-asset-section-panel">
              <input
                className="sig-asset-doc-search"
                type="search"
                placeholder="Buscar evidencia, código o máquina..."
                value={evidenceFilter}
                onChange={(e) => setEvidenceFilter(e.target.value)}
                aria-label="Buscar evidencias"
              />
              <div className="sig-evidence-global-list">
                {allEvidenceLoading ? <p className="sig-empty-tab">Cargando evidencias...</p> : !filteredEvidence.length ? <p className="sig-empty-tab">No hay evidencias que coincidan con la búsqueda.</p> : filteredEvidence.map((file) => (
                  <button
                    type="button"
                    key={file.id}
                    className={selectedDocumentId === file.id ? 'is-active' : ''}
                    onClick={() => {
                      setSelectedDocumentId(file.id);
                      setSection('evidence');
                    }}
                  >
                    <strong>{file.formatCode}</strong>
                    <span>{file.file_name}</span>
                    <small>{file.created_at ? new Date(file.created_at).toLocaleString('es-CO') : 'Sin fecha'} · {file.source === 'mantum' ? 'Mantum' : 'IncubApp'}</small>
                  </button>
                ))}
              </div>
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

        {section === 'assets' && <div className="sig-asset-list">
          {filteredMachines.map(m => (
            <button
              type="button"
              key={m.machine_id}
              onClick={() => { setSelectedMachineId(m.machine_id); setDetailTab('history'); }}
              className={`sig-asset-row${selectedMachineId === m.machine_id ? ' is-selected' : ''}`}
            >
              <div className="sig-asset-row-top">
                <div>
                  <span className="sig-asset-code">{m.code}</span>
                  <h3>{m.name}</h3>
                </div>
                <span className="sig-asset-status">
                  {m.status}
                </span>
              </div>
              <div className="sig-asset-row-meta">
                <span><span aria-hidden="true">#</span> {m.type}</span>
                <span><span aria-hidden="true">*</span> {m.criticidad}</span>
              </div>
            </button>
          ))
          }
          {filteredMachines.length === 0 && <p className="p-4 text-sm text-slate-500">No hay activos que coincidan con el filtro.</p>}
        </div >}
      </div >

      <div className="sig-asset-detail">
        {section === 'evidence' ? (
          <div className="sig-format-detail sig-global-evidence-detail">
            <span className="sig-detail-kicker">Repositorio general SIG</span>
            <h1>Evidencias de la organización</h1>
            <p className="sig-format-description">Todas las fotos y documentos cargados desde órdenes de trabajo, calibraciones y procesos de mantenimiento.</p>
            {allEvidenceLoading ? <p className="sig-empty-tab">Cargando evidencias...</p> : selectedDocument ? <div className="sig-evidence-preview"><div className="sig-evidence-preview-head"><div><b>{selectedDocument.formatCode}</b><span>{selectedDocument.file_name}</span><small>{selectedDocument.workOrderCode || selectedDocument.workOrderTitle || 'Evidencia SIG'} · {selectedDocument.created_at ? new Date(selectedDocument.created_at).toLocaleString('es-CO') : 'Sin fecha'}</small></div>{selectedDocument.url && <a href={selectedDocument.url} target="_blank" rel="noopener noreferrer">Abrir archivo</a>}</div>{selectedDocument.kind === 'round' || selectedDocument.kind === 'calibration' ? <div className="sig-evidence-gallery">{(selectedDocument.items || []).map((item, index) => <article key={`${selectedDocument.id}-${item.id || index}`}><div><strong>{item.machine?.code || item.file_name || 'Reporte'}</strong><span>{item.condition || item.notes || ''}</span></div>{item.url ? <img src={item.url} alt={item.file_name || selectedDocument.file_name} /> : <p>{item.notes || 'Sin foto adjunta'}</p>}</article>)}{(selectedDocument.reports || []).map((report) => <article key={report.id}><strong>{report.title || 'Reporte de ronda'}</strong><p>{report.body || 'Reporte sin detalle'}</p></article>)}</div> : selectedDocument.note ? <p>{selectedDocument.note}</p> : null}{selectedDocument.kind !== 'round' && selectedDocument.kind !== 'calibration' && selectedDocument.url && selectedDocument.file_type === 'image' ? <img src={selectedDocument.url} alt={selectedDocument.file_name} /> : selectedDocument.kind !== 'round' && selectedDocument.kind !== 'calibration' && selectedDocument.url && (selectedDocument.file_name || '').toLowerCase().endsWith('.pdf') ? <iframe title={`Vista previa ${selectedDocument.file_name}`} src={selectedDocument.url} /> : null}</div> : <p className="sig-empty-tab">No hay evidencias registradas todavía.</p>}
          </div>
        ) : section === 'documents' ? (
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
                {[["history", `Historial (${dossier.history.length})`], ["calibrations", `Calibraciones (${dossier.calibrations.length})`], ["plan", `Plan AM (${dossier.maintenancePlan?.length || 0})`], ["components", `Componentes (${dossier.components?.length || 0})`], ["documents", `Diligenciados (${documents.length})`]].map(([tab, label]) => <button key={tab} type="button" className={detailTab === tab ? 'is-active' : ''} onClick={() => setDetailTab(tab)}>{label}</button>)}
              </div>
              <div className="sig-dossier-content">
                {detailTab === 'documents' && (
                  <div className="sig-evidence-browser">
                    {documentsLoading ? <p className="sig-empty-tab">Cargando formatos diligenciados...</p> : !documents.length ? <p className="sig-empty-tab">Este activo todavía no tiene formatos o evidencias diligenciadas.</p> : <>
                      <div className="sig-evidence-list">
                        {documents.map((file) => <button type="button" key={file.id} className={file.id === selectedDocumentId ? 'is-active' : ''} onClick={() => setSelectedDocumentId(file.id)}><strong>{file.formatCode}</strong><span>{file.file_name}</span><small>{file.created_at ? new Date(file.created_at).toLocaleDateString('es-CO') : 'Sin fecha'} · {file.workOrderCode || 'Evidencia SIG'}</small></button>)}
                      </div>
                      {selectedDocument && <div className="sig-evidence-preview"><div className="sig-evidence-preview-head"><div><b>{selectedDocument.formatCode}</b><span>{selectedDocument.file_name}</span></div><a href={selectedDocument.url || '#'} target="_blank" rel="noopener noreferrer">Abrir archivo</a></div>{selectedDocument.url && selectedDocument.file_type === 'image' ? <img src={selectedDocument.url} alt={selectedDocument.file_name} /> : selectedDocument.url && (selectedDocument.file_name || '').toLowerCase().endsWith('.pdf') ? <iframe title={`Vista previa ${selectedDocument.file_name}`} src={selectedDocument.url} /> : <p>Este documento está disponible para abrir o descargar.</p>}</div>}
                    </>}
                  </div>
                )}
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
                {detailTab === 'components' && (
                  dossier.components?.length ? <div className="sig-table-wrap"><table><thead><tr><th>Componente</th><th>Especificación</th><th>Estado</th><th>Vida útil</th></tr></thead><tbody>{dossier.components.map((component, index) => <tr key={component.code || index}><td>{component.name || 'Componente'}</td><td>{component.component_spec || component.reference || 'Según ficha Mantum'}</td><td>{component.status || 'Registrado'}</td><td>{component.useful_life_pct != null ? `${component.useful_life_pct}%` : 'S/D'}</td></tr>)}</tbody></table></div> : <p className="sig-empty-tab">No hay componentes registrados para este activo.</p>
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
