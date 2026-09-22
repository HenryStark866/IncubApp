import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { supabase } from '../../../lib/supabase';
import { useMachineDossier } from '../hooks/useMachineDossier';
import { exportCorporate } from '../../../lib/exportDocument';
import { MANTUM_EQUIPOS, MANTUM_HISTORICAL_OTS, getMantumDataForMachine } from '../../../data/mantumCatalog';
import { LOCAL_ASSET_EVIDENCE, LOCAL_DOCUMENT_LIBRARY, LOCAL_MAINTENANCE_MANUALS, LOCAL_MANTUM_RESOURCES, LOCAL_SIG_2026_EVIDENCE } from '../../../data/maintenanceManuals';
import { PLANT_ASSET_REGISTRY } from '../../../data/plantAssetRegistry';
import { SIG_FORMATS } from '../../../lib/corporateBrand';
import { maintenanceRecordUrl } from '../../../lib/maintenanceRecordDocument';
import { localListMaps } from '../../../lib/loadClassificationLocalStore';
import { renderLoadMapImage } from '../../../lib/loadMapEngine';
import annualPlanData from '../../../data/annualMaintenancePlanData.json';
import './MachineAssetHub.css';


const STORAGE_KEY = 'incubapp:sig-asset-hub:custom-assets';
const MAINTENANCE_RESPONSIBLE = 'Henry Camilo Taborda Galeano'

function formatCodeForEvidence(file = {}) {
  const text = `${file.file_name || ''} ${file.note || ''} ${file.workOrderCode || ''}`.toUpperCase();
  return Object.keys(SIG_FORMATS).find((code) => text.includes(code)) || 'EVIDENCIA SIG';
}

