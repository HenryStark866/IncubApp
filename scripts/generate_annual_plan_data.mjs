import fs from 'node:fs';
import path from 'node:path';
import XLSX from 'xlsx';

const ROOT = process.cwd();
const EXCEL_PATH = path.join(ROOT, 'MANTENIMIENTO', 'SIG-MANTENIMIENTO', 'PROCEDIMIENTOS', 'PRGMAT01 Programa de mantenimiento preventivo.xlsx');
const REGISTROS_ROOT = path.join(ROOT, 'MANTENIMIENTO', 'SIG-MANTENIMIENTO', 'REGISTROS');
const OUTPUT_PATH = path.join(ROOT, 'src', 'data', 'annualMaintenancePlanData.json');

function readPlanSheet(wb, sheetName, sedeName) {
  const sheet = wb.Sheets[sheetName];
  if (!sheet) return [];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });
  let headerIndex = -1;
  for (let i = 0; i < rows.length; i++) {
    if (rows[i] && (rows[i][0] === 'Código' || rows[i][0] === 'CÓDIGO')) {
      headerIndex = i;
      break;
    }
  }
  if (headerIndex === -1) return [];
  
  const tasks = [];
  for (let i = headerIndex + 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r || !r[0] || !r[5]) continue;
    
    const code = String(r[0] || '').trim();
    const system = String(r[1] || '').trim().toUpperCase();
    const equipmentClass = String(r[2] || '').trim();
    const applyingEquipment = String(r[3] || '').trim();
    const count = Number(r[4]) || 1;
    const description = String(r[5] || '').trim();
    const type = String(r[6] || '').trim();
    const frequency = String(r[7] || '').trim();
    const shutdown = String(r[8] || '').trim();
    const duration = String(r[9] || '').trim();
    const responsible = String(r[10] || '').trim();
    const acceptanceCriteria = String(r[11] || '').trim();
    const frequencyRationale = String(r[12] || '').trim();
    const evidenceFormat = String(r[13] || '').trim();

    const isCriticalSecurity = /crítica|seguridad/i.test(frequencyRationale + acceptanceCriteria + type) || /alto|alta/i.test(type);
    const isBiosecurity = /bioseguridad|legal|ica|res\./i.test(frequencyRationale + acceptanceCriteria + evidenceFormat);

    tasks.push({
      code,
      sede: sedeName,
      system: system || 'GENERAL',
      equipmentClass,
      applyingEquipment,
      count,
      description,
      type,
      frequency,
      shutdown,
      duration,
      responsible,
      acceptanceCriteria,
      frequencyRationale,
      evidenceFormat,
      isCriticalSecurity,
      isBiosecurity
    });
  }
  return tasks;
}

function readCronograma(wb) {
  const sheet = wb.Sheets['07 CRONOGRAMA 52 SEM'];
  if (!sheet) return {};
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });
  let headerIndex = -1;
  for (let i = 0; i < rows.length; i++) {
    if (rows[i] && (rows[i][0] === 'Código' || rows[i][0] === 'CÓDIGO')) {
      headerIndex = i;
      break;
    }
  }
  if (headerIndex === -1) return {};

  const cronogramaMap = {};
  for (let i = headerIndex + 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r || !r[0]) continue;
    const code = String(r[0] || '').trim();
    const rotacion = String(r[5] || '').trim();
    const weeks = [];
    for (let w = 1; w <= 52; w++) {
      const val = String(r[5 + w] || '').trim();
      if (val.includes('●') || val.includes('X') || val.includes('*')) {
        weeks.push(w);
      }
    }
    cronogramaMap[code] = {
      rotacion,
      weeks
    };
  }
  return cronogramaMap;
}

function readCorrectives(wb) {
  const sheet = wb.Sheets['14 CATALOGO CORRECTIVO'];
  if (!sheet) return [];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });
  let headerIndex = -1;
  for (let i = 0; i < rows.length; i++) {
    if (rows[i] && (rows[i][0] === 'Código tarea' || rows[i][0] === 'CÓDIGO TAREA')) {
      headerIndex = i;
      break;
    }
  }
  if (headerIndex === -1) return [];

  const correctives = [];
  for (let i = headerIndex + 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r || !r[0]) continue;
    correctives.push({
      taskCode: String(r[0] || '').trim(),
      activity: String(r[1] || '').trim(),
      equipmentCode: String(r[2] || '').trim(),
      equipmentName: String(r[3] || '').trim(),
      system: String(r[4] || '').trim().toUpperCase(),
      specialty: String(r[5] || '').trim()
    });
  }
  return correctives;
}

