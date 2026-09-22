/**
 * Recuadro con las instrucciones de ejecución de una actividad del Plan AM.
 * Los pasos salen de PROMAT01 (ver src/lib/planTaskInstructions.js); aquí solo se pintan.
 */
import React, { useEffect, useRef } from 'react';
import { normalizePlanTask, planTaskSteps, PROCEDURE_SOURCE, RECORD_RETENTION } from '../../../lib/planTaskInstructions';

export default function PlanTaskInstructions({ task, manuals = [], onClose }) {
  const closeRef = useRef(null);

  useEffect(() => {
    if (!task) return undefined;
    const onKey = (event) => { if (event.key === 'Escape') onClose?.(); };
    window.addEventListener('keydown', onKey);
    closeRef.current?.focus();
    return () => window.removeEventListener('keydown', onKey);
  }, [task, onClose]);

  if (!task) return null;

  const info = normalizePlanTask(task);
  const steps = planTaskSteps(task);
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
  ].filter(([, value]) => value);

  return (
    <div className="sig-modal-backdrop" role="presentation" onClick={onClose}>
      <section className="sig-modal" role="dialog" aria-modal="true" aria-labelledby="sig-plan-task-title" onClick={(event) => event.stopPropagation()}>
        <header className="sig-modal-head">
          <div>
            <span className="sig-detail-kicker">Plan AM · Cómo se realiza</span>
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
        <h3>Manual del fabricante</h3>
        {manuals.length ? (
          <ul className="sig-modal-manuals">
            {manuals.map((manual) => (
              <li key={manual.id}><a href={manual.url} target="_blank" rel="noopener noreferrer">{manual.file_name} ↗</a></li>
            ))}
          </ul>
        ) : (
          <p className="sig-modal-muted">No hay un manual del fabricante cargado en IncubApp para estos equipos.</p>
        )}
        <p className="sig-modal-muted">{RECORD_RETENTION}</p>
        <p className="sig-modal-source">Fuente: {PROCEDURE_SOURCE}, y programa PRGMAT01. El instructivo técnico propio de esta tarea todavía no está estandarizado en el programa: los pasos son el procedimiento general aprobado.</p>
      </section>
    </div>
  );
}