function splitMantumOrderFeedback(feedback = '', machineCode = '', orderCode = '') {
  const source = String(feedback || '').trim();
  if (!source) {
    return [];
  }

  const segmentPattern = /(?:^|\.\s*)([A-ZÁÉÍÓÚÑÜ][A-Za-zÁÉÍÓÚÑÜáéíóúüñÑ.' -]*?)\s*\[(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2})\s*-\s*(\d{2}:\d{2})\]\s*-\s*([A-Z0-9.-]+)\s*\|/g;
  const matches = [...source.matchAll(segmentPattern)];

  if (!matches.length) {
    return [{
      person: null,
      code: orderCode,
      activity: source,
      created_at: null,
      started_at: null,
      completed_at: null,
      machineCode,
    }];
  }

  return matches.map((match, index) => {
    const startIndex = match.index + match[0].length;
    const nextIndex = matches[index + 1]?.index ?? source.length;
    const activity = source.slice(startIndex, nextIndex).replace(/^[\s:;.-]+/, '').replace(/[\s]+/g, ' ').trim();
    const date = match[2];
    const startedAt = `${date}T${match[3]}:00`;
    const completedAt = `${date}T${match[4]}:00`;

    return {
      person: match[1].trim(),
      code: match[5].trim(),
      activity: activity || match[1].trim(),
      created_at: startedAt,
      started_at: startedAt,
      completed_at: completedAt,
      machineCode,
    };
  });
}

function mantumHistoricalEvidence() {
  const originalFormat = LOCAL_SIG_2026_EVIDENCE.find((file) => /FOMAT01/i.test(file.file_name || file.formatCode || '')) || null;

  return Object.entries(MANTUM_HISTORICAL_OTS).flatMap(([machineCode, orders]) =>
    (orders || []).flatMap((order) => {
      const segments = splitMantumOrderFeedback(order.feedback, machineCode, order.code);
      if (segments.length === 0) {
        return [];
      }

      return segments.map((segment, index) => {
        const recordCode = segment.code || order.code;
        const recordDate = segment.created_at || order.completed_at || order.started_at || order.created_at || null;
        const recordUrl = originalFormat?.url || maintenanceRecordUrl({
          machineCode,
          activity: segment.activity || order.activity,
          description: order.description || segment.activity || order.activity,
          feedback: `${segment.person || ''} · ${segment.activity || order.feedback || 'Actividad registrada en Mantum'}`,
          date: recordDate,
          code: recordCode,
        });

        return {
          id: `mantum-ot-${machineCode}-${recordCode}-${index}`,
          file_name: `OT Mantum ${recordCode}`,
          file_type: 'record',
          formatCode: 'FOMAT01',
          workOrderCode: recordCode,
          workOrderTitle: segment.activity || order.activity || 'Orden histórica Mantum',
          machineCode,
          note: `${segment.activity || order.feedback || order.description || order.activity || 'OT histórica Mantum'} · Responsable: ${segment.person || MAINTENANCE_RESPONSIBLE}`,
          created_at: recordDate,
          source: 'mantum',
          kind: 'mantum-order',
          sourceFile: originalFormat,
          url: recordUrl,
          downloadName: `FOMAT01-${recordCode || 'OT-Mantum'}.html`,
        };
      });
    })
  );
}

export function mantumHistoricalEvidenceForMachine(machine = {}) {
  const machineCode = String(machine.code || machine.mantum_code || machine.machine_id || '').trim().toUpperCase();
  if (!machineCode) return [];

  return mantumHistoricalEvidence().filter((entry) => {
    const entryCode = String(entry.machineCode || '').trim().toUpperCase();
    return entryCode === machineCode || entryCode.includes(machineCode) || machineCode.includes(entryCode);
  });
}

export function dedupeEvidence(items = []) {
  const seen = new Map();
  for (const item of items) {
    if (!item) continue;
    const key = [
      item.id,
      item.file_name,
      item.workOrderCode,
      item.machineCode,
      item.kind,
      item.created_at,
      item.url,
    ].filter((value) => value != null && value !== '').join('::');

    if (!seen.has(key)) seen.set(key, item);
  }
  return Array.from(seen.values());
}

export function isCurrentYearEvidence(item = {}) {
  const value = item.created_at || item.recorded_at || item.createdAt || null;
  if (!value) return true;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return true;
  return date.getFullYear() === new Date().getFullYear();
}

export function sortEvidence(items) {
  const currentYear = new Date().getFullYear();
  return dedupeEvidence(items).sort((a, b) => {
    const aDate = a.created_at ? new Date(a.created_at) : null;
    const bDate = b.created_at ? new Date(b.created_at) : null;
    const aIsCurrentYear = aDate && !Number.isNaN(aDate.getTime()) && aDate.getFullYear() === currentYear ? 1 : 0;
    const bIsCurrentYear = bDate && !Number.isNaN(bDate.getTime()) && bDate.getFullYear() === currentYear ? 1 : 0;
    if (aIsCurrentYear !== bIsCurrentYear) return bIsCurrentYear - aIsCurrentYear;
    const aTime = aDate ? aDate.getTime() : 0;
    const bTime = bDate ? bDate.getTime() : 0;
    return bTime - aTime;
  });
}

function catalogMachines() {
  const plantAssets = PLANT_ASSET_REGISTRY.map((asset) => ({
    machine_id: `plant-${asset.code}`,
    code: asset.code,
    name: asset.name,
    type: asset.type || 'Infraestructura',
    criticidad: asset.criticidad || 'Media',
    status: asset.status || 'En operación',
    serial_number: '',
    source: 'plant',
    catalogKey: asset.code,
    roomType: asset.roomType || null,
  }));

  return [
    ...plantAssets,
    ...Object.entries(MANTUM_EQUIPOS).map(([key, item]) => ({
      machine_id: `catalog-${key}`,
      code: item.mantum_code || key,
      name: item.nombre || `Activo ${key}`,
      type: item.tipo || 'Equipo de planta',
      criticidad: item.criticidad || 'Media',
      status: item.estado_mantum || 'En operación',
      serial_number: item.serial_number || '',
      source: 'catalog',
      catalogKey: key,
    })),
  ];
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

function normalizeStoredLoadMap(map = {}) {
  const payload = map.payload && typeof map.payload === 'object' ? map.payload : {};
  const merged = { ...map, ...payload, id: map.id || payload.id || `local-load-map-${Date.now()}-${Math.random().toString(16).slice(2)}` };
  const previewUrl = resolveLoadMapPreviewUrl(merged) || merged.url || merged.file_path || merged.filePath || null;
  return {
    ...merged,
    id: String(merged.id),
    kind: 'load-map',
    source: 'local',
    file_name: merged.file_name || merged.fileName || `Mapa de cargue · ${merged.lote || merged.machineName || 'Sin lote'}`,
    file_type: merged.file_type || (previewUrl && /^data:image\//i.test(previewUrl) ? 'image' : 'image'),
    url: previewUrl,
    imageDataUrl: merged.imageDataUrl || payload.imageDataUrl || null,
    image_path: merged.image_path || merged.imagePath || payload.image_path || payload.imagePath || null,
    mapStatus: merged.mapStatus || merged.status || 'approved',
    status: merged.status || merged.mapStatus || 'approved',
    generatedBy: merged.generatedBy || merged.created_by || 'No registrado',
    approvedBy: merged.approvedBy || merged.approved_by || 'Sin aprobación',
    loadedBy: merged.loadedBy || merged.loaded_by || 'Sin carga',
    createdAt: merged.createdAt || merged.created_at || null,
    machineName: merged.machineName || merged.machine_name || merged.machine_id || null,
    lote: merged.lote || payload.lote || null,
    machine_id: merged.machine_id || payload.machine_id || null,
  };
}

export function readLocalLoadMapsForOrg(orgId) {
  if (!orgId || typeof globalThis === 'undefined' || !globalThis.localStorage) return [];
  try {
    return (localListMaps(orgId) || []).map(normalizeStoredLoadMap).filter(Boolean);
  } catch {
    return [];
  }
}

async function syncLocalLoadMapsToRemote(orgId, localMaps = []) {
  if (!orgId || !Array.isArray(localMaps) || !localMaps.length) return;
  const rows = localMaps
    .filter((map) => map && (map.status === 'approved' || map.status === 'ordered' || map.status === 'completed' || map.status === 'pending_approval' || map.status === 'draft'))
    .map((map) => ({
      id: map.id,
      org_id: orgId,
      machine_id: map.machineId || map.machine_id || null,
      machine_name: map.machineName || map.machine_name || null,
      plant_id: map.plantId || map.plant_id || null,
      status: map.status || 'draft',
      payload: {
        ...map,
        file_name: map.file_name || map.fileName || 'Mapa de cargue',
        imageDataUrl: map.imageDataUrl || null,
      },
      image_path: map.image_path || map.imagePath || null,
      created_by: map.createdBy || map.created_by || null,
      created_at: map.createdAt || map.created_at || new Date().toISOString(),
      approved_at: map.approvedAt || null,
      approved_by: map.approvedBy || null,
      ordered_at: map.orderedAt || null,
      ordered_by: map.orderedBy || null,
      loaded_at: map.loadedAt || null,
      loaded_by: map.loadedBy || null,
      rejected_reason: map.rejectedReason || null,
    }));

  if (!rows.length) return;

  try {
    await supabase.from('load_maps').upsert(rows, { onConflict: 'id' });
  } catch {
    // Fall back silencioso: el centro de activos ya puede pintar desde localStorage.
  }
}

export function isPdfCandidate(file = {}) {
  const fileName = String(file.file_name || file.name || '').toLowerCase();
  const fileUrl = String(file.url || file.file_path || '').toLowerCase();
  const fileType = String(file.file_type || '').toLowerCase();
  return fileType === 'pdf' || /\.pdf($|[?#])/.test(fileUrl) || /\.pdf$/i.test(fileName);
}

async function downloadFile(file) {
  const sourceUrl = file?.url || file?.file_path;
  const downloadName = file?.downloadName || file?.file_name || 'documento';
  if (!sourceUrl) return;

  try {
    const response = await fetch(sourceUrl, { mode: 'cors' });
    if (response.ok) {
      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = blobUrl;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.download = downloadName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(blobUrl), 0);
      return;
    }
  } catch {
    // Continuamos con el fallback del navegador para asegurar compatibilidad.
  }

  const fallbackLink = document.createElement('a');
  fallbackLink.href = sourceUrl;
  fallbackLink.target = '_blank';
  fallbackLink.rel = 'noopener noreferrer';
  fallbackLink.download = downloadName;
  document.body.appendChild(fallbackLink);
  fallbackLink.click();
  fallbackLink.remove();
}

function loadMapDocumentUrl(load) {
  const esc = (value) => String(value ?? 'No registrado').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]))
  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Mapa de cargue ${esc(load.lote)}</title><style>body{font-family:Arial;color:#202634;margin:36px}h1{color:#0b1428}table{border-collapse:collapse;width:100%}td{border:1px solid #cbd5e1;padding:9px}td:first-child{font-weight:bold;background:#f3f6fa;width:30%}.stamp{color:#e0740a;font-weight:bold}</style></head><body><div class="stamp">ANTIOQUEÑA DE INCUBACIÓN S.A.S. · SISTEMA INTEGRADO DE GESTIÓN</div><h1>MAPA DE CARGUE · PRODUCCIÓN</h1><table><tr><td>Lote</td><td>${esc(load.lote)}</td></tr><tr><td>Incubadora</td><td>${esc(load.machine_code || load.machine_id)}</td></tr><tr><td>Fecha de cargue</td><td>${esc(load.loaded_at || load.created_at)}</td></tr><tr><td>Cinta / clasificación</td><td>${esc(load.tape_color_name || load.tape_color)}</td></tr><tr><td>Registrado por</td><td>${esc(load.created_by)}</td></tr></table><p>Mapa de cargue generado desde el registro operativo de producción.</p></body></html>`
  return `data:text/html;charset=utf-8,${encodeURIComponent(html)}`
}

async function backfillLoadMapImages(orgId, maps) {
  const pending = maps.filter((map) => !map.imagePath && !map.imageDataUrl && map.slots?.length);
  if (!pending.length) return maps;

  const updated = await Promise.all(pending.map(async (map) => {
    try {
      const rendered = await renderLoadMapImage(map);
      if (!rendered?.blob) return map;
      const imagePath = `${orgId}/load-maps/${map.rawId || map.id}.png`;
      const { error: uploadError } = await supabase.storage
        .from('machine-checks')
        .upload(imagePath, rendered.blob, { contentType: 'image/png', upsert: true });
      if (uploadError) {
        console.warn('Centro SIG: no se pudo subir imagen de mapa', uploadError.message);
        return map;
      }
      const payload = { ...(map.payload || {}), imagePath };
      const { error } = await supabase
        .from('load_maps')
        .update({ image_path: imagePath, payload })
        .eq('id', map.rawId || map.id)
        .eq('org_id', orgId);
      if (error) {
        console.warn('Centro SIG: no se pudo registrar imagen de mapa', error.message);
        return map;
      }
      return { ...map, imagePath, payload };
    } catch (error) {
      console.warn('Centro SIG: no se pudo generar imagen de mapa', error);
      return map;
    }
  }));

  const byId = new Map(updated.map((map) => [map.id, map]));
  return maps.map((map) => byId.get(map.id) || map);
}

export function resolveLoadMapPreviewUrl(file = {}) {
  const payload = typeof file.payload === 'string'
    ? (() => { try { return JSON.parse(file.payload); } catch { return {}; } })()
    : (file.payload && typeof file.payload === 'object' ? file.payload : {});

  const candidates = [
    file.imageDataUrl,
    file.imageDataURL,
    file.image_url,
    file.imageUrl,
    file.imagePath,
    file.image_path,
    payload.imageDataUrl,
    payload.imageDataURL,
    payload.image_url,
    payload.imageUrl,
    payload.imagePath,
    payload.image_path,
    file.photo_path,
    file.photoPath,
    payload.photo_path,
    payload.photoPath,
    file.url,
    file.file_path,
    file.filePath,
  ];

  return candidates.find((value) => typeof value === 'string' && value.trim()) || null;
}

export function resolveSigFormatCatalog(formats = Object.values(SIG_FORMATS)) {
  const catalogByCode = new Map();

  for (const file of LOCAL_DOCUMENT_LIBRARY) {
    const match = String(file.file_name || '').match(/^(FOMAT\d+|CAMAT\d+|PROMAT\d+|PRGMAT\d+|INMAT\d+)/i);
    if (!match) continue;
    catalogByCode.set(match[1].toUpperCase(), file);
  }

  return (formats || []).map((format) => {
    const code = String(format.code || format.id || '').toUpperCase();
    const sourceFile = catalogByCode.get(code) || null;
    return {
      ...format,
      code,
      file_name: sourceFile?.file_name || `${code} ${format.name || 'Formato SIG'}`,
      sourceFile,
      url: sourceFile?.url || null,
    };
  });
}

export function shiftNumberForTimestamp(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const hour = date.getHours();
  if (hour >= 6 && hour < 14) return 1;
  if (hour >= 14 && hour < 22) return 2;
  return 3;
}

export function shiftDateForTimestamp(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const shift = shiftNumberForTimestamp(date);
  if (shift === 3 && date.getHours() < 6) {
    const adjusted = new Date(date);
    adjusted.setDate(adjusted.getDate() - 1);
    return adjusted.toISOString().slice(0, 10);
  }
  return date.toISOString().slice(0, 10);
}

export function resolveLoadedByName({ loadedAt, loadedBy, people = {}, shiftAssignments = [] } = {}) {
  const fallback = people[loadedBy] || loadedBy || 'Sin carga';
  if (!loadedAt) return fallback || 'Sin carga';

  const loadedDate = new Date(loadedAt);
  if (Number.isNaN(loadedDate.getTime())) return fallback || 'Sin carga';

  const shiftNumber = shiftNumberForTimestamp(loadedDate);
  const shiftDate = shiftDateForTimestamp(loadedDate);
  if (!shiftNumber || !shiftDate) return fallback || 'Sin carga';

  const currentShiftOperator = (shiftAssignments || []).find((assignment) => {
    if (assignment.is_rest) return false;
    return Number(assignment.shift_number) === Number(shiftNumber) && String(assignment.work_date || '').slice(0, 10) === String(shiftDate);
  });

  return people[currentShiftOperator?.user_id] || fallback || 'Sin carga';
}

function ManualPreview({ file, showMeta = false }) {
  if (!file) return <p className="sig-empty-tab">Selecciona un manual o instructivo.</p>

  const previewUrl = resolveLoadMapPreviewUrl(file) || file.url || file.file_path;
  const isImage =
    file.file_type === 'image' ||
    /^data:image\//i.test(previewUrl || '') ||
    /^blob:/i.test(previewUrl || '') ||
    /\.(png|jpe?g|gif|webp|svg)$/i.test(file.file_name || '') ||
    /\.(png|jpe?g|gif|webp|svg)$/i.test(previewUrl || '');
  const isPdf = isPdfCandidate(file);
  const isHtmlDocument = file.kind === 'mantum-order' || /^data:text\/html/i.test(previewUrl || '') || /\.html?($|[?#])/i.test(file.file_name || '') || /\.html?($|[?#])/i.test(previewUrl || '');
  const isHtml = !isImage && !!previewUrl && (!isPdf && !/\.(doc|docx|xlsx|csv|zip)$/i.test(file.file_name || '')) && (file.kind === 'load-map' || isHtmlDocument);
  const loadMapMeta = file.kind === 'load-map' ? [
    { label: 'Generó', value: file.generatedBy || 'No registrado' },
    { label: 'Aprobó', value: file.approvedBy || 'Sin aprobación' },
    { label: 'Cargó', value: file.loadedBy || 'Sin carga' },
    { label: 'Lote', value: file.lote || 'No registrado' },
    { label: 'Máquina', value: file.machineName || file.machine_id || file.machineCode || 'No registrada' },
  ] : []

  return (
    <div className="sig-manual-reader">
      <div className="sig-manual-reader-head">
        <div>
          <b>{file.source === 'mantum' ? 'MANTUM' : file.source === 'local' ? 'LOCAL' : file.kind === 'load-map' ? 'MAPA' : 'SIG'}</b>
          <strong title={file.file_name}>{file.file_name}</strong>
          <small>{file.kind === 'load-map' ? `Generó: ${file.generatedBy || 'No registrado'} · Aprobó: ${file.approvedBy || 'Sin aprobación'} · Cargó: ${file.loadedBy || 'Sin carga'}` : `${file.machineCode || 'Documento general'} · ${file.workOrderTitle || file.note || 'Manual / instructivo'}`}</small>
        </div>
        <button type="button" className="sig-download-button" onClick={() => downloadFile(file)} title="Descargar documento" aria-label={`Descargar ${file.file_name}`}>
          ↓
        </button>
      </div>
      {showMeta && loadMapMeta.length > 0 && (
        <div className="sig-loadmap-meta-list" aria-label="Datos del mapa de cargue">
          {loadMapMeta.map((item) => (
            <div key={item.label} className="sig-loadmap-meta-item">
              <span>{item.label}</span>
              <strong>{item.value}</strong>
            </div>
          ))}
        </div>
      )}
      <div className="sig-manual-reader-body">
        {isImage && previewUrl ? <img src={previewUrl} alt={file.file_name} /> : isPdf && previewUrl ? (
          <iframe className="sig-manual-pdf" title={`Vista previa ${file.file_name}`} src={previewUrl} />
        ) : isHtml && previewUrl ? <iframe className="sig-manual-document" title={`Vista previa ${file.file_name}`} src={previewUrl} /> : <p>Este formato no tiene visor nativo en el navegador. Usa el botón de descarga para abrirlo con su aplicación correspondiente.</p>}
      </div>
    </div>
  )
}

export function resolveSelectedEvidence({ section, selectedDocumentId, allEvidence = [], documents = [] }) {
  const source = section === 'evidence' ? allEvidence : documents;
  return source.find((file) => file.id === selectedDocumentId) || source[0] || null;
}

function isManualRecord(file = {}) {
  if (file.kind === 'mantum-media' || file.kind === 'mantum-resource') return false;
  const path = `${file.sourcePath || ''} ${file.file_name || ''}`.toLowerCase()
  if (/formatos|registros|indicadores|\.xlsx?|\.csv|\.zip|\.md/.test(path)) return false
  if (file.source === 'mantum') return /\.pdf$|\.docx?$/.test(path)
  return /procedimientos|manual|instructiv|procedimiento/.test(path)
}

function getWeekOfYear(date = new Date()) {
  const target = new Date(date.valueOf());
  const dayNumber = (date.getDay() + 6) % 7;
  target.setDate(target.getDate() - dayNumber + 3);
  const firstThursday = target.valueOf();
  target.setMonth(0, 1);
  if (target.getDay() !== 4) {
    target.setMonth(0, 1 + ((4 - target.getDay() + 7) % 7));
  }
  return 1 + Math.round((firstThursday - target) / 604800000);
}

const MachineAssetHub = ({ orgId, onEvidenceLoaded }) => {
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
  const [manualFilter, setManualFilter] = useState('');
  const [loadMapFilter, setLoadMapFilter] = useState('');
  const [loadMaps, setLoadMaps] = useState([]);
  const [selectedLoadMapId, setSelectedLoadMapId] = useState(null);
  const [documentFilter, setDocumentFilter] = useState('');
  const [selectedFormatCode, setSelectedFormatCode] = useState('FOMAT03');
  const [section, setSection] = useState('assets');
  const [showNewAsset, setShowNewAsset] = useState(false);
  const [newAsset, setNewAsset] = useState({ code: '', name: '', type: 'Equipo de planta', criticidad: 'Media' });
  const [loading, setLoading] = useState(true);

  // Estados del Plan Anual de Mantenimiento (PRGMAT01)
  const [annualPlanSubTab, setAnnualPlanSubTab] = useState('preventive'); // 'preventive', 'cronograma', 'corrective', 'registros'
  const [planSedeFilter, setPlanSedeFilter] = useState('all');
  const [planSystemFilter, setPlanSystemFilter] = useState('all');
  const [planTypeFilter, setPlanTypeFilter] = useState('all');
  const [planSearchText, setPlanSearchText] = useState('');
  const [selectedTaskCode, setSelectedTaskCode] = useState(null);
  const [selectedRegistroFileId, setSelectedRegistroFileId] = useState(null);


  // Memos de filtrado para el Plan Anual
  const filteredAnnualTasks = useMemo(() => {
    const query = planSearchText.trim().toLowerCase();
    return (annualPlanData.tasks || []).filter((task) => {
      const matchesSede = planSedeFilter === 'all' || task.sede === planSedeFilter;
      const matchesSystem = planSystemFilter === 'all' || task.system === planSystemFilter;
      const matchesType = planTypeFilter === 'all'
        ? true
        : planTypeFilter === 'critical'
          ? task.isCriticalSecurity
          : planTypeFilter === 'biosecurity'
            ? task.isBiosecurity
            : task.type === planTypeFilter;
      const matchesQuery = !query || [
        task.code,
        task.system,
        task.equipmentClass,
        task.applyingEquipment,
        task.description,
        task.responsible,
        task.evidenceFormat
      ].some((val) => String(val || '').toLowerCase().includes(query));

      return matchesSede && matchesSystem && matchesType && matchesQuery;
    });
  }, [planSedeFilter, planSystemFilter, planTypeFilter, planSearchText]);

  const filteredAnnualCorrectives = useMemo(() => {
    const query = planSearchText.trim().toLowerCase();
    return (annualPlanData.correctives || []).filter((c) => {
      const matchesSystem = planSystemFilter === 'all' || c.system === planSystemFilter;
      const matchesQuery = !query || [
        c.taskCode,
        c.activity,
        c.equipmentCode,
        c.equipmentName,
        c.system,
        c.specialty
      ].some((val) => String(val || '').toLowerCase().includes(query));

      return matchesSystem && matchesQuery;
    });
  }, [planSystemFilter, planSearchText]);

  const filteredAnnualRegistros = useMemo(() => {
    const query = planSearchText.trim().toLowerCase();
    return (annualPlanData.registrosFiles || []).filter((f) => {
      const matchesQuery = !query || [
        f.name,
        f.formatCode,
        f.machineCode,
        f.relPath
      ].some((val) => String(val || '').toLowerCase().includes(query));

      return matchesQuery;
    });
  }, [planSearchText]);


  useEffect(() => {
    if (!orgId) return undefined
    let active = true

    const loadAllMaps = async () => {
      try {
        const [mapsResult, membersResult, shiftsResult] = await Promise.all([
          supabase.from('load_maps').select('id, plant_id, machine_id, machine_name, status, payload, image_path, approved_at, approved_by, ordered_at, ordered_by, created_by, created_at, loaded_at, loaded_by').eq('org_id', orgId).order('created_at', { ascending: false }).limit(400),
          supabase.from('organization_members').select('user_id, profiles(full_name, email)').eq('org_id', orgId),
          supabase.from('shift_assignments').select('user_id, work_date, shift_number, is_rest').eq('org_id', orgId).order('work_date', { ascending: true }),
        ])

        const people = Object.fromEntries((membersResult.data || []).map((row) => [row.user_id, row.profiles?.full_name || row.profiles?.email || row.user_id]))
        const shiftAssignments = shiftsResult.data || []
        const remoteMaps = mapsResult.error ? [] : await Promise.all((mapsResult.data || []).map(async (map) => {
          const payload = map.payload && typeof map.payload === 'object' ? map.payload : {}
          const signed = map.image_path ? await supabase.storage.from('machine-checks').createSignedUrl(map.image_path, 3600) : { data: null }
          const previewImageUrl = signed.data?.signedUrl || payload.imageDataUrl || payload.imageDataURL || payload.imagePath || payload.image_path || null
          const firstLot = payload.slots?.find((slot) => slot.entry)?.entry?.lots?.[0]?.lot || payload.slots?.find((slot) => slot.entry)?.entry?.lot || payload.lot || 'Sin lote'
          const loadedBy = resolveLoadedByName({
            loadedAt: map.loaded_at || payload.loaded_at || payload.loadedBy,
            loadedBy: payload.loaded_by || map.loaded_by || payload.loadedBy,
            people,
            shiftAssignments,
          })
          return {
            ...map,
            ...payload,
            id: `load-map-${map.id}`,
            rawId: map.id,
            file_name: `Mapa de cargue · ${firstLot}`,
            file_type: previewImageUrl && /^data:image\//i.test(previewImageUrl) || previewImageUrl && /^blob:/i.test(previewImageUrl) ? 'image' : previewImageUrl ? 'image' : 'document',
            url: previewImageUrl || loadMapDocumentUrl({ ...map, ...payload, lote: firstLot, machine_id: map.machine_name || map.machine_id }),
            downloadName: `mapa-cargue-${firstLot || map.id}.${previewImageUrl ? 'png' : 'html'}`,
            formatCode: 'MAPA DE CARGUE',
            source: 'incubapp',
            kind: 'load-map',
            generatedBy: people[map.created_by] || map.created_by || 'No registrado',
            approvedBy: people[map.approved_by] || map.approved_by || 'Pendiente',
            loadedBy,
            mapStatus: map.status,
            createdAt: map.created_at,
            approvedAt: map.approved_at,
            orderedAt: map.ordered_at,
          }
        }))

        const localMaps = readLocalLoadMapsForOrg(orgId)
        const mergedMap = new Map()
        
        // Agregar primero los remotos, luego locales sin duplicar por ID canónico
        for (const entry of [...remoteMaps, ...localMaps]) {
          if (!entry) continue
          const cleanId = String(entry.rawId || entry.id || '').replace(/^(?:load-map-|local-load-map-)/, '')
          const key = cleanId || `${entry.machine_id || 'map'}-${entry.createdAt || entry.created_at || entry.file_name}`
          if (!mergedMap.has(key)) {
            mergedMap.set(key, entry)
          } else {
            // Si ya existe, combinar metadatos para preservar aprobación e imágenes
            const existing = mergedMap.get(key)
            mergedMap.set(key, { ...existing, ...entry, url: entry.url || existing.url })
          }
        }

        const nextMaps = await backfillLoadMapImages(orgId, Array.from(mergedMap.values()))
        if (active) {
          setLoadMaps(nextMaps)
          setSelectedLoadMapId((current) => current && nextMaps.some((map) => map.id === current) ? current : nextMaps[0]?.id || null)
        }

        if ((!mapsResult.error && remoteMaps.length === 0 && localMaps.length > 0) || (mapsResult.error && localMaps.length > 0)) {
          await syncLocalLoadMapsToRemote(orgId, localMaps)
        }
      } catch (err) {
        console.warn('Centro SIG: Error al cargar mapas de cargue', err)
      }
    }

    loadAllMaps()

    // Escuchar eventos en vivo de actualización de mapas (aprobación / generación)
    const handleUpdateEvent = () => { loadAllMaps() }
    if (typeof window !== 'undefined') {
      window.addEventListener('incubapp:load-maps-updated', handleUpdateEvent)
      window.addEventListener('storage', handleUpdateEvent)
    }

    // Suscripción a cambios en tiempo real en Supabase
    const channel = supabase
      .channel(`load_maps_changes_${orgId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'load_maps', filter: `org_id=eq.${orgId}` }, () => {
        loadAllMaps()
      })
      .subscribe()

    return () => {
      active = false
      if (typeof window !== 'undefined') {
        window.removeEventListener('incubapp:load-maps-updated', handleUpdateEvent)
        window.removeEventListener('storage', handleUpdateEvent)
      }
      supabase.removeChannel(channel)
    }
  }, [orgId])

  const filteredLoadMaps = useMemo(() => {
    const query = loadMapFilter.trim().toLowerCase()
    if (!query) return loadMaps
    return loadMaps.filter((map) => [map.lote, map.machine_id, map.tape_color_name, map.tape_color, map.file_name].some((value) => String(value || '').toLowerCase().includes(query)))
  }, [loadMaps, loadMapFilter])

  const selectedMachine = machines.find((machine) => machine.machine_id === selectedMachineId);
  const remoteMachineId = selectedMachine?.source === 'remote' ? selectedMachine.machine_id : null;
  const { dossier: remoteDossier, loading: dossierLoading } = useMachineDossier(remoteMachineId, orgId);

  const localDossier = useMemo(() => {
    if (!selectedMachine || selectedMachine.source === 'remote') return null;
    const mantum = getMantumDataForMachine(selectedMachine);
    const code = String(selectedMachine.code || selectedMachine.mantum_code || '').trim().toUpperCase();
    const name = String(selectedMachine.name || '').trim().toUpperCase();
    const matchedOfficialPlan = (annualPlanData.tasks || []).filter((task) => {
      const applying = String(task.applyingEquipment || '').toUpperCase();
      const eqClass = String(task.equipmentClass || '').toUpperCase();
      const sys = String(task.system || '').toUpperCase();

      if (code && applying.includes(code)) return true;
      if (code && eqClass.includes(code)) return true;
      if (name && eqClass.includes(name)) return true;
      if (name && sys.length > 3 && name.includes(sys)) return true;
      return false;
    });

    return {
      summary: { ...selectedMachine, ...(mantum.equipo || {}), location: mantum.equipo?.ubicacion_proceso || '' },
      history: mantum.historicalOTs || [],
      calibrations: [],
      maintenancePlan: matchedOfficialPlan.length > 0 ? matchedOfficialPlan : (mantum.maintenancePlan || []),
      components: mantum.components || [],
      imageUrl: mantum.imageUrl || null,
      images: mantum.images || [],
      mantum,
    };
  }, [selectedMachine]);

  const dossier = selectedMachine?.source === 'remote' ? remoteDossier : localDossier;

  const localAssetEvidence = useMemo(() => [...LOCAL_ASSET_EVIDENCE], []);

  const filteredEvidence = useMemo(() => {
    const query = evidenceFilter.trim().toLowerCase();
    const base = dedupeEvidence([...allEvidence, ...localAssetEvidence, ...LOCAL_DOCUMENT_LIBRARY]);
    if (!query) return base;
    return base.filter((file) => [
      file.file_name,
      file.formatCode,
      file.workOrderCode,
      file.workOrderTitle,
      file.machineCode,
      file.note,
      file.source,
    ].some((value) => String(value || '').toLowerCase().includes(query)));
  }, [allEvidence, evidenceFilter, localAssetEvidence]);

  const manuals = useMemo(
    () => [...allEvidence, ...LOCAL_MAINTENANCE_MANUALS, ...LOCAL_MANTUM_RESOURCES].filter(isManualRecord),
    [allEvidence]
  );
  const filteredManuals = useMemo(() => {
    const query = manualFilter.trim().toLowerCase();
    if (!query) return manuals;
    return manuals.filter((file) => [
      file.file_name,
      file.note,
      file.workOrderTitle,
      file.workOrderCode,
      file.machineCode,
      file.sourcePath,
      file.source,
    ].some((value) => String(value || '').toLowerCase().includes(query)));
  }, [manualFilter, manuals]);

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
          sourcePath: file.metadata?.source_path || file.file_path,
          metadata: file.metadata || {},
          note: file.title,
          workOrderTitle: file.title,
          formatCode: file.format_code || 'EVIDENCIA SIG',
          created_at: file.recorded_at,
          url: signed?.signedUrl || null,
          source: file.source,
          kind: 'sig-registry',
        };
      }));
      const historicalOrders = selectedMachine?.source !== 'remote' ? mantumHistoricalEvidenceForMachine(selectedMachine) : [];
      const combined = sortEvidence([...resolved, ...resolvedRegistry, ...historicalOrders]);
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
        ...mantumHistoricalEvidence(),
        ...LOCAL_DOCUMENT_LIBRARY,
      ]);
      const currentYearEvidence = combined.filter(isCurrentYearEvidence);
      setAllEvidence(currentYearEvidence);
      onEvidenceLoaded?.(currentYearEvidence);
      setSelectedDocumentId((current) => current && currentYearEvidence.some((file) => file.id === current) ? current : currentYearEvidence[0]?.id || null);
    } catch (error) {
      console.warn('Centro SIG: no se pudieron cargar todas las evidencias.', error);
      const fallbackEvidence = sortEvidence([
        ...mantumHistoricalEvidence(),
        ...LOCAL_DOCUMENT_LIBRARY,
      ]).filter(isCurrentYearEvidence);
      setAllEvidence(fallbackEvidence);
      onEvidenceLoaded?.(fallbackEvidence);
    } finally {
      setAllEvidenceLoading(false);
    }
  }, [onEvidenceLoaded, orgId]);

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

  const filteredFormats = useMemo(() => resolveSigFormatCatalog(Object.values(SIG_FORMATS)).filter((format) => {
    const query = documentFilter.toLowerCase();
    return !query || `${format.code} ${format.name} ${format.process}`.toLowerCase().includes(query);
  }), [documentFilter]);

  const selectedFormat = filteredFormats.find((format) => format.code === selectedFormatCode) || filteredFormats[0] || SIG_FORMATS.FOMAT03;
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
    <div className={`sig-asset-hub sig-asset-hub-${section}`}>
      <div className="sig-asset-sidebar">
        <div className="p-4 border-b space-y-3">
          <h2 className="sig-asset-title">
            <span aria-hidden="true">SIG</span> Centro de Activos
          </h2>
          <div className="sig-asset-nav" role="tablist" aria-label="Secciones del Centro SIG">
            <button type="button" role="tab" aria-selected={section === 'assets'} className={section === 'assets' ? 'is-active' : ''} onClick={() => { setSection('assets'); setSelectedMachineId(null); }}>Activos <b>{machines.length}</b></button>
            <button type="button" role="tab" aria-selected={section === 'annualPlan'} className={section === 'annualPlan' ? 'is-active' : ''} onClick={() => { setSection('annualPlan'); setSelectedMachineId(null); }}>Plan Anual <b>{annualPlanData.tasks?.length || 288}</b></button>
            <button type="button" role="tab" aria-selected={section === 'documents'} className={section === 'documents' ? 'is-active' : ''} onClick={() => { setSection('documents'); setSelectedMachineId(null); }}>Formatos <b>{Object.keys(SIG_FORMATS).length}</b></button>
            <button type="button" role="tab" aria-selected={section === 'evidence'} className={section === 'evidence' ? 'is-active' : ''} onClick={() => { setSection('evidence'); setSelectedMachineId(null); }}>Evidencias <b>{allEvidence.length}</b></button>
            <button type="button" role="tab" aria-selected={section === 'manuals'} className={section === 'manuals' ? 'is-active' : ''} onClick={() => { setSection('manuals'); setSelectedMachineId(null); }}>Manuales <b>{manuals.length}</b></button>
            <button type="button" role="tab" aria-selected={section === 'loadMaps'} className={section === 'loadMaps' ? 'is-active' : ''} onClick={() => { setSection('loadMaps'); setSelectedMachineId(null); }}>Mapas de cargue <b>{loadMaps.length}</b></button>
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
          {section === 'annualPlan' && (
            <div className="sig-asset-section-panel space-y-2">
              <input
                className="sig-asset-doc-search"
                type="search"
                placeholder="Buscar por código, sistema o actividad..."
                value={planSearchText}
                onChange={(e) => setPlanSearchText(e.target.value)}
                aria-label="Buscar en plan anual"
              />
              <div className="flex flex-col gap-2">
                <select className="w-full border rounded p-1.5 text-xs" value={planSedeFilter} onChange={(e) => setPlanSedeFilter(e.target.value)}>
                  <option value="all">Todas las Sedes</option>
                  <option value="PLANTA INCUBANT">Planta Incubant</option>
                  <option value="GRANJA LA FE">Granja La Fe</option>
                  <option value="GRANJA LA ESPERANZA">Granja La Esperanza</option>
                </select>
                <select className="w-full border rounded p-1.5 text-xs" value={planSystemFilter} onChange={(e) => setPlanSystemFilter(e.target.value)}>
                  <option value="all">Todos los Sistemas ({annualPlanData.systems?.length || 27})</option>
                  {(annualPlanData.systems || []).map((sys) => (
                    <option key={sys.name} value={sys.name}>{sys.name} ({sys.taskCount})</option>
                  ))}
                </select>
                <select className="w-full border rounded p-1.5 text-xs" value={planTypeFilter} onChange={(e) => setPlanTypeFilter(e.target.value)}>
                  <option value="all">Todos los Tipos / Criticidades</option>
                  <option value="critical">Crítica / Seguridad (Rojo)</option>
                  <option value="biosecurity">Bioseguridad / Legal (Verde)</option>
                  <option value="Sistemática">Sistemática</option>
                  <option value="Predictiva">Predictiva</option>
                </select>
              </div>
            </div>
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
          {section === 'manuals' && (
            <div className="sig-asset-section-panel">
              <input
                className="sig-asset-doc-search"
                type="search"
                placeholder="Buscar manual, instructivo o máquina..."
                value={manualFilter}
                onChange={(e) => setManualFilter(e.target.value)}
                aria-label="Buscar manuales e instructivos"
              />
              <div className="sig-manual-list">
                {allEvidenceLoading ? <p className="sig-empty-tab">Cargando manuales...</p> : !filteredManuals.length ? <p className="sig-empty-tab">No hay manuales registrados todavía.</p> : filteredManuals.map((file) => (
                  <button type="button" key={file.id} className={selectedDocumentId === file.id ? 'is-active' : ''} onClick={() => setSelectedDocumentId(file.id)}>
                    <strong>{file.source === 'mantum' ? 'MANTUM' : 'SIG'}</strong>
                    <span>{file.file_name}</span>
                    <small>{file.machineCode || file.workOrderCode || 'Documento general'} · {file.formatCode || 'Manual / instructivo'}</small>
                  </button>
                ))}
              </div>
            </div>
          )}
          {section === 'loadMaps' && (
            <div className="sig-asset-section-panel">
              <input className="sig-asset-doc-search" type="search" placeholder="Buscar lote, incubadora o cinta..." value={loadMapFilter} onChange={(e) => setLoadMapFilter(e.target.value)} aria-label="Buscar mapas de cargue" />
              <div className="sig-manual-list">
                {!filteredLoadMaps.length ? <p className="sig-empty-tab">No hay mapas de cargue registrados.</p> : filteredLoadMaps.map((map) => (
                  <button type="button" key={map.id} className={selectedLoadMapId === map.id ? 'is-active' : ''} onClick={() => setSelectedLoadMapId(map.id)}>
                    <strong>MAPA DE CARGUE</strong>
                    <span>{map.file_name}</span>
                    <small>{map.createdAt ? new Date(map.createdAt).toLocaleString('es-CO') : 'Sin fecha'} · {map.mapStatus || 'Borrador'} · Generó: {map.generatedBy}</small>
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
        {section === 'annualPlan' ? (
          <div className="sig-annual-plan-detail">
            <div className="sig-annual-plan-header">
              <div>
                <span className="sig-detail-kicker">PRGMAT01 · Programa de Mantenimiento Preventivo</span>
                <h1>Plan Anual de Mantenimiento 2026</h1>
                <p className="text-sm text-slate-500">
                  Sincronización de Sistemas (Equipos e Instalaciones) con su Cronograma de 52 Semanas, Tareas Preventivas y Evidencias de la subcarpeta REGISTROS.
                </p>
              </div>
              <div className="flex gap-2">
                <a
                  className="sig-asset-primary px-3 py-1.5 text-xs rounded flex items-center gap-1"
                  href={LOCAL_SIG_2026_EVIDENCE.find((f) => /FOMAT07/i.test(f.file_name))?.url || '#'}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Documento FOMAT07
                </a>
              </div>
            </div>

            <div className="sig-annual-kpis">
              <div className="sig-annual-kpi-card">
                <span>Tareas Preventivas</span>
                <strong>{annualPlanData.tasks?.length || 288}</strong>
              </div>
              <div className="sig-annual-kpi-card">
                <span>Sistemas / Equipos</span>
                <strong>{annualPlanData.systems?.length || 27}</strong>
              </div>
              <div className="sig-annual-kpi-card">
                <span>Tareas Correctivas Ref.</span>
                <strong>{annualPlanData.correctives?.length || 166}</strong>
              </div>
              <div className="sig-annual-kpi-card">
                <span>Evidencias en Registros</span>
                <strong>{annualPlanData.registrosFiles?.length || 601}</strong>
              </div>
            </div>

            <div className="sig-annual-subnav" role="tablist">
              <button
                type="button"
                className={annualPlanSubTab === 'preventive' ? 'is-active' : ''}
                onClick={() => setAnnualPlanSubTab('preventive')}
              >
                Programa Preventivo ({filteredAnnualTasks.length})
              </button>
              <button
                type="button"
                className={annualPlanSubTab === 'cronograma' ? 'is-active' : ''}
                onClick={() => setAnnualPlanSubTab('cronograma')}
              >
                Cronograma 52 Semanas
              </button>
              <button
                type="button"
                className={annualPlanSubTab === 'corrective' ? 'is-active' : ''}
                onClick={() => setAnnualPlanSubTab('corrective')}
              >
                Catálogo Correctivo ({filteredAnnualCorrectives.length})
              </button>
              <button
                type="button"
                className={annualPlanSubTab === 'registros' ? 'is-active' : ''}
                onClick={() => setAnnualPlanSubTab('registros')}
              >
                Evidencias en Registros ({filteredAnnualRegistros.length})
              </button>
            </div>

            {annualPlanSubTab === 'preventive' && (
              <div className="sig-table-wrap bg-white rounded-lg border p-2">
                <table>
                  <thead>
                    <tr>
                      <th>Código</th>
                      <th>Sede</th>
                      <th>Sistema / Clase</th>
                      <th>Equipos Aplicables</th>
                      <th>Procedimiento / Actividad</th>
                      <th>Periodicidad</th>
                      <th>Dur. (h/eq)</th>
                      <th>Tipo / Criticidad</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredAnnualTasks.map((t) => (
                      <tr key={t.code}>
                        <td className="font-bold text-xs text-amber-600">{t.code}</td>
                        <td className="text-xs">{t.sede}</td>
                        <td className="text-xs font-semibold">{t.system} <br /><span className="text-[10px] text-slate-400">{t.equipmentClass}</span></td>
                        <td className="text-xs text-slate-600 max-w-[150px] truncate" title={t.applyingEquipment}>{t.applyingEquipment}</td>
                        <td className="text-xs font-medium max-w-[280px]">{t.description}</td>
                        <td className="text-xs">{t.frequency}</td>
                        <td className="text-xs text-center">{t.duration || 'N/A'}</td>
                        <td className="text-xs text-center">
                          {t.isCriticalSecurity ? (
                            <span className="sig-badge-critical">Crítica Seguridad</span>
                          ) : t.isBiosecurity ? (
                            <span className="sig-badge-biosecurity">Bioseguridad</span>
                          ) : (
                            <span className="sig-badge-systematic">{t.type}</span>
                          )}
                        </td>
                      </tr>
                    ))}
                    {!filteredAnnualTasks.length && (
                      <tr>
                        <td colSpan="8" className="p-4 text-center text-slate-400">
                          No hay actividades que coincidan con los filtros seleccionados.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}

            {annualPlanSubTab === 'cronograma' && (
              <div className="sig-cronograma-wrapper p-2">
                <div className="mb-2 text-xs text-slate-500 flex items-center justify-between">
                  <span>Distribución escalonada de 52 semanas · Semana actual destacada en naranja</span>
                  <span className="flex items-center gap-2">
                    <span className="sig-cronograma-dot" /> Tarea programada
                  </span>
                </div>
                <table className="sig-cronograma-table">
                  <thead>
                    <tr>
                      <th className="col-sticky">Código & Actividad</th>
                      <th>Sistema</th>
                      <th>Periodicidad</th>
                      {Array.from({ length: 52 }, (_, i) => i + 1).map((w) => {
                        const isCurrentWeek = w === getWeekOfYear();
                        const isQuarterEnd = w === 13 || w === 26 || w === 39;
                        return (
                          <th
                            key={w}
                            className={`${isCurrentWeek ? 'is-current-week' : ''} ${isQuarterEnd ? 'quarter-divider' : ''}`}
                            title={`Semana ${w}`}
                          >
                            W{w}
                          </th>
                        );
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredAnnualTasks.map((t) => (
                      <tr key={`crono-${t.code}`}>
                        <td className="col-sticky">
                          <strong className="text-amber-600 mr-2">{t.code}</strong>
                          <span className="text-slate-700 font-medium">{t.description}</span>
                          <small className="block text-slate-400 text-[10px]">{t.equipmentClass} ({t.applyingEquipment})</small>
                        </td>
                        <td className="text-xs font-semibold text-slate-600">{t.system}</td>
                        <td className="text-xs">{t.frequency}</td>
                        {Array.from({ length: 52 }, (_, i) => i + 1).map((w) => {
                          const isScheduled = (t.cronograma?.weeks || []).includes(w);
                          const isCurrentWeek = w === getWeekOfYear();
                          const isQuarterEnd = w === 13 || w === 26 || w === 39;
                          return (
                            <td
                              key={w}
                              className={`${isCurrentWeek ? 'is-current-week' : ''} ${isQuarterEnd ? 'quarter-divider' : ''}`}
                            >
                              {isScheduled ? <span className="sig-cronograma-dot" title={`Programado semana ${w}`} /> : ''}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {annualPlanSubTab === 'corrective' && (
              <div className="sig-table-wrap bg-white rounded-lg border p-2">
                <table>
                  <thead>
                    <tr>
                      <th>Código Tarea</th>
                      <th>Actividad Correctiva</th>
                      <th>Código Equipo</th>
                      <th>Equipo</th>
                      <th>Sistema</th>
                      <th>Especialidad</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredAnnualCorrectives.map((c, idx) => (
                      <tr key={`${c.taskCode}-${idx}`}>
                        <td className="font-bold text-xs text-slate-700">{c.taskCode}</td>
                        <td className="text-xs font-medium">{c.activity}</td>
                        <td className="text-xs font-mono">{c.equipmentCode}</td>
                        <td className="text-xs">{c.equipmentName}</td>
                        <td className="text-xs font-semibold">{c.system}</td>
                        <td className="text-xs">{c.specialty}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {annualPlanSubTab === 'registros' && (
              <div className="sig-table-wrap bg-white rounded-lg border p-2">
                <p className="text-xs text-slate-500 mb-2">
                  Archivos auditables de la subcarpeta REGISTROS (FOMAT01 a FOMAT08 e INMAT01) indexados por formato y código de equipo.
                </p>
                <table>
                  <thead>
                    <tr>
                      <th>Formato</th>
                      <th>Archivo</th>
                      <th>Equipo Vinculado</th>
                      <th>Ruta / Extensión</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredAnnualRegistros.map((f, idx) => (
                      <tr key={`${f.relPath}-${idx}`}>
                        <td className="font-bold text-xs text-blue-600">{f.formatCode}</td>
                        <td className="text-xs font-medium text-slate-800">{f.name}</td>
                        <td className="text-xs font-mono">{f.machineCode || 'Documento general'}</td>
                        <td className="text-xs text-slate-500 truncate max-w-[300px]" title={f.relPath}>{f.relPath}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ) : section === 'manuals' ? (
          <div className="sig-format-detail sig-manual-detail">
            <span className="sig-detail-kicker">Biblioteca documental SIG / Mantum</span>
            <h1>Manuales e instructivos</h1>
            <p className="sig-format-description">Solo documentos técnicos, manuales e instructivos. Los formatos y registros están en sus secciones independientes.</p>
            <ManualPreview file={filteredManuals.find((file) => file.id === selectedDocumentId) || filteredManuals[0]} />
          </div>
        ) : section === 'loadMaps' ? (
          <div className="sig-format-detail sig-manual-detail">
            <span className="sig-detail-kicker">SIG Producción · Cargues</span>
            <h1>Mapas de cargue</h1>
            <p className="sig-format-description">Vista y descarga de los mapas de cargue registrados desde producción.</p>
            {(() => {
              const selectedLoadMap = filteredLoadMaps.find((map) => map.id === selectedLoadMapId) || filteredLoadMaps[0];
              if (!selectedLoadMap) return <p className="sig-empty-tab">No hay mapas de cargue para mostrar.</p>;
              return (
                <div className="sig-loadmap-detail">
                  <div className="sig-loadmap-preview">
                    <ManualPreview file={selectedLoadMap} showMeta={true} />
                  </div>
                  <div className="sig-loadmap-meta-panel">
                    <h3>Responsables</h3>
                    <div className="sig-loadmap-meta-item"><span>Generó</span><strong>{selectedLoadMap.generatedBy || 'No registrado'}</strong></div>
                    <div className="sig-loadmap-meta-item"><span>Aprobó</span><strong>{selectedLoadMap.approvedBy || 'Sin aprobación'}</strong></div>
                    <div className="sig-loadmap-meta-item"><span>Cargó</span><strong>{selectedLoadMap.loadedBy || 'Sin carga'}</strong></div>
                    <div className="sig-loadmap-meta-item"><span>Lote</span><strong>{selectedLoadMap.lote || 'No registrado'}</strong></div>
                    <div className="sig-loadmap-meta-item"><span>Máquina</span><strong>{selectedLoadMap.machineName || selectedLoadMap.machine_id || 'No registrada'}</strong></div>
                    <div className="sig-loadmap-meta-item"><span>Estado</span><strong>{selectedLoadMap.mapStatus || selectedLoadMap.status || 'Sin estado'}</strong></div>
                    <div className="sig-loadmap-meta-item"><span>Creado</span><strong>{selectedLoadMap.createdAt ? new Date(selectedLoadMap.createdAt).toLocaleString('es-CO') : 'Sin fecha'}</strong></div>
                  </div>
                </div>
              );
            })()}
          </div>
        ) : section === 'evidence' ? (
          <div className="sig-format-detail sig-global-evidence-detail">
            <span className="sig-detail-kicker">Repositorio general SIG</span>
            <h1>Evidencias de la organización</h1>
            <p className="sig-format-description">Todas las fotos y documentos cargados desde órdenes de trabajo, calibraciones y procesos de mantenimiento.</p>
            {allEvidenceLoading ? <p className="sig-empty-tab">Cargando evidencias...</p> : selectedDocument ? <div className="sig-evidence-preview"><div className="sig-evidence-preview-head"><div><b>{selectedDocument.formatCode}</b><span>{selectedDocument.file_name}</span><small>{selectedDocument.workOrderCode || selectedDocument.workOrderTitle || 'Evidencia SIG'} · {selectedDocument.created_at ? new Date(selectedDocument.created_at).toLocaleString('es-CO') : 'Sin fecha'}</small></div>{selectedDocument.url && <a href={selectedDocument.url} download={selectedDocument.downloadName || selectedDocument.file_name} target="_blank" rel="noopener noreferrer">Descargar</a>}</div>{selectedDocument.kind === 'round' || selectedDocument.kind === 'calibration' ? <div className="sig-evidence-gallery">{(selectedDocument.items || []).map((item, index) => <article key={`${selectedDocument.id}-${item.id || index}`}><div><strong>{item.machine?.code || item.file_name || 'Reporte'}</strong><span>{item.condition || item.notes || ''}</span></div>{item.url ? <img src={item.url} alt={item.file_name || selectedDocument.file_name} /> : <p>{item.notes || 'Sin foto adjunta'}</p>}</article>)}{(selectedDocument.reports || []).map((report) => <article key={report.id}><strong>{report.title || 'Reporte de ronda'}</strong><p>{report.body || 'Reporte sin detalle'}</p></article>)}</div> : <ManualPreview file={selectedDocument} />}</div> : <p className="sig-empty-tab">No hay evidencias registradas todavía.</p>}
          </div>
        ) : section === 'documents' ? (
          <div className="sig-format-detail">
            <span className="sig-detail-kicker">Documento controlado SIG</span>
            <h1>{selectedFormat.code} · {selectedFormat.name}</h1>
            <p className="sig-format-description">{selectedFormat.process}</p>
            <div className="sig-format-meta"><span>Versión <b>{selectedFormat.version}</b></span><span>Fecha <b>{selectedFormat.date}</b></span></div>
            {selectedFormat.url ? (
              <div className="sig-format-preview sig-format-original-preview">
                <ManualPreview file={{
                  ...selectedFormat.sourceFile,
                  file_name: selectedFormat.sourceFile?.file_name || selectedFormat.file_name,
                  url: selectedFormat.url,
                  file_type: selectedFormat.url.toLowerCase().endsWith('.pdf') ? 'pdf' : 'document',
                  source: 'sig',
                  kind: 'sig-original',
                  note: `${selectedFormat.code} · ${selectedFormat.name}`,
                }} />
              </div>
            ) : (
              <div className="sig-format-preview" aria-label={`Vista previa de ${selectedFormat.code}`}>
                <div className="sig-preview-head"><strong>ANTIOQUEÑA DE INCUBACIÓN S.A.S.</strong><span>SISTEMA INTEGRADO DE GESTIÓN</span></div>
                <div className="sig-preview-title"><b>{selectedFormat.code}</b><span>{selectedFormat.name}</span></div>
                <div className="sig-preview-grid"><span>PROCESO</span><b>{selectedFormat.process}</b><span>VERSIÓN</span><b>{selectedFormat.version}</b><span>FECHA</span><b>{selectedFormat.date}</b></div>
                <div className="sig-preview-lines"><i /><i /><i /><i /></div>
                <small>Documento controlado · Vista previa para exportación</small>
              </div>
            )}
            <div className="sig-format-actions">
              <button type="button" className="sig-asset-primary" onClick={() => handleFormatExport('excel')}>Exportar Excel</button>
              <button type="button" onClick={() => handleFormatExport('pdf')}>Exportar PDF</button>
              {selectedFormat.url && (
                <a className="sig-download-link" href={selectedFormat.url} download={selectedFormat.sourceFile?.file_name || selectedFormat.file_name} target="_blank" rel="noopener noreferrer">Descargar original</a>
              )}
            </div>
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
                <p className="text-lg font-medium">{dossier.summary.acquisition_date || dossier.summary.purchase_year || 'N/A'}</p>
                <p className="text-sm text-slate-500">{dossier.summary.installed_at || 'Fecha no registrada'}</p>
              </div>
              <div className="p-4 bg-white rounded-xl border shadow-sm">
                <span className="text-xs text-slate-400 uppercase font-bold">Proveedor</span>
                <p className="text-lg font-medium">{dossier.summary.manufacturer || dossier.summary.supplier || 'No registrado'}</p>
              </div>
              <div className="p-4 bg-white rounded-xl border shadow-sm">
                <span className="text-xs text-slate-400 uppercase font-bold">Criticidad</span>
                <p className="text-lg font-medium">{dossier.summary.criticidad}</p>
              </div>
            </div>
            {dossier.images?.length > 0 && (
              <div className="sig-dossier-panel" style={{ marginTop: 14 }}>
                <div className="sig-dossier-tabs"><span className="is-active">Galería Mantum ({dossier.images.length})</span></div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 10, padding: 14 }}>
                  {dossier.images.map((image) => (
                    <a key={image.id} href={image.url} target="_blank" rel="noopener noreferrer" title={image.file_name}>
                      <img src={image.url} alt={`${dossier.summary.name} · ${image.file_name}`} style={{ display: 'block', width: '100%', aspectRatio: '4 / 3', objectFit: 'cover', borderRadius: 8 }} />
                      <small style={{ display: 'block', marginTop: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{image.file_name}</small>
                    </a>
                  ))}
                </div>
              </div>
            )}
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