function scanRegistrosDir(dir) {
  if (!fs.existsSync(dir)) return [];
  let files = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files = files.concat(scanRegistrosDir(fullPath));
    } else if (entry.isFile()) {
      const name = entry.name;
      if (name.startsWith('~$')) continue;
      const relPath = path.relative(ROOT, fullPath).replaceAll('\\', '/');
      const formatCodeMatch = name.match(/FOMAT0[1-8]|INMAT01/i) || relPath.match(/FOMAT0[1-8]|INMAT01/i);
      const formatCode = formatCodeMatch ? formatCodeMatch[0].toUpperCase() : 'EVIDENCIA REGISTROS';
      const machineCodeMatch = name.match(/([A-Z]{2,4}-?\d+(?:\.\d+)?|\d{3}\.\d+)/i);
      const machineCode = machineCodeMatch ? machineCodeMatch[1].toUpperCase() : null;

      files.push({
        name,
        relPath,
        formatCode,
        machineCode,
        extension: path.extname(name).toLowerCase()
      });
    }
  }
  return files;
}

function main() {
  console.log('Reading PRGMAT01 Excel...');
  const wb = XLSX.readFile(EXCEL_PATH);

  const incubant = readPlanSheet(wb, '06.1 PLAN INCUBANT', 'PLANTA INCUBANT');
  const laFe = readPlanSheet(wb, '06.2 PLAN LA FE', 'GRANJA LA FE');
  const laEsperanza = readPlanSheet(wb, '06.3 PLAN LA ESPERANZA', 'GRANJA LA ESPERANZA');

  const allTasks = [...incubant, ...laFe, ...laEsperanza];
  const cronogramaMap = readCronograma(wb);
  const correctives = readCorrectives(wb);

  // Enrich tasks with 52-week cronograma info
  const tasksEnriched = allTasks.map(task => ({
    ...task,
    cronograma: cronogramaMap[task.code] || { rotacion: 'Lote único', weeks: [] }
  }));

  // Build Systems Summary
  const systemsMap = {};
  for (const task of tasksEnriched) {
    const sys = task.system || 'GENERAL';
    if (!systemsMap[sys]) {
      systemsMap[sys] = {
        name: sys,
        sedes: new Set(),
        taskCount: 0,
        equipmentClasses: new Set(),
        criticalCount: 0,
        biosecurityCount: 0
      };
    }
    systemsMap[sys].sedes.add(task.sede);
    systemsMap[sys].taskCount++;
    if (task.equipmentClass) systemsMap[sys].equipmentClasses.add(task.equipmentClass);
    if (task.isCriticalSecurity) systemsMap[sys].criticalCount++;
    if (task.isBiosecurity) systemsMap[sys].biosecurityCount++;
  }

  const systemsSummary = Object.values(systemsMap).map(sys => ({
    name: sys.name,
    sedes: Array.from(sys.sedes),
    taskCount: sys.taskCount,
    equipmentCount: sys.equipmentClasses.size,
    equipmentClasses: Array.from(sys.equipmentClasses),
    criticalCount: sys.criticalCount,
    biosecurityCount: sys.biosecurityCount
  }));

  const registrosFiles = scanRegistrosDir(REGISTROS_ROOT);

  const payload = {
    metadata: {
      generatedAt: new Date().toISOString(),
      source: 'PRGMAT01 v03 & SIG-MANTENIMIENTO REGISTROS',
      totalTasks: tasksEnriched.length,
      totalSystems: systemsSummary.length,
      totalCorrectives: correctives.length,
      totalRegistrosFiles: registrosFiles.length
    },
    systems: systemsSummary,
    tasks: tasksEnriched,
    correctives,
    registrosFiles
  };

  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(payload, null, 2), 'utf8');
  console.log(`Successfully generated ${OUTPUT_PATH}!`);
  console.log(`Tasks: ${payload.metadata.totalTasks}, Systems: ${payload.metadata.totalSystems}, Correctives: ${payload.metadata.totalCorrectives}, Registros files: ${payload.metadata.totalRegistrosFiles}`);
}

main();
