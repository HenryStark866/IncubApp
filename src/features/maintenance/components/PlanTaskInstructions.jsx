/**
 * Recuadro con las instrucciones de ejecución de una actividad del Plan AM.
 * Los pasos salen de PROMAT01 (ver src/lib/planTaskInstructions.js); aquí solo se pintan.
 * Se monta en document.body con un portal: el dossier de la máquina se abre dentro de
 * capas fijas con backdrop-filter (Mantenimiento, Calibración), que atrapan a los hijos
 * position: fixed y los dejaban detrás del expediente. Por eso trae su propio CSS.
 */
import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { normalizePlanTask, planTaskSteps, PROCEDURE_SOURCE, RECORD_RETENTION } from '../../../lib/planTaskInstructions';
import { manualsForTask, manualTitle } from '../../../lib/planManuals';
import './PlanTaskInstructions.css';

export default function PlanTaskInstructions({ task, manuals = [], onClose }) {
  const closeRef = useRef(null);

  useEffect(() => {
    if (!task) return undefined;
    const onKey = (event) => { if (event.key === 'Escape') onClose?.(); };
    window.addEventListener('keydown', onKey);
    closeRef.current?.focus();
    return () => window.removeEventListener('keydown', onKey);
  }, [task, onClose]);

  if (!task || typeof document === 'undefined') return null;

  const info = normalizePlanTask(task);
  const steps = planTaskSteps(task);
  // Tareas con instructivo propio (Plan AM de granja): pasos técnicos, seguridad y manual de la empresa.
  const technical = Array.isArray(task.technicalSteps) ? task.technicalSteps : [];
  const safety = Array.isArray(task.safety) ? task.safety : [];
  const tools = Array.isArray(task.tools) ? task.tools : [];
  const docs = manuals.length ? manuals : manualsForTask(task);
  const facts = [
    ['Código', info.code],
    ['Sede', info.sede],
    ['Sistema', info.system],
    ['Clase de equipo', info.equipmentClass],
    ['Equipos', info.applyingEquipment],
    ['Tipo', info.type],
    ['Frecuencia', info.frequency],
    ['Especialidad', info.specialty],
    ['Duración', info.duration],
    ['Parada', info.shutdown],
    ['Responsable', info.responsible],
    ['Evidencia', info.evidenceFormat],
    ['Criterio de aceptación', task.acceptanceCriteria],
    ['Manual', task.manual],
  ].filter(([, value]) => value);

  return createPortal(
    <div className="sig-modal-backdrop" role="presentation" onClick={onClose}>
      <section className="sig-modal" role="dialog" aria-modal="true" aria-labelledby="sig-plan-task-title" onClick={(event) => event.stopPropagation()}>
        <header className="sig-modal-head">
          <div>
            <span className="sig-modal-kicker">Plan AM · Cómo se realiza</span>
            <h2 id="sig-plan-task-title">{info.activity}</h2>
          </div>
          <button ref={closeRef} type="button" className="sig-modal-close" onClick={onClose} aria-label="Cerrar instrucciones">×</button>
        </header>
        {facts.length > 0 && (
          <dl className="sig-modal-facts">
            {facts.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
          </dl>
        )}
        <h3>Pasos</h3>
        <ol className="sig-modal-steps">
          {steps.map((step) => (
            <li key={step.title}>
              <strong>{step.title}</strong>
              {step.detail.map((line) => <p key={line}>{line}</p>)}
              <small>Responsable: {step.responsible} · Registro: {step.records}</small>
            </li>
          ))}
        </ol>
        {technical.length > 0 && (
          <>
            <h3>Cómo se hace (paso 2, según el manual)</h3>
            <ol className="sig-modal-tech">
              {technical.map((line) => <li key={line}>{line}</li>)}
            </ol>
          </>
        )}
        {safety.length > 0 && (
          <>
            <h3 className="sig-modal-danger">Seguridad</h3>
            <ul className="sig-modal-safety">
              {safety.map((line) => <li key={line}>{line}</li>)}
            </ul>
          </>
        )}
        {tools.length > 0 && <p className="sig-modal-tools"><strong>Herramientas y materiales:</strong> {tools.join(', ')}.</p>}
        <h3>{technical.length ? 'Manual del equipo' : 'Manual del fabricante'}</h3>
        {docs.length ? (
          <ul className="sig-modal-manuals">
            {docs.map((manual) => (
              <li key={manual.id}>
                <a href={manual.url} target="_blank" rel="noopener noreferrer" download={manual.file_name}>{manualTitle(manual)} ↓</a>
              </li>
            ))}
          </ul>
        ) : (
          <p className="sig-modal-muted">No hay un manual del fabricante cargado en IncubApp para estos equipos.</p>
        )}
        <p className="sig-modal-muted">{RECORD_RETENTION}</p>
        <p className="sig-modal-source">
          Fuente: {PROCEDURE_SOURCE}, y programa PRGMAT01.{' '}
          {technical.length
            ? 'Los pasos técnicos salen del manual del equipo aprobado por Mantenimiento.'
            : 'El instructivo técnico propio de esta tarea todavía no está estandarizado en el programa: los pasos son el procedimiento general aprobado.'}
        </p>
      </section>
    </div>,
    document.body
  );
}
